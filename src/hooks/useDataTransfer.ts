import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { downloadCsv, toCsv } from '@/lib/csv';
import {
    exportColumns, exportFileName, existingKeySet,
    type ExportContext, type ExportDataset, type ImportDatasetId, type PreparedRow, type RawRow,
} from '@/lib/dataTransfer';
import { todayISO } from '@/utils/date';

// Veri taşıma — okuma/yazma katmanı (Faz 2.6 / 2.6b). Kurallar saf modülde
// (lib/dataTransfer, lib/csv); burada yalnız Supabase ve dosya işi var.

const PAGE = 1000;   // PostgREST varsayılan tavanı

/**
 * Bir tablonun org'a ait TÜM satırlarını sayfalayarak okur.
 *
 * Sayfalama şart: dışa aktarma "elimdeki her şey" demektir, ekrandaki hook'ların
 * gösterdiği son 90 gün değil. Tek istekle çekmek 1000 satırda sessizce kesilir
 * ve kullanıcı eksik dosyayı tam sanır — dışa aktarmada bu, hatanın en kötü
 * biçimi.
 */
async function fetchAll(table: string, orgId: string, orderBy: string): Promise<RawRow[]> {
    const all: RawRow[] = [];
    for (let page = 0; ; page++) {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq('organization_id', orgId)
            .order(orderBy, { ascending: true })
            .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) throw error;
        const rows = (data || []) as RawRow[];
        all.push(...rows);
        if (rows.length < PAGE) return all;
    }
}

const ORDER_BY: Record<string, string> = {
    customers: 'created_at',
    reservations: 'date',
    payments: 'paid_at',
    treatment_plans: 'created_at',
    products: 'created_at',
};

export interface ImportOutcome {
    inserted: number;
    failed: number;
}

export function useDataTransfer() {
    const { user, orgId } = useAuth();
    const [busy, setBusy] = useState<string | null>(null);

    /** Kimlik→ad sözlükleri; dışa aktarmada uuid yerine isim yazabilmek için. */
    const loadContext = useCallback(async (): Promise<ExportContext> => {
        const empty: ExportContext = { customerName: () => '', staffName: () => '' };
        if (!orgId) return empty;
        const [customers, staff] = await Promise.all([
            supabase.from('customers').select('id, name').eq('organization_id', orgId),
            supabase.from('staff').select('id, name').eq('organization_id', orgId),
        ]);
        const cMap = new Map((customers.data || []).map((r) => [r.id as string, r.name as string]));
        const sMap = new Map((staff.data || []).map((r) => [r.id as string, r.name as string]));
        return {
            customerName: (id) => (id ? cMap.get(String(id)) || '' : ''),
            staffName: (id) => (id ? sMap.get(String(id)) || '' : ''),
        };
    }, [orgId]);

    /**
     * Tek bir veri kümesini indirir. `localRows` tabloda yaşamayan kümeler için
     * (hizmetler ayarların içinde durur).
     */
    const exportDataset = useCallback(async (dataset: ExportDataset, localRows?: RawRow[]): Promise<number> => {
        if (!orgId) { toast.error('Organizasyon bilgisi alınamadı'); return 0; }
        setBusy(dataset.id);
        try {
            const rows = dataset.table
                ? await fetchAll(dataset.table, orgId, ORDER_BY[dataset.table] || 'created_at')
                : (localRows || []);
            const ctx = dataset.table ? await loadContext() : { customerName: () => '', staffName: () => '' };
            const csv = toCsv(rows, exportColumns(dataset.id, ctx));
            downloadCsv(exportFileName(dataset, todayISO()), csv);
            return rows.length;
        } catch (err) {
            console.error('export error:', err);
            toast.error(`${dataset.label} dışa aktarılamadı`);
            return 0;
        } finally {
            setBusy(null);
        }
    }, [orgId, loadContext]);

    /** Mükerrer denetimi için mevcut kayıtların anahtarları. */
    const loadExistingKeys = useCallback(async (dataset: ImportDatasetId, localNames?: string[]): Promise<Set<string>> => {
        if (dataset === 'services') return existingKeySet(localNames || [], 'name');
        if (!orgId) return new Set();
        if (dataset === 'customers') {
            const { data } = await supabase.from('customers').select('phone')
                .eq('organization_id', orgId).eq('is_active', true);
            return existingKeySet((data || []).map((r) => String(r.phone || '')), 'phone');
        }
        const { data } = await supabase.from('products').select('name').eq('organization_id', orgId);
        return existingKeySet((data || []).map((r) => String(r.name || '')), 'name');
    }, [orgId]);

    /**
     * Hazırlanmış satırları yazar. YALNIZ status === 'new' olanlar yazılır;
     * mükerrer ve hatalı satırlar bilinçli olarak atlanır — içe aktarma mevcut
     * kaydın üstüne yazmaz. Salonun elindeki liste eskidir, üründeki kayıt
     * güncel; sessizce geri almak en pahalı hata olurdu.
     */
    const importRows = useCallback(async (dataset: ImportDatasetId, rows: PreparedRow[]): Promise<ImportOutcome> => {
        const fresh = rows.filter((r) => r.status === 'new');
        if (!orgId || fresh.length === 0) return { inserted: 0, failed: 0 };
        setBusy(`import:${dataset}`);
        try {
            const table = dataset === 'customers' ? 'customers' : 'products';
            const payload = fresh.map((r) => (dataset === 'customers'
                ? {
                    user_id: user?.id,
                    organization_id: orgId,
                    name: String(r.values.name),
                    phone: String(r.values.phone),
                    email: r.values.email ? String(r.values.email) : null,
                    notes: r.values.notes ? String(r.values.notes) : '',
                }
                : {
                    organization_id: orgId,
                    name: String(r.values.name),
                    price: Number(r.values.price ?? 0),
                    is_active: true,
                    ...(r.values.category ? { category: String(r.values.category) } : {}),
                    ...(r.values.cost !== undefined ? { cost: Number(r.values.cost) } : {}),
                    ...(r.values.unit ? { unit: String(r.values.unit) } : {}),
                }));

            // Parça parça yaz: tek büyük insert'te bir satırın hatası hepsini
            // geri alır ve kullanıcı 800 müşterisinin neden gelmediğini anlamaz.
            let inserted = 0;
            let failed = 0;
            for (let i = 0; i < payload.length; i += 100) {
                const chunk = payload.slice(i, i + 100);
                const { error } = await supabase.from(table).insert(chunk);
                if (!error) { inserted += chunk.length; continue; }
                // Parça düştü — satır satır dene ki sağlamlar geçsin.
                for (const one of chunk) {
                    const { error: rowErr } = await supabase.from(table).insert(one);
                    if (rowErr) failed++; else inserted++;
                }
            }
            return { inserted, failed };
        } catch (err) {
            console.error('import error:', err);
            toast.error('İçe aktarma tamamlanamadı');
            return { inserted: 0, failed: fresh.length };
        } finally {
            setBusy(null);
        }
    }, [orgId, user?.id]);

    return { busy, exportDataset, loadExistingKeys, importRows };
}
