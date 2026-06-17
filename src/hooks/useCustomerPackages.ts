import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { CustomerPackage } from '@/types';

function mapRow(row: any): CustomerPackage {
    return {
        id: row.id,
        organizationId: row.organization_id,
        customerId: row.customer_id,
        name: row.name,
        totalSessions: row.total_sessions,
        usedSessions: row.used_sessions,
        createdAt: row.created_at,
    };
}

/**
 * Müşteri seans paketleri. Organizasyon genelinde bir kez çekilir;
 * müşteri detayında customerId'ye göre filtrelenir. Randevu 'completed'
 * olunca DB trigger'ı en eski aktif paketten 1 seans düşer.
 */
export function useCustomerPackages() {
    const { user, orgId } = useAuth();
    const [packages, setPackages] = useState<CustomerPackage[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchPackages = useCallback(async (resolvedOrgId: string) => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('customer_packages')
            .select('*')
            .eq('organization_id', resolvedOrgId)
            .order('created_at', { ascending: false });
        if (error) console.error(error);
        else setPackages((data || []).map(mapRow));
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (user && orgId) fetchPackages(orgId);
    }, [user, orgId, fetchPackages]);

    const addPackage = useCallback(async (customerId: string, name: string, totalSessions: number) => {
        if (!orgId) { toast.error('Organizasyon bilgisi alınamadı'); return null; }
        const { data, error } = await supabase
            .from('customer_packages')
            .insert({ organization_id: orgId, customer_id: customerId, name, total_sessions: totalSessions, used_sessions: 0 })
            .select().single();
        if (error) { toast.error('Paket eklenemedi'); console.error(error); return null; }
        const row = mapRow(data);
        setPackages(prev => [row, ...prev]);
        return row;
    }, [orgId]);

    const removePackage = useCallback(async (id: string) => {
        const { error } = await supabase.from('customer_packages').delete().eq('id', id);
        if (error) { toast.error('Paket kaldırılamadı'); return; }
        setPackages(prev => prev.filter(p => p.id !== id));
    }, []);

    const forCustomer = useCallback(
        (customerId: string) => packages.filter(p => p.customerId === customerId),
        [packages],
    );

    const refetch = useCallback(() => { if (orgId) return fetchPackages(orgId); }, [orgId, fetchPackages]);

    return { packages, isLoading, addPackage, removePackage, forCustomer, refetch };
}
