import { useMemo } from 'react';
import { BarChart3, TrendingUp, Users, Calendar, Clock, ArrowUpRight, ArrowDownRight, Minus, PieChart } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { cn } from '@/utils/cn';

const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const DAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export const AnalyticsPage = () => {
    const { reservations, settings } = useReservations();

    const analytics = useMemo(() => {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const lastMonth = now.getMonth() === 0
            ? `${now.getFullYear() - 1}-12`
            : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

        // This month vs last month
        const thisMonthRes = reservations.filter(r => r.date.startsWith(thisMonth));
        const lastMonthRes = reservations.filter(r => r.date.startsWith(lastMonth));

        // Status counts
        const confirmed = reservations.filter(r => r.status === 'confirmed').length;
        const completed = reservations.filter(r => r.status === 'completed').length;
        const cancelled = reservations.filter(r => r.status === 'cancelled').length;
        const pending = reservations.filter(r => r.status === 'pending').length;

        // Service distribution
        const serviceMap = new Map<string, { count: number; color: string }>();
        reservations.forEach(r => {
            const existing = serviceMap.get(r.service) || { count: 0, color: r.serviceColor || '#CCFF00' };
            serviceMap.set(r.service, { count: existing.count + 1, color: existing.color });
        });
        const serviceDistribution = Array.from(serviceMap.entries())
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.count - a.count);

        // Daily distribution (last 7 days)
        const last7Days: { date: string; label: string; count: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const dayIndex = (d.getDay() + 6) % 7;
            last7Days.push({
                date: dateStr,
                label: DAYS_TR[dayIndex],
                count: reservations.filter(r => r.date === dateStr && r.status !== 'cancelled').length,
            });
        }

        // Monthly trend (last 6 months)
        const monthlyTrend: { month: string; label: string; count: number }[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyTrend.push({
                month: monthStr,
                label: MONTHS_TR[d.getMonth()],
                count: reservations.filter(r => r.date.startsWith(monthStr) && r.status !== 'cancelled').length,
            });
        }

        // Hour distribution
        const hourDist = Array.from({ length: 12 }, (_, i) => {
            const hour = i + 8;
            return {
                hour: `${String(hour).padStart(2, '0')}:00`,
                count: reservations.filter(r => parseInt(r.startTime.split(':')[0]) === hour && r.status !== 'cancelled').length,
            };
        });

        // Day of week distribution
        const dowDist = DAYS_TR.map((name, i) => {
            const count = reservations.filter(r => {
                const d = new Date(r.date);
                return (d.getDay() + 6) % 7 === i && r.status !== 'cancelled';
            }).length;
            return { name, count };
        });

        // Completion rate
        const totalNonCancelled = reservations.filter(r => r.status !== 'cancelled').length;
        const completionRate = totalNonCancelled > 0 ? Math.round((completed / totalNonCancelled) * 100) : 0;
        const cancellationRate = reservations.length > 0 ? Math.round((cancelled / reservations.length) * 100) : 0;

        // Growth
        const growth = lastMonthRes.length > 0
            ? Math.round(((thisMonthRes.length - lastMonthRes.length) / lastMonthRes.length) * 100)
            : thisMonthRes.length > 0 ? 100 : 0;

        // Unique customers
        const uniqueCustomers = new Set(reservations.map(r => r.customerPhone)).size;

        // Today's stats
        const todayRes = reservations.filter(r => r.date === today);
        const todayCompleted = todayRes.filter(r => r.status === 'completed').length;
        const todayPending = todayRes.filter(r => r.status === 'pending').length;

        // Busiest day
        const dayCountMap = new Map<string, number>();
        reservations.filter(r => r.status !== 'cancelled').forEach(r => {
            dayCountMap.set(r.date, (dayCountMap.get(r.date) || 0) + 1);
        });
        let busiestDay = '-';
        let busiestCount = 0;
        dayCountMap.forEach((count, date) => {
            if (count > busiestCount) {
                busiestCount = count;
                busiestDay = new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
            }
        });

        return {
            total: reservations.length,
            thisMonth: thisMonthRes.length,
            lastMonth: lastMonthRes.length,
            growth,
            confirmed,
            completed,
            cancelled,
            pending,
            completionRate,
            cancellationRate,
            serviceDistribution,
            last7Days,
            monthlyTrend,
            hourDist,
            dowDist,
            uniqueCustomers,
            todayRes: todayRes.length,
            todayCompleted,
            todayPending,
            busiestDay,
            busiestCount,
        };
    }, [reservations]);

    const maxLast7 = Math.max(...analytics.last7Days.map(d => d.count), 1);
    const maxMonthly = Math.max(...analytics.monthlyTrend.map(d => d.count), 1);
    const maxHour = Math.max(...analytics.hourDist.map(d => d.count), 1);
    const maxDow = Math.max(...analytics.dowDist.map(d => d.count), 1);
    const totalServices = analytics.serviceDistribution.reduce((s, d) => s + d.count, 0) || 1;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
                            <BarChart3 className="w-5 h-5 text-[#CCFF00]" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Analiz & Raporlar</h1>
                            <p className="text-sm text-gray-400">Performansınızı takip edin</p>
                        </div>
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {/* Total Reservations */}
                    <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-200/60 p-5 shadow-sm hover:shadow-md transition-all group">
                        <div className="absolute top-2 right-2 w-16 h-16 bg-[#CCFF00]/5 rounded-full blur-2xl group-hover:bg-[#CCFF00]/10 transition-all" />
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-2.5 rounded-xl bg-[#CCFF00]/10">
                                <Calendar className="w-5 h-5 text-slate-900" />
                            </div>
                            <div className={cn(
                                "flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg",
                                analytics.growth > 0 ? "bg-emerald-50 text-emerald-600" :
                                analytics.growth < 0 ? "bg-red-50 text-red-600" :
                                "bg-gray-50 text-gray-500"
                            )}>
                                {analytics.growth > 0 ? <ArrowUpRight className="w-3 h-3" /> :
                                 analytics.growth < 0 ? <ArrowDownRight className="w-3 h-3" /> :
                                 <Minus className="w-3 h-3" />}
                                {Math.abs(analytics.growth)}%
                            </div>
                        </div>
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Toplam Randevu</p>
                        <p className="text-3xl font-bold text-gray-900 tabular-nums">{analytics.total}</p>
                        <p className="text-[11px] text-gray-400 mt-1">Bu ay: {analytics.thisMonth} · Geçen ay: {analytics.lastMonth}</p>
                    </div>

                    {/* Unique Customers */}
                    <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-200/60 p-5 shadow-sm hover:shadow-md transition-all group">
                        <div className="absolute top-2 right-2 w-16 h-16 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-all" />
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-2.5 rounded-xl bg-blue-50">
                                <Users className="w-5 h-5 text-blue-600" />
                            </div>
                        </div>
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Tekil Müşteri</p>
                        <p className="text-3xl font-bold text-gray-900 tabular-nums">{analytics.uniqueCustomers}</p>
                        <p className="text-[11px] text-gray-400 mt-1">Farklı müşteri sayısı</p>
                    </div>

                    {/* Completion Rate */}
                    <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-200/60 p-5 shadow-sm hover:shadow-md transition-all group">
                        <div className="absolute top-2 right-2 w-16 h-16 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all" />
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-2.5 rounded-xl bg-emerald-50">
                                <TrendingUp className="w-5 h-5 text-emerald-600" />
                            </div>
                        </div>
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Tamamlanma Oranı</p>
                        <p className="text-3xl font-bold text-gray-900 tabular-nums">%{analytics.completionRate}</p>
                        <div className="mt-2 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${analytics.completionRate}%` }} />
                        </div>
                    </div>

                    {/* Cancellation Rate */}
                    <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-200/60 p-5 shadow-sm hover:shadow-md transition-all group">
                        <div className="absolute top-2 right-2 w-16 h-16 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-all" />
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-2.5 rounded-xl bg-red-50">
                                <Clock className="w-5 h-5 text-red-500" />
                            </div>
                        </div>
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">İptal Oranı</p>
                        <p className="text-3xl font-bold text-gray-900 tabular-nums">%{analytics.cancellationRate}</p>
                        <div className="mt-2 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${analytics.cancellationRate}%` }} />
                        </div>
                    </div>
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    {/* Last 7 Days Bar Chart */}
                    <div className="lg:col-span-2 rounded-2xl bg-white border border-gray-200/60 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-base font-bold text-gray-900">Son 7 Gün</h3>
                                <p className="text-xs text-gray-400">Günlük randevu dağılımı</p>
                            </div>
                        </div>
                        <div className="flex items-end gap-3 h-48">
                            {analytics.last7Days.map((day, i) => (
                                <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                                    <span className="text-xs font-bold text-gray-900 tabular-nums">{day.count}</span>
                                    <div className="w-full relative rounded-t-lg overflow-hidden bg-gray-100"
                                        style={{ height: '100%' }}>
                                        <div
                                            className={cn(
                                                "absolute bottom-0 w-full rounded-t-lg transition-all duration-500",
                                                i === 6 ? "bg-[#CCFF00]" : "bg-[#CCFF00]/40"
                                            )}
                                            style={{ height: `${Math.max((day.count / maxLast7) * 100, 4)}%` }}
                                        />
                                    </div>
                                    <span className={cn(
                                        "text-[11px] font-semibold",
                                        i === 6 ? "text-gray-900" : "text-gray-400"
                                    )}>{day.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Service Distribution */}
                    <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/50 shadow-2xl p-6 relative overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#CCFF00]/60 to-transparent" />
                        <div className="absolute top-4 right-4 w-20 h-20 bg-[#CCFF00]/10 rounded-full blur-3xl" />

                        <div className="flex items-center gap-2 mb-6">
                            <PieChart className="w-4 h-4 text-[#CCFF00]" />
                            <h3 className="text-base font-bold text-white">Hizmet Dağılımı</h3>
                        </div>

                        {analytics.serviceDistribution.length === 0 ? (
                            <div className="text-center py-8">
                                <PieChart className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                                <p className="text-sm text-slate-500">Henüz veri yok</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {analytics.serviceDistribution.map((svc) => {
                                    const pct = Math.round((svc.count / totalServices) * 100);
                                    return (
                                        <div key={svc.name}>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: svc.color }} />
                                                    <span className="text-sm font-medium text-slate-300 truncate max-w-[120px]">{svc.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-white tabular-nums">{svc.count}</span>
                                                    <span className="text-[10px] text-slate-500">%{pct}</span>
                                                </div>
                                            </div>
                                            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-500"
                                                    style={{ width: `${pct}%`, backgroundColor: svc.color }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Bottom Row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    {/* Monthly Trend */}
                    <div className="rounded-2xl bg-white border border-gray-200/60 shadow-sm p-6">
                        <h3 className="text-base font-bold text-gray-900 mb-1">Aylık Trend</h3>
                        <p className="text-xs text-gray-400 mb-6">Son 6 ay</p>
                        <div className="flex items-end gap-2 h-36">
                            {analytics.monthlyTrend.map((m) => (
                                <div key={m.month} className="flex-1 flex flex-col items-center gap-2">
                                    <span className="text-[10px] font-bold text-gray-600 tabular-nums">{m.count}</span>
                                    <div className="w-full relative rounded-t-lg overflow-hidden bg-gray-100" style={{ height: '100%' }}>
                                        <div
                                            className="absolute bottom-0 w-full rounded-t-lg bg-gradient-to-t from-[#CCFF00] to-[#CCFF00]/60 transition-all duration-500"
                                            style={{ height: `${Math.max((m.count / maxMonthly) * 100, 4)}%` }}
                                        />
                                    </div>
                                    <span className="text-[10px] font-semibold text-gray-400">{m.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Hour Distribution */}
                    <div className="rounded-2xl bg-white border border-gray-200/60 shadow-sm p-6">
                        <h3 className="text-base font-bold text-gray-900 mb-1">Saat Dağılımı</h3>
                        <p className="text-xs text-gray-400 mb-6">En yoğun saatler</p>
                        <div className="flex items-end gap-1 h-36">
                            {analytics.hourDist.map((h) => (
                                <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                                    <div className="w-full relative rounded-t overflow-hidden bg-gray-100" style={{ height: '100%' }}>
                                        <div
                                            className="absolute bottom-0 w-full rounded-t bg-violet-400/70 transition-all duration-500"
                                            style={{ height: `${Math.max((h.count / maxHour) * 100, 4)}%` }}
                                        />
                                    </div>
                                    <span className="text-[8px] font-semibold text-gray-400 tabular-nums">{h.hour.split(':')[0]}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Day of Week + Quick Stats */}
                    <div className="rounded-2xl bg-white border border-gray-200/60 shadow-sm p-6">
                        <h3 className="text-base font-bold text-gray-900 mb-1">Gün Dağılımı</h3>
                        <p className="text-xs text-gray-400 mb-6">Haftalık yoğunluk</p>
                        <div className="space-y-2.5">
                            {analytics.dowDist.map((d) => {
                                const pct = maxDow > 0 ? Math.round((d.count / maxDow) * 100) : 0;
                                return (
                                    <div key={d.name} className="flex items-center gap-3">
                                        <span className="text-xs font-bold text-gray-500 w-8">{d.name}</span>
                                        <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-[#CCFF00] transition-all duration-500"
                                                style={{ width: `${Math.max(pct, 2)}%` }}
                                            />
                                        </div>
                                        <span className="text-xs font-bold text-gray-700 tabular-nums w-6 text-right">{d.count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Status Overview */}
                <div className="rounded-2xl bg-white border border-gray-200/60 shadow-sm p-6">
                    <h3 className="text-base font-bold text-gray-900 mb-4">Durum Özeti</h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { label: 'Bekleyen', count: analytics.pending, color: 'bg-amber-500', bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
                            { label: 'Onaylı', count: analytics.confirmed, color: 'bg-emerald-500', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700' },
                            { label: 'Tamamlandı', count: analytics.completed, color: 'bg-blue-500', bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
                            { label: 'İptal', count: analytics.cancelled, color: 'bg-red-500', bgColor: 'bg-red-50', textColor: 'text-red-700' },
                        ].map((s) => (
                            <div key={s.label} className={cn("flex items-center gap-3 p-4 rounded-xl border border-gray-100", s.bgColor)}>
                                <div className={cn("w-3 h-3 rounded-full", s.color)} />
                                <div>
                                    <p className={cn("text-xl font-bold tabular-nums", s.textColor)}>{s.count}</p>
                                    <p className="text-[11px] text-gray-500 font-medium">{s.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
