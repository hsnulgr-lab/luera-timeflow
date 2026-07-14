import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { readCache, writeCache } from '@/lib/swrCache';
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
        loyaltyStamps: row.loyalty_stamps ?? 0,
        customFields: row.custom_fields || {},
        recallDate: row.recall_date || undefined,
        createdAt: row.created_at,
    };
}

export function useCustomers() {
    const { user, orgId } = useAuth();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    // ─── Müşterileri getir (N+1 fix: 3 sorgu → 1 sorgu) ─────────────────────
    const fetchCustomers = useCallback(async (resolvedOrgId: string) => {
        // SWR: önce son bilinen liste, arkada ağdan tazele
        const cached = readCache<Customer[]>(`customers:${resolvedOrgId}`);
        if (cached) { setCustomers(cached); setIsLoading(false); } else setIsLoading(true);

        // Müşterileri getir
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('organization_id', resolvedOrgId)
            .eq('is_active', true)
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
            writeCache(`customers:${resolvedOrgId}`, []);
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
        writeCache(`customers:${resolvedOrgId}`, enriched);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (user && orgId) fetchCustomers(orgId);
    }, [user, orgId, fetchCustomers]);

    // Race condition guard: aynı anda iki ekleme isteği gönderilmesini engeller
    const addingRef = useRef(false);

    // ─── Müşteri ekle ────────────────────────────────────────────────────────
    const addCustomer = useCallback(async (customer: Omit<Customer, 'id' | 'createdAt' | 'totalReservations'>) => {
        if (!user || !orgId) {
            toast.error('Organizasyon bilgisi alınamadı. Lütfen sayfayı yenileyin.');
            return null;
        }
        if (addingRef.current) return null;
        addingRef.current = true;

        try {
            // Telefon numarası duplicate kontrolü
            const normalizedPhone = customer.phone.replace(/\s+/g, '').trim();
            const { data: existing } = await supabase
                .from('customers')
                .select('id, name, is_active')
                .eq('organization_id', orgId)
                .eq('phone', normalizedPhone)
                .order('is_active', { ascending: false })
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (existing) {
                if (existing.is_active !== false) {
                    toast.error(`Bu numara zaten kayıtlı: ${existing.name}`);
                    return null;
                }

                // Yeni randevu alan arşivlenmiş hastayı ikinci bir kayıt açmak
                // yerine geri getir; deep-link detay paneli de böylece boş kalmaz.
                const { data: restored, error: restoreError } = await supabase
                    .from('customers')
                    .update({
                        is_active: true,
                        name: customer.name,
                        email: customer.email || null,
                        notes: customer.notes || '',
                        ...(customer.customFields ? { custom_fields: customer.customFields } : {}),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', existing.id)
                    .select()
                    .single();
                if (restoreError || !restored) {
                    toast.error('Arşivlenmiş müşteri geri getirilemedi');
                    console.error('Error restoring customer:', restoreError);
                    return null;
                }
                const restoredCustomer: Customer = { ...mapDbCustomer(restored), totalReservations: 0 };
                setCustomers(prev => [restoredCustomer, ...prev.filter(c => c.id !== restoredCustomer.id)]);
                return restoredCustomer;
            }

            const { data, error } = await supabase
                .from('customers')
                .insert({
                    user_id: user.id,
                    organization_id: orgId,
                    name: customer.name,
                    phone: normalizedPhone,
                    email: customer.email || null,
                    notes: customer.notes || '',
                    // 050 uygulanmadan kolonu göndermeyelim — boşken eklemek gereksiz
                    ...(customer.customFields && Object.keys(customer.customFields).length
                        ? { custom_fields: customer.customFields } : {}),
                })
                .select()
                .single();

            if (error) {
                // UNIQUE constraint ihlali — iki tab aynı anda ekledi
                if (error.code === '23505') {
                    toast.error('Bu telefon numarası zaten kayıtlı');
                } else {
                    toast.error('Müşteri eklenemedi');
                    console.error('Error adding customer:', error);
                }
                return null;
            }

            const newCust: Customer = { ...mapDbCustomer(data), totalReservations: 0 };
            setCustomers(prev => [newCust, ...prev]);
            return newCust;
        } finally {
            addingRef.current = false;
        }
    }, [user, orgId]);

    // ─── Müşteri güncelle ────────────────────────────────────────────────────
    const updateCustomer = useCallback(async (id: string, updates: Partial<Customer>): Promise<boolean> => {
        const dbUpdates: any = { updated_at: new Date().toISOString() };

        if (updates.name !== undefined) dbUpdates.name = updates.name;
        if (updates.phone !== undefined) dbUpdates.phone = updates.phone.replace(/\s+/g, '').trim();
        if (updates.email !== undefined) dbUpdates.email = updates.email;
        if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
        if (updates.customFields !== undefined) dbUpdates.custom_fields = updates.customFields;
        if (updates.recallDate !== undefined) dbUpdates.recall_date = updates.recallDate || null;

        const { error } = await supabase
            .from('customers')
            .update(dbUpdates)
            .eq('id', id);

        if (error) {
            toast.error('Müşteri güncellenemedi');
            console.error('Error updating customer:', error);
            return false;
        }

        setCustomers(prev => prev.map(c => c.id === id ? {
            ...c,
            ...updates,
            ...(updates.phone !== undefined ? { phone: dbUpdates.phone } : {}),
        } : c));
        return true;
    }, []);

    // ─── Müşteri sil (soft delete) ───────────────────────────────────────────
    const deleteCustomer = useCallback(async (id: string) => {
        const { error } = await supabase
            .from('customers')
            .update({ is_active: false })
            .eq('id', id);

        if (error) {
            toast.error('Müşteri silinemedi');
            console.error('Error deleting customer:', error);
            return;
        }

        setCustomers(prev => prev.filter(c => c.id !== id));
        toast.success('Müşteri arşivlendi');
    }, []);

    // ─── Sadakat ödülü kullan (damgayı eşik kadar düşür) ─────────────────────
    const redeemLoyalty = useCallback(async (id: string, threshold: number) => {
        const cust = customers.find(c => c.id === id);
        const current = cust?.loyaltyStamps ?? 0;
        if (current < threshold) { toast.error('Yeterli damga yok'); return; }
        const next = current - threshold;
        const { error } = await supabase.from('customers').update({ loyalty_stamps: next }).eq('id', id);
        if (error) { toast.error('Ödül kullanılamadı'); console.error(error); return; }
        setCustomers(prev => prev.map(c => c.id === id ? { ...c, loyaltyStamps: next } : c));
        toast.success('Ödül kullanıldı 🎉');
    }, [customers]);

    // ─── Arama filtresi (memoized) ───────────────────────────────────────────
    const filteredCustomers = useMemo(() => {
        if (!searchQuery) return customers;
        const q = searchQuery.toLowerCase();
        return customers.filter(c =>
            c.name.toLowerCase().includes(q) ||
            c.phone.includes(q) ||
            (c.email && c.email.toLowerCase().includes(q))
        );
    }, [customers, searchQuery]);

    return {
        customers: filteredCustomers,
        allCustomers: customers,
        searchQuery,
        setSearchQuery,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        redeemLoyalty,
        isLoading,
        refetch: () => { if (orgId) fetchCustomers(orgId); },
    };
}
