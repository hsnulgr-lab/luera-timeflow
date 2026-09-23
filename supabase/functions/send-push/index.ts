import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-push-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Push gönderimi — İKİ KANAL (yalnızca sunucu tarafı: DB trigger / remind çağırır).
 *
 *   kind='web'   tarayıcı ve PWA. Web Push (VAPID). 037'den beri çalışıyor.
 *   kind='expo'  native iOS/Android uygulaması. Expo Push API. 103 ile geldi.
 *
 * Çağıranlar (tetikleyiciler, `remind`, `_shared/notify.ts`) BU DEĞİŞİKLİKTEN
 * ETKİLENMEDİ: gövde sözleşmesi, `x-push-secret` doğrulaması ve
 * `{sent, pruned, total}` yanıtı aynen duruyor. Hedef seçimi de aynı yerde
 * kaldı — iki kanal için iki ayrı hedefleme mantığı yazmak, ikisinden birinin
 * bir gün ötekinden ayrışması demekti.
 *
 * Güvenlik: JWT YOK; çağıran x-push-secret header'ıyla doğrulanır
 * (app_secrets.PUSH_TRIGGER_SECRET). Deploy: --no-verify-jwt (supabase/config.toml).
 *
 * Body: {
 *   organization_id: string,
 *   target: { staffId: string } | { role: 'manager' },
 *   payload: { title, body, url?, tag? },
 *   pref?: 'booked' | 'cancelled' | 'cash'   // yalnız MÜDÜR olaylarında (106)
 * }
 */

/** Expo'nun gönderim ucu. `expo.host` DEĞİL — yanlış host DNS'te ölür ve yutulur. */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo tek istekte en çok bu kadar mesaj alıyor. */
const EXPO_CHUNK = 100;

