/**
 * AKIŞIN TÜRETİLMESİ — randevu satırlarından günün olayları. Saf.
 *
 * `managerFlow.ts`in 1375 satırı zaten sağlamdı: tonlar, etiketler, bekleme
 * eşikleri, gecikme toleransı, kart metinleri, eylem kuralları. Sahte olan
 * yalnız son 165 satırdı — `mockDay`. Bu dosya o 165 satırın yerine geçiyor.
 *
 * ── Bir randevu, BİR olay ───────────────────────────────────────────────────
 * Akış bir günlük değil, GÜNÜN KENDİSİ: her satır bir randevunun ŞU ANKİ
 * hâlini söylüyor. "Geldi" sonra "başladı" diye iki satır yazmak, listeyi
 * ikiye katlar ve müdürün "şu an ne var" sorusunu zorlaştırırdı.
 *
 * ── Saat SUNUCUDAN ──────────────────────────────────────────────────────────
 * `etaMinutes`, `waitMinutes`, `dueMinutes` — üçü de `nowMs` üstünden.
 * Parametre, çünkü cihazın saati yanlış olabilir ve o zaman müşteri kırk
 * dakika bekletilmiş görünürdü. Saat `server_now()`tan geliyor (095).
 */

import { addDaysISO, clockText, formatDayMonth, toMinutes } from './calendar.ts';
import type { CashTicket } from './cashBuild.ts';
import type { ApptContext, FlowEvent, FlowKind } from './managerFlow.ts';
import { NO_SHOW_AFTER_MIN } from './managerFlow.ts';
import { withOwnStamps } from './dayStamp.ts';
import { clockLocative } from './text.ts';

export { ownDayStamp, STAMP_DAY_MARGIN_HOURS, withOwnStamps } from './dayStamp.ts';

export interface FlowRow {
    id: string;
    customer_id: string | null;
    customer_name: string;
    customer_phone: string | null;
    start_time: string;
    end_time: string;
    service: string;
    status: string;
    staff_id: string | null;
    customer_arrived_at: string | null;
    arrived_at: string | null;
    service_ended_at: string | null;
    /**
     * Müdür "Gelmedi" dedi (098). İsteğe bağlı: sütun okunamazsa (098 henüz
     * çalıştırılmamış) akış yine açılıyor, yalnız elle verilen karar görünmüyor.
     */
    no_show_at?: string | null;
    is_paid: boolean;
}

export interface PaymentRow {
    reservation_id: string | null;
    amount: number;
    paid_at: string;
}

const MIN = 60_000;

