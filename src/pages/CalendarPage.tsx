import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { normalizePhone } from '@/lib/phone';
import { toast } from 'sonner';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Clock, X, Sparkles, Search, Check, Users, ChevronDown, AlertTriangle, CalendarClock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useReservations } from '@/hooks/useReservations';
import { useLabels } from '@/hooks/useLabels';
import { useSlotResolver } from '@/hooks/useSlotResolver';
import { clockMin, addMinutesToTime, type SlotResolution } from '@/lib/slotResolution';
import { monthGridOf, weekDaysOf } from '@/lib/calendarGrid';
import { useCalendarDay } from '@/hooks/useCalendarDay';
import { serviceSeedFor, missingSeedServices } from '@/lib/serviceSeeds';
import { profileForSector, fieldDefsForSector } from '@/lib/sectorProfiles';
import { calendarProfileFor } from '@/lib/calendarSectorProfiles';
import { activeRiskFlags, evaluateEligibility } from '@/lib/serviceEligibility';
import { CustomFieldsSection } from '@/components/CustomFieldsSection';
import { useCustomers } from '@/hooks/useCustomers';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/utils/cn';
import { useTheme } from '@/contexts/ThemeContext';
import { todayISO, toISODate, formatDateEU } from '@/utils/date';
import { STATUS_BADGE, STATUS_LABEL } from '@/utils/statusColors';
import { ResourceLaneGrid } from '@/components/reservations/ResourceLaneGrid';
import { DayAgendaGrid } from '@/components/reservations/DayAgendaGrid';
import { AdisyonModal } from '@/components/reservations/AdisyonModal';
import { EditReservationModal } from '@/components/reservations/EditReservationModal';
import './calendarNewBooking.css';
import type { CalendarView, Reservation } from '@/types';

const DAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const DAYS_FULL = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// İki saat arası farkı dakika cinsinden ("11:00"→"11:30" = 30)
function durationMin(start: string, end: string): number {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return 0;
    let d = (eh * 60 + em) - (sh * 60 + sm);
    if (d < 0) d += 24 * 60;
    return d;
}

// clockMin / addMinutesToTime artık lib/slotResolution.ts içinde — slot
// kurallarıyla aynı yerde dursun diye taşındı (davranış birebir aynı).

