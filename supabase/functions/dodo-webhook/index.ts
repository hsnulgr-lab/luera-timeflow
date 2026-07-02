import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, webhook-id, webhook-signature, webhook-timestamp',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Dodo Payments webhook handler.
 *
 * Neden var: Abonelik yaşam döngüsü ve ödeme event'lerini LUERA Core'daki
 * subscriptions + billing_events tablolarına yansıtır. Gateway'in
 * has_active_subscription RPC'si bu veriyi okur.
 *
 * Core'un GERÇEK şemasına uyum (bkz. supabase/CORE_subscriptions_schema.sql):
 *   - Kolonlar: module_name, plan_tier, provider, provider_ref, metadata
 *   - plan_tier CHECK'i yüzünden eşleme: baslangic→starter, pro→growth,
 *     isletme→enterprise (orijinal plan metadata.plan'da)
 *   - status CHECK'i: on_hold → 'past_due'
 *   - İptal: status 'active' KALIR (RPC dönem sonuna dek true dönsün),
 *     metadata.cancel_at_period_end=true. cancelled_at kolonu kullanılmaz
 *     (status tutarlılık CHECK'i) — iptal zamanı metadata'da.
 *   - organizations FK'sı: TimeFlow org'u Core'da yoksa aynalanır
 *     (placeholder owner_user_id — Core'da FK yok, Pilot Test kaydıyla aynı desen).
 *
 * Güvenlik modeli:
 *   - JWT YOK (Dodo çağırır) → deploy: --no-verify-jwt (bkz. supabase/config.toml)
 *   - Kimlik doğrulama Standard Webhooks imzasıyla: HMAC-SHA256(id.timestamp.body)
 *   - Idempotency: webhook-id, Core billing_events.dodo_webhook_id UNIQUE kolonuna
 *     başarılı işleme SONRASI yazılır (hata durumunda Dodo retry'ı kurtarır;
 *     işleme kendisi idempotent olduğundan yarışta çift çalışma zararsızdır).
 */

const MODULE_NAME = 'timeflow';
const GRACE_MS = 3 * 86_400_000; // dönem sonuna +3 gün tolerans
const TOLERANCE_S = 5 * 60;      // imza timestamp toleransı
const PLACEHOLDER_OWNER = '00000000-0000-0000-0000-000000000001'; // Core'daki Pilot Test deseni

// TimeFlow planı → Core plan_tier (CHECK: free|starter|growth|enterprise|custom)
const TIER_MAP: Record<string, string> = { baslangic: 'starter', pro: 'growth', isletme: 'enterprise' };

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }
    if (req.method !== 'POST') {
        return json({ error: 'method_not_allowed' }, 405);
    }

    try {
        // Sırlar: önce env, yoksa TimeFlow app_secrets tablosu (repo deseni)
        const admin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        const secret = await getSecret(admin, 'DODO_WEBHOOK_SECRET');
        const coreUrl = await getSecret(admin, 'CORE_SUPABASE_URL');
        const coreKey = await getSecret(admin, 'CORE_SERVICE_KEY');
        if (!secret || !coreUrl || !coreKey) {
            console.error('dodo-webhook: eksik sır (DODO_WEBHOOK_SECRET / CORE_SUPABASE_URL / CORE_SERVICE_KEY)');
            return json({ error: 'not_configured' }, 500);
        }

        // 1) İmza doğrulaması — ham body üzerinden (parse ETMEDEN önce oku)
        const rawBody = await req.text();
        const whId = req.headers.get('webhook-id') || '';
        const whTs = req.headers.get('webhook-timestamp') || '';
        const whSig = req.headers.get('webhook-signature') || '';
        if (!whId || !whTs || !whSig) return json({ error: 'missing_signature_headers' }, 401);

        const tsNum = parseInt(whTs, 10);
        if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > TOLERANCE_S) {
            return json({ error: 'stale_timestamp' }, 401);
        }

        const valid = await verifySignature(secret, whId, whTs, rawBody, whSig);
        if (!valid) return json({ error: 'invalid_signature' }, 401);

        const event = JSON.parse(rawBody);
        const type: string = event?.type ?? '';
        const data = event?.data ?? {};

        const core = createClient(coreUrl, coreKey);

        // 2) Idempotency — bu webhook-id daha önce başarıyla işlendiyse atla
        const { data: seen } = await core
            .from('billing_events')
            .select('id')
            .eq('dodo_webhook_id', whId)
            .maybeSingle();
        if (seen) return json({ received: true, duplicate: true }, 200);

        // 3) Abonelik durumunu güncelle
        const orgId = resolveOrgId(data);

        switch (type) {
            case 'subscription.active': {
                if (!orgId) return json({ error: 'org_unresolved' }, 500);

                // FK: Core organizations'ta TimeFlow org'u yoksa aynala
                const orgErr = await ensureCoreOrg(core, orgId, data);
                if (orgErr) { console.error('org mirror', orgErr); return json({ error: 'core_write_failed' }, 500); }

                const plan = data.metadata?.plan ?? 'pro';
                const cycle = data.metadata?.cycle ?? 'monthly';
                const fields = {
                    status: 'active',
                    plan_tier: TIER_MAP[plan] ?? 'growth',
                    provider: 'dodo',
                    provider_ref: data.subscription_id ?? null,
                    expires_at: nextExpiry(data),
                    metadata: {
                        plan, cycle,
                        cancel_at_period_end: false,
                        dodo_customer_id: data.customer?.customer_id ?? null,
                        customer_email: data.customer?.email ?? null,
                    },
                };

                // Kısmi unique index (org, module_name WHERE status aktif) ON CONFLICT ile
                // kullanılamaz → select-then-write (tek yazar webhook olduğundan güvenli)
                const existing = await findSub(core, data, orgId);
                const { error } = existing
                    ? await core.from('subscriptions').update(fields).eq('id', existing.id)
                    : await core.from('subscriptions').insert({ organization_id: orgId, module_name: MODULE_NAME, ...fields });
                if (error) { console.error('subscription.active yazma', error); return json({ error: 'core_write_failed' }, 500); }
                break;
            }
            case 'subscription.renewed': {
                const sub = await findSub(core, data, orgId);
                if (sub) {
                    const { error } = await core.from('subscriptions').update({
                        status: 'active',
                        expires_at: nextExpiry(data),
                        metadata: { ...sub.metadata, cancel_at_period_end: false },
                    }).eq('id', sub.id);
                    if (error) { console.error('subscription.renewed', error); return json({ error: 'core_write_failed' }, 500); }
                } else {
                    console.warn('subscription.renewed: eşleşen abonelik yok', data.subscription_id);
                }
                break;
            }
            case 'subscription.on_hold': {
                const sub = await findSub(core, data, orgId);
                if (sub) {
                    const { error } = await core.from('subscriptions').update({ status: 'past_due' }).eq('id', sub.id);
                    if (error) { console.error('subscription.on_hold', error); return json({ error: 'core_write_failed' }, 500); }
                }
                break;
            }
            case 'subscription.updated': {
                // Dönem sonu iptal / iptalden vazgeçme bu event'le gelir
                // (data.cancel_at_next_billing_date) — canlı testte doğrulandı
                const sub = await findSub(core, data, orgId);
                if (sub && typeof data.cancel_at_next_billing_date === 'boolean') {
                    const flag = data.cancel_at_next_billing_date;
                    const { error } = await core.from('subscriptions').update({
                        metadata: {
                            ...sub.metadata,
                            cancel_at_period_end: flag,
                            cancelled_at: flag ? (sub.metadata.cancelled_at ?? new Date().toISOString()) : null,
                        },
                    }).eq('id', sub.id);
                    if (error) { console.error('subscription.updated', error); return json({ error: 'core_write_failed' }, 500); }
                }
                break;
            }
            case 'subscription.cancelled': {
                const sub = await findSub(core, data, orgId);
                if (sub) {
                    // status 'active' kalır — erişim expires_at'e kadar; RPC süre dolunca keser
                    const { error } = await core.from('subscriptions').update({
                        metadata: { ...sub.metadata, cancel_at_period_end: true, cancelled_at: new Date().toISOString() },
                    }).eq('id', sub.id);
                    if (error) { console.error('subscription.cancelled', error); return json({ error: 'core_write_failed' }, 500); }
                }
                break;
            }
            case 'payment.succeeded': {
                // billing_events kaydı aşağıda; askıdaki abonelik ödeme alınca aktifleşsin
                const sub = await findSub(core, data, orgId);
                if (sub && sub.status === 'past_due') {
                    await core.from('subscriptions').update({ status: 'active' }).eq('id', sub.id);
                }
                break;
            }
            case 'payment.failed':
                // Kayıt yeterli — enforcement'ı Dodo retry + on_hold event'i yönetir
                break;
            default:
                console.log(`dodo-webhook: bilinmeyen event tipi '${type}' — yalnızca kaydedildi`);
        }

        // 4) Event kaydı (idempotency + fatura geçmişi)
        const { error: logErr } = await core.from('billing_events').insert({
            organization_id: orgId,
            module_name: MODULE_NAME,
            dodo_webhook_id: whId,
            dodo_payment_id: type.startsWith('payment.') ? (data.payment_id ?? null) : null,
            event_type: type || 'unknown',
            amount: extractAmount(data),
            currency: data.currency ?? null,
            invoice_url: data.invoice_url ?? data.receipt_url ?? null,
            raw: event,
        });
        if (logErr && logErr.code !== '23505') {
            console.error('dodo-webhook: billing_events insert hatası', logErr);
            return json({ error: 'core_write_failed' }, 500);
        }

        return json({ received: true }, 200);
    } catch (err) {
        console.error('dodo-webhook error:', err);
        return json({ error: 'Sunucu hatası', detail: String(err) }, 500);
    }
});

