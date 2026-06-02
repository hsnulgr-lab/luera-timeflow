import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Clock, User, X, Sparkles, Search, Check, Users, ChevronDown } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { useStaff } from '@/hooks/useStaff';
import { useCustomers } from '@/hooks/useCustomers';
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
    const { reservations, addReservation, settings, checkConflict } = useReservations();
    const { staff } = useStaff();
    const { allCustomers } = useCustomers();
    const [staffFilter, setStaffFilter] = useState<string>('all');
    const [staffMenuOpen, setStaffMenuOpen] = useState(false);
    const staffMenuRef = useRef<HTMLDivElement>(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState<CalendarView>('month');
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [showNewDialog, setShowNewDialog] = useState(false);
    const [customerQuery, setCustomerQuery] = useState('');
    const [customerLocked, setCustomerLocked] = useState(false); // mevcut müşteri seçildi mi

    const [newRes, setNewRes] = useState({
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        service: settings.services[0]?.name || '',
        startTime: '09:00',
        endTime: '09:30',
        notes: '',
        staffId: '',
    });

    // Akıllı müşteri arama — isim veya telefona göre eşleşme
    const customerMatches = useMemo(() => {
        const q = customerQuery.trim().toLowerCase();
        if (!q || customerLocked) return [];
        return allCustomers
            .filter(c => c.name.toLowerCase().includes(q) || c.phone.replace(/\s+/g, '').includes(q.replace(/\s+/g, '')))
            .slice(0, 5);
    }, [customerQuery, customerLocked, allCustomers]);

    const selectCustomer = (c: { name: string; phone: string; email?: string }) => {
        setNewRes(p => ({ ...p, customerName: c.name, customerPhone: c.phone, customerEmail: c.email || '' }));
        setCustomerQuery(c.name);
        setCustomerLocked(true);
    };

    const clearCustomer = () => {
        setNewRes(p => ({ ...p, customerName: '', customerPhone: '', customerEmail: '' }));
        setCustomerQuery('');
        setCustomerLocked(false);
    };

    const closeDialog = () => {
        setShowNewDialog(false);
        setCustomerQuery('');
        setCustomerLocked(false);
        setNewRes({ customerName: '', customerPhone: '', customerEmail: '', service: settings.services[0]?.name || '', startTime: '09:00', endTime: '09:30', notes: '', staffId: '' });
    };

    // Personel menüsü — dışarı tıklayınca kapan
    useEffect(() => {
        if (!staffMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (staffMenuRef.current && !staffMenuRef.current.contains(e.target as Node)) {
                setStaffMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [staffMenuOpen]);

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

    const filteredReservations = useMemo(() =>
        staffFilter === 'all'
            ? reservations
            : reservations.filter(r => r.staffId === staffFilter),
        [reservations, staffFilter]
    );

    const selectedStaffMember = useMemo(() =>
        staffFilter !== 'all' ? staff.find(s => s.id === staffFilter) ?? null : null,
        [staff, staffFilter]
    );

    // Personelin o gün o saatte çalışıp çalışmadığını kontrol et
    const isStaffHourAvailable = useCallback((dateStr: string, hour: number): boolean => {
        if (!selectedStaffMember?.workingHours?.length) return true;
        const dayOfWeek = (new Date(dateStr + 'T12:00:00').getDay() + 6) % 7; // 0=Pzt … 6=Paz
        const dayHours = selectedStaffMember.workingHours.find(wh => wh.day === dayOfWeek);
        if (!dayHours || dayHours.isOff) return false;
        const startH = parseInt(dayHours.start.split(':')[0]);
        const endH   = parseInt(dayHours.end.split(':')[0]);
        return hour >= startH && hour < endH;
    }, [selectedStaffMember]);

    const getDateCount = (date: string) => {
        return filteredReservations.filter(r => r.date === date && r.status !== 'cancelled').length;
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
        const conflict = checkConflict(selectedDate, newRes.startTime, newRes.endTime, undefined, newRes.staffId || undefined);
        if (conflict) {
            toast.error(`Çakışma! ${conflict.customerName} — ${conflict.startTime}/${conflict.endTime} saatinde randevu mevcut.`);
            return;
        }

        const selectedStaff = staff.find(s => s.id === newRes.staffId);
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
            staffId: newRes.staffId || undefined,
            staffName: selectedStaff?.name,
            staffColor: selectedStaff?.color,
        });

        if (reservation) {
            closeDialog();
        }
    };

    const dayReservations = selectedDate ? filteredReservations.filter(r => r.date === selectedDate) : [];

    const todayCount = filteredReservations.filter(r => r.date === today && r.status !== 'cancelled').length;
    const weekTotal = weekDays.reduce((sum, d) => sum + getDateCount(d.date), 0);

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tek Satır Araç Çubuğu */}
            <div className="relative px-6 py-3 border-b border-gray-100 bg-white">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Sol: Dönem navigasyonu */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-all active:scale-90"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <h1 className="text-lg font-extrabold text-gray-900 tracking-tight text-center min-w-[180px]">
                            {view === 'day'
                                ? currentDate.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
                                : `${MONTHS_TR[month]} ${year}`
                            }
                        </h1>
                        <button
                            onClick={() => navigate(1)}
                            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-all active:scale-90"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => { setCurrentDate(new Date()); setSelectedDate(today); }}
                            className="ml-1 px-3.5 py-1.5 rounded-lg text-xs font-bold text-[#7a9900] bg-[#CCFF00]/10 border border-[#CCFF00]/25 hover:bg-[#CCFF00]/20 transition-all active:scale-95"
                        >
                            Bugün
                        </button>
                    </div>

                    {/* Küçük sayaçlar */}
                    <div className="hidden lg:flex items-center gap-2 pl-3 ml-1 border-l border-gray-200/70">
                        <span className="flex items-center gap-1.5 text-xs text-gray-500">
                            <span className="w-2 h-2 rounded-full bg-[#CCFF00]" />
                            Bugün <span className="font-bold text-gray-900 tabular-nums">{todayCount}</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-gray-500 ml-1">
                            <span className="w-2 h-2 rounded-full bg-purple-400/70" />
                            Hafta <span className="font-bold text-gray-900 tabular-nums">{weekTotal}</span>
                        </span>
                    </div>

                    {/* Sağ: Görünüm + Filtre + Ekle */}
                    <div className="flex items-center gap-2.5 ml-auto">
                        {/* Görünüm anahtarı */}
                        <div className="flex items-center bg-gray-50 border border-gray-200/70 rounded-xl p-0.5">
                            {(['month', 'week', 'day'] as CalendarView[]).map((v) => (
                                <button
                                    key={v}
                                    onClick={() => setView(v)}
                                    className={cn(
                                        "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                                        view === v
                                            ? "bg-[#CCFF00] text-slate-900 shadow-sm"
                                            : "text-gray-400 hover:text-gray-700"
                                    )}
                                >
                                    {v === 'month' ? 'Ay' : v === 'week' ? 'Hafta' : 'Gün'}
                                </button>
                            ))}
                        </div>

                        {/* Personel filtresi — özel dropdown */}
                        {staff.length > 0 && (
                            <div className="relative" ref={staffMenuRef}>
                                <button
                                    onClick={() => setStaffMenuOpen(o => !o)}
                                    className={cn(
                                        "flex items-center gap-2 pl-2.5 pr-2 py-2 rounded-xl border bg-white text-sm font-medium transition-all",
                                        staffMenuOpen ? "border-[#CCFF00] ring-2 ring-[#CCFF00]/15" : "border-gray-200/70 hover:border-gray-300"
                                    )}
                                >
                                    {selectedStaffMember ? (
                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedStaffMember.color }} />
                                    ) : (
                                        <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    )}
                                    <span className="text-gray-700 max-w-[120px] truncate">
                                        {selectedStaffMember ? selectedStaffMember.name : 'Tüm Personel'}
                                    </span>
                                    <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", staffMenuOpen && "rotate-180")} />
                                </button>

                                {staffMenuOpen && (
                                    <div className="absolute z-30 right-0 mt-2 w-56 bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden py-1.5 animate-in fade-in zoom-in-95 duration-150">
                                        {/* Tüm Personel */}
                                        <button
                                            onClick={() => { setStaffFilter('all'); setStaffMenuOpen(false); }}
                                            className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                                        >
                                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                                                <Users className="w-4 h-4 text-gray-500" />
                                            </div>
                                            <span className="flex-1 text-sm font-medium text-gray-700">Tüm Personel</span>
                                            {staffFilter === 'all' && <Check className="w-4 h-4 text-[#7a9900] flex-shrink-0" />}
                                        </button>

                                        <div className="h-px bg-gray-100 mx-3 my-1" />

                                        {/* Personel listesi */}
                                        {staff.map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => { setStaffFilter(s.id); setStaffMenuOpen(false); }}
                                                className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                                            >
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white" style={{ backgroundColor: s.color }}>
                                                    {s.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                                                    {s.specialty && <p className="text-[11px] text-gray-400 truncate">{s.specialty}</p>}
                                                </div>
                                                {staffFilter === s.id && <Check className="w-4 h-4 text-[#7a9900] flex-shrink-0" />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            onClick={() => { setSelectedDate(today); setShowNewDialog(true); }}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-[#CCFF00] text-slate-900 hover:bg-[#d4ff33] shadow-sm hover:shadow-md hover:shadow-[#CCFF00]/20 transition-all active:scale-[0.98]"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">Randevu Oluştur</span>
                        </button>
                    </div>
                </div>
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
                        <div className="grid grid-cols-7 flex-1 min-h-0" style={{ gridAutoRows: 'minmax(0, 1fr)' }}>
                            {daysInMonth.map(({ date, day, isCurrentMonth }, idx) => {
                                const count = getDateCount(date);
                                const isToday = date === today;
                                const dayOfWeek = idx % 7;
                                const isWeekend = dayOfWeek >= 5;
                                const dateReservations = filteredReservations
                                    .filter(r => r.date === date && r.status !== 'cancelled')
                                    .sort((a, b) => a.startTime.localeCompare(b.startTime));

                                return (
                                    <button
                                        key={date}
                                        onClick={() => handleDateClick(date)}
                                        className={cn(
                                            "relative flex flex-col p-1.5 border-b border-r border-gray-200 text-left transition-all duration-200 group overflow-hidden min-h-0",
                                            !isCurrentMonth && "opacity-40 bg-gray-50/40",
                                            isToday && "bg-[#CCFF00]/[0.07] ring-1 ring-inset ring-[#CCFF00]/40",
                                            isWeekend && isCurrentMonth && !isToday && "bg-gray-50/60",
                                            "hover:bg-[#CCFF00]/[0.1]",
                                        )}
                                    >
                                        {/* Today indicator line */}
                                        {isToday && <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#CCFF00] to-transparent" />}

                                        <div className="flex items-center justify-between flex-shrink-0">
                                            <span className={cn(
                                                "inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-semibold transition-all",
                                                isToday
                                                    ? "bg-[#CCFF00] text-slate-900 font-black shadow-md shadow-[#CCFF00]/30"
                                                    : isWeekend ? "text-[#7a9900] group-hover:text-[#5c7300]" : "text-gray-600 group-hover:text-gray-900",
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
                                            <div className="mt-1 space-y-1 overflow-hidden min-h-0">
                                                {dateReservations.slice(0, 2).map((r) => (
                                                    <div
                                                        key={r.id}
                                                        className="flex items-center gap-1.5 pl-1.5 pr-1 py-1 rounded-md text-[10px] bg-gray-50 group-hover:bg-white transition-colors border border-gray-100 shadow-sm"
                                                        style={{ borderLeftWidth: '3px', borderLeftColor: r.serviceColor || '#CCFF00' }}
                                                    >
                                                        <span className="font-bold text-gray-600 tabular-nums flex-shrink-0">{r.startTime}</span>
                                                        <span className="truncate text-gray-500 font-medium">{r.customerName.split(' ')[0]}</span>
                                                    </div>
                                                ))}
                                                {count > 2 && (
                                                    <span className="block text-[10px] text-[#7a9900] pl-1 font-bold">+{count - 2} randevu daha</span>
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
                    <div className="rounded-2xl bg-white border border-gray-200/80 shadow-xl shadow-gray-200/50 overflow-hidden flex-1 flex flex-col min-h-0">
                        <div className="grid grid-cols-8 flex-shrink-0">
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

                        <div className="flex-1 min-h-0 overflow-y-auto">
                        {HOURS.map((hour) => (
                            <div key={hour} className="grid grid-cols-8 border-b border-gray-50">
                                <div className="border-r border-gray-100 p-2 text-right pr-3">
                                    <span className="text-[11px] font-bold text-gray-300 tabular-nums">{String(hour).padStart(2, '0')}:00</span>
                                </div>
                                {weekDays.map((d) => {
                                    const hourRes = filteredReservations.filter(r =>
                                        r.date === d.date && parseInt(r.startTime.split(':')[0]) === hour && r.status !== 'cancelled'
                                    );
                                    const available = isStaffHourAvailable(d.date, hour);
                                    return (
                                        <div key={d.date + hour}
                                            className={cn(
                                                "border-r border-gray-50 p-1 min-h-[56px] transition-all duration-200",
                                                !available
                                                    ? "bg-gray-100/60 cursor-not-allowed"
                                                    : cn("cursor-pointer", d.isToday ? "bg-[#CCFF00]/[0.03] hover:bg-[#CCFF00]/[0.08]" : "hover:bg-gray-50"),
                                            )}
                                            onClick={() => { if (!available) return; setSelectedDate(d.date); setNewRes(p => ({ ...p, startTime: `${String(hour).padStart(2, '0')}:00`, endTime: `${String(hour + 1).padStart(2, '0')}:00` })); setShowNewDialog(true); }}
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
                    </div>
                )}

                {/* Day View */}
                {view === 'day' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
                        {/* Time slots */}
                        <div className="lg:col-span-2 rounded-2xl bg-white border border-gray-200/80 shadow-xl shadow-gray-200/50 overflow-hidden flex flex-col min-h-0">
                            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 flex-shrink-0">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-[#7a9900]" />
                                    <span className="text-sm font-bold text-gray-800">Saat Çizelgesi</span>
                                </div>
                                <span className="text-xs text-gray-400 font-medium">
                                    {filteredReservations.filter(r => r.date === currentDate.toISOString().split('T')[0] && r.status !== 'cancelled').length} randevu
                                </span>
                            </div>
                            <div className="divide-y divide-gray-50 flex-1 min-h-0 overflow-y-auto">
                                {HOURS.map((hour) => {
                                    const dateStr = currentDate.toISOString().split('T')[0];
                                    const hourRes = filteredReservations.filter(r =>
                                        r.date === dateStr && parseInt(r.startTime.split(':')[0]) === hour && r.status !== 'cancelled'
                                    );
                                    const now = new Date();
                                    const isCurrentHour = dateStr === today && now.getHours() === hour;
                                    const available = isStaffHourAvailable(dateStr, hour);

                                    return (
                                        <div key={hour}
                                            className={cn(
                                                "flex items-stretch min-h-[68px] transition-all duration-200",
                                                !available
                                                    ? "bg-gray-100/60 cursor-not-allowed opacity-70"
                                                    : cn("cursor-pointer group", isCurrentHour ? "bg-[#CCFF00]/[0.06]" : "hover:bg-gray-50/70"),
                                            )}
                                            onClick={() => { if (!available) return; setSelectedDate(dateStr); setNewRes(p => ({ ...p, startTime: `${String(hour).padStart(2, '0')}:00`, endTime: `${String(hour + 1).padStart(2, '0')}:00` })); setShowNewDialog(true); }}
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
                                    const dayRes = filteredReservations.filter(r => r.date === dateStr && r.status !== 'cancelled');
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
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={closeDialog} />
                    <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Dialog header gradient */}
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#CCFF00] via-[#CCFF00]/60 to-emerald-400/40" />

                        <button onClick={closeDialog} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all z-10">
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
                                {/* Akıllı Müşteri Arama */}
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] flex items-center gap-1.5 mb-2">
                                        <User className="w-3 h-3" /> Müşteri
                                    </label>

                                    {customerLocked ? (
                                        // Seçili müşteri kartı
                                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#CCFF00]/10 border border-[#CCFF00]/40">
                                            <div className="w-9 h-9 rounded-full bg-[#CCFF00] flex items-center justify-center flex-shrink-0">
                                                <Check className="w-4 h-4 text-slate-900" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-gray-900 truncate">{newRes.customerName}</p>
                                                <p className="text-xs text-gray-500 tabular-nums">{newRes.customerPhone}</p>
                                            </div>
                                            <button onClick={clearCustomer} className="p-1.5 rounded-lg hover:bg-white/60 text-gray-400 hover:text-gray-700 transition-all flex-shrink-0">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                                            <input
                                                type="text" placeholder="İsim ile ara veya yeni müşteri yaz..."
                                                autoFocus
                                                className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-300 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/15 outline-none transition-all"
                                                value={customerQuery}
                                                onChange={(e) => { setCustomerQuery(e.target.value); setNewRes(p => ({ ...p, customerName: e.target.value })); }}
                                            />
                                            {/* Eşleşen müşteriler */}
                                            {customerMatches.length > 0 && (
                                                <div className="absolute z-20 left-0 right-0 mt-1.5 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
                                                    {customerMatches.map((c) => (
                                                        <button
                                                            key={c.id}
                                                            onClick={() => selectCustomer(c)}
                                                            className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-[#CCFF00]/10 transition-colors text-left border-b border-gray-50 last:border-0"
                                                        >
                                                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-xs font-bold text-gray-500">
                                                                {c.name.charAt(0).toUpperCase()}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-semibold text-gray-800 truncate">{c.name}</p>
                                                                <p className="text-xs text-gray-400 tabular-nums">{c.phone}</p>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Telefon — sadece yeni müşteride göster */}
                                {!customerLocked && (
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2 block">Telefon</label>
                                        <input
                                            type="tel" placeholder="0532 xxx xxxx" inputMode="tel"
                                            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-300 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/15 outline-none transition-all"
                                            value={newRes.customerPhone} onChange={(e) => setNewRes(p => ({ ...p, customerPhone: e.target.value }))}
                                        />
                                    </div>
                                )}

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

                                {/* Personel seçimi */}
                                {staff.length > 0 && (
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2 block">Personel</label>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                onClick={() => setNewRes(p => ({ ...p, staffId: '' }))}
                                                className={cn(
                                                    "px-3 py-2 rounded-lg text-xs font-bold transition-all border",
                                                    !newRes.staffId
                                                        ? "bg-slate-900 text-white border-slate-900"
                                                        : "border-gray-200 text-gray-400 hover:border-gray-300 bg-gray-50"
                                                )}
                                            >
                                                Fark etmez
                                            </button>
                                            {staff.map(s => (
                                                <button
                                                    key={s.id}
                                                    onClick={() => setNewRes(p => ({ ...p, staffId: s.id }))}
                                                    className={cn(
                                                        "px-3 py-2 rounded-lg text-xs font-bold transition-all border",
                                                        newRes.staffId === s.id
                                                            ? "text-white border-transparent shadow-md"
                                                            : "border-gray-200 text-gray-400 hover:border-gray-300 bg-gray-50"
                                                    )}
                                                    style={newRes.staffId === s.id ? { backgroundColor: s.color, borderColor: s.color } : {}}
                                                >
                                                    {s.name}
                                                    {s.specialty && <span className="ml-1 opacity-70 font-normal">· {s.specialty}</span>}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

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
