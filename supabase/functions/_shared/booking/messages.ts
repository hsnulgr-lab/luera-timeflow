// Botun ağzı — müşteriye giden HER cümle burada.
//
// Neden tek dosya: mesajlar edge fonksiyonunun içine serpiştirilmişti ve
// canlıda tek bir konuşmada üslup dört kez değişti — "istersiniz" → "istersin"
// → "sana uygun" → "Onaylıyor musun" → "Seni bekliyoruz". Ayrıca sektör
// profili (sectorProfiles.ts → settings.comms) hiç okunmuyordu: diş kliniği
// "Dolgu" için 💆 ve 🌷 emojisi alıyordu.
//
// ÜÇ KURAL
//
// 1. HER ZAMAN "SİZ". Türkçede bir işletme müşterisine "siz" der; "sen" tanış
//    olmayanda, yaşlıda ve avukat/klinik gibi sektörlerde yanlış düşer. Sıcaklık
//    sen/sen'den değil kelime seçiminden gelir. Avukat profilinin persona'sı
//    zaten "asla senli benli konuşma" diyor — o kural artık tüm bota işliyor.
//
// 2. MESAJ BAŞINA EN FAZLA BİR EMOJİ, o da sektörün kendi emojisi. Detay
//    satırlarında emoji yerine *kalın* etiket kullanılır: 💼🗓️⏰ dizilimi
//    ikon taklidi yapıyordu ve şablon gibi duruyordu.
//
// 3. SEKTÖR SÖZCÜĞÜ profilden gelir: "tedavi", "işlem", "seans", "prova".
//    Kliniğe "randevunuz", kuaföre "işleminiz" denir.
//
// Saf modül: tests/wa-booking.test.mjs doğrudan import eder.

export interface Comms {
    persona: string;
    audience: string;
    /** "tedavi" | "işlem" | "seans" — hizmetin sektördeki adı. */
    serviceWord: string;
    /** İyelik hâli: "tedavinizi". Türkçe ek uyumu kural uydurmaya gelmez. */
    servicePhrase: string;
    emoji: string;
    recall?: { concept: string; afterDays: number };
    guardrail?: string;
}

export const NEUTRAL_COMMS: Comms = {
    persona: 'Randevulu hizmet veren bir işletmesin; samimi, nazik ve net ol.',
    audience: 'müşterimiz',
    serviceWord: 'randevu',
    servicePhrase: 'randevunuzu',
    emoji: '🗓️',
};

/** settings.comms ham JSON'undan güvenli profil. Yoksa nötr — bot susmaz. */
// deno-lint-ignore no-explicit-any
export function resolveComms(raw: any): Comms {
    if (!raw || typeof raw !== 'object' || !raw.persona) return NEUTRAL_COMMS;
    return {
        persona: String(raw.persona),
        audience: String(raw.audience ?? NEUTRAL_COMMS.audience),
        serviceWord: String(raw.serviceWord ?? NEUTRAL_COMMS.serviceWord),
        servicePhrase: String(raw.servicePhrase ?? NEUTRAL_COMMS.servicePhrase),
        emoji: String(raw.emoji ?? NEUTRAL_COMMS.emoji),
        recall: raw.recall?.concept
            ? { concept: String(raw.recall.concept), afterDays: Number(raw.recall.afterDays) || 90 }
            : undefined,
        guardrail: raw.guardrail ? String(raw.guardrail) : undefined,
    };
}

export interface Ctx {
    comms: Comms;
    businessName: string;
    /** Tanınan müşterinin ilk adı; yer tutucu ise null (bkz. identity.ts). */
    firstName?: string | null;
}

/** Saat listesi: satır başına dört tane. Tek uzun satır telefonda kayıyor. */
function timeGrid(times: string[]): string {
    const rows: string[] = [];
    for (let i = 0; i < times.length; i += 4) rows.push(times.slice(i, i + 4).join(' · '));
    return rows.join('\n');
}

