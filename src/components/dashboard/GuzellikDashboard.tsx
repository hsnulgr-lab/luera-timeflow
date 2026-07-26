import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, Clock, DoorOpen, Gift, Lock, MapPin, Package, Plus, Sparkles, User, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { useResources } from '@/hooks/useResources';
import { useCustomers } from '@/hooks/useCustomers';
import { usePayments } from '@/hooks/usePayments';
import { useStaff } from '@/hooks/useStaff';
import { useOrgPackages } from '@/hooks/useOrgPackages';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import { todayISO, toISODate } from '@/utils/date';
import { MONO } from '@/components/dashboard/kpi';
import { BeautySessionModal, type SessionPreset } from '@/components/beauty/BeautySessionModal';
import { advancePatch, phaseOf, minsSince } from '@/lib/sessionPhase';
import type { SessionPhase } from '@/lib/sessionPhase';
import type { Customer, Reservation, Service, TreatmentPlan } from '@/types';
import './beautyOps.css';
import { reservationPrice } from '@/utils/reservationServices';

// ── Güzellik Dashboard'u · "Günün Akışı" ─────────────────────────────────────
// Tasarım: design_handoff_gunun_akisi. İlke — dashboard bir takvim değildir;
// gün tek bir dikey akış olarak okunur (geçmiş → şu an → gelecek) ve her satır
// tek tıkla çözülür. Saat eksenli çizelge Seans Takvimi sayfasında yaşar.

const DAY_OPEN = 9;
const DAY_CLOSE = 19;

// Gün planı ızgarası — saat başına 56px (prototipin 48px'i ekranda küçük kalıyordu)
const PPH = 56;

// Faz → ızgara/nokta rengi sınıfı ve ekranda görünen etiket
const PHASE_UI: Record<SessionPhase, string> = {
    wait: 'upcoming', arrived: 'waiting', active: 'active', done: 'checkout', completed: 'completed',
};
const PHASE_TR: Record<SessionPhase, string> = {
    wait: 'Bekleniyor', arrived: 'Geldi · bekliyor', active: 'İşlemde', done: 'Ödeme bekliyor', completed: 'Tamamlandı',
};

// Derinlik gölgeyle sağlanır (handoff) — kartlar #FFFDFB zeminde sayfadan kalkar
const SH_MD = '0 2px 4px rgba(14,14,14,.05),0 10px 26px rgba(14,14,14,.09)';

const timeToH = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h + (m || 0) / 60;
};
const initialsOf = (name: string) => name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toLocaleUpperCase('tr');
const fmtTL = (n: number) => `₺${Math.round(n).toLocaleString('tr-TR')}`;

type CabinStatus = 'busy' | 'prep' | 'free';

