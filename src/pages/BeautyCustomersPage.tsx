import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useCustomers } from '@/hooks/useCustomers';
import { useReservations } from '@/hooks/useReservations';
import { usePayments } from '@/hooks/usePayments';
import { useOrgPackages } from '@/hooks/useOrgPackages';
import { useStaff } from '@/hooks/useStaff';
import { useCashEnabled } from '@/hooks/useModules';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import { computePatientFinance } from '@/lib/patientBalance';
import { normalizePhone, waLink } from '@/lib/phone';
import { profileForSector } from '@/lib/sectorProfiles';
import { reservationPrice } from '@/utils/reservationServices';
import { BeautySessionModal } from '@/components/beauty/BeautySessionModal';
import { TfIcon, TfIconSprite } from '@/components/beauty/TfIcons';
import type { Customer, Reservation } from '@/types';
import './beautyCustomers.css';

// ── Güzellik · Müşteri merkezi (Premium V2) ──────────────────────────────────
// Tasarımın birebir uygulaması: "Timeflow Beauty Customers Premium V2.html".
// Üç sütun — dizin, dosya, odak rayı — ve mockup'taki tüm bölümler yerinde.
//
// Mockup'ta sabit olan her şey burada GERÇEK veriden türetiliyor: sinyal
// rozetleri, bayraklar, dört kutuluk özet şerit, öneri bandı, öncelikler ve
// beş sekme. Uydurma alan yok; karşılığı olmayan yerde bölüm boş durumunu
// gösteriyor.
//
// Sektör eşlemesi registry'de (calendarSectorProfiles → customers: 'guzellik'),
// bileşen içinde `if (sector === ...)` yok.

const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const DAYS_TR = ['PAZAR', 'PAZARTESİ', 'SALI', 'ÇARŞAMBA', 'PERŞEMBE', 'CUMA', 'CUMARTESİ'];