/** Randevu künyesi — üç mesajda aynı biçim, emoji yerine kalın etiket. */
function detailBlock(c: Ctx, o: { service: string; dateLabel: string; time: string }): string {
    const label = c.comms.serviceWord.charAt(0).toLocaleUpperCase('tr') + c.comms.serviceWord.slice(1);
    return `*${label}:* ${o.service}\n*Tarih:* ${o.dateLabel}\n*Saat:* ${o.time}`;
}

// ── Karşılama ───────────────────────────────────────────────────────────────

export function greeting(c: Ctx, services: { name: string; duration: number }[]): string {
    const list = services.slice(0, 8)
        .map((s) => `• *${s.name}* · ${s.duration} dk`)
        .join('\n');
    const hello = c.firstName
        ? `Merhaba ${c.firstName}! ${c.comms.emoji}`
        : `Merhaba! ${c.comms.emoji}`;
    return `${hello}\nBen *${c.businessName}* randevu asistanıyım.\n\n`
        + `Hangi ${c.comms.serviceWord} için gelmek istersiniz?\n\n${list}\n\n`
        + `Adını yazmanız yeterli, gerisini ben hallederim.`;
}

/**
 * Birden fazla hizmet aynı ölçüde uydu — tahmin etmek yerine soruyoruz.
 * "diş" hem "Diş teli" hem "Diş temizliği" olabilir; yanlış hizmetle randevu,
 * randevusuzluktan kötüdür.
 */
export function askWhichService(c: Ctx, candidates: { name: string; duration: number }[]): string {
    const list = candidates.map((s) => `• *${s.name}* · ${s.duration} dk`).join('\n');
    return `Bunlardan hangisini kastettiniz?\n\n${list}`;
}

export function askDay(c: Ctx, serviceName: string): string {
    return `*${serviceName}*, tabii. Hangi gün gelmek istersiniz?\n\n`
        + `"yarın", "cumartesi" ya da "20 Ağustos" diyebilirsiniz. `
        + `Müsait günleri görmek isterseniz *hangi günler* yazmanız yeterli.`;
}

/**
 * "Hangi günler müsaitsiniz?" — canlıda bot bu soruya aynı saat listesini
 * tekrar gönderdi. Gün sorusu ayrı bir istek ve ayrı bir cevabı olmalı.
 */
export function offerDays(c: Ctx, o: { serviceName: string; days: { iso: string; label: string }[] }): string {
    if (o.days.length === 0) {
        return `*${o.serviceName}* için önümüzdeki iki hafta dolu görünüyor. `
            + `Bizi arayabilirsiniz, size bir yer açalım.`;
    }
    const list = o.days.map((d) => `• ${d.label}`).join('\n');
    return `*${o.serviceName}* için en yakın müsait günler:\n\n${list}\n\n`
        + `Hangisini isterseniz yazın, o günün saatlerini göstereyim.`;
}

// ── Saat ────────────────────────────────────────────────────────────────────

export function offerTimes(c: Ctx, o: { dateLabel: string; serviceName: string; times: string[] }): string {
    return `${o.dateLabel} günü *${o.serviceName}* için şu saatlerde yerimiz var:\n\n`
        + `${timeGrid(o.times)}\n\nHangisi size uygun?`;
}

export function timeTaken(c: Ctx, o: { wanted: string; dateLabel: string; times: string[] }): string {
    if (o.times.length === 0) {
        return `${o.wanted} maalesef dolu ve ${o.dateLabel} için başka uygun saat kalmadı. `
            + `Başka bir gün deneyelim mi?`;
    }
    return `${o.wanted} maalesef dolu. ${o.dateLabel} için kalan saatler:\n\n${timeGrid(o.times)}\n\n`
        + `Hangisini ayarlayalım?`;
}

export function dayFull(c: Ctx, dateLabel: string): string {
    return `${dateLabel} maalesef dolu. Başka bir gün deneyelim mi? `
        + `*hangi günler* yazarsanız müsait günleri sıralayayım.`;
}

