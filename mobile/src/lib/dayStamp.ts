/**
 * Bir damganın hangi GÜNE ait olduğu. Saf, bağımlılıksız.
 *
 * Akış (`flowBuild`) ve kadronun anlık hâli (`presence`) aynı soruyu soruyor;
 * kural iki yerde yazılsaydı akış "sıradaki" derken şerit aynı personeli
 * "1143 saattir işlemde" gösterebilirdi.
 */

const HOUR = 3_600_000;

/**
 * Bir damga randevunun GÜNÜNE ait sayılırken tanınan pay: günün iki yanında
 * on iki saat. Gece yarısını aşan gerçek bir işlem (23:30'da başlayıp 00:10'da
 * süren) içeride kalıyor; haftalar önceki bir damga dışarıda.
 */
export const STAMP_DAY_MARGIN_HOURS = 12;

/**
 * "Geldi" ve "işlem başladı" damgası BU GÜNÜN mü?
 *
 * ── Neden ───────────────────────────────────────────────────────────────────
 * Ne masaüstü ne mobil, randevu BAŞKA GÜNE taşındığında damgaları
 * temizliyordu. 30 Temmuz'da başlamış bir randevu bugüne taşınınca damga
 * yerinde kalıyor ve akış onu "1143 saattir sürüyor", "1481 saattir bekliyor"
 * diye çiziyordu — büyüyen sayı kartın düzenini de kırıyordu.
 *
 * Başka bir güne ait damga bu günün OLAYI değil: bugün ne gelen var ne başlayan.
 * Satır damgasız okunuyor ve hâli randevu saatinden türetiliyor. Kök neden
 * veritabanında da kapatıldı (097: tarih değişince damgalar temizleniyor);
 * bu kural o düzeltmeden önce yazılmış satırlar için.
 *
 * Çözülemeyen damga ya da gün OLDUĞU GİBİ bırakılıyor: yargılanamayan veri
 * silinmiyor.
 */
export function ownDayStamp(stamp: string | null, dateISO: string): string | null {
    if (!stamp) return stamp;
    const at = Date.parse(stamp);
    const dayStart = Date.parse(`${dateISO}T00:00:00`);
    if (!Number.isFinite(at) || !Number.isFinite(dayStart)) return stamp;
    const margin = STAMP_DAY_MARGIN_HOURS * HOUR;
    return at >= dayStart - margin && at <= dayStart + 24 * HOUR + margin ? stamp : null;
}

/** Satırın "bugün" damgaları süzülmüş hâli. Tamamlanmış satıra dokunmuyor. */
export function withOwnStamps<T extends {
    status: string; customer_arrived_at?: string | null; arrived_at: string | null; no_show_at?: string | null;
}>(
    row: T,
    dateISO: string,
): T {
    // Tamamlanmış randevu geçmiştir; damgaları kaydın kendisi.
    if (row.status === 'completed') return row;
    const customerArrived = ownDayStamp(row.customer_arrived_at ?? null, dateISO);
    const arrived = ownDayStamp(row.arrived_at, dateISO);
    // Başka günün "gelmedi" kararı da bu güne ait değil (098).
    const noShow = ownDayStamp(row.no_show_at ?? null, dateISO);
    if (customerArrived === (row.customer_arrived_at ?? null)
        && arrived === row.arrived_at
        && noShow === (row.no_show_at ?? null)) return row;
    const next = { ...row, customer_arrived_at: customerArrived, arrived_at: arrived };
    return 'no_show_at' in row ? { ...next, no_show_at: noShow } : next;
}
