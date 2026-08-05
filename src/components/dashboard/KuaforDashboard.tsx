import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ElementType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle, ArrowRight, BadgeCheck, CalendarDays, Check, ChevronDown, ChevronRight,
    CircleDollarSign, Clock3, Coffee, DoorOpen, Droplets, Eye, EyeOff, Gauge, History,
    PackageOpen, Plus, RefreshCw, Scissors, Search, ShieldCheck, Sparkles, TimerReset,
    UserPlus, WandSparkles, Waves, WalletCards, X, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { useCustomers } from '@/hooks/useCustomers';
import { useWaitlist } from '@/hooks/useWaitlist';
import { useSlotResolver } from '@/hooks/useSlotResolver';
import { useModules, useCashEnabled } from '@/hooks/useModules';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import { todayISO, toISODate } from '@/utils/date';
import { phaseOf, minsSince, advancePatch } from '@/lib/sessionPhase';
import { profileForSector } from '@/lib/sectorProfiles';
import {
    KF_FORMULA_KEY as CF_FORMULA,
    KF_STAGE_KEY as CF_STAGE,
    KF_TIMER_KEY as CF_TIMER,
    isKuaforColorService as isColorService,
    isKuaforWashUnit as isWashUnit,
    kuaforLiveStageOf,
    kuaforStageOf as stageOf,
    type KuaforStage as KfStage,
} from '@/lib/kuaforFlow';
import {
    KF_USAGE_DONE_KEY as CF_USAGE_DONE,
    KF_USAGE_KEY as CF_USAGE,
    encodeUsage, recipeFor, usageAlreadyDeducted, usageFor, usageOverrides,
    type UsageLine,
} from '@/lib/serviceRecipe';
import { useProducts } from '@/hooks/useProducts';
import { useStock } from '@/hooks/useStock';
import { EditReservationModal } from '@/components/reservations/EditReservationModal';
import type { Customer, Reservation, Service } from '@/types';
import { findAvailableSlots, staffWorksAt, type AvailableSlot } from '@/lib/slotResolution';
import { packLanes } from '@/lib/calendarGrid';
import { reservationPrice } from '@/utils/reservationServices';
import './kuaforOps.css';

// ── Kuaför Dashboard'u · "Salon akışı" ───────────────────────────────────────
// Tasarım: Timeflow Kuafor Dashboard V2. İlke — kuaförde randevu saati değil
// müşterinin GERÇEK AŞAMASI yönetilir: bekliyor → uygulamada → boya süresi →
// yıkama/fön → kasa. Boya süresi salonun tek gerçek "sayaçlı" işidir; kaçırılan
// kontrol saçı yakar. Bu yüzden gecikmiş kontrol ekranın en koyu kartıdır.
//
// Aşama, yeni bir kolon değil: zaman damgalarından (sessionPhase) türetilir,
// yalnız 'active' fazının içindeki iki ara adım (boya süresi / yıkama) randevu
// custom_fields'ında saklanır — sayfa yenilense de sayaç doğru devam eder.

type BoardView = 'flow' | 'seats' | 'team';
type ScheduleView = 'team' | 'resources';
type Tone = 'amber' | 'orange' | 'purple' | 'blue' | 'green' | 'red';
type PriorityKind = 'overdue' | 'long-wait' | 'missed' | 'checkout' | 'waiting' | 'late'
    | 'finish' | 'service' | 'processing' | 'upcoming';

// Boya süresi varsayılanı; hizmet süresi biliniyorsa onun yarısı kullanılır
const PROCESS_MIN = 30;
const CF_LIVE_RESOURCE = 'kf_live_resource_id';
const NO_WASH_RE = /danışman|konsültasyon|makyaj|kaş|kirpik|manikür|pedikür|ağda|epilasyon|masaj|örgü|topuz|şekillendirme|sadece fön|kuru kesim/i;
const likelyNeedsWash = (name: string) => !NO_WASH_RE.test(name || '');

const STAGES: { key: KfStage; label: string; icon: ElementType }[] = [
    { key: 'waiting', label: 'Bekliyor', icon: Clock3 },
    { key: 'service', label: 'İşlemde', icon: Scissors },
    { key: 'processing', label: 'Boya süresi', icon: TimerReset },
    { key: 'finish', label: 'Yıkama / Bitiriş', icon: Waves },
    { key: 'checkout', label: 'Kasaya hazır', icon: WalletCards },
];

const STAGE_TONE: Record<KfStage, Tone> = {
    waiting: 'amber', service: 'orange', processing: 'purple', finish: 'blue', checkout: 'green',
};

const money = (n: number) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const initialsOf = (name: string) => name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toLocaleUpperCase('tr');
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
/** Timestamp'ı temizlemek için — updateReservation undefined'ı atlar, null'ı yazar. */
const CLEAR = null as unknown as undefined;