export function slotJustTaken(c: Ctx, times: string[]): string {
    if (times.length === 0) {
        return `O saat az önce doldu ve bugün için başka yer kalmadı. Başka bir gün deneyelim mi?`;
    }
    return `O saat az önce doldu. Kalan saatler:\n\n${timeGrid(times)}\n\nHangisini seçelim?`;
}

// ── Onay ────────────────────────────────────────────────────────────────────

export function summary(c: Ctx, o: { service: string; dateLabel: string; time: string }): string {
    return `Son bir kontrol edelim:\n\n`
        + `${detailBlock(c, o)}\n\nOnaylıyor musunuz? *Evet* yazmanız yeterli.`;
}

export function confirmNudge(c: Ctx, o: { service: string; dateLabel: string; time: string }): string {
    return `Onaylamak için *Evet*, vazgeçmek için *Hayır* yazabilirsiniz.\n\n`
        + `${o.service} · ${o.dateLabel} · ${o.time}`;
}

export function declined(c: Ctx, o: { dateLabel: string; times: string[] }): string {
    if (o.times.length === 0) return `Tamamdır. Başka bir gün bakmamı ister misiniz?`;
    return `Tamamdır. ${o.dateLabel} için başka bir saat ister misiniz?\n\n${timeGrid(o.times)}`;
}

// ── Sonuç ───────────────────────────────────────────────────────────────────

export function created(c: Ctx, o: {
    service: string; dateLabel: string; time: string;
    manageUrl?: string | null;
    /** Otomatik onay kapalıysa randevu 'pending' — "hazır" demek yanıltıcı. */
    pending?: boolean;
}): string {
    const head = o.pending
        ? `Talebinizi aldım. ${c.comms.emoji}`
        : `Hazır, kaydınızı aldım. ${c.comms.emoji}`;
    const tail = o.pending
        ? `Ekibimiz onaylayınca size haber vereceğim.`
        : `Sizi bekliyoruz.`;
    const manage = o.manageUrl ? `\n\nİptal veya değişiklik için:\n${o.manageUrl}` : '';
    return `${head}\n\n${detailBlock(c, o)}\n\n${tail}${manage}`;
}

/**
 * Müşteri randevusunu YÖNETİM LİNKİNDEN iptal etti (booking-manage).
 *
 * Bu iki mesaj bota değil web akışına aitti ve kendi ağzıyla konuşuyordu
 * ("Randevunuz iptal edildi ❌", "🗓️⏰💼" dizilimi). Aynı müşteri aynı gün
 * hem bottan hem linkten mesaj alabiliyor; iki farklı ses tek işletmeden
 * geliyormuş gibi durmuyordu.
 */
export function cancelledByCustomer(c: Ctx, o: {
    service: string; dateLabel: string; time: string;
}): string {
    const who = c.firstName ? `${c.firstName}, randevunuzu` : 'Randevunuzu';
    return `${who} iptal ettim.\n\n${detailBlock(c, o)}\n\n`
        + `Yeni bir randevu için buraya yazmanız yeterli.`;
}

/** Müşteri randevusunu linkten başka bir saate taşıdı. */
export function rescheduledByCustomer(c: Ctx, o: {
    service: string; dateLabel: string; time: string;
}): string {
    return `Randevunuzu taşıdım. ${c.comms.emoji}\n\n${detailBlock(c, o)}\n\nGörüşmek üzere.`;
}

export function conversationCancelled(c: Ctx): string {
    return `Tamamdır, iptal ettim. Yeni bir randevu için istediğiniz zaman yazabilirsiniz.`;
}

export function eligibilityBlocked(c: Ctx, reason: string | null): string {
    const why = reason ? ` (${reason})` : '';
    return `Bu ${c.comms.serviceWord} için randevuyu buradan oluşturamıyorum${why}.\n\n`
        + `Kayıtlarımızdaki bilgiler nedeniyle ekibimizin onayı gerekiyor. `
        + `Bize yazmanız ya da telefonla ulaşmanız yeterli, hemen ilgileneceğiz.`;
}

