import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
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
import { todayISO, toISODate } from '@/utils/date';
import {
    KF_FORMULA_KEY as FORMULA_KEY,
    isKuaforColorService,
    kuaforLiveStageOf,
    type KuaforLiveStage,
} from '@/lib/kuaforFlow';
import type { Reservation } from '@/types';
import {
    addMinutes, dateLabel, initialsOf, minutesOf, timeOf,
    KuaforSuiteFrame,
} from './KuaforSuiteFrame';

type ViewMode = 'team' | 'week' | 'chairs';
type Lane = { id: string; name: string; detail: string; color: string };

const DAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const ROW_HEIGHT = 72;

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

    const [date, setDate] = useState(today);
    const [view, setView] = useState<ViewMode>('team');
    const [staffFilter, setStaffFilter] = useState('all');
    const [selected, setSelected] = useState<Reservation | null>(null);
    const [editReservation, setEditReservation] = useState<Reservation | null>(null);
    const [newOpen, setNewOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [draft, setDraft] = useState({
        customerId: '',
        customerName: '',
        customerPhone: '',
        service: settings.services[0]?.name || '',
        staffId: '',
        resourceId: '',
        startTime: '09:00',
        note: '',
        formula: '',
        waitlistId: '',
    });

    const newParamHandledRef = useRef(false);
    useEffect(() => {
        if (newParamHandledRef.current) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get('new') !== '1') return;
        const customerId = params.get('customer') || '';
        if (customerId && allCustomers.length === 0) return;
        const customer = allCustomers.find((item) => item.id === customerId);
        const requestedService = params.get('service');
        const service = requestedService
            ? settings.services.find((item) => item.id === requestedService || item.name === requestedService)
            : undefined;
        const requestedDate = params.get('date');
        newParamHandledRef.current = true;
        if (requestedDate) setDate(requestedDate);
        setDraft((previous) => ({
            ...previous,
            customerId: customer?.id || '',
            customerName: customer?.name || params.get('name') || '',
            customerPhone: customer?.phone || params.get('phone') || '',
            service: service?.name || previous.service,
            formula: String(customer?.customFields?.[FORMULA_KEY] || ''),
            waitlistId: params.get('waitlist') || '',
        }));
        setNewOpen(true);
        window.history.replaceState(null, '', window.location.pathname);
    }, [allCustomers, settings.services]);

    useEffect(() => {
        if (draft.service || settings.services.length === 0) return;
        setDraft((previous) => ({ ...previous, service: settings.services[0].name }));
    }, [draft.service, settings.services]);

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

    const weekDays = useMemo(() => {
        const anchor = new Date(`${date}T12:00:00`);
        anchor.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
        return Array.from({ length: 7 }, (_, index) => {
            const value = new Date(anchor);
            value.setDate(anchor.getDate() + index);
            const iso = toISODate(value);
            return {
                iso,
                short: DAY_NAMES[index],
                day: value.getDate(),
                isToday: iso === today,
                count: reservations.filter((reservation) => reservation.date === iso && reservation.status !== 'cancelled').length,
            };
        });
    }, [date, reservations, today]);

    const dayReservations = useMemo(
        () => reservations
            .filter((reservation) => reservation.date === date && reservation.status !== 'cancelled')
            .sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [reservations, date],
    );

    const workingHours = settings.workingHours?.find((hours) => hours.day === new Date(`${date}T12:00:00`).getDay());
    const isSalonClosed = !workingHours || workingHours.isOff;
    const openingMinutes = isSalonClosed ? 9 * 60 : minutesOf(workingHours.start);
    const closingMinutes = isSalonClosed ? 18 * 60 : minutesOf(workingHours.end);
    const startHour = Math.floor(openingMinutes / 60);
    const endHour = Math.max(startHour + 1, Math.ceil(closingMinutes / 60));
    const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);

    const lanes: Lane[] = useMemo(() => {
        if (view === 'week') {
            return weekDays.map((day) => ({
                id: day.iso,
                name: `${day.short} ${day.day}`,
                detail: day.isToday ? 'Bugün' : `${day.count} randevu`,
                color: day.isToday ? '#FF5A1F' : '#8A8580',
            }));
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
    }, [activeResources, activeStaff, dayReservations, staffFilter, view, weekDays]);

    const reservationsForLane = (lane: Lane) => {
        if (view === 'week') {
            return reservations.filter((reservation) => reservation.date === lane.id && reservation.status !== 'cancelled');
        }
        if (view === 'chairs') {
            return dayReservations.filter((reservation) => (reservation.resourceId || 'unassigned') === lane.id);
        }
        return dayReservations.filter((reservation) => (reservation.staffId || 'unassigned') === lane.id);
    };

    const selectedService = settings.services.find((service) => service.name === draft.service) || settings.services[0];
    const endTime = addMinutes(draft.startTime, selectedService?.duration || 45);

    const openAt = (event: MouseEvent<HTMLDivElement>, lane: Lane) => {
        if ((event.target as HTMLElement).closest('.ks-appointment')) return;
        if (isSalonClosed) {
            toast.info('Salon seçili günde kapalı');
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
        setNewOpen(true);
    };

    const createReservation = async () => {
        if (!draft.customerName.trim() || !draft.customerPhone.trim() || !draft.service || saving) {
            toast.error('Müşteri, telefon ve hizmet bilgilerini tamamlayın');
            return;
        }
        if (!slotRulesReady) {
            toast.error('Salon uygunluğu kontrol ediliyor, lütfen kısa süre sonra yeniden deneyin');
            return;
        }
        const resolution = resolve({
            date,
            startTime: draft.startTime,
            endTime,
            staffId: draft.staffId || undefined,
            resourceId: draft.resourceId || undefined,
        });
        if (resolution.issue) {
            toast.error(resolution.issue);
            return;
        }
        setSaving(true);
        const result = await addReservation({
            customerId: draft.customerId,
            customerName: draft.customerName.trim(),
            customerPhone: draft.customerPhone.trim(),
            date,
            startTime: draft.startTime,
            endTime,
            service: draft.service,
            serviceColor: selectedService?.color || '#FF5A1F',
            status: 'confirmed',
            notes: draft.note,
            staffId: resolution.staffMember?.id || draft.staffId || undefined,
            resourceId: draft.resourceId || undefined,
            customFields: draft.formula ? { [FORMULA_KEY]: draft.formula } : undefined,
        });
        setSaving(false);
        if (!result) return;
        if (draft.waitlistId) await removeEntry(draft.waitlistId);
        setNewOpen(false);
        setDraft((previous) => ({
            ...previous,
            customerId: '',
            customerName: '',
            customerPhone: '',
            note: '',
            formula: '',
            waitlistId: '',
        }));
        toast.success('Randevu salon planına eklendi');
    };

    const pickCustomer = (value: string) => {
        const customer = allCustomers.find((item) => `${item.name} · ${item.phone}` === value);
        setDraft((previous) => ({
            ...previous,
            customerName: customer?.name || value,
            customerId: customer?.id || '',
            customerPhone: customer?.phone || '',
            formula: String(customer?.customFields?.[FORMULA_KEY] || ''),
        }));
    };

    const processing = dayReservations.filter((reservation) => appointmentState(reservation) === 'processing').length;
    const inSalon = dayReservations.filter((reservation) => reservation.customerArrivedAt && reservation.status !== 'completed').length;
    const confirmed = dayReservations.filter((reservation) => reservation.status === 'confirmed').length;
    const waiting = waitlist.filter((entry) => entry.status === 'waiting');
    const bookedMinutes = dayReservations.reduce((sum, reservation) => sum + Math.max(0, minutesOf(reservation.endTime) - minutesOf(reservation.startTime)), 0);
    const capacityMinutes = isSalonClosed ? 0 : Math.max(1, (closingMinutes - openingMinutes) * Math.max(1, activeStaff.length));
    const occupancy = capacityMinutes ? Math.min(100, Math.round((bookedMinutes / capacityMinutes) * 100)) : 0;

    const freeSlots = useMemo(() => {
        if (isSalonClosed || !slotRulesReady) return [];
        return findSlots({
            date,
            durationMin: selectedService?.duration || 30,
            stepMin: settings.slotDuration || 15,
            limit: 3,
        }).map((slot) => ({
            start: minutesOf(slot.startTime),
            end: minutesOf(slot.endTime),
        }));
    }, [date, findSlots, isSalonClosed, selectedService?.duration, settings.slotDuration, slotRulesReady]);

    const shiftDate = (amount: number) => {
        const next = new Date(`${date}T12:00:00`);
        next.setDate(next.getDate() + amount * (view === 'week' ? 7 : 1));
        setDate(toISODate(next));
    };

    const nowTop = !isSalonClosed && date === today && now.getHours() >= startHour && now.getHours() < endHour
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
            actions={(
                <>
                    <button className="ks-btn ks-btn-ghost" onClick={() => navigate('/reservations?tab=waitlist')}>
                        <TimerReset size={16} /> Bekleme listesi
                        {waiting.length > 0 && <b className="ks-mini-count">{waiting.length}</b>}
                    </button>
                    <button className="ks-btn ks-btn-primary" onClick={() => setNewOpen(true)}>
                        <Plus size={17} /> Yeni randevu
                    </button>
                </>
            )}
        >
            <section className="ks-metric-strip" aria-label="Günün salon özeti">
                <div><span className="ks-metric-icon orange"><Scissors size={17} /></span><p><small>Bugünün planı</small><strong>{dayReservations.length}</strong><em>{confirmed} onaylı</em></p></div>
                <div><span className="ks-metric-icon green"><Users size={17} /></span><p><small>Şu an salonda</small><strong>{inSalon}</strong><em>canlı müşteri</em></p></div>
                <div><span className="ks-metric-icon purple"><TimerReset size={17} /></span><p><small>Boya süresi</small><strong>{processing}</strong><em>sayaç çalışıyor</em></p></div>
                <div><span className="ks-metric-icon blue"><Armchair size={17} /></span><p><small>Kapasite</small><strong>%{occupancy}</strong><em>{activeResources.length || '—'} kaynak tanımlı</em></p></div>
            </section>

            <section className="ks-calendar-toolbar">
                <div className="ks-date-nav">
                    <button aria-label="Önceki" onClick={() => shiftDate(-1)}><ChevronLeft size={18} /></button>
                    <div>
                        <span>{date === today ? 'BUGÜN' : 'SEÇİLİ GÜN'}</span>
                        <strong>{dateLabel(date)}</strong>
                    </div>
                    <button aria-label="Sonraki" onClick={() => shiftDate(1)}><ChevronRight size={18} /></button>
                    <button className="ks-today" onClick={() => setDate(today)}>Bugün</button>
                </div>
                <div className="ks-segmented" aria-label="Takvim görünümü">
                    {([
                        ['team', 'Ekip', Users],
                        ['week', 'Hafta', CalendarDays],
                        ['chairs', 'Koltuklar', Armchair],
                    ] as const).map(([key, label, Icon]) => (
                        <button key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>
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
            </section>

            <section className="ks-calendar-layout">
                <aside className="ks-week-rail">
                    <span className="ks-rail-label">BU HAFTA</span>
                    {weekDays.map((day) => (
                        <button key={day.iso} className={`${day.iso === date ? 'active' : ''} ${day.isToday ? 'today' : ''}`} onClick={() => setDate(day.iso)}>
                            <small>{day.short}</small><strong>{day.day}</strong><em>{day.count}</em>
                        </button>
                    ))}
                </aside>

                <article className={`ks-timeline-card ${isSalonClosed ? 'is-closed' : ''}`} style={{ '--lanes': lanes.length } as CSSProperties}>
                    <header className="ks-lane-head" style={{ '--lanes': lanes.length } as CSSProperties}>
                        <span className="ks-axis-corner"><Clock3 size={15} /></span>
                        {lanes.map((lane) => (
                            <div key={lane.id}>
                                <i style={{ background: lane.color }} />
                                <span><strong>{lane.name}</strong><small>{lane.detail}</small></span>
                            </div>
                        ))}
                    </header>
                    {isSalonClosed && (
                        <div className="ks-closed-banner">
                            <CalendarDays size={17} />
                            <span><b>Salon bu gün kapalı</b><small>Çalışma saatini Ayarlar bölümünden değiştirebilirsiniz.</small></span>
                        </div>
                    )}
                    <div className="ks-timeline-scroll">
                        <div className="ks-time-axis">
                            {hours.map((hour) => <span key={hour} style={{ height: ROW_HEIGHT }}>{String(hour).padStart(2, '0')}:00</span>)}
                        </div>
                        <div className="ks-lanes" style={{ '--lanes': lanes.length, '--timeline-height': `${hours.length * ROW_HEIGHT}px` } as CSSProperties}>
                            {lanes.map((lane) => (
                                <div key={lane.id} className="ks-lane" style={{ height: hours.length * ROW_HEIGHT }} onDoubleClick={(event) => openAt(event, lane)}>
                                    {reservationsForLane(lane).map((reservation) => {
                                        const start = Math.max(startHour * 60, minutesOf(reservation.startTime));
                                        const end = Math.min(endHour * 60, minutesOf(reservation.endTime));
                                        const top = ((start - startHour * 60) / 60) * ROW_HEIGHT;
                                        const height = Math.max(34, ((end - start) / 60) * ROW_HEIGHT - 4);
                                        const formula = reservation.customFields?.[FORMULA_KEY];
                                        return (
                                            <button
                                                key={reservation.id}
                                                className={`ks-appointment ${appointmentState(reservation)} ${isKuaforColorService(reservation.service) ? 'color-service' : ''}`}
                                                style={{ top, height, '--service-color': reservation.serviceColor || lane.color } as CSSProperties}
                                                onClick={(event) => { event.stopPropagation(); setSelected(reservation); }}
                                                title={`${reservation.startTime} · ${reservation.customerName} · ${reservation.service}`}
                                            >
                                                <i />
                                                <span className="ks-appt-time">{reservation.startTime}</span>
                                                <strong>{reservation.customerName}</strong>
                                                <small>{reservation.service}</small>
                                                {height > 60 && <em>{reservation.staffName || reservation.resourceName || STATE_LABELS[appointmentState(reservation)]}</em>}
                                                {formula && height > 82 && <b><Droplets size={11} /> {String(formula)}</b>}
                                            </button>
                                        );
                                    })}
                                </div>
                            ))}
                            {nowTop !== null && <div className="ks-now-line" style={{ top: nowTop }}><span>şimdi</span></div>}
                        </div>
                    </div>
                    <footer className="ks-timeline-hint"><Sparkles size={13} /> {isSalonClosed ? 'Kapalı günde yeni saat eklenemez.' : 'Boş bir alana çift tıklayarak o saate randevu ekleyin.'}</footer>
                </article>

                <aside className="ks-day-insight">
                    <header><span className="ks-live-dot" /><div><small>CANLI KAPASİTE</small><strong>Günün fırsatları</strong></div></header>
                    <div className="ks-capacity-ring" style={{ '--capacity': `${occupancy * 3.6}deg` } as CSSProperties}>
                        <span><b>%{occupancy}</b><small>dolu</small></span>
                    </div>
                    <div className="ks-free-list">
                        <span>UYGUN BOŞLUKLAR</span>
                        {freeSlots.length ? freeSlots.map((slot) => (
                            <button key={slot.start} onClick={() => { setDraft((previous) => ({ ...previous, startTime: timeOf(slot.start) })); setNewOpen(true); }}>
                                <span><Clock3 size={14} /><b>{timeOf(slot.start)}</b>–{timeOf(slot.end)}</span>
                                <em>{slot.end - slot.start} dk</em><ArrowRight size={14} />
                            </button>
                        )) : <p>{isSalonClosed ? 'Salon bu gün hizmet vermiyor.' : slotRulesReady ? 'Seçili hizmet için uygun başlangıç görünmüyor.' : 'Uygunluk bilgisi hazırlanıyor…'}</p>}
                    </div>
                    <div className="ks-waitlist-note">
                        <span><Waves size={16} /></span>
                        <p><strong>{waiting.length} müşteri</strong><small>uygun saat bekliyor</small></p>
                        <button onClick={() => navigate('/reservations?tab=waitlist')}>Gör</button>
                    </div>
                </aside>
            </section>

            {selected && (
                <div className="ks-drawer-layer" onClick={() => setSelected(null)}>
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
                </div>
            )}

            {editReservation && (
                <EditReservationModal
                    reservation={reservations.find((reservation) => reservation.id === editReservation.id) || editReservation}
                    isOpen={!!editReservation}
                    onClose={() => setEditReservation(null)}
                />
            )}

            {newOpen && (
                <div className="ks-modal-layer" onClick={() => setNewOpen(false)}>
                    <section className="ks-modal" role="dialog" aria-modal="true" aria-labelledby="ks-new-reservation-title" onClick={(event) => event.stopPropagation()}>
                        <header>
                            <span><Scissors size={19} /></span>
                            <div><small>HIZLI PLANLAMA</small><h2 id="ks-new-reservation-title">Yeni salon randevusu</h2><p>{dateLabel(date)} · {draft.startTime}–{endTime}</p></div>
                            <button aria-label="Yeni randevu penceresini kapat" onClick={() => setNewOpen(false)}><X size={17} /></button>
                        </header>
                        <div className="ks-modal-body">
                            <label><span>Müşteri adı</span><input list="ks-customer-options" value={draft.customerName} onChange={(event) => pickCustomer(event.target.value)} placeholder="İsimle ara veya yeni müşteri yaz" /></label>
                            <datalist id="ks-customer-options">{allCustomers.map((customer) => <option key={customer.id} value={`${customer.name} · ${customer.phone}`} />)}</datalist>
                            <label><span>Telefon</span><input value={draft.customerPhone} onChange={(event) => setDraft((previous) => ({ ...previous, customerPhone: event.target.value }))} placeholder="05xx xxx xx xx" /></label>
                            <div className="ks-form-grid">
                                <label><span>Hizmet</span><select value={draft.service} onChange={(event) => setDraft((previous) => ({ ...previous, service: event.target.value }))}>{settings.services.map((service) => <option key={service.id} value={service.name}>{service.name} · {service.duration} dk</option>)}</select></label>
                                <label><span>Başlangıç</span><input type="time" step={900} value={draft.startTime} onChange={(event) => setDraft((previous) => ({ ...previous, startTime: event.target.value }))} /></label>
                            </div>
                            <div className="ks-form-grid">
                                <label><span>Kuaför</span><select value={draft.staffId} onChange={(event) => setDraft((previous) => ({ ...previous, staffId: event.target.value }))}><option value="">Otomatik ata</option>{activeStaff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
                                <label><span>Koltuk / yıkama</span><select value={draft.resourceId} onChange={(event) => setDraft((previous) => ({ ...previous, resourceId: event.target.value }))}><option value="">Kaynak seçilmedi</option>{activeResources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>
                            </div>
                            {isKuaforColorService(draft.service) && <label className="ks-formula-field"><span><Droplets size={13} /> Renk formülü</span><input value={draft.formula} onChange={(event) => setDraft((previous) => ({ ...previous, formula: event.target.value }))} placeholder="Örn. 7.1 + 8.0 / 20 vol" /></label>}
                            <label><span>Salon notu</span><textarea value={draft.note} onChange={(event) => setDraft((previous) => ({ ...previous, note: event.target.value }))} placeholder="Tercih, hassasiyet veya hazırlık notu…" rows={2} /></label>
                            <div className="ks-booking-summary"><Check size={16} /><p><strong>{draft.service || 'Hizmet seçin'}</strong><small>{draft.startTime}–{endTime} · {activeStaff.find((member) => member.id === draft.staffId)?.name || 'uygun kuaföre otomatik atanır'}</small></p></div>
                        </div>
                        <footer><button className="ks-btn ks-btn-ghost" onClick={() => setNewOpen(false)}>Vazgeç</button><button className="ks-btn ks-btn-primary" disabled={saving} onClick={createReservation}>{saving ? 'Kaydediliyor…' : 'Randevuyu oluştur'} <ArrowRight size={15} /></button></footer>
                    </section>
                </div>
            )}
        </KuaforSuiteFrame>
    );
}
