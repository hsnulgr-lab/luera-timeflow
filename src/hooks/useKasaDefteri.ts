import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { mapVoidRow, type KasaSummary, type VoidRow } from '@/lib/kasaDefteri';

export interface CashClosing {
    id: string;
    businessDay: string;
    expectedCash: number;
    countedCash: number;
    difference: number;
    totals: Partial<KasaSummary>;
    note?: string;
    closedBy?: string;
    closedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapClosing(row: any): CashClosing {
    return {
        id: row.id,
        businessDay: String(row.business_day).slice(0, 10),
        expectedCash: Number(row.expected_cash),
        countedCash: Number(row.counted_cash),
        difference: Number(row.difference),
        totals: row.totals || {},
        note: row.note || undefined,
        closedBy: row.closed_by || undefined,
        closedAt: row.closed_at,
    };
}

const missingTable = (e: { message?: string; code?: string } | null) =>
    Boolean(e) && /does not exist|PGRST205|schema cache/i.test(`${e?.message || ''} ${e?.code || ''}`);

/**
 * Kasa defterinin sunucu tarafı: iptal izleri (102) ve gün sonu kapanışları
 * (133). Tahsilatlar ve giderler kendi hook'larından gelir (usePayments,
 * useExpenses) — burada ikinci kez çekilmez.
 *
 * 133 henüz canlıda koşmadıysa `closingsAvailable` false olur; Gün sonu
 * raporu yine çalışır, yalnız "Kasayı kapat" gizlenir.
 */
export function useKasaDefteri(from: string, to: string, options?: { enabled?: boolean }) {
    const { orgId } = useAuth();
    const enabled = options?.enabled ?? true;
    const [voids, setVoids] = useState<VoidRow[]>([]);
    const [closings, setClosings] = useState<CashClosing[]>([]);
    const [closingsAvailable, setClosingsAvailable] = useState(true);
    const [isLoading, setIsLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!orgId || !enabled) return;
        setIsLoading(true);
        // Yerel gün sınırları: aralığın ilk gününün başı → son gününün sonu.
        const start = new Date(`${from}T00:00:00`).toISOString();
        const end = new Date(`${to}T23:59:59.999`).toISOString();
        const [v, c] = await Promise.all([
            supabase.from('payment_void_log').select('*')
                .eq('organization_id', orgId).gte('voided_at', start).lte('voided_at', end)
                .order('voided_at', { ascending: false }).limit(500),
            supabase.from('cash_closings').select('*')
                .eq('organization_id', orgId).order('business_day', { ascending: false }).limit(60),
        ]);
        if (v.error) { if (!missingTable(v.error)) console.error('İptal izleri yüklenemedi:', v.error); setVoids([]); }
        else setVoids((v.data || []).map(mapVoidRow));
        if (c.error) {
            if (missingTable(c.error)) setClosingsAvailable(false);
            else console.error('Kapanışlar yüklenemedi:', c.error);
            setClosings([]);
        } else {
            setClosingsAvailable(true);
            setClosings((c.data || []).map(mapClosing));
        }
        setIsLoading(false);
    }, [enabled, from, orgId, to]);

    // Veri hook'unun asli işi (diğer veri hook'larıyla aynı desen).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void refresh(); }, [refresh]);

    /** Günü kapatır; aynı gün yeniden kapatılırsa kayıt güncellenir (133 upsert). */
    const closeDay = useCallback(async (input: {
        day: string; expectedCash: number; countedCash: number; totals: KasaSummary; note?: string;
    }): Promise<CashClosing | null> => {
        if (!orgId) return null;
        const { data, error } = await supabase.from('cash_closings').upsert({
            organization_id: orgId,
            business_day: input.day,
            expected_cash: Math.round(input.expectedCash * 100) / 100,
            counted_cash: Math.max(0, Math.round(input.countedCash * 100) / 100),
            totals: input.totals,
            note: input.note?.trim() || null,
            closed_at: new Date().toISOString(),
        }, { onConflict: 'organization_id,business_day' }).select('*').single();
        if (error || !data) {
            if (missingTable(error)) { setClosingsAvailable(false); toast.error('Kasa kapanışı henüz etkin değil (göç 133 bekliyor)'); }
            else { toast.error('Kasa kapatılamadı'); console.error(error); }
            return null;
        }
        const row = mapClosing(data);
        setClosings((prev) => [row, ...prev.filter((c) => c.businessDay !== row.businessDay)]
            .sort((a, b) => b.businessDay.localeCompare(a.businessDay)));
        return row;
    }, [orgId]);

    return { voids, closings, closingsAvailable, isLoading, refresh, closeDay };
}
