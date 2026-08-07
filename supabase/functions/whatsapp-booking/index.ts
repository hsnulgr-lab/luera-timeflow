import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
    featureOn, findCustomerByPhone, logMessage, sendWA as sendWhatsApp,
    type OrgWa,
} from '../_shared/wa.ts';
import { normalizePhone } from '../_shared/phone.ts';
import { isSaneDate, matchOfferedTime, parseWhen } from '../_shared/booking/dates.ts';
import { greetingName } from '../_shared/booking/identity.ts';
import * as M from '../_shared/booking/messages.ts';
import {
    availabilityFor, availableDays, formatDateTr as fmtDate, minToTime, timeToMin, weekdayOf,
    type WorkingHour as WH,
} from '../_shared/booking/slots.ts';
import { detectConfirm, detectIntent, inboundKind } from '../_shared/booking/intent.ts';
import { assignResources } from '../_shared/booking/resources.ts';
import { parseReceiptEvent, receiptPatch } from '../_shared/booking/receipts.ts';
import { EMPTY_EXTRACTION, extractWithAi, type Extraction } from '../_shared/booking/ai.ts';

// ============================================================
// whatsapp-booking — WhatsApp üzerinden randevu
// ------------------------------------------------------------
// Evolution API gelen mesaj webhook'u buraya POST eder.
//
// Anlama üç katmanlı ve bu SIRA önemli:
//   1. Kural tabanlı çözücü (_shared/booking/dates, intent) — kesin, bedava,
//      ağ gerektirmez. "yarın 3 buçuk" buradan çıkar.
//   2. Model (Groq → Gemini yedek) — yalnız 1. katmanın çözemediği cümleler.
//   3. Hiçbiri çözemezse akış eksik bilgiyi SORAR; bot asla susmaz.
//
// Randevuyu her hâlükârda KOD oluşturur: slot, çakışma, uygunluk. Model yanlış
// anlasa bile geçersiz randevu oluşmaz.
//
// Slot/tarih/niyet mantığı _shared/booking altında saf modüllerde durur ve
// tests/wa-booking.test.mjs ile node üzerinden test edilir — buraya kopyalanmaz.
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
function isReservationConflict(error: { code?: string; message?: string } | null | undefined): boolean {
    const message = (error?.message || '').toLowerCase();
    return error?.code === '23P01'
        || message.includes('reservation_staff_conflict')
        || message.includes('reservation_resource_conflict');
}
/**
 * Uygunluk engeli (076): hamilelik gibi bir risk bayrağı hizmetin etiketiyle
 * çakışıyor. Guard 23514 ile 'reservation_eligibility_blocked' fırlatıyor;
 * bunu tanımazsak müşteri "biraz sonra tekrar deneyin" görüp sonsuza kadar
 * dener — engel kalkmayacağı için hiç başarmaz.
 */
