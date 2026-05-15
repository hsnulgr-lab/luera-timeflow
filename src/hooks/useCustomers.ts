import { useState, useEffect, useCallback } from 'react';
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

    // Fetch customers from Supabase
    const fetchCustomers = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);

        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching customers:', error);
            setIsLoading(false);
            return;
        }

        // Enrich with reservation counts
        const customersWithCounts = await Promise.all(
            (data || []).map(async (c: any) => {
                const { count } = await supabase
                    .from('reservations')
                    .select('*', { count: 'exact', head: true })
                    .eq('customer_id', c.id);

                const { data: lastRes } = await supabase
                    .from('reservations')
                    .select('date')
                    .eq('customer_id', c.id)
                    .order('date', { ascending: false })
                    .limit(1);

                return {
                    ...mapDbCustomer(c),
                    totalReservations: count || 0,
                    lastVisit: lastRes?.[0]?.date || undefined,
                };
            })
        );

        setCustomers(customersWithCounts);
        setIsLoading(false);
    }, [user]);

    useEffect(() => {
        if (user) {
            fetchCustomers();
        }
    }, [user, fetchCustomers]);

    const addCustomer = useCallback(async (customer: Omit<Customer, 'id' | 'createdAt' | 'totalReservations'>) => {
        if (!user) return null;

        const { data, error } = await supabase
            .from('customers')
            .insert({
                user_id: user.id,
                name: customer.name,
                phone: customer.phone,
                email: customer.email || null,
                notes: customer.notes || '',
            })
            .select()
            .single();

        if (error) {
            console.error('Error adding customer:', error);
            return null;
        }

        const newCust: Customer = {
            ...mapDbCustomer(data),
            totalReservations: 0,
        };
        setCustomers(prev => [newCust, ...prev]);
        return newCust;
    }, [user]);

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
            console.error('Error updating customer:', error);
            return;
        }

        setCustomers(prev =>
            prev.map(c => c.id === id ? { ...c, ...updates } : c)
        );
    }, []);

    const deleteCustomer = useCallback(async (id: string) => {
        const { error } = await supabase
            .from('customers')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting customer:', error);
            return;
        }

        setCustomers(prev => prev.filter(c => c.id !== id));
    }, []);

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
