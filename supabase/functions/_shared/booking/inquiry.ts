// Bilgi sorusu yönlendiricisi — Dalga 2.
//
// Bota gelen her mesaj randevu talebi değil. Canlıda müşteriler "randevum ne
// zamandı", "kaç para", "kaçta açıksınız", "borcum var mı" yazdı; bot üçünü de
// hizmet adı sandı ve karşılamaya döndü. Bu modül mesajın KONUSUNU ayırır.
//
// ÜÇ KURAL — bunlar pazarlıksız:
//
// 1. KİŞİSEL VERİ YALNIZ EŞLEŞEN NUMARAYA. Randevu, paket ve bakiye
//    (PERSONAL kümesi) ancak yazan numara bir müşteri kaydıyla eşleşiyorsa
//    cevaplanır. Numara tanınmıyorsa veri verilmez, salona yönlendirilir.
//    "Ahmet'in borcu ne kadar" diye soran birine cevap verilmez.
//
// 2. SAYILARI MODEL ÜRETMEZ. Tutar, tarih, saat, kalan seans — hepsi
//    veritabanından okunur ve mesaj şablonuna KOD tarafından yazılır. Modelin
//    tek işi konuyu adlandırmaktır.
//
// 3. MODEL YALNIZ ENUM DÖNER. Kural katmanı çözemezse modele sorulur ama
//    dönebileceği tek şey aşağıdaki Topic listesinden bir değerdir; serbest
//    metin kabul edilmez (bkz. coerce, ai.ts).
//
// Saf modül: tests/wa-booking.test.mjs doğrudan import eder.

import { foldTr } from './dates.ts';

export type Topic =
    | 'my_appointment' // "randevum ne zaman"
    | 'my_package'     // "kaç seansım kaldı"
    | 'my_balance'     // "borcum var mı"
    | 'hours'          // "kaça kadar açıksınız"
    | 'price'          // "ne kadar"
    | 'location'       // "neredesiniz"
    | 'human';         // "yetkiliyle görüşmek istiyorum"

export const TOPICS: readonly Topic[] = [
    'my_appointment', 'my_package', 'my_balance', 'hours', 'price', 'location', 'human',
];

/** Kişiye özel veri içeren konular — numara eşleşmeden cevaplanmaz. */
export const PERSONAL: ReadonlySet<Topic> = new Set<Topic>([
    'my_appointment', 'my_package', 'my_balance',
]);

/** Model çıktısını Topic'e daraltır; listede yoksa null. */
export function coerceTopic(raw: unknown): Topic | null {
    return typeof raw === 'string' && (TOPICS as readonly string[]).includes(raw)
        ? raw as Topic
        : null;
}

// Kalıplar foldTr'den GEÇMİŞ metne bakar: "açıksınız" → "aciksiniz",
// "müdür" → "mudur". Ham Türkçe yazmak sessizce eşleşmemeye yol açar.
//
// SIRA ÖNEMLİ, yukarıdaki daha özgüldür:
//   "borcum ne kadar"  → my_balance, price değil (iyelik eki niyeti belirler)
//   "kaça kadar açık"  → hours, price değil ("kaca" ikisinde de geçiyor)
const RULES: { topic: Topic; re: RegExp }[] = [
    // "randevum var mı", "randevum ne zaman", "saat kaçtaydı"
    {
        topic: 'my_appointment',
        re: /\brandevu(m|mu|muz|mun|larim|lariniz)\b|\bne zamandi\b|\bkacta(ydi|ymis)\b|\bkayitli randevu\b|\bkayitli miyim\b/,
    },
    // "kaç seansım kaldı", "paketim", "kalan seans"
    {
        topic: 'my_package',
        re: /\bpaket(im|imde|imden)\b|\bkac seans\b|\bseansim\b|\bkalan seans\b|\bseans hakk?im\b/,
    },
    // "borcum var mı", "bakiyem", "ne kadar ödedim"
    {
        topic: 'my_balance',
        re: /\bborc(um|umuz)\b|\bbakiye(m|miz)\b|\bne kadar odedim\b|\bodemem\b|\bkalan odeme\b|\bhesabim\b/,
    },
    // "yetkiliye bağlayın", "insanla görüşmek istiyorum" — botun kendini
    // devretmesi gereken tek durum.
    //
    // "mudur" BİLİNÇLİ OLARAK YOK: Türkçede soru eki olarak da geçiyor
    // ("uygun mudur", "müsait midir") ve her soruyu devretmeye çalışırdı.
    {
        topic: 'human',
        re: /\byetkili\w*|\b(isletme|salon|klinik) sahib\w*|\binsan(la|la konus\w*| ile)\b|\bgercek bir(i|isi)\b|\bbot ile konusmak istemiyorum\b|\bbirine bagla\w*|\bbiriyle gorus\w*/,
    },
    // "kaça kadar açıksınız", "pazar açık mısınız", "çalışma saatleri"
    {
        topic: 'hours',
        re: /\bcalisma saat\w*|\bacik mi\w*|\baciksiniz\b|\bkaca kadar\b|\bkacta ac\w*|\bkacta kapa\w*|\bmesai\w*|\bhangi saatler\w*/,
    },
    // "ne kadar", "kaç TL", "fiyat listesi", "ücret"
    {
        topic: 'price',
        re: /\bfiyat\w*\b|\bucret\w*\b|\bne kadar\b|\bkac (tl|lira|para)\b|\bkaca\b|\btarife\b/,
    },
    // "neredesiniz", "adres", "nasıl gelirim"
    {
        topic: 'location',
        re: /\badres\w*\b|\bnerede\w*\b|\bkonum\b|\bnasil gel(ir|ebil)\w*\b|\byol tarifi\b|\bharita\b/,
    },
];

