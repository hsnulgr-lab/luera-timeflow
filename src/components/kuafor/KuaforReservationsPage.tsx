import { useEffect, useMemo, useState, type ElementType } from 'react';
import {
    AlertTriangle, ArrowRight, BadgeCheck, CalendarClock, Check, CheckCircle2, ChevronRight,
    ChevronDown, CircleDollarSign, Droplets, History, Hourglass, MessageCircle,
    Plus, Scissors, Search, Sparkles, TimerReset, Users, X, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useReservations } from '@/hooks/useReservations';
import { usePayments } from '@/hooks/usePayments';
import { useWaitlist } from '@/hooks/useWaitlist';
import { EditReservationModal } from '@/components/reservations/EditReservationModal';
import {
    KF_FORMULA_KEY as FORMULA_KEY,
    KF_STAGE_KEY,
    KF_TIMER_KEY,
    isKuaforColorService,
    kuaforLiveStageOf as liveStage,
    type KuaforLiveStage as LiveStage,
} from '@/lib/kuaforFlow';
import { todayISO, toISODate } from '@/utils/date';
import type { Reservation, WaitlistEntry } from '@/types';
import { dateLabel, initialsOf, moneyOf, KuaforSuiteFrame } from './KuaforSuiteFrame';

type TabKey = 'all' | 'pending' | 'confirmed' | 'salon' | 'missed' | 'completed' | 'cancelled' | 'waitlist';
/** Zaman kapsamı — durum sekmelerinden bağımsız ikinci eksen. */
type Scope = 'today' | 'week' | 'all';

const TAB_KEYS: TabKey[] = ['all', 'pending', 'confirmed', 'salon', 'missed', 'completed', 'cancelled', 'waitlist'];
type StageAction = {
    label: string;
    patch?: Partial<Reservation>;
    message?: string;
    navigateTo?: string;
    /** Kurtarma aksiyonu — birincil turuncu buton yerine sakin buton. */
    secondary?: boolean;
};

const STAGE_META: Record<LiveStage, { label: string; short: string; icon: ElementType }> = {
    pending: { label: 'Onay bekliyor', short: 'Onayla', icon: Hourglass },
    confirmed: { label: 'Planlandı', short: 'Geldi', icon: BadgeCheck },
    waiting: { label: 'Salonda bekliyor', short: 'Koltuğa al', icon: Users },
    service: { label: 'Uygulamada', short: 'İşlemi bitir', icon: Scissors },
    processing: { label: 'Boya süresi', short: 'Yıkama / fön', icon: TimerReset },
    finish: { label: 'Yıkama / fön', short: 'Kasaya gönder', icon: Droplets },
    checkout: { label: 'Kasaya hazır', short: 'Kasayı aç', icon: CircleDollarSign },
    missed: { label: 'Gelmedi', short: 'Geç geldi', icon: AlertTriangle },
    completed: { label: 'Tamamlandı', short: 'Tamamlandı', icon: CheckCircle2 },
    cancelled: { label: 'İptal', short: 'İptal', icon: XCircle },
};

