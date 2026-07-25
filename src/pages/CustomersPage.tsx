import { useEffect, useMemo, useState } from 'react';
import { normalizePhone } from '@/lib/phone';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarClock, ChevronLeft, Edit2, MessageCircle, Plus, Search, Stethoscope, Trash2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { computePatientFinance } from '@/lib/patientBalance';
import { useCustomers } from '@/hooks/useCustomers';
import { usePayments } from '@/hooks/usePayments';
import { useReservations } from '@/hooks/useReservations';
import { useDentalChart } from '@/hooks/useDentalChart';
import { useLabels } from '@/hooks/useLabels';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { CustomFieldsSection } from '@/components/CustomFieldsSection';
import { fieldDefsForSector } from '@/lib/sectorProfiles';
import { cn } from '@/utils/cn';
import type { Customer, DentalStatus, TreatmentPlanStatus } from '@/types';

const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const fmtShort = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS_TR[d.getMonth()]}`; };
const fmtLong = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS_TR[d.getMonth()]} ${d.getFullYear()}`; };
const fmtTL = (n: number) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const initials = (name: string) => name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const isNew48 = (iso: string) => Date.now() - new Date(iso).getTime() < 48 * 3600 * 1000;
const isNew7d = (iso: string) => Date.now() - new Date(iso).getTime() < 7 * 24 * 3600 * 1000;

function medicalAlertsOf(c: Customer | undefined): string[] {
    const cf = c?.customFields || {};
    return [
        cf.alerji ? `Alerji: ${cf.alerji}` : null,
        cf.ilaclar ? `İlaç: ${cf.ilaclar}` : null,
        cf.kronik ? `Kronik: ${cf.kronik}` : null,
    ].filter((x): x is string => !!x);
}

// Diş şeması özet renkleri (v10)
const TOOTH_CLASS: Record<DentalStatus, string> = {
    saglam: '', curuk: 'bg-[var(--dc-red2)] text-white', dolgu: 'bg-[var(--dc-blue)] text-white',
    kanal: 'bg-[var(--dc-purple)] text-white', kron: 'bg-[var(--dc-amber)] text-white',
    implant: 'bg-[var(--dc-green)] text-white', cekildi: 'bg-[var(--dc-surface3)] text-[var(--dc-muted2)] line-through',
};
const UPPER_FDI = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_FDI = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const PLAN_STATUS_META: Record<TreatmentPlanStatus, { label: string; cls: string }> = {
    proposed: { label: 'Teklif onay bekliyor', cls: 'bg-[var(--dc-amber-bg)] text-[var(--dc-amber)]' },
    active: { label: 'Aktif', cls: 'bg-[var(--dc-orange-soft)] text-[var(--dc-orange)]' },
    completed: { label: 'Tamamlandı', cls: 'bg-[var(--dc-green-bg)] text-[var(--dc-green)]' },
    cancelled: { label: 'İptal', cls: 'bg-[var(--dc-surface2)] text-[var(--dc-muted)]' },
};

interface PlanRow { id: string; customerId: string; title: string; total: number; status: TreatmentPlanStatus; }

