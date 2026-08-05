// ── Kaynak (kabin/koltuk/ünite) doluluğu ─────────────────────────────────────
// Doluluk KAPASİTEYE göre ölçülür: `capacity` alanı 1'den büyük olan bir kaynak
// aynı aralıkta o kadar randevu taşıyabilir (grup dersi, çift koltuklu kabin).
// DB guard'ı (supabase/060_reservation_conflict_guard.sql) çakışan kayıtları
// sayıp kapasiteyle karşılaştırır; UI aynı kuralı uygulamak zorunda, yoksa
// kendini DB'den daha katı kısıtlar ve boş kabini "dolu" gösterir.

export interface CapacitySlot {
    /** Kaynağın o aralıkta taşıyabileceği randevu sayısı (>= 1). */
    capacity: number;
    id: string;
}

export interface BusyInterval {
    resourceId?: string;
    /** Dakika cinsinden [start, end) */
    start: number;
    end: number;
}

const overlaps = (a: BusyInterval, start: number, end: number): boolean =>
    a.start < end && a.end > start;

/** Kaynağın [start, end) aralığındaki çakışan randevu sayısı. */
export function resourceLoadAt(
    resourceId: string, busy: BusyInterval[], start: number, end: number,
): number {
    return busy.filter((b) => b.resourceId === resourceId && overlaps(b, start, end)).length;
}

/** Kapasite dolmuş mu? Tanımsız/0 kapasite 1 sayılır. */
export function isResourceFull(
    resource: CapacitySlot, busy: BusyInterval[], start: number, end: number,
): boolean {
    return resourceLoadAt(resource.id, busy, start, end) >= Math.max(1, resource.capacity || 1);
}

/**
 * Otomatik atama için kapasitesi dolmamış ilk kaynak. Sıralama çağıranın
 * verdiği sıradır (kaynaklar `sort` alanına göre gelir) — deterministik olsun
 * diye rastgele seçim yapılmaz.
 */
export function pickFreeResource<T extends CapacitySlot>(
    resources: T[], busy: BusyInterval[], start: number, end: number,
): T | undefined {
    return resources.find((r) => !isResourceFull(r, busy, start, end));
}

/**
 * Kabin tanımlı bir salonda kabinsiz seans yürümez: hiçbiri müsait değilse slot
 * kapalı sayılır. Kaynak tanımlı değilse (kabin kavramı olmayan işletme) kural
 * hiç işlemez.
 */
export function allResourcesFull(
    resources: CapacitySlot[], busy: BusyInterval[], start: number, end: number,
): boolean {
    return resources.length > 0 && !pickFreeResource(resources, busy, start, end);
}
