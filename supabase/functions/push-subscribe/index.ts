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
 * ── İKİ KANAL (103/106) ─────────────────────────────────────────────────────
 * Bu uç artık iki kanala da hizmet ediyor:
 *   kind='web'   tarayıcı/PWA — VAPID anahtarlı abonelik (037'den beri)
 *   kind='expo'  MÜDÜRÜN native uygulaması — Expo jetonu, anahtar yok
 *
 * Personelin Expo jetonu BURADAN GEÇMİYOR: personelin Supabase oturumu yok ve
 * bu uç JWT istiyor. Onun yolu `staff-api` · `push.register` (103).
 *
 * Aksiyonlar:
 *   { action: 'config' } → { publicKey }
 *   { action: 'subscribe', subscription:{endpoint,keys:{p256dh,auth}}, staffId?, role } → { ok }
 *   { action: 'subscribe', kind:'expo', token, platform, deviceId, role:'manager' } → { ok }
 *   { action: 'unsubscribe', endpoint } | { action:'unsubscribe', deviceId } → { ok }
 *   { action: 'status', endpoint, staffId? } | { action:'status', deviceId } → { subscribed }
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

        /*
         * EXPO KANALI (106) — müdürün native uygulaması.
         *
         * Web dalından ÖNCE, çünkü gövdede `subscription` yok ve aşağıdaki
         * doğrulama onu zorunlu tutuyor.
         *
         * `device_id` ile önce eski satır siliniyor: jeton döndüğünde
         * (yeniden kurulum, yedekten dönüş) iki satır kalır ve ölü olan ancak
         * ilk başarısız gönderimde budanırdı. Tek `upsert`e sıkıştırılamaz —
         * tabloda iki ayrı tekillik kısıtı var (`endpoint` ve kısmi
         * `(org, device_id)`) ve `on conflict` yalnız birini hedefleyebiliyor.
         */
        if (action === 'subscribe' && body.kind === 'expo') {
            const token = typeof body.token === 'string' ? body.token.trim() : '';
            const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
            const platform = body.platform === 'ios' || body.platform === 'android' ? body.platform : null;
            // Biçim burada denetleniyor ki cevap açık bir 400 olsun; DB kısıtı
            // ikinci savunma hattı, hata mesajı olarak okunamaz.
            if (!/^Expo(nent)?PushToken\[[^\]]+\]$/.test(token)) {
                return json({ error: 'invalid_push_token' }, 400);
            }
            if (!deviceId) return json({ error: 'invalid_device_id' }, 400);

            await admin.from('push_subscriptions').delete()
                .eq('organization_id', orgId).eq('kind', 'expo')
                .eq('device_id', deviceId).neq('endpoint', token);

            const { error } = await admin.from('push_subscriptions').upsert({
                organization_id: orgId,
                staff_id: null,          // müdür aboneliği kişiye değil ROLE bağlı
                role: 'manager',
                kind: 'expo',
                endpoint: token,
                p256dh: null,
                auth: null,
                platform,
                device_id: deviceId,
                user_agent: `expo/${platform ?? 'bilinmiyor'}`,
                last_seen_at: new Date().toISOString(),
            }, { onConflict: 'endpoint' });
            if (error) { console.error('expo subscribe', error); return json({ error: 'save_failed' }, 500); }
            return json({ ok: true }, 200);
        }

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
            /*
             * `deviceId` ile de koparılabiliyor: çıkış anında izin geri
             * alınmışsa Expo jetonu ÜRETİLEMİYOR ve hangi satırın silineceği
             * bilinemiyor. Cihaz kimliği izinden bağımsız duruyor (103).
             */
            if (typeof body.deviceId === 'string' && body.deviceId.trim()) {
                await admin.from('push_subscriptions').delete()
                    .eq('organization_id', orgId).eq('kind', 'expo')
                    .eq('device_id', body.deviceId.trim());
                return json({ ok: true }, 200);
            }
            if (!body.endpoint) return json({ error: 'endpoint_required' }, 400);
            await admin.from('push_subscriptions').delete().eq('endpoint', body.endpoint).eq('organization_id', orgId);
            return json({ ok: true }, 200);
        }

        // status — bu cihazdaki abonelik o an açık olan personele mi ait?
        // Toggle'ın rol/kimlik-farkında olması için: aynı endpoint başka personele
        // aitse (veya yoksa) subscribed=false döner.
        if (action === 'status') {
            if (typeof body.deviceId === 'string' && body.deviceId.trim()) {
                const { count } = await admin.from('push_subscriptions')
                    .select('id', { count: 'exact', head: true })
                    .eq('organization_id', orgId).eq('kind', 'expo')
                    .eq('device_id', body.deviceId.trim());
                return json({ subscribed: (count ?? 0) > 0 }, 200);
            }
            if (!body.endpoint) return json({ error: 'endpoint_required' }, 400);
            let q = admin.from('push_subscriptions')
                .select('id', { count: 'exact', head: true })
                .eq('organization_id', orgId)
                .eq('endpoint', body.endpoint);
            q = body.staffId ? q.eq('staff_id', body.staffId) : q.is('staff_id', null);
            const { count } = await q;
            return json({ subscribed: (count ?? 0) > 0 }, 200);
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
