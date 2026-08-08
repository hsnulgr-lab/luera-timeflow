import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
    featureOn, findCustomerByPhone, logMessage, sendWA as sendWhatsApp,
    type OrgWa,
} from '../_shared/wa.ts';
import { normalizePhone } from '../_shared/phone.ts';
import { isSaneDate, matchOfferedTime, parseWhen } from '../_shared/booking/dates.ts';
import { greetingName } from '../_shared/booking/identity.ts';
import { matchService } from '../_shared/booking/services.ts';
import * as M from '../_shared/booking/messages.ts';
import {
    availabilityFor, availableDays, formatDateTr as fmtDate, minToTime, timeToMin, weekdayOf,
    type WorkingHour as WH,
} from '../_shared/booking/slots.ts';
import { detectConfirm, detectIntent, detectListChoice, inboundKind } from '../_shared/booking/intent.ts';
import { assignResources } from '../_shared/booking/resources.ts';
import { parseReceiptEvent, receiptPatch } from '../_shared/booking/receipts.ts';
import { EMPTY_EXTRACTION, extractWithAi, type Extraction, type Turn } from '../_shared/booking/ai.ts';
import {
    CLARIFY_OPTIONS, CLARIFY_QUESTION, clarifyQuestion, detectClarify, detectTopic, PERSONAL,
    type Clarify, type Topic,
} from '../_shared/booking/inquiry.ts';
import { computeBalance, formatTL } from '../_shared/booking/finance.ts';
import { announceFreedSlot, notifyOwner } from '../_shared/notify.ts';