function nextAction(reservation: Reservation, stage: LiveStage, serviceDuration?: number): StageAction | null {
    if (stage === 'pending') return { label: 'Onayla', patch: { status: 'confirmed' }, message: 'Randevu onaylandı' };
    // Saati geçmiş ama gelmemiş müşteri: tek çıkış yolu geç gelişi kaydetmek.
    // Birincil buton değil — turuncu aksiyon salonu yönlendirmeli, gecikmeyi değil.
    if (stage === 'missed') return { label: 'Geç geldi', patch: { customerArrivedAt: new Date().toISOString() }, message: 'Müşteri geç gelişi kaydedildi', secondary: true };
    if (stage === 'confirmed') return { label: 'Müşteri geldi', patch: { customerArrivedAt: new Date().toISOString() }, message: 'Müşteri salona alındı' };
    if (stage === 'waiting') return { label: 'Koltuğa al', patch: { arrivedAt: new Date().toISOString() }, message: 'İşlem başlatıldı' };
    if (stage === 'service') {
        if (isKuaforColorService(reservation.service)) {
            const processingMinutes = Math.max(10, Math.round((serviceDuration || 60) / 2));
            return {
                label: 'Boya süresine geçir',
                patch: {
                    customFields: {
                        ...(reservation.customFields || {}),
                        [KF_STAGE_KEY]: 'processing',
                        [KF_TIMER_KEY]: new Date(Date.now() + processingMinutes * 60_000).toISOString(),
                    },
                },
                message: `Boya sayacı ${processingMinutes} dakika olarak başlatıldı`,
            };
        }
        return {
            label: 'Yıkama / föne al',
            patch: {
                customFields: {
                    ...(reservation.customFields || {}),
                    [KF_STAGE_KEY]: 'finish',
                },
            },
            message: 'Müşteri yıkama ve fön aşamasına geçirildi',
        };
    }
    if (stage === 'processing') {
        const fields: Record<string, string | number | boolean> = {
            ...(reservation.customFields || {}),
            [KF_STAGE_KEY]: 'finish',
        };
        delete fields[KF_TIMER_KEY];
        return { label: 'Yıkama / fön', patch: { customFields: fields }, message: 'Müşteri yıkama ve fön aşamasına geçirildi' };
    }
    if (stage === 'finish') {
        const fields = { ...(reservation.customFields || {}) };
        delete fields[KF_STAGE_KEY];
        delete fields[KF_TIMER_KEY];
        // isPaid'e DOKUNULMAZ: peşin tahsil edilmiş bir randevuyu burada
        // "ödenmedi" yapmak parayı kayıp gösterir. phaseOf zaten
        // completed + ödenmedi'yi 'done' → kasa aşaması sayıyor.
        return {
            label: 'Kasaya gönder',
            patch: {
                serviceEndedAt: new Date().toISOString(),
                status: 'completed',
                customFields: fields,
            },
            message: 'Müşteri kasaya gönderildi',
        };
    }
    if (stage === 'checkout') return { label: 'Kasayı aç', navigateTo: '/kasa' };
    return null;
}

