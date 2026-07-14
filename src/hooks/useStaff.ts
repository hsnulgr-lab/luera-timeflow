import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { readCache, writeCache } from '@/lib/swrCache';
import { normalizeStaffRole } from '@/lib/staffPermissions';
import type { Staff } from '@/types';

function isMissingStaffRoleColumn(error: { code?: string; message?: string; details?: string } | null): boolean {
    if (!error) return false;
    const message = String(error.message || error.details || '').toLowerCase();
    return (error.code === 'PGRST204' || error.code === '42703')
        && message.includes('role');
}

interface StaffDbRow {
    id: string;
    organization_id: string;
    name: string;
    role?: string | null;
    specialty?: string | null;
    phone?: string | null;
    email?: string | null;
    color?: string | null;
    working_hours?: Staff['workingHours'] | null;
    is_active?: boolean | null;
    pin?: string | null;
    created_at: string;
}

function mapDbStaff(row: StaffDbRow): Staff {
    return {
        id: row.id,
        organizationId: row.organization_id,
        name: row.name,
        role: normalizeStaffRole(row.role, row.specialty),
        specialty: row.specialty || undefined,
        phone: row.phone || undefined,
        email: row.email || undefined,
        color: row.color || '#8B5CF6',
        workingHours: row.working_hours || undefined,
        isActive: row.is_active ?? true,
        pin: row.pin || undefined,
        createdAt: row.created_at,
    };
}

export function useStaff() {
    const { user, orgId } = useAuth();
    const [staff, setStaff]   = useState<Staff[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Personelleri getir
    const fetchStaff = useCallback(async (resolvedOrgId: string) => {
        // SWR: önce son bilinen liste, arkada ağdan tazele
        const cached = readCache<Staff[]>(`staff:${resolvedOrgId}`);
        if (cached) { setStaff(cached); setIsLoading(false); } else setIsLoading(true);
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
            const rows = (data || []).map(mapDbStaff);
            setStaff(rows);
            writeCache(`staff:${resolvedOrgId}`, rows);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (!user || !orgId) return;
        const timer = window.setTimeout(() => { void fetchStaff(orgId); }, 0);
        return () => window.clearTimeout(timer);
    }, [user, orgId, fetchStaff]);

    // Personel ekle
    const addStaff = useCallback(async (member: Omit<Staff, 'id' | 'createdAt' | 'organizationId'>) => {
        if (!user || !orgId) {
            toast.error('Organizasyon bilgisi alınamadı');
            return null;
        }
        const basePayload = {
            organization_id: orgId,
            name:          member.name,
            specialty:     member.specialty || null,
            phone:         member.phone || null,
            email:         member.email || null,
            color:         member.color,
            working_hours: member.workingHours || null,
            is_active:     member.isActive ?? true,
            pin:           member.pin || null,
        };
        let result = await supabase
            .from('staff')
            .insert({
                ...basePayload,
                role:           member.role,
            })
            .select()
            .single();

        // 058 henüz uygulanmamış ortamlarda personel ekleme akışını
        // bozma. Rol bu durumda uzmanlık alanından okunur; kalıcı rol için
        // migration uygulanmalıdır.
        if (isMissingStaffRoleColumn(result.error)) {
            result = await supabase.from('staff').insert(basePayload).select().single();
        }
        const { data, error } = result;

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
        const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (updates.name        !== undefined) dbUpdates.name          = updates.name;
        if (updates.specialty   !== undefined) dbUpdates.specialty     = updates.specialty || null;
        if (updates.phone       !== undefined) dbUpdates.phone         = updates.phone || null;
        if (updates.email       !== undefined) dbUpdates.email         = updates.email || null;
        if (updates.color       !== undefined) dbUpdates.color         = updates.color;
        if (updates.workingHours !== undefined) dbUpdates.working_hours = updates.workingHours || null;
        if (updates.isActive    !== undefined) dbUpdates.is_active     = updates.isActive;
        if (updates.pin         !== undefined) dbUpdates.pin           = updates.pin || null;
        if (updates.role        !== undefined) dbUpdates.role          = updates.role;

        let result = await supabase.from('staff').update(dbUpdates).eq('id', id);
        if (updates.role !== undefined && isMissingStaffRoleColumn(result.error)) {
            const legacyUpdates = { ...dbUpdates };
            delete legacyUpdates.role;
            result = await supabase.from('staff').update(legacyUpdates).eq('id', id);
        }
        const { error } = result;
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
    }, [orgId, fetchStaff]);

    return {
        staff,
        isLoading,
        addStaff,
        updateStaff,
        deleteStaff,
        refetch,
    };
}