export function createFailed(c: Ctx): string {
    return `Şu anda randevu oluşturamadım. Kısa süre sonra tekrar deneyebilir `
        + `ya da bizi arayabilirsiniz.`;
}

// ── Bilgi cevapları (Dalga 2) ───────────────────────────────────────────────
//
// Bu bölümdeki HİÇBİR sayı model tarafından üretilmez. Tutar, tarih, saat ve
// kalan seans veritabanından okunup buraya parametre olarak geçilir; modelin
// tek işi konuyu adlandırmaktı (bkz. inquiry.ts).

export interface AppointmentLine {
    service: string;
    dateLabel: string;
    time: string;
    staffName?: string | null;
    /** Onay bekliyorsa müşteriye söylenir — "kesin" sanıp gelmesin. */
    pending?: boolean;
}

export function myAppointments(c: Ctx, rows: AppointmentLine[], manageUrl?: string | null): string {
    if (rows.length === 0) {
        return `Kayıtlarımızda yaklaşan bir ${c.comms.serviceWord} göremedim. `
            + `Randevu almak isterseniz hemen ayarlayabilirim — hangi ${c.comms.serviceWord} için gelmek istersiniz?`;
    }
    const list = rows.map((r) => {
        const who = r.staffName ? ` · ${r.staffName}` : '';
        const flag = r.pending ? ' _(onay bekliyor)_' : '';
        return `• *${r.dateLabel}* ${r.time} — ${r.service}${who}${flag}`;
    }).join('\n');
    const head = rows.length === 1 ? `Yaklaşan ${c.comms.serviceWord}nız:` : `Yaklaşan kayıtlarınız:`;
    const manage = manageUrl ? `\n\nDeğiştirmek ya da iptal etmek için:\n${manageUrl}` : '';
    return `${head}\n\n${list}${manage}`;
}

export interface PackageLine { title: string; done: number; total: number }

export function myPackages(c: Ctx, rows: PackageLine[]): string {
    if (rows.length === 0) {
        return `Adınıza kayıtlı, devam eden bir paket göremedim. `
            + `Paketlerimizi merak ediyorsanız bize yazın, detaylıca anlatalım.`;
    }
    const list = rows.map((r) => {
        const left = Math.max(0, r.total - r.done);
        return `• *${r.title}* — ${left} seans kaldı _(${r.done}/${r.total})_`;
    }).join('\n');
    return `Paket durumunuz:\n\n${list}\n\nSeans planlamak isterseniz yazmanız yeterli.`;
}

export function myBalance(c: Ctx, o: { balanceText: string; overpaidText?: string | null }): string {
    if (o.overpaidText) {
        return `Hesabınızda *${o.overpaidText}* alacağınız görünüyor. `
            + `Bir sonraki ${c.comms.serviceWord}nızda mahsup edeceğiz.`;
    }
    return `Güncel bakiyeniz: *${o.balanceText}*.\n\n`
        + `Ödeme ve detaylar için salonda size yardımcı oluruz.`;
}

export function noBalance(c: Ctx): string {
    return `Ödenmemiş bir bakiyeniz görünmüyor, hesabınız temiz. ${c.comms.emoji}`;
}

/**
 * Kişisel veri istenen bir soru ama yazan numara hiçbir müşteri kaydıyla
 * eşleşmiyor. Veri VERİLMEZ — "randevum ne zaman" diye soran herkese kayıt
 * okumak, numarayı bilen herkese başkasının bilgisini açmak olurdu.
 */
export function notRecognized(c: Ctx): string {
    return `Bu numarayı kayıtlarımızda bulamadım, o yüzden bilgilerinizi buradan paylaşamıyorum. `
        + `Bizi arayabilir ya da adınızı yazıp yeni bir ${c.comms.serviceWord} alabilirsiniz.`;
}

export interface HoursLine { label: string; text: string }

