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
 * Ekran AÇIKKEN iki yoklama arası.
 *
 * Eşiğin ALTINDA olması bir tesadüf değil, sözleşme: yoklama çalıştığı sürece
 * liste hiç bayatlamıyor ve "son güncelleme" satırı hiç görünmüyor. Satırın
 * belirmesi artık tek bir şey anlatıyor — yoklama cevap ALAMIYOR.
 *
 * Uygulama arka plandayken yoklama DURUYOR (`AppState`). Cebindeki telefon
 * salonun takvimini saniye saniye çekmemeli; öne dönüldüğünde zaten bir kez
 * okunuyor.
 *
 * Sunucuya `since` parametresi EKLENMEDİ. Bir günün randevusu birkaç satır;
 * ölçülen ortanca cevap süresi 0.40 sn. Kazanç, bir sunucu dağıtımının
 * bedelini bugün karşılamıyor — gerekirse sonra eklenir.
 */
export const POLL_MS = 25_000;

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
