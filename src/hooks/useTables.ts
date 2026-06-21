import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Table } from '@/types';

function mapRow(row: any): Table {
    return {
        id: row.id,
        organizationId: row.organization_id,
        name: row.name,
        capacity: row.capacity ?? 2,
        isActive: row.is_active ?? true,
        createdAt: row.created_at,
    };
}

export function useTables() {
    const { user, orgId } = useAuth();
    const [tables, setTables] = useState<Table[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchTables = useCallback(async (org: string) => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('tables')
            .select('*')
            .eq('organization_id', org)
            .eq('is_active', true)
            .order('created_at');
        if (error) { toast.error('Masalar yüklenemedi'); console.error(error); }
        else setTables((data || []).map(mapRow));
        setIsLoading(false);
    }, []);

    useEffect(() => { if (user && orgId) fetchTables(orgId); }, [user, orgId, fetchTables]);

    const addTable = useCallback(async (t: { name: string; capacity: number }) => {
        if (!orgId) { toast.error('Organizasyon bilgisi alınamadı'); return null; }
        const { data, error } = await supabase
            .from('tables')
            .insert({ organization_id: orgId, name: t.name, capacity: t.capacity })
            .select().single();
        if (error) { toast.error('Masa eklenemedi'); console.error(error); return null; }
        const row = mapRow(data);
        setTables((p) => [...p, row]);
        return row;
    }, [orgId]);

    const updateTable = useCallback(async (id: string, updates: Partial<Pick<Table, 'name' | 'capacity'>>) => {
        const db: any = {};
        if (updates.name !== undefined) db.name = updates.name;
        if (updates.capacity !== undefined) db.capacity = updates.capacity;
        const { error } = await supabase.from('tables').update(db).eq('id', id);
        if (error) { toast.error('Masa güncellenemedi'); return; }
        setTables((p) => p.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    }, []);

    const deleteTable = useCallback(async (id: string) => {
        const { error } = await supabase.from('tables').update({ is_active: false }).eq('id', id);
        if (error) { toast.error('Masa silinemedi'); return; }
        setTables((p) => p.filter((t) => t.id !== id));
        toast.success('Masa kaldırıldı');
    }, []);

    const refetch = useCallback(() => { if (orgId) return fetchTables(orgId); }, [orgId, fetchTables]);

    return { tables, isLoading, addTable, updateTable, deleteTable, refetch };
}
