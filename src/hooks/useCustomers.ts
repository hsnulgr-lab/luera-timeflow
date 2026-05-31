import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Customer } from '@/types';

function mapDbCustomer(row: any): Customer {
    return {
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email || undefined,
        totalReservations: row.total_reservations || 0,
        lastVisit: row.last_visit || undefined,
        notes: row.notes || '',
        createdAt: row.created_at,
    };
}

export function useCustomers() {
    const { user } = useAuth();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [orgId, setOrgId] = useState<string | null>(null);

    // ─── org_id çöz ──────────────────────────────────────────────────────────
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

    // ─── Müşterileri getir (N+1 fix: 3 sorgu → 1 sorgu) ─────────────────────
    const fetchCustomers = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);

        // Müşterileri getir
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            toast.error('Müşteriler yüklenemedi');
            console.error('Error fetching customers:', error);
            setIsLoading(false);
            return;
        }

        const customerList = data || [];
        if (customerList.length === 0) {
            setCustomers([]);
            setIsLoading(false);
            return;
        }

        // Tüm müşteri ID'leri için rezervasyonları tek sorguda getir (N+1 fix)
        const customerIds = customerList.map((c: any) => c.id);
        const { data: reservations } = await supabase
            .from('reservations')
            .select('customer_id, date')
            .in('customer_id', customerIds)
            .order('date', { ascending: false });

        // JS'de count ve last_visit hesapla
        const countMap = new Map<string, number>();
        const lastVisitMap = new Map<string, string>();

        for (const res of (reservations || [])) {
            if (!res.customer_id) continue;
            countMap.set(res.customer_id, (countMap.get(res.customer_id) || 0) + 1);
            if (!lastVisitMap.has(res.customer_id)) {
                lastVisitMap.set(res.customer_id, res.date);
            }
        }

        const enriched: Customer[] = customerList.map((c: any) => ({
            ...mapDbCustomer(c),
            totalReservations: countMap.get(c.id) || 0,
            lastVisit: lastVisitMap.get(c.id) || undefined,
        }));

        setCustomers(enriched);
        setIsLoading(false);
    }, [user]);

    useEffect(() => {
        if (user) {
            fetchOrgId();
            fetchCustomers();
        }
    }, [user, fetchOrgId, fetchCustomers]);

    // ─── Müşteri ekle ────────────────────────────────────────────────────────
    const addCustomer = useCallback(async (customer: Omit<Customer, 'id' | 'createdAt' | 'totalReservations'>) => {
        if (!user) return null;

        if (!orgId) {
            toast.error('Organizasyon bilgisi alınamadı. Lütfen sayfayı yenileyin.');
            return null;
        }

        const { data, error } = await supabase
            .from('customers')
            .insert({
                user_id: user.id,
                organization_id: orgId,
                name: customer.name,
                phone: customer.phone,
                email: customer.email || null,
                notes: customer.notes || '',
            })
            .select()
            .single();

        if (error) {
            toast.error('Müşteri eklenemedi');
            console.error('Error adding customer:', error);
            return null;
        }

        const newCust: Customer = { ...mapDbCustomer(data), totalReservations: 0 };
        setCustomers(prev => [newCust, ...prev]);
        return newCust;
    }, [user, orgId]);

    // ─── Müşteri güncelle ────────────────────────────────────────────────────
    const updateCustomer = useCallback(async (id: string, updates: Partial<Customer>) => {
        const dbUpdates: any = { updated_at: new Date().toISOString() };

        if (updates.name !== undefined) dbUpdates.name = updates.name;
        if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
        if (updates.email !== undefined) dbUpdates.email = updates.email;
        if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

        const { error } = await supabase
            .from('customers')
            .update(dbUpdates)
            .eq('id', id);

        if (error) {
            toast.error('Müşteri güncellenemedi');
            console.error('Error updating customer:', error);
            return;
        }

        setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    }, []);

    // ─── Müşteri sil ─────────────────────────────────────────────────────────
    const deleteCustomer = useCallback(async (id: string) => {
        const { error } = await supabase
            .from('customers')
            .delete()
            .eq('id', id);

        if (error) {
            toast.error('Müşteri silinemedi');
            console.error('Error deleting customer:', error);
            return;
        }

        setCustomers(prev => prev.filter(c => c.id !== id));
    }, []);

    // ─── Arama filtresi ──────────────────────────────────────────────────────
    const filteredCustomers = customers.filter(c => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return c.name.toLowerCase().includes(q) ||
            c.phone.includes(q) ||
            (c.email && c.email.toLowerCase().includes(q));
    });

    return {
        customers: filteredCustomers,
        allCustomers: customers,
        searchQuery,
        setSearchQuery,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        isLoading,
        refetch: fetchCustomers,
    };
}
