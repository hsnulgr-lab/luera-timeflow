import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { readCache, writeCache } from '@/lib/swrCache';
import type { Payment, PaymentMethod, PaymentType } from '@/types';

function missingOptionalPaymentColumn(error: { code?: string; message?: string; details?: string } | null): 'created_by' | 'installment_id' | null {
    if (!error) return null;
    const message = String(error.message || error.details || '').toLowerCase();
    if (error.code !== 'PGRST204' && error.code !== '42703') return null;
    if (message.includes('created_by')) return 'created_by';
    if (message.includes('installment_id')) return 'installment_id';
    return null;
}

interface PaymentDbRow {
    id: string;
    organization_id: string;
    customer_id?: string | null;
    reservation_id?: string | null;
    product_id?: string | null;
    staff_id?: string | null;
    treatment_plan_id?: string | null;
    installment_id?: string | null;
    created_by?: string | null;
    type: PaymentType;
    description?: string | null;
    amount: number | string;
    method: PaymentMethod;
    paid_at: string;
    created_at: string;
}

function mapRow(row: PaymentDbRow): Payment {
    return {
        id: row.id,
        organizationId: row.organization_id,
        customerId: row.customer_id || undefined,
        reservationId: row.reservation_id || undefined,
        productId: row.product_id || undefined,
        staffId: row.staff_id || undefined,
        treatmentPlanId: row.treatment_plan_id || undefined,
        installmentId: row.installment_id || undefined,
        createdBy: row.created_by || undefined,
        type: row.type,
        description: row.description || undefined,
        amount: Number(row.amount),
        method: row.method,
        paidAt: row.paid_at,
        createdAt: row.created_at,
    };
}

export interface NewPayment {
    amount: number;
    method?: PaymentMethod;
    type?: PaymentType;
    description?: string;
    customerId?: string;
    reservationId?: string;
    productId?: string;
    staffId?: string;
    treatmentPlanId?: string;
    installmentId?: string;
    paidAt?: string;
}

interface UsePaymentsOptions {
    // Tedavi planı ekranı org genelindeki son-N kasa listesini değil, açık
    // planların eksiksiz ödeme geçmişini ister.
    treatmentPlanIds?: string[];
}

function paymentErrorMessage(error: { message?: string; details?: string } | null): string {
    const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
    if (message.includes('plan_payment_exceeds_balance')) return 'Ödeme planın kalan bakiyesini aşıyor';
    if (message.includes('installment_payment_exceeds_balance')) return 'Ödeme taksidin kalan tutarını aşıyor';
    if (message.includes('plan_payment_requires_installment')) return 'Bu plan için ödeme ilgili taksit üzerinden alınmalı';
    if (message.includes('payment_scope_mismatch')) return 'Hasta, randevu ve plan bilgileri birbiriyle uyuşmuyor';
    return 'Tahsilat kaydedilemedi';
}

/**
 * Kasa / tahsilat kayıtları (F3.3). Organizasyon genelinde bir kez çekilir.
 * Randevuya "ödendi" demek bir payment satırı oluşturur; ürün satışı da öyle.
 * LTV ve gelir raporları bu satırlardan türetilir.
 */
// Son N kaydı çekiyoruz (tarihe göre değil satır sayısına göre sınır) — LTV ve
// tüm-zaman toplamlar (stats.total, totalForCustomer) doğru kalır, sadece çok
// yoğun/uzun ömürlü işletmelerde en eski kayıtlar listeden düşer.
const PAYMENTS_LIMIT = 3000;

