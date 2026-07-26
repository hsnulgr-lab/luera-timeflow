import type { Reservation, Service } from '@/types';

// Bir randevunun hizmet kalemleri — tek kaynak.
//
// Bir seansta birden fazla hizmet olabilir (kaş + cilt bakımı, dolgu + diş
// temizliği). Bu durumda `reservation.service` kalemlerin birleşik adıdır
// ("Dolgu + Diş temizliği") ve katalogda böyle bir kayıt yoktur; ücret
// custom_fields.hizmetler'den okunur. Kasa'nın doğrudan `services.find(name)`
// yapması bu seansları ₺0 gösterirdi.

export interface ReservationServiceLine {
    id: string;
    name: string;
    price: number;
    duration: number;
}

const SEPARATOR = ' + ';

/** Randevunun hizmet kalemleri; her zaman en az bir kalem döner. */
export function reservationServiceLines(r: Reservation, services: Service[] = []): ReservationServiceLine[] {
    const raw = r.customFields?.hizmetler;
    if (typeof raw === 'string' && raw.trim()) {
        try {
            const parsed: unknown = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed.map((item, i) => {
                    const o = (item ?? {}) as Record<string, unknown>;
                    const name = typeof o.name === 'string' ? o.name : `Hizmet ${i + 1}`;
                    const known = services.find((s) => s.id === o.id) || services.find((s) => s.name === name);
                    return {
                        id: typeof o.id === 'string' ? o.id : known?.id || `svc-${i}`,
                        name,
                        price: typeof o.price === 'number' ? o.price : known?.price ?? 0,
                        duration: typeof o.duration === 'number' ? o.duration : known?.duration ?? 0,
                    };
                });
            }
        } catch {
            // Bozuk/elle düzenlenmiş kayıt — aşağıdaki ad eşlemesine düşer.
        }
    }

    // custom_fields yoksa ada göre çöz. Birleşik ad da ayrıştırılır: eski
    // kayıtlar ve dışarıdan (online booking, bot) gelenler için emniyet.
    const names = (r.service || '').split(SEPARATOR).map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return [{ id: 'svc', name: r.service || 'Hizmet', price: 0, duration: 0 }];
    return names.map((name, i) => {
        const svc = services.find((s) => s.name === name);
        return { id: svc?.id || `svc-${i}`, name, price: svc?.price ?? 0, duration: svc?.duration ?? 0 };
    });
}

/** Randevunun katalog ücreti (indirim/kapora hariç). */
export function reservationPrice(r: Reservation, services: Service[] = []): number {
    return reservationServiceLines(r, services).reduce((sum, l) => sum + l.price, 0);
}