/** Gün içi dakikayı "HH:MM"e çevirir; 00:00–23:59 aralığına sıkıştırır (geri kaydırma için). */
function hhmmOf(min: number): string {
    const m = Math.max(0, Math.min(24 * 60 - 1, min));
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
/** ISO tarihi gün kadar kaydırır. */
function shiftISO(iso: string, days: number): string {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + days);
    return toISODate(d);
}
/** "Perşembe 15 Ekim" — kısa: "Per 15 Ekim". */
function dayLabelOf(iso: string, short = false): string {
    const [y, mo, d] = iso.split('-').map(Number);
    if (!y || !mo || !d) return iso;
    const dow = (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;
    return `${(short ? DAYS_TR : DAYS_FULL)[dow]} ${d} ${MONTHS_TR[mo - 1]}`;
}
const initialsOf = (name: string) =>
    name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toLocaleUpperCase('tr');

// Telefonu WhatsApp (wa.me) formatına çevir — TR numaraları için
function waLinkTR(phone: string, text: string) {
    return `https://wa.me/${normalizePhone(phone) ?? phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

export const CalendarPage = () => {
    const { dark } = useTheme();
    const { reservations, addReservation, settings, isSettingsLoading, updateSettings } = useReservations();
    const { t } = useLabels();
    // Kaynak + sektöre özel randevu alanları (050/051).
    // Uygunluk verisi ve kuralları useSlotResolver'dan gelir: kural nesnesi
    // burada ikinci kez elle kurulunca iki yüzey aynı taslağa farklı cevap
    // verebiliyordu. Hook'lar SWR cache'li — ikinci bir ağ isteği doğmaz.
    const { staff, resources, resolve: resolveSlotWith, resolveStaff, findSlots, isReady: slotsReady } = useSlotResolver();
    // Saat ekseni, kapalı gün ve doluluk artık işletmenin gerçek çalışma
    // saatlerinden okunur — eksen 08–19 aralığına sabitlenmiş durumdaydı.
    const { isClosed, axisFor, occupancyOf } = useCalendarDay();
    const [resourceId, setResourceId] = useState<string | null>(null);
    const resourceTypeLabel = profileForSector(settings.sector).resourceTypes[0] || 'Kaynak';
    const cfDefs = fieldDefsForSector(settings.sector, 'reservation');
    const [cfValues, setCfValues] = useState<Record<string, string | number | boolean>>({});
    const { allCustomers } = useCustomers();
    const [staffFilter, setStaffFilter] = useState<string>('all');
    const [staffMenuOpen, setStaffMenuOpen] = useState(false);
    const staffMenuRef = useRef<HTMLDivElement>(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState<CalendarView>('month');
    // Gün görünümü alt düzeni: 'list' saat çizelgesi · 'lane' ünite/koltuk şeritli
    // Gün görünümü düzeni: 'agenda' = premium dikey zaman ızgarası (varsayılan),
    // 'list' = saat saat liste, 'lane' = eski kaynak çizelgesi.
    const [dayLayout, setDayLayout] = useState<'agenda' | 'list' | 'lane'>('agenda');
    const isMobile = useIsMobile();
    // Mobilde hafta görünümü 8 sütuna sığmaz → gün görünümüne düş
    useEffect(() => {
        if (isMobile && view === 'week') setView('day');
    }, [isMobile, view]);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [adisyonRes, setAdisyonRes] = useState<Reservation | null>(null);
    const [editRes, setEditRes] = useState<Reservation | null>(null);
    const [showNewDialog, setShowNewDialog] = useState(false);
    const [showNote, setShowNote] = useState(false);   // v9: not katlanır
    // Dashboard "Yeni Randevu" CTA'sı kullanıcıyı boş takvime bırakmasın:
    // ?new=1 ile gelince oluşturma diyaloğu doğrudan açılır (param temizlenir).
    // ?customer=<id> ile gelince o hastaya kilitli randevu formu açılır.
    const newParamHandledRef = useRef(false);
    useEffect(() => {
        if (newParamHandledRef.current) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get('new') !== '1') return;
        const custId = params.get('customer');
        // Hasta id'si varsa müşteri listesi yüklenene kadar bekle.
        if (custId && allCustomers.length === 0) return;
        newParamHandledRef.current = true;
        setSelectedDate(todayISO());
        setShowNewDialog(true);
        const c = custId ? allCustomers.find(x => x.id === custId) : undefined;
        if (c) {
            setNewRes(p => ({ ...p, customerName: c.name, customerPhone: c.phone, customerEmail: c.email || '' }));
            setCustomerQuery(c.name);
            setCustomerLocked(true);
        }
        window.history.replaceState(null, '', window.location.pathname);
    }, [allCustomers]);
    const [creatingReservation, setCreatingReservation] = useState(false);
    const [customerQuery, setCustomerQuery] = useState('');
    const [customerLocked, setCustomerLocked] = useState(false); // mevcut müşteri seçildi mi
    // ── Yeni seans · takvimde mini pencere (2026-10-29) ─────────────────────
    // Kullanıcı eski 9 bölümlük pencereyi "çok eski" buldu; taslaklardan B'yi
    // seçti: boş saate tıklayınca pencere o hücrenin yanında açılır (müşteri,
    // işlem, saat, personel — personel ve saat ayrıntılı). "Ayrıntılar" ve
    // araç çubuğundaki düğme aynı taslağı tam pencerede (taslak A) açar.
    // quickAnchor doluysa mini pencere, boşsa tam pencere.
    const [quickAnchor, setQuickAnchor] = useState<DOMRect | null>(null);
    const [stripOffset, setStripOffset] = useState(0);          // tam pencere gün şeridi (hafta)
    const [allServices, setAllServices] = useState(false);       // mini pencerede tüm işlemler
    const [customTime, setCustomTime] = useState(false);         // tam pencerede "Başka saat"
    const [extras, setExtras] = useState<{ unit?: boolean; repeat?: boolean; lines?: boolean }>({});
    const [nudge, setNudge] = useState(false);

    const [newRes, setNewRes] = useState(() => {
        const service = settings.services[0];
        const startTime = '09:00';
        return {
            customerName: '',
            customerPhone: '',
            customerEmail: '',
            service: service?.name || '',
            startTime,
            endTime: addMinutesToTime(startTime, service?.duration ?? 30),
            notes: '',
            staffId: '',
        };
    });
    const [recurrence, setRecurrence] = useState<{ rule: '' | 'weekly' | 'monthly'; until: string }>({ rule: '', until: '' });
    // Çoklu işlem (hizmet+personel+saat) — aynı müşteri/tarih için birden çok hizmet
    const [resLines, setResLines] = useState<{ id: string; service: string; serviceColor: string; staffId: string; staffName?: string; staffColor?: string; startTime: string; endTime: string }[]>([]);
    const settingsDraftInitializedRef = useRef(false);
    const serviceManuallySelectedRef = useRef(false);
    const endTimeManuallyEditedRef = useRef(false);

    // İlk render'da context genel varsayılanlarla başlayabilir. Gerçek klinik
    // ayarları geldikten sonra hizmet/süreyi yalnızca bir kez düzelt; bu sırada
    // yazılmış hasta, not, başlangıç saati ve elle girilmiş bitişi koru.
    useEffect(() => {
        if (isSettingsLoading || settingsDraftInitializedRef.current || settings.services.length === 0) return;
        settingsDraftInitializedRef.current = true;

        setNewRes((previous) => {
            const firstService = settings.services[0];
            const service = serviceManuallySelectedRef.current ? previous.service : firstService.name;
            const selectedService = settings.services.find((item) => item.name === service);
            return {
                ...previous,
                service,
                endTime: endTimeManuallyEditedRef.current || !selectedService
                    ? previous.endTime
                    : addMinutesToTime(previous.startTime, selectedService.duration),
            };
        });
    }, [isSettingsLoading, settings.services]);

    const serviceDuration = useCallback((serviceName: string) => (
        settings.services.find((service) => service.name === serviceName)?.duration ?? 30
    ), [settings.services]);

    const resetReservationDraft = useCallback(() => {
        const service = settings.services[0];
        const startTime = '09:00';
        return {
            customerName: '',
            customerPhone: '',
            customerEmail: '',
            service: service?.name || '',
            startTime,
            endTime: addMinutesToTime(startTime, service?.duration ?? 30),
            notes: '',
            staffId: '',
        };
    }, [settings.services]);

    const routerNavigate = useNavigate();

    // Randevu kartına tıklama davranışı. Güzellik salonu modülünde takvim
    // hızlı-bakış popup'ı (AdisyonModal) kaldırıldı: tık doğrudan müşteri
    // kartını açar (müşterisiz walk-in'de müşteri listesine düşer). Diğer
    // sektörlerde eski davranış — modalı açar.
    //
    // O kaldırma Düzenle ve İPTAL'i de beraberinde götürmüştü: güzellikte
    // randevu iptal edecek hiçbir yol kalmamıştı (2026-09-24'te fark edildi).
    // Tık davranışı bilinçli, ona dokunulmadı; modal artık karttaki ⋯
    // düğmesinden açılıyor (openReservationDetail).
    const openReservation = useCallback((r: Reservation) => {
        if (settings.sector === 'guzellik') {
            routerNavigate(r.customerId ? `/customers?open=${encodeURIComponent(r.customerId)}` : '/customers');
            return;
        }
        setAdisyonRes(r);
    }, [settings.sector, routerNavigate]);

    /** Karttaki ⋯ — sektör ne olursa olsun randevu detayını açar. */
    const openReservationDetail = useCallback((r: Reservation) => setAdisyonRes(r), []);

    // Seçili (kilitli) müşterinin tam kaydı — modal içinde bağlam göstermek için
    // (medikal uyarı, son ziyaret, kontrol tarihi, diş şeması kısayolu)
    const lockedCustomer = useMemo(
        () => customerLocked ? allCustomers.find(c => c.phone === newRes.customerPhone) : undefined,
        [customerLocked, allCustomers, newRes.customerPhone],
    );
    const medicalAlertsOf = (c?: { customFields?: Record<string, string | number | boolean> }) => {
        const cf = c?.customFields || {};
        return [
            // Sektörün kontrendikasyon bayrakları (güzellik: hamilelik) — bu
            // uyarılar eskiden yalnız güzellik müşteri kartında görünüyordu,
            // randevunun kurulduğu ekranda değil.
            ...activeRiskFlags(c, settings.sector).map((f) => `${f.label}${f.note ? ` — ${f.note}` : ''}`),
            cf.cilt_tipi ? `Cilt: ${cf.cilt_tipi}` : null,
            cf.alerji ? `Alerji: ${cf.alerji}` : null,
            cf.ilaclar ? `İlaç: ${cf.ilaclar}` : null,
            cf.kronik ? `Kronik: ${cf.kronik}` : null,
        ].filter((x): x is string => !!x);
    };

    // Taslaktaki müşteri — kilitli değilse telefondan çözülür. Uygunluk kontrolü
    // bunun üzerinden yapılır (bkz. lineFromDraft).
    const draftCustomer = useMemo(
        () => lockedCustomer
            || allCustomers.find((c) => c.phone.replace(/\s+/g, '') === newRes.customerPhone.replace(/\s+/g, '')),
        [lockedCustomer, allCustomers, newRes.customerPhone],
    );

    // Taslak bağlamı (seçili kaynak + sepetteki satırlar) her sorguya eklenir;
    // kuralların kendisi hook'tan gelir.
    const resolveSlot = useCallback((date: string, startTime: string, endTime: string, requestedId?: string): SlotResolution => (
        resolveSlotWith({ date, startTime, endTime, staffId: requestedId, resourceId, cart: resLines })
    ), [resolveSlotWith, resourceId, resLines]);

    // Çakışma ön-uyarısı: uygun personel/kaynak bulunamadığında sonraki gerçek
    // müsait saati önerir; süre korunur.
    //
    // Öneri artık findAvailableSlots'tan geliyor. Eskiden burada 30 dakikalık
    // sabit adımlarla 16 kez ileri deneme yapılıyordu; o döngü işletmenin slot
    // adımını (settings.slotDuration) ve org kapalı gününü hesaba katmadığı için
    // gerçekte dolu ya da mesai dışı bir saati "uygun" diye önerebiliyordu.
    const draftConflict = useMemo(() => {
        if (!showNewDialog || !selectedDate || !newRes.startTime || !newRes.endTime) return null;
        const current = resolveSlot(selectedDate, newRes.startTime, newRes.endTime, newRes.staffId || undefined);
        if (!current.issue) return null;
        const [slot] = findSlots({
            date: selectedDate,
            durationMin: durationMin(newRes.startTime, newRes.endTime),
            staffId: newRes.staffId || undefined,
            resourceId: resourceId || undefined,
            notBefore: newRes.startTime,
            limit: 1,
        });
        return {
            message: current.issue,
            sug: slot ? { start: slot.startTime, end: slot.endTime } : null,
        };
    }, [showNewDialog, selectedDate, newRes.startTime, newRes.endTime, newRes.staffId, resolveSlot, findSlots, resourceId]);

    // Sektörün hazır hizmet seti henüz yüklü değilse modalda öneri gösterilir.
    // Set içeriği lib/serviceSeeds'te — genel takvim yüzü tek bir sektörün
    // içeriğini taşımaz, yeni sektör eklemek bu sayfayı düzenlemeyi gerektirmez.
    const [loadingSeed, setLoadingSeed] = useState(false);
    const serviceSeed = serviceSeedFor(settings.sector);
    const missingSeed = useMemo(
        () => (serviceSeed ? missingSeedServices(serviceSeed, settings.services) : []),
        [serviceSeed, settings.services],
    );
    const seedMissing = Boolean(serviceSeed)
        && !settings.services.some((s) => s.name === serviceSeed?.probeName);
    const loadServiceSeed = async () => {
        if (loadingSeed || !serviceSeed) return;
        setLoadingSeed(true);
        const additions = missingSeed.map((s, i) => ({ id: `svc-${Date.now()}-${i}`, ...s }));
        try {
            const saved = await updateSettings({ ...settings, services: [...settings.services, ...additions] });
            if (saved) toast.success(`${serviceSeed.label} eklendi`, { description: "Süre ve ücretleri Ayarlar'dan düzenleyebilirsiniz." });
        } finally {
            setLoadingSeed(false);
        }
    };

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
        serviceManuallySelectedRef.current = false;
        endTimeManuallyEditedRef.current = false;
        setCustomerQuery('');
        setCustomerLocked(false);
        setNewRes(resetReservationDraft());
        setRecurrence({ rule: '', until: '' });
        setResLines([]);
        setResourceId(null);
        setCfValues({});
        setShowNote(false);
        setQuickAnchor(null);
        setStripOffset(0);
        setAllServices(false);
        setCustomTime(false);
        setExtras({});
    };

    /**
     * Yeni seans aç. anchor = tıklanan takvim hücresi → mini pencere onun
     * yanında; anchor yoksa (araç çubuğu, ?new=1) ya da ekran darsa tam pencere.
     */
    const openNewAt = (date: string, startTime: string, anchor?: DOMRect | null,
        extra?: { staffId?: string | null; resourceId?: string | null }) => {
        setSelectedDate(date);
        if (extra?.resourceId !== undefined) setResourceId(extra.resourceId);
        setNewRes(p => ({
            ...p,
            startTime,
            endTime: addMinutesToTime(startTime, serviceDuration(p.service)),
            ...(extra?.staffId ? { staffId: extra.staffId } : {}),
        }));
        setQuickAnchor(anchor && window.innerWidth >= 760 ? anchor : null);
        setShowNewDialog(true);
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

    // Ay ızgarası ortak geometriden (lib/calendarGrid.monthGridOf): sabit 42
    // hücre, pazartesi başlangıçlı, ay/yıl sınırı dahil.
    const daysInMonth = useMemo(
        () => monthGridOf(year, month).map(({ iso, inMonth }) => ({
            date: iso,
            day: Number(iso.slice(8, 10)),
            isCurrentMonth: inMonth,
        })),
        [year, month],
    );

    const weekDays = useMemo(
        () => weekDaysOf(toISODate(currentDate)).map((iso, i) => ({
            date: iso,
            day: Number(iso.slice(8, 10)),
            dayName: DAYS_TR[i],
            fullName: DAYS_FULL[i],
            isToday: iso === today,
        })),
        [currentDate, today],
    );

    // Hafta ekseni 7 günün BİRLEŞİMİ; gün ekseni seçili günün penceresi.
    // Kapalı günler eksene katılmaz (bkz. useCalendarDay.axisFor).
    const weekAxis = useMemo(() => axisFor(weekDays.map((d) => d.date)), [axisFor, weekDays]);
    const dayAxis = useMemo(() => axisFor([toISODate(currentDate)]), [axisFor, currentDate]);

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
        const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay(); // 0=Paz … 6=Cmt (WorkingHours ile aynı)
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
    const lineFromDraft = (): { ok: boolean; line?: typeof resLines[number] } => {
        if (!newRes.service) { toast.error('Hizmet seçin'); return { ok: false }; }
        if (!selectedDate) return { ok: false };
        const svc = settings.services.find(s => s.name === newRes.service);
        // Kontrendikasyon — sektör kuralı (lib/serviceEligibility). Bu kontrol
        // eskiden yalnız güzellik seans modalindeydi; genel takvim aynı müşteriye
        // aynı işlemi serbestçe kaydediyordu.
        const verdict = evaluateEligibility(draftCustomer, svc || { name: newRes.service }, settings.sector);
        if (verdict.blocked) {
            toast.error(`${newRes.service} uygulanamaz — ${verdict.message}`);
            return { ok: false };
        }
        const resolved = resolveSlot(selectedDate, newRes.startTime, newRes.endTime, newRes.staffId || undefined);
        if (resolved.issue) { toast.error(resolved.issue); return { ok: false }; }
        const st = resolved.staffMember;
        return { ok: true, line: { id: (crypto.randomUUID?.() || String(Date.now())), service: newRes.service, serviceColor: svc?.color || '#FF5A1F', staffId: st?.id || '', staffName: st?.name, staffColor: st?.color, startTime: newRes.startTime, endTime: newRes.endTime } };
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
        const createdLines: typeof lines = [];
        for (const ln of lines) {
            // Kaydetmeden hemen önceki son doğrulama ORTAK kural katmanından
            // gelir (resolveSlot): çalışma saati, izin, randevu çakışması ve
            // kaynak kapasitesi tek yerde hesaplanır. Burada eskiden bunların
            // elle yazılmış bir kopyası vardı ve kural katmanıyla ayrışabiliyordu.
            // `cart` zaten bu turda oluşturulmuş satırları da hesaba katar, yani
            // toplu kayıtta parti içi çakışma da yakalanır.
            const verdict = resolveSlotWith({
                date: selectedDate,
                startTime: ln.startTime,
                endTime: ln.endTime,
                staffId: ln.staffId || undefined,
                resourceId,
                cart: createdLines.map((x) => ({ staffId: x.staffId || '', startTime: x.startTime, endTime: x.endTime })),
            });
            if (verdict.issue) {
                toast.error(`${ln.startTime} · ${verdict.issue} — atlandı`);
                continue;
            }
            const res = await addReservation({
                // Mevcut müşteri seçildiyse id'sini bağla; yazılan telefon kayıtlı bir
                // müşteriye aitse yine bağla — dashboard'daki satır tıklaması hasta
                // detayını ancak customer_id doluysa açabiliyor.
                customerId: lockedCustomer?.id
                    || allCustomers.find(c => c.phone.replace(/\s+/g, '') === newRes.customerPhone.replace(/\s+/g, ''))?.id
                    || '',
                customerName: newRes.customerName, customerPhone: newRes.customerPhone, customerEmail: newRes.customerEmail,
                date: selectedDate, startTime: ln.startTime, endTime: ln.endTime, service: ln.service, serviceColor: ln.serviceColor,
                status: calendarProfileFor(settings.sector).manualStatus, notes: newRes.notes, staffId: ln.staffId || undefined, staffName: ln.staffName, staffColor: ln.staffColor,
                groupId,
                recurrenceRule: lines.length === 1 ? (recurrence.rule || undefined) : undefined,
                recurrenceUntil: lines.length === 1 && recurrence.rule ? (recurrence.until || undefined) : undefined,
                resourceId: resourceId || undefined,
                customFields: Object.keys(cfValues).length ? cfValues : undefined,
            });
            if (res) createdLines.push(ln);
        }
        setCreatingReservation(false);

        if (createdLines.length > 0) {
            const first = createdLines[0];
            const totalDur = createdLines.reduce((s, l) => s + durationMin(l.startTime, l.endTime), 0);
            const names = [...new Set(createdLines.map(l => l.staffName).filter(Boolean))].join(', ');
            if (createdLines.length < lines.length) {
                toast.warning(`${lines.length} işlemin ${createdLines.length} tanesi eklendi`, { description: `${lines.length - createdLines.length} işlem çakıştığı için eklenmedi.` });
            }
            // Büyük "Oluşturuldu" ekranı kalktı (2026-10-29): pencere kapanır,
            // üstte bildirim hapı çıkar; WhatsApp bildirimi hapın düğmesinde.
            const last = createdLines[createdLines.length - 1];
            const what = createdLines.length > 1 ? `${createdLines.length} işlem · ${totalDur} dk` : first.service;
            const waText = `Merhaba ${newRes.customerName}, ${t('reservation').toLocaleLowerCase('tr')} kaydınız oluşturuldu: ${formatDateEU(selectedDate)} ${first.startTime}–${last.endTime} · ${what}. Görüşmek üzere!`;
            const phone = newRes.customerPhone;
            toast.success(`${t('reservation')} eklendi · ${newRes.customerName}`, {
                description: `${dayLabelOf(selectedDate, true)} · ${first.startTime}–${last.endTime} · ${names || what}`,
                duration: 7000,
                ...(phone ? { action: { label: "WhatsApp'tan bildir", onClick: () => { window.open(waLinkTR(phone, waText), '_blank', 'noopener'); } } } : {}),
            });
            closeDialog();
        } else if (lines.length > 1) {
            toast.error(`${lines.length} işlemin hiçbiri oluşturulamadı`);
        }
    };

    // ── Yeni seans penceresi: hesaplanan değerler ────────────────────────────
    const stepMin = Math.max(5, settings.slotDuration || 15);
    const draftDur = Math.max(5, durationMin(newRes.startTime, newRes.endTime));
    const nowHHMM = () => { const n = new Date(); return hhmmOf(n.getHours() * 60 + n.getMinutes()); };
    const isDirty = Boolean(newRes.customerName.trim() || resLines.length || newRes.notes.trim());

    // O günün boş başlangıç saatleri (seçili personel/ünite + işlem süresiyle)
    const freeSlots = useMemo(() => {
        if (!showNewDialog || !selectedDate || !slotsReady) return [];
        return findSlots({
            date: selectedDate, durationMin: draftDur, staffId: newRes.staffId || undefined,
            resourceId: resourceId || undefined, cart: resLines, stepMin, limit: 96,
            notBefore: selectedDate === today ? nowHHMM() : undefined,
        });
    }, [showNewDialog, selectedDate, slotsReady, findSlots, draftDur, newRes.staffId, resourceId, resLines, stepMin, today]);
    // Mini pencere: seçili saate en yakın altı boş saat (±2 sa)
    const nearSlots = useMemo(() => {
        const at = clockMin(newRes.startTime);
        return freeSlots
            .filter((x) => Math.abs(clockMin(x.startTime) - at) <= 120)
            .sort((a, b) => Math.abs(clockMin(a.startTime) - at) - Math.abs(clockMin(b.startTime) - at))
            .slice(0, 6)
            .sort((a, b) => clockMin(a.startTime) - clockMin(b.startTime));
    }, [freeSlots, newRes.startTime]);

    // Her personelin seçili saatteki durumu — kural katmanından (resolveStaff)
    const staffRows = useMemo(() => {
        if (!showNewDialog || !selectedDate) return [];
        return staff.map((member) => {
            const r = resolveStaff({ date: selectedDate, startTime: newRes.startTime, endTime: newRes.endTime, staffId: member.id, cart: resLines });
            const state: 'free' | 'busy' | 'off' | 'wait' = !slotsReady ? 'wait' : !r.issue ? 'free' : r.conflict ? 'busy' : 'off';
            const note = state === 'wait' ? 'Bakılıyor…'
                : state === 'free' ? 'Boş'
                : state === 'busy' ? `Dolu · ${r.conflict!.startTime}–${r.conflict!.endTime}`
                : 'Bu saatte çalışmıyor';
            return { member, state, note };
        });
    }, [showNewDialog, selectedDate, staff, resolveStaff, newRes.startTime, newRes.endTime, resLines, slotsReady]);
    // "Fark etmez": kim atanacak?
    const anyPick = useMemo(() => {
        if (!showNewDialog || !selectedDate || !slotsReady) return null;
        return resolveSlotWith({ date: selectedDate, startTime: newRes.startTime, endTime: newRes.endTime, resourceId, cart: resLines });
    }, [showNewDialog, selectedDate, slotsReady, resolveSlotWith, newRes.startTime, newRes.endTime, resourceId, resLines]);

    const setStart = (startTime: string, endTime?: string) => {
        setNewRes(p => ({ ...p, startTime, endTime: endTime ?? addMinutesToTime(startTime, durationMin(p.startTime, p.endTime) || serviceDuration(p.service)) }));
    };
    const shiftStart = (delta: number) => setStart(hhmmOf(clockMin(newRes.startTime) + delta));
    const pickService = (name: string, duration: number) => {
        serviceManuallySelectedRef.current = true;
        setNewRes(p => ({ ...p, service: name, endTime: addMinutesToTime(p.startTime, duration) }));
    };
    const tryClose = () => {
        if (!isDirty) { closeDialog(); return; }
        setNudge(true);
        window.setTimeout(() => setNudge(false), 420);
    };
    const missing = !newRes.customerName.trim() ? `${t('customer')} seçin`
        : !newRes.customerPhone.trim() ? 'Telefon girin'
        : !newRes.service && resLines.length === 0 ? `${t('service')} seçin` : '';
    const canSave = !missing && !creatingReservation;
    const lineCount = resLines.length + (newRes.service ? 1 : 0);
    const saveLabel = creatingReservation ? 'Kaydediliyor…' : lineCount > 1 ? `Kaydet · ${lineCount} işlem` : 'Kaydet';

    // Esc kapatır. Pencere belirgin biçimde boyut değiştirirse hücre yeri
    // eskir — mini pencere aynı taslakla tam pencereye geçer (küçük oynamalar,
    // ör. tarayıcı çubuğu, sayılmaz).
    useEffect(() => {
        if (!showNewDialog) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDialog(); };
        const w0 = window.innerWidth, h0 = window.innerHeight;
        const onResize = () => {
            if (Math.abs(window.innerWidth - w0) > 40 || Math.abs(window.innerHeight - h0) > 160) setQuickAnchor(null);
        };
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', onResize);
        return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- closeDialog yalnız durum sıfırlar
    }, [showNewDialog]);

    // Mini pencerenin yeri: hücrenin sağı, sığmazsa solu. Dikeyde içeriği
    // ölçülüp tıklanan hücrenin hizasına ortalanır ve ekranda kalır (içerik
    // büyüdükçe — müşteri seçilince uyarılar gelir — yeniden yerleşir).
    const POP_W = 404;
    const popRef = useRef<HTMLElement | null>(null);
    const popStyle = useMemo((): React.CSSProperties | null => {
        if (!quickAnchor) return null;
        const pad = 12, gap = 10, vw = window.innerWidth, vh = window.innerHeight;
        let left = quickAnchor.right + gap;
        if (left + POP_W > vw - pad) left = quickAnchor.left - gap - POP_W;
        if (left < pad) left = Math.min(Math.max(pad, quickAnchor.left + 24), vw - POP_W - pad);
        return { left, top: Math.max(pad, Math.min(quickAnchor.top - 160, vh - pad - 560)), maxHeight: vh - pad * 2 };
    }, [quickAnchor]);
    useLayoutEffect(() => {
        const el = popRef.current;
        if (!quickAnchor || !el) return;
        const place = () => {
            const pad = 12, vh = window.innerHeight, h = el.offsetHeight;
            const mid = quickAnchor.top + quickAnchor.height / 2;
            el.style.top = `${Math.round(Math.min(Math.max(pad, mid - h / 2), vh - pad - h))}px`;
        };
        place();
        const ro = new ResizeObserver(place);
        ro.observe(el);
        return () => ro.disconnect();
    }, [quickAnchor, showNewDialog]);

    const todayCount = filteredReservations.filter(r => r.date === today && r.status !== 'cancelled').length;
    const weekTotal = weekDays.reduce((sum, d) => sum + getDateCount(d.date), 0);
    // Doluluk: planlanan dakika / (açık dakika × kaynak sayısı). Kapalı günde 0.
    const todayOccupancy = occupancyOf(today, Math.max(1, resources.filter((r) => r.isActive).length));

    return (
        <div className={cn("dash-theme calendar-focus-page relative isolate flex-1 flex flex-col overflow-hidden bg-[var(--dc-page)]", dark && "dark")}>
            <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-8 h-64 w-64 rounded-full border border-[#FF5A1F]/10 opacity-70" />
            <div aria-hidden="true" className="pointer-events-none absolute -right-10 top-24 h-36 w-36 rounded-full border-[24px] border-[#FF5A1F]/[0.035]" />
            {/* Tek Satır Araç Çubuğu */}
            <div className="relative z-[2] mx-3 mt-3 rounded-[18px] border border-[var(--dc-border)] bg-[var(--dc-surface)] px-3 py-3 shadow-[0_5px_18px_rgba(14,14,14,0.06)] animate-in fade-in slide-in-from-top-2 duration-500 motion-reduce:animate-none sm:mx-5 sm:px-5">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Sol: Dönem navigasyonu */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2 rounded-lg hover:bg-[var(--dc-surface3)] text-[var(--dc-muted)] hover:text-[var(--dc-ink)] transition-all active:scale-90"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <h1 className="min-w-[190px] text-center text-xl font-extrabold tracking-tight text-[var(--dc-ink)]">
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
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--dc-ink)] px-2.5 py-1 rounded-full bg-[var(--dc-surface)] border border-[var(--dc-border)]"
                            title="Bugün planlanan sürenin çalışma saatlerine oranı">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--dc-green)]" />
                            Doluluk <span className="tabular-nums">%{todayOccupancy}</span>
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

                        {/* Bildirim zili buradan kaldırıldı (2026-08-07): sayfanın
                            üstündeki bar yokken takvimin tek bildirim erişimi buydu,
                            artık zil sidebar künyesinde ve her sayfada duruyor.
                            Çift zil hem tekrardı hem araç çubuğunu tek satıra
                            sığmaktan alıkoyuyordu. */}
                        <button
                            onClick={() => {
                                const [first] = findSlots({ date: today, durationMin: serviceDuration(newRes.service), notBefore: nowHHMM(), stepMin, limit: 1 });
                                openNewAt(today, first?.startTime ?? newRes.startTime);
                            }}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] hover:bg-[#FF5A1F] hover:-translate-y-px hover:shadow-[0_6px_18px_rgba(255,90,31,0.28)] transition-all active:translate-y-0"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">{t('newReservation')}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Calendar Content */}
            <div className="relative z-[1] flex min-h-0 flex-1 flex-col px-3 pb-4 pt-3 animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none sm:px-5">
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
                                // İşletmenin kapalı günü: hafta sonu varsayımı değil,
                                // gerçek çalışma saatleri (useCalendarDay).
                                const dayClosed = isClosed(date);
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
                                            dayClosed && "bg-[var(--dc-border-soft)] opacity-60",
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
                                            {dayClosed && <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--dc-muted2)]">Kapalı</span>}
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
                                                    <span className="block text-[10px] text-[var(--dc-muted)] pl-1 pt-0.5 font-bold flex-shrink-0">+{count - (isMobile ? 1 : 2)}{!isMobile && ` ${t('reservation').toLocaleLowerCase('tr')} daha`}</span>
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
                                        isClosed(d.date) ? "text-[var(--dc-muted2)]"
                                            : d.isToday ? "text-[var(--dc-orange-d)]" : "text-[var(--dc-ink)]"
                                    )}>{d.day}</span>
                                    {isClosed(d.date) && <span className="block text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--dc-muted2)]">Kapalı</span>}
                                </div>
                            ))}
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto">
                        {weekAxis.hours.map((hour) => (
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
                                            onClick={(e) => {
                                                if (!available) return;
                                                openNewAt(d.date, `${String(hour).padStart(2, '0')}:00`, e.currentTarget.getBoundingClientRect());
                                            }}
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
                                                        onClick={(e) => { e.stopPropagation(); openReservation(r); }}
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
                    <div className={cn('gap-4 flex-1 min-h-0', dayLayout === 'agenda' ? 'flex flex-col' : 'grid grid-cols-1 lg:grid-cols-3')}>
                        {/* Time slots */}
                        <div className={cn('rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_2px_8px_rgba(14,14,14,0.07)] overflow-hidden flex flex-col min-h-0', dayLayout !== 'agenda' && 'lg:col-span-2')}>
                            <div className="px-5 py-4 border-b border-[var(--dc-border)] flex items-center justify-between bg-[var(--dc-surface2)] flex-shrink-0">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-[#FF5A1F]" />
                                    <span className="text-sm font-bold text-[var(--dc-ink)]">{dayLayout === 'agenda' ? 'Seans Takvimi' : dayLayout === 'lane' ? `${resourceTypeLabel} Çizelgesi` : 'Saat Çizelgesi'}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="inline-flex rounded-lg bg-[var(--dc-surface)] border border-[var(--dc-border)] p-0.5">
                                        {([['agenda', 'Takvim'], ['list', 'Liste'], ...(resources.length > 0 ? [['lane', resourceTypeLabel] as const] : [])] as const).map(([m, l]) => (
                                            <button key={m} type="button" onClick={() => setDayLayout(m)}
                                                className={cn('px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors',
                                                    dayLayout === m ? 'bg-[var(--dc-ink)] text-white' : 'text-[var(--dc-muted)] hover:text-[var(--dc-ink)]')}>
                                                {l}
                                            </button>
                                        ))}
                                    </div>
                                    <span className="text-xs text-[var(--dc-muted)] font-medium">
                                        {filteredReservations.filter(r => r.date === toISODate(currentDate) && r.status !== 'cancelled').length} {t('reservation').toLocaleLowerCase('tr')}
                                    </span>
                                </div>
                            </div>
                            {dayLayout === 'agenda' ? (
                                <DayAgendaGrid
                                    dateStr={toISODate(currentDate)}
                                    today={today}
                                    reservations={filteredReservations}
                                    resources={resources}
                                    staff={staff}
                                    resourceTypeLabel={resourceTypeLabel}
                                    workingHours={settings.workingHours || []}
                                    onOpen={(r) => openReservation(r)}
                                    onDetail={openReservationDetail}
                                    onAddAt={(hour, columnId, groupBy, anchor) => {
                                        openNewAt(toISODate(currentDate), `${String(hour).padStart(2, '0')}:00`, anchor, {
                                            ...(groupBy === 'resource' ? { resourceId: columnId } : {}),
                                            ...(groupBy === 'staff' ? { staffId: columnId } : {}),
                                        });
                                    }}
                                />
                            ) : dayLayout === 'lane' && resources.length > 0 ? (
                                <ResourceLaneGrid
                                    dateStr={toISODate(currentDate)}
                                    today={today}
                                    hours={dayAxis.hours}
                                    resources={resources}
                                    resourceTypeLabel={resourceTypeLabel}
                                    reservations={filteredReservations}
                                    onOpenReservation={(r) => openReservation(r)}
                                    onAddAt={(hour, resId, anchor) => {
                                        openNewAt(toISODate(currentDate), `${String(hour).padStart(2, '0')}:00`, anchor, { resourceId: resId });
                                    }}
                                />
                            ) : (
                            <div className="divide-y divide-[var(--dc-border-soft)] flex-1 min-h-0 overflow-y-auto">
                                {dayAxis.hours.map((hour) => {
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
                                            onClick={(e) => {
                                                if (!available) return;
                                                openNewAt(dateStr, `${String(hour).padStart(2, '0')}:00`, e.currentTarget.getBoundingClientRect());
                                            }}
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
                                                        onClick={(e) => { e.stopPropagation(); openReservation(r); }}
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
                            )}
                        </div>

                        {/* Day Summary Sidebar — takvim düzeninde gizli (ızgara tam genişlik) */}
                        <div className={cn('space-y-4', dayLayout === 'agenda' && 'hidden')}>
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
                                                    <p className="text-xs text-[var(--dc-muted)]">Bu gün için {t('reservation').toLocaleLowerCase('tr')} yok</p>
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

            {/* ── Yeni seans · mini pencere (takvim hücresi) / tam pencere (2026-10-29) ── */}
            {showNewDialog && selectedDate && (() => {
                const quick = Boolean(quickAnchor && popStyle);
                const staffName = staff.find((s) => s.id === newRes.staffId)?.name;
                const unitName = resources.find((x) => x.id === resourceId)?.name;
                const lowerCustomer = t('customer').toLocaleLowerCase('tr');
                const lowerStaff = t('staff').toLocaleLowerCase('tr');
                const services = settings.services;
                const shownServices = quick && !allServices
                    ? services.filter((sv, i) => i < 6 || sv.name === newRes.service)
                    : services;
                const hiddenCount = services.length - shownServices.length;
                const alerts = lockedCustomer ? medicalAlertsOf(lockedCustomer) : [];

                const customerSection = (
                    <div className="nb-sec">
                        <div className="nb-lbl"><span>{t('customer')}</span></div>
                        {customerLocked ? (
                            <>
                                <div className="nb-cust">
                                    <span className="nb-cust-av">{initialsOf(newRes.customerName) || '?'}</span>
                                    <span className="nb-cust-tx">
                                        <b>{newRes.customerName}</b>
                                        <small>{newRes.customerPhone}{lockedCustomer?.lastVisit ? ` · son geliş ${formatDateEU(lockedCustomer.lastVisit)}` : ''}</small>
                                    </span>
                                    <button type="button" className="nb-icon" onClick={clearCustomer} aria-label={`Başka ${lowerCustomer} seç`}><X /></button>
                                </div>
                                {lockedCustomer && (alerts.length > 0 || lockedCustomer.recallDate || settings.sector === 'dis') && (
                                    <div className="nb-tags">
                                        {alerts.map((a) => <span key={a} className="nb-tag risk"><AlertTriangle />{a}</span>)}
                                        {lockedCustomer.recallDate && <span className="nb-tag"><CalendarClock />Kontrol: {formatDateEU(lockedCustomer.recallDate)}</span>}
                                        {settings.sector === 'dis' && (
                                            <button type="button" className="nb-tag link" onClick={() => routerNavigate(`/dental-chart?patient=${lockedCustomer.id}`)}>Diş şeması</button>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <label className="nb-search">
                                    <Search />
                                    <input type="text" autoFocus autoComplete="off" spellCheck={false}
                                        placeholder={`${t('customer')} ara ya da yeni isim yaz`}
                                        value={customerQuery}
                                        onChange={(e) => { setCustomerQuery(e.target.value); setNewRes(p => ({ ...p, customerName: e.target.value })); }}
                                        onKeyDown={(e) => { if (e.key === 'Enter' && customerMatches[0]) { e.preventDefault(); selectCustomer(customerMatches[0]); } }} />
                                </label>
                                {customerMatches.length > 0 && (
                                    <div className="nb-matches" role="listbox">
                                        {customerMatches.map((c) => (
                                            <button key={c.id} type="button" role="option" aria-selected={false} onClick={() => selectCustomer(c)}>
                                                <span className="nb-cust-av sm">{initialsOf(c.name) || '?'}</span>
                                                <span className="nb-cust-tx"><b>{c.name}</b><small>{c.phone}</small></span>
                                                {medicalAlertsOf(c).length > 0 && <span className="nb-risk" title={medicalAlertsOf(c).join(' · ')}><AlertTriangle /></span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {customerQuery.trim().length >= 2 && (
                                    <label className="nb-field nb-newphone">
                                        <span>Yeni {lowerCustomer} · telefon</span>
                                        <input type="tel" inputMode="tel" placeholder="0532 xxx xx xx"
                                            value={newRes.customerPhone} onChange={(e) => setNewRes(p => ({ ...p, customerPhone: e.target.value }))} />
                                    </label>
                                )}
                            </>
                        )}
                    </div>
                );

                const serviceSection = (
                    <div className="nb-sec">
                        <div className="nb-lbl"><span>{quick ? 'İşlem' : t('service')}</span>{newRes.service && <em>{draftDur} dk</em>}</div>
                        <div className="nb-chips">
                            {shownServices.map((sv) => (
                                <button key={sv.id} type="button" className={cn('nb-svc', newRes.service === sv.name && 'on')}
                                    aria-pressed={newRes.service === sv.name} onClick={() => pickService(sv.name, sv.duration)}>
                                    <i style={{ background: sv.color }} />
                                    {sv.name}
                                    <small>{sv.duration} dk{sv.price ? ` · ₺${sv.price.toLocaleString('tr-TR')}` : ''}</small>
                                </button>
                            ))}
                            {hiddenCount > 0 && (
                                <button type="button" className="nb-svc more" onClick={() => setAllServices(true)}>+{hiddenCount} {t('service').toLocaleLowerCase('tr')}</button>
                            )}
                        </div>
                        {services.length === 0 && (quick || !seedMissing) && (
                            <button type="button" className="nb-hint" onClick={() => routerNavigate('/settings')}>Henüz {t('service').toLocaleLowerCase('tr')} yok — Ayarlar'dan ekle</button>
                        )}
                        {!quick && seedMissing && serviceSeed && (
                            <button type="button" className="nb-hint" onClick={loadServiceSeed} disabled={loadingSeed}>
                                {loadingSeed ? 'Ekleniyor…' : `+ ${serviceSeed.label}ni yükle — ${serviceSeed.services.slice(0, 3).map((x) => x.name).join(', ')}…`}
                            </button>
                        )}
                    </div>
                );

                const conflictLine = draftConflict && (
                    <div className="nb-warn" role="status">
                        <span>{draftConflict.message}</span>
                        {draftConflict.sug && (
                            <button type="button" onClick={() => { endTimeManuallyEditedRef.current = true; setStart(draftConflict.sug!.start, draftConflict.sug!.end); }}>
                                {draftConflict.sug.start} boş · al
                            </button>
                        )}
                    </div>
                );

                const timeSection = quick ? (
                    <div className="nb-sec">
                        <div className="nb-lbl"><span>Saat</span><em>{draftDur} dk</em></div>
                        <div className="nb-time">
                            <button type="button" className="nb-step" onClick={() => shiftStart(-stepMin)} aria-label={`${stepMin} dk erken`}><ChevronLeft /></button>
                            <div className="nb-time-v"><b>{newRes.startTime}</b><i>–</i><b>{newRes.endTime}</b></div>
                            <button type="button" className="nb-step" onClick={() => shiftStart(stepMin)} aria-label={`${stepMin} dk geç`}><ChevronRight /></button>
                        </div>
                        {nearSlots.length > 0 && (
                            <div className="nb-slots" aria-label="Yakındaki boş saatler">
                                <span className="nb-slots-l">Boş</span>
                                {nearSlots.map((sl) => (
                                    <button key={sl.startTime} type="button" className={cn('nb-slot', sl.startTime === newRes.startTime && 'on')}
                                        onClick={() => setStart(sl.startTime, sl.endTime)}>{sl.startTime}</button>
                                ))}
                            </div>
                        )}
                        {conflictLine}
                    </div>
                ) : (
                    <div className="nb-sec">
                        <div className="nb-lbl">
                            <span>Saat</span>
                            <em>{staffName ? `${staffName} için boş saatler` : 'Boş saatler'} · {draftDur} dk</em>
                        </div>
                        {freeSlots.length > 0 ? (
                            <div className="nb-chips">
                                {!freeSlots.some((x) => x.startTime === newRes.startTime) && (
                                    <button type="button" className="nb-slot on warn" title="Seçili saat — boş değil">{newRes.startTime}</button>
                                )}
                                {freeSlots.map((sl) => (
                                    <button key={sl.startTime} type="button" className={cn('nb-slot', sl.startTime === newRes.startTime && 'on')}
                                        onClick={() => setStart(sl.startTime, sl.endTime)}>{sl.startTime}</button>
                                ))}
                                <button type="button" className={cn('nb-slot more', customTime && 'on-soft')} onClick={() => setCustomTime((v) => !v)}>Başka saat</button>
                            </div>
                        ) : (
                            <p className="nb-empty">{slotsReady ? 'Bu gün için boş saat yok — başka gün seç ya da saati elle gir.' : 'Boş saatlere bakılıyor…'}</p>
                        )}
                        {(customTime || freeSlots.length === 0) && (
                            <div className="nb-times">
                                <label><span>Başlangıç</span>
                                    <input type="time" value={newRes.startTime} onChange={(e) => setStart(e.target.value)} /></label>
                                <i>–</i>
                                <label><span>Bitiş</span>
                                    <input type="time" value={newRes.endTime} onChange={(e) => { endTimeManuallyEditedRef.current = true; setNewRes(p => ({ ...p, endTime: e.target.value })); }} /></label>
                                <em>{draftDur} dk</em>
                            </div>
                        )}
                        {conflictLine}
                    </div>
                );

                const staffSection = staff.length > 0 && (
                    <div className="nb-sec">
                        <div className="nb-lbl"><span>{t('staff')}</span><em>{newRes.startTime}–{newRes.endTime}</em></div>
                        <div className={cn('nb-staff', quick && 'two')}>
                            <button type="button" className={cn('nb-st', !newRes.staffId && 'on')} aria-pressed={!newRes.staffId}
                                onClick={() => setNewRes(p => ({ ...p, staffId: '' }))}>
                                <span className="nb-st-av any"><Users /></span>
                                <span className="nb-st-tx"><b>Fark etmez</b><small className={cn('nb-st-note', anyPick?.staffMember ? 'free' : anyPick?.issue ? 'busy' : '')}>{anyPick?.staffMember ? `${anyPick.staffMember.name} atanır` : anyPick?.issue ? 'Herkes dolu' : `uygun ${lowerStaff} atanır`}</small></span>
                            </button>
                            {staffRows.map(({ member, state, note }) => (
                                <button key={member.id} type="button" className={cn('nb-st', newRes.staffId === member.id && 'on', state !== 'free' && 'dim')}
                                    aria-pressed={newRes.staffId === member.id} onClick={() => setNewRes(p => ({ ...p, staffId: member.id }))}>
                                    <span className="nb-st-av" style={{ ['--c' as string]: member.color || 'var(--dc-orange)' }}>{initialsOf(member.name) || '?'}</span>
                                    {quick ? (
                                        <span className="nb-st-tx"><b>{member.name}</b><small className={cn('nb-st-note', state)}>{note}</small></span>
                                    ) : (
                                        <>
                                            <span className="nb-st-tx"><b>{member.name}</b>{member.specialty && <small>{member.specialty}</small>}</span>
                                            <span className={cn('nb-st-state', state)}>{note}</span>
                                        </>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                );

                const summary = (
                    <p className="nb-sum">
                        <b>{newRes.customerName.trim() || '—'}</b>
                        {newRes.service ? ` · ${newRes.service}` : ''} · {newRes.startTime}–{newRes.endTime} · {staffName || `uygun ${lowerStaff}`}{unitName ? ` · ${unitName}` : ''}
                        {missing && <em className="nb-miss"> · {missing}</em>}
                    </p>
                );

                if (quick) {
                    return (
                        <div className="nb-layer" onMouseDown={tryClose}>
                            <div className="nb-ghost" style={{ left: quickAnchor!.left, top: quickAnchor!.top, width: quickAnchor!.width, height: quickAnchor!.height }} />
                            <section ref={popRef} className={cn('nb-pop', nudge && 'nudge')} style={{ ...popStyle!, width: POP_W }} role="dialog"
                                aria-label={`Yeni ${t('reservation').toLocaleLowerCase('tr')}`} onMouseDown={(e) => e.stopPropagation()}>
                                <header className="nb-pop-h">
                                    <div>
                                        <span className="nb-eyebrow">{t('newReservation')}</span>
                                        <h3>{dayLabelOf(selectedDate, true)} · <span>{newRes.startTime}</span></h3>
                                    </div>
                                    <button type="button" className="nb-icon" onClick={closeDialog} aria-label="Kapat"><X /></button>
                                </header>
                                <div className="nb-pop-b">
                                    {customerSection}
                                    {serviceSection}
                                    {timeSection}
                                    {staffSection}
                                </div>
                                <footer className="nb-pop-f">
                                    <button type="button" className="nb-link" onClick={() => setQuickAnchor(null)}>Ayrıntılar</button>
                                    {missing && <span className="nb-miss">{missing}</span>}
                                    <button type="button" className="nb-btn" disabled={!canSave} onClick={handleCreateReservation}>{saveLabel}</button>
                                </footer>
                            </section>
                        </div>
                    );
                }

                const strip = weekDaysOf(shiftISO(selectedDate, stripOffset * 7));
                const unitOpen = extras.unit || Boolean(resourceId);
                const noteOpen = showNote || Boolean(newRes.notes);
                const repeatOpen = extras.repeat || Boolean(recurrence.rule);
                const linesOpen = extras.lines || resLines.length > 0;
                const hasUnits = resources.length > 0 || profileForSector(settings.sector).resourceTypes.length > 0;
                return (
                    <div className="nb-overlay">
                        <div className="nb-scrim" onClick={tryClose} />
                        <section className={cn('nb-full', nudge && 'nudge')} role="dialog" aria-label={t('newReservation')}>
                            <header className="nb-full-h">
                                <div>
                                    <span className="nb-eyebrow">{t('newReservation')}</span>
                                    <h2>{dayLabelOf(selectedDate)} · <span>{newRes.startTime}</span></h2>
                                </div>
                                <button type="button" className="nb-icon" onClick={closeDialog} aria-label="Kapat"><X /></button>
                            </header>
                            <div className="nb-days">
                                <button type="button" className="nb-step" onClick={() => setStripOffset((o) => o - 1)} aria-label="Önceki hafta"><ChevronLeft /></button>
                                {strip.map((iso, i) => (
                                    <button key={iso} type="button" onClick={() => setSelectedDate(iso)}
                                        className={cn('nb-day', iso === selectedDate && 'on', iso < today && 'past', isClosed(iso) && 'closed')}>
                                        <small>{iso === today ? 'Bugün' : DAYS_TR[i]}</small><b>{Number(iso.slice(8, 10))}</b>
                                    </button>
                                ))}
                                <button type="button" className="nb-step" onClick={() => setStripOffset((o) => o + 1)} aria-label="Sonraki hafta"><ChevronRight /></button>
                            </div>
                            <div className="nb-full-b">
                                {customerSection}
                                {serviceSection}
                                {timeSection}
                                {staffSection}
                                {cfDefs.length > 0 && (
                                    <div className="nb-sec nb-cf">
                                        <CustomFieldsSection defs={cfDefs} values={cfValues} onChange={setCfValues}
                                            T={{ ink: 'var(--dc-ink)', muted: 'var(--nb-muted)', surface2: 'var(--dc-surface2)', border2: 'var(--dc-border2)', rSm: 10 }} />
                                    </div>
                                )}

                                <div className="nb-extras">
                                    {hasUnits && (
                                        <button type="button" className={cn('nb-x', unitOpen && 'on')} onClick={() => setExtras((x) => ({ ...x, unit: !unitOpen }))}>
                                            <Plus />{resourceTypeLabel}<small>{unitName ?? 'otomatik'}</small>
                                        </button>
                                    )}
                                    <button type="button" className={cn('nb-x', noteOpen && 'on')} onClick={() => setShowNote(!noteOpen)}><Plus />Not</button>
                                    <button type="button" className={cn('nb-x', repeatOpen && 'on')} onClick={() => setExtras((x) => ({ ...x, repeat: !repeatOpen }))}>
                                        <Plus />Tekrar{recurrence.rule && <small>{recurrence.rule === 'weekly' ? 'her hafta' : 'her ay'}</small>}
                                    </button>
                                    <button type="button" className={cn('nb-x', linesOpen && 'on')} onClick={() => setExtras((x) => ({ ...x, lines: !linesOpen }))}>
                                        <Plus />Başka işlem{resLines.length > 0 && <small>{resLines.length}</small>}
                                    </button>
                                </div>

                                {unitOpen && hasUnits && (
                                    <div className="nb-sec">
                                        <div className="nb-lbl"><span>{resourceTypeLabel}</span><em>Seçilmezse uygun olan atanır</em></div>
                                        {resources.length === 0 ? (
                                            <button type="button" className="nb-hint" onClick={() => routerNavigate('/settings')}>
                                                Henüz {resourceTypeLabel.toLocaleLowerCase('tr')} tanımlı değil — Ayarlar'dan ekle
                                            </button>
                                        ) : (
                                            <div className="nb-chips">
                                                <button type="button" className={cn('nb-svc', !resourceId && 'on')} onClick={() => setResourceId(null)}>Otomatik</button>
                                                {resources.map((res) => {
                                                    const sel = resourceId === res.id;
                                                    const busy = Boolean(newRes.startTime && newRes.endTime
                                                        && reservations.filter((r) => r.resourceId === res.id && r.date === selectedDate && r.status !== 'cancelled'
                                                            && clockMin(r.startTime) < clockMin(newRes.endTime) && clockMin(newRes.startTime) < clockMin(r.endTime)).length >= Math.max(1, res.capacity));
                                                    return (
                                                        <button key={res.id} type="button" disabled={busy} className={cn('nb-svc', sel && 'on', busy && 'busy')}
                                                            onClick={() => setResourceId(sel ? null : res.id)}>
                                                            {res.name}{res.capacity > 1 ? <small>{res.capacity} kişi</small> : null}{busy && <small>dolu</small>}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {noteOpen && (
                                    <label className="nb-field">
                                        <span>Not</span>
                                        <textarea rows={2} autoFocus={showNote && !newRes.notes}
                                            placeholder={settings.sector === 'dis' ? 'Örn. 25 distal — soğuk hassasiyeti' : 'Örn. ilk seans, hassas cilt'}
                                            value={newRes.notes} onChange={(e) => setNewRes(p => ({ ...p, notes: e.target.value }))} />
                                    </label>
                                )}

                                {repeatOpen && (
                                    <div className="nb-sec">
                                        <div className="nb-lbl"><span>Tekrar</span></div>
                                        <div className="nb-chips">
                                            {([['', 'Yok'], ['weekly', 'Her hafta'], ['monthly', 'Her ay']] as const).map(([val, lbl]) => (
                                                <button key={val} type="button" className={cn('nb-svc', recurrence.rule === val && 'on')}
                                                    onClick={() => setRecurrence(p => ({ ...p, rule: val }))}>{lbl}</button>
                                            ))}
                                        </div>
                                        {recurrence.rule && (
                                            <label className="nb-field" style={{ marginTop: 10 }}>
                                                <span>Bitiş tarihi <i>· boşsa 8 {recurrence.rule === 'weekly' ? 'hafta' : 'ay'}</i></span>
                                                <input type="date" min={selectedDate} value={recurrence.until}
                                                    onChange={(e) => setRecurrence(p => ({ ...p, until: e.target.value }))} />
                                            </label>
                                        )}
                                    </div>
                                )}

                                {linesOpen && (
                                    <div className="nb-sec">
                                        <div className="nb-lbl"><span>İşlemler</span>{resLines.length > 0 && <em>{resLines.length} eklendi</em>}</div>
                                        {resLines.map((l) => (
                                            <div key={l.id} className="nb-line">
                                                <i style={{ background: l.serviceColor }} />
                                                <span><b>{l.service}</b><small>{l.startTime}–{l.endTime} · {l.staffName || 'Fark etmez'}</small></span>
                                                <button type="button" className="nb-icon" onClick={() => removeResLine(l.id)} aria-label="Çıkar"><X /></button>
                                            </div>
                                        ))}
                                        <button type="button" className="nb-hint" onClick={addDraftLine} disabled={!newRes.service}>
                                            {newRes.service ? `+ ${newRes.service} işlemini ekle, sonra yenisini seç` : `Önce bir ${t('service').toLocaleLowerCase('tr')} seç`}
                                        </button>
                                    </div>
                                )}
                            </div>
                            <footer className="nb-full-f">
                                {summary}
                                <button type="button" className="nb-btn" disabled={!canSave} onClick={handleCreateReservation}>{saveLabel}</button>
                            </footer>
                        </section>
                    </div>
                );
            })()}

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
