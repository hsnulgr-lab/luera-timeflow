import { DayEndSheet } from '../../../src/components/CashSheets';
import { useCashSheet, useCashSheetRoute } from '../../../src/state/cashSheet';

/** Kasa · dönem özeti ("Gün sonu özeti") — iOS'un sayfası, içerik boyunda. */
export default function CashSummaryRoute() {
    const sheet = useCashSheet('summary');
    const close = useCashSheetRoute(sheet);
    if (!sheet) return null;
    return <DayEndSheet period={sheet.period} totals={sheet.totals} onClose={close} />;
}
