import { supabase } from '@/lib/supabase';

// İndirim kodları — 071.
//
// Kodlar "sizi özledik" mesajıyla müşteriye özel üretilir (remind edge function)
// ve Kasa'da burada doğrulanır. Amaç yalnız indirim vermek değil, KİMİN döndüğünü
// ölçmek: kod olmadan kampanyanın karşılığı bilinemiyordu.

export interface DiscountCode {
    id: string;
    code: string;
    percent: number;
    customerId: string | null;
    expiresAt: string | null;
}

export type DiscountCodeError =
    | 'not_found' | 'redeemed' | 'expired' | 'other_customer';

export const DISCOUNT_CODE_ERROR_TEXT: Record<DiscountCodeError, string> = {
    not_found: 'Böyle bir kod yok.',
    redeemed: 'Bu kod daha önce kullanılmış.',
    expired: 'Bu kodun süresi dolmuş.',
    other_customer: 'Bu kod başka bir müşteriye ait.',
};

/** Kodu doğrula. Geçerliyse kaydı, değilse sebebini döner. */
export async function lookupDiscountCode(
    orgId: string,
    rawCode: string,
    customerId?: string | null,
): Promise<{ ok: true; code: DiscountCode } | { ok: false; reason: DiscountCodeError }> {
    // Kod büyük harf üretiliyor; kullanıcı küçük yazsa da bulunsun.
    const code = rawCode.trim().toLocaleUpperCase('tr-TR').replace(/\s+/g, '');
    if (!code) return { ok: false, reason: 'not_found' };

    const { data, error } = await supabase
        .from('discount_codes')
        .select('id, code, percent, customer_id, expires_at, redeemed_at')
        .eq('organization_id', orgId)
        .eq('code', code)
        .maybeSingle();

    if (error || !data) return { ok: false, reason: 'not_found' };
    if (data.redeemed_at) return { ok: false, reason: 'redeemed' };
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
        return { ok: false, reason: 'expired' };
    }
    // customer_id null = herkese açık kampanya kodu; doluysa sahibine kilitli.
    if (data.customer_id && customerId && data.customer_id !== customerId) {
        return { ok: false, reason: 'other_customer' };
    }

    return {
        ok: true,
        code: {
            id: data.id, code: data.code, percent: data.percent,
            customerId: data.customer_id ?? null, expiresAt: data.expires_at ?? null,
        },
    };
}

/**
 * Kodu kullanıldı olarak işaretle. Tahsilat yazıldıktan SONRA çağrılır —
 * ödeme kaydedilemezse kod yanmamalı.
 *
 * `redeemed_at is null` koşulu atomik koruma: iki kasa aynı kodu aynı anda
 * uygularsa yalnız ilki tutar.
 */
export async function redeemDiscountCode(id: string, paymentId?: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('discount_codes')
        .update({ redeemed_at: new Date().toISOString(), redeemed_payment_id: paymentId ?? null })
        .eq('id', id)
        .is('redeemed_at', null)
        .select('id')
        .maybeSingle();
    if (error) { console.error('Kod kullanıldı işaretlenemedi:', error); return false; }
    return Boolean(data);
}
