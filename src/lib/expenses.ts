// ── Gider defteri hesapları ──────────────────────────────────────────────────
// Saf modül: veri erişimi yok, node ile doğrudan test edilir.
//
// Tekrarlı gider (kira, maaş, abonelik) veritabanında TEK satırdır; her ay için
// satır üretilmez. Üretim yaklaşımı ilk bakışta basit görünür ama cron kaçarsa
// ay eksik, iki kez çalışırsa kâr yanlış çıkar. Burada tersi yapılır: rapor
// istenen aralığı gezer ve tekrarlı gideri geçerli olduğu aylara yayar.

import type { Expense, ExpenseCategory } from '@/types';

export interface ExpenseOccurrence {
    expenseId: string;
    category: ExpenseCategory;
    description?: string;
    amount: number;
    /** Bu tekrarın düştüğü tarih (YYYY-MM-DD). Tek seferlikte spent_on'un kendisi. */
    date: string;
    /** Tekrarlı bir giderin yayılmış kopyası mı? Raporda ayırt edilebilsin. */
    recurring: boolean;
}

const monthKey = (iso: string): string => iso.slice(0, 7);

/** "2026-08" + gün → geçerli tarih. Ayın 31'i olmayan aylarda son güne düşer. */
function dayInMonth(monthIso: string, day: number): string {
    const [y, m] = monthIso.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${monthIso}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** [from, to] aralığındaki ay anahtarları — ikisi de dahil. */
export function monthsBetween(fromIso: string, toIso: string): string[] {
    const out: string[] = [];
    const [fy, fm] = fromIso.slice(0, 7).split('-').map(Number);
    const [ty, tm] = toIso.slice(0, 7).split('-').map(Number);
    for (let y = fy, m = fm; y < ty || (y === ty && m <= tm);) {
        out.push(`${y}-${String(m).padStart(2, '0')}`);
        m += 1;
        if (m > 12) { m = 1; y += 1; }
    }
    return out;
}

/**
 * Gider satırlarını verilen aralıktaki gerçek harcamalara açar.
 *
 * Tek seferlik gider yalnız kendi tarihi aralıktaysa sayılır. Tekrarlı gider,
 * başladığı aydan (spent_on) bittiği aya (ended_on, yoksa sonsuz) kadar HER ay
 * bir kez sayılır — aralığın dışında başlamış olması önemli değil, kira Ocak'ta
 * başladıysa Ağustos raporunda da vardır.
 */
export function expandExpenses(expenses: Expense[], fromIso: string, toIso: string): ExpenseOccurrence[] {
    const out: ExpenseOccurrence[] = [];
    const months = monthsBetween(fromIso, toIso);

    for (const e of expenses) {
        if (!e.recurrence) {
            if (e.spentOn >= fromIso && e.spentOn <= toIso) {
                out.push({
                    expenseId: e.id, category: e.category, description: e.description,
                    amount: e.amount, date: e.spentOn, recurring: false,
                });
            }
            continue;
        }

        const startMonth = monthKey(e.spentOn);
        const endMonth = e.endedOn ? monthKey(e.endedOn) : null;
        const day = Number(e.spentOn.slice(8, 10)) || 1;

        for (const m of months) {
            if (m < startMonth) continue;
            if (endMonth && m > endMonth) continue;
            const date = dayInMonth(m, day);
            // Aralık ay ortasında başlıyor/bitiyorsa gün bazında da kırp:
            // "1–15 Ağustos" raporu ayın 20'sindeki kirayı içermemeli.
            if (date < fromIso || date > toIso) continue;
            out.push({
                expenseId: e.id, category: e.category, description: e.description,
                amount: e.amount, date, recurring: true,
            });
        }
    }

    return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function totalExpenses(occurrences: ExpenseOccurrence[]): number {
    return occurrences.reduce((sum, o) => sum + o.amount, 0);
}

export function expensesByCategory(occurrences: ExpenseOccurrence[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const o of occurrences) out[o.category] = (out[o.category] ?? 0) + o.amount;
    return out;
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
    kira: 'Kira',
    personel: 'Personel',
    malzeme: 'Malzeme',
    fatura: 'Fatura',
    vergi: 'Vergi',
    pazarlama: 'Pazarlama',
    bakim: 'Bakım',
    diger: 'Diğer',
};
