import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================
// public-booking — Self-servis online randevu motoru
// ------------------------------------------------------------
// Login GEREKTİRMEZ (--no-verify-jwt deploy edilir). Güvenlik
// yetki yerine slug → organization_id scope'u ile sağlanır.
// SERVICE_ROLE_KEY ile RLS bypass — yalnızca slug'a ait org'un
// public verisi ve o org'a randevu yazımı yapılır.
//
// Body: { action: 'profile' | 'slots' | 'book', slug, ... }
// ============================================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TZ_OFFSET_MIN = 3 * 60; // Türkiye UTC+3

// ─── Yardımcılar ─────────────────────────────────────────────
function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function timeToMin(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
}
function minToTime(m: number): string {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function weekdayOf(dateStr: string): number {
    return new Date(dateStr + 'T00:00:00Z').getUTCDay(); // 0=Pazar..6=Cmt
}
function overlaps(aS: number, aE: number, bS: number, bE: number): boolean {
    return aS < bE && bS < aE;
}

interface WH { day: number; start: string; end: string; isOff: boolean }

// Bir personelin belirli tarihteki müsait slot başlangıçlarını (dakika) döndürür
function staffSlots(opts: {
    orgHours: WH[];
    staffHours: WH[] | null;
    weekday: number;
    serviceDuration: number;
    slotDuration: number;
    dayReservations: { start_time: string; end_time: string }[];
    isTimeOff: boolean;
    minStart: number; // bugün için geçmiş saatleri ele (değilse 0)
}): number[] {
    if (opts.isTimeOff) return [];

    const org = opts.orgHours?.find(h => h.day === opts.weekday);
    if (!org || org.isOff) return []; // işletme kapalı

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
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            body: JSON.stringify({ number: phone, text }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

function buildBookingMessage(p: { customerName: string; date: string; time: string; service: string; businessName: string; confirmed: boolean; manageUrl?: string }): string {
    const d = new Date(p.date + 'T00:00:00Z').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' });
    const manage = p.manageUrl ? `\n\nRandevunuzu iptal etmek veya değiştirmek için:\n${p.manageUrl}` : '';
    if (p.confirmed) {
        return (
            `Merhaba ${p.customerName} 👋\n\n` +
            `*${p.businessName}* randevunuz oluşturuldu ✅\n\n` +
            `🗓️ ${d}\n⏰ ${p.time}\n💼 ${p.service}` +
            `\n\nSizi bekliyoruz!${manage}`
        );
    }
    return (
        `Merhaba ${p.customerName} 👋\n\n` +
        `*${p.businessName}* randevu talebiniz alındı 📝\n\n` +
        `🗓️ ${d}\n⏰ ${p.time}\n💼 ${p.service}` +
        `\n\nOnaylandığında size tekrar bilgi vereceğiz.${manage}`
    );
}

const APP_ORIGIN = 'https://timeflow.lueratech.com';

// ─── Servis ──────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const body = await req.json();
        const action: string = body.action;
        const slug: string = (body.slug || '').trim();
        if (!action || !slug) return json({ error: 'action ve slug gerekli' }, 400);

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        // Org çözümle
        const { data: org } = await supabase
            .from('organizations')
            .select('id, name, owner_id, bio, logo_url, cover_url, gallery_urls, address, public_phone, instagram_url, maps_url, booking_auto_confirm')
            .eq('slug', slug)
            .maybeSingle();

        if (!org) return json({ error: 'İşletme bulunamadı' }, 404);
        const orgId = org.id as string;

        // Settings (çalışma saatleri, slot, işletme adı, whatsapp)
        const { data: settings } = await supabase
            .from('settings')
            .select('business_name, working_hours, slot_duration, whatsapp_instance, webhook_url')
            .eq('organization_id', orgId)
            .maybeSingle();

        const orgHours: WH[] = settings?.working_hours || [];
        const slotDuration: number = settings?.slot_duration || 30;
        const businessName: string = settings?.business_name || org.name;

        // ─────────────────────────────────────────────────────
        // PROFILE
        // ─────────────────────────────────────────────────────
        if (action === 'profile') {
            const [{ data: services }, { data: staff }] = await Promise.all([
                supabase.from('services').select('id, name, duration, color, price').eq('organization_id', orgId).order('created_at'),
                supabase.from('staff').select('id, name, specialty, color').eq('organization_id', orgId).eq('is_active', true).order('created_at'),
            ]);

            return json({
                business: {
                    name: businessName,
                    bio: org.bio,
                    logoUrl: org.logo_url,
                    coverUrl: org.cover_url,
                    galleryUrls: org.gallery_urls || [],
                    address: org.address,
                    phone: org.public_phone,
                    instagramUrl: org.instagram_url,
                    mapsUrl: org.maps_url,
                    workingHours: orgHours,
                },
                services: (services || []).map(s => ({ id: s.id, name: s.name, duration: s.duration, color: s.color, price: s.price ? Number(s.price) : null })),
                staff: (staff || []).map(s => ({ id: s.id, name: s.name, specialty: s.specialty, color: s.color })),
            });
        }

        // ─────────────────────────────────────────────────────
        // Ortak: slots & book için müsaitlik hesabı
        // ─────────────────────────────────────────────────────
        const date: string = (body.date || '').trim();
        const serviceId: string = (body.serviceId || '').trim();
        const reqStaffId: string = (body.staffId || 'any').trim(); // 'any' | uuid

        if ((action === 'slots' || action === 'book') && (!date || !serviceId)) {
            return json({ error: 'date ve serviceId gerekli' }, 400);
        }

        // Servis süresi
        const { data: svc } = await supabase
            .from('services').select('id, name, duration, color, price').eq('id', serviceId).eq('organization_id', orgId).maybeSingle();
        if (!svc) return json({ error: 'Hizmet bulunamadı' }, 404);
        const serviceDuration: number = svc.duration || 30;

        // Aktif personel
        const { data: allStaff } = await supabase
            .from('staff').select('id, name, working_hours').eq('organization_id', orgId).eq('is_active', true);
        let candidates = (allStaff || []);
        if (reqStaffId !== 'any') candidates = candidates.filter(s => s.id === reqStaffId);

        // O günün rezervasyonları (iptal hariç)
        const { data: dayRes } = await supabase
            .from('reservations')
            .select('staff_id, start_time, end_time')
            .eq('organization_id', orgId)
            .eq('date', date)
            .neq('status', 'cancelled');

        // O günün izinli personelleri
        const { data: timeOffRows } = await supabase
            .from('staff_time_off').select('staff_id').eq('organization_id', orgId).eq('date', date);
        const timeOffSet = new Set((timeOffRows || []).map(t => t.staff_id));

        const weekday = weekdayOf(date);

        // Bugün ise geçmiş saatleri ele
        const nowTR = new Date(Date.now() + TZ_OFFSET_MIN * 60_000);
        const todayTR = nowTR.toISOString().slice(0, 10);
        const minStart = date === todayTR ? (nowTR.getUTCHours() * 60 + nowTR.getUTCMinutes()) : 0;

        // Her personel için müsait slotlar; zaman → o saatte boş ilk personel
        const slotStaff = new Map<number, string>();
        for (const st of candidates) {
            const resForStaff = (dayRes || []).filter(r => r.staff_id === st.id);
            const slots = staffSlots({
                orgHours, staffHours: st.working_hours || null, weekday,
                serviceDuration, slotDuration, dayReservations: resForStaff,
                isTimeOff: timeOffSet.has(st.id), minStart,
            });
            for (const s of slots) if (!slotStaff.has(s)) slotStaff.set(s, st.id);
        }

        const availableMins = [...slotStaff.keys()].sort((a, b) => a - b);

        // ─────────────────────────────────────────────────────
        // SLOTS
        // ─────────────────────────────────────────────────────
        if (action === 'slots') {
            return json({ slots: availableMins.map(minToTime) });
        }

        // ─────────────────────────────────────────────────────
        // BOOK
        // ─────────────────────────────────────────────────────
        const time: string = (body.time || '').trim();          // "HH:MM"
        const customerName: string = (body.customerName || '').trim();
        const customerPhone: string = (body.customerPhone || '').trim();
        const customerEmail: string = (body.customerEmail || '').trim();
        const note: string = (body.note || '').trim();

        if (!time || !customerName || !customerPhone) {
            return json({ error: 'time, ad ve telefon gerekli' }, 400);
        }

        const startMin = timeToMin(time);
        const chosenStaffId = slotStaff.get(startMin);
        if (chosenStaffId === undefined) {
            return json({ error: 'Seçtiğiniz saat artık müsait değil. Lütfen başka bir saat seçin.' }, 409);
        }
        const endTime = minToTime(startMin + serviceDuration);
        const autoConfirm: boolean = !!org.booking_auto_confirm;
        const ownerId = org.owner_id as string;

        // Müşteri bul / oluştur (telefon bazlı, org içi)
        let customerId: string | null = null;
        const { data: existing } = await supabase
            .from('customers').select('id').eq('organization_id', orgId).eq('phone', customerPhone).maybeSingle();
        if (existing) {
            customerId = existing.id;
        } else {
            const { data: created } = await supabase
                .from('customers')
                .insert({ user_id: ownerId, organization_id: orgId, name: customerName, phone: customerPhone, email: customerEmail || null })
                .select('id').single();
            customerId = created?.id ?? null;
        }

        // Rezervasyon oluştur
        const { data: reservation, error: resErr } = await supabase
            .from('reservations')
            .insert({
                user_id: ownerId,
                organization_id: orgId,
                customer_id: customerId,
                customer_name: customerName,
                customer_phone: customerPhone,
                customer_email: customerEmail || null,
                date,
                start_time: time,
                end_time: endTime,
                service: svc.name,
                service_color: svc.color || '#FF5A1F',
                status: autoConfirm ? 'confirmed' : 'pending',
                notes: note || '',
                staff_id: chosenStaffId,
                source: 'booking',
            })
            .select()
            .single();

        if (resErr || !reservation) {
            console.error('booking insert error', resErr);
            return json({ error: 'Randevu oluşturulamadı' }, 500);
        }

        // LeadFlow / webhook (fire-and-forget) — settings.webhook_url
        const webhookUrl = settings?.webhook_url;
        if (webhookUrl) {
            fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'reservation.created',
                    source: 'timeflow',
                    timestamp: new Date().toISOString(),
                    data: {
                        id: reservation.id,
                        customer_name: customerName,
                        customer_phone: customerPhone,
                        customer_email: customerEmail || null,
                        date, start_time: time, end_time: endTime,
                        service: svc.name, status: reservation.status,
                        notes: note || '', source: 'booking',
                    },
                }),
            }).catch(e => console.error('webhook error', e));
        }

        // WhatsApp onay mesajı
        const EVOLUTION_URL = Deno.env.get('EVOLUTION_API_URL');
        const EVOLUTION_KEY = Deno.env.get('EVOLUTION_API_KEY');
        if (EVOLUTION_URL && EVOLUTION_KEY && settings?.whatsapp_instance) {
            const manageUrl = reservation.customer_token ? `${APP_ORIGIN}/booking/${reservation.customer_token}` : undefined;
            const msg = buildBookingMessage({ customerName, date, time, service: svc.name, businessName, confirmed: autoConfirm, manageUrl });
            sendWhatsApp(EVOLUTION_URL, EVOLUTION_KEY, settings.whatsapp_instance, customerPhone, msg).catch(() => {});
        }

        return json({
            success: true,
            reservationId: reservation.id,
            status: reservation.status,
            date, time, endTime,
            service: svc.name,
        });
    } catch (err) {
        console.error('public-booking error:', err);
        return json({ error: 'Sunucu hatası', detail: String(err) }, 500);
    }
});
