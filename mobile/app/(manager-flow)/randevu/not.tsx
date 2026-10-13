import { NoteSheet } from '../../../src/components/ApptSheets';
import { useApptSheet, useApptSheetRoute } from '../../../src/state/apptSheet';

/**
 * Randevu kartı · "Notu düzenle" — iOS'un sayfası, boyu içerik kadar
 * (2026-10-13). Verisi ve kaydetme işi kartta; köprü `state/apptSheet.ts`.
 */
export default function NoteSheetRoute() {
    const sheet = useApptSheet('note');
    const close = useApptSheetRoute(sheet);
    if (!sheet) return null;
    return (
        <NoteSheet
            appointment={sheet.appointment}
            onSave={(text) => { close(); sheet.onSave(text); }}
        />
    );
}
