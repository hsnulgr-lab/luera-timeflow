/**
 * Ziyaretin formülü — GEÇİCİ yerel katman.
 *
 * ── Neden var ────────────────────────────────────────────────────────────────
 * Formül sayfasının "Kaydet" düğmesi hiçbir yere yazmıyordu:
 *
 *     onPress={() => { feedback.medium(); router.back(); }}
 *
 * Haptik onay veriliyor, sayfa kapanıyor, kayıt yok. Personel formülü
 * yazdığını sanıp gidiyor; ertesi ay aynı müşteride "geçen sefer ne
 * yapmıştım" diye baktığında hiçbir şey bulamıyor. Yapılmış gibi görünüp
 * kaybolan bir işlem, hiç yapılmamış olmasından kötüdür.
 *
 * ── Neden sunucuya yazmıyor ─────────────────────────────────────────────────
 * `visit.formula` ucu CANLIDA ve hazır, ama mobil hâlâ `AUTH_MODE=stub` ile
 * çalışıyor: bugün oraya yazmak, olmayan bir oturumla istek atmak olurdu.
 * Yazma uçlarının bağlanması planın Faz 4'ü. Buradaki depo o güne kadarki
 * DİKİŞ: iki yüzey de tek yerden okuyup tek yere yazıyor, uç geldiğinde
 * değişecek olan yalnız bu dosyanın gövdesi.
 *
 * ── Kalıcı DEĞİL ────────────────────────────────────────────────────────────
 * Uygulama kapanınca kayboluyor — `calendarSource.addLocalAppointment` ile
 * aynı geçici katman ve aynı ömür. Diske yazmak, sunucu bağlandığında
 * uzlaştırılması gereken ikinci bir gerçek kaynağı doğururdu.
 */

import type { VisitFormula } from './formula.ts';

const STORE = new Map<string, VisitFormula>();

/** Ziyaretin formülünü yerel depoya yazar. Boş kimlik sessizce yok sayılır. */
export function saveVisitFormula(reservationId: string | null | undefined, formula: VisitFormula): void {
    if (!reservationId) return;
    STORE.set(reservationId, formula);
}

/** Yerel depodaki formül — yoksa null. */
export function visitFormulaOf(reservationId: string | null | undefined): VisitFormula | null {
    if (!reservationId) return null;
    return STORE.get(reservationId) ?? null;
}

/** Testler için: iki test birbirinin yazdığını görmesin. */
export function resetVisitFormulas(): void {
    STORE.clear();
}
