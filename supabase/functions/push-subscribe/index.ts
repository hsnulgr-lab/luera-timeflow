import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Web Push abonelik yönetimi (mobil kumanda bildirimleri).
 *
 * Güvenlik: kullanıcı JWT'den doğrulanır, org organization_members'tan
 * server-side çözülür (whatsapp-proxy deseni). VAPID public key gizli
 * değildir; config aksiyonu onu client'a döndürür.
 *
 * Aksiyonlar:
 *   { action: 'config' } → { publicKey }
 *   { action: 'subscribe', subscription:{endpoint,keys:{p256dh,auth}}, staffId?, role } → { ok }
 *   { action: 'unsubscribe', endpoint } → { ok }
 */

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const admin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const body = await req.json().catch(() => ({}));
        const action = body.action as string;

        // config — VAPID public key (gizli değil), izin öncesi client çeker
        if (action === 'config') {
            const publicKey = await getSecret(admin, 'VAPID_PUBLIC_KEY');
            if (!publicKey) return json({ error: 'push_not_configured' }, 500);
            return json({ publicKey }, 200);
        }

        // Kimlik doğrulama (config dışındaki tüm aksiyonlar)
        const authHeader = req.headers.get('Authorization') || '';
        const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (!jwt) return json({ error: 'unauthorized' }, 401);

        const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
        if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

        const { data: member } = await admin
            .from('organization_members')
            .select('org_id')
            .eq('user_id', userData.user.id)
            .limit(1)
            .maybeSingle();
        const orgId = member?.org_id;
        if (!orgId) return json({ error: 'no_org' }, 403);

        if (action === 'subscribe') {
            const sub = body.subscription;
            if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
                return json({ error: 'invalid_subscription' }, 400);
            }
            const role = body.role === 'manager' ? 'manager' : 'staff';
            const staffId = role === 'staff' ? (body.staffId ?? null) : null;

            // endpoint UNIQUE → aynı cihaz tekrar abone olursa güncelle
            const { error } = await admin.from('push_subscriptions').upsert({
                organization_id: orgId,
                staff_id: staffId,
                role,
                endpoint: sub.endpoint,
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth,
                user_agent: req.headers.get('user-agent') || null,
                last_seen_at: new Date().toISOString(),
            }, { onConflict: 'endpoint' });
            if (error) { console.error('push subscribe', error); return json({ error: 'save_failed' }, 500); }
            return json({ ok: true }, 200);
        }

        if (action === 'unsubscribe') {
            if (!body.endpoint) return json({ error: 'endpoint_required' }, 400);
            await admin.from('push_subscriptions').delete().eq('endpoint', body.endpoint).eq('organization_id', orgId);
            return json({ ok: true }, 200);
        }

        return json({ error: 'unknown_action' }, 400);
    } catch (err) {
        console.error('push-subscribe error:', err);
        return json({ error: 'Sunucu hatası', detail: String(err) }, 500);
    }
});

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function getSecret(supabase: any, key: string): Promise<string | null> {
    const env = Deno.env.get(key);
    if (env) return env;
    const { data } = await supabase.from('app_secrets').select('value').eq('key', key).maybeSingle();
    return data?.value ?? null;
}