// ── Yardımcılar ──────────────────────────────────────────────────────────────

async function getSecret(supabase: any, key: string): Promise<string | null> {
    const env = Deno.env.get(key);
    if (env) return env;
    const { data } = await supabase.from('app_secrets').select('value').eq('key', key).maybeSingle();
    return data?.value ?? null;
}

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

// Checkout'ta metadata.organization_id set ediyoruz; Dodo bunu event'lere geçirir
function resolveOrgId(data: any): string | null {
    return data?.metadata?.organization_id ?? null;
}

// Dodo tutarları en küçük birimde (kuruş) gönderir → TL'ye çevir
function extractAmount(data: any): number | null {
    const cents = data?.total_amount ?? data?.amount ?? null;
    return typeof cents === 'number' ? cents / 100 : null;
}

function nextExpiry(data: any): string | null {
    const next = data?.next_billing_date ?? data?.current_period_end ?? null;
    if (!next) return null;
    const t = new Date(next).getTime();
    return Number.isFinite(t) ? new Date(t + GRACE_MS).toISOString() : null;
}

// Aboneliği bul: önce provider_ref (Dodo subscription id), yoksa org+module
async function findSub(core: any, data: any, orgId: string | null):
    Promise<{ id: string; status: string; metadata: Record<string, unknown> } | null> {
    const subId = data?.subscription_id;
    if (subId) {
        const { data: row } = await core.from('subscriptions')
            .select('id, status, metadata')
            .eq('provider', 'dodo')
            .eq('provider_ref', subId)
            .maybeSingle();
        if (row) return row;
    }
    if (orgId) {
        const { data: row } = await core.from('subscriptions')
            .select('id, status, metadata')
            .eq('organization_id', orgId)
            .eq('module_name', MODULE_NAME)
            .in('status', ['trial', 'active', 'past_due'])
            .maybeSingle();
        if (row) return row;
    }
    return null;
}

