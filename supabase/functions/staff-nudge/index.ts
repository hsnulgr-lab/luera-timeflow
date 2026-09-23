import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { deny, identify } from '../_shared/auth.ts';
import { getSecret } from '../_shared/wa.ts';

/**
 * Müdürden personele KASITLI bildirim — "Personele söyle" düğmesinin kanalı.
 *
 * ── Neden ayrı bir uç ───────────────────────────────────────────────────────
 * `send-push` yalnız `x-push-secret` ile açılıyor ve o sır tetikleyicilerde
 * duruyor; müdürün telefonuna verilemez. Bu uç arada durur: müdürün Supabase
 * oturumunu doğrular, randevunun GERÇEKTEN onun salonuna ait olduğunu
 * doğrular, metni VERİTABANINDAN kurar ve `send-push`'a devreder.
 *
 * ── Otomatik bildirimden farkı ──────────────────────────────────────────────
 * Personel zaten olay anında bildirim alıyor (atama, müşteri geldi, iptal,
 * saat değişti — 106). Bu uç YENİ BİR OLAY DUYURMUYOR: müdür, personelin
 * KAÇIRDIĞINI düşündüğü bir kartı kasten yeniden gönderiyor. Telefon cepte,
 * sessizde, kabinde olabilir.
 *
 * Bu yüzden başlık `Müdür:` ile başlıyor. Öneki olmasa personel aynı haberi
 * ikinci kez görüp "niye tekrar geldi" derdi; önekle bunun bir tekrar değil
 * bir ÇAĞRI olduğunu anlıyor.
 *
 * ── Hata YUTULMUYOR ─────────────────────────────────────────────────────────
 * `_shared/notify.ts` bildirimi fire-and-forget gönderir ve haklıdır: orada
 * bildirim, olmuş bir randevunun yan ürünü. Burada bildirim İŞİN KENDİSİ.
 * Müdür düğmeye bastı ve ekranda bir damga belirecek; gönderim düştüyse o
 * damga yalan olur. Sonuç olduğu gibi dönüyor, ekran ona göre yazıyor.
 *
 * Body: { reservationId: string, kind: FlowKind }
 * Yanıt: { sent: number } | { error: string } | { sent: 0, note: 'no_staff' }
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Kart türü → personelin göreceği başlık.
 *
 * Beşinde kartın DURUMU yazılı: personel telefona bakınca ne olduğunu anlıyor
 * ve uygulamayı açmasına gerek kalmıyor — düğmenin bütün amacı bu.
 *
 * Dördünde (`started`, `finished`, `due`, `paid`) söylenecek yeni bir şey yok:
 * personel ya müşterinin yanında ya da işi bitmiş, adisyon da müdürün işi.
 * Orada tek DOĞRU cümle "müdür seni istiyor"; kartın durumunu tekrar etmek
 * personelin zaten bildiği bir şeyi haber gibi sunmak olurdu.
 */
