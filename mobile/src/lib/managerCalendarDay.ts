/**
 * Müdür · Takvim'in CANLI gün kaynağı.
 *
 * Personelin `salonDay.ts`'iyle aynı işi yapıyor ama başka yoldan: personel
 * `staff-api`'nin `calendar` ucundan okuyor, müdür kendi Supabase oturumuyla
 * doğrudan tablolardan. İkisi de aynı hâlleri, aynı yoklama aralığını ve aynı
 * bayatlık eşiğini kullanıyor (`useManagerRead` ↔ `useSalonDay`).
 *
 * Dört şey TEK okumada geliyor, çünkü dördü de aynı günün gerçeği ve ayrı ayrı
 * gelmeleri ekranda birbirini tutmayan bir an üretirdi: randevular, kadro,
 * o günkü izinler, haftanın gün sayıları.
 */

import { useCallback } from 'react';

import { addDaysISO, weekDays, type Appt } from './calendar.ts';
import { columnsFor, type CrewMember } from './managerMap.ts';
import { presenceOf } from './presence.ts';
import type { StaffPresence } from './managerFlow.ts';
import { useManagerRead, type ManagerSnapshot } from './managerRead';
import {
    apiSource, fetchCrew, fetchDayWithStamps, fetchLeave, fetchServerNow,
} from './managerSource';

export interface ManagerCalendarDay {
    rows: Appt[];
    /**
     * Randevu → `updated_at`. Takvimden yapılan taşımanın iyimser kilidi buna
     * dayanıyor; damgası olmayan satır takvimden TAŞINAMAZ.
     */
    stamps: ReadonlyMap<string, string>;
    /** Sütun alan personel — kural için bkz. `columnsFor`. */
    columns: CrewMember[];
    /** Sütunu olmayan randevu sayısı. Sıfırdan büyükse ekran bunu SÖYLEMELİ. */
    unassigned: number;
    /** Kadronun o günkü hâli — şerit ve personel günü ekranı bunu okuyor. */
    presence: StaffPresence[];
    /** O gün izinli olanlar — taşıma sayfası bunları seçilemez çiziyor. */
    onLeave: ReadonlySet<string>;
    /** Hafta şeridinin gün sayıları. Okunan her gün var, okunmayan yok. */
    counts: Record<string, number>;
}

const EMPTY: ManagerCalendarDay = {
    rows: [], stamps: new Map(), columns: [], unassigned: 0, presence: [], onLeave: new Set(), counts: {},
};

/**
 * İzin penceresi: okunan günden ileriye iki hafta.
 *
 * Tek gün okumak yetmezdi — "dönüş tarihi" ardışık izin günlerinden türüyor
 * (`staffDay.returnDateISO`) ve tek gün ardışıklık göstermez. İki hafta,
 * salon ölçeğinde bir iznin tamamını kapsayacak kadar geniş, sorguyu
 * şişirmeyecek kadar dar.
 */
const LEAVE_WINDOW_DAYS = 14;

export function useManagerCalendarDay(dateISO: string): ManagerSnapshot<ManagerCalendarDay> {
    const read = useCallback(async (): Promise<ManagerCalendarDay> => {
        const week = weekDays(dateISO);
        const from = week[0]?.date ?? dateISO;
        const to = week[week.length - 1]?.date ?? dateISO;
        // Dördü PARALEL: sırayla beklemek dört gidiş-dönüş demekti.
        const [day, crew, leave, counts, nowMs] = await Promise.all([
            fetchDayWithStamps(dateISO),
            fetchCrew(),
            fetchLeave(dateISO, addDaysISO(dateISO, LEAVE_WINDOW_DAYS)),
            apiSource.range(from, to),
            fetchServerNow(),
        ]);
        const { rows, stamps } = day;
        const { columns, unassigned } = columnsFor(crew, rows);
        const presence = presenceOf(columns, rows, leave, dateISO, nowMs);
        const onLeave = new Set(
            presence.filter((person) => person.state === 'leave').map((person) => person.id),
        );
        return { rows, stamps, columns, unassigned, presence, onLeave, counts };
    }, [dateISO]);

    return useManagerRead(read, EMPTY);
}
