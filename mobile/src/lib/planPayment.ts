/**
 * Paket ödemesi — peşinat ve kalan borç TELEFONDAN (1.0.1). Saf, React'siz.
 *
 * ── Neden ───────────────────────────────────────────────────────────────────
 * Kullanıcı kararı (2026-10-16): "Tek kişilik işletmenin bilgisayarı yok;
 * paket tahsilatı telefondan tamamlanmalı." Telefon paketi satıyordu ama
 * bedeli için "Peşinat ve taksit masaüstünden alınır" diyordu — tek kişilik
 * salonda o masaüstü yok.
 *
 * ── Satır masaüstüyle aynı ──────────────────────────────────────────────────
 * Masaüstü Kasa'nın paket bileti (`BeautyCashRegister` · `isPkgTicket`) bir
 * `payments` satırı yazıyor: `treatment_plan_id`, tür `service`, açıklama
 * "Paket tahsilatı · <paket>", randevu YOK. Burada da aynı satır.
 *
 * ── Para kuralları ──────────────────────────────────────────────────────────
 *   • Tutarı kullanıcı yazıyor (peşinat kısmi olabilir) ama SINIRI sunucu
 *     koyuyor: 061'in tetikleyicisi sıfırı ve paketin kalan borcunu aşanı
 *     reddediyor. Ekran aynı sınırı önce kendisi söylüyor.
 *   • Kimlik istemcide üretiliyor: cevap kaybolup yeniden basılırsa aynı
 *     kimlik ikinci kez yazılamıyor (23505) — çift tahsilat yok.
 *   • Yöntem seçilmeden düğme kapalı (tahsilat güvertesinin kuralı).
 */

import { formatMoney } from './cash.ts';
import { formatTRAmountDraft, parseTRAmount } from './trAmount.ts';
import type { CollectMethod } from './collect.ts';

export type PlanPaymentMethod = Exclude<CollectMethod, 'package'>;

export interface PlanPaymentInput {
    /** İstemcide üretilen `payments.id` — tekrar basışta aynı kalır. */
    id: string;
    planId: string;
    customerId: string;
    /** Paketin adı — açıklamaya giriyor. */
    title: string;
    amount: number;
    method: PlanPaymentMethod;
}

/**
 * Tutar alanının ilk hâli: paketin kalan borcu, KURUŞUYLA ("1234,50").
 * Eskiden alan yalnız tam lira okuyordu ve kuruşlu borç aşağı yuvarlanıyordu:
 * borç hiçbir zaman tam kapanamıyordu. Ortak TR ayrıştırıcı (`trAmount.ts`)
 * kuruşu okuyor (Paket C · madde 3).
 */
export function defaultAmountText(owed: number): string {
    return owed > 0 ? formatTRAmountDraft(owed) : '';
}

/** "1.000", "1000", "1.000,50" — ortak TR ayrıştırıcı; sıfır geçersiz. */
export function parsePlanAmount(text: string): number | null {
    const value = parseTRAmount(text);
    return value !== null && value > 0 ? value : null;
}

export type AmountProblem = 'empty' | 'over';

/** Ekranın sınırı — sunucunun (061) aynısı, dokunmadan ÖNCE söyleniyor. */
export function amountProblem(amount: number | null, owed: number): AmountProblem | null {
    if (amount === null) return 'empty';
    if (amount > owed + 0.005) return 'over';
    return null;
}

/** Tahsilattan sonra pakete kalan borç. */
export function remainingAfter(owed: number, amount: number | null): number {
    return Math.max(0, Math.round((owed - (amount ?? 0)) * 100) / 100);
}

/**
 * Düğmenin yazısı — tutar ve yöntem BİRLİKTE (tahsilat güvertesinin kuralı:
 * para hangi yoldan alınıyorsa dokunmadan önce görülmeli).
 */
export function payLabel(
    amount: number | null,
    owed: number,
    method: PlanPaymentMethod | null,
): { label: string; enabled: boolean } {
    const problem = amountProblem(amount, owed);
    if (problem === 'empty') return { label: 'Tutarı yazın', enabled: false };
    if (problem === 'over') return { label: `En çok ${formatMoney(owed)} alınabilir`, enabled: false };
    if (!method) return { label: 'Ödeme yöntemini seçin', enabled: false };
    const how = method === 'cash' ? 'nakit' : method === 'card' ? 'kartla' : 'havaleyle';
    return { label: `${formatMoney(amount!)} ${how} tahsil et`, enabled: true };
}

/** Kalanın cümlesi — düğmenin altında. Tamamı alınıyorsa "Paket ödenmiş olur." */
export function remainingLine(owed: number, amount: number | null): string {
    if (amountProblem(amount, owed)) return `Paketin kalan borcu ${formatMoney(owed)}.`;
    const left = remainingAfter(owed, amount);
    return left > 0 ? `Tahsilattan sonra kalan: ${formatMoney(left)}.` : 'Tahsilatla paket ödenmiş olur.';
}

/** `payments` satırı — masaüstü Kasa'nın paket biletiyle aynı alanlar. */
export function planPaymentRow(
    input: PlanPaymentInput,
    ids: { organizationId: string; userId: string },
): Record<string, unknown> {
    return {
        id: input.id,
        organization_id: ids.organizationId,
        customer_id: input.customerId,
        reservation_id: null,
        treatment_plan_id: input.planId,
        type: 'service',
        description: `Paket tahsilatı · ${input.title.trim()}`,
        amount: input.amount,
        method: input.method,
        created_by: ids.userId,
    };
}

export type PlanPaymentFailure =
    | 'over' | 'installments' | 'stale' | 'paused' | 'subscription_inactive' | 'offline' | 'failed';

/** Sunucunun hayırları (061 `raise exception` metni `message`ta). */
export function planPaymentFailureOf(error: { code?: string | null; message?: string | null }): PlanPaymentFailure {
    const message = String(error.message ?? '');
    if (message.includes('plan_payment_exceeds_balance')) return 'over';
    if (message.includes('plan_payment_requires_installment')) return 'installments';
    if (message.includes('payment_scope_mismatch') || error.code === '23503') return 'stale';
    if (message.includes('subscription_inactive') || error.code === '42501') return 'subscription_inactive';
    if (/network request failed|failed to fetch/i.test(message)) return 'offline';
    return 'failed';
}

/** Hayırın cümlesi — düğmenin üstünde. Her biri ne YAZILMADIĞINI da söylüyor. */
export function planPaymentFailureLine(failure: PlanPaymentFailure): string {
    switch (failure) {
        case 'over': return 'Tutar paketin kalan borcunu aşıyor; tahsilat yazılmadı. Kart yenilendi, güncel borçla deneyin.';
        case 'installments': return 'Bu pakete taksit planı kurulmuş; taksit ödemesi masaüstündeki Kasa\'dan alınır.';
        case 'stale': return 'Paket ya da müşteri değişmiş; tahsilat yazılmadı. Kart yenilendi.';
        case 'paused': return 'Yazma şu an kapalı; tahsilat yazılmadı.';
        case 'subscription_inactive': return 'Aboneliğiniz kapalı; tahsilat yazılmadı.';
        case 'offline': return 'Bağlantı yok; tahsilat yazılmadı. Tekrar deneyin.';
        case 'failed': return 'Tahsilat yazılamadı. Tekrar deneyin.';
    }
}
