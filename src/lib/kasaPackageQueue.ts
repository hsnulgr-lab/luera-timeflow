// Paket tahsilatı kuyruğu — Paketler ile Kasa arasındaki köprü.
//
// Neden: Paketler sayfası eskiden bakiyeyi kendisi tahsil ediyordu ve tutarı
// sabit "nakit" olarak yazıyordu. Müşteri kartla ödediğinde gün sonu kırılımı
// bozuluyor, çekmece sayımı tutmuyordu. Artık Paketler ödeme almaz; müşteriyi
// kasaya "gönderir" — yöntem, tutar ve fiş Kasa'nın kendi akışında belirlenir.
//
// Kuyruk sessionStorage'da tutulur: sayfa geçişini (Paketler → Kasa) aşar ama
// sekme kapanınca temizlenir — yarım kalmış bir bilet ertesi güne sarkmaz.

const KEY = 'luera:kasaPaketKuyrugu';

/** Kasa kuyruğundaki paket bileti id öneki — `pkg:<planId>`. */
export const PKG_TICKET = 'pkg:';
export const isPkgTicket = (id?: string) => Boolean(id?.startsWith(PKG_TICKET));
export const planIdOf = (ticketId: string) => ticketId.slice(PKG_TICKET.length);

export function readPkgQueue(): string[] {
    try {
        const v = JSON.parse(sessionStorage.getItem(KEY) || '[]');
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch { return []; }
}

export function writePkgQueue(ids: string[]) {
    try { sessionStorage.setItem(KEY, JSON.stringify([...new Set(ids)])); }
    catch { /* kota dolu / gizli mod — kuyruk kalıcı olmasa da akış çalışır */ }
}

/** Paketler sayfasından çağrılır: paketi kasa kuyruğunun başına ekler. */
export function sendPackageToKasa(planId: string) {
    writePkgQueue([planId, ...readPkgQueue()]);
}
