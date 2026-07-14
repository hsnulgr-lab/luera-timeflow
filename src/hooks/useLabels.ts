import { useMemo } from 'react';
import { useReservations } from '@/hooks/useReservations';
import { labelsForSector, type LabelKey } from '@/lib/sectorProfiles';

// Sektöre göre terminoloji: t('customer') → "Müşteri" / "Hasta" / "Müvekkil"…
// ReservationsProvider içinde kullanılmalı (sektör settings'ten okunur).
export function useLabels() {
    const { settings, isLoading } = useReservations();
    const labels = useMemo(() => labelsForSector(settings.sector), [settings.sector]);
    const t = (key: LabelKey) => labels[key];
    return { t, labels, sector: settings.sector || 'genel', isLoading };
}