// ============================================================
// whatsapp-booking — WhatsApp üzerinden randevu
// ------------------------------------------------------------
// Evolution API gelen mesaj webhook'u buraya POST eder.
//
// Bot üç iş yapar ve bu sıra önemli:
//   A. KAYITLI randevuya dokunan istekler (iptal / erteleme / hatırlatma yanıtı)
//   B. Bilgi soruları (randevum, paketim, bakiyem, saat, fiyat, adres, insan)
//   C. Yeni randevu akışı
// A önce gelir: "randevumu iptal et" cümlesi B'ye düşerse bot randevuyu
// göstermekle yetinir, C'ye düşerse yeni randevu almaya çalışır.
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
// Çok turlu ve HATIRLAR. İki ayrı hafıza var, ikisi de gerekli:
//   • whatsapp_sessions — toplanan VERİ (hizmet, tarih, saat, akış durumu).
//     Kararları bu belirler; modele bırakılmaz.
//   • wa_message_log — konuşmanın KENDİSİ. Son 2 saatin turları modele bağlam
//     olarak gider. Bu eksikti: modele her seferinde tek bir mesaj gidiyordu
//     ve "peki ya sonraki hafta" gibi cümleler havada kalıyordu.
//
// Bot ANLAMADIĞINDA SORAR. Eskiden anlaşılmayan her mesaja aynı karşılamayı
// gönderiyordu; "seanslar" yazıp ücret öğrenmek isteyen müşteri hizmet listesi
// alıyordu. Artık numaralı seçenekle sorulur ve seçim kural katmanında çözülür.
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

        // address / public_phone / maps_url (013) bilgi cevapları için: adres ve
        // telefon MODELDEN değil, işletmenin kendi profilinden gelir.
        const { data: org } = await admin.from('organizations')
            .select('slug, owner_id, booking_auto_confirm, address, public_phone, maps_url')
            .eq('id', orgId).maybeSingle();
        const orgPhone: string | null = org?.public_phone || null;

        const known = await findCustomerByPhone(admin, orgId, phone);

        // Botun ağzı tek yerde: _shared/booking/messages. Sektör sözcüğü ve
        // emojisi profilden gelir, hitap her zaman "siz" — canlıda tek
        // konuşmada üslup dört kez değişiyordu.
        // greetingName yer tutucuyu (Geçici / Walk-in) eler: bot gerçek adı
        // olan kayıt dururken "Merhaba Geçici!" yazmıştı.
        const msgCtx = (): M.Ctx => ({
            comms, businessName, firstName: greetingName(known?.name),
        });

        const reply = async (t: string, kind: 'booking' | 'optout' | 'cooldown' = 'booking') => {
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

        // ── Akış koruması ────────────────────────────────────────────────────
        // Eski hâli tek bir eşikti (saatte 20 gelen mesaj) ve aşılınca bot
        // SESSİZCE duruyordu. Canlıda test ederken doldu: hem müşteri hem
        // işletme "bot bozuldu" sandı. İki ayrı derdi tek eşikle çözmeye
        // çalışmak da yanlıştı — biri maliyet, diğeri kötüye kullanım.
        //
        // MODEL BÜTÇESİ aşılınca bot susmuyor, yalnız modele sormayı bırakıyor:
        // kural tabanlı çözücü (dates/intent) ağsız çalıştığı için konuşma
        // devam eder, sadece serbest cümleleri anlamakta zorlanır.
        //
        // TAŞMA EŞİĞİ gerçek bir döngü/kötüye kullanım içindir ve orada bile
        // saatte BİR KEZ açıklama gönderilir, sonra sessiz kalınır.
        const AI_BUDGET_PER_HOUR = 20;
        const FLOOD_PER_HOUR = 60;
        const hourAgo = new Date(Date.now() - 3600_000).toISOString();
        const { count: recentIn } = await admin
            .from('wa_message_log')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId).eq('phone', phone)
            .eq('direction', 'in').gte('created_at', hourAgo);
        const inbound = recentIn ?? 0;

        if (inbound > FLOOD_PER_HOUR) {
            const { count: warned } = await admin
                .from('wa_message_log')
                .select('id', { count: 'exact', head: true })
                .eq('organization_id', orgId).eq('phone', phone)
                .eq('kind', 'cooldown').gte('created_at', hourAgo);
            if ((warned ?? 0) > 0) return ok({ skipped: 'rate_limited' });
            return reply(M.cooldown(msgCtx()), 'cooldown');
        }
        const aiBudgetLeft = inbound <= AI_BUDGET_PER_HOUR;

        // Hizmetler + aktif personel
        const [{ data: services }, { data: allStaff }] = await Promise.all([
            admin.from('services').select('id, name, duration, color, price').eq('organization_id', orgId).order('created_at'),
            admin.from('staff').select('id, name, working_hours').eq('organization_id', orgId).eq('is_active', true),
        ]);
        const svcArr = services || [];

        // Konuşma durumu (TTL ile)
        const { data: sess } = await admin.from('whatsapp_sessions').select('data, updated_at').eq('organization_id', orgId).eq('phone', phone).maybeSingle();
        let state: any = {};
        if (sess && (Date.now() - new Date(sess.updated_at).getTime()) < SESSION_TTL_MIN * 60_000) state = sess.data || {};

        const saveState = async () => {
            await admin.from('whatsapp_sessions').upsert(
                { organization_id: orgId, phone, data: state, updated_at: new Date().toISOString() },
                { onConflict: 'organization_id,phone' });
        };

        // ── Konuşma geçmişi ──────────────────────────────────────────────────
        // Modelin "hafızası yok" görünmesinin sebebi buydu: whatsapp_sessions
        // yalnız TOPLANAN VERİYİ (hizmet/tarih/saat) taşıyordu, konuşmanın
        // kendisini değil. Modele her seferinde tek bir mesaj gidiyordu; "peki
        // ya sonraki hafta", "olmadı, önceki daha iyiydi" gibi cümlelerin neye
        // atıf yaptığı state'te yazmaz.
        //
        // Kaynak wa_message_log: zaten yazılıyordu, hiç okunmuyordu. Oturum
        // ömrüyle (2 saat) sınırlı — dünkü konuşmayı bugüne taşımak, kapanmış
        // bir konuyu diriltmek olurdu.
        const HISTORY_TURNS = 8;
        const { data: histRows } = await admin
            .from('wa_message_log')
            .select('direction, body, created_at')
            .eq('organization_id', orgId).eq('phone', phone)
            .gte('created_at', new Date(Date.now() - SESSION_TTL_MIN * 60_000).toISOString())
            .order('created_at', { ascending: false })
            .limit(HISTORY_TURNS + 2);
        const histAsc = (histRows ?? []).reverse();
        // Şu anki mesaj birkaç satır yukarıda log'a yazıldı; iki kez göndermek
        // modele "kullanıcı aynı şeyi tekrarladı" izlenimi verirdi.
        if (histAsc.length > 0 && histAsc[histAsc.length - 1].direction === 'in') histAsc.pop();
        const history: Turn[] = histAsc
            .filter((r: any) => typeof r.body === 'string' && r.body.trim().length > 0)
            .slice(-HISTORY_TURNS)
            .map((r: any) => ({
                role: r.direction === 'in' ? 'user' as const : 'assistant' as const,
                text: String(r.body).slice(0, 600),
            }));

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
        // Devam eden bir konuşma var mı?
        //
        // İki yerde belirleyici. (1) "başka gün" cümlesi akış ortasında önerilen
        // günü beğenmemek, akış dışında kayıtlı randevuyu ertelemek demek.
        // (2) Kuru bir "Evet" akış varken O KONUŞMAYA aittir; yoksa 24 saatlik
        // hatırlatmanın cevabı olabilir.
        //
        // cancelId ve pickList de sayılır: "iptal ediyorum, onaylıyor musunuz?"
        // sorusuna gelen "Evet" hatırlatma yanıtı sanılırsa müşterinin YANLIŞ
        // randevusu iptal edilir.
        const inFlow = Boolean(
            state.serviceId || state.date || state.awaitingConfirm
            || state.cancelId || state.pickList,
        );
        const intent = msgKind === 'text'
            ? detectIntent(text, { awaitingConfirm: Boolean(state.awaitingConfirm), inFlow })
            : 'other';

        // ── Yaklaşan randevular ──────────────────────────────────────────────
        // İptal, erteleme ve "randevum ne zaman" aynı listeyi okur. Bugünün
        // GEÇMİŞ saatleri elenir: 09:00'daki randevu için 14:00'te "iptal et"
        // demek anlamsız, listeye girerse yanlış kaydı iptal ettirir.
        const nowMin = nowTR.getUTCHours() * 60 + nowTR.getUTCMinutes();
        const loadUpcoming = async () => {
            if (!known?.id) return [] as any[];
            const { data } = await admin.from('reservations')
                .select('id, service, date, start_time, end_time, status, staff_id, customer_token')
                .eq('organization_id', orgId).eq('customer_id', known.id)
                .gte('date', todayStr).in('status', ['pending', 'confirmed'])
                .order('date', { ascending: true }).order('start_time', { ascending: true })
                .limit(5);
            return (data ?? []).filter((r: any) =>
                r.date > todayStr || timeToMin(String(r.start_time).slice(0, 5)) >= nowMin);
        };
        const lineOf = (r: any): M.AppointmentLine => ({
            service: r.service,
            dateLabel: fmtDate(r.date),
            time: String(r.start_time).slice(0, 5),
            pending: r.status === 'pending',
        });
        const clearSession = () => admin.from('whatsapp_sessions').delete()
            .eq('organization_id', orgId).eq('phone', phone);

        // ── A1. 24 saat hatırlatmasına yanıt (Dalga 3) ───────────────────────
        // Hatırlatma "Geliyor musunuz?" diye soruyor; müşterinin kuru "Evet"i
        // bir randevuya ait. Bu blok akışın EN BAŞINDA olmalı: aksi halde
        // "evet" yarım kalmış bir randevu akışının onayı sanılır.
        //
        // Yalnız akış YOKKEN çalışır — konuşmanın ortasındaki "evet" her zaman
        // o konuşmaya aittir.
        if (!inFlow && ruleConfirm && known?.id) {
            const { data: pendingReply } = await admin.from('reservations')
                .select('id, service, date, start_time, status')
                .eq('organization_id', orgId).eq('customer_id', known.id)
                .eq('reminder_24h_sent', true).is('customer_confirm', null)
                .gte('date', todayStr).in('status', ['pending', 'confirmed'])
                .order('date', { ascending: true }).limit(1).maybeSingle();

            if (pendingReply) {
                const at = new Date().toISOString();
                const timeLabel = String(pendingReply.start_time).slice(0, 5);
                if (ruleConfirm === 'yes') {
                    await admin.from('reservations')
                        .update({ customer_confirm: 'yes', customer_confirm_at: at })
                        .eq('id', pendingReply.id);
                    return reply(M.reminderConfirmed(msgCtx(), {
                        dateLabel: fmtDate(pendingReply.date), time: timeLabel,
                    }));
                }
                // "Hayır" = gelmeyecek. Slot serbest bırakılır ve hem bekleme
                // listesine hem işletmeciye haber verilir — salonun en pahalı
                // sorunu, boş kalıp dolu görünen slottur.
                await admin.from('reservations')
                    .update({ status: 'cancelled', customer_confirm: 'no', customer_confirm_at: at })
                    .eq('id', pendingReply.id).in('status', ['pending', 'confirmed']);
                announceFreedSlot(admin, orgId, pendingReply.date);
                notifyOwner(admin, orgId, {
                    title: 'Randevu iptal edildi',
                    body: `${known.name} · ${fmtDate(pendingReply.date)} ${timeLabel} — hatırlatmaya "gelemem" yanıtı verdi.`,
                    url: `/takvim?date=${pendingReply.date}`,
                    tag: `res-${pendingReply.id}`,
                });
                return reply(M.reminderDeclined(msgCtx()));
            }
        }

        // ── A2. Kayıtlı randevuyu iptal (Dalga 3) ────────────────────────────
        // Devam eden iptal onayı: "Bu randevunuzu iptal ediyorum, onaylıyor
        // musunuz?" sorusunun cevabı.
        if (state.cancelId && ruleConfirm) {
            const targetId = String(state.cancelId);
            await clearSession();
            if (ruleConfirm === 'no') return reply(M.cancelKept(msgCtx()));

            const { data: cancelled } = await admin.from('reservations')
                .update({ status: 'cancelled' })
                .eq('id', targetId).eq('organization_id', orgId)
                .in('status', ['pending', 'confirmed'])
                .select('id, service, date, start_time').maybeSingle();
            if (!cancelled) return reply(M.tooLateToChange(msgCtx(), orgPhone));

            const timeLabel = String(cancelled.start_time).slice(0, 5);
            announceFreedSlot(admin, orgId, cancelled.date);
            notifyOwner(admin, orgId, {
                title: 'Randevu iptal edildi',
                body: `${known?.name ?? phone} · ${fmtDate(cancelled.date)} ${timeLabel} — WhatsApp'tan iptal etti.`,
                url: `/takvim?date=${cancelled.date}`,
                tag: `res-${cancelled.id}`,
            });
            return reply(M.cancelDone(msgCtx(), {
                service: cancelled.service, dateLabel: fmtDate(cancelled.date), time: timeLabel,
            }));
        }

        // Birden fazla kayıt sunulmuştu; müşteri numarasını yazdı.
        if (Array.isArray(state.pickList) && state.pickList.length > 0) {
            const choice = detectListChoice(text, state.pickList.length);
            if (choice) {
                const picked = state.pickList[choice - 1];
                state.pickList = null;
                if (state.pickMode === 'iptal') {
                    state.cancelId = picked.id;
                    await saveState();
                    return reply(M.confirmCancel(msgCtx(), {
                        service: picked.service, dateLabel: picked.dateLabel, time: picked.time,
                    }));
                }
                state.rescheduleId = picked.id;
                state.serviceId = picked.serviceId;
                state.serviceName = picked.service;
                state.serviceDuration = picked.duration;
                state.reschedFrom = { dateLabel: picked.dateLabel, time: picked.time };
                await saveState();
                return reply(M.rescheduleStart(msgCtx(), {
                    service: picked.service, dateLabel: picked.dateLabel, time: picked.time,
                }));
            }
        }

        /**
         * İptal/erteleme akışını başlatır. Fonksiyona çıkarıldı çünkü iki farklı
         * yerden çağrılıyor: kural katmanı (aşağıda) ve model (aşağıdaki
         * 2. katmanda), ve iki kopya olsaydı biri güncellenip diğeri unutulurdu.
         */
        const startAppointmentChange = async (mode: 'iptal' | 'ertele') => {
            const rows = await loadUpcoming();
            if (rows.length === 0) {
                await clearSession();
                return reply(known?.id ? M.nothingToCancel(msgCtx()) : M.notRecognized(msgCtx()));
            }
            if (rows.length > 1) {
                state.pickMode = mode;
                state.pickList = rows.map((r: any) => ({
                    id: r.id, service: r.service, serviceId: null,
                    dateLabel: fmtDate(r.date), time: String(r.start_time).slice(0, 5),
                    duration: timeToMin(String(r.end_time).slice(0, 5)) - timeToMin(String(r.start_time).slice(0, 5)),
                }));
                // Erteleme için hizmet kimliği gerek: adından çözülür, çözülmezse
                // süre bilgisi randevunun kendisinden gelir (yukarıda hesaplandı).
                for (const p of state.pickList) {
                    p.serviceId = svcArr.find((s: any) => s.name === p.service)?.id ?? null;
                }
                await saveState();
                return reply(M.whichAppointment(msgCtx(), state.pickList.map((p: any) => ({
                    service: p.service, dateLabel: p.dateLabel, time: p.time,
                })), mode));
            }

            const r = rows[0];
            const timeLabel = String(r.start_time).slice(0, 5);
            const duration = timeToMin(String(r.end_time).slice(0, 5)) - timeToMin(timeLabel);
            if (mode === 'iptal') {
                state.cancelId = r.id;
                await saveState();
                return reply(M.confirmCancel(msgCtx(), {
                    service: r.service, dateLabel: fmtDate(r.date), time: timeLabel,
                }));
            }
            // Erteleme: normal randevu akışı çalışır, tek fark sonunda INSERT
            // yerine UPDATE yapılmasıdır (rescheduleId).
            state.rescheduleId = r.id;
            state.serviceId = svcArr.find((s: any) => s.name === r.service)?.id ?? null;
            state.serviceName = r.service;
            state.serviceDuration = duration > 0 ? duration : slotDuration;
            state.reschedFrom = { dateLabel: fmtDate(r.date), time: timeLabel };
            state.date = null; state.time = null; state.offeredTimes = false;
            await saveState();
            return reply(M.rescheduleStart(msgCtx(), {
                service: r.service, dateLabel: fmtDate(r.date), time: timeLabel,
            }));
        };

        if (intent === 'cancel_appointment') return startAppointmentChange('iptal');
        if (intent === 'reschedule') return startAppointmentChange('ertele');

        // ── Netleştirme sorusunun CEVABI ─────────────────────────────────────
        // Bir önceki turda numaralı seçenek sunmuştuk. Seçim kural katmanında
        // çözülür; modele hiç gidilmez, yanlış anlaşılma ihtimali sıfır.
        let forcedTopic: Topic | null = null;
        if (state.clarify && msgKind === 'text') {
            const opts = CLARIFY_OPTIONS[state.clarify as Clarify] ?? [];
            const choice = detectListChoice(text, opts.length);
            // Numara gelmediyse soruyu unutup normal akışa dönüyoruz: müşteri
            // cümleyle cevap vermiş olabilir ("aslında randevu almak istiyorum")
            // ve aynı soruyu ikinci kez sormak konuşmayı kilitler.
            state.clarify = null;
            await saveState();
            if (choice) {
                const picked = opts[choice - 1];
                if (picked.topic) forcedTopic = picked.topic;
                // book: konu yok, aşağıdaki randevu akışı devralır.
            }
        }

        // ── B. Bilgi soruları (Dalga 2) ──────────────────────────────────────
        // Kural katmanı konuyu adlandırabiliyorsa modele hiç gidilmez.
        const ruleTopic: Topic | null = forcedTopic ?? (msgKind === 'text' && intent === 'other'
            ? detectTopic(text)
            : null);
        // Tek başına birden fazla anlama gelen mesaj ("seanslar"): tahmin etmek
        // yerine SORULUR. Bildirilen olay buydu — seans ücretini soran müşteriye
        // bot hizmet listesi gönderiyordu.
        const clarifyKey: Clarify | null = !ruleTopic && !forcedTopic && msgKind === 'text' && intent === 'other'
            ? detectClarify(text)
            : null;
        // Hizmet adı da kuralla eşleşir. Eskiden bunu YALNIZ model yapıyordu
        // (adı geri yazıyor, kod listeyle karşılaştırıyordu); model bütçesi
        // dolunca hizmet hiç eşleşmedi ve bot her mesaja karşılamayla cevap
        // verip sonsuz döngüye girdi.
        const svcHit = state.serviceId ? { match: null, candidates: [] } : matchService(text, svcArr);

        // Belirsiz mesaj → soru. Gerçek bir hizmet adına denk geliyorsa
        // ("Seans" diye bir hizmet varsa) soru sorulmaz; randevu akışı işler.
        if (clarifyKey && !inFlow && !svcHit.match && svcHit.candidates.length === 0) {
            state.clarify = clarifyKey;
            await saveState();
            return reply(M.askClarify(msgCtx(), {
                question: clarifyQuestion(clarifyKey, text),
                options: CLARIFY_OPTIONS[clarifyKey],
            }));
        }

        // ── 2. katman: model ─────────────────────────────────────────────────
        // Model VARSAYILAN olarak çağrılır; yalnız kuralın mesajı tamamen
        // çözdüğü iki durumda atlanır. Tersini yapmak (yalnız eksik alan varken
        // çağırmak) "aslında lazer olsun" gibi fikir değişikliklerini kaçırıyor:
        // bütün alanlar dolu olduğu için model hiç sorulmuyor ve müşterinin
        // yeni isteği sessizce yutuluyordu.
        const ruleSettled =
            // Onay bekliyoruz ve net bir evet/hayır geldi — mesajın başka işi yok.
            (Boolean(state.awaitingConfirm) && ruleConfirm !== null)
            // Bilgi sorusunun konusu kuraldan çözüldü; cevabı veritabanı yazacak.
            || Boolean(ruleTopic)
            // Hizmet kuraldan net çözüldü; modele sorulacak bir şey kalmadı.
            || Boolean(svcHit.match)
            // Belirsizlik var: müşteriye soracağız, model tahmin etmesin.
            || svcHit.candidates.length > 1
            // Ya da kural son eksik alanı doldurdu ("yarın 3 buçuk").
            || (Boolean(state.serviceId)
                && Boolean(when.date || state.date)
                && Boolean(when.time || state.time)
                && Boolean(when.date || when.time));
        // Model bütçesi dolduysa modele sorulmaz — bot yine cevap verir,
        // yalnız serbest cümleleri anlamakta zorlanır. Susmaktan iyidir.
        const needsAi = !ruleSettled && aiBudgetLeft;
        const ex: Extraction = needsAi
            ? (await extractWithAi(admin, {
                services: svcArr, today: todayStr, todayName, state, message: text,
                known: { date: when.date, time: when.time },
                history,
            }) ?? { ...EMPTY_EXTRACTION })
            : { ...EMPTY_EXTRACTION };

        // Kural her zaman modelin üstüne yazar — sağlayıcı ne derse desin.
        if (when.date) ex.date = when.date;
        if (when.time) ex.time = when.time;
        if (ruleConfirm) ex.confirm = ruleConfirm;
        if (intent === 'cancel') ex.intent = 'cancel';

        // Model erteleme niyeti gördü ("perşembeye alabilir miyiz acaba").
        //
        // İPTAL BİLİNÇLİ OLARAK BURADA YOK: randevu silmek geri alınamaz ve bu
        // dosyanın başındaki kural açık — geri alınamaz işlem modele sorulmaz.
        // Erteleme kayıp üretmez, üstelik sonunda müşteri onayı isteniyor.
        if (!inFlow && ex.intent === 'reschedule') return startAppointmentChange('ertele');

        // İptal niyeti (konuşmadan vazgeçme)
        if (ex.intent === 'cancel') {
            await admin.from('whatsapp_sessions').delete().eq('organization_id', orgId).eq('phone', phone);
            return reply(M.conversationCancelled(msgCtx()));
        }

        // ── B. Bilgi sorusuna cevap ──────────────────────────────────────────
        // Konu kuraldan ya da modelden gelmiş olabilir; cevabı HER İKİ HÂLDE de
        // veritabanı yazar. Modelin ürettiği tek şey konunun adıdır.
        const topic: Topic | null = ruleTopic ?? ex.topic;
        if (topic && !(state.awaitingConfirm && ruleConfirm !== null)) {
            // Kişisel veri duvarı: yazan numara bir müşteri kaydıyla
            // eşleşmiyorsa randevu/paket/bakiye PAYLAŞILMAZ. Numarayı bilen
            // herkes başkasının bilgisini okuyabilirdi.
            if (PERSONAL.has(topic) && !known?.id) {
                return reply(M.notRecognized(msgCtx()));
            }

            if (topic === 'my_appointment') {
                const rows = await loadUpcoming();
                const token = rows[0]?.customer_token;
                return reply(M.myAppointments(
                    msgCtx(), rows.map(lineOf),
                    token ? `${APP_ORIGIN}/booking/${token}` : null,
                ));
            }

            if (topic === 'my_package') {
                const { data: plans } = await admin.from('treatment_plans')
                    .select('title, session_count, sessions_done')
                    .eq('organization_id', orgId).eq('customer_id', known!.id)
                    .eq('status', 'active')
                    .order('created_at', { ascending: false }).limit(5);
                // Tek seanslık plan "paket" değildir, tek bir işlemin kaydıdır;
                // listelenirse müşteri her tedavisini paket sanır.
                const rows = (plans ?? [])
                    .filter((p: any) => Number(p.session_count) > 1)
                    .map((p: any) => ({
                        title: p.title,
                        done: Number(p.sessions_done) || 0,
                        total: Number(p.session_count) || 0,
                    }));
                return reply(M.myPackages(msgCtx(), rows));
            }

            if (topic === 'my_balance') {
                const [{ data: plans }, { data: pays }] = await Promise.all([
                    admin.from('treatment_plans').select('id, total_amount, status')
                        .eq('organization_id', orgId).eq('customer_id', known!.id),
                    admin.from('payments').select('amount, treatment_plan_id, type')
                        .eq('organization_id', orgId).eq('customer_id', known!.id),
                ]);
                // Hesap src/lib/patientBalance.ts ile AYNI formülden geçer
                // (finance.ts aynası); üç ekranın üç farklı rakam göstermesi
                // tam olarak bu yüzden yasaklandı.
                const fin = computeBalance(
                    (plans ?? []).map((p: any) => ({
                        id: p.id, totalAmount: Number(p.total_amount) || 0, status: p.status,
                    })),
                    (pays ?? []).map((p: any) => ({
                        amount: Number(p.amount) || 0,
                        treatmentPlanId: p.treatment_plan_id ?? undefined,
                        type: p.type,
                    })),
                );
                if (fin.overpaid > 0) {
                    return reply(M.myBalance(msgCtx(), {
                        balanceText: formatTL(0), overpaidText: formatTL(fin.overpaid),
                    }));
                }
                if (fin.balance <= 0) return reply(M.noBalance(msgCtx()));
                return reply(M.myBalance(msgCtx(), { balanceText: formatTL(fin.balance) }));
            }

            if (topic === 'hours') {
                // Gün adı settings JSON'ından değil buradan gelir: kayıtlarda
                // dayName kimi org'da yok, kimi org'da eski yazımla duruyor.
                // Pazartesiden başlanır — takvim değil, insan sırası.
                const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
                const lines = [1, 2, 3, 4, 5, 6, 0]
                    .map((day) => {
                        const h = orgHours.find((w) => Number(w?.day) === day);
                        if (!h) return null;
                        return {
                            label: DAY_NAMES[day],
                            text: h.isOff ? 'Kapalı' : `${h.start} – ${h.end}`,
                        };
                    })
                    .filter((l): l is M.HoursLine => l !== null);
                return reply(M.hoursInfo(msgCtx(), { lines, phone: orgPhone }));
            }

            if (topic === 'location') {
                return reply(M.locationInfo(msgCtx(), {
                    address: org?.address ?? null,
                    mapsUrl: org?.maps_url ?? null,
                    phone: orgPhone,
                }));
            }

            if (topic === 'human') {
                // Bot çekilir ve yarım kalan akış silinir: devrettikten sonra
                // "hangi gün gelmek istersiniz" diye devam etmek, tam olarak
                // istenmeyen şey.
                await clearSession();
                notifyOwner(admin, orgId, {
                    title: 'Müşteri sizinle görüşmek istiyor',
                    body: `${known?.name ?? phone}: "${text.slice(0, 120)}"`,
                    url: '/mesajlar',
                    tag: `handoff-${phone}`,
                });
                return reply(M.handoff(msgCtx(), orgPhone));
            }

            // price — hizmet belliyse yalnız onun fiyatı, değilse liste.
            // Fiyatlar services.price'tan okunur; model rakam üretmez.
            const priced = svcHit.match ? [svcHit.match] : svcArr;
            return reply(M.priceInfo(msgCtx(), priced.map((s: any) => ({
                name: s.name,
                priceText: Number(s.price) > 0 ? formatTL(Number(s.price)) : null,
                duration: s.duration,
            }))));
        }

        // State'i güncelle (yeni bilgiyle). Kural eşleşmesi modelin üstüne yazar.
        if (svcHit.match) {
            state.serviceId = svcHit.match.id;
            state.serviceName = svcHit.match.name;
            state.serviceDuration = svcHit.match.duration;
        } else if (ex.service) {
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

        // ── Eksik bilgi → sor ──
        // Erteleme hizmeti zaten biliyor (randevunun kendisinden geliyor).
        // Hizmet listeden silinmiş ya da adı değişmişse serviceId boş kalır;
        // o zaman bile hizmet SORULMAZ — randevu taşınıyor, yeniden alınmıyor.
        if (!state.serviceId && !state.rescheduleId) {
            // "diş" hem "Diş teli" hem "Diş temizliği" olabilir: tahmin etmek
            // yerine iki adayı sorarız. Yanlış hizmetle randevu,
            // randevusuzluktan kötüdür.
            if (svcHit.candidates.length > 1) {
                await saveState();
                return reply(M.askWhichService(msgCtx(), svcHit.candidates));
            }
            // Karşılama BİR KEZ gönderilir. Aynı hizmet listesini ikinci kez
            // yollamak müşteriye "bir daha dene" demenin kibarcasıydı; canlıda
            // müşteri ikinci denemede de anlaşılmayınca vazgeçiyordu. İkinci
            // turda bot artık SORU sorar ve seçenek verir.
            if (state.greeted) {
                state.clarify = 'genel';
                await saveState();
                return reply(M.askClarify(msgCtx(), {
                    question: CLARIFY_QUESTION.genel,
                    options: CLARIFY_OPTIONS.genel,
                }));
            }
            state.greeted = true;
            await saveState();
            return reply(M.greeting(msgCtx(), svcArr));
        }
        // "Hangi günler müsaitsiniz?" — canlıda bot bu soruya aynı saat
        // listesini tekrar gönderdi. Gün sorusu ayrı bir istek: önümüzdeki iki
        // haftada en az bir slotu olan günler sıralanır.
        if (intent === 'availability') {
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
        const { data: dayResRaw } = await admin.from('reservations').select('id, staff_id, resource_id, start_time, end_time').eq('organization_id', orgId).eq('date', date).neq('status', 'cancelled');
        // Erteleme aynı güne yapılıyorsa randevu KENDİ yerini dolu gösterirdi:
        // müşteri 14:00'ü 14:30'a çekmek isterken 14:00 listede görünmez ve
        // "o saat dolu" cevabını kendi randevusundan alırdı.
        const dayRes = (dayResRaw || []).filter((r: any) => r.id !== state.rescheduleId);
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
                dayReservations: dayRes.filter((r: any) => r.staff_id === st.id),
            })),
            orgHours, weekday, serviceDuration, slotDuration, minStart,
        });

        // Kabin süzgeci: personel müsait olsa da kabin yoksa o saat sunulmaz.
        // WhatsApp randevuları bugüne kadar resource_id'siz yazılıyordu ve
        // operasyon ekranında kabinsiz düşüyordu.
        const resourceBusy = dayRes
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
        const ownerId = org?.owner_id;

        // ── ONAY: erteleme ise TAŞI (Dalga 3) ────────────────────────────────
        // Yeni kayıt açılmaz. Açılsaydı müşteri iki randevulu görünür, eskisi
        // salonun takviminde ölü bir slot olarak kalırdı.
        if (state.rescheduleId) {
            const from = state.reschedFrom || { dateLabel: '', time: '' };
            const { data: moved, error: moveError } = await admin.from('reservations')
                .update({
                    date, start_time: state.time, end_time: endTime,
                    staff_id: chosenStaff, resource_id: chosenResource,
                    // Taşınan randevu için hatırlatmalar ve müşteri yanıtı
                    // sıfırlanır: yeni saat için yeniden hatırlatılmalı.
                    reminder_24h_sent: false, reminder_2h_sent: false,
                    customer_confirm: null, customer_confirm_at: null,
                })
                .eq('id', state.rescheduleId).eq('organization_id', orgId)
                .in('status', ['pending', 'confirmed'])
                .select('id, service, customer_token').maybeSingle();

            if (moveError && isReservationConflict(moveError)) {
                const conflicted = state.time;
                state.time = null; state.awaitingConfirm = false;
                await saveState();
                return reply(M.slotJustTaken(msgCtx(), available.filter((t) => t !== conflicted).slice(0, 8)));
            }
            if (moveError || !moved) {
                console.error('whatsapp reschedule error', moveError);
                await clearSession();
                return reply(M.tooLateToChange(msgCtx(), orgPhone));
            }

            await clearSession();
            notifyOwner(admin, orgId, {
                title: 'Randevu ertelendi',
                body: `${known?.name ?? phone} · ${from.dateLabel} ${from.time} → ${fmtDate(date)} ${state.time}`,
                url: `/takvim?date=${date}`,
                tag: `res-${moved.id}`,
            });
            return reply(M.rescheduleDone(msgCtx(), {
                service: moved.service, dateLabel: fmtDate(date), time: String(state.time),
                fromLabel: from.dateLabel, fromTime: from.time,
            }));
        }

        const svc = svcArr.find(s => s.id === state.serviceId)!;

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

        // İşletmeciye haber ver — bot gece yarısı randevu alabiliyor ve bugüne
        // kadar işletmeci bunu ertesi sabah takvimi açınca öğreniyordu.
        notifyOwner(admin, orgId, {
            title: autoConfirm ? 'Yeni randevu' : 'Yeni randevu — onay bekliyor',
            body: `${customerName} · ${fmtDate(date)} ${state.time} — ${svc.name}`,
            url: `/takvim?date=${date}`,
            tag: `res-${reservation.id}`,
        });

        // Konuşmayı temizle + onay mesajı
        await clearSession();
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
