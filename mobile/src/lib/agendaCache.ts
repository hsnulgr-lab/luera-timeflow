/**
 * ÇEVRİMDIŞI OKUMA — günün listesinin disk kopyası. Saf karar katmanı.
 *
 * ── Neden var ────────────────────────────────────────────────────────────────
 * Kuyruk bugüne kadar yalnız YAZMAYI biriktiriyordu. Oysa salonun bodrum
 * katında sinyal yokken personelin asıl kaybı yazamamak değil, GÜNÜNÜ HİÇ
 * GÖREMEMEK: ekran "Bu günü okuyamadık" diyor ve kimin ne zaman geleceği
 * bilinmiyor. Yazma kaybı altı saniye sonra telafi edilebilir; görülemeyen
 * bir gün telafi edilemez.
 *
 * ── Neden YALNIZ bugün ──────────────────────────────────────────────────────
 * Değerin tamamı "şu an ne yapacağım" sorusunda. Yarına çevrimdışı bakmak
 * nadir ve düşük değerli; her güne bir kayıt tutmak ise sınırsız büyüyen bir
 * depo demek. Tek anahtar, tek gün.
 *
 * Tarihin kendisi ömrü de sınırlıyor: yarın açıldığında kayıt BAŞKA bir güne
 * ait olur ve hiç kullanılmaz. Ayrı bir "son kullanma" alanı gerekmiyor.
 *
 * ── Bu kopya CANLI DEĞİL ve bunu söylemek zorunda ────────────────────────────
 * Ekranın dört hâli var, üç değil: `cached` ile `ok` AYRI. Diskten gelen bir
 * listeyi "okuduk" diye göstermek, bu projede dört commit'tir öldürdüğümüz
 * kusurun ta kendisi olurdu — iptal edilmiş bir randevu orada hâlâ duruyor.
 *
 * Saf: React yok, react-native yok, AsyncStorage yok.
 */

/** Tek anahtar, tek gün. */
export const AGENDA_CACHE_KEY = 'tf.agenda.today';

export interface CachedAgenda<T> {
    /** Hangi güne ait. Eşleşmeyen kayıt KULLANILMIYOR. */
    date: string;
    /** Okumanın anı — ekranda "09:14'te okundu" olarak görünen sayı. */
    at: number;
    rows: T[];
}

/**
 * Diskten okunan ham metni kullanılabilir bir kopyaya çevirir.
 *
 * Kapı DAR: tarih tutmuyorsa, damga sayı değilse ya da satırlar dizi değilse
 * `null`. Yarım bir kayda güvenip ekrana basmak, bozuk veriyi gerçek gibi
 * göstermek olurdu — ve o kayıt uygulamanın kendi eski bir sürümünden de
 * gelmiş olabilir.
 */
export function parseCache<T>(raw: string | null, wantDate: string): CachedAgenda<T> | null {
    if (!raw) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    const body = parsed as Partial<CachedAgenda<T>> | null;
    if (!body || typeof body !== 'object') return null;
    if (body.date !== wantDate) return null;
    if (typeof body.at !== 'number' || !Number.isFinite(body.at)) return null;
    if (!Array.isArray(body.rows)) return null;
    return { date: body.date, at: body.at, rows: body.rows as T[] };
}

/**
 * Diske yazılacak gövde — ya da `null`, yazılmaması gerekiyorsa.
 *
 * BUGÜN DIŞINDA bir gün asla yazılmıyor: şeritten yarına bakan personel,
 * bugünün kopyasını yarınınkiyle ezerdi ve bodrumda yanlış günü görürdü.
 *
 * BOŞ liste de yazılıyor ve bu bilinçli: "bugün randevun yok" gerçek bir
 * cevap. Yazmamak, çevrimdışı açılışta onu "okunamadı"ya çevirirdi.
 */
export function cachePayload<T>(
    dateISO: string,
    todayISO: string,
    at: number,
    rows: readonly T[],
): string | null {
    if (dateISO !== todayISO) return null;
    return JSON.stringify({ date: dateISO, at, rows });
}