const fmtShort = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS_TR[d.getMonth()]}`; };
const fmtTL = (n: number) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const initialsOf = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysSince = (iso?: string) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null);

/** Görüntü amaçlı kısa kod. Kayıtta böyle bir alan yok; uuid'den türetilir. */
const codeOf = (id: string) => `TF-${id.replace(/\D/g, '').slice(-4).padStart(4, '0')}`;

/** Ortak ekran nezaketi: soyadı maskelenir (yetki değil — GuzellikDashboard ile aynı ilke). */
function maskName(name: string, on: boolean): string {
    if (!on) return name;
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) return name;
    return `${parts[0]} ${parts.slice(1).map((p) => `${p[0]}.`).join(' ')}`;
}
function maskPhone(phone: string, on: boolean): string {
    if (!on) return phone;
    const d = phone.replace(/\D/g, '');
    return d.length < 6 ? phone : `${d.slice(0, 4)} ••• •• ${d.slice(-2)}`;
}

type FilterKey = 'all' | 'today' | 'action' | 'dormant';
type TabKey = 'summary' | 'visits' | 'packages' | 'messages' | 'forms';
type DialogKind = 'new-customer' | 'whatsapp' | 'collect' | null;
type Tone = 'orange' | 'amber' | 'blue' | 'violet' | 'green' | 'danger';

interface Flag { label: string; tone: 'violet' | 'amber' | 'green' | 'orange' | 'blue' }
interface Priority { icon: string; tone: Tone; title: string; subtitle: string }
interface TimelineEvent { when: string; title: string; detail: string; amount: string }

const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'Tümü' },
    { key: 'today', label: 'Bugün' },
    { key: 'action', label: 'İşlem gereken' },
    { key: 'dormant', label: 'Geri kazan' },
];

const TABS: { key: TabKey; label: string }[] = [
    { key: 'summary', label: 'Genel bakış' },
    { key: 'visits', label: 'Ziyaretler' },
    { key: 'packages', label: 'Paketler ve finans' },
    { key: 'messages', label: 'İletişim' },
    { key: 'forms', label: 'Formlar ve izinler' },
];

interface WaRow { id: number; kind: string; status: string; created_at: string }

export function BeautyCustomersPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { allCustomers, addCustomer } = useCustomers();
    const { reservations, settings } = useReservations();
    const { payments } = usePayments();
    const { packages, refresh: refreshPackages } = useOrgPackages();
    const { staff } = useStaff();
    // Kasa modülü kapalıysa /kasa boş bir rota olur; tahsilat aksiyonları o
    // durumda gizlenir (module-gating sözleşmesi).
    const cashOn = useCashEnabled();
    const { dark } = useTheme();

    const [selId, setSelId] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<FilterKey>('all');
    const [tab, setTab] = useState<TabKey>('summary');
    const [privacy, setPrivacy] = useState(false);
    const [dialog, setDialog] = useState<DialogKind>(null);
    const [sessionFor, setSessionFor] = useState<Customer | null | undefined>(undefined);
    const searchRef = useRef<HTMLInputElement>(null);

    // Deep-link: /customers?open=<id>
    useEffect(() => {
        const openId = searchParams.get('open');
        if (!openId) return;
        setSelId(openId);
        const next = new URLSearchParams(searchParams);
        next.delete('open');
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

    // ── Türetilmiş sözlükler ────────────────────────────────────────────────
    const today = todayISO();
    const riskFlags = useMemo(() => profileForSector(settings.sector).riskFlags || [], [settings.sector]);

    const resByCustomer = useMemo(() => {
        const m = new Map<string, Reservation[]>();
        for (const r of reservations) {
            if (!r.customerId) continue;
            const arr = m.get(r.customerId) || [];
            arr.push(r);
            m.set(r.customerId, arr);
        }
        for (const arr of m.values()) arr.sort((a, b) => b.date.localeCompare(a.date));
        return m;
    }, [reservations]);

    const pkgByCustomer = useMemo(() => {
        const m = new Map<string, typeof packages>();
        for (const p of packages) {
            if (p.status === 'cancelled') continue;
            const arr = m.get(p.customerId) || [];
            arr.push(p);
            m.set(p.customerId, arr);
        }
        return m;
    }, [packages]);

    const payByCustomer = useMemo(() => {
        const m = new Map<string, typeof payments>();
        const owner = new Map(packages.map((p) => [p.id, p.customerId]));
        for (const p of payments) {
            const cid = p.customerId || (p.treatmentPlanId ? owner.get(p.treatmentPlanId) : undefined);
            if (!cid) continue;
            const arr = m.get(cid) || [];
            arr.push(p);
            m.set(cid, arr);
        }
        return m;
    }, [payments, packages]);

    const staffName = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);

    const balanceOf = (id: string) => computePatientFinance(
        (pkgByCustomer.get(id) || []).map((p) => ({ id: p.id, totalAmount: p.totalAmount, status: p.status })),
        payByCustomer.get(id) || [],
    ).balance;

    const rightsOf = (id: string) => (pkgByCustomer.get(id) || [])
        .filter((p) => p.status !== 'completed')
        .reduce((sum, p) => sum + Math.max(0, p.sessionCount - p.sessionsDone), 0);

    const nextResOf = (id: string) => (resByCustomer.get(id) || [])
        .filter((r) => r.date >= today && r.status !== 'cancelled')
        .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0];

    const riskOf = (c: Customer) => riskFlags.filter((f) => Boolean(c.customFields?.[f.key]));

    // ── Liste ───────────────────────────────────────────────────────────────
    const matchesFilter = (c: Customer): boolean => {
        if (filter === 'all') return true;
        if (filter === 'today') return (resByCustomer.get(c.id) || []).some((r) => r.date === today && r.status !== 'cancelled');
        if (filter === 'dormant') {
            const gone = daysSince(c.lastVisit);
            return gone !== null && gone >= 60 && !nextResOf(c.id);
        }
        // İşlem gereken: bakiye, kontrol zamanı, biten paket ya da açık risk bayrağı
        if (balanceOf(c.id) > 0) return true;
        if (c.recallDate && c.recallDate <= today) return true;
        const rights = rightsOf(c.id);
        if (rights > 0 && rights <= 1) return true;
        return riskOf(c).length > 0 && Boolean(nextResOf(c.id));
    };

    const listed = useMemo(() => {
        const q = query.trim().toLocaleLowerCase('tr');
        return allCustomers.filter((c) => matchesFilter(c) && (!q
            || c.name.toLocaleLowerCase('tr').includes(q)
            || c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, ''))
            || (resByCustomer.get(c.id) || []).some((r) => r.service.toLocaleLowerCase('tr').includes(q))));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allCustomers, query, filter, resByCustomer, pkgByCustomer, payByCustomer, today]);

    const selected = allCustomers.find((c) => c.id === selId) ?? null;

    // Seçim boşsa ilk kaydı aç — mockup her zaman dolu bir dosya gösteriyor.
    useEffect(() => {
        if (!selected && listed.length > 0) setSelId(listed[0].id);
    }, [selected, listed]);
    useEffect(() => { setTab('summary'); }, [selId]);

    // ⌘K arama, ⌘N yeni müşteri (mockup'taki kısayollar)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey)) return;
            const k = e.key.toLowerCase();
            if (k === 'k') { e.preventDefault(); searchRef.current?.focus(); }
            if (k === 'n') { e.preventDefault(); setDialog('new-customer'); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    // ── Satır sinyali ───────────────────────────────────────────────────────
    const signalOf = (c: Customer): { text: string; tone: Tone } => {
        const bal = balanceOf(c.id);
        if (bal > 0) return { text: fmtTL(bal), tone: 'amber' };
        if (riskOf(c).length > 0 && nextResOf(c.id)) return { text: 'Kontrol gerekli', tone: 'danger' };
        const rights = rightsOf(c.id);
        if (rights === 1) return { text: 'Paket bitiyor', tone: 'orange' };
        if (rights > 1) return { text: `${rights} hak`, tone: 'orange' };
        if (c.recallDate && c.recallDate <= today) return { text: 'Kontrol zamanı', tone: 'amber' };
        const gone = daysSince(c.lastVisit);
        if (gone !== null && gone >= 60) return { text: 'Geri kazan', tone: 'blue' };
        if (nextResOf(c.id)) return { text: 'Randevulu', tone: 'violet' };
        return { text: `${c.totalReservations} seans`, tone: 'green' };
    };

    const listMetaOf = (c: Customer): { meta: string; detail: string } => {
        const next = nextResOf(c.id);
        if (next) {
            const when = next.date === today ? 'Bugün' : fmtShort(next.date);
            return { meta: `${when} · ${next.startTime}`, detail: `${next.service}${next.staffId ? ` · ${staffName.get(next.staffId) || ''}` : ''}` };
        }
        const last = (resByCustomer.get(c.id) || []).find((r) => r.status === 'completed');
        const rights = rightsOf(c.id);
        return {
            meta: c.lastVisit ? `Son ziyaret ${fmtShort(c.lastVisit)}` : 'Ziyaret yok',
            detail: last ? `${last.service}${rights > 0 ? ` · ${rights} seans kaldı` : ''}` : 'Henüz işlem yok',
        };
    };

    // ── Seçili müşterinin türetilmiş dosyası ────────────────────────────────
    const dossier = useMemo(() => {
        if (!selected) return null;
        const history = resByCustomer.get(selected.id) || [];
        const pkgs = pkgByCustomer.get(selected.id) || [];
        const pays = payByCustomer.get(selected.id) || [];
        const next = nextResOf(selected.id);
        const risks = riskOf(selected);
        const bal = balanceOf(selected.id);
        const rights = rightsOf(selected.id);
        const activePkgs = pkgs.filter((p) => p.status !== 'completed');
        const gone = daysSince(selected.lastVisit);

        // Tercih edilen uzman: geçmişte en çok çalıştığı kişi
        const staffCount = new Map<string, number>();
        for (const r of history) if (r.staffId) staffCount.set(r.staffId, (staffCount.get(r.staffId) || 0) + 1);
        const favStaff = [...staffCount.entries()].sort((a, b) => b[1] - a[1])[0];

        const flags: Flag[] = [];
        for (const r of risks) flags.push({ label: r.label, tone: 'amber' });
        if ((selected.loyaltyStamps ?? 0) > 0) {
            flags.push({ label: `Sadakat ${selected.loyaltyStamps}/${settings.loyaltyThreshold ?? 10}`, tone: 'violet' });
        }
        if (activePkgs.length > 0) flags.push({ label: `${activePkgs.length} aktif paket`, tone: 'orange' });
        if (normalizePhone(selected.phone)) flags.push({ label: 'WhatsApp açık', tone: 'green' });
        if (gone !== null && gone >= 60) flags.push({ label: `${gone} gündür gelmedi`, tone: 'blue' });

        // Zaman çizelgesi: ziyaret + tahsilat birlikte, yeniden eskiye
        const events: TimelineEvent[] = [
            ...history.filter((r) => r.status !== 'cancelled').map((r) => ({
                when: fmtShort(r.date),
                sort: r.date,
                title: r.service,
                detail: [r.staffId ? staffName.get(r.staffId) : null, r.status === 'completed' ? 'Tamamlandı' : 'Planlandı']
                    .filter(Boolean).join(' · '),
                amount: r.customFields?.paket_plan_id ? 'Paket' : fmtTL(reservationPrice(r, settings.services || [])),
            })),
            ...pays.map((p) => ({
                when: fmtShort(p.paidAt.slice(0, 10)),
                sort: p.paidAt.slice(0, 10),
                title: p.method === 'card' ? 'Kartla tahsilat' : p.method === 'cash' ? 'Nakit tahsilat' : 'Tahsilat',
                detail: p.description || 'Kasa',
                amount: fmtTL(p.amount),
            })),
        ].sort((a, b) => b.sort.localeCompare(a.sort)).map(({ when, title, detail, amount }) => ({ when, title, detail, amount }));

        // Öncelikler — sırayla en acil olan üstte
        const priorities: Priority[] = [];
        if (risks.length > 0) priorities.push({ icon: 'alert', tone: 'amber', title: `${risks[0].label} doğrula`, subtitle: 'İşlem öncesi uzman kontrolü' });
        if (bal > 0) priorities.push({ icon: 'credit', tone: 'orange', title: `${fmtTL(bal)} açık bakiye`, subtitle: 'Tahsilat kasa ekranında tamamlanır' });
        if (rights === 1) priorities.push({ icon: 'box', tone: 'orange', title: 'Pakette son seans', subtitle: 'Yenileme için uygun zaman' });
        if (selected.recallDate) priorities.push({ icon: 'clock', tone: 'blue', title: `Kontrol · ${fmtShort(selected.recallDate)}`, subtitle: 'Dönüş periyodu doldu' });
        if (!next && history.length > 0) priorities.push({ icon: 'message', tone: 'blue', title: 'Planlanmış seans yok', subtitle: 'Geri dönüş mesajı hazırlanabilir' });
        if (priorities.length === 0) priorities.push({ icon: 'shield', tone: 'green', title: 'Bekleyen iş yok', subtitle: 'Kayıt güncel' });

        // Öneri / odak — tek bir "sıradaki doğru adım"
        type FocusAction = 'appointment' | 'collect' | 'whatsapp';
        let focus: { title: string; reason: string; button: string; action: FocusAction } =
            { title: 'Bir sonraki seansı planla.', reason: 'Bakım aralığı dolmadan uygun saati ayırın.', button: 'Seansı planla', action: 'appointment' };
        let guidance = { title: 'Sonraki seansı planla', reason: 'Müşterinin planlanmış randevusu yok.' };
        if (risks.length > 0 && next) {
            focus = { title: 'Uygunluğu doğrula.', reason: `${risks[0].label} kaydı var; işlem öncesi kontrol gerekiyor.`, button: 'Randevuyu aç', action: 'appointment' };
            guidance = { title: `${risks[0].label} kontrolünü yap`, reason: 'Yaklaşan işlemden önce doğrulanmalı.' };
        } else if (bal > 0) {
            focus = { title: 'Bakiyeyi tahsil et.', reason: `${fmtTL(bal)} açık bakiye var.`, button: 'Kasayı aç', action: 'collect' };
            guidance = { title: 'Açık bakiyeyi kapat', reason: `${fmtTL(bal)} tutarında bakiye bekliyor.` };
        } else if (rights === 1) {
            focus = { title: 'Yenileme teklifini hazırla.', reason: 'Pakette son seans kaldı; devamlılık için uygun zaman.', button: 'Mesaj hazırla', action: 'whatsapp' };
            guidance = { title: 'Paket yenileme teklifini görüş', reason: 'Paketinde yalnızca bir seans kaldı.' };
        } else if (gone !== null && gone >= 60) {
            focus = { title: 'Müşteriyi geri kazan.', reason: `${gone} gündür gelmedi ve planlanmış randevusu yok.`, button: 'Mesaj taslağını aç', action: 'whatsapp' };
            guidance = { title: 'Kişisel geri dönüş mesajı hazırla', reason: `Son ziyaretin üzerinden ${gone} gün geçti.` };
        } else if (next) {
            focus = { title: 'Randevuyu teyit et.', reason: `${fmtShort(next.date)} ${next.startTime} · ${next.service}`, button: 'Teyit mesajı hazırla', action: 'whatsapp' };
            guidance = { title: 'Yaklaşan seansı teyit et', reason: `${fmtShort(next.date)} ${next.startTime} randevusu var.` };
        }

        return {
            history, pkgs, activePkgs, next, risks, bal, rights, gone, events, priorities, flags, focus, guidance,
            favStaff: favStaff ? staffName.get(favStaff[0]) : undefined,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected, resByCustomer, pkgByCustomer, payByCustomer, staffName, settings, riskFlags, today]);

    // ── İletişim geçmişi (yalnız İletişim sekmesi açıkken) ──────────────────
    const [waRows, setWaRows] = useState<WaRow[] | null>(null);
    useEffect(() => {
        if (tab !== 'messages' || !selected) { setWaRows(null); return; }
        let alive = true;
        void import('@/lib/supabase').then(({ supabase }) => supabase
            .from('wa_message_log')
            .select('id, kind, status, created_at')
            .eq('customer_id', selected.id)
            .order('created_at', { ascending: false })
            .limit(30)
            .then(({ data }) => { if (alive) setWaRows((data as WaRow[]) || []); }));
        return () => { alive = false; };
    }, [tab, selected]);

    // ── Aksiyonlar ──────────────────────────────────────────────────────────
    const runAction = (action: 'appointment' | 'collect' | 'whatsapp') => {
        if (!selected) return;
        if (action === 'appointment') setSessionFor(selected);
        else if (action === 'collect') { if (cashOn) navigate('/kasa'); else toast.error('Kasa modülü kapalı'); }
        else setDialog('whatsapp');
    };

    if (!settings) return null;

    return (
        <div className={cn('tfv2 flex-1 min-h-0 overflow-y-auto', dark && 'dark')}>
            <TfIconSprite />

            {/* ── Sayfa başlığı ── */}
            <section className="tfv2-page-head">
                <div className="tfv2-page-title">
                    <p className="tfv2-eyebrow">Güzellik salonu · Müşteri merkezi</p>
                    <h1>Müşteriyi tanı. Doğru adımı tek bakışta gör.</h1>
                    <p>Paket, seans, iletişim ve tahsilat aynı müşteri akışında.</p>
                </div>
                <div className="tfv2-page-actions">
                    <div className="tfv2-privacy">
                        <TfIcon name="lock" className="tfv2-icon-sm" />
                        <span>Ortak ekran</span>
                        <button className="tfv2-switch" aria-pressed={privacy} aria-label="Ortak ekran gizliliği"
                            onClick={() => setPrivacy((v) => !v)}><span /></button>
                    </div>
                    <button className="tfv2-button is-quiet" onClick={() => navigate('/settings?tab=data')}>
                        <TfIcon name="upload" /><span>Listeden aktar</span>
                    </button>
                    <button className="tfv2-button is-primary" onClick={() => setDialog('new-customer')}>
                        <TfIcon name="plus" /><span>Yeni müşteri</span>
                    </button>
                </div>
            </section>

            <section className="tfv2-workspace">
                {/* ── Dizin ── */}
                <aside className="tfv2-directory" aria-label="Müşteri listesi">
                    <div className="tfv2-directory-head">
                        <div className="tfv2-directory-title">
                            <h2>Müşteriler</h2>
                            <span>{listed.length} kayıt</span>
                        </div>
                        <label className="tfv2-search">
                            <span className="tfv2-visually-hidden">Müşteri ara</span>
                            <TfIcon name="search" />
                            <input ref={searchRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                                placeholder="Ad, telefon veya hizmet" />
                            <span className="tfv2-key">⌘K</span>
                        </label>
                        <div className="tfv2-filters" aria-label="Müşteri filtreleri">
                            {FILTERS.map((f) => (
                                <button key={f.key} className="tfv2-filter" aria-pressed={filter === f.key}
                                    onClick={() => setFilter(f.key)}>{f.label}</button>
                            ))}
                        </div>
                    </div>

                    <div className="tfv2-customer-list">
                        {listed.length === 0 ? (
                            <div className="tfv2-directory-empty">
                                <TfIcon name="search" />
                                <strong style={{ display: 'block' }}>Müşteri bulunamadı</strong>
                                <span style={{ display: 'block', marginTop: 4 }}>Aramayı değiştirin veya filtreleri temizleyin.</span>
                                <button className="tfv2-button is-small" style={{ marginTop: 14 }}
                                    onClick={() => { setFilter('all'); setQuery(''); }}>Filtreleri temizle</button>
                            </div>
                        ) : listed.map((c) => {
                            const signal = signalOf(c);
                            const { meta, detail } = listMetaOf(c);
                            return (
                                <button key={c.id} className={`tfv2-customer-row${c.id === selId ? ' is-selected' : ''}`}
                                    aria-pressed={c.id === selId} onClick={() => setSelId(c.id)}>
                                    <span className="tfv2-list-avatar">{initialsOf(c.name)}</span>
                                    <span className="tfv2-row-copy">
                                        <strong>{maskName(c.name, privacy)}</strong>
                                        <small>{meta}</small>
                                        <small>{detail}</small>
                                    </span>
                                    <span className={`tfv2-row-status tfv2-tone-${signal.tone}`}>{signal.text}</span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="tfv2-directory-foot">
                        <span><span className="tfv2-online" />Veriler güncel</span>
                        <span>{allCustomers.length} kayıtlı müşteri</span>
                    </div>
                </aside>

                {/* ── Dosya ── */}
                <article className="tfv2-dossier" aria-label="Seçili müşteri profili">
                    {!selected || !dossier ? (
                        <div className="tfv2-tab-content" style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
                            <div>
                                <TfIcon name="users" />
                                <h2 style={{ margin: '10px 0 4px', letterSpacing: '-.03em' }}>Bir müşteri seçin</h2>
                                <p style={{ margin: 0, color: 'var(--tfv2-muted)' }}>Soldaki listeden seçim yapın.</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="tfv2-profile-head">
                                <div className="tfv2-profile-emblem">{initialsOf(selected.name)}</div>
                                <div className="tfv2-profile-copy">
                                    <p className="tfv2-profile-kicker">Müşteri profili · {codeOf(selected.id)}</p>
                                    <h2>{maskName(selected.name, privacy)}</h2>
                                    {/* İki ayrı satır: kimlik bilgisi üstte, tercih altta.
                                        Üçü tek sarmalayan satırdayken dar sütunda üç ayrı
                                        satıra bölünüp künyeyi sıkışık gösteriyordu. */}
                                    <div className="tfv2-profile-meta">
                                        <span><TfIcon name="phone" className="tfv2-icon-sm" />{maskPhone(selected.phone, privacy)}</span>
                                        <span>{new Date(selected.createdAt).getFullYear()}'ten beri müşteri</span>
                                    </div>
                                    {dossier.favStaff && (
                                        <div className="tfv2-profile-meta is-secondary">
                                            <span>Tercihi: <b>{dossier.favStaff}</b></span>
                                        </div>
                                    )}
                                </div>
                                <div className="tfv2-profile-actions">
                                    <button className="tfv2-button" onClick={() => setDialog('whatsapp')}>
                                        <TfIcon name="message" /><span>WhatsApp</span>
                                    </button>
                                    <button className="tfv2-button is-primary" onClick={() => setSessionFor(selected)}>
                                        <TfIcon name="plus" /><span>Yeni seans</span>
                                    </button>
                                    <button className="tfv2-icon-button" aria-label="Müşteri kartını aç"
                                        onClick={() => navigate(`/beauty-customer/${selected.id}`)}>
                                        <TfIcon name="arrow" />
                                    </button>
                                </div>
                            </div>

                            <div className="tfv2-profile-flags">
                                {dossier.flags.length === 0
                                    ? <span className="tfv2-flag">Özel not yok</span>
                                    : dossier.flags.map((f) => <span key={f.label} className={`tfv2-flag is-${f.tone}`}>{f.label}</span>)}
                            </div>

                            {/* Dört kutuluk özet şerit */}
                            <div className="tfv2-glance">
                                <div className="tfv2-glance-item">
                                    <small>Sıradaki randevu</small>
                                    <strong>{dossier.next ? `${fmtShort(dossier.next.date)} · ${dossier.next.startTime}` : 'Randevu yok'}</strong>
                                    <span>{dossier.next
                                        ? [dossier.next.service, dossier.next.staffId ? staffName.get(dossier.next.staffId) : null].filter(Boolean).join(' · ')
                                        : 'Yeniden planlama bekliyor'}</span>
                                </div>
                                <div className="tfv2-glance-item">
                                    <small>Paket durumu</small>
                                    <strong>{dossier.rights > 0 ? `${dossier.rights} hak kullanılabilir` : 'Aktif paket yok'}</strong>
                                    <span>{dossier.activePkgs.length > 0 ? `${dossier.activePkgs.length} aktif paket` : 'Tekil hizmet müşterisi'}</span>
                                </div>
                                <div className="tfv2-glance-item">
                                    <small>Finans</small>
                                    <strong>{dossier.bal > 0 ? `${fmtTL(dossier.bal)} bakiye` : 'Borç yok'}</strong>
                                    <span>{selected.lastVisit ? `Son ziyaret ${fmtShort(selected.lastVisit)}` : 'Ziyaret yok'}</span>
                                </div>
                                <div className={`tfv2-glance-item ${dossier.risks.length > 0 ? 'is-alert' : 'is-safe'}`}>
                                    <small>İşleme uygunluk</small>
                                    <strong>{dossier.risks.length > 0 ? 'Kontrol gerekli' : 'Hazır'}</strong>
                                    <span>{dossier.risks.length > 0 ? dossier.risks.map((r) => r.label).join(', ') : 'Bilinen kısıt yok'}</span>
                                </div>
                            </div>

                            {/* Öneri bandı */}
                            <div className="tfv2-guidance">
                                <span className="tfv2-guidance-icon"><TfIcon name="sparkles" /></span>
                                <div className="tfv2-guidance-copy">
                                    <small>Timeflow önerisi</small>
                                    <strong>{dossier.guidance.title}</strong>
                                    <span>{dossier.guidance.reason}</span>
                                </div>
                                <button className="tfv2-button is-small" onClick={() => runAction(dossier.focus.action)}>
                                    Uygula <TfIcon name="arrow" className="tfv2-icon-sm" />
                                </button>
                            </div>

                            {/* Sekmeler */}
                            <div className="tfv2-tabs" role="tablist" aria-label="Müşteri bölümleri">
                                {TABS.map((tb) => (
                                    <button key={tb.key} className="tfv2-tab" role="tab" aria-selected={tab === tb.key}
                                        onClick={() => setTab(tb.key)}>{tb.label}</button>
                                ))}
                            </div>

                            <div className="tfv2-tab-content">
                                {tab === 'summary' && (
                                    <div className="tfv2-summary-layout">
                                        <div>
                                            <section className="tfv2-section">
                                                <div className="tfv2-section-head">
                                                    <h3>Aktif paketler</h3>
                                                    <small>{dossier.rights > 0 ? `${dossier.rights} hak kullanılabilir` : 'Hak yok'}</small>
                                                </div>
                                                <PackageRows packages={dossier.activePkgs} balance={dossier.bal} />
                                            </section>
                                            <section className="tfv2-section">
                                                <div className="tfv2-section-head">
                                                    <h3>Son hareketler</h3>
                                                    <small>İşlem, tahsilat ve iletişim</small>
                                                </div>
                                                <Timeline events={dossier.events.slice(0, 3)} />
                                            </section>
                                        </div>
                                        <aside>
                                            <section className="tfv2-section">
                                                <div className="tfv2-section-head"><h3>Bakım planı</h3><small>3 aşama</small></div>
                                                <div className="tfv2-plan">
                                                    <div className="tfv2-plan-step is-done">
                                                        <span className="tfv2-plan-dot">✓</span>
                                                        <span><strong>İhtiyaç analizi</strong><small>{dossier.history.length > 0 ? 'Tamamlandı · kayıtlı' : 'İlk ziyarette yapılır'}</small></span>
                                                    </div>
                                                    <div className={`tfv2-plan-step${dossier.rights > 0 ? ' is-current' : ''}`}>
                                                        <span className="tfv2-plan-dot">2</span>
                                                        <span><strong>Uygulama serisi</strong><small>{dossier.rights > 0 ? `${dossier.rights} hak kullanılabilir` : 'Aktif paket yok'}</small></span>
                                                    </div>
                                                    <div className={`tfv2-plan-step${dossier.rights === 0 && dossier.history.length > 0 ? ' is-current' : ''}`}>
                                                        <span className="tfv2-plan-dot">3</span>
                                                        <span><strong>Sonuç ve devam planı</strong><small>Son seanstan sonra</small></span>
                                                    </div>
                                                </div>
                                            </section>
                                            <section className="tfv2-section">
                                                <div className="tfv2-section-head"><h3>Sabit not</h3><small>Personel görünümü</small></div>
                                                <div className={`tfv2-note ${dossier.risks.length > 0 ? 'is-alert' : 'is-safe'}`}>
                                                    <div className="tfv2-note-head">
                                                        <TfIcon name={dossier.risks.length > 0 ? 'alert' : 'shield'} className="tfv2-icon-sm" />
                                                        <strong>{dossier.risks.length > 0 ? 'Kontrol gerekli' : 'Bilinen kısıt yok'}</strong>
                                                    </div>
                                                    <p>{dossier.risks.length > 0
                                                        ? `${dossier.risks.map((r) => r.label).join(', ')}. İşlem öncesi müşteri kaydıyla birlikte doğrulayın.`
                                                        : selected.notes || 'Kayıtlı özel not bulunmuyor.'}</p>
                                                </div>
                                            </section>
                                        </aside>
                                    </div>
                                )}

                                {tab === 'visits' && (
                                    <section className="tfv2-section">
                                        <div className="tfv2-section-head"><h3>Ziyaret ve işlem geçmişi</h3><small>En yeniden eskiye</small></div>
                                        <Timeline events={dossier.events} />
                                    </section>
                                )}

                                {tab === 'packages' && (
                                    <div className="tfv2-summary-layout">
                                        <section className="tfv2-section">
                                            <div className="tfv2-section-head">
                                                <h3>Paket ve seans hakları</h3>
                                                <small>{dossier.pkgs.length} paket</small>
                                            </div>
                                            <PackageRows packages={dossier.pkgs} balance={dossier.bal} />
                                        </section>
                                        <aside>
                                            <div className="tfv2-note">
                                                <div className="tfv2-note-head">
                                                    <TfIcon name="credit" className="tfv2-icon-sm" />
                                                    <strong>{dossier.bal > 0 ? `${fmtTL(dossier.bal)} bakiye` : 'Borç yok'}</strong>
                                                </div>
                                                <p>Tahsilat, kasa ekranında yöntem seçilerek tamamlanır.</p>
                                                {cashOn && (
                                                    <button className="tfv2-button is-small is-wide" style={{ marginTop: 12 }}
                                                        onClick={() => navigate('/kasa')}>Kasayı aç</button>
                                                )}
                                            </div>
                                            <div className="tfv2-note">
                                                <div className="tfv2-note-head"><TfIcon name="shield" className="tfv2-icon-sm" /><strong>Hak hareketleri korunur</strong></div>
                                                <p>Seans hakkı düzeltmeleri silinmez; gerekçe ve personel kaydıyla işlenir.</p>
                                            </div>
                                        </aside>
                                    </div>
                                )}

                                {tab === 'messages' && (
                                    <section className="tfv2-section">
                                        <div className="tfv2-section-head">
                                            <h3>İletişim geçmişi</h3>
                                            <button className="tfv2-button is-small" onClick={() => setDialog('whatsapp')}>Yeni mesaj</button>
                                        </div>
                                        {waRows === null ? (
                                            <p style={{ color: 'var(--tfv2-muted)', fontSize: 12 }}>Yükleniyor…</p>
                                        ) : waRows.length === 0 ? (
                                            <p style={{ color: 'var(--tfv2-muted)', fontSize: 12 }}>Bu müşteriye henüz mesaj gönderilmedi.</p>
                                        ) : (
                                            <div className="tfv2-detail-list">
                                                {waRows.map((m) => (
                                                    <div key={m.id} className="tfv2-detail-row">
                                                        <small>{fmtShort(m.created_at.slice(0, 10))} · {m.created_at.slice(11, 16)}</small>
                                                        <div><strong>{WA_KIND_TR[m.kind] || m.kind}</strong><span>WhatsApp</span></div>
                                                        <span className={`tfv2-state tfv2-tone-${m.status === 'sent' ? 'green' : m.status === 'queued' ? 'blue' : 'amber'}`}>
                                                            {WA_STATUS_TR[m.status] || m.status}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </section>
                                )}

                                {tab === 'forms' && (
                                    <section className="tfv2-section">
                                        <div className="tfv2-section-head">
                                            <h3>Formlar, onamlar ve izinler</h3>
                                            <small>Aydınlatma ve açık rıza ayrı tutulur</small>
                                        </div>
                                        <div className="tfv2-detail-list">
                                            <FormRow
                                                label="KVKK açık rızası"
                                                when={typeof selected.customFields?.kvkk_onay === 'string' ? String(selected.customFields.kvkk_onay).slice(0, 10) : undefined}
                                                state={selected.customFields?.kvkk_onay ? 'Alındı' : 'Kayıt yok'}
                                                tone={selected.customFields?.kvkk_onay ? 'green' : 'amber'}
                                                note="Booking sayfasından randevu alındıysa zaman damgasıyla kaydedilir"
                                            />
                                            {riskFlags.map((f) => (
                                                <FormRow key={f.key} label={f.label}
                                                    state={selected.customFields?.[f.key] ? 'Bildirildi' : 'Bildirim yok'}
                                                    tone={selected.customFields?.[f.key] ? 'amber' : 'green'}
                                                    note="Müşteri kaydındaki risk bayrağı" />
                                            ))}
                                            <FormRow label="WhatsApp iletişimi"
                                                state={normalizePhone(selected.phone) ? 'Uygun numara' : 'Numara yazılamıyor'}
                                                tone={normalizePhone(selected.phone) ? 'green' : 'amber'}
                                                note="Gönderim opt-out ve kota kapısından geçer" />
                                        </div>
                                    </section>
                                )}
                            </div>
                        </>
                    )}
                </article>

                {/* ── Odak rayı ── */}
                <aside className="tfv2-focus-rail" aria-label="Şimdi yapılacaklar">
                    <div className="tfv2-focus-top">
                        <p className="tfv2-focus-label">Şimdi yapılacak</p>
                        <h2>{dossier?.focus.title ?? 'Bir müşteri seçin.'}</h2>
                        <p>{dossier?.focus.reason ?? 'Soldaki listeden seçim yaptığınızda sıradaki adım burada görünür.'}</p>
                        <button className="tfv2-focus-cta" disabled={!dossier}
                            onClick={() => dossier && runAction(dossier.focus.action)}>
                            <span>{dossier?.focus.button ?? 'Müşteri seç'}</span>
                            <TfIcon name="arrow" />
                        </button>
                    </div>

                    <section className="tfv2-rail-section">
                        <div className="tfv2-rail-section-head">
                            <h3>Öncelikler</h3>
                            <span>{dossier?.priorities.length ?? 0} kayıt</span>
                        </div>
                        <div>
                            {(dossier?.priorities ?? []).map((p) => (
                                <div key={p.title} className="tfv2-priority">
                                    <span className={`tfv2-priority-icon tfv2-tone-${p.tone}`}><TfIcon name={p.icon} className="tfv2-icon-sm" /></span>
                                    <span className="tfv2-priority-copy"><strong>{p.title}</strong><small>{p.subtitle}</small></span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="tfv2-rail-section">
                        <div className="tfv2-rail-section-head"><h3>Yaklaşan seans</h3><span>Hazırlık görünümü</span></div>
                        <div className="tfv2-appointment-rail">
                            <div className="tfv2-appointment-time">
                                <strong>{dossier?.next?.startTime ?? '—'}</strong>
                                <span>{dossier?.next
                                    ? `${fmtShort(dossier.next.date).toLocaleUpperCase('tr')} · ${DAYS_TR[new Date(dossier.next.date).getDay()]}`
                                    : 'PLANLANMADI'}</span>
                            </div>
                            <strong>{dossier?.next?.service ?? 'Yaklaşan randevu yok'}</strong>
                            <small>{dossier?.next
                                ? [dossier.next.staffId ? staffName.get(dossier.next.staffId) : null,
                                   `${dossier.next.startTime}–${dossier.next.endTime}`].filter(Boolean).join(' · ')
                                : 'Geçmiş hizmetten yeniden oluşturulabilir'}</small>
                        </div>
                    </section>

                    <div className="tfv2-rail-footer">
                        {cashOn && (
                            <button className="tfv2-button" disabled={!selected} onClick={() => navigate('/kasa')}>
                                <TfIcon name="credit" className="tfv2-icon-sm" />Tahsilat
                            </button>
                        )}
                        <button className="tfv2-button" disabled={!selected} onClick={() => setDialog('whatsapp')}>
                            <TfIcon name="message" className="tfv2-icon-sm" />Mesaj
                        </button>
                    </div>

                    <div className="tfv2-privacy-note">
                        <TfIcon name="shield" className="tfv2-icon-sm" />
                        <span>Hassas bilgiler ortak ekranda maskelenir. İletişim ve fiyat değişikliği insan onayı olmadan yapılmaz.</span>
                    </div>
                </aside>
            </section>

            {dialog === 'new-customer' && (
                <NewCustomerDialog
                    onClose={() => setDialog(null)}
                    onSave={async (form) => {
                        const created = await addCustomer(form);
                        if (created) { setSelId(created.id); setDialog(null); }
                    }}
                />
            )}

            {dialog === 'whatsapp' && selected && (
                <WhatsAppDialog
                    customer={selected}
                    businessName={settings.businessName || 'salonumuz'}
                    next={dossier?.next}
                    balance={dossier?.bal ?? 0}
                    onClose={() => setDialog(null)}
                />
            )}

            {sessionFor !== undefined && (
                <BeautySessionModal
                    customer={sessionFor}
                    onClose={() => setSessionFor(undefined)}
                    onCreated={() => { setSessionFor(undefined); void refreshPackages(); }}
                />
            )}
        </div>
    );
}

const WA_KIND_TR: Record<string, string> = {
    reminder_24h: 'Randevu hatırlatması (24 sa)',
    reminder_2h: 'Randevu hatırlatması (2 sa)',
    recall: 'Kontrol daveti',
    winback: 'Geri kazanım mesajı',
    renewal: 'Paket yenileme teklifi',
    review: 'Değerlendirme daveti',
    confirmation: 'Randevu teyidi',
};
const WA_STATUS_TR: Record<string, string> = {
    sent: 'İletildi', failed: 'Başarısız', skipped: 'Atlandı', queued: 'Kuyrukta',
};

function PackageRows({ packages, balance }: { packages: { id: string; title: string; sessionCount: number; sessionsDone: number; totalAmount: number }[]; balance: number }) {
    if (packages.length === 0) {
        return (
            <div className="tfv2-note">
                <div className="tfv2-note-head"><TfIcon name="box" className="tfv2-icon-sm" /><strong>Aktif paket bulunmuyor</strong></div>
                <p>Geçmiş hizmete uygun paketi yalnızca ihtiyaç varsa önerebilirsiniz.</p>
            </div>
        );
    }
    return (
        <>
            {packages.map((p) => {
                const left = Math.max(0, p.sessionCount - p.sessionsDone);
                const percent = Math.round((p.sessionsDone / Math.max(1, p.sessionCount)) * 100);
                return (
                    <div key={p.id} className="tfv2-package-line">
                        <div className="tfv2-package-top">
                            <div>
                                <strong>{p.title}</strong>
                                <small>{left > 0 ? `${left} kullanılabilir` : 'Hak kalmadı'}</small>
                            </div>
                            <span className="tfv2-package-count">{p.sessionsDone}/{p.sessionCount}</span>
                        </div>
                        <div className="tfv2-progress" aria-label={`${p.sessionsDone} / ${p.sessionCount} kullanıldı`}>
                            <span style={{ width: `${percent}%` }} />
                        </div>
                        <div className="tfv2-package-foot">
                            <span>Kullanılan {p.sessionsDone}</span>
                            <span>{balance > 0 ? `${fmtTL(balance)} bakiye` : 'Tamamı ödendi'}</span>
                        </div>
                    </div>
                );
            })}
        </>
    );
}

function Timeline({ events }: { events: TimelineEvent[] }) {
    if (events.length === 0) {
        return <p style={{ color: 'var(--tfv2-muted)', fontSize: 12, margin: 0 }}>Henüz kayıtlı hareket yok.</p>;
    }
    return (
        <div className="tfv2-timeline">
            {events.map((e, i) => (
                <div key={`${e.when}-${e.title}-${i}`} className="tfv2-event">
                    <time>{e.when}</time>
                    <span className="tfv2-event-dot" style={{ background: i === 0 ? 'var(--tfv2-orange)' : 'var(--tfv2-faint)' }} />
                    <span className="tfv2-event-copy"><strong>{e.title}</strong><small>{e.detail}</small></span>
                    <span className="tfv2-event-amount">{e.amount}</span>
                </div>
            ))}
        </div>
    );
}

function FormRow({ label, when, state, tone, note }: { label: string; when?: string; state: string; tone: string; note: string }) {
    return (
        <div className="tfv2-detail-row">
            <small>{when ? fmtShort(when) : '—'}</small>
            <div><strong>{label}</strong><span>{note}</span></div>
            <span className={`tfv2-state tfv2-tone-${tone}`}>{state}</span>
        </div>
    );
}

function NewCustomerDialog({ onClose, onSave }: { onClose: () => void; onSave: (f: { name: string; phone: string; notes: string }) => Promise<void> }) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const ok = name.trim().length > 1 && phone.trim().length > 5;

    return (
        <Dialog kicker="Hızlı ve kontrollü işlem" title="Yeni müşteri"
            subtitle="Önce olası tekrar kayıt kontrol edilir." onClose={onClose}
            action={{
                label: busy ? 'Kaydediliyor…' : 'Müşteriyi kaydet',
                disabled: !ok || busy,
                onClick: async () => { setBusy(true); await onSave({ name: name.trim(), phone: phone.trim(), notes: notes.trim() }); setBusy(false); },
            }}>
            <label className="tfv2-field"><span>Ad soyad</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Müşteri adı" /></label>
            <label className="tfv2-field"><span>Telefon</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="05xx xxx xx xx" /></label>
            <label className="tfv2-field is-full"><span>Kısa not</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tercihi, yönlendiren kişi veya önemli bilgi" /></label>
            <div className="tfv2-dialog-check">
                <TfIcon name="shield" />
                <div><strong>Tekrar kayıt kontrolü açık</strong>
                    <small>Aynı telefonla eşleşen müşteri varsa kayıt reddedilir ve mevcut kart açılır.</small></div>
            </div>
        </Dialog>
    );
}

function WhatsAppDialog({ customer, businessName, next, balance, onClose }: {
    customer: Customer; businessName: string; next?: Reservation; balance: number; onClose: () => void;
}) {
    const templates = useMemo(() => {
        const out: { label: string; text: string }[] = [];
        if (next) out.push({
            label: 'Randevu teyidi',
            text: `Merhaba ${customer.name}, ${businessName}. ${fmtShort(next.date)} ${next.startTime} randevunuzu hatırlatmak istedik. Görüşmek üzere!`,
        });
        if (balance > 0) out.push({
            label: 'Bakiye hatırlatma',
            text: `Merhaba ${customer.name}, ${businessName}. ${fmtTL(balance)} tutarında bakiyeniz bulunuyor. Uygun olduğunuzda görüşebilir miyiz?`,
        });
        out.push({
            label: 'Tekrar randevu',
            text: `Merhaba ${customer.name}, ${businessName}. Bakım planınız için size uygun saatleri paylaşabiliriz.`,
        });
        return out;
    }, [customer, businessName, next, balance]);

    const [idx, setIdx] = useState(0);
    const [text, setText] = useState(templates[0]?.text ?? '');
    const link = waLink(customer.phone, text);

    return (
        <Dialog kicker="Hızlı ve kontrollü işlem" title="WhatsApp mesajı"
            subtitle={`${customer.name} · gönderim son onayı sizde`} onClose={onClose}
            action={{
                label: 'WhatsApp’ta aç',
                disabled: !link,
                onClick: () => {
                    if (!link) { toast.error('Bu numaraya WhatsApp yazılamıyor'); return; }
                    window.open(link, '_blank', 'noopener');
                    onClose();
                },
            }}>
            <label className="tfv2-field"><span>Şablon</span>
                <select value={idx} onChange={(e) => { const i = Number(e.target.value); setIdx(i); setText(templates[i].text); }}>
                    {templates.map((t, i) => <option key={t.label} value={i}>{t.label}</option>)}
                </select></label>
            <label className="tfv2-field"><span>Numara</span>
                <input value={customer.phone} readOnly /></label>
            <label className="tfv2-field is-full"><span>Mesaj</span>
                <textarea value={text} onChange={(e) => setText(e.target.value)} /></label>
            <div className="tfv2-dialog-check">
                <TfIcon name="shield" />
                <div><strong>Mesaj otomatik gönderilmez</strong>
                    <small>WhatsApp uygulaması hazır metinle açılır; gönderme kararı sizindir.</small></div>
            </div>
        </Dialog>
    );
}

function Dialog({ kicker, title, subtitle, children, onClose, action }: {
    kicker: string; title: string; subtitle: string; children: React.ReactNode;
    onClose: () => void; action: { label: string; disabled?: boolean; onClick: () => void | Promise<void> };
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="tfv2-overlay" role="dialog" aria-modal="true" aria-label={title}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="tfv2-dialog">
                <div className="tfv2-dialog-head">
                    <div>
                        <p className="tfv2-eyebrow" style={{ marginBottom: 4 }}>{kicker}</p>
                        <h2>{title}</h2>
                        <p>{subtitle}</p>
                    </div>
                    <button className="tfv2-icon-button" onClick={onClose} aria-label="Pencereyi kapat"><TfIcon name="x" /></button>
                </div>
                <div className="tfv2-dialog-body">{children}</div>
                <div className="tfv2-dialog-actions">
                    <button className="tfv2-button" onClick={onClose}>Vazgeç</button>
                    <button className="tfv2-button is-primary" disabled={action.disabled} onClick={() => void action.onClick()}>
                        {action.label}
                    </button>
                </div>
            </div>
        </div>
    );
}
