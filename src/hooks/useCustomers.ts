import { useState, useEffect, useCallback } from 'react';
import type { Customer } from '@/types';

const LS_CUSTOMERS = 'luera_customers';

function loadFromStorage<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function saveToStorage<T>(key: string, value: T) {
    localStorage.setItem(key, JSON.stringify(value));
}

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function useCustomers() {
    const [customers, setCustomers] = useState<Customer[]>(() =>
        loadFromStorage<Customer[]>(LS_CUSTOMERS, [])
    );
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading] = useState(false);

    useEffect(() => {
        saveToStorage(LS_CUSTOMERS, customers);
    }, [customers]);

    const addCustomer = useCallback(async (customer: Omit<Customer, 'id' | 'createdAt' | 'totalReservations'>) => {
        const newCust: Customer = {
            ...customer,
            id: generateId(),
            totalReservations: 0,
            createdAt: new Date().toISOString(),
        };
        setCustomers(prev => [newCust, ...prev]);
        return newCust;
    }, []);

    const updateCustomer = useCallback(async (id: string, updates: Partial<Customer>) => {
        setCustomers(prev =>
            prev.map(c => c.id === id ? { ...c, ...updates } : c)
        );
    }, []);

    const deleteCustomer = useCallback(async (id: string) => {
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
        refetch: async () => {},
    };
}
