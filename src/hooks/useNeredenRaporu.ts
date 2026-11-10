import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toISODate } from '@/utils/date';
import { neredenRaporu, type NeredenRaporu, type RaporMusteri, type RaporRandevu } from '@/lib/neredenRapor';

// Analiz › "Müşteriler nereden geliyor?" verisi (135).
//
// Ortak randevu listesi (useReservations) son 90 gün / 500 satırla sınırlı;
// 1 yıllık dönemde sessizce eksik sayardı. Bu kanca kendi tarih aralığıyla ve
// sayfalayarak çeker (useDataTransfer'daki fetchAll deseni). Dönem yerel saatle
// hesaplanır: gece 00–03 arası UTC'ye kayıp bir gün kaçmasın.

const PAGE = 1000;

async function pageAll<T>(
    query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
    const all: T[] = [];
    for (let page = 0; ; page++) {
        const { data, error } = await query(page * PAGE, page * PAGE + PAGE - 1);
        if (error) throw error;
        const rows = (data || []) as T[];
        all.push(...rows);
        if (rows.length < PAGE) return all;
    }
}

interface CustomerRow { id: string; origin: string | null }
interface ReservationRow {
    id: string; customer_id: string | null; group_id: string | null; date: string; start_time: string;
    status: RaporRandevu['status']; arrived_at: string | null; customer_arrived_at: string | null; no_show_at: string | null;
}

export function useNeredenRaporu(days: number) {
    const { orgId } = useAuth();
    // Sonuç hangi (işletme, dönem) için yüklendiyse onunla saklanır; "yükleniyor"
    // ondan türetilir — effect içinde senkron setState yok.
    const key = `${orgId ?? ''}:${days}`;
    const [state, setState] = useState<{ key: string; rapor: NeredenRaporu | null; failed: boolean } | null>(null);

    useEffect(() => {
        if (!orgId) return;
        let alive = true;
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - (days - 1));
        const fromDate = toISODate(start);
        const fromTs = start.toISOString();

        const loadedKey = `${orgId}:${days}`;
        Promise.all([
            pageAll<CustomerRow>((a, b) => supabase
                .from('customers')
                .select('id, origin')
                .eq('organization_id', orgId)
                .eq('is_active', true)
                .gte('created_at', fromTs)
                .order('created_at', { ascending: true })
                .order('id', { ascending: true })
                .range(a, b)),
            // Üst sınır yok: yeni müşterinin ileri tarihli randevusu da "randevu" sayılır.
            pageAll<ReservationRow>((a, b) => supabase
                .from('reservations')
                .select('id, customer_id, group_id, date, start_time, status, arrived_at, customer_arrived_at, no_show_at')
                .eq('organization_id', orgId)
                .gte('date', fromDate)
                .order('date', { ascending: true })
                .order('id', { ascending: true })
                .range(a, b)),
        ]).then(([customers, reservations]) => {
            if (!alive) return;
            const musteriler: RaporMusteri[] = customers.map((c) => ({ id: c.id, origin: c.origin }));
            const randevular: RaporRandevu[] = reservations.map((r) => ({
                id: r.id,
                customerId: r.customer_id,
                groupId: r.group_id,
                date: r.date,
                startTime: (r.start_time || '').slice(0, 5),
                status: r.status,
                arrivedAt: r.arrived_at,
                customerArrivedAt: r.customer_arrived_at,
                noShowAt: r.no_show_at,
            }));
            setState({ key: loadedKey, rapor: neredenRaporu(musteriler, randevular), failed: false });
        }).catch((err) => {
            if (!alive) return;
            console.error('Nereden raporu yüklenemedi:', err);
            setState({ key: loadedKey, rapor: null, failed: true });
        });
        return () => { alive = false; };
    }, [orgId, days]);

    const fresh = state?.key === key;
    return {
        // Dönem değişirken eski tablo kalır (titremesin); işletme değişince asla.
        rapor: state && state.key.startsWith(`${orgId ?? ''}:`) ? state.rapor : null,
        loading: !fresh,
        failed: fresh && !!state?.failed,
    };
}
