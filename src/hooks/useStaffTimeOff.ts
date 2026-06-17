import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { StaffTimeOff } from '@/types';

function mapRow(row: any): StaffTimeOff {
    return {
        id: row.id,
        staffId: row.staff_id,
        organizationId: row.organization_id,
        date: row.date,
        reason: row.reason || undefined,
        createdAt: row.created_at,
    };
}

/**
 * Personel izin / tatil günleri. Organizasyon genelinde bir kez çekilir;
 * StaffPage detay panelinde seçili personele göre filtrelenir.
 * Booking müsaitlik motoru (public-booking edge function) aynı tabloyu
 * bağımsız okur.
 */
export function useStaffTimeOff() {
    const { user, orgId } = useAuth();
    const [timeOff, setTimeOff] = useState<StaffTimeOff[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchTimeOff = useCallback(async (resolvedOrgId: string) => {
        setIsLoading(true);
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await supabase
            .from('staff_time_off')
            .select('*')
            .eq('organization_id', resolvedOrgId)
            .gte('date', today)
            .order('date');

        if (error) {
            console.error(error);
        } else {
            setTimeOff((data || []).map(mapRow));
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (user && orgId) fetchTimeOff(orgId);
    }, [user, orgId, fetchTimeOff]);

    const addTimeOff = useCallback(async (staffId: string, date: string, reason?: string) => {
        if (!orgId) { toast.error('Organizasyon bilgisi alınamadı'); return null; }
        const { data, error } = await supabase
            .from('staff_time_off')
            .insert({ staff_id: staffId, organization_id: orgId, date, reason: reason || null })
            .select()
            .single();

        if (error) {
            // 23505 = unique violation (aynı personel + tarih)
            if (error.code === '23505') toast.error('Bu tarih zaten izinli');
            else { toast.error('İzin eklenemedi'); console.error(error); }
            return null;
        }
        const row = mapRow(data);
        setTimeOff(prev => [...prev, row].sort((a, b) => a.date.localeCompare(b.date)));
        return row;
    }, [orgId]);

    const removeTimeOff = useCallback(async (id: string) => {
        const { error } = await supabase.from('staff_time_off').delete().eq('id', id);
        if (error) { toast.error('İzin kaldırılamadı'); return; }
        setTimeOff(prev => prev.filter(t => t.id !== id));
    }, []);

    const forStaff = useCallback(
        (staffId: string) => timeOff.filter(t => t.staffId === staffId),
        [timeOff],
    );

    return { timeOff, isLoading, addTimeOff, removeTimeOff, forStaff };
}
