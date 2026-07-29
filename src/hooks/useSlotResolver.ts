import { useCallback, useMemo } from 'react';
import { useReservations } from '@/hooks/useReservations';
import { useStaff } from '@/hooks/useStaff';
import { useStaffTimeOff } from '@/hooks/useStaffTimeOff';
import { useResources } from '@/hooks/useResources';
import { useLabels } from '@/hooks/useLabels';
import { profileForSector } from '@/lib/sectorProfiles';
import {
    findAvailableSlots, resolveSlot, resolveSlotStaff,
    type AvailableSlot, type SlotQuery, type SlotResolution, type SlotRules, type SlotSearch,
} from '@/lib/slotResolution';

// Slot kurallarını canlı veriye bağlar. Takvim ve Sağlık/Klinik dashboard'u
// aynı hook'u kullanır — böylece iki yüzey aynı taslak için farklı "uygun"
// sonucu veremez. Kuralların kendisi lib/slotResolution.ts içinde saftır.
export function useSlotResolver() {
    const { reservations, settings, checkConflict } = useReservations();
    const { staff, isLoading: staffLoading } = useStaff();
    const { timeOff, isLoading: timeOffLoading } = useStaffTimeOff();
    const { resources } = useResources();
    const { t } = useLabels();

    const resourceTypeLabel = profileForSector(settings.sector).resourceTypes[0] || 'Kaynak';
    const staffWord = t('staff').toLocaleLowerCase('tr');

    const rules: SlotRules = useMemo(() => ({
        staff, staffLoading, timeOff, timeOffLoading,
        workingHours: settings.workingHours || [],
        reservations, resources, checkConflict,
        staffWord, resourceTypeLabel,
    }), [staff, staffLoading, timeOff, timeOffLoading, settings.workingHours,
        reservations, resources, checkConflict, staffWord, resourceTypeLabel]);

    return {
        rules,
        /** Personel uygunluğu (kaynak hariç). */
        resolveStaff: useCallback((q: SlotQuery): SlotResolution => resolveSlotStaff(rules, q), [rules]),
        /** Personel + kaynak birlikte — kaydetmeden hemen önce de bunu çağırın. */
        resolve: useCallback((q: SlotQuery): SlotResolution => resolveSlot(rules, q), [rules]),
        /** Doğrulanmış uygun saatler. */
        findSlots: useCallback((s: SlotSearch): AvailableSlot[] => findAvailableSlots(rules, s), [rules]),
        /** Uygunluk verisi henüz yüklenmediyse "uygun" iddiası gösterilmemeli. */
        isReady: !staffLoading && !timeOffLoading,
    };
}
