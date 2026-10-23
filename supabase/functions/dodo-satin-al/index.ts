import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DEFAULT_TRIAL_DAYS, safeTrialDays } from '../_shared/entitlement.ts';
import { dodoApi, dodoFetch, lookupSubscription } from '../_shared/dodo.ts';
import { attachClaim, issueLogin, readClaim } from '../_shared/odemeTalebi.ts';
import { getSecret } from '../_shared/wa.ts';
import { maskEmail } from '../abonelik-eposta/eposta.ts';
import {
    hashToken, newToken, START_LIMIT, START_WINDOW_MS, validCycle, validPlan, validToken,
} from './talep.ts';

/**
 * Ödeme önce, hesap sonra (kullanıcı kararı 2026-10-23 · göç 127).
 *
 * lueratech.com'daki "Planı seç" → /satin-al (uygulama) → bu uç → Dodo.
 * Ödeme/deneme bitince Dodo /hosgeldin'e döner; hesap Dodo'ya yazılan
 * e-postayla kendiliğinden açılır ve kişi şifresiz panele girer.
 *
 * HERKESE AÇIK: oturum istemez (gelen kişinin hesabı yok). Bu yüzden:
 *   - `start` istemciden yalnız paket ve dönem alır; tutar, ürün, deneme
 *     sunucuda. Adres başına hız sınırı (START_LIMIT / 10 dk).
 *   - `claim`in tek kimliği tarayıcıdaki gizli jeton (tabloda yalnız
 *     SHA-256'sı). Giriş jetonu YALNIZ hesabı bu talep açtıysa ve tek kez.
 *
 * Action'lar:
 *   { action: 'start', plan, cycle }               → { url, token }
 *   { action: 'claim', token, subscription_id? }   → { login } | { existing, email }
 *                                                    | { pending } | { done } | { error }
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODULE = 'timeflow';

/** Ödeme sayfası TimeFlow turuncusu — dodo-checkout'takiyle aynı (testte eşlenir). */
const TURUNCU = {
    button_primary: '#FF5A1F',
    button_primary_hover: '#FF5E20',
    button_text_primary: '#0E0E0E',
    input_focus_border: '#FF5A1F',
};
const CHECKOUT_THEME = { light: TURUNCU, dark: TURUNCU };

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    try {
        const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        const body = await req.json().catch(() => ({}));

        if (body.action === 'start') return await start(admin, req, body);
        if (body.action === 'claim') return await claim(admin, body);
        return json({ error: 'invalid_action' }, 400);
    } catch (err) {
        console.error('dodo-satin-al error:', err);
        return json({ error: 'internal' }, 500);
    }
});

// deno-lint-ignore no-explicit-any
type Db = any;

