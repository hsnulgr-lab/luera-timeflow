import type { Reservation, Service } from '@/types';

// Randevu yaşam döngüsü — tek kaynak. Tüm yüzeyler (mobil personel, mobil
// düzenle sheet, masaüstü rezervasyon/takvim) bu mantığı paylaşır ki
// "şu an ne yapmalıyım?" her yerde aynı olsun.
export type ApptPhase = 'pending' | 'upcoming' | 'inService' | 'done' | 'cancelled';

export function apptPhase(r: Pick<Reservation, 'status' | 'arrivedAt'>): ApptPhase {
    if (r.status === 'cancelled') return 'cancelled';
    if (r.status === 'completed') return 'done';
    if (r.status === 'pending') return 'pending';
    return r.arrivedAt ? 'inService' : 'upcoming'; // confirmed
}

export const PHASE_LABEL: Record<ApptPhase, string> = {
    pending: 'Onay bekliyor',
    upcoming: 'Onaylandı',
    inService: 'Hizmette',
    done: 'Tamamlandı',
    cancelled: 'İptal',
};

// Bir randevunun birincil sonraki-aksiyonu (etiket + ne yapacağı).
// 'completePay' = Tamamla & Tahsilat (yüzey TahsilatSheet'i bağlamla açar).
export type ApptActionKind = 'approve' | 'arrive' | 'completePay' | 'none';
export function primaryAction(phase: ApptPhase): { kind: ApptActionKind; label: string } {
    switch (phase) {
        case 'pending': return { kind: 'approve', label: 'Onayla' };
        case 'upcoming': return { kind: 'arrive', label: 'Müşteri Geldi' };
        case 'inService': return { kind: 'completePay', label: 'Tamamla & Tahsilat' };
        default: return { kind: 'none', label: '' };
    }
}

// Randevunun hizmet fiyatı (settings.services eşleşmesi). Tahsilat ön-dolumu için.
export function priceForReservation(r: Pick<Reservation, 'service'>, services: Service[]): number {
    return services.find((s) => s.name === r.service)?.price ?? 0;
}
