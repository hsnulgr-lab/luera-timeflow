import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { mirrorEntitlement, type EntState } from '../_shared/entitlement.ts';
import { notifyOwner } from '../_shared/notify.ts';
import { cancelNow, dodoApi, getSubscription, lookupSubscription } from '../_shared/dodo.ts';
import { getSecret } from '../_shared/wa.ts';
import { decide, needsMineNow, type Decision, type MineNow, type MirrorNow } from './durum.ts';
import { syncPendingToCore } from './core.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, webhook-id, webhook-signature, webhook-timestamp',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Dodo Payments webhook — abonelik gerçeğinin TEK yazarı.
 *
 * ── 2026-10-19 · TimeFlow asıl, Core kopya (devir 10 §10) ───────────────────
 * Eskiden her olay önce LUERA Core'a yazılıyor, ayna (`org_entitlement`)
 * ancak Core'da abonelik bulunursa güncelleniyordu. Eylül'de Core düşünce
 * webhook günlerce 500 döndü, Dodo ucu KAPATTI ve 8 hafta tek olay gelmedi.
 *
 * Yeni sıra:
 *   1. İmza (Standard Webhooks, sabit zamanlı, 5 dk).
 *   2. Yerel deftere yaz (`dodo_events`) — tekrar denetimi burada.
 *   3. Aynayı aboneliğin anlık görüntüsünden türet (`durum.ts`) ve yaz.
 *      Yazılamazsa 500 → Dodo yeniden dener. Kalıcı veri hatası (bütünlük
 *      ihlali) 500 DEĞİL: Dodo'nun sonsuz yeniden denemesi ucu kapattırır.
 *   4. Core'a kopya (`core.ts`) — süre sınırlı, hatası Dodo'ya YANSIMAZ;
 *      aktarılamayan olay defterde bekler, sonraki çağrıda yeniden denenir.
 *
 * Güvenlik modeli değişmedi: JWT yok (Dodo çağırır, config.toml
 * verify_jwt=false); kimlik imzayla. İşletme kimliği checkout'ta
 * `metadata.organization_id` olarak verilir; ödeme olaylarında yoksa
 * aynadaki Dodo abonelik kimliğinden bulunur.
 */

