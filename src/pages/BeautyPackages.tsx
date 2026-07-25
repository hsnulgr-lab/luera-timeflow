import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizePhone, hasWa } from '@/lib/phone';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    AlertTriangle, Calendar, CalendarPlus, Check, ChevronDown, ChevronLeft,
    ChevronRight, Clock, History, Layers, MessageCircle, MoreHorizontal, Package,
    Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, Wallet, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useOrgPackages, type OrgPackage } from '@/hooks/useOrgPackages';
import { usePackageTemplates, type PackageTemplate, type TemplateInput } from '@/hooks/usePackageTemplates';
import { useCustomers } from '@/hooks/useCustomers';
import { useReservations } from '@/hooks/useReservations';
import { useResources } from '@/hooks/useResources';
import { usePayments } from '@/hooks/usePayments';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { BeautySessionModal } from '@/components/beauty/BeautySessionModal';
import { sendPackageToKasa } from '@/lib/kasaPackageQueue';
import { EditReservationModal } from '@/components/reservations/EditReservationModal';
import { useInstallmentSchedules } from '@/hooks/useInstallmentSchedules';
import { todayISO } from '@/utils/date';
import type { Customer, Reservation, Service } from '@/types';
import './beautyPackages.css';

// ── Güzellik "Paketler" merkezi ──────────────────────────────────────────────
// Tasarım: "Timeflow Beauty Paketler Final.html" birebir yeniden kuruldu (iframe
// değil, projenin bileşen/veri modeliyle). Paket = treatment_plans (055/064/067).
// Hak denklemi TEK KAYNAK: kullanılan(sessions_done) + rezerve(pakete bağlı
// ileri randevu) + kullanılabilir = toplam(session_count). Bakiye = paket bedeli
// − plana bağlı ödemeler. Şablon/kayıtlı düzeltme/geçerlilik backend'i olmadığı
// için ilgili yüzeyler güvenle "yakında" olarak devre dışıdır (sahte başarı yok).

const MONO = '"Inter",system-ui,-apple-system,sans-serif';
const fmtTL = (n: number) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toLocaleUpperCase('tr');
const daysSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
const PALETTE = ['var(--dc-purple)', 'var(--dc-blue)', 'var(--dc-green)', 'var(--dc-amber)', 'var(--dc-orange)'];

