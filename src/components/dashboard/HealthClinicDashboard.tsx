import { useEffect, useMemo, useState, type CSSProperties, type ElementType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Activity, AlertCircle, ArrowRight, Bell, CalendarDays, Check, CheckCircle2, ChevronRight,
    CircleAlert, CircleDollarSign, ClipboardList, Clock3, DoorOpen, History, ListFilter,
    LockKeyhole, Plus, Search, ShieldCheck, Stethoscope, TimerReset, TrendingUp,
    UserPlus, UserRoundCheck, WandSparkles, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { useCustomers } from '@/hooks/useCustomers';
import { useStaff } from '@/hooks/useStaff';
import { useCashEnabled } from '@/hooks/useModules';
import { useResources } from '@/hooks/useResources';
import { useSlotResolver } from '@/hooks/useSlotResolver';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import { todayISO, toISODate, formatDateEU } from '@/utils/date';
import { phaseOf, minsSince, advancePatch } from '@/lib/sessionPhase';
import { apptPhase } from '@/lib/appointmentFlow';
import { clockMin } from '@/lib/slotResolution';
import { normalizePhone, hasWa } from '@/lib/phone';
import { reservationPrice } from '@/utils/reservationServices';
import { AppointmentComposer, WalkInModal, CF_VISIT_TYPE, type ComposerSeed, type VisitType } from '@/components/dashboard/AppointmentComposer';
import type { Customer, Reservation } from '@/types';
import './healthOps.css';

// ── Sağlık / Klinik Dashboard V2 ─────────────────────────────────────────────
// Mimari: "Klinik Nabzı + Randevu Merceği". Ekran dört soruya cevap verir:
// kliniğin anlık yükü nedir, hangi randevu tek bir operasyon eylemi bekliyor,
// güvenli randevu nasıl 20–30 saniyede oluşturulur, ziyaret sonrası hangi
// idari temas unutulmamalı?
//
// SINIRLAR (ürün sözleşmesi):
//  • Operasyon aşaması TEK kaynaktan türetilir: sessionPhase + appointmentFlow.
//    Burada paralel bir durum sistemi kurulmaz.
//  • Klinik kapanış ile finansal kapanış AYRI gösterilir. isPaid, açık tahsilat,
//    işlem bedeli ve tahmini ciro hasta sırasını, aciliyeti veya AI aday
//    sırasını DEĞİŞTİREMEZ. Liste yalnız saate göre sıralanır.
//  • Sistem tanı, triyaj, aciliyet veya klinik öncelik üretmez. "Uygun" yalnız
//    operasyonel müsaitliktir.
//  • Ortak ekranda tanı, sonuç içeriği, alerji/ilaç ayrıntısı ve serbest klinik
//    not RENDER EDİLMEZ. Mahremiyet kapatılsa bile yalnız "Klinik uyarı var"
//    görünür; ayrıntı rol bazlı hasta dosyasında açılır.

type FlowState = 'Muayenede' | 'Klinikte' | 'Çıkışta' | 'Yaklaşıyor' | 'Teyit bekliyor' | 'Gelmedi' | 'Tamamlandı' | 'Bekleniyor';
type Group = 'now' | 'next' | 'later';
type ListFilterKey = 'all' | 'clinic' | 'upcoming';
type ModalName = 'search' | 'walkin' | 'notifications' | 'patient' | 'aiMatches' | null;

const NEXT_WINDOW = 60;   // "Sıradaki 60 dakika"

const STATE_META: Record<FlowState, { tone: string; icon: ElementType }> = {
    'Muayenede': { tone: 'blue', icon: Stethoscope },
    'Klinikte': { tone: 'teal', icon: UserRoundCheck },
    'Çıkışta': { tone: 'green', icon: DoorOpen },
    'Yaklaşıyor': { tone: 'soft-blue', icon: Clock3 },
    'Teyit bekliyor': { tone: 'amber', icon: CircleAlert },
    'Gelmedi': { tone: 'red', icon: AlertCircle },
    'Tamamlandı': { tone: 'green', icon: CheckCircle2 },
    'Bekleniyor': { tone: 'neutral', icon: CalendarDays },
};

/** Unvanlar baş harfi yutmasın: "Uzm. Dr. Aylin Er" → AE (UD değil). */
const TITLES = /^(uzm|dr|op|prof|doç|doc|yrd|fzt|dt|uz)\.?$/i;
const initialsOf = (n: string) => {
    const parts = n.trim().split(/\s+/).filter((p) => p && !TITLES.test(p));
    const src = parts.length ? parts : n.trim().split(/\s+/);
    return src.map((p) => p.charAt(0)).join('').slice(0, 2).toLocaleUpperCase('tr');
};
const money = (n: number) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const text = (v: unknown) => String(v ?? '').trim();

/** Mahremiyet: soyad baş harfe iner. Varsayılan AÇIK. */
const maskName = (full: string, on: boolean) => {
    if (!on) return full;
    const parts = full.trim().split(/\s+/);
    return parts.length < 2 ? parts[0] || full : `${parts[0]} ${parts[parts.length - 1].charAt(0).toLocaleUpperCase('tr')}.`;
};
const maskPhone = (phone: string, on: boolean) => {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return 'Telefon kayıtlı değil';
    if (!on) return phone;
    return `${digits.slice(0, 4)} ••• •• ${digits.slice(-2)}`;
};

/** Klinik uyarının VARLIĞI — içeriği hiçbir mahremiyet seviyesinde basılmaz. */
const NEGATIVE = /^(yok|yoktur|hay[ıi]r|bilinmiyor|none|no|-|\.)$/i;
const hasClinicalFlag = (c?: Customer) => {
    const cf = c?.customFields || {};
    return ['alerji', 'kronik', 'ilaclar'].some((k) => {
        const v = text(cf[k]);
        return v.length > 0 && !NEGATIVE.test(v);
    });
};

export function HealthClinicDashboard() {
    const navigate = useNavigate();
    const { dark } = useTheme();
    const { reservations, settings, updateReservation } = useReservations();
    const cashOn = useCashEnabled();
    const { allCustomers, customerById } = useCustomers();
    const { staff } = useStaff();
    const { resources } = useResources();
    const { findSlots, isReady } = useSlotResolver();
    const today = todayISO();

    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(t);
    }, []);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nowLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const [privateMode, setPrivateMode] = useState(true);          // varsayılan AÇIK
    const [view, setView] = useState<'list' | 'flow'>('list');
    const [listFilter, setListFilter] = useState<ListFilterKey>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [modal, setModal] = useState<ModalName>(null);
    const [composer, setComposer] = useState<ComposerSeed | null>(null);
    const [aiOpen, setAiOpen] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    const activeStaff = useMemo(() => staff.filter((s) => s.isActive !== false), [staff]);
    const activeResources = useMemo(() => resources.filter((r) => r.isActive), [resources]);

    const activeList = useMemo(() => reservations.filter((r) => r.status !== 'cancelled'), [reservations]);
    // Sıralama YALNIZ saate göre. Finansal değer bu sıraya karışmaz.
    const todayList = useMemo(
        () => activeList.filter((r) => r.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [activeList, today],
    );

    // ── Operasyon durumu — tek kaynak (sessionPhase + appointmentFlow) ───────
    const stateOf = useMemo(() => (r: Reservation): FlowState => {
        const ph = phaseOf(r);
        if (ph === 'active') return 'Muayenede';
        if (ph === 'arrived') return 'Klinikte';
        if (ph === 'done') return 'Çıkışta';
        if (ph === 'completed') return 'Tamamlandı';
        const ap = apptPhase(r, { now, toleranceMin: settings.arrivalToleranceMin });
        if (ap === 'missed') return 'Gelmedi';
        if (r.status === 'pending') return 'Teyit bekliyor';
        if (clockMin(r.startTime) - nowMin <= NEXT_WINDOW) return 'Yaklaşıyor';
        return 'Bekleniyor';
    }, [now, nowMin, settings.arrivalToleranceMin]);

    const groupOf = (r: Reservation): Group => {
        const ph = phaseOf(r);
        if (ph === 'arrived' || ph === 'active' || ph === 'done') return 'now';
        const start = clockMin(r.startTime);
        if (start <= nowMin && clockMin(r.endTime) > nowMin) return 'now';
        if (start > nowMin && start - nowMin <= NEXT_WINDOW) return 'next';
        return 'later';
    };

    // ── Klinik Nabzı — her sayı gerçek zaman damgasından ─────────────────────
    const inReception = todayList.filter((r) => phaseOf(r) === 'arrived');
    const awaitingConfirm = todayList.filter((r) => r.status === 'pending');
    const inExam = todayList.filter((r) => phaseOf(r) === 'active');
    const atCheckout = todayList.filter((r) => phaseOf(r) === 'done');
    const longestWait = inReception.reduce((max, r) => {
        const mins = r.customerArrivedAt ? minsSince(r.customerArrivedAt, now) : 0;
        return mins > max ? mins : max;
    }, 0);
    const doctorsOnDuty = new Set(todayList.map((r) => r.staffId).filter(Boolean)).size;
    const roomsInUse = new Set(todayList
        .filter((r) => ['arrived', 'active'].includes(phaseOf(r)))
        .map((r) => r.resourceId).filter(Boolean)).size;

    // ── Randevu Kontrol Merkezi ─────────────────────────────────────────────
    const filtered = useMemo(() => todayList.filter((r) => {
        if (listFilter === 'clinic') return ['arrived', 'active', 'done'].includes(phaseOf(r));
        if (listFilter === 'upcoming') return phaseOf(r) === 'wait';
        return true;
    }), [todayList, listFilter]);

    const clinicCount = todayList.filter((r) => ['arrived', 'active', 'done'].includes(phaseOf(r))).length;
    const upcomingCount = todayList.filter((r) => phaseOf(r) === 'wait').length;

    const selected = useMemo(
        () => todayList.find((r) => r.id === selectedId)
            || todayList.find((r) => phaseOf(r) === 'active')
            || todayList.find((r) => phaseOf(r) === 'arrived')
            || todayList.find((r) => clockMin(r.endTime) >= nowMin)
            || todayList[0] || null,
        [todayList, selectedId, nowMin],
    );
    const selCustomer = selected?.customerId ? customerById.get(selected.customerId) : undefined;

    /** Randevu hazırlığı — yalnız gerçekten okunabilen adımlar.
     *  `missing` ayrı tutulur: eksik adım "Oda atandı" diye değil "Oda atanmadı"
     *  diye okunmalı. */
    const readinessOf = (r: Reservation) => {
        const c = r.customerId ? customerById.get(r.customerId) : undefined;
        const items = [
            { label: 'Randevu teyidi', missing: 'Teyit bekliyor', done: r.status !== 'pending' },
            { label: 'Hasta kaydı eşleşti', missing: 'Hasta kaydı eşleşmedi', done: Boolean(c) },
            { label: 'İletişim numarası', missing: 'Telefon numarası eksik', done: hasWa(r.customerPhone) },
            { label: 'Hekim atandı', missing: 'Hekim atanmadı', done: Boolean(r.staffId) },
        ];
        if (activeResources.length > 0) {
            items.push({ label: 'Oda atandı', missing: 'Oda atanmadı', done: Boolean(r.resourceId) });
        }
        return items;
    };

    /** Randevu süresi — gece yarısını aşan kayıtta negatife düşmez. */
    const durationOf = (r: Reservation) => {
        const d = clockMin(r.endTime) - clockMin(r.startTime);
        return d > 0 ? d : d + 24 * 60;
    };

    /** Tek birincil sonraki eylem — appointmentFlow/sessionPhase ile aynı akış. */
    const nextAction = (r: Reservation): { label: string; run: () => void } | null => {
        const ph = phaseOf(r);
        const short = maskName(r.customerName, privateMode);
        if (ph === 'wait') {
            return { label: 'Hasta geldi', run: () => step(r, advancePatch('arrived'), `${short} kabul edildi`) };
        }
        if (ph === 'arrived') {
            return { label: 'Muayeneye al', run: () => step(r, advancePatch('active'), `${short} · muayene başladı`) };
        }
        if (ph === 'active') {
            return { label: 'Ziyareti kapat', run: () => step(r, advancePatch('completed'), `${short} · ziyaret kapatıldı`) };
        }
        if (ph === 'done') {
            // Klinik kapanış tamam; kalan yalnız FİNANSAL kapanış — ayrı yüzey.
            // Kasa modülü kapalıysa finansal kapanış TimeFlow dışında takip
            // ediliyordur; kayıt açıkta kalmasın diye burada kapatılır.
            if (!cashOn) return {
                label: 'Kaydı kapat',
                run: () => step(r, { isPaid: true }, `${short} kaydı kapatıldı`),
            };
            return { label: 'Kasaya gönder', run: () => navigate('/kasa') };
        }
        return null;
    };

    const step = async (r: Reservation, patch: Partial<Reservation>, msg: string) => {
        if (busyId) return;
        setBusyId(r.id);
        const ok = await updateReservation(r.id, patch);
        setBusyId(null);
        if (ok) { setSelectedId(r.id); toast.success(msg); }
    };

    // ── Takip Defteri — gerçek veriden türeyen idari temaslar ────────────────
    const futureByCustomer = useMemo(() => {
        const s = new Set<string>();
        for (const r of activeList) {
            if (r.date > today || (r.date === today && clockMin(r.startTime) > nowMin)) s.add(r.customerId);
        }
        return s;
    }, [activeList, today, nowMin]);

    type Followup = {
        key: string; customer?: Customer; name: string; reason: string; tone: string;
        last: string; owner: string; due: string; action: string; run: () => void;
    };

    const followups = useMemo<Followup[]>(() => {
        const out: Followup[] = [];

        // 1) Kontrol zamanı gelmiş hastalar (hekim kararı recallDate'te kayıtlı)
        for (const c of allCustomers) {
            if (!c.recallDate || c.recallDate > today || futureByCustomer.has(c.id)) continue;
            out.push({
                key: `recall-${c.id}`, customer: c, name: c.name, tone: 'blue',
                reason: 'Kontrol zamanı geldi',
                last: c.lastVisit ? `Son ziyaret ${formatDateEU(c.lastVisit)}` : 'Ziyaret kaydı yok',
                owner: 'Danışma', due: formatDateEU(c.recallDate),
                action: 'Randevu öner',
                run: () => setComposer({ customerId: c.id, visitType: 'Kontrol' }),
            });
        }

        // 2) Gelmeyen hasta — türetilmiş 'missed' (DB'ye yazılmaz)
        const missedFrom = toISODate(new Date(now.getTime() - 2 * 86_400_000));
        for (const r of activeList) {
            if (r.date < missedFrom || r.date > today) continue;
            if (apptPhase(r, { now, toleranceMin: settings.arrivalToleranceMin }) !== 'missed') continue;
            out.push({
                key: `missed-${r.id}`, customer: customerById.get(r.customerId), name: r.customerName, tone: 'amber',
                reason: 'Gelmeyen hasta yeniden aranacak',
                last: `${formatDateEU(r.date)} ${r.startTime} randevusuna gelmedi`,
                owner: r.staffName || 'Danışma', due: 'Bugün',
                action: 'İletişimi aç',
                run: () => {
                    const link = normalizePhone(r.customerPhone);
                    if (link) window.open(`https://wa.me/${link}`, '_blank', 'noopener,noreferrer');
                    else toast.error('Hastanın telefon numarası kayıtlı değil');
                },
            });
        }

        // 3) Ziyaret kapandı ama kontrol tarihi belirlenmedi
        const since = toISODate(new Date(now.getTime() - 30 * 86_400_000));
        const seen = new Set<string>();
        for (const r of [...activeList].reverse()) {
            if (r.date < since || r.date > today || r.status !== 'completed') continue;
            if (seen.has(r.customerId) || futureByCustomer.has(r.customerId)) continue;
            const c = customerById.get(r.customerId);
            if (!c || c.recallDate) continue;
            seen.add(r.customerId);
            out.push({
                key: `plan-${r.customerId}`, customer: c, name: r.customerName, tone: 'teal',
                reason: 'Kontrol tarihi belirlenmedi',
                last: `Ziyaret ${formatDateEU(r.date)} tarihinde kapandı`,
                owner: r.staffName || 'Hekim', due: 'Bu hafta',
                action: 'Hasta dosyası',
                run: () => navigate(`/customers?open=${r.customerId}`),
            });
        }

        return out.slice(0, 8);
    }, [allCustomers, activeList, customerById, futureByCustomer, today, now, settings.arrivalToleranceMin, navigate]);

    // ── Akış Kaçakları — üç bağımsız iş kuyruğu ─────────────────────────────
    // Bunlar birbirinden bağımsızdır; tahsilat tutarı hasta sırasını etkilemez.
    const openGaps = useMemo(() => {
        const avg = settings.services?.length
            ? Math.round(settings.services.reduce((s, x) => s + x.duration, 0) / settings.services.length)
            : 30;
        if (!isReady || avg <= 0) return [];
        return findSlots({ date: today, durationMin: avg, notBefore: nowLabel, stepMin: settings.slotDuration || 15, limit: 6 });
    }, [findSlots, isReady, today, nowLabel, settings.services, settings.slotDuration]);

    const dueRecalls = followups.filter((f) => f.key.startsWith('recall-'));

    const openBilling = useMemo(() => {
        const rows = activeList.filter((r) => r.date === today && r.status === 'completed' && !r.isPaid);
        return { count: rows.length, total: rows.reduce((s, r) => s + reservationPrice(r, settings.services || []), 0) };
    }, [activeList, today, settings.services]);

    // ── Timeflow AI — yalnız idari/operasyonel veri ─────────────────────────
    // Girdi: boş kapasite + kayıtlı kontrol kararı (recallDate). Çıktı: aday
    // eşleşme ve kullanıcı onayına sunulan taslak. Sıralama recallDate'e göredir;
    // hasta değeri veya tahsilat AI sırasına KARIŞMAZ.
    const aiCandidates = useMemo(() => dueRecalls
        .map((f) => f.customer).filter((c): c is Customer => Boolean(c))
        .sort((a, b) => (a.recallDate || '').localeCompare(b.recallDate || ''))
        .slice(0, 5), [dueRecalls]);
    const aiGap = openGaps[0];
    const aiActive = Boolean(aiGap && aiCandidates.length > 0);

    // ── Bildirimler — türetilmiş, sahte sayaç yok ───────────────────────────
    const notifications = [
        awaitingConfirm.length > 0 && { tone: 'amber', title: `${awaitingConfirm.length} randevu teyit bekliyor`, detail: 'Bugünün programı' },
        inReception.length > 0 && { tone: 'blue', title: `${inReception.length} hasta kabulde bekliyor`, detail: longestWait > 0 ? `En uzun bekleme ${longestWait} dk` : 'Şimdi' },
        dueRecalls.length > 0 && { tone: 'blue', title: `${dueRecalls.length} kontrol zamanı geldi`, detail: 'Takip Defteri' },
        openBilling.count > 0 && { tone: 'red', title: `${openBilling.count} açık tahsilat`, detail: 'Klinik kapanıştan ayrıdır' },
    ].filter(Boolean) as { tone: string; title: string; detail: string }[];

    // ⌘K → hasta ara
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setModal('search'); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const groups: [Group, string][] = [['now', 'Şimdi'], ['next', `Sıradaki ${NEXT_WINDOW} dakika`], ['later', 'Günün kalanı']];

    return (
        <div className={cn('dash-theme hc-ops flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--dc-page)]', dark && 'dark')}>
            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="dashboard">

                    {/* ── Kompakt üst alan ───────────────────────────────────── */}
                    <div className="command-bar">
                        <button type="button" className="global-search" onClick={() => setModal('search')}>
                            <Search size={18} />
                            <span>Hasta adı veya telefon ara</span>
                            <kbd>⌘ K</kbd>
                        </button>
                        <button type="button" className="button primary" onClick={() => setComposer({})}>
                            <Plus size={18} />Randevu oluştur
                        </button>
                        <button type="button" className="privacy-switch" role="switch" aria-checked={privateMode}
                            onClick={() => setPrivateMode((v) => !v)}>
                            <LockKeyhole size={16} />
                            <span>Mahremiyet {privateMode ? 'açık' : 'kapalı'}</span>
                            <i aria-hidden="true" />
                        </button>
                        <button type="button" className="icon-button notification-button"
                            aria-label={`Bildirimler${notifications.length ? `, ${notifications.length} başlık` : ''}`}
                            onClick={() => setModal('notifications')}>
                            <Bell size={20} />
                            {notifications.length > 0 && <em>{notifications.length}</em>}
                        </button>
                    </div>

                    {/* ── Klinik Nabzı ───────────────────────────────────────── */}
                    <section className="clinic-pulse panel">
                        <div className="pulse-title">
                            <span className="eyebrow">
                                {formatDateEU(today)} · {nowLabel} · CANLI KLİNİK NABZI
                            </span>
                            <h1>
                                {todayList.length === 0 ? 'Bugün için planlanmış randevu yok.' : 'Akış dengeli;'}
                                {todayList.length > 0 && (
                                    <em> {awaitingConfirm.length > 0 ? `${awaitingConfirm.length} teyit bekliyor.`
                                        : inReception.length > 0 ? `${inReception.length} hasta kabulde.`
                                            : 'bekleyen hazırlık yok.'}</em>
                                )}
                            </h1>
                            <div className="pulse-trust">
                                <span><i className="dot green" />bugün {todayList.length} randevu</span>
                                <span>{doctorsOnDuty} / {activeStaff.length || '—'} hekim görevde</span>
                                {activeResources.length > 0 && <span>{roomsInUse} / {activeResources.length} oda kullanımda</span>}
                            </div>
                        </div>

                        <div className="pulse-stages" aria-label="Kliniğin anlık durumu">
                            <article>
                                <span className="pulse-stage-icon blue"><UserPlus size={17} /></span>
                                <span><small>Kabulde</small><strong>{inReception.length} hasta</strong></span>
                            </article>
                            <article>
                                <span className="pulse-stage-icon amber"><ClipboardList size={17} /></span>
                                <span><small>Teyit bekliyor</small><strong>{awaitingConfirm.length} randevu</strong></span>
                            </article>
                            <article>
                                <span className="pulse-stage-icon teal"><Stethoscope size={17} /></span>
                                <span><small>Muayenede</small><strong>{inExam.length} hasta</strong></span>
                            </article>
                            <article>
                                <span className="pulse-stage-icon green"><DoorOpen size={17} /></span>
                                <span><small>Çıkışta</small><strong>{atCheckout.length} hasta</strong></span>
                            </article>
                            <article className="wait-stage">
                                <span className="pulse-stage-icon orange"><TimerReset size={17} /></span>
                                <span>
                                    <small>En uzun bekleme</small>
                                    <strong>{inReception.length === 0 ? 'Bekleyen yok' : `${longestWait} dakika`}</strong>
                                </span>
                            </article>
                        </div>

                        <div className="pulse-actions">
                            <button className="button secondary" type="button" onClick={() => navigate('/calendar')}>
                                <CalendarDays size={18} />Takvimi aç
                            </button>
                            <button className="button primary" type="button" onClick={() => setModal('walkin')}>
                                <UserPlus size={18} />Hasta kabulü
                            </button>
                        </div>
                    </section>

                    {/* ── Timeflow AI · yalnız operasyonel öneri ─────────────── */}
                    {aiActive && (aiOpen ? (
                        <section className="ai-command-strip" aria-label="Timeflow AI operasyon önerisi">
                            <div className="ai-command-brand">
                                <span><WandSparkles size={18} /></span>
                                <div><small>TIMEFLOW AI</small><strong>Boşluğu değerlendir</strong></div>
                            </div>
                            <div className="ai-command-copy">
                                <strong>
                                    {aiGap!.startTime}’deki boşluk, kontrol kararı kayıtlı {aiCandidates.length} hastayla eşleşiyor.
                                </strong>
                                <span>Dayanak: hekim/oda müsaitliği · hizmet süresi · daha önce kaydedilmiş kontrol tarihi</span>
                            </div>
                            <div className="ai-command-actions">
                                <button type="button" className="button primary compact" onClick={() => setModal('aiMatches')}>
                                    Eşleşmeleri gör <ArrowRight size={15} />
                                </button>
                                <button type="button" onClick={() => setAiOpen(false)}>Şimdilik geç</button>
                            </div>
                            <p><ShieldCheck size={14} /> Tıbbi öncelik veya triyaj üretmez; randevu yalnız onayınızla oluşur.</p>
                        </section>
                    ) : (
                        <button type="button" className="ai-command-collapsed" onClick={() => setAiOpen(true)}>
                            <WandSparkles size={16} />
                            Timeflow AI · 1 kapasite fırsatı
                            <ChevronRight size={16} />
                        </button>
                    ))}

                    {/* ── Randevu Kontrol Merkezi ────────────────────────────── */}
                    <section className="appointment-hub panel">
                        <div className="appointment-hub-head">
                            <div>
                                <span className="eyebrow">RANDEVU KONTROL MERKEZİ</span>
                                <h2>Bugünün randevuları</h2>
                                <p>Listeyi tarayın; seçili randevunun operasyon ayrıntısı sağda açılır.</p>
                            </div>
                            <div className="appointment-head-tools">
                                <div className="view-switch" role="group" aria-label="Randevu görünümü">
                                    <button type="button" aria-pressed={view === 'list'}
                                        className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
                                        <ListFilter size={15} /> Akıllı liste
                                    </button>
                                    <button type="button" aria-pressed={view === 'flow'}
                                        className={view === 'flow' ? 'active' : ''} onClick={() => setView('flow')}>
                                        <Activity size={15} /> Hekim akışı
                                    </button>
                                </div>
                                <span className="live-time"><i /> Şimdi {nowLabel}</span>
                            </div>
                        </div>

                        <div className="appointment-workbench">
                            <div className="appointment-master">
                                <div className="appointment-master-tools">
                                    <div className="segmented" role="group" aria-label="Randevu filtresi">
                                        {([['all', 'Tümü', todayList.length], ['clinic', 'Klinikte', clinicCount], ['upcoming', 'Yaklaşan', upcomingCount]] as const).map(([key, label, count]) => (
                                            <button type="button" key={key} aria-pressed={listFilter === key}
                                                className={listFilter === key ? 'active' : ''}
                                                onClick={() => setListFilter(key as ListFilterKey)}>
                                                {label} <em>{count}</em>
                                            </button>
                                        ))}
                                    </div>
                                    <span className="live-time" style={{ fontSize: 10.5 }}>Saate göre sıralı</span>
                                </div>

                                {view === 'list' ? (
                                    <>
                                        <div className="appointment-list-columns" role="row">
                                            <span role="columnheader">Saat</span>
                                            <span role="columnheader">Hasta ve ziyaret</span>
                                            <span role="columnheader">Hekim ve oda</span>
                                            <span role="columnheader">Canlı durum</span>
                                            <span />
                                        </div>
                                        <div className="appointment-scroll">
                                            {filtered.length === 0 ? (
                                                <div className="appointment-empty">
                                                    <CalendarDays size={22} />
                                                    <strong>{todayList.length === 0 ? 'Bugün randevu yok' : 'Bu filtrede randevu yok'}</strong>
                                                    <p>
                                                        {todayList.length === 0
                                                            ? 'Randevu oluşturduğunuzda bugünün akışı burada görünür.'
                                                            : 'Filtreyi değiştirin veya tümünü görüntüleyin.'}
                                                    </p>
                                                </div>
                                            ) : groups.map(([group, label]) => {
                                                const rows = filtered.filter((r) => groupOf(r) === group);
                                                if (rows.length === 0) return null;
                                                return (
                                                    <div key={group}>
                                                        <div className={cn('appointment-group-label', group === 'now' && 'current')}>
                                                            <span>{label}</span>
                                                            <em>{rows.length}</em>
                                                            {group === 'now' && <small>CANLI AKIŞ</small>}
                                                        </div>
                                                        {rows.map((r) => {
                                                            const st = stateOf(r);
                                                            const Icon = STATE_META[st].icon;
                                                            const ready = readinessOf(r);
                                                            const done = ready.filter((x) => x.done).length;
                                                            const missing = ready.find((x) => !x.done);
                                                            const visit = text(r.customFields?.[CF_VISIT_TYPE]) || r.service;
                                                            const timer = phaseOf(r) === 'arrived' && r.customerArrivedAt
                                                                ? `bekliyor ${minsSince(r.customerArrivedAt, now)} dk`
                                                                : phaseOf(r) === 'active' && r.arrivedAt
                                                                    ? `muayenede ${minsSince(r.arrivedAt, now)} dk`
                                                                    : st;
                                                            return (
                                                                <button type="button" key={r.id}
                                                                    className={cn('appointment-row-v2', selected?.id === r.id && 'selected')}
                                                                    aria-pressed={selected?.id === r.id}
                                                                    onClick={() => setSelectedId(r.id)}>
                                                                    <span className="appointment-time-v2">
                                                                        <strong>{r.startTime}</strong>
                                                                        <small>{durationOf(r)} dk</small>
                                                                    </span>
                                                                    <span className="appointment-person-v2">
                                                                        <span className="avatar">{initialsOf(r.customerName)}</span>
                                                                        <span>
                                                                            <strong>{maskName(r.customerName, privateMode)}</strong>
                                                                            <small>
                                                                                {visit}<i>·</i>
                                                                                {r.status === 'pending' ? 'Teyit bekliyor' : 'Onaylandı'}
                                                                            </small>
                                                                        </span>
                                                                    </span>
                                                                    <span className="appointment-resource-v2">
                                                                        <strong>{r.staffName || 'Hekim atanmadı'}</strong>
                                                                        <small>{r.resourceName || (activeResources.length ? 'Oda atanmadı' : '—')}</small>
                                                                    </span>
                                                                    <span className="appointment-state-v2">
                                                                        <span className={cn('state-label', STATE_META[st].tone)}>
                                                                            <Icon size={13} /> {timer}
                                                                        </span>
                                                                        <small className={missing ? 'has-missing' : ''}>
                                                                            {done}/{ready.length} hazır{missing ? ` · ${missing.missing}` : ''}
                                                                        </small>
                                                                    </span>
                                                                    <span className="appointment-open-v2">
                                                                        İncele <ChevronRight size={15} />
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                ) : (
                                    <div className="doctor-flow">
                                        {/* Aynı gerçek veri, hekim bazlı gruplanmış görünüm — paralel model değil. */}
                                        {activeStaff.length === 0 ? (
                                            <div className="appointment-empty">
                                                <Stethoscope size={22} />
                                                <strong>Hekim tanımlı değil</strong>
                                                <p>Ekip sayfasından hekimleri ekleyin; akış burada gruplanır.</p>
                                            </div>
                                        ) : (
                                            <>
                                                {activeStaff.map((s) => {
                                                    const rows = filtered.filter((r) => r.staffId === s.id);
                                                    return (
                                                        <div className="doctor-flow-row" key={s.id}>
                                                            <div className="doctor-flow-person">
                                                                <span className="avatar blue">{initialsOf(s.name)}</span>
                                                                <span>
                                                                    <strong>{s.name}</strong>
                                                                    <small>{rows.length} randevu</small>
                                                                </span>
                                                            </div>
                                                            <div className="doctor-flow-slots">
                                                                {rows.length === 0 && <p className="doctor-flow-empty">Bu filtrede randevu yok.</p>}
                                                                {rows.map((r) => {
                                                                    const st = stateOf(r);
                                                                    return (
                                                                        <button type="button" key={r.id}
                                                                            className={cn('doctor-flow-card', selected?.id === r.id && 'selected')}
                                                                            aria-pressed={selected?.id === r.id}
                                                                            onClick={() => setSelectedId(r.id)}>
                                                                            <time>{r.startTime}</time>
                                                                            <strong>{maskName(r.customerName, privateMode)}</strong>
                                                                            <small>{text(r.customFields?.[CF_VISIT_TYPE]) || r.service}</small>
                                                                            <span className={cn('state-label', STATE_META[st].tone)} style={{ marginTop: 6 }}>{st}</span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {filtered.some((r) => !r.staffId) && (
                                                    <div className="doctor-flow-row">
                                                        <div className="doctor-flow-person">
                                                            <span className="avatar">—</span>
                                                            <span><strong>Hekim atanmadı</strong><small>{filtered.filter((r) => !r.staffId).length} randevu</small></span>
                                                        </div>
                                                        <div className="doctor-flow-slots">
                                                            {filtered.filter((r) => !r.staffId).map((r) => (
                                                                <button type="button" key={r.id}
                                                                    className={cn('doctor-flow-card', selected?.id === r.id && 'selected')}
                                                                    onClick={() => setSelectedId(r.id)}>
                                                                    <time>{r.startTime}</time>
                                                                    <strong>{maskName(r.customerName, privateMode)}</strong>
                                                                    <small>{text(r.customFields?.[CF_VISIT_TYPE]) || r.service}</small>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="doctor-flow-legend">
                                                    <span><i className="dot blue" /> Muayenede</span>
                                                    <span><i className="dot teal" /> Klinikte</span>
                                                    <span><i className="dot amber" /> Teyit bekliyor</span>
                                                    <span><i className="dot green" /> Çıkışta</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ── Randevu Merceği ───────────────────────────── */}
                            <aside className="appointment-lens" aria-label="Randevu merceği">
                                {selected ? (() => {
                                    const st = stateOf(selected);
                                    const ready = readinessOf(selected);
                                    const doneCount = ready.filter((x) => x.done).length;
                                    const action = nextAction(selected);
                                    const visit = text(selected.customFields?.[CF_VISIT_TYPE]) || selected.service;
                                    return (
                                        <>
                                            <div className="lens-head">
                                                <div>
                                                    <span className="eyebrow">RANDEVU MERCEĞİ</span>
                                                    <strong>{selected.startTime} · {durationOf(selected)} dk</strong>
                                                </div>
                                                <span className={cn('state-label', STATE_META[st].tone)}>{st}</span>
                                            </div>

                                            <div className="lens-patient">
                                                <span className="avatar blue">{initialsOf(selected.customerName)}</span>
                                                <span>
                                                    <strong>{maskName(selected.customerName, privateMode)}</strong>
                                                    <small>{maskPhone(selected.customerPhone, privateMode)}</small>
                                                </span>
                                                <button type="button" onClick={() => setModal('patient')}>
                                                    Dosya <ChevronRight size={14} />
                                                </button>
                                            </div>

                                            <div className="lens-identity">
                                                <article>
                                                    <span>Ziyaret</span>
                                                    <strong>{visit}</strong>
                                                    <small>{selected.status === 'pending' ? 'Teyit bekliyor' : 'Onaylandı'}</small>
                                                </article>
                                                <article>
                                                    <span>Hekim ve oda</span>
                                                    <strong>{selected.staffName || 'Hekim atanmadı'}</strong>
                                                    <small>{selected.resourceName || (activeResources.length ? 'Oda atanmadı' : 'Oda kullanılmıyor')}</small>
                                                </article>
                                            </div>

                                            <section className="lens-readiness">
                                                <div className="lens-section-title">
                                                    <div>
                                                        <span>Randevu kontrolü</span>
                                                        <strong>{doneCount}/{ready.length} hazır</strong>
                                                    </div>
                                                    <span className="readiness-ring"
                                                        style={{ '--ready': `${(doneCount / ready.length) * 100}%` } as CSSProperties}>
                                                        {doneCount}
                                                    </span>
                                                </div>
                                                <div className="lens-checks">
                                                    {[...ready].sort((a, b) => Number(a.done) - Number(b.done)).map((item) => (
                                                        <span key={item.label} className={item.done ? 'done' : 'missing'}>
                                                            {item.done ? <Check size={13} /> : <AlertCircle size={13} />}
                                                            {item.done ? item.label : item.missing}
                                                        </span>
                                                    ))}
                                                </div>
                                                {hasClinicalFlag(selCustomer) && (
                                                    <div className="lens-clinical-note">
                                                        <ShieldCheck size={15} />
                                                        <span>
                                                            <strong>Klinik uyarı var</strong>
                                                            Ayrıntı yalnız yetkili hasta dosyasında görüntülenir.
                                                        </span>
                                                    </div>
                                                )}
                                            </section>

                                            <section className="lens-continuity">
                                                <div className="lens-section-title">
                                                    <div>
                                                        <span>Hasta sürekliliği</span>
                                                        <strong>Sıradaki idari adım</strong>
                                                    </div>
                                                    <History size={17} />
                                                </div>
                                                <dl>
                                                    <div>
                                                        <dt>Son ziyaret</dt>
                                                        <dd>{selCustomer?.lastVisit ? formatDateEU(selCustomer.lastVisit) : 'İlk başvuru'}</dd>
                                                    </div>
                                                    <div>
                                                        <dt>Toplam ziyaret</dt>
                                                        <dd>{selCustomer?.totalReservations ?? 0}</dd>
                                                    </div>
                                                    <div>
                                                        <dt>Kontrol</dt>
                                                        <dd>{selCustomer?.recallDate ? formatDateEU(selCustomer.recallDate) : 'Belirlenmedi'}</dd>
                                                    </div>
                                                    <div>
                                                        <dt>Finansal durum</dt>
                                                        <dd>{selected.isPaid ? 'Tahsil edildi' : 'Açık'}</dd>
                                                    </div>
                                                </dl>
                                                <p>
                                                    Klinik kapanış ile finansal kapanış ayrı izlenir; tahsilat durumu hasta sırasını değiştirmez.
                                                </p>
                                            </section>

                                            <section className="lens-ai">
                                                <span className="lens-ai-icon"><WandSparkles size={16} /></span>
                                                <div>
                                                    <span>Timeflow AI · operasyon önerisi</span>
                                                    <strong>
                                                        {selected.status === 'pending' ? 'Teyit yanıtı alınmamış; hatırlatma gönderilebilir.'
                                                            : !selected.staffId ? 'Hekim atanmamış; kaynak ataması bekliyor.'
                                                                : phaseOf(selected) === 'arrived' ? 'Hasta klinikte; muayeneye alınabilir.'
                                                                    : 'Hekim, oda ve süre çakışması görünmüyor.'}
                                                    </strong>
                                                    <small>Yalnız operasyon verisine dayanır; tıbbi karar üretmez.</small>
                                                </div>
                                                <button type="button" onClick={() => toast.info(
                                                    'Dayanak: randevu teyit durumu, hekim/oda ataması ve canlı operasyon aşaması. Klinik değerlendirme içermez.',
                                                )}>Neden?</button>
                                            </section>

                                            <div className="lens-actions">
                                                {action ? (
                                                    <button className="button primary full" type="button"
                                                        disabled={busyId === selected.id} onClick={action.run}>
                                                        {action.label} <ArrowRight size={16} />
                                                    </button>
                                                ) : (
                                                    <button className="button secondary full" type="button"
                                                        onClick={() => navigate('/reservations')}>
                                                        Ziyaret kapandı · kayıtlara git
                                                    </button>
                                                )}
                                                <div>
                                                    <button className="button secondary compact" type="button"
                                                        onClick={() => navigate(`/calendar?new=1&customer=${selected.customerId}`)}>
                                                        Düzenle
                                                    </button>
                                                    <button className="button secondary compact" type="button" onClick={() => {
                                                        const link = normalizePhone(selected.customerPhone);
                                                        if (link) window.open(`https://wa.me/${link}`, '_blank', 'noopener,noreferrer');
                                                        else toast.error('Telefon numarası kayıtlı değil');
                                                    }}>
                                                        Mesaj
                                                    </button>
                                                    <button className="button secondary compact" type="button"
                                                        onClick={() => setComposer({ customerId: selected.customerId, visitType: 'Kontrol' })}>
                                                        Kontrol
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    );
                                })() : (
                                    <div className="lens-empty">
                                        <Stethoscope size={22} />
                                        <strong>Seçili randevu yok</strong>
                                        <p>Listeden bir randevu seçin; operasyon ayrıntısı burada açılır.</p>
                                    </div>
                                )}
                            </aside>
                        </div>

                        <div className="appointment-hub-foot">
                            <span><ShieldCheck size={15} /> Ortak ekranda klinik ayrıntılar maskeli; görünürlük rol bazlıdır.</span>
                            <button type="button" onClick={() => navigate('/calendar')}>
                                Tüm takvimi aç <ArrowRight size={15} />
                            </button>
                        </div>
                    </section>

                    {/* ── Takip Defteri ──────────────────────────────────────── */}
                    <section className="followup-book panel">
                        <div className="section-head">
                            <div>
                                <span className="eyebrow">HASTA SÜREKLİLİĞİ</span>
                                <h2>Takip Defteri</h2>
                                <p>Ziyaret bittikten sonra unutulmaması gereken tek sonraki temas.</p>
                            </div>
                            <div className="followup-head-actions">
                                {followups.length > 0 && <span className="count-badge">{followups.length} açık</span>}
                                <button type="button" className="button secondary compact" onClick={() => navigate('/customers')}>
                                    Hastalar
                                </button>
                            </div>
                        </div>

                        {followups.length === 0 ? (
                            <div className="followup-empty">
                                <CheckCircle2 size={20} />
                                <strong>Bekleyen takip yok</strong>
                                <p>Kontrol zamanı gelen, gelmeyen veya kontrol tarihi belirlenmemiş hasta görünmüyor.</p>
                            </div>
                        ) : (
                            <>
                                <div className="followup-columns" aria-hidden="true">
                                    <span>Hasta</span><span>Takip nedeni</span><span>Son işlem</span>
                                    <span>Sorumlu</span><span>Son tarih</span><span>Eylem</span>
                                </div>
                                <div>
                                    {followups.map((f) => (
                                        <article className="followup-row" key={f.key}>
                                            <span className="followup-patient">
                                                <span className="avatar blue">{initialsOf(f.name)}</span>
                                                <strong>{maskName(f.name, privateMode)}</strong>
                                            </span>
                                            <span className="followup-reason">
                                                <i className={cn('dot', f.tone)} />
                                                <strong>{f.reason}</strong>
                                            </span>
                                            <span className="followup-last">{f.last}</span>
                                            <span className="followup-owner">{f.owner}</span>
                                            <time>{f.due}</time>
                                            <button type="button" onClick={f.run}>
                                                {f.action}<ArrowRight size={15} />
                                            </button>
                                        </article>
                                    ))}
                                </div>
                            </>
                        )}

                        <div className="privacy-note">
                            <LockKeyhole size={16} />
                            <span>
                                Ortak ekranda tanı, sonuç içeriği ve klinik notlar gösterilmez. Sonuç değerlendirmesi
                                takibi için kalıcı görev/sonuç tablosu henüz yok — sonraki fazda eklenecek.
                            </span>
                        </div>
                    </section>

                    {/* ── Akış Kaçakları ─────────────────────────────────────── */}
                    <section className="operations-strip panel">
                        <div className="operation-lead">
                            <span className="operation-icon"><TrendingUp size={18} /></span>
                            <div>
                                <span className="eyebrow">AKIŞ KAÇAKLARI</span>
                                <strong>Bugün korunabilir</strong>
                            </div>
                        </div>
                        <button type="button" onClick={() => { setAiOpen(true); setModal(aiActive ? 'aiMatches' : null); }}>
                            <Clock3 size={18} />
                            <span>
                                <strong>{openGaps.length} boş randevu saati</strong>
                                <small>{aiCandidates.length > 0 ? `${aiCandidates.length} kontrol kararı eşleşiyor` : 'Eşleşen kontrol kaydı yok'}</small>
                            </span>
                            <ArrowRight size={16} />
                        </button>
                        <button type="button" onClick={() => navigate('/customers')}>
                            <History size={18} />
                            <span>
                                <strong>{dueRecalls.length} kontrol planlanmadı</strong>
                                <small>Hekim kararı kayıtlı, randevu yok</small>
                            </span>
                            <ArrowRight size={16} />
                        </button>
                        {cashOn && <button type="button" onClick={() => navigate('/kasa')}>
                            <CircleDollarSign size={18} />
                            <span>
                                <strong>
                                    {openBilling.count} açık tahsilat{openBilling.total > 0 ? ` · ${money(openBilling.total)}` : ''}
                                </strong>
                                <small>Klinik kapanıştan ayrıdır</small>
                            </span>
                            <ArrowRight size={16} />
                        </button>}
                        <p><ShieldCheck size={15} /> Finans hasta sırasını ve AI aday sırasını değiştirmez.</p>
                    </section>
                </div>
            </div>

            {/* ── Randevu Kompozitörü ────────────────────────────────────────── */}
            {composer && (
                <AppointmentComposer seed={composer} privateMode={privateMode}
                    onClose={() => setComposer(null)}
                    onCreated={(id) => setSelectedId(id)} />
            )}

            {modal === 'walkin' && <WalkInModal privateMode={privateMode} onClose={() => setModal(null)} />}

            {modal === 'search' && (
                <HcModal eyebrow="GLOBAL ARAMA" title="Hasta ara" dark={dark} onClose={() => setModal(null)}>
                    <PatientSearch customers={allCustomers} privateMode={privateMode}
                        onPick={(c) => { setModal(null); navigate(`/customers?open=${c.id}`); }} />
                </HcModal>
            )}

            {modal === 'notifications' && (
                <HcModal eyebrow={notifications.length ? `${notifications.length} BAŞLIK` : 'GÜNCEL'}
                    title="Bildirimler" dark={dark} onClose={() => setModal(null)}>
                    {notifications.length === 0 ? (
                        <p className="modal-empty">Bekleyen bildirim yok.</p>
                    ) : (
                        <div className="notification-list">
                            {notifications.map((n) => (
                                <p key={n.title}>
                                    <span className={cn('dot', n.tone)} />
                                    <strong>{n.title}</strong>
                                    <small>{n.detail}</small>
                                </p>
                            ))}
                        </div>
                    )}
                </HcModal>
            )}

            {modal === 'aiMatches' && (
                <HcModal eyebrow="TIMEFLOW AI · ADAY EŞLEŞMELER" title="Boş kapasiteye uygun hastalar"
                    dark={dark} onClose={() => setModal(null)}>
                    <div className="clinical-boundary">
                        <ShieldCheck size={18} />
                        <span>
                            <strong>Sıralama yalnız kontrol tarihine göredir.</strong>
                            Tahsilat, paket veya hasta değeri bu sıraya karışmaz; randevu yalnız sizin onayınızla oluşur.
                        </span>
                    </div>
                    <div className="modal-list" style={{ marginTop: 12 }}>
                        {aiCandidates.length === 0 && <p className="modal-empty">Kayıtlı kontrol kararı olan hasta yok.</p>}
                        {aiCandidates.map((c) => (
                            <button type="button" key={c.id}
                                onClick={() => { setModal(null); setComposer({ customerId: c.id, visitType: 'Kontrol' as VisitType }); }}>
                                <span className="avatar blue">{initialsOf(c.name)}</span>
                                <span>
                                    <strong>{maskName(c.name, privateMode)}</strong>
                                    <small>Kontrol tarihi {c.recallDate ? formatDateEU(c.recallDate) : '—'}</small>
                                </span>
                                <em>Taslak aç</em>
                            </button>
                        ))}
                    </div>
                    <p className="modal-empty" style={{ textAlign: 'left', paddingBottom: 0 }}>
                        Taslak açılır; hekim, oda ve saat seçimini siz onaylarsınız.
                    </p>
                </HcModal>
            )}

            {modal === 'patient' && selected && (
                <HcModal eyebrow="HASTA SÜREKLİLİK ÖZETİ" title={maskName(selected.customerName, privateMode)}
                    dark={dark} onClose={() => setModal(null)}>
                    <div className="patient-modal">
                        <div className="patient-modal-head">
                            <span className="avatar blue">{initialsOf(selected.customerName)}</span>
                            <span>
                                <strong>{maskName(selected.customerName, privateMode)}</strong>
                                <small>{maskPhone(selected.customerPhone, privateMode)} · {selected.staffName || 'Hekim atanmadı'}</small>
                            </span>
                            {selected.customerId && customerById.has(selected.customerId) && (
                                <span className="identity-chip"><ShieldCheck size={14} /> Kayıt eşleşti</span>
                            )}
                        </div>
                        <div className="authorized-note">
                            <LockKeyhole size={18} />
                            <span>
                                <strong>Rol bazlı klinik görünüm</strong>
                                Tanı, sonuç içeriği ve klinik notlar yalnız yetkili hasta dosyasında açılır — bu ekranda gösterilmez.
                            </span>
                        </div>
                        <dl>
                            <div><dt>Son ziyaret</dt><dd>{selCustomer?.lastVisit ? formatDateEU(selCustomer.lastVisit) : 'İlk başvuru'}</dd></div>
                            <div><dt>Bugünkü ziyaret</dt><dd>{text(selected.customFields?.[CF_VISIT_TYPE]) || selected.service}</dd></div>
                            <div><dt>Toplam ziyaret</dt><dd>{selCustomer?.totalReservations ?? 0}</dd></div>
                            <div><dt>Kontrol planı</dt><dd>{selCustomer?.recallDate ? formatDateEU(selCustomer.recallDate) : 'Belirlenmedi'}</dd></div>
                        </dl>
                        {hasClinicalFlag(selCustomer) && (
                            <div className="clinical-warning">
                                <ShieldCheck size={18} />
                                <span>
                                    <strong>Klinik uyarı var</strong>
                                    Ayrıntı yetkili hasta dosyasında görüntülenir.
                                </span>
                            </div>
                        )}
                        <div className="modal-actions">
                            <button className="button secondary" type="button"
                                onClick={() => { setModal(null); setComposer({ customerId: selected.customerId, visitType: 'Kontrol' }); }}>
                                Kontrol randevusu
                            </button>
                            <button className="button primary" type="button"
                                onClick={() => navigate(`/customers?open=${selected.customerId}`)}>
                                Hasta dosyasını aç
                            </button>
                        </div>
                    </div>
                </HcModal>
            )}
        </div>
    );
}

// ── Parçalar ────────────────────────────────────────────────────────────────

function HcModal({ eyebrow, title, dark, children, onClose }: {
    eyebrow: string; title: string; dark: boolean; children: React.ReactNode; onClose: () => void;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div className={cn('dash-theme hc-ops-layer modal', dark && 'dark')} role="presentation" onMouseDown={onClose}>
            <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="hc-modal-title"
                onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <div>
                        <span className="eyebrow">{eyebrow}</span>
                        <h2 id="hc-modal-title">{title}</h2>
                    </div>
                    <button type="button" className="icon-button" autoFocus aria-label="Pencereyi kapat" onClick={onClose}>
                        <X size={19} />
                    </button>
                </div>
                {children}
            </section>
        </div>
    );
}

function PatientSearch({ customers, privateMode, onPick }: {
    customers: Customer[]; privateMode: boolean; onPick: (c: Customer) => void;
}) {
    const [q, setQ] = useState('');
    const results = useMemo(() => {
        const s = q.trim();
        if (!s) return [];
        const lower = s.toLocaleLowerCase('tr');
        const phone = normalizePhone(s);
        return customers.filter((c) => c.name.toLocaleLowerCase('tr').includes(lower)
            || (phone && normalizePhone(c.phone) === phone)).slice(0, 6);
    }, [q, customers]);
    return (
        <>
            <div className="input-shell">
                <Search size={18} />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="Ad veya telefon" aria-label="Hasta ara" />
                <kbd>ESC</kbd>
            </div>
            <div className="modal-list" style={{ marginTop: 12 }}>
                {q.trim() === '' && <p className="modal-empty">Aramak için yazmaya başlayın.</p>}
                {q.trim() !== '' && results.length === 0 && <p className="modal-empty">Sonuç bulunamadı.</p>}
                {results.map((c) => (
                    <button type="button" key={c.id} onClick={() => onPick(c)}>
                        <span className="avatar">{initialsOf(c.name)}</span>
                        <span>
                            <strong>{maskName(c.name, privateMode)}</strong>
                            <small>{c.lastVisit ? `Son ziyaret ${formatDateEU(c.lastVisit)}` : 'Ziyaret kaydı yok'}</small>
                        </span>
                        <ChevronRight size={16} />
                    </button>
                ))}
            </div>
        </>
    );
}
