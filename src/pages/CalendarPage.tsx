import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Clock, User, X, Sparkles, AlertTriangle } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { cn } from '@/utils/cn';
import type { CalendarView, Reservation } from '@/types';

const DAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const DAYS_FULL = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 08:00 - 19:00

const statusConfig: Record<string, { label: string; color: string; dot: string; bg: string }> = {
    pending: { label: 'Bekleyen', color: 'text-amber-600', dot: 'bg-amber-500', bg: 'bg-amber-50 border-amber-200' },
    confirmed: { label: 'Onaylı', color: 'text-emerald-600', dot: 'bg-emerald-500', bg: 'bg-emerald-50 border-emerald-200' },
    cancelled: { label: 'İptal', color: 'text-red-600', dot: 'bg-red-500', bg: 'bg-red-50 border-red-200' },
    completed: { label: 'Tamamlandı', color: 'text-blue-600', dot: 'bg-blue-500', bg: 'bg-blue-50 border-blue-200' },
};

export const CalendarPage = () => {
    const { reservations, addReservation, settings, getReservationsByDate, checkConflict, sendWebhook } = useReservations();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState<CalendarView>('month');
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [showNewDialog, setShowNewDialog] = useState(false);

    const [newRes, setNewRes] = useState({
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        service: settings.services[0]?.name || '',
        startTime: '09:00',
        endTime: '09:30',
        notes: '',
    });

    const today = new Date().toISOString().split('T')[0];

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const daysInMonth = useMemo(() => {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDow = (firstDay.getDay() + 6) % 7;

        const days: { date: string; day: number; isCurrentMonth: boolean }[] = [];

        const prevLastDay = new Date(year, month, 0).getDate();
        for (let i = startDow - 1; i >= 0; i--) {
            const d = prevLastDay - i;
            const prevMonth = month === 0 ? 11 : month - 1;
            const prevYear = month === 0 ? year - 1 : year;
            days.push({
                date: `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
                day: d,
                isCurrentMonth: false,
            });
        }

        for (let d = 1; d <= lastDay.getDate(); d++) {
            days.push({
                date: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
                day: d,
                isCurrentMonth: true,
            });
        }

        const remaining = 42 - days.length;
        for (let d = 1; d <= remaining; d++) {
            const nextMonth = month === 11 ? 0 : month + 1;
            const nextYear = month === 11 ? year + 1 : year;
            days.push({
                date: `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
                day: d,
                isCurrentMonth: false,
            });
        }

        return days;
    }, [year, month]);

    const weekDays = useMemo(() => {
        const start = new Date(currentDate);
        const dow = (start.getDay() + 6) % 7;
        start.setDate(start.getDate() - dow);
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            return {
                date: d.toISOString().split('T')[0],
                day: d.getDate(),
                dayName: DAYS_TR[i],
                fullName: DAYS_FULL[i],
                isToday: d.toISOString().split('T')[0] === today,
            };
        });
    }, [currentDate, today]);

    const getDateCount = (date: string) => {
        return reservations.filter(r => r.date === date && r.status !== 'cancelled').length;
    };

    const navigate = (dir: number) => {
        const d = new Date(currentDate);
        if (view === 'month') d.setMonth(d.getMonth() + dir);
        else if (view === 'week') d.setDate(d.getDate() + dir * 7);
        else d.setDate(d.getDate() + dir);
        setCurrentDate(d);
    };

    const handleDateClick = (date: string) => {
        setSelectedDate(date);
        if (view === 'month') {
            setView('day');
            setCurrentDate(new Date(date));
        }
    };

    const handleCreateReservation = async () => {
        if (!selectedDate || !newRes.customerName || !newRes.customerPhone) return;

        // Check for conflicts
        const conflict = checkConflict(selectedDate, newRes.startTime, newRes.endTime);
        if (conflict) {
            toast.error(`Çakışma! ${conflict.customerName} — ${conflict.startTime}/${conflict.endTime} saatinde randevu mevcut.`);
            return;
        }

        const reservation = await addReservation({
            customerId: '',
            customerName: newRes.customerName,
            customerPhone: newRes.customerPhone,
            customerEmail: newRes.customerEmail,
            date: selectedDate,
            startTime: newRes.startTime,
            endTime: newRes.endTime,
            service: newRes.service,
            serviceColor: settings.services.find(s => s.name === newRes.service)?.color || '#CCFF00',
            status: 'pending',
            notes: newRes.notes,
        });

        if (reservation) {
            // Webhook tetikle (n8n entegrasyonu)
            sendWebhook('reservation.created', {
                id: reservation.id,
                customerName: reservation.customerName,
                customerPhone: reservation.customerPhone,
                date: reservation.date,
                startTime: reservation.startTime,
                endTime: reservation.endTime,
                service: reservation.service,
            });

            setShowNewDialog(false);
            setNewRes({ customerName: '', customerPhone: '', customerEmail: '', service: settings.services[0]?.name || '', startTime: '09:00', endTime: '09:30', notes: '' });
        }
    };

    const dayReservations = selectedDate ? getReservationsByDate(selectedDate) : [];

    const todayCount = reservations.filter(r => r.date === today && r.status !== 'cancelled').length;
    const weekTotal = weekDays.reduce((sum, d) => sum + getDateCount(d.date), 0);

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Premium Header */}
            <div className="relative overflow-hidden">
                {/* Background effects */}
                <div className="absolute inset-0 bg-gradient-to-br from-white via-gray-50/80 to-white" />
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#CCFF00]/[0.06] rounded-full blur-[150px] -translate-y-1/2 translate-x-1/4" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/[0.03] rounded-full blur-[120px] translate-y-1/2 -translate-x-1/4" />

                <div className="relative px-6 pt-4 pb-2">
                    {/* Top Row: Branding + Actions */}
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
                        {/* Left: Icon + Title + Stats */}
                        <div className="flex items-center gap-4">
                            <div className="relative group">
                                <div className="absolute inset-0 bg-[#CCFF00]/40 rounded-xl blur-lg group-hover:blur-xl transition-all duration-500 opacity-60" />
                                <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-[#CCFF00] via-[#d4ff33] to-[#99cc00] flex items-center justify-center shadow-lg shadow-[#CCFF00]/25 ring-2 ring-white">
                                    <CalendarIcon className="w-5 h-5 text-slate-900" />
                                </div>
                            </div>
                            <div>
                                <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">Takvim</h1>
                                <p className="text-[13px] text-gray-400 mt-0.5">Randevularınızı yönetin ve takip edin</p>
                            </div>

                            {/* Stats badges inline */}
                            <div className="hidden md:flex items-center gap-2.5 ml-4 pl-5 border-l border-gray-200/60">
                                <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/80 backdrop-blur-sm border border-gray-100 shadow-sm hover:shadow-md hover:border-[#CCFF00]/30 transition-all duration-300 group cursor-default">
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#CCFF00] shadow-sm shadow-[#CCFF00]/50 animate-pulse" />
                                    <span className="text-xs font-semibold text-gray-500">Bugün</span>
                                    <span className="text-sm font-black text-gray-900 tabular-nums">{todayCount}</span>
                                </div>
                                <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/80 backdrop-blur-sm border border-gray-100 shadow-sm hover:shadow-md hover:border-purple-200/50 transition-all duration-300 cursor-default">
                                    <div className="w-2.5 h-2.5 rounded-full bg-purple-400/60" />
                                    <span className="text-xs font-semibold text-gray-500">Hafta</span>
                                    <span className="text-sm font-black text-gray-900 tabular-nums">{weekTotal}</span>
                                </div>
                            </div>
                        </div>

                        {/* Right: View Switcher + CTA */}
                        <div className="flex items-center gap-3">
                            {/* View Switcher */}
                            <div className="flex items-center bg-white/80 backdrop-blur-sm border border-gray-200/70 rounded-2xl p-1 shadow-sm">
                                {(['month', 'week', 'day'] as CalendarView[]).map((v) => (
                                    <button
                                        key={v}
                                        onClick={() => setView(v)}
                                        className={cn(
                                            "px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 relative",
                                            view === v
                                                ? "bg-gradient-to-r from-[#CCFF00] to-[#d4ff33] text-slate-900 shadow-md shadow-[#CCFF00]/25"
                                                : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                                        )}
                                    >
                                        {v === 'month' ? 'Ay' : v === 'week' ? 'Hafta' : 'Gün'}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => { setSelectedDate(today); setShowNewDialog(true); }}
                                className="relative group flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm bg-gradient-to-r from-[#CCFF00] via-[#d4ff33] to-[#b8e600] text-slate-900 shadow-lg shadow-[#CCFF00]/20 hover:shadow-xl hover:shadow-[#CCFF00]/30 transition-all duration-300 hover:scale-[1.03] active:scale-[0.97]"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-[#CCFF00] to-[#b8e600] rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                <Plus className="w-4 h-4 relative z-10" />
                                <span className="relative z-10">Randevu Oluştur</span>
                            </button>
                        </div>
                    </div>

                    {/* Navigation Bar */}
                    <div className="flex items-center justify-center mt-2">
                        <div className="inline-flex items-center gap-2 bg-white/70 backdrop-blur-sm border border-gray-200/60 rounded-2xl px-2 py-1.5 shadow-sm">
                            <button
                                onClick={() => navigate(-1)}
                                className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-all duration-200 active:scale-90"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>

                            <div className="text-center min-w-[220px] px-4">
                                <h2 className="text-lg font-extrabold text-gray-900 tracking-tight">
                                    {view === 'day'
                                        ? currentDate.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
                                        : `${MONTHS_TR[month]} ${year}`
                                    }
                                </h2>
                                {view === 'day' && (
                                    <p className="text-[11px] text-gray-400 font-medium -mt-0.5">{year}</p>
                                )}
                            </div>

                            <button
                                onClick={() => navigate(1)}
                                className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-all duration-200 active:scale-90"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>

                            <div className="w-px h-6 bg-gray-200/60 mx-1" />

                            <button
                                onClick={() => { setCurrentDate(new Date()); setSelectedDate(today); }}
                                className="px-4 py-1.5 rounded-xl text-xs font-bold text-[#7a9900] bg-[#CCFF00]/10 border border-[#CCFF00]/25 hover:bg-[#CCFF00]/20 hover:border-[#CCFF00]/40 transition-all duration-200 active:scale-95"
                            >
                                Bugün
                            </button>
                        </div>
                    </div>
                </div>

                {/* Bottom border gradient */}
                <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
            </div>

            {/* Calendar Content */}
            <div className="px-6 pb-3 pt-3 flex-1 flex flex-col min-h-0">
                {/* Month View */}
                {view === 'month' && (
                    <div className="rounded-2xl bg-white border border-gray-200/80 shadow-xl shadow-gray-200/50 overflow-hidden flex-1 flex flex-col">
                        {/* Day headers */}
                        <div className="grid grid-cols-7 border-b border-gray-100">
                            {DAYS_TR.map((d, i) => (
                                <div key={d} className={cn(
                                    "py-3.5 text-center text-[11px] font-bold uppercase tracking-[0.15em]",
                                    i >= 5 ? "text-[#7a9900]" : "text-gray-400"
                                )}>
                                    {d}
                                </div>
                            ))}
                        </div>

                        {/* Day cells */}
                        <div className="grid grid-cols-7 flex-1" style={{ gridAutoRows: '1fr' }}>
                            {daysInMonth.map(({ date, day, isCurrentMonth }, idx) => {
                                const count = getDateCount(date);
                                const isToday = date === today;
                                const dayOfWeek = idx % 7;
                                const isWeekend = dayOfWeek >= 5;
                                const dateReservations = reservations.filter(r => r.date === date && r.status !== 'cancelled');

                                return (
                                    <button
                                        key={date}
                                        onClick={() => handleDateClick(date)}
                                        className={cn(
                                            "relative p-2 border-b border-r border-gray-100/70 text-left transition-all duration-200 group overflow-hidden",
                                            !isCurrentMonth && "opacity-30",
                                            isToday && "bg-[#CCFF00]/[0.06]",
                                            isWeekend && isCurrentMonth && "bg-gray-50/50",
                                            "hover:bg-[#CCFF00]/[0.08]",
                                        )}
                                    >
                                        {/* Today indicator line */}
                                        {isToday && <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#CCFF00] to-transparent" />}

                                        <div className="flex items-start justify-between">
                                            <span className={cn(
                                                "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-all",
                                                isToday
                                                    ? "bg-[#CCFF00] text-slate-900 font-black shadow-lg shadow-[#CCFF00]/30"
                                                    : "text-gray-500 group-hover:text-gray-800",
                                            )}>
                                                {day}
                                            </span>
                                            {count > 0 && (
                                                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#CCFF00]/15 text-[#6b8c00] border border-[#CCFF00]/25">
                                                    {count}
                                                </span>
                                            )}
                                        </div>

                                        {count > 0 && (
                                            <div className="mt-1.5 space-y-0.5">
                                                {dateReservations.slice(0, 2).map((r) => (
                                                    <div key={r.id} className="flex items-center gap-1.5 px-1.5 py-[3px] rounded-md text-[10px] truncate bg-gray-50 group-hover:bg-gray-100/80 transition-colors border border-gray-100">
                                                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.serviceColor || '#CCFF00' }} />
                                                        <span className="truncate text-gray-500 font-medium">{r.startTime} <span className="text-gray-400">{r.customerName.split(' ')[0]}</span></span>
                                                    </div>
                                                ))}
                                                {count > 2 && (
                                                    <span className="text-[9px] text-gray-400 pl-1 font-medium">+{count - 2} daha</span>
                                                )}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Week View */}
                {view === 'week' && (
                    <div className="rounded-2xl bg-white border border-gray-200/80 shadow-xl shadow-gray-200/50 overflow-hidden flex-1 flex flex-col">
                        <div className="grid grid-cols-8">
                            <div className="border-r border-gray-100 p-3 flex items-end">
                                <Clock className="w-3.5 h-3.5 text-gray-300" />
                            </div>
                            {weekDays.map((d) => (
                                <div key={d.date}
                                    className={cn(
                                        "p-3 text-center border-r border-b border-gray-100 relative",
                                        d.isToday && "bg-[#CCFF00]/[0.06]"
                                    )}
                                >
                                    {d.isToday && <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#CCFF00] to-transparent" />}
                                    <span className={cn(
                                        "text-[11px] font-bold uppercase tracking-wider",
                                        d.isToday ? "text-[#7a9900]" : "text-gray-400"
                                    )}>{d.dayName}</span>
                                    <span className={cn(
                                        "block text-lg font-bold mt-0.5",
                                        d.isToday ? "text-[#5c7300]" : "text-gray-800"
                                    )}>{d.day}</span>
                                </div>
                            ))}
                        </div>

                        {HOURS.map((hour) => (
                            <div key={hour} className="grid grid-cols-8 border-b border-gray-50">
                                <div className="border-r border-gray-100 p-2 text-right pr-3">
                                    <span className="text-[11px] font-bold text-gray-300 tabular-nums">{String(hour).padStart(2, '0')}:00</span>
                                </div>
                                {weekDays.map((d) => {
                                    const hourRes = reservations.filter(r =>
                                        r.date === d.date && parseInt(r.startTime.split(':')[0]) === hour && r.status !== 'cancelled'
                                    );
                                    return (
                                        <div key={d.date + hour}
                                            className={cn(
                                                "border-r border-gray-50 p-1 min-h-[56px] cursor-pointer transition-all duration-200",
                                                d.isToday ? "bg-[#CCFF00]/[0.03] hover:bg-[#CCFF00]/[0.08]" : "hover:bg-gray-50",
                                            )}
                                            onClick={() => { setSelectedDate(d.date); setNewRes(p => ({ ...p, startTime: `${String(hour).padStart(2, '0')}:00`, endTime: `${String(hour + 1).padStart(2, '0')}:00` })); setShowNewDialog(true); }}
                                        >
                                            {hourRes.map((r) => (
                                                <div key={r.id}
                                                    className="px-2 py-1.5 rounded-lg text-[10px] font-semibold truncate mb-0.5 border transition-all hover:scale-[1.02] shadow-sm"
                                                    style={{
                                                        backgroundColor: (r.serviceColor || '#CCFF00') + '18',
                                                        borderColor: (r.serviceColor || '#CCFF00') + '35',
                                                        color: '#374151',
                                                        borderLeftWidth: '3px',
                                                        borderLeftColor: r.serviceColor || '#CCFF00',
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {r.customerName.split(' ')[0]} · {r.service}
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                )}

                {/* Day View */}
                {view === 'day' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1">
                        {/* Time slots */}
                        <div className="lg:col-span-2 rounded-2xl bg-white border border-gray-200/80 shadow-xl shadow-gray-200/50 overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-[#7a9900]" />
                                    <span className="text-sm font-bold text-gray-800">Saat Çizelgesi</span>
                                </div>
                                <span className="text-xs text-gray-400 font-medium">
                                    {reservations.filter(r => r.date === currentDate.toISOString().split('T')[0] && r.status !== 'cancelled').length} randevu
                                </span>
                            </div>
                            <div className="divide-y divide-gray-50">
                                {HOURS.map((hour) => {
                                    const dateStr = currentDate.toISOString().split('T')[0];
                                    const hourRes = reservations.filter(r =>
                                        r.date === dateStr && parseInt(r.startTime.split(':')[0]) === hour && r.status !== 'cancelled'
                                    );
                                    const now = new Date();
                                    const isCurrentHour = dateStr === today && now.getHours() === hour;

                                    return (
                                        <div key={hour}
                                            className={cn(
                                                "flex items-stretch min-h-[68px] transition-all duration-200 cursor-pointer group",
                                                isCurrentHour ? "bg-[#CCFF00]/[0.06]" : "hover:bg-gray-50/70",
                                            )}
                                            onClick={() => { setSelectedDate(dateStr); setNewRes(p => ({ ...p, startTime: `${String(hour).padStart(2, '0')}:00`, endTime: `${String(hour + 1).padStart(2, '0')}:00` })); setShowNewDialog(true); }}
                                        >
                                            <div className="w-20 flex-shrink-0 p-3 border-r border-gray-100 text-right relative">
                                                {isCurrentHour && <div className="absolute top-1/2 right-0 w-2 h-2 rounded-full bg-[#CCFF00] -translate-y-1/2 translate-x-1 shadow-lg shadow-[#CCFF00]/50" />}
                                                <span className={cn(
                                                    "text-xs font-bold tabular-nums",
                                                    isCurrentHour ? "text-[#7a9900]" : "text-gray-300"
                                                )}>
                                                    {String(hour).padStart(2, '0')}:00
                                                </span>
                                            </div>
                                            <div className="flex-1 p-2 space-y-1.5">
                                                {hourRes.map((r) => (
                                                    <div key={r.id}
                                                        className="flex items-center gap-3 px-4 py-3 rounded-xl border shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.01]"
                                                        style={{
                                                            borderColor: (r.serviceColor || '#CCFF00') + '30',
                                                            backgroundColor: (r.serviceColor || '#CCFF00') + '0a',
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <div className="w-1 h-10 rounded-full" style={{ backgroundColor: r.serviceColor || '#CCFF00' }} />
                                                        <div className="flex-1">
                                                            <p className="text-sm font-bold text-gray-800">{r.customerName}</p>
                                                            <p className="text-[11px] text-gray-400">{r.startTime} - {r.endTime} · {r.service}</p>
                                                        </div>
                                                        <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold border", statusConfig[r.status]?.bg, statusConfig[r.status]?.color)}>
                                                            {statusConfig[r.status]?.label}
                                                        </span>
                                                    </div>
                                                ))}
                                                {hourRes.length === 0 && (
                                                    <div className="flex items-center justify-center h-full opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                                        <span className="text-[11px] text-gray-300 flex items-center gap-1">
                                                            <Plus className="w-3 h-3" /> Tıkla ekle
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Day Summary Sidebar */}
                        <div className="space-y-4">
                            <div className="rounded-2xl bg-white border border-gray-200/80 shadow-xl shadow-gray-200/50 p-5 relative overflow-hidden">
                                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#CCFF00] to-transparent" />
                                <div className="absolute top-4 right-4 w-20 h-20 bg-[#CCFF00]/[0.06] rounded-full blur-2xl" />

                                <div className="flex items-center gap-2 mb-4">
                                    <Sparkles className="w-4 h-4 text-[#7a9900]" />
                                    <h3 className="text-sm font-bold text-gray-800">Günün Özeti</h3>
                                </div>

                                {(() => {
                                    const dateStr = currentDate.toISOString().split('T')[0];
                                    const dayRes = reservations.filter(r => r.date === dateStr && r.status !== 'cancelled');
                                    const pending = dayRes.filter(r => r.status === 'pending').length;
                                    const confirmed = dayRes.filter(r => r.status === 'confirmed').length;

                                    return (
                                        <>
                                            <div className="grid grid-cols-3 gap-2 mb-5">
                                                <div className="p-3 rounded-xl bg-[#CCFF00]/[0.08] border border-[#CCFF00]/20">
                                                    <p className="text-2xl font-black text-[#5c7300]">{dayRes.length}</p>
                                                    <p className="text-[9px] text-gray-400 uppercase tracking-wider font-bold mt-0.5">Toplam</p>
                                                </div>
                                                <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
                                                    <p className="text-2xl font-black text-amber-600">{pending}</p>
                                                    <p className="text-[9px] text-gray-400 uppercase tracking-wider font-bold mt-0.5">Bekleyen</p>
                                                </div>
                                                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                                                    <p className="text-2xl font-black text-emerald-600">{confirmed}</p>
                                                    <p className="text-[9px] text-gray-400 uppercase tracking-wider font-bold mt-0.5">Onaylı</p>
                                                </div>
                                            </div>

                                            {dayRes.length > 0 ? (
                                                <div className="space-y-2">
                                                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-2">Program</p>
                                                    {dayRes.sort((a, b) => a.startTime.localeCompare(b.startTime)).map((r) => (
                                                        <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100/70 transition-all">
                                                            <div className="flex-shrink-0 w-1 h-6 rounded-full" style={{ backgroundColor: r.serviceColor || '#CCFF00' }} />
                                                            <span className="text-xs font-black text-[#5c7300] tabular-nums w-10">{r.startTime}</span>
                                                            <div className="flex-1 min-w-0">
                                                                <span className="text-xs text-gray-700 font-semibold truncate block">{r.customerName}</span>
                                                                <span className="text-[10px] text-gray-400">{r.service}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-6">
                                                    <CalendarIcon className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                                                    <p className="text-xs text-gray-400">Bu gün için randevu yok</p>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* New Reservation Dialog — Premium Light */}
            {showNewDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowNewDialog(false)} />
                    <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Dialog header gradient */}
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#CCFF00] via-[#CCFF00]/60 to-emerald-400/40" />

                        <button onClick={() => setShowNewDialog(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all z-10">
                            <X className="w-4 h-4" />
                        </button>

                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#CCFF00] to-[#99cc00] flex items-center justify-center shadow-lg shadow-[#CCFF00]/20">
                                    <Plus className="w-5 h-5 text-slate-900" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Yeni Randevu</h3>
                                    <p className="text-xs text-gray-400">{selectedDate}</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] flex items-center gap-1.5 mb-2">
                                        <User className="w-3 h-3" /> Müşteri Adı
                                    </label>
                                    <input
                                        type="text" placeholder="Adı Soyadı"
                                        className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-300 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/15 outline-none transition-all"
                                        value={newRes.customerName} onChange={(e) => setNewRes(p => ({ ...p, customerName: e.target.value }))}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2 block">Telefon</label>
                                        <input
                                            type="tel" placeholder="0532 xxx xxxx"
                                            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-300 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/15 outline-none transition-all"
                                            value={newRes.customerPhone} onChange={(e) => setNewRes(p => ({ ...p, customerPhone: e.target.value }))}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2 block">E-posta</label>
                                        <input
                                            type="email" placeholder="email@örnek.com"
                                            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-300 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/15 outline-none transition-all"
                                            value={newRes.customerEmail} onChange={(e) => setNewRes(p => ({ ...p, customerEmail: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2 block">Hizmet</label>
                                    <div className="flex flex-wrap gap-2">
                                        {settings.services.map((s) => (
                                            <button
                                                key={s.id}
                                                onClick={() => {
                                                    setNewRes(p => ({ ...p, service: s.name }));
                                                    const [h, m] = newRes.startTime.split(':').map(Number);
                                                    const endMin = h * 60 + m + s.duration;
                                                    setNewRes(p => ({ ...p, endTime: `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}` }));
                                                }}
                                                className={cn(
                                                    "px-3 py-2 rounded-lg text-xs font-bold transition-all duration-200 border",
                                                    newRes.service === s.name
                                                        ? "text-slate-900 shadow-md"
                                                        : "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600 bg-gray-50"
                                                )}
                                                style={newRes.service === s.name ? { backgroundColor: s.color, borderColor: s.color, boxShadow: `0 4px 14px ${s.color}30` } : {}}
                                            >
                                                {s.name} ({s.duration}dk)
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5">
                                            <Clock className="w-3 h-3" /> Başlangıç
                                        </label>
                                        <input
                                            type="time"
                                            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/15 outline-none transition-all"
                                            value={newRes.startTime} onChange={(e) => setNewRes(p => ({ ...p, startTime: e.target.value }))}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2 block">Bitiş</label>
                                        <input
                                            type="time"
                                            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/15 outline-none transition-all"
                                            value={newRes.endTime} onChange={(e) => setNewRes(p => ({ ...p, endTime: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2 block">Not (opsiyonel)</label>
                                    <textarea
                                        placeholder="Ek bilgiler..."
                                        rows={2}
                                        className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-300 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/15 outline-none transition-all resize-none"
                                        value={newRes.notes} onChange={(e) => setNewRes(p => ({ ...p, notes: e.target.value }))}
                                    />
                                </div>

                                <button
                                    onClick={handleCreateReservation}
                                    disabled={!newRes.customerName || !newRes.customerPhone}
                                    className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-[#CCFF00] to-[#b8e600] text-slate-900 hover:shadow-xl hover:shadow-[#CCFF00]/25 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
                                >
                                    Randevu Oluştur
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