export function KuaforDashboard() {
    const navigate = useNavigate();
    const { dark } = useTheme();
    const {
        reservations, settings, updateReservation, addReservation, checkConflict,
        isLoading: reservationsLoading, isSettingsLoading, error: reservationsError, settingsError,
    } = useReservations();
    const {
        customers, addCustomer, updateCustomer, isLoading: customersLoading, error: customersError,
    } = useCustomers();
    const {
        entries: waitlist, isLoading: waitlistLoading, error: waitlistError,
    } = useWaitlist();
    // Sarf tüketimi: hizmet reçetesi (Ayarlar → Hizmetler) işlem kasaya
    // gönderilirken stok defterine 'usage' hareketi olarak düşer.
    const { products } = useProducts();
    const { addMovements } = useStock();
    const {
        rules: slotRules, staff, resources, timeOff, isReady: slotRulesReady,
        staffLoading, resourceLoading, timeOffLoading, staffError, resourceError, timeOffError,
    } = useSlotResolver();
    const { isEnabled } = useModules();
    const cashOn = useCashEnabled();
    const today = todayISO();

    // Ağır hesaplar 20 saniyede bir tazelenir; saniyelik sayaçlar kendi
    // bileşenlerinde döner (bütün dashboard saniyede bir yeniden çizilmesin).
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 20_000);
        return () => clearInterval(t);
    }, []);
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const [boardView, setBoardView] = useState<BoardView>('flow');
    const [scheduleView, setScheduleView] = useState<ScheduleView>('team');
    const [privacy, setPrivacy] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [walkinOpen, setWalkinOpen] = useState(false);
    const [processingRes, setProcessingRes] = useState<Reservation | null>(null);
    const [editRes, setEditRes] = useState<Reservation | null>(null);

    const services: Service[] = useMemo(() => settings.services || [], [settings.services]);
    const active = useMemo(() => reservations.filter((r) => r.status !== 'cancelled'), [reservations]);
    const todayList = useMemo(
        () => active.filter((r) => r.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [active, today],
    );
    const activeResources = useMemo(() => resources.filter((r) => r.isActive).sort((a, b) => a.sort - b.sort), [resources]);
    const enabledStaff = useMemo(() => staff.filter((s) => s.isActive !== false), [staff]);

    const workDay = useMemo(() => {
        const wh = settings.workingHours?.find((w) => w.day === now.getDay());
        return {
            open: toMin(wh?.start || '09:00'),
            close: toMin(wh?.end || '19:00'),
            isOff: wh?.isOff ?? false,
        };
    }, [settings.workingHours, now]);
    const isSalonOpen = !workDay.isOff && nowMin >= workDay.open && nowMin < workDay.close;
    const activeStaff = useMemo(() => enabledStaff.filter((member) => (
        staffWorksAt(
            { timeOff, workingHours: settings.workingHours || [] },
            member,
            today,
            fromMin(nowMin),
            fromMin(nowMin + 1),
        )
    )), [enabledStaff, timeOff, settings.workingHours, today, nowMin]);

    const isDashboardLoading = reservationsLoading || isSettingsLoading || customersLoading
        || waitlistLoading || staffLoading || resourceLoading || timeOffLoading;
    const loadErrors = [
        reservationsError, settingsError, customersError, waitlistError,
        staffError, resourceError, timeOffError,
    ].filter(Boolean) as string[];

    // ── Aşama kümeleri ────────────────────────────────────────────────────────
    const byStage = useMemo(() => {
        const map: Record<KfStage, Reservation[]> = { waiting: [], service: [], processing: [], finish: [], checkout: [] };
        for (const r of todayList) { const s = stageOf(r); if (s) map[s].push(r); }
        return map;
    }, [todayList]);
    const inSalon = useMemo(
        () => STAGES.flatMap((s) => byStage[s.key]),
        [byStage],
    );
    const missedAppointments = useMemo(
        () => todayList.filter((r) => kuaforLiveStageOf(r, {
            now,
            toleranceMin: settings.arrivalToleranceMin,
        }) === 'missed'),
        [todayList, now, settings.arrivalToleranceMin],
    );
    const lateAppointments = useMemo(
        () => todayList.filter((r) => phaseOf(r) === 'wait'
            && !missedAppointments.some((missed) => missed.id === r.id)
            && toMin(r.startTime) < nowMin),
        [todayList, missedAppointments, nowMin],
    );
    const upcoming = useMemo(
        () => todayList.filter((r) => phaseOf(r) === 'wait' && toMin(r.startTime) >= nowMin),
        [todayList, nowMin],
    );
    const doneToday = useMemo(() => todayList.filter((r) => phaseOf(r) === 'completed'), [todayList]);

    // Gecikmiş renk kontrolleri — ekranın en kritik sinyali
    const overdueChecks = useMemo(
        () => byStage.processing
            .filter((r) => { const e = r.customFields?.[CF_TIMER]; return typeof e === 'string' && new Date(e).getTime() <= now.getTime(); })
            .sort((a, b) => String(a.customFields?.[CF_TIMER]).localeCompare(String(b.customFields?.[CF_TIMER]))),
        [byStage.processing, now],
    );
    // 10 dakikayı geçen bekleme — karşılama sinyali
    const longWaits = useMemo(
        () => byStage.waiting
            .map((r) => ({ r, mins: r.customerArrivedAt ? minsSince(r.customerArrivedAt, now) : 0 }))
            .filter((x) => x.mins >= 10)
            .sort((a, b) => b.mins - a.mins),
        [byStage.waiting, now],
    );

    // ── Kaynak sahipliği — TEK KAYNAK ─────────────────────────────────────────
    // Bir randevunun o an fiilen tuttuğu koltuk/yıkama ünitesi. Kasa aşamasında
    // ya da salon dışında kaynak tutulmaz: randevu başka bir ekrandan (Kasa,
    // Rezervasyonlar) tamamlandığında custom_fields temizlenmiyor ve koltuk
    // şeritte "boş" görünürken "Koltuğa al" adımına dolu geliyordu.
    const liveResourceId = useCallback((r: Reservation) => {
        const stage = stageOf(r);
        if (stage === null || stage === 'checkout') return undefined;
        const stored = r.customFields?.[CF_LIVE_RESOURCE];
        if (typeof stored === 'string') return stored;
        // Eski kayıtlar için planlı kaynak yalnız aktif hizmet aşamasında
        // geçici fallback'tir; bekleyen müşteri koltuğu işgal etmiş sayılmaz.
        return stage === 'service' || stage === 'processing' ? r.resourceId : undefined;
    }, []);

    // ── Kaynak durumu (koltuk / yıkama) ───────────────────────────────────────
    const units = useMemo(() => activeResources.map((res) => {
        const here = inSalon.filter((r) => liveResourceId(r) === res.id);
        const working = here.find((r) => { const s = stageOf(r); return s === 'service' || s === 'processing' || s === 'finish'; });
        const st = stageOf(working || ({} as Reservation));
        const overdue = working && overdueChecks.some((o) => o.id === working.id);
        const prep = !working && here.some((r) => stageOf(r) === 'waiting');
        const state: 'free' | 'busy' | 'processing' | 'prep' | 'late' =
            overdue ? 'late' : st === 'processing' ? 'processing' : working ? 'busy' : prep ? 'prep' : 'free';
        return {
            id: res.id, name: res.name, wash: isWashUnit(res.name, res.type), state,
            client: working?.customerName || (prep ? 'Hazırlanıyor' : 'Boş'),
            detail: overdue ? 'Renk kontrolü gecikti'
                : working ? working.service
                    : prep ? 'Müşteri bekliyor' : 'Hazır',
            freeAt: working?.endTime,
        };
    }), [activeResources, inSalon, overdueChecks, liveResourceId]);

    const chairs = useMemo(() => units.filter((u) => !u.wash), [units]);
    const washes = useMemo(() => units.filter((u) => u.wash), [units]);
    const busyChairs = chairs.filter((c) => ['busy', 'processing', 'late'].includes(c.state)).length;
    const busyWashes = washes.filter((c) => ['busy', 'processing', 'late'].includes(c.state)).length;

    // ── Ekip yükü ─────────────────────────────────────────────────────────────
    const team = useMemo(() => enabledStaff.map((s) => {
        const mine = todayList.filter((r) => r.staffId === s.id);
        const minutes = mine.reduce((sum, r) => sum + Math.max(0, toMin(r.endTime) - toMin(r.startTime)), 0);
        const span = Math.max(60, workDay.close - workDay.open);
        const load = Math.min(100, Math.round((minutes / span) * 100));
        const current = inSalon
            .filter((r) => r.staffId === s.id)
            .sort((a, b) => {
                const rank = (r: Reservation) => {
                    const stage = stageOf(r);
                    return stage === 'processing' ? 0 : stage === 'service' || stage === 'finish' ? 1 : stage === 'checkout' ? 2 : 3;
                };
                return rank(a) - rank(b);
            })[0];
        const next = mine.find((r) => phaseOf(r) === 'wait' && toMin(r.startTime) >= nowMin);
        const onShift = activeStaff.some((member) => member.id === s.id);
        return {
            id: s.id, name: s.name, role: s.specialty || profileForSector(settings.sector).staffRoles?.doctor?.label || 'Kuaför',
            load, count: mine.length, onShift,
            current: current ? `${current.customerName.split(' ')[0]} · ${current.service}`
                : !onShift ? 'İzinli / mesai dışında'
                    : mine.length ? 'Şu an boşta' : 'Bugün randevusu yok',
            next: next ? `${next.customerName.split(' ')[0]} · ${next.startTime}` : 'Gün planı bitti',
            tone: !onShift ? 'muted' : load >= 85 ? 'red' : load >= 60 ? '' : load >= 30 ? 'blue' : 'green',
        };
    }), [enabledStaff, activeStaff, todayList, inSalon, workDay, nowMin, settings.sector]);

    // ── Gizlilik maskesi (ortak ekranda soyad) ────────────────────────────────
    const mask = useMemo(() => (name: string) => {
        if (!privacy || !name) return name;
        const parts = name.trim().split(/\s+/);
        if (parts.length < 2) return parts[0] || name;
        return `${parts[0]} ${parts[parts.length - 1][0].toLocaleUpperCase('tr')}.`;
    }, [privacy]);

    // ── Seçili müşteri ────────────────────────────────────────────────────────
    const selected = useMemo(
        () => todayList.find((r) => r.id === selectedId) || overdueChecks[0] || inSalon[0] || missedAppointments[0] || lateAppointments[0] || upcoming[0] || null,
        [todayList, selectedId, overdueChecks, inSalon, missedAppointments, lateAppointments, upcoming],
    );

    // ── Aşama ilerletme ───────────────────────────────────────────────────────
    // Her ilerletme geri alınabilir: sonner aksiyonu önceki alanları aynen yazar.
    const runStep = async (
        r: Reservation,
        patch: Partial<Reservation>,
        undo: Partial<Reservation>,
        message: string,
        allowUndo = true,
    ) => {
        if (busyId) return;                       // çift tıklama ikinci kayıt açmaz
        setBusyId(r.id);
        const ok = await updateReservation(r.id, patch);
        setBusyId(null);
        if (!ok) return;
        setSelectedId(r.id);
        toast.success(message, allowUndo ? {
            action: { label: 'Geri al', onClick: () => { void updateReservation(r.id, undo); } },
        } : undefined);
    };

    const cf = (r: Reservation, patch: Record<string, string | number | boolean | undefined>) => {
        const next = { ...(r.customFields || {}) };
        for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete next[k]; else next[k] = v; }
        return next;
    };

    const liveResourceIsFree = useCallback((resourceId: string, exceptId?: string) => !inSalon.some((item) => (
        item.id !== exceptId && liveResourceId(item) === resourceId
    )), [inSalon, liveResourceId]);

    // Sarf malzemesi işlem KAPANIRKEN düşer — tek yer burası. Reçetesi olan her
    // hizmet otomatik yazar; renk sayacında girilen düzeltme reçeteyi ezer.
    // Randevuya konan bayrak, aynı randevu tekrar kapatılırsa çift düşmeyi
    // engeller (kasaya gönderme geri alınabiliyor).
    const deductServiceUsage = useCallback(async (r: Reservation) => {
        if (usageAlreadyDeducted(r)) return;
        const lines = usageFor(r, settings.services, products);
        if (lines.length === 0) return;
        await addMovements(lines.map((line) => ({
            productId: line.productId,
            type: 'usage' as const,
            delta: -line.quantity,
            note: `${r.service} · ${r.customerName}`,
            reservationId: r.id,
        })));
    }, [addMovements, products, settings.services]);

    const sendToCheckout = (r: Reservation, message?: string) => {
        const prevCF = { ...(r.customFields || {}) };
        const usage = usageAlreadyDeducted(r) ? [] : usageFor(r, settings.services, products);
        void deductServiceUsage(r);
        void runStep(r, {
            ...advancePatch('completed'),
            customFields: cf(r, {
                [CF_STAGE]: undefined,
                [CF_TIMER]: undefined,
                [CF_LIVE_RESOURCE]: undefined,
                ...(usage.length > 0 ? { [CF_USAGE_DONE]: true } : {}),
            }),
        }, {
            serviceEndedAt: CLEAR,
            status: 'confirmed',
            customFields: prevCF,
        }, message || `${r.customerName.split(' ')[0]} kasaya gönderildi`, false);
    };

    // Yıkama/bitiriş bir AŞAMA'dır, kaynak şartı değil. Salonların çoğunda ayrı
    // yıkama ünitesi yoktur — yıkama koltuğun başındaki evyede yapılır. Ayrı
    // ünite tanımlıysa müşteri oraya taşınır; yoksa ya da hepsi doluysa akış
    // mevcut koltukta devam eder. Aşamayı bloklamak müşteriyi "İşlemde"
    // kolonunda kilitliyor ve kasaya giden tek yolu kapatıyordu.
    const moveToFinish = (r: Reservation) => {
        const wash = washes.find((unit) => liveResourceIsFree(unit.id, r.id));
        const stayPut = liveResourceId(r) || r.resourceId;
        const prevCF = { ...(r.customFields || {}) };
        const first = r.customerName.split(' ')[0];
        void runStep(r, {
            customFields: cf(r, {
                [CF_STAGE]: 'finish',
                [CF_TIMER]: undefined,
                [CF_LIVE_RESOURCE]: wash?.id || stayPut || undefined,
            }),
        }, { customFields: prevCF }, wash
            ? `${first} · ${wash.name} alanına alındı`
            : washes.length === 0
                ? `${first} yıkama / bitirişe alındı`
                : `${first} bitirişte — yıkama alanları dolu, koltukta devam ediyor`);
    };

    const startService = (r: Reservation) => {
        // Kapanış saatinden sonra koltukta müşteri olması kuaförde kural, istisna
        // değil: 19:00'da kapanan salon 19:20'de son müşteriyi bitiriyor olur.
        // Bu yüzden yalnız KAPALI GÜN engeldir; mesai sonrası akış durdurulmaz.
        if (workDay.isOff) {
            toast.error('Salon bugün kapalı');
            return;
        }
        if (!slotRulesReady) {
            toast.loading('Personel ve kaynak uygunluğu kontrol ediliyor…', { duration: 1800 });
            return;
        }
        const occupiedStaff = new Set(inSalon
            .filter((item) => {
                const stage = stageOf(item);
                return item.id !== r.id && (stage === 'service' || stage === 'finish');
            })
            .map((item) => item.staffId)
            .filter(Boolean));
        // Vardiya listesi tercih edilir ama zorunlu değildir: mesai bitmiş ya da
        // vardiya hiç tanımlanmamış bir salonda koltukta müşteri olması kuralın
        // kendisidir. Kimse vardiyada görünmüyorsa aktif personel havuzuna düşülür.
        const onShiftPool = activeStaff.filter((member) => !occupiedStaff.has(member.id));
        const fallbackPool = enabledStaff.filter((member) => !occupiedStaff.has(member.id));
        const pool = onShiftPool.length > 0 ? onShiftPool : fallbackPool;
        const assigned = pool.find((member) => member.id === r.staffId);
        const member = assigned || pool[0];
        const plannedChair = chairs.find((chair) => chair.id === r.resourceId && liveResourceIsFree(chair.id, r.id));
        const chair = plannedChair || chairs.find((candidate) => liveResourceIsFree(candidate.id, r.id));
        if (!member) {
            toast.error(enabledStaff.length === 0
                ? 'Henüz personel eklenmemiş; koltuğa alma personele bağlıdır'
                : 'Tüm kuaförler şu anda başka müşteride', {
                action: enabledStaff.length === 0
                    ? { label: 'Personel ekle', onClick: () => navigate('/staff') }
                    : undefined,
            });
            return;
        }
        const offShift = onShiftPool.length === 0;
        if (!chair) {
            toast.error('Şu anda boş koltuk yok');
            return;
        }
        const conflict = checkConflict(r.date, r.startTime, r.endTime, r.id, member.id, r.resourceId);
        if (conflict && member.id !== r.staffId) {
            toast.error(`${member.name}, planlanan saatte başka bir müşteride`);
            return;
        }
        const prevCF = { ...(r.customFields || {}) };
        void runStep(r, {
            ...advancePatch('active'),
            staffId: member.id,
            customFields: cf(r, { [CF_LIVE_RESOURCE]: chair.id }),
        }, {
            arrivedAt: CLEAR,
            status: 'confirmed',
            staffId: r.staffId || CLEAR,
            customFields: prevCF,
        }, `${r.customerName.split(' ')[0]} · ${chair.name} · ${member.name}${offShift ? ' (mesai dışı)' : ''}`);
    };

    /** Aşamaya göre geçerli sonraki adım. Alternatif, yıkama gerektirmeyen hizmetlerde akışı zorlamaz. */
    const nextStep = (r: Reservation): {
        label: string;
        run: () => void;
        secondary?: { label: string; run: () => void };
    } | null => {
        const st = stageOf(r);
        if (st === null && phaseOf(r) === 'wait') return {
            label: kuaforLiveStageOf(r, { now, toleranceMin: settings.arrivalToleranceMin }) === 'missed'
                ? 'Geç geldi olarak işaretle' : 'Geldi olarak işaretle',
            run: () => void runStep(r, advancePatch('arrived'),
                { customerArrivedAt: CLEAR }, `${r.customerName.split(' ')[0]} geldi olarak işaretlendi`),
        };
        if (st === 'waiting') return {
            label: 'Koltuğa al',
            run: () => startService(r),
        };
        if (st === 'service') {
            if (isColorService(r.service)) {
                return {
                    label: 'Boya süresini başlat',
                    run: () => setProcessingRes(r),
                    secondary: { label: 'Boya sayacı olmadan bitir', run: () => moveToFinish(r) },
                };
            }
            return likelyNeedsWash(r.service)
                ? {
                    label: 'Yıkamaya al',
                    run: () => moveToFinish(r),
                    secondary: { label: 'Yıkamasız kasaya gönder', run: () => sendToCheckout(r) },
                }
                : {
                    label: 'Kasaya gönder',
                    run: () => sendToCheckout(r),
                    secondary: { label: 'Yıkama / bitirişe al', run: () => moveToFinish(r) },
                };
        }
        if (st === 'processing') return {
            label: 'Kontrol edildi · yıkamaya al',
            run: () => moveToFinish(r),
            secondary: { label: 'Yıkamasız kasaya gönder', run: () => sendToCheckout(r) },
        };
        if (st === 'finish') return {
            label: 'Kasaya gönder',
            run: () => sendToCheckout(r),
        };
        if (st === 'checkout') {
            // Kasa modülü kapalıysa tahsilat başka bir yerde takip ediliyordur;
            // randevunun "Kasaya hazır" kolonunda süresiz beklememesi için
            // kapatma adımı sunulur (ödeme kaydı üretilmez).
            if (!cashOn) return {
                label: 'Kaydı kapat',
                run: () => void runStep(r, { isPaid: true }, { isPaid: false },
                    `${r.customerName.split(' ')[0]} kaydı kapatıldı`),
            };
            return {
                label: 'Kasada tahsil et',
                run: () => navigate(`/kasa?reservation=${encodeURIComponent(r.id)}`),
            };
        }
        return null;
    };

    /** Gecikmiş kontrole gerekçeli +2 dk — audit için not olarak da yazılır. */
    const extendTimer = (r: Reservation) => {
        const endStr = r.customFields?.[CF_TIMER];
        const base = typeof endStr === 'string' ? Math.max(new Date(endStr).getTime(), Date.now()) : Date.now();
        void runStep(r, { customFields: cf(r, { [CF_TIMER]: new Date(base + 2 * 60_000).toISOString() }) },
            { customFields: { ...(r.customFields || {}) } }, '+2 dakika uzatma kaydedildi');
    };

    // Renk hafızası tek yerden beslenir: formül, sayaç başlarken kuaförün elinde
    // olduğu an kaydedilir. Randevuya yazılır (geçmişte hangi işlemde ne
    // kullanıldığı kalır) ve müşteri kartına aynalanır (bir sonraki ziyarette
    // "son formül" olarak açılır).
    const beginProcessing = (r: Reservation, minutes: number, formula: string, usage: UsageLine[]) => {
        const safeMinutes = Math.max(5, Math.min(180, Math.round(minutes)));
        const trimmed = formula.trim();
        const prevCF = { ...(r.customFields || {}) };
        void runStep(r, {
            customFields: cf(r, {
                [CF_STAGE]: 'processing',
                [CF_TIMER]: new Date(Date.now() + safeMinutes * 60_000).toISOString(),
                ...(trimmed ? { [CF_FORMULA]: trimmed } : {}),
                // Miktar düzeltmesi randevuya yazılır; stok işlem kapanınca düşer
                // (boya sürerken müşteri vazgeçebilir, sayaç geri alınabilir).
                ...(usage.length > 0 ? { [CF_USAGE]: encodeUsage(usage) } : {}),
            }),
        }, { customFields: prevCF }, `Boya süresi başladı · ${safeMinutes} dk`);
        if (trimmed && r.customerId) {
            const customer = customers.find((c) => c.id === r.customerId);
            if (customer && String(customer.customFields?.[CF_FORMULA] || '') !== trimmed) {
                void updateCustomer(r.customerId, {
                    customFields: { ...(customer.customFields || {}), [CF_FORMULA]: trimmed },
                });
            }
        }
        setProcessingRes(null);
    };

    // ── Boşluk avı: çalışma saati + personel + izin + koltuk kapasitesi ───────
    const gap = useMemo(() => {
        if (!slotRulesReady || workDay.isOff || nowMin >= workDay.close || chairs.length === 0) return null;
        type Match = { start: number; end: number; waitlistId?: string; serviceName: string };
        const matches: Match[] = [];
        const eligible = waitlist.filter((entry) => entry.status === 'waiting'
            && (!entry.preferredDate || entry.preferredDate === today)
            && Boolean(entry.serviceId));

        for (const entry of eligible) {
            const service = services.find((candidate) => candidate.id === entry.serviceId);
            if (!service) continue;
            let bestForEntry: Match | null = null;
            for (const chair of chairs) {
                const [slot] = findAvailableSlots(slotRules, {
                    date: today,
                    durationMin: service.duration,
                    resourceId: chair.id,
                    notBefore: fromMin(nowMin),
                    stepMin: settings.slotDuration || 15,
                    limit: 1,
                });
                if (!slot) continue;
                const candidate = {
                    start: toMin(slot.startTime),
                    end: toMin(slot.endTime),
                    waitlistId: entry.id,
                    serviceName: service.name,
                };
                if (!bestForEntry || candidate.start < bestForEntry.start) bestForEntry = candidate;
            }
            if (bestForEntry) matches.push(bestForEntry);
        }

        if (matches.length === 0) {
            const service = [...services].filter((item) => item.duration > 0).sort((a, b) => a.duration - b.duration)[0];
            if (!service) return null;
            for (const chair of chairs) {
                const [slot] = findAvailableSlots(slotRules, {
                    date: today,
                    durationMin: service.duration,
                    resourceId: chair.id,
                    notBefore: fromMin(nowMin),
                    stepMin: settings.slotDuration || 15,
                    limit: 1,
                });
                if (slot) matches.push({
                    start: toMin(slot.startTime),
                    end: toMin(slot.endTime),
                    serviceName: service.name,
                });
            }
        }
        const best = matches.sort((a, b) => a.start - b.start || a.end - b.end)[0];
        if (!best) return null;
        const fits = new Set(matches
            .filter((candidate) => candidate.waitlistId && candidate.start === best.start)
            .map((candidate) => candidate.waitlistId)).size;
        return { ...best, len: best.end - best.start, fits };
    }, [
        slotRulesReady, workDay.isOff, workDay.close, nowMin, chairs, waitlist, today,
        services, slotRules, settings.slotDuration,
    ]);

    // ── Geri dönüş zamanı gelen müşteriler ────────────────────────────────────
    const recallDays = profileForSector(settings.sector).comms.recall?.afterDays ?? 28;
    const futureByCustomer = useMemo(() => {
        const set = new Set<string>();
        for (const r of active) if (r.date > today || (r.date === today && toMin(r.startTime) > nowMin)) set.add(r.customerId);
        return set;
    }, [active, today, nowMin]);

    const dueBack = useMemo(() => {
        const cutoff = new Date(now); cutoff.setDate(now.getDate() - recallDays);
        const cutoffISO = toISODate(cutoff);
        return customers
            .filter((c) => {
                if (futureByCustomer.has(c.id)) return false;
                if (c.recallDate) return c.recallDate <= today;
                return Boolean(c.lastVisit && c.lastVisit <= cutoffISO);
            })
            .sort((a, b) => (a.recallDate || a.lastVisit || '').localeCompare(b.recallDate || b.lastVisit || ''));
    }, [customers, futureByCustomer, now, recallDays, today]);
    const reachable = useMemo(() => dueBack.filter((c) => Boolean(c.phone)).length, [dueBack]);

    // Yeniden randevu oranı — son 30 günde gelenlerin ileri randevusu var mı
    const rebookRate = useMemo(() => {
        const from = new Date(now); from.setDate(now.getDate() - 30);
        const fromISO = toISODate(from);
        const recent = new Set(active.filter((r) => r.date >= fromISO && r.date <= today && r.status === 'completed').map((r) => r.customerId));
        if (recent.size === 0) return null;
        let n = 0; recent.forEach((id) => { if (futureByCustomer.has(id)) n++; });
        return Math.round((n / recent.size) * 100);
    }, [active, now, today, futureByCustomer]);

    // ── Yarının hazırlığı (stok kolonu olmadığı için gerçek sinyal) ───────────
    const tomorrow = useMemo(() => {
        const t = new Date(now); t.setDate(now.getDate() + 1);
        const iso = toISODate(t);
        const list = active.filter((r) => r.date === iso).sort((a, b) => a.startTime.localeCompare(b.startTime));
        return {
            iso, list,
            color: list.filter((r) => isColorService(r.service)),
            pending: list.filter((r) => r.status === 'pending'),
        };
    }, [active, now]);

    // ── Ekip ritmi ölçüleri ───────────────────────────────────────────────────
    const rhythm = useMemo(() => {
        const started = todayList.filter((r) => r.arrivedAt);
        const onTime = started.filter((r) => {
            const d = new Date(r.arrivedAt as string);
            return (d.getHours() * 60 + d.getMinutes()) <= toMin(r.startTime) + 5;
        }).length;
        const span = Math.max(60, workDay.close - workDay.open);
        const capacity = span * Math.max(1, chairs.length);
        const booked = todayList.reduce((sum, r) => sum + Math.max(0, toMin(r.endTime) - toMin(r.startTime)), 0);
        // Payda yalnız müşterinin GELDİĞİ randevular: hiç gelmeyen müşteri ekibin
        // tamamlama performansını düşürmemeli (no-show ayrı bir sinyaldir).
        const due = todayList.filter((r) => (toMin(r.endTime) <= nowMin || Boolean(r.serviceEndedAt))
            && (Boolean(r.customerArrivedAt) || Boolean(r.arrivedAt) || r.status === 'completed'));
        const serviceFinished = due.filter((r) => Boolean(r.serviceEndedAt) || r.status === 'completed');
        return {
            onTime: started.length ? Math.round((onTime / started.length) * 100) : null,
            occupancy: workDay.isOff ? 0 : Math.min(100, Math.round((booked / capacity) * 100)),
            completion: due.length ? Math.round((serviceFinished.length / due.length) * 100) : null,
        };
    }, [todayList, workDay, chairs.length, nowMin]);

    const behind = useMemo(
        () => team.filter((t) => t.load >= 85).sort((a, b) => b.load - a.load)[0] || null,
        [team],
    );
    const freeSoon = useMemo(
        () => team.filter((t) => t.load < 60).sort((a, b) => a.load - b.load)[0] || null,
        [team],
    );

    const processingSoon = useMemo(() => [...byStage.processing]
        .filter((r) => !overdueChecks.some((overdue) => overdue.id === r.id))
        .sort((a, b) => String(a.customFields?.[CF_TIMER] || '').localeCompare(String(b.customFields?.[CF_TIMER] || '')))[0] || null,
    [byStage.processing, overdueChecks]);

    const priority = useMemo<{ kind: PriorityKind; reservation: Reservation } | null>(() => {
        if (overdueChecks[0]) return { kind: 'overdue', reservation: overdueChecks[0] };
        if (longWaits[0]) return { kind: 'long-wait', reservation: longWaits[0].r };
        if (missedAppointments[0]) return { kind: 'missed', reservation: missedAppointments[0] };
        if (byStage.checkout[0]) return { kind: 'checkout', reservation: byStage.checkout[0] };
        // Salonda oturan müşteri, henüz gelmemiş geç müşteriden önce gelir:
        // 10 dk eşiği (longWaits) yalnız "kritik" rozetini belirler, kartın
        // konusunu değil. Bu satır olmadan bekleme alanında müşteri varken kart
        // "Bekleyen operasyon yok" diyordu.
        if (byStage.waiting[0]) return { kind: 'waiting', reservation: byStage.waiting[0] };
        if (lateAppointments[0]) return { kind: 'late', reservation: lateAppointments[0] };
        if (byStage.finish[0]) return { kind: 'finish', reservation: byStage.finish[0] };
        if (byStage.service[0]) return { kind: 'service', reservation: byStage.service[0] };
        if (processingSoon) return { kind: 'processing', reservation: processingSoon };
        if (upcoming[0]) return { kind: 'upcoming', reservation: upcoming[0] };
        return null;
    }, [
        overdueChecks, longWaits, missedAppointments, byStage.checkout, byStage.waiting,
        lateAppointments, byStage.finish, byStage.service, processingSoon, upcoming,
    ]);

    // ── Öncelik kuyruğu — yalnız operasyon; satış fırsatları FlowPilot'ta ──────
    type Task = { id: string; level: 'now' | 'today'; title: string; detail: string; action: string; icon: ElementType; run: () => void };
    const tasks = useMemo(() => {
        const out: Task[] = [];
        for (const r of overdueChecks.slice(0, 2)) {
            out.push({
                id: `check-${r.id}`, level: 'now',
                title: `${mask(r.customerName)} · renk kontrolü gecikti`,
                detail: [units.find((u) => u.id === liveResourceId(r))?.name, r.staffName, r.customFields?.[CF_FORMULA]].filter(Boolean).join(' · ') || r.service,
                action: 'Kontrole git', icon: TimerReset,
                run: () => { setSelectedId(r.id); setBoardView('flow'); },
            });
        }
        for (const w of longWaits.slice(0, 2)) {
            out.push({
                id: `wait-${w.r.id}`, level: 'today',
                title: `${mask(w.r.customerName)} ${w.mins} dakikadır bekliyor`,
                detail: [w.r.service, w.r.staffName].filter(Boolean).join(' · '),
                action: 'Karşılamayı aç', icon: Coffee,
                run: () => { setSelectedId(w.r.id); setBoardView('flow'); },
            });
        }
        for (const r of missedAppointments.slice(0, 2)) {
            out.push({
                id: `missed-${r.id}`, level: 'now',
                title: `${mask(r.customerName)} randevusuna gelmedi`,
                detail: `${r.startTime} · ${r.service}`,
                action: 'Kaydı aç', icon: AlertTriangle,
                run: () => { setSelectedId(r.id); setBoardView('flow'); },
            });
        }
        if (cashOn && byStage.checkout.length > 0) {
            const first = byStage.checkout[0];
            out.push({
                id: 'cash', level: 'today',
                title: `${byStage.checkout.length} müşteri kasada bekliyor`,
                detail: byStage.checkout.map((r) => mask(r.customerName)).join(' · '),
                action: 'Tahsilata git', icon: CircleDollarSign,
                run: () => navigate(`/kasa?reservation=${encodeURIComponent(first.id)}`),
            });
        }
        // 10 dakikanın altındaki beklemeler longWaits'e girmez ama görev de
        // değildir demek yanlış: müşteri salonda oturuyor ve koltuğa alınmayı
        // bekliyor. Kuyruk bu yüzden "Operasyon sakin" diyordu.
        const shortWaits = byStage.waiting.filter((r) => !longWaits.some((w) => w.r.id === r.id));
        for (const r of shortWaits.slice(0, 2)) {
            const minutes = r.customerArrivedAt ? minsSince(r.customerArrivedAt, now) : 0;
            out.push({
                id: `seat-${r.id}`, level: 'today',
                title: `${mask(r.customerName)} koltuğa alınmayı bekliyor`,
                detail: [`${minutes} dk`, r.service, r.staffName].filter(Boolean).join(' · '),
                action: 'Karşılamayı aç', icon: Coffee,
                run: () => { setSelectedId(r.id); setBoardView('flow'); },
            });
        }
        for (const r of lateAppointments.slice(0, 2)) {
            const minutes = Math.max(1, nowMin - toMin(r.startTime));
            out.push({
                id: `late-${r.id}`, level: 'today',
                title: `${mask(r.customerName)} ${minutes} dakika gecikti`,
                detail: `${r.startTime} · ${r.service}`,
                action: 'Karşılamayı aç', icon: Clock3,
                run: () => { setSelectedId(r.id); setBoardView('flow'); },
            });
        }
        if (out.length === 0 && priority && priority.kind !== 'upcoming') {
            const r = priority.reservation;
            out.push({
                id: `tracking-${r.id}`, level: 'today',
                title: `${mask(r.customerName)} takipte`,
                detail: priority.kind === 'processing' ? 'Boya sayacı çalışıyor'
                    : priority.kind === 'finish' ? 'Yıkama / bitiriş aşamasında'
                        : 'Hizmet devam ediyor',
                action: 'Akışı aç', icon: priority.kind === 'processing' ? TimerReset : Scissors,
                run: () => { setSelectedId(r.id); setBoardView('flow'); },
            });
        }
        return out.slice(0, 5);
    }, [overdueChecks, longWaits, missedAppointments, byStage.checkout, byStage.waiting,
        lateAppointments, units, mask, navigate, now, nowMin, liveResourceId, priority, cashOn]);

    // ── FlowPilot fırsatları ──────────────────────────────────────────────────
    const opportunities = useMemo(() => {
        const out: { id: string; tone: string; title: string; detail: string; run: () => void }[] = [];
        if (gap) out.push({
            id: 'gap', tone: 'purple', title: gap.fits > 0 ? 'Bekleme listesini eşleştir' : 'Satılabilir boş saat',
            detail: `${fromMin(gap.start)} · ${gap.fits > 0 ? `${gap.fits} uygun müşteri` : `${gap.serviceName} için uygun`}`,
            run: () => navigate(gap.fits > 0
                ? '/reservations?tab=waitlist'
                : `/calendar?new=1&date=${today}&time=${fromMin(gap.start)}`),
        });
        if (dueBack.length > 0) out.push({
            id: 'recall', tone: 'orange', title: 'Geri dönüş zamanı',
            detail: `${reachable} müşteriye ulaşılabiliyor`,
            run: () => navigate(`/customers?segment=return&days=${recallDays}`),
        });
        if (tomorrow.pending.length > 0) out.push({
            id: 'pending', tone: 'red', title: 'Onay bekleyen randevu',
            detail: `Yarın için ${tomorrow.pending.length} randevu`,
            run: () => navigate(`/reservations?tab=pending&date=${tomorrow.iso}`),
        });
        else if (tomorrow.color.length > 0) out.push({
            id: 'prep', tone: 'red', title: 'Yarının renk hazırlığı',
            detail: `${tomorrow.color.length} renk randevusu planlı`,
            run: () => navigate(`/calendar?date=${tomorrow.iso}`),
        });
        return out;
    }, [gap, dueBack.length, reachable, recallDays, tomorrow, today, navigate]);

    // ── Gün başlığı ───────────────────────────────────────────────────────────
    const weekdayLong = now.toLocaleDateString('tr-TR', { weekday: 'long' }).toLocaleUpperCase('tr');
    const dayNum = now.getDate();
    const monthYear = now.toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' }).toLocaleUpperCase('tr');

    // Yoğunluk penceresi — en çok randevunun üst üste bindiği 90 dakika
    const peak = useMemo(() => {
        if (todayList.length === 0) return null;
        let bestStart = workDay.open, bestCount = 0;
        for (let m = workDay.open; m <= workDay.close - 90; m += 30) {
            const c = todayList.filter((r) => toMin(r.startTime) < m + 90 && toMin(r.endTime) > m).length;
            if (c > bestCount) { bestCount = c; bestStart = m; }
        }
        return bestCount > 1 ? `${fromMin(bestStart)}–${fromMin(bestStart + 90)}` : null;
    }, [todayList, workDay]);

    const heroFacts = [
        // Başlık kritik uyarıya ayrıldığı için mesai bilgisi buraya taşındı.
        workDay.isOff ? 'salon bugün kapalı' : !isSalonOpen ? 'mesai dışı' : null,
        inSalon.length > 0 && `${inSalon.length} müşteri salonda`,
        byStage.processing.length > 0 && `${byStage.processing.length} boya süresi`,
        byStage.checkout.length > 0 && `${byStage.checkout.length} kasaya hazır`,
        peak && `yoğunluk ${peak}`,
        inSalon.length === 0 && `${todayList.length} randevu planlı`,
    ].filter(Boolean).join(' · ');
    const operationalAlert = overdueChecks.length > 0
        ? `${overdueChecks.length} renk kontrolü gecikti`
        : longWaits.length > 0
            ? `${longWaits.length} müşteri uzun süredir bekliyor`
            : missedAppointments.length > 0
                ? `${missedAppointments.length} müşteri gelmedi`
                : byStage.checkout.length > 0
                    ? `${byStage.checkout.length} tahsilat bekliyor`
                    : lateAppointments.length > 0
                        ? `${lateAppointments.length} müşteri gecikti`
                        : null;
    const teamLanes = useMemo(() => {
        const lanes = team.map((member) => ({
            id: member.id,
            name: member.name,
            sub: !member.onShift ? 'İzinli / mesai dışında'
                : member.load >= 85 ? 'Yoğun' : member.current,
            state: !member.onShift ? 'free' : member.load >= 85 ? 'warn' : member.load > 0 ? 'busy' : 'free',
        }));
        if (todayList.some((reservation) => !reservation.staffId)) {
            lanes.push({ id: '__none', name: 'Atanmamış', sub: 'Personel bekliyor', state: 'warn' });
        }
        return lanes;
    }, [team, todayList]);
    const resourceLanes = useMemo(() => {
        const lanes = units.map((unit) => ({
            id: unit.id,
            name: unit.name,
            sub: unit.state === 'free' ? 'Hazır' : unit.detail,
            state: unit.state === 'late' ? 'warn' : unit.state === 'free' ? 'free' : 'busy',
        }));
        if (todayList.some((reservation) => !reservation.resourceId)) {
            lanes.push({ id: '__none', name: 'Atanmamış', sub: 'Koltuk bekliyor', state: 'warn' });
        }
        return lanes;
    }, [units, todayList]);
    const rhythmTarget = isEnabled('analiz') ? '/analytics' : '/staff';
    const returnTarget = `/customers?segment=return&days=${recallDays}`;
    const tomorrowTarget = `/calendar?date=${tomorrow.iso}`;
    const getWalkinSlot = useCallback((service: Service, unitId?: string, staffId?: string) => {
        if (!slotRulesReady || workDay.isOff) return null;
        const candidates = unitId ? chairs.filter((chair) => chair.id === unitId) : chairs;
        const slots = candidates.flatMap((chair) => findAvailableSlots(slotRules, {
            date: today,
            durationMin: service.duration || 45,
            staffId: staffId || undefined,
            resourceId: chair.id,
            notBefore: fromMin(nowMin),
            stepMin: settings.slotDuration || 15,
            limit: 1,
        }));
        return slots.sort((a, b) => a.startTime.localeCompare(b.startTime))[0] || null;
    }, [slotRulesReady, workDay.isOff, chairs, slotRules, today, nowMin, settings.slotDuration]);

    return (
        <div className={cn('dash-theme kf-ops flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--dc-page)]', dark && 'dark')}>
            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="content">
                    {isDashboardLoading && (
                        <div className="dashboard-state loading" role="status">
                            <RefreshCw size={16} /> Salon verileri güncelleniyor; son bilinen bilgiler gösteriliyor.
                        </div>
                    )}
                    {loadErrors.length > 0 && (
                        <div className="dashboard-state error" role="alert">
                            <AlertTriangle size={17} />
                            <span><strong>Bazı canlı veriler alınamadı.</strong> {Array.from(new Set(loadErrors)).join(' · ')}</span>
                            <button onClick={() => window.location.reload()}>Yeniden dene</button>
                        </div>
                    )}

                    {/* ── Gün başlığı ────────────────────────────────────────── */}
                    <section className="day-hero">
                        <div className="date-tile">
                            <span>{weekdayLong}</span>
                            <strong>{dayNum}</strong>
                            <small>{monthYear}</small>
                        </div>
                        <div className="day-copy">
                            <span className="eyebrow">{(settings.businessName || 'KUAFÖR SALONU').toLocaleUpperCase('tr')} · <LiveClock /></span>
                            <h1>
                                {/* Mesai dışı olması müdahale gerektiren müşteriyi ikinci plana
                                    atmaz: 19:10'da boyası bekleyen müşteri hâlâ günün en kritik
                                    işidir. Kapalı/mesai dışı bilgisi alttaki satırda durur. */}
                                {operationalAlert
                                    ? <>Şimdi ilgilenin; <em>{operationalAlert}.</em></>
                                    : workDay.isOff
                                        ? <>Salon bugün <em>kapalı.</em></>
                                        : !isSalonOpen
                                            ? <>Salon şu anda <em>mesai dışında.</em></>
                                            : todayList.length === 0
                                                ? <>Bugün için <em>planlanmış randevu yok.</em></>
                                                : <>Salon akışı <em>kontrol altında.</em></>}
                            </h1>
                            <p>{heroFacts || (isSalonOpen
                                ? 'Salon boş — randevusuz müşteriyi sıraya ekleyebilirsiniz'
                                : `Çalışma saati ${fromMin(workDay.open)}–${fromMin(workDay.close)}`)}</p>
                            <div className="day-facts" aria-label="Salonun canlı durumu">
                                {chairs.length > 0 && <span><i className="green" /> {busyChairs} / {chairs.length} koltuk aktif</span>}
                                {washes.length > 0 && <span><i className="blue" /> {busyWashes} / {washes.length} yıkama aktif</span>}
                                <span><i className="purple" /> {slotRulesReady ? `${activeStaff.length} kişi vardiyada` : 'Vardiya kontrol ediliyor'}</span>
                            </div>
                        </div>
                        <div className="hero-actions">
                            <button className="button secondary" onClick={() => navigate('/calendar')}>
                                <CalendarDays size={17} /> Takvimi aç
                            </button>
                            <button className="button secondary" disabled={!isSalonOpen || !slotRulesReady}
                                title={!isSalonOpen ? 'Salon çalışma saatleri dışında' : undefined}
                                onClick={() => setWalkinOpen(true)}>
                                <Zap size={17} /> Walk-in ekle
                            </button>
                            <button className="button primary" onClick={() => navigate('/calendar?new=1')}>
                                <Plus size={18} /> Yeni randevu
                            </button>
                        </div>
                    </section>

                    {/* ── Salonun ritmi + Şimdi ilgilen ──────────────────────── */}
                    <section className="command-grid">
                        <article className="salon-pulse">
                            <header className="section-head">
                                <div>
                                    <span className="eyebrow">CANLI SALON</span>
                                    <h2>Salonun ritmi</h2>
                                </div>
                                <span className={cn('live-state', isDashboardLoading && 'loading')}>
                                    <i /> {isDashboardLoading ? 'Veriler güncelleniyor' : 'Canlı veriler'}
                                </span>
                            </header>
                            <div className="pulse-stats">
                                {STAGES.map(({ key, label, icon: Icon }) => (
                                    <button key={key}
                                        className={cn(key, selected && stageOf(selected) === key && 'selected')}
                                        onClick={() => { setBoardView('flow'); const first = byStage[key][0]; if (first) setSelectedId(first.id); }}>
                                        <span><Icon size={17} /></span>
                                        <small>{label}</small>
                                        <strong>{byStage[key].length}</strong>
                                    </button>
                                ))}
                            </div>
                            <div className="resource-ribbon">
                                <span className="ribbon-label">KOLTUKLAR &amp; YIKAMA</span>
                                {units.length === 0 && (
                                    <button onClick={() => navigate('/settings')}>Henüz koltuk eklenmemiş — Ayarlar'dan ekleyin</button>
                                )}
                                {units.slice(0, 4).map((u) => (
                                    <button key={u.id} onClick={() => setBoardView('seats')}>
                                        <i className={u.state === 'free' ? 'green' : u.state === 'late' ? 'red' : u.state === 'processing' ? 'purple' : u.wash ? 'blue' : 'orange'} />
                                        {u.name} · {u.state === 'free' ? 'boş' : u.state === 'late' ? 'kontrol' : u.state === 'prep' ? 'hazırlık' : u.state === 'processing' ? 'boya süresi' : 'dolu'}
                                    </button>
                                ))}
                                {units.length > 4 && (
                                    <button className="ribbon-more" onClick={() => setBoardView('seats')}>
                                        Tümünü gör <ChevronRight size={14} />
                                    </button>
                                )}
                            </div>
                        </article>

                        <PriorityCard
                            priority={priority}
                            now={now}
                            unitName={(r) => units.find((u) => u.id === liveResourceId(r))?.name}
                            mask={mask}
                            busyId={busyId}
                            onSelect={setSelectedId}
                            onStep={(r) => nextStep(r)?.run()}
                            stepLabel={(r) => nextStep(r)?.label || 'Kaydı aç'}
                            onExtend={extendTimer}
                            onArrive={(r) => void runStep(r, advancePatch('arrived'),
                                { customerArrivedAt: CLEAR }, `${r.customerName.split(' ')[0]} geldi olarak işaretlendi`)}
                            hasOpportunity={opportunities.length > 0}
                        />
                    </section>

                    {/* ── FlowPilot ──────────────────────────────────────────── */}
                    {opportunities.length > 0 && (
                        <section className="automation-strip">
                            <div className="automation-title">
                                <span><Sparkles size={16} /></span>
                                <div>
                                    <strong>FlowPilot</strong>
                                    <small>Salon için {opportunities.length} fırsat buldu</small>
                                </div>
                            </div>
                            {opportunities.map((o) => (
                                <button key={o.id} onClick={o.run}>
                                    <i className={o.tone} />
                                    <span><strong>{o.title}</strong><small>{o.detail}</small></span>
                                    <ChevronRight size={15} />
                                </button>
                            ))}
                            <span className="automation-safe"><ShieldCheck size={15} /> Onay olmadan işlem yapmaz</span>
                        </section>
                    )}

                    {/* ── Salon akışı + Öncelik kuyruğu ──────────────────────── */}
                    <section className="workspace-grid">
                        <article className="flow-board">
                            <header className="board-head">
                                <div>
                                    <span className="eyebrow">OPERASYON KONTROLÜ</span>
                                    <h2>Salon akışı</h2>
                                    <p>Randevu saatinden çok müşterinin gerçek aşamasını gösterir.</p>
                                </div>
                                <div className="board-controls">
                                    <div className="segmented" aria-label="Salon görünümü">
                                        {([['flow', 'Akış'], ['seats', 'Koltuklar'], ['team', 'Ekip']] as const).map(([k, t]) => (
                                            <button key={k} className={cn(boardView === k && 'selected')} aria-pressed={boardView === k}
                                                onClick={() => setBoardView(k)}>{t}</button>
                                        ))}
                                    </div>
                                    <label className="privacy-switch" title="Ortak ekranda müşteri soyadını gizler">
                                        <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
                                        <i />
                                        {privacy ? <EyeOff size={15} /> : <Eye size={15} />}
                                        Gizlilik
                                    </label>
                                </div>
                            </header>

                            {boardView === 'flow' && (
                                <>
                                    <div className={cn('stage-grid', inSalon.length === 0 && 'empty')}>
                                        {STAGES.map((stage) => {
                                            const Icon = stage.icon;
                                            const items = byStage[stage.key];
                                            return (
                                                <section className={`stage-column ${stage.key}`} key={stage.key}>
                                                    <header>
                                                        <span><Icon size={15} /> {stage.label}</span>
                                                        <b>{items.length}</b>
                                                        <small>{stageHint(stage.key, items, now, overdueChecks)}</small>
                                                    </header>
                                                    <div className="stage-list">
                                                        {items.map((r) => {
                                                            const late = overdueChecks.some((o) => o.id === r.id);
                                                            const tone: Tone = late ? 'red' : STAGE_TONE[stage.key];
                                                            const formula = r.customFields?.[CF_FORMULA];
                                                            return (
                                                                <button key={r.id}
                                                                    className={cn('client-card', `tone-${tone}`, selected?.id === r.id && 'selected')}
                                                                    onClick={() => setSelectedId(r.id)}>
                                                                    <i className="client-rail" />
                                                                    <span className="client-top">
                                                                        <span className="mini-avatar">{initialsOf(r.customerName)}</span>
                                                                        <span className="client-name">
                                                                            <strong>{mask(r.customerName)}</strong>
                                                                            <small>{r.service}</small>
                                                                        </span>
                                                                        <ChevronRight size={14} />
                                                                    </span>
                                                                    <span className="client-meta">
                                                                        <b><StageTiming r={r} stage={stage.key} /></b>
                                                                        <small>{r.staffName || 'Atanmadı'}</small>
                                                                    </span>
                                                                    <span className="client-location">
                                                                        <DoorOpen size={13} /> {units.find((u) => u.id === liveResourceId(r))?.name || stageLocation(stage.key)}
                                                                    </span>
                                                                    {typeof formula === 'string' && formula && (
                                                                        <span className="client-note formula"><Droplets size={13} /> {formula}</span>
                                                                    )}
                                                                    {r.notes && <span className="client-note"><Sparkles size={13} />{r.notes}</span>}
                                                                    {stage.key === 'checkout' && (
                                                                        <span className="client-amount">
                                                                            <strong>{money(amountOf(r, services))}</strong>
                                                                            <small>tahsil edilecek</small>
                                                                        </span>
                                                                    )}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </section>
                                            );
                                        })}
                                    </div>

                                    {selected ? (() => {
                                        const st = stageOf(selected);
                                        const step = nextStep(selected);
                                        const formula = selected.customFields?.[CF_FORMULA];
                                        const cust = customers.find((c) => c.id === selected.customerId);
                                        const lastDays = cust?.lastVisit
                                            ? Math.round((now.getTime() - new Date(cust.lastVisit).getTime()) / 86_400_000) : null;
                                        return (
                                            <div className="selected-client" aria-live="polite">
                                                <span className={`selected-avatar tone-${st ? STAGE_TONE[st] : 'orange'}`}>{initialsOf(selected.customerName)}</span>
                                                <div className="selected-main">
                                                    <span className="eyebrow">SEÇİLİ MÜŞTERİ</span>
                                                    <strong>{mask(selected.customerName)}</strong>
                                                    <p>
                                                        <span>{selected.service}</span>
                                                        <span>{selected.staffName || 'Personel atanmadı'}</span>
                                                        <span>{units.find((u) => u.id === liveResourceId(selected))?.name || stageLocation(st)}</span>
                                                    </p>
                                                </div>
                                                <div className="selected-context">
                                                    {typeof formula === 'string' && formula ? (
                                                        <><Droplets size={15} /><span><small>SON FORMÜL</small><strong>{formula}</strong></span></>
                                                    ) : (
                                                        <><History size={15} /><span><small>SON ZİYARET</small><strong>{lastDays === null ? 'İlk ziyaret' : lastDays === 0 ? 'Bugün' : `${lastDays} gün önce`}</strong></span></>
                                                    )}
                                                </div>
                                                {/* Aksiyonlar tek küme: tek tek sarmalanınca birincil buton
                                                    alt satırın soluna düşüyor ve şeridin ortası boş kalıyordu. */}
                                                <div className="selected-actions">
                                                    <button className="button secondary compact"
                                                        onClick={() => navigate(selected.customerId
                                                            ? `/customers?open=${encodeURIComponent(selected.customerId)}`
                                                            : `/customers?q=${encodeURIComponent(selected.customerPhone || selected.customerName)}`)}>
                                                        Müşteri profilini aç
                                                    </button>
                                                    <button className="button secondary compact" onClick={() => setEditRes(selected)}>
                                                        Randevuyu düzenle
                                                    </button>
                                                    {step?.secondary && (
                                                        <button className="button ghost compact" disabled={Boolean(busyId)} onClick={step.secondary.run}>
                                                            {step.secondary.label}
                                                        </button>
                                                    )}
                                                    {step && (
                                                        <button className="button primary compact" disabled={Boolean(busyId)} onClick={step.run}>
                                                            {step.label} <ArrowRight size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })() : (
                                        <div className="selected-client">
                                            <span className="selected-avatar tone-green"><Check size={18} /></span>
                                            <div className="selected-main">
                                                <span className="eyebrow">SALON BOŞ</span>
                                                <strong>Şu an salonda müşteri yok</strong>
                                                <p><span>{doneToday.length} işlem tamamlandı</span><span>{upcoming.length} randevu kaldı</span></p>
                                            </div>
                                            <button className="button primary compact" disabled={!isSalonOpen || !slotRulesReady} onClick={() => setWalkinOpen(true)}>
                                                Walk-in ekle <ArrowRight size={16} />
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}

                            {boardView === 'seats' && (
                                <div className="resource-grid">
                                    {units.length === 0 && <p className="px-3 py-6 text-[12.5px] text-[var(--dc-muted)]">Önce Ayarlar'dan koltuk/yıkama ekleyin.</p>}
                                    {units.map((u) => (
                                        <button key={u.id} className={`resource-card ${u.state}`}
                                            onClick={() => { const r = inSalon.find((x) => liveResourceId(x) === u.id); if (r) { setSelectedId(r.id); setBoardView('flow'); } }}>
                                            <span className="resource-icon">
                                                {u.wash ? <Droplets size={19} /> : <Scissors size={19} />}
                                            </span>
                                            <span>
                                                <small>{u.name}</small>
                                                <strong>{u.client === 'Boş' || u.client === 'Hazırlanıyor' ? u.client : mask(u.client)}</strong>
                                                <em>{u.detail}{u.freeAt ? ` · ${u.freeAt}` : ''}</em>
                                            </span>
                                            <i />
                                        </button>
                                    ))}
                                </div>
                            )}

                            {boardView === 'team' && (
                                <div className="team-grid">
                                    {team.length === 0 && <p className="px-3 py-6 text-[12.5px] text-[var(--dc-muted)]">Henüz personel eklenmemiş.</p>}
                                    {team.map((m) => (
                                        <button key={m.id} className="team-card" onClick={() => navigate(`/staff/${m.id}`)}>
                                            <span className="team-avatar">{initialsOf(m.name)}</span>
                                            <span className="team-copy">
                                                <small>{m.role}</small>
                                                <strong>{m.name}</strong>
                                                <em>{m.current}</em>
                                            </span>
                                            <span className={cn('team-load', m.tone)}>
                                                <b>%{m.load}</b>
                                                <i><em style={{ width: `${m.load}%` }} /></i>
                                                <small>{m.next}</small>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </article>

                        <aside className="task-panel">
                            <header>
                                <div>
                                    <span className="eyebrow">ÖNCELİK KUYRUĞU</span>
                                    <h2>Şimdi yapılacaklar</h2>
                                </div>
                                <span className="task-count">{tasks.length}</span>
                            </header>
                            <div className="task-list">
                                {tasks.length === 0 && (
                                    <article className="today">
                                        <span className="task-icon"><Check size={17} /></span>
                                        <div>
                                            <small>TEMİZ</small>
                                            <strong>Operasyon sakin</strong>
                                            <p>Gecikme, gelmeyen müşteri veya kasada bekleyen tahsilat görünmüyor.</p>
                                        </div>
                                    </article>
                                )}
                                {tasks.map((t) => {
                                    const Icon = t.icon;
                                    return (
                                        <article className={t.level} key={t.id}>
                                            <span className="task-icon"><Icon size={17} /></span>
                                            <div>
                                                <small>{t.level === 'now' ? 'ŞİMDİ' : 'BUGÜN'}</small>
                                                <strong>{t.title}</strong>
                                                <p>{t.detail}</p>
                                                <button onClick={t.run}>{t.action} <ChevronRight size={14} /></button>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                            <div className="task-safety">
                                <ShieldCheck size={17} />
                                <span>
                                    <strong>Otomasyon sınırı açık</strong>
                                    Mesaj, indirim, randevu ve stok işlemleri onayınız olmadan tamamlanmaz.
                                </span>
                            </div>
                        </aside>
                    </section>

                    {/* ── Bugünün planı ──────────────────────────────────────── */}
                    <section className="schedule-card">
                        <header className="schedule-head">
                            <div>
                                <span className="eyebrow">KAPASİTE PLANI</span>
                                <h2>Bugünün planı</h2>
                                <p>Aktif çalışma ile boya bekleme süresini ayrı gösterir.</p>
                            </div>
                            <div className="schedule-legend">
                                <span><i className="orange" /> Aktif çalışma</span>
                                <span><i className="purple pattern" /> İşlem süresi</span>
                                <span><i className="blue" /> Yıkama · bitiriş</span>
                                <span><i className="green" /> Tamamlandı</span>
                            </div>
                            <div className="segmented" aria-label="Plan sütunları">
                                <button className={cn(scheduleView === 'team' && 'selected')} aria-pressed={scheduleView === 'team'}
                                    onClick={() => setScheduleView('team')}>Ekip</button>
                                <button className={cn(scheduleView === 'resources' && 'selected')} aria-pressed={scheduleView === 'resources'}
                                    onClick={() => setScheduleView('resources')}>Kaynaklar</button>
                            </div>
                        </header>
                        <Timeline
                            view={scheduleView}
                            list={todayList}
                            lanes={scheduleView === 'team' ? teamLanes : resourceLanes}
                            laneKeyOf={(r) => (scheduleView === 'team' ? r.staffId : r.resourceId) || '__none'}
                            workDay={workDay}
                            now={now}
                            mask={mask}
                            onSelect={(id) => { setSelectedId(id); setBoardView('flow'); }}
                        />
                    </section>

                    {/* ── Büyüme kartları ────────────────────────────────────── */}
                    <section className="growth-grid">
                        <article className="growth-card return-card">
                            <header><span><History size={17} /></span><small>GERİ DÖNÜŞ</small><button aria-label="Geri dönüş listesini aç" onClick={() => navigate(returnTarget)}><ChevronRight size={15} /></button></header>
                            <strong>{dueBack.length > 0 ? `${dueBack.length} müşterinin zamanı geldi` : 'Geri dönüş listesi temiz'}</strong>
                            <p>{dueBack.length > 0
                                ? `${recallDays} gündür gelmeyen müşteriler; ${reachable} tanesine telefonla ulaşılabiliyor.`
                                : `Son ${recallDays} gün içinde herkesin ya ziyareti ya da ileri randevusu var.`}</p>
                            <div className="mini-metrics">
                                <span><b>{dueBack.length}</b><small>dönüş zamanı</small></span>
                                <span><b>{reachable}</b><small>iletişime uygun</small></span>
                                <span><b>{rebookRate === null ? '—' : `%${rebookRate}`}</b><small>yeniden randevu</small></span>
                            </div>
                            <button className="text-action" onClick={() => navigate(returnTarget)}>
                                Uygun müşterileri gör <ArrowRight size={15} />
                            </button>
                        </article>

                        <article className="growth-card stock-card">
                            <header><span><PackageOpen size={17} /></span><small>HAZIRLIK · YARIN</small><button aria-label="Yarının planını aç" onClick={() => navigate(tomorrowTarget)}><ChevronRight size={15} /></button></header>
                            <strong>{tomorrow.list.length > 0 ? `Yarın ${tomorrow.list.length} randevu var` : 'Yarın için randevu yok'}</strong>
                            <p>{tomorrow.color.length > 0
                                ? `${tomorrow.color.length} renk işlemi planlı — boya ve açıcı hazırlığını bugün yapın.`
                                : 'Renk işlemi planlı değil; hazırlık gerektiren randevu görünmüyor.'}</p>
                            <div className="stock-line">
                                <span className="product-mark"><Droplets size={18} /></span>
                                <span>
                                    <strong>{tomorrow.color[0] ? `${tomorrow.color[0].startTime} · ${mask(tomorrow.color[0].customerName)}` : 'Renk randevusu yok'}</strong>
                                    <small>{tomorrow.color[0]?.service || `${tomorrow.list.length} randevu · ${tomorrow.pending.length} onay bekliyor`}</small>
                                </span>
                                {tomorrow.pending.length > 0 && <b>{tomorrow.pending.length} ONAY</b>}
                            </div>
                            <button className="text-action" onClick={() => navigate(tomorrowTarget)}>
                                Yarının planını aç <ArrowRight size={15} />
                            </button>
                        </article>

                        <article className="growth-card rhythm-card">
                            <header><span><Gauge size={17} /></span><small>EKİP RİTMİ</small><button aria-label={isEnabled('analiz') ? 'Analizi aç' : 'Ekip planını aç'} onClick={() => navigate(rhythmTarget)}><ChevronRight size={15} /></button></header>
                            <strong>{behind ? 'Yük dengesiz' : 'Akış hedefe yakın'}</strong>
                            <p>{behind
                                ? `${behind.name} bugün %${behind.load} dolu${freeSoon ? `; ${freeSoon.name} destek verebilir` : ''}.`
                                : 'Bugün kimsenin planı taşmıyor; koltuk dağılımı dengeli.'}</p>
                            <div className="rhythm-list">
                                <span><i className="green" /><small>Zamanında başlama</small><b>{rhythm.onTime === null ? '—' : `%${rhythm.onTime}`}</b></span>
                                <span><i className="orange" /><small>Koltuk doluluğu</small><b>%{rhythm.occupancy}</b></span>
                                <span><i className="purple" /><small>Tamamlanma</small><b>{rhythm.completion === null ? '—' : `%${rhythm.completion}`}</b></span>
                            </div>
                            <button className="text-action" onClick={() => navigate(rhythmTarget)}>
                                {isEnabled('analiz') ? 'Akışı dengele' : 'Ekip planını aç'} <ArrowRight size={15} />
                            </button>
                        </article>
                    </section>
                </div>
            </div>

            {walkinOpen && (
                <WalkinModal
                    customers={customers}
                    services={services}
                    units={chairs}
                    staff={activeStaff.map((s) => ({ id: s.id, name: s.name }))}
                    getSlot={getWalkinSlot}
                    onCreateCustomer={async (name, phone) => addCustomer({ name, phone })}
                    onClose={() => setWalkinOpen(false)}
                    onCreate={async (payload) => {
                        const created = await addReservation(payload);
                        if (!created) return false;
                        await updateReservation(created.id, { customerArrivedAt: new Date().toISOString() });
                        toast.success(`${payload.customerName} sıraya eklendi ⚡`);
                        setWalkinOpen(false);
                        return true;
                    }}
                />
            )}

            {processingRes && (
                <ProcessingTimerModal
                    reservation={processingRes}
                    defaultFormula={String(
                        processingRes.customFields?.[CF_FORMULA]
                        || customers.find((c) => c.id === processingRes.customerId)?.customFields?.[CF_FORMULA]
                        || '',
                    )}
                    usage={(() => {
                        const overrides = usageOverrides(processingRes);
                        const base = recipeFor(processingRes.service, settings.services, products);
                        return base.map((line) => (
                            line.productId in overrides ? { ...line, quantity: overrides[line.productId] } : line
                        ));
                    })()}
                    onClose={() => setProcessingRes(null)}
                    onStart={(minutes, formula, usage) => beginProcessing(processingRes, minutes, formula, usage)}
                />
            )}
            {editRes && (
                <EditReservationModal
                    reservation={reservations.find((x) => x.id === editRes.id) || editRes}
                    isOpen={!!editRes}
                    onClose={() => setEditRes(null)}
                />
            )}
        </div>
    );
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────

function amountOf(r: Reservation, services: Service[]): number {
    return reservationPrice(r, services);
}

/** Bir sütundaki çakışan randevuları yan yana kolonlara paylaştırır —
 *  geometri ortak katmandan (lib/calendarGrid.packLanes). */
function placeLane(list: Reservation[]): { r: Reservation; col: number; cols: number }[] {
    return packLanes(list).map(({ item, lane, lanes }) => ({ r: item, col: lane, cols: lanes }));
}

function stageLocation(stage: KfStage | null): string {
    if (stage === 'waiting') return 'Bekleme alanı';
    if (stage === 'checkout') return 'Kasa';
    if (stage === 'finish') return 'Yıkama / bitiriş';
    return 'Salon';
}

/** Sütun başlığındaki tek satırlık gerçek durum özeti. */
function stageHint(stage: KfStage, items: Reservation[], now: Date, overdue: Reservation[]): string {
    if (items.length === 0) return 'Boş';
    if (stage === 'waiting') {
        const longest = Math.max(...items.map((r) => (r.customerArrivedAt ? minsSince(r.customerArrivedAt, now) : 0)));
        return `En uzun ${longest} dk`;
    }
    if (stage === 'service') return `${items.length} koltuk aktif`;
    if (stage === 'processing') {
        const late = items.filter((r) => overdue.some((o) => o.id === r.id)).length;
        return late > 0 ? `${late} kontrol gecikti` : 'Sayaçlar akıyor';
    }
    if (stage === 'finish') return `${items.length} müşteri bitirişte`;
    return `${items.length} tahsilat bekliyor`;
}

/** Aşamaya göre canlı süre metni — boya sayacı saniyede bir döner. */
function StageTiming({ r, stage }: { r: Reservation; stage: KfStage }) {
    const [tick, setTick] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setTick(Date.now()), stage === 'processing' ? 1000 : 30_000);
        return () => clearInterval(t);
    }, [stage]);

    if (stage === 'processing') {
        const end = r.customFields?.[CF_TIMER];
        if (typeof end !== 'string') return <>Sayaç yok</>;
        const diff = Math.round((new Date(end).getTime() - tick) / 1000);
        const s = Math.abs(diff);
        const txt = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
        return <>{diff <= 0 ? `Kontrol gecikti · ${txt}` : `${txt} kaldı`}</>;
    }
    if (stage === 'waiting') {
        const mins = r.customerArrivedAt ? minsSince(r.customerArrivedAt, new Date(tick)) : 0;
        return <>{r.startTime} · {mins} dk bekliyor</>;
    }
    if (stage === 'service' || stage === 'finish') {
        const run = r.arrivedAt ? minsSince(r.arrivedAt, new Date(tick)) : 0;
        const planned = Math.max(0, toMin(r.endTime) - toMin(r.startTime));
        return <>{run} / {planned} dk</>;
    }
    return <>{r.serviceEndedAt ? `${minsSince(r.serviceEndedAt, new Date(tick))} dk önce bitti` : 'Hazır'}</>;
}

/** Başlıktaki canlı saat — bütün dashboard'ı değil, yalnız kendini tazeler. */
function LiveClock() {
    const [t, setT] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setT(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    return <>{String(t.getHours()).padStart(2, '0')}:{String(t.getMinutes()).padStart(2, '0')}:{String(t.getSeconds()).padStart(2, '0')}</>;
}

// ── Şimdi ilgilen kartı ──────────────────────────────────────────────────────
// Sağ kuyrukla aynı öncelik kaynağını kullanır; iki alan farklı “ilk iş” söylemez.
function PriorityCard({
    priority, now, unitName, mask, busyId, onSelect, onStep, stepLabel,
    onExtend, onArrive, hasOpportunity,
}: {
    priority: { kind: PriorityKind; reservation: Reservation } | null;
    now: Date;
    unitName: (reservation: Reservation) => string | undefined;
    mask: (n: string) => string;
    busyId: string | null;
    onSelect: (id: string) => void;
    onStep: (r: Reservation) => void;
    stepLabel: (r: Reservation) => string;
    onExtend: (r: Reservation) => void;
    onArrive: (r: Reservation) => void;
    hasOpportunity: boolean;
}) {
    if (!priority) {
        return (
            <article className="priority-card resolved">
                <header><span>SIRADAKİ HAREKET</span><i /></header>
                <div className="priority-time">—</div>
                <span className="priority-status">OPERASYON SAKİN</span>
                <h2>Bekleyen operasyon yok</h2>
                <p>{hasOpportunity ? 'Büyüme fırsatları FlowPilot bölümünde hazır.' : 'Şu anda müdahale gerektiren müşteri görünmüyor.'}</p>
            </article>
        );
    }

    const { reservation: target, kind } = priority;
    const stage = stageOf(target);
    const timerEnd = target.customFields?.[CF_TIMER];
    const formula = target.customFields?.[CF_FORMULA];
    const waitMins = target.customerArrivedAt ? minsSince(target.customerArrivedAt, now) : 0;
    const etaMin = toMin(target.startTime) - (now.getHours() * 60 + now.getMinutes());
    const lateMins = Math.max(1, Math.abs(etaMin));
    const critical = kind === 'overdue' || kind === 'long-wait' || kind === 'missed';
    const status = kind === 'overdue' ? 'KONTROL GECİKTİ'
        : kind === 'long-wait' ? 'UZUN BEKLİYOR'
            : kind === 'missed' ? 'GELMEDİ'
                : kind === 'checkout' ? 'TAHSİLAT BEKLİYOR'
                    : kind === 'waiting' ? `${waitMins} DK BEKLİYOR`
                    : kind === 'late' ? `${lateMins} DK GECİKTİ`
                        : kind === 'processing' ? 'KONTROLE KALAN'
                            : kind === 'finish' ? 'BİTİRİŞTE'
                                : kind === 'service' ? 'İŞLEMDE'
                                    : etaMin <= 1 ? 'BİRAZDAN' : `${etaMin} DK SONRA`;

    return (
        <article className={cn('priority-card', !critical && 'resolved')} onClick={() => onSelect(target.id)}>
            <header>
                <span>{critical ? 'ŞİMDİ İLGİLEN' : 'SIRADAKİ HAREKET'}</span>
                <i />
            </header>

            <div className={cn('priority-time', critical && 'overdue')}>
                {typeof timerEnd === 'string'
                    ? <PriorityClock end={timerEnd} />
                    : stage === 'waiting' ? `${waitMins} dk`
                        : kind === 'missed' || kind === 'late' ? `${lateMins} dk`
                            : kind === 'checkout' && target.serviceEndedAt ? `${minsSince(target.serviceEndedAt, now)} dk`
                                : target.startTime}
            </div>
            <span className={cn('priority-status', critical && 'danger')}>
                {status}
            </span>
            <h2>{mask(target.customerName)}</h2>
            <p>{[target.service, target.staffName].filter(Boolean).join(' · ')}</p>

            <div className="priority-context">
                {critical ? <TimerReset size={17} /> : <WandSparkles size={16} />}
                <span>
                    <strong>{[unitName(target), target.staffName].filter(Boolean).join(' · ') || 'Atama bekliyor'}</strong>
                    {typeof formula === 'string' && formula ? formula : stage === 'waiting' ? 'Bekleme alanında' : 'Hazırlık tamam'}
                </span>
                {critical ? <AlertTriangle size={18} /> : <BadgeCheck size={18} />}
            </div>

            {kind === 'upcoming' || kind === 'missed' || kind === 'late' ? (
                <button className="priority-action" disabled={Boolean(busyId)} onClick={() => onArrive(target)}>
                    <Check size={17} /> {kind === 'missed' || kind === 'late' ? 'Geç geldi olarak işaretle' : 'Geldi olarak işaretle'}
                </button>
            ) : kind === 'overdue' ? (
                <div className="priority-actions">
                    <button className="priority-action" disabled={Boolean(busyId)} onClick={() => onStep(target)}>
                        <Check size={17} /> Kontrol edildi
                    </button>
                    <button className="time-extension" disabled={Boolean(busyId)} onClick={() => onExtend(target)}>+2 dk</button>
                </div>
            ) : (
                <button className="priority-action" disabled={Boolean(busyId)} onClick={() => onStep(target)}>
                    <Check size={17} /> {stepLabel(target)}
                </button>
            )}
        </article>
    );
}

/** Kritik karttaki sayaç — hedefe kalan ya da geçen süre, saniyede bir. */
function PriorityClock({ end }: { end: string }) {
    const [tick, setTick] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setTick(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    const s = Math.abs(Math.round((new Date(end).getTime() - tick) / 1000));
    return <>{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</>;
}

// ── Bugünün planı ızgarası ───────────────────────────────────────────────────
function Timeline({ view, list, lanes, laneKeyOf, workDay, now, mask, onSelect }: {
    view: ScheduleView;
    list: Reservation[];
    lanes: { id: string; name: string; sub: string; state: string }[];
    laneKeyOf: (r: Reservation) => string;
    workDay: { open: number; close: number };
    now: Date;
    mask: (n: string) => string;
    onSelect: (id: string) => void;
}) {
    const ppm = 1.12;
    const nowM = now.getHours() * 60 + now.getMinutes();

    // Eksen gerçek işi gösterir: mesainin bomboş baş/son saatleri çizilmez —
    // yoksa 09:00–20:00 açık bir salonda plan 700 px boş ızgara olur.
    const range = useMemo(() => {
        let lo: number, hi: number;
        if (list.length > 0) {
            lo = Math.min(...list.map((r) => toMin(r.startTime)));
            hi = Math.max(...list.map((r) => toMin(r.endTime)));
        } else {
            lo = Math.max(workDay.open, nowM - 60);
            hi = lo + 240;
        }
        if (nowM >= lo - 60 && nowM <= hi + 60) { lo = Math.min(lo, nowM); hi = Math.max(hi, nowM + 30); }
        const start = Math.floor(lo / 60) * 60;
        const end = Math.max(start + 240, Math.ceil(hi / 60) * 60);
        return { start, end };
    }, [list, workDay, nowM]);

    const height = (range.end - range.start) * ppm;
    const hourMarks = useMemo(() => {
        const out: number[] = [];
        for (let h = range.start; h <= range.end; h += 60) out.push(h / 60);
        return out;
    }, [range]);

    if (lanes.length === 0) {
        return (
            <p className="px-4 py-8 text-[12.5px] text-[var(--dc-muted)]">
                {view === 'team' ? 'Henüz personel eklenmemiş.' : "Önce Ayarlar'dan koltuk/yıkama ekleyin."} Plan burada sütunlara ayrılacak.
            </p>
        );
    }

    return (
        <div className="timeline-shell">
            <div className="timeline-heads">
                <span className="axis-head">SAAT</span>
                {lanes.map((lane) => (
                    <span className="lane-head" key={lane.id}>
                        <i className={lane.state === 'warn' ? 'warn' : lane.state === 'free' ? 'free' : 'busy'} />
                        <strong>{lane.name}</strong>
                        <small>{lane.sub}</small>
                    </span>
                ))}
            </div>
            <div className="timeline-canvas" style={{ height }}>
                <div className="axis-band" />
                {hourMarks.map((h) => (
                    <div className="hour-row" style={{ top: (h * 60 - range.start) * ppm }} key={h}>
                        <span>{String(h).padStart(2, '0')}:00</span>
                        <i />
                    </div>
                ))}
                {lanes.map((lane, index) => (
                    <div className={cn('timeline-lane', index % 2 && 'alt')} key={lane.id}
                        style={{ '--lane-index': index, '--lane-count': lanes.length } as CSSProperties}>
                        {placeLane(list.filter((r) => laneKeyOf(r) === lane.id)).map(({ r, col, cols }) => {
                            const st = stageOf(r);
                            const tone = st === 'processing' ? 'purple'
                                : st === 'finish' ? 'blue'
                                    : phaseOf(r) === 'completed' ? 'green'
                                        : st === 'waiting' ? 'amber' : 'orange';
                            const top = (toMin(r.startTime) - range.start) * ppm;
                            const h = Math.max(34, (toMin(r.endTime) - toMin(r.startTime)) * ppm - 4);
                            return (
                                <button key={r.id} className={cn('timeline-block', tone, st === 'processing' && 'pattern')}
                                    style={{
                                        top, height: h,
                                        // Aynı personelin çakışan işleri (biri boyada beklerken diğeri
                                        // koltukta) üst üste binmesin — küme içinde sütuna paylaşılır.
                                        left: `calc(${(col / cols) * 100}% + 6px)`,
                                        width: `calc(${100 / cols}% - ${cols > 1 ? 8 : 12}px)`,
                                        right: 'auto',
                                    }}
                                    onClick={() => onSelect(r.id)}>
                                    <small>{r.startTime}</small>
                                    <strong>{mask(r.customerName)}</strong>
                                    {/* Dar/kısa bloklarda ad kırpılıyordu: yalnız sığan satırlar yazılır */}
                                    {cols === 1 && h >= 52 && <span>{r.service}</span>}
                                    {cols === 1 && h >= 70 && <em>{view === 'team' ? (r.resourceName || '') : (r.staffName || '')}</em>}
                                </button>
                            );
                        })}
                    </div>
                ))}
                {nowM >= range.start && nowM <= range.end && (
                    <div className="now-line" style={{ top: (nowM - range.start) * ppm }}>
                        <span>ŞİMDİ {hhmm(now)}</span>
                        <i />
                    </div>
                )}
            </div>
        </div>
    );
}

function ProcessingTimerModal({ reservation, defaultFormula, usage: usageDefault, onClose, onStart }: {
    reservation: Reservation;
    defaultFormula: string;
    usage: UsageLine[];
    onClose: () => void;
    onStart: (minutes: number, formula: string, usage: UsageLine[]) => void;
}) {
    const [minutes, setMinutes] = useState(PROCESS_MIN);
    const [formula, setFormula] = useState(defaultFormula);
    // Reçete varsayılan gelir, personel düzeltir. 0 yazmak "bu üründen
    // kullanılmadı" demektir; stok işlem kasaya giderken düşer.
    const [usage, setUsage] = useState<UsageLine[]>(usageDefault);
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="modal-layer">
            <button className="scrim" aria-label="Boya sayacı penceresini kapat" onClick={onClose} />
            <section className="quick-modal processing-modal" role="dialog" aria-modal="true" aria-labelledby="kf-processing-title">
                <header>
                    <span className="modal-symbol"><TimerReset size={20} /></span>
                    <div>
                        <span className="eyebrow">RENK KONTROLÜ</span>
                        <h2 id="kf-processing-title">Boya süresini belirleyin</h2>
                        <p>{reservation.customerName} · {reservation.service}</p>
                    </div>
                    <button aria-label="Kapat" onClick={onClose}><X size={18} /></button>
                </header>
                <div className="modal-body">
                    <div className="timer-presets" aria-label="Boya süresi seçenekleri">
                        {[20, 30, 40, 45, 60].map((value) => (
                            <button type="button" key={value} className={cn(minutes === value && 'selected')} onClick={() => setMinutes(value)}>
                                <strong>{value}</strong><small>dakika</small>
                            </button>
                        ))}
                    </div>
                    <label>
                        <span>Özel süre</span>
                        <div className="field">
                            <TimerReset size={16} />
                            <input type="number" min={5} max={180} step={5} value={minutes}
                                onChange={(event) => setMinutes(Math.max(5, Math.min(180, Number(event.target.value) || PROCESS_MIN)))} />
                            <b>dk</b>
                        </div>
                    </label>
                    <label>
                        <span>Renk formülü</span>
                        <div className="field">
                            <Droplets size={16} />
                            <input value={formula} onChange={(event) => setFormula(event.target.value)}
                                placeholder="Örn. 7.1 + 8.0 / 20 vol" />
                        </div>
                    </label>
                    {usage.length > 0 && (
                        <div className="usage-block">
                            <span className="usage-title">KULLANILAN MALZEME</span>
                            {usage.map((line, index) => (
                                <label key={line.productId} className="usage-line">
                                    <span>{line.name}</span>
                                    <div className="field">
                                        <input
                                            type="number" min={0} step="any" value={line.quantity}
                                            onChange={(event) => {
                                                const next = Math.max(0, Number(event.target.value) || 0);
                                                setUsage((prev) => prev.map((item, i) => (i === index ? { ...item, quantity: next } : item)));
                                            }}
                                        />
                                        <b>{line.unit}</b>
                                    </div>
                                </label>
                            ))}
                            <p className="usage-hint">Hizmet reçetesinden geldi. Bu müşteride farklıysa düzeltin — stok işlem kapanınca düşer.</p>
                        </div>
                    )}
                    <div className="modal-note"><ShieldCheck size={16} /> Sayaç seçtiğiniz gerçek ürün ve formül süresine göre başlar; formül bu randevuya ve müşterinin renk hafızasına yazılır.</div>
                </div>
                <footer>
                    <button className="button secondary" onClick={onClose}>Vazgeç</button>
                    <button className="button primary" onClick={() => onStart(minutes, formula, usage)}>
                        Sayacı başlat <ArrowRight size={16} />
                    </button>
                </footer>
            </section>
        </div>
    );
}

// ── Walk-in: kapıdan giren müşteriyi sıraya al ───────────────────────────────
function WalkinModal({
    customers, services, units, staff, getSlot, onCreateCustomer, onClose, onCreate,
}: {
    customers: Customer[];
    services: Service[];
    units: { id: string; name: string; state: string }[];
    staff: { id: string; name: string }[];
    getSlot: (service: Service, unitId?: string, staffId?: string) => AvailableSlot | null;
    onCreateCustomer: (name: string, phone: string) => Promise<Customer | null>;
    onClose: () => void;
    onCreate: (payload: Omit<Reservation, 'id' | 'createdAt'>) => Promise<boolean>;
}) {
    const [query, setQuery] = useState('');
    const [picked, setPicked] = useState<Customer | null>(null);
    const [serviceId, setServiceId] = useState(services[0]?.id || '');
    const [unitId, setUnitId] = useState(units.find((u) => u.state === 'free')?.id || '');
    const [staffId, setStaffId] = useState('');
    const [saving, setSaving] = useState(false);
    const [newCustomerOpen, setNewCustomerOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [creatingCustomer, setCreatingCustomer] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const results = useMemo(() => {
        const q = query.trim().toLocaleLowerCase('tr');
        if (!q || picked) return [];
        return customers.filter((c) => c.name.toLocaleLowerCase('tr').includes(q) || c.phone.includes(q)).slice(0, 4);
    }, [query, customers, picked]);

    const service = services.find((s) => s.id === serviceId);
    const slot = useMemo(
        () => service ? getSlot(service, unitId || undefined, staffId || undefined) : null,
        [service, getSlot, unitId, staffId],
    );
    const slotUnit = units.find((unit) => unit.id === slot?.resourceId);

    const createCustomer = async () => {
        if (!newName.trim() || !newPhone.trim() || creatingCustomer) return;
        setCreatingCustomer(true);
        const created = await onCreateCustomer(newName.trim(), newPhone.trim());
        setCreatingCustomer(false);
        if (!created) return;
        setPicked(created);
        setQuery(created.name);
        setNewCustomerOpen(false);
    };

    const submit = async () => {
        if (!picked || !service || !slot || saving) return;
        setSaving(true);
        const ok = await onCreate({
            customerId: picked.id, customerName: picked.name, customerPhone: picked.phone, customerEmail: picked.email,
            date: todayISO(), startTime: slot.startTime, endTime: slot.endTime,
            service: service.name, serviceColor: service.color,
            status: 'confirmed',
            staffId: slot.staffId,
            staffName: slot.staffName,
            resourceId: slot.resourceId,
        });
        setSaving(false);
        if (!ok) return;
    };

    return (
        <div className="modal-layer">
            <button className="scrim" aria-label="Pencereyi kapat" onClick={onClose} />
            <section className="quick-modal" role="dialog" aria-modal="true" aria-labelledby="kf-modal-title">
                <header>
                    <span className="modal-symbol"><Zap size={20} /></span>
                    <div>
                        <span className="eyebrow">RANDEVUSUZ MÜŞTERİ</span>
                        <h2 id="kf-modal-title">Sıraya müşteri ekle</h2>
                        <p>Müşteri bekleme alanına eklenir; koltuğa alma kararı sizde kalır.</p>
                    </div>
                    <button aria-label="Kapat" onClick={onClose}><X size={18} /></button>
                </header>
                <div className="modal-body">
                    <label>
                        <span>Müşteri</span>
                        {picked ? (
                            <div className="field">
                                <Search size={16} />
                                <input value={picked.name} readOnly />
                                <button type="button" onClick={() => { setPicked(null); setQuery(''); }}
                                    className="text-[12px] font-bold text-[var(--dc-orange-d)] px-2">Değiştir</button>
                            </div>
                        ) : (
                            <div className="field">
                                <Search size={16} />
                                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ad soyad veya telefon" autoFocus />
                            </div>
                        )}
                    </label>
                    {!picked && results.map((c) => (
                        <button key={c.id} type="button" onClick={() => setPicked(c)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[var(--dc-card)] border border-[var(--dc-border)] hover:border-[var(--dc-ink)] transition-colors text-left">
                            <span className="w-[30px] h-[30px] rounded-[10px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[11px] font-extrabold grid place-items-center flex-shrink-0">{initialsOf(c.name)}</span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[13px] font-bold text-[var(--dc-ink)] truncate">{c.name}</span>
                                <span className="block text-[11px] text-[var(--dc-muted)]">{c.phone}</span>
                            </span>
                        </button>
                    ))}
                    {!picked && query.trim() && results.length === 0 && !newCustomerOpen && (
                        <button type="button" className="inline-customer-create" onClick={() => {
                            setNewCustomerOpen(true);
                            if (/^[+\d\s()-]+$/.test(query.trim())) setNewPhone(query.trim());
                            else setNewName(query.trim());
                        }}>
                            <UserPlus size={16} />
                            <span><strong>Yeni müşteri oluştur</strong><small>Akıştan çıkmadan salon hafızasına ekleyin</small></span>
                            <ChevronRight size={15} />
                        </button>
                    )}
                    {!picked && newCustomerOpen && (
                        <div className="inline-customer-form">
                            <label><span>Ad soyad</span><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Müşteri adı" autoFocus /></label>
                            <label><span>Telefon</span><input value={newPhone} onChange={(event) => setNewPhone(event.target.value)} placeholder="05xx xxx xx xx" /></label>
                            <div>
                                <button type="button" className="button secondary compact" onClick={() => setNewCustomerOpen(false)}>Vazgeç</button>
                                <button type="button" className="button primary compact"
                                    disabled={!newName.trim() || !newPhone.trim() || creatingCustomer}
                                    onClick={() => void createCustomer()}>
                                    {creatingCustomer ? 'Kaydediliyor…' : 'Müşteriyi kaydet'}
                                </button>
                            </div>
                        </div>
                    )}

                    <label>
                        <span>Hizmet</span>
                        <div className="field select-field">
                            <Scissors size={16} />
                            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                                {services.length === 0 && <option value="">Önce hizmet tanımlayın</option>}
                                {services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.duration} dk</option>)}
                            </select>
                            <ChevronDown size={15} />
                        </div>
                    </label>

                    <label>
                        <span>Koltuk ve kuaför</span>
                        <div className="field select-field">
                            <DoorOpen size={16} />
                            <select value={unitId} onChange={(e) => setUnitId(e.target.value)} aria-label="Koltuk">
                                <option value="">Koltuk fark etmez</option>
                                {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.state !== 'free' ? ' (şu an dolu)' : ''}</option>)}
                            </select>
                            <ChevronDown size={15} />
                        </div>
                        <div className="field select-field">
                            <Scissors size={16} />
                            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Kuaför">
                                <option value="">İlk müsait kuaför</option>
                                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <ChevronDown size={15} />
                        </div>
                    </label>

                    <div className={cn('availability-card', !slot && 'unavailable')}>
                        <span><Clock3 size={18} /></span>
                        <div>
                            <small>DOĞRULANMIŞ BAŞLAMA</small>
                            <strong>{slot ? slot.startTime : 'Uygun saat yok'}</strong>
                            <p>{slot
                                ? [slotUnit?.name, slot.staffName, service ? `${service.duration} dk` : null].filter(Boolean).join(' · ')
                                : 'Personel, vardiya ve koltuk kapasitesini kontrol edin'}</p>
                        </div>
                        {slot ? <BadgeCheck size={19} /> : <AlertTriangle size={19} />}
                    </div>
                    <div className="modal-note"><ShieldCheck size={16} /> Müşteri bekleme alanına eklenir; gerçek hizmet süresi “Koltuğa al” ile başlar.</div>
                </div>
                <footer>
                    <button className="button secondary" onClick={onClose}>Vazgeç</button>
                    <button className="button primary" disabled={!picked || !service || !slot || saving} onClick={() => void submit()}>
                        {saving ? 'Ekleniyor…' : 'Sıraya ekle'} <ArrowRight size={16} />
                    </button>
                </footer>
            </section>
        </div>
    );
}
