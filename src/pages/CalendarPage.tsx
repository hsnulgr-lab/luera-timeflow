import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
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
import { activeRiskFlags, evaluateEligibility } from '@/lib/serviceEligibility';
import { CustomFieldsSection } from '@/components/CustomFieldsSection';
import { useCustomers } from '@/hooks/useCustomers';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/utils/cn';
import { useTheme } from '@/contexts/ThemeContext';
import { textOn } from '@/utils/palette';
import { todayISO, toISODate, formatDateEU } from '@/utils/date';
import { STATUS_BADGE, STATUS_LABEL } from '@/utils/statusColors';
import { ResourceLaneGrid } from '@/components/reservations/ResourceLaneGrid';
import { DayAgendaGrid } from '@/components/reservations/DayAgendaGrid';
import { AdisyonModal } from '@/components/reservations/AdisyonModal';
import { EditReservationModal } from '@/components/reservations/EditReservationModal';
import type { CalendarView, Reservation } from '@/types';

const DAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const DAYS_FULL = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

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

// clockMin / addMinutesToTime artık lib/slotResolution.ts içinde — slot
// kurallarıyla aynı yerde dursun diye taşındı (davranış birebir aynı).

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

// Bölüm altı yardım metni — v5: modal kendini anlatır, eğitim gerekmez
function MHelp({ children }: { children: React.ReactNode }) {
    return <p style={{ fontSize: 11.5, color: M.muted2, margin: '-3px 0 9px', lineHeight: 1.4 }}>{children}</p>;
}

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
    const { staff, resources, resolve: resolveSlotWith, findSlots } = useSlotResolver();
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
    // Randevu oluşturulduktan sonra gösterilecek başarı özeti (null = form görünür)
    const [successData, setSuccessData] = useState<null | {
        customerName: string; customerPhone: string; service: string; duration: number;
        dateLabel: string; startTime: string; endTime: string; staffName: string; staffColor?: string; serviceColor: string;
        createdCount: number; requestedCount: number;
    }>(null);

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
    const openReservation = useCallback((r: Reservation) => {
        if (settings.sector === 'guzellik') {
            routerNavigate(r.customerId ? `/beauty-customer/${r.customerId}` : '/customers');
            return;
        }
        setAdisyonRes(r);
    }, [settings.sector, routerNavigate]);

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
            ...activeRiskFlags(c, settings.sector).map((f) => `⚠ ${f.label}${f.note ? ` — ${f.note}` : ''}`),
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

    // Canlı özet (v5): Oluştur'a basmadan ne oluşturulacağı okunur
    const draftSummary = useMemo(() => {
        if (!selectedDate || !newRes.service) return '';
        const staffName = staff.find((s) => s.id === newRes.staffId)?.name;
        const unitName = resources.find((x) => x.id === resourceId)?.name;
        return [
            `${formatDateEU(selectedDate)} ${newRes.startTime}–${newRes.endTime}`,
            newRes.service,
            newRes.customerName || '—',
            staffName || `uygun ${t('staff').toLowerCase()}`,
            unitName,
        ].filter(Boolean).join(' · ');
    }, [selectedDate, newRes.service, newRes.startTime, newRes.endTime, newRes.customerName, newRes.staffId, staff, resources, resourceId, t]);

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
            if (saved) toast.success(`${serviceSeed.label} eklendi — süre ve ücretleri Ayarlar'dan düzenleyebilirsiniz`);
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
        setSuccessData(null);
        setNewRes(resetReservationDraft());
        setRecurrence({ rule: '', until: '' });
        setResLines([]);
        setResourceId(null);
        setCfValues({});
        setShowNote(false);
    };

    // Başarı ekranından "Yeni Randevu Oluştur" → formu sıfırla, modal açık kalsın
    const resetForm = () => {
        serviceManuallySelectedRef.current = false;
        endTimeManuallyEditedRef.current = false;
        setSuccessData(null);
        setCustomerQuery('');
        setCustomerLocked(false);
        setNewRes(resetReservationDraft());
        setRecurrence({ rule: '', until: '' });
        setResLines([]);
        setResourceId(null);
        setCfValues({});
        setShowNote(false);
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
                status: 'pending', notes: newRes.notes, staffId: ln.staffId || undefined, staffName: ln.staffName, staffColor: ln.staffColor,
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
                toast.warning(`${lines.length} işlemin ${createdLines.length} tanesi oluşturuldu; ${lines.length - createdLines.length} işlem eklenemedi`);
            }
            setSuccessData({
                customerName: newRes.customerName, customerPhone: newRes.customerPhone,
                service: lines.length > 1 ? `${createdLines.length} / ${lines.length} işlem` : first.service, duration: totalDur,
                dateLabel: formatDateEU(selectedDate), startTime: createdLines[0].startTime, endTime: createdLines[createdLines.length - 1].endTime,
                staffName: names || 'Fark etmez', staffColor: createdLines.length > 1 ? undefined : first.staffColor, serviceColor: first.serviceColor,
                createdCount: createdLines.length, requestedCount: lines.length,
            });
        } else if (lines.length > 1) {
            toast.error(`${lines.length} işlemin hiçbiri oluşturulamadı`);
        }
    };

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
                            onClick={() => { setSelectedDate(today); setShowNewDialog(true); }}
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
                                            onClick={() => {
                                                if (!available) return;
                                                const startTime = `${String(hour).padStart(2, '0')}:00`;
                                                setSelectedDate(d.date);
                                                setNewRes(p => ({ ...p, startTime, endTime: addMinutesToTime(startTime, serviceDuration(p.service)) }));
                                                setShowNewDialog(true);
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
                                    onAddAt={(hour, columnId, groupBy) => {
                                        const startTime = `${String(hour).padStart(2, '0')}:00`;
                                        setSelectedDate(toISODate(currentDate));
                                        if (groupBy === 'resource') setResourceId(columnId);
                                        setNewRes(p => ({
                                            ...p,
                                            startTime,
                                            endTime: addMinutesToTime(startTime, serviceDuration(p.service)),
                                            ...(groupBy === 'staff' && columnId ? { staffId: columnId } : {}),
                                        }));
                                        setShowNewDialog(true);
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
                                    onAddAt={(hour, resId) => {
                                        const startTime = `${String(hour).padStart(2, '0')}:00`;
                                        setSelectedDate(toISODate(currentDate));
                                        setResourceId(resId);
                                        setNewRes(p => ({ ...p, startTime, endTime: addMinutesToTime(startTime, serviceDuration(p.service)) }));
                                        setShowNewDialog(true);
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
                                            onClick={() => {
                                                if (!available) return;
                                                const startTime = `${String(hour).padStart(2, '0')}:00`;
                                                setSelectedDate(dateStr);
                                                setNewRes(p => ({ ...p, startTime, endTime: addMinutesToTime(startTime, serviceDuration(p.service)) }));
                                                setShowNewDialog(true);
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

            {/* New Reservation Dialog — Luera v2 */}
            {showNewDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={closeDialog} />
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full animate-in fade-in zoom-in-95 duration-200 flex flex-col"
                        style={{ maxWidth: 600, maxHeight: '90vh', background: M.surface, borderRadius: 22, boxShadow: '0 8px 48px rgba(14,14,14,.18), 0 2px 8px rgba(14,14,14,.08)' }}
                    >
                        <style>{TIME_BLOCK_CSS}</style>
                        {/* HEADER */}
                        <div className="flex items-center gap-3 flex-shrink-0" style={{ padding: '15px 18px 13px', borderBottom: `1px solid ${M.border}` }}>
                            <div className="relative grid place-items-center flex-shrink-0 overflow-hidden" style={{ width: 38, height: 38, borderRadius: 11, background: M.ink }}>
                                <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 68% 22%, rgba(255,90,31,.30), transparent 58%)' }} />
                                <Plus className="relative w-[17px] h-[17px]" style={{ color: M.cream }} strokeWidth={2.4} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.022em', color: M.ink }}>{t('newReservation')}</div>
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
                                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.025em', color: M.ink }}>
                                        {successData.createdCount < successData.requestedCount
                                            ? `${t('reservation')} Kısmen Oluşturuldu`
                                            : `${t('reservation')} Oluşturuldu`}
                                    </div>
                                    <div style={{ fontSize: 13, color: M.muted, lineHeight: 1.6, maxWidth: 310, marginTop: 4 }}>
                                        {successData.createdCount < successData.requestedCount
                                            ? `${successData.requestedCount} işlemin ${successData.createdCount} tanesi takvime eklendi; ${successData.requestedCount - successData.createdCount} işlem çakışma veya kayıt hatası nedeniyle eklenemedi.`
                                            : 'Takvime eklendi ve müşteriye onay bildirimi gönderildi.'}
                                    </div>
                                </div>
                                {/* Özet kartı */}
                                <div className="w-full flex flex-col text-left" style={{ background: M.surface2, border: `1px solid ${M.border}`, borderRadius: 10, padding: '14px 18px', gap: 8 }}>
                                    {([
                                        [t('customer'), successData.customerName],
                                        ...(successData.customerPhone ? [['Telefon', successData.customerPhone]] : []),
                                        ['Hizmet', `${successData.service} · ${successData.duration}dk`, successData.serviceColor],
                                        ['Tarih', successData.dateLabel],
                                        ['Saat', `${successData.startTime} – ${successData.endTime}`],
                                        [t('staff'), successData.staffName, successData.staffColor],
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
                                {/* WhatsApp bildirimi — v5 başarı ekranı ikincil aksiyonu */}
                                {successData.customerPhone && (
                                    <a href={waLinkTR(successData.customerPhone, `Merhaba ${successData.customerName}, ${t('reservation').toLocaleLowerCase('tr')} kaydınız oluşturuldu: ${successData.dateLabel} ${successData.startTime}–${successData.endTime} · ${successData.service}. Görüşmek üzere!`)}
                                        target="_blank" rel="noreferrer"
                                        className="inline-flex items-center justify-center gap-2 w-full transition-all"
                                        style={{ height: 42, borderRadius: 999, fontWeight: 700, fontSize: 13, border: `1px solid ${M.border2}`, color: M.ink, background: 'transparent' }}>
                                        WhatsApp ile bildir
                                    </a>
                                )}
                                {/* Yeni randevu butonu */}
                                <button onClick={resetForm} className="inline-flex items-center justify-center gap-2 w-full transition-all" style={{ marginTop: 4, height: 46, borderRadius: 999, fontWeight: 700, fontSize: 14.5, letterSpacing: '-0.01em', background: M.orange, color: M.ink }}
                                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(255,90,31,.32)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                                    {t('newReservation')} oluştur
                                    <span style={{ fontSize: 16, lineHeight: 1 }}>→</span>
                                </button>
                            </div>
                        )}

                        {/* BODY */}
                        {!successData && (
                        <div className="flex-1 overflow-y-auto flex flex-col" style={{ padding: '14px 18px 8px', gap: 16 }}>

                            {/* MÜŞTERİ */}
                            <div>
                                <MLabel>{t('customer')}</MLabel>
                                <MHelp>Kayıtlı {t('customer').toLowerCase()} arayın veya yeni isim yazın — otomatik kaydedilir.</MHelp>
                                {customerLocked ? (
                                    <>
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
                                    {/* Hasta bağlamı — hekim randevu açarken kritik bilgiyi burada görür */}
                                    {lockedCustomer && (
                                        <div className="flex items-center flex-wrap" style={{ gap: 6, marginTop: 7 }}>
                                            {medicalAlertsOf(lockedCustomer).map((a) => (
                                                <span key={a} className="inline-flex items-center" style={{ gap: 4, fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(192,57,43,.12)', color: '#C0392B' }}>
                                                    <AlertTriangle style={{ width: 11, height: 11, flexShrink: 0 }} />{a}
                                                </span>
                                            ))}
                                            {lockedCustomer.recallDate && (
                                                <span className="inline-flex items-center" style={{ gap: 4, fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: M.surface2, color: M.muted }}>
                                                    <CalendarClock style={{ width: 11, height: 11, flexShrink: 0 }} />Kontrol: {formatDateEU(lockedCustomer.recallDate)}
                                                </span>
                                            )}
                                            {lockedCustomer.lastVisit && (
                                                <span style={{ fontSize: 10.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: M.surface2, color: M.muted }}>
                                                    Son ziyaret: {formatDateEU(lockedCustomer.lastVisit)}
                                                </span>
                                            )}
                                            {settings.sector === 'dis' && (
                                                <button onClick={() => routerNavigate(`/dental-chart?patient=${lockedCustomer.id}`)}
                                                    style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'transparent', border: `1px solid ${M.border2}`, color: M.ink, cursor: 'pointer' }}>
                                                    Diş şeması →
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    </>
                                ) : (
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[15px] h-[15px] pointer-events-none" style={{ color: M.muted2 }} />
                                        <input
                                            type="text" placeholder={`İsim ile ara veya yeni ${t('customer').toLowerCase()} yaz…`}
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
                                                        {medicalAlertsOf(c).length > 0 && (
                                                            <span title={medicalAlertsOf(c).join(' · ')} style={{ color: '#C0392B', flexShrink: 0 }}>
                                                                <AlertTriangle style={{ width: 14, height: 14 }} />
                                                            </span>
                                                        )}
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
                                <MLabel>{t('service')}</MLabel>
                                <MHelp>{t('service')} seçilince süre ve bitiş saati otomatik hesaplanır.</MHelp>
                                <div className="flex flex-wrap" style={{ gap: 5 }}>
                                    {settings.services.map((s) => {
                                        const sel = newRes.service === s.name;
                                        return (
                                            <button
                                                key={s.id}
                                                onClick={() => {
                                                    serviceManuallySelectedRef.current = true;
                                                    setNewRes(p => ({ ...p, service: s.name, endTime: addMinutesToTime(p.startTime, s.duration) }));
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
                                {seedMissing && serviceSeed && (
                                    <button onClick={loadServiceSeed} disabled={loadingSeed} className="w-full text-left transition-colors"
                                        style={{ marginTop: 7, padding: '9px 12px', borderRadius: 10, border: `1px dashed ${M.border2}`, background: 'transparent', fontSize: 11.5, color: M.muted, cursor: loadingSeed ? 'wait' : 'pointer' }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = M.surface2; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                        {loadingSeed
                                            ? 'Ekleniyor…'
                                            : `+ ${serviceSeed.label}ni yükle — ${serviceSeed.services.slice(0, 4).map((x) => x.name).join(', ')}…`}
                                    </button>
                                )}
                            </div>

                            {/* ZAMAN */}
                            <div>
                                <MLabel>Zaman</MLabel>
                                <div className="lz-timeblock">
                                    <div className="lz-ts" onClick={(e) => { const i = e.currentTarget.querySelector('input'); (i as HTMLInputElement & { showPicker?: () => void })?.showPicker?.(); }}>
                                        <div className="lz-ts-lbl">Başlangıç</div>
                                        <input type="time" value={newRes.startTime} onChange={(e) => {
                                            const startTime = e.target.value;
                                            setNewRes(p => ({ ...p, startTime, endTime: addMinutesToTime(startTime, serviceDuration(p.service)) }));
                                        }} />
                                    </div>
                                    <div className="lz-ts-mid">
                                        <div className="lz-ts-mid-line" />
                                        <div className="lz-ts-dur">{durationMin(newRes.startTime, newRes.endTime)} dk</div>
                                        <div className="lz-ts-mid-line" />
                                    </div>
                                    <div className="lz-ts" onClick={(e) => { const i = e.currentTarget.querySelector('input'); (i as HTMLInputElement & { showPicker?: () => void })?.showPicker?.(); }}>
                                        <div className="lz-ts-lbl">Bitiş</div>
                                        <input type="time" value={newRes.endTime} onChange={(e) => {
                                            endTimeManuallyEditedRef.current = true;
                                            setNewRes(p => ({ ...p, endTime: e.target.value }));
                                        }} />
                                    </div>
                                </div>
                                {draftConflict && (
                                    <div role="status" className="flex items-center flex-wrap" style={{ gap: 6, marginTop: 8, padding: '9px 13px', borderRadius: 9, background: 'rgba(184,121,10,.12)', color: '#B8790A', fontSize: 12, fontWeight: 700 }}>
                                        {draftConflict.message}
                                        {draftConflict.sug && (
                                            <button onClick={() => {
                                                endTimeManuallyEditedRef.current = true;
                                                setNewRes(p => ({ ...p, startTime: draftConflict.sug!.start, endTime: draftConflict.sug!.end }));
                                            }}
                                                style={{ color: '#B8790A', textDecoration: 'underline', fontWeight: 800, fontSize: 12, padding: 2 }}>
                                                {draftConflict.sug.start} uygun →
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* PERSONEL */}
                            {staff.length > 0 && (
                                <div>
                                    <MLabel>{t('staff')}</MLabel>
                                    <MHelp>Fark etmez seçilirse uygun {t('staff').toLowerCase()}e atanır.</MHelp>
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

                            {/* KAYNAK (051) — sektör profili kaynak tanımlıyor ama henüz eklenmemişse yönlendir */}
                            {resources.length === 0 && profileForSector(settings.sector).resourceTypes.length > 0 && (
                                <div>
                                    <MLabel>{resourceTypeLabel}</MLabel>
                                    <button onClick={() => routerNavigate('/settings')} className="w-full text-left transition-colors"
                                        style={{ padding: '9px 12px', borderRadius: 10, border: `1px dashed ${M.border2}`, background: 'transparent', fontSize: 11.5, color: M.muted, cursor: 'pointer' }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = M.surface2; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                        Henüz {resourceTypeLabel.toLowerCase()} tanımlı değil — {t('reservations').toLocaleLowerCase('tr')} {resourceTypeLabel.toLowerCase()} bazında takip etmek için Ayarlar'dan ekleyin →
                                    </button>
                                </div>
                            )}
                            {resources.length > 0 && (
                                <div>
                                    <MLabel>{resourceTypeLabel}</MLabel>
                                    <MHelp>Seçilmezse uygun {resourceTypeLabel.toLowerCase()} otomatik atanır.</MHelp>
                                    <div className="flex flex-wrap" style={{ gap: 5 }}>
                                        {/* v9: "Otomatik" = kaynak seçilmemiş durum (resourceId null) */}
                                        <button onClick={() => setResourceId(null)}
                                            className="inline-flex items-center transition-all whitespace-nowrap"
                                            style={{
                                                padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, lineHeight: 1.2,
                                                border: `1px solid ${!resourceId ? M.ink : M.border2}`,
                                                background: !resourceId ? M.ink : M.surface2,
                                                color: !resourceId ? M.cream : M.muted,
                                            }}>
                                            Otomatik
                                        </button>
                                        {resources.map(res => {
                                            const sel = resourceId === res.id;
                                            // Seçili saat aralığında bu ünitedeki dolu randevu sayısı kapasiteyi doldurmuş mu?
                                            const busy = Boolean(selectedDate && newRes.startTime && newRes.endTime
                                                && reservations.filter((r) => r.resourceId === res.id && r.date === selectedDate && r.status !== 'cancelled'
                                                    && clockMin(r.startTime) < clockMin(newRes.endTime) && clockMin(newRes.startTime) < clockMin(r.endTime)).length >= Math.max(1, res.capacity));
                                            return (
                                                <button key={res.id} onClick={() => { if (!busy) setResourceId(sel ? null : res.id); }}
                                                    disabled={busy}
                                                    className="inline-flex items-center transition-all whitespace-nowrap"
                                                    style={{
                                                        padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, lineHeight: 1.2, gap: 6,
                                                        border: `1px solid ${sel ? M.ink : M.border2}`,
                                                        background: sel ? M.ink : M.surface2,
                                                        color: sel ? M.cream : busy ? M.muted2 : M.muted,
                                                        opacity: busy ? 0.55 : 1, cursor: busy ? 'not-allowed' : 'pointer',
                                                        textDecoration: busy ? 'line-through' : 'none',
                                                    }}>
                                                    {res.name}{res.capacity > 1 ? ` · ${res.capacity} kişi` : ''}
                                                    {busy && <span style={{ textDecoration: 'none', fontSize: 9.5, fontWeight: 800, color: '#B8790A', background: 'rgba(184,121,10,.14)', padding: '2px 6px', borderRadius: 999 }}>dolu</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* SEKTÖRE ÖZEL ALANLAR (050) */}
                            {cfDefs.length > 0 && (
                                <div>
                                    <CustomFieldsSection defs={cfDefs} values={cfValues} onChange={setCfValues}
                                        T={{ ink: M.ink, muted: M.muted, surface2: M.surface2, border2: M.border2, rSm: 10 }} />
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

                            {/* NOT — v9: katlanır */}
                            <div style={{ paddingBottom: 6 }}>
                                {(showNote || newRes.notes) ? (
                                    <>
                                        <MLabel optional="(opsiyonel)">Not</MLabel>
                                        <textarea
                                            placeholder="Örn: 25 distal — hasta soğuk hassasiyeti bildirdi" rows={2} autoFocus={showNote && !newRes.notes}
                                            style={{ ...fieldBase, height: 60, resize: 'none', lineHeight: 1.55 }}
                                            onFocus={onFieldFocus} onBlur={onFieldBlur}
                                            value={newRes.notes} onChange={(e) => setNewRes(p => ({ ...p, notes: e.target.value }))}
                                        />
                                    </>
                                ) : (
                                    <button onClick={() => setShowNote(true)} className="inline-flex items-center transition-colors" style={{ gap: 7, fontSize: 12.5, fontWeight: 700, color: M.muted, height: 40, padding: '0 4px' }}
                                        onMouseEnter={(e) => e.currentTarget.style.color = M.ink}
                                        onMouseLeave={(e) => e.currentTarget.style.color = M.muted}>
                                        <Plus className="w-4 h-4" strokeWidth={2.2} /> Tedavi notu ekle
                                    </button>
                                )}
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
                            {draftSummary && (
                                <div style={{ fontFamily: MONO, fontSize: 11.5, color: M.muted, background: M.surface2, borderRadius: 9, padding: '10px 13px', marginBottom: 6, lineHeight: 1.5 }}>
                                    {draftSummary}
                                </div>
                            )}
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
                                {creatingReservation ? 'Oluşturuluyor…' : (() => {
                                    // v9: eksik zorunlu alanı butonda göster
                                    const miss = !newRes.customerName ? `${t('customer')} seçin` : !newRes.customerPhone ? 'Telefon girin' : !newRes.service && resLines.length === 0 ? `${t('service')} seçin` : '';
                                    const n = resLines.length + (newRes.service ? 1 : 0);
                                    const label = n > 1 ? `${t('newReservation')} · ${n} işlem` : t('newReservation');
                                    return <>{label}{miss && <span style={{ fontSize: 12, fontWeight: 600, opacity: .85, marginLeft: 6 }}>· {miss}</span>}</>;
                                })()}
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
