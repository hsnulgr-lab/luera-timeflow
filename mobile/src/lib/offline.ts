/**
 * Çevrimdışı bandının metni — saf karar katmanı.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır; bu yüzden Expo ya da
 * react-native bağımlılığı TAŞIMAZ. Bağlantıyı gerçekten okuyan kanca
 * `connectivity.ts` içinde ve yalnız bu fonksiyonu çağırır.
 */

/**
 * Banda ne yazılacak? Görünmemesi gerekiyorsa `null`.
 *
 * İKİ AYRI ŞEY tek cümlede birleşir:
 *   • bağlantı — cihaz ağa çıkabiliyor mu
 *   • kuyruk   — gönderilememiş kaç yazma isteği bekliyor
 *
 * Kuyruk, bağlantı geri geldikten sonra da bir süre dolu kalır. O aralıkta
 * "Çevrimdışı" demek yanlış olur ama susmak da yanlış: personel işini
 * gönderilmiş sanır. Bu yüzden üçüncü bir hâl var.
 */
export function offlineBannerText(offline: boolean, queued: number): string | null {
    if (!offline && queued === 0) return null;
    const queue = queued > 0 ? ` · ${queued} işlem sırada` : '';
    return offline ? `Çevrimdışı${queue}` : `Bağlantı geldi${queue}`;
}
