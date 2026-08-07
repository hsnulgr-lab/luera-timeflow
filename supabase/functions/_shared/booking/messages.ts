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
        ? `Merhaba ${c.firstName}! ${c.comms.emoji}\n*${c.businessName}*`
        : `Merhaba! ${c.comms.emoji}\n*${c.businessName}*'a hoş geldiniz.`;
    return `${hello}\n\nHangi ${c.comms.serviceWord} için randevu oluşturalım?\n\n${list}\n\n`
        + `Adını yazmanız yeterli.`;
}

export function askDay(c: Ctx, serviceName: string): string {
    return `*${serviceName}* için ilerleyelim. Hangi gün gelmek istersiniz?\n\n`
        + `"yarın", "cumartesi" ya da "20 Ağustos" gibi yazabilirsiniz.`;
}

// ── Saat ────────────────────────────────────────────────────────────────────

export function offerTimes(c: Ctx, o: { dateLabel: string; serviceName: string; times: string[] }): string {
    return `${o.dateLabel} · *${o.serviceName}*\nUygun saatler:\n\n${timeGrid(o.times)}\n\nHangisi size uygun?`;
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
    return `${dateLabel} için uygun yer kalmamış. Başka bir gün deneyelim mi?`;
}

export function slotJustTaken(c: Ctx, times: string[]): string {
    if (times.length === 0) {
        return `O saat az önce doldu ve bugün için başka yer kalmadı. Başka bir gün deneyelim mi?`;
    }
    return `O saat az önce doldu. Kalan saatler:\n\n${timeGrid(times)}\n\nHangisini seçelim?`;
}

// ── Onay ────────────────────────────────────────────────────────────────────

export function summary(c: Ctx, o: { service: string; dateLabel: string; time: string }): string {
    return `${c.comms.servicePhrase.charAt(0).toLocaleUpperCase('tr')}${c.comms.servicePhrase.slice(1)} özetleyeyim:\n\n`
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
        ? `Talebinizi aldık. ${c.comms.emoji}`
        : `Randevunuz hazır. ${c.comms.emoji}`;
    const tail = o.pending
        ? `Onaylandığında size haber vereceğiz.`
        : `Sizi bekliyoruz.`;
    const manage = o.manageUrl ? `\n\nİptal veya değişiklik için:\n${o.manageUrl}` : '';
    return `${head}\n\n${detailBlock(c, o)}\n\n${tail}${manage}`;
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

// ── Konuşma dışı ────────────────────────────────────────────────────────────

export function mediaUnsupported(c: Ctx): string {
    return `Sesli mesajları ve görselleri okuyamıyorum. Yazarsanız hemen yardımcı olurum.`;
}

export function optedOut(c: Ctx): string {
    return `Anlaşıldı, bundan sonra otomatik mesaj göndermeyeceğiz.\n\n`
        + `Tekrar almak isterseniz *BAŞLAT* yazmanız yeterli.`;
}

export function optedIn(c: Ctx): string {
    return `Tekrar hoş geldiniz! ${c.comms.emoji} Bilgilendirme mesajlarınız yeniden açık.`;
}
