import { useEffect, useMemo, useState, type CSSProperties, type ElementType, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertCircle, ArrowRight, Bell, CalendarDays, Check, CheckCircle2, ChevronRight,
    ClipboardCheck, Dumbbell, FileCheck2, HeartPulse, History, LockKeyhole, MessageCircle,
    PackageCheck, Plus, Ruler, Search, ShieldCheck, Stethoscope, Target, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { useStaff } from '@/hooks/useStaff';
import { useResources } from '@/hooks/useResources';
import { useCustomers } from '@/hooks/useCustomers';
import { useCustomerPackages } from '@/hooks/useCustomerPackages';
import { useTreatmentPlans } from '@/hooks/useTreatmentPlans';
import { useTheme } from '@/contexts/ThemeContext';
import { EditReservationModal } from '@/components/reservations/EditReservationModal';
import { cn } from '@/utils/cn';
import { todayISO, toISODate } from '@/utils/date';
import { phaseOf } from '@/lib/sessionPhase';
import { normalizePhone } from '@/lib/phone';
import { commsForSector } from '@/lib/sectorProfiles';
import type { Customer, Reservation } from '@/types';
import './physioOps.css';

// ── Fizyoterapi Dashboard'u ──────────────────────────────────────────────────
// Tasarım: Timeflow Fizyoterapi Dashboard prototipi. Görsel imza "Hareket
// Rotası". İlke — fizyoterapide asıl soru "kaç randevu var" değil; hasta
// işlevsel hedefine doğru ilerliyor mu, hangi kayıt insan kararı bekliyor?
// Bu yüzden ekran kanban veya dört eş KPI kartı değil; canlı seans çizgisi +
// seçili hastanın fonksiyon rotası + karar masasıdır.
//
// ÖNEMLİ — ürün sınırı: sistem tanı koymaz, tedavi önermez, planı otomatik
// değiştirmez. Ölçümü terapist girer; ekran yalnız eksik kaydı ve zamanı gelen
// değerlendirmeyi görünür kılar.
//
// ÖNEMLİ — iki sayaç ayrıdır: KLİNİK PLAN (treatment_plans: kaçıncı seans, kaç
// seans planlı) ile TİCARİ HAK (customer_packages: kalan paket hakkı) asla tek
// sayaçta birleştirilmez.

// Sektör profilindeki özel alan şablonlarıyla birebir eşleşen anahtarlar
// (bkz. sectorProfiles.ts → fizyoterapi.customFieldTemplates). Bu alanlar
// customers/reservations.custom_fields JSONB'sinde durur; yeni tablo gerekmez.
const CF_GOAL = 'islevsel_hedef';      // customer · hastanın işlevsel hedefi
const CF_ALERT = 'klinik_uyari';       // customer · güvenlik/klinik uyarı özeti
const CF_HOME = 'ev_programi';         // customer · ev programı adı
const CF_HOME_DAYS = 'ev_programi_gun'; // customer · haftalık uygulanan gün (0-7)
const CF_PAIN = 'agri';                // reservation · ağrı bildirimi (0-10)
const CF_ROM = 'rom';                  // reservation · hareket açıklığı (derece)

const HOME_TARGET = 7;                 // ev programı haftalık gün hedefi
const SLOT_MIN = 30;                   // zaman çizelgesi sütun genişliği (dk)
const NEAR_WINDOW = 90;                // "önümüzdeki 90 dakika" kaynak penceresi

type SessionTone = 'teal' | 'blue' | 'purple' | 'green' | 'amber';
type SessionState = { label: string; tone: SessionTone; icon: ElementType };
type ModalName = 'measure' | 'goal' | 'notifications' | 'exercise' | null;

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const toLabel = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** Baş harf rozeti. Üç parçalı adlarda ilk + son parça alınır ki "Terapi Alanı 1"
 *  ile "Terapi Alanı 2" aynı rozeti (TA) paylaşmasın: T1 / T2. */
const initialsOf = (n: string) => {
    const chars = n.trim().split(/\s+/).filter(Boolean).map((p) => (/^\d+$/.test(p) ? p : p.charAt(0)));
    return (chars.length > 2 ? chars[0] + chars[chars.length - 1] : chars.join('')).slice(0, 2).toLocaleUpperCase('tr');
};
const waLink = (phone: string) => `https://wa.me/${normalizePhone(phone) ?? phone.replace(/\D/g, '')}`;

/** Ortak ekran mahremiyeti: soyad maskelenir (varsayılan açık). */
const maskName = (full: string, on: boolean) => {
    if (!on) return full;
    const parts = full.trim().split(/\s+/);
    return parts.length < 2 ? parts[0] || full : `${parts[0]} ${parts[parts.length - 1].charAt(0).toLocaleUpperCase('tr')}.`;
};

const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const text = (v: unknown): string => String(v ?? '').trim();

/** Seansın görünen durumu. Renk tek başına anlam taşımaz: her durumun Türkçe
 *  etiketi ve ikonu vardır (erişilebilirlik zorunluluğu). */
function stateOf(r: Reservation): SessionState {
    const ph = phaseOf(r);
    if (ph === 'active') return { label: 'Seans sürüyor', tone: 'teal', icon: HeartPulse };
    if (ph === 'arrived') return { label: 'Değerlendirme', tone: 'purple', icon: Stethoscope };
    if (ph === 'done') return { label: 'Karar bekliyor', tone: 'amber', icon: FileCheck2 };
    if (ph === 'completed') {
        return text(r.notes)
            ? { label: 'Tamamlandı', tone: 'green', icon: CheckCircle2 }
            : { label: 'Karar bekliyor', tone: 'amber', icon: FileCheck2 };
    }
    return { label: 'Yaklaşıyor', tone: 'blue', icon: CalendarDays };
}

export function FizyoterapiDashboard() {
    const navigate = useNavigate();
    const { dark } = useTheme();
    const { reservations, settings, updateReservation } = useReservations();
    const { staff } = useStaff();
    const { resources } = useResources();
    const { customers, customerById, updateCustomer } = useCustomers();
    const { forCustomer } = useCustomerPackages();
    const today = todayISO();

    // Dakikada bir tazelenir — gün boyu açık kalan ekranda "şimdi" çizgisi ve
    // süre metinleri bayatlamasın.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(t);
    }, []);
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const [timelineMode, setTimelineMode] = useState<'therapists' | 'rooms'>('therapists');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [privateMode, setPrivateMode] = useState(true);           // ortak ekran: varsayılan AÇIK
    const [searchOpen, setSearchOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [modal, setModal] = useState<ModalName>(null);
    const [noteRes, setNoteRes] = useState<Reservation | null>(null);
    const [handled, setHandled] = useState<string[]>([]);           // görsel "ilgilendim" işareti

    const activeStaff = useMemo(() => staff.filter((s) => s.isActive !== false), [staff]);
    const activeResources = useMemo(() => resources.filter((r) => r.isActive).sort((a, b) => a.sort - b.sort), [resources]);

    const activeList = useMemo(() => reservations.filter((r) => r.status !== 'cancelled'), [reservations]);
    const todayList = useMemo(
        () => activeList.filter((r) => r.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [activeList, today],
    );

    // ── Zaman çizelgesi penceresi ────────────────────────────────────────────
    // Bugünün çalışma saatlerinden başlar, randevular dışarı taşarsa genişler.
    const timeline = useMemo(() => {
        const wh = settings.workingHours?.find((d) => d.day === now.getDay());
        let start = wh && !wh.isOff ? toMin(wh.start) : 9 * 60;
        let end = wh && !wh.isOff ? toMin(wh.end) : 18 * 60;
        for (const r of todayList) {
            start = Math.min(start, toMin(r.startTime));
            end = Math.max(end, toMin(r.endTime));
        }
        start = Math.floor(start / SLOT_MIN) * SLOT_MIN;
        end = Math.ceil(end / SLOT_MIN) * SLOT_MIN;
        const slots = Math.min(24, Math.max(8, Math.ceil((end - start) / SLOT_MIN)));
        end = start + slots * SLOT_MIN;
        return { start, end, slots, labels: Array.from({ length: slots }, (_, i) => toLabel(start + i * SLOT_MIN)) };
    }, [settings.workingHours, todayList, now]);

    const nowRatio = (nowMin - timeline.start) / (timeline.end - timeline.start);
    const nowVisible = nowRatio >= 0 && nowRatio <= 1;

    // ── Zaman çizelgesi satırları ────────────────────────────────────────────
    const filtered = useMemo(() => {
        const q = search.trim().toLocaleLowerCase('tr');
        if (!q) return todayList;
        return todayList.filter((r) =>
            r.customerName.toLocaleLowerCase('tr').includes(q)
            || r.service.toLocaleLowerCase('tr').includes(q)
            || (r.staffName || '').toLocaleLowerCase('tr').includes(q)
            || (r.resourceName || '').toLocaleLowerCase('tr').includes(q));
    }, [todayList, search]);

    const rows = useMemo(() => {
        const out: { key: string; label: string; sub: string; initials: string; items: Reservation[] }[] = [];
        if (timelineMode === 'therapists') {
            for (const s of activeStaff) {
                const items = filtered.filter((r) => r.staffId === s.id);
                const live = items.filter((r) => phaseOf(r) === 'active').length;
                out.push({
                    key: s.id, label: s.name, initials: initialsOf(s.name),
                    sub: live > 0 ? `${live} seans aktif` : `${items.length} seans planlı`,
                    items,
                });
            }
            const orphan = filtered.filter((r) => !r.staffId || !activeStaff.some((s) => s.id === r.staffId));
            if (orphan.length) out.push({ key: '_none', label: 'Atanmadı', sub: `${orphan.length} seans`, initials: '—', items: orphan });
        } else {
            for (const res of activeResources) {
                const items = filtered.filter((r) => r.resourceId === res.id);
                out.push({
                    key: res.id, label: res.name, initials: initialsOf(res.name),
                    sub: `${items.length} seans planlı`, items,
                });
            }
            const orphan = filtered.filter((r) => !r.resourceId || !activeResources.some((x) => x.id === r.resourceId));
            if (orphan.length) out.push({ key: '_none', label: 'Alan atanmadı', sub: `${orphan.length} seans`, initials: '—', items: orphan });
        }
        return out.filter((r) => r.items.length > 0 || r.key !== '_none');
    }, [timelineMode, activeStaff, activeResources, filtered]);

    // ── Seçili seans ─────────────────────────────────────────────────────────
    const selected = useMemo(() => {
        const byId = todayList.find((r) => r.id === selectedId);
        if (byId) return byId;
        return todayList.find((r) => phaseOf(r) === 'active')
            || todayList.find((r) => phaseOf(r) === 'arrived')
            || todayList.find((r) => toMin(r.endTime) >= nowMin)
            || todayList[0] || null;
    }, [todayList, selectedId, nowMin]);

    const selCustomer = selected?.customerId ? customerById.get(selected.customerId) : undefined;
    const { plans } = useTreatmentPlans(selected?.customerId);

    // Klinik plan — treatment_plans'tan; ticari hakla ASLA birleştirilmez.
    const clinicalPlan = useMemo(() => {
        const active = plans.find((p) => p.status === 'active') || plans.find((p) => p.status === 'proposed');
        if (!active) return null;
        return {
            title: active.title,
            done: active.sessionsDone,
            total: active.sessionCount,
            remaining: Math.max(0, active.sessionCount - active.sessionsDone),
            proposed: active.status === 'proposed',
        };
    }, [plans]);

    // Ticari hak — customer_packages'tan; klinik plandan bağımsız.
    const commercialRight = useMemo(() => {
        if (!selected?.customerId) return null;
        const pkgs = forCustomer(selected.customerId);
        if (pkgs.length === 0) return null;
        const remaining = pkgs.reduce((s, p) => s + Math.max(0, p.totalSessions - p.usedSessions), 0);
        return { remaining, count: pkgs.length };
    }, [selected?.customerId, forCustomer]);

    // Seçili hastanın ölçüm geçmişi — terapistin girdiği gerçek değerler.
    const history = useMemo(() => {
        if (!selected?.customerId) return [];
        return activeList
            .filter((r) => r.customerId === selected.customerId)
            .filter((r) => num(r.customFields?.[CF_PAIN]) !== null || num(r.customFields?.[CF_ROM]) !== null)
            .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)))
            .map((r) => ({ date: r.date, pain: num(r.customFields?.[CF_PAIN]), rom: num(r.customFields?.[CF_ROM]) }));
    }, [activeList, selected?.customerId]);

    const measure = (key: 'pain' | 'rom') => {
        const points = history.map((h) => h[key]).filter((v): v is number => v !== null);
        if (points.length === 0) return null;
        return { start: points[0], current: points[points.length - 1], points };
    };
    const pain = measure('pain');
    const rom = measure('rom');
    const homeDays = num(selCustomer?.customFields?.[CF_HOME_DAYS]);
    const goal = text(selCustomer?.customFields?.[CF_GOAL]);
    const clinicalAlert = text(selCustomer?.customFields?.[CF_ALERT]);

    // Grafik: hangi ölçüm çizilecek? Terapistin girdiği veriye göre — sistem
    // "iyileşme yüzdesi" uydurmaz, yalnız gerçek değerleri çizer.
    const chart = rom && rom.points.length >= 2
        ? { label: 'Hareket açıklığı (°)', points: rom.points, higherIsBetter: true }
        : pain && pain.points.length >= 2
            ? { label: 'Ağrı bildirimi (0-10)', points: pain.points, higherIsBetter: false }
            : null;

    // ── Klinik kontrol masası — gerçek veriden türeyen kararlar ──────────────
    const missingNotes = useMemo(
        () => todayList.filter((r) => (phaseOf(r) === 'completed' || phaseOf(r) === 'done') && !text(r.notes)),
        [todayList],
    );

    const dueReassessment = useMemo(
        () => customers.filter((c) => c.recallDate && c.recallDate <= today),
        [customers, today],
    );

    const recentCustomerIds = useMemo(() => {
        const from = new Date(now); from.setDate(now.getDate() - 30);
        const fromISO = toISODate(from);
        const s = new Set<string>();
        for (const r of activeList) if (r.date >= fromISO && r.date <= today) s.add(r.customerId);
        return s;
    }, [activeList, now, today]);

    // Ev programı takibi olan hastalar. Dil yargılayıcı değil: "uyumsuz hasta"
    // yerine "programa destek gerekiyor".
    const homePrograms = useMemo(() => customers
        .filter((c) => text(c.customFields?.[CF_HOME]) !== '' && recentCustomerIds.has(c.id))
        .map((c) => {
            const days = num(c.customFields?.[CF_HOME_DAYS]) ?? 0;
            const status = days >= HOME_TARGET ? { label: 'Tamamlandı', tone: 'green' }
                : days >= 3 ? { label: 'Planla uyumlu', tone: 'teal' }
                    : { label: 'Programa destek gerekiyor', tone: 'amber' };
            return { customer: c, program: text(c.customFields?.[CF_HOME]), days: Math.min(HOME_TARGET, Math.max(0, days)), status };
        })
        .sort((a, b) => a.days - b.days), [customers, recentCustomerIds]);

    const needsSupport = homePrograms.filter((h) => h.days < 3);

    const clashes = useMemo(() => todayList.filter((r) => r.resourceId
        && todayList.some((o) => o.id !== r.id && o.resourceId === r.resourceId
            && toMin(o.startTime) < toMin(r.endTime) && toMin(r.startTime) < toMin(o.endTime))), [todayList]);

    const unassigned = useMemo(() => todayList.filter((r) => !r.staffId), [todayList]);

    type Decision = { key: string; when: string; title: string; detail: string; action: string; tone: string; icon: ElementType; run: () => void };
    const decisions = useMemo<Decision[]>(() => {
        const out: Decision[] = [];
        const first = dueReassessment[0];
        if (first) out.push({
            key: 'reassess', when: 'Bugün', tone: 'amber', icon: Ruler,
            title: `${maskName(first.name, privateMode)} için yeniden değerlendirme`,
            detail: dueReassessment.length > 1
                ? `${dueReassessment.length} hastanın değerlendirme zamanı geldi`
                : 'Ölçüm zamanı geldi — değerleri terapist girer',
            action: 'Ölçümü aç',
            run: () => {
                const sess = todayList.find((r) => r.customerId === first.id);
                if (sess) { setSelectedId(sess.id); setModal('measure'); }
                else navigate(`/customers?q=${encodeURIComponent(first.phone || first.name)}`);
            },
        });
        const miss = missingNotes[0];
        if (miss) out.push({
            key: 'note', when: 'Gün sonuna kadar', tone: 'red', icon: FileCheck2,
            title: `${maskName(miss.customerName, privateMode)} · seans notu eksik`,
            detail: missingNotes.length > 1 ? `${missingNotes.length} seans notu bekliyor` : `${miss.startTime} · ${miss.service}`,
            action: 'Notu tamamla',
            run: () => setNoteRes(miss),
        });
        const sup = needsSupport[0];
        if (sup) out.push({
            key: 'home', when: 'Bugün', tone: 'teal', icon: MessageCircle,
            title: `${maskName(sup.customer.name, privateMode)} · programa destek gerekiyor`,
            detail: `Son haftada ${sup.days}/${HOME_TARGET} gün kaydedildi`,
            action: 'Mesaj hazırla',
            run: () => openSupportMessage(sup.customer),
        });
        if (clashes.length > 0) out.push({
            key: 'clash', when: 'Şimdi', tone: 'red', icon: AlertCircle,
            title: `${clashes.length} seansta terapi alanı çakışması`,
            detail: 'Aynı alanda çakışan seans var — takvimden düzeltin',
            action: 'Takvimi aç',
            run: () => navigate('/calendar'),
        });
        if (unassigned.length > 0) out.push({
            key: 'staff', when: 'Bugün', tone: 'blue', icon: Users,
            title: `${unassigned.length} seansa fizyoterapist atanmadı`,
            detail: 'Seansı yürütecek terapist seçilmeli',
            action: 'Takvimi aç',
            run: () => navigate('/calendar'),
        });
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dueReassessment, missingNotes, needsSupport, clashes, unassigned, privateMode, todayList]);

    const openDecisions = decisions.filter((d) => !handled.includes(d.key));

    // ── Kaynak dengesi (önümüzdeki 90 dakika) ────────────────────────────────
    const capacity = useMemo(() => {
        const soon = todayList.filter((r) => toMin(r.startTime) < nowMin + NEAR_WINDOW && toMin(r.endTime) > nowMin);
        const out: { label: string; value: string; pct: number; tone: string; helper: string }[] = [];
        if (activeStaff.length > 0) {
            const busy = new Set(soon.map((r) => r.staffId).filter(Boolean)).size;
            out.push({
                label: 'Fizyoterapistler', value: `${busy} / ${activeStaff.length}`, tone: 'teal',
                pct: Math.round((busy / activeStaff.length) * 100),
                helper: busy >= activeStaff.length ? 'Tamamı görevde' : `${activeStaff.length - busy} terapist uygun`,
            });
        }
        const types = [...new Set(activeResources.map((r) => r.type))].slice(0, 2);
        for (const type of types) {
            const all = activeResources.filter((r) => r.type === type);
            const busy = new Set(soon.map((r) => r.resourceId).filter((id) => id && all.some((x) => x.id === id))).size;
            out.push({
                label: type, value: `${busy} / ${all.length}`, tone: type === types[0] ? 'blue' : 'purple',
                pct: Math.round((busy / all.length) * 100),
                helper: busy >= all.length ? 'Tamamı dolu' : `${all.length - busy} ${type.toLocaleLowerCase('tr')} boş`,
            });
        }
        return out;
    }, [todayList, nowMin, activeStaff, activeResources]);

    // ── Eylemler ─────────────────────────────────────────────────────────────
    // Ev programı destek mesajı: sistem mesajı GÖNDERMEZ, WhatsApp taslağını
    // açar — metin ve gönderim kararı insanda kalır.
    function openSupportMessage(c: Customer) {
        if (!c.phone) { toast.error('Hastanın telefon numarası kayıtlı değil'); return; }
        const comms = commsForSector(settings.sector);
        const first = c.name.trim().split(/\s+/)[0];
        const msg = `Merhaba ${first}, ev programınızda nasıl gidiyor? Zorlandığınız bir hareket varsa birlikte gözden geçirelim. ${comms.emoji}`;
        window.open(`${waLink(c.phone)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
    }

    const openPatientFile = (name: string, phone?: string) =>
        navigate(`/customers?q=${encodeURIComponent(phone || name)}`);

    const dateParts = {
        day: now.getDate(),
        weekday: now.toLocaleDateString('tr-TR', { weekday: 'long' }),
        monthYear: now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }),
    };

    const staffOnDuty = new Set(todayList.map((r) => r.staffId).filter(Boolean)).size;
    const roomsInUse = new Set(todayList.filter((r) => toMin(r.endTime) > nowMin && toMin(r.startTime) <= nowMin)
        .map((r) => r.resourceId).filter(Boolean)).size;

    const notifications = [
        missingNotes.length > 0 && { tone: 'red', title: `${missingNotes.length} seans notu bekliyor`, detail: 'Gün sonundan önce tamamlanmalı' },
        dueReassessment.length > 0 && { tone: 'amber', title: `${dueReassessment.length} yeniden değerlendirme zamanı geldi`, detail: 'Ölçümü terapist girer' },
        needsSupport.length > 0 && { tone: 'teal', title: `${needsSupport.length} hastaya ev programı desteği`, detail: 'Mesaj taslağı onayınızı bekliyor' },
        clashes.length > 0 && { tone: 'red', title: `${clashes.length} seansta alan çakışması`, detail: 'Takvimden düzeltilmeli' },
    ].filter(Boolean) as { tone: string; title: string; detail: string }[];

    return (
        <div className={cn('dash-theme fz-ops flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--dc-page)]', dark && 'dark')}>
            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="dashboard">

                    {/* ── Gün başlığı ────────────────────────────────────────── */}
                    <section className="day-header">
                        <div className="date-line">
                            <span>{dateParts.day}</span>
                            <div>
                                <strong>{dateParts.weekday}</strong>
                                <small>{dateParts.monthYear}</small>
                            </div>
                        </div>
                        <div className="day-copy">
                            <span className="eyebrow">
                                {(settings.businessName || 'FİZYOTERAPİ MERKEZİ').toLocaleUpperCase('tr')} · {toLabel(nowMin)}
                            </span>
                            <h1>
                                {todayList.length === 0 ? 'Bugün için planlanmış seans yok;' : 'Bugün hareket planı net;'}
                                <em> {openDecisions.length > 0 ? `${openDecisions.length} klinik karar bekliyor.` : 'bekleyen klinik karar yok.'}</em>
                            </h1>
                            <div className="day-meta">
                                <span><i className="dot teal" /> {todayList.length} seans planlı</span>
                                <span><i className="dot green" /> {staffOnDuty} fizyoterapist görevde</span>
                                {activeResources.length > 0 && (
                                    <span><i className="dot blue" /> {roomsInUse} / {activeResources.length} alan kullanımda</span>
                                )}
                                <button type="button" className="privacy-toggle" aria-pressed={privateMode}
                                    onClick={() => setPrivateMode((v) => !v)}>
                                    <LockKeyhole size={14} /> Ortak ekran {privateMode ? 'açık' : 'kapalı'}
                                </button>
                            </div>
                        </div>
                        <div className="day-actions">
                            <button className="icon-button" type="button" aria-label={`Bildirimler${notifications.length ? `, ${notifications.length} yeni` : ''}`}
                                onClick={() => setModal('notifications')}>
                                <Bell size={19} />
                            </button>
                            <button className="button secondary" type="button" onClick={() => navigate('/calendar')}>
                                <CalendarDays size={18} />Takvimi aç
                            </button>
                            <button className="button primary" type="button" onClick={() => navigate('/calendar?new=1')}>
                                <Plus size={19} />Yeni seans
                            </button>
                        </div>
                    </section>

                    {/* ── Canlı Seans Ritmi ──────────────────────────────────── */}
                    <section className="panel live-rhythm">
                        <div className="section-head">
                            <div>
                                <span className="eyebrow">CANLI SEANS RİTMİ</span>
                                <h2>Kim, nerede, ne zaman?</h2>
                                <p>Seans saati, fizyoterapist ve terapi alanı aynı çizgide.</p>
                            </div>
                            <div className="section-tools">
                                <div className="segmented" role="group" aria-label="Zaman çizelgesi görünümü">
                                    <button type="button" aria-pressed={timelineMode === 'therapists'}
                                        className={timelineMode === 'therapists' ? 'active' : ''}
                                        onClick={() => setTimelineMode('therapists')}>Terapistler</button>
                                    <button type="button" aria-pressed={timelineMode === 'rooms'}
                                        className={timelineMode === 'rooms' ? 'active' : ''}
                                        onClick={() => setTimelineMode('rooms')}>Alanlar</button>
                                </div>
                                <button type="button" className="icon-button" aria-label="Seanslarda ara"
                                    aria-expanded={searchOpen} onClick={() => setSearchOpen((v) => !v)}>
                                    <Search size={18} />
                                </button>
                            </div>
                        </div>

                        {searchOpen && (
                            <div className="timeline-search">
                                <Search size={17} />
                                <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
                                    aria-label="Hasta, terapist veya alan ara"
                                    placeholder="Hasta, terapist veya alan ara" />
                                {search && (
                                    <button type="button" className="icon-button" style={{ width: 30, height: 30 }}
                                        aria-label="Aramayı temizle" onClick={() => setSearch('')}>
                                        <X size={15} />
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="timeline-scroll">
                            <div className="timeline" style={{ '--fz-slots': timeline.slots } as CSSProperties}
                                aria-label="Bugünün canlı seans zaman çizelgesi">
                                <div className="timeline-times">
                                    <span>{timelineMode === 'therapists' ? 'Terapist' : 'Alan'}</span>
                                    {timeline.labels.map((t) => <time key={t}>{t}</time>)}
                                </div>

                                {nowVisible && rows.length > 0 && (
                                    <div className="now-line" aria-hidden="true"
                                        style={{ left: `calc(var(--fz-owner) + (100% - var(--fz-owner)) * ${nowRatio})` }}>
                                        <span>Şimdi {toLabel(nowMin)}</span>
                                    </div>
                                )}

                                {rows.length === 0 ? (
                                    <div className="timeline-empty">
                                        <CalendarDays size={22} />
                                        <strong>{todayList.length === 0 ? 'Bugün seans planlanmamış' : 'Eşleşen seans yok'}</strong>
                                        <p>
                                            {todayList.length === 0
                                                ? 'Yeni seans oluşturduğunuzda ritim burada canlanır.'
                                                : timelineMode === 'rooms'
                                                    ? 'Terapi alanları Ayarlar → Kaynaklar bölümünden tanımlanır.'
                                                    : 'Aramayı temizleyin veya farklı bir terapist deneyin.'}
                                        </p>
                                    </div>
                                ) : rows.map((row) => (
                                    <div className="timeline-row" key={row.key}>
                                        <div className="row-owner">
                                            <span className="avatar">{row.initials}</span>
                                            <span><strong>{row.label}</strong><small>{row.sub}</small></span>
                                        </div>
                                        {row.items.map((r) => {
                                            const st = stateOf(r);
                                            const col = Math.max(0, Math.floor((toMin(r.startTime) - timeline.start) / SLOT_MIN));
                                            const span = Math.max(1, Math.min(timeline.slots - col,
                                                Math.ceil((toMin(r.endTime) - toMin(r.startTime)) / SLOT_MIN)));
                                            const alert = text(customerById.get(r.customerId)?.customFields?.[CF_ALERT]);
                                            return (
                                                <button type="button" key={r.id}
                                                    className={cn('session-block', st.tone, selected?.id === r.id && 'selected')}
                                                    style={{ gridColumn: `${col + 2} / span ${span}` }}
                                                    aria-pressed={selected?.id === r.id}
                                                    aria-label={`${maskName(r.customerName, privateMode)}, ${r.startTime}, ${r.service}, ${st.label}${alert ? ', klinik uyarı var' : ''}`}
                                                    onClick={() => setSelectedId(r.id)}>
                                                    <span>
                                                        <strong>{maskName(r.customerName, privateMode)}</strong>
                                                        <em>{r.startTime}</em>
                                                    </span>
                                                    <small>{r.service}</small>
                                                    {alert && <AlertCircle size={14} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="timeline-legend">
                            <span><i className="dot teal" /> Seans sürüyor</span>
                            <span><i className="dot blue" /> Yaklaşıyor</span>
                            <span><i className="dot purple" /> Değerlendirme</span>
                            <span><i className="dot amber" /> Karar bekliyor</span>
                            <span><i className="dot green" /> Tamamlandı</span>
                            <button type="button" onClick={() => navigate('/calendar')}>
                                Tüm günü gör <ChevronRight size={16} />
                            </button>
                        </div>
                    </section>

                    {/* ── Fonksiyon Rotası + Klinik Kontrol Masası ───────────── */}
                    <div className="clinical-grid">
                        <section className="panel function-route">
                            {selected ? (
                                <>
                                    <div className="selected-patient-head">
                                        <div className="selected-patient">
                                            <span className="avatar teal">{initialsOf(selected.customerName)}</span>
                                            <div>
                                                <span className="eyebrow">
                                                    FONKSİYON ROTASI{clinicalPlan ? ` · SEANS ${clinicalPlan.done + 1} / ${clinicalPlan.total}` : ''}
                                                </span>
                                                <h2>{maskName(selected.customerName, privateMode)}</h2>
                                                <p>{selected.service} · {selected.staffName || 'Fizyoterapist atanmadı'}</p>
                                            </div>
                                        </div>
                                        <div className="patient-actions">
                                            {(() => { const st = stateOf(selected); const Icon = st.icon; return (
                                                <span className={cn('status-pill', st.tone)}><Icon size={13} />{st.label}</span>
                                            ); })()}
                                            <button className="button compact" type="button"
                                                onClick={() => openPatientFile(selected.customerName, selected.customerPhone)}>
                                                Hasta dosyası
                                            </button>
                                        </div>
                                    </div>

                                    {clinicalAlert && (
                                        <div className="functional-goal" style={{ borderColor: 'var(--dc-red)', background: 'var(--dc-red-bg)' }}>
                                            <span style={{ color: 'var(--dc-red)' }}><AlertCircle size={18} /> Klinik uyarı var</span>
                                            <strong>Ayrıntı yalnız yetkili hasta dosyasında görünür</strong>
                                            <button type="button" onClick={() => openPatientFile(selected.customerName, selected.customerPhone)}>
                                                Dosyayı aç
                                            </button>
                                        </div>
                                    )}

                                    <div className="functional-goal">
                                        <span><Target size={18} /> Hastanın işlevsel hedefi</span>
                                        <strong>{goal ? `“${goal}”` : 'İşlevsel hedef henüz belirlenmedi'}</strong>
                                        <button type="button" onClick={() => setModal('goal')}>
                                            {goal ? 'Hedefi güncelle' : 'Hedef belirle'}
                                        </button>
                                        <small style={{ gridColumn: '1 / -1' }}>
                                            {selCustomer?.recallDate
                                                ? `Yeniden değerlendirme: ${selCustomer.recallDate <= today ? 'bugün' : selCustomer.recallDate}`
                                                : 'Yeniden değerlendirme tarihi belirlenmedi'}
                                        </small>
                                    </div>

                                    <div className="measurement-grid">
                                        <MetricCard label="Ağrı" icon={HeartPulse} tone={pain ? 'teal' : 'muted'}
                                            start={pain ? `${pain.start}/10` : null}
                                            current={pain ? `${pain.current}/10` : 'Kayıt yok'}
                                            helper="Hastanın bildirimi" />
                                        <MetricCard label="Hareket açıklığı" icon={Ruler} tone={rom ? 'blue' : 'muted'}
                                            start={rom ? `${rom.start}°` : null}
                                            current={rom ? `${rom.current}°` : 'Kayıt yok'}
                                            helper="Terapistin seçtiği eklem" />
                                        <MetricCard label="Ev programı" icon={Dumbbell}
                                            tone={homeDays === null ? 'muted' : homeDays < 3 ? 'amber' : 'green'}
                                            start={homeDays === null ? null : 'Haftalık'}
                                            current={homeDays === null ? 'Kayıt yok' : `${homeDays}/${HOME_TARGET} gün`}
                                            helper={homeDays === null ? 'Hasta kartından girilir' : homeDays < 3 ? 'Programa destek gerekiyor' : 'Planla uyumlu'} />
                                    </div>

                                    <div className="progress-story">
                                        <div className="progress-copy">
                                            <span className="eyebrow">ÖLÇÜM GEÇMİŞİ</span>
                                            <h3>Ölçülebilir ilerleme</h3>
                                            <p>
                                                Grafik bir “iyileşme yüzdesi” değil; terapistin girdiği ölçümlerin
                                                seanslar arasındaki gerçek değişimidir.
                                            </p>
                                            <button type="button" className="button compact" style={{ marginTop: 10 }}
                                                onClick={() => setModal('measure')}>
                                                Ölçüm gir
                                            </button>
                                        </div>
                                        <div className="mini-chart">
                                            {chart ? (
                                                <>
                                                    <div className="chart-labels"><span>Başlangıç</span><span>{chart.label}</span><span>Bugün</span></div>
                                                    <MeasureChart points={chart.points} />
                                                </>
                                            ) : (
                                                <div className="mini-chart-empty">
                                                    En az iki ölçüm girildiğinde değişim burada çizilir.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="rights-row">
                                        <div>
                                            <ClipboardCheck size={18} />
                                            <span>Klinik plan</span>
                                            <strong>
                                                {clinicalPlan
                                                    ? `${clinicalPlan.remaining} seans planlı${clinicalPlan.proposed ? ' (teklif)' : ''}`
                                                    : 'Klinik plan tanımlı değil'}
                                            </strong>
                                        </div>
                                        <div>
                                            <PackageCheck size={18} />
                                            <span>Ticari hak</span>
                                            <strong>
                                                {commercialRight
                                                    ? `${commercialRight.remaining} paket hakkı kaldı`
                                                    : 'Paket tanımlı değil'}
                                            </strong>
                                        </div>
                                        <p>
                                            <ShieldCheck size={16} />
                                            Klinik plan ile paket hakkı ayrı tutulur.
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <div className="timeline-empty" style={{ padding: '60px 20px' }}>
                                    <Stethoscope size={22} />
                                    <strong>Seçili seans yok</strong>
                                    <p>Zaman çizelgesinden bir seans seçtiğinizde fonksiyon rotası burada açılır.</p>
                                </div>
                            )}
                        </section>

                        <aside className="panel decision-desk">
                            <div className="section-head compact-head">
                                <div>
                                    <span className="eyebrow">BUGÜN KARAR VERİLECEKLER</span>
                                    <h2>Klinik kontrol masası</h2>
                                </div>
                                <span className="count-badge">{openDecisions.length}</span>
                            </div>
                            <p className="decision-intro">Yalnızca güvenli ilerleme için insan kararı isteyen işler.</p>

                            <div className="decision-list">
                                {decisions.length === 0 ? (
                                    <div className="decision-empty">
                                        <CheckCircle2 size={22} />
                                        <strong>Bekleyen klinik karar yok</strong>
                                        <p>Eksik kayıt, zamanı gelen değerlendirme veya çakışma görünmüyor.</p>
                                    </div>
                                ) : decisions.map((d) => {
                                    const Icon = d.icon;
                                    const done = handled.includes(d.key);
                                    return (
                                        <article className={cn('decision-item', done && 'done')} key={d.key}>
                                            <span className={cn('decision-icon', d.tone)}>
                                                {done ? <Check size={18} /> : <Icon size={18} />}
                                            </span>
                                            <div>
                                                <time>{done ? 'İlgilenildi' : d.when}</time>
                                                <h3>{d.title}</h3>
                                                <p>{d.detail}</p>
                                                <button type="button" onClick={d.run}>
                                                    {d.action} <ArrowRight size={15} />
                                                </button>
                                            </div>
                                            <button className="decision-check" type="button"
                                                aria-pressed={done}
                                                aria-label={done ? 'İşareti kaldır' : 'İlgilenildi olarak işaretle'}
                                                onClick={() => setHandled((c) => c.includes(d.key) ? c.filter((k) => k !== d.key) : [...c, d.key])}>
                                                {done ? <CheckCircle2 size={20} /> : <span />}
                                            </button>
                                        </article>
                                    );
                                })}
                            </div>

                            <div className="safety-note">
                                <LockKeyhole size={17} />
                                <p>
                                    Sistem tedavi kararı vermez; yalnız eksik kaydı ve zamanı gelen ölçümü görünür kılar.
                                    Ortak ekranda tanı ve ayrıntılı klinik ölçümler gösterilmez — yetkili hasta dosyasında açılır.
                                </p>
                            </div>
                        </aside>
                    </div>

                    {/* ── Ev Programı Nabzı ──────────────────────────────────── */}
                    <section className="panel home-pulse">
                        <div className="section-head">
                            <div>
                                <span className="eyebrow">EV PROGRAMI NABZI</span>
                                <h2>Klinik dışındaki ilerleme</h2>
                                <p>Suçlayıcı olmayan, destek odaklı haftalık görünüm.</p>
                            </div>
                            {homePrograms.length > 0 && (
                                <button className="button secondary compact" type="button" onClick={() => setModal('exercise')}>
                                    Tüm programları aç
                                </button>
                            )}
                        </div>
                        {homePrograms.length === 0 ? (
                            <div className="pulse-empty">
                                <Dumbbell size={22} />
                                <strong>Ev programı kaydı yok</strong>
                                <p>
                                    Hasta kartındaki “Ev programı” ve “Haftalık uygulanan gün” alanları doldurulduğunda
                                    haftalık nabız burada görünür.
                                </p>
                            </div>
                        ) : (
                            <div className="exercise-grid">
                                {homePrograms.slice(0, 6).map((h) => (
                                    <article className="exercise-item" key={h.customer.id}>
                                        <span className="avatar">{initialsOf(h.customer.name)}</span>
                                        <div className="exercise-copy">
                                            <strong>{maskName(h.customer.name, privateMode)}</strong>
                                            <span>{h.program}</span>
                                        </div>
                                        <div className="day-dots" aria-label={`${h.days} / ${HOME_TARGET} gün kaydedildi`}>
                                            {Array.from({ length: HOME_TARGET }, (_, i) => (
                                                <i className={i < h.days ? 'filled' : ''} key={i} />
                                            ))}
                                        </div>
                                        <span className={cn('support-status', h.status.tone)}>{h.status.label}</span>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* ── Kaynak Dengesi + Kayıt Tamlığı ─────────────────────── */}
                    <div className="lower-grid">
                        <section className="panel capacity-panel">
                            <div className="section-head compact-head">
                                <div>
                                    <span className="eyebrow">KAYNAK DENGESİ</span>
                                    <h2>Önümüzdeki {NEAR_WINDOW} dakika</h2>
                                </div>
                                {activeResources.length > 0 && (
                                    <button className="link-button" type="button" onClick={() => setTimelineMode('rooms')}>
                                        Alanlara geç <ArrowRight size={15} />
                                    </button>
                                )}
                            </div>
                            {capacity.length === 0 ? (
                                <div className="closing-clean">
                                    <Users size={20} />
                                    <strong>Kaynak tanımlı değil</strong>
                                    <p>Fizyoterapist ve terapi alanlarını ekledikçe doluluk burada görünür.</p>
                                </div>
                            ) : (
                                <div className="capacity-bars">
                                    {capacity.map((c) => (
                                        <div className="capacity-row" key={c.label}>
                                            <div><strong>{c.label}</strong><span>{c.helper}</span></div>
                                            <div className="capacity-track" role="progressbar" aria-valuenow={c.pct}
                                                aria-valuemin={0} aria-valuemax={100} aria-label={`${c.label} doluluğu`}>
                                                <i className={c.tone} style={{ width: `${c.pct}%` }} />
                                            </div>
                                            <b>{c.value}</b>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="panel closing-panel">
                            <div className="section-head compact-head">
                                <div>
                                    <span className="eyebrow">KAYIT TAMLIĞI</span>
                                    <h2>Günü temiz kapat</h2>
                                </div>
                                <span className={cn('status-pill', missingNotes.length + dueReassessment.length > 0 ? 'amber' : 'green')}>
                                    {missingNotes.length + dueReassessment.length > 0
                                        ? `${missingNotes.length + dueReassessment.length} eksik`
                                        : 'Temiz'}
                                </span>
                            </div>
                            {missingNotes.length + dueReassessment.length === 0 ? (
                                <div className="closing-clean">
                                    <CheckCircle2 size={20} />
                                    <strong>Bekleyen kayıt yok</strong>
                                    <p>Seans notları ve değerlendirmeler güncel.</p>
                                </div>
                            ) : (
                                <div className="closing-list">
                                    {missingNotes.slice(0, 3).map((r) => (
                                        <button type="button" key={r.id} onClick={() => setNoteRes(r)}>
                                            <FileCheck2 size={18} />
                                            <span>
                                                <strong>Seans notu eksik</strong>
                                                <small>{maskName(r.customerName, privateMode)} · {r.startTime}</small>
                                            </span>
                                            <ChevronRight size={17} />
                                        </button>
                                    ))}
                                    {dueReassessment.slice(0, 3).map((c) => (
                                        <button type="button" key={c.id} onClick={() => {
                                            const sess = todayList.find((r) => r.customerId === c.id);
                                            if (sess) { setSelectedId(sess.id); setModal('measure'); }
                                            else openPatientFile(c.name, c.phone);
                                        }}>
                                            <History size={18} />
                                            <span>
                                                <strong>Yeniden değerlendirme</strong>
                                                <small>{maskName(c.name, privateMode)} · {c.recallDate}</small>
                                            </span>
                                            <ChevronRight size={17} />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            </div>

            {/* ── Ölçüm girişi ───────────────────────────────────────────────── */}
            {modal === 'measure' && selected && (
                <MeasureModal
                    title={`${maskName(selected.customerName, privateMode)} · ölçüm`}
                    reservation={selected}
                    recallDate={selCustomer?.recallDate}
                    onClose={() => setModal(null)}
                    onSave={async (painValue, romValue, recall) => {
                        const fields = { ...(selected.customFields || {}) };
                        if (painValue === null) delete fields[CF_PAIN]; else fields[CF_PAIN] = painValue;
                        if (romValue === null) delete fields[CF_ROM]; else fields[CF_ROM] = romValue;
                        const ok = await updateReservation(selected.id, { customFields: fields });
                        if (ok && selected.customerId && recall !== (selCustomer?.recallDate || '')) {
                            await updateCustomer(selected.customerId, { recallDate: recall });
                        }
                        if (ok) { setModal(null); toast.success('Ölçüm kaydedildi'); }
                    }}
                />
            )}

            {/* ── İşlevsel hedef + ev programı ───────────────────────────────── */}
            {modal === 'goal' && selected && selCustomer && (
                <GoalModal
                    title={`${maskName(selCustomer.name, privateMode)} · işlevsel hedef`}
                    customer={selCustomer}
                    onClose={() => setModal(null)}
                    onSave={async (goalValue, program, days) => {
                        const fields = { ...(selCustomer.customFields || {}) };
                        if (goalValue) fields[CF_GOAL] = goalValue; else delete fields[CF_GOAL];
                        if (program) fields[CF_HOME] = program; else delete fields[CF_HOME];
                        if (days === null) delete fields[CF_HOME_DAYS]; else fields[CF_HOME_DAYS] = days;
                        const ok = await updateCustomer(selCustomer.id, { customFields: fields });
                        if (ok) { setModal(null); toast.success('Hedef güncellendi'); }
                    }}
                />
            )}

            {/* ── Bildirimler ────────────────────────────────────────────────── */}
            {modal === 'notifications' && (
                <ModalShell eyebrow={notifications.length ? `${notifications.length} BAŞLIK` : 'GÜNCEL'}
                    title="Bildirimler" onClose={() => setModal(null)}>
                    {notifications.length === 0 ? (
                        <p className="modal-empty">Bekleyen bildirim yok.</p>
                    ) : (
                        <div className="modal-list">
                            {notifications.map((n) => (
                                <div key={n.title}>
                                    <span className={cn('decision-icon', n.tone)}><AlertCircle size={16} /></span>
                                    <span><strong>{n.title}</strong><small>{n.detail}</small></span>
                                    <span />
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="modal-note">
                        <ShieldCheck size={15} />
                        Bildirimler yalnız eksik kaydı ve zamanı gelen işi görünür kılar; tedavi kararı vermez.
                    </p>
                </ModalShell>
            )}

            {/* ── Tüm ev programları ─────────────────────────────────────────── */}
            {modal === 'exercise' && (
                <ModalShell eyebrow="HAFTALIK UYUM" title="Ev programları" onClose={() => setModal(null)}>
                    <div className="modal-list">
                        {homePrograms.map((h) => (
                            <div key={h.customer.id}>
                                <span className="avatar">{initialsOf(h.customer.name)}</span>
                                <span><strong>{maskName(h.customer.name, privateMode)}</strong><small>{h.program}</small></span>
                                <button type="button" className="button compact"
                                    onClick={() => openSupportMessage(h.customer)}>
                                    <MessageCircle size={15} />{h.days}/{HOME_TARGET}
                                </button>
                            </div>
                        ))}
                    </div>
                    <p className="modal-note">
                        <MessageCircle size={15} />
                        Destek mesajı gönderilmez; WhatsApp taslağı açılır, metin ve gönderim kararı sizde kalır.
                    </p>
                </ModalShell>
            )}

            {/* Seans notu — mevcut randevu düzenleme akışı yeniden kullanılır */}
            {noteRes && (
                <EditReservationModal
                    reservation={reservations.find((x) => x.id === noteRes.id) || noteRes}
                    isOpen={!!noteRes}
                    onClose={() => setNoteRes(null)}
                />
            )}
        </div>
    );
}

// ── Parçalar ────────────────────────────────────────────────────────────────

function MetricCard({ label, start, current, helper, tone, icon: Icon }: {
    label: string; start: string | null; current: string; helper: string; tone: string; icon: ElementType;
}) {
    return (
        <article className="metric-card">
            <span className={cn('metric-icon', tone)}><Icon size={18} /></span>
            <div className="metric-copy">
                <span>{label}</span>
                <strong>
                    {start && <><small>{start}</small><ArrowRight size={14} /></>}
                    {current}
                </strong>
                <em>{helper}</em>
            </div>
        </article>
    );
}

/** Ölçüm çizgisi — gerçek değerlerden çizilir, yorum eklenmez. */
function MeasureChart({ points }: { points: number[] }) {
    const last = points.slice(-5);
    const min = Math.min(...last);
    const max = Math.max(...last);
    const range = max - min || 1;
    const coords = last.map((v, i) => {
        const x = 8 + (i * (344 / Math.max(1, last.length - 1)));
        const y = 84 - ((v - min) / range) * 70;
        return [x, y] as const;
    });
    const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const area = `${line} L352 92 L8 92 Z`;
    return (
        <svg viewBox="0 0 360 94" role="img"
            aria-label={`Son ${last.length} ölçüm: ${last.join(', ')}`}>
            <defs>
                <linearGradient id="fzChartFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#2A9D8F" stopOpacity=".22" />
                    <stop offset="1" stopColor="#2A9D8F" stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={area} fill="url(#fzChartFill)" />
            <path d={line} fill="none" stroke="var(--fz-teal)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {coords.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r="5" fill="var(--dc-card)" stroke="var(--fz-teal)" strokeWidth="3" />
            ))}
        </svg>
    );
}

function ModalShell({ eyebrow, title, children, onClose }: {
    eyebrow: string; title: string; children: ReactNode; onClose: () => void;
}) {
    const { dark } = useTheme();
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div className={cn('dash-theme fz-ops-modal', dark && 'dark')} role="presentation"
            onMouseDown={onClose}>
            <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="fz-modal-title"
                onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <div>
                        <span className="eyebrow">{eyebrow}</span>
                        <h2 id="fz-modal-title">{title}</h2>
                    </div>
                    <button type="button" className="icon-button" autoFocus aria-label="Pencereyi kapat" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                {children}
            </section>
        </div>
    );
}

/** Ölçüm girişi — değerleri TERAPİST girer; sistem öneri üretmez. */
function MeasureModal({ title, reservation, recallDate, onClose, onSave }: {
    title: string;
    reservation: Reservation;
    recallDate?: string;
    onClose: () => void;
    onSave: (pain: number | null, rom: number | null, recall: string) => void | Promise<void>;
}) {
    const [pain, setPain] = useState(() => String(reservation.customFields?.[CF_PAIN] ?? ''));
    const [rom, setRom] = useState(() => String(reservation.customFields?.[CF_ROM] ?? ''));
    const [recall, setRecall] = useState(recallDate || '');
    const [saving, setSaving] = useState(false);

    const submit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSaving(true);
        await onSave(num(pain), num(rom), recall);
        setSaving(false);
    };

    return (
        <ModalShell eyebrow="ÖLÇÜMÜ TERAPİST GİRER" title={title} onClose={onClose}>
            <form className="measure-form" onSubmit={submit}>
                <div className="form-grid">
                    <label>
                        Ağrı bildirimi (0-10)
                        <input type="number" min={0} max={10} step={1} inputMode="numeric"
                            value={pain} onChange={(e) => setPain(e.target.value)} placeholder="örn. 3" />
                    </label>
                    <label>
                        Hareket açıklığı (°)
                        <input type="number" min={0} max={360} step={1} inputMode="numeric"
                            value={rom} onChange={(e) => setRom(e.target.value)} placeholder="örn. 118" />
                    </label>
                </div>
                <label>
                    Bir sonraki yeniden değerlendirme
                    <input type="date" value={recall} onChange={(e) => setRecall(e.target.value)} />
                </label>
                <div className="form-note">
                    <ShieldCheck size={18} />
                    Sistem tanı koymaz, tedavi önermez ve planı değiştirmez. Ölçüm türünü ve değeri terapist seçer.
                </div>
                <button className="button primary full" type="submit" disabled={saving}>
                    Ölçümü kaydet <ArrowRight size={17} />
                </button>
            </form>
        </ModalShell>
    );
}

/** İşlevsel hedef + ev programı — hasta kartına yazılır. */
function GoalModal({ title, customer, onClose, onSave }: {
    title: string;
    customer: Customer;
    onClose: () => void;
    onSave: (goal: string, program: string, days: number | null) => void | Promise<void>;
}) {
    const [goal, setGoal] = useState(() => text(customer.customFields?.[CF_GOAL]));
    const [program, setProgram] = useState(() => text(customer.customFields?.[CF_HOME]));
    const [days, setDays] = useState(() => String(customer.customFields?.[CF_HOME_DAYS] ?? ''));
    const [saving, setSaving] = useState(false);

    const submit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSaving(true);
        await onSave(goal.trim(), program.trim(), num(days));
        setSaving(false);
    };

    return (
        <ModalShell eyebrow="HASTANIN KENDİ HEDEFİ" title={title} onClose={onClose}>
            <form className="measure-form" onSubmit={submit}>
                <label>
                    İşlevsel hedef
                    <textarea rows={2} value={goal} onChange={(e) => setGoal(e.target.value)}
                        placeholder="örn. Saçını ağrısız toplayabilmek" />
                </label>
                <div className="form-grid">
                    <label>
                        Ev programı
                        <input value={program} onChange={(e) => setProgram(e.target.value)}
                            placeholder="örn. Omuz hareket programı" />
                    </label>
                    <label>
                        Haftalık uygulanan gün
                        <input type="number" min={0} max={HOME_TARGET} step={1} inputMode="numeric"
                            value={days} onChange={(e) => setDays(e.target.value)} placeholder={`0-${HOME_TARGET}`} />
                    </label>
                </div>
                <div className="form-note">
                    <Target size={18} />
                    Hedef hastanın günlük yaşamından bir işlevdir; sistem hedef önermez.
                </div>
                <button className="button primary full" type="submit" disabled={saving}>
                    Kaydet <ArrowRight size={17} />
                </button>
            </form>
        </ModalShell>
    );
}
