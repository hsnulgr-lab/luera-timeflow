import type { Reservation, Service } from '@/types';
import { reservationPrice } from '../utils/reservationServices.ts';

// Randevu yaşam döngüsü — tek kaynak. Tüm yüzeyler (mobil personel, mobil
// düzenle sheet, masaüstü rezervasyon/takvim) bu mantığı paylaşır ki
// "şu an ne yapmalıyım?" her yerde aynı olsun.
// 'missed' (Gelmedi) TÜRETİLMİŞ bir durumdur — DB'ye yazılmaz, saat geçince
// kendiliğinden görünür ve hasta geç gelirse (arrivedAt/customerArrivedAt)
// kendini düzeltir. Böylece koltuktaki hasta yanlış damgalanmaz.
export type ApptPhase = 'pending' | 'upcoming' | 'inService' | 'done' | 'cancelled' | 'missed';

// Geç-kalma toleransı (dk) — klinik Ayarlar'dan değiştirebilir, varsayılan 2 saat.
export const DEFAULT_ARRIVAL_TOLERANCE_MIN = 120;

export function apptPhase(
    r: Pick<Reservation, 'status' | 'arrivedAt' | 'customerArrivedAt' | 'date' | 'startTime'>,
    opts?: { now?: Date; toleranceMin?: number },
): ApptPhase {
    if (r.status === 'cancelled') return 'cancelled';
    if (r.status === 'completed') return 'done';
    if (r.status === 'pending') return 'pending';
    if (r.arrivedAt) return 'inService';
    // Onaylı ama hizmete başlanmadı: randevu saati + tolerans geçtiyse ve hasta
    // hiç gelmediyse 'missed'. Geldi işaretliyse (customerArrivedAt) 'missed' olmaz.
    if (r.date && r.startTime && !r.customerArrivedAt) {
        const start = new Date(`${r.date}T${r.startTime}:00`);
        const tol = opts?.toleranceMin ?? DEFAULT_ARRIVAL_TOLERANCE_MIN;
        const now = opts?.now ?? new Date();
        if (!Number.isNaN(start.getTime()) && now.getTime() > start.getTime() + tol * 60_000) {
            return 'missed';
        }
    }
    return 'upcoming';
}

export const PHASE_LABEL: Record<ApptPhase, string> = {
    pending: 'Onay Bekliyor',
    upcoming: 'Onaylandı',
    inService: 'Hizmette',
    done: 'Tamamlandı',
    cancelled: 'İptal',
    missed: 'Gelmedi',
};

// Bir randevunun birincil sonraki-aksiyonu (etiket + ne yapacağı).
// 'completePay' = Tamamla & Tahsilat (yüzey TahsilatSheet'i bağlamla açar).
export type ApptActionKind = 'confirm' | 'arrive' | 'completePay' | 'none';
export function primaryAction(phase: ApptPhase): { kind: ApptActionKind; label: string } {
    switch (phase) {
        case 'pending': return { kind: 'confirm', label: 'Randevuyu Onayla' };
        case 'upcoming': return { kind: 'arrive', label: 'Müşteri Geldi' };
        case 'missed': return { kind: 'arrive', label: 'Geç Geldi' };
        case 'inService': return { kind: 'completePay', label: 'Tamamla & Tahsilat' };
        default: return { kind: 'none', label: '' };
    }
}

// Randevunun hizmet fiyatı. Tahsilat ön-dolumu için — çoklu hizmetli seansta
// kalemlerin toplamı döner (bkz. utils/reservationServices).
export function priceForReservation(r: Reservation, services: Service[]): number {
    return reservationPrice(r, services);
}
