/**
 * Müdür · Kasa'nın CANLI dönem okuması.
 *
 * Tek okumada: dönemin tahsilatları, önceki dönemin karşılaştırma dilimi,
 * hareket kartlarının randevuları, müşteri adları, kadro ve hizmet kataloğu.
 *
 * Bekleyen adisyonlar BURADA DEĞİL: onlar akışın ortak gün verisinde
 * (`managerDay` → `pendingOf(events)`). Kasa'nın paneli ile akışın
 * "tahsil edilmedi" kartları tek listeden türüyor; ayrı okumak iki ekrana iki
 * farklı sayı söyletirdi.
 */

import { useCallback } from 'react';

import type { CashPeriod, Movement } from './cash.ts';
import { periodRange, sumBetween, toMovements } from './cashBuild.ts';
import { useManagerRead, type ManagerSnapshot } from './managerRead';
import { fetchCashPayments, fetchCrew, fetchServices } from './managerSource';

export interface ManagerCash {
    /**
     * Bu verinin AİT OLDUĞU dönem. Dönem şeridine basıldığında eski dönemin
     * verisi yenisi gelene kadar elde duruyor; ekran bu alanla karşılaştırıp
     * "bu hafta" başlığının altına bugünün toplamını yazmıyor.
     */
    period: CashPeriod | null;
    movements: Movement[];
    /** Önceki dönemin AYNI noktaya kadarki toplamı — değişim hapının tabanı. */
    previousTotal: number;
}

const EMPTY: ManagerCash = { period: null, movements: [], previousTotal: 0 };

export function useManagerCash(period: CashPeriod): ManagerSnapshot<ManagerCash> {
    const read = useCallback(async (): Promise<ManagerCash> => {
        // Sınır okuma ANINDA: gece yarısını geçen açık ekran dünü okumasın.
        const range = periodRange(period, Date.now());
        const [cash, crew, services] = await Promise.all([
            fetchCashPayments(range.prevFrom, range.to, range.from),
            fetchCrew(),
            fetchServices(),
        ]);
        const current = cash.payments.filter((payment) => Date.parse(payment.paid_at) >= range.from);
        return {
            period,
            movements: toMovements(current, {
                reservations: new Map(cash.reservations.map((row) => [row.id, row])),
                customers: cash.customers,
                staff: new Map(crew.map((person) => [person.id, person.name])),
                services,
            }),
            previousTotal: sumBetween(cash.payments, range.prevFrom, range.prevTo),
        };
    }, [period]);

    return useManagerRead(read, EMPTY);
}
