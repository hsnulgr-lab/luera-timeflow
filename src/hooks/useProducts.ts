import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Product } from '@/types';

function mapRow(row: any): Product {
    return {
        id: row.id,
        organizationId: row.organization_id,
        name: row.name,
        price: Number(row.price),
        isActive: row.is_active,
        createdAt: row.created_at,
    };
}

/**
 * Basit ürün kataloğu (F3.3 — ürün satışı). Kasa'dan ürün seçilip
 * tahsilat (payment, type='product') oluşturulur.
 */
export function useProducts() {
    const { user, orgId } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchProducts = useCallback(async (resolvedOrgId: string) => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('organization_id', resolvedOrgId)
            .order('created_at', { ascending: false });
        if (error) console.error(error);
        else setProducts((data || []).map(mapRow));
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (user && orgId) fetchProducts(orgId);
    }, [user, orgId, fetchProducts]);

    const addProduct = useCallback(async (name: string, price: number): Promise<Product | null> => {
        if (!orgId) { toast.error('Organizasyon bilgisi alınamadı'); return null; }
        const { data, error } = await supabase
            .from('products')
            .insert({ organization_id: orgId, name, price, is_active: true })
            .select().single();
        if (error) { toast.error('Ürün eklenemedi'); console.error(error); return null; }
        const row = mapRow(data);
        setProducts(prev => [row, ...prev]);
        return row;
    }, [orgId]);

    const removeProduct = useCallback(async (id: string) => {
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) { toast.error('Ürün silinemedi'); return; }
        setProducts(prev => prev.filter(p => p.id !== id));
    }, []);

    const refetch = useCallback(() => { if (orgId) return fetchProducts(orgId); }, [orgId, fetchProducts]);

    return { products, isLoading, addProduct, removeProduct, refetch };
}
