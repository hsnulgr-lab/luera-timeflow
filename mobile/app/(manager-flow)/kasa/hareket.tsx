import { MovementSheet } from '../../../src/components/CashSheets';
import { useCashSheet, useCashSheetRoute } from '../../../src/state/cashSheet';

/**
 * Kasa · hareket fişi — iOS'un sayfası, boyu içerik kadar (2026-10-13).
 *
 * Verisi ve eylemleri Kasa ekranında; köprü `state/cashSheet.ts`. Seçenekler
 * kök yığında (`app/_layout.tsx` · `CASH_SHEET`): formSheet · fitToContents.
 */
export default function CashMovementRoute() {
    const sheet = useCashSheet('movement');
    const close = useCashSheetRoute(sheet);
    if (!sheet) return null;
    return (
        <MovementSheet
            movement={sheet.movement}
            onClose={close}
            onVoid={sheet.onVoid}
            onCorrect={sheet.onCorrect}
            note={sheet.note}
        />
    );
}
