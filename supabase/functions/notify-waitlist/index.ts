import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getOrgWa, sendWA } from '../_shared/wa.ts';
import { identify, deny } from '../_shared/auth.ts';

// ============================================================
// notify-waitlist — Boşluk Doldurma
// ------------------------------------------------------------
// Bir randevu iptal olunca çağrılır. Eşleşen bekleyen
// müşterilere "slot açıldı" + booking linki WhatsApp'tan gider.
// Eşleşme: aynı org + status='waiting' + (hizmet null|eşit) +
// (tercih tarihi null|eşit). İlk 10 bekleyen bilgilendirilir.
//
// Body: { organization_id, service_id?, date? }
// service_role ile çağrılır (booking-manage / panel).
// ============================================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const APP_ORIGIN = 'https://timeflow.lueratech.com';

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const { organization_id, service_id, date } = await req.json();
        if (!organization_id) return json({ error: 'organization_id gerekli' }, 400);

        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        // İki meşru çağıran var: panel (kullanıcı oturumu) ve booking-manage
        // (service_role, randevu iptalinde). Önceden hiçbir kontrol yoktu —
        // org id'yi bilen herkes o işletmenin bekleme listesine mesaj attırabiliyordu.
        const caller = await identify(supabase, req);
        if (caller.kind === 'none') return deny(401, 'Yetkisiz', corsHeaders);
        if (caller.kind === 'user' && caller.orgId !== organization_id) {
            return deny(403, 'Bu işletme için yetkiniz yok', corsHeaders);
        }

        // Org slug + işletme adı. settings kullanıcı başına tek satır olduğu
        // için limit(1) ile tek satır alıyoruz; bağlantı bilgisi org_whatsapp'ta.
        const [{ data: org }, { data: settings }] = await Promise.all([
            supabase.from('organizations').select('slug, name').eq('id', organization_id).maybeSingle(),
            supabase.from('settings').select('business_name').eq('organization_id', organization_id).limit(1).maybeSingle(),
        ]);
        if (!org?.slug) return json({ error: 'İşletme/slug bulunamadı' }, 404);

        const orgWa = await getOrgWa(supabase, organization_id);
        if (!orgWa?.instance || orgWa.status !== 'connected') {
            return json({ notified: 0, skipped: 'whatsapp bağlı değil' });
        }
        const businessName = settings?.business_name || org.name || 'İşletme';
        const bookingUrl = `${APP_ORIGIN}/book/${org.slug}`;

        // Eşleşen bekleyenler
        let q = supabase.from('waitlist')
            .select('id, customer_name, customer_phone, service_id, preferred_date')
            .eq('organization_id', organization_id)
            .eq('status', 'waiting')
            .order('created_at')
            .limit(10);
        const { data: waiting } = await q;

        const matches = (waiting || []).filter(w =>
            (!service_id || !w.service_id || w.service_id === service_id) &&
            (!date || !w.preferred_date || w.preferred_date === date)
        );

        let notified = 0;
        for (const w of matches) {
            const first = (w.customer_name || '').split(' ')[0];
            const msg =
                `Merhaba ${first} 👋\n\n` +
                `*${businessName}*'da bir randevu yeri açıldı! 🎉\n\n` +
                `Hemen randevunu oluşturmak için:\n${bookingUrl}\n\n` +
                `Yerler sınırlı, ilk gelen alır ⏳`;
            const res = await sendWA(supabase, {
                org: orgWa, phone: w.customer_phone, text: msg, kind: 'waitlist',
            });
            if (res.ok) {
                await supabase.from('waitlist').update({ status: 'notified', notified_at: new Date().toISOString() }).eq('id', w.id);
                notified++;
            }
        }

        return json({ notified, matched: matches.length });
    } catch (err) {
        console.error('notify-waitlist error:', err);
        return json({ error: 'Sunucu hatası', detail: String(err) }, 500);
    }
});
