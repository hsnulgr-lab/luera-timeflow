import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export interface BillingSubscription {
    plan: 'baslangic' | 'pro' | 'isletme';
    billing_period: 'monthly' | 'yearly';
    status: 'pending' | 'active' | 'on_hold' | 'cancelled' | 'expired';
    cancel_at_period_end: boolean;
    expires_at: string | null;
    cancelled_at: string | null;
}

export interface BillingInvoice {
    date: string;
    amount: number | null;
    currency: string;
    invoiceUrl: string | null;
}

// Abonelik verisi LUERA Core'da yaşar; billing-status edge function proxy'ler.
export function useBilling() {
    const [subscription, setSubscription] = useState<BillingSubscription | null>(null);
    const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const refresh = useCallback(async (): Promise<BillingSubscription | null> => {
        const { data, error } = await supabase.functions.invoke('billing-status');
        if (error) {
            console.error('billing-status:', error);
            return null;
        }
        setSubscription(data?.subscription ?? null);
        setInvoices(data?.invoices ?? []);
        return data?.subscription ?? null;
    }, []);

    useEffect(() => {
        (async () => {
            setLoading(true);
            await refresh();
            setLoading(false);
        })();
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [refresh]);

    // Checkout dönüşünde webhook birkaç saniye gecikebilir — kısa süre poll'la
    const pollAfterCheckout = useCallback(() => {
        let tries = 0;
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            tries++;
            const sub = await refresh();
            if ((sub && sub.status === 'active') || tries >= 10) {
                if (pollRef.current) clearInterval(pollRef.current);
                pollRef.current = null;
            }
        }, 3000);
    }, [refresh]);

    const startCheckout = useCallback(async (plan: string, cycle: 'monthly' | 'yearly') => {
        setBusy(true);
        const { data, error } = await supabase.functions.invoke('dodo-checkout', { body: { plan, cycle } });
        setBusy(false);
        if (error || !data?.url) {
            console.error('dodo-checkout:', error, data);
            toast.error('Ödeme sayfası açılamadı, lütfen tekrar deneyin');
            return;
        }
        window.location.href = data.url;
    }, []);

    const cancelSubscription = useCallback(async (): Promise<boolean> => {
        setBusy(true);
        const { data, error } = await supabase.functions.invoke('dodo-checkout', { body: { action: 'cancel' } });
        setBusy(false);
        if (error || !data?.cancelled) {
            console.error('dodo-checkout cancel:', error, data);
            toast.error('İptal işlemi başarısız oldu, lütfen tekrar deneyin');
            return false;
        }
        toast.success('Aboneliğiniz dönem sonunda iptal edilecek');
        // Webhook'un Core'a yazması birkaç saniye sürebilir
        pollAfterCheckout();
        return true;
    }, [pollAfterCheckout]);

    return { subscription, invoices, loading, busy, refresh, startCheckout, cancelSubscription, pollAfterCheckout };
}
