import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { readCache, writeCache } from '@/lib/swrCache';
import type { Product } from '@/types';

function mapRow(row: any): Product {
    return {
        id: row.id,
        organizationId: row.organization_id,
        name: row.name,
        price: Number(row.price),
        category: row.category || undefined,
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
        // SWR: önce son bilinen liste, arkada ağdan tazele
        const cached = readCache<Product[]>(`products:${resolvedOrgId}`);
        if (cached) { setProducts(cached); setIsLoading(false); } else setIsLoading(true);
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('organization_id', resolvedOrgId)
            .order('created_at', { ascending: false });
        if (error) console.error(error);
        else {
            const rows = (data || []).map(mapRow);
            setProducts(rows);
            writeCache(`products:${resolvedOrgId}`, rows);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (user && orgId) fetchProducts(orgId);
    }, [user, orgId, fetchProducts]);

    const addProduct = useCallback(async (name: string, price: number, category?: string): Promise<Product | null> => {
        if (!orgId) { toast.error('Organizasyon bilgisi alınamadı'); return null; }
        // category kolonu 043 ile geldi — doluysa gönder, migration yoksa bağsız kaydet (geri düş)
        const base = { organization_id: orgId, name, price, is_active: true };
        let { data, error } = await supabase.from('products').insert(category ? { ...base, category } : base).select().single();
        if (error && category) {
            ({ data, error } = await supabase.from('products').insert(base).select().single());
        }
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