// Hastalar — v10 "Kokpit" master-detail. Sol aranabilir/filtreli liste, sağda
// hastanın 360° özeti (kimlik + KPI + diş şeması + tedavi planları + randevu
// geçmişi). Boş durum sıcak cream karşılama. Tüm veriler canlı.
export function CustomersPage() {
    const isMobile = useIsMobile();
    const { dark } = useTheme();
    const navigate = useNavigate();
    const { allCustomers, addCustomer, updateCustomer, deleteCustomer } = useCustomers();
    const { reservations, settings } = useReservations();
    const { t, sector } = useLabels();
    const { payments } = usePayments();
    const isDental = sector === 'dis';
    const isBeauty = sector === 'guzellik';

    const [selId, setSelId] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<'tumu' | 'bakiye' | 'kontrol' | 'aktif' | 'yeni'>('tumu');
    const [searchParams, setSearchParams] = useSearchParams();

    // Deep-link: /customers?open=<id>
    useEffect(() => {
        const openId = searchParams.get('open');
        if (openId) {
            setSelId(openId);
            const next = new URLSearchParams(searchParams); next.delete('open');
            setSearchParams(next, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    // Org geneli tedavi planları — bakiye/aktif-tedavi hesabı için tek sorguda
    const [plans, setPlans] = useState<PlanRow[]>([]);
    useEffect(() => {
        let alive = true;
        void supabase.from('treatment_plans').select('id, customer_id, title, total_amount, status')
            .then(({ data, error }) => {
                if (!alive || error || !data) return;
                setPlans((data as { id: string; customer_id: string; title: string; total_amount: number | string; status: TreatmentPlanStatus }[])
                    .map(r => ({ id: r.id, customerId: r.customer_id, title: r.title, total: Number(r.total_amount), status: r.status })));
            });
        return () => { alive = false; };
    }, []);

    // Plansız (Kasa'dan alınan) tahsilat da bakiyeye girsin diye ödemeleri
    // hasta bazında topluyoruz; hesabı computePatientFinance yapar.
    const paymentsByCustomer = useMemo(() => {
        const m = new Map<string, typeof payments>();
        const planOwner = new Map(plans.map(p => [p.id, p.customerId]));
        for (const p of payments) {
            const cid = p.customerId || (p.treatmentPlanId ? planOwner.get(p.treatmentPlanId) : undefined);
            if (!cid) continue;
            const arr = m.get(cid) || []; arr.push(p); m.set(cid, arr);
        }
        return m;
    }, [payments, plans]);
    const plansByCustomer = useMemo(() => {
        const m = new Map<string, PlanRow[]>();
        for (const p of plans) { const arr = m.get(p.customerId) || []; arr.push(p); m.set(p.customerId, arr); }
        return m;
    }, [plans]);
    // Bakiye kuralları tek yerde: lib/patientBalance.ts — vizit paneliyle aynı sonuç
    const financeOf = (cid: string) => computePatientFinance(
        (plansByCustomer.get(cid) || []).map(p => ({ id: p.id, totalAmount: p.total, status: p.status })),
        paymentsByCustomer.get(cid) || [],
    );
    const balanceOf = (cid: string) => financeOf(cid).balance;
    const hasActiveTreatment = (cid: string) => (plansByCustomer.get(cid) || []).some(p => p.status === 'active' || p.status === 'proposed');
    const recallActive = (c: Customer) => Boolean(c.recallDate);

    const FILTERS = [
        { k: 'tumu' as const, l: 'Tümü', f: () => true },
        { k: 'bakiye' as const, l: 'Bakiyesi olanlar', f: (c: Customer) => balanceOf(c.id) > 0 },
        { k: 'kontrol' as const, l: 'Kontrol zamanı', f: (c: Customer) => recallActive(c) },
        { k: 'aktif' as const, l: 'Aktif tedavi', f: (c: Customer) => hasActiveTreatment(c.id) },
        { k: 'yeni' as const, l: 'Yeni (7 gün)', f: (c: Customer) => isNew7d(c.createdAt) },
    ];

    const listed = useMemo(() => {
        const ff = FILTERS.find(f => f.k === filter)!.f;
        const q = query.trim().toLocaleLowerCase('tr');
        return allCustomers.filter(c => ff(c) && (!q
            || c.name.toLocaleLowerCase('tr').includes(q)
            || c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, ''))
            || (c.email || '').toLowerCase().includes(q)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allCustomers, filter, query, plansByCustomer, paymentsByCustomer]);

    const selected = allCustomers.find(c => c.id === selId) ?? null;
    const custHistory = useMemo(() => selected
        ? reservations.filter(r => r.customerId === selected.id).sort((a, b) => b.date.localeCompare(a.date))
        : [], [selected, reservations]);
    const { current: dentalCurrent } = useDentalChart(isDental && selId ? selId : undefined);

    const activeTreatmentCount = useMemo(() => allCustomers.filter(c => hasActiveTreatment(c.id)).length, [allCustomers, plansByCustomer]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Yeni/düzenle hasta modalı ──
    const cfDefs = fieldDefsForSector(settings.sector, 'customer');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
    const [cfValues, setCfValues] = useState<Record<string, string | number | boolean>>({});

    const closeForm = () => { setShowForm(false); setEditingId(null); setForm({ name: '', phone: '', email: '', notes: '' }); setCfValues({}); };
    const openNew = () => { setEditingId(null); setForm({ name: '', phone: '', email: '', notes: '' }); setCfValues({}); setShowForm(true); };
    const openEdit = (c: Customer) => { setEditingId(c.id); setForm({ name: c.name, phone: c.phone, email: c.email || '', notes: c.notes || '' }); setCfValues(c.customFields || {}); setShowForm(true); };

    const submitForm = async () => {
        if (!form.name || !form.phone || creating) return;
        setCreating(true);
        if (editingId) {
            const ok = await updateCustomer(editingId, { ...form, customFields: cfValues });
            setCreating(false);
            if (!ok) return;
            setSelId(editingId); toast.success('Hasta bilgileri güncellendi'); closeForm();
            return;
        }
        const created = await addCustomer({ ...form, customFields: cfValues });
        setCreating(false);
        if (!created) return;
        setSelId(created.id); closeForm();
    };

    const removeCustomer = async (c: Customer) => {
        if (!window.confirm(`${c.name} kaydı silinsin mi? Bu işlem geri alınamaz.`)) return;
        await deleteCustomer(c.id);   // kendi toast'ını gösterir
        if (selId === c.id) setSelId(null);
    };

    const waHref = (phone: string, text: string) => {
        const p = normalizePhone(phone) ?? phone.replace(/\D/g, '');
        return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
    };

    // ── Liste satırı rozeti ──
    const rowBadge = (c: Customer) => {
        if (isNew48(c.createdAt)) return <span className="flex-shrink-0 text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-[var(--dc-orange)] text-white tracking-[.06em]">YENİ</span>;
        const bal = balanceOf(c.id);
        if (bal > 0) return <span className="flex-shrink-0 font-mono text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-[var(--dc-red-bg)] text-[var(--dc-red2)]">{fmtTL(bal)}</span>;
        if (c.recallDate) return <span className="flex-shrink-0 text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-[var(--dc-amber-bg)] text-[var(--dc-amber)]">Kontrol · {fmtShort(c.recallDate)}</span>;
        return <span className="flex-shrink-0 text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-[var(--dc-surface2)] text-[var(--dc-muted)]">{c.totalReservations} randevu</span>;
    };

    const cardCls = 'bg-[var(--dc-surface)] border border-[var(--dc-border)] rounded-[20px] shadow-[0_2px_8px_rgba(14,14,14,0.05),0_10px_30px_rgba(14,14,14,0.07)]';

    const selMedical = medicalAlertsOf(selected ?? undefined);
    const selDone = custHistory.filter(r => r.status === 'completed').length;
    const selFinance = computePatientFinance(
        selected ? (plansByCustomer.get(selected.id) || []).map(p => ({ id: p.id, totalAmount: p.total, status: p.status })) : [],
        selected ? (paymentsByCustomer.get(selected.id) || []) : [],
    );
    const selBal = selFinance.balance;
    const selPlans = selected ? (plansByCustomer.get(selected.id) || []).filter(p => p.status !== 'cancelled') : [];

    // ── WhatsApp hazır mesajları (hastanın gerçek durumuna göre) ──
    const [waOpen, setWaOpen] = useState(false);
    useEffect(() => { setWaOpen(false); }, [selId]);
    const waTemplates = useMemo(() => {
        if (!selected) return [] as { label: string; text: string }[];
        const biz = settings.businessName || 'kliniğimiz';
        const today = new Date().toISOString().slice(0, 10);
        const next = [...custHistory].reverse().find(r => r.date >= today && r.status !== 'cancelled');
        const out: { label: string; text: string }[] = [];
        if (next) out.push({
            label: `Randevu hatırlat · ${fmtShort(next.date)} ${next.startTime}`,
            text: `Merhaba ${selected.name}, ${biz}. ${fmtShort(next.date)} ${next.startTime} randevunuzu hatırlatmak istedik. Görüşmek üzere!`,
        });
        if (selBal > 0) out.push({
            label: `Bakiye hatırlat · ${fmtTL(selBal)}`,
            text: `Merhaba ${selected.name}, ${biz}. Tedavinize ait ${fmtTL(selBal)} tutarında bakiyeniz bulunuyor. Uygun olduğunuzda görüşebilir miyiz?`,
        });
        if (selected.recallDate) out.push({
            label: `Kontrole davet · ${fmtShort(selected.recallDate)}`,
            text: `Merhaba ${selected.name}, ${biz}. ${fmtShort(selected.recallDate)} tarihinde kontrol zamanınız geliyor. Randevu oluşturmak ister misiniz?`,
        });
        if (!next) out.push({
            label: 'Randevuya davet',
            text: `Merhaba ${selected.name}, ${biz}. Sizi tekrar aramızda görmek isteriz; uygun olduğunuz bir gün için randevu ayarlayalım mı?`,
        });
        out.push({ label: 'Boş mesaj', text: `Merhaba ${selected.name}, ${biz}den yazıyoruz.` });
        return out;
    }, [selected, custHistory, selBal, settings.businessName]);

    return (
        <div className={cn('dash-theme flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--dc-page)]', dark && 'dark')}>
            {/* Üst başlık */}
            <header className="flex items-center gap-3.5 px-6 pt-[18px] pb-3.5 flex-shrink-0 flex-wrap">
                <div className="w-11 h-11 rounded-[13px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] grid place-items-center flex-shrink-0"><UserPlus size={21} /></div>
                <div>
                    <h1 className="text-[21px] font-black tracking-[-0.03em] leading-[1.1] text-[var(--dc-ink)]">{t('customers')}</h1>
                    <div className="text-[12px] text-[var(--dc-muted)] font-semibold mt-0.5">{allCustomers.length} {t('customer').toLowerCase()}{isDental && <> · <b className="text-[var(--dc-orange)] font-bold">{activeTreatmentCount} aktif tedavi</b></>}</div>
                </div>
                <button onClick={openNew} className="ml-auto inline-flex items-center gap-2 min-h-[44px] px-5 rounded-full bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[13.5px] font-bold hover:opacity-90 active:scale-[0.97] transition-all">
                    <Plus size={15} strokeWidth={2.4} />Yeni {t('customer')}
                </button>
            </header>

            <main className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 px-6 pb-5 min-h-0">
                {/* ── SOL LİSTE ── */}
                <aside className={cn(cardCls, 'flex flex-col min-h-0 overflow-hidden', isMobile && selected && 'hidden')}>
                    <div className="px-4 pt-4 flex-shrink-0">
                        <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--dc-muted2)] pointer-events-none" />
                            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={`İsim, telefon veya e-posta ara…`}
                                className="w-full min-h-[46px] pl-10 pr-3.5 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-page)] text-[13.5px] font-semibold text-[var(--dc-ink)] outline-none focus:border-[var(--dc-orange)] placeholder:text-[var(--dc-muted2)]" />
                        </div>
                        <div className="flex gap-1.5 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {FILTERS.map(f => {
                                const n = f.k === 'tumu' ? 0 : allCustomers.filter(f.f).length;
                                return (
                                    <button key={f.k} onClick={() => setFilter(f.k)}
                                        className={cn('flex-shrink-0 inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-full text-[11.5px] font-bold border transition-colors',
                                            filter === f.k ? 'bg-[var(--dc-orange)] border-[var(--dc-orange)] text-white' : 'bg-[var(--dc-surface)] border-[var(--dc-border2)] text-[var(--dc-muted)] hover:text-[var(--dc-ink)] hover:border-[var(--dc-ink)]')}>
                                        {f.l}{f.k !== 'tumu' && <span className={cn('font-mono text-[10px]', filter === f.k ? 'text-white/75' : 'text-[var(--dc-muted2)]')}>{n}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-0">
                        {listed.length === 0 ? (
                            <div className="py-10 px-5 text-center text-[13px] font-semibold text-[var(--dc-muted)]">Eşleşen {t('customer').toLowerCase()} bulunamadı.<br />Aramayı veya filtreyi değiştirin.</div>
                        ) : listed.map(c => {
                            const nw = isNew48(c.createdAt);
                            return (
                                <button key={c.id} onClick={() => setSelId(c.id)}
                                    className={cn('flex items-center gap-3 w-full text-left px-2.5 py-2.5 rounded-[13px] min-h-[60px] border transition-colors',
                                        c.id === selId ? 'bg-[var(--dc-surface2)] border-[var(--dc-border2)]' : 'border-transparent hover:bg-[var(--dc-surface2)]')}>
                                    <span className={cn('w-[38px] h-[38px] rounded-full grid place-items-center text-[12px] font-extrabold flex-shrink-0', nw ? 'bg-[var(--dc-orange)] text-white' : 'bg-[var(--dc-surface3)] text-[var(--dc-ink)]')}>{initials(c.name)}</span>
                                    <span className="flex-1 min-w-0">
                                        <span className="flex items-center gap-1.5 text-[13.5px] font-bold tracking-[-0.01em] text-[var(--dc-ink)] truncate">
                                            {c.name}{medicalAlertsOf(c).length > 0 && <span className="w-[7px] h-[7px] rounded-full bg-[var(--dc-red2)] flex-shrink-0" title="Medikal uyarı" />}
                                        </span>
                                        <span className="flex items-center gap-2 text-[11px] text-[var(--dc-muted)] mt-0.5 truncate">
                                            <span className="font-mono text-[10.5px] font-semibold">{c.phone}</span>
                                            <span className="text-[var(--dc-muted2)]">·</span>
                                            <span>{c.lastVisit ? fmtShort(c.lastVisit) : 'Ziyaret yok'}</span>
                                        </span>
                                    </span>
                                    {rowBadge(c)}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex-shrink-0 px-[18px] py-2.5 border-t border-[var(--dc-border)] flex items-center gap-2 text-[11px] font-semibold text-[var(--dc-muted)]">
                        <span className="w-[7px] h-[7px] rounded-full bg-[var(--dc-green)] animate-pulse" />{listed.length} {t('customer').toLowerCase()} listeleniyor
                    </div>
                </aside>

                {/* ── SAĞ DETAY ── */}
                <section className={cn(cardCls, 'overflow-y-auto min-h-0 flex flex-col', isMobile && !selected && 'hidden')}>
                    {!selected ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-10 text-center" style={{ background: 'linear-gradient(180deg, var(--dc-surface) 0%, var(--dc-page) 100%)' }}>
                            <div className="w-[104px] h-[104px] rounded-[32px] bg-[var(--dc-surface2)] border border-[var(--dc-border)] grid place-items-center text-[var(--dc-muted2)] mb-6"><Stethoscope size={44} strokeWidth={1.3} /></div>
                            <h2 className="text-[22px] font-extrabold tracking-[-0.025em] text-[var(--dc-ink)]">Bir {t('customer').toLowerCase()} seçin</h2>
                            <p className="text-[13px] text-[var(--dc-muted)] font-medium mt-1.5 max-w-[340px] leading-relaxed">Soldaki listeden bir {t('customer').toLowerCase()} seçerek {isDental ? 'diş şemasını, tedavi planlarını ve randevu geçmişini' : 'geçmişini ve tedavi planlarını'} görüntüleyin.</p>
                            <div className="flex gap-2.5 mt-7 flex-wrap justify-center">
                                {([
                                    { v: String(allCustomers.length), k: `Toplam ${t('customer').toLowerCase()}`, cls: 'text-[var(--dc-ink)]' },
                                    { v: String(allCustomers.filter(c => isNew7d(c.createdAt)).length), k: 'Son 7 gün yeni', cls: 'text-[var(--dc-orange)]' },
                                    { v: String(allCustomers.filter(c => c.recallDate).length), k: 'Kontrol bekleyen', cls: 'text-[var(--dc-amber)]' },
                                ]).map(s => (
                                    <div key={s.k} className="bg-[var(--dc-surface)] border border-[var(--dc-border2)] rounded-[15px] px-5 py-3.5 text-center min-w-[118px]">
                                        <div className={cn('font-mono text-[22px] font-extrabold tracking-[-0.02em]', s.cls)}>{s.v}</div>
                                        <div className="text-[10.5px] font-bold text-[var(--dc-muted)] mt-0.5">{s.k}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Kimlik şeridi */}
                            <div className="flex items-start gap-4 px-6 pt-5 pb-4 border-b border-[var(--dc-border)] flex-wrap">
                                {isMobile && <button onClick={() => setSelId(null)} className="w-9 h-9 rounded-lg grid place-items-center text-[var(--dc-muted)] hover:bg-[var(--dc-surface2)] -ml-1"><ChevronLeft size={18} /></button>}
                                <span className={cn('w-[54px] h-[54px] rounded-[17px] grid place-items-center text-[17px] font-extrabold flex-shrink-0', isNew48(selected.createdAt) ? 'bg-[var(--dc-orange)] text-white' : 'bg-[var(--dc-surface3)] text-[var(--dc-ink)]')}>{initials(selected.name)}</span>
                                <div className="flex-1 min-w-[220px]">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                        <span className="text-[20px] font-extrabold tracking-[-0.025em] text-[var(--dc-ink)]">{selected.name}</span>
                                        {selMedical.map(m => (
                                            <span key={m} className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-[var(--dc-red2)] bg-[var(--dc-red-bg)] border border-[rgba(192,64,46,0.25)] px-2.5 py-1 rounded-full"><AlertTriangle size={11} />{m}</span>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1.5 text-[12px] text-[var(--dc-muted)] font-semibold flex-wrap">
                                        <span className="font-mono text-[11.5px] font-bold">{selected.phone}</span>
                                        {selected.email && <span>{selected.email}</span>}
                                    </div>
                                    <div className="text-[11px] text-[var(--dc-muted2)] font-bold mt-1.5">
                                        {isNew48(selected.createdAt) ? <><span className="text-[var(--dc-orange)] font-extrabold">Yeni {t('customer').toLowerCase()}</span> · kayıt {fmtLong(selected.createdAt)}</> : `${t('customer')} · kayıt ${fmtLong(selected.createdAt)}`}
                                    </div>
                                </div>
                                <div className="flex gap-1.5 items-center">
                                    <button onClick={() => openEdit(selected)} title="Düzenle" className="w-10 h-10 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-surface)] grid place-items-center text-[var(--dc-muted)] hover:text-[var(--dc-ink)] hover:border-[var(--dc-ink)] transition-colors"><Edit2 size={16} /></button>
                                    <button onClick={() => removeCustomer(selected)} title="Sil" className="w-10 h-10 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-surface)] grid place-items-center text-[var(--dc-muted)] hover:text-[var(--dc-red2)] hover:border-[var(--dc-red2)] transition-colors"><Trash2 size={16} /></button>
                                    {isDental && <button onClick={() => navigate(`/patient-file/${selected.id}`)} className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-xl bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[12.5px] font-bold hover:opacity-90 transition-opacity">Tam Dosya <ArrowRight size={14} /></button>}
                                    {isBeauty && <button onClick={() => navigate(`/beauty-customer/${selected.id}`)} className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-xl bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[12.5px] font-bold hover:opacity-90 transition-opacity">Müşteri Kartı <ArrowRight size={14} /></button>}
                                </div>
                            </div>

                            {/* KPI */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 px-6 pt-4">
                                {([
                                    // Tedavi bedeli — ödemeler değil planlar. Eskiden burada
                                    // hastanın tüm ödemeleri ("Toplam Harcama") vardı ve plan
                                    // toplamıyla uyuşmuyordu.
                                    { k: 'Tedavi Tutarı', v: fmtTL(selFinance.total), debt: false },
                                    { k: 'Tamamlanan Randevu', v: String(selDone), debt: false },
                                    { k: 'Kalan Bakiye', v: fmtTL(selBal), debt: selBal > 0 },
                                ]).map(kpi => (
                                    <div key={kpi.k} className={cn('rounded-[15px] border px-4 py-3.5', kpi.debt ? 'bg-[var(--dc-red-bg)] border-[rgba(192,64,46,0.25)]' : 'bg-[var(--dc-page)] border-[var(--dc-border)]')}>
                                        <div className={cn('text-[10.5px] font-extrabold uppercase tracking-[0.09em]', kpi.debt ? 'text-[var(--dc-red2)] opacity-70' : 'text-[var(--dc-muted2)]')}>{kpi.k}</div>
                                        <div className={cn('font-mono text-[21px] font-extrabold tracking-[-0.02em] mt-1', kpi.debt ? 'text-[var(--dc-red2)]' : 'text-[var(--dc-ink)]')}>{kpi.v}</div>
                                        {kpi.debt && <div className="text-[10.5px] font-semibold text-[var(--dc-red2)] opacity-75 mt-0.5">Tahsilat bekliyor</div>}
                                    </div>
                                ))}
                            </div>

                            {/* Diş Şeması (yalnız diş sektörü) */}
                            {isDental && (
                                <div className="px-6 pt-[18px]">
                                    <div className="flex items-center gap-2 mb-2.5">
                                        <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[var(--dc-muted2)]">Diş Şeması</span>
                                        <button onClick={() => navigate(`/dental-chart?patient=${selected.id}`)} className="ml-auto text-[11.5px] font-bold text-[var(--dc-orange)] hover:opacity-80">Tam şemayı aç →</button>
                                    </div>
                                    <div className="bg-[var(--dc-page)] border border-[var(--dc-border)] rounded-[15px] p-4 overflow-x-auto">
                                        {[UPPER_FDI, LOWER_FDI].map((row, ri) => (
                                            <div key={ri} className={cn('flex gap-[3px] justify-center', ri === 1 && 'mt-1.5 pt-1.5 border-t border-dashed border-[var(--dc-border2)]')} style={{ minWidth: 480 }}>
                                                {row.map(n => {
                                                    const rec = dentalCurrent.get(n);
                                                    const st = rec && rec.status !== 'saglam' ? rec.status : undefined;
                                                    return <span key={n} title={`${n}${st ? ` · ${st}` : ''}`} className={cn('w-[26px] h-[30px] rounded-[7px] grid place-items-center font-mono text-[8.5px] font-bold flex-shrink-0', st ? TOOTH_CLASS[st] : 'bg-[var(--dc-surface2)] text-[var(--dc-muted)]')}>{n}</span>;
                                                })}
                                            </div>
                                        ))}
                                        <div className="flex gap-3 flex-wrap mt-2.5 justify-center">
                                            {([['var(--dc-red2)', 'Çürük'], ['var(--dc-blue)', 'Dolgu'], ['var(--dc-purple)', 'Kanal'], ['var(--dc-amber)', 'Kron'], ['var(--dc-green)', 'İmplant'], ['var(--dc-surface3)', 'Çekilmiş']] as const).map(([c, l]) => (
                                                <span key={l} className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--dc-muted)]"><i className="w-[9px] h-[9px] rounded-[3px]" style={{ background: c }} />{l}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Tedavi Planları */}
                            <div className="px-6 pt-[18px]">
                                <div className="flex items-center gap-2 mb-2.5"><span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[var(--dc-muted2)]">Tedavi Planları</span></div>
                                {selPlans.length === 0 ? (
                                    <div className="bg-[var(--dc-page)] border border-dashed border-[var(--dc-border2)] rounded-[15px] p-4 text-center text-[12.5px] font-semibold text-[var(--dc-muted)]">Aktif tedavi planı yok</div>
                                ) : (
                                    <div className="flex flex-col gap-2.5">
                                        {selPlans.map(p => {
                                            const paid = selFinance.paidByPlan.get(p.id) || 0;
                                            const pct = p.total > 0 ? Math.min(100, Math.round(paid / p.total * 100)) : 0;
                                            const meta = PLAN_STATUS_META[p.status];
                                            const proposed = p.status === 'proposed';
                                            return (
                                                <div key={p.id} className="bg-[var(--dc-page)] border border-[var(--dc-border)] rounded-[15px] p-4 flex flex-col gap-2.5">
                                                    <div className="flex items-center gap-2.5"><span className="flex-1 text-[13.5px] font-bold text-[var(--dc-ink)]">{p.title}</span><span className={cn('text-[10px] font-extrabold px-2.5 py-1 rounded-full whitespace-nowrap', meta.cls)}>{meta.label}</span></div>
                                                    {!proposed && <>
                                                        <div className="h-1.5 rounded-full bg-[var(--dc-surface3)] overflow-hidden"><span className={cn('block h-full rounded-full', pct >= 100 ? 'bg-[var(--dc-green)]' : 'bg-[var(--dc-orange)]')} style={{ width: `${pct}%` }} /></div>
                                                        <div className="flex justify-between text-[11px] font-semibold text-[var(--dc-muted)]"><span><span className="font-mono font-bold">{fmtTL(paid)}</span> ödendi</span><span>toplam <span className="font-mono font-bold">{fmtTL(p.total)}</span></span></div>
                                                    </>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                {isDental && <button onClick={() => navigate(`/dental-chart?patient=${selected.id}`)} className="inline-flex items-center gap-1.5 mt-2.5 min-h-[38px] px-3.5 rounded-xl border border-dashed border-[var(--dc-border2)] text-[12px] font-bold text-[var(--dc-muted)] hover:text-[var(--dc-orange)] hover:border-[var(--dc-orange)] transition-colors"><Plus size={14} />Yeni Tedavi Planı</button>}
                            </div>

                            {/* Randevu Geçmişi */}
                            <div className="px-6 pt-[18px]">
                                <div className="flex items-center gap-2 mb-2.5"><span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[var(--dc-muted2)]">Randevu Geçmişi</span></div>
                                {custHistory.length === 0 ? (
                                    <div className="text-[12.5px] font-semibold text-[var(--dc-muted)] py-3">Henüz randevu kaydı yok — ilk randevuyu aşağıdan oluşturabilirsiniz.</div>
                                ) : (
                                    <div className="flex flex-col">
                                        {custHistory.slice(0, 5).map(r => {
                                            const dot = r.status === 'completed' ? 'bg-[var(--dc-green)]' : r.status === 'cancelled' ? 'bg-[var(--dc-red2)]' : r.status === 'pending' ? 'bg-[var(--dc-amber)]' : 'bg-[var(--dc-blue)]';
                                            return (
                                                <div key={r.id} className="flex items-center gap-3 py-2.5 border-b border-[var(--dc-border)] last:border-b-0">
                                                    <span className={cn('w-[9px] h-[9px] rounded-full flex-shrink-0', dot)} />
                                                    <span className="font-mono text-[11px] font-bold text-[var(--dc-muted)] w-[56px] flex-shrink-0">{fmtShort(r.date)}</span>
                                                    <span className="flex-1 min-w-0 text-[12.5px] font-bold text-[var(--dc-ink)] truncate">{r.service}</span>
                                                    {r.staffName && <span className="text-[11px] font-semibold text-[var(--dc-muted)] whitespace-nowrap">{r.staffName}</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Hızlı aksiyonlar */}
                            <div className="flex gap-2.5 px-6 pt-[18px] pb-5 mt-auto border-t border-[var(--dc-border)] flex-wrap" style={{ marginTop: 18 }}>
                                <button onClick={() => navigate(`/calendar?new=1&customer=${selected.id}`)} className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 min-h-[46px] px-4 rounded-[13px] bg-[var(--dc-orange)] text-white text-[13px] font-bold hover:opacity-90 transition-opacity"><CalendarClock size={15} />Yeni Randevu</button>
                                {isDental && <button onClick={() => navigate(`/dental-chart?patient=${selected.id}`)} className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 min-h-[46px] px-4 rounded-[13px] border border-[var(--dc-border2)] text-[var(--dc-ink)] text-[13px] font-bold hover:border-[var(--dc-ink)] transition-colors"><Stethoscope size={15} />Diş Şeması</button>}
                                <div className="flex-1 min-w-[140px] relative">
                                    <button onClick={() => setWaOpen(o => !o)} className="w-full inline-flex items-center justify-center gap-2 min-h-[46px] px-4 rounded-[13px] border border-[var(--dc-border2)] text-[var(--dc-green)] text-[13px] font-bold hover:border-[var(--dc-green)] transition-colors"><MessageCircle size={15} />WhatsApp</button>
                                    {waOpen && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setWaOpen(false)} />
                                            <div className="absolute z-50 bottom-[calc(100%+8px)] right-0 w-[300px] max-w-[80vw] p-1.5 rounded-[14px] bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_10px_30px_rgba(14,14,14,0.18)]">
                                                {waTemplates.map(tpl => (
                                                    <a
                                                        key={tpl.label}
                                                        href={waHref(selected.phone, tpl.text)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        onClick={() => setWaOpen(false)}
                                                        className="block px-3 py-2.5 rounded-[10px] text-[12.5px] font-semibold text-[var(--dc-ink)] hover:bg-[var(--dc-surface2)] transition-colors"
                                                    >
                                                        {tpl.label}
                                                    </a>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </section>
            </main>

            {/* Yeni/düzenle hasta modalı */}
            {showForm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: dark ? 'rgba(0,0,0,0.6)' : 'rgba(14,14,14,0.4)', backdropFilter: 'blur(4px)' }} onClick={closeForm}>
                    <div className={cn('dash-theme w-[440px] max-w-[90vw]', dark && 'dark')} onClick={e => e.stopPropagation()}>
                        <div className="bg-[var(--dc-surface)] border border-[var(--dc-border2)] rounded-[20px] p-7 shadow-[0_8px_24px_rgba(14,14,14,0.10),0_24px_64px_rgba(14,14,14,0.18)]">
                            <div className="flex items-center justify-between mb-5">
                                <div className="text-[17px] font-extrabold tracking-[-0.02em] text-[var(--dc-ink)]">{editingId ? `${t('customer')} Düzenle` : `Yeni ${t('customer')}`}</div>
                                <button onClick={closeForm} className="w-8 h-8 rounded-lg grid place-items-center text-[var(--dc-muted)] hover:bg-[var(--dc-surface2)]"><X size={16} /></button>
                            </div>
                            {([['Ad Soyad', 'name', 'text', `${t('customer')} adı`, true], ['Telefon', 'phone', 'tel', '0532 xxx xxxx', true], ['E-posta (opsiyonel)', 'email', 'email', 'email@ornek.com', false]] as const).map(([label, key, type, ph, req]) => (
                                <div key={key} className="mb-3.5">
                                    <label className="block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--dc-muted)] mb-1.5">{label}{req && <span className="text-[var(--dc-red2)]"> *</span>}</label>
                                    <input type={type} placeholder={ph} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                                        className="w-full bg-[var(--dc-surface2)] border border-[var(--dc-border2)] rounded-[10px] px-3.5 py-2.5 text-[13.5px] text-[var(--dc-ink)] outline-none focus:border-[var(--dc-orange)]" />
                                </div>
                            ))}
                            <CustomFieldsSection defs={cfDefs} values={cfValues} onChange={setCfValues} T={{ ink: 'var(--dc-ink)', muted: 'var(--dc-muted)', surface2: 'var(--dc-surface2)', border2: 'var(--dc-border2)', rSm: '10px' }} />
                            <div className="mb-5">
                                <label className="block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--dc-muted)] mb-1.5">Not</label>
                                <textarea placeholder={`${t('customer')} hakkında notlar…`} rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                                    className="w-full bg-[var(--dc-surface2)] border border-[var(--dc-border2)] rounded-[10px] px-3.5 py-2.5 text-[13.5px] text-[var(--dc-ink)] outline-none focus:border-[var(--dc-orange)] resize-none h-[70px]" />
                            </div>
                            <div className="flex gap-2 justify-end pt-4 border-t border-[var(--dc-border)]">
                                <button onClick={closeForm} className="px-4 py-2.5 rounded-[10px] border border-[var(--dc-border2)] text-[13px] font-semibold text-[var(--dc-muted)] hover:text-[var(--dc-ink)]">Vazgeç</button>
                                <button onClick={submitForm} disabled={!form.name || !form.phone || creating}
                                    className="px-[18px] py-2.5 rounded-[10px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed">
                                    {creating ? (editingId ? 'Güncelleniyor…' : 'Ekleniyor…') : (editingId ? 'Kaydet' : `${t('customer')} Ekle`)}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
