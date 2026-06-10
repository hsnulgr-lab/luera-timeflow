import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Clock, User, X, Sparkles, Search, Check, Users, ChevronDown } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { useStaff } from '@/hooks/useStaff';
import { useCustomers } from '@/hooks/useCustomers';
import { cn } from '@/utils/cn';
import { textOn } from '@/utils/palette';
import { todayISO, toISODate, formatDateEU } from '@/utils/date';
import type { CalendarView, Reservation } from '@/types';

const DAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const DAYS_FULL = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 08:00 - 19:00

// ── Randevu Oluştur modalı tasarım tokenları (Luera v2) ───────────────────────
const M = {
    ink: '#0E0E0E', cream: '#F0EBE1', orange: '#FF5A1F',
    surface: '#FAF7F3', surface2: '#F3EDE4', surface3: '#EDE6DB',
    border: 'rgba(14,14,14,0.08)', border2: 'rgba(14,14,14,0.14)',
    muted: 'rgba(14,14,14,0.45)', muted2: 'rgba(14,14,14,0.26)',
};
const MONO = "'JetBrains Mono', monospace";

// ISO tarih ("2026-06-08") → "8 HAZİRAN 2026 · PAZARTESİ" (modal alt başlığı)
function modalDateLabel(iso: string): string {
    const [y, mo, d] = iso.split('-').map(Number);
    if (!y || !mo || !d) return iso;
    const dow = (new Date(iso + 'T12:00:00').getDay() + 6) % 7;
    return `${d} ${MONTHS_TR[mo - 1]} ${y} · ${DAYS_FULL[dow]}`;
}

// Field temel stili + turuncu focus davranışı
const fieldBase: React.CSSProperties = {
    width: '100%', background: M.surface2, border: `1px solid ${M.border2}`,
    borderRadius: 10, padding: '9px 12px', fontSize: 13.5, color: M.ink,
    outline: 'none', transition: 'all .15s', fontFamily: 'inherit',
};
const onFieldFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = M.orange;
    e.target.style.boxShadow = '0 0 0 3px rgba(255,90,31,.10)';
    e.target.style.background = M.surface;
};
const onFieldBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = M.border2;
    e.target.style.boxShadow = 'none';
    e.target.style.background = M.surface2;
};

// İki saat arası farkı dakika cinsinden ("11:00"→"11:30" = 30)
function durationMin(start: string, end: string): number {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return 0;
    let d = (eh * 60 + em) - (sh * 60 + sm);
    if (d < 0) d += 24 * 60;
    return d;
}

// Birleşik zaman bloğu CSS'i (Luera v2 — güncellenmiş tasarım)
const TIME_BLOCK_CSS = `
.lz-timeblock{display:grid;grid-template-columns:1fr auto 1fr;background:${M.surface2};border:1.5px solid ${M.border2};border-radius:10px;overflow:hidden}
.lz-ts{display:flex;flex-direction:column;gap:5px;padding:13px 16px;transition:background .15s;position:relative;cursor:pointer}
.lz-ts:hover{background:rgba(14,14,14,.02)}
.lz-ts:focus-within{background:${M.surface}}
.lz-ts:focus-within::after{content:'';position:absolute;inset:-1px;border-radius:10px;box-shadow:0 0 0 1.5px ${M.orange},0 0 0 4px rgba(255,90,31,.09);pointer-events:none;z-index:1}
.lz-ts-lbl{font-family:${MONO};font-size:7.5px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:${M.muted};line-height:1}
.lz-ts input[type="time"]{-webkit-appearance:none;appearance:none;border:none!important;background:transparent!important;box-shadow:none!important;outline:none;padding:0!important;margin:0;font-size:28px;font-weight:800;letter-spacing:-0.04em;color:${M.ink};width:100%;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;line-height:1}
.lz-ts input[type="time"]::-webkit-calendar-picker-indicator{opacity:0;position:absolute;inset:0;width:100%;height:100%;cursor:pointer}
.lz-ts-mid{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:10px 14px;border-left:1px solid ${M.border};border-right:1px solid ${M.border}}
.lz-ts-mid-line{width:1px;flex:1;min-height:5px;background:${M.border2}}
.lz-ts-dur{font-family:${MONO};font-size:9px;font-weight:700;letter-spacing:.07em;color:${M.orange};white-space:nowrap;background:rgba(255,90,31,.09);padding:4px 9px;border-radius:999px}
@keyframes lz-successIn{0%{opacity:0;transform:scale(.85)}60%{transform:scale(1.08)}100%{opacity:1;transform:scale(1)}}
`;

