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
                if (!cancelled && data.insight) setInsight(data.insight);
            } catch {
                /* sessizce geç — içgörü kritik değil */
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [user]);

    return { insight, loading };
}
