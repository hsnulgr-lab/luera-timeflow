/**
 * Metin biçimleme — saf, React'siz.
 *
 * `textTransform: 'uppercase'` TÜRKÇE BİLMEZ: RN bunu yerelden bağımsız
 * yapıyor, "i" harfini "I"ya çeviriyor. Sonuç ekranda GIRMESINE, BAKIYE,
 * SIRADAKI RANDEVU, CIRO, ADISYON — hepsi yanlış yazılmış Türkçe.
 *
 * Bu yüzden büyütme STİLDE değil burada yapılır ve stilden `textTransform`
 * kaldırılır. Hedef kitle 40–55 yaş; yanlış yazılmış Türkçe okumayı zorlar
 * ve uygulamayı ucuz gösterir.
 */
export function upperTR(text: string): string {
    return text.toLocaleUpperCase('tr-TR');
}

/** Aynı gerekçe küçültme için de geçerli: "I" harfinin küçüğü "ı"dır. */
export function lowerTR(text: string): string {
    return text.toLocaleLowerCase('tr-TR');
}

// ── Türkçe ek çekimi ────────────────────────────────────────────────────────
//
// "Selin'e düştü", "Selin'i bekliyor" — bu ekler isme göre değişir ve yanlışı
// hemen göze batar ("Merve'e düştü" gibi). İsimler veriden geldiği için elle
// yazılamaz; ünlü uyumuyla türetilir.
//
// Özel ada gelen çekim eki kesme işaretiyle ayrılır (TDK). Tipografik kesme
// (’) kullanılır — uygulamanın geri kalanı da öyle (bkz. managerFlow.atClock).

const APOSTROPHE = '’';
/** Kalın ünlüler; ince olanlar: e i ö ü */
const BACK_VOWELS = 'aıou';
const VOWELS = 'aeıioöuü';

/** Sondan ilk ünlü — ek bunun kalınlığına uyar. Ünlü yoksa null. */
function lastVowel(word: string): string | null {
    const lower = lowerTR(word.trim());
    for (let i = lower.length - 1; i >= 0; i -= 1) {
        if (VOWELS.includes(lower[i])) return lower[i];
    }
    return null;
}

/** Kelime ünlüyle mi bitiyor? Bitiyorsa araya kaynaştırma "y"si girer. */
function endsWithVowel(word: string): boolean {
    const lower = lowerTR(word.trim());
    const last = lower[lower.length - 1];
    return Boolean(last) && VOWELS.includes(last);
}

/**
 * Yönelme hâli: "Selin’e", "Merve’ye", "Kaan’a", "Deniz’e".
 *
 * İki ekli (a/e) — yalnız kalınlık sorulur.
 */
export function dative(name: string): string {
    const clean = name.trim();
    if (!clean) return clean;
    const vowel = lastVowel(clean);
    // Ünlüsüz ad (kısaltma gibi) ince kabul edilir: "SD’e" > "SD’a".
    const suffix = vowel && BACK_VOWELS.includes(vowel) ? 'a' : 'e';
    return `${clean}${APOSTROPHE}${endsWithVowel(clean) ? 'y' : ''}${suffix}`;
}

/**
 * Belirtme hâli: "Selin’i", "Merve’yi", "Kaan’ı", "Gül’ü".
 *
 * Dört ekli (ı/i/u/ü) — hem kalınlık hem düzlük sorulur.
 */
export function accusative(name: string): string {
    const clean = name.trim();
    if (!clean) return clean;
    const vowel = lastVowel(clean);
    let suffix = 'i';
    if (vowel === 'a' || vowel === 'ı') suffix = 'ı';
    else if (vowel === 'o' || vowel === 'u') suffix = 'u';
    else if (vowel === 'ö' || vowel === 'ü') suffix = 'ü';
    return `${clean}${APOSTROPHE}${endsWithVowel(clean) ? 'y' : ''}${suffix}`;
}
