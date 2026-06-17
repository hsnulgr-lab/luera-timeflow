import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================
// whatsapp-booking — WhatsApp üzerinden AI ile randevu
// ------------------------------------------------------------
// Evolution API gelen mesaj webhook'u buraya POST eder.
// Gemini niyeti ANLAR (hizmet/tarih/saat), randevuyu KODUMUZ
// oluşturur (slot kontrolü + çakışma + kayıt). AI yanlış anlasa
// bile geçersiz randevu oluşmaz.
//
// Çok turlu: whatsapp_sessions tablosunda toplanan bilgi tutulur.
// ============================================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const TZ_OFFSET_MIN = 3 * 60;
const APP_ORIGIN = 'https://timeflow.lueratech.com';
const SESSION_TTL_MIN = 120; // 2 saat sessizlikten sonra konuşma sıfırlanır

function ok(body: unknown = { ok: true }) {
    return new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function timeToMin(t: string): number { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); }
function minToTime(m: number): string { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
function weekdayOf(d: string): number { return new Date(d + 'T00:00:00Z').getUTCDay(); }
function overlaps(aS: number, aE: number, bS: number, bE: number) { return aS < bE && bS < aE; }
function fmtDate(d: string) { return new Date(d + 'T00:00:00Z').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); }

interface WH { day: number; start: string; end: string; isOff: boolean }

function staffSlots(opts: {
    orgHours: WH[]; staffHours: WH[] | null; weekday: number; serviceDuration: number; slotDuration: number;
    dayReservations: { start_time: string; end_time: string }[]; isTimeOff: boolean; minStart: number;
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
        if (busy.some(([bS, bE]) => overlaps(s, s + opts.serviceDuration, bS, bE))) continue;
        out.push(s);
    }
    return out;
}

async function getSecret(admin: any, key: string): Promise<string | null> {
    const env = Deno.env.get(key);
    if (env) return env;
    const { data } = await admin.from('app_secrets').select('value').eq('key', key).maybeSingle();
    return data?.value ?? null;
}

