// Kaynak (kabin/koltuk/ünite) doluluğu — edge tarafı.
//
// AYNA DOSYA: src/lib/resourceCapacity.ts ile aynı kuralı uygular. Edge
// fonksiyonları src/ altından import edemiyor (Deno paketi yalnız
// supabase/functions'ı taşır), bu yüzden mantık iki yerde yaşıyor.
// tests/wa-booking.test.mjs ikisini AYNI girdilerle karşılaştırır — biri
// değişip diğeri unutulursa test kırmızıya döner.
//
// Doluluk kapasiteye göre ölçülür: capacity > 1 olan kaynak aynı aralıkta o
// kadar randevu taşır. DB guard'ı (060) da böyle sayıyor; burada daha katı
// davranmak boş kabini "dolu" göstermek olurdu.

export interface CapacitySlot {
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

export function resourceLoadAt(
    resourceId: string, busy: BusyInterval[], start: number, end: number,
): number {
    return busy.filter((b) => b.resourceId === resourceId && overlaps(b, start, end)).length;
}

export function isResourceFull(
    resource: CapacitySlot, busy: BusyInterval[], start: number, end: number,
): boolean {
    return resourceLoadAt(resource.id, busy, start, end) >= Math.max(1, resource.capacity || 1);
}

/** Kapasitesi dolmamış ilk kaynak. Sıra çağıranın verdiği sıradır. */
export function pickFreeResource<T extends CapacitySlot>(
    resources: T[], busy: BusyInterval[], start: number, end: number,
): T | undefined {
    return resources.find((r) => !isResourceFull(r, busy, start, end));
}

export function allResourcesFull(
    resources: CapacitySlot[], busy: BusyInterval[], start: number, end: number,
): boolean {
    return resources.length > 0 && !pickFreeResource(resources, busy, start, end);
}

/**
 * Personel açısından müsait dakikaları kabin açısından da süzer.
 *
 * Kabin tanımlı bir salonda kabinsiz seans yürümez: hiçbiri boş değilse o saat
 * sunulmaz. WhatsApp'tan gelen randevular bugüne kadar `resource_id` olmadan
 * yazılıyordu — operasyon ekranında kabinsiz düşüyor, kabin şeridi eksik
 * gösteriyordu.
 *
 * Kaynak tanımlanmamış işletmede (kabin kavramı yok) tüm dakikalar geçer ve
 * atama null kalır.
 */
export function assignResources(opts: {
    minutes: number[];
    duration: number;
    resources: CapacitySlot[];
    busy: BusyInterval[];
}): Map<number, string | null> {
    const out = new Map<number, string | null>();
    for (const m of opts.minutes) {
        if (opts.resources.length === 0) { out.set(m, null); continue; }
        const free = pickFreeResource(opts.resources, opts.busy, m, m + opts.duration);
        if (free) out.set(m, free.id);
    }
    return out;
}