function eligibilityBlock(
    error: { code?: string; message?: string; details?: string } | null | undefined,
): { reason: string | null } | null {
    if (!error) return null;
    const message = (error.message || '') + ' ' + (error.details || '');
    if (!message.includes('reservation_eligibility_blocked')) return null;
    let reason: string | null = null;
    try {
        const parsed = JSON.parse(error.details || '{}');
        if (typeof parsed?.reason === 'string') reason = parsed.reason;
    } catch { /* detail JSON değilse gerekçesiz devam */ }
    return { reason };
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
        const providerMsgId: string = d.key?.id || '';
        const text: string = (d.message?.conversation || d.message?.extendedTextMessage?.text || '').trim();
        // Sesli mesaj Türkiye'de çok yaygın; okuyamıyoruz ama sessiz kalmak
        // müşteriyi cevapsız bırakıyordu.
        const hasMedia = Boolean(
            d.message?.audioMessage || d.message?.imageMessage
            || d.message?.videoMessage || d.message?.documentMessage
            || d.message?.stickerMessage,
        );

        if (!instance) return ok({ skipped: true });

        // Teslimat makbuzu mu? Kendi gönderdiğimiz mesajın durumu olduğu için
        // fromMe=true gelir ve aşağıdaki eleme onu düşürürdü. Ayrıştırma saf ve
        // ağsız; org çözümü ile sır doğrulamasından SONRA işlenir.
        const receipts = parseReceiptEvent(payload);
        const msgKind = inboundKind({ fromMe, remoteJid, text, hasMedia });
        if (receipts.length === 0 && msgKind === 'skip') return ok({ skipped: true });
        // Numarayı tek biçime çevir — log, kota ve müşteri eşleşmesi buna dayanır
        const phone = normalizePhone(remoteJid.split('@')[0]) || remoteJid.split('@')[0];

        const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        // Org'u instance'tan çöz — org_whatsapp.instance UNIQUE (070). Eskiden
        // settings üzerinden çözülüyordu ve settings kullanıcı başına tek satır
        // olduğu için çok üyeli org'da eşleşme belirsizdi.
        const { data: orgWaRow } = await admin
            .from('org_whatsapp')
            .select('organization_id, instance, status, webhook_secret, features')
            .eq('instance', instance)
            .maybeSingle();
        if (!orgWaRow?.organization_id) return ok({ skipped: 'org yok' });
        const orgWa = orgWaRow as OrgWa;
        const orgId = orgWa.organization_id;

        // Webhook doğrulaması: fonksiyon URL'ini ve instance adını bilen herkes
        // botu sürebiliyordu. Sır, bağlanırken proxy tarafından Evolution'a
        // yazılan ?s=<webhook_secret> parametresidir.
        const givenSecret = new URL(req.url).searchParams.get('s') || '';
        if (!orgWa.webhook_secret || givenSecret !== orgWa.webhook_secret) {
            return new Response(JSON.stringify({ error: 'unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // ── Teslimat makbuzu (084) ───────────────────────────────────────────
        // MESSAGES_UPDATE bir konuşma olayı değil, kendi gönderdiğimiz mesajın
        // durumu. Randevu akışına hiç girmez; damgayı yazıp çıkar.
        if (receipts.length > 0) {
            const now = new Date().toISOString();
            for (const r of receipts) {
                await admin.from('wa_message_log')
                    .update(receiptPatch(r.receipt, now))
                    .eq('organization_id', orgId)
                    .eq('provider_msg_id', r.providerMsgId)
                    // Zaten okundu yazılmış satıra "teslim edildi" geri yazmasın:
                    // makbuzlar sırasız gelebiliyor.
                    .is(r.receipt === 'delivered' ? 'delivered_at' : 'read_at', null);
            }
            return ok({ receipts: receipts.length });
        }

        // Idempotency: Evolution aynı mesajı tekrar POST ederse ikinci kez
        // işlenmesin (aynı randevu iki kez oluşabiliyordu).
        if (providerMsgId) {
            const { error: seenErr } = await admin
                .from('wa_inbound_seen')
                .insert({ provider_msg_id: providerMsgId, organization_id: orgId });
            // 23505 = aynı mesaj daha önce işlendi. Başka bir hata olursa
            // (tablo/bağlantı) mesajı düşürmek yerine işlemeye devam et.
            if (seenErr?.code === '23505') return ok({ skipped: 'duplicate' });
        }

        const { data: setting } = await admin
            .from('settings')
            .select('business_name, working_hours, slot_duration, comms')
            .eq('organization_id', orgId)
            .limit(1)
            .maybeSingle();
        const orgHours: WH[] = setting?.working_hours || [];
        const slotDuration: number = setting?.slot_duration || 30;
        const businessName: string = setting?.business_name || 'İşletme';
        // Sektör iletişim profili (066). Hatırlatma mesajları bunu okuyordu ama
        // BOT okumuyordu: diş kliniği "Dolgu" için 💆 ve 🌷 emojisi alıyordu.
        const comms = M.resolveComms(setting?.comms);

        const { data: org } = await admin.from('organizations').select('slug, owner_id, booking_auto_confirm').eq('id', orgId).maybeSingle();

        const known = await findCustomerByPhone(admin, orgId, phone);

        // Botun ağzı tek yerde: _shared/booking/messages. Sektör sözcüğü ve
        // emojisi profilden gelir, hitap her zaman "siz" — canlıda tek
        // konuşmada üslup dört kez değişiyordu.
        // greetingName yer tutucuyu (Geçici / Walk-in) eler: bot gerçek adı
        // olan kayıt dururken "Merhaba Geçici!" yazmıştı.
        const msgCtx = (): M.Ctx => ({
            comms, businessName, firstName: greetingName(known?.name),
        });

        const reply = async (t: string, kind: 'booking' | 'optout' = 'booking') => {
            await sendWhatsApp(admin, {
                org: orgWa, phone, text: t, kind,
                customerId: known?.id ?? null,
                // Müşteri yazdı, biz cevaplıyoruz: opt-out otomatik gönderimi
                // durdurur, karşılıklı konuşmayı değil.
                ignoreOptOut: true,
            });
            return ok({ reply: t });
        };

        // Gelen mesajı kaydet — bugüne kadar konuşmanın hiçbir kalıcı izi yoktu
        await logMessage(admin, {
            orgId, direction: 'in', phone, kind: 'inbound',
            status: 'sent', body: msgKind === 'media' ? '[medya]' : text,
            customerId: known?.id ?? null,
            providerMsgId: providerMsgId || null,
        });

        // ── Opt-out: "DUR" diyen müşteriye bir daha otomatik mesaj gitmez ────
        // Niyet tespiti _shared/booking/intent'te; "randevumu iptal et" ile
        // "DUR" birbirine karışmasın diye opt-out yalnız tek kelimede yakalanır.
        const topIntent = msgKind === 'text' ? detectIntent(text) : 'other';
        if (topIntent === 'optout') {
            if (known?.id) {
                await admin.from('customers')
                    .update({ wa_opt_out: true, wa_opt_out_at: new Date().toISOString() })
                    .eq('id', known.id).eq('organization_id', orgId);
            }
            return reply(M.optedOut(msgCtx()), 'optout');
        }
        if (topIntent === 'optin' && known?.wa_opt_out) {
            await admin.from('customers')
                .update({ wa_opt_out: false, wa_opt_out_at: null })
                .eq('id', known.id).eq('organization_id', orgId);
            return reply(M.optedIn(msgCtx()), 'optout');
        }

        // AI asistan toggle'ı (Ayarlar → WhatsApp). Kapalıysa bot hiç cevap
        // vermez — DUR/BAŞLAT yukarıda işlendiği için opt-out hakkı korunur.
        // Varsayılan false: istemcideki useWhatsApp ile aynı (bilinçli açılmalı).
        if (!featureOn(orgWa, 'assistant', false)) return ok({ skipped: 'assistant_off' });

        // Sesli mesaj / fotoğraf: okuyamıyoruz ama sessiz kalmak müşteriyi
        // cevapsız bırakıyordu. Kısa bir yönlendirme, konuşmayı bozmadan.
        if (msgKind === 'media') {
            return reply(M.mediaUnsupported(msgCtx()));
        }

        // Bot maliyeti koruması: bir numara saatte 20 mesajdan fazlasını
        // tetikleyemez (her mesaj bir Groq çağrısı demek).
        const hourAgo = new Date(Date.now() - 3600_000).toISOString();
        const { count: recentIn } = await admin
            .from('wa_message_log')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId).eq('phone', phone)
            .eq('direction', 'in').gte('created_at', hourAgo);
        if ((recentIn ?? 0) > 20) return ok({ skipped: 'rate_limited' });

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

        // Kuru bir "merhaba" YENİ konuşma demektir. Canlıda tam tersi oldu:
        // müşteri 20 dakika sonra "merhaba" yazdı, bot baştan karşıladı ama
        // eski oturumdaki tarih sessizce duruyordu — hizmeti seçer seçmez gün
        // sormadan saatlere atladı. Karşılama sıfırdan başlıyorsa durum da
        // sıfırdan başlamalı.
        if (msgKind === 'text' && detectIntent(text) === 'greeting' && Object.keys(state).length > 0) {
            state = {};
            await admin.from('whatsapp_sessions').delete()
                .eq('organization_id', orgId).eq('phone', phone);
        }

        // ── 1. katman: kural tabanlı çözüm ───────────────────────────────────
        // Tarih, saat, onay ve iptal modele SORULMAZ. Bunlar kesin çözülebilen
        // ve yanlış çözüldüğünde geri alınamaz iş yaptıran şeyler.
        const when = parseWhen(text, todayStr);
        const ruleConfirm = detectConfirm(text);

        // ── 2. katman: model ─────────────────────────────────────────────────
        // Model VARSAYILAN olarak çağrılır; yalnız kuralın mesajı tamamen
        // çözdüğü iki durumda atlanır. Tersini yapmak (yalnız eksik alan varken
        // çağırmak) "aslında lazer olsun" gibi fikir değişikliklerini kaçırıyor:
        // bütün alanlar dolu olduğu için model hiç sorulmuyor ve müşterinin
        // yeni isteği sessizce yutuluyordu.
        const ruleSettled =
            // Onay bekliyoruz ve net bir evet/hayır geldi — mesajın başka işi yok.
            (Boolean(state.awaitingConfirm) && ruleConfirm !== null)
            // Ya da kural son eksik alanı doldurdu ("yarın 3 buçuk").
            || (Boolean(state.serviceId)
                && Boolean(when.date || state.date)
                && Boolean(when.time || state.time)
                && Boolean(when.date || when.time));
        const needsAi = !ruleSettled;
        const ex: Extraction = needsAi
            ? (await extractWithAi(admin, {
                services: svcArr, today: todayStr, todayName, state, message: text,
                known: { date: when.date, time: when.time },
            }) ?? { ...EMPTY_EXTRACTION })
            : { ...EMPTY_EXTRACTION };

        // Kural her zaman modelin üstüne yazar — sağlayıcı ne derse desin.
        if (when.date) ex.date = when.date;
        if (when.time) ex.time = when.time;
        if (ruleConfirm) ex.confirm = ruleConfirm;
        if (detectIntent(text, { awaitingConfirm: Boolean(state.awaitingConfirm) }) === 'cancel') {
            ex.intent = 'cancel';
        }

        // İptal niyeti
        if (ex.intent === 'cancel') {
            await admin.from('whatsapp_sessions').delete().eq('organization_id', orgId).eq('phone', phone);
            return reply(M.conversationCancelled(msgCtx()));
        }

        // State'i güncelle (yeni bilgiyle)
        if (ex.service) {
            const matched = svcArr.find(s => s.name.toLowerCase() === ex.service!.toLowerCase())
                || svcArr.find(s => s.name.toLowerCase().includes(ex.service!.toLowerCase()) || ex.service!.toLowerCase().includes(s.name.toLowerCase()));
            if (matched) { state.serviceId = matched.id; state.serviceName = matched.name; state.serviceDuration = matched.duration; }
        }
        // AI'nın ürettiği tarih doğrulanmadan state'e ve oradan reservations
        // insert'ine gidiyordu; hatalı/uydurma bir tarih randevu oluşturabiliyordu.
        // Biçim + makul aralık kontrolü burada yapılır (saat zaten slot listesine
        // karşı doğrulanıyor).
        if (ex.date && isSaneDate(ex.date, todayStr)) state.date = ex.date;
        // Saat de biçim denetiminden geçer: model "akşam" gibi bir şey
        // döndürdüğünde state'e çöp yazılmasın (slot listesi zaten eşleşmeyecek
        // ama oturum kalıcı, çöp de kalıcı olurdu).
        if (ex.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(ex.time)) state.time = ex.time;

        const saveState = async () => {
            await admin.from('whatsapp_sessions').upsert(
                { organization_id: orgId, phone, data: state, updated_at: new Date().toISOString() },
                { onConflict: 'organization_id,phone' });
        };

        // ── Eksik bilgi → sor ──
        if (!state.serviceId) {
            await saveState();
            return reply(M.greeting(msgCtx(), svcArr));
        }
        // "Hangi günler müsaitsiniz?" — canlıda bot bu soruya aynı saat
        // listesini tekrar gönderdi. Gün sorusu ayrı bir istek: önümüzdeki iki
        // haftada en az bir slotu olan günler sıralanır.
        if (msgKind === 'text' && detectIntent(text) === 'availability') {
            const horizon = 14;
            const lastISO = new Date(Date.parse(`${todayStr}T00:00:00Z`) + (horizon - 1) * 86_400_000)
                .toISOString().slice(0, 10);
            const [{ data: rangeRes }, { data: rangeOff }] = await Promise.all([
                admin.from('reservations')
                    .select('date, staff_id, start_time, end_time')
                    .eq('organization_id', orgId).gte('date', todayStr).lte('date', lastISO)
                    .neq('status', 'cancelled'),
                admin.from('staff_time_off')
                    .select('date, staff_id')
                    .eq('organization_id', orgId).gte('date', todayStr).lte('date', lastISO),
            ]);
            const days = availableDays({
                fromISO: todayStr, horizon, limit: 5,
                orgHours,
                serviceDuration: state.serviceDuration || slotDuration,
                slotDuration,
                minStartToday: nowTR.getUTCHours() * 60 + nowTR.getUTCMinutes(),
                staffByDay: (iso) => (allStaff || []).map((st: any) => ({
                    id: st.id,
                    workingHours: st.working_hours || null,
                    isTimeOff: (rangeOff || []).some((t: any) => t.date === iso && t.staff_id === st.id),
                    dayReservations: (rangeRes || []).filter((r: any) => r.date === iso && r.staff_id === st.id),
                })),
            });
            await saveState();
            return reply(M.offerDays(msgCtx(), {
                serviceName: String(state.serviceName),
                days: days.map((iso) => ({ iso, label: fmtDate(iso) })),
            }));
        }

        if (!state.date) {
            await saveState();
            return reply(M.askDay(msgCtx(), String(state.serviceName)));
        }

        // Slot hesabı (seçili gün, herhangi personel)
        const date = state.date as string;
        const serviceDuration = state.serviceDuration || slotDuration;
        const { data: dayRes } = await admin.from('reservations').select('staff_id, resource_id, start_time, end_time').eq('organization_id', orgId).eq('date', date).neq('status', 'cancelled');
        const { data: timeOff } = await admin.from('staff_time_off').select('staff_id').eq('organization_id', orgId).eq('date', date);
        const { data: resourceRows } = await admin.from('resources').select('id, capacity, sort').eq('organization_id', orgId).eq('is_active', true).order('sort');
        const offSet = new Set((timeOff || []).map((t: any) => t.staff_id));
        const weekday = weekdayOf(date);
        const minStart = date === todayStr ? (nowTR.getUTCHours() * 60 + nowTR.getUTCMinutes()) : 0;

        const staffAvail = availabilityFor({
            staff: (allStaff || []).map((st: any) => ({
                id: st.id,
                workingHours: st.working_hours || null,
                isTimeOff: offSet.has(st.id),
                dayReservations: (dayRes || []).filter((r: any) => r.staff_id === st.id),
            })),
            orgHours, weekday, serviceDuration, slotDuration, minStart,
        });

        // Kabin süzgeci: personel müsait olsa da kabin yoksa o saat sunulmaz.
        // WhatsApp randevuları bugüne kadar resource_id'siz yazılıyordu ve
        // operasyon ekranında kabinsiz düşüyordu.
        const resourceBusy = (dayRes || [])
            .filter((r: any) => r.resource_id)
            .map((r: any) => ({
                resourceId: r.resource_id,
                start: timeToMin(r.start_time),
                end: timeToMin(r.end_time),
            }));
        const slotResource = assignResources({
            minutes: [...staffAvail.staffByMinute.keys()],
            duration: serviceDuration,
            resources: (resourceRows || []).map((r: any) => ({ id: r.id, capacity: r.capacity })),
            busy: resourceBusy,
        });

        const slotStaff = staffAvail.staffByMinute;
        const available = [...slotResource.keys()].sort((a, b) => a - b).map(minToTime);

        if (available.length === 0) {
            state.date = null; state.time = null;
            await saveState();
            return reply(M.dayFull(msgCtx(), fmtDate(date)));
        }

        // Liste sunulduktan SONRA gelen çıplak sayı bir seçimdir. Genel çözücü
        // çıplak sayıyı bilinçli olarak saat saymıyor ("2 kişiyiz" 14:00
        // olmasın diye) ama bu kural burada müşteriyi kilitliyordu: canlıda
        // saatler sıralandıktan sonra "9" yazan kullanıcıya bot aynı listeyi
        // tekrar gönderdi. Bağlam varken kural gevşetilir.
        // Mesajda tarih varsa çıplak sayı saat değildir: canlıda "11 Ağustos
        // istiyorum" yazan müşteriye bot 11:15'i seçip özet gösterdi.
        if (!state.time && state.offeredTimes && !when.date) {
            const picked = matchOfferedTime(text, available);
            if (picked) state.time = picked;
        }

        // ── Saat yok → müsaitleri sun ──
        if (!state.time) {
            // Hangi saatlerin sunulduğunu işaretle: bir sonraki turda çıplak
            // sayıyı seçim saymanın koşulu bu.
            state.offeredTimes = true;
            await saveState();
            return reply(M.offerTimes(msgCtx(), {
                dateLabel: fmtDate(date), serviceName: String(state.serviceName),
                times: available.slice(0, 8),
            }));
        }

        // ── Saat var ama müsait değil ──
        if (!available.includes(state.time)) {
            const wanted = state.time; state.time = null;
            await saveState();
            return reply(M.timeTaken(msgCtx(), {
                wanted, dateLabel: fmtDate(date), times: available.slice(0, 8),
            }));
        }

        // ── Hepsi tamam — onay iste / onaylandıysa oluştur ──
        if (!state.awaitingConfirm) {
            state.awaitingConfirm = true;
            await saveState();
            return reply(M.summary(msgCtx(), {
                service: String(state.serviceName), dateLabel: fmtDate(date), time: String(state.time),
            }));
        }

        // awaitingConfirm = true
        if (ex.confirm === 'no') {
            state.time = null; state.awaitingConfirm = false;
            await saveState();
            return reply(M.declined(msgCtx(), { dateLabel: fmtDate(date), times: available.slice(0, 8) }));
        }
        if (ex.confirm !== 'yes') {
            return reply(M.confirmNudge(msgCtx(), {
                service: String(state.serviceName), dateLabel: fmtDate(date), time: String(state.time),
            }));
        }

        // ── ONAY: randevu oluştur ──
        const startMin = timeToMin(state.time);
        const chosenStaff = slotStaff.get(startMin);
        // Kabin ataması slot listesiyle AYNI kaynaktan gelir; müşteriye sunulan
        // saat ile yazılan kabin birbirinden kayamaz.
        const chosenResource = slotResource.get(startMin) ?? null;
        if (chosenStaff === undefined || !slotResource.has(startMin)) { // arada dolduysa
            state.time = null; state.awaitingConfirm = false;
            await saveState();
            return reply(M.slotJustTaken(msgCtx(), available.slice(0, 8)));
        }
        const endTime = minToTime(startMin + serviceDuration);
        const svc = svcArr.find(s => s.id === state.serviceId)!;
        const ownerId = org?.owner_id;

        // Müşteri bul/oluştur
        let customerId: string | null = null;
        // Kayıtlı müşteri araması normalize numarayla ve yazım varyantlarıyla
        // yapılır (0532… / +90532… / 532… hepsi aynı kişi); yoksa her yazımdan
        // ayrı bir müşteri kaydı oluşuyordu.
        const existing = known;
        const pushName = (payload.data?.pushName || '').trim();
        if (existing) { customerId = existing.id; }
        else {
            const { data: created, error: customerCreateError } = await admin.from('customers').insert({ user_id: ownerId, organization_id: orgId, name: pushName || `WhatsApp ${phone.slice(-4)}`, phone }).select('id').single();
            if (customerCreateError || !created?.id) {
                console.error('whatsapp customer create error', customerCreateError);
                return reply(M.createFailed(msgCtx()));
            }
            customerId = created.id;
        }
        const customerName = existing?.name || pushName || `WhatsApp ${phone.slice(-4)}`;
        const autoConfirm = !!org?.booking_auto_confirm;

        const { data: reservation, error: reservationError } = await admin.from('reservations').insert({
            user_id: ownerId, organization_id: orgId, customer_id: customerId,
            customer_name: customerName, customer_phone: phone,
            date, start_time: state.time, end_time: endTime,
            service: svc.name, service_color: svc.color || '#FF5A1F',
            status: autoConfirm ? 'confirmed' : 'pending', notes: 'WhatsApp AI randevu',
            staff_id: chosenStaff, resource_id: chosenResource, source: 'booking',
        }).select('id, customer_token').single();

        if (reservationError || !reservation) {
            console.error('whatsapp reservation insert error', reservationError);
            if (isReservationConflict(reservationError)) {
                const conflictedTime = state.time;
                state.time = null;
                state.awaitingConfirm = false;
                await saveState();
                const alternatives = available.filter((slot) => slot !== conflictedTime).slice(0, 8);
                return reply(M.slotJustTaken(msgCtx(), alternatives));
            }
            // Uygunluk engeli (076): tekrar denemek işe YARAMAZ. Genel "biraz
            // sonra deneyin" mesajı müşteriyi sonsuz döngüye sokuyordu; gerekçe
            // söylenip konuşma salona devredilir.
            const blocked = eligibilityBlock(reservationError);
            if (blocked) {
                await admin.from('whatsapp_sessions').delete().eq('organization_id', orgId).eq('phone', phone);
                return reply(M.eligibilityBlocked(msgCtx(), blocked.reason));
            }
            return reply(M.createFailed(msgCtx()));
        }

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
        // Otomatik onay kapalıysa kayıt 'pending' düşüyor ama bot yine
        // "Randevun oluştu!" diyordu — müşteri onaylanmış sanıp geliyordu.
        return reply(M.created(msgCtx(), {
            service: svc.name, dateLabel: fmtDate(date), time: String(state.time),
            manageUrl: reservation?.customer_token
                ? `${APP_ORIGIN}/booking/${reservation.customer_token}`
                : null,
            pending: !autoConfirm,
        }));
    } catch (err) {
        console.error('whatsapp-booking error:', err);
        return ok({ error: String(err) });
    }
});
