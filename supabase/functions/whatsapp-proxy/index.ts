import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
    featureOn, getOrgWa, getSecret, instanceFor, markDisconnected, sendWA,
    type OrgWa, type WaKind,
} from '../_shared/wa.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * WhatsApp (Evolution API) proxy — tarayıcının tek yolu.
 *
 * Neden var: Evolution global admin anahtarı ASLA tarayıcıya gömülmemeli.
 * Tüm instance işlemleri buradan, server-side anahtarla yapılır.
 *
 * Güvenlik modeli:
 *   - Kullanıcı kimliği request body'den DEĞİL, session JWT'sinden doğrulanır.
 *   - Org, kullanıcının organization_members kaydından server-side çözülür.
 *   - Evolution instance adı org ID'den TÜRETİLİR (tf_<org>). Böylece bir
 *     tenant başka bir tenant'ın instance'ına yapısal olarak erişemez.
 *   - Bağlantı durumu org_whatsapp'ta (org başına tek satır, 070). Eskiden
 *     settings'teydi ama settings kullanıcı başına tek satır.
 *
 * Action'lar: connect | state | disconnect | send | health
 */
type Action = 'connect' | 'state' | 'disconnect' | 'send' | 'health' | 'features';

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
        const userId = userData.user.id;

        // 2) Kullanıcının org'unu server-side çöz (client'a güvenme)
        const { data: member } = await admin
            .from('organization_members')
            .select('org_id')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();
        const orgId = member?.org_id;
        if (!orgId) return json({ error: 'no_org' }, 403);

        // 3) Instance adı org'dan türetilir — cross-tenant erişim imkânsız
        const instance = instanceFor(orgId);
        const org = await ensureRow(admin, orgId);

        const body = await req.json().catch(() => ({}));
        const action = body.action as Action;

        // send ve health Evolution ayarları olmadan da anlamlı cevap verebilmeli
        if (action === 'health') return json(await health(admin, orgId, org), 200);

        // org_whatsapp'ta yazma RLS policy'si yok (yalnız service_role); işletmenin
        // otomatik mesajları açıp kapatması bu action'dan geçer.
        if (action === 'features') {
            const patch = (body.features ?? {}) as Record<string, unknown>;
            const allowed = ['confirmation', 'review', 'winback', 'renewal', 'recall', 'assistant'];
            const next = { ...org.features };
            for (const k of allowed) {
                if (typeof patch[k] === 'boolean') next[k] = patch[k] as boolean;
            }
            await admin.from('org_whatsapp')
                .update({ features: next, updated_at: new Date().toISOString() })
                .eq('organization_id', orgId);
            return json({ ok: true, features: next }, 200);
        }

        if (action === 'send') {
            const phone = String(body.phone || '').trim();
            const text = String(body.text || '');
            if (!phone || !text) return json({ error: 'phone ve text gerekli' }, 400);
            const kind = (body.kind as WaKind) || 'manual';
            // Randevu onayı işletme tarafından kapatılabilir; kapalıysa panelden
            // gelen istek de sessizce atlanır (tek anahtar, üç kaynak).
            if (kind === 'confirmation' && !featureOn(org, 'confirmation')) {
                return json({ ok: false, reason: 'failed' }, 200);
            }
            const res = await sendWA(admin, {
                org, phone, text, kind,
                customerId: body.customerId ?? null,
            });
            return json(res, res.ok ? 200 : 200); // reason'ı okuyabilsin diye 200
        }

        const EVOLUTION_URL = await getSecret(admin, 'EVOLUTION_API_URL');
        const EVOLUTION_KEY = await getSecret(admin, 'EVOLUTION_API_KEY');
        if (!EVOLUTION_URL || !EVOLUTION_KEY) return json({ error: 'evolution_not_configured' }, 500);
        const evoHeaders = { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY };

        switch (action) {
            // ── Bağlan: instance oluştur + webhook kaydet + QR döndür ─────────
            case 'connect': {
                const existing = await fetchState(EVOLUTION_URL, evoHeaders, instance);
                if (existing === 'open') {
                    await setConnected(admin, orgId, instance);
                    const wh = await registerWebhook(admin, EVOLUTION_URL, evoHeaders, instance, org.webhook_secret);
                    return json({ qr: null, connected: true, instance, webhook: wh }, 200);
                }
                await fetch(`${EVOLUTION_URL}/instance/create`, {
                    method: 'POST',
                    headers: evoHeaders,
                    body: JSON.stringify({ instanceName: instance, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
                }).catch(() => {});
                await admin.from('org_whatsapp').update({
                    instance, status: 'connecting', last_error: null, updated_at: new Date().toISOString(),
                }).eq('organization_id', orgId);

                // Webhook'u burada kaydediyoruz ki kullanıcı Evolution Manager'a
                // hiç girmesin — gelen mesaj botunun tek elle kurulum adımıydı.
                const wh = await registerWebhook(admin, EVOLUTION_URL, evoHeaders, instance, org.webhook_secret);

                await new Promise((r) => setTimeout(r, 1200));
                const qr = await fetchQR(EVOLUTION_URL, evoHeaders, instance);
                return json({ qr, connected: false, instance, webhook: wh }, 200);
            }

            // ── Durum ─────────────────────────────────────────────────────────
            case 'state': {
                const state = await fetchState(EVOLUTION_URL, evoHeaders, instance);
                let wh: { ok: boolean; reason?: string } | undefined;
                if (state === 'open') {
                    await setConnected(admin, orgId, instance);
                    // Her durum sorgusunda tazeleniyor: Evolution'da instance
                    // elle silinip yeniden kurulsa da webhook geri geliyor.
                    wh = await registerWebhook(admin, EVOLUTION_URL, evoHeaders, instance, org.webhook_secret);
                    if (!wh.ok) {
                        await admin.from('org_whatsapp')
                            .update({ last_error: `webhook: ${wh.reason}` })
                            .eq('organization_id', orgId);
                    }
                } else if (org.status === 'connected') {
                    await markDisconnected(admin, orgId, `state:${state}`);
                }
                await cleanupInboundSeen(admin);
                return json({ state, connected: state === 'open', instance, webhook: wh }, 200);
            }

            // ── Bağlantıyı kes ────────────────────────────────────────────────
            case 'disconnect': {
                await fetch(`${EVOLUTION_URL}/instance/delete/${instance}`, {
                    method: 'DELETE',
                    headers: evoHeaders,
                }).catch(() => {});
                await admin.from('org_whatsapp').update({
                    instance: null, status: 'disconnected', connected_at: null,
                    last_error: null, updated_at: new Date().toISOString(),
                }).eq('organization_id', orgId);
                return json({ ok: true }, 200);
            }

            default:
                return json({ error: 'gecersiz action' }, 400);
        }
    } catch (e) {
        return json({ error: String(e) }, 500);
    }
});

