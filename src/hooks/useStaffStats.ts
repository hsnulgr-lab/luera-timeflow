import { useMemo } from 'react';
import { useReservations } from '@/hooks/useReservations';
import { toISODate } from '@/utils/date';
import type { Reservation } from '@/types';

export interface StaffServiceStat { name: string; count: number; revenue: number }
export interface StaffStats {
    total: number;          // tüm randevular (iptal dahil)
    completed: number;
    cancelled: number;
    upcoming: number;       // bugünden sonraki, iptal/tamamlanmamış
    revenue: number;        // tamamlanan randevuların hizmet cirosu
    estimatedRevenue: number; // iptal hariç tüm randevuların potansiyel cirosu
    completionRate: number; // %
    thisWeek: number;
    thisMonth: number;
    last7: number[];        // son 7 günün randevu adedi (sparkline)
    services: StaffServiceStat[]; // hizmet bazında dağılım (ciroya göre azalan)
    upcomingList: Reservation[];  // yaklaşan randevular (saatli sıralı)
}

// Bir personelin randevularından performans metrikleri üretir.
// staffId yoksa staffName ile de eşleştirir (eski kayıtlar için).
export function useStaffStats(staffId: string | undefined, staffName?: string): StaffStats {
    const { reservations, settings } = useReservations();

    return useMemo(() => {
        const priceOf = (name: string) => settings.services.find((s) => s.name === name)?.price ?? 0;
        const mine = reservations.filter(
            (r) => (staffId && r.staffId === staffId) || (!r.staffId && staffName && r.staffName === staffName)
        );

        const now = new Date();
        const todayStr = toISODate(now);
        const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const active = mine.filter((r) => r.status !== 'cancelled');
        const completed = mine.filter((r) => r.status === 'completed');
        const cancelled = mine.filter((r) => r.status === 'cancelled');

        const revenue = completed.reduce((s, r) => s + priceOf(r.service), 0);
        const estimatedRevenue = active.reduce((s, r) => s + priceOf(r.service), 0);
        const completionRate = active.length > 0 ? Math.round((completed.length / active.length) * 100) : 0;

        // Bu hafta (Pzt) / bu ay
        const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        const mondayStr = toISODate(monday);
        const ym = todayStr.slice(0, 7);
        const thisWeek = active.filter((r) => r.date >= mondayStr && r.date <= todayStr).length;
        const thisMonth = active.filter((r) => r.date.startsWith(ym)).length;

        // Son 7 gün
        const last7 = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(now); d.setDate(now.getDate() - (6 - i));
            const ds = toISODate(d);
            return active.filter((r) => r.date === ds).length;
        });

        // Hizmet dağılımı
        const svcMap = new Map<string, StaffServiceStat>();
        for (const r of active) {
            const e = svcMap.get(r.service) || { name: r.service, count: 0, revenue: 0 };
            e.count += 1; e.revenue += priceOf(r.service);
            svcMap.set(r.service, e);
        }
        const services = [...svcMap.values()].sort((a, b) => b.revenue - a.revenue || b.count - a.count);

        // Yaklaşan
        const upcomingList = active
            .filter((r) => r.status !== 'completed' && (r.date > todayStr || (r.date === todayStr && r.endTime >= nowTime)))
            .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)));

        return {
            total: mine.length,
            completed: completed.length,
            cancelled: cancelled.length,
            upcoming: upcomingList.length,
            revenue,
            estimatedRevenue,
            completionRate,
            thisWeek,
            thisMonth,
            last7,
            services,
            upcomingList,
        };
    }, [reservations, settings.services, staffId, staffName]);
}
