import { useMemo } from 'react';
import { useReservations } from './useReservations';
import { useStaff } from './useStaff';
import { useOrgProfile } from './useOrgProfile';

// İlk-kurulum durumu — onboarding checklist'i için tek kaynak.
// Yeni kullanıcıya "ne ayarlaması gerek" net olsun diye masaüstü + mobil ortak kullanır.
export interface SetupStep {
    id: string;
    label: string;
    done: boolean;
    to: string;   // ilgili ayar/sayfa
}

export function useSetupStatus() {
    const { settings } = useReservations();
    const { staff } = useStaff();
    const { profile } = useOrgProfile();

    return useMemo(() => {
        const steps: SetupStep[] = [
            { id: 'name', label: 'İşletme adını gir', done: !!settings.businessName?.trim(), to: '/settings?tab=general' },
            { id: 'services', label: 'Hizmetlerini ekle', done: (settings.services?.length ?? 0) > 0, to: '/settings?tab=services' },
            { id: 'staff', label: 'Personel ekle', done: staff.length > 0, to: '/staff' },
            { id: 'booking', label: 'Booking adresini ayarla', done: !!profile.slug, to: '/settings?tab=booking' },
            { id: 'whatsapp', label: "WhatsApp'ı bağla", done: !!settings.whatsappInstance, to: '/settings?tab=whatsapp' },
        ];
        const doneCount = steps.filter((s) => s.done).length;
        return { steps, doneCount, total: steps.length, complete: doneCount === steps.length };
    }, [settings.businessName, settings.services, settings.whatsappInstance, staff.length, profile.slug]);
}