/**
 * Mesajın konusu. Randevu akışına ait bir cümleyse (hizmet adı, gün, saat,
 * onay) null döner ve çağıran normal akışa devam eder.
 */
export function detectTopic(text: string): Topic | null {
    if (!text) return null;
    const s = foldTr(text);
    for (const r of RULES) if (r.re.test(s)) return r.topic;
    return null;
}

// ── Soru sorma (netleştirme) ────────────────────────────────────────────────
//
// Bot bugüne kadar HİÇ soru sormuyordu: anlamadığı her mesaja aynı karşılamayı
// ve hizmet listesini gönderiyordu. Canlıda bildirilen olay tam olarak buydu —
// "seanslar" yazan müşteri seans ÜCRETİNİ öğrenmek istiyordu, bot ona hizmet
// listesi attı ve müşteri ne soracağını bilemedi.
//
// Herkes derdini düzgün yazamaz. Tek kelimelik ve belirsiz mesajlar tahmin
// edilmez, SORULUR — üstelik numaralı seçeneklerle: "1" yazmak, cümle kurmaktan
// kolaydır ve seçim kural katmanında kesin çözülür (detectListChoice), modele
// hiç gitmez.

export type Clarify =
    | 'seans'  // "seans" tek başına: ücret mi, kalan seans mı, randevu mu?
    | 'genel'; // hiçbir şey anlaşılmadı ve karşılama zaten gönderilmişti

/** Seçeneğin karşılığı: ya bir bilgi konusu ya da randevu akışına giriş. */
export interface ClarifyOption {
    label: string;
    topic?: Topic;
    /** Konu yok: normal randevu akışına düşülür. */
    book?: boolean;
}

/**
 * Seçenekler ve karşılıkları TEK yerde. Metin messages.ts'te, karşılığı burada
 * olsaydı ikisi kayar ve "2" yazan müşteri başka bir cevap alırdı.
 */
export const CLARIFY_OPTIONS: Record<Clarify, readonly ClarifyOption[]> = {
    seans: [
        { label: 'Seans ücretlerini öğrenmek', topic: 'price' },
        { label: 'Kalan seanslarımı görmek', topic: 'my_package' },
        { label: 'Yeni randevu almak', book: true },
    ],
    genel: [
        { label: 'Randevu almak', book: true },
        { label: 'Fiyatları öğrenmek', topic: 'price' },
        { label: 'Çalışma saatlerini öğrenmek', topic: 'hours' },
        { label: 'Yetkiliyle görüşmek', topic: 'human' },
    ],
};

/** Netleştirme sorusunun başlığı — müşterinin sözcüğü bilinmiyorsa. */
export const CLARIFY_QUESTION: Record<Clarify, string> = {
    seans: 'Bunu birkaç şekilde anlayabilirim. Hangisi?',
    genel: 'Tam olarak anlayamadım. Şunlardan hangisi?',
};

/**
 * Soruyu müşterinin KENDİ sözcüğüyle sorar.
 *
 * Sabit başlık canlıda ters tepti: "Paketler" yazan müşteriye bot
 * "«Seans» derken hangisini kastettiniz?" dedi — sormadığı bir kelime geri
 * geldi ve bot yanlış anlamış gibi göründü.
 */
export function clarifyQuestion(key: Clarify, userText?: string | null): string {
    if (key === 'seans' && userText) {
        // Kendi yazdığını geri veriyoruz; yine de tek satıra indirip
        // kısaltıyoruz — uzun bir metin soruyu okunmaz yapardı.
        const w = userText.replace(/\s+/g, ' ').trim().slice(0, 24);
        if (w) return `"${w}" derken hangisini kastettiniz?`;
    }
    return CLARIFY_QUESTION[key];
}

// YALNIZ mesajın TAMAMI bu sözcüklerse belirsizdir. "seanslarım kaç kaldı"
// zaten my_package'a düşüyor; oradan çalıp soru sormak, cevabı bilinen bir
// soruyu tekrar sormak olurdu.
const SEANS_ALONE = /^(seans|seanslar|seanslari|seanslarim?iz|seansi|seans ucreti?|paket|paketler)$/;

/**
 * Mesaj tek başına birden fazla anlama mı geliyor? Öyleyse hangi soruyu
 * soracağımız döner. Çağıran bunu detectTopic BAŞARISIZ olduktan sonra sormalı.
 */
export function detectClarify(text: string): Clarify | null {
    if (!text) return null;
    const s = foldTr(text).replace(/[.!?,]+$/, '').trim();
    if (SEANS_ALONE.test(s)) return 'seans';
    return null;
}