// TimeFlow org'unu Core organizations'a aynala (FK gereksinimi).
// Slug deterministik ve regex-uyumlu: tf-<uuid ilk 12 hex>
async function ensureCoreOrg(core: any, orgId: string, data: any): Promise<unknown | null> {
    const { data: existing } = await core.from('organizations').select('id').eq('id', orgId).maybeSingle();
    if (existing) return null;

    const rawName = String(data?.metadata?.org_name || data?.customer?.name || 'TimeFlow İşletmesi').trim();
    const name = rawName.length >= 2 ? rawName.slice(0, 120) : 'TimeFlow İşletmesi';
    const slug = `tf-${orgId.replace(/-/g, '').slice(0, 12)}`;

    const { error } = await core.from('organizations').insert({
        id: orgId,
        name,
        slug,
        owner_user_id: PLACEHOLDER_OWNER,
        metadata: { source: 'timeflow', mirrored_by: 'dodo-webhook' },
    });
    // Yarışta başka bir event aynı org'u eklemiş olabilir → unique ihlali sorun değil
    if (error && error.code !== '23505') return error;
    return null;
}

// Standard Webhooks: base64(HMAC-SHA256(secret, `${id}.${timestamp}.${body}`))
// Header 'webhook-signature' boşlukla ayrılmış "v1,<base64>" listesi içerir.
async function verifySignature(secret: string, id: string, ts: string, body: string, sigHeader: string): Promise<boolean> {
    const secretB64 = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    const keyBytes = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`));
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

    for (const part of sigHeader.split(' ')) {
        const [version, sig] = part.split(',', 2);
        if (version === 'v1' && sig && timingSafeEqual(sig, expected)) return true;
    }
    return false;
}

function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