/** Damganın gün içi saati — "11:36". Çözülemeyen damga saat üretmiyor. */
function clockOf(stamp: string | null): string | null {
    if (!stamp) return null;
    const at = new Date(stamp);
    if (Number.isNaN(at.getTime())) return null;
    return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/** Damgadan şimdiye kaç dakika. Negatif yok: gelecekteki damga 0 sayılır. */
function minutesSince(stamp: string | null, nowMs: number): number | null {
    if (!stamp) return null;
    const at = Date.parse(stamp);
    if (!Number.isFinite(at)) return null;
    return Math.max(0, Math.floor((nowMs - at) / MIN));
}

/**
 * Randevunun başlamasına kaç dakika. EKSİ = gecikti.
 *
 * Gün de hesaba katılıyor: `start_time` yalnız saat taşıyor ve günün kendisi
 * ayrı bir alanda. İkisini birleştirmeden çıkarılan fark, dünün randevusunu
 * "birazdan" gösterirdi.
 */
export function etaFor(dateISO: string, startTime: string, nowMs: number): number {
    const start = Date.parse(`${dateISO}T${clockText(startTime)}:00`);
    if (!Number.isFinite(start)) return 0;
    return Math.round((start - nowMs) / MIN);
}

// Varsayılan tolerans TEK yerde: kartların geri sayımı da aynı sayıya bakıyor.
export { DEFAULT_ARRIVAL_TOLERANCE_MIN, NO_SHOW_AFTER_MIN } from './managerFlow.ts';


/**
 * Randevunun HÂLİ — masaüstünün `apptPhase` kuralının AYNISI.
 *
 * Sıra kural: yukarıdaki cevap aşağıdakini susturuyor. Ters sıra, tahsil
 * edilmiş bir randevuyu "gelmedi" diye gösterebilirdi.
 *
 * ── "Adisyon bekliyor" NEYE göre ────────────────────────────────────────────
 * Masaüstü Kasa'nın bekleyen listesi `status === 'completed' && !isPaid`.
 * Personelin `visit.finish` ucu da tam olarak bunu yazıyor (durum + bitiş
 * damgası birlikte). `service_ended_at`e bakmak, Kasa'nın listelemediği bir
 * satırı akışta "kasada bekliyor" diye göstermeye açıktı — iki ekran, iki
 * farklı bekleyen adisyon sayısı.
 */
export function kindOf(
    raw: FlowRow,
    dateISO: string,
    nowMs: number,
    toleranceMin: number = NO_SHOW_AFTER_MIN,
): FlowKind {
    // Başka bir güne ait damga bu günün hâlini belirlemiyor (`ownDayStamp`).
    const row = withOwnStamps(raw, dateISO);
    if (row.status === 'cancelled') return 'cancelled';
    // Onay bekleyen randevu bir OLAYDIR: müdürün yapacağı bir şey var.
    if (row.status === 'pending') return 'booked';
    if (row.status === 'completed') return row.is_paid ? 'paid' : 'due';
    if (row.arrived_at) return 'started';
    // Salona girdiyse ne kadar gecikmiş olursa olsun "gelmedi" DEĞİL.
    if (row.customer_arrived_at) return 'arrived';
    /*
     * Müdür "Gelmedi" dedi — toleransı beklemeden (098). Masaüstünün
     * `apptPhase`i aynı sırayla okuyor: geldi damgası bunu her zaman yener.
     */
    if (row.no_show_at) return 'noshow';
    /*
     * "Gelmedi" TÜRETİLİYOR, bir damgası yok — masaüstünde de yok.
     * Eşik salonun kendi toleransı: randevu saati + tolerans geçti ve kimse
     * gelmedi.
     */
    if (etaFor(dateISO, row.start_time, nowMs) < -toleranceMin) return 'noshow';
    return 'next';
}

/** Olayın satırda yazan saati — "bu ne zaman oldu". */
function timeOf(row: FlowRow, kind: FlowKind): string {
    const start = clockText(row.start_time);
    if (kind === 'paid' || kind === 'due') return clockOf(row.service_ended_at) ?? start;
    if (kind === 'started') return clockOf(row.arrived_at) ?? start;
    if (kind === 'arrived') return clockOf(row.customer_arrived_at) ?? start;
    return start;
}

/** "Keratin bakımı · 45 dk · Selin ile" */
function detailOf(row: Pick<FlowRow, 'service' | 'start_time' | 'end_time'>, staffName: string | null): string {
    const minutes = Math.max(0, toMinutes(clockText(row.end_time)) - toMinutes(clockText(row.start_time)));
    const parts = [row.service, `${minutes} dk`];
    if (staffName) parts.push(`${staffName} ile`);
    return parts.join(' · ');
}

export interface BuildInput {
    rows: readonly FlowRow[];
    payments: readonly PaymentRow[];
    /** Personel kimliği → ad. Bilinmeyen kimlik ad ÜRETMİYOR. */
    crew: ReadonlyMap<string, string>;
    /** Müşteri kimliği → kartın bağlam kutusu. */
    context: ReadonlyMap<string, ApptContext>;
    dateISO: string;
    nowMs: number;
    /** Salonun gecikme toleransı (dk). Yoksa masaüstünün varsayılanı. */
    toleranceMin?: number | null;
    /**
     * Açık adisyonlar (`cashBuild.ticketsOf`). Tahsil edilmemiş satırın
     * TUTARI buradan geliyor; bugünden eski olanlar "dünden kaldı" kartı olur.
     */
    tickets?: readonly CashTicket[];
}

export function buildFlow(input: BuildInput): FlowEvent[] {
    const paidBy = new Map<string, PaymentRow>();
    for (const payment of input.payments) {
        if (!payment.reservation_id) continue;
        const current = paidBy.get(payment.reservation_id);
        // Bir randevuya birden çok tahsilat yapılmış olabilir (kısmi ödeme);
        // satırda EN SONUNCUSU görünüyor ve tutar TOPLANIYOR.
        paidBy.set(payment.reservation_id, current
            ? { ...payment, amount: current.amount + payment.amount }
            : payment);
    }

    const ticketOf = new Map<string, CashTicket>();
    for (const ticket of input.tickets ?? []) {
        for (const id of ticket.ids) ticketOf.set(id, ticket);
    }

    const today = input.rows.map((raw) => {
        // Saat, bekleme ve sayaç da AYNI süzülmüş damgadan — hâl ile rakam
        // ayrı damgaya bakarsa "sıradaki" kartında 1143 saatlik sayaç çıkar.
        const row = withOwnStamps(raw, input.dateISO);
        const kind = kindOf(row, input.dateISO, input.nowMs, input.toleranceMin ?? NO_SHOW_AFTER_MIN);
        const staffName = row.staff_id ? (input.crew.get(row.staff_id) ?? null) : null;
        const [first = '', ...rest] = row.customer_name.trim().split(/\s+/);
        const payment = paidBy.get(row.id);
        const context = row.customer_id ? input.context.get(row.customer_id) : undefined;

        const event: FlowEvent = {
            id: row.id,
            time: timeOf(row, kind),
            kind,
            firstName: first,
            lastName: rest.join(' '),
            detail: detailOf(row, staffName),
            appointmentId: row.id,
            staffId: row.staff_id ?? undefined,
            staffName: staffName ?? undefined,
            customerId: row.customer_id ?? undefined,
            customerPhone: row.customer_phone,
            durationMinutes: Math.max(
                0,
                toMinutes(clockText(row.end_time)) - toMinutes(clockText(row.start_time)),
            ),
        };

        // Bağlam VARSA konuyor; boş bir nesne A2 kartını boş kutularla açardı.
        if (context && (context.balance || context.note || context.package)) {
            event.context = context;
        }

        if (kind === 'next') {
            event.etaMinutes = etaFor(input.dateISO, row.start_time, input.nowMs);
            // Kartın geri sayımı salonun GERÇEK toleransına baksın.
            event.toleranceMinutes = input.toleranceMin ?? NO_SHOW_AFTER_MIN;
        }
        if (kind === 'booked') event.pending = true;
        if (kind === 'arrived') {
            const waited = minutesSince(row.customer_arrived_at, input.nowMs);
            if (waited !== null) event.waitMinutes = waited;
        }
        if (kind === 'started') {
            const since = Date.parse(row.arrived_at ?? '');
            if (Number.isFinite(since)) {
                event.elapsedSeconds = Math.max(0, Math.floor((input.nowMs - since) / 1000));
                // Kartın okuduğu CÜMLE ("18:57’de başladı"), ham damga değil.
                // Eskiden ISO metni olduğu gibi ekrana basılıyordu.
                const clock = clockOf(row.arrived_at);
                if (clock) event.startedAt = `${clockLocative(clock)} başladı`;
            }
        }
        if (kind === 'due') {
            const waiting = minutesSince(row.service_ended_at, input.nowMs);
            if (waiting !== null) event.dueMinutes = waiting;
            if (staffName) event.servedBy = staffName;
            /*
             * TUTAR adisyondan. Önce hiç yazılmıyordu ve kart "₺0 tahsil
             * edilmedi" diyordu — Kasa'nın paneli de aynı sıfırı topluyordu.
             * Adisyonu bilinmeyen satırda tutar UYDURULMUYOR.
             */
            const ticket = ticketOf.get(row.id);
            if (ticket) {
                event.amountValue = ticket.balance;
                event.ticketKey = ticket.key;
            }
        }
        if (kind === 'paid') {
            if (staffName) event.servedBy = staffName;
            if (payment) {
                event.amountValue = payment.amount;
                const at = clockOf(payment.paid_at);
                if (at) event.paidAt = at;
            }
        }
        if (kind === 'noshow') {
            const late = -etaFor(input.dateISO, row.start_time, input.nowMs);
            event.noshowMinutes = Math.max(0, late);
        }
        return event;
    });

    return [...today, ...carriedEvents(input)];
}

/**
 * Bugünden ESKİ açık adisyonlar — "dünden kaldı" kartları.
 *
 * Tasarım bu kartı baştan çizmişti (`dueLevel` → `hot`, "dünden kaldı, 18
 * saat bekliyor") ama canlı akış yalnız bugünün randevularını okuyordu:
 * dün tahsil edilmemiş adisyon akışta da Kasa'nın panelinde de YOKTU.
 * Masaüstünün kuyruğu onu gösteriyor.
 *
 * Satır saati "Dün 19:40" ya da "12 Eylül 19:40": saat biçiminde olmadığı
 * için `sortFlow` onu bugünün olaylarının önüne koyuyor.
 */
function carriedEvents(input: BuildInput): FlowEvent[] {
    const yesterday = addDaysISO(input.dateISO, -1);
    const out: FlowEvent[] = [];
    for (const ticket of input.tickets ?? []) {
        const row = ticket.representative;
        if (!row.date || row.date >= input.dateISO) continue;
        const staffName = row.staff_id ? (input.crew.get(row.staff_id) ?? null) : null;
        const [first = '', ...rest] = row.customer_name.trim().split(/\s+/);
        const ended = ticket.endedAt ?? `${row.date}T${clockText(row.end_time)}:00`;
        const clock = clockOf(ended) ?? clockText(row.end_time);
        const day = row.date === yesterday ? 'Dün' : formatDayMonth(row.date);
        const event: FlowEvent = {
            id: `carry:${ticket.key}`,
            time: `${day} ${clock}`,
            kind: 'due',
            firstName: first,
            lastName: rest.join(' '),
            detail: detailOf(row, staffName),
            appointmentId: row.id,
            staffId: row.staff_id ?? undefined,
            staffName: staffName ?? undefined,
            customerId: row.customer_id ?? undefined,
            customerPhone: row.customer_phone,
            amountValue: ticket.balance,
            ticketKey: ticket.key,
            carriedOver: true,
        };
        const waiting = minutesSince(ended, input.nowMs);
        if (waiting !== null) event.dueMinutes = waiting;
        if (staffName) event.servedBy = staffName;
        out.push(event);
    }
    return out;
}

/** Günün cirosu — akıştan DEĞİL tahsilattan; iptal ve iade orada yaşıyor. */
export function revenueOf(payments: readonly PaymentRow[]): number {
    return payments.reduce((sum, payment) => sum + (Number.isFinite(payment.amount) ? payment.amount : 0), 0);
}

/**
 * Doluluk — dolu dakika ÷ açık dakika.
 *
 * İptal SAYILMIYOR: iptal edilmiş randevu kimsenin vaktini almıyor. Salonun
 * açık olduğu süre bilinmiyorsa oran da HESAPLANMIYOR — uydurma bir payda,
 * uydurma bir yüzde demektir.
 */
export function occupancyOf(
    rows: readonly FlowRow[],
    openMinutes: number | null,
    staffCount: number,
): number | null {
    if (openMinutes === null || openMinutes <= 0 || staffCount <= 0) return null;
    const busy = rows
        .filter((row) => row.status !== 'cancelled')
        .reduce((sum, row) => sum + Math.max(
            0,
            toMinutes(clockText(row.end_time)) - toMinutes(clockText(row.start_time)),
        ), 0);
    return Math.round((busy / (openMinutes * staffCount)) * 100);
}