const TITLES: Record<string, string> = {
    next: 'Müdür: Müşterin geliyor',
    arrived: 'Müdür: Müşterin bekliyor',
    booked: 'Müdür: Yeni randevun var',
    cancelled: 'Müdür: Randevun iptal oldu',
    noshow: 'Müdür: Müşteri gelmedi',
    started: 'Müdür: Seni çağırıyor',
    finished: 'Müdür: Seni çağırıyor',
    due: 'Müdür: Seni çağırıyor',
    paid: 'Müdür: Seni çağırıyor',
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    try {
        const admin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        // Kimlik jetondan çözülür; gövdedeki hiçbir alana güvenilmez.
        const caller = await identify(admin, req);
        if (caller.kind !== 'user') return deny(401, 'manager_session_required', corsHeaders);

        const { reservationId, kind } = await req.json().catch(() => ({}));
        if (typeof reservationId !== 'string' || !reservationId) {
            return json({ error: 'invalid_body' }, 400);
        }
        const title = TITLES[typeof kind === 'string' ? kind : ''];
        if (!title) return json({ error: 'unknown_kind' }, 400);

        const { data: res, error: resErr } = await admin
            .from('reservations')
            .select('id, organization_id, staff_id, customer_name, service, start_time, customer_arrived_at')
            .eq('id', reservationId)
            .maybeSingle();

        if (resErr) {
            console.error('nudge randevu okunamadı', resErr);
            return json({ error: 'lookup_failed' }, 500);
        }
        /*
         * Salon kontrolü. Randevu başka bir salona aitse 404 dönüyoruz, 403
         * değil: 403 "böyle bir randevu VAR ama senin değil" demektir ve
         * başka salonların kimliklerini yoklamaya izin verirdi.
         */
        if (!res || res.organization_id !== caller.orgId) return json({ error: 'not_found' }, 404);

        // Personeli olmayan randevu: gönderilecek kimse yok. Ekran bunu
        // "gönderildi" diye göstermemeli, o yüzden ayrı bir not dönüyor.
        if (!res.staff_id) return json({ sent: 0, note: 'no_staff' }, 200);

        const secret = await getSecret(admin, 'PUSH_TRIGGER_SECRET');
        const baseUrl = Deno.env.get('SUPABASE_URL');
        if (!secret || !baseUrl) {
            console.error('nudge gönderilemedi — PUSH_TRIGGER_SECRET yok');
            return json({ error: 'push_not_configured' }, 500);
        }

        const sent = await fetch(`${baseUrl}/functions/v1/send-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-push-secret': secret },
            body: JSON.stringify({
                organization_id: res.organization_id,
                // Personel hedefi `pref` TAŞIMAZ (106): tercih kapısı yalnız
                // müdür olaylarında çalışır, personel kendi gününe karşı
                // körleştirilmez.
                target: { staffId: res.staff_id },
                payload: {
                    title,
                    body: bodyOf(res),
                    url: '/personel',
                    tag: `nudge-${res.id}`,
                },
            }),
        });

        const out = await sent.json().catch(() => null);
        if (!sent.ok) {
            console.error('nudge send-push reddetti', sent.status, JSON.stringify(out));
            return json({ error: 'send_failed' }, 502);
        }

        console.log(`nudge org=${res.organization_id} staff=${res.staff_id} sent=${out?.sent ?? 0}`);
        return json({ sent: Number(out?.sent ?? 0) }, 200);
    } catch (err) {
        console.error('staff-nudge error:', err);
        return json({ error: 'internal' }, 500);
    }
});

/**
 * Gövde — kim, ne, ne zaman. HEPSİ VERİTABANINDAN; telefon yalnız hangi
 * randevu olduğunu ve kartın türünü söylüyor.
 *
 * 104'ün kuralı burada da geçerli: YALNIZ İLK AD. Salonda telefon tezgâhta
 * duruyor ve kilit ekranı herkese açık.
 *
 * Müşteri beklemeye başlamışsa dakika, hizmet adından daha değerli: personelin
 * karar vermesi gereken şey "ne kadar gecikti".
 */
function bodyOf(res: {
    customer_name: string | null;
    service: string | null;
    start_time: string | null;
    customer_arrived_at: string | null;
}): string {
    const who = (res.customer_name || '').trim().split(' ')[0] || 'Müşteri';

    if (res.customer_arrived_at) {
        const waited = Math.floor((Date.now() - Date.parse(res.customer_arrived_at)) / 60_000);
        if (Number.isFinite(waited) && waited >= 1) return `${who} · ${waited} dakikadır bekliyor`;
    }

    const parts = [who];
    if (res.service) parts.push(res.service);
    // `start_time` time-of-day; saniyeyi atıp HH:MM bırakıyoruz.
    if (res.start_time) parts.push(String(res.start_time).slice(0, 5));
    return parts.join(' · ');
}

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
