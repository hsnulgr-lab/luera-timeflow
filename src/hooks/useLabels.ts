import { useMemo } from 'react';
import { useReservations } from '@/hooks/useReservations';
import { labelsForSector, type LabelKey } from '@/lib/sectorProfiles';
import { staffRoleOptionsForSector, type StaffRole } from '@/lib/staffPermissions';

// Sektöre göre terminoloji: t('customer') → "Müşteri" / "Hasta" / "Müvekkil"…
// ReservationsProvider içinde kullanılmalı (sektör settings'ten okunur).
export function useLabels() {
    const { settings, isSettingsLoading } = useReservations();
    const labels = useMemo(() => labelsForSector(settings.sector), [settings.sector]);
    const t = (key: LabelKey) => labels[key];
    return { t, labels, sector: settings.sector || 'genel', isLoading: isSettingsLoading };
}

// Personel rolleri de sektörün diliyle: bir güzellik salonunda "Uzman/Asistan",
// diş kliniğinde "Hekim/Asistan". Rol değerleri (ve yetkileri) aynı kalır.
export function useStaffRoles() {
    const { settings } = useReservations();
    const options = useMemo(() => staffRoleOptionsForSector(settings.sector), [settings.sector]);
    const roleLabel = (role: StaffRole) => options.find((o) => o.value === role)?.label || 'Personel';
    return { roleOptions: options, roleLabel };
}