export function hoursInfo(c: Ctx, o: { lines: HoursLine[]; phone?: string | null }): string {
    if (o.lines.length === 0) {
        return `Çalışma saatlerimiz henüz sistemde tanımlı değil. `
            + `${o.phone ? `Bize ${o.phone} numarasından ulaşabilirsiniz.` : 'Bize yazarsanız hemen bilgi verelim.'}`;
    }
    const list = o.lines.map((l) => `${l.label}: ${l.text}`).join('\n');
    return `*${c.businessName}* çalışma saatlerimiz:\n\n${list}\n\n`
        + `Randevu almak isterseniz hemen bakabilirim.`;
}

export interface PriceLine { name: string; priceText: string | null; duration: number }

export function priceInfo(c: Ctx, rows: PriceLine[]): string {
    const priced = rows.filter((r) => r.priceText);
    if (priced.length === 0) {
        return `Fiyatlarımız ${c.comms.serviceWord}nın kapsamına göre değişiyor, o yüzden buradan net bir rakam vermek doğru olmaz. `
            + `Bize yazarsanız ekibimiz size özel bilgi versin.`;
    }
    const list = priced.map((r) => `• *${r.name}* · ${r.priceText} _(${r.duration} dk)_`).join('\n');
    const note = priced.length < rows.length
        ? `\n\nListede olmayan ${c.comms.serviceWord}ler için bize yazmanız yeterli.`
        : '';
    return `Güncel fiyatlarımız:\n\n${list}${note}\n\n`
        + `Randevu oluşturmamı isterseniz ${c.comms.serviceWord} adını yazmanız yeterli.`;
}

export function locationInfo(c: Ctx, o: {
    address?: string | null; mapsUrl?: string | null; phone?: string | null;
}): string {
    if (!o.address && !o.mapsUrl) {
        return `Adres bilgimiz henüz sistemde tanımlı değil. `
            + `${o.phone ? `Bize ${o.phone} numarasından ulaşabilirsiniz.` : 'Bize yazarsanız tarif edelim.'}`;
    }
    const parts = [`*${c.businessName}*`];
    if (o.address) parts.push(o.address);
    if (o.mapsUrl) parts.push(`Yol tarifi:\n${o.mapsUrl}`);
    if (o.phone) parts.push(`Telefon: ${o.phone}`);
    return parts.join('\n\n');
}

/**
 * Müşteri insana bağlanmak istedi. Bot ISRAR ETMEZ ve konuşmayı bırakır —
 * "size nasıl yardımcı olabilirim" diye devam etmek, tam olarak istenmeyen şey.
 */
export function handoff(c: Ctx, phone?: string | null): string {
    const call = phone ? `\n\nDilerseniz ${phone} numarasından da ulaşabilirsiniz.` : '';
    return `Tabii, ekibimize haber verdim — en kısa sürede size dönecekler. ${c.comms.emoji}${call}`;
}

// ── İptal / erteleme (Dalga 3) ──────────────────────────────────────────────

/** Hangi randevunun iptal edileceği belirsiz — müşteri seçsin. */
export function whichAppointment(c: Ctx, rows: AppointmentLine[], verb: 'iptal' | 'ertele'): string {
    const list = rows.map((r, i) => `${i + 1}. *${r.dateLabel}* ${r.time} — ${r.service}`).join('\n');
    const what = verb === 'iptal' ? 'iptal etmek' : 'ertelemek';
    return `Birden fazla kaydınız var. Hangisini ${what} istersiniz?\n\n${list}\n\n`
        + `Numarasını yazmanız yeterli.`;
}

export function confirmCancel(c: Ctx, o: { service: string; dateLabel: string; time: string }): string {
    return `Bu ${c.comms.serviceWord}nızı iptal ediyorum:\n\n${detailBlock(c, o)}\n\n`
        + `Onaylıyor musunuz? *Evet* yazmanız yeterli.`;
}

