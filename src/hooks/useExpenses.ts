import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { readCache, writeCache } from '@/lib/swrCache';
import type { Expense, ExpenseCategory, PaymentMethod } from '@/types';

export interface NewExpense {
    category: ExpenseCategory;
    amount: number;
    description?: string;
    method?: PaymentMethod;
    spentOn?: string;
    recurrence?: 'monthly';
    endedOn?: string;
    staffId?: string;
    supplier?: string;
}

// deno-lint-ignore-file
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): Expense {
    return {
        id: row.id,
        organizationId: row.organization_id,
        category: (row.category || 'diger') as ExpenseCategory,
        description: row.description || undefined,
        amount: Number(row.amount),
        method: (row.method || 'cash') as PaymentMethod,
        spentOn: String(row.spent_on).slice(0, 10),
        recurrence: row.recurrence || undefined,
        endedOn: row.ended_on ? String(row.ended_on).slice(0, 10) : undefined,
        staffId: row.staff_id || undefined,
        supplier: row.supplier || undefined,
        createdBy: row.created_by || undefined,
        createdAt: row.created_at,
    };
}

/**
 * Gider defteri (080). Kâr hesabının eksik yarısı.
 *
 * TÜM gider satırları çekilir — tarih aralığına göre filtrelenmez. Sebebi
 * tekrarlı giderler: Ocak'ta girilmiş bir kira satırı Ağustos raporunda da
 * geçerlidir, `spent_on` aralık dışında kalsa bile. Aralık kırpması raporun
 * işidir (src/lib/expenses.ts expandExpenses). Salon ölçeğinde gider satırı
 * sayısı yılda birkaç yüzü geçmez; limit 1000 fazlasıyla yeter.
 */
export function useExpenses(options?: { enabled?: boolean }) {
    const { orgId } = useAuth();
    const enabled = options?.enabled ?? true;
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    /** Migration uygulanmadıysa gider yüzeyleri sessizce gizlenebilsin. */
    const [available, setAvailable] = useState(true);

    const refresh = useCallback(async (primeFromCache = false) => {
        if (!orgId || !enabled) { setExpenses([]); setIsLoading(false); return; }
        // SWR: önbellekteki kayıtları anında göster, ardından ağdan tazele.
        if (primeFromCache) {
            const cached = readCache<Expense[]>(`expenses:${orgId}`);
            if (cached) { setExpenses(cached); setIsLoading(false); }
        }
        const { data, error } = await supabase
            .from('expenses')
            .select('*')
            .eq('organization_id', orgId)
            .order('spent_on', { ascending: false })
            .limit(1000);
        if (error) {
            // 080 uygulanmadıysa tablo yok — hata basmak yerine özelliği kapat.
            const missing = /relation .*expenses.* does not exist|PGRST205/i
                .test(`${error.message || ''} ${error.code || ''}`);
            if (missing) { setAvailable(false); setExpenses([]); setIsLoading(false); return; }
            console.error('Giderler yüklenemedi:', error);
            setIsLoading(false);
            return;
        }
        setAvailable(true);
        const rows = (data || []).map(mapRow);
        setExpenses(rows);
        writeCache(`expenses:${orgId}`, rows);
        setIsLoading(false);
    }, [enabled, orgId]);

    // İlk yükleme + org değişimi. refresh içeride setState çağırır; veri
    // hook'unun asli işi bu (diğer veri hook'larıyla aynı desen).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void refresh(true); }, [refresh]);

    const addExpense = useCallback(async (input: NewExpense): Promise<Expense | null> => {
        if (!orgId) return null;
        const amount = Math.round(Number(input.amount) * 100) / 100;
        if (!(amount > 0)) { toast.error('Tutar sıfırdan büyük olmalı'); return null; }
        const { data, error } = await supabase.from('expenses').insert({
            organization_id: orgId,
            category: input.category,
            description: input.description?.trim() || null,
            amount,
            method: input.method || 'cash',
            spent_on: input.spentOn || new Date().toISOString().slice(0, 10),
            recurrence: input.recurrence || null,
            ended_on: input.endedOn || null,
            staff_id: input.staffId || null,
            supplier: input.supplier?.trim() || null,
        }).select('*').single();
        if (error || !data) { toast.error('Gider kaydedilemedi'); console.error(error); return null; }
        const row = mapRow(data);
        setExpenses((prev) => [row, ...prev]);
        return row;
    }, [orgId]);

    const updateExpense = useCallback(async (id: string, patch: Partial<NewExpense>): Promise<boolean> => {
        if (!orgId) return false;
        const db: Record<string, unknown> = {};
        if (patch.category !== undefined) db.category = patch.category;
        if (patch.description !== undefined) db.description = patch.description?.trim() || null;
        if (patch.amount !== undefined) db.amount = patch.amount;
        if (patch.method !== undefined) db.method = patch.method;
        if (patch.spentOn !== undefined) db.spent_on = patch.spentOn;
        if (patch.recurrence !== undefined) db.recurrence = patch.recurrence || null;
        if (patch.endedOn !== undefined) db.ended_on = patch.endedOn || null;
        if (patch.staffId !== undefined) db.staff_id = patch.staffId || null;
        if (patch.supplier !== undefined) db.supplier = patch.supplier?.trim() || null;
        if (Object.keys(db).length === 0) return true;

        const { error } = await supabase.from('expenses').update(db)
            .eq('id', id).eq('organization_id', orgId);
        if (error) { toast.error('Gider güncellenemedi'); console.error(error); return false; }
        await refresh();
        return true;
    }, [orgId, refresh]);

    /**
     * Tekrarlı gideri SİLMEK yerine bitirmek doğrudur: silinirse geçmiş aylar da
     * kaybolur ve geçen yılın kârı bugün değişir. "Kirayı bıraktık" = bitiş tarihi.
     */
    const endRecurring = useCallback(async (id: string, endedOn: string): Promise<boolean> =>
        updateExpense(id, { endedOn }), [updateExpense]);

    const deleteExpense = useCallback(async (id: string): Promise<boolean> => {
        if (!orgId) return false;
        const { error } = await supabase.from('expenses').delete()
            .eq('id', id).eq('organization_id', orgId);
        if (error) { toast.error('Gider silinemedi'); console.error(error); return false; }
        setExpenses((prev) => prev.filter((e) => e.id !== id));
        return true;
    }, [orgId]);

    return { expenses, isLoading, available, refresh, addExpense, updateExpense, endRecurring, deleteExpense };
}
