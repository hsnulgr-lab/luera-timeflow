import { todayISO } from '@/utils/date';
import type { PatientEncounterStatus, Reservation, Staff } from '@/types';

export const DENTAL_VISIT_TABS = ['exam', 'chart', 'plan', 'sessions', 'payment', 'recall'] as const;
export type DentalVisitTab = (typeof DENTAL_VISIT_TABS)[number];

export function normalizeDentalVisitTab(value: string | null | undefined): DentalVisitTab {
    return DENTAL_VISIT_TABS.includes(value as DentalVisitTab)
        ? value as DentalVisitTab
        : 'exam';
}

export function encounterStatusForWorkspace(status?: PatientEncounterStatus): 'draft' | 'in-progress' | 'completed' {
    if (status === 'completed') return 'completed';
    if (status === 'checked_in' || status === 'in_progress') return 'in-progress';
    return 'draft';
}

export interface DentalVisitAccess {
    readOnly: boolean;
    canEditChart: boolean;
    assignedDoctor?: Staff;
    reason?: string;
}

// Klinik yazım yetkisi URL'den değil randevunun gerçek hasta/hekim bağından
// türetilir. Yönetici ekranında dahi pending/iptal veya hekim atanmamış bir
// randevu yanlışlıkla klinik kayıt üretemez.
export function resolveDentalVisitAccess(
    reservation: Reservation,
    assignedStaff: Staff | undefined,
): DentalVisitAccess {
    if (!reservation.customerId) {
        return { readOnly: true, canEditChart: false, reason: 'Randevuya hasta dosyası bağlanmalıdır.' };
    }
    // Gelecek güne ait randevunun muayenesi açılamaz (aynı gün her zaman açık).
    // Tamamlanmış randevu bu kuraldan muaf — eski ziyaret görüntülenebilir.
    if (reservation.status !== 'completed' && reservation.date > todayISO()) {
        return { readOnly: true, canEditChart: false, assignedDoctor: assignedStaff, reason: 'Randevu günü gelmeden muayene açılamaz.' };
    }
    if (reservation.status === 'pending') {
        return { readOnly: true, canEditChart: false, assignedDoctor: assignedStaff, reason: 'Randevu onaylandıktan sonra muayene kaydı açılabilir.' };
    }
    if (reservation.status === 'cancelled') {
        return { readOnly: true, canEditChart: false, assignedDoctor: assignedStaff, reason: 'İptal edilen randevu yalnızca görüntülenebilir.' };
    }
    if (!reservation.staffId) {
        return { readOnly: true, canEditChart: false, reason: 'Muayeneyi kaydetmek için randevuya sorumlu hekim atanmalıdır.' };
    }
    if (!assignedStaff || !assignedStaff.isActive || assignedStaff.role !== 'doctor') {
        return { readOnly: true, canEditChart: false, reason: 'Atanan personel aktif bir hekim olmalıdır.' };
    }
    return { readOnly: false, canEditChart: true, assignedDoctor: assignedStaff };
}
