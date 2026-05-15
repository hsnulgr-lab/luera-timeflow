import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Users, CheckCircle2, XCircle, AlertCircle, Plus, ArrowRight, TrendingUp } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { cn } from '@/utils/cn';

const statusConfig = {
    pending: { label: 'Bekleyen', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
    confirmed: { label: 'Onaylı', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
    cancelled: { label: 'İptal', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
    completed: { label: 'Tamamlandı', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
};

export const DashboardPage = () => {
    const navigate = useNavigate();
    const { getStats, getTodayReservations, getUpcomingReservations } = useReservations();
    const stats = getStats();
    const todayReservations = getTodayReservations();
    const upcomingReservations = getUpcomingReservations(5);

    const now = new Date();
    const greeting = useMemo(() => {
        const hour = now.getHours();
        if (hour < 12) return 'Günaydın';
        if (hour < 18) return 'İyi günler';
        return 'İyi akşamlar';
    }, []);

    const todayFormatted = now.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">{greeting} 👋</h1>
                            <p className="text-sm text-gray-400 mt-1 capitalize">{todayFormatted}</p>
                        </div>
                        <button
                            onClick={() => navigate('/calendar')}
                            className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm bg-[#CCFF00] text-slate-900 hover:bg-[#d4ff33] transition-all hover:shadow-lg hover:shadow-[#CCFF00]/20 hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <Plus className="w-4 h-4" />
                            Yeni Randevu
                        </button>
                    </div>
                </div>

                {/* Stat Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {[
                        { label: 'Bugün', value: stats.today, icon: Calendar, iconBg: 'bg-[#CCFF00]/10', iconColor: 'text-slate-900' },
                        { label: 'Bekleyen', value: stats.pending, icon: AlertCircle, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
                        { label: 'Onaylı', value: stats.confirmed, icon: CheckCircle2, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-500' },
                        { label: 'Toplam', value: stats.total, icon: TrendingUp, iconBg: 'bg-blue-50', iconColor: 'text-blue-500' },
                    ].map((stat) => (
                        <div key={stat.label} className="relative overflow-hidden rounded-2xl bg-white border border-gray-200/60 p-5 shadow-sm hover:shadow-md transition-all group">
                            <div className="absolute top-2 right-2 w-12 h-12 bg-[#CCFF00]/5 rounded-full blur-2xl group-hover:bg-[#CCFF00]/10 transition-all" />
                            <div className="flex items-center gap-3">
                                <div className={cn("p-2.5 rounded-xl", stat.iconBg)}>
                                    <stat.icon className={cn("w-5 h-5", stat.iconColor)} />
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{stat.label}</p>
                                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    {/* Today's Schedule - 3 cols */}
                    <div className="lg:col-span-3 relative overflow-hidden rounded-2xl bg-white border border-gray-200/60 shadow-sm">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#CCFF00]/5 rounded-full blur-3xl" />

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
                            <button onClick={() => navigate('/calendar')} className="text-xs font-medium text-gray-400 hover:text-gray-900 transition-colors flex items-center gap-1">
                                Tümünü Gör <ArrowRight className="w-3 h-3" />
                            </button>
                        </div>

                        <div className="p-5">
                            {todayReservations.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200/60 flex items-center justify-center mb-4">
                                        <Calendar className="w-7 h-7 text-slate-300" />
                                    </div>
                                    <h3 className="text-sm font-bold text-gray-800 mb-1">Bugün randevu yok</h3>
                                    <p className="text-xs text-gray-400 text-center">Yeni bir randevu oluşturmak için takvime gidin</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {todayReservations.map((res) => {
                                        const status = statusConfig[res.status];
                                        return (
                                            <div key={res.id}
                                                className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-[#CCFF00]/30 hover:shadow-sm transition-all group cursor-pointer"
                                                onClick={() => navigate('/reservations')}
                                            >
                                                {/* Time */}
                                                <div className="text-center min-w-[60px]">
                                                    <p className="text-sm font-bold text-gray-900">{res.startTime}</p>
                                                    <p className="text-[10px] text-gray-400">{res.endTime}</p>
                                                </div>

                                                {/* Color bar */}
                                                <div className="w-1 h-10 rounded-full" style={{ backgroundColor: res.serviceColor || '#CCFF00' }} />

                                                {/* Info */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-gray-900 truncate">{res.customerName}</p>
                                                    <p className="text-xs text-gray-400">{res.service}</p>
                                                </div>

                                                {/* Status */}
                                                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", status.color)}>
                                                    {status.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Upcoming Reservations - 2 cols */}
                    <div className="lg:col-span-2 relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/50 shadow-2xl">
                        <div className="absolute top-6 right-6 w-24 h-24 bg-[#CCFF00]/10 rounded-full blur-3xl animate-pulse" />
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#CCFF00]/60 to-transparent" />

                        <div className="px-5 py-4 border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-[#CCFF00] flex items-center justify-center">
                                    <Users className="w-4 h-4 text-slate-900" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-white">Yaklaşan Randevular</h2>
                                    <p className="text-[11px] text-slate-400">{upcomingReservations.length} yaklaşan</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 space-y-3">
                            {upcomingReservations.length === 0 ? (
                                <div className="text-center py-8">
                                    <Calendar className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                                    <p className="text-sm text-slate-500">Yaklaşan randevu yok</p>
                                </div>
                            ) : (
                                upcomingReservations.map((res) => (
                                    <div key={res.id}
                                        className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all cursor-pointer"
                                        onClick={() => navigate('/reservations')}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-semibold text-white">{res.customerName}</span>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#CCFF00] text-slate-900">
                                                {res.startTime}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-slate-400">
                                            <span>{res.date}</span>
                                            <span>•</span>
                                            <span>{res.service}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="px-5 pb-5">
                            <button
                                onClick={() => navigate('/reservations')}
                                className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-400 border border-white/10 hover:bg-white/5 hover:text-white transition-all"
                            >
                                Tüm Rezervasyonları Gör →
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
