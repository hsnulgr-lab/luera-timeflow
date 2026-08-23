import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { readCache, writeCache } from '@/lib/swrCache';
import type { StockMovement, StockMovementType } from '@/types';

function mapRow(row: any): StockMovement {
    return {
        id: row.id,
        organizationId: row.organization_id,
        productId: row.product_id,
        type: row.type,
        delta: Number(row.delta),
        note: row.note || undefined,
        reservationId: row.reservation_id || undefined,
        paymentId: row.payment_id || undefined,
        createdAt: row.created_at,
    };
}

/**
 * 074 uygulanmadıysa tablo yok — sayfa boş defterle çalışsın, patlamasın.
 * YALNIZ gerçek "tablo yok" kodları: 42P01 (Postgres) ve PGRST205 (PostgREST
 * şema önbelleğinde bulunamadı). Mesaj içinde tablo adı geçen her hata (RLS
 * ihlali, kısıt hatası) "tablo yok" sanılıyordu — asıl sebep gizleniyordu.
 */
function isMissingTable(error: { code?: string } | null): boolean {
    return error?.code === '42P01' || error?.code === 'PGRST205';
}

export interface MovementInput {
    productId: string;
    type: StockMovementType;
    delta: number;          // giriş +, çıkış −
    note?: string;
    reservationId?: string;
    paymentId?: string;
}

/**
 * Stok defteri (074). Miktar burada tutulmaz — hareketler ham hâliyle döner,
 * türetme src/lib/stock.ts işidir.
 */
export function useStock() {
    const { user, orgId } = useAuth();
    const [movements, setMovements] = useState<StockMovement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAvailable, setIsAvailable] = useState(true);

    const fetchMovements = useCallback(async (resolvedOrgId: string) => {
        const cached = readCache<StockMovement[]>(`stock:${resolvedOrgId}`);
        if (cached) { setMovements(cached); setIsLoading(false); } else setIsLoading(true);
        const { data, error } = await supabase
            .from('stock_movements')
            .select('*')
            .eq('organization_id', resolvedOrgId)
            .order('created_at', { ascending: false })
            .limit(2000);
        if (error) {
            console.error('stock_movements select', error);
            if (isMissingTable(error)) setIsAvailable(false);
        } else {
            const rows = (data || []).map(mapRow);
            setMovements(rows);
            writeCache(`stock:${resolvedOrgId}`, rows);
            setIsAvailable(true);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (user && orgId) fetchMovements(orgId);
    }, [user, orgId, fetchMovements]);

    const addMovement = useCallback(async (input: MovementInput): Promise<StockMovement | null> => {
        if (!orgId) { toast.error('Organizasyon bilgisi alınamadı'); return null; }
        if (!input.delta) return null;
        const { data, error } = await supabase.from('stock_movements').insert({
            organization_id: orgId,
            product_id: input.productId,
            type: input.type,
            delta: input.delta,
            note: input.note || null,
            reservation_id: input.reservationId || null,
            payment_id: input.paymentId || null,
            created_by: user?.id || null,
        }).select().single();
        if (error) {
            console.error('stock_movements insert', error);
            if (isMissingTable(error)) {
                setIsAvailable(false);
                toast.error('Stok defteri okunamıyor — 074 uygulandıysa PostgREST şema önbelleğini yenileyin');
            } else {
                toast.error(`Stok hareketi kaydedilemedi: ${error.message || error.code || 'bilinmeyen hata'}`);
            }
            return null;
        }
        const row = mapRow(data);
        setMovements(prev => [row, ...prev]);
        return row;
    }, [orgId, user]);

    /**
     * Toplu çıkış. Randevuya bağlı `usage` satırları 090'ın kısmi tekil
     * indeksine karşı tek tek uzlaştırılır. Satış/giriş/fire/sayım ise eski
     * atomik toplu insert yolunda kalır; kasa stok grubu yarım yazılmamalıdır.
     */
    const addMovements = useCallback(async (inputs: MovementInput[]): Promise<boolean> => {
        const usable = inputs.filter(i => i.delta);
        if (!orgId) return false;
        if (usable.length === 0) return true;

        const idempotentUsage = usable.filter(i => i.type === 'usage' && i.reservationId);
        const atomic = usable.filter(i => i.type !== 'usage' || !i.reservationId);
        if (idempotentUsage.length > 0 && atomic.length > 0) {
            console.error('stock_movements: usage ve diğer hareketler aynı toplu çağrıda karıştırılamaz');
            return false;
        }

        if (atomic.length > 0) {
            const { data, error } = await supabase.from('stock_movements').insert(
                atomic.map(input => ({
                    organization_id: orgId,
                    product_id: input.productId,
                    type: input.type,
                    delta: input.delta,
                    note: input.note || null,
                    reservation_id: input.reservationId || null,
                    payment_id: input.paymentId || null,
                    created_by: user?.id || null,
                })),
            ).select();
            if (error) {
                if (isMissingTable(error)) setIsAvailable(false);
                else console.error('stock_movements insert', error);
                return false;
            }
            const rows = (data || []).map(mapRow);
            if (rows.length > 0) setMovements(prev => [...rows, ...prev]);
            return true;
        }

        const inserted: StockMovement[] = [];
        for (const input of idempotentUsage) {
            const { data, error } = await supabase.from('stock_movements').insert({
                organization_id: orgId,
                product_id: input.productId,
                type: input.type,
                delta: input.delta,
                note: input.note || null,
                reservation_id: input.reservationId || null,
                payment_id: input.paymentId || null,
                created_by: user?.id || null,
            }).select().single();
            if (!error) {
                inserted.push(mapRow(data));
                continue;
            }

            if (input.type === 'usage' && input.reservationId && error.code === '23505') {
                const { data: existing, error: existingError } = await supabase
                    .from('stock_movements')
                    .select('delta')
                    .eq('organization_id', orgId)
                    .eq('reservation_id', input.reservationId)
                    .eq('product_id', input.productId)
                    .eq('type', 'usage')
                    .maybeSingle();
                if (!existingError && existing && Number(existing.delta) === input.delta) continue;
            }

            if (isMissingTable(error)) setIsAvailable(false);
            else console.error('stock_movements insert', error);
            if (inserted.length > 0) setMovements(prev => [...inserted, ...prev]);
            return false;
        }

        if (inserted.length > 0) setMovements(prev => [...inserted, ...prev]);
        return true;
    }, [orgId, user]);

    const removeMovement = useCallback(async (id: string) => {
        const { error } = await supabase.from('stock_movements').delete().eq('id', id);
        if (error) { toast.error('Hareket silinemedi'); return; }
        setMovements(prev => prev.filter(m => m.id !== id));
    }, []);

    const refetch = useCallback(() => { if (orgId) return fetchMovements(orgId); }, [orgId, fetchMovements]);

    return { movements, isLoading, isAvailable, addMovement, addMovements, removeMovement, refetch };
}
