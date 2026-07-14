import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, CalendarClock, Clock, CreditCard, MessageCircle, MoreHorizontal, Plus } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { useStaff } from '@/hooks/useStaff';
import { useCustomers } from '@/hooks/useCustomers';
import { useResources } from '@/hooks/useResources';
import { useDentalChartsForCustomers } from '@/hooks/useDentalChart';
import { MiniArch } from '@/components/dental/ToothSVG';
import { ToothIcon } from '@/components/dental/ToothIcon';
import { priceForReservation } from '@/lib/appointmentFlow';
import { todayISO, formatDateEU } from '@/utils/date';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import { LueraButton } from '@/components/ui/LueraButton';
import type { Customer, DentalRecord, Reservation } from '@/types';

// Telefonu WhatsApp (wa.me) formatına çevir — TR numaraları için
function waLink(phone: string, text: string) {
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('0')) p = '9' + p;
    if (!p.startsWith('90')) p = '90' + p;
    return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

// Medikal uyarı — custom fields (alerji / ilaçlar / kronik) doluysa
function medicalAlertOf(c: Customer | undefined): string | null {
    const cf = c?.customFields || {};
    const parts = [
        cf.alerji ? `Alerji: ${cf.alerji}` : null,
        cf.ilaclar ? `İlaç: ${cf.ilaclar}` : null,
        cf.kronik ? `Kronik: ${cf.kronik}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
}

// v5 durum makinesi: bekliyor → onaylandı → geldi → tedavide → tamamlandı → ödendi.
// geldi = customer_arrived_at (032), tedavide = arrived_at ("Başladı", 033).
type ApptStatus = 'bekliyor' | 'onaylandi' | 'geldi' | 'tedavide' | 'tamamlandi' | 'odendi' | 'iptal';
function apptStatusOf(r: Reservation): ApptStatus {
    if (r.status === 'cancelled') return 'iptal';
    if (r.status === 'completed') return r.isPaid ? 'odendi' : 'tamamlandi';
    if (r.status === 'pending') return 'bekliyor';
    if (r.arrivedAt) return 'tedavide';
    if (r.customerArrivedAt) return 'geldi';
    return 'onaylandi';
}
const STATUS_META: Record<ApptStatus, { label: string; fg: string; bg: string; bar: string; action?: string }> = {
    bekliyor:   { label: 'Onay Bekliyor', fg: 'var(--dc-amber)',  bg: 'var(--dc-amber-bg)',    bar: 'var(--dc-amber)',  action: 'Onayla' },
    onaylandi:  { label: 'Bekleniyor',    fg: 'var(--dc-blue)',   bg: 'var(--dc-blue-bg)',     bar: 'var(--dc-blue)',   action: 'Geldi' },
    geldi:      { label: 'Hasta Geldi',   fg: 'var(--dc-ink)',    bg: 'var(--dc-surface3)',    bar: 'var(--dc-ink)',    action: 'Tedaviyi Başlat' },
    tedavide:   { label: 'Tedavide',      fg: 'var(--dc-orange)', bg: 'var(--dc-orange-soft)', bar: 'var(--dc-orange)', action: 'Tedaviyi Bitir' },
    tamamlandi: { label: 'Tamamlandı',    fg: 'var(--dc-green)',  bg: 'var(--dc-green-bg)',    bar: 'var(--dc-green)',  action: 'Ödeme Al' },
    odendi:     { label: 'Ödendi',        fg: 'var(--dc-green)',  bg: 'var(--dc-green-bg)',    bar: 'var(--dc-green)' },
    iptal:      { label: 'İptal',         fg: 'var(--dc-muted)',  bg: 'var(--dc-surface2)',    bar: 'var(--dc-muted2)' },
};

// Diş şeması özet renkleri — README §Design Tokens ile birebir
const CHART_COLORS: Record<string, string> = {
    curuk: 'var(--dc-red2)', dolgu: 'var(--dc-blue)', kanal: 'var(--dc-purple)',
    kron: 'var(--dc-amber)', implant: 'var(--dc-green)', cekildi: 'var(--dc-muted2)',
};
const CHART_LABEL: Record<string, string> = {
    curuk: 'çürük', dolgu: 'dolgu', kanal: 'kanal', kron: 'kron', implant: 'implant', cekildi: 'çekilmiş',
};
const CHART_LEGEND: { key: keyof typeof CHART_COLORS; label: string }[] = [
    { key: 'curuk', label: 'Çürük' }, { key: 'dolgu', label: 'Dolgu' }, { key: 'kanal', label: 'Kanal' },
    { key: 'kron', label: 'Kron' }, { key: 'implant', label: 'İmplant' }, { key: 'cekildi', label: 'Çekilmiş' },
];

// Diş hekimi sektörü dashboard yüzü — v5 sadeleştirmesi: hero + Hasta Akışı
// (satır başına TEK bağlamsal aksiyon) + Diş Şeması Özeti solda; sağda tek
// "İlgi Gerektirenler" iş kuyruğu (medikal > ödeme > recall).
export function DisDashboard() {
    const navigate = useNavigate();
    const { dark } = useTheme();
    const { reservations, settings, getTodayReservations, updateReservation, ensureReservationCustomer } = useReservations();
    const { staff } = useStaff();
    const { allCustomers } = useCustomers();
    const { resources } = useResources();

    const now = useMemo(() => new Date(), []);
    const todayStr = todayISO();
    const weekday = now.toLocaleDateString('tr-TR', { weekday: 'long' });
    const dateLabel = now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

    const todayReservations = useMemo(
        () => [...getTodayReservations()].sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [getTodayReservations],
    );
    const activeToday = useMemo(
        () => todayReservations.filter((r) => r.status !== 'cancelled'),
        [todayReservations],
    );
    const inClinic = activeToday.filter((r) => ['geldi', 'tedavide'].includes(apptStatusOf(r))).length;
    const waiting = activeToday.filter((r) => apptStatusOf(r) === 'bekliyor').length;
    const nextUp = activeToday.find((r) => !['tamamlandi', 'odendi'].includes(apptStatusOf(r)));

    // Bekleyen ödemeler — tamamlanmış ama ödenmemiş randevular, hasta bazında toplanır
    const outstanding = useMemo(() => {
        const byCustomer = new Map<string, { customerId: string; name: string; amount: number; reasons: Set<string> }>();
        for (const r of reservations) {
            if (r.status !== 'completed' || r.isPaid) continue;
            const price = priceForReservation(r, settings.services);
            if (price <= 0) continue;
            const cur = byCustomer.get(r.customerId) ?? { customerId: r.customerId, name: r.customerName, amount: 0, reasons: new Set<string>() };
            cur.amount += price;
            cur.reasons.add(r.service);
            byCustomer.set(r.customerId, cur);
        }
        return [...byCustomer.values()]
            .map((v) => ({ customerId: v.customerId, name: v.name, amount: v.amount, reason: [...v.reasons].join(', ') }))
            .sort((a, b) => b.amount - a.amount);
    }, [reservations, settings.services]);

    // Bugün görevli personel — workingHours tanımsızsa her zaman aktif kabul edilir
    const activeStaff = useMemo(() => staff.filter((s) => s.isActive), [staff]);
    const todayDow = now.getDay();
    const onDutyIds = useMemo(() => new Set(
        activeStaff.filter((s) => {
            if (!s.workingHours || s.workingHours.length === 0) return true;
            const wh = s.workingHours.find((w) => w.day === todayDow);
            return wh ? !wh.isOff : true;
        }).map((s) => s.id),
    ), [activeStaff, todayDow]);

    // Bugün gelen hastaların diş şeması özeti — tek sorguda toplu çekilir
    const todayCustomerIds = useMemo(
        () => [...new Set(activeToday.map((r) => r.customerId).filter(Boolean))],
        [activeToday],
    );
    const { currentFor } = useDentalChartsForCustomers(todayCustomerIds);
    const chartSummaries = useMemo(() => {
        return todayCustomerIds
            .map((cid) => {
                const r = activeToday.find((x) => x.customerId === cid);
                const current = currentFor(cid);
                if (!r) return null;
                const counts = new Map<string, number>();
                for (const rec of current.values()) {
                    if (rec.status === 'saglam') continue;
                    counts.set(rec.status, (counts.get(rec.status) || 0) + 1);
                }
                const summary = current.size === 0
                    ? 'Henüz işaret yok'
                    : [...counts.entries()].map(([k, n]) => `${n} ${CHART_LABEL[k] || k}`).join(' · ') || 'Sağlam';
                return { customerId: cid, reservationId: r.id, name: r.customerName, summary, current };
            })
            .filter((x): x is { customerId: string; reservationId: string; name: string; summary: string; current: Map<number, DentalRecord> } => x !== null);
    }, [todayCustomerIds, activeToday, currentFor]);

    const colorFor = (status: string) => CHART_COLORS[status] || 'var(--dc-surface3)';

    // Kontrol zamanı (recall) — tarihi geçmiş veya 7 gün içinde dolacak hastalar
    const recallDue = useMemo(() => {
        const limit = new Date(now); limit.setDate(limit.getDate() + 7);
        const limitStr = limit.toISOString().slice(0, 10);
        return allCustomers
            .filter((c) => c.recallDate && c.recallDate <= limitStr)
            .sort((a, b) => (a.recallDate || '').localeCompare(b.recallDate || ''));
    }, [allCustomers, now]);

    const customerById = useMemo(() => new Map(allCustomers.map((c) => [c.id, c])), [allCustomers]);
    const resourceById = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);

    const openChart = (customerId?: string, reservationId?: string) => {
        if (!customerId) { navigate('/dental-chart'); return; }
        const query = new URLSearchParams({ patient: customerId });
        if (reservationId) query.set('reservation', reservationId);
        navigate(`/dental-chart?${query.toString()}`);
    };
    const openCustomer = (customerId?: string) => customerId ? navigate(`/customers?open=${customerId}`) : navigate('/customers');

    // Eski randevularda customer_id boş olabiliyor — telefon eşleşmesiyle hastayı bul
    const customerIdForReservation = (r: Reservation) =>
        r.customerId || allCustomers.find((c) => c.phone.replace(/\s+/g, '') === (r.customerPhone || '').replace(/\s+/g, ''))?.id || '';

    // Eski sürümde oluşturulmuş, customer_id'si boş bugünkü randevuları
    // sırayla onar. Yeni randevular useReservations içinde doğrudan bağlanır.
    useEffect(() => {
        const missing = activeToday.filter((r) => !r.customerId && r.customerPhone?.trim());
        if (missing.length === 0) return;
        let cancelled = false;
        void (async () => {
            for (const reservation of missing) {
                if (cancelled) return;
                await ensureReservationCustomer(reservation);
            }
        })();
        return () => { cancelled = true; };
    }, [activeToday, ensureReservationCustomer]);

    const [openingReservation, setOpeningReservation] = useState<string | null>(null);
    const openReservationTarget = async (r: Reservation, target: 'customer' | 'chart') => {
        if (openingReservation) return;
        setOpeningReservation(r.id);
        const customerId = await ensureReservationCustomer(r);
        setOpeningReservation(null);
        if (!customerId) {
            toast.error('Bu randevu için hasta kaydı oluşturulamadı');
            return;
        }
        if (target === 'chart') openChart(customerId, r.id);
        else openCustomer(customerId);
    };

    // Tek bağlamsal aksiyon — satırdaki buton akışı bir adım ilerletir
    const [advancing, setAdvancing] = useState<string | null>(null);
    const advance = async (r: Reservation) => {
        const st = apptStatusOf(r);
        if (advancing) return;
        if (st === 'tamamlandi') { navigate(`/kasa?reservation=${r.id}`); return; }
        setAdvancing(r.id);
        if (st === 'bekliyor') await updateReservation(r.id, { status: 'confirmed' });
        else if (st === 'onaylandi') await updateReservation(r.id, { customerArrivedAt: new Date().toISOString() });
        else if (st === 'geldi') await updateReservation(r.id, { arrivedAt: new Date().toISOString() });
        else if (st === 'tedavide') await updateReservation(r.id, { status: 'completed' });
        setAdvancing(null);
    };

    // Hasta arama (v5 topbar) — hero içinde, seçilen hasta detayına gider
    const [searchQ, setSearchQ] = useState('');
    const searchHits = useMemo(() => {
        const q = searchQ.trim().toLowerCase();
        if (!q) return [];
        return allCustomers
            .filter((c) => c.name.toLowerCase().includes(q) || c.phone.replace(/\s+/g, '').includes(q.replace(/\s+/g, '')))
            .slice(0, 6);
    }, [searchQ, allCustomers]);

    // ⋯ menüsü — ikincil işlemler (hasta detayı, iptal)
    const [moreMenu, setMoreMenu] = useState<{ id: string; x: number; y: number } | null>(null);
    const moreRes = moreMenu ? activeToday.find((r) => r.id === moreMenu.id) : undefined;

    // İlgi Gerektirenler — tek iş kuyruğu: medikal (0) > ödeme (1) > recall (2)
    const queue = useMemo(() => {
        const items: { pri: number; type: 'med' | 'pay' | 'recall'; key: string; title: string; sub: string; amt?: number; customerId?: string; phone?: string }[] = [];
        const seenMed = new Set<string>();
        for (const r of activeToday) {
            if (['tamamlandi', 'odendi'].includes(apptStatusOf(r))) continue;
            const cid = customerIdForReservation(r);
            if (!cid || seenMed.has(cid)) continue;
            const alert = medicalAlertOf(customerById.get(cid));
            if (alert) { seenMed.add(cid); items.push({ pri: 0, type: 'med', key: `m-${r.id}`, title: r.customerName, sub: `${alert} — bugün ${r.startTime} randevusu var`, customerId: cid }); }
        }
        for (const o of outstanding) items.push({ pri: 1, type: 'pay', key: `p-${o.customerId}`, title: o.name, sub: `Bekleyen ödeme — ${o.reason}`, amt: o.amount, customerId: o.customerId });
        for (const c of recallDue) items.push({ pri: 2, type: 'recall', key: `r-${c.id}`, title: c.name, sub: `Kontrol çağrısı — ${formatDateEU(c.recallDate!)}${c.recallDate! < todayStr ? ' · gecikti' : ''}`, customerId: c.id, phone: c.phone });
        return items.sort((a, b) => a.pri - b.pri);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeToday, outstanding, recallDue, customerById, todayStr]);

    const QUEUE_ICON: Record<'med' | 'pay' | 'recall', { Icon: typeof AlertTriangle; cls: string }> = {
        med: { Icon: AlertTriangle, cls: 'bg-[var(--dc-red-bg)] text-[var(--dc-red2)]' },
        pay: { Icon: CreditCard, cls: 'bg-[var(--dc-red-bg)] text-[var(--dc-red2)]' },
        recall: { Icon: CalendarClock, cls: 'bg-[var(--dc-amber-bg)] text-[var(--dc-amber)]' },
    };

    return (
        <div className={cn('dash-theme flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--dc-page)]', dark && 'dark')}>
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <div className="max-w-[1480px] mx-auto space-y-4">

                    {/* HERO */}
                    <section className="relative overflow-hidden rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_2px_rgba(14,14,14,0.04),0_2px_8px_rgba(14,14,14,0.04)]">
                        <div className="absolute -right-10 -top-10 w-[180px] h-[180px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,90,31,.08), transparent 70%)' }} />
                        <div className="relative flex flex-col lg:flex-row lg:items-center gap-5 p-6 lg:px-[26px] lg:py-[22px]">
                            <div className="flex-shrink-0 w-[60px] h-[60px] rounded-2xl bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] flex items-center justify-center">
                                <ToothIcon className="w-[26px] h-[26px]" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-bold text-[var(--dc-orange)] uppercase tracking-[0.14em] mb-1.5">{weekday} · {dateLabel}</p>
                                <h1 className="text-[20px] font-extrabold text-[var(--dc-ink)] tracking-[-0.03em] leading-[1.15] mb-1">
                                    {activeToday.length === 0
                                        ? 'Bugün için planlanmış hasta yok'
                                        : nextUp
                                            ? <>Bugün {activeToday.length} hasta var, sıradaki {nextUp.startTime}'da</>
                                            : `Bugünkü ${activeToday.length} randevunun tümü tamamlandı`}
                                </h1>
                                <p className="text-[13.5px] text-[var(--dc-muted)]">
                                    <b className="text-[var(--dc-ink)]">{inClinic} hasta</b> klinikte
                                    {waiting > 0 && <> · <b className="text-[var(--dc-ink)]">{waiting} randevu</b> onay bekliyor</>}
                                </p>
                            </div>
                            {/* Hasta ara (v5) — isim/telefon, seçilen hasta detayına gider */}
                            <div className="relative flex-shrink-0 w-full lg:w-[220px]">
                                <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Hasta ara…" aria-label="Hasta ara"
                                    onBlur={() => setTimeout(() => setSearchQ(''), 180)}
                                    className="w-full px-4 py-2.5 rounded-full border border-transparent bg-[var(--dc-surface2)] text-[13px] font-semibold text-[var(--dc-ink)] outline-none focus:border-[var(--dc-border2)] focus:bg-[var(--dc-page)] transition-colors placeholder:text-[var(--dc-muted2)]" />
                                {searchHits.length > 0 && (
                                    <div className="absolute z-30 left-0 right-0 top-[calc(100%+6px)] rounded-[11px] bg-[var(--dc-surface)] border border-[var(--dc-border2)] shadow-[0_4px_16px_rgba(14,14,14,0.11),0_16px_48px_rgba(14,14,14,0.10)] overflow-hidden" role="listbox">
                                        {searchHits.map((c) => (
                                            <button key={c.id} type="button" onMouseDown={() => { setSearchQ(''); openCustomer(c.id); }}
                                                className="w-full text-left px-3.5 py-2.5 hover:bg-[var(--dc-surface2)] transition-colors flex items-center justify-between gap-2">
                                                <span className="text-[12.5px] font-semibold text-[var(--dc-ink)] truncate">{c.name}</span>
                                                <span className="font-mono text-[10.5px] text-[var(--dc-muted)] flex-shrink-0">{c.phone}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {activeStaff.length > 0 && (
                                <div className="flex items-center gap-2 flex-shrink-0 pl-5 border-l border-[var(--dc-border)]">
                                    <div className="flex">
                                        {activeStaff.slice(0, 4).map((s, i) => (
                                            <div key={s.id} title={`${s.name}${onDutyIds.has(s.id) ? ' — aktif' : ' — izinli'}`}
                                                className={cn('relative w-[30px] h-[30px] rounded-full bg-[var(--dc-surface3)] border-2 border-[var(--dc-surface)] grid place-items-center text-[11px] font-extrabold text-[var(--dc-ink)]', i > 0 && '-ml-[9px]')}>
                                                {s.name.slice(0, 2).toUpperCase()}
                                                {onDutyIds.has(s.id) && <span className="absolute -bottom-px -right-px w-2 h-2 rounded-full bg-[var(--dc-green)] border-2 border-[var(--dc-surface)]" />}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="text-[10.5px] text-[var(--dc-muted2)] font-semibold leading-[1.3] max-w-[80px]">
                                        {activeStaff.length} hekim/asistan · bugün {[...onDutyIds].length} aktif
                                    </div>
                                </div>
                            )}
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <LueraButton onClick={() => openChart()} variant={dark ? 'ghost-dark' : 'ghost'} size="md">Diş Şeması</LueraButton>
                                <LueraButton onClick={() => navigate('/calendar?new=1')} variant="ink" size="md"><Plus className="w-[14px] h-[14px]" />Yeni Randevu</LueraButton>
                            </div>
                        </div>
                    </section>

                    {/* v5 GRID: sol = akış + şema özeti, sağ = tek iş kuyruğu */}
                    <section className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start">
                        <div className="flex flex-col gap-4 min-w-0">
                            {/* Bugünkü Hasta Akışı */}
                            <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_2px_rgba(14,14,14,0.04),0_2px_8px_rgba(14,14,14,0.04)] overflow-hidden">
                                <div className="flex items-center gap-[11px] px-5 py-4 border-b border-[var(--dc-border)]">
                                    <div className="w-8 h-8 rounded-[9px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] grid place-items-center flex-shrink-0"><Clock className="w-4 h-4" /></div>
                                    <div>
                                        <div className="text-[13.5px] font-bold tracking-[-0.01em] text-[var(--dc-ink)]">Bugünkü Hasta Akışı</div>
                                        <div className="text-[11px] text-[var(--dc-muted)] mt-px">Saat sırasına göre — satırdaki buton sıradaki adımı yapar</div>
                                    </div>
                                    <button onClick={() => navigate('/calendar')} className="ml-auto text-xs font-semibold text-[var(--dc-orange)] hover:bg-[var(--dc-orange-soft)] px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 flex-shrink-0">
                                        Takvime Git <ArrowRight className="w-3 h-3" />
                                    </button>
                                </div>
                                <div className="p-3.5 pt-2 flex flex-col gap-1.5 min-h-[60px]">
                                    {activeToday.length === 0 ? (
                                        <div className="py-6 text-center text-[12px] text-[var(--dc-muted2)]">Bugün için randevu yok</div>
                                    ) : activeToday.map((r) => {
                                        const st = apptStatusOf(r);
                                        const m = STATUS_META[st];
                                        const cid = customerIdForReservation(r);
                                        const alert = medicalAlertOf(customerById.get(cid));
                                        const unit = r.resourceId ? resourceById.get(r.resourceId)?.name : undefined;
                                        return (
                                            <div key={r.id} className="flex items-center gap-3 px-3 py-3 rounded-[11px] border border-transparent transition-colors hover:bg-[var(--dc-surface2)] hover:border-[var(--dc-border)]">
                                                <div className="w-[50px] flex-shrink-0 text-right">
                                                    <div className="font-mono text-[15px] font-extrabold tracking-[-0.02em] text-[var(--dc-ink)]">{r.startTime}</div>
                                                    <div className="font-mono text-[10.5px] text-[var(--dc-muted2)]">{r.endTime}</div>
                                                </div>
                                                <div className="w-[3px] self-stretch rounded flex-shrink-0" style={{ background: m.bar }} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <button onClick={() => void openReservationTarget(r, 'customer')}
                                                            disabled={openingReservation === r.id}
                                                            className="text-[14px] font-bold tracking-[-0.01em] text-[var(--dc-ink)] truncate hover:text-[var(--dc-orange)] transition-colors text-left disabled:opacity-50">
                                                            {r.customerName}
                                                        </button>
                                                        {alert && <span title={alert} className="flex-shrink-0 text-[var(--dc-red2)]"><AlertTriangle className="w-[13px] h-[13px]" /></span>}
                                                    </div>
                                                    <div className="text-[12px] text-[var(--dc-muted)] mt-0.5 flex items-center gap-1.5 flex-wrap">
                                                        <span>{r.service}</span>
                                                        {r.staffName && <><span className="w-[3px] h-[3px] rounded-full bg-[var(--dc-muted2)]" /><span>{r.staffName}</span></>}
                                                        {unit && <><span className="w-[3px] h-[3px] rounded-full bg-[var(--dc-muted2)]" /><span>{unit}</span></>}
                                                    </div>
                                                </div>
                                                <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 inline-flex items-center gap-1.5" style={{ color: m.fg, background: m.bg }}>
                                                    <span className="w-[5px] h-[5px] rounded-full" style={{ background: 'currentColor' }} />{m.label}
                                                </span>
                                                {m.action ? (
                                                    <button onClick={() => advance(r)} disabled={advancing === r.id}
                                                        className={cn('flex-shrink-0 text-[12px] font-bold px-4 h-[38px] rounded-full text-white transition-colors disabled:opacity-50',
                                                            st === 'tamamlandi' ? 'bg-[var(--dc-orange)] hover:opacity-90' : 'bg-[var(--dc-ink)] hover:bg-[var(--dc-orange)]')}
                                                        aria-label={`${m.action}: ${r.customerName}`}>
                                                        {m.action}
                                                    </button>
                                                ) : (
                                                    <span className="flex-shrink-0 w-[38px] text-center text-[var(--dc-green)] font-extrabold">✓</span>
                                                )}
                                                <button onClick={(e) => { e.stopPropagation(); setMoreMenu({ id: r.id, x: e.clientX, y: e.clientY }); }}
                                                    aria-label="Diğer işlemler"
                                                    className="flex-shrink-0 w-[34px] h-[34px] rounded-[9px] grid place-items-center text-[var(--dc-muted2)] hover:bg-[var(--dc-surface3)] hover:text-[var(--dc-ink)] transition-colors">
                                                    <MoreHorizontal className="w-4 h-4" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Diş Şeması Özeti */}
                            <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_2px_rgba(14,14,14,0.04),0_2px_8px_rgba(14,14,14,0.04)] overflow-hidden">
                                <div className="flex items-center gap-[11px] px-5 py-4 border-b border-[var(--dc-border)]">
                                    <div className="w-8 h-8 rounded-[9px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] grid place-items-center flex-shrink-0"><ToothIcon className="w-[15px] h-[15px]" /></div>
                                    <div><div className="text-[13.5px] font-bold tracking-[-0.01em] text-[var(--dc-ink)]">Diş Şeması Özeti</div><div className="text-[11px] text-[var(--dc-muted)] mt-px">Bugün gelen hastalar — karta tıklayınca tam şema açılır</div></div>
                                    <button onClick={() => openChart()} className="ml-auto text-xs font-semibold text-[var(--dc-orange)] hover:bg-[var(--dc-orange-soft)] px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0">Tümü →</button>
                                </div>
                                {chartSummaries.length === 0 ? (
                                    <div className="py-8 text-center text-[12px] text-[var(--dc-muted2)]">Bugün chart güncellemesi yok</div>
                                ) : (
                                    <>
                                        <div className="flex gap-3 p-3.5 overflow-x-auto">
                                            {chartSummaries.map((c) => (
                                                <div key={c.customerId} onClick={() => openChart(c.customerId, c.reservationId)} role="button" tabIndex={0}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') openChart(c.customerId, c.reservationId); }}
                                                    className="flex-shrink-0 w-[182px] border border-[var(--dc-border)] hover:border-[var(--dc-border2)] rounded-[11px] p-[11px] bg-[var(--dc-surface2)] cursor-pointer transition-all hover:shadow-[0_1px_2px_rgba(14,14,14,0.04),0_2px_8px_rgba(14,14,14,0.04)] hover:-translate-y-px">
                                                    <div className="text-[12.5px] font-bold text-[var(--dc-ink)] mb-px truncate">{c.name}</div>
                                                    <div className="text-[10.5px] text-[var(--dc-muted)] mb-2 truncate">{c.summary}</div>
                                                    <MiniArch current={c.current} toothSize={15} colorFor={colorFor} />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex flex-wrap gap-x-[11px] gap-y-[5px] px-3.5 pb-3.5">
                                            {CHART_LEGEND.map((l) => (
                                                <div key={l.key} className="flex items-center gap-1 text-[10px] text-[var(--dc-muted)] font-semibold">
                                                    <span className="w-[8px] h-[8px] rounded-[2px] flex-shrink-0" style={{ background: CHART_COLORS[l.key] }} />
                                                    {l.label}
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* İlgi Gerektirenler — tek iş kuyruğu */}
                        <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_2px_rgba(14,14,14,0.04),0_2px_8px_rgba(14,14,14,0.04)] overflow-hidden">
                            <div className="flex items-center gap-[11px] px-5 py-4 border-b border-[var(--dc-border)]">
                                <div className="w-8 h-8 rounded-[9px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] grid place-items-center flex-shrink-0"><AlertTriangle className="w-4 h-4" /></div>
                                <div><div className="text-[13.5px] font-bold tracking-[-0.01em] text-[var(--dc-ink)]">İlgi Gerektirenler</div><div className="text-[11px] text-[var(--dc-muted)] mt-px">Öncelik sırasına göre iş kuyruğu</div></div>
                                <span className="ml-auto font-mono text-[11px] text-[var(--dc-muted)]">{queue.length} kayıt</span>
                            </div>
                            {queue.length === 0 ? (
                                <div className="py-8 text-center text-[12px] text-[var(--dc-muted2)]">Bekleyen iş yok — her şey yolunda</div>
                            ) : (
                                <div className="p-2.5 flex flex-col gap-1.5">
                                    {queue.map((it) => {
                                        const { Icon, cls } = QUEUE_ICON[it.type];
                                        return (
                                            <div key={it.key} className="flex items-center gap-[11px] px-[11px] py-[10px] rounded-[11px] hover:bg-[var(--dc-surface2)] transition-colors">
                                                <span className={cn('w-8 h-8 rounded-[9px] grid place-items-center flex-shrink-0', cls)}><Icon className="w-[15px] h-[15px]" /></span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <button onClick={() => openCustomer(it.customerId)} className="text-[13px] font-bold text-[var(--dc-ink)] truncate hover:text-[var(--dc-orange)] transition-colors text-left">{it.title}</button>
                                                        {it.amt !== undefined && <span className="font-mono text-[12px] font-extrabold text-[var(--dc-red2)] flex-shrink-0">{it.amt.toLocaleString('tr-TR')} ₺</span>}
                                                    </div>
                                                    <div className="text-[11px] text-[var(--dc-muted)] mt-px leading-[1.35]">{it.sub}</div>
                                                </div>
                                                {it.type === 'recall' && it.phone && (
                                                    <a href={waLink(it.phone, `Merhaba ${it.title}, diş kontrol randevunuzun zamanı geldi. Uygun olduğunuz bir gün için dönüş yapabilir misiniz?`)}
                                                        target="_blank" rel="noreferrer"
                                                        className="flex-shrink-0 inline-flex items-center gap-1 text-[11.5px] font-bold px-3 h-[34px] rounded-full border border-[var(--dc-border2)] text-[var(--dc-ink)] hover:border-[var(--dc-ink)] hover:bg-[var(--dc-surface2)] transition-colors">
                                                        <MessageCircle className="w-3 h-3" /> Hatırlat
                                                    </a>
                                                )}
                                                {it.type === 'pay' && (
                                                    <button onClick={() => navigate('/kasa')}
                                                        className="flex-shrink-0 text-[11.5px] font-bold px-3 h-[34px] rounded-full border border-[var(--dc-border2)] text-[var(--dc-ink)] hover:border-[var(--dc-ink)] hover:bg-[var(--dc-surface2)] transition-colors">
                                                        Ödeme Al
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </div>

            {/* ⋯ menüsü */}
            {moreMenu && moreRes && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setMoreMenu(null)} />
                    <div className="fixed z-50 rounded-[11px] bg-[var(--dc-surface)] border border-[var(--dc-border2)] shadow-[0_8px_24px_rgba(14,14,14,0.10),0_24px_64px_rgba(14,14,14,0.14)] py-1 min-w-[170px]"
                        style={{ left: Math.min(moreMenu.x, window.innerWidth - 185), top: Math.min(moreMenu.y + 6, window.innerHeight - 140) }}>
                        <button onClick={() => { setMoreMenu(null); void openReservationTarget(moreRes, 'customer'); }}
                            className="w-full text-left px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--dc-ink)] hover:bg-[var(--dc-surface2)] transition-colors">Hasta Detayı</button>
                        <button onClick={() => { setMoreMenu(null); void openReservationTarget(moreRes, 'chart'); }}
                            className="w-full text-left px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--dc-ink)] hover:bg-[var(--dc-surface2)] transition-colors">Diş Şeması</button>
                        <button onClick={async () => { setMoreMenu(null); await updateReservation(moreRes.id, { status: 'cancelled' }); }}
                            className="w-full text-left px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--dc-red2)] hover:bg-[var(--dc-red-bg)] transition-colors">İptal Et</button>
                    </div>
                </>
            )}
        </div>
    );
}
