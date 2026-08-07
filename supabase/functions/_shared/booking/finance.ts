// Müşteri bakiyesi — src/lib/patientBalance.ts'in Deno aynası.
//
// Neden kopya: patientBalance.ts `@/types` import eder ve edge fonksiyonundan
// çözülemez. Kopyalamak yerine paylaşmak isterdik ama alternatif, bakiyeyi
// edge tarafında YENİDEN yorumlamaktı — o dosyanın en başında "TEK doğruluk
// kaynağı" diye yazılmasının sebebi tam olarak bunun daha önce yapılmış
// olması: aynı hasta için üç farklı rakam gösteren üç formül vardı.
//
// resources.ts ile aynı düzen: tests/wa-booking.test.mjs iki dosyayı AYNI
// girdilerle karşılaştırır, böylece biri değişip diğeri unutulduğunda test
// kırılır.

export type PlanStatus = 'proposed' | 'active' | 'completed' | 'cancelled';

export interface BalancePlan { id: string; totalAmount: number; status: PlanStatus }
export interface BalancePayment { amount: number; treatmentPlanId?: string; type?: string }

export interface Finance {
    total: number;
    paid: number;
    balance: number;
    overpaid: number;
}

export const isBillablePlan = (status: PlanStatus) =>
    status === 'active' || status === 'completed';

export function computeBalance(
    plans: readonly BalancePlan[],
    payments: readonly BalancePayment[],
): Finance {
    const billable = plans.filter((p) => isBillablePlan(p.status));
    const billableIds = new Set(billable.map((p) => p.id));
    const total = billable.reduce((sum, p) => sum + p.totalAmount, 0);

    let allocated = 0;
    let unallocatedPaid = 0;
    for (const pay of payments) {
        if (pay.treatmentPlanId) {
            if (billableIds.has(pay.treatmentPlanId)) allocated += pay.amount;
        } else if ((pay.type ?? 'service') === 'service') {
            unallocatedPaid += pay.amount;
        }
    }

    const paid = allocated + unallocatedPaid;
    const diff = total - paid;
    return { total, paid, balance: Math.max(0, diff), overpaid: Math.max(0, -diff) };
}

/** "1.250 ₺" — mesajlarda tutar tek biçimde yazılır. */
export function formatTL(n: number): string {
    const rounded = Math.round(n * 100) / 100;
    const whole = Math.trunc(rounded);
    const cents = Math.round((rounded - whole) * 100);
    const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return cents > 0 ? `${grouped},${String(cents).padStart(2, '0')} ₺` : `${grouped} ₺`;
}
