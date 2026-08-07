import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { useCustomers } from '@/hooks/useCustomers';
import { useStaff } from '@/hooks/useStaff';
import { useResources } from '@/hooks/useResources';
import { useOrgPackages } from '@/hooks/useOrgPackages';
import { useCashEnabled } from '@/hooks/useModules';
import { useTheme } from '@/contexts/ThemeContext';
import { advancePatch, phaseOf, minsSince, type SessionPhase } from '@/lib/sessionPhase';
import { evaluateEligibility } from '@/lib/serviceEligibility';
import { profileForSector } from '@/lib/sectorProfiles';
import { waLink } from '@/lib/phone';
import { reservationPrice } from '@/utils/reservationServices';
import { BeautySessionModal } from '@/components/beauty/BeautySessionModal';
import { EditReservationModal } from '@/components/reservations/EditReservationModal';
import { TfIcon, TfIconSprite } from '@/components/beauty/TfIcons';
import { cn } from '@/utils/cn';
import type { Customer, Reservation } from '@/types';
import './beautyReservations.css';

// ── Güzellik · Operasyon merkezi (Premium Final) ─────────────────────────────
// Tasarımın birebir uygulaması: "Timeflow Beauty Reservations Premium Final.html".
// Hafta şeridi, dört nabız sayacı, gruplanmış akış listesi ve sağdaki kontrol
// fişi — hepsi yerinde.
//
// Mockup'ın durum zinciri (Geldi → İşleme al → Kasaya gönder → Tahsilata geç)
// uydurma değil: projede zaten lib/sessionPhase var ve birebir aynı akışı
// modelliyor (wait → arrived → active → done → completed). Kontrol fişindeki
// birincil düğme o kaynağı kullanıyor, ikinci bir durum makinesi yazılmadı.
//
// Sektör eşlemesi registry'de (calendarSectorProfiles → reservations:
// 'guzellik'); bileşen içinde sector karşılaştırması yok.

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const DAY_LONG = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayISO = () => iso(new Date());
const initialsOf = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const fmtTL = (n: number) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const toMin = (t?: string) => { const [h, m] = String(t || '').split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN; };
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Pazartesi başlangıçlı haftanın ilk günü. */
function weekStart(dateISO: string): Date {
    const d = new Date(`${dateISO}T00:00:00`);
    const shift = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - shift);
    return d;
}

function maskName(name: string, on: boolean): string {
    if (!on) return name;
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) return name;
    return `${parts[0]} ${parts.slice(1).map((p) => `${p[0]}.`).join(' ')}`;
}
function maskPhone(phone: string, on: boolean): string {
    if (!on) return phone;
    const d = (phone || '').replace(/\D/g, '');
    return d.length < 6 ? phone : `${d.slice(0, 4)} ••• •• ${d.slice(-2)}`;
}

type SmartFilter = 'all' | 'attention' | 'waiting' | 'service' | 'cash';
type Density = 'comfortable' | 'compact';
type PrepTone = 'safe' | 'warning' | 'danger';
type GroupKey = 'attention' | 'salon' | 'next' | 'later' | 'done';
type DialogKind = 'whatsapp' | null;

const GROUPS: { key: GroupKey; label: string }[] = [
    { key: 'attention', label: 'Dikkat gerekiyor' },
    { key: 'salon', label: 'Şu an salonda' },
    { key: 'next', label: 'Sıradaki 90 dakika' },
    { key: 'later', label: 'Günün devamı' },
    { key: 'done', label: 'Tamamlananlar' },
];

/**
 * Faz + durum → rozet metni ve rengi (mockup'taki statusMap'in karşılığı).
 *
 * "Gelmedi" bir status DEĞİL: veri modelinde böyle bir değer yok ve uydurulmadı.
 * Kod tabanının kendi tanımı kullanılıyor — saati geçmiş ama müşteri hiç
 * gelmemiş seans (GuzellikDashboard ile aynı türetme).
 */
function stateOf(r: Reservation, phase: SessionPhase, noShow: boolean): { label: string; tone: string } {
    if (r.status === 'cancelled') return { label: 'İptal', tone: 'var(--tfr-red)' };
    if (noShow) return { label: 'Gelmedi', tone: 'var(--tfr-red)' };
    if (phase === 'completed') return { label: 'Tamamlandı', tone: 'var(--tfr-green)' };
    if (phase === 'done') return { label: 'Kasada', tone: 'var(--tfr-green)' };
    if (phase === 'active') return { label: 'İşlemde', tone: 'var(--tfr-orange)' };
    if (phase === 'arrived') return { label: 'Bekliyor', tone: 'var(--tfr-teal)' };
    if (r.status === 'pending') return { label: 'Onay bekliyor', tone: 'var(--tfr-amber)' };
    return { label: 'Onaylı', tone: 'var(--tfr-blue)' };
}