// Numara kuralları tek kaynakta: src/lib/phone.ts. Test verisinde "123",
// "*230*2*30" gibi kayıtlar var; hasWa bunlara WhatsApp ikonu göstermeyi engeller
// (çalışmayan bir bağlantı vaat ediyordu).
function waLink(phone: string, text?: string): string {
    return `https://wa.me/${normalizePhone(phone) ?? phone.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

type PkgState = 'active' | 'ending' | 'attention' | 'completed' | 'paused';
const STATE_TR: Record<PkgState, string> = {
    active: 'Aktif', ending: 'Son hak', attention: 'Dikkat', completed: 'Bitti', paused: 'İptal',
};

interface Pkg {
    raw: OrgPackage;
    customer?: Customer;
    color: string;
    total: number; used: number; reserved: number; available: number;
    price: number; paid: number; balance: number;
    state: PkgState;
    overdue: boolean; silentDays: number;
    needsRenewal: boolean; unplanned: boolean;
    next: Reservation | null;
    todayUse: number;   // bugüne planlı rezerve seans sayısı
    soldOn: string;
    code: string;
    subtitle: string;
}

type FilterKey = 'all' | 'today' | 'action' | 'active' | 'ending' | 'completed' | 'cancelled' | 'attention' | 'renewal' | 'unplanned' | 'balance';
type SortKey = 'priority' | 'recent' | 'balance' | 'ending' | 'name';

// Deterministik paket kodu — hero'daki "PKT-2841" etiketi (id'den türetilir)
const pkgCode = (id: string) => `PKT-${(Math.abs([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 9000) + 1000}`;
const STATE_RANK: Record<PkgState, number> = { attention: 0, ending: 1, active: 2, completed: 3, paused: 4 };
const FILTER_LABEL: Record<FilterKey, string> = {
    all: 'Tüm paketler', today: 'Bugün kullanılacak', action: 'Aksiyon bekliyor',
    active: 'Aktif paketler', ending: 'Son hakkı kalan', completed: 'Biten paketler',
    cancelled: 'İptal edilenler', attention: 'Tahsilatı gecikmiş', renewal: 'Yenileme fırsatı',
    unplanned: 'Seansı plansız', balance: 'Açık bakiyeli',
};

export function BeautyPackages() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { dark } = useTheme();
    const { orgId, user } = useAuth();
    const { packages, isLoading: packagesLoading, refresh, addPackage, correctRights } = useOrgPackages();
    const { templates, addTemplate, updateTemplate, removeTemplate } = usePackageTemplates();
    const { customers, customerById, isArchivedCustomer, addCustomer } = useCustomers();
    const { reservations, settings } = useReservations();
    const { resources } = useResources();
    const { addPayment } = usePayments();
    const resourceName = useCallback((id?: string) => resources.find((r) => r.id === id)?.name || '', [resources]);
    const nextLoc = useCallback((r: Reservation | null) => r ? [r.staffName, resourceName(r.resourceId)].filter(Boolean).join(' · ') : '', [resourceName]);
    const services: Service[] = useMemo(() => settings.services || [], [settings.services]);
    const today = todayISO();

    const [paidByPlan, setPaidByPlan] = useState<Map<string, { total: number; lastAt: string | null }>>(new Map());
    const [filter, setFilter] = useState<FilterKey>('all');
    const [sort, setSort] = useState<SortKey>('priority');
    const [detailMenu, setDetailMenu] = useState(false);
    const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);
    const [correctFor, setCorrectFor] = useState<Pkg | null>(null);
    const [defsOpen, setDefsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detailTab, setDetailTab] = useState<'rights' | 'finance' | 'history'>('rights');
    const [mobileDetail, setMobileDetail] = useState(false);
    const [saleOpen, setSaleOpen] = useState(false);
    const [saleCustomerId, setSaleCustomerId] = useState<string | null>(null);
    const [modalCustomer, setModalCustomer] = useState<Customer | null | undefined>(undefined);

    // Müşteri kartından "Paket Sat" ile gelindiğinde (?sat=<id>) satış drawer'ını
    // o müşteri seçili olarak aç; param'ı temizle ki geri/yenilemede tekrar açılmasın.
    useEffect(() => {
        const satId = searchParams.get('sat');
        if (!satId) return;
        setSaleCustomerId(satId);
        setSaleOpen(true);
        searchParams.delete('sat');
        setSearchParams(searchParams, { replace: true });
    }, [searchParams, setSearchParams]);

    // Kasa'daki "Paketi aç" ile gelindiğinde (?paket=<planId>) o paketin detayını
    // doğrudan aç — genel listeye düşürüp kullanıcıya paketi arattırma.
    useEffect(() => {
        const planId = searchParams.get('paket');
        if (!planId) return;
        setSelectedId(planId);
        setDetailTab('rights');
        setMobileDetail(true);
        searchParams.delete('paket');
        setSearchParams(searchParams, { replace: true });
    }, [searchParams, setSearchParams]);
    const [history, setHistory] = useState<{ kind: 'sale' | 'payment' | 'session'; label: string; sub: string; when: string; tone: string }[]>([]);
    const [editRes, setEditRes] = useState<Reservation | null>(null);

    // Plan bazlı ödemeler (bakiye + son ödeme) — tek sorgu
    const loadPaid = useCallback(async () => {
        if (!orgId) return;
        const { data, error } = await supabase.from('payments')
            .select('treatment_plan_id, amount, paid_at')
            .eq('organization_id', orgId).not('treatment_plan_id', 'is', null);
        if (error) { console.error(error); return; }
        const map = new Map<string, { total: number; lastAt: string | null }>();
        for (const p of data || []) {
            const prev = map.get(p.treatment_plan_id) || { total: 0, lastAt: null };
            map.set(p.treatment_plan_id, {
                total: prev.total + Number(p.amount),
                lastAt: !prev.lastAt || p.paid_at > prev.lastAt ? p.paid_at : prev.lastAt,
            });
        }
        setPaidByPlan(map);
    }, [orgId]);
    useEffect(() => { void loadPaid(); }, [loadPaid, packages]);

    const serviceColor = useCallback((title: string): string => {
        const t = title.toLocaleLowerCase('tr');
        const svc = services.find((s) => t.includes(s.name.toLocaleLowerCase('tr')) || s.name.toLocaleLowerCase('tr').includes(t));
        if (svc) return svc.color;
        let h = 0; for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) % PALETTE.length;
        return PALETTE[h];
    }, [services]);

    // Pakete bağlı ileri randevular (rezerve hak) — customFields.paket_plan_id ile
    const reservedByPlan = useMemo(() => {
        const m = new Map<string, Reservation[]>();
        for (const r of reservations) {
            const planId = String(r.customFields?.paket_plan_id ?? '');
            if (!planId) continue;
            if (r.status === 'cancelled' || r.customFields?.paket_sayildi) continue;
            if (r.date < today) continue;            // geçmiş, sayılmamış → rezerve değil
            (m.get(planId) || m.set(planId, []).get(planId)!).push(r);
        }
        for (const list of m.values()) list.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
        return m;
    }, [reservations, today]);

    const newestByCustomer = useMemo(() => {
        const m = new Map<string, string>();
        for (const p of packages) {
            if (p.status === 'cancelled') continue;
            const prev = m.get(p.customerId);
            if (!prev || p.createdAt > prev) m.set(p.customerId, p.createdAt);
        }
        return m;
    }, [packages]);

    const futureByCustomer = useMemo(() => {
        const set = new Set<string>();
        for (const r of reservations) if (r.status !== 'cancelled' && r.date >= today) set.add(r.customerId);
        return set;
    }, [reservations, today]);

    const items = useMemo<Pkg[]>(() => packages.map((raw) => {
        const customer = customerById.get(raw.customerId);
        const pay = paidByPlan.get(raw.id);
        const total = raw.sessionCount;
        const used = Math.min(total, raw.sessionsDone);
        const resList = reservedByPlan.get(raw.id) || [];
        const reserved = Math.min(Math.max(0, total - used), resList.length);
        const available = Math.max(0, total - used - reserved);
        const price = raw.totalAmount;
        const paid = pay?.total || 0;
        const balance = Math.max(0, price - paid);
        const cancelled = raw.status === 'cancelled';
        const finished = !cancelled && used >= total;
        const lastMoneyAt = pay?.lastAt || raw.createdAt;
        const silentDays = daysSince(lastMoneyAt);
        const overdue = !cancelled && !finished && balance > 0 && silentDays >= 30;
        const renewedAfter = (newestByCustomer.get(raw.customerId) || '') > raw.createdAt;
        const needsRenewal = finished && !raw.renewalOfferedAt && !renewedAfter;
        const unplanned = !cancelled && !finished && !futureByCustomer.has(raw.customerId);
        // "Son hak" ancak çok seanslı pakette anlamlı. Tek seanslık paket
        // satıldığı andan itibaren 0/1 olduğu için rozet hep yanıyor ve hiçbir
        // şey söylemiyordu — total > 1 koşuluyla uyarı tekrar bilgi taşır.
        const state: PkgState = cancelled ? 'paused'
            : finished ? 'completed'
                : overdue ? 'attention'
                    : total > 1 && available <= 1 ? 'ending' : 'active';
        const todayUse = resList.filter((r) => r.date === today).length;
        const svc = services.find((s) => raw.title.toLocaleLowerCase('tr').includes(s.name.toLocaleLowerCase('tr')));
        return {
            raw, customer, color: serviceColor(raw.title),
            total, used, reserved, available, price, paid, balance,
            state, overdue, silentDays, needsRenewal, unplanned,
            next: resList[0] || null, todayUse, soldOn: raw.createdAt,
            code: pkgCode(raw.id),
            subtitle: raw.notes?.trim() || (svc ? `${svc.name} · ${svc.duration} dk` : `${total} seanslık paket`),
        };
    }), [packages, customerById, paidByPlan, reservedByPlan, newestByCustomer, futureByCustomer, serviceColor, services, today]);

    const isAction = (p: Pkg) => p.state === 'attention' || p.needsRenewal || p.unplanned;
    const weekAgo = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString(); }, []);
    const counts = useMemo(() => ({
        all: items.length,
        today: items.filter((p) => p.todayUse > 0).length,
        action: items.filter(isAction).length,
        active: items.filter((p) => p.state === 'active' || p.state === 'ending').length,
        ending: items.filter((p) => p.state === 'ending').length,
        completed: items.filter((p) => p.state === 'completed').length,
        cancelled: items.filter((p) => p.state === 'paused').length,
        attention: items.filter((p) => p.state === 'attention').length,
        renewal: items.filter((p) => p.needsRenewal).length,
        unplanned: items.filter((p) => p.unplanned).length,
        balance: items.filter((p) => p.balance > 0 && p.state !== 'paused').length,
        newThisWeek: items.filter((p) => p.soldOn >= weekAgo && p.state !== 'paused').length,
        todaySessions: items.reduce((s, p) => s + p.todayUse, 0),
    }), [items, weekAgo]);

    const totalBalance = useMemo(() => items.filter((p) => p.state !== 'paused').reduce((s, p) => s + p.balance, 0), [items]);
    const balanceCustomers = useMemo(() => new Set(items.filter((p) => p.balance > 0 && p.state !== 'paused').map((p) => p.raw.customerId)).size, [items]);

    const visible = useMemo(() => {
        let list = items;
        if (filter === 'today') list = items.filter((p) => p.todayUse > 0);
        else if (filter === 'action') list = items.filter(isAction);
        else if (filter === 'active') list = items.filter((p) => p.state === 'active' || p.state === 'ending');
        else if (filter === 'ending') list = items.filter((p) => p.state === 'ending');
        else if (filter === 'completed') list = items.filter((p) => p.state === 'completed');
        else if (filter === 'cancelled') list = items.filter((p) => p.state === 'paused');
        else if (filter === 'attention') list = items.filter((p) => p.state === 'attention');
        else if (filter === 'renewal') list = items.filter((p) => p.needsRenewal);
        else if (filter === 'unplanned') list = items.filter((p) => p.unplanned);
        else if (filter === 'balance') list = items.filter((p) => p.balance > 0 && p.state !== 'paused');
        const q = query.trim().toLocaleLowerCase('tr');
        if (q) list = list.filter((p) => p.raw.title.toLocaleLowerCase('tr').includes(q) || (p.customer?.name || '').toLocaleLowerCase('tr').includes(q));
        const arr = [...list];
        arr.sort((a, b) => {
            if (sort === 'balance') return b.balance - a.balance;
            if (sort === 'ending') return a.available - b.available;
            if (sort === 'name') return (a.customer?.name || '').localeCompare(b.customer?.name || '', 'tr');
            if (sort === 'recent') return b.soldOn.localeCompare(a.soldOn);
            // priority: dikkat → son hak → aktif → bitti → iptal, sonra en yeni
            return STATE_RANK[a.state] - STATE_RANK[b.state] || b.soldOn.localeCompare(a.soldOn);
        });
        return arr;
    }, [items, filter, query, sort]);

    const selected = useMemo(() => visible.find((p) => p.raw.id === selectedId) || items.find((p) => p.raw.id === selectedId) || null, [visible, items, selectedId]);

    // Seçili paketin geçmişi (satış + ödemeler + tamamlanan seanslar)
    useEffect(() => {
        if (!selected || !orgId) { setHistory([]); return; }
        let alive = true;
        const planId = selected.raw.id;
        const sessionsDone = reservations.filter((r) => String(r.customFields?.paket_plan_id ?? '') === planId && r.status === 'completed');
        void Promise.all([
            supabase.from('payments').select('amount, paid_at, method').eq('organization_id', orgId).eq('treatment_plan_id', planId),
            supabase.from('package_rights_ledger').select('field, delta, prev_value, new_value, reason, created_at').eq('plan_id', planId).order('created_at', { ascending: false }),
        ]).then(([pay, led]) => {
            if (!alive) return;
            const events: typeof history = [];
            events.push({ kind: 'sale', label: 'Paket satıldı', sub: `${selected.total} seans · ${fmtTL(selected.price)}`, when: selected.soldOn, tone: 'purple' });
            for (const p of pay.data || []) events.push({ kind: 'payment', label: `${fmtTL(Number(p.amount))} tahsil edildi`, sub: p.method === 'cash' ? 'Nakit' : p.method === 'card' ? 'Kart' : p.method === 'transfer' ? 'Havale' : 'Diğer', when: p.paid_at, tone: 'green' });
            // Tarihi yalnız zaman çizelgesi bassın: `sub` içine de ham ISO tarih
            // konunca satırda iki farklı tarih görünüyordu (biri randevu günü,
            // biri bitiş damgası) ve ikisi birbirini tutmuyordu.
            for (const s of sessionsDone) events.push({ kind: 'session', label: 'Seans kullanıldı', sub: s.service, when: (s.serviceEndedAt || s.date), tone: 'orange' });
            for (const l of led.data || []) events.push({ kind: 'session', label: `Hak düzeltmesi · ${l.field === 'total' ? 'toplam' : 'kullanılan'} ${l.prev_value}→${l.new_value}`, sub: l.reason, when: l.created_at, tone: 'amber' });
            events.sort((a, b) => b.when.localeCompare(a.when));
            setHistory(events);
        });
        return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId, orgId, reservations]);

    // Detayı, o paketin asıl işine açar: bakiyesi varsa Finans, bitmişse Geçmiş,
    // aksi halde Haklar. Böylece "Ödeme" yazan buton gerçekten ödemeye götürür.
    const openDetail = (id: string, tab?: typeof detailTab) => {
        const p = items.find((x) => x.raw.id === id);
        setSelectedId(id);
        setDetailTab(tab ?? (p && p.balance > 0 ? 'finance' : p?.state === 'completed' ? 'history' : 'rights'));
        setDetailMenu(false); setCancelConfirm(null); setMobileDetail(true);
    };

    // Yenileme teklifi — WhatsApp taslağını açar ve paketi bir kez damgalar
    // (renewal_offered_at). Damga olmadan paket "yenileme fırsatı" listesinden
    // hiç düşmüyordu; bu aksiyon o döngüyü kapatır.
    const [offering, setOffering] = useState<string | null>(null);
    const sendRenewalOffer = async (p: Pkg) => {
        if (!p.customer?.phone || !hasWa(p.customer.phone)) { toast.error('Müşterinin geçerli telefonu kayıtlı değil'); return; }
        if (offering) return;
        setOffering(p.raw.id);
        window.open(waLink(p.customer.phone, `Merhaba ${p.customer.name.split(' ')[0]} 🌸 *${p.raw.title}* paketiniz tamamlandı — emeğinize sağlık! Yenilemek isterseniz size özel bir plan hazırlayalım ✨`), '_blank');
        const { error } = await supabase.from('treatment_plans')
            .update({ renewal_offered_at: new Date().toISOString() }).eq('id', p.raw.id);
        setOffering(null);
        if (error) { console.error(error); toast.error('Teklif damgası kaydedilemedi'); return; }
        toast.success('Yenileme teklifi gönderildi ✨');
        await refresh();
    };

    // Satır sonundaki tek buton — paketin o anki durumuna göre asıl işi yapar.
    const rowAction = (p: Pkg): { label: string; run: () => void } => {
        if (p.state === 'paused') return { label: 'Detay', run: () => openDetail(p.raw.id) };
        if (p.needsRenewal) return { label: 'Yenile', run: () => void sendRenewalOffer(p) };
        if (p.balance > 0) return { label: 'Kasaya', run: () => sendToKasa(p) };
        if (p.available > 0 && !p.next && p.customer && !isArchivedCustomer(p.raw.customerId)) {
            return { label: 'Planla', run: () => setModalCustomer(p.customer!) };
        }
        return { label: 'Detay', run: () => openDetail(p.raw.id) };
    };

    // Paketi iptal et — hak kaydı silinmez, plan durumu 'cancelled' olur (iki-tık onay)
    const cancelPackage = async (p: Pkg) => {
        if (cancelConfirm !== p.raw.id) { setCancelConfirm(p.raw.id); return; }
        const { error } = await supabase.from('treatment_plans').update({ status: 'cancelled' }).eq('id', p.raw.id);
        setCancelConfirm(null); setDetailMenu(false);
        if (error) { console.error(error); toast.error('Paket iptal edilemedi'); return; }
        toast.success('Paket iptal edildi');
        await refresh();
    };

    // ── Bakiyeyi Kasa'ya gönder ────────────────────────────────────────────────
    // Burada ödeme ALINMAZ. Eskiden bu buton tutarı sessizce "nakit" olarak
    // yazıyordu; müşteri kartla ödediğinde gün sonu kırılımı bozuluyordu.
    // Artık müşteri kasaya gönderilir: yöntem, tutar ve fiş Kasa'da belirlenir.
    const sendToKasa = (p: Pkg) => {
        if (p.balance <= 0) return;
        sendPackageToKasa(p.raw.id);
        toast.success(`${p.customer?.name || 'Müşteri'} kasaya gönderildi · ${fmtTL(p.balance)}`);
        navigate(`/kasa?paket=${p.raw.id}`);
    };

    const dot = (tone: string) => ({ background: `var(--dc-${tone === 'orange' ? 'orange' : tone})` });

    return (
        <div className={`bpk dash-theme${dark ? ' dark' : ''}`}>
            <div className="page-content">
                {/* Başlık */}
                <div className="page-head">
                    <div>
                        <h1>Paketler</h1>
                    </div>
                    <div className="head-actions">
                        <button className="button secondary" onClick={() => setDefsOpen(true)}>
                            <Layers size={15} />Paket tanımları
                        </button>
                        <button className="button primary" onClick={() => setSaleOpen(true)}>
                            <Package size={15} />Paket sat
                        </button>
                    </div>
                </div>

                {/* Özet şeridi */}
                <div className="summary-strip">
                    <button onClick={() => setFilter('active')}>
                        <span className="summary-icon green"><Package size={17} /></span>
                        <span><small>AKTİF PAKET</small><strong>{counts.active}</strong></span>
                        <em>{counts.newThisWeek} yeni</em>
                    </button>
                    <button onClick={() => setFilter('today')}>
                        <span className="summary-icon orange"><Calendar size={17} /></span>
                        <span><small>BUGÜN KULLANILACAK</small><strong>{counts.todaySessions} hak</strong></span>
                        <em>{counts.today} pakette</em>
                    </button>
                    <button onClick={() => setFilter('renewal')}>
                        <span className="summary-icon amber"><RefreshCw size={17} /></span>
                        <span><small>YENİLEME FIRSATI</small><strong>{counts.renewal} müşteri</strong></span>
                        <em>bu hafta</em>
                    </button>
                    <button onClick={() => { setFilter('balance'); setSort('balance'); }}>
                        <span className="summary-icon red"><Wallet size={17} /></span>
                        <span><small>AÇIK TAHSİLAT</small><strong>{fmtTL(totalBalance)}</strong></span>
                        <em>{balanceCustomers} müşteride{counts.attention > 0 ? ` · ${counts.attention} gecikmiş` : ''}</em>
                    </button>
                </div>

                {/* Mobil hızlı filtreler */}
                <div className="mobile-filters">
                    {([['all', 'Tümü', counts.all], ['active', 'Aktif', counts.active], ['attention', 'Dikkat', counts.attention], ['renewal', 'Yenileme', counts.renewal], ['completed', 'Bitti', counts.completed], ['cancelled', 'İptal', counts.cancelled]] as [FilterKey, string, number][]).map(([k, label, c]) => (
                        <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{label}<b>{c}</b></button>
                    ))}
                </div>

                <div className="package-workspace">
                    {/* Filtre rayı */}
                    <aside className="filter-rail">
                        <div className="rail-head">
                            <span style={{ font: `650 11px ${MONO}`, letterSpacing: '.2em', color: 'var(--dc-muted)' }}>AKILLI GÖRÜNÜMLER</span>
                            <button aria-label="Filtreleri düzenle"><Layers size={15} /></button>
                        </div>
                        <div className="filter-groups">
                            <div>
                                <small>GENEL</small>
                                {([['all', 'Tüm paketler', counts.all, ''], ['today', 'Bugün kullanılacak', counts.today, 'orange'], ['action', 'Aksiyon bekliyor', counts.action, 'red']] as [FilterKey, string, number, string][]).map(([k, label, c, tone]) => (
                                    <button key={k} className={`${filter === k ? 'active' : ''} ${tone}`.trim()} onClick={() => setFilter(k)}>
                                        <span>{label}</span><b>{c}</b>
                                    </button>
                                ))}
                            </div>
                            <div>
                                <small>DURUM</small>
                                {([['active', 'Aktif', counts.active, 'green'], ['ending', 'Son hakkı kalan', counts.ending, 'amber'], ['completed', 'Bitti', counts.completed, ''], ['cancelled', 'İptal', counts.cancelled, 'purple']] as [FilterKey, string, number, string][]).map(([k, label, c, tone]) => (
                                    <button key={k} className={`${filter === k ? 'active' : ''} ${tone}`.trim()} onClick={() => setFilter(k)}>
                                        <span>{label}</span><b>{c}</b>
                                    </button>
                                ))}
                            </div>
                            <div>
                                <small>DİKKAT</small>
                                {([['unplanned', 'Seansı plansız', counts.unplanned, 'amber'], ['balance', 'Açık bakiyeli', counts.balance, 'red'], ['attention', 'Tahsilatı gecikmiş', counts.attention, 'red'], ['renewal', 'Biten / yenileme', counts.renewal, 'orange']] as [FilterKey, string, number, string][]).map(([k, label, c, tone]) => (
                                    <button key={k} className={`${filter === k ? 'active' : ''} ${tone}`.trim()} onClick={() => setFilter(k)}>
                                        <span>{label}</span><b>{c}</b>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </aside>

                    {/* Liste paneli */}
                    <section className="package-list-panel">
                        <div className="list-head">
                            <div>
                                <span className="eyebrow">MÜŞTERİ PAKETLERİ</span>
                                <h2>{FILTER_LABEL[filter]}</h2>
                            </div>
                            <span className="result-count">{visible.length} gösteriliyor</span>
                        </div>
                        <div className="list-tools">
                            <div className="searchbox">
                                <Search size={15} />
                                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Müşteri, telefon veya paket ara…" />
                                {query && <button aria-label="Aramayı temizle" onClick={() => setQuery('')}><X size={13} /></button>}
                            </div>
                            <div className="sortbox">
                                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sıralama">
                                    <option value="priority">Önceliğe göre</option>
                                    <option value="recent">Yeni önce</option>
                                    <option value="balance">Bakiye</option>
                                    <option value="ending">Az hak kalan</option>
                                    <option value="name">İsim</option>
                                </select>
                                <ChevronDown size={14} />
                            </div>
                        </div>
                        <div className="column-heads">
                            <span>MÜŞTERİ / PAKET</span><span>HAK DURUMU</span><span>SONRAKİ SEANS</span><span>FİNANS</span><span></span>
                        </div>
                        <div className="package-list">
                            {packagesLoading && items.length === 0 && (
                                Array.from({ length: 6 }).map((_, i) => <div key={`sk${i}`} className="package-row pkg-skeleton" aria-hidden />)
                            )}
                            {!packagesLoading && visible.length === 0 && (
                                <div className="empty-state">
                                    <Package size={26} strokeWidth={1.5} />
                                    <strong>{counts.all === 0 ? 'Henüz paket yok' : 'Bu filtrede paket yok'}</strong>
                                    <p>{counts.all === 0 ? 'İlk paketi satarak başlayın.' : 'Filtreyi değiştirin veya aramayı temizleyin.'}</p>
                                    {counts.all === 0 && <button onClick={() => setSaleOpen(true)}>Yeni paket satışı →</button>}
                                </div>
                            )}
                            {visible.map((p) => {
                                const pct = Math.round((p.used / p.total) * 100);
                                return (
                                    <div key={p.raw.id} className={`package-row ${selectedId === p.raw.id ? 'is-selected' : ''} ${p.state === 'attention' ? 'state-attention' : ''}`.trim()}>
                                        <button className="row-select" onClick={() => openDetail(p.raw.id)} aria-label={`${p.customer?.name || 'paket'} detayını aç`} />
                                        <span className="row-rail" style={{ background: p.color }} />
                                        <div className="customer-cell">
                                            <span className="avatar">{initials(p.customer?.name || '??')}</span>
                                            <div className="customer-copy">
                                                <strong>{p.customer?.name || 'Müşteri kaydı yok'}{isArchivedCustomer(p.raw.customerId) ? ' · pasif' : ''}</strong>
                                                <small>{p.raw.title}</small>
                                            </div>
                                        </div>
                                        <div className="rights-cell">
                                            <div className="rights-line">
                                                <strong>{p.used}/{p.total}</strong><span>{p.available} kullanılabilir</span>
                                            </div>
                                            <div className="progress-track">
                                                <i style={{ width: `${pct}%`, background: p.state === 'completed' ? 'var(--dc-orange)' : 'var(--dc-ink)' }} />
                                                {p.reserved > 0 && <b style={{ left: `${Math.min(100, Math.round(((p.used + p.reserved) / p.total) * 100))}%` }} />}
                                            </div>
                                            <small>{p.reserved > 0 ? `${p.reserved} hak rezerve` : 'rezerve yok'}</small>
                                        </div>
                                        <div className="next-cell">
                                            {p.next ? (<>
                                                <strong className={p.next.date === today ? 'today-text' : ''}>{p.next.date === today ? 'Bugün' : p.next.date.slice(5).split('-').reverse().join('.')} · {p.next.startTime}</strong>
                                                <small>{nextLoc(p.next) || 'Uzman atanmadı'}</small>
                                            </>) : (<>
                                                <strong style={{ color: 'var(--dc-muted)' }}>Planlanmadı</strong>
                                                <small>{p.overdue ? `${p.silentDays} gündür ödeme yok` : p.state === 'completed' ? 'Yenileme teklifi için uygun' : p.needsRenewal ? 'Yenileme teklifi için uygun' : 'Sonraki seans planlanmadı'}</small>
                                            </>)}
                                        </div>
                                        <div className="finance-cell">
                                            <strong className={p.balance > 0 ? 'balance' : ''}>{p.balance > 0 ? fmtTL(p.balance) : 'Ödendi'}</strong>
                                            <small>{p.balance > 0 ? 'kalan bakiye' : fmtTL(p.price)}</small>
                                        </div>
                                        <div className="row-tail">
                                            <span className={`state-badge ${p.state}`}>{STATE_TR[p.state]}</span>
                                            <div className="tail-actions">
                                                {p.customer?.phone && hasWa(p.customer.phone) && (
                                                    <a className="row-icon" href={waLink(p.customer.phone)} target="_blank" rel="noopener noreferrer"
                                                        aria-label={`${p.customer.name} müşterisine WhatsApp'tan yaz`}><MessageCircle size={14} /></a>
                                                )}
                                                {(() => { const a = rowAction(p); return (
                                                    <button className="row-action" onClick={a.run} disabled={offering === p.raw.id}>{a.label}<ChevronRight size={12} /></button>
                                                ); })()}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* Detay paneli */}
                    <aside className={`detail-panel ${mobileDetail ? 'mobile-open' : ''}`}>
                        {!selected ? (
                            <div className="empty-state" style={{ margin: 'auto' }}>
                                <Package size={26} strokeWidth={1.5} />
                                <strong>Paket seçin</strong>
                                <p>Detay, hak dökümü ve tahsilat için soldan bir paket açın.</p>
                            </div>
                        ) : (<>
                            <button className="detail-close" onClick={() => setMobileDetail(false)} aria-label="Detayı kapat"><X size={16} /></button>
                            <div className="detail-hero" style={{ ['--package-color' as string]: selected.color }}>
                                <div className="detail-topline">
                                    <span className={`state-badge ${selected.state}`}>{STATE_TR[selected.state]}</span>
                                    <div style={{ position: 'relative' }}>
                                        <button onClick={() => setDetailMenu((v) => !v)} aria-label="Diğer paket işlemleri"><MoreHorizontal size={16} /></button>
                                        {detailMenu && (
                                            <div className="detail-menu">
                                                {user?.role === 'Admin' && <button onClick={() => { setDetailMenu(false); setCorrectFor(selected); }}><Layers size={13} />Düzeltme yap</button>}
                                                {selected.next && <button onClick={() => { setDetailMenu(false); setEditRes(selected.next!); }}><Calendar size={13} />Randevuyu aç</button>}
                                                {selected.state !== 'paused' && (
                                                    <button className="danger" onClick={() => void cancelPackage(selected)}>
                                                        <X size={13} />{cancelConfirm === selected.raw.id ? 'Onayla · paketi iptal et' : 'Paketi iptal et'}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="detail-avatar">{initials(selected.customer?.name || '??')}</div>
                                <div className="detail-name">
                                    <span>SEÇİLİ MÜŞTERİ</span>
                                    <h2>{selected.customer?.name || 'Müşteri kaydı yok'}</h2>
                                    {selected.customer?.phone && hasWa(selected.customer.phone)
                                        ? <p><a href={waLink(selected.customer.phone)} target="_blank" rel="noopener noreferrer" className="hero-phone">{selected.customer.phone}<MessageCircle size={11} /></a></p>
                                        : <p>—</p>}
                                </div>
                                <div className="hero-rights">
                                    <strong>{selected.used}<small>/{selected.total}</small></strong>
                                    <span>HAK KULLANILDI</span>
                                </div>
                                <div className="detail-package">
                                    <small>{selected.code}</small>
                                    <strong>{selected.raw.title}</strong>
                                    <span>{selected.subtitle}</span>
                                </div>
                                <div className="hero-progress" style={{ display: 'flex', gap: 2 }}>
                                    <i style={{ flex: `0 0 ${(selected.used / selected.total) * 100}%`, background: '#f5efe7' }} />
                                    <i style={{ flex: `0 0 ${(selected.reserved / selected.total) * 100}%`, background: 'rgba(245,239,231,.42)' }} />
                                </div>
                                <div className="hero-stats">
                                    <span>Kullanılabilir<br /><b>{selected.available}</b></span>
                                    <span>Rezerve<br /><b>{selected.reserved}</b></span>
                                    <span>Kullanıldı<br /><b>{selected.used}</b></span>
                                </div>
                            </div>

                            {(selected.overdue || selected.needsRenewal) && (
                                <div className={`attention-note ${selected.overdue ? 'attention' : ''}`}>
                                    <AlertTriangle size={15} />
                                    <span>
                                        <strong>{selected.overdue ? 'Tahsilat gecikti' : 'Yenileme fırsatı'}</strong>
                                        {selected.overdue ? `${selected.silentDays} gündür ödeme yok · açık bakiye ${fmtTL(selected.balance)}` : 'Paket tamamlandı — yenileme teklifi gönderebilirsiniz.'}
                                    </span>
                                    {selected.overdue
                                        ? <button className="note-action" onClick={() => sendToKasa(selected)}>Kasaya gönder</button>
                                        : selected.customer?.phone && hasWa(selected.customer.phone) && <button className="note-action" disabled={offering === selected.raw.id} onClick={() => void sendRenewalOffer(selected)}>Teklif gönder</button>}
                                </div>
                            )}

                            <div className="detail-tabs" role="tablist">
                                {([['rights', 'Haklar'], ['finance', 'Finans'], ['history', 'Geçmiş']] as [typeof detailTab, string][]).map(([k, label]) => (
                                    <button key={k} role="tab" aria-selected={detailTab === k} onClick={() => setDetailTab(k)}>{label}</button>
                                ))}
                            </div>

                            <div className="detail-body">
                                {detailTab === 'rights' && (<>
                                    <div className="detail-section">
                                        <div className="section-title">
                                            <span><Calendar size={14} />Sonraki seans</span>
                                            {selected.next && <button onClick={() => setEditRes(selected.next!)}>Randevuyu aç<ChevronRight size={12} /></button>}
                                        </div>
                                        {selected.next ? (
                                            <div className="next-session">
                                                <div className="date-tile">
                                                    <small>{selected.next.date === today ? 'BUGÜN' : 'GÜN'}</small>
                                                    <strong>{selected.next.date.slice(8, 10)}</strong>
                                                </div>
                                                <div>
                                                    <strong>{selected.next.startTime} · {selected.next.service}</strong>
                                                    <span>{nextLoc(selected.next) || 'Uzman atanmadı'}</span>
                                                </div>
                                                <Check size={15} />
                                            </div>
                                        ) : (
                                            <div className="no-session">
                                                <Clock size={14} />
                                                <span><strong>Sonraki seans yok</strong>{selected.available > 0 ? `${selected.available} hak planlanmayı bekliyor.` : 'Kullanılabilir hak kalmadı.'}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="detail-section compact">
                                        <div className="section-title"><span><Package size={14} />Hak özeti</span><small>Randevu tamamlanınca düşer</small></div>
                                        <div className="rights-cards">
                                            <div><small>KULLANILDI</small><strong>{selected.used}</strong><span>Tamamlanan seans</span></div>
                                            <div><small>REZERVE</small><strong>{selected.reserved}</strong><span>Yaklaşan randevu</span></div>
                                            <div><small>KULLANILABİLİR</small><strong>{selected.available}</strong><span>Planlanabilir hak</span></div>
                                        </div>
                                        <div className="integrity-line">
                                            <ShieldCheck size={12} />
                                            {selected.used} + {selected.reserved} + {selected.available} = {selected.total} hak · Tutarlı
                                        </div>
                                    </div>
                                </>)}

                                {detailTab === 'finance' && (<>
                                    <div className="detail-section compact">
                                        <div className="finance-hero">
                                            <span><small>PAKET BEDELİ</small><strong>{fmtTL(selected.price)}</strong></span>
                                            <span><small>TAHSİL EDİLEN</small><strong>{fmtTL(selected.paid)}</strong></span>
                                            <span className={selected.balance > 0 ? 'has-balance' : ''}><small>AÇIK BAKİYE</small><strong>{fmtTL(selected.balance)}</strong></span>
                                        </div>
                                        <div className="paid-track"><i style={{ width: `${selected.price > 0 ? Math.round((selected.paid / selected.price) * 100) : 100}%` }} /></div>
                                        <div style={{ marginTop: 9, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            {/* Hiç tahsilat yokken "Kısmi ödeme" demek yanlıştı. */}
                                            {selected.balance > 0
                                                ? <span className="mini-danger">{selected.paid > 0 ? 'Kısmi ödeme' : 'Ödeme yok'}</span>
                                                : <span className="mini-success">Tam ödendi</span>}
                                            {selected.balance > 0 && (
                                                <button className="button primary" style={{ marginLeft: 'auto', minHeight: 34, fontSize: 10.5 }}
                                                    title="Tahsilat Kasa'dan alınır — yöntem ve tutar orada seçilir"
                                                    onClick={() => sendToKasa(selected)}>
                                                    <Wallet size={13} />Kasaya gönder
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="detail-section">
                                        <div className="section-title"><span><Wallet size={14} />Bilgiler</span></div>
                                        <div className="info-line"><span>Satış tarihi</span><strong>{selected.soldOn.slice(0, 10).split('-').reverse().join('.')}</strong></div>
                                        <div className="info-line"><span>Seans başı</span><strong>{fmtTL(selected.price / selected.total)}</strong></div>
                                        <div className="info-line"><span>Durum</span><strong>{STATE_TR[selected.state]}</strong></div>
                                    </div>
                                </>)}

                                {detailTab === 'history' && (
                                    <div className="detail-section">
                                        <div className="section-title"><span><History size={14} />Hareketler</span><small>{history.length} kayıt</small></div>
                                        <div className="timeline">
                                            {history.length === 0 && <p style={{ color: 'var(--dc-muted)', fontSize: 10, margin: '6px 0' }}>Kayıt yok</p>}
                                            {history.map((h, i) => (
                                                <div key={i}>
                                                    <i style={dot(h.tone)} />
                                                    <span><strong>{h.label}</strong><small>{h.sub} · {h.when.slice(0, 10).split('-').reverse().join('.')}</small></span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="detail-actions">
                                {user?.role === 'Admin' && (
                                    <button className="button quiet" onClick={() => setCorrectFor(selected)}>
                                        <Layers size={14} />Düzeltme yap
                                    </button>
                                )}
                                {/* Bitmiş pakette "Seans planla" hep pasifti — sağ alt köşe ölü butondu.
                                    Artık paketin durumuna göre gerçek bir işe dönüşür. */}
                                {selected.needsRenewal && selected.customer?.phone && hasWa(selected.customer.phone) ? (
                                    <button className="button primary" disabled={offering === selected.raw.id} onClick={() => void sendRenewalOffer(selected)}>
                                        <RefreshCw size={14} />{offering === selected.raw.id ? 'Gönderiliyor…' : 'Yenileme teklifi'}
                                    </button>
                                ) : selected.state === 'completed' && selected.raw.renewalOfferedAt ? (
                                    /* Teklif gönderilmiş bitmiş pakette sıradaki iş yeni satıştır —
                                       burası pasif bir etiketle ölü duruyordu. */
                                    <button className="button primary" disabled={!selected.customer || isArchivedCustomer(selected.raw.customerId)}
                                        title={!selected.customer ? 'Müşteri kaydı yok' : isArchivedCustomer(selected.raw.customerId) ? 'Müşteri pasif' : 'Teklif gönderildi — yeni paket satabilirsiniz'}
                                        onClick={() => { setSaleCustomerId(selected.raw.customerId); setSaleOpen(true); }}>
                                        <Package size={14} />Yeni paket sat
                                    </button>
                                ) : (
                                    <button className="button primary" disabled={!selected.customer || isArchivedCustomer(selected.raw.customerId) || selected.state === 'completed'}
                                        title={!selected.customer ? 'Müşteri kaydı yok' : isArchivedCustomer(selected.raw.customerId) ? 'Müşteri pasif' : selected.state === 'completed' ? 'Paket bitti' : undefined}
                                        onClick={() => selected.customer && setModalCustomer(selected.customer)}>
                                        <CalendarPlus size={14} />Seans planla
                                    </button>
                                )}
                            </div>
                        </>)}
                    </aside>
                    {mobileDetail && <button className="mobile-scrim" aria-label="Kapat" onClick={() => setMobileDetail(false)} />}
                </div>
            </div>

            {saleOpen && (
                <SaleDrawer
                    customers={customers} services={services} templates={templates} packages={packages}
                    isArchived={isArchivedCustomer} initialCustomerId={saleCustomerId}
                    addPackage={addPackage} addPayment={addPayment} addCustomer={addCustomer}
                    onClose={() => { setSaleOpen(false); setSaleCustomerId(null); }}
                    onDone={async (newId) => { setSaleOpen(false); setSaleCustomerId(null); await refresh(); await loadPaid(); setSelectedId(newId); setMobileDetail(true); }}
                    onOpenExisting={(id) => { setSaleOpen(false); setSaleCustomerId(null); setSelectedId(id); setMobileDetail(true); }}
                />
            )}

            {correctFor && (
                <CorrectionModal pkg={correctFor} onClose={() => setCorrectFor(null)}
                    onApply={(field, delta, reason) => correctRights(correctFor.raw.id, field, delta, reason)} />
            )}

            {defsOpen && (
                <DefinitionsModal templates={templates} onClose={() => setDefsOpen(false)}
                    addTemplate={addTemplate} updateTemplate={updateTemplate} removeTemplate={removeTemplate} />
            )}

            {modalCustomer !== undefined && (
                <BeautySessionModal customer={modalCustomer} onClose={() => setModalCustomer(undefined)} onCreated={() => { setModalCustomer(undefined); void refresh(); }} />
            )}
            
            {editRes && (
                <EditReservationModal
                    reservation={reservations.find(x => x.id === editRes.id) || editRes}
                    isOpen={!!editRes}
                    onClose={() => setEditRes(null)}
                />
            )}
        </div>
    );
}

// ══ Güvenli paket satışı drawer'ı (4 adım) ═══════════════════════════════════
interface SaleProps {
    customers: Customer[];
    services: Service[];
    templates: PackageTemplate[];
    packages: OrgPackage[];
    isArchived: (id: string) => boolean;
    addPackage: ReturnType<typeof useOrgPackages>['addPackage'];
    addPayment: ReturnType<typeof usePayments>['addPayment'];
    addCustomer: ReturnType<typeof useCustomers>['addCustomer'];
    onClose: () => void;
    onDone: (newId: string) => void | Promise<void>;
    onOpenExisting: (id: string) => void;
    /** Müşteri kartından açıldıysa bu müşteri önseçili gelir, adım 2'den başlar. */
    initialCustomerId?: string | null;
}

function SaleDrawer({ customers, services, templates, packages, isArchived, addPackage, addPayment, addCustomer, onClose, onDone, onOpenExisting, initialCustomerId }: SaleProps) {
    const preselected = useMemo(() => initialCustomerId ? customers.find((c) => c.id === initialCustomerId) ?? null : null, [initialCustomerId, customers]);
    const [step, setStep] = useState(preselected ? 2 : 1);
    const [custQuery, setCustQuery] = useState('');
    const [customer, setCustomer] = useState<Customer | null>(preselected);
    const [service, setService] = useState<Service | null>(null);
    const [count, setCount] = useState(4);
    const [countLocked, setCountLocked] = useState(false);   // şablon seçildiyse seans sabit
    const [price, setPrice] = useState(0);
    const [deposit, setDeposit] = useState(0);
    const [confirmed, setConfirmed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [discardOpen, setDiscardOpen] = useState(false);
    const savedRef = useRef(false);
    const useTemplates = templates.length > 0;
    
    const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
    const [newCustForm, setNewCustForm] = useState({ name: '', phone: '' });

    const [installmentCount, setInstallmentCount] = useState<number>(0);
    const [installmentCadence, setInstallmentCadence] = useState<'monthly' | 'weekly'>('monthly');
    const [installmentFirstDate, setInstallmentFirstDate] = useState<string>(() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        return d.toISOString().slice(0, 10);
    });
    const { available: installmentEngineAvailable, createSchedule } = useInstallmentSchedules([]);

    const activeCustomers = useMemo(() => customers.filter((c) => !isArchived(c.id)), [customers, isArchived]);
    const results = useMemo(() => {
        const q = custQuery.trim().toLocaleLowerCase('tr');
        if (!q) return activeCustomers.slice(0, 6);
        return activeCustomers.filter((c) => c.name.toLocaleLowerCase('tr').includes(q) || c.phone.includes(q)).slice(0, 6);
    }, [activeCustomers, custQuery]);

    // Çift paket riski: seçili müşterinin aynı hizmete bağlı AKTİF paketi var mı
    const duplicate = useMemo(() => {
        if (!customer) return null;
        const t = (service?.name || '').toLocaleLowerCase('tr');
        return packages.find((p) => p.customerId === customer.id && p.status === 'active'
            && (!t || p.title.toLocaleLowerCase('tr').includes(t) || t.includes(p.title.toLocaleLowerCase('tr')))) || null;
    }, [customer, service, packages]);

    const clampPrice = Math.max(0, Math.round(price));
    const clampDeposit = Math.min(clampPrice, Math.max(0, Math.round(deposit)));
    const depositTooHigh = Math.round(deposit) > clampPrice;
    const balance = clampPrice - clampDeposit;

    const canNext = step === 1 ? Boolean(customer) : step === 2 ? Boolean(service && count >= 1) : step === 3 ? clampPrice >= 0 && !depositTooHigh : confirmed;
    const dirty = Boolean(customer || service);

    const pickService = (s: Service) => {
        setService(s);
        setCountLocked(false);
        if (!price && s.price) setPrice(s.price * count);
    };
    // Şablon seçimi: seans sayısı tanımdan gelir ve satışta artırılamaz
    const pickTemplate = (t: PackageTemplate) => {
        setService({ id: t.id, name: t.name, color: t.color || 'var(--dc-purple)', duration: 0, price: t.price } as Service);
        setCount(t.sessionCount);
        setCountLocked(true);
        setPrice(t.price);
    };

    const submitNewCustomer = async () => {
        if (!newCustForm.name || !newCustForm.phone || saving) return;
        setSaving(true);
        const created = await addCustomer({ name: newCustForm.name, phone: newCustForm.phone, customFields: {} });
        setSaving(false);
        if (!created) { toast.error('Müşteri eklenemedi'); return; }
        setCustomer(created);
        setIsCreatingCustomer(false);
        setCustQuery('');
        setNewCustForm({ name: '', phone: '' });
        toast.success(`${created.name} eklendi`);
    };

    const submit = async () => {
        if (!customer || !service || saving || savedRef.current) return;
        setSaving(true);
        const created = await addPackage({
            customerId: customer.id,
            title: count > 1 ? `${service.name} · ${count} seans` : service.name,
            sessionCount: count, totalAmount: clampPrice, staffId: undefined,
        });
        if (!created) { setSaving(false); toast.error('Paket oluşturulamadı'); return; }
        savedRef.current = true;
        if (clampDeposit > 0) {
            await addPayment({ customerId: customer.id, treatmentPlanId: created.id, type: 'service', method: 'cash', amount: clampDeposit, description: `${created.title} · peşinat` });
        }
        
        const balance = clampPrice - clampDeposit;
        if (installmentEngineAvailable && installmentCount > 1 && balance > 0) {
            await createSchedule({
                planId: created.id,
                customerId: customer.id,
                totalAmount: balance,
                count: installmentCount,
                firstDueDate: installmentFirstDate,
                cadence: installmentCadence
            });
        }
        
        toast.success(`Paket oluşturuldu · ${customer.name} ✨`);
        setSaving(false);
        await onDone(created.id);
    };

    const tryClose = () => { if (dirty && !savedRef.current) setDiscardOpen(true); else onClose(); };

    const STEPS = ['Müşteri', 'Paket', 'Ödeme', 'Onay'];

    return (
        <div className="overlay-layer">
            <button className="scrim" aria-label="Kapat" onClick={tryClose} />
            <div className="sale-drawer" role="dialog" aria-modal="true">
                <div className="drawer-head">
                    <span className="drawer-icon"><ShieldCheck size={20} /></span>
                    <div>
                        <span className="eyebrow">GÜVENLİ PAKET SATIŞI</span>
                        <h2>Yeni paket</h2>
                    </div>
                    <button className="icon-button" style={{ border: 0 }} onClick={tryClose} aria-label="Paket satışını kapat"><X size={18} /></button>
                </div>

                <div className="stepper">
                    {STEPS.map((label, i) => {
                        const n = i + 1;
                        return <span key={label} className={step === n ? 'active' : step > n ? 'done' : ''}><i>{step > n ? <Check size={12} /> : n}</i>{label}</span>;
                    })}
                </div>

                <div className="drawer-body">
                    {step === 1 && (
                        <div className="sale-step">
                            <div className="step-heading">
                                <span>1</span>
                                <div><h3>Müşteri seç</h3><p>Paketin sahibini seçin. Çift kayıt riskini burada önleriz.</p></div>
                            </div>
                            {!customer ? (<>
                                {isCreatingCustomer ? (
                                    <div className="new-customer-inline" style={{ marginTop: 12, padding: 16, background: 'var(--dc-surface2)', borderRadius: 12, border: '1px solid var(--dc-border2)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--dc-ink)', margin: 0 }}>Hızlı Müşteri Ekle</h4>
                                            <button onClick={() => setIsCreatingCustomer(false)} style={{ color: 'var(--dc-muted)' }}><X size={14} /></button>
                                        </div>
                                        <input autoFocus value={newCustForm.name} onChange={(e) => setNewCustForm(p => ({ ...p, name: e.target.value }))} placeholder="Ad Soyad" style={{ width: '100%', marginBottom: 8, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--dc-border2)', fontSize: 13, background: 'var(--dc-page)', color: 'var(--dc-ink)' }} />
                                        <input type="tel" value={newCustForm.phone} onChange={(e) => setNewCustForm(p => ({ ...p, phone: e.target.value }))} placeholder="0532 xxx xx xx" style={{ width: '100%', marginBottom: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--dc-border2)', fontSize: 13, background: 'var(--dc-page)', color: 'var(--dc-ink)' }} />
                                        <button onClick={submitNewCustomer} disabled={!newCustForm.name || !newCustForm.phone || saving} className="button primary" style={{ width: '100%', minHeight: 38 }}>
                                            {saving ? 'Ekleniyor...' : 'Ekle ve Seç'}
                                        </button>
                                    </div>
                                ) : (
                                <>
                                    <div className="searchbox large">
                                        <Search size={16} />
                                        <input autoFocus value={custQuery} onChange={(e) => setCustQuery(e.target.value)} placeholder="İsim veya telefon…" />
                                    </div>
                                    <button onClick={() => setIsCreatingCustomer(true)} className="button quiet" style={{ width: '100%', marginTop: 8, minHeight: 36, fontSize: 12, border: '1px dashed var(--dc-border2)' }}>
                                        <Plus size={14} /> Yeni Müşteri Ekle
                                    </button>
                                    <div className="choice-list">
                                        {results.map((c) => (
                                            <button key={c.id} onClick={() => setCustomer(c)}>
                                                <span className="avatar">{initials(c.name)}</span>
                                                <span><strong>{c.name}</strong><small>{c.phone}</small></span>
                                                {packages.some((p) => p.customerId === c.id && p.status === 'active') && <em>aktif paket</em>}
                                                <i><ChevronRight size={13} /></i>
                                            </button>
                                        ))}
                                        {results.length === 0 && (
                                            <div className="choice-empty"><Search size={16} /><span><strong>Müşteri bulunamadı</strong>İsmi veya telefon numarasını kontrol edin.</span></div>
                                        )}
                                    </div>
                                </>
                                )}
                            </>) : (<>
                                <div className="selected-customer-bar">
                                    <span className="avatar">{initials(customer.name)}</span>
                                    <span><small>SEÇİLİ MÜŞTERİ</small><strong>{customer.name}</strong></span>
                                    <button onClick={() => { setCustomer(null); setCustQuery(''); }}>Değiştir</button>
                                </div>
                                {duplicate && (
                                    <div className="duplicate-warning">
                                        <AlertTriangle size={16} />
                                        <span><strong>Aktif paket eşleşmesi bulundu</strong>{customer.name} üzerinde “{duplicate.title}” aktif. Yanlışlıkla ikinci paket oluşturuyor olabilirsiniz.</span>
                                        <button onClick={() => onOpenExisting(duplicate.id)}>Mevcut paketi aç</button>
                                    </div>
                                )}
                            </>)}
                        </div>
                    )}

                    {step === 2 && (
                        <div className="sale-step">
                            <div className="step-heading">
                                <span>2</span>
                                <div><h3>{useTemplates ? 'Satış şablonu' : 'Paket / hizmet'}</h3><p>{useTemplates ? 'Bir şablon seçin — seans sayısı tanımdan gelir, satışta değişmez.' : 'Hizmeti seçin, hak sayısını belirleyin (1–50).'}</p></div>
                            </div>
                            <div className="template-list">
                                {useTemplates ? templates.map((t) => (
                                    <button key={t.id} className={service?.id === t.id ? 'selected' : ''} onClick={() => pickTemplate(t)}>
                                        <i style={{ background: t.color || 'var(--dc-purple)' }} />
                                        <span><strong>{t.name}</strong><small>{t.sessionCount} seans{t.validityMonths ? ` · ${t.validityMonths} ay geçerli` : ''}</small></span>
                                        <span>{fmtTL(t.price)}</span>
                                        <b>{service?.id === t.id ? <Check size={13} /> : ''}</b>
                                    </button>
                                )) : services.map((s) => (
                                    <button key={s.id} className={service?.id === s.id ? 'selected' : ''} onClick={() => pickService(s)}>
                                        <i style={{ background: s.color }} />
                                        <span><strong>{s.name}</strong><small>{s.duration} dk{s.price ? ` · liste ${fmtTL(s.price)}` : ''}</small></span>
                                        <span>{s.price ? fmtTL(s.price) : '—'}</span>
                                        <b>{service?.id === s.id ? <Check size={13} /> : ''}</b>
                                    </button>
                                ))}
                                {!useTemplates && services.length === 0 && <div className="choice-empty"><span><strong>Hizmet tanımlı değil</strong>Önce Ayarlar → Hizmetler’den ekleyin.</span></div>}
                            </div>
                            {service && (
                                <div className="package-confirm-card" style={{ marginTop: 12 }}>
                                    <i style={{ background: service.color }} />
                                    <span><strong>{service.name}</strong><em>seans başı ~{count > 0 ? fmtTL(clampPrice / count) : '—'}</em></span>
                                    {countLocked ? (
                                        <div className="locked-input" style={{ height: 40, width: 135 }}><Layers size={14} /><strong>{count} seans</strong></div>
                                    ) : (
                                        <div className="step-input">
                                            <button onClick={() => setCount((c) => Math.max(1, c - 1))} aria-label="Azalt">−</button>
                                            <strong>{count}</strong>
                                            <button onClick={() => setCount((c) => Math.min(50, c + 1))} aria-label="Arttır">+</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 3 && (
                        <div className="sale-step">
                            <div className="step-heading">
                                <span>3</span>
                                <div><h3>Bedel ve tahsilat</h3><p>Paket bedelini girin. Peşinat, bedelden yüksek olamaz.</p></div>
                            </div>
                            <div className="form-grid">
                                <label>
                                    <span>Paket bedeli</span>
                                    <div className="money-input"><b>₺</b><input type="number" min={0} value={price || ''} onChange={(e) => setPrice(Number(e.target.value))} placeholder="0" /></div>
                                </label>
                                <label>
                                    <span>Hak sayısı <small>Tanımdan gelir; burada değiştirilmez</small></span>
                                    <div className="locked-input"><Layers size={14} /><strong>{count} seans</strong></div>
                                </label>
                                <label>
                                    <span>Peşinat / tahsilat</span>
                                    <div className="money-input"><b>₺</b><input type="number" min={0} value={deposit || ''} onChange={(e) => setDeposit(Number(e.target.value))} placeholder="0" /></div>
                                </label>
                                <label>
                                    <span>Geçerlilik <small>Yakında</small></span>
                                    <div className="select-input"><select disabled><option>Süresiz</option></select><ChevronDown size={15} /></div>
                                </label>
                            </div>
                            {depositTooHigh && <div className="field-error"><AlertTriangle size={13} />Tahsilat satış bedelinden yüksek olamaz.</div>}
                            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                                {balance <= 0 && clampPrice > 0 ? <span className="mini-success">Tam ödendi · bakiye oluşmaz</span>
                                    : clampDeposit > 0 ? <span className="mini-danger">Kısmi ödeme · {fmtTL(balance)} bakiye</span>
                                        : <span className="mini-danger">Peşinatsız · {fmtTL(balance)} bakiye</span>}
                            </div>
                            
                            {balance > 0 && installmentEngineAvailable && (
                                <div className="installments-section" style={{ marginTop: 16, padding: 12, background: 'var(--dc-surface2)', borderRadius: 12, border: '1px solid var(--dc-border2)' }}>
                                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--dc-ink)', margin: 0, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Calendar size={14} /> Taksit Planı
                                    </h4>
                                    <div className="form-grid">
                                        <label>
                                            <span>Taksit Sayısı</span>
                                            <div className="select-input">
                                                <select value={installmentCount} onChange={(e) => setInstallmentCount(Number(e.target.value))}>
                                                    <option value={0}>Taksitsiz (Açık Bakiye)</option>
                                                    {[2,3,4,5,6,9,12].map(n => <option key={n} value={n}>{n} Taksit</option>)}
                                                </select>
                                                <ChevronDown size={15} />
                                            </div>
                                        </label>
                                        {installmentCount > 0 && (
                                            <>
                                                <label>
                                                    <span>Ödeme Sıklığı</span>
                                                    <div className="select-input">
                                                        <select value={installmentCadence} onChange={(e) => setInstallmentCadence(e.target.value as 'monthly'|'weekly')}>
                                                            <option value="monthly">Aylık</option>
                                                            <option value="weekly">Haftalık</option>
                                                        </select>
                                                        <ChevronDown size={15} />
                                                    </div>
                                                </label>
                                                <label style={{ gridColumn: 'span 2' }}>
                                                    <span>İlk Ödeme Tarihi</span>
                                                    <input type="date" value={installmentFirstDate} onChange={(e) => setInstallmentFirstDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--dc-border2)', fontSize: 13, background: 'var(--dc-page)', color: 'var(--dc-ink)', outline: 'none' }} />
                                                </label>
                                            </>
                                        )}
                                    </div>
                                    {installmentCount > 0 && (
                                        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--dc-muted)' }}>
                                            <span>Taksit tutarı: <strong>~{fmtTL(balance / installmentCount)}</strong></span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 4 && customer && service && (
                        <div className="sale-step review-step">
                            <div className="review-hero">
                                <ShieldCheck size={18} />
                                <p><strong>{customer.name}</strong> için <strong>{count} seans {service.name}</strong> paketi oluşturulacak. Bedel <strong>{fmtTL(clampPrice)}</strong>, peşinat <strong>{fmtTL(clampDeposit)}</strong>.</p>
                            </div>
                            <div className="review-grid">
                                <div><small>MÜŞTERİ</small><strong>{customer.name}</strong><span>{customer.phone}</span></div>
                                <div><small>PAKET</small><strong>{service.name}</strong><span>{count} hak</span></div>
                                <div><small>BEDEL</small><strong>{fmtTL(clampPrice)}</strong><span>seans başı {count > 0 ? fmtTL(clampPrice / count) : '—'}</span></div>
                                <div><small>TAHSİLAT</small><strong>{fmtTL(clampDeposit)}</strong><span>bakiye {fmtTL(balance)}</span></div>
                                {installmentCount > 0 && (
                                    <div style={{ gridColumn: 'span 2' }}>
                                        <small>TAKSİTLENDİRME</small>
                                        <strong>{installmentCount} taksit · ~{fmtTL(balance / installmentCount)} / taksit</strong>
                                        <span>İlk vade: {installmentFirstDate.split('-').reverse().join('.')}</span>
                                    </div>
                                )}
                            </div>
                            {duplicate && (
                                <div className="duplicate-warning" style={{ marginTop: 11 }}>
                                    <AlertTriangle size={16} />
                                    <span><strong>Bu müşteride aktif paket var</strong>“{duplicate.title}” hâlâ açık. Yine de yeni paket oluşturmak istiyor musunuz?</span>
                                    <button onClick={() => onOpenExisting(duplicate.id)}>Mevcut paketi aç</button>
                                </div>
                            )}
                            <label className="review-check">
                                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                                <i>{confirmed && <Check size={13} />}</i>
                                <span><strong>Bilgileri kontrol ettim</strong>Hak sayısı, bedel ve tahsilat doğru. Paket bu bilgilerle oluşturulacak.</span>
                            </label>
                        </div>
                    )}
                </div>

                <div className="drawer-footer">
                    <span className="drawer-safety"><ShieldCheck size={13} />Kayıt güvenli · çift oluşturma engelli</span>
                    {step > 1 && <button className="button quiet" onClick={() => setStep((s) => s - 1)}><ChevronLeft size={14} />Geri</button>}
                    {step < 4 ? (
                        <button className="button primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Devam<ChevronRight size={14} /></button>
                    ) : (
                        <button className="button primary" disabled={!confirmed || saving} onClick={() => void submit()}>
                            {saving ? 'Güvenli kayıt oluşturuluyor…' : <>Paketi güvenle oluştur<Check size={14} /></>}
                        </button>
                    )}
                </div>
            </div>

            {discardOpen && (
                <div className="modal-layer">
                    <button className="scrim" aria-label="Kapat" onClick={() => setDiscardOpen(false)} />
                    <div className="discard-modal" role="dialog" aria-modal="true">
                        <span className="warning-icon"><AlertTriangle size={20} /></span>
                        <div>
                            <h2>Satıştan vazgeç?</h2>
                            <p>Girdiğiniz bilgiler kaydedilmeden kapatılacak.</p>
                        </div>
                        <footer>
                            <button className="button quiet" onClick={() => setDiscardOpen(false)}>Vazgeç</button>
                            <button className="button danger" onClick={onClose}>Kapat</button>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
}

// ══ Kayıtlı hak düzeltme (append-only defter) ════════════════════════════════
interface CorrectionProps {
    pkg: Pkg;
    onClose: () => void;
    onApply: (field: 'total' | 'used', delta: number, reason: string) => Promise<{ ok: boolean; error?: string }>;
}
function CorrectionModal({ pkg, onClose, onApply }: CorrectionProps) {
    const [field, setField] = useState<'total' | 'used'>('total');
    const cur = field === 'total' ? pkg.total : pkg.used;
    const [val, setVal] = useState(pkg.total);
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    // Alan değişince değeri o alanın mevcut değerine sıfırla (effect'siz — render'da setState yok)
    const switchField = (f: 'total' | 'used') => { setField(f); setVal(f === 'total' ? pkg.total : pkg.used); setErr(''); };

    const delta = val - cur;
    const lo = Math.max(field === 'total' ? Math.max(1, pkg.used) : 0, cur - 3);
    const hi = Math.min(field === 'total' ? 50 : pkg.total, cur + 3);

    const apply = async () => {
        if (delta === 0) { setErr('Değeri değiştirin'); return; }
        if (!reason.trim()) { setErr('Sebep girin'); return; }
        if (saving) return;
        setSaving(true);
        const r = await onApply(field, delta, reason.trim());
        setSaving(false);
        if (r.ok) { toast.success('Hak düzeltildi · deftere işlendi'); onClose(); }
        else setErr(r.error || 'Düzeltme başarısız');
    };

    return (
        <div className="modal-layer">
            <button className="scrim" aria-label="Kapat" onClick={onClose} />
            <div className="correction-modal" role="dialog" aria-modal="true">
                <div className="modal-head">
                    <div><span className="eyebrow">KAYITLI DÜZELTME</span><h2>{pkg.customer?.name || 'Paket'}</h2><p>{pkg.raw.title}</p></div>
                    <button className="icon-button" style={{ border: 0 }} onClick={onClose} aria-label="Düzeltme penceresini kapat"><X size={18} /></button>
                </div>
                <div className="correction-warning">
                    <AlertTriangle size={16} />
                    <span><strong>Geçmiş kayıt silinmez</strong>Düzeltme; önceki değer, yeni değer ve sebeple deftere yeni bir hareket olarak eklenir.</span>
                </div>
                <div className="correction-body">
                    <label>
                        <span>Hangi alan</span>
                        <select value={field} onChange={(e) => switchField(e.target.value as 'total' | 'used')}>
                            <option value="total">Toplam hak</option>
                            <option value="used">Kullanılan seans</option>
                        </select>
                    </label>
                    <div className="before-after">
                        <span><small>ŞİMDİ</small><strong>{cur}</strong><em>{field === 'total' ? 'toplam hak' : 'kullanılan'}</em></span>
                        <div className="step-input">
                            <button type="button" onClick={() => setVal((v) => Math.max(lo, v - 1))} disabled={val <= lo} aria-label="Azalt">−</button>
                            <strong>{val}</strong>
                            <button type="button" onClick={() => setVal((v) => Math.min(hi, v + 1))} disabled={val >= hi} aria-label="Arttır">+</button>
                        </div>
                        <span><small>SONRA</small><strong>{val}</strong><em>{delta > 0 ? `+${delta}` : delta} hak</em></span>
                    </div>
                    <p style={{ fontSize: 9, color: 'var(--muted)', margin: 0 }}>Tek düzeltmede en fazla 3 hak. Toplam, kullanılanın altına inemez; denklem korunur.</p>
                    <label>
                        <span>Neden bu düzeltmeyi yapıyorsunuz?</span>
                        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Örn. yanlış seans sayısı girildi" />
                    </label>
                    {err && <div className="field-error"><AlertTriangle size={13} />{err}</div>}
                </div>
                <footer>
                    <div style={{ marginRight: 'auto', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 9 }}><ShieldCheck size={13} />Denklem korunur</div>
                    <button className="button quiet" onClick={onClose}>Vazgeç</button>
                    <button className="button primary" disabled={delta === 0 || !reason.trim() || saving} onClick={() => void apply()}>
                        {saving ? 'Kaydediliyor…' : <>Düzeltmeyi kaydet<Check size={14} /></>}
                    </button>
                </footer>
            </div>
        </div>
    );
}

// ══ Paket tanımları (satış şablonları CRUD) ══════════════════════════════════
interface DefsProps {
    templates: PackageTemplate[];
    onClose: () => void;
    addTemplate: (i: TemplateInput) => Promise<boolean>;
    updateTemplate: (id: string, i: TemplateInput) => Promise<boolean>;
    removeTemplate: (id: string) => Promise<boolean>;
}
function DefinitionsModal({ templates, onClose, addTemplate, updateTemplate, removeTemplate }: DefsProps) {
    const [name, setName] = useState('');
    const [seans, setSeans] = useState(4);
    const [price, setPrice] = useState(0);
    const [editing, setEditing] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const reset = () => { setName(''); setSeans(4); setPrice(0); setEditing(null); };
    const load = (t: PackageTemplate) => { setEditing(t.id); setName(t.name); setSeans(t.sessionCount); setPrice(t.price); };

    const save = async () => {
        if (!name.trim() || busy) return;
        setBusy(true);
        const input: TemplateInput = { name: name.trim(), sessionCount: seans, price };
        const ok = editing ? await updateTemplate(editing, input) : await addTemplate(input);
        setBusy(false);
        if (ok) { toast.success(editing ? 'Tanım güncellendi' : 'Tanım eklendi'); reset(); }
        else toast.error('Kaydedilemedi');
    };
    const del = async (id: string) => { if (await removeTemplate(id)) { toast.success('Tanım kaldırıldı'); if (editing === id) reset(); } };

    const inputCls = 'px-3 py-2.5 rounded-lg border border-[var(--dc-border2)] bg-[var(--dc-page)] text-[13px] text-[var(--dc-ink)] outline-none focus:outline-2 focus:outline-[var(--dc-orange)]';

    return (
        <div className="modal-layer">
            <button className="scrim" aria-label="Kapat" onClick={onClose} />
            <div className="definitions-modal" role="dialog" aria-modal="true">
                <div className="modal-head">
                    <div><span className="eyebrow">SATIŞ ŞABLONLARI</span><h2>Paket tanımları</h2><p>Satış ekranı bu şablonlardan çalışır — seans sayısı satışta değişmez</p></div>
                    <button className="icon-button" style={{ border: 0 }} onClick={onClose} aria-label="Paket tanımlarını kapat"><X size={18} /></button>
                </div>
                <div style={{ maxHeight: '58vh', overflowY: 'auto' }}>
                    <div className="definition-list">
                        {templates.length === 0 && <div className="choice-empty"><span><strong>Henüz tanım yok</strong>Aşağıdan ilk şablonu ekleyin.</span></div>}
                        {templates.map((t) => (
                            <article key={t.id} onClick={() => load(t)} style={{ cursor: 'pointer', borderColor: editing === t.id ? 'var(--ink)' : undefined }}>
                                <i style={{ background: t.color || 'var(--purple)' }} />
                                <span><strong>{t.name}</strong><small>{t.sessionCount} seans · seans başı {fmtTL(t.price / Math.max(1, t.sessionCount))}</small></span>
                                <span style={{ fontFamily: MONO, fontWeight: 750 }}>{fmtTL(t.price)}</span>
                                <span style={{ fontSize: 8.5, color: 'var(--muted)' }}>{editing === t.id ? 'düzenleniyor' : 'düzenle'}</span>
                                <button onClick={(e) => { e.stopPropagation(); void del(t.id); }} aria-label="Kaldır"><Trash2 size={14} /></button>
                            </article>
                        ))}
                    </div>
                    <div style={{ padding: '4px 12px 12px' }}>
                        <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', display: 'grid', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800 }}>
                                {editing ? <Pencil size={13} /> : <Plus size={13} />}{editing ? 'Şablonu düzenle' : 'Yeni tanım'}
                                {editing && <button onClick={reset} style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, color: 'var(--orange-dark)' }}>iptal</button>}
                            </div>
                            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tanım adı — örn. 8 Seans Cilt Bakımı" maxLength={80} />
                            <div style={{ display: 'grid', gridTemplateColumns: '135px 1fr', gap: 10 }}>
                                <div className="step-input">
                                    <button type="button" onClick={() => setSeans((s) => Math.max(1, s - 1))} aria-label="Azalt">−</button>
                                    <strong>{seans}</strong>
                                    <button type="button" onClick={() => setSeans((s) => Math.min(50, s + 1))} aria-label="Arttır">+</button>
                                </div>
                                <div className="money-input"><b>₺</b><input type="number" min={0} value={price || ''} onChange={(e) => setPrice(Number(e.target.value))} placeholder="Paket bedeli" /></div>
                            </div>
                        </div>
                    </div>
                </div>
                <footer>
                    <div style={{ marginRight: 'auto', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 9 }}><ShieldCheck size={13} />{templates.length} tanım</div>
                    <button className="button quiet" onClick={onClose}>Kapat</button>
                    <button className="button primary" disabled={!name.trim() || busy} onClick={() => void save()}>
                        {busy ? 'Kaydediliyor…' : editing ? <>Güncelle<Check size={14} /></> : <>Ekle<Plus size={14} /></>}
                    </button>
                </footer>
            </div>
        </div>
    );
}
