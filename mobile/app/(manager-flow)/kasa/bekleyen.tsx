import { PendingTicketsSheet } from '../../../src/components/PendingTicketsSheet';
import { useCashSheet, useCashSheetRoute } from '../../../src/state/cashSheet';

/**
 * Kasa · tahsil edilmeyen adisyonlar — iOS'un sayfası, içerik boyunda.
 *
 * Seçilen adisyon tahsilat adımında (kumanda) açılıyor: önce sayfa yığından
 * çıkıyor, sonra kumanda itiliyor — tek güncellemede, kumanda sayfanın İÇİNE
 * düşmüyor.
 */
export default function CashPendingRoute() {
    const sheet = useCashSheet('pending');
    const close = useCashSheetRoute(sheet);
    if (!sheet) return null;
    return (
        <PendingTicketsSheet
            pending={sheet.pending}
            tickets={sheet.tickets}
            opensIn={sheet.opensIn}
            onPick={(ticket) => { close(); sheet.onPick(ticket); }}
            onClose={close}
        />
    );
}
