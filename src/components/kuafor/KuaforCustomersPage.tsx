import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
    AlertTriangle, ArrowRight, CalendarClock, ChevronRight, Crown, Droplets,
    Edit2, Gift, Heart, History, MessageCircle, Scissors, Search, Sparkles, Star,
    Tag, TimerReset, TrendingUp, UserPlus, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCustomers } from '@/hooks/useCustomers';
import { usePayments } from '@/hooks/usePayments';
import { useReservations } from '@/hooks/useReservations';
import { KF_FORMULA_KEY as FORMULA_KEY, isKuaforColorService } from '@/lib/kuaforFlow';
import { todayISO } from '@/utils/date';
import type { Customer, Reservation } from '@/types';
import { KuaforOverlay } from './KuaforOverlay';
import { KuaforSuiteFrame } from './KuaforSuiteFrame';
import { dateLabel, initialsOf, moneyOf } from './kuaforSuite';

type Segment = 'all' | 'vip' | 'color' | 'return' | 'new';
const SEGMENTS: Segment[] = ['all', 'vip', 'color', 'return', 'new'];

interface CustomerStats {
    history: Reservation[];
    completed: Reservation[];
    /** Son 90 gün içinde tamamlanan işlemler — "tekrar ziyaret" ölçütü. */
    completedIn90: Reservation[];
    upcoming: Reservation[];
    spend: number;
    favoriteService: string;
    favoriteStaff: string;
    lastFormula?: string;
    lastFormulaDate?: string;
    lastColorDate?: string;
    colorDue: boolean;
    returnRisk: boolean;
}

const HAIR_TYPES = ['İnce telli', 'Normal', 'Kalın telli', 'Karma'];
const HAIR_TEXTURES = ['Düz', 'Dalgalı', 'Kıvırcık', 'Çok kıvırcık'];

function mostFrequent(values: string[]) {
    const counts = new Map<string, number>();
    for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Henüz oluşmadı';
}

function daysSince(iso?: string) {
    if (!iso) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.floor((Date.now() - new Date(`${iso}T12:00:00`).getTime()) / 86_400_000));
}

function averageVisitDays(reservations: Reservation[]) {
    if (reservations.length < 2) return null;
    const newest = new Date(`${reservations[0].date}T12:00:00`).getTime();
    const oldest = new Date(`${reservations[reservations.length - 1].date}T12:00:00`).getTime();
    return Math.max(1, Math.round((newest - oldest) / 86_400_000 / (reservations.length - 1)));
}

