// Niyet tespiti — kodun kesin bildiği kısım.
//
// Onay, ret, iptal ve opt-out modele SORULMAZ. Bunlar botun geri alınamaz
// işlemlerini tetikleyen kelimeler; bir modelin "evet"i "hayır" anlaması ya da
// sağlayıcı düştüğünde hiçbir şey anlamaması kabul edilemez.
//
// Model yalnız buradan çözülemeyen serbest metin için devreye girer.

import { foldTr } from './dates.ts';

export type Confirm = 'yes' | 'no' | null;

export type Intent =
    | 'book'               // randevu almak istiyor
    | 'cancel'             // KONUŞMADAN vazgeçiyor (yarım kalan akışı bırakıyor)
    | 'cancel_appointment' // KAYITLI RANDEVUSUNU iptal etmek istiyor (Dalga 3)
    | 'reschedule'         // kayıtlı randevusunu başka güne taşımak istiyor
    | 'greeting'
    | 'availability' // "hangi günler müsaitsiniz"
    | 'optout'       // "DUR"
    | 'optin'        // "BAŞLAT"
    | 'other';

const YES = /(^|\s)(evet|evt|olur|tamam|tmm|onay|onayliyorum|ok|okey|okay|tabii|tabi|yes|peki|uygun)(\s|$|[.!,])/;
const NO = /(^|\s)(hayir|yok|olmaz|vazgectim|istemiyorum|no)(\s|$|[.!,])/;
const CANCEL = /(^|\s)(iptal|vazgec|vazgectim|bosver|bos ver)/;

// ── Dalga 3: kayıtlı randevuya dokunan niyetler ─────────────────────────────
//
// "iptal" tek başına belirsiz: yarım kalan konuşmayı bırakmak da olabilir,
// kayıtlı randevuyu silmek de. AYIRAN, cümlede randevudan söz edilmesidir.
// Yanlış tarafa düşerse bedeli ağır: ya müşterinin randevusu sessizce silinir,
// ya da "randevumu iptal et" diyen müşteriye "tamam, iptal ettim" denip
// randevu yerinde durur.
const APPOINTMENT_WORD = /\b(randevu\w*|seans\w*|kayd\w*|kayit\w*|islem\w*|tedavi\w*)\b/;
/** Randevuya gelemeyeceğini söylemek de iptal talebidir. */
const CANT_COME = /\bgelemey?ecegim\b|\bgelemiyorum\b|\bgelemeyecegiz\b|\bkatilamayacagim\b/;
const RESCHEDULE = /\bertele\w*\b|\bdegistir\w*\b|\btasi\w*\b|\bkaydir\w*\b|\bbaska (bir )?gun\w*\b|\bsaatini degistir\b/;

// Opt-out tek başına yazılmalı: "iptal et" cümlesi randevu iptali de olabilir,
// abonelik iptali de. Tek kelimelik mesaj niyeti tartışmasız kılar.
const OPT_OUT = /^\s*(dur|stop|cikar|abone iptal|mesaj istemiyorum)\s*$/;
const OPT_IN = /^\s*(baslat|start|devam)\s*$/;

const GREETING = /^\s*(merhaba|selam|slm|iyi gunler|iyi aksamlar|gunaydin|hey|hi|hello|selamun aleykum|meraba)[\s!.]*$/;

// "Hangi günler müsaitsiniz" — canlıda bot bu soruya aynı saat listesini
// tekrar gönderdi. Gün sorusu, saat sorusundan ayrı bir istek.
const AVAILABILITY = /hangi\s*gun|musait\s*gun|bos\s*gun|ne\s*zaman\s*musait|gun\s*var|hangi\s*gunler/;

/** Emoji ile onay/ret — 👍 ✅ 👎 tek başına yollandığında. */
const YES_EMOJI = /[\u{1F44D}\u{2705}\u{1F64C}]/u;
const NO_EMOJI = /[\u{1F44E}\u{274C}]/u;