export function usePayments(options: UsePaymentsOptions = {}) {
    const { user, orgId } = useAuth();
    const [payments, setPayments] = useState<Payment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const planScoped = options.treatmentPlanIds !== undefined;
    const planKey = useMemo(
        () => [...new Set(options.treatmentPlanIds || [])].filter(Boolean).sort().join(','),
        [options.treatmentPlanIds],
    );
    const planIdSet = useMemo(() => new Set(planKey ? planKey.split(',') : []), [planKey]);

    const fetchPayments = useCallback(async (resolvedOrgId: string) => {
        if (planScoped && !planKey) {
            setPayments([]);
            setIsLoading(false);
            return;
        }
        // SWR: önce son bilinen veri anında gösterilir — "boş kasa" flaşı olmaz
        const cached = !planScoped ? readCache<Payment[]>(`payments:${resolvedOrgId}`) : undefined;
        if (cached) { setPayments(cached); setIsLoading(false); } else setIsLoading(true);
        let query = supabase
            .from('payments')
            .select('*')
            .eq('organization_id', resolvedOrgId)
            .order('paid_at', { ascending: false });
        query = planScoped
            ? query.in('treatment_plan_id', planKey.split(','))
            : query.limit(PAYMENTS_LIMIT);
        const { data, error } = await query;
        if (error) console.error(error);
        else {
            const rows = (data || []).map(mapRow);
            setPayments(rows);
            if (!planScoped) writeCache(`payments:${resolvedOrgId}`, rows);
        }
        setIsLoading(false);
    }, [planKey, planScoped]);

    useEffect(() => {
        if (!user || !orgId) return;
        const fetchTimer = window.setTimeout(() => { void fetchPayments(orgId); }, 0);

        // Canlı güncelleme — kasa/tahsilat tüm cihazlarda anında senkron olsun.
        // 036_payments_realtime.sql ile publication + REPLICA IDENTITY FULL ayarlandı;
        // event geldiğinde tüm tabloyu yeniden çekmek yerine satırı doğrudan merge ediyoruz.
        const ch = supabase
            // Kanal adı benzersiz olmalı: aynı topic'e ikinci abonelik sessizce
            // başarısız olur (birden çok ekran usePayments kullanıyor)
            .channel(`payments:${orgId}:${Math.random().toString(36).slice(2)}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `organization_id=eq.${orgId}` },
                (payload) => {
                    if (payload.eventType === 'DELETE') {
                        const oldId = (payload.old as { id?: string } | null)?.id;
                        if (oldId) setPayments(prev => prev.filter(p => p.id !== oldId));
                        return;
                    }
                    const row = mapRow(payload.new as PaymentDbRow);
                    if (planScoped && (!row.treatmentPlanId || !planIdSet.has(row.treatmentPlanId))) {
                        setPayments(prev => prev.filter(payment => payment.id !== row.id));
                        return;
                    }
                    setPayments(prev => {
                        const exists = prev.some(p => p.id === row.id);
                        return exists ? prev.map(p => p.id === row.id ? row : p) : [row, ...prev];
                    });
                })
            .subscribe();

        return () => {
            window.clearTimeout(fetchTimer);
            supabase.removeChannel(ch);
        };
    }, [user, orgId, fetchPayments, planIdSet, planScoped]);

    const addPayment = useCallback(async (p: NewPayment): Promise<Payment | null> => {
        if (!orgId) { toast.error('Organizasyon bilgisi alınamadı'); return null; }
        const basePayload = {
            organization_id: orgId,
            customer_id: p.customerId ?? null,
            reservation_id: p.reservationId ?? null,
            product_id: p.productId ?? null,
            staff_id: p.staffId ?? null,
            treatment_plan_id: p.treatmentPlanId ?? null,
            type: p.type ?? 'service',
            description: p.description ?? null,
            amount: p.amount,
            method: p.method ?? 'cash',
            paid_at: p.paidAt ?? new Date().toISOString(),
        };
        const payload: Record<string, unknown> = {
            ...basePayload,
            created_by: user?.id || null,
            ...(p.installmentId ? { installment_id: p.installmentId } : {}),
        };
        let result = await supabase.from('payments').insert(payload).select().single();

        // 057/059 henüz uygulanmamış ortamlarda ödeme akışını kırma. Eksik
        // opsiyonel kolonu tek tek çıkar; uygulanmış olan diğer bağı koru.
        for (let attempt = 0; result.error && attempt < 2; attempt += 1) {
            const missing = missingOptionalPaymentColumn(result.error);
            if (!missing || !(missing in payload)) break;
            delete payload[missing];
            result = await supabase.from('payments').insert(payload).select().single();
        }
        const { data, error } = result;
        if (error) { toast.error(paymentErrorMessage(error)); console.error(error); return null; }
        const row = mapRow(data);
        if (!planScoped || (row.treatmentPlanId && planIdSet.has(row.treatmentPlanId))) {
            // Realtime insert cevabından önce geldiyse aynı satırı iki kez ekleme.
            setPayments(prev => [row, ...prev.filter(payment => payment.id !== row.id)]);
        }
        return row;
    }, [orgId, user?.id, planIdSet, planScoped]);

    const removePayment = useCallback(async (id: string): Promise<boolean> => {
        const { error } = await supabase.from('payments').delete().eq('id', id);
        if (error) { toast.error('Tahsilat silinemedi'); return false; }
        setPayments(prev => prev.filter(p => p.id !== id));
        return true;
    }, []);

    // Birleşik adisyonlarda tek tahsilat grubun ilk randevusuna yazılır. Eski
    // sürümlerde grubun başka satırlarına yazılmış kayıtlar da bulunabileceği
    // için geri alma işlemi bütün grup kimliklerini tek DELETE ile temizler.
    // Tedavi planı/taksit tahsilatlarına kesinlikle dokunmaz.
    const removeByReservations = useCallback(async (reservationIds: string[], allowEmpty = false): Promise<boolean> => {
        const uniqueIds = [...new Set(reservationIds.filter(Boolean))];
        if (uniqueIds.length === 0) return false;

        const { data, error } = await supabase
            .from('payments')
            .delete()
            .in('reservation_id', uniqueIds)
            .is('treatment_plan_id', null)
            .select('id');
        if (error) { toast.error('Tahsilat geri alınamadı'); return false; }
        if (!data || data.length === 0) {
            // Ücretsiz tamamlanmış birleşik adisyon da aynı sunucu sorgusundan
            // geçer; gerçekten kayıt olmadığı doğrulandıktan sonra statüsü açılır.
            if (allowEmpty) return true;
            toast.error('Geri alınacak tahsilat bulunamadı');
            return false;
        }
        const reservationIdSet = new Set(uniqueIds);
        setPayments(prev => prev.filter(p => !p.reservationId || !reservationIdSet.has(p.reservationId) || !!p.treatmentPlanId));
        return true;
    }, []);

    const removeByReservation = useCallback(
        (reservationId: string, allowEmpty = false) => removeByReservations([reservationId], allowEmpty),
        [removeByReservations],
    );

    const totalForCustomer = useCallback(
        (customerId: string) => payments.filter(p => p.customerId === customerId).reduce((s, p) => s + p.amount, 0),
        [payments],
    );

    // Gelir özeti — bugün / bu hafta (son 7 gün) / bu ay (içinde bulunulan ay)
    const stats = useMemo(() => {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const sevenDaysAgo = startOfDay - 6 * 24 * 60 * 60 * 1000;
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

        let today = 0, week = 0, month = 0, total = 0;
        const byMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, transfer: 0, other: 0 };
        for (const p of payments) {
            const t = new Date(p.paidAt).getTime();
            total += p.amount;
            byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;
            if (t >= startOfDay) today += p.amount;
            if (t >= sevenDaysAgo) week += p.amount;
            if (t >= startOfMonth) month += p.amount;
        }
        return { today, week, month, total, byMethod };
    }, [payments]);

    const refetch = useCallback(() => { if (orgId) return fetchPayments(orgId); }, [orgId, fetchPayments]);

    return { payments, isLoading, addPayment, removePayment, removeByReservation, removeByReservations, totalForCustomer, stats, refetch };
}