export function KuaforReservationsPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { reservations, settings, updateReservation } = useReservations();
    const { payments } = usePayments();
    const { entries: waitlist, addEntry, removeEntry } = useWaitlist();

    // Aktif sekmenin tek kaynağı URL: dashboard'dan gelen ?tab=waitlist bağlantısı
    // sayfa zaten açıkken de çalışır ve sekmeler paylaşılabilir olur. Ayrı bir
    // state tutup efektle senkronlamak kademeli render üretiyordu.
    const tabParam = searchParams.get('tab');
    const tab: TabKey = TAB_KEYS.includes(tabParam as TabKey) ? (tabParam as TabKey) : 'all';
    const [scope, setScope] = useState<Scope>('today');
    const [showPast, setShowPast] = useState(false);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<Reservation | null>(null);
    const [editReservation, setEditReservation] = useState<Reservation | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [waitlistOpen, setWaitlistOpen] = useState(false);
    const [waitDraft, setWaitDraft] = useState({ name: '', phone: '', serviceId: '', date: '', notes: '' });

    useEffect(() => {
        if (!waitlistOpen && !selected) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setWaitlistOpen(false);
            setSelected(null);
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [selected, waitlistOpen]);

    const today = todayISO();

    // 'Gelmedi' türetilmiş bir durumdur ve saat geçtikçe kendiliğinden görünmeli;
    // bunun için canlı bir saat gerekiyor (KuaforDashboard ile aynı desen).
    // Render gövdesinde Date.now() çağırmak saf olmayan sonuç üretir.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 20_000);
        return () => clearInterval(timer);
    }, []);
    const stageOptions = useMemo(
        () => ({ now, toleranceMin: settings.arrivalToleranceMin }),
        [now, settings.arrivalToleranceMin],
    );

    // Takvim haftası (Pzt–Paz) — takvim sayfasındaki hafta rayıyla aynı sınırlar.
    const weekBounds = useMemo(() => {
        const monday = new Date(`${today}T12:00:00`);
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return { start: toISODate(monday), end: toISODate(sunday) };
    }, [today]);

    const scoped = useMemo(() => reservations.filter((reservation) => {
        if (scope === 'today') return reservation.date === today;
        if (scope === 'week') return reservation.date >= weekBounds.start && reservation.date <= weekBounds.end;
        return true;
    }), [reservations, scope, today, weekBounds]);

    const visible = useMemo(() => scoped
        .filter((reservation) => {
            const stage = liveStage(reservation, stageOptions);
            if (tab === 'pending' && stage !== 'pending') return false;
            if (tab === 'confirmed' && stage !== 'confirmed') return false;
            if (tab === 'salon' && !['waiting', 'service', 'processing', 'finish', 'checkout'].includes(stage)) return false;
            if (tab === 'missed' && stage !== 'missed') return false;
            if (tab === 'completed' && stage !== 'completed') return false;
            if (tab === 'cancelled' && stage !== 'cancelled') return false;
            if (query) {
                const normalized = query.toLocaleLowerCase('tr').replace(/\s/g, '');
                return `${reservation.customerName} ${reservation.customerPhone} ${reservation.service} ${reservation.staffName || ''}`
                    .toLocaleLowerCase('tr').replace(/\s/g, '').includes(normalized);
            }
            return true;
        }), [query, scoped, stageOptions, tab]);

    // Bugün / Yaklaşan / Geçmiş — düz bir liste geçmişi en üste alıyordu.
    // Bugün ve yaklaşan artan (sıradaki iş üstte), geçmiş azalan (en yenisi üstte).
    const groups = useMemo(() => {
        const byTime = (a: Reservation, b: Reservation) => a.startTime.localeCompare(b.startTime);
        const byDateTime = (a: Reservation, b: Reservation) => (a.date !== b.date
            ? a.date.localeCompare(b.date)
            : byTime(a, b));
        return {
            today: visible.filter((reservation) => reservation.date === today).sort(byTime),
            upcoming: visible.filter((reservation) => reservation.date > today).sort(byDateTime),
            past: visible.filter((reservation) => reservation.date < today).sort((a, b) => -byDateTime(a, b)),
        };
    }, [visible, today]);

    // Arama veya durum filtresi aktifken geçmişi gizlemek sonuçları yutar.
    const pastForced = Boolean(query) || tab !== 'all';
    const pastVisible = pastForced || showPast;

    const counts = useMemo(() => {
        const values: Record<Exclude<TabKey, 'waitlist'>, number> = {
            all: scoped.length,
            pending: 0,
            confirmed: 0,
            salon: 0,
            missed: 0,
            completed: 0,
            cancelled: 0,
        };
        for (const reservation of scoped) {
            const stage = liveStage(reservation, stageOptions);
            if (stage === 'pending') values.pending++;
            if (stage === 'confirmed') values.confirmed++;
            if (['waiting', 'service', 'processing', 'finish', 'checkout'].includes(stage)) values.salon++;
            if (stage === 'missed') values.missed++;
            if (stage === 'completed') values.completed++;
            if (stage === 'cancelled') values.cancelled++;
        }
        return values;
    }, [scoped, stageOptions]);

    const todayReservations = reservations.filter((reservation) => reservation.date === today && reservation.status !== 'cancelled');
    const lateWaits = todayReservations.filter((reservation) => reservation.customerArrivedAt && !reservation.arrivedAt
        && now.getTime() - new Date(reservation.customerArrivedAt).getTime() >= 10 * 60_000);
    const onlineToday = todayReservations.filter((reservation) => reservation.source === 'booking').length;
    const todayRevenue = payments
        .filter((payment) => payment.reservationId && toISODate(new Date(payment.paidAt)) === today)
        .reduce((sum, payment) => sum + payment.amount, 0);

    const advance = async (reservation: Reservation) => {
        const duration = settings.services.find((service) => service.name === reservation.service)?.duration;
        const action = nextAction(reservation, liveStage(reservation, stageOptions), duration);
        if (!action || busyId) return;
        if (action.navigateTo) {
            navigate(action.navigateTo);
            return;
        }
        if (!action.patch) return;
        setBusyId(reservation.id);
        const result = await updateReservation(reservation.id, action.patch);
        setBusyId(null);
        if (!result) return;
        setSelected(result);
        if (action.message) toast.success(action.message);
    };

    const cancelReservation = async (reservation: Reservation) => {
        if (busyId || !window.confirm(`${reservation.customerName} için bu randevu iptal edilsin mi? Bekleme listesi bildirimleri tetiklenebilir.`)) return;
        setBusyId(reservation.id);
        const result = await updateReservation(reservation.id, { status: 'cancelled' });
        setBusyId(null);
        if (!result) return;
        setSelected(result);
        toast.success('Randevu iptal edildi');
    };

    const addWaitlist = async () => {
        if (!waitDraft.name.trim() || !waitDraft.phone.trim()) {
            toast.error('Müşteri adı ve telefon gerekli');
            return;
        }
        const row = await addEntry({
            customerName: waitDraft.name.trim(),
            customerPhone: waitDraft.phone.trim(),
            serviceId: waitDraft.serviceId || undefined,
            preferredDate: waitDraft.date || undefined,
            notes: waitDraft.notes || undefined,
        });
        if (!row) return;
        setWaitDraft({ name: '', phone: '', serviceId: '', date: '', notes: '' });
        setWaitlistOpen(false);
        toast.success('Müşteri bekleme listesine eklendi');
    };

    const setTab = (next: TabKey) => {
        const params = new URLSearchParams(searchParams);
        if (next === 'all') params.delete('tab');
        else params.set('tab', next);
        setSearchParams(params, { replace: true });
    };

    const createFromWaitlist = (entry: WaitlistEntry) => {
        const params = new URLSearchParams({
            new: '1',
            name: entry.customerName,
            phone: entry.customerPhone,
            waitlist: entry.id,
        });
        if (entry.serviceId) params.set('service', entry.serviceId);
        if (entry.preferredDate) params.set('date', entry.preferredDate);
        navigate(`/calendar?${params.toString()}`);
    };

    const renderRow = (reservation: Reservation) => {
        const stage = liveStage(reservation, stageOptions);
        const meta = STAGE_META[stage];
        const StageIcon = meta.icon;
        const duration = settings.services.find((service) => service.name === reservation.service)?.duration;
        const action = nextAction(reservation, stage, duration);
        return (
            <div
                key={reservation.id}
                role="button"
                tabIndex={0}
                className={`ks-reservation-row ${selected?.id === reservation.id ? 'selected' : ''} ${stage}`}
                onClick={() => setSelected(reservation)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelected(reservation);
                    }
                }}
            >
                <span className="ks-client-cell"><i>{initialsOf(reservation.customerName)}</i><span><b>{reservation.customerName}</b><small>{reservation.customerPhone}</small></span></span>
                <span className="ks-date-cell"><b>{dateLabel(reservation.date, { day: 'numeric', month: 'short' })}</b><small>{reservation.startTime}–{reservation.endTime}</small></span>
                <span className="ks-service-cell"><i style={{ background: reservation.serviceColor || '#FF5A1F' }} /><span><b>{reservation.service}</b>{reservation.customFields?.[FORMULA_KEY] && <small><Droplets size={11} /> {String(reservation.customFields[FORMULA_KEY])}</small>}</span></span>
                <span className="ks-staff-cell"><b>{reservation.staffName || 'Atanmadı'}</b><small>{reservation.resourceName || 'Alan seçilmedi'}</small></span>
                <span className={`ks-stage-badge ${stage}`}><StageIcon size={13} />{meta.label}</span>
                <span className="ks-row-actions">
                    {action && <button type="button" className={action.secondary ? 'secondary' : ''} disabled={busyId === reservation.id} onClick={(event) => { event.stopPropagation(); void advance(reservation); }}>{busyId === reservation.id ? '…' : action.label}<ChevronRight size={13} /></button>}
                </span>
            </div>
        );
    };

    const selectedLive = selected ? reservations.find((reservation) => reservation.id === selected.id) || selected : null;
    const selectedService = selectedLive ? settings.services.find((service) => service.name === selectedLive.service) : undefined;
    const selectedStage = selectedLive ? liveStage(selectedLive, stageOptions) : null;
    const selectedAction = selectedLive && selectedStage ? nextAction(selectedLive, selectedStage, selectedService?.duration) : null;

    return (
        <KuaforSuiteFrame
            className="ks-reservations-page"
            eyebrow="REZERVASYON MERKEZİ"
            title="Rezervasyonlar,"
            accent="yalnızca bir liste değil."
            description="Teyitten koltuğa, boya süresinden kasaya kadar her randevunun gerçek durumunu yönetin."
            icon={CalendarClock}
            actions={(
                <>
                    <button className="ks-btn ks-btn-ghost" onClick={() => setTab('waitlist')}>
                        <Hourglass size={16} /> Bekleme listesi
                        {waitlist.length > 0 && <b className="ks-mini-count">{waitlist.length}</b>}
                    </button>
                    <button className="ks-btn ks-btn-primary" onClick={() => navigate('/calendar?new=1')}>
                        <Plus size={17} /> Yeni randevu
                    </button>
                </>
            )}
        >
            <section className="ks-metric-strip">
                <div><span className="ks-metric-icon orange"><CalendarClock size={17} /></span><p><small>Bugün</small><strong>{todayReservations.length}</strong><em>{counts.pending} onay bekliyor</em></p></div>
                <div><span className="ks-metric-icon red"><AlertTriangle size={17} /></span><p><small>10+ dk bekleyen</small><strong>{lateWaits.length}</strong><em>karşılama sinyali</em></p></div>
                <div><span className="ks-metric-icon purple"><Sparkles size={17} /></span><p><small>Online rezervasyon</small><strong>{onlineToday}</strong><em>bugün gelen</em></p></div>
                <div><span className="ks-metric-icon green"><CircleDollarSign size={17} /></span><p><small>Tahsil edilen</small><strong className="money">{moneyOf(todayRevenue)}</strong><em>bugünün ödemeleri</em></p></div>
            </section>

            <section className="ks-reservation-workspace">
                <article className="ks-reservation-list">
                    <header className="ks-list-toolbar">
                        <div className="ks-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Müşteri, telefon, hizmet veya kuaför ara…" />{query && <button aria-label="Aramayı temizle" onClick={() => setQuery('')}><X size={14} /></button>}</div>
                        <div className="ks-scope" role="group" aria-label="Zaman kapsamı">
                            {([['today', 'Bugün'], ['week', 'Bu hafta'], ['all', 'Tümü']] as const).map(([key, label]) => (
                                <button key={key} type="button" className={scope === key ? 'active' : ''} onClick={() => setScope(key)}>{label}</button>
                            ))}
                        </div>
                    </header>
                    <nav className="ks-tabs">
                        {([
                            ['all', 'Tümü', counts.all],
                            ['pending', 'Onay', counts.pending],
                            ['confirmed', 'Planlanan', counts.confirmed],
                            ['salon', 'Salonda', counts.salon],
                            ['missed', 'Gelmedi', counts.missed],
                            ['completed', 'Tamamlanan', counts.completed],
                            ['cancelled', 'İptal', counts.cancelled],
                            ['waitlist', 'Bekleme listesi', waitlist.length],
                        ] as const).map(([key, label, count]) => (
                            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
                                {label}<span>{count}</span>
                            </button>
                        ))}
                    </nav>

                    {tab === 'waitlist' ? (
                        <div className="ks-waitlist-view">
                            <div className="ks-section-title">
                                <div><span className="ks-eyebrow">BOŞLUK EŞLEŞTİRME</span><h2>Randevu bekleyen müşteriler</h2><p>İptal veya boşluk oluştuğunda doğru hizmetle eşleştirin.</p></div>
                                <button className="ks-btn ks-btn-primary" onClick={() => setWaitlistOpen(true)}><Plus size={15} /> Müşteri ekle</button>
                            </div>
                            {waitlist.length === 0 ? (
                                <div className="ks-empty-state"><span><Check size={21} /></span><h3>Bekleme listesi boş</h3><p>Dolu saatler için beklemek isteyen müşterileri buraya ekleyebilirsiniz.</p></div>
                            ) : (
                                <div className="ks-waitlist-grid">
                                    {waitlist.map((entry, index) => {
                                        const service = settings.services.find((item) => item.id === entry.serviceId);
                                        return (
                                            <article key={entry.id}>
                                                <span className="ks-wait-index">{String(index + 1).padStart(2, '0')}</span>
                                                <div className="ks-wait-person"><b>{entry.customerName}</b><small>{entry.customerPhone}</small></div>
                                                <div className="ks-wait-pref"><small>İSTEK</small><b>{service?.name || 'Herhangi bir hizmet'}</b><span>{entry.preferredDate ? dateLabel(entry.preferredDate, { day: 'numeric', month: 'long' }) : 'İlk uygun gün'}</span></div>
                                                {entry.notes && <p>{entry.notes}</p>}
                                                <div className="ks-wait-actions">
                                                    <button onClick={() => createFromWaitlist(entry)}>Randevu oluştur <ArrowRight size={14} /></button>
                                                    <button title="Listeden çıkar" onClick={() => removeEntry(entry.id)}><X size={15} /></button>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="ks-empty-state"><span><Search size={21} /></span><h3>Bu görünümde randevu yok</h3><p>Kapsamı, aramayı veya durum filtresini değiştirebilirsiniz.</p></div>
                    ) : (
                        <div className="ks-reservation-table">
                            <div className="ks-table-head"><span>Müşteri</span><span>Tarih · saat</span><span>Hizmet</span><span>Kuaför / alan</span><span>Canlı durum</span><span /></div>
                            {groups.today.length > 0 && (
                                <>
                                    <div className="ks-group-head accent"><span>BUGÜN · {dateLabel(today, { day: 'numeric', month: 'long' })}</span><i /><em>{groups.today.length} randevu</em></div>
                                    {groups.today.map(renderRow)}
                                </>
                            )}
                            {groups.upcoming.length > 0 && (
                                <>
                                    <div className="ks-group-head"><span>YAKLAŞAN</span><i /><em>{groups.upcoming.length} randevu</em></div>
                                    {groups.upcoming.map(renderRow)}
                                </>
                            )}
                            {groups.past.length > 0 && (pastVisible ? (
                                <>
                                    <div className="ks-group-head">
                                        <span>GEÇMİŞ</span><i />
                                        {!pastForced && <button type="button" onClick={() => setShowPast(false)}>Gizle</button>}
                                        <em>{groups.past.length} randevu</em>
                                    </div>
                                    {groups.past.map(renderRow)}
                                </>
                            ) : (
                                <button type="button" className="ks-past-toggle" onClick={() => setShowPast(true)}>
                                    <span><History size={15} /> Geçmiş randevular · {groups.past.length} kayıt</span>
                                    <ChevronDown size={16} />
                                </button>
                            ))}
                        </div>
                    )}
                </article>

                {tab !== 'waitlist' && (
                    <aside className={`ks-reservation-detail ${selectedLive ? 'has-selection' : ''}`}>
                        {!selectedLive ? (
                            <div className="ks-detail-placeholder"><span><Scissors size={23} /></span><h3>Randevu seçin</h3><p>Canlı aşamayı, formülü ve hızlı işlemleri burada yönetin.</p></div>
                        ) : (
                            <>
                                <header>
                                    <span className="ks-eyebrow">RANDEVU KARTI</span>
                                    <button aria-label="Randevu detayını kapat" onClick={() => setSelected(null)}><X size={16} /></button>
                                </header>
                                <div className="ks-detail-person">
                                    <span>{initialsOf(selectedLive.customerName)}</span>
                                    <div><h2>{selectedLive.customerName}</h2><p>{selectedLive.customerPhone}</p></div>
                                    <a href={`https://wa.me/${selectedLive.customerPhone.replace(/\D/g, '').replace(/^0/, '90')}`} target="_blank" rel="noreferrer" title="WhatsApp"><MessageCircle size={17} /></a>
                                </div>
                                <div className={`ks-detail-stage ${selectedStage}`}>
                                    {(() => { const Icon = STAGE_META[selectedStage!].icon; return <Icon size={17} />; })()}
                                    <span><small>CANLI DURUM</small><b>{STAGE_META[selectedStage!].label}</b></span>
                                </div>
                                <dl className="ks-detail-list">
                                    <div><dt>Tarih</dt><dd>{dateLabel(selectedLive.date)}</dd></div>
                                    <div><dt>Saat</dt><dd>{selectedLive.startTime}–{selectedLive.endTime}</dd></div>
                                    <div><dt>Hizmet</dt><dd>{selectedLive.service} {selectedService?.price ? `· ${moneyOf(selectedService.price)}` : ''}</dd></div>
                                    <div><dt>Kuaför</dt><dd>{selectedLive.staffName || 'Atanmadı'}</dd></div>
                                    <div><dt>Koltuk / alan</dt><dd>{selectedLive.resourceName || 'Seçilmedi'}</dd></div>
                                    <div><dt>Kaynak</dt><dd>{selectedLive.source === 'booking' ? 'Online booking' : selectedLive.source === 'leadflow' ? 'LeadFlow' : 'Manuel'}</dd></div>
                                    {selectedLive.customFields?.[FORMULA_KEY] && <div className="formula"><dt>Renk formülü</dt><dd><Droplets size={14} />{String(selectedLive.customFields[FORMULA_KEY])}</dd></div>}
                                    {selectedLive.notes && <div><dt>Salon notu</dt><dd>{selectedLive.notes}</dd></div>}
                                </dl>
                                <div className="ks-reminder-state">
                                    <MessageCircle size={15} />
                                    <span><b>Hatırlatma durumu</b><small>{selectedLive.reminder24hSent || selectedLive.reminder2hSent ? `${selectedLive.reminder24hSent ? '24 saat' : ''}${selectedLive.reminder24hSent && selectedLive.reminder2hSent ? ' + ' : ''}${selectedLive.reminder2hSent ? '2 saat' : ''} mesajı gönderildi` : 'Henüz otomatik mesaj gönderilmedi'}</small></span>
                                </div>
                                <div className="ks-detail-actions">
                                    {selectedAction && <button className={`ks-btn ${selectedAction.secondary ? 'ks-btn-ghost' : 'ks-btn-primary'}`} disabled={busyId === selectedLive.id} onClick={() => advance(selectedLive)}>{selectedAction.label}<ArrowRight size={15} /></button>}
                                    <button className="ks-btn ks-btn-ghost" onClick={() => setEditReservation(selectedLive)}>Düzenle</button>
                                    {selectedLive.status !== 'cancelled' && selectedLive.status !== 'completed' && <button className="ks-text-danger" disabled={busyId === selectedLive.id} onClick={() => void cancelReservation(selectedLive)}>Randevuyu iptal et</button>}
                                </div>
                            </>
                        )}
                    </aside>
                )}
            </section>

            {editReservation && (
                <EditReservationModal
                    reservation={reservations.find((reservation) => reservation.id === editReservation.id) || editReservation}
                    isOpen={!!editReservation}
                    onClose={() => setEditReservation(null)}
                />
            )}

            {waitlistOpen && (
                <div className="ks-modal-layer" onClick={() => setWaitlistOpen(false)}>
                    <section className="ks-modal ks-modal-compact" role="dialog" aria-modal="true" aria-labelledby="ks-waitlist-title" onClick={(event) => event.stopPropagation()}>
                        <header><span><Hourglass size={18} /></span><div><small>BOŞLUK BEKLEYEN</small><h2 id="ks-waitlist-title">Bekleme listesine ekle</h2><p>Uygun saat açıldığında müşteriyi eşleştirin.</p></div><button aria-label="Bekleme listesi penceresini kapat" onClick={() => setWaitlistOpen(false)}><X size={17} /></button></header>
                        <div className="ks-modal-body">
                            <label><span>Müşteri adı</span><input value={waitDraft.name} onChange={(event) => setWaitDraft((previous) => ({ ...previous, name: event.target.value }))} placeholder="Ad soyad" /></label>
                            <label><span>Telefon</span><input value={waitDraft.phone} onChange={(event) => setWaitDraft((previous) => ({ ...previous, phone: event.target.value }))} placeholder="05xx xxx xx xx" /></label>
                            <div className="ks-form-grid">
                                <label><span>Tercih edilen hizmet</span><select value={waitDraft.serviceId} onChange={(event) => setWaitDraft((previous) => ({ ...previous, serviceId: event.target.value }))}><option value="">Fark etmez</option>{settings.services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
                                <label><span>Tercih edilen gün</span><input type="date" min={today} value={waitDraft.date} onChange={(event) => setWaitDraft((previous) => ({ ...previous, date: event.target.value }))} /></label>
                            </div>
                            <label><span>Not</span><textarea rows={2} value={waitDraft.notes} onChange={(event) => setWaitDraft((previous) => ({ ...previous, notes: event.target.value }))} placeholder="Saat aralığı veya kuaför tercihi…" /></label>
                        </div>
                        <footer><button className="ks-btn ks-btn-ghost" onClick={() => setWaitlistOpen(false)}>Vazgeç</button><button className="ks-btn ks-btn-primary" onClick={addWaitlist}>Listeye ekle <ArrowRight size={15} /></button></footer>
                    </section>
                </div>
            )}
        </KuaforSuiteFrame>
    );
}