/**
 * Onay mı ret mi? Belirsizse null — çağıran o zaman tekrar sorar.
 * İkisi birden geçiyorsa (nadiren "evet ama hayır") null döner: geri alınamaz
 * işlemde tereddüt, tahminden iyidir.
 */
export function detectConfirm(text: string): Confirm {
    const s = foldTr(text);
    const yes = YES.test(s) || YES_EMOJI.test(text);
    const no = NO.test(s) || NO_EMOJI.test(text);
    if (yes && no) return null;
    if (yes) return 'yes';
    if (no) return 'no';
    return null;
}

/**
 * Kaba niyet.
 *
 * `awaitingConfirm`: bir onay bekleniyorsa true geçilmeli. O an "iptal"
 * kelimesi konuşmayı değil, önerilen randevuyu reddetmek demektir ve cancel'a
 * düşerse müşterinin oturumu boşuna silinir.
 *
 * `inFlow`: yarım kalmış bir randevu akışı varsa true geçilmeli. Akışın
 * ortasında "başka gün" demek KAYITLI randevuyu ertelemek değil, önerilen günü
 * beğenmemektir — erteleme niyeti orada aranmaz.
 */
export function detectIntent(
    text: string,
    opts: { awaitingConfirm?: boolean; inFlow?: boolean } = {},
): Intent {
    const s = foldTr(text);
    if (OPT_OUT.test(s)) return 'optout';
    if (OPT_IN.test(s)) return 'optin';
    if (GREETING.test(s)) return 'greeting';

    // Kayıtlı randevuya dokunan niyetler, konuşma niyetlerinden ÖNCE gelir:
    // "randevumu iptal et" cümlesi CANCEL'a düşerse randevu yerinde kalır.
    const aboutAppointment = APPOINTMENT_WORD.test(s);
    if (!opts.awaitingConfirm) {
        if (CANT_COME.test(s)) return 'cancel_appointment';
        if (aboutAppointment && CANCEL.test(s)) return 'cancel_appointment';
        if (!opts.inFlow && aboutAppointment && RESCHEDULE.test(s)) return 'reschedule';
    }

    if (AVAILABILITY.test(s)) return 'availability';
    if (!opts.awaitingConfirm && CANCEL.test(s)) return 'cancel';
    return 'other';
}

/**
 * Numaralı listeden seçim ("1", "2. olan", "ikinci"). Yalnız numaralı bir liste
 * SUNULDUKTAN SONRA çağrılmalı — bağlam yokken çıplak sayı seçim değildir.
 *
 * Sınır dışı bir sayı null döner: "5" yazan müşteriye 2 kayıttan birini
 * rastgele seçmektense tekrar sormak doğrudur.
 */
export function detectListChoice(text: string, count: number): number | null {
    if (count <= 0) return null;
    const s = foldTr(text).trim();
    const ORDINALS: Record<string, number> = {
        birinci: 1, ilki: 1, ilk: 1, birincisi: 1,
        ikinci: 2, ikincisi: 2, ucuncu: 3, ucuncusu: 3,
        sonuncu: count, sonuncusu: count, sonraki: 2,
    };
    for (const [word, n] of Object.entries(ORDINALS)) {
        if (new RegExp(`\\b${word}\\b`).test(s)) return n <= count ? n : null;
    }
    const m = s.match(/^\s*(\d{1,2})\s*[.)]?\s*(numarali|nolu|olan|si|sini)?\s*$/);
    if (!m) return null;
    const n = Number(m[1]);
    return n >= 1 && n <= count ? n : null;
}

/**
 * Mesaj işlenmeye değer mi? Evolution grup mesajı, kendi gönderdiğimiz mesaj ve
 * medya için de webhook atıyor.
 */
export function inboundKind(payload: {
    fromMe?: boolean;
    remoteJid?: string;
    text?: string;
    hasMedia?: boolean;
}): 'text' | 'media' | 'skip' {
    if (payload.fromMe) return 'skip';
    if (!payload.remoteJid || payload.remoteJid.includes('@g.us')) return 'skip';
    if (payload.text && payload.text.trim()) return 'text';
    if (payload.hasMedia) return 'media';
    return 'skip';
}
