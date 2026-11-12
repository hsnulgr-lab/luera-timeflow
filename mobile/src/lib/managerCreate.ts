/**
 * Müdür · randevu oluşturmanın CANLI okumaları.
 *
 * İki ayrı okuma, iki ayrı tempo:
 *
 *   • BAĞLAM — hizmetler, kadro, ayarlar, paketler, saat. Yoklanmıyor
 *     (`poll: false`); randevu zili ve sekmeye dönüş tazeliyor.
 *   • DEFTER — müşteriler + 24 aylık ziyaretler (sayfalı, binlerce satır).
 *     Ayrı okuma (Hız 1): önceden bağlamın içindeydi ve HER randevu/ödeme
 *     zilinde baştan iniyordu. Şimdi yalnız `customers` zili ve Oluştur'a
 *     dönüş tazeliyor. Defterdeki "son geliş" bir randevu sonrası ancak
 *     ekrana dönünce güncelleniyor — randevu kurmanın kararı (uygunluk,
 *     çakışma) defterden değil GÜN okumasından ve sunucudan (060).
 *   • GÜN — seçilen günün randevuları ve izinleri. Yoklanıyor: müdür saat
 *     seçerken masaüstünden biri o saati doldurabilir; ray bunu görmeli.
 *     Son söz yine sunucunun (060).
 */

import { useCallback, useMemo } from 'react';

import type { Appt } from './calendar.ts';
import type { CustomerOption, ServiceOption } from './createFlow.ts';
import {
    customerOptionsOf, serviceOptionsOf, type CrewRecord, type CustomerRecord,
} from './createLive.ts';
import { packagesEnabledFor } from './cashBuild.ts';
import { openPlansOf, type OpenPlan } from './createPackage.ts';
import { DEFAULT_ARRIVAL_TOLERANCE_MIN } from './managerFlow.ts';
import { BOOKING_TABLES } from './liveSignal';
import { useManagerRead, type ManagerSnapshot } from './managerRead';
import {
    OrgError, apiSource, fetchCreateSettings, fetchCrew, fetchCustomerBook,
    fetchLeave, fetchOpenPlans, fetchServerNow, fetchServices, fetchStaffSchedules,
    type BookVisitRow, type CreateSettings,
} from './managerSource';
import { localClock } from './createLive.ts';

export interface CreateContext {
    /** Okuma anındaki gün — gün şeridinin başı. SUNUCU saatinden. */
    todayISO: string;
    services: ServiceOption[];
    crew: CrewRecord[];
    customers: CustomerOption[];
    /**
     * Hakkı kalan paketler (1.0.1). Paket motoru olmayan sektörde boş —
     * Kasa orada `paket_plan_id`yi ücretsiz saymıyor, bağ kurmak yanlış
     * söz olurdu. `null`: okunamadı. Randevu kurmayı KAPATMIYOR (paketsiz
     * randevu yine kurulur) ama ekran bunu söylüyor — sessizce boş liste,
     * bugünkü kusurun kendisi olurdu.
     */
    packages: OpenPlan[] | null;
    settings: CreateSettings;
    toleranceMin: number;
    serverNow: number;
    deviceAt: number;
}

type Light = Omit<CreateContext, 'customers'>;
interface Book { todayISO: string; people: CustomerRecord[]; visits: BookVisitRow[] }

/** Defterin tazelendiği tek tablo: müşteri eklenince/değişince. */
const BOOK_TABLES = ['customers'] as const;

export function useCreateContext(): ManagerSnapshot<CreateContext | null> {
    /*
     * HAFİF BAĞLAM — sunucu saati de ötekilerle PARALEL (Hız 1): önceden
     * defterin penceresi için önce saat bekleniyordu; defter ayrılınca bu
     * okumada saati bekleyen kimse kalmadı.
     */
    const readLight = useCallback(async (): Promise<Light> => {
        const [serverNow, catalog, crew, settings, schedules, plans] = await Promise.all([
            fetchServerNow(),
            fetchServices(),
            fetchCrew(),
            fetchCreateSettings(),
            fetchStaffSchedules(),
            fetchOpenPlans().catch((cause: unknown) => {
                // Salon reddi bütün okumanın işi; yalnız paket okuması düşerse null.
                if (cause instanceof OrgError) throw cause;
                console.warn('create context: paketler okunamadı', cause);
                return null;
            }),
        ]);
        const deviceAt = Date.now();
        return {
            todayISO: localClock(serverNow).dateISO,
            services: serviceOptionsOf(catalog),
            crew: crew.map((person) => ({
                id: person.id, name: person.name, color: person.color, active: person.active,
                workingHours: schedules.get(person.id) ?? null,
            })),
            packages: !packagesEnabledFor(settings.sector) ? [] : plans === null ? null : openPlansOf(plans),
            settings,
            // `arrival_tolerance_min` hiçbir göçte yok; okunmuyor (Hız 1).
            toleranceMin: DEFAULT_ARRIVAL_TOLERANCE_MIN,
            serverNow,
            deviceAt,
        };
    }, []);

    /*
     * DEFTER — pencere yine SUNUCU gününden (cihazın yanlış tarihi 24 aylık
     * sınırı kaydırmasın). Yoklama yok; randevu zili de YOK.
     */
    const readBook = useCallback(async (): Promise<Book> => {
        const todayISO = localClock(await fetchServerNow()).dateISO;
        const book = await fetchCustomerBook(todayISO);
        return { todayISO, ...book };
    }, []);

    const light = useManagerRead<Light | null>(readLight, null, { poll: false, tables: BOOKING_TABLES });
    const book = useManagerRead<Book | null>(readBook, null, { poll: false, tables: BOOK_TABLES });

    const data = useMemo<CreateContext | null>(() => {
        if (!light.data || !book.data) return null;
        return {
            ...light.data,
            customers: customerOptionsOf(book.data.people, book.data.visits, book.data.todayISO),
        };
    }, [light.data, book.data]);

    const { reload: reloadLight } = light;
    const { reload: reloadBook } = book;
    const reload = useCallback(async () => {
        await Promise.all([reloadLight(), reloadBook()]);
    }, [reloadLight, reloadBook]);

    /*
     * İki okuma, TEK görünüş — ekran eskisi gibi tek bir hâl görüyor:
     * biri okunamadıysa okunamadı, biri yükleniyorsa yükleniyor.
     */
    return {
        state: light.state === 'error' || book.state === 'error' ? 'error'
            : light.state === 'loading' || book.state === 'loading' ? 'loading' : 'ok',
        data,
        refusal: light.refusal ?? book.refusal,
        at: light.at === null || book.at === null ? null : Math.min(light.at, book.at),
        stale: light.stale || book.stale,
        reload,
    };
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
