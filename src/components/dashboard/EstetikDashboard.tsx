import { useEffect, useMemo, useState, type ElementType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertCircle, ArrowRight, Boxes, Building2, CalendarDays, Camera, Check, CheckCircle2,
    ChevronRight, ClipboardCheck, FileCheck2, FileText, HeartPulse, History, LockKeyhole,
    MonitorCog, Plus, ReceiptText, Search, ShieldCheck, Sparkles, Stethoscope, Syringe,
    UserRoundCheck, WalletCards, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { useResources } from '@/hooks/useResources';
import { useCustomers } from '@/hooks/useCustomers';
import { useStaff } from '@/hooks/useStaff';
import { useOrgPackages } from '@/hooks/useOrgPackages';
import { useInstallmentSchedules } from '@/hooks/useInstallmentSchedules';
import { useCashEnabled } from '@/hooks/useModules';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import { todayISO, toISODate, formatDateEU } from '@/utils/date';
import { phaseOf, minsSince, advancePatch } from '@/lib/sessionPhase';
import { profileForSector } from '@/lib/sectorProfiles';
import type { Customer, Reservation, Service } from '@/types';
import './aestheticOps.css';

// ── Estetik Kliniği Dashboard'u ──────────────────────────────────────────────
// Tasarım: Timeflow Estetik Kliniği Dashboard V2. Görsel imza "Klinik Haritası +
// Güvenli Karar Masası + Hasta Yolculuğu". İlke — estetikte asıl risk sırada
// değil, HAZIRLIKTA: kimlik, anamnez, onam, fotoğraf, oda ve izlenebilirlik
// tamamlanmadan işlem başlamamalı. Ekran bu yüzden bir kanban değil, tek bir
// "sıradaki doğru adım" masasıdır.
//
// ÖNEMLİ — veri dürüstlüğü: onam, klinik fotoğraf ve ürün/lot izlenebilirliği
// için üretimde tablo YOK. Bu adımlar "Altyapı gerekli" olarak gösterilir;
// tamamlanmış sayılmaz, sahte sayaç üretilmez ve işlem kapısını kilitlemez.
// Kapı yalnız gerçekten okunabilen adımlarla kurulur (bkz. LIVE_STEPS).

type Stage = 'Yaklaşıyor' | 'Hazırlıkta' | 'İşlemde' | 'Çıkışa hazır';
type DashboardView = 'flow' | 'upcoming' | 'resources';
type ModalName = 'readiness' | 'arrival' | 'search' | null;
type StepKey = 'identity' | 'history' | 'consent' | 'photo' | 'room' | 'trace';

const UPCOMING_WINDOW = 90;   // "Yaklaşıyor" ve 90 dakika görünümü

const STAGE_META: Record<Stage, { icon: ElementType; tone: string; helper: string }> = {
    'Yaklaşıyor': { icon: CalendarDays, tone: 'blue', helper: `${UPCOMING_WINDOW} dakika` },
    'Hazırlıkta': { icon: ClipboardCheck, tone: 'amber', helper: 'Kabul ve hekim kontrolü' },
    'İşlemde': { icon: Syringe, tone: 'orange', helper: 'Odada devam ediyor' },
    'Çıkışa hazır': { icon: ReceiptText, tone: 'green', helper: 'Kayıt ve ödeme' },
};

// Hazırlık adımları. `live` olanlar mevcut veriden okunur ve işlem kapısını
// kurar; `pending` olanlar için üretimde tablo yok — asla "tamam" sayılmaz.
const READINESS_STEPS: { key: StepKey; title: string; missing: string; detail: string; icon: ElementType; live: boolean }[] = [
    { key: 'identity', missing: 'Hasta kaydı eşleşmedi', title: 'Kimlik doğrulandı', detail: 'Randevu kayıtlı hasta dosyasına bağlı', icon: UserRoundCheck, live: true },
    { key: 'history', missing: 'Anamnez eksik', title: 'Anamnez güncel', detail: 'Alerji ve kronik rahatsızlık alanları dolu', icon: HeartPulse, live: true },
    { key: 'consent', missing: 'Onam kaydı yok', title: 'İşleme özel onam imzalı', detail: 'Sürümlü onam kaydı — altyapı gerekli', icon: FileCheck2, live: false },
    { key: 'photo', missing: 'Ön fotoğraf yok', title: 'Standart ön fotoğraflar hazır', detail: 'Klinik fotoğraf modülü — altyapı gerekli', icon: Camera, live: false },
    { key: 'room', missing: 'Oda atanmadı', title: 'Oda hazır', detail: 'Uygulama odası atandı, çakışma yok', icon: MonitorCog, live: true },
    { key: 'trace', missing: 'Lot kaydı yok', title: 'Ürün / lot kaydı doğrulandı', detail: 'Lot ve son kullanma takibi — altyapı gerekli', icon: Boxes, live: false },
];
const LIVE_STEPS = READINESS_STEPS.filter((s) => s.live);

// Haritanın dört köşe yerleşimi (4 odaya kadar); fazlası liste görünümüne düşer
const CORNERS = ['room--consult', 'room--procedure', 'room--laser', 'room--recovery'];

const initialsOf = (n: string) => n.split(/\s+/).map((p) => p.charAt(0)).join('').slice(0, 2).toLocaleUpperCase('tr');
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const money = (n: number) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const CLEAR = null as unknown as undefined;

/** Klinik alanda "yok/-/hayır" gibi olumsuz yanıtlar doldurulmuş sayılır ama
 *  tıbbi uyarı üretmez; boş alan ise anamnez eksiktir. */
const NEGATIVE = /^(yok|yoktur|hay[ıi]r|bilinmiyor|none|no|-|\.)$/i;
const isFilled = (v: unknown) => String(v ?? '').trim().length > 0;
const isFlag = (v: unknown) => { const t = String(v ?? '').trim(); return t.length > 0 && !NEGATIVE.test(t); };

/** Ortak ekran mahremiyeti: soyad maskelenir. */
const maskName = (full: string, on: boolean) => {
    if (!on) return full;
    const parts = full.trim().split(/\s+/);
    return parts.length < 2 ? parts[0] || full : `${parts[0]} ${parts[parts.length - 1].charAt(0).toLocaleUpperCase('tr')}.`;
};

export function EstetikDashboard() {
    const navigate = useNavigate();
    const { dark } = useTheme();
    const { reservations, settings, updateReservation } = useReservations();
    const cashOn = useCashEnabled();
    const { resources } = useResources();
    const { customers, customerById } = useCustomers();
    const { staff } = useStaff();
    const { packages } = useOrgPackages();
    // Taksit tablosu her kurulumda yok — hook `available: false` döndürürse
    // taksit satırı hiç gösterilmez (uydurma sayaç üretmeyiz).
    const openPlanIds = useMemo(
        () => packages.filter((p) => p.status === 'active').map((p) => p.id),
        [packages],
    );
    const { installments, available: installmentsOn } = useInstallmentSchedules(openPlanIds);
    const today = todayISO();

    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 20_000);
        return () => clearInterval(t);
    }, []);
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const [view, setView] = useState<DashboardView>('flow');
    const [stageFilter, setStageFilter] = useState<Stage | 'Tümü'>('Tümü');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // Ortak ekran mahremiyeti VARSAYILAN AÇIK
    const [privateMode, setPrivateMode] = useState(true);
    const [modal, setModal] = useState<ModalName>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const services: Service[] = useMemo(() => settings.services || [], [settings.services]);
    const activeList = useMemo(() => reservations.filter((r) => r.status !== 'cancelled'), [reservations]);
    const todayList = useMemo(
        () => activeList.filter((r) => r.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [activeList, today],
    );
    const activeRooms = useMemo(() => resources.filter((r) => r.isActive).sort((a, b) => a.sort - b.sort), [resources]);
    const activeStaff = useMemo(() => staff.filter((s) => s.isActive !== false), [staff]);

    // ── Aşama türetimi ────────────────────────────────────────────────────────
    const stageOf = useMemo(() => (r: Reservation): Stage | null => {
        const ph = phaseOf(r);
        if (ph === 'arrived') return 'Hazırlıkta';
        if (ph === 'active') return 'İşlemde';
        if (ph === 'done') return 'Çıkışa hazır';
        if (ph === 'wait' && toMin(r.startTime) <= nowMin + UPCOMING_WINDOW && toMin(r.endTime) >= nowMin - 15) return 'Yaklaşıyor';
        return null;
    }, [nowMin]);

    const inClinic = useMemo(
        () => todayList.filter((r) => stageOf(r) !== null),
        [todayList, stageOf],
    );
    const byStage = useMemo(() => {
        const m: Record<Stage, Reservation[]> = { 'Yaklaşıyor': [], 'Hazırlıkta': [], 'İşlemde': [], 'Çıkışa hazır': [] };
        for (const r of inClinic) { const s = stageOf(r); if (s) m[s].push(r); }
        return m;
    }, [inClinic, stageOf]);
    const doneToday = useMemo(() => todayList.filter((r) => phaseOf(r) === 'completed'), [todayList]);

    // ── Hazırlık durumu — yalnız gerçekten okunabilen adımlar ────────────────
    const readinessOf = useMemo(() => (r: Reservation): Record<StepKey, boolean | null> => {
        const c = r.customerId ? customerById.get(r.customerId) : undefined;
        const cf = c?.customFields || {};
        const anamnesis = ['alerji', 'kronik'].some((k) => isFilled(cf[k]));
        // Oda çakışması: aynı odada aynı saat aralığında ikinci bir randevu
        const clash = r.resourceId ? todayList.some((o) => o.id !== r.id && o.resourceId === r.resourceId
            && toMin(o.startTime) < toMin(r.endTime) && toMin(r.startTime) < toMin(o.endTime)) : false;
        return {
            identity: Boolean(r.customerId && c),
            history: anamnesis,
            room: Boolean(r.resourceId) && !clash,
            consent: null,   // altyapı gerekli
            photo: null,     // altyapı gerekli
            trace: null,     // altyapı gerekli
        };
    }, [customerById, todayList]);

    /** Tıbbi uyarı VAR/YOK — içeriği asla dashboard'da gösterilmez. */
    const hasMedicalFlag = useMemo(() => (r: Reservation): boolean => {
        const cf = r.customerId ? customerById.get(r.customerId)?.customFields || {} : {};
        return ['alerji', 'kronik'].some((k) => isFlag(cf[k]));
    }, [customerById]);

    const liveScore = useMemo(() => (r: Reservation) => {
        const rd = readinessOf(r);
        return LIVE_STEPS.filter((s) => rd[s.key] === true).length;
    }, [readinessOf]);
    /** İşlem kapısı: yalnız veri kaynağı olan adımlar kilitler. */
    const canStart = useMemo(() => (r: Reservation) => liveScore(r) === LIVE_STEPS.length, [liveScore]);

    // ── Seçili hasta ─────────────────────────────────────────────────────────
    const selected = useMemo(
        () => inClinic.find((r) => r.id === selectedId)
            || byStage['Hazırlıkta'].find((r) => !canStart(r))
            || byStage['İşlemde'][0] || byStage['Hazırlıkta'][0] || byStage['Yaklaşıyor'][0] || byStage['Çıkışa hazır'][0] || null,
        [inClinic, selectedId, byStage, canStart],
    );

    // ── Klinik haritası: odalar ──────────────────────────────────────────────
    const rooms = useMemo(() => activeRooms.map((res, i) => {
        const busy = byStage['İşlemde'].find((r) => r.resourceId === res.id);
        const prep = byStage['Hazırlıkta'].find((r) => r.resourceId === res.id);
        const soon = byStage['Yaklaşıyor'].find((r) => r.resourceId === res.id);
        const exiting = byStage['Çıkışa hazır'].find((r) => r.resourceId === res.id);
        const patient = busy || prep || exiting || soon || null;
        const elapsed = busy?.arrivedAt ? minsSince(busy.arrivedAt, now) : 0;
        const planned = busy ? Math.max(1, toMin(busy.endTime) - toMin(busy.startTime)) : 0;
        const tone = busy ? 'orange' : prep ? 'amber' : exiting ? 'green' : soon ? 'blue' : 'green';
        const status = busy ? 'İşlem sürüyor' : prep ? 'Hazırlıkta' : exiting ? 'Çıkışa hazırlanıyor' : soon ? 'Hasta bekleniyor' : 'Boş';
        const detail = busy ? `${Math.max(0, planned - elapsed)} dk kaldı`
            : prep ? (canStart(prep) ? 'Başlamaya hazır' : 'Hazırlık eksik')
                : exiting ? 'Kayıt ve tahsilat bekliyor'
                    : soon ? `${soon.startTime} · ${soon.service}` : 'Kullanıma hazır';
        const progress = busy ? Math.min(100, Math.round((elapsed / planned) * 100))
            : prep ? Math.round((liveScore(prep) / LIVE_STEPS.length) * 100)
                : exiting ? 90 : soon ? 20 : 0;
        return {
            id: res.id, name: res.name, shortName: res.name,
            corner: CORNERS[i % CORNERS.length], tone, status, detail, progress, patient,
        };
    }), [activeRooms, byStage, now, canStart, liveScore]);

    const busyRooms = rooms.filter((r) => r.patient).length;
    const clashCount = useMemo(() => todayList.filter((r) => {
        if (!r.resourceId) return false;
        return todayList.some((o) => o.id !== r.id && o.resourceId === r.resourceId
            && toMin(o.startTime) < toMin(r.endTime) && toMin(r.startTime) < toMin(o.endTime));
    }).length, [todayList]);

    // Odaların hazırlık payı — "klinik hazır" halkası buradan beslenir
    const readinessPct = useMemo(() => {
        const pending = [...byStage['Yaklaşıyor'], ...byStage['Hazırlıkta']];
        if (pending.length === 0) return inClinic.length > 0 || doneToday.length > 0 ? 100 : 0;
        const total = pending.length * LIVE_STEPS.length;
        const done = pending.reduce((s, r) => s + liveScore(r), 0);
        return Math.round((done / total) * 100);
    }, [byStage, inClinic.length, doneToday.length, liveScore]);
    const waitingPrep = useMemo(
        () => byStage['Hazırlıkta'].filter((r) => !canStart(r)).length + byStage['Yaklaşıyor'].filter((r) => !canStart(r)).length,
        [byStage, canStart],
    );

    // ── Kontrol zamanı gelen hastalar ────────────────────────────────────────
    const recallDays = profileForSector(settings.sector).comms.recall?.afterDays ?? 90;
    const dueControl = useMemo(() => {
        const cutoff = new Date(now); cutoff.setDate(now.getDate() - recallDays);
        const cutoffISO = toISODate(cutoff);
        const future = new Set(activeList.filter((r) => r.date > today).map((r) => r.customerId));
        return customers.filter((c) => (c.recallDate ? c.recallDate <= today : c.lastVisit && c.lastVisit <= cutoffISO) && !future.has(c.id));
    }, [customers, activeList, today, now, recallDays]);

    // ── Tedavi planları ve tahsilat ──────────────────────────────────────────
    const openPlans = useMemo(
        () => packages.filter((p) => p.status === 'active' && p.sessionsDone < p.sessionCount),
        [packages],
    );
    const futureByCustomer = useMemo(() => {
        const s = new Set<string>();
        for (const r of activeList) if (r.date > today || (r.date === today && toMin(r.startTime) > nowMin)) s.add(r.customerId);
        return s;
    }, [activeList, today, nowMin]);
    const unplannedPlans = useMemo(
        () => openPlans.filter((p) => !futureByCustomer.has(p.customerId)),
        [openPlans, futureByCustomer],
    );

    const priceOf = (r: Reservation) => {
        const extras = (r.adisyonItems || []).reduce((s, i) => s + (i.price || 0), 0);
        return (services.find((s) => s.name === r.service)?.price || 0) + extras;
    };
    const pendingCash = byStage['Çıkışa hazır'].reduce((s, r) => s + priceOf(r), 0);

    const dueInstallments = useMemo(() => {
        if (!installmentsOn) return [];
        const limit = new Date(now); limit.setDate(now.getDate() + 7);
        const limitISO = toISODate(limit);
        return installments.filter((i) => i.dueDate <= limitISO);
    }, [installments, installmentsOn, now]);

    // ── Aşama eylemi — tek baskın adım ───────────────────────────────────────
    const actionLabel = (r: Reservation): string => {
        const st = stageOf(r);
        if (st === 'Yaklaşıyor') return 'Geldi olarak işaretle';
        if (st === 'Hazırlıkta') return canStart(r) ? 'İşlemi başlat' : 'Hazırlığı tamamla';
        if (st === 'İşlemde') return 'Kaydı tamamla';
        return 'Kasaya gönder';
    };

    const step = async (r: Reservation, patch: Partial<Reservation>, undo: Partial<Reservation>, msg: string) => {
        if (busyId) return;
        setBusyId(r.id);
        const ok = await updateReservation(r.id, patch);
        setBusyId(null);
        if (!ok) return;
        setSelectedId(r.id);
        toast.success(msg, { action: { label: 'Geri al', onClick: () => { void updateReservation(r.id, undo); } } });
    };

    const advance = (r: Reservation) => {
        const st = stageOf(r);
        const short = maskName(r.customerName, privateMode);
        if (st === 'Yaklaşıyor') {
            void step(r, advancePatch('arrived'), { customerArrivedAt: CLEAR }, `${short} kabul edildi`);
            return;
        }
        if (st === 'Hazırlıkta') {
            if (!canStart(r)) { setSelectedId(r.id); setModal('readiness'); return; }
            void step(r, advancePatch('active'), { arrivedAt: CLEAR, status: 'confirmed' }, `${short} · işlem başlatıldı`);
            return;
        }
        if (st === 'İşlemde') {
            void step(r, advancePatch('completed'), { serviceEndedAt: CLEAR, status: 'confirmed' }, `${short} · kayıt tamamlandı`);
            return;
        }
        // Dashboard ödeme YAZMAZ — yalnız Kasa akışını açar. Kasa modülü
        // kapalıysa tahsilat başka yerde takip ediliyordur; kayıt "çıkışa hazır"
        // aşamasında süresiz beklemesin diye kapatılır (ödeme kaydı üretilmez).
        if (!cashOn) {
            void step(r, { isPaid: true }, { isPaid: false }, `${short} kaydı kapatıldı`);
            return;
        }
        navigate('/kasa');
    };

    // ── Diğer öncelikler ─────────────────────────────────────────────────────
    type Task = { key: string; tone: string; icon: ElementType; title: string; detail: string; run: () => void };
    const tasks: Task[] = (() => {
        const out: Task[] = [];
        const missing = byStage['Hazırlıkta'].find((r) => !canStart(r)) || byStage['Yaklaşıyor'].find((r) => !canStart(r));
        if (missing) out.push({
            key: 'prep', tone: 'red', icon: FileCheck2,
            title: `${maskName(missing.customerName, privateMode)} için hazırlık eksik`,
            detail: LIVE_STEPS.filter((s) => readinessOf(missing)[s.key] !== true).map((s) => s.missing).join(' · '),
            run: () => { setSelectedId(missing.id); setModal('readiness'); },
        });
        if (cashOn && byStage['Çıkışa hazır'].length > 0) out.push({
            key: 'cash', tone: 'green', icon: WalletCards,
            title: `${byStage['Çıkışa hazır'].length} hasta çıkışa hazır`,
            detail: pendingCash > 0 ? `${money(pendingCash)} tahsilat Kasa'da bekliyor` : 'Kayıt ve çıkış işlemi bekliyor',
            run: () => navigate('/kasa'),
        });
        if (dueControl.length > 0) out.push({
            key: 'recall', tone: 'amber', icon: History,
            title: `${dueControl.length} hastanın kontrol zamanı geldi`,
            detail: `${recallDays} gündür kontrole gelmeyen hastalar`,
            run: () => navigate('/customers'),
        });
        if (unplannedPlans.length > 0) out.push({
            key: 'plans', tone: 'blue', icon: ClipboardCheck,
            title: `${unplannedPlans.length} tedavi planında sıradaki randevu yok`,
            detail: 'Aktif planlar · seans planlaması bekliyor',
            run: () => navigate('/packages'),
        });
        if (cashOn && dueInstallments.length > 0) out.push({
            key: 'inst', tone: 'blue', icon: ReceiptText,
            title: `${dueInstallments.length} taksit 7 gün içinde`,
            detail: `${money(dueInstallments.reduce((s, i) => s + i.amount, 0))} planlı tahsilat`,
            run: () => navigate('/kasa'),
        });
        return out;
    })();

    // ── Hasta yolculuğu şeridi ───────────────────────────────────────────────
    const journey: [string, number, string][] = [
        ['Kabul', byStage['Yaklaşıyor'].length, 'yaklaşıyor'],
        ['Değerlendirme', byStage['Hazırlıkta'].filter((r) => !canStart(r)).length, 'hazırlık bekliyor'],
        ['Hazırlık', byStage['Hazırlıkta'].filter((r) => canStart(r)).length, 'başlamaya hazır'],
        ['Uygulama', byStage['İşlemde'].length, 'işlemde'],
        ['Çıkış', byStage['Çıkışa hazır'].length, 'kayıt/kasa'],
        ['Kontrol', dueControl.length, 'planlı'],
    ];

    // ── Akış listesi ─────────────────────────────────────────────────────────
    const visible = useMemo(() => {
        const q = search.trim().toLocaleLowerCase('tr');
        return inClinic.filter((r) => {
            if (stageFilter !== 'Tümü' && stageOf(r) !== stageFilter) return false;
            if (!q) return true;
            return r.customerName.toLocaleLowerCase('tr').includes(q) || r.service.toLocaleLowerCase('tr').includes(q);
        });
    }, [inClinic, stageFilter, search, stageOf]);

    const upcomingList = useMemo(
        () => todayList.filter((r) => phaseOf(r) === 'wait' && toMin(r.startTime) >= nowMin - 15).slice(0, 8),
        [todayList, nowMin],
    );

    // ⌘K → hasta ara
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setModal('search'); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const dateParts = {
        day: now.getDate(),
        month: now.toLocaleDateString('tr-TR', { month: 'long' }),
        weekday: now.toLocaleDateString('tr-TR', { weekday: 'long' }),
    };

    const selReadiness = selected ? readinessOf(selected) : null;
    const selLiveDone = selected ? liveScore(selected) : 0;
    const selMissing = selected && selReadiness
        ? LIVE_STEPS.filter((s) => selReadiness[s.key] !== true) : [];
    const selRoom = selected?.resourceId ? rooms.find((r) => r.id === selected.resourceId)?.name : null;

    return (
        <div className={cn('dash-theme es-ops flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--dc-page)]', dark && 'dark')}>
            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="aesthetic-dashboard">

                    {/* ── Gün özeti ──────────────────────────────────────────── */}
                    <section className="clinic-intro">
                        <div className="clinic-intro-copy">
                            <span className="clinic-date">
                                <CalendarDays size={14} />
                                {dateParts.day} {dateParts.month} · {dateParts.weekday}
                                <i />
                                <LiveClock />
                            </span>
                            <span className="eyebrow">{(settings.businessName || 'ESTETİK KLİNİĞİ').toLocaleUpperCase('tr')} · GÜNLÜK KOMUTA MERKEZİ</span>
                            <h1>Bugün klinikte <em>her adım görünür.</em></h1>
                            <p>
                                {[
                                    `bugün ${todayList.length} randevu`,
                                    byStage['İşlemde'].length > 0 && `${byStage['İşlemde'].length} işlem sürüyor`,
                                    waitingPrep > 0 && `${waitingPrep} hazırlık dikkat istiyor`,
                                    byStage['Çıkışa hazır'].length > 0 && `${byStage['Çıkışa hazır'].length} hasta çıkışa hazır`,
                                    todayList.length === 0 && 'bugün için planlanmış randevu yok',
                                ].filter(Boolean).join(' · ')}
                            </p>
                            <div className="clinic-quiet-facts">
                                <span><i className="dot dot--green" /> {busyRooms} / {rooms.length} oda aktif</span>
                                <span><i className="dot dot--blue" /> {activeStaff.length} uzman görevde</span>
                                <button type="button" className="privacy-toggle" aria-pressed={privateMode}
                                    onClick={() => setPrivateMode((v) => !v)}>
                                    <LockKeyhole size={14} /> Ortak ekran mahremiyeti {privateMode ? 'açık' : 'kapalı'}
                                </button>
                            </div>
                        </div>

                        <div className="clinic-readiness">
                            <div className="clinic-readiness-ring" role="img"
                                aria-label={`Klinik hazırlık yüzdesi ${readinessPct}`}
                                style={{
                                    background: `conic-gradient(var(--dc-green) 0 ${readinessPct * 3.6}deg, var(--dc-surface3) ${readinessPct * 3.6}deg 360deg)`,
                                }}>
                                <span>
                                    <strong>{readinessPct}%</strong>
                                    <small>Klinik hazır</small>
                                </span>
                            </div>
                            <p><i />{waitingPrep > 0 ? `${waitingPrep} hazırlık bekliyor` : 'Bekleyen hazırlık yok'}</p>
                        </div>

                        <div className="clinic-intro-actions">
                            <button type="button" className="button button--ghost" onClick={() => navigate('/calendar')}>
                                <CalendarDays size={18} />Takvimi aç
                            </button>
                            <button type="button" className="button button--ghost" onClick={() => setModal('arrival')}>
                                <UserRoundCheck size={18} />Hasta kabulü
                            </button>
                            <button type="button" className="button button--dark" onClick={() => navigate('/calendar?new=1')}>
                                <Plus size={19} />Yeni randevu
                            </button>
                        </div>
                    </section>

                    {/* ── Klinik haritası + Güvenli karar masası ─────────────── */}
                    <section className="atelier-grid">
                        <article className="clinic-map-panel">
                            <header className="atelier-head">
                                <div>
                                    <span className="eyebrow">CANLI KLİNİK HARİTASI</span>
                                    <h2>Odalar ve hasta konumu</h2>
                                    <p>Bir odayı seçin; güvenli sıradaki adım sağda açılır.</p>
                                </div>
                                <span className="live-status"><i />Şimdi güncellendi</span>
                            </header>

                            <div className="clinic-map-summary">
                                <span><strong>{rooms.length}</strong><small>oda</small></span>
                                <span><strong>{busyRooms}</strong><small>aktif</small></span>
                                <span><strong>{byStage['Çıkışa hazır'].length}</strong><small>çıkışa hazır</small></span>
                                <span><strong>{clashCount}</strong><small>kaynak çakışması</small></span>
                            </div>

                            {rooms.length === 0 ? (
                                <div className="empty-state">
                                    <Building2 size={21} />
                                    <strong>Uygulama odası tanımlı değil</strong>
                                    <p>Ayarlar'dan odaları ekleyin; klinik haritası burada canlanacak.</p>
                                    <button type="button" onClick={() => navigate('/settings')}>Ayarları aç</button>
                                </div>
                            ) : (
                                <div className={cn('clinic-map-canvas', rooms.length > 4 && 'is-list')}>
                                    {rooms.length <= 4 && (
                                        <>
                                            <span className="map-line map-line--horizontal" aria-hidden="true" />
                                            <span className="map-line map-line--vertical" aria-hidden="true" />
                                            <div className="map-heart" aria-hidden="true">
                                                <Sparkles size={18} />
                                                <strong>Klinik hazır</strong>
                                                <small>{readinessPct} / 100</small>
                                            </div>
                                        </>
                                    )}
                                    {rooms.map((room) => {
                                        const p = room.patient;
                                        const isSel = Boolean(p && selected?.id === p.id);
                                        return (
                                            <button type="button" key={room.id}
                                                className={cn('room-node', rooms.length <= 4 && room.corner, `tone-${room.tone}`, isSel && 'is-selected')}
                                                onClick={() => p && setSelectedId(p.id)}
                                                aria-pressed={isSel}>
                                                <span className="room-node-top">
                                                    <span><Building2 size={15} />{room.shortName}</span>
                                                    <em>{room.status}</em>
                                                </span>
                                                {p ? (
                                                    <>
                                                        <span className="room-patient">
                                                            <span className="patient-avatar">{initialsOf(p.customerName)}</span>
                                                            <span>
                                                                <strong>{maskName(p.customerName, privateMode)}</strong>
                                                                <small>{p.service}</small>
                                                            </span>
                                                        </span>
                                                        <span className="room-practitioner">
                                                            <Stethoscope size={13} />{p.staffName || 'Uzman atanmadı'}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className="room-patient">
                                                        <span className="patient-avatar">—</span>
                                                        <span><strong>Boş</strong><small>Hasta atanmadı</small></span>
                                                    </span>
                                                )}
                                                <span className="room-progress">
                                                    <i><em style={{ width: `${room.progress}%` }} /></i>
                                                    <small>{room.detail}</small>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            <footer className="map-legend">
                                <span><i className="dot dot--green" /> Hazır</span>
                                <span><i className="dot dot--orange" /> İşlemde</span>
                                <span><i className="dot dot--blue" /> Yaklaşıyor</span>
                                <button type="button" onClick={() => setView('resources')}>
                                    Tüm kaynakları gör<ArrowRight size={15} />
                                </button>
                            </footer>
                        </article>

                        <aside className="safety-desk">
                            <header className="safety-desk-head">
                                <div>
                                    <span className="eyebrow">GÜVENLİ KARAR MASASI</span>
                                    <h2>Sıradaki doğru adım</h2>
                                </div>
                                <span className="safety-seal"><ShieldCheck size={17} /></span>
                            </header>

                            {selected && selReadiness ? (
                                <>
                                    <div className="selected-brief">
                                        <div className="selected-brief-time">
                                            <span>{selected.startTime}</span>
                                            <em className={`tone-label tone-${STAGE_META[stageOf(selected) as Stage].tone}`}>
                                                {stageOf(selected)}
                                            </em>
                                        </div>
                                        <h3>{maskName(selected.customerName, privateMode)}</h3>
                                        <p>{selected.service}</p>
                                        <div className="selected-brief-context">
                                            <span><Stethoscope size={13} />{selected.staffName || 'Uzman atanmadı'}</span>
                                            <span><Building2 size={13} />{selRoom || 'Oda atanmadı'}</span>
                                        </div>
                                        {hasMedicalFlag(selected) && (
                                            <button type="button" className="medical-flag"
                                                onClick={() => navigate(`/customers?q=${encodeURIComponent(selected.customerPhone || selected.customerName)}`)}>
                                                <AlertCircle size={14} />
                                                Tıbbi uyarı var — ayrıntı yetkili hasta dosyasında
                                            </button>
                                        )}
                                    </div>

                                    <div className="selected-readiness">
                                        <div className="selected-readiness-head">
                                            <span>
                                                <small>İŞLEM ÖNCESİ HAZIRLIK</small>
                                                <strong>{selLiveDone}/{LIVE_STEPS.length} adım tamam</strong>
                                            </span>
                                            <em>{Math.round((selLiveDone / LIVE_STEPS.length) * 100)}%</em>
                                        </div>
                                        <div className="selected-readiness-track">
                                            <i style={{ width: `${(selLiveDone / LIVE_STEPS.length) * 100}%` }} />
                                        </div>
                                        <div className="selected-readiness-steps">
                                            {READINESS_STEPS.map((s, i) => {
                                                const state = selReadiness[s.key];
                                                return (
                                                    <span key={s.key} title={`${s.title}${state === null ? ' — altyapı gerekli' : ''}`}
                                                        className={state === true ? 'is-complete' : state === null ? 'is-pending' : 'is-missing'}>
                                                        {state === true ? <Check size={11} /> : state === null ? '·' : i + 1}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                        <p className={selMissing.length ? '' : 'is-ready'}>
                                            {selMissing.length ? (
                                                <><AlertCircle size={14} />{selMissing.slice(0, 2).map((s) => s.missing).join(' · ')}</>
                                            ) : (
                                                <><CheckCircle2 size={14} />Okunabilen adımlar tamam</>
                                            )}
                                        </p>
                                        <button type="button" className="readiness-open" onClick={() => setModal('readiness')}>
                                            Hazırlık kontrolünü aç<ChevronRight size={14} />
                                        </button>
                                    </div>

                                    <div className="safety-desk-actions">
                                        <button type="button" className="button button--dark" disabled={busyId === selected.id}
                                            onClick={() => advance(selected)}>
                                            {actionLabel(selected)}<ArrowRight size={17} />
                                        </button>
                                        <button type="button" className="button button--ghost"
                                            onClick={() => navigate(`/customers?q=${encodeURIComponent(selected.customerPhone || selected.customerName)}`)}>
                                            <FileText size={16} />Hasta dosyası
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="selected-brief">
                                    <div className="selected-brief-time">
                                        <span>—</span>
                                        <em className="tone-label tone-green">Klinik sakin</em>
                                    </div>
                                    <h3>Şu an klinikte hasta yok</h3>
                                    <p>Bugün {doneToday.length} işlem tamamlandı</p>
                                </div>
                            )}

                            <div className="safety-priorities">
                                <span className="eyebrow">DİĞER ÖNCELİKLER</span>
                                {tasks.length === 0 && (
                                    <p className="priorities-empty">Bekleyen klinik görevi görünmüyor.</p>
                                )}
                                {tasks.slice(0, 3).map((task) => {
                                    const Icon = task.icon;
                                    return (
                                        <button type="button" key={task.key} onClick={task.run}>
                                            <span className={`task-symbol tone-${task.tone}`}><Icon size={15} /></span>
                                            <span><strong>{task.title}</strong><small>{task.detail}</small></span>
                                            <ChevronRight size={15} />
                                        </button>
                                    );
                                })}
                            </div>
                        </aside>
                    </section>

                    {/* ── Hasta yolculuğu ────────────────────────────────────── */}
                    <section className="journey-panel">
                        <header className="journey-head">
                            <div>
                                <span className="eyebrow">HASTA YOLCULUĞU</span>
                                <h2>Kabulden kontrole tek, sakin akış</h2>
                                <p>Kart yığını yerine kronolojik karar sırası.</p>
                            </div>
                            <div className="journey-tools">
                                <div className="segmented-control" aria-label="Klinik görünümü">
                                    {([['flow', 'Şimdi'], ['upcoming', `${UPCOMING_WINDOW} dakika`], ['resources', 'Odalar']] as const).map(([k, label]) => (
                                        <button type="button" key={k} className={cn(view === k && 'is-active')}
                                            aria-pressed={view === k} onClick={() => setView(k)}>{label}</button>
                                    ))}
                                </div>
                                <label className="search-field">
                                    <Search size={17} />
                                    <input value={search} onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Hasta veya işlem ara" aria-label="Hasta veya işlem ara" />
                                    <kbd>⌘ K</kbd>
                                </label>
                            </div>
                        </header>

                        <div className="journey-rail" aria-label="Hasta yolculuğu aşamaları">
                            {journey.map(([label, count, helper], i) => (
                                <span key={label} className={cn(i < 5 && count > 0 && 'is-live')}>
                                    <i>{count}</i>
                                    <strong>{label}</strong>
                                    <small>{helper}</small>
                                </span>
                            ))}
                        </div>

                        {view === 'flow' && (
                            <div className="journey-stream">
                                <div className="journey-filter">
                                    <button type="button" className={cn(stageFilter === 'Tümü' && 'is-active')}
                                        onClick={() => setStageFilter('Tümü')}>Tümü</button>
                                    {(Object.keys(STAGE_META) as Stage[]).map((s) => (
                                        <button type="button" key={s} className={cn(stageFilter === s && 'is-active')}
                                            onClick={() => setStageFilter(s)}>{s}</button>
                                    ))}
                                </div>
                                {visible.length ? visible.map((r) => {
                                    const rd = readinessOf(r);
                                    const done = LIVE_STEPS.filter((s) => rd[s.key] === true).length;
                                    const miss = LIVE_STEPS.filter((s) => rd[s.key] !== true);
                                    const st = stageOf(r) as Stage;
                                    return (
                                        <button type="button" key={r.id} aria-pressed={selected?.id === r.id}
                                            className={cn('journey-row', selected?.id === r.id && 'is-selected')}
                                            onClick={() => setSelectedId(r.id)}>
                                            <span className="journey-time">
                                                <strong>{r.startTime}</strong>
                                                <small>{stageDetail(r, st, now, canStart(r))}</small>
                                            </span>
                                            <span className="journey-person">
                                                <span className="patient-avatar">{initialsOf(r.customerName)}</span>
                                                <span>
                                                    <strong>{maskName(r.customerName, privateMode)}</strong>
                                                    <small>{r.service}</small>
                                                </span>
                                            </span>
                                            <span className="journey-place">
                                                <strong>{r.staffName || 'Uzman atanmadı'}</strong>
                                                <small>{rooms.find((x) => x.id === r.resourceId)?.name || 'Oda atanmadı'}</small>
                                            </span>
                                            <span className="journey-ready">
                                                <span>
                                                    <i><em style={{ width: `${(done / LIVE_STEPS.length) * 100}%` }} /></i>
                                                    <small>{done}/{LIVE_STEPS.length} hazır</small>
                                                </span>
                                                {hasMedicalFlag(r) ? (
                                                    <em className="issue issue--danger">Tıbbi uyarı var</em>
                                                ) : miss.length ? (
                                                    <em className="issue">{miss[0].missing}</em>
                                                ) : (
                                                    <em className="issue issue--safe">Hazır</em>
                                                )}
                                            </span>
                                            <span className={`tone-label tone-${STAGE_META[st].tone}`}>{st}</span>
                                            <ChevronRight size={16} />
                                        </button>
                                    );
                                }) : (
                                    <div className="empty-state">
                                        <Search size={21} />
                                        <strong>Eşleşen hasta bulunamadı</strong>
                                        <p>Filtreyi kaldırın veya farklı bir arama yapın.</p>
                                        <button type="button" onClick={() => { setStageFilter('Tümü'); setSearch(''); }}>
                                            Filtreyi temizle
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {view === 'upcoming' && (
                            <div className="journey-upcoming">
                                {upcomingList.length ? upcomingList.map((r, i) => {
                                    const eta = toMin(r.startTime) - nowMin;
                                    const clash = r.resourceId && todayList.some((o) => o.id !== r.id && o.resourceId === r.resourceId
                                        && toMin(o.startTime) < toMin(r.endTime) && toMin(r.startTime) < toMin(o.endTime));
                                    return (
                                        <button type="button" key={r.id} onClick={() => setSelectedId(r.id)}>
                                            <span>{String(i + 1).padStart(2, '0')}</span>
                                            <strong>{r.startTime}</strong>
                                            <span>
                                                <b>{maskName(r.customerName, privateMode)}</b>
                                                <small>{r.service}</small>
                                            </span>
                                            <span>
                                                <b>{r.staffName || 'Uzman atanmadı'}</b>
                                                <small>{clash ? 'Kaynak çakışması var' : 'Kaynak çakışması yok'}</small>
                                            </span>
                                            <em className={cn('tone-label', clash ? 'tone-red' : eta <= 15 ? 'tone-amber' : 'tone-blue')}>
                                                {eta <= 0 ? 'Bekleniyor' : `${eta} dk`}
                                            </em>
                                            <ChevronRight size={16} />
                                        </button>
                                    );
                                }) : (
                                    <div className="empty-state">
                                        <CalendarDays size={21} />
                                        <strong>Yaklaşan randevu yok</strong>
                                        <p>Günün kalanında planlanmış randevu bulunmuyor.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {view === 'resources' && (
                            <div className="atelier-resource-list">
                                {rooms.length === 0 && (
                                    <div className="empty-state">
                                        <Building2 size={21} />
                                        <strong>Oda tanımlı değil</strong>
                                        <p>Ayarlar'dan uygulama odalarını ekleyin.</p>
                                    </div>
                                )}
                                {rooms.map((room) => (
                                    <button type="button" key={room.id} className={`tone-${room.tone}`}
                                        onClick={() => room.patient && setSelectedId(room.patient.id)}>
                                        <span><Building2 size={18} /></span>
                                        <span>
                                            <strong>{room.name}</strong>
                                            <small>{room.patient ? `${maskName(room.patient.customerName, privateMode)} · ${room.detail}` : room.detail}</small>
                                        </span>
                                        <em>{room.status}</em>
                                        <ChevronRight size={15} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* ── FlowPilot: yalnız öneri ────────────────────────────── */}
                    {tasks[0] && (
                        <section className="atelier-assistant">
                            <span className="flowpilot-icon"><Sparkles size={18} /></span>
                            <span><strong>FlowPilot</strong><small>Yalnızca önerir; onay sizde kalır.</small></span>
                            <p><i />{tasks[0].title} — {tasks[0].detail}</p>
                            <button type="button" onClick={tasks[0].run}>
                                Görevi aç<ArrowRight size={15} />
                            </button>
                            <span className="human-approval"><ShieldCheck size={14} />İnsan onayı</span>
                        </section>
                    )}

                    {/* ── Klinik defteri ─────────────────────────────────────── */}
                    <section className="clinical-ledger">
                        <article>
                            <span className="ledger-icon tone-green"><History size={18} /></span>
                            <div>
                                <span className="eyebrow">BAKIM SONRASI</span>
                                <h3>{dueControl.length > 0 ? `${dueControl.length} kontrol araması bekliyor` : 'Kontrol listesi temiz'}</h3>
                                <p>{dueControl.length > 0
                                    ? `${recallDays} gündür kontrole gelmeyen hastalar`
                                    : 'Kontrol zamanı gelen hasta görünmüyor'}</p>
                            </div>
                            <button type="button" onClick={() => navigate('/customers')}>
                                Takipleri aç <ArrowRight size={15} />
                            </button>
                        </article>
                        <article>
                            <span className="ledger-icon tone-blue"><Boxes size={18} /></span>
                            <div>
                                <span className="eyebrow">İZLENEBİLİRLİK</span>
                                <h3>Altyapı gerekli</h3>
                                <p>Ürün, lot ve son kullanma takibi için veri modeli henüz bağlı değil.</p>
                            </div>
                            <button type="button" disabled title="Lot/SKT tablosu eklendiğinde açılır">
                                Bağlı değil
                            </button>
                        </article>
                        <article>
                            <span className="ledger-icon tone-amber"><MonitorCog size={18} /></span>
                            <div>
                                <span className="eyebrow">KAYNAK HAZIRLIĞI</span>
                                <h3>{rooms.length - busyRooms} oda kullanıma hazır</h3>
                                <p>{clashCount > 0 ? `${clashCount} randevuda oda çakışması var` : 'Oda çakışması yok'}</p>
                            </div>
                            <button type="button" onClick={() => setView('resources')}>
                                Kaynakları aç <ArrowRight size={15} />
                            </button>
                        </article>
                    </section>
                </div>
            </div>

            {modal === 'readiness' && selected && selReadiness && (
                <ModalShell eyebrow="İŞLEM ÖNCESİ GÜVENLİK"
                    title={`${maskName(selected.customerName, privateMode)} · Hazırlık kontrolü`}
                    description="Eksik klinik adımlar tamamlanmadan işlem başlatılmaz."
                    icon={ShieldCheck} wide onClose={() => setModal(null)}
                    footer={
                        <>
                            <button type="button" className="button button--ghost" onClick={() => setModal(null)}>Kapat</button>
                            <button type="button" className="button button--dark" disabled={!canStart(selected) || busyId === selected.id}
                                onClick={() => { setModal(null); advance(selected); }}>
                                {actionLabel(selected)}<ArrowRight size={16} />
                            </button>
                        </>
                    }>
                    {hasMedicalFlag(selected) && (
                        <div className="modal-alert modal-alert--danger">
                            <AlertCircle size={18} />
                            <div>
                                <strong>Tıbbi uyarı mevcut</strong>
                                <p>Ayrıntıyı yalnız yetkili hasta dosyasında görüntüleyin ve hekim değerlendirmesini kaydedin.</p>
                            </div>
                            <button type="button"
                                onClick={() => navigate(`/customers?q=${encodeURIComponent(selected.customerPhone || selected.customerName)}`)}>
                                Dosyayı aç
                            </button>
                        </div>
                    )}
                    <div className="readiness-list">
                        {READINESS_STEPS.map(({ key, title, detail, icon: Icon }) => {
                            const state = selReadiness[key];
                            return (
                                <div className={cn('readiness-item', state === true && 'is-complete', state === null && 'is-pending')} key={key}>
                                    <span className="readiness-icon"><Icon size={18} /></span>
                                    <span>
                                        <strong>{title}</strong>
                                        <small>{detail}</small>
                                    </span>
                                    <em className="readiness-state">
                                        {state === true ? 'Tamam' : state === null ? 'Altyapı gerekli' : 'Eksik'}
                                    </em>
                                    <i aria-hidden="true">{state === true ? <Check size={14} /> : state === null ? '·' : <X size={13} />}</i>
                                </div>
                            );
                        })}
                    </div>
                    <p className="modal-privacy-note">
                        <LockKeyhole size={15} />
                        Onam, klinik fotoğraf ve lot kaydı için üretimde tablo yok; bu adımlar tamamlanmış sayılmaz
                        ve gerçek veri gelene kadar işlem kapısını kilitlemez. Klinik fotoğraf kaydı ile tanıtımda
                        kullanım izni birbirinden ayrı tutulur.
                    </p>
                </ModalShell>
            )}

            {modal === 'arrival' && (
                <ModalShell eyebrow="HASTA KABULÜ" title="Kliniğe gelen hastayı işaretleyin"
                    description="Kabul yalnız hastanın geldiğini kaydeder; işlem hekim onayıyla başlar."
                    icon={UserRoundCheck} onClose={() => setModal(null)}>
                    <div className="arrival-list">
                        {byStage['Yaklaşıyor'].length === 0 && upcomingList.length === 0 && (
                            <p className="priorities-empty">Bekleyen randevu yok.</p>
                        )}
                        {[...byStage['Yaklaşıyor'], ...upcomingList.filter((r) => !byStage['Yaklaşıyor'].some((x) => x.id === r.id))].map((r) => (
                            <div className="arrival-row" key={r.id}>
                                <span className="patient-avatar">{initialsOf(r.customerName)}</span>
                                <span>
                                    <strong>{maskName(r.customerName, privateMode)}</strong>
                                    <small>{r.startTime} · {r.service}</small>
                                </span>
                                <button type="button" className="button button--dark" disabled={busyId === r.id}
                                    onClick={() => { void step(r, advancePatch('arrived'), { customerArrivedAt: CLEAR }, `${maskName(r.customerName, privateMode)} kabul edildi`); setModal(null); }}>
                                    Geldi
                                </button>
                            </div>
                        ))}
                    </div>
                </ModalShell>
            )}

            {modal === 'search' && (
                <ModalShell eyebrow="HASTA BUL" title="Hasta ara"
                    description="Ad veya telefonla arayın; dosya yetkili sayfada açılır."
                    icon={Search} onClose={() => setModal(null)}>
                    <PatientSearch customers={customers} privateMode={privateMode}
                        onPick={(c) => { setModal(null); navigate(`/customers?q=${encodeURIComponent(c.phone || c.name)}`); }} />
                </ModalShell>
            )}
        </div>
    );
}

/** Akış satırındaki ikinci satır — aşamaya göre gerçek durum. */
function stageDetail(r: Reservation, stage: Stage, now: Date, ready: boolean): string {
    if (stage === 'Yaklaşıyor') {
        const eta = toMin(r.startTime) - (now.getHours() * 60 + now.getMinutes());
        return eta <= 0 ? 'Bekleniyor' : `${eta} dk içinde bekleniyor`;
    }
    if (stage === 'Hazırlıkta') {
        const wait = r.customerArrivedAt ? minsSince(r.customerArrivedAt, now) : 0;
        return ready ? `${wait} dk · başlamaya hazır` : `${wait} dk · hazırlık eksik`;
    }
    if (stage === 'İşlemde') {
        const run = r.arrivedAt ? minsSince(r.arrivedAt, now) : 0;
        const planned = Math.max(1, toMin(r.endTime) - toMin(r.startTime));
        return `${run} / ${planned} dk`;
    }
    return r.serviceEndedAt ? `${minsSince(r.serviceEndedAt, now)} dk önce tamamlandı` : 'Kayıt bekliyor';
}

/** Başlıktaki canlı saat — yalnız kendini tazeler. */
function LiveClock() {
    const [t, setT] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setT(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    return <>{String(t.getHours()).padStart(2, '0')}:{String(t.getMinutes()).padStart(2, '0')}</>;
}

function ModalShell({ eyebrow, title, description, icon: Icon, onClose, children, footer, wide }: {
    eyebrow: string; title: string; description?: string; icon: ElementType;
    onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div className="modal-layer" role="presentation">
            <button type="button" className="modal-scrim" aria-label="Pencereyi kapat" onClick={onClose} />
            <section className={cn('modal-card', wide && 'modal-card--wide')} role="dialog" aria-modal="true" aria-labelledby="es-modal-title">
                <header className="modal-head">
                    <span className="modal-symbol" aria-hidden="true"><Icon size={19} /></span>
                    <div>
                        <span className="eyebrow">{eyebrow}</span>
                        <h2 id="es-modal-title">{title}</h2>
                        {description && <p>{description}</p>}
                    </div>
                    <button type="button" className="icon-button" aria-label="Kapat" onClick={onClose}><X size={18} /></button>
                </header>
                <div className="modal-body">{children}</div>
                {footer && <footer className="modal-footer">{footer}</footer>}
            </section>
        </div>
    );
}

function PatientSearch({ customers, privateMode, onPick }: {
    customers: Customer[]; privateMode: boolean; onPick: (c: Customer) => void;
}) {
    const [q, setQ] = useState('');
    const results = useMemo(() => {
        const s = q.trim().toLocaleLowerCase('tr');
        if (!s) return [];
        return customers.filter((c) => c.name.toLocaleLowerCase('tr').includes(s) || c.phone.includes(s)).slice(0, 6);
    }, [q, customers]);
    return (
        <>
            <label className="search-field">
                <Search size={17} />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="Ad veya telefonla ara" aria-label="Hasta ara" />
            </label>
            <div className="arrival-list">
                {q.trim() === '' && <p className="priorities-empty">Aramak için yazmaya başlayın.</p>}
                {q.trim() !== '' && results.length === 0 && <p className="priorities-empty">Sonuç bulunamadı.</p>}
                {results.map((c) => (
                    <button type="button" className="arrival-row" key={c.id} onClick={() => onPick(c)}>
                        <span className="patient-avatar">{initialsOf(c.name)}</span>
                        <span>
                            <strong>{maskName(c.name, privateMode)}</strong>
                            <small>{c.lastVisit ? `Son ziyaret ${formatDateEU(c.lastVisit)}` : 'İlk ziyaret bekleniyor'}</small>
                        </span>
                        <ChevronRight size={16} />
                    </button>
                ))}
            </div>
        </>
    );
}
