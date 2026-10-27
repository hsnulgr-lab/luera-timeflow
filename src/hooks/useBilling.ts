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
    /** Hediye üyelik / demo: Dodo'da karşılığı yok, ücret alınmaz. */
    comp?: boolean;
    /** Dönem sonuna planlanmış paket (göç 126); yoksa null. */
    scheduled?: { plan: 'baslangic' | 'pro' | 'isletme'; cycle: 'monthly' | 'yearly'; at: string | null } | null;
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

/**
 * Süren aboneliğin paketini değiştirir (dodo-checkout · action 'change'):
 * yükseltme hemen, düşürme bir sonraki fatura gününde. Kanca dışında da
 * çağrılır (personel ekleme): useBilling açılışta abonelik durumunu çeker,
 * personel sayfasına bunun için yük bindirilmez. Başarıda 'now' ya da
 * 'next_billing'; olmazsa null (sebep bildirimle söylenir).
 */
export async function requestPlanChange(orgId: string | null | undefined, plan: string, cycle: 'monthly' | 'yearly'): Promise<'now' | 'next_billing' | null> {
    const { data, error } = await supabase.functions
        .invoke('dodo-checkout', { body: { action: 'change', plan, cycle, orgId } })
        .catch((cause: unknown) => ({ data: null, error: cause }));
    if (!error && data?.changed && (data.when === 'now' || data.when === 'next_billing')) return data.when;
    const code = error ? await errorCode(error) : null;
    console.error('dodo-checkout change:', code ?? error, data);
    if (code === 'team_too_large') toast.info('Bu paket tek kişilik', { description: 'Ekibinizde personel varken geçilemez.' });
    else if (code === 'change_pending') toast.info('Bekleyen bir değişiklik var', { description: 'Yürürlüğe girince yenisini yapabilirsiniz.' });
    else if (code === 'no_subscription') toast.info('Paket değişikliği için süren bir abonelik gerekiyor.');
    else if (code === 'same_plan') toast.info('Zaten bu paketi kullanıyorsunuz.');
    else toast.error('Paket değiştirilemedi, lütfen tekrar deneyin');
    return null;
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

    /**
     * `donus: 'abonelik'` — abonelik e-postasından gelen (`?kaynak=eposta`):
     * Dodo'dan dönüş yine paket ekranına (dodo-checkout · toPaywall).
     */
    // `inlineError`: genel "açılamadı" bildirimini atla, sonucu döndür — ödeme
    // duvarı hatayı düğmenin altında, sakin bir satırla gösteriyor (Abonelik v2 · A1-f).
    const startCheckout = useCallback(async (
        plan: string, cycle: 'monthly' | 'yearly', donus?: 'abonelik', opts?: { inlineError?: boolean },
    ): Promise<boolean> => {
        setBusy(true);
        const { data, error } = await supabase.functions
            .invoke('dodo-checkout', { body: { plan, cycle, orgId, ...(donus ? { donus } : {}) } })
            .catch((cause: unknown) => ({ data: null, error: cause }));
        setBusy(false);
        if (data?.resumed) {
            toast.success('Aboneliğiniz devam ediyor — iptal geri alındı');
            void refresh();
            return true;
        }
        if (error || !data?.url) {
            const code = error ? await errorCode(error) : null;
            console.error('dodo-checkout:', code ?? error, data);
            // Süren aboneliğe ikinci abonelik açılmaz (çift tahsilat). Plan
            // değişikliği henüz kendi kendine yapılamıyor.
            if (code === 'already_subscribed') toast.info('Aboneliğiniz sürüyor', { description: 'Plan değişikliği için destek@lueratech.com adresine yazın.' });
            // Tek kişilik paketi tek çalışana (dodo-checkout · MAX_STAFF).
            else if (code === 'team_too_large') toast.info('Bu paket tek kişilik', { description: 'Ekibinizde personel var; Ekip paketini seçin.' });
            else if (!opts?.inlineError) toast.error('Ödeme sayfası açılamadı, lütfen tekrar deneyin');
            return false;
        }
        window.location.href = data.url;
        return true;
    }, [orgId, refresh]);

    /**
     * Dodo kart güncelleme sayfası — yalnız bu aboneliğin kartı (yeni abonelik
     * AÇMAZ, tutar göstermez). Askıdaki abonelikte borç yeni karttan çekilir.
     */
    const updateCard = useCallback(async (donus?: 'abonelik'): Promise<boolean> => {
        setBusy(true);
        const { data, error } = await supabase.functions
            .invoke('dodo-checkout', { body: { action: 'card', orgId, ...(donus ? { donus } : {}) } })
            .catch((cause: unknown) => ({ data: null, error: cause }));
        setBusy(false);
        if (error || !data?.url) {
            console.error('dodo-checkout card:', error, data);
            toast.error('Ödeme sayfası açılamadı', { description: 'Tekrar deneyin.' });
            return false;
        }
        window.location.href = data.url;
        return true;
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

    /** Dönem sonuna planlanmış paket değişikliğinden vazgeç. */
    const cancelChange = useCallback(async (): Promise<boolean> => {
        setBusy(true);
        const { data, error } = await supabase.functions
            .invoke('dodo-checkout', { body: { action: 'cancel_change', orgId } })
            .catch((cause: unknown) => ({ data: null, error: cause }));
        setBusy(false);
        if (error || !data?.change_cancelled) {
            console.error('dodo-checkout cancel_change:', error, data);
            toast.error('Değişiklik geri alınamadı', { description: 'Tekrar deneyin.' });
            return false;
        }
        toast.success('Planlanan paket değişikliğinden vazgeçildi');
        await refresh();
        return true;
    }, [orgId, refresh]);

    const changePlan = useCallback(async (plan: string, cycle: 'monthly' | 'yearly') => {
        setBusy(true);
        const when = await requestPlanChange(orgId, plan, cycle);
        setBusy(false);
        if (when) await refresh();
        return when;
    }, [orgId, refresh]);

    return { subscription, invoices, loading, error, busy, refresh, startCheckout, changePlan, cancelChange, updateCard, cancelSubscription, pollAfterCheckout };
}