async function sendWA(baseUrl: string, apiKey: string, instance: string, phone: string, text: string) {
    try {
        await fetch(`${baseUrl}/message/sendText/${instance}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', apikey: apiKey },
            body: JSON.stringify({ number: phone, text }),
        });
    } catch { /* ignore */ }
}

// Groq (llama-3.3-70b): serbest metinden yapı ÇIKARIR (karar vermez).
// Sadece JSON üretir; müşteriye giden yanıtlar şablon olduğu için
// prose kalitesi önemsiz. Groq free tier cömert → WhatsApp hacmine uygun.
async function aiExtract(key: string, opts: {
    services: { name: string }[]; today: string; todayName: string; state: any; message: string;
}): Promise<{ service: string | null; date: string | null; time: string | null; confirm: 'yes' | 'no' | null; intent: string }> {
    const svcList = opts.services.map(s => s.name).join(', ');
    const system =
        `Sen bir randevu asistanısın. Kullanıcının Türkçe mesajından bilgi ÇIKAR (karar verme).\n` +
        `Bugün: ${opts.today} (${opts.todayName}). Mevcut hizmetler: ${svcList}.\n` +
        `Şimdiye kadar toplanan: ${JSON.stringify(opts.state || {})}.\n` +
        `SADECE şu JSON formatında yanıt ver: {"service": <hizmet adı tam olarak listeden ya da null>, "date": <YYYY-MM-DD ya da null>, "time": <HH:MM ya da null>, "confirm": <"yes"|"no"|null>, "intent": <"book"|"cancel"|"greeting"|"other">}\n` +
        `Kurallar: "yarın", "salı", "bu cumartesi" gibi ifadeleri bugüne göre gerçek tarihe çevir. "3 buçuk"=15:30, "sabah 10"=10:00. Bilgi yoksa null. Onay (evet/olur/tamam)=yes, ret (hayır/yok)=no. service'i yalnızca listedeki adlardan biriyle eşleştir.`;
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile', temperature: 0.2, max_tokens: 300,
                response_format: { type: 'json_object' },
                messages: [{ role: 'system', content: system }, { role: 'user', content: opts.message }],
            }),
        });
        if (!res.ok) return { service: null, date: null, time: null, confirm: null, intent: 'other' };
        const data = await res.json();
        const txt = data?.choices?.[0]?.message?.content || '{}';
        const p = JSON.parse(txt);
        return { service: p.service ?? null, date: p.date ?? null, time: p.time ?? null, confirm: p.confirm ?? null, intent: p.intent ?? 'other' };
    } catch {
        return { service: null, date: null, time: null, confirm: null, intent: 'other' };
    }
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const payload = await req.json().catch(() => ({}));
        // Evolution messages.upsert payload'ı
        const instance: string = payload.instance || payload.data?.instance || '';
        const d = payload.data || {};
        const fromMe = d.key?.fromMe === true;
        const remoteJid: string = d.key?.remoteJid || '';
        const text: string = (d.message?.conversation || d.message?.extendedTextMessage?.text || '').trim();

        // Yalnızca gerçek, gelen, birebir mesajları işle
        if (fromMe || !remoteJid || remoteJid.includes('@g.us') || !text || !instance) return ok({ skipped: true });
        const phone = remoteJid.split('@')[0];

        const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        // Org'u instance'tan çöz
        const { data: setting } = await admin
            .from('settings')
            .select('organization_id, business_name, working_hours, slot_duration')
            .eq('whatsapp_instance', instance)
            .maybeSingle();
        if (!setting?.organization_id) return ok({ skipped: 'org yok' });
        const orgId = setting.organization_id;
        const orgHours: WH[] = setting.working_hours || [];
        const slotDuration: number = setting.slot_duration || 30;
        const businessName: string = setting.business_name || 'İşletme';

        const { data: org } = await admin.from('organizations').select('slug, owner_id, booking_auto_confirm').eq('id', orgId).maybeSingle();

        const EVOLUTION_URL = await getSecret(admin, 'EVOLUTION_API_URL');
        const EVOLUTION_KEY = await getSecret(admin, 'EVOLUTION_API_KEY');
        const GROQ_KEY = await getSecret(admin, 'GROQ_API_KEY');
        const reply = async (t: string) => {
            if (EVOLUTION_URL && EVOLUTION_KEY) await sendWA(EVOLUTION_URL, EVOLUTION_KEY, instance, phone, t);
            return ok({ reply: t });
        };

        // Hizmetler + aktif personel
        const [{ data: services }, { data: allStaff }] = await Promise.all([
            admin.from('services').select('id, name, duration, color').eq('organization_id', orgId).order('created_at'),
            admin.from('staff').select('id, name, working_hours').eq('organization_id', orgId).eq('is_active', true),
        ]);
        const svcArr = services || [];

        // Konuşma durumu (TTL ile)
        const { data: sess } = await admin.from('whatsapp_sessions').select('data, updated_at').eq('organization_id', orgId).eq('phone', phone).maybeSingle();
        let state: any = {};
        if (sess && (Date.now() - new Date(sess.updated_at).getTime()) < SESSION_TTL_MIN * 60_000) state = sess.data || {};

        const nowTR = new Date(Date.now() + TZ_OFFSET_MIN * 60_000);
        const todayStr = nowTR.toISOString().slice(0, 10);
        const todayName = nowTR.toLocaleDateString('tr-TR', { weekday: 'long', timeZone: 'UTC' });

        // Groq ile niyet çıkar
        const ex = GROQ_KEY
            ? await aiExtract(GROQ_KEY, { services: svcArr, today: todayStr, todayName, state, message: text })
            : { service: null, date: null, time: null, confirm: null, intent: 'other' };

        // Basit onay/ret + iptal'i kod tarafında yakala (LLM'e güvenme)
        const low = text.toLowerCase();
        if (/(^|\s)(evet|evt|olur|tamam|tmm|onay|onaylıyorum|onaylyorum|ok|okey|tabii|yes|👍|✅)/.test(low)) ex.confirm = 'yes';
        else if (/(^|\s)(hayır|hayir|yok|olmaz|vazgeç|vazgec|no|👎)/.test(low)) ex.confirm = 'no';
        if (/(^|\s)(iptal|vazgeç|vazgec|boşver|bosver)/.test(low) && !state.awaitingConfirm) ex.intent = 'cancel';

        // İptal niyeti
        if (ex.intent === 'cancel') {
            await admin.from('whatsapp_sessions').delete().eq('organization_id', orgId).eq('phone', phone);
            return reply('Tabii, bu konuşmayı iptal ettim. Yeni bir randevu için istediğin zaman yazabilirsin 🌸');
        }

        // State'i güncelle (yeni bilgiyle)
        if (ex.service) {
            const matched = svcArr.find(s => s.name.toLowerCase() === ex.service!.toLowerCase())
                || svcArr.find(s => s.name.toLowerCase().includes(ex.service!.toLowerCase()) || ex.service!.toLowerCase().includes(s.name.toLowerCase()));
            if (matched) { state.serviceId = matched.id; state.serviceName = matched.name; state.serviceDuration = matched.duration; }
        }
        if (ex.date) { state.date = ex.date; if (state.time && ex.date !== state._dateForTime) { /* tarih değişti, saatı koru */ } }
        if (ex.time) state.time = ex.time;

        const saveState = async () => {
            await admin.from('whatsapp_sessions').upsert(
                { organization_id: orgId, phone, data: state, updated_at: new Date().toISOString() },
                { onConflict: 'organization_id,phone' });
        };

        // ── Eksik bilgi → sor ──
        if (!state.serviceId) {
            await saveState();
            const list = svcArr.slice(0, 8).map(s => `• ${s.name} (${s.duration} dk)`).join('\n');
            return reply(`Merhaba! 👋 *${businessName}*'a hoş geldin. Hangi hizmet için randevu istersin?\n\n${list}`);
        }
        if (!state.date) {
            await saveState();
            return reply(`Harika, *${state.serviceName}* 💆 Hangi gün gelmek istersin? (örn. "yarın", "cumartesi", "20 Haziran")`);
        }

        // Slot hesabı (seçili gün, herhangi personel)
        const date = state.date as string;
        const serviceDuration = state.serviceDuration || slotDuration;
        const { data: dayRes } = await admin.from('reservations').select('staff_id, start_time, end_time').eq('organization_id', orgId).eq('date', date).neq('status', 'cancelled');
        const { data: timeOff } = await admin.from('staff_time_off').select('staff_id').eq('organization_id', orgId).eq('date', date);
        const offSet = new Set((timeOff || []).map((t: any) => t.staff_id));
        const weekday = weekdayOf(date);
        const minStart = date === todayStr ? (nowTR.getUTCHours() * 60 + nowTR.getUTCMinutes()) : 0;

        const slotStaff = new Map<number, string>();
        for (const st of (allStaff || [])) {
            const resFor = (dayRes || []).filter((r: any) => r.staff_id === st.id);
            for (const s of staffSlots({ orgHours, staffHours: st.working_hours || null, weekday, serviceDuration, slotDuration, dayReservations: resFor, isTimeOff: offSet.has(st.id), minStart })) {
                if (!slotStaff.has(s)) slotStaff.set(s, st.id);
            }
        }
        const available = [...slotStaff.keys()].sort((a, b) => a - b).map(minToTime);

        if (available.length === 0) {
            state.date = null; state.time = null;
            await saveState();
            return reply(`${fmtDate(date)} için maalesef boş yer yok 😔 Başka bir gün dener misin?`);
        }

        // ── Saat yok → müsaitleri sun ──
        if (!state.time) {
            await saveState();
            return reply(`${fmtDate(date)} için *${state.serviceName}* müsait saatler:\n\n⏰ ${available.slice(0, 8).join(' · ')}\n\nHangisi sana uygun?`);
        }

        // ── Saat var ama müsait değil ──
        if (!available.includes(state.time)) {
            const wanted = state.time; state.time = null;
            await saveState();
            return reply(`${wanted} maalesef dolu 😔 ${fmtDate(date)} için müsait saatler:\n\n⏰ ${available.slice(0, 8).join(' · ')}\n\nHangisini ayarlayayım?`);
        }

        // ── Hepsi tamam — onay iste / onaylandıysa oluştur ──
        if (!state.awaitingConfirm) {
            state.awaitingConfirm = true;
            await saveState();
            return reply(`Özetliyorum:\n\n💼 ${state.serviceName}\n🗓️ ${fmtDate(date)}\n⏰ ${state.time}\n\nOnaylıyor musun? (Evet / Hayır)`);
        }

        // awaitingConfirm = true
        if (ex.confirm === 'no') {
            state.time = null; state.awaitingConfirm = false;
            await saveState();
            return reply(`Tamam, vazgeçtim. ${fmtDate(date)} için başka saat ister misin?\n\n⏰ ${available.slice(0, 8).join(' · ')}`);
        }
        if (ex.confirm !== 'yes') {
            return reply(`Onaylamak için "Evet", vazgeçmek için "Hayır" yazabilirsin 🙂\n\n💼 ${state.serviceName} · ${fmtDate(date)} · ${state.time}`);
        }

        // ── ONAY: randevu oluştur ──
        const startMin = timeToMin(state.time);
        const chosenStaff = slotStaff.get(startMin);
        if (chosenStaff === undefined) { // arada dolduysa
            state.time = null; state.awaitingConfirm = false;
            await saveState();
            return reply(`Az önce o saat doldu 😔 Müsait: ${available.slice(0, 8).join(' · ')} — hangisi?`);
        }
        const endTime = minToTime(startMin + serviceDuration);
        const svc = svcArr.find(s => s.id === state.serviceId)!;
        const ownerId = org?.owner_id;

        // Müşteri bul/oluştur
        let customerId: string | null = null;
        const { data: existing } = await admin.from('customers').select('id, name').eq('organization_id', orgId).eq('phone', phone).maybeSingle();
        const pushName = (payload.data?.pushName || '').trim();
        if (existing) { customerId = existing.id; }
        else {
            const { data: created } = await admin.from('customers').insert({ user_id: ownerId, organization_id: orgId, name: pushName || `WhatsApp ${phone.slice(-4)}`, phone }).select('id').single();
            customerId = created?.id ?? null;
        }
        const customerName = existing?.name || pushName || `WhatsApp ${phone.slice(-4)}`;
        const autoConfirm = !!org?.booking_auto_confirm;

        const { data: reservation } = await admin.from('reservations').insert({
            user_id: ownerId, organization_id: orgId, customer_id: customerId,
            customer_name: customerName, customer_phone: phone,
            date, start_time: state.time, end_time: endTime,
            service: svc.name, service_color: svc.color || '#FF5A1F',
            status: autoConfirm ? 'confirmed' : 'pending', notes: 'WhatsApp AI randevu', staff_id: chosenStaff, source: 'booking',
        }).select('id, customer_token').single();

        // Webhook (LeadFlow) — settings.webhook_url
        const { data: wh } = await admin.from('settings').select('webhook_url').eq('organization_id', orgId).maybeSingle();
        if (wh?.webhook_url) {
            fetch(wh.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event: 'reservation.created', source: 'timeflow', timestamp: new Date().toISOString(),
                    data: { id: reservation?.id, customer_name: customerName, customer_phone: phone, date, start_time: state.time, end_time: endTime, service: svc.name, status: autoConfirm ? 'confirmed' : 'pending', source: 'booking' } }),
            }).catch(() => {});
        }

        // Konuşmayı temizle + onay mesajı
        await admin.from('whatsapp_sessions').delete().eq('organization_id', orgId).eq('phone', phone);
        const manage = reservation?.customer_token ? `\n\nİptal/değişiklik için:\n${APP_ORIGIN}/booking/${reservation.customer_token}` : '';
        return reply(`Randevun oluştu! ✅\n\n💼 ${svc.name}\n🗓️ ${fmtDate(date)}\n⏰ ${state.time}\n\nSeni bekliyoruz 🌷${manage}`);
    } catch (err) {
        console.error('whatsapp-booking error:', err);
        return ok({ error: String(err) });
    }
});