// Bölüm etiketi: mono uppercase + arkasında ince çizgi
function MLabel({ children, optional }: { children: React.ReactNode; optional?: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <span style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: M.muted, whiteSpace: 'nowrap' }}>
                {children}
                {optional && <span style={{ fontFamily: 'inherit', textTransform: 'none', letterSpacing: 0, fontWeight: 400, fontSize: 10, opacity: .6, marginLeft: 4 }}>{optional}</span>}
            </span>
            <span style={{ flex: 1, height: 1, background: M.border }} />
        </div>
    );
}

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
    // Randevu oluşturulduktan sonra gösterilecek başarı özeti (null = form görünür)
    const [successData, setSuccessData] = useState<null | {
        customerName: string; customerPhone: string; service: string; duration: number;
        dateLabel: string; startTime: string; endTime: string; staffName: string; staffColor?: string; serviceColor: string;
    }>(null);

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
        setSuccessData(null);
        setNewRes({ customerName: '', customerPhone: '', customerEmail: '', service: settings.services[0]?.name || '', startTime: '09:00', endTime: '09:30', notes: '', staffId: '' });
    };

    // Başarı ekranından "Yeni Randevu Oluştur" → formu sıfırla, modal açık kalsın
    const resetForm = () => {
        setSuccessData(null);
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

    const today = todayISO();

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
                date: toISODate(d),
                day: d.getDate(),
                dayName: DAYS_TR[i],
                fullName: DAYS_FULL[i],
                isToday: toISODate(d) === today,
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
        const svc = settings.services.find(s => s.name === newRes.service);
        const serviceColor = svc?.color || '#FF5A1F';
        const reservation = await addReservation({
            customerId: '',
            customerName: newRes.customerName,
            customerPhone: newRes.customerPhone,
            customerEmail: newRes.customerEmail,
            date: selectedDate,
            startTime: newRes.startTime,
            endTime: newRes.endTime,
            service: newRes.service,
            serviceColor,
            status: 'pending',
            notes: newRes.notes,
            staffId: newRes.staffId || undefined,
            staffName: selectedStaff?.name,
            staffColor: selectedStaff?.color,
        });

        if (reservation) {
            // Formu kapatma — başarı özetini göster
            setSuccessData({
                customerName: newRes.customerName,
                customerPhone: newRes.customerPhone,
                service: newRes.service,
                duration: svc?.duration ?? durationMin(newRes.startTime, newRes.endTime),
                dateLabel: formatDateEU(selectedDate),
                startTime: newRes.startTime,
                endTime: newRes.endTime,
                staffName: selectedStaff?.name || 'Fark etmez',
                staffColor: selectedStaff?.color,
                serviceColor,
            });
        }
    };

    const dayReservations = selectedDate ? filteredReservations.filter(r => r.date === selectedDate) : [];

    const todayCount = filteredReservations.filter(r => r.date === today && r.status !== 'cancelled').length;
    const weekTotal = weekDays.reduce((sum, d) => sum + getDateCount(d.date), 0);

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tek Satır Araç Çubuğu */}
            <div className="relative px-3 sm:px-6 py-3 border-b border-[#0E0E0E]/[0.08] bg-[#FAF7F3]">
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
                            className="ml-1 px-3.5 py-1.5 rounded-full text-xs font-bold text-[#0E0E0E] bg-[#FAF7F3] border border-[#0E0E0E]/[0.14] hover:border-[#0E0E0E] transition-all active:scale-95"
                        >
                            Bugün
                        </button>
                    </div>

                    {/* Küçük sayaçlar */}
                    <div className="hidden lg:flex items-center gap-1.5 pl-3 ml-1 border-l border-[#0E0E0E]/[0.1]">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#0E0E0E] px-2.5 py-1 rounded-full bg-[#FAF7F3] border border-[#0E0E0E]/[0.08]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A1F]" />
                            Bugün <span className="tabular-nums">{todayCount}</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#0E0E0E] px-2.5 py-1 rounded-full bg-[#FAF7F3] border border-[#0E0E0E]/[0.08]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#0E0E0E]/50" />
                            Hafta <span className="tabular-nums">{weekTotal}</span>
                        </span>
                    </div>

                    {/* Sağ: Görünüm + Filtre + Ekle */}
                    <div className="flex flex-wrap items-center gap-2 ml-auto justify-end">
                        {/* Görünüm anahtarı */}
                        <div className="flex items-center bg-[#F3EDE4] rounded-full p-[3px] gap-0.5">
                            {(['month', 'week', 'day'] as CalendarView[]).map((v) => (
                                <button
                                    key={v}
                                    onClick={() => setView(v)}
                                    className={cn(
                                        "px-4 py-1.5 rounded-full text-xs font-bold transition-all",
                                        view === v
                                            ? "bg-[#FAF7F3] text-[#0E0E0E] shadow-[0_1px_3px_rgba(14,14,14,0.06)]"
                                            : "text-[#0E0E0E]/[0.45] hover:text-[#0E0E0E]"
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
                                        "flex items-center gap-2 pl-2.5 pr-2 py-2 rounded-full border bg-[#FAF7F3] text-sm font-medium transition-all",
                                        staffMenuOpen ? "border-[#0E0E0E] ring-2 ring-[#FF5A1F]/15" : "border-[#0E0E0E]/[0.08] hover:border-[#0E0E0E]"
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
                                            {staffFilter === 'all' && <Check className="w-4 h-4 text-[#FF5A1F] flex-shrink-0" />}
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
                                                {staffFilter === s.id && <Check className="w-4 h-4 text-[#FF5A1F] flex-shrink-0" />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            onClick={() => { setSelectedDate(today); setShowNewDialog(true); }}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm bg-[#0E0E0E] text-[#F0EBE1] hover:bg-[#FF5A1F] hover:-translate-y-px hover:shadow-[0_6px_18px_rgba(255,90,31,0.28)] transition-all active:translate-y-0"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">Randevu Oluştur</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Calendar Content */}
            <div className="px-3 sm:px-6 pb-3 pt-3 flex-1 flex flex-col min-h-0">
                {/* Month View */}
                {view === 'month' && (
                    <div className="rounded-2xl bg-[#FAF7F3] border border-[#0E0E0E]/[0.08] shadow-[0_2px_8px_rgba(14,14,14,0.07),0_8px_24px_rgba(14,14,14,0.06)] overflow-hidden flex-1 flex flex-col">
                        {/* Day headers */}
                        <div className="grid grid-cols-7 bg-[#F3EDE4] border-b border-[#0E0E0E]/[0.08]">
                            {DAYS_TR.map((d, i) => (
                                <div key={d} className={cn(
                                    "py-3 px-3 text-[9.5px] font-extrabold uppercase tracking-[0.12em]",
                                    i >= 5 ? "text-[#0E0E0E]/[0.28]" : "text-[#0E0E0E]/[0.45]"
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
                                            "relative flex flex-col px-2 pt-2 pb-1.5 border-b border-r border-[#0E0E0E]/[0.08] text-left transition-colors duration-150 group overflow-hidden min-h-0",
                                            !isCurrentMonth && "bg-[#0E0E0E]/[0.018]",
                                            isToday && "bg-[#FF5A1F]/[0.06]",
                                            "hover:bg-[#F3EDE4]",
                                        )}
                                    >
                                        <div className="flex items-center justify-between flex-shrink-0 mb-1">
                                            <span className={cn(
                                                "inline-flex items-center justify-center text-[12.5px] font-extrabold transition-all",
                                                isToday
                                                    ? "w-[24px] h-[24px] rounded-full bg-[#FF5A1F] text-[#F0EBE1]"
                                                    : !isCurrentMonth ? "text-[#0E0E0E]/30"
                                                        : isWeekend ? "text-[#0E0E0E]/[0.45]" : "text-[#0E0E0E]",
                                            )}>
                                                {day}
                                            </span>
                                        </div>

                                        {count > 0 && (
                                            <div className="space-y-[3px] overflow-hidden min-h-0">
                                                {dateReservations.slice(0, 2).map((r) => {
                                                    const pending = r.status === 'pending';
                                                    return (
                                                        <div
                                                            key={r.id}
                                                            className={cn(
                                                                "relative flex items-center gap-1.5 pl-[9px] pr-1.5 py-1 rounded-[6px] text-[10.5px] font-semibold overflow-hidden transition-colors",
                                                                pending ? "bg-[#FF5A1F]/[0.10] text-[#E8430F]" : "bg-[#EDE6DB] text-[#0E0E0E] group-hover:bg-[#F3EDE4]"
                                                            )}
                                                            style={{ '--bar': r.serviceColor || (pending ? '#FF5A1F' : 'rgba(14,14,14,0.35)') } as React.CSSProperties}
                                                        >
                                                            <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[3px]" style={{ background: 'var(--bar)' }} />
                                                            <span className="text-[9px] font-bold opacity-70 tabular-nums flex-shrink-0">{r.startTime}</span>
                                                            <span className="truncate">{r.customerName.split(' ')[0]}</span>
                                                        </div>
                                                    );
                                                })}
                                                {count > 2 && (
                                                    <span className="block text-[10px] text-[#0E0E0E]/[0.45] pl-1 pt-0.5 font-bold flex-shrink-0">+{count - 2} randevu daha</span>
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
                    <div className="rounded-2xl bg-[#FAF7F3] border border-[#0E0E0E]/[0.08] shadow-[0_2px_8px_rgba(14,14,14,0.07)] overflow-hidden flex-1 flex flex-col min-h-0">
                        <div className="grid grid-cols-8 flex-shrink-0 bg-[#F3EDE4]">
                            <div className="border-r border-[#0E0E0E]/[0.10] p-3 flex items-end bg-[#F3EDE4]">
                                <Clock className="w-3.5 h-3.5 text-[#0E0E0E]/30" />
                            </div>
                            {weekDays.map((d) => (
                                <div key={d.date}
                                    className={cn(
                                        "p-3 text-center border-r border-b border-[#0E0E0E]/[0.10] relative",
                                        d.isToday ? "bg-[#FF5A1F]/[0.08]" : "bg-[#F3EDE4]"
                                    )}
                                >
                                    {d.isToday && <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#FF5A1F] to-transparent" />}
                                    <span className={cn(
                                        "text-[11px] font-bold uppercase tracking-wider",
                                        d.isToday ? "text-[#FF5A1F]" : "text-gray-400"
                                    )}>{d.dayName}</span>
                                    <span className={cn(
                                        "block text-lg font-bold mt-0.5",
                                        d.isToday ? "text-[#E8430F]" : "text-gray-800"
                                    )}>{d.day}</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto">
                        {HOURS.map((hour) => (
                            <div key={hour} className="grid grid-cols-8 border-b border-[#0E0E0E]/[0.07]">
                                <div className="border-r border-[#0E0E0E]/[0.10] p-2 text-right pr-3 bg-[#F3EDE4]">
                                    <span className="text-[11px] font-bold text-[#0E0E0E]/40 tabular-nums">{String(hour).padStart(2, '0')}:00</span>
                                </div>
                                {weekDays.map((d) => {
                                    const hourRes = filteredReservations.filter(r =>
                                        r.date === d.date && parseInt(r.startTime.split(':')[0]) === hour && r.status !== 'cancelled'
                                    );
                                    const available = isStaffHourAvailable(d.date, hour);
                                    return (
                                        <div key={d.date + hour}
                                            className={cn(
                                                "border-r border-[#0E0E0E]/[0.07] p-1 min-h-[56px] transition-all duration-200",
                                                !available
                                                    ? "bg-[#0E0E0E]/[0.03] cursor-not-allowed"
                                                    : cn("cursor-pointer", d.isToday ? "bg-[#FF5A1F]/[0.03] hover:bg-[#FF5A1F]/[0.07]" : "hover:bg-[#F3EDE4]/60"),
                                            )}
                                            onClick={() => { if (!available) return; setSelectedDate(d.date); setNewRes(p => ({ ...p, startTime: `${String(hour).padStart(2, '0')}:00`, endTime: `${String(hour + 1).padStart(2, '0')}:00` })); setShowNewDialog(true); }}
                                        >
                                            {hourRes.map((r) => {
                                                const blockStyle = r.status === 'pending'
                                                    ? "bg-[#FF5A1F]/[0.13] text-[#E8430F] border border-[#FF5A1F]/25 hover:bg-[#FF5A1F]/20"
                                                    : r.status === 'completed'
                                                        ? "bg-[#EDE6DB] text-[#0E0E0E]/[0.45] border border-[#0E0E0E]/[0.08] hover:bg-[#F3EDE4]"
                                                        : "bg-[#0E0E0E] text-[#F0EBE1] border border-transparent hover:bg-[#1c1c1c]";
                                                return (
                                                    <div key={r.id}
                                                        className={cn(
                                                            "px-2 py-1.5 rounded-lg mb-0.5 transition-all hover:scale-[1.02] overflow-hidden",
                                                            blockStyle
                                                        )}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <span className="block text-[10.5px] font-bold leading-tight truncate">{r.customerName.split(' ')[0]}</span>
                                                        <span className="block text-[9px] opacity-70 leading-tight truncate">{r.service}</span>
                                                    </div>
                                                );
                                            })}
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
                        <div className="lg:col-span-2 rounded-2xl bg-[#FAF7F3] border border-[#0E0E0E]/[0.08] shadow-[0_2px_8px_rgba(14,14,14,0.07)] overflow-hidden flex flex-col min-h-0">
                            <div className="px-5 py-4 border-b border-[#0E0E0E]/[0.08] flex items-center justify-between bg-[#F3EDE4] flex-shrink-0">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-[#FF5A1F]" />
                                    <span className="text-sm font-bold text-[#0E0E0E]">Saat Çizelgesi</span>
                                </div>
                                <span className="text-xs text-[#0E0E0E]/[0.45] font-medium">
                                    {filteredReservations.filter(r => r.date === toISODate(currentDate) && r.status !== 'cancelled').length} randevu
                                </span>
                            </div>
                            <div className="divide-y divide-[#0E0E0E]/[0.07] flex-1 min-h-0 overflow-y-auto">
                                {HOURS.map((hour) => {
                                    const dateStr = toISODate(currentDate);
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
                                                    ? "bg-[#0E0E0E]/[0.03] cursor-not-allowed opacity-70"
                                                    : cn("cursor-pointer group", isCurrentHour ? "bg-[#FF5A1F]/[0.06]" : "hover:bg-[#F3EDE4]/60"),
                                            )}
                                            onClick={() => { if (!available) return; setSelectedDate(dateStr); setNewRes(p => ({ ...p, startTime: `${String(hour).padStart(2, '0')}:00`, endTime: `${String(hour + 1).padStart(2, '0')}:00` })); setShowNewDialog(true); }}
                                        >
                                            <div className="w-[72px] flex-shrink-0 p-3 border-r border-[#0E0E0E]/[0.08] bg-[#F3EDE4]/40 text-right relative">
                                                {isCurrentHour && <div className="absolute top-1/2 right-0 w-2 h-2 rounded-full bg-[#FF5A1F] -translate-y-1/2 translate-x-1 shadow-lg shadow-[#FF5A1F]/50" />}
                                                <span className={cn(
                                                    "text-xs font-bold tabular-nums",
                                                    isCurrentHour ? "text-[#FF5A1F]" : "text-[#0E0E0E]/40"
                                                )}>
                                                    {String(hour).padStart(2, '0')}:00
                                                </span>
                                            </div>
                                            <div className="flex-1 p-2 space-y-1.5">
                                                {hourRes.map((r) => (
                                                    <div key={r.id}
                                                        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#0E0E0E]/[0.08] bg-[#FAF7F3] shadow-sm transition-all duration-200 hover:shadow-md hover:bg-[#F3EDE4]"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: r.serviceColor || '#FF5A1F' }} />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-bold text-[#0E0E0E] truncate">{r.customerName}</p>
                                                            <p className="text-[11px] text-[#0E0E0E]/[0.45] tabular-nums">{r.startTime} - {r.endTime} · {r.service}</p>
                                                        </div>
                                                        <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold border flex-shrink-0", statusConfig[r.status]?.bg, statusConfig[r.status]?.color)}>
                                                            {statusConfig[r.status]?.label}
                                                        </span>
                                                    </div>
                                                ))}
                                                {hourRes.length === 0 && (
                                                    <div className="flex items-center justify-center h-full opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                                        <span className="text-[11px] text-[#0E0E0E]/30 flex items-center gap-1">
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
                            <div className="rounded-2xl bg-[#FAF7F3] border border-[#0E0E0E]/[0.08] shadow-[0_2px_8px_rgba(14,14,14,0.07)] overflow-hidden">
                                <div className="flex items-center gap-2 px-5 pt-5 pb-4">
                                    <div className="w-7 h-7 rounded-lg bg-[#0E0E0E] grid place-items-center flex-shrink-0">
                                        <Sparkles className="w-3.5 h-3.5 text-[#FF5A1F]" />
                                    </div>
                                    <h3 className="text-sm font-bold text-[#0E0E0E]">Günün Özeti</h3>
                                </div>

                                {(() => {
                                    const dateStr = toISODate(currentDate);
                                    const dayRes = filteredReservations.filter(r => r.date === dateStr && r.status !== 'cancelled');
                                    const pending = dayRes.filter(r => r.status === 'pending').length;
                                    const confirmed = dayRes.filter(r => r.status === 'confirmed').length;

                                    return (
                                        <>
                                            <div className="grid grid-cols-3 border-y border-[#0E0E0E]/[0.08]">
                                                <div className="text-center py-3.5 px-2 border-r border-[#0E0E0E]/[0.08]">
                                                    <p className="text-[22px] font-black text-[#0E0E0E] tracking-[-0.04em] leading-none">{dayRes.length}</p>
                                                    <p className="text-[9px] text-[#0E0E0E]/[0.45] uppercase tracking-[0.08em] font-bold mt-1.5">Toplam</p>
                                                </div>
                                                <div className="text-center py-3.5 px-2 border-r border-[#0E0E0E]/[0.08]">
                                                    <p className="text-[22px] font-black text-[#B87A00] tracking-[-0.04em] leading-none">{pending}</p>
                                                    <p className="text-[9px] text-[#B87A00] uppercase tracking-[0.08em] font-bold mt-1.5">Bekleyen</p>
                                                </div>
                                                <div className="text-center py-3.5 px-2">
                                                    <p className="text-[22px] font-black text-[#2D8F32] tracking-[-0.04em] leading-none">{confirmed}</p>
                                                    <p className="text-[9px] text-[#2D8F32] uppercase tracking-[0.08em] font-bold mt-1.5">Onaylı</p>
                                                </div>
                                            </div>

                                            {dayRes.length > 0 ? (
                                                <div className="p-3.5 space-y-2">
                                                    <p className="text-[9.5px] text-[#0E0E0E]/[0.45] uppercase tracking-[0.1em] font-bold mb-1 px-1">Program</p>
                                                    {dayRes.sort((a, b) => a.startTime.localeCompare(b.startTime)).map((r) => (
                                                        <div key={r.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#F3EDE4] border border-[#0E0E0E]/[0.06] hover:bg-[#EDE6DB] transition-all">
                                                            <div className="flex-shrink-0 w-1 h-8 rounded-full" style={{ backgroundColor: r.serviceColor || '#FF5A1F' }} />
                                                            <span className="text-xs font-black text-[#E8430F] tabular-nums w-10 flex-shrink-0">{r.startTime}</span>
                                                            <div className="flex-1 min-w-0">
                                                                <span className="text-[13px] text-[#0E0E0E] font-bold truncate block leading-tight">{r.customerName}</span>
                                                                <span className="text-[10.5px] text-[#0E0E0E]/[0.45] truncate block">{r.service}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-8">
                                                    <CalendarIcon className="w-8 h-8 text-[#0E0E0E]/[0.18] mx-auto mb-2" />
                                                    <p className="text-xs text-[#0E0E0E]/[0.45]">Bu gün için randevu yok</p>
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

            {/* New Reservation Dialog — Luera v2 */}
            {showNewDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={closeDialog} />
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full animate-in fade-in zoom-in-95 duration-200 flex flex-col"
                        style={{ maxWidth: 500, maxHeight: '90vh', background: M.surface, borderRadius: 22, boxShadow: '0 8px 48px rgba(14,14,14,.18), 0 2px 8px rgba(14,14,14,.08)' }}
                    >
                        <style>{TIME_BLOCK_CSS}</style>
                        {/* HEADER */}
                        <div className="flex items-center gap-3 flex-shrink-0" style={{ padding: '15px 18px 13px', borderBottom: `1px solid ${M.border}` }}>
                            <div className="relative grid place-items-center flex-shrink-0 overflow-hidden" style={{ width: 38, height: 38, borderRadius: 11, background: M.ink }}>
                                <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 68% 22%, rgba(255,90,31,.30), transparent 58%)' }} />
                                <Plus className="relative w-[17px] h-[17px]" style={{ color: M.cream }} strokeWidth={2.4} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.022em', color: M.ink }}>Yeni Randevu</div>
                                <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: '.13em', textTransform: 'uppercase', color: M.orange, marginTop: 3 }}>{modalDateLabel(selectedDate ?? '')}</div>
                            </div>
                            <button onClick={closeDialog} title="Kapat" className="grid place-items-center flex-shrink-0 transition-all" style={{ width: 32, height: 32, borderRadius: 7, color: M.muted }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = M.surface2; e.currentTarget.style.color = M.ink; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = M.muted; }}>
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* ── BAŞARI EKRANI ── */}
                        {successData && (
                            <div className="flex flex-col items-center text-center" style={{ gap: 16, padding: '40px 24px 28px' }}>
                                <div className="grid place-items-center" style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,90,31,.10)', animation: 'lz-successIn .4s cubic-bezier(.22,.8,.2,1) both' }}>
                                    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                                        <path d="M6 16l7 7L26 10" stroke={M.orange} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </div>
                                <div>
                                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.025em', color: M.ink }}>Randevu Oluşturuldu</div>
                                    <div style={{ fontSize: 13, color: M.muted, lineHeight: 1.6, maxWidth: 270, marginTop: 4 }}>Takvime eklendi ve müşteriye onay bildirimi gönderildi.</div>
                                </div>
                                {/* Özet kartı */}
                                <div className="w-full flex flex-col text-left" style={{ background: M.surface2, border: `1px solid ${M.border}`, borderRadius: 10, padding: '14px 18px', gap: 8 }}>
                                    {([
                                        ['Müşteri', successData.customerName],
                                        ...(successData.customerPhone ? [['Telefon', successData.customerPhone]] : []),
                                        ['Hizmet', `${successData.service} · ${successData.duration}dk`, successData.serviceColor],
                                        ['Tarih', successData.dateLabel],
                                        ['Saat', `${successData.startTime} – ${successData.endTime}`],
                                        ['Personel', successData.staffName, successData.staffColor],
                                    ] as [string, string, string?][]).map(([k, v, dot], i) => (
                                        <div key={i} className="flex items-baseline justify-between" style={{ gap: 16 }}>
                                            <span style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '.15em', textTransform: 'uppercase', color: M.muted, flexShrink: 0 }}>{k}</span>
                                            <span className="text-right inline-flex items-center" style={{ gap: 6, fontSize: 13, fontWeight: 700, color: M.ink }}>
                                                {dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />}
                                                {v}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                {/* Yeni randevu butonu */}
                                <button onClick={resetForm} className="inline-flex items-center justify-center gap-2 w-full transition-all" style={{ marginTop: 4, height: 46, borderRadius: 999, fontWeight: 700, fontSize: 14.5, letterSpacing: '-0.01em', background: M.orange, color: M.ink }}
                                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(255,90,31,.32)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                                    Yeni Randevu Oluştur
                                    <span style={{ fontSize: 16, lineHeight: 1 }}>→</span>
                                </button>
                            </div>
                        )}

                        {/* BODY */}
                        {!successData && (
                        <div className="flex-1 overflow-y-auto flex flex-col" style={{ padding: '14px 18px 8px', gap: 16 }}>

                            {/* MÜŞTERİ */}
                            <div>
                                <MLabel>Müşteri</MLabel>
                                {customerLocked ? (
                                    <div className="flex items-center gap-3" style={{ padding: '9px 12px', borderRadius: 10, background: 'rgba(255,90,31,.08)', border: `1px solid rgba(255,90,31,.30)` }}>
                                        <div className="grid place-items-center flex-shrink-0" style={{ width: 32, height: 32, borderRadius: '50%', background: M.orange }}>
                                            <Check className="w-4 h-4" style={{ color: M.ink }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="truncate" style={{ fontSize: 13.5, fontWeight: 700, color: M.ink }}>{newRes.customerName}</p>
                                            <p style={{ fontSize: 11, color: M.muted, fontFamily: MONO, letterSpacing: '.04em' }}>{newRes.customerPhone}</p>
                                        </div>
                                        <button onClick={clearCustomer} className="grid place-items-center flex-shrink-0 transition-all" style={{ width: 28, height: 28, borderRadius: 7, color: M.muted }}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.6)'; e.currentTarget.style.color = M.ink; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = M.muted; }}>
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[15px] h-[15px] pointer-events-none" style={{ color: M.muted2 }} />
                                        <input
                                            type="text" placeholder="İsim ile ara veya yeni müşteri yaz…"
                                            autoFocus autoComplete="off" spellCheck={false}
                                            style={{ ...fieldBase, paddingLeft: 34 }}
                                            onFocus={onFieldFocus} onBlur={onFieldBlur}
                                            value={customerQuery}
                                            onChange={(e) => { setCustomerQuery(e.target.value); setNewRes(p => ({ ...p, customerName: e.target.value })); }}
                                        />
                                        {customerMatches.length > 0 && (
                                            <div className="absolute z-20 left-0 right-0 overflow-hidden" style={{ top: 'calc(100% + 5px)', background: M.surface, border: `1px solid ${M.border2}`, borderRadius: 10, boxShadow: '0 4px 16px rgba(14,14,14,0.11), 0 16px 48px rgba(14,14,14,0.10)' }}>
                                                {customerMatches.map((c) => (
                                                    <button key={c.id} onClick={() => selectCustomer(c)} className="flex items-center gap-2.5 w-full text-left transition-colors" style={{ padding: '9px 12px' }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = M.surface2}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                                                        <div className="grid place-items-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: '50%', background: M.ink, color: M.cream, fontSize: 10.5, fontWeight: 800 }}>
                                                            {c.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="truncate" style={{ fontSize: 13, fontWeight: 650, color: M.ink }}>{c.name}</p>
                                                            <p style={{ fontSize: 10.5, color: M.muted, fontFamily: MONO, letterSpacing: '.04em' }}>{c.phone}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* TELEFON */}
                            {!customerLocked && (
                                <div>
                                    <MLabel>Telefon</MLabel>
                                    <input
                                        type="tel" placeholder="0532 xxx xxxx" inputMode="tel"
                                        style={{ ...fieldBase, letterSpacing: '.04em' }}
                                        onFocus={onFieldFocus} onBlur={onFieldBlur}
                                        value={newRes.customerPhone} onChange={(e) => setNewRes(p => ({ ...p, customerPhone: e.target.value }))}
                                    />
                                </div>
                            )}

                            {/* HİZMET */}
                            <div>
                                <MLabel>Hizmet</MLabel>
                                <div className="flex flex-wrap" style={{ gap: 5 }}>
                                    {settings.services.map((s) => {
                                        const sel = newRes.service === s.name;
                                        return (
                                            <button
                                                key={s.id}
                                                onClick={() => {
                                                    const [h, m] = newRes.startTime.split(':').map(Number);
                                                    const endMin = h * 60 + m + s.duration;
                                                    setNewRes(p => ({ ...p, service: s.name, endTime: `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}` }));
                                                }}
                                                className="inline-flex items-center transition-all whitespace-nowrap"
                                                style={{
                                                    padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, lineHeight: 1.2,
                                                    border: `1px solid ${sel ? s.color : M.border2}`,
                                                    background: sel ? s.color : M.surface2,
                                                    color: sel ? textOn(s.color) : M.muted,
                                                    boxShadow: sel ? `0 2px 10px ${s.color}40` : 'none',
                                                }}
                                            >
                                                {s.name}
                                                <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '.04em', marginLeft: 5, opacity: sel ? .75 : .62 }}>{s.duration}dk</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ZAMAN */}
                            <div>
                                <MLabel>Zaman</MLabel>
                                <div className="lz-timeblock">
                                    <div className="lz-ts" onClick={(e) => { const i = e.currentTarget.querySelector('input'); (i as HTMLInputElement & { showPicker?: () => void })?.showPicker?.(); }}>
                                        <div className="lz-ts-lbl">Başlangıç</div>
                                        <input type="time" value={newRes.startTime} onChange={(e) => setNewRes(p => ({ ...p, startTime: e.target.value }))} />
                                    </div>
                                    <div className="lz-ts-mid">
                                        <div className="lz-ts-mid-line" />
                                        <div className="lz-ts-dur">{durationMin(newRes.startTime, newRes.endTime)} dk</div>
                                        <div className="lz-ts-mid-line" />
                                    </div>
                                    <div className="lz-ts" onClick={(e) => { const i = e.currentTarget.querySelector('input'); (i as HTMLInputElement & { showPicker?: () => void })?.showPicker?.(); }}>
                                        <div className="lz-ts-lbl">Bitiş</div>
                                        <input type="time" value={newRes.endTime} onChange={(e) => setNewRes(p => ({ ...p, endTime: e.target.value }))} />
                                    </div>
                                </div>
                            </div>

                            {/* PERSONEL */}
                            {staff.length > 0 && (
                                <div>
                                    <MLabel>Personel</MLabel>
                                    <div className="flex flex-wrap" style={{ gap: 5 }}>
                                        <button
                                            onClick={() => setNewRes(p => ({ ...p, staffId: '' }))}
                                            className="inline-flex items-center transition-all whitespace-nowrap"
                                            style={{
                                                padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, lineHeight: 1.2,
                                                border: `1px solid ${!newRes.staffId ? M.ink : M.border2}`,
                                                background: !newRes.staffId ? M.ink : M.surface2,
                                                color: !newRes.staffId ? M.cream : M.muted,
                                                boxShadow: !newRes.staffId ? '0 2px 10px rgba(14,14,14,.14)' : 'none',
                                            }}
                                        >
                                            Fark etmez
                                        </button>
                                        {staff.map(s => {
                                            const sel = newRes.staffId === s.id;
                                            return (
                                                <button
                                                    key={s.id}
                                                    onClick={() => setNewRes(p => ({ ...p, staffId: s.id }))}
                                                    className="inline-flex items-center transition-all whitespace-nowrap"
                                                    style={{
                                                        padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, lineHeight: 1.2,
                                                        border: `1px solid ${sel ? s.color : M.border2}`,
                                                        background: sel ? s.color : M.surface2,
                                                        color: sel ? textOn(s.color) : M.muted,
                                                        boxShadow: sel ? `0 2px 10px ${s.color}40` : 'none',
                                                    }}
                                                >
                                                    <span style={{ fontWeight: 750 }}>{s.name}</span>
                                                    {s.specialty && <span style={{ fontSize: 10.5, fontWeight: 500, opacity: sel ? .7 : .58, marginLeft: 4 }}>· {s.specialty}</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* NOT */}
                            <div style={{ paddingBottom: 6 }}>
                                <MLabel optional="(opsiyonel)">Not</MLabel>
                                <textarea
                                    placeholder="Ek bilgi, özel istek…" rows={2}
                                    style={{ ...fieldBase, height: 60, resize: 'none', lineHeight: 1.55 }}
                                    onFocus={onFieldFocus} onBlur={onFieldBlur}
                                    value={newRes.notes} onChange={(e) => setNewRes(p => ({ ...p, notes: e.target.value }))}
                                />
                            </div>
                        </div>
                        )}

                        {/* FOOTER */}
                        {!successData && (
                        <div className="flex-shrink-0 flex flex-col" style={{ padding: '10px 18px 15px', borderTop: `1px solid ${M.border}`, gap: 4 }}>
                            <button
                                onClick={handleCreateReservation}
                                disabled={!newRes.customerName || !newRes.customerPhone}
                                className="inline-flex items-center justify-center gap-2 w-full transition-all"
                                style={{
                                    height: 46, borderRadius: 999, fontWeight: 700, fontSize: 14.5, letterSpacing: '-0.01em',
                                    background: M.orange, color: M.ink,
                                    opacity: (!newRes.customerName || !newRes.customerPhone) ? .42 : 1,
                                    cursor: (!newRes.customerName || !newRes.customerPhone) ? 'not-allowed' : 'pointer',
                                }}
                                onMouseEnter={(e) => { if (newRes.customerName && newRes.customerPhone) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(255,90,31,.32)'; } }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                Randevu Oluştur
                                <span style={{ fontSize: 16, lineHeight: 1 }}>→</span>
                            </button>
                            <button onClick={closeDialog} className="w-full transition-colors" style={{ height: 36, fontSize: 12.5, fontWeight: 600, color: M.muted, background: 'transparent' }}
                                onMouseEnter={(e) => e.currentTarget.style.color = M.ink}
                                onMouseLeave={(e) => e.currentTarget.style.color = M.muted}>
                                Vazgeç
                            </button>
                        </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
