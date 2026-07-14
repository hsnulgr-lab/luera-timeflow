import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { readCache, writeCache } from '@/lib/swrCache';
import type { Resource } from '@/types';

function mapRow(row: any): Resource {
    return {
        id: row.id,
        organizationId: row.organization_id,
        type: row.type || 'Oda',
        name: row.name,
        capacity: row.capacity ?? 1,
        isActive: row.is_active ?? true,
        sort: row.sort ?? 0,
        createdAt: row.created_at,
    };
}

// Genel kaynaklar (051) — koltuk/oda/ünite/kabin. useTables ile aynı desen;
// yalnız sektör profili resourceTypes tanımlıyorsa UI'da görünür.
export function useResources() {
    const { user, orgId } = useAuth();
    const [resources, setResources] = useState<Resource[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchResources = useCallback(async (org: string) => {
        const cached = readCache<Resource[]>(`resources:${org}`);
        if (cached) { setResources(cached); setIsLoading(false); } else setIsLoading(true);
        const { data, error } = await supabase
            .from('resources')
            .select('*')
            .eq('organization_id', org)
            .eq('is_active', true)
            .order('sort')
            .order('created_at');
        if (error) { console.error('Error fetching resources:', error); }
        else {
            const rows = (data || []).map(mapRow);
            setResources(rows);
            writeCache(`resources:${org}`, rows);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { if (user && orgId) fetchResources(orgId); }, [user, orgId, fetchResources]);

    // Realtime — useTables deseni (kanal adı benzersiz; çoklu mount güvenli)
    useEffect(() => {
        if (!user || !orgId) return;
        const ch = supabase
            .channel(`resources:${orgId}:${Math.random().toString(36).slice(2)}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'resources', filter: `organization_id=eq.${orgId}` },
                (payload) => {
                    if (payload.eventType === 'DELETE') {
                        const oldId = (payload.old as any)?.id;
                        if (oldId) setResources((p) => p.filter((r) => r.id !== oldId));
                        return;
                    }
                    const row = mapRow(payload.new);
                    setResources((p) => {
                        const next = row.isActive
                            ? (p.some((r) => r.id === row.id) ? p.map((r) => (r.id === row.id ? row : r)) : [...p, row])
                            : p.filter((r) => r.id !== row.id);
                        writeCache(`resources:${orgId}`, next);
                        return next;
                    });
                })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [user, orgId]);

    const addResource = useCallback(async (r: { type: string; name: string; capacity?: number }) => {
        if (!orgId) return null;
        const { data, error } = await supabase
            .from('resources')
            .insert({ organization_id: orgId, type: r.type, name: r.name, capacity: r.capacity ?? 1 })
            .select()
            .single();
        if (error) { toast.error('Kaynak eklenemedi'); console.error(error); return null; }
        const row = mapRow(data);
        setResources((p) => (p.some((x) => x.id === row.id) ? p : [...p, row]));
        return row;
    }, [orgId]);

    const updateResource = useCallback(async (id: string, updates: Partial<Pick<Resource, 'name' | 'type' | 'capacity' | 'sort'>>) => {
        const db: any = {};
        if (updates.name !== undefined) db.name = updates.name;
        if (updates.type !== undefined) db.type = updates.type;
        if (updates.capacity !== undefined) db.capacity = updates.capacity;
        if (updates.sort !== undefined) db.sort = updates.sort;
        const { error } = await supabase.from('resources').update(db).eq('id', id);
        if (error) { toast.error('Kaynak güncellenemedi'); console.error(error); return; }
        setResources((p) => p.map((r) => (r.id === id ? { ...r, ...updates } : r)));
    }, []);

    const removeResource = useCallback(async (id: string) => {
        const { error } = await supabase.from('resources').update({ is_active: false }).eq('id', id);
        if (error) { toast.error('Kaynak silinemedi'); console.error(error); return; }
        setResources((p) => p.filter((r) => r.id !== id));
    }, []);

    return { resources, isLoading, addResource, updateResource, removeResource };
}
