/**
 * Müdür 23 · müşteri kartının CANLI türetilmesi. Saf, React'siz.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır: Expo, react-native ya da
 * Supabase bağımlılığı TAŞIMAZ.
 *
 * Kart bugüne kadar dört sahte müşteriden (`customerCard.mockCustomers`)
 * besleniyordu. Canlı kipte akıştan ya da randevu kartından dokunulan GERÇEK
 * müşteri o dört kişiden biri olmadığı için ekran "Müşteri bulunamadı"
 * diyordu — var olan bir müşteri için.
 *
 * ── Kartın bilerek BOŞ bıraktığı alan ───────────────────────────────────────
 * `balance: null`. Bakiyenin tek doğruluk kaynağı masaüstündeki
 * `patientBalance.ts` (plan borcu, mahsup, iptal, fazla tahsilat). İkinci kez
 * yazmak aynı müşteri için iki rakam demek. Kart `null`da borç satırını HİÇ
 * çizmiyor — tasarımın kendi kuralı ("₺0 asla yazılmaz").
 */

import { activePackage, type PackageRow, type RiskRule } from './apptInfo.ts';
import type {
    CustomerCard, CustomerHistoryRow, CustomerRisk, CustomerUpcoming,
} from './customerCard.ts';
import { riskList } from './customerFileMap.ts';

const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** "2026-06-18" → "18 Haz". */
export function shortDate(dateISO: string): string {
    const [, month, day] = dateISO.split('-').map(Number);
    if (!month || !day) return dateISO;
    return `${day} ${MONTH_SHORT[month - 1] ?? ''}`.trim();
}

export interface CardVisit {
    id: string;
    date: string;
    start_time: string;
    service: string;
    status: string;
    staff_id: string | null;
}

export interface CardPayment {
    id: string;
    reservation_id: string | null;
    amount: number;
    paid_at: string;
    description: string | null;
}

export interface CardInput {
    customer: {
        id: string;
        name: string;
        phone: string | null;
        notes: string | null;
        custom_fields: Record<string, unknown> | null;
    };
    riskRules: readonly RiskRule[];
    packages: readonly PackageRow[];
    /** Müşterinin randevuları — son gelen önce, sınırlı pencere. */
    visits: readonly CardVisit[];
    /** Bugünden ÖNCEKİ, iptal olmayan ziyaret sayısı — pencereden bağımsız sayım. */
    pastVisitCount: number;
    /** Müşterinin tahsilatları — en yeni önce. */
    payments: readonly CardPayment[];
    staff: ReadonlyMap<string, string>;
    todayISO: string;
    /** "14:05" — bugünün geçmiş randevusu "yaklaşan" sayılmasın. */
    nowClock: string;
}

/** Kartta gösterilecek tahsilat satırı sayısı — "Son işlemler". */
export const HISTORY_ROWS = 5;

const clock = (value: string) => value.slice(0, 5);

/**
 * Risk — kural motoru `customerFileMap.riskList`: personelin dosyası ve
 * randevu kartıyla AYNI kaynak. Birden çok kural açıksa tek kutuda, sırayla.
 */
export function cardRisk(rules: readonly RiskRule[], fields: Record<string, unknown> | null): CustomerRisk | null {
    const lines = riskList(rules, fields);
    if (lines.length === 0) return null;
    return {
        label: lines.map((line) => line.kind).join(' · '),
        text: lines.map((line) => line.text).join(' · '),
    };
}

export function customerCardOf(input: CardInput): CustomerCard {
    const staffName = (id: string | null) => (id ? input.staff.get(id) ?? null : null);
    const live = input.visits.filter((visit) => visit.status !== 'cancelled');

    // Son geliş: bugünden ÖNCEKİ son ziyaret (apptInfo.pastVisits ile aynı kural).
    const past = live
        .filter((visit) => visit.date < input.todayISO)
        .sort((a, b) => `${b.date} ${b.start_time}`.localeCompare(`${a.date} ${a.start_time}`));
    const last = past[0];

    const ahead = live
        .filter((visit) => visit.status !== 'completed'
            && (visit.date > input.todayISO
                || (visit.date === input.todayISO && clock(visit.start_time) >= input.nowClock)))
        .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`));
    const today = live
        .filter((visit) => visit.date === input.todayISO)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));

    const asUpcoming = (visit: CardVisit): CustomerUpcoming => ({
        date: visit.date === input.todayISO ? 'Bugün' : shortDate(visit.date),
        time: clock(visit.start_time),
        service: visit.service,
        staff: staffName(visit.staff_id),
    });

    /*
     * İLK ZİYARET BUGÜN: geçmiş yok ama bugün bir randevu var. O randevu
     * ayrıca "yaklaşan" diye İKİNCİ kez yazılmıyor.
     */
    const firstToday = input.pastVisitCount === 0 && !last ? today[0] : undefined;
    const next = ahead.find((visit) => visit.id !== firstToday?.id);

    const byReservation = new Map(input.visits.map((visit) => [visit.id, visit]));
    const history: CustomerHistoryRow[] = input.payments.slice(0, HISTORY_ROWS).map((payment) => {
        const visit = payment.reservation_id ? byReservation.get(payment.reservation_id) : undefined;
        const paidDate = localDateOf(payment.paid_at);
        return {
            id: payment.id,
            service: visit?.service?.trim() || payment.description?.trim() || 'Tahsilat',
            date: paidDate ? shortDate(paidDate) : '',
            staff: staffName(visit?.staff_id ?? null),
            amount: Number.isFinite(payment.amount) ? payment.amount : 0,
        };
    });

    const pack = activePackage(input.packages);
    const note = input.customer.notes?.trim();

    return {
        id: input.customer.id,
        name: input.customer.name,
        phone: input.customer.phone?.trim() || null,
        risk: cardRisk(input.riskRules, input.customer.custom_fields),
        balance: null,
        balanceSince: null,
        pkg: pack ? { name: pack.name, total: pack.total_sessions, used: pack.used_sessions } : null,
        lastVisit: last
            ? { date: shortDate(last.date), visitNo: Math.max(1, input.pastVisitCount), staff: staffName(last.staff_id) }
            : null,
        firstVisitToday: firstToday ? asUpcoming(firstToday) : null,
        upcoming: next ? asUpcoming(next) : null,
        history,
        // Müşteri kaydının notu tek metin; paragraflar ayrı kart satırı.
        notes: note ? note.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean) : [],
    };
}

/** `paid_at` → cihazın diliminde "2026-06-18". Çözülemeyen damga boş. */
function localDateOf(stamp: string): string {
    const at = new Date(stamp);
    if (Number.isNaN(at.getTime())) return '';
    const two = (n: number) => String(n).padStart(2, '0');
    return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
}
