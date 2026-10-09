/**
 * Tek kişilik Gün ekranının metin kuralları (108).
 *
 * Ekranın kendisi `app/tek/index.tsx`; burada yalnız karar veren parçalar
 * duruyor — ekrana gömülü bir cümle test edilemez ve sessizce yanlışa döner.
 */

import { formatDayMonth } from './calendar.ts';

/**
 * Başlığın altındaki satır: "9 Ekim · 2 iş bitti, 3 kaldı".
 *
 * Sayılar personel "Bugün" ekranının dilinde, müdürün "6 randevu · 3
 * personel"i değil. Gerekçe: bu modda ekrana bakan kişi işi YAPAN kişi; kaç
 * personel olduğu onun sorusu değil, kaçının bittiği onun sorusu.
 *
 * `counts` null ise gün HENÜZ OKUNMADI ve yalnız tarih yazılıyor. Okunmamış
 * bir günü "0 iş bitti" diye göstermek, boş olduğunu söylemek olurdu —
 * saniyeler sonra kendini yalanlayan bir cümle.
 */
export function soloDaySubtitle(
    dateISO: string,
    counts: { done: number; left: number } | null,
): string {
    const day = formatDayMonth(dateISO);
    if (!counts) return day;
    // Gerçekten boş gün: sayı saymak yerine durumu söylüyor. "0 iş bitti,
    // 0 kaldı" teknik olarak doğru ama kimsenin kurmayacağı bir cümle.
    if (counts.done === 0 && counts.left === 0) return `${day} · randevu yok`;
    return `${day} · ${counts.done} iş bitti, ${counts.left} kaldı`;
}