const TOLERANCE_S = 5 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    try {
        const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        const secret = await getSecret(admin, 'DODO_WEBHOOK_SECRET');
        if (!secret) {
            console.error('dodo-webhook: DODO_WEBHOOK_SECRET yok');
            return json({ error: 'not_configured' }, 500);
        }

        // ── 1 · İmza — ham gövde üzerinden (parse ETMEDEN önce) ─────────────
        const rawBody = await req.text();
        const whId = req.headers.get('webhook-id') || '';
        const whTs = req.headers.get('webhook-timestamp') || '';
        const whSig = req.headers.get('webhook-signature') || '';
        if (!whId || !whTs || !whSig) return json({ error: 'missing_signature_headers' }, 401);

        const tsNum = parseInt(whTs, 10);
        if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > TOLERANCE_S) {
            console.warn('dodo-webhook: zaman damgası tolerans dışında', whId);
            return json({ error: 'stale_timestamp' }, 401);
        }
        if (!(await verifySignature(secret, whId, whTs, rawBody, whSig))) {
            console.warn('dodo-webhook: imza tutmadı', whId);
            return json({ error: 'invalid_signature' }, 401);
        }

        const event = JSON.parse(rawBody);
        const type: string = event?.type ?? 'unknown';
        const data = event?.data ?? {};
        const eventAt: string | null = typeof event?.timestamp === 'string' ? event.timestamp : null;
        const subId: string | null = typeof data.subscription_id === 'string' ? data.subscription_id : null;
        const core = { url: await getSecret(admin, 'CORE_SUPABASE_URL'), key: await getSecret(admin, 'CORE_SERVICE_KEY') };
        console.log(`dodo-webhook ${type} ${whId}${subId ? ` sub=${subId}` : ''}`);

        // ── 2 · Defter ──────────────────────────────────────────────────────
        const { data: prior, error: priorErr } = await admin.from('dodo_events')
            .select('processed_at').eq('webhook_id', whId).maybeSingle();
        if (priorErr) return fail('defter okunamadı', priorErr);
        if (prior?.processed_at) {
            await syncPendingToCore(admin, core.url, core.key);
            return json({ received: true, duplicate: true }, 200);
        }
        if (!prior) {
            const { error } = await admin.from('dodo_events').insert({
                webhook_id: whId,
                event_type: type,
                event_at: eventAt,
                subscription_id: subId,
                payment_id: typeof data.payment_id === 'string' ? data.payment_id : null,
                amount: type.startsWith('payment.') ? extractAmount(data) : null,
                currency: typeof data.currency === 'string' ? data.currency : null,
                invoice_url: data.invoice_url ?? null,
                raw: event,
            });
            // 23505: aynı olayın eşzamanlı ikinci teslimi — işleme idempotent.
            if (error && error.code !== '23505') return fail('deftere yazılamadı', error);
        }

        // ── 3 · İşletme ve aynanın şimdiki hâli ─────────────────────────────
        const cols = 'organization_id, state, grace_until, dodo_subscription_id, dodo_event_at';
        // UUID olmayan değer (panelin örnek olayı) sorguda kalıcı hata verir →
        // sonsuz yeniden deneme. Biçim tutmuyorsa işletme yok sayılır.
        const metaOrg = data.metadata?.organization_id;
        let orgId: string | null = typeof metaOrg === 'string' && UUID.test(metaOrg) ? metaOrg : null;
        let current: (MirrorNow & { organization_id: string }) | null = null;
        if (orgId) {
            const { data: row, error } = await admin.from('org_entitlement').select(cols).eq('organization_id', orgId).maybeSingle();
            if (error) return fail('ayna okunamadı', error);
            current = row;
        } else if (subId) {
            const { data: row, error } = await admin.from('org_entitlement').select(cols).eq('dodo_subscription_id', subId).maybeSingle();
            if (error) return fail('ayna okunamadı', error);
            current = row;
            orgId = row?.organization_id ?? null;
        }

        if (!orgId) return await finish(admin, core, whId, null, 'no_org');

        const { data: org, error: orgErr } = await admin.from('organizations').select('id').eq('id', orgId).maybeSingle();
        if (orgErr) return fail('işletme okunamadı', orgErr);
        // Hesap silindikten sonra gelen olay (ör. silmedeki iptalin kendisi):
        // yazılacak ayna yok. 500 dönülseydi Dodo bir gün boyunca deneyip ucu
        // kapatırdı.
        if (!org) return await finish(admin, core, whId, orgId, 'org_gone');

        // ── 4 · Karar ───────────────────────────────────────────────────────
        let decision: Decision | null = null;
        if (type.startsWith('subscription.')) {
            const mineNow = await readMine(admin, data, current);
            // Geçici okuma hatası → 500, Dodo yeniden dener: yeni abonelik
            // "karşılaştırılamadı" diye atlansaydı ödeyen salon eski
            // (askıdaki) aboneliğe bağlı kalır, ek süre bitince kilitlenirdi.
            if (mineNow === 'retry') return fail('aynadaki abonelik Dodo\'dan okunamadı', current?.dodo_subscription_id);
            decision = decide(type, data, eventAt, current, Date.now(), mineNow);
        } else if (type === 'payment.succeeded' && subId && current?.state === 'grace') {
            // Askıdaki salon kartını güncelledi: ödeme olayı yeni dönemi
            // taşımıyor. Aboneliğin şimdiki hâli Dodo'dan okunur; okunamazsa
            // arkasından gelen abonelik olayı düzeltir.
            const api = await dodoApi(admin);
            const sub = api ? await getSubscription(api, subId) : null;
            const mineNow = sub ? await readMine(admin, sub, current) : 'retry';
            if (mineNow !== 'retry') decision = decide(type, sub, new Date().toISOString(), current, Date.now(), mineNow);
        }

        if (!decision) return await finish(admin, core, whId, orgId, 'recorded');
        if (decision.kind === 'skip') {
            // Aynı işletmenin eski kopyası yenilendi: ayna yenisinde kalır,
            // eskisi bir daha tahsilat yapmasın (çift tahsilat).
            if (decision.cancel) await cancelOther(admin, decision.cancel, 'eski kopya abonelik');
            return await finish(admin, core, whId, orgId, decision.outcome);
        }

        const mirrorErr = await mirrorEntitlement(admin, orgId, decision.patch);
        if (mirrorErr) {
            if (String(mirrorErr.code ?? '').startsWith('23')) {
                // Bütünlük ihlali (ör. aynı Dodo aboneliği iki işletmede):
                // yeniden denemek düzeltmez, yalnız ucu kapattırır.
                console.error('dodo-webhook: KALICI ayna hatası — elle bakılmalı', orgId, mirrorErr);
                return await finish(admin, core, whId, orgId, `conflict_${mirrorErr.code}`);
            }
            return fail('ayna yazılamadı', mirrorErr);
        }

        if (decision.enteredGrace) {
            // Sessiz kilit en kötüsü: kullanıcı iki gün sonra kapıyı kapalı
            // bulur ve neden olduğunu bilmez.
            notifyOwner(admin, orgId, {
                title: 'Ödeme alınamadı',
                body: 'Aboneliğinizin ödemesi alınamadı. 2 gün içinde kartınızı güncelleyin, hizmetiniz kesintisiz devam etsin.',
                url: '/settings?tab=billing',
                tag: 'billing-hold',
            });
        }
        if (decision.replaced) {
            // Bir işletme, bir abonelik: yenisi etkinleşti, eskisi bir daha
            // tahsilat yapmasın (askıdaki eski abonelik kart güncellenince
            // yeniden çekmeye başlardı → çift tahsilat).
            await cancelOther(admin, decision.replaced, 'yerine yenisi geçen abonelik');
        }

        return await finish(admin, core, whId, orgId, 'applied', decision.patch.state);
    } catch (err) {
        console.error('dodo-webhook error:', err);
        return json({ error: 'internal' }, 500);
    }
});

