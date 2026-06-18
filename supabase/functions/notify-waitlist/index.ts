import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

async function sendWhatsApp(baseUrl: string, apiKey: string, instance: string, phone: string, text: string): Promise<boolean> {
    try {
        const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', apikey: apiKey },
            body: JSON.stringify({ number: phone, text }),
        });
        return res.ok;
    } catch { return false; }
}

async function getSecret(supabase: any, key: string): Promise<string | null> {
    const env = Deno.env.get(key);
    if (env) return env;
    const { data } = await supabase.from('app_secrets').select('value').eq('key', key).maybeSingle();
    return data?.value ?? null;
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const { organization_id, service_id, date } = await req.json();
        if (!organization_id) return json({ error: 'organization_id gerekli' }, 400);

        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        // Org slug + settings (whatsapp)
        const [{ data: org }, { data: settings }] = await Promise.all([
            supabase.from('organizations').select('slug, name').eq('id', organization_id).maybeSingle(),
            supabase.from('settings').select('business_name, whatsapp_instance').eq('organization_id', organization_id).maybeSingle(),
        ]);
        if (!org?.slug) return json({ error: 'İşletme/slug bulunamadı' }, 404);

        const EVOLUTION_URL = (await getSecret(supabase, 'EVOLUTION_API_URL'));
        const EVOLUTION_KEY = (await getSecret(supabase, 'EVOLUTION_API_KEY'));
        const instance = settings?.whatsapp_instance;
        if (!EVOLUTION_URL || !EVOLUTION_KEY || !instance) {
            return json({ notified: 0, skipped: 'whatsapp yapılandırılmamış' });
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
            const ok = await sendWhatsApp(EVOLUTION_URL, EVOLUTION_KEY, instance, w.customer_phone, msg);
            if (ok) {
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
