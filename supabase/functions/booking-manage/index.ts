import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================
// booking-manage — Müşteri self-servis randevu yönetimi
// ------------------------------------------------------------
// Login GEREKTİRMEZ (--no-verify-jwt). Güvenlik, tahmin edilemez
// customer_token ile sağlanır. Müşteri randevusunu görüntüler,
// iptal eder veya yeniden planlar.
//
// Body: { action: 'get'|'slots'|'cancel'|'reschedule', token, ... }
// ============================================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const TZ_OFFSET_MIN = 3 * 60;

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function timeToMin(t: string): number { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); }
function minToTime(m: number): string { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
function weekdayOf(d: string): number { return new Date(d + 'T00:00:00Z').getUTCDay(); }
function overlaps(aS: number, aE: number, bS: number, bE: number) { return aS < bE && bS < aE; }

interface WH { day: number; start: string; end: string; isOff: boolean }

function computeSlots(opts: {
    orgHours: WH[]; staffHours: WH[] | null; weekday: number;
    serviceDuration: number; slotDuration: number;
    dayReservations: { start_time: string; end_time: string }[];
    isTimeOff: boolean; minStart: number;
}): number[] {
    if (opts.isTimeOff) return [];
    const org = opts.orgHours?.find(h => h.day === opts.weekday);
    if (!org || org.isOff) return [];
    const staff = (opts.staffHours ?? opts.orgHours)?.find(h => h.day === opts.weekday);
    if (!staff || staff.isOff) return [];
    const start = Math.max(timeToMin(org.start), timeToMin(staff.start));
    const end = Math.min(timeToMin(org.end), timeToMin(staff.end));
    const busy = opts.dayReservations.map(r => [timeToMin(r.start_time), timeToMin(r.end_time)] as [number, number]);
    const out: number[] = [];
    for (let s = start; s + opts.serviceDuration <= end; s += opts.slotDuration) {
        if (s < opts.minStart) continue;
        const e = s + opts.serviceDuration;
        if (busy.some(([bS, bE]) => overlaps(s, e, bS, bE))) continue;
        out.push(s);
    }
    return out;
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
        const body = await req.json();
        const action: string = body.action;
        const token: string = (body.token || '').trim();
        if (!action || !token) return json({ error: 'action ve token gerekli' }, 400);

        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        // Token → randevu
        const { data: res } = await supabase
            .from('reservations')
            .select('id, organization_id, customer_id, customer_name, customer_phone, date, start_time, end_time, service, service_color, status, staff_id')
            .eq('customer_token', token)
            .maybeSingle();
        if (!res) return json({ error: 'Randevu bulunamadı' }, 404);

        const orgId = res.organization_id as string;

        // Org + settings
        const [{ data: org }, { data: settings }] = await Promise.all([
            supabase.from('organizations').select('name').eq('id', orgId).maybeSingle(),
            supabase.from('settings').select('business_name, working_hours, slot_duration, whatsapp_instance').eq('organization_id', orgId).maybeSingle(),
        ]);
        const businessName = settings?.business_name || org?.name || 'İşletme';
        const orgHours: WH[] = settings?.working_hours || [];
        const slotDuration: number = settings?.slot_duration || 30;

        // Bugün TR + geçmiş mi
        const nowTR = new Date(Date.now() + TZ_OFFSET_MIN * 60_000);
        const todayTR = nowTR.toISOString().slice(0, 10);
        const isPast = res.date < todayTR;
        const canModify = (res.status === 'pending' || res.status === 'confirmed') && !isPast;

        // staff bilgisi
        let staffName: string | null = null;
        let staffHours: WH[] | null = null;
        if (res.staff_id) {
            const { data: st } = await supabase.from('staff').select('name, working_hours').eq('id', res.staff_id).maybeSingle();
            staffName = st?.name ?? null;
            staffHours = st?.working_hours ?? null;
        }

        // ── GET ──
        if (action === 'get') {
            return json({
                reservation: {
                    service: res.service, date: res.date,
                    time: (res.start_time || '').slice(0, 5), endTime: (res.end_time || '').slice(0, 5),
                    staffName, status: res.status,
                },
                business: { name: businessName },
                canModify,
            });
        }

        // ── CANCEL ──
        if (action === 'cancel') {
            if (!canModify) return json({ error: 'Bu randevu artık değiştirilemez' }, 409);
            await supabase.from('reservations').update({ status: 'cancelled' }).eq('id', res.id);

            // Boşluk doldurma: bekleyenlere "slot açıldı" bildirimi (fire-and-forget)
            const srk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-waitlist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${srk}`, apikey: srk },
                body: JSON.stringify({ organization_id: orgId, date: res.date }),
            }).catch(() => {});

            // İşletmeye bilgi (opsiyonel WhatsApp — settings instance + işletme telefonu yoksa atlanır)
            const EVOLUTION_URL = (await getSecret(supabase, 'EVOLUTION_API_URL'));
            const EVOLUTION_KEY = (await getSecret(supabase, 'EVOLUTION_API_KEY'));
            if (EVOLUTION_URL && EVOLUTION_KEY && settings?.whatsapp_instance) {
                const d = new Date(res.date + 'T00:00:00Z').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
                sendWhatsApp(EVOLUTION_URL, EVOLUTION_KEY, settings.whatsapp_instance, res.customer_phone,
                    `Randevunuz iptal edildi ❌\n\n${d} · ${(res.start_time || '').slice(0, 5)} · ${res.service}\n\nYeni randevu için bizimle iletişime geçebilirsiniz.`).catch(() => {});
            }
            return json({ success: true, status: 'cancelled' });
        }

        // ── SLOTS (yeniden planlama için) ──
        const serviceDuration = (() => {
            // randevu süresini mevcut start/end'den al (en güvenli)
            const dur = timeToMin((res.end_time || '').slice(0, 5)) - timeToMin((res.start_time || '').slice(0, 5));
            return dur > 0 ? dur : slotDuration;
        })();

        if (action === 'slots') {
            if (!canModify) return json({ slots: [] });
            const date: string = (body.date || '').trim();
            if (!date) return json({ error: 'date gerekli' }, 400);

            // İzin günü?
            const { data: timeOff } = await supabase.from('staff_time_off').select('id').eq('organization_id', orgId).eq('date', date).eq('staff_id', res.staff_id || '');
            // O günün rezervasyonları (bu randevu hariç, aynı personel)
            const { data: dayRes } = await supabase
                .from('reservations').select('id, start_time, end_time')
                .eq('organization_id', orgId).eq('date', date).eq('staff_id', res.staff_id || '').neq('status', 'cancelled');
            const others = (dayRes || []).filter(r => r.id !== res.id);

            const minStart = date === todayTR ? (nowTR.getUTCHours() * 60 + nowTR.getUTCMinutes()) : 0;
            const slots = computeSlots({
                orgHours, staffHours, weekday: weekdayOf(date), serviceDuration, slotDuration,
                dayReservations: others, isTimeOff: (timeOff || []).length > 0, minStart,
            });
            return json({ slots: slots.map(minToTime) });
        }

        // ── RESCHEDULE ──
        if (action === 'reschedule') {
            if (!canModify) return json({ error: 'Bu randevu artık değiştirilemez' }, 409);
            const date: string = (body.date || '').trim();
            const time: string = (body.time || '').trim();
            if (!date || !time) return json({ error: 'date ve time gerekli' }, 400);

            // Yeni slotun hâlâ müsait olduğunu doğrula
            const { data: timeOff } = await supabase.from('staff_time_off').select('id').eq('organization_id', orgId).eq('date', date).eq('staff_id', res.staff_id || '');
            const { data: dayRes } = await supabase
                .from('reservations').select('id, start_time, end_time')
                .eq('organization_id', orgId).eq('date', date).eq('staff_id', res.staff_id || '').neq('status', 'cancelled');
            const others = (dayRes || []).filter(r => r.id !== res.id);
            const minStart = date === todayTR ? (nowTR.getUTCHours() * 60 + nowTR.getUTCMinutes()) : 0;
            const available = computeSlots({
                orgHours, staffHours, weekday: weekdayOf(date), serviceDuration, slotDuration,
                dayReservations: others, isTimeOff: (timeOff || []).length > 0, minStart,
            }).map(minToTime);

            if (!available.includes(time)) return json({ error: 'Seçtiğiniz saat müsait değil. Lütfen başka bir saat seçin.' }, 409);

            const endTime = minToTime(timeToMin(time) + serviceDuration);
            await supabase.from('reservations').update({ date, start_time: time, end_time: endTime }).eq('id', res.id);

            const EVOLUTION_URL = (await getSecret(supabase, 'EVOLUTION_API_URL'));
            const EVOLUTION_KEY = (await getSecret(supabase, 'EVOLUTION_API_KEY'));
            if (EVOLUTION_URL && EVOLUTION_KEY && settings?.whatsapp_instance) {
                const d = new Date(date + 'T00:00:00Z').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' });
                sendWhatsApp(EVOLUTION_URL, EVOLUTION_KEY, settings.whatsapp_instance, res.customer_phone,
                    `Randevunuz güncellendi ✅\n\n🗓️ ${d}\n⏰ ${time}\n💼 ${res.service}\n\nGörüşmek üzere!`).catch(() => {});
            }
            return json({ success: true, date, time, endTime });
        }

        return json({ error: 'Geçersiz action' }, 400);
    } catch (err) {
        console.error('booking-manage error:', err);
        return json({ error: 'Sunucu hatası', detail: String(err) }, 500);
    }
});
