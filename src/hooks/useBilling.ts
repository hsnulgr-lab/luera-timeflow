import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

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

/**
 * Edge fonksiyonunun döndürdüğü hata kodu. `invoke` 2xx dışında gövdeyi
 * `data`'ya koymuyor; kod `error.context` (Response) içinde.
 */
async function errorCode(error: unknown): Promise<string | null> {
    const ctx = (error as { context?: Response } | null)?.context;
    if (!ctx || typeof ctx.json !== 'function') return null;
    const body = await ctx.clone().json().catch(() => null) as { error?: unknown } | null;
    return typeof body?.error === 'string' ? body.error : null;
}

// Abonelik gerçeği TimeFlow'da (123): billing-status aynayı ve yerel olay
// defterini okur. İşletme her çağrıda gönderilir; sunucu üyeliği doğrular
// (çok işletmeli kullanıcıda yanlış işletmeye abonelik açılmasın).
export function useBilling() {
    const { orgId } = useAuth();
    const [subscription, setSubscription] = useState<BillingSubscription | null>(null);
    const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    // Okunamadı ≠ abonelik yok: Ayarlar → Özet ikisini ayrı çizer.
    const [error, setError] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const refresh = useCallback(async (): Promise<BillingSubscription | null> => {
        // Fırlatan çağrı da `{ error }` dönen çağrı gibi ele alınıyor: çağıran
        // taraf ikisini ayırt etmek zorunda kalmasın.
        const { data, error } = await supabase.functions
            .invoke('billing-status', { body: { orgId } })
            .catch((cause: unknown) => ({ data: null, error: cause }));
        if (error) {
            console.error('billing-status:', error);
            setError(true);
            return null;
        }
        setError(false);
        setSubscription(data?.subscription ?? null);
        setInvoices(data?.invoices ?? []);
        return data?.subscription ?? null;
    }, [orgId]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            // `finally` ŞART. `refresh` normalde hatayı `{error}` olarak
            // döndürüyor ama her zaman değil: ağ kopması, CORS ve fonksiyonun
            // hiç dağıtılmamış olması `invoke`u FIRLATIYOR. Fırlatınca
            // `setLoading(false)` hiç çalışmıyordu ve ekran "Abonelik
            // bilgileri yükleniyor…" yazısında SONSUZA KADAR asılı kalıyordu —
            // ödeme sayfasına giden tek yol da o ekranın altındaydı.
            try {
                await refresh();
            } finally {
                setLoading(false);
            }
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
        const { data, error } = await supabase.functions
            .invoke('dodo-checkout', { body: { plan, cycle, orgId } })
            .catch((cause: unknown) => ({ data: null, error: cause }));
        setBusy(false);
        if (data?.resumed) {
            toast.success('Aboneliğiniz devam ediyor — iptal geri alındı');
            void refresh();
            return;
        }
        if (error || !data?.url) {
            const code = error ? await errorCode(error) : null;
            console.error('dodo-checkout:', code ?? error, data);
            // Süren aboneliğe ikinci abonelik açılmaz (çift tahsilat). Plan
            // değişikliği henüz kendi kendine yapılamıyor.
            if (code === 'already_subscribed') toast.info('Aboneliğiniz sürüyor. Plan değişikliği için destek@lueratech.com adresine yazın.');
            else toast.error('Ödeme sayfası açılamadı, lütfen tekrar deneyin');
            return;
        }
        window.location.href = data.url;
    }, [orgId, refresh]);

    /** Dodo müşteri portalı — kart güncelleme (yeni abonelik AÇMAZ). */
    const openPortal = useCallback(async () => {
        setBusy(true);
        const { data, error } = await supabase.functions
            .invoke('dodo-checkout', { body: { action: 'portal', orgId } })
            .catch((cause: unknown) => ({ data: null, error: cause }));
        setBusy(false);
        if (error || !data?.url) {
            console.error('dodo-checkout portal:', error, data);
            toast.error('Ödeme bilgileri sayfası açılamadı, lütfen tekrar deneyin');
            return;
        }
        window.location.href = data.url;
    }, [orgId]);

    const cancelSubscription = useCallback(async (): Promise<boolean> => {
        setBusy(true);
        const { data, error } = await supabase.functions
            .invoke('dodo-checkout', { body: { action: 'cancel', orgId } })
            .catch((cause: unknown) => ({ data: null, error: cause }));
        setBusy(false);
        if (error || !data?.cancelled) {
            console.error('dodo-checkout cancel:', error, data);
            toast.error('İptal işlemi başarısız oldu, lütfen tekrar deneyin');
            return false;
        }
        toast.success('Aboneliğiniz dönem sonunda iptal edilecek');
        await refresh();
        return true;
    }, [orgId, refresh]);

    return { subscription, invoices, loading, error, busy, refresh, startCheckout, openPortal, cancelSubscription, pollAfterCheckout };
}
