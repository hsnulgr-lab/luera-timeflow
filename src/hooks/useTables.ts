import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { readCache, writeCache } from '@/lib/swrCache';
import { useModuleGate } from '@/hooks/useModules';
import type { Table } from '@/types';

function mapRow(row: any): Table {
    return {
        id: row.id,
        organizationId: row.organization_id,
        name: row.name,
        capacity: row.capacity ?? 2,
        zone: row.zone || 'Salon',
        isActive: row.is_active ?? true,
        createdAt: row.created_at,
    };
}

export function useTables() {
    const { user, orgId } = useAuth();
    // Modül kapısı (Faz 5): masa kapalıysa fetch + realtime hiç başlamaz
    const masaOn = useModuleGate('masa');
    const [tables, setTables] = useState<Table[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchTables = useCallback(async (org: string) => {
        // SWR: önce son bilinen liste, arkada ağdan tazele
        const cached = readCache<Table[]>(`tables:${org}`);
        if (cached) { setTables(cached); setIsLoading(false); } else setIsLoading(true);
        const { data, error } = await supabase
            .from('tables')
            .select('*')
            .eq('organization_id', org)
            .eq('is_active', true)
            .order('created_at');
        if (error) { toast.error('Masalar yüklenemedi'); console.error(error); }
        else {
            const rows = (data || []).map(mapRow);
            setTables(rows);
            writeCache(`tables:${org}`, rows);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { if (user && orgId && masaOn) fetchTables(orgId); }, [user, orgId, masaOn, fetchTables]);

    // Realtime: başka cihazın masa ekleme/güncelleme/silmesi anında yansısın
    // (usePayments/useReservations ile aynı desen; 041_masa_realtime.sql gerekli).
    useEffect(() => {
        if (!user || !orgId || !masaOn) return;
        const ch = supabase
            // Rastgele ek: aynı topic'e ikinci abonelik sessizce ölür (usePayments deseni) —
            // Dashboard + MasaPage aynı anda mount olabildiği için kanal adı benzersiz.
            .channel(`tables:${orgId}:${Math.random().toString(36).slice(2)}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `organization_id=eq.${orgId}` },
                (payload) => {
                    if (payload.eventType === 'DELETE') {
                        const oldId = (payload.old as any)?.id;
                        if (oldId) setTables((p) => p.filter((t) => t.id !== oldId));
                        return;
                    }
                    const row = mapRow(payload.new);
                    setTables((p) => {
                        // Soft-delete (is_active=false) → listeden düş
                        if (!row.isActive) return p.filter((t) => t.id !== row.id);
                        // Var olan güncellendi ya da yeni/yeniden-aktif satır eklendi
                        return p.some((t) => t.id === row.id)
                            ? p.map((t) => (t.id === row.id ? row : t))
                            : [...p, row].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
                    });
                })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [user, orgId, masaOn]);

    const addTable = useCallback(async (t: { name: string; capacity: number; zone?: string }) => {
        if (!orgId) { toast.error('Organizasyon bilgisi alınamadı'); return null; }
        const { data, error } = await supabase
            .from('tables')
            .insert({ organization_id: orgId, name: t.name, capacity: t.capacity, zone: t.zone || 'Salon' })
            .select().single();
        if (error) { toast.error('Masa eklenemedi'); console.error(error); return null; }
        const row = mapRow(data);
        setTables((p) => [...p, row]);
        return row;
    }, [orgId]);

    const updateTable = useCallback(async (id: string, updates: Partial<Pick<Table, 'name' | 'capacity' | 'zone'>>) => {
        const db: any = {};
        if (updates.name !== undefined) db.name = updates.name;
        if (updates.capacity !== undefined) db.capacity = updates.capacity;
        if (updates.zone !== undefined) db.zone = updates.zone;
        const { error } = await supabase.from('tables').update(db).eq('id', id);
        if (error) { toast.error('Masa güncellenemedi'); return; }
        setTables((p) => p.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    }, []);

    const deleteTable = useCallback(async (id: string) => {
        const { error } = await supabase.from('tables').update({ is_active: false }).eq('id', id);
        if (error) { toast.error('Masa silinemedi'); return; }
        // Hayalet rezervasyon bırakma: kaldırılan masanın aktif (rezerve/oturmuş)
        // kayıtları iptal edilir — yoksa başlık sayacında görünüp kartta görünmezler.
        const { error: resErr } = await supabase
            .from('table_reservations')
            .update({ status: 'cancelled' })
            .eq('table_id', id)
            .in('status', ['reserved', 'seated']);
        if (resErr) console.error('Masa rezervasyonları iptal edilemedi:', resErr);
        setTables((p) => p.filter((t) => t.id !== id));
        toast.success('Masa kaldırıldı');
    }, []);

    const refetch = useCallback(() => { if (orgId) return fetchTables(orgId); }, [orgId, fetchTables]);

    return { tables, isLoading, addTable, updateTable, deleteTable, refetch };
}
