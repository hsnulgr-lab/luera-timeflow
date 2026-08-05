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
        // 074 — migration yoksa kolonlar gelmez; varsayılan davranış korunur
        kind: row.kind || 'retail',
        unit: row.unit || 'adet',
        cost: row.cost === undefined || row.cost === null ? 0 : Number(row.cost),
        threshold: row.threshold === undefined || row.threshold === null ? 0 : Number(row.threshold),
        parLevel: row.par_level === undefined || row.par_level === null ? 0 : Number(row.par_level),
        tracksStock: row.tracks_stock === undefined || row.tracks_stock === null ? true : row.tracks_stock,
    };
}

// 074 depo alanları — kolon yoksa (PGRST204/42703) bu alanlar düşürülüp yeniden denenir
const STOCK_COLUMNS: Record<string, string> = {
    kind: 'kind', unit: 'unit', cost: 'cost',
    threshold: 'threshold', parLevel: 'par_level', tracksStock: 'tracks_stock',
};

type StockFields = Partial<Pick<Product, 'kind' | 'unit' | 'cost' | 'threshold' | 'parLevel' | 'tracksStock'>>;

function stockPayload(fields: StockFields): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(STOCK_COLUMNS)) {
        const value = (fields as Record<string, unknown>)[key];
        if (value !== undefined) out[column] = value;
    }
    return out;
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

    const addProduct = useCallback(async (name: string, price: number, category?: string, stock?: StockFields): Promise<Product | null> => {
        if (!orgId) { toast.error('Organizasyon bilgisi alınamadı'); return null; }
        // category kolonu 043, depo alanları 074 ile geldi — doluysa gönder,
        // migration yoksa o alanlar olmadan yeniden dene (geri düş)
        const base = { organization_id: orgId, name, price, is_active: true };
        const rich = { ...base, ...(category ? { category } : {}), ...stockPayload(stock || {}) };
        let { data, error } = await supabase.from('products').insert(rich).select().single();
        if (error && Object.keys(rich).length > Object.keys(base).length) {
            ({ data, error } = await supabase.from('products').insert(base).select().single());
        }
        if (error) { toast.error('Ürün eklenemedi'); console.error(error); return null; }
        const row = mapRow(data);
        setProducts(prev => [row, ...prev]);
        return row;
    }, [orgId]);

    const updateProduct = useCallback(async (id: string, updates: Partial<Pick<Product, 'name' | 'price' | 'category' | 'isActive'>> & StockFields) => {
        const payload: Record<string, unknown> = {};
        if (updates.name !== undefined) payload.name = updates.name;
        if (updates.price !== undefined) payload.price = updates.price;
        if (updates.isActive !== undefined) payload.is_active = updates.isActive;
        // category 043, depo alanları 074 ile geldi — yoksa o alanlar olmadan yeniden dene
        const extra = { ...(updates.category !== undefined ? { category: updates.category } : {}), ...stockPayload(updates) };
        let { error } = await supabase.from('products')
            .update({ ...payload, ...extra })
            .eq('id', id);
        if (error && Object.keys(extra).length > 0) {
            ({ error } = await supabase.from('products').update(payload).eq('id', id));
        }
        if (error) { toast.error('Ürün güncellenemedi'); console.error(error); return false; }
        setProducts(prev => prev.map(p => (p.id === id ? { ...p, ...updates } : p)));
        return true;
    }, []);

    const removeProduct = useCallback(async (id: string) => {
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) { toast.error('Ürün silinemedi'); return; }
        setProducts(prev => prev.filter(p => p.id !== id));
    }, []);

    const refetch = useCallback(() => { if (orgId) return fetchProducts(orgId); }, [orgId, fetchProducts]);

    return { products, isLoading, addProduct, updateProduct, removeProduct, refetch };
}
