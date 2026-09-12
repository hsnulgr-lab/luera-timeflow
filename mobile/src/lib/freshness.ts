/**
 * Elimizdeki listenin YAŞI. Saf karar katmanı — React yok, react-native yok.
 *
 * Ayrı bir dosya olmasının sebebi `agendaSource.ts`'in React ve api katmanını
 * içe aktarması: oradaki hiçbir şey testte doğrudan çağrılamıyor, yalnız
 * kaynak metni olarak okunabiliyor. Karar buraya inince gerçekten ÇALIŞTIRARAK
 * sınanabiliyor (`retry.ts` ve `sendToCash.ts` ile aynı gerekçe).
 */

/**
 * Listenin "eskimiş" sayıldığı yaş.
 *
 * Bugün ekranı şu an tek sefer okuyor: yoklama yok, ön plana dönünce yenileme
 * yok. Yani sabah açılan liste öğlene kadar DONUK kalabiliyor ve personel bunu
 * anlamıyor — ekranda hiçbir iz yok.
 *
 * İki dakika, salonda bir randevunun değişmesi için makul en kısa aralık.
 * Altında kalan bir eşik taze veride bile sürekli yanıp sönen bir uyarı
 * üretirdi; gürültü uyarıyı öldürür.
 */
export const STALE_AFTER_MS = 120_000;

/**
 * Liste bayat mı?
 *
 * `at` YOKSA bayat değil: hiç okunmamış demek ve onun kendi hâlleri var
 * (`loading` / `error`). "Bilinmiyor"u "eski" diye göstermek, iki ayrı gerçeği
 * aynı cümleye sıkıştırmak olurdu.
 */
export function isStale(at: number | null, now: number): boolean {
    if (at === null) return false;
    return now - at >= STALE_AFTER_MS;
}
