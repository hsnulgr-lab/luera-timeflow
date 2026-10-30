import type { Expense, Payment, PaymentMethod, PaymentType } from '@/types';

// ── Kasa defteri (2026-10-31) ────────────────────────────────────────────────
// Kasa'nın "Hareketler" ve "Gün sonu" ekranlarının ortak hesabı. Üç kaynak tek
// listede: tahsilatlar (payments), iptal izleri (payment_void_log, 102) ve
// tek seferlik giderler (expenses, 080).
//
// Tekrarlı gider (kira, maaş) BİLEREK kasaya girmez: o satır aylara yayılan
// bir muhasebe kaydıdır, çekmeceden o gün çıkan para değildir. Kâr raporu
// onu expandExpenses ile ayrıca sayar.
//
// İptal satırı TOPLAMA girmez: silinen tahsilat zaten payments'ta yok; iz
// yalnız "ne silindi" sorusuna cevap verir.

export type MoveKind = 'income' | 'expense' | 'void';

export interface VoidRow {
    id: string;
    paymentId: string;
    voidedAt: string;
    amount: number;
    method: PaymentMethod;
    type?: PaymentType;
    description?: string;
    customerId?: string;
    paidAt?: string;
}

export interface KasaMove {
    id: string;
    kind: MoveKind;
    /** Sıralama ve saat gösterimi için ISO zaman damgası. */
    at: string;
    /** Yerel gün (YYYY-MM-DD). */
    day: string;
    amount: number;
    method: PaymentMethod;
    description?: string;
    customerId?: string;
    /** Tahsilatın türü: hizmet / paket / ürün / diğer. */
    income?: 'service' | 'package' | 'product' | 'other';
    expenseCategory?: Expense['category'];
}

export interface KasaSummary {
    income: number;
    expense: number;
    net: number;
    count: number;
    byMethod: Record<PaymentMethod, number>;
    byIncome: Record<'service' | 'package' | 'product' | 'other', number>;
    cashIn: number;
    cashOut: number;
    /** Çekmecede olması gereken: nakit tahsilat − nakit gider. */
    expectedCash: number;
    expenseCount: number;
    voidCount: number;
    voidTotal: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Yerel saat diliminde gün (toISODate ile aynı kural). */
export function localDay(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDay(day: string, delta: number): string {
    const d = new Date(`${day}T12:00:00`);
    d.setDate(d.getDate() + delta);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export { shiftDay };

export type RangePreset = 'today' | 'yesterday' | 'week' | 'month';

/** Hazır aralıklar. Hafta pazartesi başlar (Türkiye takvimi). */
export function presetRange(preset: RangePreset, today: string): { from: string; to: string } {
    if (preset === 'today') return { from: today, to: today };
    if (preset === 'yesterday') { const y = shiftDay(today, -1); return { from: y, to: y }; }
    if (preset === 'week') {
        const wd = (new Date(`${today}T12:00:00`).getDay() + 6) % 7;   // pazartesi = 0
        return { from: shiftDay(today, -wd), to: today };
    }
    return { from: `${today.slice(0, 8)}01`, to: today };
}

const inRange = (day: string, from: string, to: string) => day >= from && day <= to;

function incomeKind(p: { type?: PaymentType; treatmentPlanId?: string; productId?: string }): KasaMove['income'] {
    if (p.treatmentPlanId) return 'package';
    if (p.type === 'product' || p.productId) return 'product';
    if (p.type === 'service') return 'service';
    return 'other';
}

export function buildMoves(payments: Payment[], voids: VoidRow[], expenses: Expense[], from: string, to: string): KasaMove[] {
    const out: KasaMove[] = [];
    for (const p of payments) {
        if (!p.paidAt) continue;
        const day = localDay(p.paidAt);
        if (!inRange(day, from, to)) continue;
        out.push({
            id: `p:${p.id}`, kind: 'income', at: p.paidAt, day, amount: p.amount, method: p.method,
            description: p.description, customerId: p.customerId, income: incomeKind(p),
        });
    }
    for (const v of voids) {
        const day = localDay(v.voidedAt);
        if (!inRange(day, from, to)) continue;
        out.push({
            id: `v:${v.id}`, kind: 'void', at: v.voidedAt, day, amount: v.amount, method: v.method,
            description: v.description, customerId: v.customerId,
        });
    }
    for (const e of expenses) {
        if (e.recurrence) continue;
        if (!inRange(e.spentOn, from, to)) continue;
        // Gider gününe girildiyse kayıt saati, geriye dönük girildiyse gün ortası.
        const at = e.createdAt && localDay(e.createdAt) === e.spentOn ? e.createdAt : `${e.spentOn}T12:00:00`;
        out.push({
            id: `e:${e.id}`, kind: 'expense', at, day: e.spentOn, amount: e.amount, method: e.method,
            description: e.description, expenseCategory: e.category,
        });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
}

export function summarize(moves: KasaMove[]): KasaSummary {
    const byMethod: KasaSummary['byMethod'] = { cash: 0, card: 0, transfer: 0, other: 0 };
    const byIncome: KasaSummary['byIncome'] = { service: 0, package: 0, product: 0, other: 0 };
    let income = 0, expense = 0, count = 0, cashOut = 0, expenseCount = 0, voidCount = 0, voidTotal = 0;
    for (const m of moves) {
        if (m.kind === 'income') {
            income += m.amount; count += 1;
            byMethod[m.method] = (byMethod[m.method] || 0) + m.amount;
            byIncome[m.income || 'other'] += m.amount;
        } else if (m.kind === 'expense') {
            expense += m.amount; expenseCount += 1;
            if (m.method === 'cash') cashOut += m.amount;
        } else {
            voidCount += 1; voidTotal += m.amount;
        }
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
        income: round(income), expense: round(expense), net: round(income - expense), count,
        byMethod, byIncome, cashIn: round(byMethod.cash), cashOut: round(cashOut),
        expectedCash: round(byMethod.cash - cashOut), expenseCount, voidCount, voidTotal: round(voidTotal),
    };
}

/** payment_void_log satırı → VoidRow. Snapshot payments satırının to_jsonb'sidir. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapVoidRow(row: any): VoidRow {
    const s = row.payment_snapshot || {};
    return {
        id: row.id, paymentId: row.payment_id, voidedAt: row.voided_at,
        amount: Number(s.amount) || 0, method: (s.method || 'other') as PaymentMethod,
        type: s.type || undefined, description: s.description || undefined,
        customerId: s.customer_id || undefined, paidAt: s.paid_at || undefined,
    };
}
