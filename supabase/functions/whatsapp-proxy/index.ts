import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * WhatsApp (Evolution API) proxy.
 *
 * Neden var: Evolution global admin anahtarı ASLA tarayıcıya gömülmemeli.
 * Tüm instance işlemleri buradan, server-side anahtarla yapılır.
 *
 * Güvenlik modeli:
 *   - Kullanıcı kimliği request body'den DEĞİL, session JWT'sinden doğrulanır.
 *   - Org, kullanıcının organization_members kaydından server-side çözülür.
 *   - Evolution instance adı org ID'den TÜRETİLİR (tf_<org>). Böylece bir
 *     tenant başka bir tenant'ın instance'ına yapısal olarak erişemez.
 *
 * Action'lar: connect | state | disconnect | send
 */
type Action = 'connect' | 'state' | 'disconnect' | 'send';

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
        const instance = `tf_${String(orgId).replace(/-/g, '')}`;

        const EVOLUTION_URL = await getSecret(admin, 'EVOLUTION_API_URL');
        const EVOLUTION_KEY = await getSecret(admin, 'EVOLUTION_API_KEY');
        if (!EVOLUTION_URL || !EVOLUTION_KEY) return json({ error: 'evolution_not_configured' }, 500);
        const evoHeaders = { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY };

        const body = await req.json().catch(() => ({}));
        const action = body.action as Action;

        switch (action) {
            // ── Bağlan: instance oluştur + QR döndür ──────────────────────────
            case 'connect': {
                const existing = await fetchState(EVOLUTION_URL, evoHeaders, instance);
                if (existing === 'open') {
                    await setInstance(admin, userId, instance);
                    return json({ qr: null, connected: true }, 200);
                }
                await fetch(`${EVOLUTION_URL}/instance/create`, {
                    method: 'POST',
                    headers: evoHeaders,
                    body: JSON.stringify({ instanceName: instance, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
                }).catch(() => {});
                await new Promise((r) => setTimeout(r, 1200));
                const qr = await fetchQR(EVOLUTION_URL, evoHeaders, instance);
                return json({ qr, connected: false }, 200);
            }

            // ── Durum: bağlandıysa settings'e instance'ı yaz (remind okur) ────
            case 'state': {
                const state = await fetchState(EVOLUTION_URL, evoHeaders, instance);
                if (state === 'open') await setInstance(admin, userId, instance);
                return json({ state, connected: state === 'open' }, 200);
            }

            // ── Bağlantıyı kes: instance'ı sil + settings'i temizle ───────────
            case 'disconnect': {
                await fetch(`${EVOLUTION_URL}/instance/delete/${instance}`, {
                    method: 'DELETE',
                    headers: evoHeaders,
                }).catch(() => {});
                await setInstance(admin, userId, null);
                return json({ ok: true }, 200);
            }

            // ── Mesaj gönder: yalnızca org bağlıysa, türetilmiş instance'tan ──
            case 'send': {
                const phone = String(body.phone || '').trim();
                const text = String(body.text || '');
                if (!phone || !text) return json({ error: 'phone ve text gerekli' }, 400);

                const { data: s } = await admin
                    .from('settings')
                    .select('whatsapp_instance')
                    .eq('user_id', userId)
                    .maybeSingle();
                if (!s?.whatsapp_instance) return json({ ok: false, error: 'not_connected' }, 409);

                const res = await fetch(`${EVOLUTION_URL}/message/sendText/${instance}`, {
                    method: 'POST',
                    headers: evoHeaders,
                    body: JSON.stringify({ number: phone, text }),
                });
                return json({ ok: res.ok }, res.ok ? 200 : 502);
            }

            default:
                return json({ error: 'gecersiz action' }, 400);
        }
    } catch (e) {
        return json({ error: String(e) }, 500);
    }
});

// Org'un (bağlanan kullanıcının) settings satırına instance adını yaz/temizle
async function setInstance(
    admin: ReturnType<typeof createClient>,
    userId: string,
    instance: string | null,
): Promise<void> {
    await admin
        .from('settings')
        .update({ whatsapp_instance: instance, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
}

// Sırrı önce env'den, yoksa app_secrets tablosundan al (getGroqKey ile aynı desen)
async function getSecret(
    admin: ReturnType<typeof createClient>,
    key: string,
): Promise<string | null> {
    const env = Deno.env.get(key);
    if (env) return env;
    const { data } = await admin.from('app_secrets').select('value').eq('key', key).maybeSingle();
    return data?.value ?? null;
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
