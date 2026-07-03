import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Payment, PaymentMethod, PaymentType } from '@/types';

function mapRow(row: any): Payment {
    return {
        id: row.id,
        organizationId: row.organization_id,
        customerId: row.customer_id || undefined,
        reservationId: row.reservation_id || undefined,
        productId: row.product_id || undefined,
        staffId: row.staff_id || undefined,
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
    paidAt?: string;
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

export function usePayments() {
    const { user, orgId } = useAuth();
    const [payments, setPayments] = useState<Payment[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchPayments = useCallback(async (resolvedOrgId: string) => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('payments')
            .select('*')
            .eq('organization_id', resolvedOrgId)
            .order('paid_at', { ascending: false })
            .limit(PAYMENTS_LIMIT);
        if (error) console.error(error);
        else setPayments((data || []).map(mapRow));
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (!user || !orgId) return;
        fetchPayments(orgId);

        // Canlı güncelleme — kasa/tahsilat tüm cihazlarda anında senkron olsun.
        // 036_payments_realtime.sql ile publication + REPLICA IDENTITY FULL ayarlandı;
        // event geldiğinde tüm tabloyu yeniden çekmek yerine satırı doğrudan merge ediyoruz.
        const ch = supabase
            .channel(`payments:${orgId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `organization_id=eq.${orgId}` },
                (payload) => {
                    if (payload.eventType === 'DELETE') {
                        const oldId = (payload.old as any)?.id;
                        if (oldId) setPayments(prev => prev.filter(p => p.id !== oldId));
                        return;
                    }
                    const row = mapRow(payload.new);
                    setPayments(prev => {
                        const exists = prev.some(p => p.id === row.id);
                        return exists ? prev.map(p => p.id === row.id ? row : p) : [row, ...prev];
                    });
                })
            .subscribe();

        return () => { supabase.removeChannel(ch); };
    }, [user, orgId, fetchPayments]);

    const addPayment = useCallback(async (p: NewPayment): Promise<Payment | null> => {
        if (!orgId) { toast.error('Organizasyon bilgisi alınamadı'); return null; }
        const { data, error } = await supabase
            .from('payments')
            .insert({
                organization_id: orgId,
                customer_id: p.customerId ?? null,
                reservation_id: p.reservationId ?? null,
                product_id: p.productId ?? null,
                staff_id: p.staffId ?? null,
                type: p.type ?? 'service',
                description: p.description ?? null,
                amount: p.amount,
                method: p.method ?? 'cash',
                paid_at: p.paidAt ?? new Date().toISOString(),
            })
            .select().single();
        if (error) { toast.error('Tahsilat kaydedilemedi'); console.error(error); return null; }
        const row = mapRow(data);
        setPayments(prev => [row, ...prev]);
        return row;
    }, [orgId]);

    const removePayment = useCallback(async (id: string) => {
        const { error } = await supabase.from('payments').delete().eq('id', id);
        if (error) { toast.error('Tahsilat silinemedi'); return; }
        setPayments(prev => prev.filter(p => p.id !== id));
    }, []);

    // Bir randevuya ait tahsilatları siler (ödendi işaretini geri alma için)
    const removeByReservation = useCallback(async (reservationId: string) => {
        const { error } = await supabase.from('payments').delete().eq('reservation_id', reservationId);
        if (error) { toast.error('Tahsilat geri alınamadı'); return; }
        setPayments(prev => prev.filter(p => p.reservationId !== reservationId));
    }, []);

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

    return { payments, isLoading, addPayment, removePayment, removeByReservation, totalForCustomer, stats, refetch };
}
