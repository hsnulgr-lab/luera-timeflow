import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Dodo Payments checkout + abonelik iptali.
 *
 * Güvenlik modeli (whatsapp-proxy ile aynı):
 *   - Kullanıcı kimliği request body'den DEĞİL, session JWT'sinden doğrulanır.
 *   - Org, organization_members kaydından server-side çözülür.
 *   - DODO_API_KEY ve ürün id'leri (DODO_PRODUCT_MAP) ASLA client'a inmez.
 *
 * Action'lar:
 *   { plan: 'baslangic'|'pro'|'isletme', cycle: 'monthly'|'yearly' } → { url }
 *   { action: 'cancel' } → dönem sonunda iptal
 */

const MODULE = 'timeflow';
const VALID_PLANS = ['baslangic', 'pro', 'isletme'];
const VALID_CYCLES = ['monthly', 'yearly'];

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // 1) Kullanıcıyı JWT'den doğrula
        const authHeader = req.headers.get('Authorization') || '';
        const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (!jwt) return json({ error: 'unauthorized' }, 401);

        const admin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
        if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);
        const user = userData.user;

        // 2) Org'u server-side çöz (client'a güvenme)
        const { data: member } = await admin
            .from('organization_members')
            .select('org_id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();
        const orgId = member?.org_id;
        if (!orgId) return json({ error: 'no_org' }, 403);

        const DODO_API_KEY = await getSecret(admin, 'DODO_API_KEY');
        const DODO_API_BASE = (await getSecret(admin, 'DODO_API_BASE')) || 'https://test.dodopayments.com';
        if (!DODO_API_KEY) return json({ error: 'dodo_not_configured' }, 500);

        const body = await req.json().catch(() => ({}));

        // ── İptal: dönem sonunda ─────────────────────────────────────────────
        if (body.action === 'cancel') {
            const coreUrl = await getSecret(admin, 'CORE_SUPABASE_URL');
            const coreKey = await getSecret(admin, 'CORE_SERVICE_KEY');
            if (!coreUrl || !coreKey) return json({ error: 'core_not_configured' }, 500);
            const core = createClient(coreUrl, coreKey);

            // Core gerçek şeması: Dodo abonelik id'si provider_ref kolonunda
            const { data: subs } = await core
                .from('subscriptions')
                .select('provider_ref')
                .eq('organization_id', orgId)
                .eq('module_name', MODULE)
                .eq('provider', 'dodo')
                .in('status', ['trial', 'active', 'past_due'])
                .limit(1);
            const providerRef = subs?.[0]?.provider_ref;
            if (!providerRef) return json({ error: 'no_subscription' }, 404);

            const res = await fetch(`${DODO_API_BASE}/subscriptions/${providerRef}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${DODO_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ cancel_at_next_billing_date: true }),
            });
            if (!res.ok) {
                const detail = await res.text().catch(() => '');
                console.error('Dodo cancel error:', res.status, detail);
                return json({ error: 'cancel_failed' }, 502);
            }
            // Kalıcı durum subscription.cancelled webhook'uyla Core'a yazılır
            return json({ cancelled: true }, 200);
        }

        // ── Checkout ─────────────────────────────────────────────────────────
        const plan = String(body.plan || '');
        const cycle = String(body.cycle || '');
        if (!VALID_PLANS.includes(plan) || !VALID_CYCLES.includes(cycle)) {
            return json({ error: 'invalid_plan_or_cycle' }, 400);
        }

        // (plan, cycle) → Dodo ürün id — JSON haritadan (env/app_secrets)
        let productMap: Record<string, string> = {};
        try { productMap = JSON.parse((await getSecret(admin, 'DODO_PRODUCT_MAP')) || '{}'); } catch { /* aşağıda yakalanır */ }
        const productId = productMap[`${plan}_${cycle}`];
        if (!productId) {
            console.error(`dodo-checkout: DODO_PRODUCT_MAP içinde '${plan}_${cycle}' yok`);
            return json({ error: 'product_not_configured' }, 500);
        }

        // İşletme adı (checkout'ta müşteri adı olarak)
        const { data: settingsRow } = await admin
            .from('settings')
            .select('business_name')
            .eq('organization_id', orgId)
            .maybeSingle();

        const appUrl = (await getSecret(admin, 'APP_URL')) || 'https://timeflow.lueratech.com';
        const res = await fetch(`${DODO_API_BASE}/checkouts`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DODO_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                product_cart: [{ product_id: productId, quantity: 1 }],
                customer: { email: user.email, name: settingsRow?.business_name || user.email },
                return_url: `${appUrl}/settings?tab=billing&checkout=success`,
                // org_name: webhook'un Core organizations aynalaması için (FK gereksinimi)
                metadata: { organization_id: orgId, plan, cycle, module: MODULE, org_name: settingsRow?.business_name || '' },
                billing_currency: 'TRY',
            }),
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            console.error('Dodo checkout error:', res.status, detail);
            return json({ error: 'checkout_failed' }, 502);
        }
        const data = await res.json();
        const url = data?.checkout_url ?? data?.url;
        if (!url) return json({ error: 'no_checkout_url' }, 502);

        return json({ url }, 200);
    } catch (err) {
        console.error('dodo-checkout error:', err);
        return json({ error: 'Sunucu hatası', detail: String(err) }, 500);
    }
});

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

// Sır okuma: önce env, yoksa app_secrets tablosu (repo deseni)
async function getSecret(supabase: any, key: string): Promise<string | null> {
    const env = Deno.env.get(key);
    if (env) return env;
    const { data } = await supabase.from('app_secrets').select('value').eq('key', key).maybeSingle();
    return data?.value ?? null;
}
