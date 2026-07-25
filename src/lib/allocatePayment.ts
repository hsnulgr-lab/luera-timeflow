// Tahsilatı hastanın açık tedavi planlarına OTOMATİK dağıtır.
//
// Neden: Kasa'dan alınan tahsilat eskiden `treatment_plan_id` boş kaydediliyordu.
// Sonuç: hasta ödemesine rağmen koltuk başı panelde borçlu görünüyordu ve iki
// ekran farklı bakiye gösteriyordu. Personelden ek bir seçim istemek yerine
// eşleştirmeyi burada, kayıt anında yapıyoruz — akış değişmez.
//
// Dağıtım kuralı: en eski plandan başla, her plana kalanı kadar yaz (FIFO).
// Borcu aşan kısım plana bağlanmadan kaydedilir (ürün satışı, avans vb.) —
// 061 finans trigger'ı plan kalanını aşan ödemeyi zaten reddeder.

import { supabase } from '@/lib/supabase';
import { computePatientFinance, isBillablePlan, planRemaining } from '@/lib/patientBalance';
import type { NewPayment } from '@/hooks/usePayments';
import type { Payment, TreatmentPlanStatus } from '@/types';

/** Hastanın açık planları + kalan tutarları — en eski plan başta. */
export async function openPlanTargets(customerId: string): Promise<{ id: string; title: string; remaining: number }[]> {
    const { data: planRows, error: planErr } = await supabase
        .from('treatment_plans')
        .select('id, title, total_amount, status, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: true });
    if (planErr || !planRows) return [];

    const plans = (planRows as { id: string; title: string; total_amount: number | string; status: TreatmentPlanStatus }[])
        .filter((r) => isBillablePlan(r.status))
        .map((r) => ({ id: r.id, title: r.title, totalAmount: Number(r.total_amount), status: r.status }));
    if (plans.length === 0) return [];

    const { data: payRows } = await supabase
        .from('payments')
        .select('amount, treatment_plan_id')
        .in('treatment_plan_id', plans.map((p) => p.id));
    const payments = ((payRows || []) as { amount: number | string; treatment_plan_id: string | null }[])
        .map((r) => ({ amount: Number(r.amount), treatmentPlanId: r.treatment_plan_id || undefined }));

    const { paidByPlan } = computePatientFinance(plans, payments);
    return plans
        .map((p) => ({ id: p.id, title: p.title, remaining: planRemaining(p, paidByPlan) }))
        .filter((p) => p.remaining > 0);
}

export interface AllocationResult {
    /** Kaydedilen ödeme satırları. */
    payments: Payment[];
    /** Plana mahsup edilen toplam. */
    allocated: number;
    /** Plana bağlanamayıp serbest kaydedilen tutar. */
    unallocated: number;
    /** Mahsup edilen plan başlıkları — makbuz/toast metni için. */
    planTitles: string[];
}

/**
 * Tahsilatı planlara dağıtarak kaydeder. Hasta seçili değilse veya açık plan
 * yoksa tek bir serbest ödeme yazar — yani çağıran taraf için davranış aynı.
 */
export async function collectAllocated(
    addPayment: (p: NewPayment) => Promise<Payment | null>,
    base: NewPayment,
    // Kasa çok sektörlü ortak sayfa: restoran/kuaför tarafında tedavi planı
    // kavramı yok. Kapalıyken tek bir normal ödeme yazılır, boşuna sorgu atılmaz.
    options?: { allocate?: boolean },
): Promise<AllocationResult | null> {
    const empty: AllocationResult = { payments: [], allocated: 0, unallocated: 0, planTitles: [] };
    if (base.amount <= 0) return null;

    // Yalnız hizmet tahsilatı tedavi borcuna mahsup edilir; ürün satışı ('product')
    // tedaviyi kapatmaz. Plan zaten belirtilmişse (vizit paneli) dokunma.
    const eligible = (options?.allocate ?? false)
        && base.customerId && !base.treatmentPlanId && (base.type ?? 'service') === 'service';
    const targets = eligible ? await openPlanTargets(base.customerId!) : [];
    if (targets.length === 0) {
        const p = await addPayment(base);
        return p ? { ...empty, payments: [p], unallocated: p.amount } : null;
    }

    let left = base.amount;
    const result: AllocationResult = { ...empty, payments: [], planTitles: [] };
    for (const t of targets) {
        if (left <= 0) break;
        const chunk = Math.min(left, t.remaining);
        const p = await addPayment({ ...base, amount: chunk, treatmentPlanId: t.id });
        if (!p) break;                       // trigger reddettiyse dur, kalanı serbest yaz
        result.payments.push(p);
        result.planTitles.push(t.title);
        result.allocated += chunk;
        left -= chunk;
    }
    if (left > 0) {
        const p = await addPayment({ ...base, amount: left });
        if (p) { result.payments.push(p); result.unallocated += left; }
    }
    return result.payments.length > 0 ? result : null;
}
