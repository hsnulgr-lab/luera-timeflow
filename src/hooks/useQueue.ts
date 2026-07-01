import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { QueueEntry, QueueStatus } from '@/types';

function mapRow(row: any): QueueEntry {
    return {
        id: row.id,
        organizationId: row.organization_id,
        customerName: row.customer_name,
        customerPhone: row.customer_phone || undefined,
        service: row.service || undefined,
        staffId: row.staff_id || undefined,
        status: row.status,
        joinedAt: row.joined_at,
        calledAt: row.called_at || undefined,
        notes: row.notes || undefined,
    };
}

// Sırasız bekleme (walk-in kuyruğu). Yalnızca aktif (waiting/called) kayıtları tutar;
// served/left arşivlenir (listeden düşer).
export function useQueue() {
    const { user, orgId } = useAuth();
    const [entries, setEntries] = useState<QueueEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchQueue = useCallback(async (resolvedOrgId: string) => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('queue_entries')
            .select('*')
            .eq('organization_id', resolvedOrgId)
            .in('status', ['waiting', 'called'])
            .order('joined_at', { ascending: true });
        if (error) { toast.error('Sıra yüklenemedi'); console.error(error); }
        else setEntries((data || []).map(mapRow));
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (!user || !orgId) return;
        fetchQueue(orgId);
        // Canlı güncelleme — çoklu cihaz aynı sırayı görsün.
        // REPLICA IDENTITY FULL (034_realtime.sql) sayesinde payload.new/old tam satırı
        // içerir; tekrar fetch yerine satırı doğrudan state'e merge ediyoruz (round-trip yok).
        const ch = supabase
            .channel(`queue:${orgId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries', filter: `organization_id=eq.${orgId}` },
                (payload) => {
                    if (payload.eventType === 'DELETE') {
                        const oldId = (payload.old as any)?.id;
                        if (oldId) setEntries(prev => prev.filter(e => e.id !== oldId));
                        return;
                    }
                    const row = mapRow(payload.new);
                    if (row.status !== 'waiting' && row.status !== 'called') {
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
    }, [user, orgId, fetchQueue]);

    const addEntry = useCallback(async (e: { customerName: string; customerPhone?: string; service?: string; staffId?: string; notes?: string }) => {
        if (!orgId) { toast.error('Organizasyon bulunamadı'); return null; }
        const { data, error } = await supabase.from('queue_entries').insert({
            organization_id: orgId,
            customer_name: e.customerName,
            customer_phone: e.customerPhone || null,
            service: e.service || null,
            staff_id: e.staffId || null,
            notes: e.notes || null,
        }).select().single();
        if (error) { toast.error('Sıraya eklenemedi'); console.error(error); return null; }
        const row = mapRow(data);
        setEntries(prev => [...prev, row]);
        return row;
    }, [orgId]);

    const setStatus = useCallback(async (id: string, status: QueueStatus) => {
        const patch: any = { status };
        if (status === 'called') patch.called_at = new Date().toISOString();
        const { error } = await supabase.from('queue_entries').update(patch).eq('id', id);
        if (error) { toast.error('Güncellenemedi'); console.error(error); return; }
        setEntries(prev => status === 'waiting' || status === 'called'
            ? prev.map(e => e.id === id ? { ...e, status, ...(status === 'called' ? { calledAt: patch.called_at } : {}) } : e)
            : prev.filter(e => e.id !== id));
    }, []);

    const callEntry  = useCallback((id: string) => setStatus(id, 'called'), [setStatus]);
    const serveEntry = useCallback((id: string) => setStatus(id, 'served'), [setStatus]);
    const removeEntry = useCallback((id: string) => setStatus(id, 'left'), [setStatus]);

    return {
        entries,
        waiting: entries.filter(e => e.status === 'waiting'),
        called: entries.filter(e => e.status === 'called'),
        isLoading,
        addEntry,
        callEntry,
        serveEntry,
        removeEntry,
        refetch: () => { if (orgId) fetchQueue(orgId); },
    };
}
