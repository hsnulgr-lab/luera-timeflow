import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { PerioTooth } from '@/types';

interface PerioRow {
    id: string;
    organization_id: string;
    customer_id: string;
    tooth_number: number;
    pocket_depth: (number | null)[] | null;
    recession: (number | null)[] | null;
    bleeding: boolean[] | null;
    mobility: number | null;
    note: string | null;
    measured_by: string | null;
    created_at: string;
    updated_at: string;
}

function mapRow(r: PerioRow): PerioTooth {
    return {
        id: r.id,
        organizationId: r.organization_id,
        customerId: r.customer_id,
        toothNumber: r.tooth_number,
        pocketDepth: r.pocket_depth || [],
        recession: r.recession || [],
        bleeding: r.bleeding || [],
        mobility: r.mobility ?? undefined,
        note: r.note || undefined,
        measuredBy: r.measured_by || undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}

export interface PerioInput {
    pocketDepth: (number | null)[];
    recession: (number | null)[];
    bleeding: boolean[];
    mobility?: number;
    note?: string;
    measuredBy?: string;
}

// Periodontal cep haritası — diş başına en güncel ölçüm (upsert). 063 tablosu
// yoksa (kademeli deploy) sessizce devre dışı kalır; şema uygulanınca çalışır.
export function usePeriodontal(customerId: string | undefined) {
    const { orgId, user } = useAuth();
    const [state, setState] = useState<{ customerId?: string; map: Map<number, PerioTooth> }>({ map: new Map() });
    const [available, setAvailable] = useState<boolean | null>(null);

    useEffect(() => {
        // customerId yoksa reset gerekmez — türetilen `chart` zaten boş döner
        // (state.customerId !== customerId). Effekt içinde senkron setState yok.
        if (!customerId) return;
        let alive = true;
        void supabase
            .from('periodontal_charts')
            .select('*')
            .eq('customer_id', customerId)
            .then(({ data, error }) => {
                if (!alive) return;
                if (error) {
                    // tablo yok (kademeli deploy) → sessizce devre dışı
                    if (error.code === '42P01' || String(error.message || '').includes('periodontal_charts')) {
                        setAvailable(false);
                        setState({ customerId, map: new Map() });
                        return;
                    }
                    toast.error('Periodontal veriler yüklenemedi');
                    setState({ customerId, map: new Map() });
                    return;
                }
                setAvailable(true);
                const map = new Map<number, PerioTooth>();
                for (const row of (data || []) as PerioRow[]) map.set(row.tooth_number, mapRow(row));
                setState({ customerId, map });
            });
        return () => { alive = false; };
    }, [customerId]);

    const chart = state.customerId === customerId ? state.map : new Map<number, PerioTooth>();
    const isLoading = Boolean(customerId && state.customerId !== customerId);

    const setTooth = useCallback(async (toothNumber: number, input: PerioInput) => {
        if (!orgId || !customerId) return false;
        const payload = {
            organization_id: orgId,
            customer_id: customerId,
            tooth_number: toothNumber,
            pocket_depth: input.pocketDepth,
            recession: input.recession,
            bleeding: input.bleeding,
            mobility: input.mobility ?? null,
            note: input.note?.trim() || null,
            measured_by: input.measuredBy || null,
            created_by: user?.id || null,
        };
        const { data, error } = await supabase
            .from('periodontal_charts')
            .upsert(payload, { onConflict: 'organization_id,customer_id,tooth_number' })
            .select()
            .single();
        if (error || !data) { toast.error('Periodontal ölçüm kaydedilemedi'); console.error(error); return false; }
        const mapped = mapRow(data as PerioRow);
        setState((prev) => {
            if (prev.customerId !== customerId) return prev;
            const map = new Map(prev.map);
            map.set(toothNumber, mapped);
            return { customerId, map };
        });
        return true;
    }, [orgId, customerId, user?.id]);

    return { chart, isLoading, available, setTooth };
}
