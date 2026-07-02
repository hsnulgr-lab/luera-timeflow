import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-push-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Web Push gönderimi (yalnızca sunucu tarafı — DB trigger / remind çağırır).
 *
 * Güvenlik: JWT YOK; çağıran x-push-secret header'ıyla doğrulanır
 * (app_secrets.PUSH_TRIGGER_SECRET). Böylece hem DB trigger (pg_net) hem
 * remind fonksiyonu servis anahtarı ifşa etmeden çağırabilir.
 * Deploy: --no-verify-jwt (bkz. supabase/config.toml).
 *
 * Body: {
 *   organization_id: string,
 *   target: { staffId: string } | { role: 'manager' },
 *   payload: { title, body, url?, tag? }
 * }
 */

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    try {
        const admin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        // Çağıran doğrulaması — paylaşılan sır
        const wantSecret = await getSecret(admin, 'PUSH_TRIGGER_SECRET');
        const gotSecret = req.headers.get('x-push-secret') || '';
        if (!wantSecret || gotSecret !== wantSecret) return json({ error: 'unauthorized' }, 401);

        const publicKey = await getSecret(admin, 'VAPID_PUBLIC_KEY');
        const privateKey = await getSecret(admin, 'VAPID_PRIVATE_KEY');
        const subject = (await getSecret(admin, 'VAPID_SUBJECT')) || 'mailto:destek@lueratech.com';
        if (!publicKey || !privateKey) return json({ error: 'push_not_configured' }, 500);
        webpush.setVapidDetails(subject, publicKey, privateKey);

        const { organization_id, target, payload } = await req.json();
        if (!organization_id || !target || !payload) return json({ error: 'invalid_body' }, 400);

        // Hedef abonelikleri seç
        let q = admin.from('push_subscriptions')
            .select('id, endpoint, p256dh, auth')
            .eq('organization_id', organization_id);
        if (target.staffId) q = q.eq('staff_id', target.staffId);
        else if (target.role === 'manager') q = q.eq('role', 'manager');
        else return json({ error: 'invalid_target' }, 400);

        const { data: subs } = await q;
        if (!subs || subs.length === 0) return json({ sent: 0, note: 'no_subscribers' }, 200);

        const msg = JSON.stringify(payload);
        const dead: string[] = [];
        let sent = 0;

        await Promise.all(subs.map(async (s: any) => {
            try {
                await webpush.sendNotification(
                    { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                    msg,
                );
                sent++;
            } catch (err: any) {
                const code = err?.statusCode;
                // 404/410 → abonelik ölmüş, temizle
                if (code === 404 || code === 410) dead.push(s.endpoint);
                else console.error('push send hata', code, err?.body || String(err));
            }
        }));

        if (dead.length) {
            await admin.from('push_subscriptions').delete().in('endpoint', dead);
        }

        return json({ sent, pruned: dead.length, total: subs.length }, 200);
    } catch (err) {
        console.error('send-push error:', err);
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
