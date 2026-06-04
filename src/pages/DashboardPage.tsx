import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Plus, ArrowRight, AlertCircle, BarChart3, Phone, MessageCircle, Bell, CheckCircle2 } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { WinbackCard } from '@/components/winback/WinbackCard';
import { cn } from '@/utils/cn';

const statusConfig = {
    pending:   { label: 'Bekleyen',    color: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500' },
    confirmed: { label: 'Onaylı',      color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
    cancelled: { label: 'İptal',       color: 'bg-red-100 text-red-700',         dot: 'bg-red-500' },
    completed: { label: 'Tamamlandı',  color: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500' },
};

// Telefonu WhatsApp (wa.me) formatına çevir — TR numaraları için
function waLink(phone: string): string {
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('0')) p = '90' + p.slice(1);
    else if (!p.startsWith('90')) p = '90' + p;
    return `https://wa.me/${p}`;
}

export const DashboardPage = () => {
    const navigate = useNavigate();
    const { reservations, settings, orgId, getStats, getTodayReservations, getUpcomingReservations } = useReservations();
    const stats                = getStats();
    const todayReservations    = getTodayReservations();
    const upcomingReservations = getUpcomingReservations(5);

    const now      = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const nowTime  = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    // Takvim yaprağı için tarih parçaları
    const MONTHS_SHORT = ['OCA', 'ŞUB', 'MAR', 'NİS', 'MAY', 'HAZ', 'TEM', 'AĞU', 'EYL', 'EKİ', 'KAS', 'ARA'];
    const dayNum    = now.getDate();
    const monthShort = MONTHS_SHORT[now.getMonth()];
    const weekday   = now.toLocaleDateString('tr-TR', { weekday: 'long' });
    const monthYear = now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

    // Bugün kalan (henüz geçmemiş) randevular + en yakını
    const remainingTodayList = todayReservations.filter(r => r.status !== 'cancelled' && r.endTime >= nowTime);
    const remainingToday = remainingTodayList.length;
    const nextAppt = remainingTodayList[0]; // getTodayReservations saate göre sıralı

    // Otomatik gönderilen hatırlatma sayısı (güven göstergesi)
    const remindersSent = useMemo(() =>
        reservations.filter(r =>
            r.status !== 'cancelled' && r.date >= todayStr && (r.reminder24hSent || r.reminder2hSent)
        ).length,
        [reservations, todayStr]
    );

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

    return (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-white to-[#CCFF00]/[0.04]">
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* ── Hero: Takvim Yaprağı + İşletme + Akıllı Özet ─────────────── */}
                <div className="relative overflow-hidden rounded-3xl bg-white border border-gray-200/70 shadow-sm">
                    <div className="absolute -top-10 -right-10 w-48 h-48 bg-[#CCFF00]/[0.07] rounded-full blur-3xl" />

                    <div className="relative flex flex-col sm:flex-row sm:items-center gap-5 p-5 sm:p-6">
                        {/* Takvim yaprağı */}
                        <div className="flex-shrink-0 w-20 h-20 rounded-2xl bg-slate-900 flex flex-col items-center justify-center shadow-lg shadow-slate-900/20 ring-1 ring-slate-900/5">
                            <span className="text-3xl font-black text-white leading-none">{dayNum}</span>
                            <span className="text-[11px] font-bold text-[#CCFF00] tracking-[0.2em] mt-1">{monthShort}</span>
                        </div>

                        {/* İşletme + özet */}
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                {weekday} · {monthYear}
                            </p>
                            <h1 className="text-2xl font-extrabold text-gray-900 mt-0.5 truncate">
                                {settings.businessName}
                            </h1>
                            <p className="text-[15px] text-gray-500 mt-1.5">
                                {remainingToday > 0 ? (
                                    <>
                                        Bugün <span className="font-bold text-gray-900">{remainingToday} randevun</span> var
                                        {nextAppt && <> · ilki <span className="font-bold text-[#5c7300]">{nextAppt.startTime}</span>'te</>}
                                        {stats.pending > 0 && <> · {stats.pending} onay bekliyor</>}
                                    </>
                                ) : todayReservations.length > 0 ? (
                                    <>Bugünkü randevuların tamamlandı 🎉</>
                                ) : (
                                    <>Bugün için planlanmış randevu yok</>
                                )}
                            </p>
                        </div>

                        {/* CTA */}
                        <button
                            onClick={() => navigate('/calendar')}
                            className="flex-shrink-0 flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-base bg-[#CCFF00] text-slate-900 hover:bg-[#d4ff33] transition-all hover:shadow-lg hover:shadow-[#CCFF00]/25 hover:scale-[1.02] active:scale-[0.98] shadow-md"
                        >
                            <Plus className="w-5 h-5" />
                            Yeni Randevu
                        </button>
                    </div>
                </div>

                {/* ── AI Geri-Kazanım Kartı ────────────────────────────────────── */}
                <WinbackCard orgId={orgId} whatsappInstance={settings.whatsappInstance} />

                {/* ── Hatırlatma Güven Şeridi ──────────────────────────────────── */}
                {remindersSent > 0 && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-100">
                        <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                            <Bell className="w-4 h-4 text-emerald-600" />
                        </div>
                        <p className="text-sm text-emerald-800">
                            <span className="font-bold">{remindersSent} müşteriye</span> otomatik WhatsApp hatırlatması gönderildi — senin yerine sistem hatırlattı ✅
                        </p>
                    </div>
                )}

                {/* ── Sade KPI Şeridi ──────────────────────────────────────────── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <button onClick={() => navigate('/calendar')}
                        className="flex items-center gap-3 rounded-2xl bg-white border border-gray-200/70 p-4 shadow-sm hover:shadow-md hover:border-[#CCFF00]/40 transition-all text-left">
                        <div className="w-11 h-11 rounded-xl bg-[#CCFF00]/15 flex items-center justify-center flex-shrink-0">
                            <Calendar className="w-5 h-5 text-[#5c7300]" />
                        </div>
                        <div>
                            <p className="text-2xl font-extrabold text-gray-900 leading-none">{stats.today}</p>
                            <p className="text-xs text-gray-400 mt-1">Bugün</p>
                        </div>
                    </button>

                    <button onClick={() => navigate('/reservations')}
                        className="flex items-center gap-3 rounded-2xl bg-white border border-gray-200/70 p-4 shadow-sm hover:shadow-md hover:border-amber-200 transition-all text-left">
                        <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                            <AlertCircle className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-extrabold text-gray-900 leading-none">{stats.pending}</p>
                            <p className="text-xs text-gray-400 mt-1">Onay bekliyor</p>
                        </div>
                    </button>

                    <div className="flex items-center gap-3 rounded-2xl bg-white border border-gray-200/70 p-4 shadow-sm">
                        <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                            <BarChart3 className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-extrabold text-gray-900 leading-none">{weekStats.total}</p>
                            <p className="text-xs text-gray-400 mt-1">Bu hafta</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl bg-white border border-gray-200/70 p-4 shadow-sm">
                        <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <CheckCircle2 className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-extrabold text-gray-900 leading-none">{weekStats.completed}</p>
                            <p className="text-xs text-gray-400 mt-1">Tamamlandı</p>
                        </div>
                    </div>
                </div>

                {/* ── Ana İçerik ─────────────────────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

                    {/* Bugünün Programı — ana panel */}
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

                        <div className="p-4">
                            {todayReservations.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200/60 flex items-center justify-center mb-3">
                                        <Calendar className="w-7 h-7 text-slate-300" />
                                    </div>
                                    <p className="text-sm font-semibold text-gray-700 mb-1">Bugün randevu yok</p>
                                    <button onClick={() => navigate('/calendar')}
                                        className="mt-2 px-4 py-2 rounded-xl text-sm font-bold text-slate-900 bg-[#CCFF00] hover:bg-[#d4ff33] transition-all">
                                        + Randevu oluştur
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {todayReservations.map((res) => {
                                        const s = statusConfig[res.status];
                                        const isPast = res.endTime < nowTime;
                                        return (
                                            <div key={res.id}
                                                className={cn(
                                                    "flex items-center gap-3 p-3 rounded-xl border transition-all group",
                                                    isPast
                                                        ? "border-gray-100 bg-gray-50/50 opacity-60"
                                                        : "border-gray-100 hover:border-[#CCFF00]/40 hover:shadow-sm"
                                                )}
                                            >
                                                <div className="text-center min-w-[48px]">
                                                    <p className="text-sm font-extrabold text-gray-900 tabular-nums">{res.startTime}</p>
                                                    <p className="text-[10px] text-gray-400 tabular-nums">{res.endTime}</p>
                                                </div>
                                                <div className="w-1 h-11 rounded-full flex-shrink-0"
                                                    style={{ backgroundColor: res.serviceColor || '#CCFF00' }} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-gray-900 truncate">{res.customerName}</p>
                                                    <p className="text-xs text-gray-400 truncate">{res.service}</p>
                                                </div>

                                                {/* Tek-tık aksiyonlar */}
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                    {res.customerPhone && (
                                                        <>
                                                            <a
                                                                href={waLink(res.customerPhone)}
                                                                target="_blank" rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                title="WhatsApp'tan yaz"
                                                                className="w-9 h-9 rounded-xl bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center text-emerald-600 transition-all hover:scale-105 active:scale-95"
                                                            >
                                                                <MessageCircle className="w-4 h-4" />
                                                            </a>
                                                            <a
                                                                href={`tel:${res.customerPhone.replace(/\s+/g, '')}`}
                                                                onClick={(e) => e.stopPropagation()}
                                                                title="Ara"
                                                                className="w-9 h-9 rounded-xl bg-blue-50 hover:bg-blue-100 flex items-center justify-center text-blue-600 transition-all hover:scale-105 active:scale-95"
                                                            >
                                                                <Phone className="w-4 h-4" />
                                                            </a>
                                                        </>
                                                    )}
                                                    <span className={cn("hidden sm:inline px-2 py-1 rounded-lg text-[10px] font-bold", s.color)}>
                                                        {s.label}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sağ Panel — açık tema */}
                    <div className="lg:col-span-2 flex flex-col gap-4">

                        {/* Yaklaşan Randevular */}
                        <div className="flex-1 relative overflow-hidden rounded-2xl bg-white border border-gray-200/60 shadow-sm">
                            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-[#CCFF00]/15 flex items-center justify-center">
                                    <Calendar className="w-4 h-4 text-[#5c7300]" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-gray-900">Yaklaşan</h2>
                                    <p className="text-[11px] text-gray-400">{upcomingReservations.length} randevu</p>
                                </div>
                            </div>

                            <div className="p-3 space-y-2">
                                {upcomingReservations.length === 0 ? (
                                    <div className="text-center py-8">
                                        <p className="text-sm text-gray-400">Yaklaşan randevu yok</p>
                                    </div>
                                ) : (
                                    upcomingReservations.map((res) => (
                                        <div key={res.id}
                                            onClick={() => navigate('/reservations')}
                                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 hover:bg-[#CCFF00]/[0.07] hover:border-[#CCFF00]/30 transition-all cursor-pointer">
                                            <div className="w-1.5 h-8 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: res.serviceColor || '#CCFF00' }} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-900 truncate">{res.customerName}</p>
                                                <p className="text-[11px] text-gray-400 truncate">{res.date} · {res.service}</p>
                                            </div>
                                            <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-[#CCFF00]/20 text-[#5c7300] flex-shrink-0 tabular-nums">
                                                {res.startTime}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Haftalık Özet */}
                        <div className="rounded-2xl bg-white border border-gray-200/60 shadow-sm p-4">
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Haftalık Özet</p>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="text-center p-2.5 rounded-xl bg-emerald-50">
                                    <p className="text-lg font-extrabold text-emerald-700">{weekStats.completed}</p>
                                    <p className="text-[10px] text-emerald-600 font-medium">Tamamlandı</p>
                                </div>
                                <div className="text-center p-2.5 rounded-xl bg-red-50">
                                    <p className="text-lg font-extrabold text-red-600">{weekStats.noShow}</p>
                                    <p className="text-[10px] text-red-500 font-medium">İptal</p>
                                </div>
                                <div className="text-center p-2.5 rounded-xl bg-[#CCFF00]/10">
                                    <p className="text-lg font-extrabold text-[#5c7300]">%{weekStats.rate}</p>
                                    <p className="text-[10px] text-[#7a9900] font-medium">Oran</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            </div>
        </div>
    );
};
