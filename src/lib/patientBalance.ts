// Hasta tedavi bakiyesi — TEK doğruluk kaynağı.
//
// Klinikte para konuşulan her ekran (koltuk başı vizit paneli, hasta listesi
// rozeti, hasta kartı, WhatsApp bakiye mesajı) bu dosyayı çağırır. Daha önce
// üç ayrı formül vardı ve aynı hasta için farklı rakam gösteriyorlardı.
//
// Kurallar — bilinçli ve tek yerde:
//  1. Borç = yalnız 'active' + 'completed' planların toplamı.
//     'proposed' henüz hastanın onaylamadığı tekliftir, borç değildir (063).
//     'cancelled' iptaldir, borç değildir.
//  2. Ödenen = (a) borca sayılan planlara bağlı ödemeler
//            + (b) hastanın plana bağlanmamış 'service' tipi ödemeleri.
//     (b) şart: Kasa'dan plan seçilmeden alınan tahsilat aksi halde hiçbir
//     ekranda düşülmez, hasta ödediği halde koltuk başında borçlu görünürdü.
//     'product' (ürün satışı) tedavi borcunu kapatmaz, bu yüzden hariç.
//  3. İptal/teklif planlara yapılmış ödemeler ödenen'e sayılmaz — borca da
//     sayılmadıkları için, sayılsalardı bakiyeyi haksız yere düşürürlerdi.
//     Bu tutar `orphanPaid` ile ayrıca raporlanır; sessizce kaybolmasın.
//  4. Bakiye asla negatif gösterilmez; fazla tahsilat `overpaid` ile ayrı verilir.

import type { PaymentType, TreatmentPlanStatus } from '@/types';

/** Hesap için gereken minimum plan alanları. */
export interface BalancePlan {
    id: string;
    totalAmount: number;
    status: TreatmentPlanStatus;
}

/** Hesap için gereken minimum ödeme alanları. */
export interface BalancePayment {
    amount: number;
    treatmentPlanId?: string;
    type?: PaymentType;
}

export interface PatientFinance {
    /** Borca sayılan plan toplamı. */
    total: number;
    /** Bu borca mahsup edilen tahsilat. */
    paid: number;
    /** Kalan borç — negatif olmaz. */
    balance: number;
    /** Borcu aşan tahsilat (varsa); alacak olarak gösterilir. */
    overpaid: number;
    /** Plana bağlanmamış, borca mahsup edilen serbest tahsilat. */
    unallocatedPaid: number;
    /** İptal/teklif plana yapılmış, mahsup edilmeyen ödeme — denetim içindir. */
    orphanPaid: number;
    /** Plan bazında ödenen — plan satırı ve taksitlendirme için. */
    paidByPlan: Map<string, number>;
}

/** Borca sayılan plan durumları. */
export const isBillablePlan = (status: TreatmentPlanStatus) =>
    status === 'active' || status === 'completed';

export function computePatientFinance(
    plans: readonly BalancePlan[],
    payments: readonly BalancePayment[],
): PatientFinance {
    const billable = plans.filter((p) => isBillablePlan(p.status));
    const billableIds = new Set(billable.map((p) => p.id));
    const total = billable.reduce((sum, p) => sum + p.totalAmount, 0);

    const paidByPlan = new Map<string, number>();
    let allocated = 0;
    let unallocatedPaid = 0;
    let orphanPaid = 0;

    for (const pay of payments) {
        if (pay.treatmentPlanId) {
            paidByPlan.set(pay.treatmentPlanId, (paidByPlan.get(pay.treatmentPlanId) || 0) + pay.amount);
            if (billableIds.has(pay.treatmentPlanId)) allocated += pay.amount;
            else orphanPaid += pay.amount;
        } else if ((pay.type ?? 'service') === 'service') {
            unallocatedPaid += pay.amount;
        }
    }

    const paid = allocated + unallocatedPaid;
    const diff = total - paid;
    return {
        total,
        paid,
        balance: Math.max(0, diff),
        overpaid: Math.max(0, -diff),
        unallocatedPaid,
        orphanPaid,
        paidByPlan,
    };
}

/** Bir planın kalan tutarı — tahsilat dağıtımı ve taksitlendirme için. */
export function planRemaining(plan: BalancePlan, paidByPlan: Map<string, number>): number {
    return Math.max(0, plan.totalAmount - (paidByPlan.get(plan.id) || 0));
}