// ── Yardımcılar ──────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Başka bir abonelik `active` geldiyse aynadakinin Dodo'daki hâli — `decide`
 * en yenisini seçsin diye. Gerekmiyorsa undefined; geçici hata → 'retry'.
 * Kalıcı hata (öteki 4xx, anahtar yok) yeniden denemeyle düzelmez ve 500
 * dönmek ucu kapattırır: "Dodo'da yok" sayılır, yenisi yerine geçer.
 */
async function readMine(admin: Db, sub: Db, current: MirrorNow | null): Promise<MineNow | undefined | 'retry'> {
    if (!needsMineNow(sub, current)) return undefined;
    const api = await dodoApi(admin);
    if (!api) return { found: false };
    const r = await lookupSubscription(api, current!.dodo_subscription_id!);
    if (r.kind === 'transient') return 'retry';
    if (r.kind !== 'found') return { found: false };
    return {
        found: true,
        status: String(r.sub?.status ?? ''),
        created_at: typeof r.sub?.created_at === 'string' ? r.sub.created_at : null,
    };
}

/** İşletmenin öteki aboneliğini Dodo'da hemen kapatır; sonucu yalnız loglar. */
async function cancelOther(admin: Db, id: string, why: string): Promise<void> {
    const api = await dodoApi(admin);
    const out = api ? await cancelNow(api, id) : { ok: false as const, reason: 'dodo_not_configured' };
    console.log(`dodo-webhook: ${why} ${id} iptal=${out.ok ? 'tamam' : out.reason}`);
}

/** Olayı işlenmiş say, Core'a kopyala, 200 dön. */
async function finish(
    admin: Db, core: { url: string | null; key: string | null },
    id: string, orgId: string | null, outcome: string, state?: EntState,
): Promise<Response> {
    const { error } = await admin.from('dodo_events')
        .update({ processed_at: new Date().toISOString(), organization_id: orgId, outcome })
        .eq('webhook_id', id);
    if (error) return fail('defter kapatılamadı', error);
    if (outcome !== 'applied') console.log(`dodo-webhook ${id}: ${outcome}`);
    await syncPendingToCore(admin, core.url, core.key, id);
    return json({ received: true, outcome, ...(state ? { state } : {}) }, 200);
}

function fail(what: string, error: unknown): Response {
    console.error(`dodo-webhook: ${what}`, error);
    return json({ error: 'internal', detail: what }, 500);
}

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

// Dodo tutarları en küçük birimde (kuruş) gönderir → TL'ye çevir
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAmount(data: any): number | null {
    const cents = data?.total_amount ?? data?.amount ?? null;
    return typeof cents === 'number' ? cents / 100 : null;
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
