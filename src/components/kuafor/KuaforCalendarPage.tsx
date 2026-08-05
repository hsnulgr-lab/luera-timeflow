import { useCallback, useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from 'react';
import {
    Armchair, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3,
    Droplets, Filter, Plus, Scissors, Sparkles, TimerReset, Users, Waves, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useReservations } from '@/hooks/useReservations';
import { useResources } from '@/hooks/useResources';
import { useStaff } from '@/hooks/useStaff';
import { useCustomers } from '@/hooks/useCustomers';
import { useWaitlist } from '@/hooks/useWaitlist';
import { useSlotResolver } from '@/hooks/useSlotResolver';
import { EditReservationModal } from '@/components/reservations/EditReservationModal';
import { NotificationDropdown } from '@/components/layout/NotificationDropdown';
import { todayISO, toISODate } from '@/utils/date';
import {
    KF_FORMULA_KEY as FORMULA_KEY,
    isKuaforColorService,
    kuaforLiveStageOf,
    type KuaforLiveStage,
} from '@/lib/kuaforFlow';
import type { Customer, Reservation } from '@/types';
import { packLanes, weekDaysOf } from '@/lib/calendarGrid';
import { KuaforOverlay } from './KuaforOverlay';
import { KuaforSuiteFrame } from './KuaforSuiteFrame';
import { addMinutes, dateLabel, initialsOf, minutesOf, timeOf } from './kuaforSuite';

type ViewMode = 'team' | 'week' | 'chairs';
/** Tek ziyaretin bir işlemi — kaydedilince kendi randevu satırına dönüşür. */
interface ServiceLine {
    id: string;
    service: string;
    serviceColor: string;
    price: number;
    staffId: string;
    staffName?: string;
    startTime: string;
    endTime: string;
}
type Lane = { id: string; name: string; detail: string; color: string; closed?: boolean };
type PositionedReservation = {
    reservation: Reservation;
    overlapIndex: number;
    overlapCount: number;
};

const DAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const ROW_HEIGHT = 88;

function isoDateParam(value: string | null): string | null {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = new Date(`${value}T12:00:00`);
    return Number.isNaN(parsed.getTime()) || toISODate(parsed) !== value ? null : value;
}

/** Dashboard'un "satılabilir boş saat" fırsatı ?time=14:30 ile buraya gelir. */
function timeParam(value: string | null): string | null {
    if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
    return value;
}

/**
 * Aynı lane'de çakışan randevuları kolonlara böler — geometri ortak katmandan
 * (lib/calendarGrid.packLanes). Aynı algoritmanın DayAgendaGrid ve
 * KuaforDashboard'da da ayrı yazımları vardı; hepsi tek gövdeye bağlandı.
 */
function layoutLaneAppointments(items: Reservation[]): PositionedReservation[] {
    return packLanes(items).map(({ item, lane, lanes }) => ({
        reservation: item,
        overlapIndex: lane,
        overlapCount: lanes,
    }));
}

function overlapCardStyle(index: number, count: number): CSSProperties {
    if (count <= 1) return { left: 5, width: 'calc(100% - 10px)' };
    const columnWidth = 100 / count;
    return {
        left: `calc(${index * columnWidth}% + ${index === 0 ? 5 : 3}px)`,
        width: `calc(${columnWidth}% - ${index === count - 1 ? 5 : 3}px)`,
    };
}

const STATE_LABELS: Record<KuaforLiveStage, string> = {
    pending: 'Onay bekliyor',
    confirmed: 'Planlandı',
    waiting: 'Salonda bekliyor',
    service: 'Uygulamada',
    processing: 'Boya süresi',
    finish: 'Yıkama / fön',
    checkout: 'Kasaya hazır',
    missed: 'Gelmedi',
    completed: 'Tamamlandı',
    cancelled: 'İptal',
};

export function KuaforCalendarPage() {
    const navigate = useNavigate();
    const { reservations, settings, addReservation } = useReservations();
    const { staff } = useStaff();
    const { resources } = useResources();
    const { allCustomers } = useCustomers();
    const { entries: waitlist, removeEntry } = useWaitlist();
    const { resolve, findSlots, isReady: slotRulesReady } = useSlotResolver();

    const today = todayISO();
    // Canlı saat: "şimdi" çizgisi ve 'Gelmedi' türetimi aynı kaynaktan okunsun
    // (render gövdesinde her çizimde yeni Date üretmek kararsız sonuç verir).
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 20_000);
        return () => clearInterval(timer);
    }, []);
    const appointmentState = useCallback(
        (reservation: Reservation): KuaforLiveStage =>
            kuaforLiveStageOf(reservation, { now, toleranceMin: settings.arrivalToleranceMin }),
        [now, settings.arrivalToleranceMin],
    );

    // URL'deki tarih hem yeni randevu taslağında hem de yalnızca görünüm
    // deep-link'inde kullanılabilir. Parametreleri mount'ta BİR KEZ okumak,
    // önce bugünü gösterip sonra hedef güne sıçrayan kademeli render'ı önler.
    const [initialUrl] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        const requestedDate = isoDateParam(params.get('date'));
        if (params.get('new') !== '1') return { requestedDate, launch: null };
        return {
            requestedDate,
            launch: {
                customerId: params.get('customer') || '',
                name: params.get('name') || '',
                phone: params.get('phone') || '',
                service: params.get('service') || '',
                date: requestedDate || '',
                startTime: timeParam(params.get('time')),
                waitlistId: params.get('waitlist') || '',
            },
        };
    });
    const launch = initialUrl.launch;

    const [date, setDate] = useState(initialUrl.requestedDate || today);
    const [view, setView] = useState<ViewMode>('team');
    const [staffFilter, setStaffFilter] = useState('all');
    const [selected, setSelected] = useState<Reservation | null>(null);
    const [editReservation, setEditReservation] = useState<Reservation | null>(null);
    const [newOpen, setNewOpen] = useState(Boolean(launch));
    const [saving, setSaving] = useState(false);
    const [customerTouched, setCustomerTouched] = useState(false);
    const [suggestOpen, setSuggestOpen] = useState(false);
    // Aynı ziyaretin ek işlemleri (kesim + boya + fön). Her satır KENDİ randevu
    // kaydı olur, hepsi tek groupId paylaşır: kasada tek hesap görünür ama
    // koltuk, saat ve personel — dolayısıyla prim — satır bazında doğru kalır.
    const [lines, setLines] = useState<ServiceLine[]>([]);
    const [draft, setDraft] = useState({
        customerId: launch?.customerId || '',
        customerName: launch?.name || '',
        customerPhone: launch?.phone || '',
        service: launch?.service || '',
        staffId: '',
        resourceId: '',
        startTime: launch?.startTime || '09:00',
        note: '',
        formula: '',
        waitlistId: launch?.waitlistId || '',
    });

    // Taslak parametreleri okundu; adres çubuğu temizlenir (dış sistem senkronu).
    useEffect(() => {
        if (!launch) return;
        window.history.replaceState(null, '', window.location.pathname);
    }, [launch]);

    useEffect(() => {
        if (!newOpen && !selected) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setNewOpen(false);
            setSelected(null);
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [newOpen, selected]);

    const activeStaff = useMemo(() => staff.filter((member) => member.isActive !== false), [staff]);
    const activeResources = useMemo(
        () => resources.filter((resource) => resource.isActive).sort((a, b) => a.sort - b.sort),
        [resources],
    );

    const weekDays = useMemo(
        () => weekDaysOf(date).map((iso, index) => ({
            iso,
            short: DAY_NAMES[index],
            day: Number(iso.slice(8, 10)),
            isToday: iso === today,
            count: reservations.filter((reservation) => reservation.date === iso && reservation.status !== 'cancelled').length,
        })),
        [date, reservations, today],
    );

    const dayReservations = useMemo(
        () => reservations
            .filter((reservation) => reservation.date === date && reservation.status !== 'cancelled')
            .sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [reservations, date],
    );

    // Çalışma penceresi gün başına okunur: hafta görünümündeki 7 gün farklı
    // saatlerde açık olabiliyor, tek güne bakmak yetmiyordu.
    const hoursForDate = useCallback((iso: string) => {
        const row = settings.workingHours?.find((hours) => hours.day === new Date(`${iso}T12:00:00`).getDay());
        if (!row || row.isOff) return { closed: true, open: 9 * 60, close: 18 * 60 };
        return { closed: false, open: minutesOf(row.start), close: minutesOf(row.end) };
    }, [settings.workingHours]);

    const selectedDayHours = hoursForDate(date);
    const isSalonClosed = selectedDayHours.closed;

    // Zaman ekseni hafta görünümünde 7 günün BİRLEŞİMİ. Tek günün penceresi
    // kullanıldığında farklı saatli günlerin randevuları eksenin dışında kalıp
    // en üste yığılmış güdük kartlara dönüşüyordu.
    const { startHour, endHour, hours } = useMemo(() => {
        const windows = view === 'week'
            ? weekDays.map((day) => hoursForDate(day.iso)).filter((window) => !window.closed)
            : [selectedDayHours];
        const open = windows.length ? Math.min(...windows.map((window) => window.open)) : 9 * 60;
        const close = windows.length ? Math.max(...windows.map((window) => window.close)) : 18 * 60;
        const first = Math.floor(open / 60);
        const last = Math.max(first + 1, Math.ceil(close / 60));
        return { startHour: first, endHour: last, hours: Array.from({ length: last - first }, (_, index) => first + index) };
    }, [hoursForDate, selectedDayHours, view, weekDays]);

    const lanes: Lane[] = useMemo(() => {
        if (view === 'week') {
            return weekDays.map((day) => {
                const closed = hoursForDate(day.iso).closed;
                return {
                    id: day.iso,
                    name: `${day.short} ${day.day}`,
                    detail: closed ? 'Kapalı' : day.isToday ? 'Bugün' : `${day.count} randevu`,
                    color: closed ? '#8A8580' : day.isToday ? '#FF5A1F' : '#8A8580',
                    closed,
                };
            });
        }
        if (view === 'chairs') {
            const source = activeResources.length
                ? [...activeResources]
                : [{ id: 'unassigned', name: 'Atanmamış', type: 'Salon alanı', capacity: 1, sort: 0, isActive: true, organizationId: '', createdAt: '' }];
            if (activeResources.length && dayReservations.some((reservation) => !reservation.resourceId)) {
                source.push({ id: 'unassigned', name: 'Atanmamış', type: 'Salon alanı', capacity: 1, sort: 999, isActive: true, organizationId: '', createdAt: '' });
            }
            return source.map((resource) => ({
                id: resource.id,
                name: resource.name,
                detail: resource.type || 'Koltuk',
                color: /y[ıi]kama/i.test(`${resource.name} ${resource.type}`) ? '#3B6FB0' : '#FF5A1F',
            }));
        }
        const source: { id: string; name: string; specialty?: string; color: string }[] = activeStaff.length
            ? activeStaff.filter((member) => staffFilter === 'all' || member.id === staffFilter)
            : [{ id: 'unassigned', name: 'Atanmamış', specialty: 'Salon', color: '#FF5A1F' }];
        if (activeStaff.length && staffFilter === 'all' && dayReservations.some((reservation) => !reservation.staffId)) {
            source.push({ id: 'unassigned', name: 'Atanmamış', specialty: 'Atama bekliyor', color: '#B87A00' });
        }
        return source.map((member) => ({
            id: member.id,
            name: member.name,
            detail: member.specialty || 'Kuaför',
            color: member.color || '#FF5A1F',
        }));
    }, [activeResources, activeStaff, dayReservations, hoursForDate, staffFilter, view, weekDays]);

    const reservationsForLane = useCallback((lane: Lane) => {
        if (view === 'week') {
            return reservations.filter((reservation) => reservation.date === lane.id && reservation.status !== 'cancelled');
        }
        if (view === 'chairs') {
            return dayReservations.filter((reservation) => (reservation.resourceId || 'unassigned') === lane.id);
        }
        return dayReservations.filter((reservation) => (reservation.staffId || 'unassigned') === lane.id);
    }, [dayReservations, reservations, view]);

    const laneSchedules = useMemo(() => lanes.map((lane) => {
        const visible = reservationsForLane(lane).filter((reservation) => {
            const reservationStart = minutesOf(reservation.startTime);
            const reservationEnd = minutesOf(reservation.endTime);
            return reservationEnd > startHour * 60 && reservationStart < endHour * 60;
        });
        const appointments = layoutLaneAppointments(visible);
        const maxOverlap = Math.max(1, ...appointments.map((appointment) => appointment.overlapCount));
        return {
            lane,
            appointments,
            minWidth: Math.min(390, 178 + (maxOverlap - 1) * 105),
        };
    }), [endHour, lanes, reservationsForLane, startHour]);
    const laneTemplate = laneSchedules.map((schedule) => `minmax(${schedule.minWidth}px, 1fr)`).join(' ');
    const timelineMinWidth = 64 + laneSchedules.reduce((sum, schedule) => sum + schedule.minWidth, 0);
    const timelineStyle = {
        '--lane-template': laneTemplate || 'minmax(178px, 1fr)',
        '--calendar-min-width': `${Math.max(242, timelineMinWidth)}px`,
        '--timeline-height': `${hours.length * ROW_HEIGHT}px`,
    } as CSSProperties;

    // Ziyaretin tek gerçeği `lines`. Pencerede "seçili hizmet" diye ayrı bir
    // ara durum YOK: hizmet listesinden seçmek işlemi doğrudan ziyarete ekler.
    // Önceki iki adımlı akış (seç → ayrıca butona bas) hem fazladan tıklamaydı
    // hem de buton hizmet boşken pasif göründüğü için bozuk sanılıyordu.
    const visitStart = lines[0]?.startTime || draft.startTime;
    const endTime = lines.length > 0 ? lines[lines.length - 1].endTime : draft.startTime;
    /** Sıradaki işlemin başlayacağı saat — son işlemin bitişi. */
    const nextStart = endTime;
    const colorLine = lines.find((line) => isKuaforColorService(line.service));

    // ?customer=<id> ile gelindiğinde ad/telefon/formül müşteri kaydından
    // OKUNUR; drafta kopyalanmaz (kopyalamak liste yüklenene kadar beklemeyi,
    // yani efektten setState etmeyi gerektiriyordu). Kullanıcı alana dokunduğu
    // anda taslak devralır.
    const launchCustomer = draft.customerId
        ? allCustomers.find((customer) => customer.id === draft.customerId)
        : undefined;
    const storedFormula = String(launchCustomer?.customFields?.[FORMULA_KEY] || '');
    const customerName = customerTouched ? draft.customerName : (draft.customerName || launchCustomer?.name || '');
    const customerPhone = customerTouched ? draft.customerPhone : (draft.customerPhone || launchCustomer?.phone || '');
    const formula = draft.formula || storedFormula;
    // Kendi öneri listemiz: native <datalist> hem tasarımın dışında bir kutu
    // çiziyor hem de Chrome'un adres otomatik doldurmasını tetikliyordu.
    const customerSuggestions = useMemo(() => {
        if (!suggestOpen || draft.customerId) return [];
        const query = customerName.trim().toLocaleLowerCase('tr').replace(/\s/g, '');
        return allCustomers
            .filter((customer) => !query || `${customer.name}${customer.phone}`
                .toLocaleLowerCase('tr').replace(/\s/g, '').includes(query))
            .slice(0, 6);
    }, [allCustomers, customerName, draft.customerId, suggestOpen]);
    const selectedStaff = activeStaff.find((member) => member.id === draft.staffId);
    const selectedResource = activeResources.find((resource) => resource.id === draft.resourceId);
    // Uygunluk artık tek slot için değil ZİYARETİN TAMAMI için hesaplanır:
    // her satır sırayla sınanır ve önceki satırlar `cart` olarak verilir, yani
    // ziyaretin kendi içindeki çakışma da canlı yakalanır.
    const lineIssues = useMemo(() => {
        if (!newOpen || !slotRulesReady || isSalonClosed) return [];
        const issues: string[] = [];
        const cart: { staffId: string; startTime: string; endTime: string }[] = [];
        for (const line of lines) {
            const verdict = resolve({
                date,
                startTime: line.startTime,
                endTime: line.endTime,
                staffId: line.staffId || undefined,
                resourceId: draft.resourceId || undefined,
                cart: [...cart],
            });
            if (verdict.issue) issues.push(`${line.startTime} ${line.service}: ${verdict.issue}`);
            cart.push({ staffId: line.staffId, startTime: line.startTime, endTime: line.endTime });
        }
        return issues;
    }, [date, draft.resourceId, isSalonClosed, lines, newOpen, resolve, slotRulesReady]);

    const availabilityState = isSalonClosed
        ? 'error'
        : lines.length === 0
            ? 'pending'
            : !slotRulesReady
                ? 'checking'
                : lineIssues.length > 0
                    ? 'error'
                    : 'ready';
    const availabilityTitle = availabilityState === 'ready'
        ? (lines.length > 1 ? 'Ziyaret planlandı' : 'Saat ve ekip uygun')
        : availabilityState === 'checking'
            ? 'Uygunluk kontrol ediliyor'
            : availabilityState === 'error'
                ? 'Planı gözden geçirin'
                : 'Hizmet seçimi bekleniyor';
    const availabilityDetail = isSalonClosed
        ? 'Salon seçili günde hizmet vermiyor.'
        : lineIssues[0]
            ? lineIssues[0]
            : availabilityState === 'checking'
                ? 'Personel ve salon kaynakları hazırlanıyor…'
                : availabilityState === 'ready'
                    ? (lines.length > 1
                        ? `${lines.length} işlem arka arkaya planlandı.`
                        : `${lines[0]?.staffName || selectedStaff?.name || 'Salon ekibi'} bu saat için uygun.`)
                    : 'Listeden hizmet seçtiğinizde süre ve uygunluk hesaplanır.';

    /**
     * Başlangıç saati sabit 09:00 kalmaz. Tercih edilen saat (kullanıcının
     * ızgaradan tıkladığı ya da mevcut taslak) gerçekten uygunsa aynen korunur;
     * dolu/geçmiş/kapalıysa gündeki İLK müsait başlangıç önerilir. Hizmet,
     * kuaför ve koltuk seçimi uygunluğu değiştirdiği için üçünde de çalışır.
     */
    const pickStart = useCallback((
        svcName: string, staffId: string, resourceId: string, preferred: string,
    ) => {
        const service = settings.services.find((item) => item.name === svcName);
        if (!service || !slotRulesReady || isSalonClosed) return preferred;
        const notBefore = date === today ? timeOf(now.getHours() * 60 + now.getMinutes()) : undefined;
        const fits = !resolve({
            date,
            startTime: preferred,
            endTime: addMinutes(preferred, service.duration || 45),
            staffId: staffId || undefined,
            resourceId: resourceId || undefined,
        })?.issue;
        if (fits && (!notBefore || preferred >= notBefore)) return preferred;
        const [slot] = findSlots({
            date,
            durationMin: service.duration || 30,
            stepMin: settings.slotDuration || 15,
            staffId: staffId || undefined,
            resourceId: resourceId || undefined,
            notBefore,
            limit: 1,
        });
        return slot?.startTime || preferred;
    }, [date, findSlots, isSalonClosed, now, resolve, settings.services, settings.slotDuration, slotRulesReady, today]);

    /** Boş pencere açılışı. Başlangıç saati ilk işlem seçilince pickStart ile
     *  müsait bir slota yerleşir; burada peşinen bir hizmet varsayılmaz. */
    const openNewReservation = () => {
        setLines([]);
        setNewOpen(true);
    };

    const openAt = (event: MouseEvent<HTMLDivElement>, lane: Lane) => {
        if ((event.target as HTMLElement).closest('.ks-appointment')) return;
        // Hafta görünümünde kapalılık şerit başına; gün görünümlerinde seçili gün.
        if (lane.closed ?? isSalonClosed) {
            toast.info(view === 'week' ? `${lane.name} günü salon kapalı` : 'Salon seçili günde kapalı');
            return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const offset = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
        const rawMinutes = startHour * 60 + (offset / ROW_HEIGHT) * 60;
        const rounded = Math.round(rawMinutes / 15) * 15;
        setDraft((previous) => ({
            ...previous,
            startTime: timeOf(rounded),
            ...(view === 'team' ? { staffId: lane.id === 'unassigned' ? '' : lane.id } : {}),
            ...(view === 'chairs' ? { resourceId: lane.id === 'unassigned' ? '' : lane.id } : {}),
        }));
        if (view === 'week') setDate(lane.id);
        setLines([]);
        setNewOpen(true);
    };

    /**
     * Hizmet listesinden seçim → işlem doğrudan ziyarete eklenir.
     * İlk işlem uygun bir başlangıca yerleşir (pickStart); sonrakiler önceki
     * işlemin bitişinden zincirlenir, çünkü müşteri koltukta beklemez.
     */
    const addService = (serviceName: string) => {
        const service = settings.services.find((item) => item.name === serviceName);
        if (!service) return;
        const member = activeStaff.find((candidate) => candidate.id === draft.staffId);
        const start = lines.length === 0
            ? pickStart(service.name, draft.staffId, draft.resourceId, draft.startTime)
            : nextStart;
        setLines((previous) => [...previous, {
            id: crypto.randomUUID?.() || String(Date.now()),
            service: service.name,
            serviceColor: service.color || '#FF5A1F',
            price: service.price || 0,
            staffId: draft.staffId,
            staffName: member?.name,
            startTime: start,
            endTime: addMinutes(start, service.duration || 45),
        }]);
        if (lines.length === 0) setDraft((previous) => ({ ...previous, startTime: start }));
    };

    const removeLine = (id: string) => setLines((previous) => reflow(
        previous.filter((line) => line.id !== id),
    ));

    /** Bir satırın kuaförü değişince yalnız o satır güncellenir. */
    const setLineStaff = (id: string, staffId: string) => setLines((previous) => previous.map((line) => (
        line.id === id
            ? { ...line, staffId, staffName: activeStaff.find((m) => m.id === staffId)?.name }
            : line
    )));

    /** Satırları verilen saatten itibaren yeniden zincirler (süreler korunur). */
    function reflow(list: ServiceLine[], from?: string): ServiceLine[] {
        let cursor = from || list[0]?.startTime;
        if (!cursor) return list;
        return list.map((line) => {
            const duration = Math.max(5, minutesOf(line.endTime) - minutesOf(line.startTime));
            const startTime = cursor as string;
            const endTime = addMinutes(startTime, duration);
            cursor = endTime;
            return { ...line, startTime, endTime };
        });
    }

    /** Ziyaretin başlangıcı değişince bütün işlemler birlikte kayar. */
    const shiftVisit = (startTime: string) => {
        setDraft((previous) => ({ ...previous, startTime }));
        setLines((previous) => reflow(previous, startTime));
    };

    const totalPrice = lines.reduce((sum, line) => sum + line.price, 0);
    const totalDuration = lines.reduce(
        (sum, line) => sum + Math.max(0, minutesOf(line.endTime) - minutesOf(line.startTime)), 0,
    );

    const createReservation = async () => {
        if (saving) return;
        if (!customerName.trim() || !customerPhone.trim()) {
            toast.error('Müşteri ve telefon bilgilerini tamamlayın');
            return;
        }
        if (lines.length === 0) {
            toast.error('En az bir hizmet seçin');
            return;
        }
        if (isSalonClosed) {
            toast.error('Salon seçili günde kapalı');
            return;
        }
        if (!slotRulesReady) {
            toast.error('Salon uygunluğu kontrol ediliyor, lütfen kısa süre sonra yeniden deneyin');
            return;
        }
        const pending = [...lines];
        setSaving(true);
        // Çoklu hizmet: her satır kendi randevusu, ortak groupId. Kasa bunları
        // tek hesapta toplar (salonCashTickets), prim satır bazında doğru kalır.
        const groupId = pending.length > 1 ? (crypto.randomUUID?.() || String(Date.now())) : undefined;
        const created: ServiceLine[] = [];
        const skipped: string[] = [];
        for (const line of pending) {
            // Son doğrulama ortak kural katmanından; `cart` bu turda üretilen
            // satırları da hesaba katar, yani parti içi çakışma da yakalanır.
            const verdict = resolve({
                date,
                startTime: line.startTime,
                endTime: line.endTime,
                staffId: line.staffId || undefined,
                resourceId: draft.resourceId || undefined,
                cart: created.map((item) => ({
                    staffId: item.staffId,
                    startTime: item.startTime,
                    endTime: item.endTime,
                })),
            });
            if (verdict.issue) {
                skipped.push(`${line.startTime} ${line.service}: ${verdict.issue}`);
                continue;
            }
            const result = await addReservation({
                customerId: draft.customerId,
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim(),
                date,
                startTime: line.startTime,
                endTime: line.endTime,
                service: line.service,
                serviceColor: line.serviceColor,
                status: 'confirmed',
                notes: draft.note,
                staffId: verdict.staffMember?.id || line.staffId || undefined,
                staffName: verdict.staffMember?.name || line.staffName,
                resourceId: draft.resourceId || undefined,
                groupId,
                // Renk formülü yalnız renk işlemine yazılır; kesim satırına
                // formül düşmesi müşteri kartındaki renk hafızasını kirletirdi.
                customFields: formula && isKuaforColorService(line.service)
                    ? { [FORMULA_KEY]: formula }
                    : undefined,
            });
            if (result) created.push(line);
        }
        setSaving(false);

        if (created.length === 0) {
            toast.error(skipped[0] || 'Randevu oluşturulamadı');
            return;
        }
        if (skipped.length > 0) {
            toast.warning(`${skipped.length} işlem eklenemedi`, { description: skipped[0] });
        }
        if (draft.waitlistId) await removeEntry(draft.waitlistId);
        setNewOpen(false);
        setCustomerTouched(false);
        setLines([]);
        setDraft((previous) => ({
            ...previous,
            customerId: '',
            customerName: '',
            customerPhone: '',
            note: '',
            formula: '',
            waitlistId: '',
        }));
        toast.success(created.length > 1
            ? `${created.length} işlem tek ziyaret olarak eklendi`
            : 'Randevu salon planına eklendi');
    };

    /** Serbest yazım — kayıtlı müşteriye bağlanma kararı öneri listesinden gelir. */
    const typeCustomerName = (value: string) => {
        setCustomerTouched(true);
        setSuggestOpen(true);
        setDraft((previous) => ({ ...previous, customerName: value, customerId: '' }));
    };

    const pickCustomer = (customer: Customer) => {
        setCustomerTouched(true);
        setSuggestOpen(false);
        setDraft((previous) => ({
            ...previous,
            customerName: customer.name,
            customerId: customer.id,
            customerPhone: customer.phone,
            formula: String(customer.customFields?.[FORMULA_KEY] || ''),
        }));
    };

    const processing = dayReservations.filter((reservation) => appointmentState(reservation) === 'processing').length;
    const inSalon = dayReservations.filter((reservation) => reservation.customerArrivedAt && reservation.status !== 'completed').length;
    const waiting = waitlist.filter((entry) => entry.status === 'waiting');
    const bookedMinutes = dayReservations.reduce((sum, reservation) => sum + Math.max(0, minutesOf(reservation.endTime) - minutesOf(reservation.startTime)), 0);
    // Doluluk seçili günün kendi penceresine göre — eksenin hafta birleşimi değil.
    const capacityMinutes = isSalonClosed
        ? 0
        : Math.max(1, (selectedDayHours.close - selectedDayHours.open) * Math.max(1, activeStaff.length));
    const occupancy = capacityMinutes ? Math.min(100, Math.round((bookedMinutes / capacityMinutes) * 100)) : 0;

    // "Boş saat" şeridi pencereden bağımsız çalışır (henüz hizmet seçilmemiş
    // olabilir): en kısa süreli hizmet referans alınır, böylece önerilen slot
    // en azından bir işlem için gerçekten uygundur.
    const probeService = useMemo(
        () => [...settings.services].filter((item) => item.duration > 0)
            .sort((a, b) => a.duration - b.duration)[0],
        [settings.services],
    );
    const freeSlots = useMemo(() => {
        if (isSalonClosed || !slotRulesReady) return [];
        return findSlots({
            date,
            durationMin: probeService?.duration || 30,
            stepMin: settings.slotDuration || 15,
            notBefore: date === today ? timeOf(now.getHours() * 60 + now.getMinutes()) : undefined,
            limit: 3,
        }).map((slot) => ({
            start: minutesOf(slot.startTime),
            end: minutesOf(slot.endTime),
        }));
    }, [date, findSlots, isSalonClosed, now, probeService?.duration, settings.slotDuration, slotRulesReady, today]);

    const shiftDate = (amount: number) => {
        const next = new Date(`${date}T12:00:00`);
        next.setDate(next.getDate() + amount * (view === 'week' ? 7 : 1));
        setDate(toISODate(next));
    };

    const nowInFrame = view === 'week' ? weekDays.some((day) => day.isToday) : date === today && !isSalonClosed;
    const nowTop = nowInFrame && now.getHours() >= startHour && now.getHours() < endHour
        ? ((now.getHours() * 60 + now.getMinutes() - startHour * 60) / 60) * ROW_HEIGHT
        : null;

    return (
        <KuaforSuiteFrame
            className="ks-calendar-page"
            eyebrow="SALON PLANLAYICI"
            title="Takvim,"
            accent="salon ritmiyle çalışır."
            description="Personel, koltuk, yıkama ve boya sürelerini tek akışta planlayın."
            icon={CalendarDays}
        >
            <h1 className="sr-only">Kuaför salonu takvimi</h1>
            <section className="ks-calendar-toolbar ks-calendar-command">
                <div className="ks-date-nav">
                    <button aria-label="Önceki" onClick={() => shiftDate(-1)}><ChevronLeft size={18} /></button>
                    <div>
                        <span>{date === today ? 'BUGÜN' : 'SEÇİLİ GÜN'}</span>
                        <strong>{dateLabel(date)}</strong>
                    </div>
                    <button aria-label="Sonraki" onClick={() => shiftDate(1)}><ChevronRight size={18} /></button>
                    <button className="ks-today" onClick={() => setDate(today)}>Bugün</button>
                </div>

                <div className="ks-calendar-quick-stats" aria-label="Seçili gün özeti">
                    <span><Scissors size={14} /><b>{dayReservations.length}</b><small>randevu</small></span>
                    <span><Users size={14} /><b>{inSalon}</b><small>salonda</small></span>
                    {processing > 0 && <span className="processing"><TimerReset size={14} /><b>{processing}</b><small>boya süresi</small></span>}
                    <span><Armchair size={14} /><b>%{occupancy}</b><small>planlanan</small></span>
                </div>

                <div className="ks-calendar-controls">
                    <div className="ks-segmented" aria-label="Takvim görünümü">
                        {([
                            ['team', 'Ekip', Users],
                            ['week', 'Hafta', CalendarDays],
                            ['chairs', 'Koltuklar', Armchair],
                        ] as const).map(([key, label, Icon]) => (
                            <button key={key} className={view === key ? 'active' : ''} aria-pressed={view === key} onClick={() => setView(key)}>
                                <Icon size={14} /> {label}
                            </button>
                        ))}
                    </div>
                    {view === 'team' && activeStaff.length > 0 && (
                        <label className="ks-filter">
                            <Filter size={14} />
                            <select value={staffFilter} onChange={(event) => setStaffFilter(event.target.value)}>
                                <option value="all">Tüm ekip</option>
                                {activeStaff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                            </select>
                        </label>
                    )}
                    <div className="ks-calendar-notifications" aria-label="Bildirimler"><NotificationDropdown /></div>
                    <button className="ks-btn ks-btn-primary ks-calendar-new" onClick={openNewReservation}>
                        <Plus size={16} /> Yeni randevu
                    </button>
                </div>
            </section>

            {view !== 'week' && (
                <nav className="ks-week-strip" aria-label="Bu haftanın günleri">
                    <span className="ks-week-strip-label">BU HAFTA</span>
                    {weekDays.map((day) => (
                        <button
                            key={day.iso}
                            className={`${day.iso === date ? 'active' : ''} ${day.isToday ? 'today' : ''}`}
                            aria-current={day.iso === date ? 'date' : undefined}
                            onClick={() => setDate(day.iso)}
                        >
                            <small>{day.short}</small>
                            <strong>{day.day}</strong>
                            <em>{day.count} randevu</em>
                        </button>
                    ))}
                </nav>
            )}

            <section className="ks-calendar-layout">
                <article className={`ks-timeline-card ${isSalonClosed && view !== 'week' ? 'is-closed' : ''}`}>
                    {isSalonClosed && view !== 'week' && (
                        <div className="ks-closed-banner">
                            <CalendarDays size={17} />
                            <span><b>Salon bu gün kapalı</b><small>Çalışma saatini Ayarlar bölümünden değiştirebilirsiniz.</small></span>
                        </div>
                    )}
                    <div className="ks-timeline-scroll">
                        <div className="ks-timeline-grid" style={timelineStyle}>
                            <header className="ks-lane-head">
                                <span className="ks-axis-corner"><Clock3 size={15} /></span>
                                {laneSchedules.map(({ lane, appointments }) => (
                                    <div key={lane.id} title={`${lane.name} · ${lane.detail}`}>
                                        <i style={{ background: lane.color }} />
                                        <span>
                                            <strong>{lane.name}</strong>
                                            <small>{appointments.length} randevu{lane.detail === 'Bugün' ? ' · Bugün' : ''}</small>
                                        </span>
                                    </div>
                                ))}
                            </header>
                            <div className="ks-timeline-body">
                                <div className="ks-time-axis">
                                    {hours.map((hour) => <span key={hour} style={{ height: ROW_HEIGHT }}>{String(hour).padStart(2, '0')}:00</span>)}
                                    {nowTop !== null && <i className="ks-now-label" style={{ top: nowTop }}>şimdi</i>}
                                </div>
                                <div className="ks-lanes">
                                    {laneSchedules.map(({ lane, appointments }) => (
                                        <div key={lane.id} className={`ks-lane ${lane.closed ? 'closed' : ''}`} style={{ height: hours.length * ROW_HEIGHT }} onDoubleClick={(event) => openAt(event, lane)}>
                                            {appointments.map(({ reservation, overlapIndex, overlapCount }) => {
                                                const start = Math.max(startHour * 60, minutesOf(reservation.startTime));
                                                const end = Math.min(endHour * 60, minutesOf(reservation.endTime));
                                                const top = ((start - startHour * 60) / 60) * ROW_HEIGHT;
                                                const height = Math.max(20, ((end - start) / 60) * ROW_HEIGHT - 3);
                                                const stage = appointmentState(reservation);
                                                const micro = height < 30;
                                                const compact = height < 50;
                                                const context = view === 'team'
                                                    ? STATE_LABELS[stage]
                                                    : reservation.staffName || STATE_LABELS[stage];
                                                return (
                                                    <button
                                                        key={reservation.id}
                                                        className={`ks-appointment ${stage} ${micro ? 'is-micro' : compact ? 'is-compact' : ''} ${overlapCount > 1 ? 'is-overlapping' : ''}`}
                                                        style={{
                                                            ...overlapCardStyle(overlapIndex, overlapCount),
                                                            top,
                                                            height,
                                                            '--service-color': reservation.serviceColor || lane.color,
                                                        } as CSSProperties}
                                                        onClick={(event) => { event.stopPropagation(); setSelected(reservation); }}
                                                        title={`${reservation.startTime} · ${reservation.customerName} · ${reservation.service}`}
                                                        aria-label={`${reservation.startTime}, ${reservation.customerName}, ${reservation.service}, ${STATE_LABELS[stage]}`}
                                                    >
                                                        <i aria-hidden="true" />
                                                        <span className="ks-appt-time">{reservation.startTime}</span>
                                                        <strong>{reservation.customerName}</strong>
                                                        {!compact && <small>{reservation.service}</small>}
                                                        {height >= 76 && <em>{context}</em>}
                                                    </button>
                                                );
                                            })}
                                            {nowTop !== null && (view !== 'week' || lane.id === today) && <div className="ks-now-line" style={{ top: nowTop }} />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    <footer className="ks-timeline-hint"><Sparkles size={13} /> {isSalonClosed && view !== 'week' ? 'Kapalı günde yeni saat eklenemez.' : 'Boş bir alana çift tıklayarak o saate randevu ekleyin.'}</footer>
                </article>
            </section>

            <section className="ks-calendar-opportunities" aria-label="Seçili günün uygun saatleri">
                <header>
                    <span><Sparkles size={15} /></span>
                    <p>
                        <small>UYGUN BOŞLUKLAR</small>
                        <strong>{dateLabel(date)} · {probeService?.name || 'Hizmet'} · {probeService?.duration || 30} dk</strong>
                    </p>
                </header>
                <div className="ks-calendar-slot-list">
                    {freeSlots.length ? freeSlots.map((slot) => (
                        <button key={slot.start} onClick={() => { setDraft((previous) => ({ ...previous, startTime: timeOf(slot.start) })); setLines([]); setNewOpen(true); }}>
                            <Clock3 size={14} /><b>{timeOf(slot.start)}–{timeOf(slot.end)}</b><ArrowRight size={13} />
                        </button>
                    )) : (
                        <p>{isSalonClosed ? 'Salon bu gün hizmet vermiyor.' : slotRulesReady ? 'Seçili hizmet için uygun başlangıç görünmüyor.' : 'Uygunluk bilgisi hazırlanıyor…'}</p>
                    )}
                </div>
                <button className="ks-calendar-waitlist" onClick={() => navigate('/reservations?tab=waitlist')}>
                    <Waves size={15} />
                    <span><b>{waiting.length} müşteri</b><small>uygun saat bekliyor</small></span>
                    <ArrowRight size={14} />
                </button>
            </section>

            {selected && (
                <KuaforOverlay className="ks-drawer-layer" onClick={() => setSelected(null)}>
                    <aside className="ks-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="ks-calendar-detail-title" onClick={(event) => event.stopPropagation()}>
                        <button className="ks-drawer-close" aria-label="Randevu detayını kapat" onClick={() => setSelected(null)}><X size={17} /></button>
                        <span className="ks-eyebrow">RANDEVU DETAYI</span>
                        <div className="ks-drawer-person">
                            <span>{initialsOf(selected.customerName)}</span>
                            <div><h2 id="ks-calendar-detail-title">{selected.customerName}</h2><p>{selected.customerPhone}</p></div>
                        </div>
                        <div className={`ks-status-pill ${appointmentState(selected)}`}>{STATE_LABELS[appointmentState(selected)]}</div>
                        <dl className="ks-detail-list">
                            <div><dt>Saat</dt><dd>{selected.startTime}–{selected.endTime}</dd></div>
                            <div><dt>İşlem</dt><dd>{selected.service}</dd></div>
                            <div><dt>Kuaför</dt><dd>{selected.staffName || 'Atanmadı'}</dd></div>
                            <div><dt>Koltuk / alan</dt><dd>{selected.resourceName || 'Otomatik'}</dd></div>
                            {selected.customFields?.[FORMULA_KEY] && <div className="formula"><dt>Renk formülü</dt><dd><Droplets size={14} /> {String(selected.customFields[FORMULA_KEY])}</dd></div>}
                            {selected.notes && <div><dt>Not</dt><dd>{selected.notes}</dd></div>}
                        </dl>
                        <div className="ks-drawer-actions">
                            <button className="ks-btn ks-btn-primary" onClick={() => { setEditReservation(selected); setSelected(null); }}>Randevuyu düzenle</button>
                            <button className="ks-btn ks-btn-ghost" onClick={() => navigate(selected.customerId ? `/customers?open=${selected.customerId}` : '/customers')}>Müşteri kartı</button>
                        </div>
                    </aside>
                </KuaforOverlay>
            )}

            {editReservation && (
                <EditReservationModal
                    reservation={reservations.find((reservation) => reservation.id === editReservation.id) || editReservation}
                    isOpen={!!editReservation}
                    onClose={() => setEditReservation(null)}
                />
            )}

            {newOpen && (
                <KuaforOverlay className="ks-modal-layer ks-appointment-modal-layer" onClick={() => setNewOpen(false)}>
                    <form
                        className="ks-modal ks-appointment-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="ks-new-reservation-title"
                        onClick={(event) => event.stopPropagation()}
                        onSubmit={(event) => {
                            event.preventDefault();
                            void createReservation();
                        }}
                    >
                        <header className="ks-appointment-modal-head">
                            <span className="ks-appointment-mark"><Scissors size={20} /></span>
                            <div className="ks-appointment-title">
                                <small>YENİ RANDEVU</small>
                                <h2 id="ks-new-reservation-title">Salona yeni randevu</h2>
                                <p>Müşteriyi ekleyin; süre ve uygunluğu birlikte planlayalım.</p>
                            </div>
                            <div className="ks-appointment-head-actions">
                                <span className="ks-appointment-date-pill">
                                    <CalendarDays size={14} />
                                    <span><b>{dateLabel(date)}</b><small>{visitStart}–{endTime}</small></span>
                                </span>
                                <button className="ks-appointment-close" type="button" aria-label="Yeni randevu penceresini kapat" onClick={() => setNewOpen(false)}><X size={17} /></button>
                            </div>
                        </header>
                        <div className="ks-modal-body ks-appointment-body">
                            <div className="ks-appointment-form">
                                <section className="ks-appointment-section">
                                    <header>
                                        <span className="ks-appointment-section-icon"><Users size={16} /></span>
                                        <div><strong>Müşteri</strong><small>Kayıtlı müşteriyi arayın veya yeni bir isim yazın.</small></div>
                                        {draft.customerId && <em><Check size={11} /> Kayıtlı</em>}
                                    </header>
                                    <div className="ks-form-grid ks-appointment-customer-grid">
                                        <label className="ks-customer-field">
                                            <span>Müşteri adı <b>*</b></span>
                                            <input
                                                autoFocus
                                                required
                                                autoComplete="off"
                                                value={customerName}
                                                onChange={(event) => typeCustomerName(event.target.value)}
                                                onFocus={() => setSuggestOpen(true)}
                                                // blur anında kapatmak öneriye tıklamayı yutuyor; kısa gecikme bırakılır
                                                onBlur={() => window.setTimeout(() => setSuggestOpen(false), 120)}
                                                placeholder="İsimle ara veya yeni müşteri yaz"
                                            />
                                            {customerSuggestions.length > 0 && (
                                                <div className="ks-customer-suggest" role="listbox">
                                                    {customerSuggestions.map((customer) => (
                                                        <button key={customer.id} type="button" role="option" aria-selected={false}
                                                            onMouseDown={(event) => event.preventDefault()}
                                                            onClick={() => pickCustomer(customer)}>
                                                            <i>{initialsOf(customer.name)}</i>
                                                            <span><b>{customer.name}</b><small>{customer.phone}</small></span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </label>
                                        <label>
                                            <span>Telefon <b>*</b></span>
                                            <input
                                                required
                                                type="tel"
                                                inputMode="tel"
                                                autoComplete="tel"
                                                value={customerPhone}
                                                onChange={(event) => {
                                                    setCustomerTouched(true);
                                                    setDraft((previous) => ({ ...previous, customerPhone: event.target.value }));
                                                }}
                                                placeholder="05xx xxx xx xx"
                                            />
                                        </label>
                                    </div>
                                </section>

                                <section className="ks-appointment-section">
                                    <header>
                                        <span className="ks-appointment-section-icon orange"><Scissors size={16} /></span>
                                        <div><strong>Randevu</strong><small>Hizmet süresi bitiş saatini otomatik hesaplar.</small></div>
                                        {totalDuration > 0 && <em>{totalDuration} dk</em>}
                                    </header>
                                    <div className="ks-form-grid ks-appointment-primary-grid">
                                        <label>
                                            <span>Hizmet <b>*</b>{lines.length > 0 && <em>{lines.length} işlem eklendi</em>}</span>
                                            {/* Seçim = ekleme. Ayrı bir "ekle" adımı yok; liste boşalınca
                                                select yine boşa döner ve sıradaki işlem seçilebilir. */}
                                            <select value="" onChange={(event) => addService(event.target.value)}>
                                                <option value="">{settings.services.length
                                                    ? (lines.length > 0 ? 'Bu ziyarete işlem ekle…' : 'Hizmet seçin…')
                                                    : 'Hizmet bulunamadı'}</option>
                                                {settings.services.map((service) => <option key={service.id} value={service.name}>{service.name} · {service.duration} dk</option>)}
                                            </select>
                                        </label>
                                        <label>
                                            <span>Başlangıç</span>
                                            <input type="time" step={900} value={visitStart} onChange={(event) => shiftVisit(event.target.value)} />
                                        </label>
                                    </div>
                                    <div className="ks-form-grid ks-appointment-assignment-grid">
                                        <label>
                                            <span>Kuaför <em>isteğe bağlı</em></span>
                                            <select value={draft.staffId} onChange={(event) => setDraft((previous) => ({ ...previous, staffId: event.target.value }))}>
                                                <option value="">En uygun kuaförü ata</option>
                                                {activeStaff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                                            </select>
                                        </label>
                                        <label>
                                            <span>Koltuk / yıkama <em>isteğe bağlı</em></span>
                                            <select value={draft.resourceId} onChange={(event) => setDraft((previous) => ({ ...previous, resourceId: event.target.value }))}>
                                                <option value="">Seçim yapılmadı</option>
                                                {activeResources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
                                            </select>
                                        </label>
                                    </div>
                                    <p className="ks-appointment-auto-note"><Sparkles size={13} /> Kuaför seçmezseniz müsait ekip üyesi otomatik atanır.</p>

                                    {/* Ziyaretin işlemleri — kesim + boya + fön. Her satırın kuaförü
                                        ayrı seçilebilir: boyayı başkası yapabilir ve prim ona yazılır. */}
                                    {lines.length === 0 ? (
                                        <p className="ks-line-empty">
                                            <Plus size={14} /> Yukarıdaki listeden hizmet seçin — birden fazla işlem ekleyebilirsiniz.
                                        </p>
                                    ) : (
                                        <ul className="ks-line-list">
                                            {lines.map((line, index) => (
                                                <li key={line.id}>
                                                    <b>{index + 1}</b>
                                                    <span>
                                                        <strong>{line.service}</strong>
                                                        <small>{line.startTime}–{line.endTime}</small>
                                                    </span>
                                                    <select value={line.staffId} aria-label={`${line.service} için kuaför`}
                                                        onChange={(event) => setLineStaff(line.id, event.target.value)}>
                                                        <option value="">Otomatik</option>
                                                        {activeStaff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                                                    </select>
                                                    {line.price > 0 && <em>{line.price.toLocaleString('tr-TR')} ₺</em>}
                                                    <button type="button" aria-label={`${line.service} işlemini çıkar`} onClick={() => removeLine(line.id)}>
                                                        <X size={14} />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </section>

                                <section className="ks-appointment-section ks-appointment-detail-section">
                                    <header>
                                        <span className="ks-appointment-section-icon soft"><Droplets size={16} /></span>
                                        <div><strong>Salon detayı</strong><small>Hazırlık bilgileri isteğe bağlıdır.</small></div>
                                        <em>Opsiyonel</em>
                                    </header>
                                    <div className={`ks-appointment-detail-grid ${colorLine ? '' : 'single'}`}>
                                        {colorLine && (
                                            <label className="ks-appointment-formula">
                                                <span>Renk formülü</span>
                                                <input value={formula} onChange={(event) => setDraft((previous) => ({ ...previous, formula: event.target.value }))} placeholder="7.1 + 8.0 / 20 vol" />
                                            </label>
                                        )}
                                        <label>
                                            <span>Salon notu</span>
                                            <textarea value={draft.note} onChange={(event) => setDraft((previous) => ({ ...previous, note: event.target.value }))} placeholder="Tercih, hassasiyet veya hazırlık notu…" rows={2} />
                                        </label>
                                    </div>
                                </section>
                            </div>

                            <aside className={`ks-appointment-preview ${availabilityState}`} aria-live="polite">
                                <span className="ks-preview-orbit" aria-hidden="true" />
                                <header><small>RANDEVU ÖZETİ</small><i><span /></i></header>
                                <div className="ks-preview-date"><CalendarDays size={15} /><span>{dateLabel(date)}</span></div>
                                <div className="ks-preview-time">
                                    <strong>{visitStart}</strong>
                                    <ArrowRight size={17} />
                                    <strong>{endTime}</strong>
                                </div>
                                <div className="ks-preview-service">
                                    <small>{lines.length > 1 ? `ZİYARET · ${lines.length} İŞLEM` : 'SEÇİLEN HİZMET'}</small>
                                    <strong>{lines.map((line) => line.service).join(' + ') || 'Hizmet seçin'}</strong>
                                    <span>
                                        {totalDuration ? `${totalDuration} dk` : 'Süre bekleniyor'}
                                        {totalPrice ? ` · ${totalPrice.toLocaleString('tr-TR')} ₺` : ''}
                                    </span>
                                </div>
                                <dl>
                                    <div><dt>Kuaför</dt><dd>{[...new Set(lines.map((line) => line.staffName).filter(Boolean))].join(', ') || selectedStaff?.name || 'Otomatik atanacak'}</dd></div>
                                    <div><dt>Salon alanı</dt><dd>{selectedResource?.name || 'Seçim yapılmadı'}</dd></div>
                                </dl>
                                <div className="ks-preview-status">
                                    <span>{availabilityState === 'ready' ? <Check size={15} /> : availabilityState === 'error' ? <X size={15} /> : <Clock3 size={15} />}</span>
                                    <p><strong>{availabilityTitle}</strong><small>{availabilityDetail}</small></p>
                                </div>
                            </aside>
                        </div>
                        <footer className="ks-appointment-footer">
                            <p><Sparkles size={14} /><span><b>Akıllı salon planı</b><small>Çakışmalar kaydetmeden önce yeniden kontrol edilir.</small></span></p>
                            <div>
                                <button className="ks-btn ks-btn-ghost" type="button" onClick={() => setNewOpen(false)}>Vazgeç</button>
                                <button className="ks-btn ks-btn-primary" type="submit" disabled={saving || availabilityState !== 'ready'}>{saving ? 'Kaydediliyor…' : 'Randevuyu oluştur'} <ArrowRight size={15} /></button>
                            </div>
                        </footer>
                    </form>
                </KuaforOverlay>
            )}
        </KuaforSuiteFrame>
    );
}