async function start(admin: Db, req: Request, body: Db): Promise<Response> {
    const plan = body.plan, cycle = body.cycle;
    if (!validPlan(plan) || !validCycle(cycle)) return json({ error: 'invalid_plan' }, 400);

    // Hız sınırı: adresin kendisi değil tuzlu özeti saklanır.
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'yok';
    const ipHash = await hashToken(`luera-satin-al:${ip}`);
    const since = new Date(Date.now() - START_WINDOW_MS).toISOString();
    const { count, error: cntErr } = await admin.from('checkout_claims')
        .select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash).gte('created_at', since);
    if (cntErr) { console.error('dodo-satin-al: sayılamadı', cntErr); return json({ error: 'internal' }, 500); }
    if ((count ?? 0) >= START_LIMIT) return json({ error: 'too_many' }, 429);

    let productMap: Record<string, string> = {};
    try { productMap = JSON.parse((await getSecret(admin, 'DODO_PRODUCT_MAP')) || '{}'); } catch { /* aşağıda */ }
    const productId = productMap[`${plan}_${cycle}`];
    if (!productId) {
        console.error(`dodo-satin-al: DODO_PRODUCT_MAP içinde '${plan}_${cycle}' yok`);
        return json({ error: 'product_missing' }, 500);
    }
    const api = await dodoApi(admin);
    if (!api) return json({ error: 'not_configured' }, 500);

    const token = newToken();
    const { data: row, error: insErr } = await admin.from('checkout_claims')
        .insert({ token_hash: await hashToken(token), plan, cycle, ip_hash: ipHash })
        .select('id').single();
    if (insErr || !row) { console.error('dodo-satin-al: talep yazılamadı', insErr); return json({ error: 'internal' }, 500); }

    // Deneme: kimin geldiğini bilmiyoruz → herkes yeni müşteri (7 gün,
    // kartla, bugün ₺0). Tekrar deneme suistimali: devir 16 §3.
    const trialDays = safeTrialDays(Number(await getSecret(admin, 'DODO_TRIAL_DAYS')) || DEFAULT_TRIAL_DAYS);
    const appUrl = (await getSecret(admin, 'APP_URL')) || 'https://timeflow.lueratech.com';

    const res = await dodoFetch(api, '/checkouts', {
        method: 'POST',
        body: JSON.stringify({
            product_cart: [{ product_id: productId, quantity: 1 }],
            // Dodo dönüşte subscription_id, status ve email ekler. Jeton
            // adreste DEĞİL: tarayıcının oturum deposunda (/satin-al yazar).
            return_url: `${appUrl}/hosgeldin`,
            ...(trialDays > 0 ? { subscription_data: { trial_period_days: trialDays } } : {}),
            // claim_id: webhook ve dönüş sayfası aboneliği bu talebe bununla bağlar.
            metadata: { module: MODULE, plan, cycle, claim_id: row.id },
            billing_currency: 'TRY',
            customization: { theme_config: CHECKOUT_THEME },
        }),
    });
    if (!res.ok) {
        console.error('dodo-satin-al: Dodo checkout', res.status, await res.text().catch(() => ''));
        return json({ error: 'checkout_failed' }, 502);
    }
    const data = await res.json();
    const url = data?.checkout_url ?? data?.url;
    if (!url) return json({ error: 'no_checkout_url' }, 502);
    return json({ url, token }, 200);
}

async function claim(admin: Db, body: Db): Promise<Response> {
    if (!validToken(body.token)) return json({ error: 'invalid_token' }, 400);
    const row = await readClaim(admin, { tokenHash: await hashToken(body.token) });
    if (row === 'error') return json({ error: 'internal' }, 500);
    if (!row) return json({ error: 'expired' }, 410);
    if (new Date(row.expires_at).getTime() < Date.now()) return json({ error: 'expired' }, 410);

    let current = row;
    if (!row.attached_at) {
        // Webhook henüz gelmediyse abonelik dönüş adresindeki kimlikten okunur;
        // talebe ait olduğu metadata'dan doğrulanır (attachClaim · not_ours).
        const subId = row.dodo_subscription_id
            ?? (typeof body.subscription_id === 'string' && /^[A-Za-z0-9_]{3,64}$/.test(body.subscription_id) ? body.subscription_id : null);
        if (!subId) return json({ pending: true }, 200);
        const api = await dodoApi(admin);
        if (!api) return json({ error: 'not_configured' }, 500);
        const look = await lookupSubscription(api, subId);
        if (look.kind === 'transient') return json({ pending: true }, 200);
        if (look.kind !== 'found') return json({ error: 'not_found' }, 404);

        const r = await attachClaim(admin, api, row.id, look.sub);
        if (r.kind === 'retry' || r.kind === 'not_live') return json({ pending: true }, 200);
        if (r.kind === 'not_ours' || r.kind === 'not_found') return json({ error: 'mismatch' }, 403);
        if (r.kind === 'needs_login') {
            const again = await readClaim(admin, { id: row.id });
            return json({ existing: true, manual: true, email: maskEmail(again !== 'error' ? again?.email : null) }, 200);
        }
        const again = await readClaim(admin, { id: row.id });
        if (again === 'error' || !again) return json({ error: 'internal' }, 500);
        current = again;
    }

    if (!current.user_created) return json({ existing: true, email: maskEmail(current.email) }, 200);
    const login = await issueLogin(admin, current);
    // Giriş jetonu bir kez verilir; ikinci çağrı (yenileme) oturumla devam eder.
    if (!login) return json({ done: true, email: maskEmail(current.email) }, 200);
    return json({ login, email: maskEmail(current.email) }, 200);
}

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
