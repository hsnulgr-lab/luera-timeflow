import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/**
 * AI Günlük İçgörü — Groq destekli, günde bir kez üretilir (Edge Function cache'ler).
 * org_id'yi kendi çözer, bağımsız kullanılabilir (Layout üst şeridinde).
 */
export function useInsight() {
    const { user, orgId } = useAuth();
    const [insight, setInsight] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!user || !orgId) return;
        let cancelled = false;

        // Günün içgörüsü oturum içinde bir kez çekilir — sayfa geçişlerinde anında gelsin
        const cacheKey = `tf-insight:${orgId}:${new Date().toISOString().slice(0, 10)}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) { setInsight(cached); return; }

        (async () => {
            setLoading(true);
            try {

                const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/insight`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                    },
                    body: JSON.stringify({ organization_id: orgId }),
                });
                const data = await res.json();
                if (!cancelled && data.insight) {
                    setInsight(data.insight);
                    sessionStorage.setItem(cacheKey, data.insight);
                }
            } catch {
                /* sessizce geç — içgörü kritik değil */
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    // orgId login sonrası asenkron çözülür — bağımlılıkta olmazsa içgörü hiç yüklenmez
    }, [user, orgId]);

    return { insight, loading };
}
