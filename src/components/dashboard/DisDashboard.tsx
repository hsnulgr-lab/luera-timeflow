import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, CalendarClock, Check, CheckCircle2, Clock, CreditCard, MessageCircle, MoreHorizontal, Plus, Search } from 'lucide-react';
import { useReservations } from '@/hooks/useReservations';
import { useStaff } from '@/hooks/useStaff';
import { useCustomers } from '@/hooks/useCustomers';
import { useResources } from '@/hooks/useResources';
import { usePayments } from '@/hooks/usePayments';
import { useCashEnabled } from '@/hooks/useModules';
import { useDentalChartsForCustomers } from '@/hooks/useDentalChart';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { MiniArch } from '@/components/dental/ToothSVG';
import { ToothIcon } from '@/components/dental/ToothIcon';
import { priceForReservation } from '@/lib/appointmentFlow';
import { sendRecallReminder } from '@/lib/recallReminder';
import { todayISO, formatDateEU } from '@/utils/date';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import { LueraButton } from '@/components/ui/LueraButton';
import type { Customer, DentalRecord, Reservation } from '@/types';


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
type BarColor = 'amber' | 'blue' | 'green' | 'orange' | 'gray';
const STATUS_META: Record<ApptStatus, { label: string; pill: 'amber' | 'blue' | 'green' | 'red' | 'gray'; bar: BarColor; action?: string; primary?: boolean }> = {
    bekliyor:   { label: 'Onay Bekliyor', pill: 'amber', bar: 'amber',  action: 'Onayla' },
    onaylandi:  { label: 'Bekleniyor',    pill: 'gray',  bar: 'gray',   action: 'Geldi' },
    geldi:      { label: 'Hasta Geldi',   pill: 'green', bar: 'orange', action: 'Muayeneyi Başlat', primary: true },
    tedavide:   { label: 'Muayenede',     pill: 'blue',  bar: 'blue',   action: 'Muayeneyi Aç' },
    tamamlandi: { label: 'Tamamlandı',    pill: 'green', bar: 'green',  action: 'Ödeme Al', primary: true },
    odendi:     { label: 'Ödendi',        pill: 'gray',  bar: 'green' },
    iptal:      { label: 'İptal',         pill: 'gray',  bar: 'gray' },
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

const fmtTL = (n: number) => `₺${Math.round(n).toLocaleString('tr-TR')}`;

// Diş hekimi sektörü dashboard yüzü — v8 "Kokpit": üstte canlı Şu An bandı
// (koltuklar + bekleme odası + sıradaki CTA), günün nabzı şeridi, altta hasta
// akışı (yolculuk adım rozetleriyle) + şema özeti + tek iş kuyruğu. Tüm butonlar
// mevcut durum makinesine ve gerçek veriye bağlı.
export function DisDashboard() {
    const navigate = useNavigate();
    const { dark } = useTheme();
    const { user } = useAuth();
    const { reservations, settings, getTodayReservations, updateReservation, ensureReservationCustomer } = useReservations();
    const { staff } = useStaff();
    const { allCustomers } = useCustomers();
    const { resources } = useResources();
    const { payments } = usePayments();
    const cashOn = useCashEnabled();

    // Canlı sayaçlar (koltuk süresi, gecikme) dakikada bir tazelensin.
    const [nowTick, setNowTick] = useState(() => new Date());
    useEffect(() => {
        const id = window.setInterval(() => setNowTick(new Date()), 60000);
        return () => window.clearInterval(id);
    }, []);

    const now = nowTick;
    const todayStr = todayISO();
    const weekday = now.toLocaleDateString('tr-TR', { weekday: 'long' });
    const dateLabel = now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

    // "Benim Hastalarım" — giriş yapan kullanıcının personel kaydı (e-posta eşleşmesi)
    const myStaffId = useMemo(
        () => staff.find((s) => s.email && user?.email && s.email.toLowerCase() === user.email.toLowerCase())?.id,
        [staff, user?.email],
    );
    const [mineOnly, setMineOnly] = useState(false);
    const mineActive = mineOnly && Boolean(myStaffId);

    const todayReservations = useMemo(
        () => [...getTodayReservations()].sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [getTodayReservations],
    );
    const activeTodayAll = useMemo(
        () => todayReservations.filter((r) => r.status !== 'cancelled'),
        [todayReservations],
    );
    // Filtre yalnızca hasta akışı + şema özetine uygulanır (nabız/şu an global kalır)
    const activeToday = useMemo(
        () => mineActive ? activeTodayAll.filter((r) => r.staffId === myStaffId) : activeTodayAll,
        [activeTodayAll, mineActive, myStaffId],
    );

    const isDone = (r: Reservation) => ['tamamlandi', 'odendi'].includes(apptStatusOf(r));
    const inChair = activeTodayAll.filter((r) => apptStatusOf(r) === 'tedavide');
    const waitingRoom = activeTodayAll.filter((r) => apptStatusOf(r) === 'geldi');
    const inClinic = inChair.length + waitingRoom.length;
    const waiting = activeTodayAll.filter((r) => apptStatusOf(r) === 'bekliyor').length;
    const completedCount = activeTodayAll.filter(isDone).length;
    const nextUp = activeTodayAll.find((r) => !isDone(r) && apptStatusOf(r) !== 'tedavide')
        || activeTodayAll.find((r) => !isDone(r));
    const nextIdx = nextUp ? activeTodayAll.indexOf(nextUp) : -1;
    const afterNext = nextIdx >= 0 ? activeTodayAll.slice(nextIdx + 1).find((r) => !isDone(r)) : undefined;
    const allDone = activeTodayAll.length > 0 && activeTodayAll.every(isDone);

    // Bugün tahsil edilen — payments (org geneli) bugünkü toplam
    const todayCollected = useMemo(
        () => payments.filter((p) => p.paidAt.slice(0, 10) === todayStr).reduce((s, p) => s + p.amount, 0),
        [payments, todayStr],
    );

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
    const outstandingTotal = useMemo(() => outstanding.reduce((s, o) => s + o.amount, 0), [outstanding]);

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
        () => [...new Set(activeTodayAll.map((r) => r.customerId).filter(Boolean))],
        [activeTodayAll],
    );
    const { currentFor } = useDentalChartsForCustomers(todayCustomerIds);
    const chartSummaries = useMemo(() => {
        const source = mineActive ? activeToday : activeTodayAll;
        const ids = [...new Set(source.map((r) => r.customerId).filter(Boolean))];
        return ids
            .map((cid) => {
                const r = source.find((x) => x.customerId === cid);
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
    }, [activeTodayAll, activeToday, mineActive, currentFor]);

    const colorFor = (status: string) => CHART_COLORS[status] || 'var(--dc-surface3)';

    // Bugünkü hastaların tedavi planı durumu (yolculuk rozeti: teklif onay bekliyor
    // / tedavi sürüyor). Tek sorguda toplu — 063 proposed durumu.
    const [planInfo, setPlanInfo] = useState<Map<string, { proposed: boolean; active: boolean }>>(new Map());
    const custIdsKey = todayCustomerIds.join(',');
    useEffect(() => {
        const ids = custIdsKey ? custIdsKey.split(',') : [];
        if (ids.length === 0) { setPlanInfo(new Map()); return; }
        let alive = true;
        void supabase
            .from('treatment_plans')
            .select('customer_id, status')
            .in('customer_id', ids)
            .then(({ data, error }) => {
                if (!alive || error || !data) return;
                const map = new Map<string, { proposed: boolean; active: boolean }>();
                for (const row of data as { customer_id: string; status: string }[]) {
                    const cur = map.get(row.customer_id) || { proposed: false, active: false };
                    if (row.status === 'proposed') cur.proposed = true;
                    if (row.status === 'active') cur.active = true;
                    map.set(row.customer_id, cur);
                }
                setPlanInfo(map);
            });
        return () => { alive = false; };
    }, [custIdsKey]);

    // Kontrol zamanı (recall) — tarihi geçmiş veya 7 gün içinde dolacak hastalar
    const recallDue = useMemo(() => {
        const limit = new Date(now); limit.setDate(limit.getDate() + 7);
        const limitStr = limit.toISOString().slice(0, 10);
        return allCustomers
            .filter((c) => c.recallDate && c.recallDate <= limitStr)
            .sort((a, b) => (a.recallDate || '').localeCompare(b.recallDate || ''));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allCustomers, todayStr]);

    const customerById = useMemo(() => new Map(allCustomers.map((c) => [c.id, c])), [allCustomers]);
    const resourceById = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);
    const activeResources = useMemo(() => resources.filter((r) => r.isActive).sort((a, b) => a.sort - b.sort), [resources]);

    // Yolculuk adım rozeti — hastanın klinik yolculukta kaldığı adım
    const journeyOf = (r: Reservation, cid: string): { label: string; tone: 'amber' | 'blue' | 'green' | 'red' | 'gray' } => {
        const st = apptStatusOf(r);
        const pi = planInfo.get(cid);
        if (st === 'bekliyor') return { label: 'Onay Bekliyor', tone: 'amber' };
        if (st === 'onaylandi') return { label: 'Bekleniyor', tone: 'gray' };
        if (st === 'geldi') return { label: 'Karşılandı', tone: 'amber' };
        if (st === 'tedavide') {
            if (pi?.proposed) return { label: 'Teklif onay bekliyor', tone: 'amber' };
            if (pi?.active) return { label: 'Tedavi sürüyor', tone: 'blue' };
            return { label: 'Muayenede', tone: 'blue' };
        }
        if (st === 'tamamlandi') return { label: 'Tahsilat bekliyor', tone: 'red' };
        return { label: 'Tamamlandı', tone: 'green' };
    };

    // Gecikme — henüz gelmemiş hastanın randevu saati geçtiyse
    const lateMinutes = (r: Reservation): number => {
        const st = apptStatusOf(r);
        if (st !== 'onaylandi' && st !== 'bekliyor') return 0;
        const [h, m] = r.startTime.split(':').map(Number);
        const start = new Date(now); start.setHours(h, m, 0, 0);
        const diff = Math.floor((now.getTime() - start.getTime()) / 60000);
        return diff > 0 ? diff : 0;
    };

    const minutesSince = (iso?: string): number => {
        if (!iso) return 0;
        return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60000));
    };
    // Sabit genişlikli koltuk kartında "…dk'dır muayenede" hekim adını eziyordu;
    // "muayenede" bilgisi kartın başlığından ("ÜNİTE 2 · DOLU") zaten belli.
    const timerLabel = (r: Reservation) => `${minutesSince(r.arrivedAt)} dk`;

    const openChart = (customerId?: string, reservationId?: string) => {
        if (!customerId) { navigate('/dental-chart'); return; }
        const query = new URLSearchParams({ patient: customerId });
        if (reservationId) query.set('reservation', reservationId);
        navigate(`/dental-chart?${query.toString()}`);
    };
    // Diş sektöründe hasta detayı = v7 Hasta Dosyası (generic müşteri paneli değil)
    const openCustomer = (customerId?: string) => customerId ? navigate(`/patient-file/${customerId}`) : navigate('/customers');

    // Kontrol hatırlatması — WhatsApp'tan AI mesajı gönderir (wa.me açmaz).
    // WhatsApp bağlı değilse kullanıcıyı ayarlara yönlendiren uyarı verir.
    const [remindingId, setRemindingId] = useState<string | null>(null);
    const handleRemind = async (customerId?: string) => {
        if (!customerId || remindingId) return;
        setRemindingId(customerId);
        const res = await sendRecallReminder(customerId);
        setRemindingId(null);
        if (res.ok) {
            toast.success(res.queued
                ? 'Bağlantı şu an sorunlu — hatırlatma kuyruğa alındı, birazdan gönderilecek'
                : 'Kontrol hatırlatması WhatsApp\'tan gönderildi');
            return;
        }
        if (res.reason === 'no_whatsapp') toast.error('WhatsApp bağlı değil — Ayarlar → WhatsApp\'tan bağlayın');
        else if (res.reason === 'not_found') toast.error('Hastanın telefon numarası kayıtlı değil');
        else toast.error('Hatırlatma gönderilemedi, tekrar deneyin');
    };

    // Eski randevularda customer_id boş olabiliyor — telefon eşleşmesiyle hastayı bul
    const customerIdForReservation = (r: Reservation) =>
        r.customerId || allCustomers.find((c) => c.phone.replace(/\s+/g, '') === (r.customerPhone || '').replace(/\s+/g, ''))?.id || '';

    // Eski sürümde oluşturulmuş, customer_id'si boş bugünkü randevuları onar.
    useEffect(() => {
        const missing = activeTodayAll.filter((r) => !r.customerId && r.customerPhone?.trim());
        if (missing.length === 0) return;
        let cancelled = false;
        void (async () => {
            for (const reservation of missing) {
                if (cancelled) return;
                await ensureReservationCustomer(reservation);
            }
        })();
        return () => { cancelled = true; };
    }, [activeTodayAll, ensureReservationCustomer]);

    const [openingReservation, setOpeningReservation] = useState<string | null>(null);
    const openVisit = async (r: Reservation, start = false) => {
        if (openingReservation) return;
        setOpeningReservation(r.id);
        if (!r.customerId && !r.customerPhone?.trim()) {
            setOpeningReservation(null);
            navigate(`/dental-visit/${encodeURIComponent(r.id)}`);
            return;
        }
        const customerId = await ensureReservationCustomer(r);
        if (!customerId) {
            setOpeningReservation(null);
            toast.error('Muayeneyi açmak için bu randevuya bir hasta bağlanmalıdır');
            return;
        }
        if (start && !r.arrivedAt) {
            const updated = await updateReservation(r.id, { arrivedAt: new Date().toISOString() });
            if (!updated) { setOpeningReservation(null); return; }
        }
        setOpeningReservation(null);
        navigate(`/dental-visit/${encodeURIComponent(r.id)}`);
    };
    const openReservationTarget = async (r: Reservation, target: 'customer' | 'chart') => {
        if (openingReservation) return;
        setOpeningReservation(r.id);
        const customerId = await ensureReservationCustomer(r);
        setOpeningReservation(null);
        if (!customerId) { toast.error('Bu randevu için hasta kaydı oluşturulamadı'); return; }
        if (target === 'chart') openChart(customerId, r.id);
        else openCustomer(customerId);
    };

    // Tek bağlamsal aksiyon — satırdaki buton akışı bir adım ilerletir
    const [advancing, setAdvancing] = useState<string | null>(null);
    const advance = async (r: Reservation) => {
        const st = apptStatusOf(r);
        if (advancing) return;
        // Kasa kapalıysa tahsilat TimeFlow dışında takip ediliyordur; kayıt
        // "tamamlandı ama ödenmedi"de asılı kalmasın diye kapatılır.
        if (st === 'tamamlandi') {
            if (cashOn) { navigate(`/kasa?reservation=${r.id}`); return; }
            setAdvancing(r.id);
            await updateReservation(r.id, { isPaid: true });
            setAdvancing(null);
            return;
        }
        setAdvancing(r.id);
        if (st === 'bekliyor') await updateReservation(r.id, { status: 'confirmed' });
        else if (st === 'onaylandi') await updateReservation(r.id, { customerArrivedAt: new Date().toISOString() });
        else if (st === 'geldi') { setAdvancing(null); await openVisit(r, true); return; }
        else if (st === 'tedavide') { setAdvancing(null); await openVisit(r); return; }
        setAdvancing(null);
    };

    // Hasta arama (topbar) — hero içinde, seçilen hasta detayına gider
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
    const moreRes = moreMenu ? activeTodayAll.find((r) => r.id === moreMenu.id) : undefined;

    // İlgi Gerektirenler — tek iş kuyruğu: medikal (0) > ödeme (1) > recall (2)
    const queue = useMemo(() => {
        const items: { pri: number; type: 'med' | 'pay' | 'recall'; key: string; title: string; sub: string; amt?: number; customerId?: string; phone?: string }[] = [];
        const seenMed = new Set<string>();
        for (const r of activeTodayAll) {
            if (isDone(r)) continue;
            const cid = customerIdForReservation(r);
            if (!cid || seenMed.has(cid)) continue;
            const alert = medicalAlertOf(customerById.get(cid));
            if (alert) { seenMed.add(cid); items.push({ pri: 0, type: 'med', key: `m-${r.id}`, title: r.customerName, sub: `${alert} — bugün ${r.startTime} randevusu var`, customerId: cid }); }
        }
        for (const o of outstanding) items.push({ pri: 1, type: 'pay', key: `p-${o.customerId}`, title: o.name, sub: `Bekleyen ödeme — ${o.reason}`, amt: o.amount, customerId: o.customerId });
        for (const c of recallDue) items.push({ pri: 2, type: 'recall', key: `r-${c.id}`, title: c.name, sub: `Kontrol çağrısı — ${formatDateEU(c.recallDate!)}${c.recallDate! < todayStr ? ' · gecikti' : ''}`, customerId: c.id, phone: c.phone });
        return items.sort((a, b) => a.pri - b.pri);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTodayAll, outstanding, recallDue, customerById, todayStr]);

    const QUEUE_ICON: Record<'med' | 'pay' | 'recall', { Icon: typeof AlertTriangle; cls: string }> = {
        med: { Icon: AlertTriangle, cls: 'bg-[var(--dc-red-bg)] text-[var(--dc-red2)]' },
        pay: { Icon: CreditCard, cls: 'bg-[var(--dc-amber-bg)] text-[var(--dc-amber)]' },
        recall: { Icon: CalendarClock, cls: 'bg-[var(--dc-green-bg)] text-[var(--dc-green)]' },
    };

    const barCls: Record<BarColor, string> = {
        amber: 'bg-[var(--dc-amber)]', blue: 'bg-[var(--dc-blue)]', green: 'bg-[var(--dc-green)]',
        orange: 'bg-[var(--dc-orange)]', gray: 'bg-[var(--dc-surface3)]',
    };
    const pillCls: Record<'amber' | 'blue' | 'green' | 'red' | 'gray', string> = {
        amber: 'bg-[var(--dc-amber-bg)] text-[var(--dc-amber)]', blue: 'bg-[var(--dc-blue-bg)] text-[var(--dc-blue)]',
        green: 'bg-[var(--dc-green-bg)] text-[var(--dc-green)]', red: 'bg-[var(--dc-red-bg)] text-[var(--dc-red2)]',
        gray: 'bg-[var(--dc-surface2)] text-[var(--dc-muted)]',
    };

    const cardCls = 'rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_2px_rgba(14,14,14,0.04),0_2px_8px_rgba(14,14,14,0.04)] overflow-hidden';

    return (
        <div className={cn('dash-theme flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--dc-page)]', dark && 'dark')}>
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <div className="max-w-[1480px] mx-auto space-y-3.5">

                    {/* ── KATMAN 1: ARAÇ ÇUBUĞU ── */}
                    <div className="flex items-center gap-4 flex-wrap">
                        <div className="min-w-[220px]">
                            <div className="font-mono text-[11px] font-bold tracking-[0.14em] text-[var(--dc-orange)] uppercase">{weekday} · {dateLabel}</div>
                            <div className="text-[19px] font-extrabold tracking-[-0.025em] text-[var(--dc-ink)] mt-0.5">
                                {activeTodayAll.length === 0 ? 'Bugün için planlanmış hasta yok'
                                    : allDone ? 'Gün tamamlandı 🎉'
                                        : nextUp ? <>Bugün {activeTodayAll.length} hasta var, sıradaki {nextUp.startTime}'da</>
                                            : `Bugünkü ${activeTodayAll.length} randevunun tümü tamamlandı`}
                            </div>
                        </div>
                        {/* Hasta ara */}
                        <div className="relative flex-1 max-w-[360px] min-w-[220px]">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-[var(--dc-muted2)] pointer-events-none" />
                            <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Hasta ara — isim ya da telefon…" aria-label="Hasta ara"
                                onBlur={() => setTimeout(() => setSearchQ(''), 180)}
                                className="w-full h-[46px] pl-10 pr-4 rounded-full border border-[var(--dc-border2)] bg-[var(--dc-surface)] text-[13.5px] font-semibold text-[var(--dc-ink)] outline-none focus:border-[var(--dc-orange)] placeholder:text-[var(--dc-muted2)] transition-colors" />
                            {searchHits.length > 0 && (
                                <div className="absolute z-30 left-0 right-0 top-[calc(100%+6px)] rounded-[11px] bg-[var(--dc-surface)] border border-[var(--dc-border2)] shadow-[0_4px_16px_rgba(14,14,14,0.11),0_16px_48px_rgba(14,14,14,0.10)] overflow-hidden p-1.5" role="listbox">
                                    {searchHits.map((c) => (
                                        <button key={c.id} type="button" onMouseDown={() => { setSearchQ(''); openCustomer(c.id); }}
                                            className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--dc-surface2)] transition-colors flex items-center gap-2.5">
                                            <span className="w-[30px] h-[30px] rounded-full grid place-items-center text-[11px] font-extrabold text-white bg-gradient-to-br from-[#0E0E0E] to-[#3a3a3a] flex-shrink-0">{c.name.slice(0, 2).toUpperCase()}</span>
                                            <span className="text-[12.5px] font-semibold text-[var(--dc-ink)] truncate flex-1">{c.name}</span>
                                            <span className="font-mono text-[10.5px] text-[var(--dc-muted)] flex-shrink-0">{c.phone}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-3 ml-auto flex-wrap">
                            {myStaffId && (
                                <div className="inline-flex rounded-full bg-[var(--dc-surface2)] border border-[var(--dc-border)] p-[3px]" role="tablist" aria-label="Hasta filtresi">
                                    {([[false, 'Tümü'], [true, 'Benim Hastalarım']] as const).map(([v, l]) => (
                                        <button key={l} role="tab" aria-selected={mineOnly === v} onClick={() => setMineOnly(v)}
                                            className={cn('h-[38px] px-[15px] rounded-full text-[12.5px] font-bold transition-colors', mineOnly === v ? 'bg-[var(--dc-ink)] text-[var(--dc-inkbox-fg)]' : 'text-[var(--dc-muted)] hover:text-[var(--dc-ink)]')}>
                                            {l}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {activeStaff.length > 0 && (
                                <div className="flex">
                                    {activeStaff.slice(0, 4).map((s, i) => (
                                        <div key={s.id} title={`${s.name}${onDutyIds.has(s.id) ? ' — aktif' : ' — izinli'}`}
                                            className={cn('relative w-[38px] h-[38px] rounded-full border-2 border-[var(--dc-page)] grid place-items-center text-[12px] font-extrabold text-white', i > 0 && '-ml-[7px]')}
                                            style={{ background: s.color || 'var(--dc-surface3)' }}>
                                            {s.name.slice(0, 2).toUpperCase()}
                                            {onDutyIds.has(s.id) && <span className="absolute -bottom-px -right-px w-[10px] h-[10px] rounded-full bg-[var(--dc-green)] border-2 border-[var(--dc-page)]" />}
                                        </div>
                                    ))}
                                </div>
                            )}
                            <LueraButton onClick={() => openChart()} variant={dark ? 'ghost-dark' : 'ghost'} size="md"><ToothIcon className="w-[14px] h-[14px]" />Diş Şeması</LueraButton>
                            <LueraButton onClick={() => navigate('/calendar?new=1')} variant="ink" size="md"><Plus className="w-[14px] h-[14px]" />Yeni Randevu</LueraButton>
                        </div>
                    </div>

                    {/* ── KATMAN 2: ŞU AN BANDI / GÜN SONU ── */}
                    {allDone ? (
                        <div className={cn(cardCls, 'flex items-center gap-5 px-7 py-6 shadow-[0_2px_6px_rgba(14,14,14,0.05),0_10px_28px_rgba(14,14,14,0.07)]')}>
                            <div className="w-[52px] h-[52px] rounded-full bg-[var(--dc-green-bg)] text-[var(--dc-green)] grid place-items-center flex-shrink-0"><CheckCircle2 className="w-6 h-6" /></div>
                            <div>
                                <div className="text-[19px] font-extrabold tracking-[-0.02em] text-[var(--dc-ink)]">Bugün tamamlandı</div>
                                <div className="text-[12.5px] text-[var(--dc-muted)] mt-0.5">{activeTodayAll.length} hasta görüldü{outstandingTotal <= 0 && ' · tüm tahsilatlar işlendi'}</div>
                            </div>
                            <div className="ml-auto flex gap-7">
                                <div><div className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--dc-muted)]">Hasta</div><div className="font-mono text-[22px] font-extrabold text-[var(--dc-ink)] mt-0.5">{activeTodayAll.length}</div></div>
                                <div><div className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--dc-muted)]">Tahsil edilen</div><div className="font-mono text-[22px] font-extrabold text-[var(--dc-green)] mt-0.5">{fmtTL(todayCollected)}</div></div>
                                <div><div className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--dc-muted)]">Bekleyen</div><div className="font-mono text-[22px] font-extrabold text-[var(--dc-ink)] mt-0.5">{fmtTL(outstandingTotal)}</div></div>
                            </div>
                        </div>
                    ) : (
                        <div className={cn(cardCls, 'grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 p-5 rounded-[20px] shadow-[0_2px_6px_rgba(14,14,14,0.05),0_10px_28px_rgba(14,14,14,0.07)]')}>
                            <div className="flex flex-col gap-3.5 min-w-0">
                                <div className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.1em] uppercase text-[var(--dc-muted)]">
                                    <span className="w-2 h-2 rounded-full bg-[var(--dc-green)] animate-pulse" />Şu an klinikte
                                </div>
                                {/* Koltuklar / üniteler — dolu üniteler kart, boşlar tek satır çip.
                                    Boş ünite bilgi taşımadığından kart alanı harcamaz; ünite sayısı
                                    arttıkça panel boş kartlarla şişmez. */}
                                {(() => {
                                    const chairCard = (occ: Reservation, head: string) => (
                                        <button key={occ.id} onClick={() => void openVisit(occ)} className="text-left border border-[var(--dc-border2)] rounded-[14px] bg-[var(--dc-surface)] shadow-[0_1px_2px_rgba(14,14,14,0.04),0_2px_8px_rgba(14,14,14,0.04)] p-3.5 min-h-[104px] w-[232px] shrink-0 flex flex-col gap-0.5 hover:-translate-y-px transition-transform">
                                            <span className="text-[10.5px] font-extrabold tracking-[0.08em] uppercase text-[var(--dc-muted)] flex items-center gap-1.5 truncate"><span className="w-[7px] h-[7px] shrink-0 rounded-full bg-[var(--dc-orange)]" />{head}</span>
                                            <span className="text-[16px] font-extrabold tracking-[-0.02em] text-[var(--dc-ink)] mt-0.5 truncate">{occ.customerName}</span>
                                            <span className="text-[12px] text-[var(--dc-muted)] font-semibold truncate">{occ.service}</span>
                                            <div className="flex items-center gap-2 mt-auto pt-1.5">
                                                {occ.staffName && <span className="text-[11.5px] font-bold text-[var(--dc-muted)] truncate">{occ.staffName}</span>}
                                                <span className="ml-auto font-mono text-[11.5px] font-bold text-[var(--dc-orange)] bg-[var(--dc-orange-soft)] px-2.5 py-1 rounded-full whitespace-nowrap">{timerLabel(occ)}</span>
                                            </div>
                                        </button>
                                    );
                                    // Ünitesiz muayenedeki hastalar — randevuda ünite seçilmediyse hasta kaybolmasın
                                    const unassigned = activeResources.length > 0
                                        ? inChair.filter((r) => !r.resourceId || !activeResources.some((u) => u.id === r.resourceId))
                                        : inChair;
                                    const busy = activeResources
                                        .map((res) => ({ res, occ: inChair.find((r) => r.resourceId === res.id) }))
                                        .filter((x): x is { res: typeof activeResources[number]; occ: Reservation } => Boolean(x.occ));
                                    const free = activeResources.filter((res) => !inChair.some((r) => r.resourceId === res.id));
                                    const cards = [
                                        ...unassigned.map((occ) => chairCard(occ, activeResources.length > 0 ? 'Muayenede · ünite seçilmedi' : 'Muayenede')),
                                        ...busy.map(({ res, occ }) => chairCard(occ, `${res.name} · Dolu`)),
                                    ];
                                    return (
                                        <div className="flex flex-col gap-3">
                                            {/* Tek satır + yatay kaydırma: ünite sayısı artınca kartlar alt satıra
                                                geçip paneli büyütmesin; sabit genişlikte kalıp kaysın.
                                                py/-my: overflow-x:auto, overflow-y'yi de auto'ya çevirip dikeyde
                                                kırpıyor; hover'daki 1px kalkma ve gölge için alan bırakır. */}
                                            {cards.length > 0 && (
                                                <div className="flex gap-3 overflow-x-auto py-1 -my-1 [scrollbar-width:thin]">{cards}</div>
                                            )}
                                            {free.length > 0 && (
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="text-[10.5px] font-extrabold tracking-[0.08em] uppercase text-[var(--dc-muted2)] mr-0.5">Boş · {free.length}</span>
                                                    {free.map((res) => (
                                                        <span key={res.id} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--dc-border2)] bg-[var(--dc-surface2)] px-2.5 py-[5px] text-[11.5px] font-bold text-[var(--dc-muted2)]">
                                                            <ToothIcon className="w-3 h-3 opacity-55" />{res.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {cards.length === 0 && (
                                                <div className="flex items-center gap-2 text-[13px] font-bold text-[var(--dc-muted2)]">
                                                    <ToothIcon className="w-[18px] h-[18px] opacity-55" />
                                                    {activeResources.length > 0 ? 'Şu an muayenede hasta yok' : 'Koltuk boş'}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                                {/* Bekleme odası */}
                                <div className="border-t border-[var(--dc-border)] pt-3 flex items-center gap-2.5 flex-wrap">
                                    {waitingRoom.length > 0 ? (
                                        <>
                                            <span className="text-[11px] font-extrabold tracking-[0.07em] uppercase text-[var(--dc-muted)]">Bekleme odası · {waitingRoom.length}</span>
                                            {waitingRoom.map((r) => (
                                                <span key={r.id} className="inline-flex items-center gap-2.5 bg-[var(--dc-amber-bg)] border border-[rgba(184,121,10,0.25)] rounded-full pl-3.5 pr-[6px] py-[5px] text-[12.5px] font-bold text-[var(--dc-ink)]">
                                                    {r.customerName}
                                                    <span className="font-mono text-[10.5px] text-[var(--dc-amber)] font-bold">{r.startTime}</span>
                                                    <button onClick={() => advance(r)} disabled={advancing === r.id} className="bg-[var(--dc-ink)] text-[var(--dc-inkbox-fg)] rounded-full px-3 py-[7px] text-[11.5px] font-bold hover:opacity-85 disabled:opacity-50">Koltuğa Al</button>
                                                </span>
                                            ))}
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-[11px] font-extrabold tracking-[0.07em] uppercase text-[var(--dc-muted)]">Bekleme odası boş</span>
                                            {nextUp && <span className="text-[12px] text-[var(--dc-muted2)] font-semibold">Sıradaki randevu {nextUp.startTime} — {nextUp.customerName}</span>}
                                        </>
                                    )}
                                </div>
                            </div>
                            {/* Sıradaki CTA */}
                            <div className="rounded-2xl p-5 flex flex-col bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)]">
                                <span className="text-[10.5px] font-extrabold tracking-[0.12em] uppercase opacity-55">{nextUp && apptStatusOf(nextUp) === 'tedavide' ? 'Koltukta' : 'Sıradaki'}</span>
                                {nextUp ? (
                                    <>
                                        <span className="font-mono text-[26px] font-extrabold tracking-[-0.02em] mt-2">{nextUp.startTime}</span>
                                        <span className="text-[17px] font-extrabold tracking-[-0.02em] mt-0.5 truncate">{nextUp.customerName}</span>
                                        <span className="text-[12px] opacity-60 font-semibold mt-0.5 truncate">
                                            {nextUp.service}{nextUp.resourceId && ` · ${resourceById.get(nextUp.resourceId)?.name || ''}`}{nextUp.staffName && ` · ${nextUp.staffName}`}
                                        </span>
                                        {STATUS_META[apptStatusOf(nextUp)].action && (
                                            <button onClick={() => advance(nextUp)} disabled={advancing === nextUp.id}
                                                className="mt-3.5 w-full h-12 rounded-full bg-[var(--dc-orange)] text-white text-[13.5px] font-bold hover:bg-[var(--dc-orange)] hover:opacity-90 disabled:opacity-50 transition-all inline-flex items-center justify-center">
                                                {STATUS_META[apptStatusOf(nextUp)].action}
                                            </button>
                                        )}
                                        {afterNext && <span className="text-[11px] opacity-50 font-semibold mt-2.5 text-center truncate">sonra: {afterNext.startTime} {afterNext.customerName} · {afterNext.service}</span>}
                                    </>
                                ) : (
                                    <span className="text-[15px] font-bold mt-3">Bekleyen hasta yok</span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── KATMAN 3: GÜNÜN NABZI ── */}
                    <div className={cn(cardCls, 'grid grid-cols-2 lg:grid-cols-5')}>
                        {([
                            { k: 'Klinikte', v: String(inClinic), cls: 'text-[var(--dc-ink)]' },
                            { k: 'Bekleyen', v: String(waiting), cls: 'text-[var(--dc-ink)]' },
                            { k: 'Tamamlanan', v: `${completedCount} / ${activeTodayAll.length}`, cls: 'text-[var(--dc-ink)]' },
                            { k: 'Bugün Tahsil', v: fmtTL(todayCollected), cls: 'text-[var(--dc-green)]', mono: true },
                            { k: 'Bekleyen Tahsilat', v: fmtTL(outstandingTotal), cls: 'text-[var(--dc-red2)]', mono: true },
                        ] as const).map((m, i) => (
                            <button key={m.k} onClick={() => navigate(cashOn && (m.k === 'Bekleyen Tahsilat' || m.k === 'Bugün Tahsil') ? '/kasa' : '/calendar')}
                                className={cn('flex flex-col gap-0.5 items-start px-[18px] py-3.5 min-h-[64px] hover:bg-[var(--dc-surface2)] transition-colors border-[var(--dc-border)]', i < 4 && 'lg:border-r', i < 3 && 'max-lg:border-b', i % 2 === 0 && i < 4 && 'max-lg:border-r')}>
                                <span className="text-[11px] font-bold text-[var(--dc-muted)] tracking-[0.03em]">{m.k}</span>
                                <span className={cn('text-[17px] font-extrabold tracking-[-0.02em]', m.cls, 'mono' in m && m.mono && 'font-mono')}>{m.v}</span>
                            </button>
                        ))}
                    </div>

                    {/* ── KATMAN 4: İKİ KOLON ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3.5 items-start">
                        <div className="flex flex-col gap-3.5 min-w-0">

                            {/* (a) Bugünkü Hasta Akışı */}
                            <div className={cardCls}>
                                <div className="flex items-center gap-3 px-[18px] py-[15px] border-b border-[var(--dc-border)]">
                                    <div className="w-8 h-8 rounded-[10px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] grid place-items-center flex-shrink-0"><Clock className="w-4 h-4" /></div>
                                    <div className="min-w-0">
                                        <div className="text-[14px] font-bold tracking-[-0.01em] text-[var(--dc-ink)]">Bugünkü Hasta Akışı</div>
                                        <div className="text-[11.5px] text-[var(--dc-muted)] mt-0.5">Saat sıralı · satırdaki buton sıradaki adımı yapar</div>
                                    </div>
                                    <button onClick={() => navigate('/calendar')} className="ml-auto text-xs font-semibold text-[var(--dc-orange)] hover:bg-[var(--dc-orange-soft)] px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 flex-shrink-0">Takvime Git <ArrowRight className="w-3 h-3" /></button>
                                </div>
                                <div className="flex flex-col">
                                    {activeToday.length === 0 ? (
                                        <div className="py-8 text-center text-[12px] text-[var(--dc-muted2)]">{mineActive ? 'Sana atanmış bugünkü randevu yok' : 'Bugün için randevu yok'}</div>
                                    ) : activeToday.map((r) => {
                                        const st = apptStatusOf(r);
                                        const m = STATUS_META[st];
                                        const cid = customerIdForReservation(r);
                                        const alert = medicalAlertOf(customerById.get(cid));
                                        const unit = r.resourceId ? resourceById.get(r.resourceId)?.name : undefined;
                                        const jr = journeyOf(r, cid);
                                        const late = lateMinutes(r);
                                        const justArrived = st === 'geldi' && minutesSince(r.customerArrivedAt) < 3;
                                        return (
                                            <div key={r.id} className={cn('flex items-center gap-3.5 px-[18px] py-[13px] border-b border-[var(--dc-border)] last:border-b-0 min-h-[72px] transition-colors',
                                                isDone(r) ? 'opacity-[0.72] hover:bg-[var(--dc-surface2)]' : 'hover:bg-[var(--dc-surface2)]',
                                                justArrived && 'bg-[rgba(255,90,31,0.09)] shadow-[inset_3px_0_0_var(--dc-orange)]')}>
                                                <div className="w-[52px] flex-shrink-0 text-right">
                                                    <div className="font-mono text-[15px] font-extrabold tracking-[-0.02em] text-[var(--dc-ink)]">{r.startTime}</div>
                                                    <div className="font-mono text-[10.5px] text-[var(--dc-muted2)] mt-px">{r.endTime}</div>
                                                </div>
                                                <div className={cn('w-[3px] self-stretch rounded-full flex-shrink-0', barCls[m.bar])} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <button onClick={() => void openVisit(r)} disabled={openingReservation === r.id} title="Hasta ziyaretini aç"
                                                            className="text-[14.5px] font-bold tracking-[-0.01em] text-[var(--dc-ink)] truncate hover:text-[var(--dc-orange)] transition-colors text-left disabled:opacity-50">{r.customerName}</button>
                                                        {alert && <span title={alert} className="flex-shrink-0 text-[var(--dc-red2)]"><AlertTriangle className="w-[13px] h-[13px]" /></span>}
                                                    </div>
                                                    <div className="text-[11.5px] text-[var(--dc-muted)] font-semibold mt-0.5 truncate">
                                                        {r.service}{r.staffName && ` · ${r.staffName}`}{unit && ` · ${unit}`}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-[5px] items-end flex-shrink-0">
                                                    <span className={cn('text-[11px] font-bold px-[11px] py-1 rounded-full whitespace-nowrap inline-flex items-center gap-[5px]', pillCls[jr.tone])}>
                                                        <span className="w-[5px] h-[5px] rounded-full bg-current" />{jr.label}
                                                    </span>
                                                    {late > 0
                                                        ? <span className="text-[11px] font-bold px-[11px] py-1 rounded-full whitespace-nowrap bg-[var(--dc-amber-bg)] text-[var(--dc-amber)]">! {late} dk gecikti</span>
                                                        : m.label !== jr.label && <span className={cn('text-[11px] font-bold px-[11px] py-1 rounded-full whitespace-nowrap', pillCls[m.pill])}>{m.label}</span>}
                                                </div>
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                    {m.action ? (
                                                        <button onClick={() => advance(r)} disabled={advancing === r.id}
                                                            className={cn('text-[12px] font-bold px-4 min-h-[38px] rounded-full text-white transition-all disabled:opacity-50 inline-flex items-center hover:-translate-y-px',
                                                                m.primary ? 'bg-[var(--dc-orange)] hover:opacity-90' : 'bg-[var(--dc-ink)] hover:bg-[var(--dc-orange)]')}
                                                            aria-label={`${m.action}: ${r.customerName}`}>{m.action}</button>
                                                    ) : (
                                                        <span className="w-[38px] h-[38px] rounded-full bg-[var(--dc-green-bg)] text-[var(--dc-green)] grid place-items-center flex-shrink-0"><Check className="w-4 h-4" /></span>
                                                    )}
                                                    <button onClick={(e) => { e.stopPropagation(); setMoreMenu({ id: r.id, x: e.clientX, y: e.clientY }); }} aria-label="Diğer işlemler"
                                                        className="w-[38px] h-[38px] rounded-full grid place-items-center text-[var(--dc-muted2)] hover:bg-[var(--dc-surface3)] hover:text-[var(--dc-ink)] transition-colors"><MoreHorizontal className="w-4 h-4" /></button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* (b) Diş Şeması Özeti */}
                            <div className={cardCls}>
                                <div className="flex items-center gap-3 px-[18px] py-[15px] border-b border-[var(--dc-border)]">
                                    <div className="w-8 h-8 rounded-[10px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] grid place-items-center flex-shrink-0"><ToothIcon className="w-[15px] h-[15px]" /></div>
                                    <div><div className="text-[14px] font-bold tracking-[-0.01em] text-[var(--dc-ink)]">Diş Şeması Özeti</div><div className="text-[11.5px] text-[var(--dc-muted)] mt-0.5">Bugün gelen hastalar · karta tıklayınca tam şema açılır</div></div>
                                    <button onClick={() => openChart()} className="ml-auto text-xs font-semibold text-[var(--dc-orange)] hover:bg-[var(--dc-orange-soft)] px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0">Tümü →</button>
                                </div>
                                {chartSummaries.length === 0 ? (
                                    <div className="py-8 text-center text-[12px] text-[var(--dc-muted2)]">Bugün chart güncellemesi yok</div>
                                ) : (
                                    <>
                                        <div className="flex gap-3 p-[18px] overflow-x-auto">
                                            {chartSummaries.map((c) => (
                                                <button key={c.customerId} onClick={() => openChart(c.customerId, c.reservationId)}
                                                    className="flex-shrink-0 w-[218px] text-left border border-[var(--dc-border)] hover:border-[var(--dc-border2)] rounded-[14px] p-[13px] bg-[var(--dc-surface2)] transition-all hover:shadow-[0_1px_2px_rgba(14,14,14,0.04),0_2px_8px_rgba(14,14,14,0.04)] hover:-translate-y-px">
                                                    <div className="text-[13px] font-bold text-[var(--dc-ink)] truncate">{c.name}</div>
                                                    <div className="text-[11px] text-[var(--dc-muted)] font-semibold mt-0.5 truncate">{c.summary}</div>
                                                    <div className="mt-2.5"><MiniArch current={c.current} toothSize={15} colorFor={colorFor} /></div>
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex flex-wrap gap-x-3.5 gap-y-[5px] px-[18px] pb-[15px]">
                                            {CHART_LEGEND.map((l) => (
                                                <div key={l.key} className="flex items-center gap-1.5 text-[11px] text-[var(--dc-muted)] font-semibold">
                                                    <span className="w-[9px] h-[9px] rounded-[2px] flex-shrink-0" style={{ background: CHART_COLORS[l.key] }} />{l.label}
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* (c) İlgi Gerektirenler */}
                        <div className={cardCls}>
                            <div className="flex items-center gap-3 px-[18px] py-[15px] border-b border-[var(--dc-border)]">
                                <div className="w-8 h-8 rounded-[10px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] grid place-items-center flex-shrink-0"><AlertTriangle className="w-4 h-4" /></div>
                                <div><div className="text-[14px] font-bold tracking-[-0.01em] text-[var(--dc-ink)]">İlgi Gerektirenler</div><div className="text-[11.5px] text-[var(--dc-muted)] mt-0.5">Öncelik sırasıyla — medikal · ödeme · kontrol</div></div>
                                <span className="ml-auto font-mono text-[11px] text-[var(--dc-muted)]">{queue.length} kayıt</span>
                            </div>
                            {queue.length === 0 ? (
                                <div className="flex flex-col items-center gap-2.5 py-8 text-[12.5px] font-semibold text-[var(--dc-muted)]">
                                    <CheckCircle2 className="w-6 h-6 text-[var(--dc-green)]" />Bekleyen iş yok — her şey yolunda
                                </div>
                            ) : (
                                <div className="flex flex-col">
                                    {queue.map((it) => {
                                        const { Icon, cls } = QUEUE_ICON[it.type];
                                        return (
                                            <div key={it.key} className="flex items-center gap-3 px-[18px] py-[13px] border-b border-[var(--dc-border)] last:border-b-0 min-h-[64px] hover:bg-[var(--dc-surface2)] transition-colors">
                                                <span className={cn('w-[34px] h-[34px] rounded-[10px] grid place-items-center flex-shrink-0', cls)}><Icon className="w-[15px] h-[15px]" /></span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <button onClick={() => openCustomer(it.customerId)} className="text-[13px] font-bold text-[var(--dc-ink)] truncate hover:text-[var(--dc-orange)] transition-colors text-left">{it.title}</button>
                                                        {it.amt !== undefined && <span className="font-mono text-[12px] font-extrabold text-[var(--dc-red2)] flex-shrink-0">{fmtTL(it.amt)}</span>}
                                                    </div>
                                                    <div className="text-[11.5px] text-[var(--dc-muted)] font-semibold mt-px leading-[1.35]">{it.sub}</div>
                                                </div>
                                                {it.type === 'recall' && it.phone && (
                                                    <button onClick={() => handleRemind(it.customerId)} disabled={remindingId === it.customerId}
                                                        className="flex-shrink-0 inline-flex items-center gap-1 text-[11.5px] font-bold px-3 h-[36px] rounded-full border border-[var(--dc-border2)] text-[var(--dc-ink)] hover:border-[var(--dc-ink)] hover:bg-[var(--dc-surface2)] transition-colors disabled:opacity-50">
                                                        <MessageCircle className="w-3 h-3" /> {remindingId === it.customerId ? 'Gönderiliyor…' : 'Hatırlat'}
                                                    </button>
                                                )}
                                                {it.type === 'pay' && cashOn && (
                                                    <button onClick={() => navigate('/kasa')}
                                                        className="flex-shrink-0 text-[11.5px] font-bold px-3.5 h-[36px] rounded-full bg-[var(--dc-ink)] text-[var(--dc-inkbox-fg)] hover:bg-[var(--dc-orange)] transition-colors">Ödeme Al</button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ⋯ menüsü */}
            {moreMenu && moreRes && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setMoreMenu(null)} />
                    <div className="fixed z-50 rounded-[11px] bg-[var(--dc-surface)] border border-[var(--dc-border2)] shadow-[0_8px_24px_rgba(14,14,14,0.10),0_24px_64px_rgba(14,14,14,0.14)] py-1 min-w-[170px]"
                        style={{ left: Math.min(moreMenu.x, window.innerWidth - 185), top: Math.min(moreMenu.y + 6, window.innerHeight - 140) }}>
                        <button onClick={() => { setMoreMenu(null); void openVisit(moreRes); }}
                            className="w-full text-left px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--dc-orange)] hover:bg-[var(--dc-orange-soft)] transition-colors">Hasta Ziyareti</button>
                        <button onClick={() => { setMoreMenu(null); void openReservationTarget(moreRes, 'customer'); }}
                            className="w-full text-left px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--dc-ink)] hover:bg-[var(--dc-surface2)] transition-colors">Hasta Dosyası</button>
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
