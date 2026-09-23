/**
 * Müdür · randevu oluşturmanın CANLI okumaları.
 *
 * İki ayrı okuma, iki ayrı tempo:
 *
 *   • BAĞLAM — hizmetler, kadro, müşteri defteri, ayarlar, tolerans, saat.
 *     Yoklanmıyor (`poll: false`): defter binlerce satır olabilir ve randevu
 *     kurarken değişmesi beklenmiyor. Sekmeye dönüşte tazeleniyor.
 *   • GÜN — seçilen günün randevuları ve izinleri. Yoklanıyor: müdür saat
 *     seçerken masaüstünden biri o saati doldurabilir; ray bunu görmeli.
 *     Son söz yine sunucunun (060).
 */

import { useCallback } from 'react';

import type { Appt } from './calendar.ts';
import type { CustomerOption, ServiceOption } from './createFlow.ts';
import {
    customerOptionsOf, serviceOptionsOf, type CrewRecord,
} from './createLive.ts';
import { DEFAULT_ARRIVAL_TOLERANCE_MIN } from './managerFlow.ts';
import { BOOKING_TABLES } from './liveSignal';
import { useManagerRead, type ManagerSnapshot } from './managerRead';
import {
    apiSource, fetchArrivalTolerance, fetchCreateSettings, fetchCrew, fetchCustomerBook,
    fetchLeave, fetchServerNow, fetchServices, fetchStaffSchedules, type CreateSettings,
} from './managerSource';
import { localClock } from './createLive.ts';

export interface CreateContext {
    /** Okuma anındaki gün — gün şeridinin başı. SUNUCU saatinden. */
    todayISO: string;
    services: ServiceOption[];
    crew: CrewRecord[];
    customers: CustomerOption[];
    settings: CreateSettings;
    toleranceMin: number;
    serverNow: number;
    deviceAt: number;
}

export function useCreateContext(): ManagerSnapshot<CreateContext | null> {
    const read = useCallback(async (): Promise<CreateContext> => {
        const serverNow = await fetchServerNow();
        const deviceAt = Date.now();
        const todayISO = localClock(serverNow).dateISO;
        const [catalog, crew, book, settings, tolerance, schedules] = await Promise.all([
            fetchServices(),
            fetchCrew(),
            fetchCustomerBook(todayISO),
            fetchCreateSettings(),
            fetchArrivalTolerance(),
            fetchStaffSchedules(),
        ]);
        return {
            todayISO,
            services: serviceOptionsOf(catalog),
            crew: crew.map((person) => ({
                id: person.id, name: person.name, color: person.color, active: person.active,
                workingHours: schedules.get(person.id) ?? null,
            })),
            customers: customerOptionsOf(book.people, book.visits, todayISO),
            settings,
            toleranceMin: tolerance ?? DEFAULT_ARRIVAL_TOLERANCE_MIN,
            serverNow,
            deviceAt,
        };
    }, []);
    return useManagerRead<CreateContext | null>(read, null, { poll: false, tables: BOOKING_TABLES });
}

export interface CreateDay {
    /** Bu verinin AİT OLDUĞU gün — başka günün saatleri bu güne yazılmasın. */
    dateISO: string | null;
    appointments: Appt[];
    leave: Map<string, string[]>;
}

const NO_DAY: CreateDay = { dateISO: null, appointments: [], leave: new Map() };

export function useCreateDay(dateISO: string | null): ManagerSnapshot<CreateDay> {
    const read = useCallback(async (): Promise<CreateDay> => {
        if (!dateISO) return NO_DAY;
        const [appointments, leave] = await Promise.all([
            apiSource.day(dateISO),
            fetchLeave(dateISO, dateISO),
        ]);
        return { dateISO, appointments, leave };
    }, [dateISO]);
    return useManagerRead(read, NO_DAY, { tables: BOOKING_TABLES });
}