export function cancelDone(c: Ctx, o: { service: string; dateLabel: string; time: string }): string {
    const who = c.firstName ? `${c.firstName}, kaydınızı` : 'Kaydınızı';
    return `${who} iptal ettim.\n\n${detailBlock(c, o)}\n\n`
        + `Yeni bir ${c.comms.serviceWord} için istediğiniz zaman yazabilirsiniz.`;
}

export function cancelKept(c: Ctx): string {
    return `Tamamdır, kaydınız duruyor. Başka bir isteğiniz olursa yazmanız yeterli.`;
}

export function nothingToCancel(c: Ctx): string {
    return `Yaklaşan bir kaydınız görünmüyor, iptal edecek bir şey yok. `
        + `Yeni bir ${c.comms.serviceWord} almak isterseniz yardımcı olayım.`;
}

/** Erteleme başladı: hangi randevunun taşınacağı belli, yeni gün soruluyor. */
export function rescheduleStart(c: Ctx, o: { service: string; dateLabel: string; time: string }): string {
    return `Mevcut kaydınız:\n\n${detailBlock(c, o)}\n\n`
        + `Hangi güne taşıyalım? "yarın", "cumartesi" ya da "20 Ağustos" diyebilirsiniz.`;
}

export function rescheduleDone(c: Ctx, o: {
    service: string; dateLabel: string; time: string; fromLabel: string; fromTime: string;
}): string {
    return `Kaydınızı taşıdım. ${c.comms.emoji}\n\n`
        + `~${o.fromLabel} ${o.fromTime}~\n${detailBlock(c, o)}\n\nGörüşmek üzere.`;
}

export function tooLateToChange(c: Ctx, phone?: string | null): string {
    const call = phone ? ` ${phone} numarasından bize ulaşabilirsiniz.` : ' Bize yazmanız yeterli.';
    return `Bu kaydı buradan değiştiremiyorum — saatine çok az kaldı ya da geçmişte kalmış.${call}`;
}

// ── 24 saat onay döngüsü (Dalga 3) ──────────────────────────────────────────

/** Müşteri hatırlatmaya "Evet" dedi. Tek satır — konuşmayı uzatmaz. */
export function reminderConfirmed(c: Ctx, o: { dateLabel: string; time: string }): string {
    return `Harika, sizi ${o.dateLabel} saat ${o.time}'de bekliyoruz. ${c.comms.emoji}`;
}

/** Müşteri "Hayır" dedi → randevu iptal edildi ve yeri serbest bırakıldı. */
export function reminderDeclined(c: Ctx): string {
    return `Anlıyorum, kaydınızı iptal ettim ve yerinizi serbest bıraktım. `
        + `Uygun olduğunuzda yazın, yeni bir ${c.comms.serviceWord} ayarlayalım.`;
}

// ── Konuşma dışı ────────────────────────────────────────────────────────────

export function mediaUnsupported(c: Ctx): string {
    return `Sesli mesajları ve görselleri okuyamıyorum. Yazarsanız hemen yardımcı olurum.`;
}

export function optedOut(c: Ctx): string {
    return `Anlaşıldı, bundan sonra otomatik mesaj göndermeyeceğiz.\n\n`
        + `Tekrar almak isterseniz *BAŞLAT* yazmanız yeterli.`;
}

/**
 * Akış koruması devreye girdi. Botun SUSMASI yerine bu mesaj gider — canlıda
 * limit dolunca hiçbir şey dönmüyordu ve hem müşteri hem işletme "bot bozuldu"
 * sanıyordu. Saatte bir kez gönderilir, sonra gerçekten sessiz kalınır.
 */
export function cooldown(c: Ctx): string {
    return `Şu an çok fazla mesaj aldım, biraz yavaşlamam gerekiyor. ${c.comms.emoji}\n\n`
        + `Birazdan yazarsanız kaldığımız yerden devam ederiz. Acele bir durumsa `
        + `bizi arayabilirsiniz.`;
}

export function optedIn(c: Ctx): string {
    return `Tekrar hoş geldiniz! ${c.comms.emoji} Bilgilendirme mesajlarınız yeniden açık.`;
}
