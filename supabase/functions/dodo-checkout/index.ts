import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cardlessTrialDaysLeft, computeAccess, DEFAULT_TRIAL_DAYS, safeTrialDays, type EntitlementRow } from '../_shared/entitlement.ts';
import { dodoApi, dodoFetch } from '../_shared/dodo.ts';
import { resolveOrg } from '../_shared/org.ts';
import { getSecret } from '../_shared/wa.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Dodo Payments checkout, iptal ve kart güncelleme.
 *
 * Güvenlik modeli:
 *   - Kullanıcı kimliği request body'den DEĞİL, session JWT'sinden doğrulanır.
 *   - İşletme `resolveOrg` ile: istemci orgId gönderir, üyelik sunucuda
 *     doğrulanır (eskiden `limit(1)` — çok işletmeli kullanıcıda RASTGELE
 *     işletmeye abonelik açılıyordu). Yalnız sahip ve yönetici.
 *   - DODO_API_KEY ve ürün id'leri (DODO_PRODUCT_MAP) ASLA client'a inmez.
 *   - Abonelik kimliği yerel aynadan (123); LUERA Core'a gidilmez.
 *
 * Action'lar:
 *   { plan, cycle, orgId }       → { url }  yeni abonelik (checkout)
 *                                → { resumed: true }  iptal bekleyen aynı plan
 *   { action: 'cancel', orgId }  → dönem sonunda iptal
 *   { action: 'card', orgId }    → { url }  Dodo kart güncelleme sayfası
 *                                          ('portal' eski istemcinin adı, aynı yere gider)
 *
 * DENEME SÜRESİ: ilk checkout 7 günlük ücretsiz denemeyle açılır (kart alınır,
 * ilk tahsilat 8. gün). Dodo'da trial ABONELİĞE bağlanabiliyor
 * (subscription_data.trial_period_days). Uzunluk sunucuda beyaz listeden
 * geçer — istemciden gelen serbest sayıyla herkes kendine 10000 gün açardı.
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

        const body = await req.json().catch(() => ({}));

        // 2) İşletme: istemcinin seçtiği, sunucuda doğrulanmış
        const resolved = await resolveOrg(admin, user.id, typeof body.orgId === 'string' ? body.orgId : null);
        if ('error' in resolved) return json({ error: resolved.error }, resolved.status);
        const { orgId, role } = resolved;
        if (role !== 'owner' && role !== 'admin') return json({ error: 'forbidden_role' }, 403);

        const api = await dodoApi(admin);
        if (!api) return json({ error: 'dodo_not_configured' }, 500);

        const { data: entRow, error: entErr } = await admin.from('org_entitlement')
            .select('state, plan, cycle, trial_ends_at, expires_at, grace_until, dodo_subscription_id, dodo_customer_id, cancel_at_period_end')
            .eq('organization_id', orgId)
            .maybeSingle();
        if (entErr) {
            console.error('dodo-checkout: ayna okunamadı', entErr);
            return json({ error: 'entitlement_lookup_failed' }, 500);
        }

        const appUrl = (await getSecret(admin, 'APP_URL')) || 'https://timeflow.lueratech.com';

        // ── İptal: dönem sonunda ─────────────────────────────────────────────
        if (body.action === 'cancel') {
            const providerRef = entRow?.dodo_subscription_id;
            if (!providerRef) return json({ error: 'no_subscription' }, 404);

            const res = await dodoFetch(api, `/subscriptions/${encodeURIComponent(providerRef)}`, {
                method: 'PATCH',
                body: JSON.stringify({ cancel_at_next_billing_date: true }),
            });
            if (!res.ok) {
                const detail = await res.text().catch(() => '');
                console.error('Dodo cancel error:', res.status, detail);
                return json({ error: 'cancel_failed' }, 502);
            }
            // Dodo onayladı; ekran webhook'u beklemeden "Dönem sonunda iptal"
            // desin. DURUM yazılmaz — erişimi `expires_at` keser, webhook
            // aboneliğin tamamını zaten yeniden yazar.
            const { error: mErr } = await admin.from('org_entitlement')
                .update({ cancel_at_period_end: true, cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq('organization_id', orgId);
            if (mErr) console.error('dodo-checkout: iptal bayrağı aynaya yazılamadı', mErr);
            return json({ cancelled: true }, 200);
        }

        // ── Kart güncelleme ─────────────────────────────────────────────────
        // Eskiden "Kartı güncelle" YENİ bir checkout açıyordu → ikinci
        // abonelik; sonra Dodo müşteri portalı: portal tutarı Dodo'nun hesaba
        // geçirdiği USD'yle ("$12.08/ay") ve müşterinin BÜTÜN aboneliklerini
        // gösteriyordu. Bu sayfa yalnız O aboneliğin kartını alır, tutar
        // yazmaz. Askıdaki (on_hold) abonelikte Dodo borcu yeni karttan hemen
        // çeker ve aboneliği yeniden etkinleştirir (payment.succeeded →
        // subscription.active, webhook işler).
        if (body.action === 'card' || body.action === 'portal') {
            const subscriptionId = entRow?.dodo_subscription_id;
            if (!subscriptionId) return json({ error: 'no_subscription' }, 404);
            const res = await dodoFetch(api, `/subscriptions/${encodeURIComponent(subscriptionId)}/update-payment-method`, {
                method: 'POST',
                body: JSON.stringify({ type: 'new', return_url: `${appUrl}/settings?tab=billing` }),
            });
            if (!res.ok) {
                console.error('Dodo update-payment-method error:', res.status, await res.text().catch(() => ''));
                return json({ error: 'card_failed' }, 502);
            }
            const out = await res.json().catch(() => ({}));
            if (typeof out?.payment_link !== 'string') return json({ error: 'card_failed' }, 502);
            return json({ url: out.payment_link }, 200);
        }

        // ── Checkout ─────────────────────────────────────────────────────────
        const plan = String(body.plan || '');
        const cycle = String(body.cycle || '');
        if (!VALID_PLANS.includes(plan) || !VALID_CYCLES.includes(cycle)) {
            return json({ error: 'invalid_plan_or_cycle' }, 400);
        }

        // Süren aboneliğe ikinci checkout açılmaz: ikinci abonelik demek, iki
        // kez tahsilat demek. Plan değişikliği ayrı iş (Dodo Change Plan);
        // ek süredeki (ödeme alınamamış) işletme yeni abonelik alabilir —
        // webhook yenisi etkinleşince eskisini Dodo'da kapatır.
        //
        // Yalnız DODO aboneliği varsa: kartsız (telefon) denemedeki ya da
        // hediye üyeliği süren işletmenin Dodo'da tahsilatı yok — paket
        // alabilmeli (docs/abonelik-kurallari.md · Faz 2.4).
        const access = computeAccess(entRow as EntitlementRow | null);
        if (access.ok && (access.effective === 'trial' || access.effective === 'active') && entRow?.dodo_subscription_id) {
            // Dönem sonunda iptal bekleyen salon AYNI planı seçerse yeni
            // abonelik değil, iptalden vazgeçme: ekran "devam etmek için plan
            // seçmeniz yeterli" diyor.
            if (entRow?.cancel_at_period_end && entRow.dodo_subscription_id && entRow.plan === plan && entRow.cycle === cycle) {
                const res = await dodoFetch(api, `/subscriptions/${encodeURIComponent(entRow.dodo_subscription_id)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ cancel_at_next_billing_date: false }),
                });
                if (!res.ok) {
                    console.error('Dodo resume error:', res.status, await res.text().catch(() => ''));
                    return json({ error: 'resume_failed' }, 502);
                }
                const { error: mErr } = await admin.from('org_entitlement')
                    .update({ cancel_at_period_end: false, cancelled_at: null, updated_at: new Date().toISOString() })
                    .eq('organization_id', orgId);
                if (mErr) console.error('dodo-checkout: iptalden vazgeçme aynaya yazılamadı', mErr);
                return json({ resumed: true }, 200);
            }
            return json({ error: 'already_subscribed' }, 409);
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

        // ── Deneme hakkı ─────────────────────────────────────────────────────
        // Yalnız DAHA ÖNCE hiç aboneliği olmamış org deneme alır. Aksi hâlde
        // iptal edip yeniden satın alan biri her seferinde 7 gün bedava
        // kullanırdı; ayna tablo bu geçmişi zaten tutuyor.
        const firstTime = !entRow || entRow.state === 'none';
        const configured = Number(await getSecret(admin, 'DODO_TRIAL_DAYS')) || DEFAULT_TRIAL_DAYS;
        // body.trial_days pilot linki için; beyaz listeden geçmeyen değer
        // varsayılana düşer (bkz. _shared/entitlement.ts).
        //
        // Kartsız denemesi süren işletme (124) erken alırsa kalan günler
        // Dodo'ya deneme olarak geçer: ilk tahsilat deneme bittiği gün.
        // Sunucuda hesaplanır, istemciden gelmez — beyaz liste gerekmez.
        const trialDays = firstTime
            ? safeTrialDays(body.trial_days ?? configured)
            : cardlessTrialDaysLeft(entRow as EntitlementRow | null);

        // Kupon: "ilk 3 ay %50" gibi kampanyalar. Dodo'da kuponlar fatura
        // dönemi limitiyle tanımlı, süresiz %100 indirim yok — ücretsiz pilot
        // için doğru araç kupon değil UZUN DENEME (trial_days).
        const discount = typeof body.discount_code === 'string'
            ? body.discount_code.trim().slice(0, 40)
            : '';

        // İlk satın alımda kurulum sihirbazına, sonrakilerde faturalandırmaya
        // dön: ödeme yapan yeni müşteriyi ayarlar ekranına bırakmak, ürünü
        // kurmadan yalnız bir fatura satırı göstermek olurdu.
        const returnUrl = firstTime
            ? `${appUrl}/kurulum?checkout=success`
            : `${appUrl}/settings?tab=billing&checkout=success`;

        const res = await dodoFetch(api, '/checkouts', {
            method: 'POST',
            body: JSON.stringify({
                product_cart: [{ product_id: productId, quantity: 1 }],
                customer: { email: user.email, name: settingsRow?.business_name || user.email },
                return_url: returnUrl,
                ...(trialDays > 0 ? { subscription_data: { trial_period_days: trialDays } } : {}),
                ...(discount ? { discount_codes: [discount] } : {}),
                // organization_id: webhook işletmeyi bununla bulur.
                // org_name: Core kopyasındaki organizations satırı için.
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
