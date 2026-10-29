// Memnuniyet cevabından puan — saf, testli.
//
// Soru "1 ile 5 arasında bir puan" istiyor ama müşteri her zaman rakam
// yazmaz: "harikaydı", "⭐⭐⭐⭐", "memnun kalmadım" da cevaptır. Tersine her
// rakam da puan değildir: "saat 5te gelebilir miyim" yeni bir istektir ve
// puan sayılırsa müşteri cevapsız kalır. Bu yüzden rakam yalnız mesajın
// başındaysa ya da kısa bir mesajda tek başına duruyorsa puandır; kelime
// cevapları yalnız kısa mesajlarda okunur. Emin olunamayan mesaj null döner
// ve normal akışa (bot) bırakılır.
//
// Saf modül: tests/wa-scheduler.test.mjs doğrudan import eder.

import { foldTr } from '../booking/dates.ts';

const VERY_GOOD = /\b(harika|mukemmel|muhtesem|super|bayildim|cok memnun|cok iyi|cok guzel|efsane)/;
const GOOD = /\b(memnun|guzel|iyi|tesekkur|sagol|begendim)/;
const NOT_BAD = /\bfena degil/;
// Kelimeyle cevap verirken yeni bir istek de yazdıysa ("yarın için yer var
// mı, çok memnun kaldım") puan okunmaz: istek bota gitsin, cevapsız kalmasın.
const REQUEST_HINT = /\b(randevu|musait|bos yer|iptal|ertele|yarin|bugun|saat|fiyat|ucret|adres|kampanya)/;
const NEUTRAL = /\b(idare eder|orta|eh iste|normal)/;
const VERY_BAD = /\b(berbat|rezalet|felaket|hic memnun degil|hic begenmedim)/;
const NEGATION = /\b(degil|degildi|kalmadim|olmadi|begenmedim|memnun kalmadim|kotu|sikayet)/;
const WORD_NUMBERS: Record<string, number> = { bir: 1, iki: 2, uc: 3, dort: 4, bes: 5 };

export interface ParsedRating {
    rating: number;
    /** Puandan fazlası yazıldıysa müşterinin sözü (yorum olarak saklanır). */
    comment: string | null;
}

export function parseRating(text: string): ParsedRating | null {
    const raw = String(text ?? '').trim();
    if (!raw) return null;
    const s = foldTr(raw);
    const words = s.split(/\s+/).filter(Boolean);
    const comment = (rest: string) => (rest.replace(/^[\s,.:;!-]+/, '').trim() || null);

    // "⭐⭐⭐⭐" — yalnız yıldızdan oluşan mesaj.
    const stars = [...raw].filter((ch) => ch === '⭐' || ch === '🌟').length;
    if (stars >= 1 && stars <= 5 && raw.replace(/[⭐🌟\s]/gu, '') === '') return { rating: stars, comment: null };

    // Saat gibi duran rakam puan değildir ("5:30", "5te", "5'te").
    if (/\d{1,2}[:.]\d{2}/.test(s) || /\b\d{1,2}\s*'?\s*(te|ta|de|da)\b/.test(s)) return null;

    // Başta rakam: "5", "4/5", "5 harikaydı", "3, biraz bekledim".
    const lead = /^([1-5])(\s*\/\s*5)?(?!\d)(.*)$/s.exec(s);
    if (lead) return { rating: Number(lead[1]), comment: comment(raw.slice(raw.length - lead[3].length)) };

    // Kısa mesajda tek başına rakam: "bence 4".
    if (words.length <= 4) {
        const solo = /(?:^|\s)([1-5])(?:\s*\/\s*5)?(?:$|\s)/.exec(s);
        if (solo) return { rating: Number(solo[1]), comment: raw };
        // Yazıyla tek kelime: "beş". "bir sorum var" puan sayılmasın diye
        // yalnız mesajın TAMAMI bu kelimeyse.
        if (words.length === 1 && WORD_NUMBERS[words[0].replace(/[^a-z]/g, '')] !== undefined) {
            return { rating: WORD_NUMBERS[words[0].replace(/[^a-z]/g, '')], comment: null };
        }
    }

    // Kelime cevapları: yalnız kısa mesajlarda; uzun mesaj bir istek olabilir.
    if (words.length > 12 || REQUEST_HINT.test(s)) return null;
    if (VERY_BAD.test(s)) return { rating: 1, comment: raw };
    if (NOT_BAD.test(s)) return { rating: 4, comment: raw };
    if (NEGATION.test(s)) return { rating: 2, comment: raw };
    if (NEUTRAL.test(s)) return { rating: 3, comment: raw };
    if (VERY_GOOD.test(s)) return { rating: 5, comment: raw };
    if (GOOD.test(s)) return { rating: 4, comment: raw };
    return null;
}

/**
 * Google linki kime gider? Varsayılan herkese: Google, yalnız memnun
 * müşterilerden yorum istemeyi (seçici yorum toplama) kurallarında yasaklıyor.
 * İşletme "happy" seçerse yalnız 4–5 verene gider; ayarda uyarısı var.
 */
export function shouldSendReviewLink(rating: number, policy: unknown, hasUrl: boolean): boolean {
    if (!hasUrl) return false;
    return policy === 'happy' ? rating >= 4 : true;
}

/** 3 ve altı işletmeye anında bildirilir. */
export function isUnhappy(rating: number): boolean {
    return rating <= 3;
}
