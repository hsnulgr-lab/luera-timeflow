import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { TableReservation, TableReservationStatus } from '@/types';

function mapRow(row: any): TableReservation {
    return {
        id: row.id,
        organizationId: row.organization_id,
        tableId: row.table_id,
        customerName: row.customer_name,
        customerPhone: row.customer_phone || undefined,
        customerId: row.customer_id || undefined,
        staffId: row.staff_id || undefined,
        partySize: row.party_size ?? 2,
        date: row.date,
        startTime: row.start_time?.slice(0, 5) || row.start_time,
        endTime: row.end_time ? (row.end_time.slice(0, 5) || row.end_time) : undefined,
        status: row.status,
        notes: row.notes || undefined,
        createdAt: row.created_at,
    };
}

// Belirli bir tarihteki masa rezervasyonlarını yönetir.
export function useTableReservations(date: string) {
    const { orgId } = useAuth();
    const [reservations, setReservations] = useState<TableReservation[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchFor = useCallback(async (org: string, d: string) => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('table_reservations')
            .select('*')
            .eq('organization_id', org)
            .eq('date', d)
            .neq('status', 'cancelled')
            .order('start_time');
        if (error) { toast.error('Rezervasyonlar yüklenemedi'); console.error(error); }
        else setReservations((data || []).map(mapRow));
        setIsLoading(false);
    }, []);

    useEffect(() => { if (orgId && date) fetchFor(orgId, date); }, [orgId, date, fetchFor]);

    // Realtime: başka cihazın rezervasyon/oturt/tamamla/iptal işlemi anında
    // yansısın. Kanal görüntülenen güne bağlı — gün değişince yeniden kurulur.
    useEffect(() => {
        if (!orgId || !date) return;
        const ch = supabase
            .channel(`table_res:${orgId}:${date}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'table_reservations', filter: `organization_id=eq.${orgId}` },
                (payload) => {
                    if (payload.eventType === 'DELETE') {
                        const oldId = (payload.old as any)?.id;
                        if (oldId) setReservations((p) => p.filter((r) => r.id !== oldId));
                        return;
                    }
                    const row = mapRow(payload.new);
                    // Görüntülenen güne ait değil ya da iptal → listeden düş
                    if (row.date !== date || row.status === 'cancelled') {
                        setReservations((p) => p.filter((r) => r.id !== row.id));
                        return;
                    }
                    setReservations((p) => {
                        const rest = p.filter((r) => r.id !== row.id);
                        return [...rest, row].sort((a, b) => a.startTime.localeCompare(b.startTime));
                    });
                })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [orgId, date]);

    const addReservation = useCallback(async (r: Omit<TableReservation, 'id' | 'createdAt' | 'organizationId'>) => {
        if (!orgId) { toast.error('Organizasyon bilgisi alınamadı'); return null; }
        const base = {
            organization_id: orgId,
            table_id: r.tableId,
            customer_name: r.customerName || 'Misafir',
            customer_phone: r.customerPhone || null,
            party_size: r.partySize,
            date: r.date,
            start_time: r.startTime,
            end_time: r.endTime || null,
            status: r.status,
            notes: r.notes || null,
        };
        // customer_id/staff_id 042 migration'ı ile geldi — yalnızca doluysa gönder;
        // migration henüz çalışmadıysa bağsız kayda geri düş (akış kırılmaz).
        const linked = {
            ...base,
            ...(r.customerId ? { customer_id: r.customerId } : {}),
            ...(r.staffId ? { staff_id: r.staffId } : {}),
        };
        let { data, error } = await supabase.from('table_reservations').insert(linked).select().single();
        if (error && (r.customerId || r.staffId)) {
            console.warn('042_masa_entegrasyon.sql henüz uygulanmamış olabilir, bağsız kaydediliyor:', error.message);
            ({ data, error } = await supabase.from('table_reservations').insert(base).select().single());
        }
        if (error) { toast.error('Rezervasyon eklenemedi'); console.error(error); return null; }
        const row = mapRow(data);
        // Sadece görüntülenen güne aitse listeye ekle
        if (row.date === date) setReservations((p) => [...p, row].sort((a, b) => a.startTime.localeCompare(b.startTime)));
        return row;
    }, [orgId, date]);

    const setStatus = useCallback(async (id: string, status: TableReservationStatus) => {
        const { error } = await supabase.from('table_reservations').update({ status }).eq('id', id);
        if (error) { toast.error('Durum güncellenemedi'); return; }
        if (status === 'cancelled') setReservations((p) => p.filter((r) => r.id !== id));
        else setReservations((p) => p.map((r) => (r.id === id ? { ...r, status } : r)));
    }, []);

    const removeReservation = useCallback(async (id: string) => {
        const { error } = await supabase.from('table_reservations').delete().eq('id', id);
        if (error) { toast.error('Rezervasyon silinemedi'); return; }
        setReservations((p) => p.filter((r) => r.id !== id));
    }, []);

    return { reservations, isLoading, addReservation, setStatus, removeReservation };
}
