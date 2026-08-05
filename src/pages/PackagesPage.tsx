import { useEffect, useMemo, useState } from 'react';
import { normalizePhone } from '@/lib/phone';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3, MessageCircle, Plus, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useCustomers } from '@/hooks/useCustomers';
import { useOrgPackages, type OrgPackage } from '@/hooks/useOrgPackages';
import { useReservations } from '@/hooks/useReservations';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import { todayISO } from '@/utils/date';
import { MONO, Sparkline, StatCard } from '@/components/dashboard/kpi';
import { BeautySessionModal } from '@/components/beauty/BeautySessionModal';
import { useLabels } from '@/hooks/useLabels';
import { useCashEnabled } from '@/hooks/useModules';
import { BeautyPackages } from '@/pages/BeautyPackages';
import type { Customer } from '@/types';

// Paketler sayfası — tasarım: "Luera TimeFlow Guzellik Salonu.html" Paketler
// ekranı. Org geneli paket görünümü: KPI şeridi + filtre pill'leri + satır
// kartları + en çok satan / yenileme oranı paneli. Paket = treatment_plans
// (064/067), kalan bakiye plan bazlı ödeme toplamından hesaplanır.

type FilterKey = 'all' | 'active' | 'renewal' | 'unplanned' | 'done' | 'overdue' | 'cancelled';
const FILTER_KEYS: FilterKey[] = ['all', 'active', 'renewal', 'unplanned', 'done', 'overdue', 'cancelled'];

const PALETTE = ['var(--dc-purple)', 'var(--dc-blue)', 'var(--dc-green)', 'var(--dc-amber)', 'var(--dc-red)'];