// 070 tüm org'lara satır açıyor ama sonradan silinmiş/eksik bir satıra karşı
// dayanıklı olalım.
async function ensureRow(admin: ReturnType<typeof createClient>, orgId: string): Promise<OrgWa> {
    const existing = await getOrgWa(admin, orgId);
    if (existing) return existing;
    await admin.from('org_whatsapp').insert({ organization_id: orgId, status: 'disconnected' });
    const created = await getOrgWa(admin, orgId);
    if (created) return created;
    return {
        organization_id: orgId, instance: null, status: 'disconnected',
        webhook_secret: '', features: {},
    };
}

async function setConnected(
    admin: ReturnType<typeof createClient>, orgId: string, instance: string,
): Promise<void> {
    const now = new Date().toISOString();
    await admin.from('org_whatsapp').update({
        instance, status: 'connected', connected_at: now, last_seen_at: now,
        last_error: null, updated_at: now,
    }).eq('organization_id', orgId);
}

/**
 * Evolution'a "gelen mesajları şu adrese POST et" der. Adreste org'a özel bir
 * sır taşınır; whatsapp-booking bunu doğrular (aksi hâlde URL'i bilen herkes
 * botu sürebiliyordu).
 */
async function registerWebhook(
    admin: ReturnType<typeof createClient>,
    baseUrl: string,
    headers: Record<string, string>,
    instance: string,
    secret: string,
): Promise<{ ok: boolean; reason?: string }> {
    const fnBase = await getSecret(admin, 'FUNCTIONS_BASE_URL');
    if (!fnBase) return { ok: false, reason: 'FUNCTIONS_BASE_URL tanımlı değil' };
    if (!secret) return { ok: false, reason: 'webhook_secret yok (migration 070?)' };
    const url = `${fnBase.replace(/\/$/, '')}/whatsapp-booking?s=${secret}`;
    const payload = { enabled: true, url, webhookByEvents: false, events: ['MESSAGES_UPSERT'] };
    try {
        // Evolution v2 gövdeyi { webhook: {...} } içinde bekler, v1 düz alır.
        const res = await fetch(`${baseUrl}/webhook/set/${instance}`, {
            method: 'POST', headers, body: JSON.stringify({ webhook: payload, ...payload }),
        });
        if (res.ok) return { ok: true };
        return { ok: false, reason: `Evolution webhook/set → HTTP ${res.status}` };
    } catch (e) {
        return { ok: false, reason: String(e).slice(0, 200) };
    }
}

async function health(
    admin: ReturnType<typeof createClient>, orgId: string, org: OrgWa,
): Promise<Record<string, unknown>> {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data } = await admin
        .from('wa_message_log')
        .select('status, direction, kind, error, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);
    const rows = data ?? [];
    const out = rows.filter((r: { direction: string }) => r.direction === 'out');
    return {
        status: org.status,
        instance: org.instance,
        features: org.features,
        last24h: {
            sent:     out.filter((r: { status: string }) => r.status === 'sent').length,
            failed:   out.filter((r: { status: string }) => r.status === 'failed').length,
            skipped:  out.filter((r: { status: string }) => r.status === 'skipped').length,
            inbound:  rows.length - out.length,
        },
        lastError: out.find((r: { error?: string }) => r.error)?.error ?? null,
    };
}

// Idempotency kayıtları 24 saatten sonra işe yaramaz; ayrı bir cron kurmamak
// için durum sorgusuna iliştiriyoruz.
async function cleanupInboundSeen(admin: ReturnType<typeof createClient>): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
    await admin.from('wa_inbound_seen').delete().lt('created_at', cutoff).then(() => {}, () => {});
}

async function fetchQR(
    baseUrl: string,
    headers: Record<string, string>,
    instance: string,
): Promise<string | null> {
    try {
        const res = await fetch(`${baseUrl}/instance/connect/${instance}`, { headers });
        if (!res.ok) return null;
        const data = await res.json();
        // Evolution v1 ve v2 farklı field kullanır
        return data.base64 || data.qrcode?.base64 || data.code || null;
    } catch {
        return null;
    }
}

async function fetchState(
    baseUrl: string,
    headers: Record<string, string>,
    instance: string,
): Promise<string> {
    try {
        const res = await fetch(`${baseUrl}/instance/connectionState/${instance}`, { headers });
        if (!res.ok) return 'close';
        const data = await res.json();
        return data.instance?.state || 'close';
    } catch {
        return 'close';
    }
}

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
