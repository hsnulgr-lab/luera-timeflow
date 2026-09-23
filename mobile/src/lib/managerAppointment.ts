/**
 * Randevu kartının CANLI kaynağı.
 *
 * Ekran günün TAMAMINI okuyup içinden id ile randevu arıyordu — çünkü sahte
 * kaynakta "id ile getir" diye bir yol yoktu. İki bedeli vardı: kart, gününü
 * bilmediği bir randevuyu hiç açamıyordu (yol parametresi yanlışsa "silinmiş"
 * diyordu), ve bir randevu için otuz satır okunuyordu.
 *
 * Artık randevu kendi kimliğiyle geliyor; gün listesi yalnız kartın "aynı gün
 * başka ne var" sorusu için okunuyor.
 */

import { useCallback } from 'react';

import { addDaysISO, type Appt } from './calendar.ts';
import { apptInfoOf, withInfo } from './apptInfo.ts';
import { columnsFor, type CrewMember } from './managerMap.ts';
import { presenceOf } from './presence.ts';
import type { StaffPresence } from './managerFlow.ts';
import type { ServiceOption } from './createFlow.ts';
import { dayWindowOf, serviceOptionsOf, type OpenWindow } from './createLive.ts';
import { BOOKING_TABLES } from './liveSignal';
import { useManagerRead, type ManagerSnapshot } from './managerRead';
import {
    apiSource, fetchAppointment, fetchCrew, fetchCustomerContext, fetchHoursRow, fetchLeave, fetchServerNow,
    fetchServices, fetchStaffSchedules,
} from './managerSource';

export interface ManagerAppointmentData {
    /** Künyesi oturtulmuş randevu. Okuma başarılı ama satır yoksa `null`. */
    appointment: Appt | null;
    /**
     * Okumadaki `updated_at`.
     *
     * İyimser kilidin dayanağı: yazarken `.eq('updated_at', bu)` konuyor.
     * Kart açıldıktan sonra başka bir cihaz randevuyu değiştirdiyse yazma
     * tutmuyor ve ekran ezmek yerine farkı gösteriyor.
     */
    updatedAt: string | null;
    /** Aynı günün öteki randevuları — kartın "ne zaman boş" sorusu için. */
    dayRows: Appt[];
    columns: CrewMember[];
    presence: StaffPresence[];
    onLeave: ReadonlySet<string>;
    /** Salonun hizmet kataloğu (`services` tablosu). */
    services: ServiceOption[];
    /** Sunucu saati ve aynı andaki cihaz saati — damgalar bundan yazılıyor. */
    serverNow: number | null;
    deviceAt: number | null;
    /** Salonun randevu günündeki açık aralığı — taşıma menüsünün saatleri. */
    open: OpenWindow | null | undefined;
}

const EMPTY: ManagerAppointmentData = {
    appointment: null, updatedAt: null, dayRows: [],
    columns: [], presence: [], onLeave: new Set(), services: [], serverNow: null, deviceAt: null, open: undefined,
};

const LEAVE_WINDOW_DAYS = 14;

export function useManagerAppointment(
    id: string | undefined,
): ManagerSnapshot<ManagerAppointmentData> {
    const read = useCallback(async (): Promise<ManagerAppointmentData> => {
        if (!id) return EMPTY;
        const { row, updatedAt } = await fetchAppointment(id);
        // Satır yoksa künye aramanın anlamı yok ve müşteri kimliği de yok.
        if (!row) return { ...EMPTY, updatedAt: null };

        const dateISO = row.date;
        const [dayRows, crew, leave, nowMs, context, catalog, hours, schedules] = await Promise.all([
            apiSource.day(dateISO),
            fetchCrew(),
            fetchLeave(dateISO, addDaysISO(dateISO, LEAVE_WINDOW_DAYS)),
            fetchServerNow(),
            // Müşteri kimliği YOKSA künye de yok: adıyla aramak, aynı adlı iki
            // müşteride yanlış kişinin geçmişini göstermek olurdu.
            row.customer_id ? fetchCustomerContext(row.customer_id) : Promise.resolve(null),
            fetchServices(),
            // Saat okunamazsa kart DÜŞMÜYOR; menü varsayılan günü listeler.
            fetchHoursRow().catch(() => null),
            fetchStaffSchedules().catch(() => new Map<string, unknown>()),
        ]);

        const deviceAt = Date.now();
        const { columns } = columnsFor(crew, dayRows);
        const presence = presenceOf(columns, dayRows, leave, dateISO, nowMs);
        const onLeave = new Set(
            presence.filter((person) => person.state === 'leave').map((person) => person.id),
        );
        const info = context
            ? apptInfoOf({
                riskRules: context.riskRules,
                customFields: context.customFields,
                packages: context.packages,
                history: context.history,
                dateISO,
            })
            : null;

        return {
            appointment: withInfo(row, info),
            updatedAt,
            dayRows,
            columns,
            presence,
            onLeave,
            services: serviceOptionsOf(catalog),
            serverNow: nowMs,
            deviceAt,
            open: dayWindowOf(
                crew.map((member) => ({ active: member.active, workingHours: schedules.get(member.id) ?? null })),
                hours?.raw ?? null,
                dateISO,
            ),
        };
    }, [id]);

    return useManagerRead(read, EMPTY, { tables: BOOKING_TABLES });
}
