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
import { sellsPackages } from './packageSale.ts';
import type {
    CustomerCard, CustomerHistoryRow, CustomerRisk, CustomerUpcoming,
} from './customerCard.ts';
import { riskList } from './customerFileMap.ts';
import { activeFlags, blockLabel, closedBy, type EligibilityRule } from './eligibility.ts';
import { customerFieldCells } from './sectorFields.ts';

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
        /** Kaydın açıldığı an — "Mart 2023'ten beri". */
        created_at?: string | null;
    };
    riskRules: readonly (RiskRule & EligibilityRule)[];
    /** Salonun sektörü — müşteri alanlarının etiketleri buradan. */
    sector?: string | null;
    /** Bütün tahsilatların toplamı; okunamadıysa `null`. */
    totalPaid?: number | null;
    /** İlk ziyaretin günü (pencereden bağımsız) — sıklığın başlangıcı. */
    firstVisitISO?: string | null;
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

    // ── Müdür 23 v2 ─────────────────────────────────────────────────────────
    const fields = input.customer.custom_fields;
    const flags = activeFlags(input.riskRules, fields);
    const closed = [...new Set(flags.flatMap((flag) => flag.blocks))].map(blockLabel).filter(Boolean);
    const pastLive = live.filter((visit) => visit.date < input.todayISO);

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
        flags: flags.map((flag) => ({ label: flag.label, note: flag.note })),
        closed,
        fields: customerFieldCells(input.sector, fields, flags.map((flag) => flag.key)),
        packages: input.packages.map((row) => {
            const reason = closedBy(input.riskRules, fields, { name: row.name });
            return {
                name: row.name,
                total: row.total_sessions,
                used: row.used_sessions,
                closedBy: reason ? reason.label : null,
                planId: row.plan_id ?? null,
                owed: row.owed ?? null,
            };
        }),
        canSellPackage: sellsPackages(input.sector),
        since: sinceText(input.customer.created_at ?? null, input.todayISO),
        visitCount: input.pastVisitCount,
        totalPaid: input.totalPaid ?? null,
        frequency: frequencyText(input.firstVisitISO ?? null, input.todayISO, input.pastVisitCount),
        topService: topServiceOf(pastLive),
        upcomingId: next?.id ?? null,
        notesText: note ?? '',
    };
}

const MONTH_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
/** Yılın okunuşunun son kelimesine göre ayrılma eki: bir→den, üç→ten, altı→dan… */
const ONES_ABL = ['', 'den', 'den', 'ten', 'ten', 'ten', 'dan', 'den', 'den', 'dan'];
const TENS_ABL = ['', 'dan', 'den', 'dan', 'tan', 'den', 'tan', 'ten', 'den', 'dan'];

/** "Mart 2023'ten beri". Bugün açılmışsa "Bugün kaydedildi". */
export function sinceText(createdAt: string | null, todayISO: string): string | null {
    const date = createdAt ? localDateOf(createdAt) : '';
    if (!date) return null;
    if (date === todayISO) return 'Bugün kaydedildi';
    const [year, month] = date.split('-').map(Number);
    if (!year || !month) return null;
    const ones = year % 10;
    const tens = Math.floor(year / 10) % 10;
    const suffix = ones ? ONES_ABL[ones] : tens ? TENS_ABL[tens] : 'den';
    return `${MONTH_LONG[month - 1]} ${year}’${suffix} beri`;
}

/**
 * "26 günde bir" — ilk ziyaretten bugüne geçen gün ÷ ziyaret sayısı.
 *
 * Tasarım başlangıç olarak kaydın açıldığı günü öneriyordu; eski kayıtlar
 * içe aktarıldığı gün açılmış görünüyor ve sıklığı uyduruyordu. İlk ziyaret
 * gerçek bir ölçüm. İki ziyaretten azsa sıklık YOK.
 */
export function frequencyText(firstISO: string | null, todayISO: string, visits: number): string | null {
    if (!firstISO || visits < 2) return null;
    const days = Math.round((Date.parse(`${todayISO}T00:00:00Z`) - Date.parse(`${firstISO}T00:00:00Z`)) / 86_400_000);
    if (!Number.isFinite(days) || days <= 0) return null;
    const every = Math.max(1, Math.round(days / visits));
    return every === 1 ? 'her gün' : `${every} günde bir`;
}

/** Pencerede en çok alınan hizmet; eşitlikte en son alınan önde. */
function topServiceOf(visits: readonly CardVisit[]): string | null {
    const counts = new Map<string, number>();
    for (const visit of visits) {
        const name = visit.service?.trim();
        if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [name, count] of counts) {
        if (count > bestCount) { best = name; bestCount = count; }
    }
    return best;
}

/** `paid_at` → cihazın diliminde "2026-06-18". Çözülemeyen damga boş. */
function localDateOf(stamp: string): string {
    const at = new Date(stamp);
    if (Number.isNaN(at.getTime())) return '';
    const two = (n: number) => String(n).padStart(2, '0');
    return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
}

// ── Tüm geçmiş (Müdür 23 v2) ────────────────────────────────────────────────

export interface FullHistoryRow {
    id: string;
    service: string;
    /** "14 Ağu" — yıl bu yıl değilse "14 Ağu 2025". */
    date: string;
    staff: string | null;
    /** Bu ziyarete bağlı tahsilatların toplamı; hiç yoksa `null`. */
    amount: number | null;
}

/** Ay başlıklı liste için: "Ağustos 2026" grupları, yeniden eskiye. */
export function fullHistoryOf(input: {
    visits: readonly { id: string; date: string; service: string; staff_id: string | null }[];
    payments: readonly { reservation_id: string; amount: number }[];
    staff: ReadonlyMap<string, string>;
    todayISO: string;
}): { month: string; rows: FullHistoryRow[] }[] {
    const paid = new Map<string, number>();
    for (const payment of input.payments) {
        paid.set(payment.reservation_id, (paid.get(payment.reservation_id) ?? 0) + (Number(payment.amount) || 0));
    }
    const thisYear = input.todayISO.slice(0, 4);
    const groups: { month: string; rows: FullHistoryRow[] }[] = [];
    for (const visit of input.visits) {
        const [year, month] = visit.date.split('-').map(Number);
        if (!year || !month) continue;
        const title = `${MONTH_LONG[month - 1]} ${year}`;
        let group = groups.at(-1);
        if (!group || group.month !== title) {
            group = { month: title, rows: [] };
            groups.push(group);
        }
        const short = shortDate(visit.date);
        group.rows.push({
            id: visit.id,
            service: visit.service.trim() || 'Randevu',
            date: visit.date.startsWith(thisYear) ? short : `${short} ${year}`,
            staff: visit.staff_id ? input.staff.get(visit.staff_id) ?? null : null,
            amount: paid.has(visit.id) ? paid.get(visit.id) ?? null : null,
        });
    }
    return groups;
}
