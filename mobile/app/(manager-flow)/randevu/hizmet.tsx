import { ServiceSheet } from '../../../src/components/ApptSheets';
import { useApptSheet, useApptSheetRoute } from '../../../src/state/apptSheet';

/**
 * Randevu kartı · "Hizmeti değiştir" — iOS'un sayfası, boyu içerik kadar
 * (2026-10-13). Verisi ve kaydetme işi kartta; köprü `state/apptSheet.ts`.
 * Seçenekler kök yığında (`app/_layout.tsx` · `APPT_SHEET`).
 */
export default function ServiceSheetRoute() {
    const sheet = useApptSheet('service');
    const close = useApptSheetRoute(sheet);
    if (!sheet) return null;
    return (
        <ServiceSheet
            appointment={sheet.appointment}
            dayAppointments={sheet.dayAppointments}
            services={sheet.services}
            staffName={sheet.staffName}
            solo={sheet.solo}
            onPick={(choice) => { close(); sheet.onPick(choice); }}
        />
    );
}