interface Prepared {
    r: Reservation;
    phase: SessionPhase;
    state: { label: string; tone: string };
    customer?: Customer;
    initials: string;
    tier: string;
    durationMin: number;
    staffName?: string;
    resourceName?: string;
    packageText: string;
    prep: { tone: PrepTone; title: string; sub: string };
    group: GroupKey;
    live: string;
    action: { label: string; kind: 'arrive' | 'service' | 'cash' | 'collect' | 'none' };
    checks: { icon: string; title: string; detail: string; tone: PrepTone }[];
    sourceText: string;
}

const SOURCE_TR: Record<string, string> = {
    manual: 'Manuel', booking: 'Online booking', whatsapp: 'WhatsApp',
    walkin: 'Randevusuz', instagram: 'Instagram',
};

export function BeautyReservationsPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { dark } = useTheme();
    const { reservations, settings, updateReservation } = useReservations();
    const { allCustomers } = useCustomers();
    const { staff } = useStaff();
    const { resources } = useResources();
    const { packages, refresh: refreshPackages } = useOrgPackages();
    const cashOn = useCashEnabled();

    // Derin bağlantı parametreleri ilk değer olarak okunur (/reservations?date=…&open=…).
    // Efektte state'e yazmak fazladan bir render turu ve cascading render demekti.
    const [date, setDate] = useState(() => searchParams.get('date') || todayISO());
    const [selId, setSelId] = useState<string | null>(() => searchParams.get('open'));
    const [query, setQuery] = useState('');
    const [smart, setSmart] = useState<SmartFilter>('all');
    const [density, setDensity] = useState<Density>('comfortable');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [fStatus, setFStatus] = useState('all');
    const [fStaff, setFStaff] = useState('all');
    const [fResource, setFResource] = useState('all');
    const [fPrep, setFPrep] = useState('all');
    const [privacy, setPrivacy] = useState(false);
    const [dialog, setDialog] = useState<DialogKind>(null);
    const [editing, setEditing] = useState<Reservation | null>(null);
    const [creating, setCreating] = useState(false);
    const [busy, setBusy] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);

    // Canlı sayaçlar (bekliyor/işlemde) dakikada bir tazelensin.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = window.setInterval(() => setNow(new Date()), 60_000);
        return () => window.clearInterval(t);
    }, []);

    // Parametreler okundu; adres çubuğunda kalmasınlar.
    useEffect(() => {
        if (!searchParams.get('date') && !searchParams.get('open')) return;
        const next = new URLSearchParams(searchParams);
        next.delete('date'); next.delete('open');
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey)) return;
            const k = e.key.toLowerCase();
            if (k === 'k') { e.preventDefault(); searchRef.current?.focus(); }
            if (k === 'n') { e.preventDefault(); setCreating(true); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    // ── Sözlükler ───────────────────────────────────────────────────────────
    const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);
    const resourceById = useMemo(() => new Map(resources.map((r) => [r.id, r.name])), [resources]);
    const customerById = useMemo(() => new Map(allCustomers.map((c) => [c.id, c])), [allCustomers]);
    const riskFlags = useMemo(() => profileForSector(settings.sector).riskFlags || [], [settings.sector]);
    const rightsByCustomer = useMemo(() => {
        const m = new Map<string, number>();
        for (const p of packages) {
            if (p.status === 'completed' || p.status === 'cancelled') continue;
            m.set(p.customerId, (m.get(p.customerId) || 0) + Math.max(0, p.sessionCount - p.sessionsDone));
        }
        return m;
    }, [packages]);

    // ── Hafta şeridi ────────────────────────────────────────────────────────
    const week = useMemo(() => {
        const start = weekStart(date);
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            const key = iso(d);
            return {
                key,
                short: DAY_SHORT[i],
                day: String(d.getDate()).padStart(2, '0'),
                count: reservations.filter((r) => r.date === key && r.status !== 'cancelled').length,
            };
        });
    }, [date, reservations]);

    const weekLabel = useMemo(() => {
        const a = new Date(week[0]?.key || date);
        const b = new Date(week[6]?.key || date);
        const sameMonth = a.getMonth() === b.getMonth();
        return sameMonth
            ? `${a.getDate()}–${b.getDate()} ${MONTHS_TR[b.getMonth()]}`
            : `${a.getDate()} ${MONTHS_TR[a.getMonth()]} – ${b.getDate()} ${MONTHS_TR[b.getMonth()]}`;
    }, [week, date]);
    const weekTotal = week.reduce((s, d) => s + d.count, 0);
    const busiest = Math.max(...week.map((d) => d.count), 0);

    const shiftWeek = (dir: -1 | 1) => {
        const d = new Date(`${date}T00:00:00`);
        d.setDate(d.getDate() + dir * 7);
        setDate(iso(d));
    };

    // ── Günün hazırlanmış satırları ─────────────────────────────────────────
    const dayRows = useMemo<Prepared[]>(() => {
        const list = reservations
            .filter((r) => r.date === date)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
        const nowMin = date === todayISO() ? now.getHours() * 60 + now.getMinutes() : -1;

        return list.map((r) => {
            const phase = phaseOf(r);
            // Saati geçmiş ama müşteri hiç gelmemiş — GuzellikDashboard ile aynı türetme.
            const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const noShow = date === todayISO() && phase === 'wait' && r.endTime < nowTime;
            const customer = r.customerId ? customerById.get(r.customerId) : undefined;
            const start = toMin(r.startTime);
            const end = toMin(r.endTime);
            const durationMin = Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0;
            const rights = r.customerId ? rightsByCustomer.get(r.customerId) ?? 0 : 0;
            const fromPackage = Boolean(r.customFields?.paket_plan_id);
            const seansLabel = typeof r.customFields?.paket_seans === 'string' ? r.customFields.paket_seans : null;

            // Uygunluk: müşteri risk bayrağı ile hizmet etiketi çakışıyor mu
            const verdict = customer
                ? evaluateEligibility(customer, { name: r.service }, settings.sector)
                : { blocked: false, message: '' };
            const risks = customer ? riskFlags.filter((f) => Boolean(customer.customFields?.[f.key])) : [];

            let prep: Prepared['prep'] = { tone: 'safe', title: 'Hazır', sub: 'Kontroller tamam' };
            if (verdict.blocked) prep = { tone: 'danger', title: 'İşlem engelli', sub: verdict.message || 'Uygunluk kısıtı' };
            else if (!r.staffId) prep = { tone: 'warning', title: 'Uzman atanmadı', sub: 'Atama bekliyor' };
            else if (!r.resourceId && resources.length > 0) prep = { tone: 'warning', title: 'Kabin atanmadı', sub: 'Kaynak bekliyor' };
            else if (risks.length > 0) prep = { tone: 'warning', title: 'Kontrol gerekli', sub: risks.map((f) => f.label).join(', ') };
            else if (r.status === 'pending') prep = { tone: 'warning', title: 'Teyit bekliyor', sub: 'Müşteri onayı yok' };
            else if (fromPackage && rights === 0) prep = { tone: 'warning', title: 'Hak kalmadı', sub: 'Paket tükendi' };

            // Grup
            let group: GroupKey = 'later';
            if (phase === 'completed' || r.status === 'cancelled') group = 'done';
            else if (noShow) group = 'attention';
            else if (phase === 'arrived' || phase === 'active' || phase === 'done') group = 'salon';
            else if (prep.tone !== 'safe') group = 'attention';
            else if (nowMin >= 0 && Number.isFinite(start) && start >= nowMin && start - nowMin <= 90) group = 'next';

            // Canlı etiket
            let live = `${r.startTime}`;
            if (phase === 'arrived' && r.customerArrivedAt) live = `${minsSince(r.customerArrivedAt, now)} DK BEKLİYOR`;
            else if (phase === 'active' && r.arrivedAt) live = `İŞLEM SÜRÜYOR · ${minsSince(r.arrivedAt, now)} DK`;
            else if (phase === 'done') live = 'KASAYA HAZIR';
            else if (phase === 'completed') live = 'TAMAMLANDI';
            else if (r.status === 'cancelled') live = 'İPTAL';
            else if (noShow) live = 'GELMEDİ';
            else if (r.status === 'pending') live = 'ONAY BEKLİYOR';
            else if (nowMin >= 0 && Number.isFinite(start)) {
                const diff = start - nowMin;
                live = diff > 0 ? `${diff} DK SONRA` : `${-diff} DK GECİKTİ`;
            } else if (date > todayISO()) live = 'GÜNÜN DEVAMI';

            // Birincil aksiyon — sessionPhase zincirinin karşılığı
            let action: Prepared['action'] = { label: 'Açık işlem yok', kind: 'none' };
            if (r.status !== 'cancelled') {
                if (phase === 'wait') action = { label: 'Geldi olarak işaretle', kind: 'arrive' };
                else if (phase === 'arrived') action = { label: 'İşleme al', kind: 'service' };
                else if (phase === 'active') action = { label: 'İşlemi bitir', kind: 'cash' };
                else if (phase === 'done') action = { label: 'Tahsilata geç', kind: 'collect' };
            }

            const packageText = fromPackage
                ? `Paket${seansLabel ? ` · ${seansLabel}` : ''}${rights > 0 ? ` · ${rights} hak` : ''}`
                : fmtTL(reservationPrice(r, settings.services || []));

            const checks: Prepared['checks'] = [
                {
                    icon: 'message', title: 'Hatırlatma',
                    detail: r.reminder24hSent || r.reminder2hSent ? 'Gönderildi' : 'Planlandı',
                    tone: 'safe',
                },
                {
                    icon: 'package', title: fromPackage ? 'Paket hakkı' : 'Ödeme',
                    detail: fromPackage ? (rights > 0 ? `${rights} kullanılabilir` : 'Hak kalmadı') : (r.isPaid ? 'Tahsil edildi' : 'Seans sonrası'),
                    tone: fromPackage && rights === 0 ? 'warning' : 'safe',
                },
                {
                    icon: verdict.blocked ? 'alert' : 'shield', title: 'İşleme uygunluk',
                    detail: verdict.blocked ? (verdict.message || 'Kısıt var') : risks.length > 0 ? risks.map((f) => f.label).join(', ') : 'Bilinen kısıt yok',
                    tone: verdict.blocked ? 'danger' : risks.length > 0 ? 'warning' : 'safe',
                },
                {
                    icon: 'door', title: 'Uzman ve kabin',
                    detail: [r.staffId ? staffById.get(r.staffId) : 'Uzman yok',
                             r.resourceId ? resourceById.get(r.resourceId) : (resources.length > 0 ? 'Kabin yok' : null)]
                        .filter(Boolean).join(' · '),
                    tone: !r.staffId || (!r.resourceId && resources.length > 0) ? 'warning' : 'safe',
                },
            ];

            const totalRes = customer?.totalReservations ?? 0;
            const tier = rights > 0 ? 'Paket'
                : totalRes >= 5 ? 'Düzenli'
                : totalRes <= 1 ? 'Yeni' : 'Müşteri';

            return {
                r, phase, state: stateOf(r, phase, noShow), customer,
                initials: initialsOf(r.customerName), tier, durationMin,
                staffName: r.staffId ? staffById.get(r.staffId) : undefined,
                resourceName: r.resourceId ? resourceById.get(r.resourceId) : undefined,
                packageText, prep, group, live, action, checks,
                sourceText: SOURCE_TR[r.source || 'manual'] || 'Manuel',
            };
        });
    }, [reservations, date, now, customerById, rightsByCustomer, staffById, resourceById, resources.length, riskFlags, settings.sector, settings.services]);

    // ── Nabız sayaçları ─────────────────────────────────────────────────────
    const metrics = useMemo(() => ({
        attention: dayRows.filter((p) => p.group === 'attention').length,
        waiting: dayRows.filter((p) => p.phase === 'arrived').length,
        service: dayRows.filter((p) => p.phase === 'active').length,
        cash: dayRows.filter((p) => p.phase === 'done').length,
    }), [dayRows]);

    // ── Filtre ──────────────────────────────────────────────────────────────
    const rows = useMemo(() => {
        const q = query.trim().toLocaleLowerCase('tr');
        return dayRows.filter((p) => {
            if (smart === 'attention' && p.group !== 'attention') return false;
            if (smart === 'waiting' && p.phase !== 'arrived') return false;
            if (smart === 'service' && p.phase !== 'active') return false;
            if (smart === 'cash' && p.phase !== 'done') return false;
            if (fStatus !== 'all' && p.state.label !== fStatus) return false;
            if (fStaff !== 'all' && p.r.staffId !== fStaff) return false;
            if (fResource !== 'all' && p.r.resourceId !== fResource) return false;
            if (fPrep !== 'all' && p.prep.tone !== fPrep) return false;
            if (!q) return true;
            return `${p.r.customerName} ${p.r.customerPhone} ${p.r.service}`.toLocaleLowerCase('tr').includes(q);
        });
    }, [dayRows, query, smart, fStatus, fStaff, fResource, fPrep]);

    // Seçim TÜRETİLİR: id listede yoksa ilk satıra düşer. Bunu bir efektle
    // state'e yazmak aynı sonucu fazladan render turuyla üretiyordu.
    const selected = rows.find((p) => p.r.id === selId) ?? rows[0] ?? null;

    // ── Boşluk fırsatı: günün ÇALIŞMA SAATİ İÇİNDEKİ ilk anlamlı aralığı ────
    //
    // Ham aralık yeterli değil: 02:11'de biten bir kaydın ardından 09:00'a
    // kadar "394 dk boşluk" çıkıyordu. Salon o saatte kapalı olduğu için bu
    // doldurulabilir bir boşluk değil, gürültü. Aralıklar işletmenin o güne
    // ait açılış–kapanış penceresine kırpılıyor.
    const opportunity = useMemo(() => {
        const dow = new Date(`${date}T00:00:00`).getDay();
        const wh = (settings.workingHours || []).find((h) => h.day === dow);
        if (!wh || wh.isOff) return null;
        const openMin = toMin(wh.start);
        const closeMin = toMin(wh.end);
        if (!Number.isFinite(openMin) || !Number.isFinite(closeMin) || closeMin <= openMin) return null;

        const busyList = dayRows
            .filter((p) => p.r.status !== 'cancelled')
            .map((p) => ({ s: toMin(p.r.startTime), e: toMin(p.r.endTime) }))
            .filter((b) => Number.isFinite(b.s) && Number.isFinite(b.e) && b.e > openMin && b.s < closeMin)
            .map((b) => ({ s: Math.max(b.s, openMin), e: Math.min(b.e, closeMin) }))
            .sort((a, b) => a.s - b.s);

        // Açılıştan ilk randevuya kadar olan boşluk da bir fırsattır.
        let cursor = openMin;
        for (const b of busyList) {
            if (b.s - cursor >= 30) return { at: fromMin(cursor), minutes: b.s - cursor };
            cursor = Math.max(cursor, b.e);
        }
        return closeMin - cursor >= 30 ? { at: fromMin(cursor), minutes: closeMin - cursor } : null;
    }, [dayRows, date, settings.workingHours]);

    // ── Aksiyonlar ──────────────────────────────────────────────────────────
    const runPrimary = async () => {
        if (!selected || busy) return;
        const { kind } = selected.action;
        if (kind === 'none') { toast('Bu rezervasyon için açık işlem yok'); return; }
        if (kind === 'collect') {
            if (cashOn) navigate('/kasa');
            else toast.error('Kasa modülü kapalı');
            return;
        }
        // Uygunluk engeli varsa işleme ALINMAZ — sessizce devam etmek, DB
        // guard'ının (073) zaten reddedeceği bir kaydı denemek olurdu.
        if (kind === 'service' && selected.prep.tone === 'danger') {
            toast.error(selected.prep.sub || 'Bu işlem uygunluk kısıtı nedeniyle başlatılamaz');
            return;
        }
        setBusy(true);
        const to = kind === 'arrive' ? 'arrived' : kind === 'service' ? 'active' : 'completed';
        const ok = await updateReservation(selected.r.id, advancePatch(to));
        setBusy(false);
        if (ok) {
            toast.success(`${selected.r.customerName} · durum güncellendi`);
            void refreshPackages();
        }
    };

    const clearFilters = () => {
        setQuery(''); setSmart('all'); setFStatus('all');
        setFStaff('all'); setFResource('all'); setFPrep('all');
    };

    const dayTitle = date === todayISO()
        ? 'Bugünün akışı'
        : `${DAY_LONG[(new Date(`${date}T00:00:00`).getDay() + 6) % 7]} akışı`;

    return (
        <div className={cn('tfr flex-1 min-h-0 overflow-y-auto', dark && 'dark')}>
            <TfIconSprite />

            <div className="tfr-page">
                {/* ── Sayfa başlığı ── */}
                <section className="tfr-page-head">
                    <div className="tfr-page-title">
                        <p className="tfr-eyebrow">Güzellik salonu · Operasyon merkezi</p>
                        <h1>Rezervasyonlar, tek kontrollü akışta.</h1>
                        <p>Kimi karşılayacağınızı, hangi hazırlığın eksik olduğunu ve sıradaki işlemi anında görün.</p>
                    </div>
                    <div className="tfr-page-actions">
                        <div className="tfr-connection">
                            <TfIcon name="lock" className="tfr-icon-sm" />
                            <span>Ortak ekran</span>
                            <button className="tfr-switch" aria-pressed={privacy} aria-label="Ortak ekran gizliliği"
                                onClick={() => setPrivacy((v) => !v)}><span /></button>
                        </div>
                        <button className="tfr-button is-quiet" onClick={() => navigate(`/calendar?date=${date}`)}>
                            <TfIcon name="calendar" /><span>Takvimi aç</span>
                        </button>
                        <button className="tfr-button is-primary" onClick={() => setCreating(true)}>
                            <TfIcon name="plus" /><span>Yeni randevu</span>
                        </button>
                    </div>
                </section>

                {/* ── Hafta şeridi ── */}
                <section className="tfr-week-band" aria-label="Hafta seçimi">
                    <div className="tfr-week-control">
                        <button className="tfr-mini-arrow" aria-label="Önceki hafta" onClick={() => shiftWeek(-1)}>
                            <TfIcon name="chevron-left" className="tfr-icon-sm" />
                        </button>
                        <div>
                            <strong>{weekLabel}</strong>
                            <small>{weekTotal} seans</small>
                        </div>
                        <button className="tfr-mini-arrow" aria-label="Sonraki hafta" onClick={() => shiftWeek(1)}>
                            <TfIcon name="chevron-right" className="tfr-icon-sm" />
                        </button>
                    </div>
                    {week.map((d) => (
                        <button key={d.key}
                            className={cn('tfr-week-day', d.key === date && 'is-selected',
                                d.key === todayISO() && 'is-today',
                                busiest > 0 && d.count === busiest && d.count > 0 && 'has-pressure')}
                            onClick={() => { setDate(d.key); setSmart('all'); }}>
                            <span>{d.short}</span>
                            <strong>{d.day}</strong>
                            <small>{d.count} seans</small>
                        </button>
                    ))}
                    <div className="tfr-week-opportunity">
                        <span className="tfr-opportunity-icon"><TfIcon name="sparkles" /></span>
                        <div>
                            <strong>{opportunity ? `${opportunity.at} · ${opportunity.minutes} dk boşluk` : 'Boşluk yok'}</strong>
                            <small>{opportunity ? 'Bu aralığa yeni seans yerleştirilebilir' : 'Günün programı sıkışık değil'}</small>
                        </div>
                        <button className="tfr-button is-small" disabled={!opportunity}
                            onClick={() => setCreating(true)}>Doldur</button>
                    </div>
                </section>

                <section className="tfr-workspace">
                    {/* ── Akış ── */}
                    <article className="tfr-agenda" aria-label="Rezervasyon akışı">
                        <div className="tfr-pulse">
                            {([
                                { key: 'attention' as const, n: metrics.attention, label: 'Dikkat gerekiyor', icon: 'alert', tone: 'amber' },
                                { key: 'waiting' as const, n: metrics.waiting, label: 'Salonda bekliyor', icon: 'clock', tone: 'teal' },
                                { key: 'service' as const, n: metrics.service, label: 'İşlem sürüyor', icon: 'sparkles', tone: 'orange' },
                                { key: 'cash' as const, n: metrics.cash, label: 'Kasaya hazır', icon: 'credit', tone: 'green' },
                            ]).map((m) => (
                                <button key={m.key} className="tfr-pulse-button" aria-pressed={smart === m.key}
                                    onClick={() => setSmart((v) => (v === m.key ? 'all' : m.key))}>
                                    <span className="tfr-pulse-icon" style={{ color: `var(--tfr-${m.tone})`, background: `var(--tfr-${m.tone}-soft)` }}>
                                        <TfIcon name={m.icon} />
                                    </span>
                                    <span className="tfr-pulse-copy"><strong>{m.n}</strong><small>{m.label}</small></span>
                                </button>
                            ))}
                        </div>

                        <div className="tfr-agenda-head">
                            <div className="tfr-agenda-title">
                                <h2>{dayTitle}</h2>
                                <span>{rows.length > 0
                                    ? `${rows.length} rezervasyon · ${rows[0].r.startTime}–${rows[rows.length - 1].r.endTime}`
                                    : 'Sonuç bulunamadı'}</span>
                            </div>
                            <div className="tfr-toolbar">
                                <label className="tfr-search">
                                    <span className="tfr-sr">Rezervasyon ara</span>
                                    <TfIcon name="search" />
                                    <input ref={searchRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Müşteri, telefon veya hizmet ara" />
                                    <span className="tfr-search-key">⌘K</span>
                                </label>
                                <button className="tfr-button is-small" aria-expanded={filtersOpen}
                                    onClick={() => setFiltersOpen((v) => !v)}>
                                    <TfIcon name="filter" className="tfr-icon-sm" />Filtrele
                                </button>
                                <div className="tfr-view-switch" aria-label="Görünüm yoğunluğu">
                                    <button aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}>Akış</button>
                                    <button aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}>Kompakt</button>
                                </div>
                            </div>
                        </div>

                        {filtersOpen && (
                            <div className="tfr-filter-panel">
                                <label className="tfr-filter-field"><span>Durum</span>
                                    <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                                        <option value="all">Tüm durumlar</option>
                                        {['Onay bekliyor', 'Onaylı', 'Bekliyor', 'İşlemde', 'Kasada', 'Tamamlandı', 'İptal'].map((s) => <option key={s}>{s}</option>)}
                                    </select></label>
                                <label className="tfr-filter-field"><span>Uzman</span>
                                    <select value={fStaff} onChange={(e) => setFStaff(e.target.value)}>
                                        <option value="all">Tüm uzmanlar</option>
                                        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select></label>
                                <label className="tfr-filter-field"><span>Kabin / cihaz</span>
                                    <select value={fResource} onChange={(e) => setFResource(e.target.value)}>
                                        <option value="all">Tüm kaynaklar</option>
                                        {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select></label>
                                <label className="tfr-filter-field"><span>Hazırlık</span>
                                    <select value={fPrep} onChange={(e) => setFPrep(e.target.value)}>
                                        <option value="all">Tümü</option>
                                        <option value="safe">Hazır</option>
                                        <option value="warning">Eksik</option>
                                        <option value="danger">Engelli</option>
                                    </select></label>
                                <button className="tfr-button is-small" onClick={clearFilters}>Temizle</button>
                            </div>
                        )}

                        <div className="tfr-column-head">
                            <span>Saat</span><span>Müşteri</span><span>Hizmet</span>
                            <span>Uzman / kabin</span><span>Hazırlık</span><span>Durum</span>
                        </div>

                        <div className="tfr-groups">
                            {rows.length === 0 ? (
                                <div className="tfr-empty">
                                    <TfIcon name="search" />
                                    <strong style={{ display: 'block' }}>Bu görünümde rezervasyon yok</strong>
                                    <span style={{ display: 'block', marginTop: 4 }}>Arama veya filtreleri temizleyin.</span>
                                    <button className="tfr-button is-small" style={{ marginTop: 14 }} onClick={clearFilters}>
                                        Filtreleri temizle
                                    </button>
                                </div>
                            ) : GROUPS.map((g) => {
                                const items = rows.filter((p) => p.group === g.key);
                                if (items.length === 0) return null;
                                return (
                                    <section key={g.key}>
                                        <div className={cn('tfr-group-head', g.key === 'attention' && 'is-attention')}>
                                            <span>{g.label}</span>
                                            <b className="tfr-group-count">{items.length}</b>
                                        </div>
                                        {items.map((p) => (
                                            <button key={p.r.id}
                                                className={cn('tfr-reservation-row', p.r.id === selected?.r.id && 'is-selected',
                                                    density === 'compact' && 'is-compact')}
                                                aria-pressed={p.r.id === selected?.r.id}
                                                style={{ ['--row-tone' as string]: p.state.tone }}
                                                onClick={() => setSelId(p.r.id)}>
                                                <span className="tfr-time">
                                                    <strong>{p.r.startTime}</strong>
                                                    <small>{p.durationMin > 0 ? `${p.durationMin} dk` : '—'}</small>
                                                </span>
                                                <span className="tfr-person">
                                                    <span className="tfr-avatar">{p.initials}</span>
                                                    <span>
                                                        <strong>{maskName(p.r.customerName, privacy)}</strong>
                                                        <small>{maskPhone(p.r.customerPhone, privacy)} · {p.tier}</small>
                                                    </span>
                                                </span>
                                                <span className="tfr-service">
                                                    <strong>{p.r.service}</strong>
                                                    <small>{p.packageText}</small>
                                                </span>
                                                <span className="tfr-assignment">
                                                    <strong>{p.staffName || 'Uzman yok'}</strong>
                                                    <small>{p.resourceName || '—'}</small>
                                                </span>
                                                <span className={`tfr-readiness is-${p.prep.tone}`}>
                                                    <strong>{p.prep.title}</strong>
                                                    <small>{p.prep.sub}</small>
                                                </span>
                                                <span className="tfr-status">{p.state.label}</span>
                                            </button>
                                        ))}
                                    </section>
                                );
                            })}
                        </div>
                    </article>

                    {/* ── Kontrol fişi ── */}
                    <aside className="tfr-inspector" aria-label="Seçili rezervasyon kontrolü">
                        <div className="tfr-inspector-top">
                            <p className="tfr-inspector-label">Rezervasyon kontrol fişi</p>
                            <div className="tfr-inspector-time">
                                <strong>{selected?.r.startTime ?? '—:—'}</strong>
                                <span>{selected?.live ?? 'SEÇİM YOK'}</span>
                            </div>
                            <h2>{selected ? maskName(selected.r.customerName, privacy) : 'Bir rezervasyon seçin'}</h2>
                            <p>{selected
                                ? [selected.r.service, selected.staffName].filter(Boolean).join(' · ')
                                : 'Soldaki listeden seçim yaptığınızda kontrol fişi burada açılır.'}</p>
                            <button className="tfr-primary-action" disabled={!selected || busy || selected.action.kind === 'none'}
                                onClick={() => void runPrimary()}>
                                <span>{busy ? 'Kaydediliyor…' : selected?.action.label ?? 'Seçim bekleniyor'}</span>
                                <TfIcon name="arrow" />
                            </button>
                        </div>

                        <section className="tfr-inspector-section">
                            <div className="tfr-section-head">
                                <h3>Rezervasyon özeti</h3>
                                <span>{selected?.state.label ?? '—'}</span>
                            </div>
                            <div className="tfr-fact-grid">
                                <div className="tfr-fact"><small>Süre</small><strong>{selected && selected.durationMin > 0 ? `${selected.durationMin} dakika` : '—'}</strong></div>
                                <div className="tfr-fact"><small>Kaynak</small><strong>{selected?.resourceName || '—'}</strong></div>
                                <div className="tfr-fact"><small>Paket / ödeme</small><strong>{selected?.packageText || '—'}</strong></div>
                                <div className="tfr-fact"><small>Randevu kaynağı</small><strong>{selected?.sourceText || '—'}</strong></div>
                            </div>
                        </section>

                        <section className="tfr-inspector-section">
                            <div className="tfr-section-head">
                                <h3>İşlem öncesi kontrol</h3>
                                <span>{selected ? `${selected.checks.filter((c) => c.tone === 'safe').length}/${selected.checks.length} hazır` : '—'}</span>
                            </div>
                            <div className="tfr-check-list">
                                {(selected?.checks ?? []).map((c) => {
                                    const tone = c.tone === 'safe' ? 'green' : c.tone === 'danger' ? 'red' : 'amber';
                                    return (
                                        <div key={c.title} className="tfr-check-item">
                                            <span className="tfr-check-icon" style={{ color: `var(--tfr-${tone})`, background: `var(--tfr-${tone}-soft)` }}>
                                                <TfIcon name={c.icon} className="tfr-icon-sm" />
                                            </span>
                                            <span className="tfr-check-copy"><strong>{c.title}</strong><small>{c.detail}</small></span>
                                            <span className="tfr-check-state" style={{ color: `var(--tfr-${tone})` }}>
                                                {c.tone === 'safe' ? 'Hazır' : c.tone === 'danger' ? 'Engelli' : 'Kontrol'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        <section className="tfr-inspector-section">
                            <div className="tfr-inspector-note">
                                <strong>Rezervasyon notu</strong>
                                <span>{selected?.r.notes?.trim() || 'Bu rezervasyona not eklenmemiş.'}</span>
                            </div>
                        </section>

                        <div className="tfr-inspector-actions">
                            <button className="tfr-button" disabled={!selected} onClick={() => selected && setEditing(selected.r)}>
                                <TfIcon name="edit" className="tfr-icon-sm" />Düzenle
                            </button>
                            <button className="tfr-button" disabled={!selected} onClick={() => setDialog('whatsapp')}>
                                <TfIcon name="message" className="tfr-icon-sm" />WhatsApp
                            </button>
                            <button className="tfr-icon-button" aria-label="Müşteri kartını aç" disabled={!selected?.r.customerId}
                                onClick={() => selected?.r.customerId && navigate(`/customers?open=${selected.r.customerId}`)}>
                                <TfIcon name="more" />
                            </button>
                        </div>

                        <div className="tfr-guard-note">
                            <TfIcon name="shield" className="tfr-icon-sm" />
                            <span>Uzman, kabin, süre, paket hakkı ve işleme uygunluk kaydetmeden önce yeniden doğrulanır.</span>
                        </div>
                    </aside>
                </section>
            </div>

            {dialog === 'whatsapp' && selected && (
                <WhatsAppDialog
                    reservation={selected.r}
                    businessName={settings.businessName || 'salonumuz'}
                    onClose={() => setDialog(null)}
                />
            )}

            {editing && (
                <EditReservationModal reservation={editing} isOpen onClose={() => setEditing(null)} />
            )}

            {creating && (
                <BeautySessionModal
                    customer={null}
                    onClose={() => setCreating(false)}
                    onCreated={() => { setCreating(false); void refreshPackages(); }}
                />
            )}
        </div>
    );
}

function WhatsAppDialog({ reservation, businessName, onClose }: {
    reservation: Reservation; businessName: string; onClose: () => void;
}) {
    const first = reservation.customerName.split(' ')[0];
    const templates = useMemo(() => [
        { label: 'Randevu teyidi', text: `Merhaba ${first}, ${businessName}. ${reservation.startTime} randevunuzu teyit etmek için size ulaşıyoruz.` },
        { label: 'Randevu hatırlatması', text: `Merhaba ${first}, ${businessName}. ${reservation.startTime} randevunuzu hatırlatmak istedik. Görüşmek üzere!` },
        { label: 'Gecikme bildirimi', text: `Merhaba ${first}, ${businessName}. Programımızda kısa bir gecikme oluştu; randevunuz için sizi bilgilendiriyoruz.` },
    ], [first, businessName, reservation.startTime]);

    const [idx, setIdx] = useState(0);
    const [text, setText] = useState(templates[0].text);
    const link = waLink(reservation.customerPhone, text);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="tfr-overlay" role="dialog" aria-modal="true" aria-label="WhatsApp mesajı"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="tfr-dialog">
                <div className="tfr-dialog-head">
                    <div>
                        <p className="tfr-eyebrow">Hızlı ve kontrollü işlem</p>
                        <h2>WhatsApp mesajı</h2>
                        <p>{reservation.customerName} · gönderim son onayı sizde</p>
                    </div>
                    <button className="tfr-icon-button" onClick={onClose} aria-label="Pencereyi kapat"><TfIcon name="x" /></button>
                </div>
                <div className="tfr-dialog-body">
                    <label className="tfr-field"><span>Şablon</span>
                        <select value={idx} onChange={(e) => { const i = Number(e.target.value); setIdx(i); setText(templates[i].text); }}>
                            {templates.map((t, i) => <option key={t.label} value={i}>{t.label}</option>)}
                        </select></label>
                    <label className="tfr-field"><span>Numara</span>
                        <input value={reservation.customerPhone} readOnly /></label>
                    <label className="tfr-field is-full"><span>Mesaj</span>
                        <textarea value={text} onChange={(e) => setText(e.target.value)} /></label>
                    <div className="tfr-verify">
                        <TfIcon name="shield" />
                        <div>
                            <strong>Mesaj otomatik gönderilmez</strong>
                            <small>WhatsApp uygulaması hazır metinle açılır; gönderme kararı sizindir.</small>
                        </div>
                    </div>
                </div>
                <div className="tfr-dialog-actions">
                    <button className="tfr-button" onClick={onClose}>Vazgeç</button>
                    <button className="tfr-button is-primary" disabled={!link}
                        onClick={() => {
                            if (!link) { toast.error('Bu numaraya WhatsApp yazılamıyor'); return; }
                            window.open(link, '_blank', 'noopener');
                            onClose();
                        }}>WhatsApp'ta aç</button>
                </div>
            </div>
        </div>
    );
}
