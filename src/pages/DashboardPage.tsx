import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Users, CheckCircle2, AlertCircle, Plus, ArrowRight, TrendingUp, XCircle, BarChart3 } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { cn } from '@/utils/cn';

const statusConfig = {
    pending:   { label: 'Bekleyen',    color: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500' },
    confirmed: { label: 'Onaylı',      color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
    cancelled: { label: 'İptal',       color: 'bg-red-100 text-red-700',       dot: 'bg-red-500' },
    completed: { label: 'Tamamlandı',  color: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500' },
};

export const DashboardPage = () => {
    const navigate = useNavigate();
    const { reservations, settings, getStats, getTodayReservations, getUpcomingReservations } = useReservations();
    const stats            = getStats();
    const todayReservations    = getTodayReservations();
    const upcomingReservations = getUpcomingReservations(5);

    const now      = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Bu hafta
    const weekStats = useMemo(() => {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay() + 1);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        const weekRes = reservations.filter(r => r.date >= startOfWeek.toISOString().split('T')[0]
            && r.date <= endOfWeek.toISOString().split('T')[0]);
        const completed = weekRes.filter(r => r.status === 'completed').length;
        const noShow    = weekRes.filter(r => r.status === 'cancelled').length;
        const total     = weekRes.filter(r => r.status !== 'cancelled').length;
        const rate      = total > 0 ? Math.round((completed / total) * 100) : 0;

        return { total: weekRes.length, completed, noShow, rate };
    }, [reservations, now]);

    // Bugünün doluluk yüzdesi (çalışma saatlerine göre)
    const todayFill = useMemo(() => {
        const workHour = settings.workingHours?.find(h => h.day === now.getDay());
        if (!workHour || workHour.isOff) return null;
        const totalSlots = Math.round(
            ((parseInt(workHour.end) - parseInt(workHour.start)) * 60) / settings.slotDuration
        );
        const used = todayReservations.filter(r => r.status !== 'cancelled').length;
        return { used, total: totalSlots, pct: totalSlots > 0 ? Math.round((used / totalSlots) * 100) : 0 };
    }, [todayReservations, settings, now]);

    const todayFormatted = now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 p-6">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* ── Header Bar ─────────────────────────────────────────────── */}
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                {todayFormatted}
                            </span>
                            {todayFill && (
                                <span className={cn(
                                    "text-[11px] font-bold px-2 py-0.5 rounded-full",
                                    todayFill.pct >= 80 ? "bg-emerald-100 text-emerald-700" :
                                    todayFill.pct >= 40 ? "bg-amber-100 text-amber-700" :
                                    "bg-gray-100 text-gray-500"
                                )}>
                                    %{todayFill.pct} dolu
                                </span>
                            )}
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 mt-0.5">
                            {settings.businessName}
                        </h1>
                    </div>
                    <button
                        onClick={() => navigate('/calendar')}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-[#CCFF00] text-slate-900 hover:bg-[#d4ff33] transition-all hover:shadow-lg hover:shadow-[#CCFF00]/20 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Plus className="w-4 h-4" />
                        Yeni Randevu
                    </button>
                </div>

                {/* ── KPI Kartları ───────────────────────────────────────────── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Bugün */}
                    <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-200/60 p-5 shadow-sm hover:shadow-md transition-all group cursor-pointer"
                        onClick={() => navigate('/calendar')}>
                        <div className="absolute top-2 right-2 w-12 h-12 bg-[#CCFF00]/5 rounded-full blur-2xl group-hover:bg-[#CCFF00]/10 transition-all" />
                        <div className="flex items-center gap-2 mb-3">
                            <div className="p-2 rounded-xl bg-[#CCFF00]/10">
                                <Calendar className="w-4 h-4 text-slate-900" />
                            </div>
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Bugün</p>
                        </div>
                        <p className="text-3xl font-bold text-gray-900">{stats.today}</p>
                        <p className="text-[11px] text-gray-400 mt-1">
                            {todayFill ? `${todayFill.used}/${todayFill.total} slot` : 'randevu'}
                        </p>
                    </div>

                    {/* Bu Hafta */}
                    <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-200/60 p-5 shadow-sm hover:shadow-md transition-all group">
                        <div className="absolute top-2 right-2 w-12 h-12 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-all" />
                        <div className="flex items-center gap-2 mb-3">
                            <div className="p-2 rounded-xl bg-purple-50">
                                <BarChart3 className="w-4 h-4 text-purple-500" />
                            </div>
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Bu Hafta</p>
                        </div>
                        <p className="text-3xl font-bold text-gray-900">{weekStats.total}</p>
                        <p className="text-[11px] text-gray-400 mt-1">%{weekStats.rate} tamamlandı</p>
                    </div>

                    {/* Bekleyen */}
                    <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-200/60 p-5 shadow-sm hover:shadow-md transition-all group cursor-pointer"
                        onClick={() => navigate('/reservations')}>
                        <div className="absolute top-2 right-2 w-12 h-12 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all" />
                        <div className="flex items-center gap-2 mb-3">
                            <div className="p-2 rounded-xl bg-amber-50">
                                <AlertCircle className="w-4 h-4 text-amber-500" />
                            </div>
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Bekleyen</p>
                        </div>
                        <p className="text-3xl font-bold text-gray-900">{stats.pending}</p>
                        <p className="text-[11px] text-gray-400 mt-1">onay bekliyor</p>
                    </div>

                    {/* Toplam */}
                    <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-200/60 p-5 shadow-sm hover:shadow-md transition-all group">
                        <div className="absolute top-2 right-2 w-12 h-12 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-all" />
                        <div className="flex items-center gap-2 mb-3">
                            <div className="p-2 rounded-xl bg-blue-50">
                                <TrendingUp className="w-4 h-4 text-blue-500" />
                            </div>
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Toplam</p>
                        </div>
                        <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
                        <p className="text-[11px] text-gray-400 mt-1">{stats.completed} tamamlandı</p>
                    </div>
                </div>

                {/* ── Ana İçerik ─────────────────────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

                    {/* Bugünün Programı */}
                    <div className="lg:col-span-3 relative overflow-hidden rounded-2xl bg-white border border-gray-200/60 shadow-sm">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center">
                                    <Clock className="w-4 h-4 text-[#CCFF00]" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-gray-900">Bugünün Programı</h2>
                                    <p className="text-[11px] text-gray-400">{todayReservations.length} randevu</p>
                                </div>
                            </div>
                            <button onClick={() => navigate('/calendar')}
                                className="text-xs font-medium text-gray-400 hover:text-gray-900 transition-colors flex items-center gap-1">
                                Tümünü Gör <ArrowRight className="w-3 h-3" />
                            </button>
                        </div>

                        <div className="p-5">
                            {todayReservations.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10">
                                    <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200/60 flex items-center justify-center mb-3">
                                        <Calendar className="w-6 h-6 text-slate-300" />
                                    </div>
                                    <p className="text-sm font-semibold text-gray-700 mb-1">Bugün randevu yok</p>
                                    <button onClick={() => navigate('/calendar')}
                                        className="mt-2 text-xs font-semibold text-[#7a9900] hover:underline">
                                        + Randevu oluştur
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {todayReservations.map((res) => {
                                        const s = statusConfig[res.status];
                                        const isPast = res.endTime < `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
                                        return (
                                            <div key={res.id}
                                                onClick={() => navigate('/reservations')}
                                                className={cn(
                                                    "flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer group",
                                                    isPast
                                                        ? "border-gray-100 bg-gray-50/50 opacity-60"
                                                        : "border-gray-100 hover:border-[#CCFF00]/30 hover:shadow-sm"
                                                )}
                                            >
                                                <div className="text-center min-w-[52px]">
                                                    <p className="text-sm font-bold text-gray-900">{res.startTime}</p>
                                                    <p className="text-[10px] text-gray-400">{res.endTime}</p>
                                                </div>
                                                <div className="w-1 h-10 rounded-full flex-shrink-0"
                                                    style={{ backgroundColor: res.serviceColor || '#CCFF00' }} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-gray-900 truncate">{res.customerName}</p>
                                                    <p className="text-xs text-gray-400">{res.service}</p>
                                                </div>
                                                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0", s.color)}>
                                                    {s.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sağ Panel */}
                    <div className="lg:col-span-2 flex flex-col gap-4">

                        {/* Yaklaşan Randevular */}
                        <div className="flex-1 relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/50 shadow-2xl">
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#CCFF00]/60 to-transparent" />
                            <div className="absolute top-4 right-4 w-20 h-20 bg-[#CCFF00]/10 rounded-full blur-3xl" />

                            <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-[#CCFF00] flex items-center justify-center">
                                    <Users className="w-4 h-4 text-slate-900" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-white">Yaklaşan</h2>
                                    <p className="text-[10px] text-slate-400">{upcomingReservations.length} randevu</p>
                                </div>
                            </div>

                            <div className="p-4 space-y-2">
                                {upcomingReservations.length === 0 ? (
                                    <div className="text-center py-6">
                                        <p className="text-sm text-slate-500">Yaklaşan randevu yok</p>
                                    </div>
                                ) : (
                                    upcomingReservations.map((res) => (
                                        <div key={res.id}
                                            onClick={() => navigate('/reservations')}
                                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all cursor-pointer">
                                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: res.serviceColor || '#CCFF00' }} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-semibold text-white truncate">{res.customerName}</p>
                                                <p className="text-[10px] text-slate-400">{res.date} · {res.service}</p>
                                            </div>
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#CCFF00] text-slate-900 flex-shrink-0">
                                                {res.startTime}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="px-4 pb-4">
                                <button onClick={() => navigate('/reservations')}
                                    className="w-full py-2 rounded-xl text-xs font-bold text-slate-400 border border-white/10 hover:bg-white/5 hover:text-white transition-all">
                                    Tüm Rezervasyonları Gör →
                                </button>
                            </div>
                        </div>

                        {/* Haftalık Özet */}
                        <div className="rounded-2xl bg-white border border-gray-200/60 shadow-sm p-4">
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Haftalık Özet</p>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="text-center p-2 rounded-xl bg-emerald-50">
                                    <p className="text-lg font-bold text-emerald-700">{weekStats.completed}</p>
                                    <p className="text-[10px] text-emerald-600 font-medium">Tamamlandı</p>
                                </div>
                                <div className="text-center p-2 rounded-xl bg-red-50">
                                    <p className="text-lg font-bold text-red-600">{weekStats.noShow}</p>
                                    <p className="text-[10px] text-red-500 font-medium">İptal</p>
                                </div>
                                <div className="text-center p-2 rounded-xl bg-[#CCFF00]/10">
                                    <p className="text-lg font-bold text-[#5c7300]">%{weekStats.rate}</p>
                                    <p className="text-[10px] text-[#7a9900] font-medium">Oran</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