function waLink(phone: string, text?: string): string {
    return `https://wa.me/${normalizePhone(phone) ?? phone.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

const fmtTL = (n: number) => `₺${n.toLocaleString('tr-TR')}`;
const daysSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));

interface Row {
    pkg: OrgPackage;
    customer?: Customer;
    remaining: number;
    finished: boolean;
    cancelled: boolean;
    /** Kalan bakiyesi olup 30+ gündür ödeme görmemiş */
    overdue: boolean;
    /** Son ödeme/satıştan bu yana geçen gün (overdue satır uyarısı) */
    silentDays: number;
    /** Müşteri 60+ gündür gelmiyor mu (aksiyon Mesaj At olur) */
    lost: boolean;
    /** Paket bitti, teklif gönderilmedi ve müşteri yeni paket almadı */
    needsRenewal: boolean;
    /** Devam eden paket ama ileri tarihli randevusu yok */
    unplanned: boolean;
    color: string;
}

const LAST_SECTOR_KEY = 'luera:lastSector';

export function PackagesPage() {
    const { sector, isLoading } = useLabels();
    // Sektörü SENKRON bil: settings ağdan gelene kadar beklemek yerine son bilinen
    // sektörü localStorage'dan oku → doğru tasarım ilk render'da gelir. Böylece
    // ne varsayılan tasarım flash'ı (settings henüz 'genel') ne de uzun boş bekleme
    // (isLoading revalidasyon boyunca true kalıyordu) olur.
    const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_SECTOR_KEY) : null;
    const known = sector !== 'genel' ? sector : (cached || '');
    useEffect(() => {
        if (sector && sector !== 'genel') localStorage.setItem(LAST_SECTOR_KEY, sector);
    }, [sector]);
    // Yalnız ilk-kez (cache boş) ve hâlâ yükleniyorken kısa placeholder — flash yerine.
    if (!known && isLoading) return <div className="flex-1 min-h-0" />;
    // Güzellik ve kuaför: "Paket Merkezi" tasarımı (seans paketi + karma paket —
    // hak randevunun plana bağlanmasıyla düşer, hizmet ayrımı yapmaz). Diğer
    // sektörler mevcut paket listesini kullanır (bozulmadan korunur).
    // Diş'te paket kavramı treatment_plans üzerinden yürür (nav'da da gizli);
    // doğrudan URL ile girilirse çakışan ikinci bir görünüm açılıyordu.
    if ((known || sector) === 'dis') return <Navigate to="/customers" replace />;
    if (['guzellik', 'kuafor'].includes(known || sector)) return <BeautyPackages />;
    return <PackagesPageDefault />;
}

function PackagesPageDefault() {
    const navigate = useNavigate();
    const cashOn = useCashEnabled();
    const { dark } = useTheme();
    const { orgId } = useAuth();
    const { customerById, isArchivedCustomer } = useCustomers();
    const { packages, refresh } = useOrgPackages();
    const { settings, reservations } = useReservations();
    const [paidByPlan, setPaidByPlan] = useState<Map<string, { total: number; lastAt: string | null }>>(new Map());
    const [params, setParams] = useSearchParams();
    const filter = (FILTER_KEYS.includes(params.get('f') as FilterKey) ? params.get('f') : 'all') as FilterKey;
    const setFilter = (k: FilterKey) => setParams(k === 'all' ? {} : { f: k }, { replace: true });
    const [query, setQuery] = useState('');
    const [modalCustomer, setModalCustomer] = useState<Customer | null | undefined>(undefined);
    const [offering, setOffering] = useState<string | null>(null);
    const today = todayISO();

    // Plan bazlı ödemeler — tek sorgu, kalan bakiye + son ödeme tarihi
    useEffect(() => {
        if (!orgId) return;
        let alive = true;
        void supabase.from('payments')
            .select('treatment_plan_id, amount, paid_at')
            .eq('organization_id', orgId)
            .not('treatment_plan_id', 'is', null)
            .then(({ data, error }) => {
                if (!alive || error) { if (error) console.error(error); return; }
                const map = new Map<string, { total: number; lastAt: string | null }>();
                for (const p of data || []) {
                    const prev = map.get(p.treatment_plan_id) || { total: 0, lastAt: null };
                    map.set(p.treatment_plan_id, {
                        total: prev.total + Number(p.amount),
                        lastAt: !prev.lastAt || p.paid_at > prev.lastAt ? p.paid_at : prev.lastAt,
                    });
                }
                setPaidByPlan(map);
            });
        return () => { alive = false; };
    }, [orgId, packages]);

    const serviceColor = (title: string): string => {
        const t = title.toLocaleLowerCase('tr');
        const svc = (settings.services || []).find((s) => t.includes(s.name.toLocaleLowerCase('tr')) || s.name.toLocaleLowerCase('tr').includes(t));
        if (svc) return svc.color;
        let h = 0; for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) % PALETTE.length;
        return PALETTE[h];
    };

    // İleri tarihli (bugünden sonraki) randevusu olan müşteriler
    const futureByCustomer = useMemo(() => {
        const set = new Set<string>();
        for (const r of reservations) {
            if (r.status === 'cancelled') continue;
            if (r.date >= today) set.add(r.customerId);
        }
        return set;
    }, [reservations, today]);

    // Müşteri başına en yeni paket tarihi — biten paketin yenilenip yenilenmediği
    const newestByCustomer = useMemo(() => {
        const m = new Map<string, string>();
        for (const p of packages) {
            if (p.status === 'cancelled') continue;
            const prev = m.get(p.customerId);
            if (!prev || p.createdAt > prev) m.set(p.customerId, p.createdAt);
        }
        return m;
    }, [packages]);

    const rows = useMemo<Row[]>(() => packages.map((pkg) => {
        const customer = customerById.get(pkg.customerId);
        const pay = paidByPlan.get(pkg.id);
        const remaining = Math.max(0, pkg.totalAmount - (pay?.total || 0));
        const cancelled = pkg.status === 'cancelled';
        const finished = !cancelled && pkg.sessionsDone >= pkg.sessionCount;
        const lastMoneyAt = pay?.lastAt || pkg.createdAt;
        const silentDays = daysSince(lastMoneyAt);
        const overdue = !cancelled && !finished && remaining > 0 && silentDays >= 30;
        const lost = Boolean(customer?.lastVisit && daysSince(customer.lastVisit) >= 60);
        // Yenileme bekleyen: bitti, teklif gönderilmedi ve sonrasında yeni paket alınmadı
        const renewedAfter = (newestByCustomer.get(pkg.customerId) || '') > pkg.createdAt;
        const needsRenewal = finished && !pkg.renewalOfferedAt && !renewedAfter;
        // Planlanmamış: devam eden paket ama ileri tarihli randevu yok
        const unplanned = !cancelled && !finished && !futureByCustomer.has(pkg.customerId);
        return { pkg, customer, remaining, finished, cancelled, overdue, silentDays, lost, needsRenewal, unplanned, color: serviceColor(pkg.title) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [packages, customerById, paidByPlan, settings.services, futureByCustomer, newestByCustomer]);

    const counts = useMemo(() => ({
        all: rows.length,
        active: rows.filter((r) => !r.cancelled && !r.finished && !r.overdue).length,
        done: rows.filter((r) => r.finished).length,
        overdue: rows.filter((r) => r.overdue).length,
        cancelled: rows.filter((r) => r.cancelled).length,
        renewal: rows.filter((r) => r.needsRenewal).length,
        unplanned: rows.filter((r) => r.unplanned).length,
    }), [rows]);

    const visible = useMemo(() => {
        let list = rows;
        if (filter === 'active') list = rows.filter((r) => !r.cancelled && !r.finished && !r.overdue);
        else if (filter === 'done') list = rows.filter((r) => r.finished);
        else if (filter === 'overdue') list = rows.filter((r) => r.overdue);
        else if (filter === 'cancelled') list = rows.filter((r) => r.cancelled);
        else if (filter === 'renewal') list = rows.filter((r) => r.needsRenewal);
        else if (filter === 'unplanned') list = rows.filter((r) => r.unplanned);
        const q = query.trim().toLocaleLowerCase('tr');
        if (q) list = list.filter((r) => r.pkg.title.toLocaleLowerCase('tr').includes(q) || (r.customer?.name || '').toLocaleLowerCase('tr').includes(q));
        return list;
    }, [rows, filter, query]);

    // ── KPI hesapları ──────────────────────────────────────────────────────────
    const kpi = useMemo(() => {
        const activeRows = rows.filter((r) => !r.cancelled && !r.finished);
        const monthKey = today.slice(0, 7);
        const sold = rows.filter((r) => !r.cancelled && r.pkg.createdAt.slice(0, 7) === monthKey);
        const prevMonth = new Date(); prevMonth.setMonth(prevMonth.getMonth() - 1);
        const prevKey = prevMonth.toISOString().slice(0, 7);
        const soldPrev = rows.filter((r) => !r.cancelled && r.pkg.createdAt.slice(0, 7) === prevKey).length;
        const totalRemaining = activeRows.reduce((s, r) => s + r.remaining, 0);
        const overdueCustomers = new Set(rows.filter((r) => r.overdue).map((r) => r.pkg.customerId)).size;
        // Yenileme oranı: biten paketin sahibi, bitişten sonra yeni paket almış mı
        const finishedRows = rows.filter((r) => r.finished);
        const renewed = finishedRows.filter((r) => rows.some((o) => o.pkg.id !== r.pkg.id
            && o.pkg.customerId === r.pkg.customerId && !o.cancelled && o.pkg.createdAt > r.pkg.createdAt)).length;
        const renewalRate = finishedRows.length > 0 ? Math.round((renewed / finishedRows.length) * 100) : 0;
        return {
            activeCount: activeRows.length,
            activeRevenue: activeRows.reduce((s, r) => s + r.pkg.totalAmount, 0),
            soldCount: sold.length,
            soldTotal: sold.reduce((s, r) => s + r.pkg.totalAmount, 0),
            soldPrev,
            finishedCount: finishedRows.length,
            renewed,
            renewalRate,
            totalRemaining,
            overdueCustomers,
        };
    }, [rows, today]);

    const topSellers = useMemo(() => {
        const map = new Map<string, { count: number; total: number }>();
        for (const r of rows) {
            if (r.cancelled) continue;
            const prev = map.get(r.pkg.title) || { count: 0, total: 0 };
            map.set(r.pkg.title, { count: prev.count + 1, total: prev.total + r.pkg.totalAmount });
        }
        return [...map.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5);
    }, [rows]);
    const topMax = Math.max(1, ...topSellers.map(([, v]) => v.total));

    // Yenileme teklifi: WhatsApp taslağını aç + paketi damgala (bir kez)
    const sendRenewalOffer = async (row: Row) => {
        if (!row.customer?.phone) { toast.error('Müşterinin telefonu kayıtlı değil'); return; }
        setOffering(row.pkg.id);
        window.open(waLink(row.customer.phone, `Merhaba ${row.customer.name.split(' ')[0]} 🌸 *${row.pkg.title}* paketiniz tamamlandı — emeğinize sağlık! Yenilemek isterseniz size özel bir plan hazırlayalım ✨`), '_blank');
        const { error } = await supabase.from('treatment_plans')
            .update({ renewal_offered_at: new Date().toISOString() }).eq('id', row.pkg.id);
        setOffering(null);
        if (error) { console.error(error); toast.error('Teklif damgası kaydedilemedi'); return; }
        toast.success('Yenileme teklifi gönderildi ✨');
        void refresh();
    };

    const chip = (cls: string, text: string) => (
        <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap', cls)}>
            <span className="w-[5px] h-[5px] rounded-full bg-current" />{text}
        </span>
    );

    const FILTERS: { key: FilterKey; label: string; count: number; danger?: boolean }[] = [
        { key: 'all', label: 'Tümü', count: counts.all },
        { key: 'active', label: 'Aktif', count: counts.active },
        { key: 'renewal', label: 'Yenileme Bekliyor', count: counts.renewal, danger: counts.renewal > 0 },
        { key: 'unplanned', label: 'Seansı Planlanmamış', count: counts.unplanned },
        { key: 'done', label: 'Bitti', count: counts.done },
        { key: 'overdue', label: 'Taksiti Geciken', count: counts.overdue, danger: true },
        { key: 'cancelled', label: 'İptal', count: counts.cancelled },
    ];

    return (
        <div className={cn('dash-theme flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--dc-page)]', dark && 'dark')}>
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <div className="max-w-6xl mx-auto space-y-4">

                    {/* Başlık */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <div>
                            <h1 className="text-[20px] font-extrabold text-[var(--dc-ink)] tracking-[-0.03em]">Paketler</h1>
                            <p className="text-[12px] text-[var(--dc-muted)] mt-0.5">{counts.all} paket · {counts.active} aktif</p>
                        </div>
                        <button onClick={() => setModalCustomer(null)} className="ml-auto flex items-center gap-1.5 bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] px-5 min-h-[42px] rounded-full text-[13px] font-bold transition-all hover:-translate-y-px"><Plus className="w-3.5 h-3.5" />Yeni Seans</button>
                    </div>

                    {/* KPI şeridi */}
                    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <StatCard label="Aktif Paket" value={kpi.activeCount} sublabel={`${fmtTL(kpi.activeRevenue)} toplam paket geliri`}
                            compareLabel="Biten" compareValue={kpi.finishedCount}
                            trend={{ kind: 'up', text: 'sağlıklı' }} onClick={() => setFilter('active')}>
                            <Sparkline data={[3, 5, 4, 6, 5, 7, kpi.activeCount || 1]} />
                        </StatCard>
                        <StatCard label="Bu Ay Satılan" value={`${kpi.soldCount}`} sublabel={`${fmtTL(kpi.soldTotal)} · geçen ay ${kpi.soldPrev} paket`}
                            compareLabel="Geçen ay" compareValue={kpi.soldPrev}
                            trend={kpi.soldCount >= kpi.soldPrev ? { kind: 'up', text: kpi.soldPrev ? `▲ %${Math.round(((kpi.soldCount - kpi.soldPrev) / kpi.soldPrev) * 100)}` : '▲ yeni' } : { kind: 'down', text: 'düşüşte' }}>
                            <Sparkline data={[2, 4, 3, 5, 4, kpi.soldPrev || 1, kpi.soldCount || 1]} />
                        </StatCard>
                        <StatCard label="Biten Paketler" value={kpi.finishedCount} sublabel={`Yenileme fırsatı — ort. dönüşüm %${kpi.renewalRate}`}
                            compareLabel="Yenilenen" compareValue={kpi.renewed}
                            trend={kpi.finishedCount > 0 ? { kind: 'warn', text: 'teklif gönder' } : { kind: 'neutral', text: '✓ temiz' }}
                            urgent={kpi.finishedCount > 0} onClick={() => setFilter('done')}>
                            <div className="mt-[5px] text-[10px] font-bold" style={{ fontFamily: MONO, color: 'var(--dc-orange-d)' }}>Listeyi aç →</div>
                        </StatCard>
                        <StatCard label="Kalan Tahsilat" value={fmtTL(kpi.totalRemaining)} sublabel={`${kpi.overdueCustomers} müşteride gecikmiş taksit`}
                            compareLabel="Geciken" compareValue={counts.overdue}
                            trend={counts.overdue > 0 ? { kind: 'warn', text: 'taksit takipte' } : { kind: 'neutral', text: '✓ temiz' }}
                            onClick={() => setFilter('overdue')}>
                            <Sparkline data={[4, 3, 5, 4, 6, 5, 7]} />
                        </StatCard>
                    </section>

                    {/* Filtre satırı */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {FILTERS.map((f) => {
                            const active = filter === f.key;
                            return (
                                <button key={f.key} onClick={() => setFilter(f.key)}
                                    className={cn('flex items-center gap-2 px-4 min-h-[40px] rounded-full text-[13px] font-bold transition-colors border',
                                        active ? 'bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] border-[var(--dc-inkbox)]'
                                            : 'bg-transparent text-[var(--dc-ink)] border-[var(--dc-border2)] hover:bg-[var(--dc-surface2)]')}>
                                    {f.label}
                                    <span className={cn('text-[11px] font-bold px-1.5 py-0.5 rounded-full', active ? 'bg-white/15'
                                        : f.danger && f.count > 0 ? 'bg-[var(--dc-red-bg)] text-[var(--dc-red)]' : 'text-[var(--dc-muted)]')} style={{ fontFamily: MONO }}>{f.count}</span>
                                </button>
                            );
                        })}
                        <div className="ml-auto flex items-center gap-2 bg-[var(--dc-surface2)] rounded-full px-4 py-2.5 min-w-[220px]">
                            <Search className="w-3.5 h-3.5 text-[var(--dc-muted)]" />
                            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Müşteri veya paket ara…"
                                className="flex-1 bg-transparent text-[13px] text-[var(--dc-ink)] outline-none placeholder:text-[var(--dc-muted)]" />
                        </div>
                    </div>

                    <section className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4 items-start">
                        {/* Paket satırları */}
                        <div className="space-y-3">
                            {visible.length === 0 && (
                                <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] px-5 py-8 text-center text-[13px] text-[var(--dc-muted)]">
                                    {counts.all === 0 ? <>Henüz paketi olmayan müşteri mi var? Müşteri kartından <button onClick={() => navigate('/customers')} className="font-bold text-[var(--dc-orange-d)]">Paket Sat</button> ile başlayın.</> : 'Bu filtrede paket yok.'}
                                </div>
                            )}
                            {visible.map((r) => {
                                const pct = Math.round((r.pkg.sessionsDone / r.pkg.sessionCount) * 100);
                                return (
                                    <div key={r.pkg.id} className={cn('flex items-center gap-4 rounded-2xl border px-4 py-3.5 flex-wrap transition-colors',
                                        r.finished ? 'bg-[var(--dc-orange-soft)] border-[rgba(255,90,31,.35)]'
                                            : r.overdue ? 'bg-[var(--dc-surface)] border-[rgba(201,64,64,.35)]'
                                                : 'bg-[var(--dc-surface)] border-[var(--dc-border)]')}>
                                        <span className="w-[4px] self-stretch rounded-full flex-shrink-0" style={{ background: r.color }} />
                                        <div className="min-w-[170px] flex-1">
                                            {r.customer ? (
                                                <span className="flex items-center gap-2">
                                                    <button onClick={() => navigate(`/beauty-customer/${r.customer!.id}`)} className="text-[15px] font-extrabold text-[var(--dc-ink)] tracking-[-0.01em] hover:text-[var(--dc-orange-d)] transition-colors text-left">{r.customer.name}</button>
                                                    {isArchivedCustomer(r.pkg.customerId) && (
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--dc-surface2)] text-[var(--dc-muted)]" title="Müşteri pasife alınmış — listelerde görünmez">pasif</span>
                                                    )}
                                                </span>
                                            ) : (
                                                <span className="text-[15px] font-extrabold text-[var(--dc-muted)] tracking-[-0.01em]" title="Müşteri kaydı silinmiş">Müşteri kaydı yok</span>
                                            )}
                                            <div className="text-[12px] text-[var(--dc-muted)] mt-px">{r.pkg.title}{r.pkg.sessionCount > 1 && !r.pkg.title.toLocaleLowerCase('tr').includes('seans') ? ` · ${r.pkg.sessionCount} seans` : ''}</div>
                                            {r.overdue && <div className="text-[11.5px] font-bold text-[var(--dc-red)] mt-0.5">{r.lost && r.customer?.lastVisit ? `${daysSince(r.customer.lastVisit)} gündür gelmiyor` : `${r.silentDays} gündür ödeme yok`}</div>}
                                        </div>
                                        <div className="flex items-center gap-2.5 flex-1 min-w-[180px] max-w-[300px]">
                                            <div className="flex-1 h-[7px] rounded-full bg-[var(--dc-surface3)] overflow-hidden">
                                                <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: r.finished ? 'var(--dc-orange)' : 'var(--dc-inkbox)' }} />
                                            </div>
                                            <span className="text-[12px] font-bold text-[var(--dc-ink)] bg-[var(--dc-surface2)] px-2 py-1 rounded-lg whitespace-nowrap" style={{ fontFamily: MONO }}>{r.pkg.sessionsDone}/{r.pkg.sessionCount}</span>
                                        </div>
                                        <span className={cn('text-[13px] font-bold whitespace-nowrap min-w-[86px] text-center', r.remaining > 0 ? 'text-[var(--dc-red)]' : 'text-[var(--dc-green)]')} style={{ fontFamily: MONO }}>
                                            {r.remaining > 0 ? fmtTL(r.remaining) : 'Ödendi ✓'}
                                        </span>
                                        {r.cancelled ? chip('bg-[var(--dc-surface2)] text-[var(--dc-muted)]', 'İptal')
                                            : r.finished ? chip('bg-[rgba(255,90,31,.13)] text-[var(--dc-orange-d)]', 'Bitti')
                                                : r.overdue ? chip('bg-[var(--dc-red-bg)] text-[var(--dc-red)]', 'Gecikmiş')
                                                    : chip('bg-[var(--dc-green-bg)] text-[var(--dc-green)]', 'Aktif')}
                                        <div className="flex items-center gap-2 ml-auto">
                                            {r.customer?.phone && (
                                                <a href={waLink(r.customer.phone)} target="_blank" rel="noopener noreferrer" aria-label={`${r.customer.name} müşterisine WhatsApp'tan yaz`}
                                                    className="w-[38px] h-[38px] rounded-full border border-[var(--dc-border2)] flex items-center justify-center text-[var(--dc-muted)] hover:text-[var(--dc-green)] hover:border-[var(--dc-green)] transition-colors"><MessageCircle className="w-4 h-4" /></a>
                                            )}
                                            {r.cancelled ? null : r.finished ? (
                                                r.pkg.renewalOfferedAt
                                                    ? <span className="text-[12.5px] font-bold text-[var(--dc-green)] px-2 whitespace-nowrap">Teklif gönderildi ✓</span>
                                                    : <button disabled={offering === r.pkg.id} onClick={() => void sendRenewalOffer(r)}
                                                        className="px-4 min-h-[40px] rounded-full border border-[var(--dc-border2)] text-[12.5px] font-bold text-[var(--dc-ink)] hover:bg-[var(--dc-surface2)] hover:border-[var(--dc-ink)] transition-colors whitespace-nowrap disabled:opacity-50">Yenileme Teklifi</button>
                                            ) : r.overdue && r.lost && r.customer?.phone ? (
                                                <a href={waLink(r.customer.phone, `Merhaba ${r.customer.name.split(' ')[0]} 🌸 ${r.pkg.title} paketinizde ${r.pkg.sessionCount - r.pkg.sessionsDone} seansınız sizi bekliyor — dilediğiniz güne planlayalım ✨`)} target="_blank" rel="noopener noreferrer"
                                                    className="px-4 min-h-[40px] inline-flex items-center rounded-full border border-[var(--dc-border2)] text-[12.5px] font-bold text-[var(--dc-ink)] hover:bg-[var(--dc-surface2)] hover:border-[var(--dc-ink)] transition-colors whitespace-nowrap">Mesaj At</a>
                                            ) : r.overdue && cashOn ? (
                                                <button onClick={() => navigate('/kasa')} className="bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[12.5px] font-bold px-4 min-h-[40px] rounded-full hover:bg-[var(--dc-orange)] transition-colors whitespace-nowrap">Ödeme Al</button>
                                            ) : (
                                                <button disabled={!r.customer || isArchivedCustomer(r.pkg.customerId)}
                                                    title={!r.customer ? 'Müşteri kaydı silinmiş' : isArchivedCustomer(r.pkg.customerId) ? 'Müşteri pasif — önce Müşteriler sayfasından aktifleştirin' : undefined}
                                                    onClick={() => r.customer && setModalCustomer(r.customer)}
                                                    className="bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[12.5px] font-bold px-4 min-h-[40px] rounded-full hover:bg-[var(--dc-orange)] transition-colors whitespace-nowrap disabled:opacity-40 disabled:hover:bg-[var(--dc-inkbox)] disabled:cursor-not-allowed">Seansı Planla</button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Sağ panel */}
                        <div className="space-y-4">
                            <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] overflow-hidden">
                                <div className="px-5 py-4 border-b border-[var(--dc-border)] flex items-center gap-3">
                                    <div className="w-[34px] h-[34px] rounded-[11px] bg-[var(--dc-inkbox)] flex items-center justify-center"><BarChart3 className="w-4 h-4 text-[var(--dc-inkbox-fg)]" /></div>
                                    <div>
                                        <h2 className="text-[14px] font-bold text-[var(--dc-ink)]">En Çok Satan Paketler</h2>
                                        <p className="text-[11.5px] text-[var(--dc-muted)]">Tüm zamanlar</p>
                                    </div>
                                </div>
                                <div className="px-5 py-3">
                                    {topSellers.length === 0 && <p className="text-[12.5px] text-[var(--dc-muted)] py-3">Henüz satış yok</p>}
                                    {topSellers.map(([title, v]) => (
                                        <div key={title} className="py-2.5 border-b last:border-b-0 border-[var(--dc-border)]">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[13px] font-bold text-[var(--dc-ink)] truncate">{title}</span>
                                                <span className="text-[11.5px] font-bold text-[var(--dc-muted)] whitespace-nowrap" style={{ fontFamily: MONO }}>{v.count} adet <b className="text-[var(--dc-ink)]">{fmtTL(v.total)}</b></span>
                                            </div>
                                            <div className="h-[5px] rounded-full bg-[var(--dc-surface3)] overflow-hidden mt-1.5">
                                                <span className="block h-full rounded-full" style={{ width: `${Math.max(8, Math.round((v.total / topMax) * 100))}%`, background: serviceColor(title) }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] overflow-hidden">
                                <div className="px-5 py-4 border-b border-[var(--dc-border)] flex items-center gap-3">
                                    <div className="w-[34px] h-[34px] rounded-[11px] bg-[var(--dc-inkbox)] flex items-center justify-center"><RefreshCw className="w-4 h-4 text-[var(--dc-inkbox-fg)]" /></div>
                                    <div>
                                        <h2 className="text-[14px] font-bold text-[var(--dc-ink)]">Yenileme Oranı</h2>
                                        <p className="text-[11.5px] text-[var(--dc-muted)]">Bitmiş paketlerde</p>
                                    </div>
                                </div>
                                <div className="px-5 py-4">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--dc-muted)]" style={{ fontFamily: MONO }}>Tüm zamanlar</span>
                                    <div className="text-[32px] font-black text-[var(--dc-ink)] tracking-[-0.03em] mt-1" style={{ fontFamily: MONO }}>%{kpi.renewalRate}</div>
                                    <p className="text-[12px] text-[var(--dc-muted)] mt-1.5 leading-relaxed">
                                        Bitmiş {kpi.finishedCount} paketin <b className="text-[var(--dc-ink)]">{kpi.renewed}'i yenilendi</b>{kpi.finishedCount > kpi.renewed && ' · teklif göndererek oranı yükseltin ✨'}
                                    </p>
                                    <div className="h-[6px] rounded-full bg-[var(--dc-surface3)] overflow-hidden mt-3">
                                        <span className="block h-full rounded-full bg-[var(--dc-orange)]" style={{ width: `${kpi.renewalRate}%` }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            {modalCustomer !== undefined && (
                <BeautySessionModal customer={modalCustomer} onClose={() => setModalCustomer(undefined)} onCreated={() => { setModalCustomer(undefined); void refresh(); }} />
            )}
        </div>
    );
}
