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

/**
 * Baş harfler — "Ayşe Demir" → "AD".
 *
 * TEK TANIM. Üç ayrı uygulama vardı ve üçü ayrı davranıyordu:
 *   • `ApptParts`         ilk İKİ kelime  → "Ayşe Nur Demir" = "AN"
 *   • `appointmentDetail` ilk + SON       → "Ayşe Nur Demir" = "AD"
 *   • `customerBook`      ilk + son, tek kelimede İKİ HARF → "Deniz" = "DE"
 * Aynı kişi ekrandan ekrana farklı iki harfle görünüyordu.
 *
 * Kazanan `customerBook`'unki, çünkü SUNUCU onu yapıyor: `staff-api` müşteri
 * defterini dönerken baş harfi aynı kuralla üretiyor (`customers` ucu). Ayrı
 * bir kural seçmek, sunucudan gelen baş harfle yerelde türetilenin
 * ayrışması demekti — ve aynı listede ikisi yan yana duruyor.
 *
 * Boş ad "?" veriyor: baş harf uydurulmuyor ama yuvarlak da boş kalmıyor.
 */
export function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    // Tek kelimede iki harf: "D" tek başına bir kişiyi ayırt etmiyor.
    if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('tr-TR');
    return (parts[0][0] + parts[parts.length - 1][0]).toLocaleUpperCase('tr-TR');
}

/**
 * "Deniz Aksoy" → { given: 'Deniz', family: 'Aksoy' }.
 *
 * Burada durur çünkü hem personel hem müşteri adları aynı biçimde yazılıyor
 * ve `managerFlow` ile `staffDay` ikisi de buna ihtiyaç duyuyor.
 */
export function splitStaffName(name: string): { given: string; family: string } {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return { given: words[0] ?? '', family: '' };
    return { given: words.slice(0, -1).join(' '), family: words.at(-1) ?? '' };
}
