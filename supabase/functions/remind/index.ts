import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Turkey UTC+3
const TZ_OFFSET_MIN = 3 * 60;

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const EVOLUTION_URL = Deno.env.get('EVOLUTION_API_URL')!;
        const EVOLUTION_KEY = Deno.env.get('EVOLUTION_API_KEY')!;

        // Türkiye saatine göre şimdiki zaman
        const nowUtc = new Date();
        const nowTR  = new Date(nowUtc.getTime() + TZ_OFFSET_MIN * 60_000);

        const todayStr    = datePart(nowTR);
        const tomorrowStr = datePart(new Date(nowTR.getTime() + 86_400_000));
        const nowMin      = nowTR.getHours() * 60 + nowTR.getMinutes();

        // 2h penceresi: şu andan 90-150 dakika arasındaki randevular
        const window2hStart = nowMin + 90;
        const window2hEnd   = nowMin + 150;

        let sent24h = 0;
        let sent2h  = 0;
        const errors: string[] = [];

        // Tüm organizasyonların WhatsApp ayarlarını çek
        const { data: settingsList } = await supabase
            .from('settings')
            .select('organization_id, whatsapp_instance, business_name')
            .not('whatsapp_instance', 'is', null);

        for (const org of settingsList ?? []) {
            const { organization_id, whatsapp_instance, business_name } = org;
            if (!whatsapp_instance) continue;

            // ── 24h Hatırlatma ───────────────────────────────────────────────
            const { data: list24h } = await supabase
                .from('reservations')
                .select('id, customer_name, customer_phone, start_time, service')
                .eq('organization_id', organization_id)
                .eq('date', tomorrowStr)
                .eq('reminder_24h_sent', false)
                .neq('status', 'cancelled');

            for (const r of list24h ?? []) {
                const msg = build24hMessage({
                    customerName: r.customer_name,
                    startTime:    r.start_time.slice(0, 5),
                    service:      r.service,
                    businessName: business_name,
                });
                const ok = await sendWhatsApp(EVOLUTION_URL, EVOLUTION_KEY, whatsapp_instance, r.customer_phone, msg);
                if (ok) {
                    await supabase.from('reservations').update({ reminder_24h_sent: true }).eq('id', r.id);
                    sent24h++;
                } else {
                    errors.push(`24h:${r.id}`);
                }
            }

            // ── 2h Hatırlatma ────────────────────────────────────────────────
            const { data: list2h } = await supabase
                .from('reservations')
                .select('id, customer_name, customer_phone, start_time, service')
                .eq('organization_id', organization_id)
                .eq('date', todayStr)
                .eq('reminder_2h_sent', false)
                .neq('status', 'cancelled');

            for (const r of list2h ?? []) {
                if (!r.start_time) continue;
                const [h, m] = r.start_time.split(':').map(Number);
                const resMin = h * 60 + m;
                if (resMin < window2hStart || resMin > window2hEnd) continue;

                const msg = build2hMessage({
                    customerName: r.customer_name,
                    startTime:    r.start_time.slice(0, 5),
                    service:      r.service,
                    businessName: business_name,
                });
                const ok = await sendWhatsApp(EVOLUTION_URL, EVOLUTION_KEY, whatsapp_instance, r.customer_phone, msg);
                if (ok) {
                    await supabase.from('reservations').update({ reminder_2h_sent: true }).eq('id', r.id);
                    sent2h++;
                } else {
                    errors.push(`2h:${r.id}`);
                }
            }
        }

        console.log(`Remind: 24h=${sent24h} 2h=${sent2h} errors=${errors.length}`);
        return new Response(
            JSON.stringify({ success: true, sent24h, sent2h, errors }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    } catch (err) {
        console.error('Remind error:', err);
        return new Response(
            JSON.stringify({ error: 'Sunucu hatası', detail: String(err) }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }
});

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function datePart(d: Date): string {
    return d.toISOString().slice(0, 10);
}

async function sendWhatsApp(
    baseUrl: string,
    apiKey: string,
    instance: string,
    phone: string,
    text: string,
): Promise<boolean> {
    try {
        const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            body: JSON.stringify({ number: phone, text }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

function build24hMessage(p: { customerName: string; startTime: string; service: string; businessName: string }): string {
    return (
        `Merhaba ${p.customerName} 👋\n\n` +
        `*${p.businessName}*'daki ${p.service} randevunuzu hatırlatmak istedik.\n\n` +
        `📅 Yarın saat *${p.startTime}*\n\n` +
        `Görüşmek üzere! 🗓️`
    );
}

function build2hMessage(p: { customerName: string; startTime: string; service: string; businessName: string }): string {
    return (
        `Merhaba ${p.customerName} 👋\n\n` +
        `Bugün saat *${p.startTime}*'deki *${p.service}* randevunuz 2 saat sonra.\n\n` +
        `📍 ${p.businessName}\n\n` +
        `Görüşmek üzere! ✅`
    );
}
