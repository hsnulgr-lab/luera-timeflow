import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleGate } from '@/hooks/useModules';
import type { WaitlistEntry } from '@/types';

function mapRow(row: any): WaitlistEntry {
    return {
        id: row.id,
        organizationId: row.organization_id,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        serviceId: row.service_id || undefined,
        preferredDate: row.preferred_date || undefined,
        notes: row.notes || undefined,
        status: row.status,
        notifiedAt: row.notified_at || undefined,
        createdAt: row.created_at,
    };
}

/**
 * Bekleme listesi — dolu olduğu için randevu alamayan müşteriler.
 * Bir randevu iptal olunca eşleşen bekleyenlere otomatik bildirim gider
 * (notify-waitlist edge function). Burada işletme listeyi yönetir.
 */
export function useWaitlist() {
    const { user, orgId } = useAuth();
    const [entries, setEntries] = useState<WaitlistEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchEntries = useCallback(async (resolvedOrgId: string) => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('waitlist')
            .select('*')
            .eq('organization_id', resolvedOrgId)
            .eq('status', 'waiting')
            .order('created_at');
        if (error) console.error(error);
        else setEntries((data || []).map(mapRow));
        setIsLoading(false);
    }, []);

    // Modül kapısı (Faz 5): randevu kapalıysa bekleme listesi fetch+realtime başlamaz
    const randevuOn = useModuleGate('randevu');
    useEffect(() => {
        if (!user || !orgId || !randevuOn) return;
        fetchEntries(orgId);

        // Canlı güncelleme — 040_waitlist_realtime.sql ile publication + REPLICA
        // IDENTITY FULL ayarlandı; dolu güne müşteri yazılınca müdürün açık
        // ekranına yenileme gerekmeden düşsün.
        const ch = supabase
            .channel(`waitlist:${orgId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist', filter: `organization_id=eq.${orgId}` },
                (payload) => {
                    if (payload.eventType === 'DELETE') {
                        const oldId = (payload.old as any)?.id;
                        if (oldId) setEntries(prev => prev.filter(e => e.id !== oldId));
                        return;
                    }
                    const row = mapRow(payload.new);
                    if (row.status !== 'waiting') {
                        setEntries(prev => prev.filter(e => e.id !== row.id));
                        return;
                    }
                    setEntries(prev => {
                        const exists = prev.some(e => e.id === row.id);
                        return exists ? prev.map(e => e.id === row.id ? row : e) : [...prev, row];
                    });
                })
            .subscribe();

        return () => { supabase.removeChannel(ch); };
    }, [user, orgId, randevuOn, fetchEntries]);

    const addEntry = useCallback(async (e: { customerName: string; customerPhone: string; serviceId?: string; preferredDate?: string; notes?: string }) => {
        if (!orgId) { toast.error('Organizasyon bilgisi alınamadı'); return null; }
        const { data, error } = await supabase
            .from('waitlist')
            .insert({
                organization_id: orgId,
                customer_name: e.customerName,
                customer_phone: e.customerPhone,
                service_id: e.serviceId || null,
                preferred_date: e.preferredDate || null,
                notes: e.notes || null,
            })
            .select().single();
        if (error) { toast.error('Bekleme listesine eklenemedi'); console.error(error); return null; }
        const row = mapRow(data);
        setEntries(prev => [...prev, row]);
        return row;
    }, [orgId]);

    const removeEntry = useCallback(async (id: string) => {
        const { error } = await supabase.from('waitlist').delete().eq('id', id);
        if (error) { toast.error('Kaldırılamadı'); return; }
        setEntries(prev => prev.filter(e => e.id !== id));
    }, []);

    const refetch = useCallback(() => { if (orgId) return fetchEntries(orgId); }, [orgId, fetchEntries]);

    return { entries, isLoading, addEntry, removeEntry, refetch };
}