interface Sub {
    id: string;
    kind: string;
    endpoint: string;
    p256dh: string | null;
    auth: string | null;
}

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

        const { organization_id, target, payload, pref } = await req.json();
        if (!organization_id || !target || !payload) return json({ error: 'invalid_body' }, 400);

        /*
         * TERCİH KAPISI (105/106) — yalnız MÜDÜR olaylarında.
         *
         * Tetikleyici müdür hedefli çağrılara `pref` koyuyor ('booked' |
         * 'cancelled' | 'cash'); personel olayları taşımıyor, yani personel
         * kanalının davranışı hiç değişmiyor.
         *
         * FAIL-OPEN: tercih okunamazsa ya da anahtar yoksa GÖNDERİLİR.
         * `managerWrite.writesPaused` ile aynı kural — bir ağ ya da şema
         * boşluğunun bütün salonu sessize alması, birkaç fazla bildirimden
         * kötü. Yokluk "kapalı" demek değil.
         */
        if (typeof pref === 'string' && pref) {
            const prefs = await readOrgPrefs(admin, organization_id);
            if (prefs && prefs[pref] === false) {
                console.log(`push org=${organization_id} pref=${pref} atlandı`);
                return json({ sent: 0, note: 'pref_off' }, 200);
            }
        }

        // Hedef abonelikleri seç
        let q = admin.from('push_subscriptions')
            .select('id, kind, endpoint, p256dh, auth')
            .eq('organization_id', organization_id);
        if (target.staffId) q = q.eq('staff_id', target.staffId);
        else if (target.role === 'manager') q = q.eq('role', 'manager');
        else return json({ error: 'invalid_target' }, 400);

        const { data: subs, error: subsErr } = await q;
        /*
         * OKUNAMADI ile ABONE YOK AYNI ŞEY DEĞİL.
         *
         * Eskiden `error` hiç okunmuyordu: sorgu patlasa (kolon yok, RLS,
         * bağlantı) `subs` null gelir ve fonksiyon 200 + "abone yok" dönerdi.
         * Yani şema ile fonksiyonun sırası bir kez ters gitse bütün salon
         * sessizce bildirimsiz kalır ve HİÇBİR YERDE İZ OLMAZDI. Gönderemediğini
         * söylememek, gönderememekten kötü.
         */
        if (subsErr) {
            console.error('push abonelik okunamadı', subsErr);
            return json({ error: 'lookup_failed' }, 500);
        }
        if (!subs || subs.length === 0) return json({ sent: 0, note: 'no_subscribers' }, 200);

        const rows = subs as Sub[];
        const web = rows.filter((s) => s.kind !== 'expo');
        const expo = rows.filter((s) => s.kind === 'expo');
        /** Ölü abonelikler — iki kanal da aynı listeye yazıyor, tek silme. */
        const dead: string[] = [];
        let webSent = 0;
        let expoSent = 0;

        // ── Web Push (VAPID) ────────────────────────────────────────────────
        if (web.length > 0) {
            /*
             * VAPID kapısı BURADA — fonksiyonun başında değil.
             *
             * Başta olduğu sürece, VAPID'i olmayan bir kurulumda hedefte tek bir
             * web abonesi bile yokken Expo bildirimleri de ölüyordu. Eksik olan
             * yapılandırma yalnız kendi kanalını durdurmalı.
             */
            const publicKey = await getSecret(admin, 'VAPID_PUBLIC_KEY');
            const privateKey = await getSecret(admin, 'VAPID_PRIVATE_KEY');
            const subject = (await getSecret(admin, 'VAPID_SUBJECT')) || 'mailto:destek@lueratech.com';
            if (!publicKey || !privateKey) {
                console.error('web push yapılandırılmamış — VAPID anahtarı yok');
            } else {
                webpush.setVapidDetails(subject, publicKey, privateKey);
                const msg = JSON.stringify(payload);
                await Promise.all(web.map(async (s) => {
                    try {
                        await webpush.sendNotification(
                            { endpoint: s.endpoint, keys: { p256dh: s.p256dh!, auth: s.auth! } },
                            msg,
                        );
                        webSent++;
                    } catch (err: any) {
                        const code = err?.statusCode;
                        // 404/410 → abonelik ölmüş, temizle
                        if (code === 404 || code === 410) dead.push(s.endpoint);
                        else console.error('push send hata', code, err?.body || String(err));
                    }
                }));
            }
        }

        // ── Expo Push ───────────────────────────────────────────────────────
        if (expo.length > 0) {
            // Expo hesabında "push security" açıksa zorunlu; kapalıysa hiç yazılmaz.
            const accessToken = await getSecret(admin, 'EXPO_ACCESS_TOKEN');
            for (let i = 0; i < expo.length; i += EXPO_CHUNK) {
                const chunk = expo.slice(i, i + EXPO_CHUNK);
                /*
                 * `tag` ALANI EXPO'DA YOK. Web Push'ta aynı etiketli ikinci
                 * bildirim birincinin YERİNE geçiyordu; burada geçmeyecek ve bir
                 * randevu üç kez ertelenirse kilit ekranında üç satır birikir.
                 * Bilinen ve kabul edilen fark. Etiket yine de `data`da taşınıyor:
                 * istemci ileride kendisi çökertmek isterse elinde olsun.
                 */
                const messages = chunk.map((s) => ({
                    to: s.endpoint,
                    title: payload.title,
                    body: payload.body,
                    data: { url: payload.url ?? null, tag: payload.tag ?? null },
                    sound: 'default',
                    priority: 'high',
                    channelId: 'randevu',
                }));
                try {
                    const res = await fetch(EXPO_PUSH_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                        },
                        body: JSON.stringify(messages),
                    });
                    const out = await res.json().catch(() => null) as
                        { data?: unknown[]; errors?: unknown[] } | null;
                    if (!res.ok || !Array.isArray(out?.data)) {
                        // İstek tümden reddedildi: hiçbir satır SİLİNMEZ.
                        console.error('expo push reddetti', res.status, JSON.stringify(out?.errors ?? out));
                        continue;
                    }
                    // Biletler `to` dizisiyle AYNI SIRADA geliyor.
                    out.data.forEach((raw, index) => {
                        const ticket = raw as { status?: string; message?: string; details?: { error?: string } };
                        const sub = chunk[index];
                        if (!sub) return;
                        if (ticket.status === 'ok') { expoSent++; return; }
                        const reason = ticket.details?.error ?? '';
                        if (reason === 'DeviceNotRegistered') {
                            // Uygulama silindi ya da izin geri alındı — TEK meşru budama sebebi.
                            dead.push(sub.endpoint);
                            return;
                        }
                        /*
                         * ÖTEKİ HATALAR SATIR SİLDİRMEZ.
                         *
                         * `MismatchSenderId` ve `InvalidCredentials` sunucu tarafı
                         * yapılandırma arızası — cihazın suçu değil. Bunları budama
                         * listesine koymak, tek bir yanlış anahtarın salonun BÜTÜN
                         * aboneliklerini silmesi demekti.
                         */
                        console.error('expo bilet hatası', reason || ticket.message, sub.id);
                    });
                } catch (err) {
                    console.error('expo push gönderilemedi', String(err));
                }
            }
        }

        if (dead.length) {
            await admin.from('push_subscriptions').delete().in('endpoint', dead);
        }

        const sent = webSent + expoSent;
        // Tek satırlık iz: "gitmedi"nin sebebini sonradan aramak zorunda kalmayalım.
        console.log(`push org=${organization_id} target=${target.staffId ? 'staff' : 'manager'}`
            + ` web=${web.length}/${webSent} expo=${expo.length}/${expoSent} pruned=${dead.length}`);

        return json({
            // Eski alanlar AYNEN — çağıranlar bunları okuyor.
            sent, pruned: dead.length, total: rows.length,
            web: { total: web.length, sent: webSent },
            expo: { total: expo.length, sent: expoSent },
        }, 200);
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

/**
 * Org sahibinin bildirim tercihleri.
 *
 * Bir org'un `settings` tablosunda birden çok satırı olabiliyor; doğru satır
 * SAHİBİNKİ. `fetchOrgSettings` (telefon) ve `staff-api` de aynı satırı
 * okuyor — üç yerde üç farklı satır okunsaydı müdürün kapattığı bir anahtar
 * sunucuda açık kalırdı.
 *
 * Sahibin satırı yoksa en eskiye düşülüyor: yanlış olabilir ama KARARLI ve
 * öteki iki okuyucuyla aynı kararlı.
 *
 * Okunamazsa `null` — çağıran taraf bunu "gönder" diye yorumluyor.
 */
async function readOrgPrefs(
    admin: any,
    organizationId: string,
): Promise<Record<string, unknown> | null> {
    try {
        const { data: org } = await admin
            .from('organizations').select('owner_id').eq('id', organizationId).maybeSingle();
        const ownerId = org?.owner_id;
        if (ownerId) {
            const { data } = await admin.from('settings').select('notification_prefs')
                .eq('organization_id', organizationId).eq('user_id', ownerId).maybeSingle();
            if (data?.notification_prefs) return data.notification_prefs as Record<string, unknown>;
        }
        const { data } = await admin.from('settings').select('notification_prefs')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: true }).limit(1).maybeSingle();
        return (data?.notification_prefs as Record<string, unknown> | undefined) ?? null;
    } catch (err) {
        // Tercihi okuyamadık: susmaktansa gönderiyoruz.
        console.error('bildirim tercihi okunamadı', String(err));
        return null;
    }
}
