import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Clock, User, X, Sparkles, Search, Check, Users, ChevronDown } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { useStaff } from '@/hooks/useStaff';
import { useCustomers } from '@/hooks/useCustomers';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/utils/cn';
import { useTheme } from '@/contexts/ThemeContext';
import { textOn } from '@/utils/palette';
import { todayISO, toISODate, formatDateEU } from '@/utils/date';
import { STATUS_BADGE, STATUS_LABEL } from '@/utils/statusColors';
import { AdisyonModal } from '@/components/reservations/AdisyonModal';
import { EditReservationModal } from '@/components/reservations/EditReservationModal';
import type { CalendarView, Reservation } from '@/types';

const DAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const DAYS_FULL = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 08:00 - 19:00

// ── Randevu Oluştur modalı tasarım tokenları (Luera v2) ───────────────────────
// Renkler dashboard'ın --dc-* tema değişkenlerine bağlı: kök ".dash-theme[.dark]"
// sarmalayıcısı sayesinde inline stiller + <style> bloğu otomatik tema-duyarlı olur.
const M = {
    ink: 'var(--dc-ink)', cream: 'var(--dc-inkbox-fg)', orange: '#FF5A1F',
    surface: 'var(--dc-surface)', surface2: 'var(--dc-surface2)', surface3: 'var(--dc-surface3)',
    border: 'var(--dc-border)', border2: 'var(--dc-border2)',
    muted: 'var(--dc-muted)', muted2: 'var(--dc-muted2)',
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

export const CalendarPage = () => {
    const { dark } = useTheme();
    const { reservations, addReservation, settings, checkConflict } = useReservations();
    const { staff } = useStaff();
    const { allCustomers } = useCustomers();
    const [staffFilter, setStaffFilter] = useState<string>('all');
    const [staffMenuOpen, setStaffMenuOpen] = useState(false);
    const staffMenuRef = useRef<HTMLDivElement>(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState<CalendarView>('month');
    const isMobile = useIsMobile();
    // Mobilde hafta görünümü 8 sütuna sığmaz → gün görünümüne düş
    useEffect(() => {
        if (isMobile && view === 'week') setView('day');
    }, [isMobile, view]);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [adisyonRes, setAdisyonRes] = useState<Reservation | null>(null);
    const [editRes, setEditRes] = useState<Reservation | null>(null);
    const [showNewDialog, setShowNewDialog] = useState(false);
    // Dashboard "Yeni Randevu" CTA'sı kullanıcıyı boş takvime bırakmasın:
    // ?new=1 ile gelince oluşturma diyaloğu doğrudan açılır (param temizlenir).
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('new') === '1') {
            setSelectedDate(todayISO());
            setShowNewDialog(true);
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, []);
    const [creatingReservation, setCreatingReservation] = useState(false);
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
    const [recurrence, setRecurrence] = useState<{ rule: '' | 'weekly' | 'monthly'; until: string }>({ rule: '', until: '' });
    // Çoklu işlem (hizmet+personel+saat) — aynı müşteri/tarih için birden çok hizmet
    const [resLines, setResLines] = useState<{ id: string; service: string; serviceColor: string; staffId: string; staffName?: string; staffColor?: string; startTime: string; endTime: string }[]>([]);

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
        setRecurrence({ rule: '', until: '' });
        setResLines([]);
    };

    // Başarı ekranından "Yeni Randevu Oluştur" → formu sıfırla, modal açık kalsın
    const resetForm = () => {
        setSuccessData(null);
        setCustomerQuery('');
        setCustomerLocked(false);
        setNewRes({ customerName: '', customerPhone: '', customerEmail: '', service: settings.services[0]?.name || '', startTime: '09:00', endTime: '09:30', notes: '', staffId: '' });
        setRecurrence({ rule: '', until: '' });
        setResLines([]);
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
    const isStaffHourAvailable = useCallback((dateStr: string, hour: number, minute = 0): boolean => {
        if (!selectedStaffMember?.workingHours?.length) return true;
        const dayOfWeek = (new Date(dateStr + 'T12:00:00').getDay() + 6) % 7; // 0=Pzt … 6=Paz
        const dayHours = selectedStaffMember.workingHours.find(wh => wh.day === dayOfWeek);
        if (!dayHours || dayHours.isOff) return false;
        const [startH, startM = 0] = dayHours.start.split(':').map(Number);
        const [endH,   endM   = 0] = dayHours.end.split(':').map(Number);
        const slotMin  = hour * 60 + minute;
        const startMin = startH * 60 + startM;
        const endMin   = endH   * 60 + endM;
        return slotMin >= startMin && slotMin < endMin;
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

    // Taslaktan (mevcut hizmet+personel+saat) bir işlem satırı kur — çakışma kontrollü
    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
    const lineFromDraft = (): { ok: boolean; line?: typeof resLines[number] } => {
        if (!newRes.service) { toast.error('Hizmet seçin'); return { ok: false }; }
        if (!selectedDate) return { ok: false };
        const conflict = checkConflict(selectedDate, newRes.startTime, newRes.endTime, undefined, newRes.staffId || undefined);
        if (conflict) { toast.error(`Çakışma! ${conflict.customerName} — ${conflict.startTime}/${conflict.endTime}`); return { ok: false }; }
        if (newRes.staffId) {
            const s1 = toMin(newRes.startTime), e1 = toMin(newRes.endTime);
            if (resLines.some(l => l.staffId === newRes.staffId && toMin(l.startTime) < e1 && s1 < toMin(l.endTime))) {
                toast.error('Bu personel bu saatte zaten ekli'); return { ok: false };
            }
        }
        const svc = settings.services.find(s => s.name === newRes.service);
        const st = staff.find(s => s.id === newRes.staffId);
        return { ok: true, line: { id: (crypto.randomUUID?.() || String(Date.now())), service: newRes.service, serviceColor: svc?.color || '#FF5A1F', staffId: newRes.staffId, staffName: st?.name, staffColor: st?.color, startTime: newRes.startTime, endTime: newRes.endTime } };
    };

    const addDraftLine = () => {
        const { ok, line } = lineFromDraft();
        if (!ok || !line) return;
        setResLines(p => [...p, line]);
        setNewRes(p => ({ ...p, service: '', staffId: '', startTime: line.endTime, endTime: line.endTime }));
        toast.success('İşlem eklendi');
    };
    const removeResLine = (id: string) => setResLines(p => p.filter(l => l.id !== id));

    const handleCreateReservation = async () => {
        if (!selectedDate || !newRes.customerName || !newRes.customerPhone || creatingReservation) return;
        // Eklenen işlemler + (eklenmemiş taslak hizmet varsa onu da dahil et)
        const lines = [...resLines];
        if (newRes.service) { const { ok, line } = lineFromDraft(); if (!ok) return; if (line) lines.push(line); }
        if (lines.length === 0) { toast.error('En az bir hizmet seçin'); return; }

        setCreatingReservation(true);
        const groupId = lines.length > 1 ? (crypto.randomUUID?.() || String(Date.now())) : undefined;
        let created = 0;
        for (const ln of lines) {
            const conflict = checkConflict(selectedDate, ln.startTime, ln.endTime, undefined, ln.staffId || undefined);
            if (conflict) { toast.error(`Çakışma! ${ln.staffName || ''} ${ln.startTime} — atlandı`); continue; }
            const res = await addReservation({
                customerId: '', customerName: newRes.customerName, customerPhone: newRes.customerPhone, customerEmail: newRes.customerEmail,
                date: selectedDate, startTime: ln.startTime, endTime: ln.endTime, service: ln.service, serviceColor: ln.serviceColor,
                status: 'pending', notes: newRes.notes, staffId: ln.staffId || undefined, staffName: ln.staffName, staffColor: ln.staffColor,
                groupId,
                recurrenceRule: lines.length === 1 ? (recurrence.rule || undefined) : undefined,
                recurrenceUntil: lines.length === 1 && recurrence.rule ? (recurrence.until || undefined) : undefined,
            });
            if (res) created++;
        }
        setCreatingReservation(false);

        if (created > 0) {
            const first = lines[0];
            const totalDur = lines.reduce((s, l) => s + durationMin(l.startTime, l.endTime), 0);
            const names = [...new Set(lines.map(l => l.staffName).filter(Boolean))].join(', ');
            setSuccessData({
                customerName: newRes.customerName, customerPhone: newRes.customerPhone,
                service: lines.length > 1 ? `${lines.length} işlem` : first.service, duration: totalDur,
                dateLabel: formatDateEU(selectedDate), startTime: lines[0].startTime, endTime: lines[lines.length - 1].endTime,
                staffName: names || 'Fark etmez', staffColor: lines.length > 1 ? undefined : first.staffColor, serviceColor: first.serviceColor,
            });
        }
    };

    const dayReservations = selectedDate ? filteredReservations.filter(r => r.date === selectedDate) : [];

    const todayCount = filteredReservations.filter(r => r.date === today && r.status !== 'cancelled').length;
    const weekTotal = weekDays.reduce((sum, d) => sum + getDateCount(d.date), 0);

    return (
        <div className={cn("dash-theme flex-1 flex flex-col overflow-hidden bg-[var(--dc-page)]", dark && "dark")}>
            {/* Tek Satır Araç Çubuğu */}
            <div className="relative px-3 sm:px-6 py-3 border-b border-[var(--dc-border)] bg-[var(--dc-surface)]">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Sol: Dönem navigasyonu */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2 rounded-lg hover:bg-[var(--dc-surface3)] text-[var(--dc-muted)] hover:text-[var(--dc-ink)] transition-all active:scale-90"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <h1 className="text-lg font-extrabold text-[var(--dc-ink)] tracking-tight text-center min-w-[180px]">
                            {view === 'day'
                                ? currentDate.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
                                : `${MONTHS_TR[month]} ${year}`
                            }
                        </h1>
                        <button
                            onClick={() => navigate(1)}
                            className="p-2 rounded-lg hover:bg-[var(--dc-surface3)] text-[var(--dc-muted)] hover:text-[var(--dc-ink)] transition-all active:scale-90"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => { setCurrentDate(new Date()); setSelectedDate(today); }}
                            className="ml-1 px-3.5 py-1.5 rounded-full text-xs font-bold text-[var(--dc-ink)] bg-[var(--dc-surface)] border border-[var(--dc-border2)] hover:border-[var(--dc-ink)] transition-all active:scale-95"
                        >
                            Bugün
                        </button>
                    </div>

                    {/* Küçük sayaçlar */}
                    <div className="hidden lg:flex items-center gap-1.5 pl-3 ml-1 border-l border-[var(--dc-border)]">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--dc-ink)] px-2.5 py-1 rounded-full bg-[var(--dc-surface)] border border-[var(--dc-border)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A1F]" />
                            Bugün <span className="tabular-nums">{todayCount}</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--dc-ink)] px-2.5 py-1 rounded-full bg-[var(--dc-surface)] border border-[var(--dc-border)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--dc-muted)]" />
                            Hafta <span className="tabular-nums">{weekTotal}</span>
                        </span>
                    </div>

                    {/* Sağ: Görünüm + Filtre + Ekle */}
                    <div className="flex flex-wrap items-center gap-2 ml-auto justify-end">
                        {/* Görünüm anahtarı */}
                        <div className="flex items-center bg-[var(--dc-surface2)] rounded-full p-[3px] gap-0.5">
                            {((isMobile ? ['month', 'day'] : ['month', 'week', 'day']) as CalendarView[]).map((v) => (
                                <button
                                    key={v}
                                    onClick={() => setView(v)}
                                    className={cn(
                                        "px-4 py-1.5 rounded-full text-xs font-bold transition-all",
                                        view === v
                                            ? "bg-[var(--dc-surface)] text-[var(--dc-ink)] shadow-[0_1px_3px_rgba(14,14,14,0.06)]"
                                            : "text-[var(--dc-muted)] hover:text-[var(--dc-ink)]"
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
                                        "flex items-center gap-2 pl-2.5 pr-2 py-2 rounded-full border bg-[var(--dc-surface)] text-sm font-medium transition-all",
                                        staffMenuOpen ? "border-[var(--dc-ink)] ring-2 ring-[#FF5A1F]/15" : "border-[var(--dc-border)] hover:border-[var(--dc-ink)]"
                                    )}
                                >
                                    {selectedStaffMember ? (
                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedStaffMember.color }} />
                                    ) : (
                                        <Users className="w-4 h-4 text-[var(--dc-muted)] flex-shrink-0" />
                                    )}
                                    <span className="text-[var(--dc-ink)] max-w-[120px] truncate">
                                        {selectedStaffMember ? selectedStaffMember.name : 'Tüm Personel'}
                                    </span>
                                    <ChevronDown className={cn("w-4 h-4 text-[var(--dc-muted)] transition-transform", staffMenuOpen && "rotate-180")} />
                                </button>

                                {staffMenuOpen && (
                                    <div className="absolute z-30 right-0 mt-2 w-56 bg-[var(--dc-surface)] rounded-2xl border border-[var(--dc-border)] shadow-xl overflow-hidden py-1.5 animate-in fade-in zoom-in-95 duration-150">
                                        {/* Tüm Personel */}
                                        <button
                                            onClick={() => { setStaffFilter('all'); setStaffMenuOpen(false); }}
                                            className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-[var(--dc-surface2)] transition-colors text-left"
                                        >
                                            <div className="w-8 h-8 rounded-full bg-[var(--dc-surface3)] flex items-center justify-center flex-shrink-0">
                                                <Users className="w-4 h-4 text-[var(--dc-muted)]" />
                                            </div>
                                            <span className="flex-1 text-sm font-medium text-[var(--dc-ink)]">Tüm Personel</span>
                                            {staffFilter === 'all' && <Check className="w-4 h-4 text-[#FF5A1F] flex-shrink-0" />}
                                        </button>

                                        <div className="h-px bg-[var(--dc-surface3)] mx-3 my-1" />

                                        {/* Personel listesi */}
                                        {staff.map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => { setStaffFilter(s.id); setStaffMenuOpen(false); }}
                                                className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-[var(--dc-surface2)] transition-colors text-left"
                                            >
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white" style={{ backgroundColor: s.color }}>
                                                    {s.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-[var(--dc-ink)] truncate">{s.name}</p>
                                                    {s.specialty && <p className="text-[11px] text-[var(--dc-muted)] truncate">{s.specialty}</p>}
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
                            className="flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] hover:bg-[#FF5A1F] hover:-translate-y-px hover:shadow-[0_6px_18px_rgba(255,90,31,0.28)] transition-all active:translate-y-0"
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
                    <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_2px_8px_rgba(14,14,14,0.07),0_8px_24px_rgba(14,14,14,0.06)] overflow-hidden flex-1 flex flex-col">
                        {/* Day headers */}
                        <div className="grid grid-cols-7 bg-[var(--dc-surface2)] border-b border-[var(--dc-border)]">
                            {DAYS_TR.map((d, i) => (
                                <div key={d} className={cn(
                                    "py-3 px-3 text-[9.5px] font-extrabold uppercase tracking-[0.12em]",
                                    i >= 5 ? "text-[var(--dc-muted2)]" : "text-[var(--dc-muted)]"
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
                                            "relative flex flex-col px-1 pt-1.5 pb-1 sm:px-2 sm:pt-2 sm:pb-1.5 border-b border-r border-[var(--dc-border)] text-left transition-colors duration-150 group overflow-hidden min-h-0",
                                            !isCurrentMonth && "bg-[var(--dc-border-soft)]",
                                            isToday && "bg-[#FF5A1F]/[0.06]",
                                            "hover:bg-[var(--dc-surface2)]",
                                        )}
                                    >
                                        <div className="flex items-center justify-between flex-shrink-0 mb-1">
                                            <span className={cn(
                                                "inline-flex items-center justify-center text-[12.5px] font-extrabold transition-all",
                                                isToday
                                                    ? "w-[24px] h-[24px] rounded-full bg-[#FF5A1F] text-[var(--dc-inkbox-fg)]"
                                                    : !isCurrentMonth ? "text-[var(--dc-muted2)]"
                                                        : isWeekend ? "text-[var(--dc-muted)]" : "text-[var(--dc-ink)]",
                                            )}>
                                                {day}
                                            </span>
                                        </div>

                                        {count > 0 && (
                                            <div className="space-y-[3px] overflow-hidden min-h-0">
                                                {dateReservations.slice(0, isMobile ? 1 : 2).map((r) => {
                                                    const pending = r.status === 'pending';
                                                    return (
                                                        <div
                                                            key={r.id}
                                                            className={cn(
                                                                "relative flex items-center gap-1.5 pl-[9px] pr-1.5 py-1 rounded-[6px] text-[10.5px] font-semibold overflow-hidden transition-colors",
                                                                pending ? "bg-[#FF5A1F]/[0.10] text-[var(--dc-orange-d)]" : "bg-[var(--dc-surface3)] text-[var(--dc-ink)] group-hover:bg-[var(--dc-surface2)]"
                                                            )}
                                                            style={{ '--bar': r.serviceColor || (pending ? '#FF5A1F' : 'var(--dc-muted)') } as React.CSSProperties}
                                                        >
                                                            <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[3px]" style={{ background: 'var(--bar)' }} />
                                                            {!isMobile && <span className="text-[9px] font-bold opacity-70 tabular-nums flex-shrink-0">{r.startTime}</span>}
                                                            <span className="truncate">{r.customerName.split(' ')[0]}</span>
                                                        </div>
                                                    );
                                                })}
                                                {count > (isMobile ? 1 : 2) && (
                                                    <span className="block text-[10px] text-[var(--dc-muted)] pl-1 pt-0.5 font-bold flex-shrink-0">+{count - (isMobile ? 1 : 2)}{!isMobile && ' randevu daha'}</span>
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
                    <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_2px_8px_rgba(14,14,14,0.07)] overflow-hidden flex-1 flex flex-col min-h-0">
                        <div className="grid grid-cols-8 flex-shrink-0 bg-[var(--dc-surface2)]">
                            <div className="border-r border-[var(--dc-border)] p-3 flex items-end bg-[var(--dc-surface2)]">
                                <Clock className="w-3.5 h-3.5 text-[var(--dc-muted2)]" />
                            </div>
                            {weekDays.map((d) => (
                                <div key={d.date}
                                    className={cn(
                                        "p-3 text-center border-r border-b border-[var(--dc-border)] relative",
                                        d.isToday ? "bg-[#FF5A1F]/[0.08]" : "bg-[var(--dc-surface2)]"
                                    )}
                                >
                                    {d.isToday && <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#FF5A1F] to-transparent" />}
                                    <span className={cn(
                                        "text-[11px] font-bold uppercase tracking-wider",
                                        d.isToday ? "text-[#FF5A1F]" : "text-[var(--dc-muted)]"
                                    )}>{d.dayName}</span>
                                    <span className={cn(
                                        "block text-lg font-bold mt-0.5",
                                        d.isToday ? "text-[var(--dc-orange-d)]" : "text-[var(--dc-ink)]"
                                    )}>{d.day}</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto">
                        {HOURS.map((hour) => (
                            <div key={hour} className="grid grid-cols-8 border-b border-[var(--dc-border-soft)]">
                                <div className="border-r border-[var(--dc-border)] p-2 text-right pr-3 bg-[var(--dc-surface2)]">
                                    <span className="text-[11px] font-bold text-[var(--dc-muted)] tabular-nums">{String(hour).padStart(2, '0')}:00</span>
                                </div>
                                {weekDays.map((d) => {
                                    const hourRes = filteredReservations.filter(r =>
                                        r.date === d.date && parseInt(r.startTime.split(':')[0]) === hour && r.status !== 'cancelled'
                                    );
                                    const available = isStaffHourAvailable(d.date, hour);
                                    return (
                                        <div key={d.date + hour}
                                            className={cn(
                                                "border-r border-[var(--dc-border-soft)] p-1 min-h-[56px] transition-all duration-200",
                                                !available
                                                    ? "bg-[var(--dc-border-soft)] cursor-not-allowed"
                                                    : cn("cursor-pointer", d.isToday ? "bg-[#FF5A1F]/[0.03] hover:bg-[#FF5A1F]/[0.07]" : "hover:bg-[var(--dc-surface2)]"),
                                            )}
                                            onClick={() => { if (!available) return; setSelectedDate(d.date); setNewRes(p => ({ ...p, startTime: `${String(hour).padStart(2, '0')}:00`, endTime: `${String(hour + 1).padStart(2, '0')}:00` })); setShowNewDialog(true); }}
                                        >
                                            {hourRes.map((r) => {
                                                const blockStyle = r.status === 'pending'
                                                    ? "bg-[#FF5A1F]/[0.13] text-[var(--dc-orange-d)] border border-[#FF5A1F]/25 hover:bg-[#FF5A1F]/20"
                                                    : r.status === 'completed'
                                                        ? "bg-[var(--dc-surface3)] text-[var(--dc-muted)] border border-[var(--dc-border)] hover:bg-[var(--dc-surface2)]"
                                                        : "bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] border border-transparent hover:bg-[#1c1c1c]";
                                                return (
                                                    <div key={r.id}
                                                        className={cn(
                                                            "px-2 py-1.5 rounded-lg mb-0.5 transition-all hover:scale-[1.02] overflow-hidden cursor-pointer",
                                                            blockStyle
                                                        )}
                                                        onClick={(e) => { e.stopPropagation(); setAdisyonRes(r); }}
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
                        <div className="lg:col-span-2 rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_2px_8px_rgba(14,14,14,0.07)] overflow-hidden flex flex-col min-h-0">
                            <div className="px-5 py-4 border-b border-[var(--dc-border)] flex items-center justify-between bg-[var(--dc-surface2)] flex-shrink-0">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-[#FF5A1F]" />
                                    <span className="text-sm font-bold text-[var(--dc-ink)]">Saat Çizelgesi</span>
                                </div>
                                <span className="text-xs text-[var(--dc-muted)] font-medium">
                                    {filteredReservations.filter(r => r.date === toISODate(currentDate) && r.status !== 'cancelled').length} randevu
                                </span>
                            </div>
                            <div className="divide-y divide-[var(--dc-border-soft)] flex-1 min-h-0 overflow-y-auto">
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
                                                    ? "bg-[var(--dc-border-soft)] cursor-not-allowed opacity-70"
                                                    : cn("cursor-pointer group", isCurrentHour ? "bg-[#FF5A1F]/[0.06]" : "hover:bg-[var(--dc-surface2)]"),
                                            )}
                                            onClick={() => { if (!available) return; setSelectedDate(dateStr); setNewRes(p => ({ ...p, startTime: `${String(hour).padStart(2, '0')}:00`, endTime: `${String(hour + 1).padStart(2, '0')}:00` })); setShowNewDialog(true); }}
                                        >
                                            <div className="w-[72px] flex-shrink-0 p-3 border-r border-[var(--dc-border)] bg-[var(--dc-surface2)] text-right relative">
                                                {isCurrentHour && <div className="absolute top-1/2 right-0 w-2 h-2 rounded-full bg-[#FF5A1F] -translate-y-1/2 translate-x-1 shadow-lg shadow-[#FF5A1F]/50" />}
                                                <span className={cn(
                                                    "text-xs font-bold tabular-nums",
                                                    isCurrentHour ? "text-[#FF5A1F]" : "text-[var(--dc-muted)]"
                                                )}>
                                                    {String(hour).padStart(2, '0')}:00
                                                </span>
                                            </div>
                                            <div className="flex-1 p-2 space-y-1.5">
                                                {hourRes.map((r) => (
                                                    <div key={r.id}
                                                        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--dc-border)] bg-[var(--dc-surface)] shadow-sm transition-all duration-200 hover:shadow-md hover:bg-[var(--dc-surface2)] cursor-pointer"
                                                        onClick={(e) => { e.stopPropagation(); setAdisyonRes(r); }}
                                                    >
                                                        <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: r.serviceColor || '#FF5A1F' }} />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-bold text-[var(--dc-ink)] truncate">{r.customerName}</p>
                                                            <p className="text-[11px] text-[var(--dc-muted)] tabular-nums">{r.startTime} - {r.endTime} · {r.service}</p>
                                                        </div>
                                                        <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold flex-shrink-0", STATUS_BADGE[r.status])}>
                                                            {STATUS_LABEL[r.status]}
                                                        </span>
                                                    </div>
                                                ))}
                                                {hourRes.length === 0 && (
                                                    <div className="flex items-center justify-center h-full opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                                        <span className="text-[11px] text-[var(--dc-muted2)] flex items-center gap-1">
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
                            <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_2px_8px_rgba(14,14,14,0.07)] overflow-hidden">
                                <div className="flex items-center gap-2 px-5 pt-5 pb-4">
                                    <div className="w-7 h-7 rounded-lg bg-[var(--dc-inkbox)] grid place-items-center flex-shrink-0">
                                        <Sparkles className="w-3.5 h-3.5 text-[#FF5A1F]" />
                                    </div>
                                    <h3 className="text-sm font-bold text-[var(--dc-ink)]">Günün Özeti</h3>
                                </div>

                                {(() => {
                                    const dateStr = toISODate(currentDate);
                                    const dayRes = filteredReservations.filter(r => r.date === dateStr && r.status !== 'cancelled');
                                    const pending = dayRes.filter(r => r.status === 'pending').length;
                                    const confirmed = dayRes.filter(r => r.status === 'confirmed').length;

                                    return (
                                        <>
                                            <div className="grid grid-cols-3 border-y border-[var(--dc-border)]">
                                                <div className="text-center py-3.5 px-2 border-r border-[var(--dc-border)]">
                                                    <p className="text-[22px] font-black text-[var(--dc-ink)] tracking-[-0.04em] leading-none">{dayRes.length}</p>
                                                    <p className="text-[9px] text-[var(--dc-muted)] uppercase tracking-[0.08em] font-bold mt-1.5">Toplam</p>
                                                </div>
                                                <div className="text-center py-3.5 px-2 border-r border-[var(--dc-border)]">
                                                    <p className="text-[22px] font-black text-[var(--dc-amber)] tracking-[-0.04em] leading-none">{pending}</p>
                                                    <p className="text-[9px] text-[var(--dc-amber)] uppercase tracking-[0.08em] font-bold mt-1.5">Bekleyen</p>
                                                </div>
                                                <div className="text-center py-3.5 px-2">
                                                    <p className="text-[22px] font-black text-[var(--dc-green)] tracking-[-0.04em] leading-none">{confirmed}</p>
                                                    <p className="text-[9px] text-[var(--dc-green)] uppercase tracking-[0.08em] font-bold mt-1.5">Onaylı</p>
                                                </div>
                                            </div>

                                            {dayRes.length > 0 ? (
                                                <div className="p-3.5 space-y-2">
                                                    <p className="text-[9.5px] text-[var(--dc-muted)] uppercase tracking-[0.1em] font-bold mb-1 px-1">Program</p>
                                                    {dayRes.sort((a, b) => a.startTime.localeCompare(b.startTime)).map((r) => (
                                                        <div key={r.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[var(--dc-surface2)] border border-[var(--dc-border-soft)] hover:bg-[var(--dc-surface3)] transition-all">
                                                            <div className="flex-shrink-0 w-1 h-8 rounded-full" style={{ backgroundColor: r.serviceColor || '#FF5A1F' }} />
                                                            <span className="text-xs font-black text-[var(--dc-orange-d)] tabular-nums w-10 flex-shrink-0">{r.startTime}</span>
                                                            <div className="flex-1 min-w-0">
                                                                <span className="text-[13px] text-[var(--dc-ink)] font-bold truncate block leading-tight">{r.customerName}</span>
                                                                <span className="text-[10.5px] text-[var(--dc-muted)] truncate block">{r.service}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-8">
                                                    <CalendarIcon className="w-8 h-8 text-[var(--dc-muted2)] mx-auto mb-2" />
                                                    <p className="text-xs text-[var(--dc-muted)]">Bu gün için randevu yok</p>
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

                            {/* İŞLEMLER (çoklu hizmet) */}
                            <div>
                                {resLines.length > 0 && (
                                    <>
                                        <MLabel>Eklenen İşlemler · {resLines.length}</MLabel>
                                        <div className="flex flex-col" style={{ gap: 6, marginBottom: 8 }}>
                                            {resLines.map((l) => (
                                                <div key={l.id} className="flex items-center" style={{ gap: 10, padding: '8px 11px', borderRadius: 10, background: M.surface2, border: `1px solid ${M.border}` }}>
                                                    <span style={{ width: 9, height: 9, borderRadius: 3, background: l.serviceColor, flexShrink: 0 }} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="truncate" style={{ fontSize: 12.5, fontWeight: 700, color: M.ink }}>{l.service}</div>
                                                        <div style={{ fontSize: 10.5, color: M.muted, fontFamily: MONO, letterSpacing: '.03em' }}>{l.startTime}–{l.endTime} · {l.staffName || 'Fark etmez'}</div>
                                                    </div>
                                                    <button onClick={() => removeResLine(l.id)} title="Çıkar" className="grid place-items-center flex-shrink-0 transition-all" style={{ width: 24, height: 24, borderRadius: 6, color: M.muted }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(224,90,90,.12)'; e.currentTarget.style.color = '#E05A5A'; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = M.muted; }}>
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                                <button onClick={addDraftLine} disabled={!newRes.service}
                                    className="inline-flex items-center justify-center gap-2 w-full transition-all"
                                    style={{ height: 40, borderRadius: 10, fontSize: 12.5, fontWeight: 700, border: `1px dashed ${newRes.service ? M.orange : M.border2}`, background: 'transparent', color: newRes.service ? M.orange : M.muted2, cursor: newRes.service ? 'pointer' : 'not-allowed' }}>
                                    <Plus className="w-4 h-4" strokeWidth={2.4} /> Başka işlem ekle
                                </button>
                            </div>

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

                            {/* TEKRAR */}
                            <div style={{ paddingBottom: 6 }}>
                                <MLabel optional="(opsiyonel)">Tekrar</MLabel>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {([['', 'Yok'], ['weekly', 'Her hafta'], ['monthly', 'Her ay']] as const).map(([val, lbl]) => {
                                        const sel = recurrence.rule === val;
                                        return (
                                            <button key={val} onClick={() => setRecurrence(p => ({ ...p, rule: val }))}
                                                className="inline-flex items-center transition-all whitespace-nowrap"
                                                style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, lineHeight: 1.2,
                                                    border: `1px solid ${sel ? M.ink : M.border2}`, background: sel ? M.ink : M.surface2,
                                                    color: sel ? M.cream : M.muted, boxShadow: sel ? '0 2px 10px rgba(14,14,14,.14)' : 'none' }}>
                                                {lbl}
                                            </button>
                                        );
                                    })}
                                </div>
                                {recurrence.rule && (
                                    <div style={{ marginTop: 8 }}>
                                        <MLabel optional="(opsiyonel)">Bitiş tarihi</MLabel>
                                        <input type="date" min={selectedDate || undefined} value={recurrence.until}
                                            onChange={(e) => setRecurrence(p => ({ ...p, until: e.target.value }))}
                                            style={{ ...fieldBase }} onFocus={onFieldFocus} onBlur={onFieldBlur} />
                                        <div style={{ fontSize: 10.5, color: M.muted, marginTop: 4 }}>Boş bırakılırsa 8 hafta/ay boyunca tekrarlanır.</div>
                                    </div>
                                )}
                            </div>
                        </div>
                        )}

                        {/* FOOTER */}
                        {!successData && (
                        <div className="flex-shrink-0 flex flex-col" style={{ padding: '10px 18px 15px', borderTop: `1px solid ${M.border}`, gap: 4 }}>
                            <button
                                onClick={handleCreateReservation}
                                disabled={!newRes.customerName || !newRes.customerPhone || creatingReservation}
                                className="inline-flex items-center justify-center gap-2 w-full transition-all"
                                style={{
                                    height: 46, borderRadius: 999, fontWeight: 700, fontSize: 14.5, letterSpacing: '-0.01em',
                                    background: M.orange, color: M.ink,
                                    opacity: (!newRes.customerName || !newRes.customerPhone || creatingReservation) ? .42 : 1,
                                    cursor: (!newRes.customerName || !newRes.customerPhone || creatingReservation) ? 'not-allowed' : 'pointer',
                                }}
                                onMouseEnter={(e) => { if (newRes.customerName && newRes.customerPhone && !creatingReservation) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(255,90,31,.32)'; } }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                {creatingReservation ? 'Oluşturuluyor…' : (() => { const n = resLines.length + (newRes.service ? 1 : 0); return n > 1 ? `Randevu Oluştur · ${n} işlem` : 'Randevu Oluştur'; })()}
                                {!creatingReservation && <span style={{ fontSize: 16, lineHeight: 1 }}>→</span>}
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

            {/* Adisyon + Müşteri detayı (randevu kartından açılır) */}
            {adisyonRes && (
                <AdisyonModal
                    reservation={reservations.find(x => x.id === adisyonRes.id) || adisyonRes}
                    onClose={() => setAdisyonRes(null)}
                    onEdit={(res) => setEditRes(res)}
                />
            )}

            {editRes && (
                <EditReservationModal
                    reservation={reservations.find(x => x.id === editRes.id) || editRes}
                    isOpen={!!editRes}
                    onClose={() => setEditRes(null)}
                />
            )}
        </div>
    );
};
