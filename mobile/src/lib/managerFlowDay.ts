/**
 * Müdür · Akış'ın CANLI gün okuması.
 *
 * Tek okumada günün bütün gerçeği: randevular (tahsil hâli ve kilit
 * damgasıyla), tahsilatlar, kadro, izinler, müşteri bağlamları, salonun
 * gecikme toleransı, açık dakikası ve SUNUCUNUN saati.
 *
 * ── Saat neden iki parça ────────────────────────────────────────────────────
 * Sunucu saati okuma anında alınıyor (`serverNow`) ve aynı anda cihazın saati
 * de not ediliyor (`deviceAt`). Aradaki fark cihazın SAPMASI. Ekran dakika
 * dakika ilerlerken yeni sunucu okuması beklemiyor: `cihaz şimdi + sapma`
 * hesaplıyor. Böylece bekleme sayacı yirmi beş saniyelik yoklamayı beklemeden
 * akıyor ama telefonun yanlış saati hiçbir dakikaya karışmıyor.
 */

import { useCallback } from 'react';

import { addDaysISO, todayISO } from './calendar.ts';
import {
    packagesEnabledFor, ticketsOf, type CashTicket,
} from './cashBuild.ts';
import type { FlowRow, PaymentRow } from './flowBuild.ts';
import type { ApptContext, StaffPresence } from './managerFlow.ts';
import { columnsFor, type CrewMember } from './managerMap.ts';
import { presenceOf } from './presence.ts';
import { BOOKING_TABLES } from './liveSignal';
import { useManagerRead, type ManagerSnapshot } from './managerRead';
import {
    fetchCrew, fetchDayContext, fetchFlowRows, fetchLeave, fetchOpenTicketRows, fetchOrgSettings,
    fetchPayments, fetchServerNow, fetchServices, openMinutesOf,
} from './managerSource';

export interface ManagerFlowDay {
    dateISO: string;
    rows: FlowRow[];
    payments: PaymentRow[];
    crew: CrewMember[];
    presence: StaffPresence[];
    context: Map<string, ApptContext>;
    /** Randevu kimliği → `updated_at`. Akıştan yapılan yazmaların kilidi. */
    stamps: Map<string, string>;
    toleranceMin: number | null;
    /** Açık adisyonlar — bugünkü ve devreden. Tutar ve bekleyen sayısı buradan. */
    tickets: CashTicket[];
    openMinutes: number | null;
    serverNow: number | null;
    deviceAt: number | null;
    /** Salonun adı — WhatsApp hazır metninin "{Salon}’dan merhaba"sı. */
    businessName: string;
}

const EMPTY: ManagerFlowDay = {
    dateISO: '', rows: [], payments: [], crew: [], presence: [],
    context: new Map(), stamps: new Map(), toleranceMin: null, tickets: [], openMinutes: null,
    serverNow: null, deviceAt: null, businessName: '',
};

const LEAVE_WINDOW_DAYS = 14;

/**
 * `active` — açık sekme bu veriyi kullanıyor mu (bkz. `ManagerDayProvider`).
 * Kullanmıyorsa okuma odak dışı sayılıyor: yoklama ve zil durur, dönüşte
 * TEK okuma.
 */
export function useManagerFlowDay(active = true): ManagerSnapshot<ManagerFlowDay> {
    const read = useCallback(async (): Promise<ManagerFlowDay> => {
        /*
         * GÜN, okuma ANINDA belirleniyor. Kanca ilk çizimde sabitlenmiş bir
         * "bugün" tutsaydı, gece yarısını geçen açık bir ekran dünü okumaya
         * devam ederdi.
         */
        const dateISO = todayISO();
        /*
         * AYAR SATIRI TURDA BİR KEZ (Hız 1). Önceden dört ayrı okuma vardı
         * (tolerans · sektör+ad · çalışma saati · risk kuralları), her biri
         * iki ardışık istek: sekiz istek, biri her turda 42703 ile düşen.
         * Şimdi tek okuma, gerekenler ondan türüyor. Paylaşım YALNIZ bu
         * turun içinde — modül önbelleği yok, salon değişince taşınacak
         * bir şey kalmıyor.
         */
        const settingsP = fetchOrgSettings('sector, business_name, working_hours, risk_rules');
        const flowP = fetchFlowRows(dateISO);
        /*
         * Müşteri bağlamı randevulara bağlı — ama ötekilere DEĞİL. Bütün
         * okumayı beklemek yerine randevular ve ayar gelir gelmez başlıyor.
         */
        const contextP = Promise.all([flowP, settingsP]).then(([flow, settings]) => fetchDayContext(
            flow.rows.map((row) => row.customer_id).filter((id): id is string => Boolean(id)),
            settings?.risk_rules,
        ));
        // Ötekilerden biri önce düşerse bu söz beklenmeden kalır; "yakalanmamış
        // red" uyarısı vermesin. Hata yine `await contextP`te atılıyor.
        contextP.catch(() => undefined);
        const [flow, payments, crew, leave, settings, serverNow, open, services] = await Promise.all([
            flowP,
            fetchPayments(dateISO),
            fetchCrew(),
            fetchLeave(dateISO, addDaysISO(dateISO, LEAVE_WINDOW_DAYS)),
            settingsP,
            fetchServerNow(),
            fetchOpenTicketRows(dateISO),
            fetchServices(),
        ]);
        // Cihaz saati okuma BİTİNCE not ediliyor: sapma, sunucu cevabıyla
        // aynı ana ait olsun.
        const deviceAt = Date.now();
        const context = await contextP;
        const openMinutes = openMinutesOf(settings?.working_hours, dateISO);
        // Akış satırı presence'ın okuduğu alanların üst kümesi; kopya yok.
        const { columns } = columnsFor(crew, flow.rows);
        const packagesEnabled = packagesEnabledFor(settings?.sector);
        const grouped = ticketsOf(open.rows, open.payments, services, packagesEnabled);
        /*
         * GRUBU TAMAMLANMAMIŞ satır: kendisi bitti ama grup arkadaşı sürüyor.
         * Masaüstü Kasa onu henüz listelemiyor; akış ise "tahsil edilmedi"
         * diyor (satır `completed`). Kartta ₺0 yazmasın diye TEK başına
         * hesaplanıyor — kendi hizmeti, kendi adisyonu, kendi kaporası.
         */
        const covered = new Set(grouped.flatMap((ticket) => ticket.ids));
        const singles = ticketsOf(
            open.rows
                .filter((row) => row.status === 'completed' && !row.is_paid && !covered.has(row.id))
                .map((row) => ({ ...row, group_id: null })),
            open.payments,
            services,
            packagesEnabled,
        );
        return {
            dateISO,
            rows: flow.rows,
            payments,
            crew,
            presence: presenceOf(columns, flow.rows, leave, dateISO, serverNow),
            context,
            stamps: flow.stamps,
            // Kolon hiçbir göçte yok (bkz. `managerSource` · tolerans notu):
            // `null`, varsayılanı türetme katmanı veriyor.
            toleranceMin: null,
            tickets: [...grouped, ...singles],
            openMinutes,
            businessName: String(settings?.business_name ?? '').trim(),
            serverNow,
            deviceAt,
        };
    }, []);

    return useManagerRead(read, EMPTY, { tables: BOOKING_TABLES, active });
}