export function KuaforCustomersPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const {
        allCustomers,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        redeemLoyalty,
        isLoading: customersLoading,
    } = useCustomers();
    const { reservations, settings } = useReservations();
    const { payments } = usePayments();
    const [query, setQuery] = useState(searchParams.get('q') || '');
    const segmentParam = searchParams.get('segment');
    const segment: Segment = SEGMENTS.includes(segmentParam as Segment) ? (segmentParam as Segment) : 'all';
    const parsedReturnDays = Number.parseInt(searchParams.get('days') || '', 10);
    const returnDays = Number.isFinite(parsedReturnDays) && parsedReturnDays > 0
        ? Math.min(parsedReturnDays, 3_650)
        : 60;
    const requestedOpenId = searchParams.get('open');
    const [selectedId, setSelectedId] = useState<string | null>(() => requestedOpenId);
    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: '',
        phone: '',
        email: '',
        notes: '',
        hairType: '',
        hairTexture: '',
        allergy: '',
        preference: '',
        formula: '',
    });

    const today = todayISO();
    const loyaltyThreshold = settings.loyaltyThreshold || 10;
    const loyaltyEnabled = settings.loyaltyEnabled !== false;

    const statsByCustomer = useMemo(() => {
        const result = new Map<string, CustomerStats>();
        for (const customer of allCustomers) {
            const history = reservations
                .filter((reservation) => reservation.customerId === customer.id)
                .sort((a, b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`));
            const completed = history.filter((reservation) => reservation.status === 'completed' && reservation.date <= today);
            const upcoming = history
                .filter((reservation) => reservation.date >= today && !['completed', 'cancelled'].includes(reservation.status))
                .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
            const spend = payments
                .filter((payment) => payment.customerId === customer.id)
                .reduce((sum, payment) => sum + payment.amount, 0);
            const completedIn90 = completed.filter((reservation) => daysSince(reservation.date) <= 90);
            const lastColor = completed.find((reservation) => isKuaforColorService(reservation.service));
            const formulaReservation = completed.find((reservation) =>
                isKuaforColorService(reservation.service) && reservation.customFields?.[FORMULA_KEY]);
            const lastVisit = completed[0]?.date || customer.lastVisit;
            result.set(customer.id, {
                history,
                completed,
                completedIn90,
                upcoming,
                spend,
                favoriteService: mostFrequent(completed.map((reservation) => reservation.service)),
                favoriteStaff: mostFrequent(completed.map((reservation) => reservation.staffName || '')),
                lastFormula: formulaReservation ? String(formulaReservation.customFields?.[FORMULA_KEY]) : String(customer.customFields?.[FORMULA_KEY] || '') || undefined,
                lastFormulaDate: formulaReservation?.date,
                lastColorDate: lastColor?.date,
                colorDue: Boolean(lastColor && daysSince(lastColor.date) >= 21 && upcoming.length === 0),
                // Dashboard'daki geri dönüş kuyruğu önce müşteriye özel tarihi
                // kullanır. Böyle bir tarih yoksa sektörün URL ile ilettiği
                // periyoda (örn. 28 gün) göre son ziyaret fallback olur.
                returnRisk: Boolean(
                    upcoming.length === 0
                    && (customer.recallDate
                        ? customer.recallDate.slice(0, 10) <= today
                        : Boolean(lastVisit && daysSince(lastVisit) >= returnDays)),
                ),
            });
        }
        return result;
    }, [allCustomers, payments, reservations, returnDays, today]);

    const isVipCustomer = (customer: Customer, stats?: CustomerStats) =>
        customer.customFields?.kf_vip === true
        || Boolean(stats && (stats.spend >= 5_000 || stats.completed.length >= 8));

    const setSegment = useCallback((nextSegment: Segment) => {
        const next = new URLSearchParams(searchParams);
        if (nextSegment === 'all') next.delete('segment');
        else next.set('segment', nextSegment);
        if (nextSegment !== 'return') next.delete('days');
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        if (!requestedOpenId || customersLoading) return;
        if (allCustomers.some((customer) => customer.id === requestedOpenId)) {
            setSelectedId(requestedOpenId);
        }
        // Parametreyi veri gelmeden tüketmek seçimi ilk boş render'da
        // kaybettiriyordu. Müşteri listesi çözüldükten sonra temizle.
        const next = new URLSearchParams(searchParams);
        next.delete('open');
        setSearchParams(next, { replace: true });
    }, [allCustomers, customersLoading, requestedOpenId, searchParams, setSearchParams]);

    useEffect(() => {
        if (!formOpen) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setFormOpen(false);
            clearForm();
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [formOpen]);

    const customerMatchesSegment = (customer: Customer) => {
        const stats = statsByCustomer.get(customer.id);
        if (segment === 'vip') return isVipCustomer(customer, stats);
        if (segment === 'color') return Boolean(stats?.colorDue);
        if (segment === 'return') return Boolean(stats?.returnRisk);
        if (segment === 'new') return daysSince(customer.createdAt.slice(0, 10)) <= 7;
        return true;
    };

    const listed = useMemo(() => {
        const normalized = query.toLocaleLowerCase('tr').replace(/\s/g, '');
        return allCustomers
            .filter(customerMatchesSegment)
            .filter((customer) => !normalized || `${customer.name}${customer.phone}${customer.email || ''}`
                .toLocaleLowerCase('tr').replace(/\s/g, '').includes(normalized))
            .sort((a, b) => {
                const aNext = statsByCustomer.get(a.id)?.upcoming[0]?.date || '9999';
                const bNext = statsByCustomer.get(b.id)?.upcoming[0]?.date || '9999';
                if (aNext !== bNext) return aNext.localeCompare(bNext);
                return a.name.localeCompare(b.name, 'tr');
            });
        // stats map and segment are intentionally the presentation dependencies.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allCustomers, query, segment, statsByCustomer]);

    useEffect(() => {
        if (requestedOpenId) return;
        if (selectedId && listed.some((customer) => customer.id === selectedId)) return;
        setSelectedId(listed[0]?.id || null);
    }, [listed, requestedOpenId, selectedId]);

    const selected = allCustomers.find((customer) => customer.id === selectedId) || null;
    const selectedStats = selected ? statsByCustomer.get(selected.id) : undefined;

    const segmentCounts = useMemo(() => ({
        all: allCustomers.length,
        vip: allCustomers.filter((customer) => {
            const stats = statsByCustomer.get(customer.id);
            return isVipCustomer(customer, stats);
        }).length,
        color: allCustomers.filter((customer) => statsByCustomer.get(customer.id)?.colorDue).length,
        return: allCustomers.filter((customer) => statsByCustomer.get(customer.id)?.returnRisk).length,
        new: allCustomers.filter((customer) => daysSince(customer.createdAt.slice(0, 10)) <= 7).length,
    }), [allCustomers, statsByCustomer]);

    const totalValue = [...statsByCustomer.values()].reduce((sum, stats) => sum + stats.spend, 0);
    const returning = allCustomers.filter((customer) => (statsByCustomer.get(customer.id)?.completedIn90.length || 0) >= 2).length;
    const retention = allCustomers.length ? Math.round((returning / allCustomers.length) * 100) : 0;

    const clearForm = () => {
        setForm({
            name: '',
            phone: '',
            email: '',
            notes: '',
            hairType: '',
            hairTexture: '',
            allergy: '',
            preference: '',
            formula: '',
        });
        setEditingId(null);
    };

    const openNew = () => {
        clearForm();
        setFormOpen(true);
    };

    const openEdit = (customer: Customer) => {
        const fields = customer.customFields || {};
        setEditingId(customer.id);
        setForm({
            name: customer.name,
            phone: customer.phone,
            email: customer.email || '',
            notes: customer.notes || '',
            hairType: String(fields.sac_tipi || ''),
            hairTexture: String(fields.sac_dokusu || ''),
            allergy: String(fields.alerji || ''),
            preference: String(fields.tercih_notu || ''),
            formula: String(fields[FORMULA_KEY] || statsByCustomer.get(customer.id)?.lastFormula || ''),
        });
        setFormOpen(true);
    };

    const saveCustomer = async () => {
        if (!form.name.trim() || !form.phone.trim() || saving) {
            toast.error('Müşteri adı ve telefon gerekli');
            return;
        }
        const previous = editingId ? allCustomers.find((customer) => customer.id === editingId) : undefined;
        const customFields = {
            ...(previous?.customFields || {}),
            sac_tipi: form.hairType,
            sac_dokusu: form.hairTexture,
            alerji: form.allergy,
            tercih_notu: form.preference,
            [FORMULA_KEY]: form.formula,
        };
        setSaving(true);
        if (editingId) {
            const result = await updateCustomer(editingId, {
                name: form.name.trim(),
                phone: form.phone.trim(),
                email: form.email.trim(),
                notes: form.notes,
                customFields,
            });
            setSaving(false);
            if (!result) return;
            setSelectedId(editingId);
            toast.success('Müşteri kartı güncellendi');
        } else {
            const created = await addCustomer({
                name: form.name.trim(),
                phone: form.phone.trim(),
                email: form.email.trim(),
                notes: form.notes,
                customFields,
            });
            setSaving(false);
            if (!created) return;
            setSelectedId(created.id);
            toast.success('Müşteri salon hafızasına eklendi');
        }
        setFormOpen(false);
        clearForm();
    };

    const customerBadge = (customer: Customer) => {
        const stats = statsByCustomer.get(customer.id);
        if (isVipCustomer(customer, stats)) return { label: 'VIP', className: 'vip', icon: Crown };
        if (stats?.colorDue) return { label: 'Renk zamanı', className: 'color', icon: Droplets };
        if (stats?.returnRisk) return { label: 'Geri kazan', className: 'return', icon: TimerReset };
        if (daysSince(customer.createdAt.slice(0, 10)) <= 7) return { label: 'Yeni', className: 'new', icon: Sparkles };
        return null;
    };

    return (
        <KuaforSuiteFrame
            className="ks-customers-page"
            eyebrow="SALON HAFIZASI"
            title="Müşteriler,"
            accent="her ziyarette daha tanıdık."
            description="Saç profili, renk formülü, tercihler, sadakat ve ziyaret geçmişi tek kartta."
            icon={Users}
            actions={(
                <>
                    <button className="ks-btn ks-btn-ghost" onClick={() => setSegment('return')}><TimerReset size={16} /> Geri dönüş listesi</button>
                    <button className="ks-btn ks-btn-primary" onClick={openNew}><UserPlus size={17} /> Yeni müşteri</button>
                </>
            )}
        >
            <section className="ks-metric-strip">
                <div><span className="ks-metric-icon orange"><Users size={17} /></span><p><small>Toplam müşteri</small><strong>{allCustomers.length}</strong><em>{segmentCounts.new} yeni kayıt</em></p></div>
                <div><span className="ks-metric-icon purple"><Crown size={17} /></span><p><small>VIP müşteri</small><strong>{segmentCounts.vip}</strong><em>değerli müdavimler</em></p></div>
                <div><span className="ks-metric-icon green"><TrendingUp size={17} /></span><p><small>Tekrar ziyaret</small><strong>%{retention}</strong><em>son 90 günde 2+ işlem</em></p></div>
                <div><span className="ks-metric-icon blue"><Gift size={17} /></span><p><small>Müşteri değeri</small><strong className="money">{moneyOf(totalValue)}</strong><em>kasa kayıtlarına göre</em></p></div>
            </section>

            <section className="ks-customer-workspace">
                <aside className="ks-customer-index">
                    <div className="ks-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="İsim, telefon veya e-posta…" />{query && <button aria-label="Aramayı temizle" onClick={() => setQuery('')}><X size={14} /></button>}</div>
                    <nav className="ks-customer-segments">
                        {([
                            ['all', 'Tümü', segmentCounts.all],
                            ['vip', 'VIP', segmentCounts.vip],
                            ['color', 'Renk zamanı', segmentCounts.color],
                            ['return', 'Geri kazan', segmentCounts.return],
                            ['new', 'Yeni', segmentCounts.new],
                        ] as const).map(([key, label, count]) => (
                            <button key={key} className={segment === key ? 'active' : ''} onClick={() => setSegment(key)}>{label}<span>{count}</span></button>
                        ))}
                    </nav>
                    <div className="ks-customer-list">
                        {listed.length === 0 ? (
                            <div className="ks-empty-state small"><span><Search size={19} /></span><h3>Müşteri bulunamadı</h3><p>Arama veya segment filtresini değiştirin.</p></div>
                        ) : listed.map((customer) => {
                            const stats = statsByCustomer.get(customer.id);
                            const badge = customerBadge(customer);
                            const BadgeIcon = badge?.icon;
                            return (
                                <button key={customer.id} className={selected?.id === customer.id ? 'active' : ''} onClick={() => setSelectedId(customer.id)}>
                                    <i>{initialsOf(customer.name)}</i>
                                    <span className="ks-customer-copy">
                                        <b>{customer.name}</b>
                                        <small>{stats?.upcoming[0] ? `${dateLabel(stats.upcoming[0].date, { day: 'numeric', month: 'short' })} · ${stats.upcoming[0].startTime}` : customer.lastVisit ? `Son: ${dateLabel(customer.lastVisit, { day: 'numeric', month: 'short' })}` : 'İlk ziyaret bekleniyor'}</small>
                                    </span>
                                    {badge && <em className={badge.className}>{BadgeIcon && <BadgeIcon size={10} />}{badge.label}</em>}
                                    <ChevronRight size={15} />
                                </button>
                            );
                        })}
                    </div>
                </aside>

                <main className="ks-customer-profile">
                    {!selected || !selectedStats ? (
                        <div className="ks-detail-placeholder"><span><Heart size={24} /></span><h3>Müşteri kartı seçin</h3><p>Saç profili, formüller ve ziyaret hikâyesi burada görünür.</p></div>
                    ) : (
                        <>
                            <header className="ks-profile-hero">
                                <div className="ks-profile-avatar">{initialsOf(selected.name)}<span /></div>
                                <div className="ks-profile-title">
                                    <span className="ks-eyebrow">MÜŞTERİ PROFİLİ · {isVipCustomer(selected, selectedStats) ? 'VIP' : 'SALON'}</span>
                                    <h2>{selected.name}</h2>
                                    <p>{selected.phone}{selected.email ? ` · ${selected.email}` : ''}</p>
                                </div>
                                <div className="ks-profile-actions">
                                    <a className="ks-icon-button" href={`https://wa.me/${selected.phone.replace(/\D/g, '').replace(/^0/, '90')}`} target="_blank" rel="noreferrer" title="WhatsApp"><MessageCircle size={17} /></a>
                                    <button className="ks-icon-button" onClick={() => openEdit(selected)} title="Düzenle"><Edit2 size={17} /></button>
                                    <button className="ks-btn ks-btn-primary" onClick={() => navigate(`/calendar?new=1&customer=${selected.id}`)}><CalendarClock size={16} /> Randevu oluştur</button>
                                </div>
                            </header>

                            <section className="ks-profile-kpis">
                                <div><small>Kayıtlı tahsilat</small><strong>{moneyOf(selectedStats.spend)}</strong><span>kasa hareketlerinden hesaplandı</span></div>
                                <div><small>Son ziyaret</small><strong>{selected.lastVisit ? dateLabel(selected.lastVisit, { day: 'numeric', month: 'short' }) : '—'}</strong><span>{selected.lastVisit ? `${daysSince(selected.lastVisit)} gün önce` : 'henüz ziyaret yok'}</span></div>
                                <div><small>Sıradaki randevu</small><strong>{selectedStats.upcoming[0] ? dateLabel(selectedStats.upcoming[0].date, { day: 'numeric', month: 'short' }) : '—'}</strong><span>{selectedStats.upcoming[0] ? `${selectedStats.upcoming[0].startTime} · ${selectedStats.upcoming[0].service}` : 'planlanmadı'}</span></div>
                                <div className={selectedStats.colorDue ? 'attention' : ''}><small>Renk / bakım dönüşü</small><strong>{selectedStats.lastColorDate ? `${daysSince(selectedStats.lastColorDate)} gün` : '—'}</strong><span>{selectedStats.colorDue ? 'geri dönüş zamanı geldi' : selectedStats.lastColorDate ? 'takipte' : 'renk geçmişi yok'}</span></div>
                            </section>

                            <section className="ks-profile-grid">
                                <article className="ks-hair-card">
                                    <header><span><Sparkles size={16} /></span><div><small>SAÇ PROFİLİ</small><h3>Kişisel salon notları</h3></div><button onClick={() => openEdit(selected)}>Düzenle</button></header>
                                    <div className="ks-hair-attributes">
                                        <span><small>Saç tipi</small><b>{String(selected.customFields?.sac_tipi || 'Belirtilmedi')}</b></span>
                                        <span><small>Doku</small><b>{String(selected.customFields?.sac_dokusu || 'Belirtilmedi')}</b></span>
                                        <span className={selected.customFields?.alerji ? 'warning' : ''}><small>Alerji / hassasiyet</small><b>{String(selected.customFields?.alerji || 'Kayıt yok')}</b></span>
                                        <span><small>Tercih</small><b>{String(selected.customFields?.tercih_notu || selected.notes || 'Kayıt yok')}</b></span>
                                    </div>
                                </article>

                                <article className="ks-formula-card">
                                    <header><span><Droplets size={16} /></span><div><small>RENK HAFIZASI</small><h3>Son kullanılan formül</h3></div></header>
                                    {selectedStats.lastFormula ? (
                                        <>
                                            <blockquote>{selectedStats.lastFormula}</blockquote>
                                            <p><span className="ks-live-dot" /> {selectedStats.lastFormulaDate ? `${dateLabel(selectedStats.lastFormulaDate, { day: 'numeric', month: 'long' })} tarihli işlem` : 'müşteri profilinden'}</p>
                                        </>
                                    ) : (
                                        <div className="ks-inline-empty"><Droplets size={19} /><span><b>Henüz formül kaydı yok</b><small>İlk renk işleminde formül randevuya kaydedilir.</small></span></div>
                                    )}
                                </article>

                                <article className="ks-preference-card">
                                    <header><span><Star size={16} /></span><div><small>TERCİHLER</small><h3>Müşterinin favorileri</h3></div></header>
                                    <div><span><Scissors size={15} /></span><p><small>Favori hizmet</small><b>{selectedStats.favoriteService}</b></p></div>
                                    <div><span><Users size={15} /></span><p><small>Tercih edilen kuaför</small><b>{selectedStats.favoriteStaff}</b></p></div>
                                    <div><span><Tag size={15} /></span><p><small>Ziyaret aralığı ort.</small><b>{averageVisitDays(selectedStats.completed) ? `${averageVisitDays(selectedStats.completed)} gün` : 'Yeni müşteri'}</b></p></div>
                                </article>

                                {loyaltyEnabled && (
                                    <article className="ks-loyalty-card">
                                        <header><span><Gift size={16} /></span><div><small>SADAKAT</small><h3>{settings.loyaltyReward || 'Salon ödülü'}</h3></div></header>
                                        <div className="ks-loyalty-progress" style={{ '--progress': `${Math.min(100, ((selected.loyaltyStamps || 0) / loyaltyThreshold) * 100)}%` } as CSSProperties}><i /></div>
                                        <p><strong>{selected.loyaltyStamps || 0}</strong><span>/ {loyaltyThreshold} damga</span></p>
                                        <button disabled={(selected.loyaltyStamps || 0) < loyaltyThreshold} onClick={() => redeemLoyalty(selected.id, loyaltyThreshold)}>{(selected.loyaltyStamps || 0) >= loyaltyThreshold ? 'Ödülü kullan' : `${Math.max(0, loyaltyThreshold - (selected.loyaltyStamps || 0))} ziyaret kaldı`}</button>
                                    </article>
                                )}
                            </section>

                            <section className="ks-history-card">
                                <header><div><span className="ks-eyebrow">ZİYARET GEÇMİŞİ</span><h3>Hizmet ve formül geçmişi</h3></div><span>{selectedStats.history.length} kayıt</span></header>
                                {selectedStats.history.length === 0 ? (
                                    <div className="ks-inline-empty"><History size={20} /><span><b>Henüz ziyaret kaydı yok</b><small>İlk randevuyu oluşturarak müşteri hikâyesini başlatın.</small></span></div>
                                ) : (
                                    <div className="ks-history-list">
                                        {selectedStats.history.slice(0, 8).map((reservation) => (
                                            <button key={reservation.id} onClick={() => navigate(`/reservations?res=${encodeURIComponent(reservation.id)}`)}>
                                                <span className="ks-history-date"><b>{new Date(`${reservation.date}T12:00:00`).getDate()}</b><small>{new Date(`${reservation.date}T12:00:00`).toLocaleDateString('tr-TR', { month: 'short' })}</small></span>
                                                <i className={reservation.status} style={{ background: reservation.serviceColor || '#FF5A1F' }} />
                                                <span className="ks-history-copy"><b>{reservation.service}</b><small>{reservation.startTime} · {reservation.staffName || 'Atanmadı'}</small></span>
                                                {reservation.customFields?.[FORMULA_KEY] && <em><Droplets size={11} />{String(reservation.customFields[FORMULA_KEY])}</em>}
                                                <span className={`ks-history-status ${reservation.status}`}>{reservation.status === 'completed' ? 'Tamamlandı' : reservation.status === 'cancelled' ? 'İptal' : reservation.date >= today ? 'Planlandı' : 'Geçmiş'}</span>
                                                <ChevronRight size={14} />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <footer className="ks-profile-footer">
                                <button onClick={() => openEdit(selected)}><Edit2 size={14} /> Profili düzenle</button>
                                <button className="archive" onClick={() => { if (window.confirm(`${selected.name} müşteri arşivine taşınsın mı?`)) void deleteCustomer(selected.id); }}>Müşteriyi arşivle</button>
                            </footer>
                        </>
                    )}
                </main>
            </section>

            {formOpen && (
                <KuaforOverlay className="ks-modal-layer" onClick={() => { setFormOpen(false); clearForm(); }}>
                    <section className="ks-modal ks-customer-modal" role="dialog" aria-modal="true" aria-labelledby="ks-customer-form-title" onClick={(event) => event.stopPropagation()}>
                        <header><span><UserPlus size={18} /></span><div><small>SALON HAFIZASI</small><h2 id="ks-customer-form-title">{editingId ? 'Müşteri kartını düzenle' : 'Yeni müşteri ekle'}</h2><p>İletişim ve saç profili bilgileri</p></div><button aria-label="Müşteri penceresini kapat" onClick={() => { setFormOpen(false); clearForm(); }}><X size={17} /></button></header>
                        <div className="ks-modal-body">
                            <div className="ks-form-grid"><label><span>Ad soyad</span><input value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} placeholder="Müşteri adı" /></label><label><span>Telefon</span><input value={form.phone} onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))} placeholder="05xx xxx xx xx" /></label></div>
                            <label><span>E-posta</span><input type="email" value={form.email} onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} placeholder="Opsiyonel" /></label>
                            <div className="ks-form-section"><span><Sparkles size={13} /> SAÇ PROFİLİ</span></div>
                            <div className="ks-form-grid">
                                <label><span>Saç tipi</span><select value={form.hairType} onChange={(event) => setForm((previous) => ({ ...previous, hairType: event.target.value }))}><option value="">Seçin</option>{HAIR_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label>
                                <label><span>Saç dokusu</span><select value={form.hairTexture} onChange={(event) => setForm((previous) => ({ ...previous, hairTexture: event.target.value }))}><option value="">Seçin</option>{HAIR_TEXTURES.map((value) => <option key={value}>{value}</option>)}</select></label>
                            </div>
                            <label className="ks-formula-field"><span><Droplets size={13} /> Son renk formülü</span><input value={form.formula} onChange={(event) => setForm((previous) => ({ ...previous, formula: event.target.value }))} placeholder="Örn. 7.1 + 8.0 / 20 vol" /></label>
                            <label><span>Alerji / hassasiyet</span><input value={form.allergy} onChange={(event) => setForm((previous) => ({ ...previous, allergy: event.target.value }))} placeholder="Kimyasal veya ürün hassasiyeti" /></label>
                            <label><span>Tercih notu</span><input value={form.preference} onChange={(event) => setForm((previous) => ({ ...previous, preference: event.target.value }))} placeholder="Örn. sıcak fön sevmez, katları uzun tut" /></label>
                            <label><span>Genel not</span><textarea rows={2} value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} placeholder="Salon ekibinin bilmesi gerekenler…" /></label>
                            {form.allergy && <div className="ks-form-alert"><AlertTriangle size={15} /><span><b>Hassasiyet kaydı</b><small>Bu bilgi müşteri profilinde görünür tutulacak.</small></span></div>}
                        </div>
                        <footer><button className="ks-btn ks-btn-ghost" onClick={() => { setFormOpen(false); clearForm(); }}>Vazgeç</button><button className="ks-btn ks-btn-primary" disabled={saving} onClick={saveCustomer}>{saving ? 'Kaydediliyor…' : editingId ? 'Değişiklikleri kaydet' : 'Müşteriyi ekle'} <ArrowRight size={15} /></button></footer>
                    </section>
                </KuaforOverlay>
            )}
        </KuaforSuiteFrame>
    );
}
