import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Staff } from '@/types';

function mapDbStaff(row: any): Staff {
    return {
        id: row.id,
        organizationId: row.organization_id,
        name: row.name,
        specialty: row.specialty || undefined,
        phone: row.phone || undefined,
        email: row.email || undefined,
        color: row.color || '#8B5CF6',
        workingHours: row.working_hours || undefined,
        isActive: row.is_active ?? true,
        createdAt: row.created_at,
    };
}

export function useStaff() {
    const { user } = useAuth();
    const [staff, setStaff]   = useState<Staff[]>([]);
    const [orgId, setOrgId]   = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // org_id çöz
    const fetchOrgId = useCallback(async () => {
        if (!user) return null;
        const { data } = await supabase
            .from('organization_members')
            .select('org_id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();
        const id = data?.org_id ?? null;
        setOrgId(id);
        return id;
    }, [user]);

    // Personelleri getir
    const fetchStaff = useCallback(async (resolvedOrgId: string) => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('staff')
            .select('*')
            .eq('organization_id', resolvedOrgId)
            .eq('is_active', true)
            .order('created_at');

        if (error) {
            toast.error('Personel listesi yüklenemedi');
            console.error(error);
        } else {
            setStaff((data || []).map(mapDbStaff));
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (user) {
            fetchOrgId().then(id => { if (id) fetchStaff(id); });
        }
    }, [user, fetchOrgId, fetchStaff]);

    // Personel ekle
    const addStaff = useCallback(async (member: Omit<Staff, 'id' | 'createdAt' | 'organizationId'>) => {
        if (!user || !orgId) {
            toast.error('Organizasyon bilgisi alınamadı');
            return null;
        }
        const { data, error } = await supabase
            .from('staff')
            .insert({
                organization_id: orgId,
                name:          member.name,
                specialty:     member.specialty || null,
                phone:         member.phone || null,
                email:         member.email || null,
                color:         member.color,
                working_hours: member.workingHours || null,
                is_active:     member.isActive ?? true,
            })
            .select()
            .single();

        if (error) {
            toast.error('Personel eklenemedi');
            console.error(error);
            return null;
        }
        const newMember = mapDbStaff(data);
        setStaff(prev => [...prev, newMember]);
        return newMember;
    }, [user, orgId]);

    // Personel güncelle
    const updateStaff = useCallback(async (id: string, updates: Partial<Staff>) => {
        const dbUpdates: any = { updated_at: new Date().toISOString() };
        if (updates.name        !== undefined) dbUpdates.name          = updates.name;
        if (updates.specialty   !== undefined) dbUpdates.specialty     = updates.specialty || null;
        if (updates.phone       !== undefined) dbUpdates.phone         = updates.phone || null;
        if (updates.email       !== undefined) dbUpdates.email         = updates.email || null;
        if (updates.color       !== undefined) dbUpdates.color         = updates.color;
        if (updates.workingHours !== undefined) dbUpdates.working_hours = updates.workingHours || null;
        if (updates.isActive    !== undefined) dbUpdates.is_active     = updates.isActive;

        const { error } = await supabase.from('staff').update(dbUpdates).eq('id', id);
        if (error) { toast.error('Personel güncellenemedi'); return; }
        setStaff(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    }, []);

    // Personel sil (soft delete)
    const deleteStaff = useCallback(async (id: string) => {
        const { error } = await supabase.from('staff').update({ is_active: false }).eq('id', id);
        if (error) { toast.error('Personel silinemedi'); return; }
        setStaff(prev => prev.filter(s => s.id !== id));
        toast.success('Personel kaldırıldı');
    }, []);

    const refetch = useCallback(() => {
        if (orgId) return fetchStaff(orgId);
        return fetchOrgId().then(id => { if (id) fetchStaff(id); });
    }, [orgId, fetchOrgId, fetchStaff]);

    return {
        staff,
        isLoading,
        addStaff,
        updateStaff,
        deleteStaff,
        refetch,
    };
}