export function GuzellikDashboard() {
    const navigate = useNavigate();
    const { dark } = useTheme();
    const { reservations, settings, updateReservation, addReservation } = useReservations();
    const { resources } = useResources();
    const { customers, customerById, updateCustomer } = useCustomers();
    const { staff } = useStaff();
    const { packages, refresh: refreshPackages } = useOrgPackages();
    const { addPayment } = usePayments();
    const today = todayISO();

    // Canlı sayaçlar 30 saniyede bir tazelenir
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(t);
    }, []);
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const [modalCustomer, setModalCustomer] = useState<Customer | null | undefined>(undefined);
    // Gün planındaki boş saatten açıldığında saat/sütun önden dolar
    const [modalPreset, setModalPreset] = useState<SessionPreset | undefined>(undefined);
    const [walkInOpen, setWalkInOpen] = useState(false);
    // Operasyon kontrolü: sütunlar ünite mi uzman mı, ortak ekranda soyad maskesi,
    // ve akış/ızgara arasında paylaşılan seçili seans
    const [laneMode, setLaneMode] = useState<'unit' | 'staff'>('unit');
    const [privacy, setPrivacy] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const active = useMemo(() => reservations.filter((r) => r.status !== 'cancelled'), [reservations]);
    const todayList = useMemo(
        () => active.filter((r) => r.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [active, today],
    );
    const activeResources = useMemo(() => resources.filter((r) => r.isActive).sort((a, b) => a.sort - b.sort), [resources]);
    const activeStaff = useMemo(() => staff.filter((s) => s.isActive !== false), [staff]);
    const services: Service[] = useMemo(() => settings.services || [], [settings.services]);

    // Seansın tutarı: hizmet fiyatı + adisyona eklenen kalemler
    const sessionAmount = useMemo(() => (r: Reservation): number => {
        const extras = (r.adisyonItems || []).reduce((sum, i) => sum + (i.price || 0), 0);
        const base = reservationPrice(r, services);
        return base + extras;
    }, [services]);

    // ── Faz kümeleri ──────────────────────────────────────────────────────────
    const waiting = useMemo(() => todayList.filter((r) => phaseOf(r) === 'arrived'), [todayList]);
    const inService = useMemo(() => todayList.filter((r) => phaseOf(r) === 'active'), [todayList]);
    const atTill = useMemo(() => todayList.filter((r) => phaseOf(r) === 'done'), [todayList]);
    const doneToday = useMemo(() => todayList.filter((r) => phaseOf(r) === 'completed'), [todayList]);
    // Akışın "şu an" bölgesi: bekleyenler → işlemdekiler → kasadakiler
    const inSalon = useMemo(() => [...waiting, ...inService, ...atTill], [waiting, inService, atTill]);

    // Gelecek seanslar (henüz gelmemiş, saati geçmemiş)
    const upcoming = useMemo(
        () => todayList.filter((r) => phaseOf(r) === 'wait' && r.endTime >= nowTime),
        [todayList, nowTime],
    );
    // Saati geçmiş ama hiç gelmemiş (customerArrivedAt yok) — no-show. Başlıktaki
    // "planlı = tamamlandı + içeride + kaldı + gelmedi" denkliğini tamamlar.
    const noShow = useMemo(
        () => todayList.filter((r) => phaseOf(r) === 'wait' && r.endTime < nowTime),
        [todayList, nowTime],
    );
    const nextThree = upcoming.slice(0, 3);

    // ── Kabin durumu şeridi (ızgaranın yerine geçer) ──────────────────────────
    const cabins = useMemo(() => activeResources.map((res) => {
        const busyWith = inService.find((r) => r.resourceId === res.id);
        const prepFor = waiting.find((r) => r.resourceId === res.id);
        const status: CabinStatus = busyWith ? 'busy' : prepFor ? 'prep' : 'free';
        const staffName = busyWith?.staffName || prepFor?.staffName
            || todayList.find((r) => r.resourceId === res.id)?.staffName || '';
        return { id: res.id, name: res.name, staffName, status, freeAt: busyWith?.endTime };
    }), [activeResources, inService, waiting, todayList]);

    const nextFreeCabin = useMemo(() => {
        const busy = cabins.filter((c) => c.status === 'busy' && c.freeAt).sort((a, b) => (a.freeAt || '').localeCompare(b.freeAt || ''));
        return busy[0] || null;
    }, [cabins]);
    const firstFreeCabin = useMemo(() => cabins.find((c) => c.status === 'free') || null, [cabins]);

    // ── Personel şeridi: kim müsait, kim yüklü ────────────────────────────────
    const staffStrip = useMemo(() => activeStaff.map((s) => {
        const withNow = inService.find((r) => r.staffId === s.id);
        const count = todayList.filter((r) => r.staffId === s.id).length;
        return { id: s.id, name: s.name, busyWith: withNow?.customerName, count };
    }), [activeStaff, inService, todayList]);

    // ── Gizlilik: ortak ekranda soyad maskelenir (yetki değil, nezaket) ───────
    const mask = useMemo(() => (name: string) => {
        if (!privacy || !name) return name;
        const parts = name.trim().split(/\s+/);
        if (parts.length < 2) return parts[0] || name;
        return `${parts[0]} ${parts[parts.length - 1][0].toLocaleUpperCase('tr')}.`;
    }, [privacy]);

    // ── Gün planı: eksen + boş-saat katlama ───────────────────────────────────
    // Tek aykırı seans (örn. gece 00:14) tüm günü esnetmesin: mesai dışı kalan
    // 2+ saatlik tam boş bloklar ince banda katlanır. Eksen gerçek işi gösterir.
    const GAP_MIN = 2;
    const GAP_BAND = 30;
    const grid = useMemo(() => {
        const wh = settings.workingHours?.find((w) => w.day === new Date().getDay());
        const open = wh?.start ? timeToH(wh.start) : DAY_OPEN;
        const close = wh?.end ? timeToH(wh.end) : DAY_CLOSE;
        let lo = open, hi = close;
        for (const r of todayList) { lo = Math.min(lo, timeToH(r.startTime)); hi = Math.max(hi, timeToH(r.endTime)); }
        const nowH = now.getHours() + now.getMinutes() / 60;
        if (nowH >= lo - 1 && nowH <= hi + 1) { lo = Math.min(lo, nowH); hi = Math.max(hi, nowH); }
        const from = Math.max(0, Math.floor(lo));
        const to = Math.min(24, Math.max(from + 4, Math.ceil(hi)));

        const busy = (h: number) => {
            if (h >= Math.floor(open) && h < Math.ceil(close)) return true;
            return todayList.some((r) => timeToH(r.startTime) < h + 1 && timeToH(r.endTime) > h);
        };
        const raw: { type: 'hours' | 'gap'; from: number; to: number }[] = [];
        let k = from;
        while (k < to) {
            if (busy(k)) { let j = k; while (j < to && busy(j)) j++; raw.push({ type: 'hours', from: k, to: j }); k = j; }
            else { let j = k; while (j < to && !busy(j)) j++; raw.push({ type: j - k >= GAP_MIN ? 'gap' : 'hours', from: k, to: j }); k = j; }
        }
        const merged: typeof raw = [];
        for (const s of raw) {
            const last = merged[merged.length - 1];
            if (s.type === 'hours' && last?.type === 'hours' && last.to === s.from) last.to = s.to;
            else merged.push({ ...s });
        }
        let y = 0;
        const segs = merged.map((s) => {
            const h = s.type === 'gap' ? GAP_BAND : (s.to - s.from) * PPH;
            const seg = { ...s, y, h };
            y += h;
            return seg;
        });
        const topPx = (hf: number): number => {
            for (const s of segs) if (hf >= s.from && hf <= s.to) return s.type === 'gap' ? s.y + s.h / 2 : s.y + (hf - s.from) * PPH;
            return hf <= from ? 0 : y;
        };
        const ticks: number[] = [];
        for (const s of segs) if (s.type === 'hours') for (let h = s.from; h <= s.to; h++) ticks.push(h);
        return { from, to, segs, height: y, topPx, ticks: [...new Set(ticks)], gaps: segs.filter((s) => s.type === 'gap'), nowH };
    }, [todayList, now, settings.workingHours]);

    const canvasH = grid.height;
    const nowTop = grid.topPx(grid.nowH);
    const nowVisible = grid.nowH >= grid.from && grid.nowH <= grid.to
        && !grid.gaps.some((s) => grid.nowH > s.from && grid.nowH < s.to);

    // Sütunlar ünite ya da uzman; ataması olmayan seanslar için "Atanmamış" eklenir
    const lanes = useMemo(() => {
        // O sütundaki bugünkü seansların özeti — başlık "boş" derken altında kart
        // varsa kafa karıştırıyordu; "boş · 3 tamamlandı" diye netleşir
        const summarize = (key: 'unit' | 'staff', id: string) => {
            const list = todayList.filter((r) => ((key === 'unit' ? r.resourceId : r.staffId) || '__none') === id);
            const done = list.filter((r) => phaseOf(r) === 'completed').length;
            return { total: list.length, done };
        };
        if (laneMode === 'unit') {
            const base = cabins.map((c) => {
                const { total, done } = summarize('unit', c.id);
                const sub = c.status === 'busy' ? `~${c.freeAt} boşalıyor`
                    : c.status === 'prep' ? 'hazırlanıyor'
                        : done > 0 ? `boş · ${done} tamamlandı` : total > 0 ? `${total} seans` : 'boş';
                return { id: c.id, name: c.name, tone: c.status, sub };
            });
            if (todayList.some((r) => !r.resourceId)) base.push({ id: '__none', name: 'Atanmamış', tone: 'free' as CabinStatus, sub: 'ünite seçilmedi' });
            return base;
        }
        const base = staffStrip.map((s) => {
            const { done } = summarize('staff', s.id);
            const sub = s.busyWith ? `${mask(s.busyWith)} ile` : done > 0 ? `boş · ${done} tamamlandı` : `${s.count} seans`;
            return { id: s.id, name: s.name, tone: (s.busyWith ? 'busy' : 'free') as CabinStatus, sub };
        });
        if (todayList.some((r) => !r.staffId)) base.push({ id: '__none', name: 'Atanmamış', tone: 'free' as CabinStatus, sub: 'uzman seçilmedi' });
        return base;
    }, [laneMode, cabins, staffStrip, todayList, mask]);

    const laneKeyOf = useMemo(
        () => (r: Reservation) => (laneMode === 'unit' ? r.resourceId : r.staffId) || '__none',
        [laneMode],
    );

    // Gün planındaki boş saate tıklayınca seans modalı o saat/sütunla açılır —
    // seans takvimindeki "+" yakalayıcısının aynısı (bkz. DayAgendaGrid).
    const openSlot = (hour: number, laneId: string) => {
        // Geçmiş bir saate tıklandıysa saati önden doldurmuyoruz — geçmişe randevu
        // kaydedilemediği için seçili ama tıklanamaz bir slot göstermek olurdu.
        const now = new Date();
        const past = hour + 1 <= now.getHours() + now.getMinutes() / 60;
        setModalPreset({
            date: today,
            ...(past ? {} : { slot: `${String(hour).padStart(2, '0')}:00` }),
            ...(laneId === '__none' ? {} : laneMode === 'unit' ? { resourceId: laneId } : { staffId: laneId }),
        });
        setModalCustomer(null);
    };

    // "+" gösterilecek saatler: ızgaradaki tam saatler, yalnız katlanmış boş
    // bantlar hariç. Seans takvimiyle (DayAgendaGrid) aynı davranış — geçmiş
    // saatler de tıklanabilir; o durumda modal saat seçimini boş bırakır.
    const addableHours = useMemo(
        () => grid.ticks.filter((h) => h < grid.to && !grid.gaps.some((g) => h >= g.from && h < g.to)),
        [grid],
    );

    // Çakışan seanslar birbirini örtmesin: küme içinde sütunlara paylaştırılır
    const placed = useMemo(() => {
        const map = new Map<string, { r: Reservation; top: number; height: number; col: number; cols: number }[]>();
        for (const lane of lanes) {
            const items = todayList
                .filter((r) => laneKeyOf(r) === lane.id)
                .map((r) => ({ r, s: timeToH(r.startTime), e: Math.max(timeToH(r.endTime), timeToH(r.startTime) + 0.25) }))
                .sort((a, b) => a.s - b.s);
            const out: { r: Reservation; top: number; height: number; col: number; cols: number }[] = [];
            let cluster: typeof items = [];
            let clusterEnd = -1;
            const flush = () => {
                if (cluster.length === 0) return;
                const colEnds: number[] = [];
                const assigned = cluster.map((it) => {
                    let c = colEnds.findIndex((e) => e <= it.s + 1e-9);
                    if (c === -1) c = colEnds.length;
                    colEnds[c] = it.e;
                    return { it, col: c };
                });
                for (const { it, col } of assigned) {
                    out.push({
                        r: it.r,
                        top: grid.topPx(it.s),
                        height: Math.max(44, (it.e - it.s) * PPH),
                        col, cols: colEnds.length,
                    });
                }
                cluster = [];
                clusterEnd = -1;
            };
            for (const it of items) {
                if (cluster.length > 0 && it.s >= clusterEnd - 1e-9) flush();
                cluster.push(it);
                clusterEnd = Math.max(clusterEnd, it.e);
            }
            flush();
            map.set(lane.id, out);
        }
        return map;
    }, [lanes, todayList, laneKeyOf, grid]);

    // ── KPI hesapları ─────────────────────────────────────────────────────────
    const finishedPackages = useMemo(
        () => packages.filter((p) => p.status !== 'cancelled' && p.sessionCount > 1 && p.sessionsDone >= p.sessionCount),
        [packages],
    );


    // ── Aksiyon kuyruğu ───────────────────────────────────────────────────────
    const futureByCustomer = useMemo(() => {
        const set = new Set<string>();
        for (const r of active) if (r.date > today || (r.date === today && r.startTime > nowTime)) set.add(r.customerId);
        return set;
    }, [active, today, nowTime]);

    const unplanned = useMemo(() => packages
        .filter((p) => p.status === 'active' && p.sessionsDone < p.sessionCount && !futureByCustomer.has(p.customerId))
        .map((p) => ({ plan: p, customer: customerById.get(p.customerId) }))
        .filter((x): x is { plan: typeof x.plan; customer: Customer } => Boolean(x.customer))
        .slice(0, 3), [packages, futureByCustomer, customerById]);

    const renewals = useMemo(() => finishedPackages
        .map((p) => ({ plan: p, customer: customerById.get(p.customerId) }))
        .filter((x): x is { plan: typeof x.plan; customer: Customer } => Boolean(x.customer))
        .slice(0, 3), [finishedPackages, customerById]);

    const lost = useMemo(() => {
        const cutoff = new Date(now);
        cutoff.setDate(now.getDate() - 60);
        const cutoffISO = toISODate(cutoff);
        return customers
            .filter((c) => c.lastVisit && c.lastVisit < cutoffISO && !futureByCustomer.has(c.id))
            .sort((a, b) => (a.lastVisit || '').localeCompare(b.lastVisit || ''))
            .slice(0, 2);
    }, [customers, futureByCustomer, now]);

    const tomorrowPending = useMemo(() => {
        const t = new Date(now);
        t.setDate(now.getDate() + 1);
        const iso = toISODate(t);
        return active.filter((r) => r.date === iso && r.status === 'pending').slice(0, 2);
    }, [active, now]);

    // Sadakat: eşiğe ulaşmış müşteriler — hediye hak etti
    const loyaltyThreshold = settings.loyaltyThreshold ?? 10;
    const loyaltyOn = settings.loyaltyEnabled !== false;
    const giftEarned = useMemo(() => loyaltyOn
        ? customers.filter((c) => (c.loyaltyStamps ?? 0) >= loyaltyThreshold).slice(0, 2)
        : [], [customers, loyaltyOn, loyaltyThreshold]);

    const actionCount = unplanned.length + renewals.length + lost.length + tomorrowPending.length + giftEarned.length;

    // Müşteri başına aktif paket — kartta seans ilerlemesi
    const pkgByCustomer = useMemo(() => {
        const m = new Map<string, TreatmentPlan>();
        for (const p of packages) {
            if (p.status !== 'active') continue;
            const prev = m.get(p.customerId);
            if (!prev || p.sessionsDone / p.sessionCount > prev.sessionsDone / prev.sessionCount) m.set(p.customerId, p);
        }
        return m;
    }, [packages]);

    const serviceColor = (name: string) => services.find((s) => s.name === name)?.color || 'var(--dc-orange)';
    const openCustomer = (id?: string) => id && navigate(`/beauty-customer/${id}`);
    const cabinName = (id?: string) => cabins.find((c) => c.id === id)?.name;

    // Müşterinin salondaki fiziksel konumu — fazdan türetilir, yeni kolon yok
    const locationOf = (r: Reservation): string => {
        const ph = phaseOf(r);
        if (ph === 'arrived') return 'Bekleme alanı';
        if (ph === 'active') return cabinName(r.resourceId) || 'İşlemde';
        if (ph === 'done') return 'Kasa';
        if (ph === 'completed') return 'Ayrıldı';
        return 'Salon dışında';
    };

    // Akış kartı ile ızgara aynı seçimi paylaşır; seçim yoksa salondaki ilk kişi
    const selected = useMemo(
        () => todayList.find((r) => r.id === selectedId) || inSalon[0] || upcoming[0] || todayList[0] || null,
        [todayList, selectedId, inSalon, upcoming],
    );

    // ── Faz aksiyonları ───────────────────────────────────────────────────────
    const advance = async (r: Reservation, to: 'arrived' | 'active' | 'completed') => {
        if (busyId) return;
        setBusyId(r.id);
        await updateReservation(r.id, advancePatch(to));
        // Seans tamamlanınca paket sayacı artar; kuyruk bayat kalmasın diye tazele
        if (to === 'completed') void refreshPackages();
        setBusyId(null);
    };

    // Ödeme Al: tahsilat + sadakat damgası + seansı kapat
    const takePayment = async (r: Reservation) => {
        if (busyId) return;
        setBusyId(r.id);
        const amount = sessionAmount(r);
        if (amount > 0) {
            await addPayment({
                customerId: r.customerId, reservationId: r.id, staffId: r.staffId,
                type: 'service', description: `${r.service} · ${r.customerName}`,
                amount, method: 'cash',
            });
        }
        await updateReservation(r.id, { status: 'completed', isPaid: true });
        // Dijital müşteri kartı — her tamamlanan seans bir damga
        if (loyaltyOn && r.customerId) {
            const c = customerById.get(r.customerId);
            const next = (c?.loyaltyStamps ?? 0) + 1;
            await updateCustomer(r.customerId, { loyaltyStamps: next });
            if (next >= loyaltyThreshold) toast.success(`🎁 ${r.customerName} hediye hak etti — ${next}/${loyaltyThreshold} damga`);
            else toast.success(`Damga eklendi · ${next}/${loyaltyThreshold}`);
        }
        void refreshPackages();
        setBusyId(null);
    };

    // ── AI şeridi: bağlamsal tek cümle ────────────────────────────────────────
    const aiHint = useMemo(() => {
        const late = waiting
            .map((r) => ({ r, mins: r.customerArrivedAt ? minsSince(r.customerArrivedAt, now) : 0 }))
            .filter((x) => x.mins >= 10)
            .sort((a, b) => b.mins - a.mins)[0];
        if (late) {
            const cab = cabins.find((c) => c.id === late.r.resourceId);
            const alt = firstFreeCabin && firstFreeCabin.id !== late.r.resourceId ? firstFreeCabin.name : null;
            return <><b className="text-[var(--dc-ink)] font-bold">{late.r.customerName}</b> {late.mins} dakikadır bekliyor{cab?.freeAt && <> ve {cab.name} daha {cab.freeAt}'te boşalıyor</>} — {alt ? <>ikram önerin ya da <b className="text-[var(--dc-ink)] font-bold">{alt}</b>'e alalım mı?</> : 'ikram sunmayı unutmayın.'}</>;
        }
        if (finishedPackages.length > 0) {
            return <><b className="text-[var(--dc-ink)] font-bold">{finishedPackages.length} müşterinin</b> paketi bitti — bugün teklif göndermek en verimli an.</>;
        }
        if (atTill.length > 0) {
            return <><b className="text-[var(--dc-ink)] font-bold">{atTill.length} müşteri</b> kasada bekliyor — tahsilatı tamamlayıp günü kapatabilirsiniz.</>;
        }
        // Söyleyecek bağlamsal bir şey yoksa şerit hiç görünmez — dolgu cümle kurmayız
        return null;
    }, [waiting, now, cabins, firstFreeCabin, finishedPackages, atTill]);

    // ── Kurulum durumu: sistem bomboşsa yönlendirici ekran ────────────────────
    const setupSteps = useMemo(() => [
        { label: 'Kabinlerini ekle', done: activeResources.length > 0, to: '/settings' },
        { label: 'Personeli ekle', done: activeStaff.length > 0, to: '/staff' },
        { label: 'Hizmet ve fiyatları gir', done: services.some((s) => (s.price ?? 0) > 0), to: '/settings?tab=services' },
        { label: 'İlk randevunu oluştur', done: reservations.length > 0, to: '/calendar' },
    ], [activeResources.length, activeStaff.length, services, reservations.length]);
    const setupDone = setupSteps.filter((s) => s.done).length;
    const needsSetup = setupDone < setupSteps.length;

    const dayNum = now.getDate();
    const weekday = now.toLocaleDateString('tr-TR', { weekday: 'long' });
    const monthShort = now.toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' });

    // ── Sadakat damgası göstergesi ────────────────────────────────────────────
    const StampRow = ({ customerId, color }: { customerId: string; color: string }) => {
        if (!loyaltyOn) return null;
        const stamps = customerById.get(customerId)?.loyaltyStamps ?? 0;
        if (stamps === 0) return null;
        const earned = stamps >= loyaltyThreshold;
        return (
            <span className="inline-flex items-center gap-1.5" title={earned ? 'Hediye hak edildi 🎁' : `${loyaltyThreshold - stamps} seans sonra hediye 🎁`}>
                <span className="flex gap-[3px]">
                    {Array.from({ length: Math.min(loyaltyThreshold, 10) }, (_, i) => (
                        <span key={i} className="w-[5px] h-[5px] rounded-full"
                            style={{ background: i < stamps ? (earned ? 'var(--dc-green)' : color) : 'var(--dc-surface3)' }} />
                    ))}
                </span>
                <span className={cn('text-[10px] font-semibold', earned ? 'text-[var(--dc-green)]' : 'text-[var(--dc-muted2)]')}
                    style={{ fontFamily: MONO }}>{stamps}/{loyaltyThreshold}{earned && ' 🎁'}</span>
            </span>
        );
    };

    return (
        <div className={cn('dash-theme gz-ops flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--dc-page)]', dark && 'dark')}>
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <div className="max-w-[1240px] mx-auto space-y-3.5">

                    {/* Kurulum kartı — yalnız sistem eksikken */}
                    {needsSetup && (
                        <section className="rounded-2xl bg-[var(--dc-surface)] border border-[var(--dc-border)] shadow-[0_1px_3px_rgba(14,14,14,0.06)] p-5">
                            <div className="flex items-baseline gap-2 flex-wrap">
                                <h2 className="text-[17px] font-extrabold text-[var(--dc-ink)] tracking-[-0.02em]">{settings.businessName || 'Salonunuza'} hoş geldiniz 👋</h2>
                                <span className="text-[12.5px] text-[var(--dc-muted)]">{setupSteps.length} adımda hazırsınız</span>
                                <span className="ml-auto text-[11px] font-semibold text-[var(--dc-muted)]" style={{ fontFamily: MONO }}>{setupDone}/{setupSteps.length}</span>
                            </div>
                            <div className="h-[5px] rounded-full bg-[var(--dc-surface3)] overflow-hidden mt-2.5">
                                <span className="block h-full rounded-full bg-[var(--dc-green)] transition-[width]" style={{ width: `${(setupDone / setupSteps.length) * 100}%` }} />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-3.5">
                                {setupSteps.map((step, i) => {
                                    const isNext = !step.done && setupSteps.slice(0, i).every((s) => s.done);
                                    return (
                                        <button key={step.label} onClick={() => navigate(step.to)}
                                            className={cn('flex items-center gap-2.5 px-3.5 py-3 rounded-xl border text-left transition-all',
                                                step.done ? 'border-[var(--dc-border)] bg-[var(--dc-surface2)]'
                                                    : isNext ? 'border-[var(--dc-orange)] bg-[var(--dc-orange-soft)] hover:-translate-y-px'
                                                        : 'border-[var(--dc-border)] hover:bg-[var(--dc-surface2)]')}>
                                            <span className={cn('w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold flex-shrink-0',
                                                step.done ? 'bg-[var(--dc-green)] text-white' : isNext ? 'bg-[var(--dc-orange)] text-white' : 'bg-[var(--dc-surface3)] text-[var(--dc-muted)]')}>
                                                {step.done ? '✓' : i + 1}
                                            </span>
                                            <span className={cn('text-[12.5px] font-semibold', step.done ? 'text-[var(--dc-muted)]' : 'text-[var(--dc-ink)]')}>{step.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[11.5px] text-[var(--dc-muted)] mt-3">Kurulum bitince günün akışı burada görünecek.</p>
                        </section>
                    )}

                    {/* Karşılama */}
                    <section className="rounded-[20px] bg-[var(--dc-card)] border border-[var(--dc-border)] overflow-hidden flex items-stretch" style={{ boxShadow: SH_MD }}>
                        <div className="flex-shrink-0 w-[104px] bg-[var(--dc-inkbox)] flex flex-col items-center justify-center gap-0.5 px-3 py-5">
                            <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--dc-onbox-60)]" style={{ fontFamily: MONO }}>{weekday}</span>
                            <span className="text-[40px] font-black text-[var(--dc-inkbox-fg)] leading-none tracking-[-0.04em]">{dayNum}</span>
                            <span className="text-[11.5px] font-semibold text-[var(--dc-onbox-70)]">{monthShort}</span>
                        </div>
                        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-5 px-6 py-5">
                            <div className="flex-1 min-w-[260px]">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--dc-muted)] mb-1.5" style={{ fontFamily: MONO }}>
                                    {settings.businessName || 'Güzellik Salonu'} · {nowTime}
                                </p>
                                {/* Karşılama YALNIZ günün iş hacmini söyler. Salonun anlık
                                    durumu ("sakin" / "N müşteri içeride") tek yerde — alttaki
                                    salon panelinde — yaşar; burada tekrar edilmez. */}
                                <h1 className="text-[23px] font-extrabold text-[var(--dc-ink)] tracking-[-0.03em] leading-[1.18]">
                                    {todayList.length === 0
                                        ? <>Bugün için planlanmış seans yok ✨</>
                                        : <>Bugün <b className="text-[var(--dc-orange-d)]">{todayList.length} seans</b> planlı.</>}
                                </h1>
                                <p className="text-[13px] text-[var(--dc-muted)] mt-1.5">
                                    {todayList.length > 0 && <>
                                        {doneToday.length} tamamlandı
                                        {inSalon.length > 0 && <> · {inSalon.length} içeride</>}
                                        {upcoming.length > 0 && <> · {upcoming.length} kaldı</>}
                                        {noShow.length > 0 && <> · <span className="text-[var(--dc-red)]">{noShow.length} gelmedi</span></>}
                                        {' · '}
                                    </>}
                                    {nextFreeCabin && <>{nextFreeCabin.name} <span style={{ fontFamily: MONO }}>{nextFreeCabin.freeAt}</span>'te boşalıyor · </>}
                                    {nextThree[0] && <>sıradaki <span style={{ fontFamily: MONO }}>{nextThree[0].startTime}</span> {mask(nextThree[0].customerName)}</>}
                                    {!nextThree[0] && actionCount > 0 && <><b className="text-[var(--dc-ink)] font-bold">{actionCount} fırsat</b> bekliyor</>}
                                </p>
                            </div>
                            {/* Diğer modüllerle aynı buton dili: siyah birincil, hover'da turuncu */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <button className="btn secondary" onClick={() => navigate('/calendar')}>Takvimi Aç</button>
                                <button className="btn primary" onClick={() => setModalCustomer(null)}><Plus className="w-3.5 h-3.5" />Yeni Seans</button>
                            </div>
                        </div>
                    </section>


                    {/* Salon durumu paneli — ünite şeridinin yerini alır, canlı veriyle çalışır */}
                    {(() => {
                            // ── Salon Sakin: solda boş üniteler, sağda koyu SIRADAKİ kartı ──
                            const nextUp = nextThree[0];
                            const nowMin = now.getHours() * 60 + now.getMinutes();
                            const etaMin = nextUp ? Math.round(timeToH(nextUp.startTime) * 60) - nowMin : 0;
                            const etaText = etaMin <= 1 ? 'birazdan'
                                : etaMin < 90 ? `${etaMin} dk sonra`
                                    : `${Math.round(etaMin / 60)} saat sonra`;
                            const pkg = nextUp ? pkgByCustomer.get(nextUp.customerId) : undefined;
                            const freeCabins = cabins.filter((c) => c.status === 'free');
                            // Aynı saatte birden çok uzmanın müşterisi olabilir — hepsi tek kartta
                            const nextGroup = nextUp ? upcoming.filter((r) => r.startTime === nextUp.startTime) : [];
                            const multi = nextGroup.length > 1;
                            const shown = nextGroup.slice(0, 3);

                            // Büyük panel YALNIZ en önemli şey olduğunda açılır:
                            //   salon boş + randevu var → tam panel (SIRADAKİ kartı yıldız)
                            //   salon boş + randevu yok → tek satır (yapacak iş yok)
                            //   salon DOLU              → tek satır (asıl iş akış panosunda)
                            if (inSalon.length === 0 && !nextUp) {
                                return (
                                    <section className="sakin-slim">
                                        <span className="sakin-pulse" />
                                        <b>Salon boş</b>
                                        <span className="slim-sep" />
                                        <span className="slim-note">
                                            {[
                                                doneToday.length > 0 && `bugün ${doneToday.length} seans tamamlandı`,
                                                'başka randevu yok',
                                                freeCabins.length > 0 && `${freeCabins.length} ünite hazır`,
                                            ].filter(Boolean).join(' · ')}
                                        </span>
                                        <button className="next-primary slim-cta" onClick={() => setWalkInOpen((v) => !v)}>
                                            <Zap />Randevusuz müşteri al
                                        </button>
                                    </section>
                                );
                            }

                            return (
                                <div className="sakin">
                                    <div className="sakin-left">
                                        <div className="sakin-head">
                                            <span className={cn('sakin-pulse', inSalon.length > 0 && 'busy')} />
                                            <span className="eyebrow">Şu an salonda</span>
                                            {/* 10 dk'yı geçen bekleme yoğunlukta gözden kaçıyordu */}
                                            {(() => {
                                                const lateOne = waiting
                                                    .map((r) => ({ r, mins: r.customerArrivedAt ? minsSince(r.customerArrivedAt, now) : 0 }))
                                                    .filter((x) => x.mins >= 10)
                                                    .sort((a, b) => b.mins - a.mins)[0];
                                                return lateOne ? (
                                                    <button className="slim-late" onClick={() => setSelectedId(lateOne.r.id)}>
                                                        ⚠ {mask(lateOne.r.customerName)} {lateOne.mins} dk bekliyor
                                                    </button>
                                                ) : null;
                                            })()}
                                        </div>
                                        {inSalon.length === 0 ? (
                                            <h2>Salon şu an sakin.<br /><span className="soft">{nextUp ? 'Sıradaki müşteriye hazırız.' : 'Günün geri kalanı boş.'}</span></h2>
                                        ) : (
                                            <h2>{inSalon.length} müşteri salonda.<br /><span className="soft">
                                                {[inService.length > 0 && `${inService.length} işlemde`, waiting.length > 0 && `${waiting.length} bekliyor`, atTill.length > 0 && `${atTill.length} kasada`].filter(Boolean).join(' · ')}
                                            </span></h2>
                                        )}
                                        {/* Öngörü satırı — YALNIZ bağlamsal AI ipucu varken çıkar.
                                            Dolgu cümle kurmuyoruz; başlığın söylediğini tekrar etmez. */}
                                        {aiHint && (
                                            <p className="sakin-sub">
                                                <Sparkles className="w-3.5 h-3.5 text-[var(--dc-orange)] flex-shrink-0" />
                                                <span>{aiHint}</span>
                                            </p>
                                        )}

                                        <div className="sakin-units-head">
                                            <span className="eyebrow">Üniteler</span>
                                            <span className={cn('sakin-count', freeCabins.length === 0 && 'full')}>
                                                {freeCabins.length > 0 ? `Boş · ${freeCabins.length}` : 'Hepsi dolu'}
                                            </span>
                                        </div>
                                        <div className="sakin-units">
                                            {cabins.length === 0 && <span className="sakin-empty">Henüz ünite eklenmemiş — Ayarlar'dan ekleyin.</span>}
                                            {cabins.map((c) => (
                                                <button key={c.id} className={cn('sakin-unit', c.status)}
                                                    onClick={() => setModalCustomer(null)}
                                                    title={c.status === 'busy' ? `${c.freeAt}'te boşalıyor` : c.status === 'prep' ? 'Hazırlanıyor' : 'Boş — seans ekle'}>
                                                    <DoorOpen /> {c.name}
                                                    {c.status === 'busy' && <em>{c.freeAt}</em>}
                                                    {c.status === 'prep' && <em>hazırlanıyor</em>}
                                                    <span className="st" />
                                                </button>
                                            ))}
                                        </div>

                                        <div className="sakin-divider" />
                                        <div className="sakin-waiting">
                                            <div className={cn('sakin-wicon', waiting.length > 0 && 'on')}><User /></div>
                                            <div className="sakin-waiting-txt">
                                                <b>{waiting.length > 0 ? `Bekleme odasında ${waiting.length} kişi` : 'Bekleme odası boş'}</b>
                                                {waiting.length > 0
                                                    ? <span>{waiting.map((r) => `${mask(r.customerName)} (${r.customerArrivedAt ? minsSince(r.customerArrivedAt, now) : 0} dk)`).join(' · ')}</span>
                                                    : nextUp
                                                        ? <span>Sıradaki randevu <span className="mono">{nextUp.startTime}</span> · {mask(nextUp.customerName)}</span>
                                                        : <span>Bugün başka randevu yok</span>}
                                            </div>
                                            <button className={cn('walkin-button', walkInOpen && 'on')} onClick={() => setWalkInOpen((v) => !v)}>
                                                <Zap className="w-3.5 h-3.5" />Randevusuz müşteri
                                            </button>
                                        </div>
                                    </div>

                                    <aside className={cn('next', !nextUp && 'empty')}>
                                        {nextUp ? (
                                            <>
                                                <div className="next-head">
                                                    <span className="eyebrow">Sıradaki</span>
                                                    {multi ? <span className="next-badge">{nextGroup.length} müşteri</span> : <span className="next-dot" />}
                                                </div>
                                                <div className="next-clock">{nextUp.startTime}</div>
                                                <div className="next-eta">{etaText}</div>

                                                {multi ? (
                                                    // Aynı saatte birden çok müşteri: her satırın kendi "geldi" düğmesi
                                                    <div className="next-list">
                                                        {shown.map((r) => (
                                                            <div className="next-row" key={r.id}>
                                                                <span className="next-row-txt">
                                                                    <strong onClick={() => openCustomer(r.customerId)}>{mask(r.customerName)}</strong>
                                                                    <small>{[r.service, r.staffName].filter(Boolean).join(' · ')}</small>
                                                                </span>
                                                                <button className="next-row-btn" title="Geldi olarak işaretle"
                                                                    disabled={busyId === r.id} onClick={() => void advance(r, 'arrived')}>
                                                                    <CalendarCheck />
                                                                </button>
                                                            </div>
                                                        ))}
                                                        {nextGroup.length > shown.length && (
                                                            <span className="next-more">+{nextGroup.length - shown.length} müşteri daha</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="next-cust">{mask(nextUp.customerName)}</div>
                                                        <div className="next-svc">
                                                            <span>{nextUp.service}</span>
                                                            {nextUp.staffName && <><span className="dotsep" /><span>{nextUp.staffName}</span></>}
                                                        </div>
                                                        {pkg && (
                                                            <div className="next-pkg">
                                                                <Package />
                                                                <div className="next-pkg-txt">
                                                                    <b>{pkg.title}</b>
                                                                    <div className="next-pkg-bar"><i style={{ width: `${Math.round((pkg.sessionsDone / pkg.sessionCount) * 100)}%` }} /></div>
                                                                </div>
                                                                <span className="next-pkg-count">{pkg.sessionsDone}/{pkg.sessionCount}</span>
                                                            </div>
                                                        )}
                                                        <div className="next-actions">
                                                            <button className="next-primary" disabled={busyId === nextUp.id} onClick={() => void advance(nextUp, 'arrived')}>
                                                                <CalendarCheck />Geldi olarak işaretle
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <div className="spark">✨</div>
                                                <span className="eyebrow">Sıradaki</span>
                                                {/* Salon durumu solda anlatılıyor — burada tekrar etmiyoruz */}
                                                <h3>Bugün başka randevu yok.</h3>
                                                <button className="next-primary" onClick={() => setModalCustomer(null)}><Plus />Randevusuz müşteri al</button>
                                            </>
                                        )}
                                    </aside>
                                </div>
                            );
                    })()}

                    {/* Randevusuz müşteri — hızlı başlatma */}
                    {walkInOpen && (
                        <WalkInForm
                            customers={customers}
                            services={services}
                            cabins={cabins}
                            staff={activeStaff}
                            onClose={() => setWalkInOpen(false)}
                            onStart={async (payload) => {
                                const created = await addReservation(payload);
                                if (created) {
                                    await updateReservation(created.id, {
                                        customerArrivedAt: new Date().toISOString(),
                                        arrivedAt: new Date().toISOString(),
                                    });
                                    toast.success(`${payload.customerName} işleme alındı ⚡`);
                                    setWalkInOpen(false);
                                }
                            }}
                        />
                    )}


                    {/* Ana bölüm */}
                    <section>

                        {/* SOL — OPERASYON KONTROLÜ */}
                        <div className="today-card">
                            <div className="today-header">
                                <div>
                                    <span className="eyebrow">OPERASYON KONTROLÜ</span>
                                    <h2>Bugünün planı</h2>
                                </div>
                                <div className="today-controls">
                                    <div className="segmented" aria-label="Plan sütunları">
                                        <button className={cn(laneMode === 'unit' && 'selected')} aria-pressed={laneMode === 'unit'}
                                            onClick={() => setLaneMode('unit')}>Üniteler</button>
                                        <button className={cn(laneMode === 'staff' && 'selected')} aria-pressed={laneMode === 'staff'}
                                            onClick={() => setLaneMode('staff')}>Uzmanlar</button>
                                    </div>
                                    <label className="privacy-switch" title="Ortak ekranda müşteri soyadını gizler">
                                        <Lock className="w-3 h-3" />
                                        <span>Gizlilik</span>
                                        <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
                                        <i />
                                    </label>
                                </div>
                            </div>

                            {/* Salon içi akış: Bekliyor → İşlemde → Kasada */}
                            <div className="salon-flow" aria-label="Salon içi müşteri akışı">
                                <div className="flow-title">
                                    <span className="live-dot" />Salon içi <small>{nowTime} · {inSalon.length} müşteri</small>
                                </div>
                                <div className="flow-columns">
                                    {([
                                        { key: 'waiting', title: 'Bekliyor', list: waiting },
                                        { key: 'active', title: 'İşlemde', list: inService },
                                        { key: 'checkout', title: 'Kasada', list: atTill },
                                    ] as const).map((stage) => (
                                        <div className="flow-stage" key={stage.key}>
                                            <div className="flow-stage-title">
                                                <span className={`status-dot ${stage.key}`} />{stage.title}<b>{stage.list.length}</b>
                                            </div>
                                            <div className="flow-list">
                                                {stage.list.length === 0 ? (
                                                    <p className="flow-empty">—</p>
                                                ) : stage.list.map((r) => {
                                                    const waitMin = r.customerArrivedAt ? minsSince(r.customerArrivedAt, now) : 0;
                                                    const runMin = r.arrivedAt ? minsSince(r.arrivedAt, now) : 0;
                                                    const late = stage.key === 'waiting' && waitMin >= 10;
                                                    const amount = sessionAmount(r);
                                                    // Yoğunlukta aksiyon satırın kendisinde olmalı — seçip
                                                    // aşağıdaki çubuğa inmek kişi başı 2 tık + göz gezintisiydi
                                                    const act = stage.key === 'waiting' ? { label: 'Kabine al', run: () => void advance(r, 'active') }
                                                        : stage.key === 'active' ? { label: 'Bitir', run: () => void advance(r, 'completed') }
                                                            : { label: amount > 0 ? `Ödeme al · ${fmtTL(amount)}` : 'Ödeme al', run: () => void takePayment(r) };
                                                    return (
                                                        <div key={r.id} role="button" tabIndex={0} aria-pressed={selected?.id === r.id}
                                                            className={cn('flow-person', selected?.id === r.id && 'selected', late && 'late')}
                                                            onClick={() => setSelectedId(r.id)}
                                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(r.id); } }}>
                                                            <span className="mini-avatar">{initialsOf(r.customerName)}</span>
                                                            <span className="flow-copy">
                                                                <strong>{mask(r.customerName)}</strong>
                                                                <small><MapPin className="w-2.5 h-2.5 flex-shrink-0" />{locationOf(r)}{r.staffName ? ` · ${r.staffName}` : ''}</small>
                                                            </span>
                                                            <span className="flow-tail">
                                                                <span className={cn('flow-time', late && 'warn')}>
                                                                    {stage.key === 'waiting' ? `${waitMin} dk`
                                                                        : stage.key === 'active' ? `${runMin} dk`
                                                                            : amount > 0 ? fmtTL(amount) : 'hazır'}
                                                                </span>
                                                                <button className="flow-act" disabled={busyId === r.id}
                                                                    onClick={(e) => { e.stopPropagation(); act.run(); }}>{act.label}</button>
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Seçili müşteri + bağlamsal tek eylem */}
                            {selected ? (() => {
                                const ph = phaseOf(selected);
                                const amount = sessionAmount(selected);
                                const pkg = pkgByCustomer.get(selected.customerId);
                                const cab = cabins.find((c) => c.id === selected.resourceId);
                                const cabBusy = ph === 'arrived' && cab?.status === 'busy';
                                return (
                                    <div className="selected-session" aria-live="polite">
                                        <span className={`status-dot ${PHASE_UI[ph]}`} />
                                        <div className="selected-copy">
                                            <div>
                                                <strong onClick={() => openCustomer(selected.customerId)}>{mask(selected.customerName)}</strong>
                                                <span className="status-label">{PHASE_TR[ph]}</span>
                                                <StampRow customerId={selected.customerId} color={serviceColor(selected.service)} />
                                            </div>
                                            <p>
                                                <span><Clock className="w-2.5 h-2.5" />{selected.startTime}–{selected.endTime}</span>
                                                <span>{selected.service}</span>
                                                {selected.staffName && <span><User className="w-2.5 h-2.5" />{selected.staffName}</span>}
                                                {cabinName(selected.resourceId) && <span><DoorOpen className="w-2.5 h-2.5" />Plan: {cabinName(selected.resourceId)}</span>}
                                                <span><MapPin className="w-2.5 h-2.5" />Şu an: {locationOf(selected)}</span>
                                                {pkg && <span>Paket: {pkg.sessionsDone}/{pkg.sessionCount}</span>}
                                            </p>
                                        </div>
                                        <div className="selected-actions">
                                            <button className="btn secondary small" onClick={() => openCustomer(selected.customerId)}>Müşteri kartı</button>
                                            {ph === 'wait' && (
                                                <button className="btn primary small" disabled={busyId === selected.id}
                                                    onClick={() => void advance(selected, 'arrived')}>Geldi</button>
                                            )}
                                            {ph === 'arrived' && (cabBusy ? (
                                                <span className="text-[10px] text-[var(--dc-muted)] text-right leading-snug" style={{ fontFamily: MONO }}>
                                                    {cab?.name}<br /><b className="text-[var(--dc-ink)]">~{cab?.freeAt}</b> boşalıyor
                                                </span>
                                            ) : (
                                                <button className="btn primary small" disabled={busyId === selected.id}
                                                    onClick={() => void advance(selected, 'active')}>Kabine al</button>
                                            ))}
                                            {ph === 'active' && (
                                                <button className="btn primary small" disabled={busyId === selected.id}
                                                    onClick={() => void advance(selected, 'completed')}>İşlemi bitir</button>
                                            )}
                                            {ph === 'done' && (
                                                <button className="btn primary small" disabled={busyId === selected.id}
                                                    onClick={() => void takePayment(selected)}>Ödeme al{amount > 0 ? ` · ${fmtTL(amount)}` : ''}</button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })() : (
                                <div className="selected-session">
                                    <span className="status-dot completed" />
                                    <div className="selected-copy">
                                        <div><strong>Bugün için seans yok</strong></div>
                                        <p><span>Randevusuz gelen müşteriyi yukarıdan hemen işleme alabilirsiniz.</span></p>
                                    </div>
                                    <div className="selected-actions">
                                        <button className="btn primary small" onClick={() => setModalCustomer(null)}>Yeni seans</button>
                                    </div>
                                </div>
                            )}

                            {/* Gün planı — dikey saat ekseni + ünite/uzman sütunları */}
                            <div className="schedule-wrap">
                                <div className="schedule-title">
                                    <div>
                                        <b>Gün planı</b>
                                        <span>{String(grid.from).padStart(2, '0')}:00–{String(grid.to).padStart(2, '0')}:00</span>
                                    </div>
                                    <small>{todayList.length} seans{atTill.length > 0 ? ` · ${atTill.length} ödeme bekliyor` : ''}</small>
                                </div>

                                {lanes.length === 0 ? (
                                    <p className="schedule-empty">Önce Ayarlar'dan kabin/ünite ekleyin — gün planı burada sütunlara ayrılacak.</p>
                                ) : (
                                    <>
                                        <div className="lane-heads" style={{ '--lanes': lanes.length } as React.CSSProperties}>
                                            <span className="axis-head">SAAT</span>
                                            {lanes.map((l, i) => (
                                                <span className={cn('lane-head', i % 2 === 1 && 'alt')} key={l.id}>
                                                    <b><i className={`unit-dot ${l.tone}`} />{l.name}</b>
                                                    <small>{l.sub}</small>
                                                </span>
                                            ))}
                                        </div>
                                        <div className="schedule-canvas" style={{ height: canvasH, '--lanes': lanes.length } as React.CSSProperties}>
                                            <span className="axis-band" />
                                            {nowVisible && <div className="past-band" style={{ height: nowTop }} />}
                                            {grid.gaps.map((s) => (
                                                <span key={`gap-${s.from}`} className="gap-band" style={{ top: s.y, height: s.h }}>
                                                    <b>{String(s.from).padStart(2, '0')}:00 – {String(s.to).padStart(2, '0')}:00 · boş</b>
                                                </span>
                                            ))}
                                            {grid.ticks.map((h) => (
                                                <Fragment key={h}>
                                                    <span className="hour-label" style={{ top: grid.topPx(h) }}>{String(h).padStart(2, '0')}:00</span>
                                                    <span className="hour-line" style={{ top: grid.topPx(h) }} />
                                                    {grid.ticks.includes(h + 1) && (
                                                        <span className="half-line" style={{ top: grid.topPx(h + 0.5) }} />
                                                    )}
                                                </Fragment>
                                            ))}
                                            {lanes.map((lane, i) => (
                                                <div className={cn('schedule-lane', i % 2 === 1 && 'alt')} key={lane.id} style={{ gridColumn: i + 2, gridRow: 1 }}>
                                                    {/* Boş saat yakalayıcıları — kartların ALTINDA durur, dolu
                                                        saatler kartla örtülür. */}
                                                    {addableHours.map((h) => (
                                                        <button key={`add-${h}`} type="button" className="slot-add"
                                                            style={{ top: grid.topPx(h) + 3, height: PPH - 6 }}
                                                            aria-label={`${lane.name} · ${String(h).padStart(2, '0')}:00 için yeni seans`}
                                                            onClick={() => openSlot(h, lane.id)}>
                                                            <span>+</span>
                                                        </button>
                                                    ))}
                                                    {(placed.get(lane.id) || []).map(({ r, top, height, col, cols }) => {
                                                        const ph = phaseOf(r);
                                                        return (
                                                            <button key={r.id} aria-pressed={selected?.id === r.id}
                                                                className={cn('appointment', PHASE_UI[ph], selected?.id === r.id && 'selected')}
                                                                style={{
                                                                    top, height,
                                                                    left: `calc(${(col / cols) * 100}% + ${col === 0 ? 5 : 2}px)`,
                                                                    width: `calc(${100 / cols}% - ${cols > 1 ? 7 : 10}px)`,
                                                                    // Hizmet rengi sol şeritte — durum rengi kart tonunda
                                                                    '--svc': serviceColor(r.service),
                                                                } as React.CSSProperties}
                                                                onClick={() => setSelectedId(r.id)}>
                                                                <i className="appointment-rail" />
                                                                {/* Durum kelimesi yazılmaz (kart tonu + rail söylüyor);
                                                                    hizmet saat satırında — rail rengi tek başına okunmaz */}
                                                                <small>{height >= 52 ? `${r.startTime} · ${r.service}` : r.startTime}</small>
                                                                <strong>{mask(r.customerName)}</strong>
                                                                {height >= 78 && r.staffName && <span>{r.staffName}</span>}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                            {nowVisible && <span className="now-line" style={{ top: nowTop }}><b>{nowTime}</b></span>}
                                        </div>
                                    </>
                                )}

                                {/* Mobil: ızgara yerine doğal liste */}
                                <div className="mobile-session-list">
                                    {todayList.map((r) => {
                                        const ph = phaseOf(r);
                                        return (
                                            <button key={r.id} className={cn(selected?.id === r.id && 'selected')} onClick={() => setSelectedId(r.id)}>
                                                <time>{r.startTime}</time>
                                                <span>
                                                    <strong>{mask(r.customerName)}</strong>
                                                    <small>{PHASE_TR[ph]} · {locationOf(r)}</small>
                                                </span>
                                                <i className={`status-dot ${PHASE_UI[ph]}`} />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                    </section>

                </div>
            </div>

            {modalCustomer !== undefined && (
                <BeautySessionModal
                    customer={modalCustomer}
                    preset={modalPreset}
                    onClose={() => { setModalCustomer(undefined); setModalPreset(undefined); }}
                    onCreated={() => { setModalCustomer(undefined); setModalPreset(undefined); void refreshPackages(); }}
                />
            )}
        </div>
    );
}

// ── Randevusuz müşteri: 4 tıkta işleme başlat ────────────────────────────────
function WalkInForm({ customers, services, cabins, staff, onClose, onStart }: {
    customers: Customer[];
    services: Service[];
    cabins: { id: string; name: string; status: CabinStatus }[];
    staff: { id: string; name: string }[];
    onClose: () => void;
    onStart: (payload: Omit<Reservation, 'id' | 'createdAt'>) => Promise<void>;
}) {
    const [query, setQuery] = useState('');
    const [picked, setPicked] = useState<Customer | null>(null);
    const [serviceId, setServiceId] = useState(services[0]?.id || '');
    const [cabinId, setCabinId] = useState(cabins.find((c) => c.status === 'free')?.id || '');
    const [staffId, setStaffId] = useState('');
    const [saving, setSaving] = useState(false);

    const results = useMemo(() => {
        const q = query.trim().toLocaleLowerCase('tr');
        if (!q || picked) return [];
        return customers.filter((c) => c.name.toLocaleLowerCase('tr').includes(q) || c.phone.includes(q)).slice(0, 4);
    }, [query, customers, picked]);

    const service = services.find((s) => s.id === serviceId);
    const canStart = Boolean(picked && service && !saving);

    const start = async () => {
        if (!picked || !service) return;
        setSaving(true);
        const now = new Date();
        const startTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const end = new Date(now.getTime() + (service.duration || 60) * 60_000);
        const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
        await onStart({
            customerId: picked.id, customerName: picked.name, customerPhone: picked.phone, customerEmail: picked.email,
            date: toISODate(now), startTime, endTime,
            service: service.name, serviceColor: service.color,
            status: 'confirmed',
            staffId: staffId || undefined,
            staffName: staff.find((s) => s.id === staffId)?.name,
            resourceId: cabinId || undefined,
        });
        setSaving(false);
    };

    return (
        <div className="mb-4 rounded-2xl border border-[var(--dc-orange)] bg-[var(--dc-orange-soft)] p-4">
            <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-[var(--dc-orange-d)]" />
                <span className="text-[13px] font-extrabold text-[var(--dc-ink)]">Randevusuz müşteri</span>
                <span className="text-[11.5px] text-[var(--dc-muted)]">kapıdan giren müşteriyi hemen işleme al</span>
                <button onClick={onClose} aria-label="Kapat" className="ml-auto w-7 h-7 rounded-full grid place-items-center text-[var(--dc-muted)] hover:bg-[var(--dc-surface2)] transition-colors">✕</button>
            </div>

            {!picked ? (
                <>
                    <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="İsim veya telefon yaz…"
                        className="w-full px-3.5 py-3 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-card)] text-[13.5px] text-[var(--dc-ink)] outline-none focus:outline-2 focus:outline-[var(--dc-orange)] focus:-outline-offset-1" />
                    <div className="mt-2 space-y-1.5">
                        {results.map((c) => (
                            <button key={c.id} onClick={() => setPicked(c)}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[var(--dc-card)] border border-[var(--dc-border)] hover:border-[var(--dc-ink)] transition-colors text-left">
                                <span className="w-[30px] h-[30px] rounded-[10px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[11px] font-extrabold grid place-items-center flex-shrink-0">{initialsOf(c.name)}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] font-bold text-[var(--dc-ink)] truncate">{c.name}</span>
                                    <span className="block text-[11px] text-[var(--dc-muted)]">{c.phone}</span>
                                </span>
                                {(c.loyaltyStamps ?? 0) > 0 && <span className="text-[10.5px] font-semibold text-[var(--dc-muted)] flex items-center gap-1" style={{ fontFamily: MONO }}><Gift className="w-3 h-3" />{c.loyaltyStamps}</span>}
                            </button>
                        ))}
                        {query.trim() && results.length === 0 && (
                            <p className="text-[12px] text-[var(--dc-muted)] px-1 py-2">Sonuç yok — Müşteriler sayfasından ekleyip geri dönün.</p>
                        )}
                    </div>
                </>
            ) : (
                <>
                    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[var(--dc-card)] border border-[var(--dc-border2)]">
                        <span className="w-[30px] h-[30px] rounded-[10px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[11px] font-extrabold grid place-items-center flex-shrink-0">{initialsOf(picked.name)}</span>
                        <span className="flex-1 min-w-0">
                            <span className="block text-[13.5px] font-bold text-[var(--dc-ink)] truncate">{picked.name}</span>
                            <span className="block text-[11.5px] text-[var(--dc-muted)]">{picked.phone}</span>
                        </span>
                        <button onClick={() => { setPicked(null); setQuery(''); }} className="text-[12px] font-bold text-[var(--dc-orange-d)] px-2.5 py-2 rounded-lg hover:bg-[var(--dc-orange-soft)] transition-colors">Değiştir</button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-3">
                        {services.map((s) => (
                            <button key={s.id} onClick={() => setServiceId(s.id)}
                                className={cn('inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-semibold border transition-colors',
                                    serviceId === s.id ? 'bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] border-[var(--dc-inkbox)]' : 'bg-[var(--dc-card)] border-[var(--dc-border)] text-[var(--dc-ink)] hover:border-[var(--dc-ink)]')}>
                                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />{s.name}
                                <span className="text-[10.5px] opacity-70" style={{ fontFamily: MONO }}>{s.duration}dk</span>
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 mt-3">
                        <select value={cabinId} onChange={(e) => setCabinId(e.target.value)} aria-label="Kabin"
                            className="px-3.5 py-2.5 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-card)] text-[12.5px] font-semibold text-[var(--dc-ink)] outline-none">
                            <option value="">Kabin fark etmez</option>
                            {cabins.map((c) => <option key={c.id} value={c.id} disabled={c.status === 'busy'}>{c.name}{c.status === 'busy' ? ' (dolu)' : ''}</option>)}
                        </select>
                        <select value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Personel"
                            className="px-3.5 py-2.5 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-card)] text-[12.5px] font-semibold text-[var(--dc-ink)] outline-none">
                            <option value="">Personel fark etmez</option>
                            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>

                    <button disabled={!canStart} onClick={() => void start()}
                        className="w-full mt-3 bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[13px] font-bold min-h-[44px] rounded-full hover:-translate-y-px transition-all disabled:opacity-40 disabled:translate-y-0">
                        {saving ? 'Başlatılıyor…' : 'Hemen Başlat'}
                    </button>
                </>
            )}
        </div>
    );
}
