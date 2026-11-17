import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Clock, DoorOpen, Gift, Layers, Lock, MapPin, Plus, Sparkles, User, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { useResources } from '@/hooks/useResources';
import { useCustomers } from '@/hooks/useCustomers';
import { useStaff } from '@/hooks/useStaff';
import { useOrgPackages } from '@/hooks/useOrgPackages';
import { normalizePhone } from '@/lib/phone';
import { commsForSector, profileForSector } from '@/lib/sectorProfiles';
import { buildRenewalMessage, buildWinbackMessage } from '@/services/waTemplates';
import { useCashEnabled } from '@/hooks/useModules';
import { OpportunityWheel, type Opportunity } from '@/components/dashboard/OpportunityWheel';
import { useLabels } from '@/hooks/useLabels';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { cn } from '@/utils/cn';
import { todayISO, toISODate, formatDateEU } from '@/utils/date';
import { BeautySessionModal, type SessionPreset } from '@/components/beauty/BeautySessionModal';
import { advancePatch, phaseOf, minsSince } from '@/lib/sessionPhase';
import type { SessionPhase } from '@/lib/sessionPhase';
import type { Customer, Reservation, Service, TreatmentPlan } from '@/types';
import './beautyOps.css';
import { adisyonExtras, reservationPrice } from '@/utils/reservationServices';

// ── Güzellik Dashboard'u · "Günün Akışı" ─────────────────────────────────────
// Tasarım: design_handoff_gunun_akisi. İlke — dashboard bir takvim değildir;
// gün tek bir dikey akış olarak okunur (geçmiş → şu an → gelecek) ve her satır
// tek tıkla çözülür. Saat eksenli çizelge Seans Takvimi sayfasında yaşar.

const DAY_OPEN = 9;
const DAY_CLOSE = 19;

// Gün planı ızgarası — saat başına 72 px (Gün planı tasarımı, 2026-11-17):
// 45 dk'lık seans iki satırı (ad + saat · hizmet) taşır. Boş günde 32 px;
// ızgara kaybolmaz ("+" ile seans buradan eklenir) ama yarım ekran tutmaz.
const PPH = 72;
const PPH_EMPTY = 32;

// Faz → ızgara/nokta rengi sınıfı ve ekranda görünen etiket
const PHASE_UI: Record<SessionPhase, string> = {
    wait: 'upcoming', arrived: 'waiting', active: 'active', done: 'checkout', completed: 'completed',
};
const PHASE_TR: Record<SessionPhase, string> = {
    wait: 'Bekleniyor', arrived: 'Geldi · bekliyor', active: 'İşlemde', done: 'Ödeme bekliyor', completed: 'Tamamlandı',
};


const timeToH = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h + (m || 0) / 60;
};
const initialsOf = (name: string) => name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toLocaleUpperCase('tr');
const fmtTL = (n: number) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
/** Bugüne kadar geçen tam gün — "113 gündür yok" sayacı için. */
const daysSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(`${iso}T12:00:00`).getTime()) / 86_400_000));
/** Ondalık saat → "HH:MM" (5 dakikaya yukarı yuvarlı). */
const hToHM = (h: number) => {
    const m = Math.ceil((h * 60) / 5) * 5;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
/** Dakika → "45 dk" · "1 saat" · "1 sa 10 dk". */
const durTR = (mins: number) => {
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    if (h === 0) return `${m} dk`;
    return m === 0 ? `${h} saat` : `${h} sa ${m} dk`;
};

type CabinStatus = 'busy' | 'prep' | 'free';


export function GuzellikDashboard() {
    const navigate = useNavigate();
    const { dark } = useTheme();
    const { reservations, settings, updateReservation, addReservation } = useReservations();
    const { resources } = useResources();
    const { customers, customerById, redeemLoyalty, addCustomer } = useCustomers();
    const { staff } = useStaff();
    const { packages, refresh: refreshPackages, markRenewalOffered } = useOrgPackages();
    const cashOn = useCashEnabled();
    // Sektör terminolojisi — güzellikte "seans", genelde "randevu".
    // NOT: "Randevusuz müşteri" bilerek çevrilmiyor; "randevusuz" Türkçede
    // walk-in'in yerleşik karşılığı ve sektörden bağımsız doğru ("seanssız
    // müşteri" kulağa yanlış geliyor).
    const { t } = useLabels();
    const resWord = t('reservation').toLocaleLowerCase('tr');
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
    // Ekipte varsayılan Uzmanlar: sahip güne "kim ne yapıyor" diye bakar
    // (Gün planı tasarımı, 2026-11-17); Üniteler bir dokunuşta.
    const [laneMode, setLaneMode] = useState<'unit' | 'staff'>('staff');
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

    // Tek kişilik kip (organizations.solo) + randevu adresi (slug). Kip
    // okunamazsa ekipte tek aktif kişi varsa yine tek kişilik yüz gösterilir.
    const { orgId } = useAuth();
    const [org, setOrg] = useState<{ solo: boolean | null; slug: string | null }>({ solo: null, slug: null });
    useEffect(() => {
        if (!orgId) return;
        let live = true;
        void supabase.from('organizations').select('solo, slug').eq('id', orgId).maybeSingle()
            .then(({ data }) => { if (live && data) setOrg({ solo: Boolean(data.solo), slug: data.slug ?? null }); });
        return () => { live = false; };
    }, [orgId]);
    const solo = org.solo === true || activeStaff.length <= 1;

    // Seansın tutarı: hizmet fiyatı + adisyona eklenen kalemler
    const sessionAmount = useMemo(() => (r: Reservation): number => {
        // Adisyon fiyat × adet — tek kaynak (D2, 2026-10-16).
        const extras = adisyonExtras(r.adisyonItems);
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
    // Günün ÖNÜNDE duran iş: içeridekiler + henüz gelmemişler. Tamamlananlar ve
    // gelmeyenler hariç — karşılama başlığı bu sayıyı konuşur.
    const remaining = inSalon.length + upcoming.length;

    // ── Kabin durumu şeridi (ızgaranın yerine geçer) ──────────────────────────
    const cabins = useMemo(() => activeResources.map((res) => {
        const busyWith = inService.find((r) => r.resourceId === res.id);
        const prepFor = waiting.find((r) => r.resourceId === res.id);
        const status: CabinStatus = busyWith ? 'busy' : prepFor ? 'prep' : 'free';
        const staffName = busyWith?.staffName || prepFor?.staffName
            || todayList.find((r) => r.resourceId === res.id)?.staffName || '';
        // Dolum karosu için işlemin başı; boş ünitede bugün sıradaki seansın saati
        const nextAt = upcoming.find((r) => r.resourceId === res.id)?.startTime;
        return { id: res.id, name: res.name, staffName, status, startAt: busyWith?.startTime, freeAt: busyWith?.endTime, nextAt };
    }), [activeResources, inService, waiting, todayList, upcoming]);

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
    const GAP_BAND = 34;
    const grid = useMemo(() => {
        const pph = todayList.length > 0 ? PPH : PPH_EMPTY;
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
            const h = s.type === 'gap' ? GAP_BAND : (s.to - s.from) * pph;
            const seg = { ...s, y, h };
            y += h;
            return seg;
        });
        const topPx = (hf: number): number => {
            for (const s of segs) if (hf >= s.from && hf <= s.to) return s.type === 'gap' ? s.y + s.h / 2 : s.y + (hf - s.from) * pph;
            return hf <= from ? 0 : y;
        };
        const ticks: number[] = [];
        for (const s of segs) if (s.type === 'hours') for (let h = s.from; h <= s.to; h++) ticks.push(h);
        // Eksen etiketi her saat satırının başında; günün bitiş saati etiketlenmez
        const labels: number[] = [];
        for (const s of segs) if (s.type === 'hours') for (let h = s.from; h < s.to; h++) labels.push(h);
        return { from, to, segs, height: y, topPx, ticks: [...new Set(ticks)], labels, gaps: segs.filter((s) => s.type === 'gap'), nowH, pph };
    }, [todayList, now, settings.workingHours]);

    const canvasH = grid.height;
    const nowTop = grid.topPx(grid.nowH);
    const nowVisible = grid.nowH >= grid.from && grid.nowH <= grid.to
        && !grid.gaps.some((s) => grid.nowH > s.from && grid.nowH < s.to);

    // Sütunlar ünite ya da uzman; ataması olmayan seanslar için "Atanmamış" eklenir
    const lanes = useMemo(() => {
        // Alt satır yalnız bilgi varken (Panel rötuşu): yedi sütunda yedi kez
        // "boş" yazmak gürültüydü — boşluğu kesik halka nokta söylüyor.
        // Kalan = tamamlanmamış ve gelmemiş olmayan seanslar.
        const summarize = (key: 'unit' | 'staff', id: string) => {
            const list = todayList.filter((r) => ((key === 'unit' ? r.resourceId : r.staffId) || '__none') === id);
            const done = list.filter((r) => phaseOf(r) === 'completed').length;
            const left = list.filter((r) => phaseOf(r) !== 'completed' && !(phaseOf(r) === 'wait' && r.endTime < nowTime)).length;
            return left > 0 ? `${left} ${resWord}` : done > 0 ? `${done} tamamlandı` : '';
        };
        // Tek kişilik: tek sütun, başlıksız — ünite/uzman seçimi anlamsız
        if (solo) return [{ id: '__all', name: '', tone: 'free' as CabinStatus, sub: '' }];
        if (laneMode === 'unit') {
            const base = cabins.map((c) => {
                const sub = c.status === 'busy' ? `~${c.freeAt} boşalıyor`
                    : c.status === 'prep' ? 'hazırlanıyor'
                        : summarize('unit', c.id);
                return { id: c.id, name: c.name, tone: c.status, sub };
            });
            if (todayList.some((r) => !r.resourceId)) base.push({ id: '__none', name: 'Atanmamış', tone: 'prep' as CabinStatus, sub: summarize('unit', '__none') });
            return base;
        }
        const base = staffStrip.map((s) => {
            const sub = s.busyWith ? `${mask(s.busyWith)} ile` : summarize('staff', s.id);
            return { id: s.id, name: s.name, tone: (s.busyWith ? 'busy' : 'free') as CabinStatus, sub };
        });
        if (todayList.some((r) => !r.staffId)) base.push({ id: '__none', name: 'Atanmamış', tone: 'prep' as CabinStatus, sub: summarize('staff', '__none') });
        return base;
    }, [solo, laneMode, cabins, staffStrip, todayList, mask, nowTime, resWord]);

    const laneKeyOf = useMemo(
        () => (r: Reservation) => solo ? '__all' : (laneMode === 'unit' ? r.resourceId : r.staffId) || '__none',
        [solo, laneMode],
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
            ...(laneId === '__none' || laneId === '__all' ? {} : laneMode === 'unit' ? { resourceId: laneId } : { staffId: laneId }),
        });
        setModalCustomer(null);
    };

    // "+" gösterilecek saatler: ızgaradaki saat satırları, katlanmış bantlar ve
    // GEÇMİŞ saatler hariç (Panel rötuşu: "geçmişte yok"). Dolu saatler sütun
    // başına ayrıca elenir — ipucu artık kartın altında değil, boş satırda.
    const addableHours = useMemo(
        () => grid.labels.filter((h) => h + 1 > grid.nowH),
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
                // Kart satırın içinde 2 px nefes payıyla durur; kısa seans 22 px'in
                // altına inmez (yalnız ad görünür)
                for (const { it, col } of assigned) {
                    const top = grid.topPx(it.s);
                    out.push({
                        r: it.r,
                        top: top + 2,
                        height: Math.max(22, grid.topPx(it.e) - top - 4),
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
    // Klinik/ticari ayrımı artık kaynakta yapılıyor (useOrgPackages yalnız
    // plan_kind='paket' çeker); buradaki sessionCount > 1 koşulu tek seanslık
    // satışları "yenilenecek paket" saymamak içindir.
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

    // Teklifi gönderilmiş paket fırsat sayılmaz — yoksa aynı müşteri her gün
    // listede kalır ve kuyruk güvenilirliğini kaybeder (damga: markRenewalOffered).
    const renewals = useMemo(() => finishedPackages
        .filter((p) => !p.renewalOfferedAt)
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

    // ── Fırsat kuyruğu ────────────────────────────────────────────────────────
    // Yukarıdaki beş liste uzun süre yalnız actionCount'a düşüyordu: hesaplanıyor
    // ama ekrana hiç çizilmiyordu. Salonun bugünkü işini takvim anlatır; parayı
    // getiren iş burada. Her satırda TEK aksiyon var — okuyup geçilecek bir
    // rapor değil, tıklanacak bir kuyruk.
    const opportunities = useMemo((): Opportunity[] => {
        const firstName = (n: string) => n.split(' ')[0];
        const wa = (phone: string, text: string) =>
            window.open(`https://wa.me/${normalizePhone(phone) ?? phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank');
        const business = settings.businessName || 'Salonumuz';
        const comms = commsForSector(settings.sector);

        return [
            // Biten paket — teklif için en verimli an; damga basılır ki tekrar çıkmasın
            ...renewals.map(({ plan, customer }): Opportunity => ({
                id: `renewal-${plan.id}`,
                kind: 'pkg',
                label: 'Paket bitti',
                name: mask(customer.name),
                context: <>{plan.title} · <b>{plan.sessionCount}</b> seans tamamlandı</>,
                actionLabel: 'Teklif gönder',
                actionKind: 'wa',
                disabled: !customer.phone,
                run: async () => {
                    wa(customer.phone, buildRenewalMessage({
                        customerName: customer.name, packageTitle: plan.title, businessName: business, comms,
                    }));
                    await markRenewalOffered(plan.id);
                    toast.success('Yenileme teklifi gönderildi');
                },
            })),
            // Hediye hak etti — ödül kullanılmazsa damga sonsuza kadar birikir
            ...giftEarned.map((c): Opportunity => ({
                id: `gift-${c.id}`,
                kind: 'gift',
                label: 'Hediye hak etti',
                name: mask(c.name),
                context: <><b>{c.loyaltyStamps}</b>/<b>{loyaltyThreshold}</b> damga doldu · ödül hazır</>,
                actionLabel: 'Ödülü kullan',
                actionKind: 'ink',
                run: () => redeemLoyalty(c.id, loyaltyThreshold),
            })),
            // Yarın onay bekleyen — bugün onaylanmazsa yarın boş koltuk demek
            ...tomorrowPending.map((r): Opportunity => ({
                id: `confirm-${r.id}`,
                kind: 'conf',
                label: 'Yarın onay bekliyor',
                name: mask(r.customerName),
                context: <>{r.service} · yarın <b>{r.startTime}</b></>,
                actionLabel: 'Onayla',
                actionKind: 'ink',
                run: async () => { await updateReservation(r.id, { status: 'confirmed' }); },
            })),
            // Paketi var ama ileri randevusu yok — hakkı yanmasın
            ...unplanned.map(({ plan, customer }): Opportunity => ({
                id: `unplanned-${plan.id}`,
                kind: 'plan',
                label: 'Seansı planlanmamış',
                name: mask(customer.name),
                context: <>{plan.title} · <b>{plan.sessionCount - plan.sessionsDone}</b> seans hakkı · tarih yok</>,
                actionLabel: 'Seans planla',
                actionKind: 'ink',
                run: () => setModalCustomer(customer),
            })),
            // 60+ gündür uğramamış
            ...lost.map((c): Opportunity => ({
                id: `lost-${c.id}`,
                kind: 'lost',
                label: 'Uzaklaşıyor',
                name: mask(c.name),
                context: c.lastVisit
                    ? <>son ziyaret <b>{formatDateEU(c.lastVisit)}</b> · <b>{daysSince(c.lastVisit)}</b> gündür yok</>
                    : <>uzun süredir gelmiyor</>,
                actionLabel: 'Mesaj at',
                actionKind: 'wa',
                disabled: !c.phone,
                run: () => { wa(c.phone, buildWinbackMessage({ customerName: firstName(c.name), businessName: business, comms })); },
            })),
        ];
    }, [renewals, giftEarned, tomorrowPending, unplanned, lost, settings.businessName, settings.sector,
        loyaltyThreshold, markRenewalOffered, redeemLoyalty, updateReservation, mask]);

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
    // Tek müşteri ekranı Müşteriler — ayrı kart sayfası kalktı (2026-10-23)
    const openCustomer = (id?: string) => id && navigate(`/customers?open=${encodeURIComponent(id)}`);
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

    // Akış satırı ile ızgara aynı seçimi paylaşır. Seçim yoksa çubuk HİÇ
    // görünmez (Panel rötuşu): eskiden sıradaki kişiyi kendiliğinden seçip
    // koyu Sıradaki kartının kişisini ve "Geldi" eylemini ikinci kez gösteriyordu.
    const selected = useMemo(
        () => todayList.find((r) => r.id === selectedId) ?? null,
        [todayList, selectedId],
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

    // Tahsilat dashboard'da YAPILMAZ — kasaya devredilir. Buradaki kısa yol
    // ödeme yöntemini soramadığı için her tahsilatı "nakit" yazıyor, paket
    // mahsubunu (allocatePayment) atlıyor ve sadakat damgasını ikinci bir yerde
    // basıyordu. Kasa bunların üçünü de doğru yapan tek yüzey.
    const openCashFor = (r: Reservation) => navigate(`/kasa?reservation=${encodeURIComponent(r.id)}`);

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

    const dayNum = now.getDate();
    // Gün halkası: bugünün mesaisinin ne kadarı geçti (0–1). Çalışma saati
    // tanımlı değilse gün planındaki varsayılan (09–19) kullanılır.
    const dayRing = (() => {
        const wh = settings.workingHours?.find((w) => w.day === now.getDay());
        const open = wh?.start ? wh.start.slice(0, 5) : `${String(DAY_OPEN).padStart(2, '0')}:00`;
        const close = wh?.end ? wh.end.slice(0, 5) : `${String(DAY_CLOSE).padStart(2, '0')}:00`;
        const o = timeToH(open), c = timeToH(close);
        const h = now.getHours() + now.getMinutes() / 60;
        const pct = wh?.isOff || c <= o ? 0 : Math.min(1, Math.max(0, (h - o) / (c - o)));
        return { pct, open, close, off: Boolean(wh?.isOff) };
    })();
    const weekday = now.toLocaleDateString('tr-TR', { weekday: 'long' });
    const monthShort = now.toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' });
    const pad2 = (h: number) => String(h).padStart(2, '0');

    // ── Sadakat damgası göstergesi ────────────────────────────────────────────
    const StampRow = ({ customerId, color }: { customerId: string; color: string }) => {
        if (!loyaltyOn) return null;
        const stamps = customerById.get(customerId)?.loyaltyStamps ?? 0;
        if (stamps === 0) return null;
        const earned = stamps >= loyaltyThreshold;
        return (
            <span className="gz-stamps" title={earned ? 'Hediye hak edildi' : `${loyaltyThreshold - stamps} seans sonra hediye`}>
                <span>
                    {Array.from({ length: Math.min(loyaltyThreshold, 10) }, (_, i) => (
                        <i key={i} style={i < stamps ? { background: earned ? 'var(--dc-green)' : color } : undefined} />
                    ))}
                </span>
                <small className={cn(earned && 'earned')}>{stamps}/{loyaltyThreshold}</small>
            </span>
        );
    };

    // Mobil liste ve seçim çubuğu için faz → nokta rengi
    const DOT: Record<string, string> = { upcoming: 'hollow', waiting: 'amber', active: 'orange', checkout: 'green', completed: 'hollow', noshow: 'red' };
    const isNoShow = (r: Reservation) => phaseOf(r) === 'wait' && r.endTime < nowTime;

    // Kartta en fazla TEK durum işareti (Gün planı tasarımı): gelmedi · kalan
    // süre · bekliyor · ödenmedi · paket. Biten kart soluk, yazı gerekmez.
    const minsLeft = (r: Reservation) => Math.max(0, Math.round((timeToH(r.endTime) - grid.nowH) * 60));
    const cardStatus = (r: Reservation): { text: string; tone: 'red' | 'amber' | 'live' | 'muted' } | null => {
        const ph = phaseOf(r);
        if (isNoShow(r)) return { text: 'Gelmedi', tone: 'red' };
        if (ph === 'active') { const left = minsLeft(r); return { text: left > 0 ? `${left} dk kaldı` : 'Süre doldu', tone: 'live' }; }
        if (ph === 'arrived') return { text: `Bekliyor · ${r.customerArrivedAt ? minsSince(r.customerArrivedAt, now) : 0} dk`, tone: 'amber' };
        if (ph === 'done') { const a = sessionAmount(r); return { text: a > 0 ? `${fmtTL(a)} ödenmedi` : 'Ödeme bekliyor', tone: 'amber' }; }
        if (ph === 'wait') { const p = pkgByCustomer.get(r.customerId); if (p) return { text: `Paket ${p.sessionsDone}/${p.sessionCount}`, tone: 'muted' }; }
        return null;
    };

    // Tek kişilik yan panel · mesainin kalanındaki boş aralıklar (≥ 30 dk)
    const freeGaps = (() => {
        const wh = settings.workingHours?.find((w) => w.day === now.getDay());
        if (wh?.isOff) return [];
        const open = wh?.start ? timeToH(wh.start) : DAY_OPEN;
        const close = wh?.end ? timeToH(wh.end) : DAY_CLOSE;
        let cur = Math.max(open, Math.ceil(grid.nowH * 12) / 12);
        const out: { from: number; to: number }[] = [];
        for (const r of todayList) {
            const s = timeToH(r.startTime), e = timeToH(r.endTime);
            if (e <= cur) continue;
            if (s - cur >= 0.5) out.push({ from: cur, to: Math.min(s, close) });
            cur = Math.max(cur, e);
        }
        if (close - cur >= 0.5) out.push({ from: cur, to: close });
        return out.filter((g) => g.to - g.from >= 0.5);
    })();
    const freeTotal = freeGaps.reduce((n, g) => n + (g.to - g.from) * 60, 0);
    const openAt = (h: number) => { setModalPreset({ date: today, slot: hToHM(h) }); setModalCustomer(null); };
    const bookingUrl = org.slug ? `${window.location.origin}/book/${org.slug}` : '';
    const shareBooking = () => {
        if (!bookingUrl) { navigate('/settings'); return; }
        void navigator.clipboard?.writeText(bookingUrl).then(
            () => toast.success('Randevu bağlantısı kopyalandı'),
            () => toast.error('Kopyalanamadı'),
        );
    };
    // Şimdi kutusu: işlemde > bekleyen > kasada; ilgilenilecekler bu kişiyi tekrar etmez
    const current = inService[0] ?? waiting[0] ?? atTill[0] ?? null;
    const nextUp = upcoming[0] ?? null;
    const attention = [...atTill.filter((r) => r.id !== current?.id), ...noShow];

    return (
        <div className={cn('dash-theme gz-ops flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--dc-page)]', dark && 'dark')}>
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <div className="max-w-[1240px] mx-auto space-y-4">

                    {/* Kurulum ilerlemesi burada AYRICA sayılmaz: tek sayaç uygulamanın
                        üstündeki şerit (SetupBanner → lib/setupProgress). Buradaki 4
                        adımlı kart aynı anda başka sayı söylüyordu (2026-10-19). */}

                    {/* A · Karşılama — tasarım: Claude Design "Luera Fırsat Modülü v2".
                        Tarih kutusu, metin bloğu, fırsat çarkı yuvası ve aksiyonlar
                        tek satırda; çark yuvası boşsa kart sade hâline döner.
                        Panel rötuşunun iki katlı hâli beğenilmedi (2026-10-20):
                        eski yapı korunur, yalnız ölçüler cilalandı (opportunityWheel.css). */}
                    <section className="opp-wc" aria-label="Karşılama">
                        {/* Gün halkası — rakamın çevresinde mesainin ne kadarının
                            geçtiği. Kullanıcı dört yön arasından seçti (2026-10-20). */}
                        <div className="opp-datebox"
                            title={dayRing.off ? 'Bugün kapalı' : `Mesai ${dayRing.open}–${dayRing.close} · %${Math.round(dayRing.pct * 100)} geçti`}>
                            <span className="dw">{weekday.toLocaleUpperCase('tr')}</span>
                            <span className="day-ring">
                                <svg viewBox="0 0 66 66" aria-hidden="true">
                                    <circle className="trk" cx="33" cy="33" r="30" pathLength={100} />
                                    <circle className={cn('arc', dayRing.pct <= 0 && 'zero')} cx="33" cy="33" r="30" pathLength={100}
                                        style={{ '--off': 100 - dayRing.pct * 100 } as React.CSSProperties} />
                                </svg>
                                <span className="dd">{dayNum}</span>
                            </span>
                            <span className="dm">{monthShort}</span>
                        </div>
                        <div className="opp-wc-main">
                            <span className="kicker">{settings.businessName || 'Güzellik Salonu'} · {nowTime}</span>
                            {/* Karşılama günün ÖNÜNDE DURAN işini söyler; toplam sayı değil.
                                Gün bittiğinde "N seans var" demek yanıltıyordu — biten seans
                                da sayıya giriyordu. Kırılım alt satırda; salonun anlık durumu
                                alttaki salon panelinde yaşar ve burada tekrar edilmez. */}
                            <h1>
                                {todayList.length === 0
                                    ? <>Bugün için planlanmış {resWord} yok</>
                                    : remaining > 0
                                        ? <>Bugün <b className="text-[var(--dc-orange-d)]">{remaining} {resWord}</b> sizi bekliyor.</>
                                        : doneToday.length > 0
                                            ? <>Bugünün işi <b className="text-[var(--dc-orange-d)]">tamamlandı</b>.</>
                                            : <>Bugün <b className="text-[var(--dc-red)]">kimse gelmedi</b>.</>}
                            </h1>
                            {/* Günün kırılımı bir satır, fırsat sayısı kendi satırı: fırsat
                                yanındaki çarkı anlatır, günü değil. Aynı satırdayken uzun
                                günlerde "5 fırsat / bekliyor" diye bölünüyor, "·" satır
                                başında ya da sonunda asılı kalıyordu (2026-10-20). */}
                            {todayList.length > 0 && (
                                <span className="sub">
                                    {doneToday.length} tamamlandı
                                    {inSalon.length > 0 && <> · {inSalon.length} içeride</>}
                                    {upcoming.length > 0 && <> · {upcoming.length} kaldı</>}
                                    {noShow.length > 0 && <> · <span className="text-[var(--dc-red)] font-semibold">{noShow.length} gelmedi</span></>}
                                </span>
                            )}
                            <span className="sub">
                                {opportunities.length > 0 ? <b>{opportunities.length} fırsat bekliyor</b> : <>takip işi yok</>}
                            </span>
                        </div>
                        <div className="opp-slot">
                            <OpportunityWheel
                                items={opportunities}
                                busy={busyId}
                                onAct={async (op) => {
                                    if (busyId) return;
                                    setBusyId(op.id);
                                    try { await op.run(); } finally { setBusyId(null); }
                                }}
                            />
                        </div>
                        <div className="opp-wc-acts">
                            <button type="button" className="b-fill" onClick={() => setModalCustomer(null)}><Plus className="w-4 h-4" />Yeni {resWord}</button>
                            <button type="button" className="b-out" onClick={() => navigate('/calendar')}>Takvimi aç</button>
                        </div>
                    </section>

                    {/* B · Salon durumu — tasarım: "Luera TimeFlow Salon Sakin" + Panel rötuşu */}
                    {(() => {
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
                        //   salon boş + randevu var → tam panel (Sıradaki kutusu yıldız)
                        //   salon boş + randevu yok → tek satır (yapacak iş yok)
                        //   salonda müşteri var    → tam panel, başlık "N müşteri salonda"
                        if (inSalon.length === 0 && !nextUp) {
                            return (
                                <section className="gz-card gz-slim" aria-label="Salon durumu">
                                    <span className="gz-dot green" />
                                    <b>Salon boş</b>
                                    <span className="gz-slim-sep" />
                                    <span className="gz-slim-note">
                                        {[
                                            doneToday.length > 0 && `bugün ${doneToday.length} ${resWord} tamamlandı`,
                                            `başka ${resWord} yok`,
                                            freeCabins.length > 0 && `${freeCabins.length} ünite hazır`,
                                        ].filter(Boolean).join(' · ')}
                                    </span>
                                    <button type="button" className="gz-btn orange" onClick={() => setWalkInOpen((v) => !v)}>
                                        <Zap />Randevusuz müşteri al
                                    </button>
                                </section>
                            );
                        }

                        // Ünite şeridi tek parça: geniş panelde ≤ 8 tek sıra, fazlası eşit
                        // sıralar (10 → 5 + 5); panel darsa ≤ 4 (7 → 4 + 3). Yetim hücre
                        // kalmaz. Hangisinin geçerli olduğuna CSS kapsayıcı sorgusu karar verir.
                        const n = cabins.length;
                        const cols = n ? Math.ceil(n / Math.ceil(n / 8)) : 1;
                        const colsNarrow = n ? Math.ceil(n / Math.ceil(n / 4)) : 1;

                        return (
                            <section className="gz-salon" aria-label="Salon durumu">
                                <div className="gz-card gz-salon-main">
                                    <div className="gz-salon-head">
                                        <span className={cn('gz-dot gz-live', inSalon.length > 0 ? 'orange' : 'green')} />
                                        <span className="eyebrow">Şu an salonda</span>
                                    </div>
                                    {inSalon.length === 0
                                        ? <h2>Salon şu an sakin.<br /><span className="soft">{nextUp ? 'Sıradaki müşteriye hazırız.' : 'Günün geri kalanı boş.'}</span></h2>
                                        : <h2>{inSalon.length} müşteri salonda</h2>}
                                    {/* Öngörü satırı — YALNIZ bağlamsal AI ipucu varken çıkar.
                                        Dolgu cümle kurmuyoruz; başlığın söylediğini tekrar etmez.
                                        Yeri ve metni rötuşta değişmedi (kullanıcı kararı). */}
                                    {aiHint && (
                                        <p className="gz-hint"><Sparkles /><span>{aiHint}</span></p>
                                    )}

                                    <div className="gz-units-head">
                                        <span className="eyebrow">Üniteler</span>
                                        {/* Ünite tanımlı değilken "Hepsi dolu" yazıyordu — hemen altında
                                            "Henüz ünite eklenmemiş" ile birlikte. Yokluk doluluk değildir. */}
                                        {n > 0 && (
                                            <span className={cn('eyebrow', freeCabins.length > 0 ? 'free' : 'full')}>
                                                {freeCabins.length > 0 ? `Boş · ${freeCabins.length}` : 'Hepsi dolu'}
                                            </span>
                                        )}
                                    </div>
                                    {n === 0 ? (
                                        <p className="gz-units-empty">Henüz ünite eklenmemiş — Ayarlar'dan ekleyin.</p>
                                    ) : (
                                        // Dolum karoları (kullanıcı dört taslak arasından C'yi seçti,
                                        // 2026-10-21): dolu karonun zemini işlem ilerledikçe soldan
                                        // sağa dolar; saat ne zaman boşalacağını, yanındaki süre ne
                                        // kadar kaldığını söyler. Müşteri adı yok — aynı kişi aşağıda
                                        // Bugünün planı'nda görünüyor (kural 09).
                                        <div className="gz-units" style={{ '--cols': cols, '--cols-narrow': colsNarrow } as React.CSSProperties}>
                                            {cabins.map((c) => {
                                                const s = c.startAt ? Math.round(timeToH(c.startAt) * 60) : nowMin;
                                                const e = c.freeAt ? Math.round(timeToH(c.freeAt) * 60) : nowMin;
                                                const pct = e > s ? Math.min(1, Math.max(0, (nowMin - s) / (e - s))) : 1;
                                                // İki saate kadar dakika ("80 dk") — dar karoda "1 sa 20 dk"
                                                // sığmıyordu. "kaldı" dar karoda düşer (beautyOps.css).
                                                const left = e - nowMin;
                                                const leftText = left <= 0 ? 'süre doldu'
                                                    : left < 120 ? `${left} dk`
                                                        : left % 60 ? `${Math.floor(left / 60)} sa ${left % 60} dk` : `${left / 60} sa`;
                                                return (
                                                    <button key={c.id} type="button" className={cn('gz-unit', c.status)} onClick={() => setModalCustomer(null)}
                                                        title={c.status === 'busy' ? `~${c.freeAt} boşalıyor` : c.status === 'prep' ? 'Hazırlanıyor' : `Boş — ${resWord} ekle`}>
                                                        {c.status === 'busy' && <span className="fill" style={{ '--p': pct } as React.CSSProperties} />}
                                                        <span className="row"><b>{c.name}</b><i className={cn('gz-udot', c.status)} /></span>
                                                        {/* Boş ünitede alt satır yalnız bugün sırası varsa. Yedi
                                                            karoda yeşil "Boş" yazmak gürültüydü (2026-10-20);
                                                            nokta ve "Boş · N" zaten söylüyor. */}
                                                        {c.status === 'busy' ? (
                                                            <span className="row"><span className="t">~{c.freeAt}</span><small className={cn(left <= 0 && 'over')}>{leftText}{left > 0 && <span className="kw"> kaldı</span>}</small></span>
                                                        ) : c.status === 'prep' ? (
                                                            <span className="row"><span className="st">Hazırlanıyor</span></span>
                                                        ) : c.nextAt && (
                                                            <span className="row"><small>Sıradaki <b>{c.nextAt}</b></small></span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Bekleme odası — 10 dk'yı geçen bekleme kırmızı. Bu bölgenin
                                        turuncusu Sıradaki'deki düğme; buradaki eylem çerçeveli. */}
                                    <div className="gz-wait">
                                        <span className={cn('gz-wait-ic', waiting.length > 0 && 'on')}><User /></span>
                                        <div className="gz-wait-txt">
                                            <b>{waiting.length > 0 ? `Bekleme odasında ${waiting.length} kişi` : 'Bekleme odası boş'}</b>
                                            <span>
                                                {waiting.length > 0
                                                    ? waiting.map((r, i) => {
                                                        const m = r.customerArrivedAt ? minsSince(r.customerArrivedAt, now) : 0;
                                                        return <Fragment key={r.id}>{i > 0 && ' · '}{mask(r.customerName)} <b className={cn(m >= 10 && 'late')}>{m} dk</b></Fragment>;
                                                    })
                                                    : nextUp
                                                        ? <>Sıradaki {resWord} <b>{nextUp.startTime}</b> · {multi ? `${nextGroup.length} müşteri` : mask(nextUp.customerName)}</>
                                                        : <>Bugün başka {resWord} yok</>}
                                            </span>
                                        </div>
                                        <button type="button" className={cn('gz-btn line', walkInOpen && 'is-on')} onClick={() => setWalkInOpen((v) => !v)}>
                                            <Zap className="or" />Randevusuz müşteri
                                        </button>
                                    </div>
                                </div>

                                {/* Sıradaki — koyu kutu, gölgesiz. Üç blok kart boyunca dağılır,
                                    düğme dipte: kart uzasa da altta boşluk kalmaz. */}
                                <aside className={cn('gz-next', !nextUp && 'empty')} aria-label="Sıradaki">
                                    {nextUp ? (
                                        <>
                                            <div className="gz-next-top">
                                                <div className="gz-next-head">
                                                    <span className="eyebrow">{multi ? `Sıradaki · ${nextGroup.length} müşteri` : 'Sıradaki'}</span>
                                                    <span className="gz-dot orange" />
                                                </div>
                                                <span className="gz-next-clock">{nextUp.startTime}</span>
                                                <span className="gz-next-eta">{etaText}</span>
                                            </div>

                                            {multi ? (
                                                // Aynı saatte birden çok müşteri: her satırın kendi "Geldi"
                                                // düğmesi. Turuncu dolu yok — üçü alt alta bağırırdı.
                                                <div className="gz-next-list">
                                                    {shown.map((r) => (
                                                        <div className="gz-next-row" key={r.id}>
                                                            <span className="av">{initialsOf(r.customerName)}</span>
                                                            <span className="tx">
                                                                <strong onClick={() => openCustomer(r.customerId)}>{mask(r.customerName)}</strong>
                                                                <small>{[r.service, r.staffName].filter(Boolean).join(' · ')}</small>
                                                            </span>
                                                            <button type="button" className="gz-btn sm" title="Geldi olarak işaretle"
                                                                disabled={busyId === r.id} onClick={() => void advance(r, 'arrived')}>
                                                                <Check />Geldi
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {nextGroup.length > shown.length && (
                                                        <span className="gz-next-more">+{nextGroup.length - shown.length} müşteri daha</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="gz-next-who">
                                                        <strong onClick={() => openCustomer(nextUp.customerId)}>{mask(nextUp.customerName)}</strong>
                                                        <span>{[nextUp.service, nextUp.staffName].filter(Boolean).join(' · ')}</span>
                                                        {pkg && (
                                                            <div className="gz-next-pkg">
                                                                <Layers />
                                                                <div>
                                                                    <b>{pkg.title}</b>
                                                                    <i><i style={{ width: `${Math.round((pkg.sessionsDone / pkg.sessionCount) * 100)}%` }} /></i>
                                                                </div>
                                                                <span>{pkg.sessionsDone}/{pkg.sessionCount}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button type="button" className="gz-btn orange" disabled={busyId === nextUp.id}
                                                        onClick={() => void advance(nextUp, 'arrived')}>
                                                        <Check />Geldi olarak işaretle
                                                    </button>
                                                </>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            {/* Salon durumu solda anlatılıyor — burada tekrar etmiyoruz */}
                                            <span className="eyebrow">Sıradaki</span>
                                            <h3>Bugün başka {resWord} yok.</h3>
                                            <button type="button" className="gz-btn orange" onClick={() => setModalCustomer(null)}>
                                                <Zap />Randevusuz müşteri al
                                            </button>
                                        </>
                                    )}
                                </aside>
                            </section>
                        );
                    })()}

                    {/* Randevusuz müşteri — hızlı başlatma */}
                    {walkInOpen && (
                        <WalkInForm
                            customers={customers}
                            services={services}
                            cabins={cabins}
                            staff={activeStaff}
                            staffBusy={Object.fromEntries(staffStrip.filter((s) => s.busyWith).map((s) => [s.id, true]))}
                            history={active}
                            sector={settings.sector}
                            onCreateCustomer={addCustomer}
                            onClose={() => setWalkInOpen(false)}
                            onStart={async (payload) => {
                                const created = await addReservation(payload);
                                if (created) {
                                    await updateReservation(created.id, {
                                        customerArrivedAt: new Date().toISOString(),
                                        arrivedAt: new Date().toISOString(),
                                    });
                                    toast.success(`${payload.customerName} işleme alındı`);
                                    setWalkInOpen(false);
                                }
                            }}
                        />
                    )}

                    {/* C · Operasyon kontrolü */}
                    <section className="gz-card gz-ops-card" aria-label="Operasyon kontrolü">
                        <div className="gz-ops-top">
                            <div>
                                <span className="eyebrow">Operasyon kontrolü</span>
                                <h2>Bugünün planı</h2>
                            </div>
                            <div className="gz-ops-ctl">
                                {!solo && (
                                    <div className="gz-seg" role="radiogroup" aria-label="Plan sütunları">
                                        <button type="button" role="radio" aria-checked={laneMode === 'staff'} onClick={() => setLaneMode('staff')}>Uzmanlar</button>
                                        <button type="button" role="radio" aria-checked={laneMode === 'unit'} onClick={() => setLaneMode('unit')}>Üniteler</button>
                                    </div>
                                )}
                                <label className="gz-switch" title="Ortak ekranda müşteri soyadını gizler">
                                    <Lock />
                                    <span>Gizlilik</span>
                                    <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
                                    <i />
                                </label>
                            </div>
                        </div>

                        {/* Salon içi akış: Bekliyor → İşlemde → Kasada. Boşken üç sıfırlı
                            sütun yerine tek satır — bilgi zaten salon panelinde söylendi. */}
                        {/* Tek kişilikte salon içi akışı yan paneldeki Şimdi kutusu
                            taşır — aynı kişi ekranda iki kez görünmesin. */}
                        {!solo && <div className="gz-flow">
                            {inSalon.length === 0 ? (
                                <div className="gz-flow-line">
                                    <span className="gz-dot hollow" />
                                    <b>Salon içi</b>
                                    <span>Salonda kimse yok</span>
                                    <span className="t">{nowTime}</span>
                                </div>
                            ) : (
                                <>
                                    <div className="gz-flow-line">
                                        <span className="gz-dot orange" />
                                        <b>Salon içi</b>
                                        <span>{nowTime} · {inSalon.length} müşteri</span>
                                    </div>
                                    <div className="gz-flow-cols">
                                        {([
                                            { key: 'waiting', title: 'Bekliyor', dot: 'amber', list: waiting },
                                            { key: 'active', title: 'İşlemde', dot: 'orange', list: inService },
                                            { key: 'checkout', title: 'Kasada', dot: 'green', list: atTill },
                                        ] as const).map((stage) => (
                                            <div className="gz-stage" key={stage.key}>
                                                <div className="gz-stage-head">
                                                    <span className={cn('gz-dot', stage.dot)} />
                                                    <b>{stage.title}</b>
                                                    <span>{stage.list.length}</span>
                                                </div>
                                                {stage.list.length === 0 ? (
                                                    <span className="gz-stage-none">Kimse yok</span>
                                                ) : stage.list.map((r) => {
                                                    const waitMin = r.customerArrivedAt ? minsSince(r.customerArrivedAt, now) : 0;
                                                    const runMin = r.arrivedAt ? minsSince(r.arrivedAt, now) : 0;
                                                    const late = stage.key === 'waiting' && waitMin >= 10;
                                                    const amount = sessionAmount(r);
                                                    // Yoğunlukta aksiyon satırın kendisinde olmalı — seçip
                                                    // aşağıdaki çubuğa inmek kişi başı 2 tık + göz gezintisiydi.
                                                    // Kasada sütununda aksiyon YOK: tahsilat Kasa sayfasında
                                                    // yapılır, dashboard yalnız "kim kasada bekliyor"u gösterir.
                                                    const act = stage.key === 'waiting' ? { label: 'Kabine al', run: () => void advance(r, 'active') }
                                                        : stage.key === 'active' ? { label: 'Bitir', run: () => void advance(r, 'completed') }
                                                            : null;
                                                    const sub = stage.key === 'checkout'
                                                        ? r.service
                                                        : [cabinName(r.resourceId), r.staffName].filter(Boolean).join(' · ') || locationOf(r);
                                                    return (
                                                        <div key={r.id} role="button" tabIndex={0} aria-pressed={selected?.id === r.id}
                                                            className={cn('gz-person', selected?.id === r.id && 'selected')}
                                                            onClick={() => setSelectedId(r.id)}
                                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(r.id); } }}>
                                                            <span className="gz-av">{initialsOf(r.customerName)}</span>
                                                            <span className="gz-person-tx">
                                                                <strong>{mask(r.customerName)}</strong>
                                                                <small>{sub}</small>
                                                            </span>
                                                            <span className={cn('gz-person-meta', late && 'late', stage.key === 'checkout' && 'ink')}>
                                                                {stage.key === 'waiting' ? `${waitMin} dk`
                                                                    : stage.key === 'active' ? `${runMin} dk`
                                                                        : amount > 0 ? fmtTL(amount) : 'hazır'}
                                                            </span>
                                                            {act && (
                                                                <button type="button" className="gz-btn sm" disabled={busyId === r.id}
                                                                    onClick={(e) => { e.stopPropagation(); act.run(); }}>{act.label}</button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>}

                        {/* Seçili seans + bağlamsal tek eylem — yalnız seçim varken.
                            Izgarada bir karta ya da akışta bir satıra tıklayınca açılır,
                            çarpıyla kapanır. */}
                        {selected && (() => {
                            const ph = phaseOf(selected);
                            const noshow = isNoShow(selected);
                            const amount = sessionAmount(selected);
                            const pkg = pkgByCustomer.get(selected.customerId);
                            const cab = cabins.find((c) => c.id === selected.resourceId);
                            const cabBusy = ph === 'arrived' && cab?.status === 'busy';
                            return (
                                <div className="gz-selbar" aria-live="polite">
                                    <span className="rail" style={{ background: serviceColor(selected.service) }} />
                                    <div className="gz-selbar-copy">
                                        <div className="l1">
                                            <strong onClick={() => openCustomer(selected.customerId)}>{mask(selected.customerName)}</strong>
                                            <span className={cn('gz-chip', noshow ? 'noshow' : PHASE_UI[ph])}>{noshow ? 'Gelmedi' : PHASE_TR[ph]}</span>
                                            <StampRow customerId={selected.customerId} color={serviceColor(selected.service)} />
                                        </div>
                                        <div className="l2">
                                            <span><Clock />{selected.startTime}–{selected.endTime}</span>
                                            <span>{selected.service}</span>
                                            {selected.staffName && <span><User />{selected.staffName}</span>}
                                            {cabinName(selected.resourceId) && <span><DoorOpen />Plan: {cabinName(selected.resourceId)}</span>}
                                            {ph !== 'completed' && !noshow && <span><MapPin />Şu an: {locationOf(selected)}</span>}
                                            {pkg && <span><Layers />Paket: {pkg.sessionsDone}/{pkg.sessionCount}</span>}
                                        </div>
                                    </div>
                                    <div className="gz-selbar-acts">
                                        <button type="button" className="gz-btn line raised" onClick={() => openCustomer(selected.customerId)}>Müşteri kartı</button>
                                        {ph === 'wait' && (
                                            <button type="button" className="gz-btn ink" disabled={busyId === selected.id}
                                                onClick={() => void advance(selected, 'arrived')}>Geldi<ArrowRight /></button>
                                        )}
                                        {ph === 'arrived' && (cabBusy ? (
                                            <span className="note">{cab?.name}<br /><b>~{cab?.freeAt}</b> boşalıyor</span>
                                        ) : (
                                            <button type="button" className="gz-btn ink" disabled={busyId === selected.id}
                                                onClick={() => void advance(selected, 'active')}>Kabine al<ArrowRight /></button>
                                        ))}
                                        {ph === 'active' && (
                                            <button type="button" className="gz-btn ink" disabled={busyId === selected.id}
                                                onClick={() => void advance(selected, 'completed')}>İşlemi bitir<ArrowRight /></button>
                                        )}
                                        {ph === 'done' && cashOn && (
                                            <button type="button" className="gz-btn ink"
                                                onClick={() => openCashFor(selected)}>Kasayı aç{amount > 0 ? ` · ${fmtTL(amount)}` : ''}<ArrowRight /></button>
                                        )}
                                        <button type="button" className="gz-x" aria-label="Seçimi kaldır" onClick={() => setSelectedId(null)}><X /></button>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* D · Gün planı — dikey saat ekseni + ünite/uzman sütunları */}
                        <div className="gz-plan-title">
                            <b>Gün planı</b>
                            <span>{pad2(grid.from)}:00–{pad2(grid.to)}:00</span>
                            <span>{todayList.length} {resWord}{atTill.length > 0 ? ` · ${atTill.length} ödeme bekliyor` : ''}</span>
                        </div>

                        {lanes.length === 0 ? (
                            <p className="gz-plan-empty">Önce Ayarlar'dan kabin/ünite ekleyin — gün planı burada sütunlara ayrılacak.</p>
                        ) : (
                            <div className={cn(solo && 'gz-solo')}>
                            <div className="gz-grid" style={{ '--lanes': lanes.length } as React.CSSProperties}>
                                {!solo && <div className="gz-grid-head">
                                    <span />
                                    {lanes.map((l) => laneMode === 'staff' && l.id !== '__none' ? (
                                        // Uzman sütunu: baş harf (işlemdeyse koyu) + ad + kısa durum
                                        <span className="gz-lane-head staff" key={l.id}>
                                            <span className={cn('gz-lav', l.tone === 'busy' && 'busy')}>{initialsOf(l.name)}</span>
                                            <span className="col">
                                                <b>{l.name}</b>
                                                {l.sub && <small>{l.sub}</small>}
                                            </span>
                                        </span>
                                    ) : (
                                        <span className="gz-lane-head" key={l.id}>
                                            <span className="row"><i className={cn('gz-udot', l.tone)} /><b>{l.name}</b></span>
                                            {l.sub && <small className={cn(l.tone === 'prep' && 'prep')}>{l.sub}</small>}
                                        </span>
                                    ))}
                                </div>}
                                <div className="gz-grid-body" style={{ height: canvasH }}>
                                    {nowVisible && <span className="gz-past" style={{ height: nowTop }} />}
                                    {grid.ticks.filter((h) => h > grid.from && h < grid.to).map((h) => (
                                        <span key={`line-${h}`} className="gz-hline" style={{ top: grid.topPx(h) }} />
                                    ))}
                                    <div className="gz-axis" style={{ gridColumn: 1, gridRow: 1 }}>
                                        {/* Şimdi etiketiyle çakışan saat etiketi gizlenir */}
                                        {/* Her saat yazılı, kapanış saati dahil */}
                                        {[...grid.labels, ...(grid.segs[grid.segs.length - 1]?.type === 'hours' ? [grid.to] : [])]
                                            .filter((h) => !nowVisible || Math.abs(grid.topPx(h) + 12 - nowTop) > 22)
                                            .map((h) => <span key={h} style={{ top: grid.topPx(h) }}>{pad2(h)}:00</span>)}
                                    </div>
                                    {lanes.map((lane, i) => {
                                        const items = placed.get(lane.id) || [];
                                        return (
                                            <div className="gz-lane" key={lane.id} style={{ gridColumn: i + 2, gridRow: 1 }}>
                                                {/* "+" ipucu yalnız boş ve geçmemiş saat satırında */}
                                                {addableHours
                                                    .filter((h) => !items.some(({ r }) => timeToH(r.startTime) < h + 1 && timeToH(r.endTime) > h))
                                                    .map((h) => (
                                                        <button key={`add-${h}`} type="button" className="gz-slot"
                                                            style={{ top: grid.topPx(h), height: grid.pph }}
                                                            aria-label={`${lane.name} · ${pad2(h)}:00 için yeni ${resWord}`}
                                                            onClick={() => openSlot(h, lane.id)}>
                                                            + {pad2(h)}:00
                                                        </button>
                                                    ))}
                                                {items.map(({ r, top, height, col, cols }) => {
                                                    const ph = phaseOf(r);
                                                    const noshow = isNoShow(r);
                                                    const isSel = selected?.id === r.id;
                                                    // Çakışma sütunu ikiye böldüyse yalnız ad; kısa seans tek satır
                                                    const split = cols > 1;
                                                    const compact = height < 44 || split;
                                                    const st = cardStatus(r);
                                                    // Dar sütunda (3+ sütun) durum yazı yerine nokta; kalan süre yazı kalır
                                                    const narrow = lanes.length > 2 || split;
                                                    return (
                                                        <button key={r.id} type="button" aria-pressed={isSel}
                                                            title={st ? `${r.customerName} · ${st.text}` : undefined}
                                                            className={cn('gz-appt', noshow ? 'noshow' : PHASE_UI[ph], isSel && 'selected', compact && 'compact')}
                                                            style={{
                                                                top, height,
                                                                left: `calc(${(col / cols) * 100}% + 4px)`,
                                                                width: `calc(${100 / cols}% - 8px)`,
                                                                // Hizmet rengi sol şeritte — durum rengi kart tonunda
                                                                '--svc': serviceColor(r.service),
                                                            } as React.CSSProperties}
                                                            onClick={() => setSelectedId(isSel ? null : r.id)}>
                                                            <i className="rail" />
                                                            <span className="tx">
                                                                <strong>{mask(r.customerName)}</strong>
                                                                {!split && !(compact && narrow) && <small>{narrow ? r.startTime : `${r.startTime}–${r.endTime}`} · {r.service}</small>}
                                                            </span>
                                                            {st && (narrow && st.tone !== 'live'
                                                                ? <i className={cn('st-dot', st.tone)} aria-label={st.text} />
                                                                : <em className={cn('st', st.tone)}>{narrow ? st.text.replace(' kaldı', '') : st.text}</em>)}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                    {grid.gaps.map((s) => (
                                        <div key={`gap-${s.from}`} className="gz-fold" style={{ top: s.y, height: s.h }}>
                                            <span>{pad2(s.from)}:00</span>
                                            <span>{pad2(s.from)}:00–{pad2(s.to)}:00 · boş</span>
                                        </div>
                                    ))}
                                    {nowVisible && <div className="gz-now" style={{ top: nowTop }}><b>{nowTime}</b></div>}
                                </div>
                            </div>

                            {/* Tek kişilik yan panel — ızgaranın yanındaki boş alan:
                                Şimdi · Boş aralıklar · İlgilenilecek (Gün planı tasarımı) */}
                            {solo && (
                                <aside className="gz-side" aria-label="Günün özeti">
                                    <div className="gz-side-now">
                                        {current ? (() => {
                                            const ph = phaseOf(current);
                                            const amount = sessionAmount(current);
                                            const big = ph === 'active' ? { n: String(minsLeft(current)), u: 'dk' }
                                                : ph === 'arrived' ? { n: String(current.customerArrivedAt ? minsSince(current.customerArrivedAt, now) : 0), u: 'dk bekliyor' }
                                                    : { n: amount > 0 ? fmtTL(amount) : '', u: '' };
                                            return (
                                                <>
                                                    <span className="k"><i />{ph === 'active' ? 'ŞİMDİ' : ph === 'arrived' ? 'BEKLİYOR' : 'KASADA'}</span>
                                                    <div className="main">
                                                        <button type="button" className="who" onClick={() => setSelectedId(current.id)}>
                                                            <b>{mask(current.customerName)}</b>
                                                            <small>{current.service}{ph === 'active' ? ` · ${current.endTime}'de biter` : ''}</small>
                                                        </button>
                                                        {big.n && <span className="big">{big.n}{big.u && <small> {big.u}</small>}</span>}
                                                    </div>
                                                    {ph === 'active' && <button type="button" className="gz-btn sm" disabled={busyId === current.id} onClick={() => void advance(current, 'completed')}>Bitir</button>}
                                                    {ph === 'arrived' && <button type="button" className="gz-btn sm" disabled={busyId === current.id} onClick={() => void advance(current, 'active')}>İşleme al</button>}
                                                    {ph === 'done' && cashOn && <button type="button" className="gz-btn sm" onClick={() => openCashFor(current)}>Kasayı aç</button>}
                                                </>
                                            );
                                        })() : (
                                            <>
                                                <span className="k idle"><i />ŞU AN</span>
                                                <div className="main"><span className="who"><b>Boştasınız</b></span></div>
                                            </>
                                        )}
                                        <div className="next">
                                            {nextUp ? (
                                                <>
                                                    <span>Sıradaki</span>
                                                    <button type="button" onClick={() => setSelectedId(nextUp.id)}>{nextUp.startTime} {mask(nextUp.customerName)}</button>
                                                    <span className="r">{durTR(Math.max(0, (timeToH(nextUp.startTime) - grid.nowH) * 60))} sonra</span>
                                                </>
                                            ) : <span>Bugün başka {resWord} yok</span>}
                                        </div>
                                    </div>

                                    {freeGaps.length > 0 && (
                                        <div className="gz-side-box">
                                            <span className="bt">Boş aralıklar · {durTR(freeTotal)}</span>
                                            <ul>
                                                {freeGaps.map((g) => (
                                                    <li key={g.from}>
                                                        <b>{hToHM(g.from)}–{hToHM(g.to)}</b>
                                                        <span>{durTR((g.to - g.from) * 60)}</span>
                                                        <button type="button" onClick={() => openAt(g.from)}>Ekle</button>
                                                    </li>
                                                ))}
                                            </ul>
                                            <button type="button" className="share" onClick={shareBooking}>
                                                {bookingUrl ? 'Randevu bağlantısını kopyala' : 'Randevu adresi oluştur'}
                                            </button>
                                        </div>
                                    )}

                                    {attention.length > 0 && (
                                        <div className="gz-side-box">
                                            <span className="bt">İlgilenilecek</span>
                                            <ul>
                                                {attention.map((r) => {
                                                    const pay = phaseOf(r) === 'done';
                                                    const amount = sessionAmount(r);
                                                    return (
                                                        <li key={r.id}>
                                                            <i className={cn('st-dot', pay ? 'amber' : 'red')} />
                                                            <span className="nm"><b>{mask(r.customerName)}</b> · {pay ? (amount > 0 ? `${fmtTL(amount)} ödenmedi` : 'ödeme bekliyor') : `${r.startTime} gelmedi`}</span>
                                                            {pay && cashOn
                                                                ? <button type="button" onClick={() => openCashFor(r)}>Tahsil et</button>
                                                                : <button type="button" onClick={() => openCustomer(r.customerId)}>Kart</button>}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    )}
                                </aside>
                            )}
                            </div>
                        )}

                        {/* Dar ekran: ızgara yerine doğal liste */}
                        <div className="gz-mlist">
                            {todayList.map((r) => {
                                const ph = phaseOf(r);
                                const noshow = isNoShow(r);
                                return (
                                    <button key={r.id} type="button" className={cn(selected?.id === r.id && 'selected')}
                                        onClick={() => setSelectedId(selected?.id === r.id ? null : r.id)}>
                                        <time>{r.startTime}</time>
                                        <span>
                                            <strong>{mask(r.customerName)}</strong>
                                            <small>{noshow ? 'Gelmedi' : PHASE_TR[ph]} · {locationOf(r)}</small>
                                        </span>
                                        <i className={cn('gz-dot', DOT[noshow ? 'noshow' : PHASE_UI[ph]])} />
                                    </button>
                                );
                            })}
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
function WalkInForm({ customers, services, cabins, staff, staffBusy, history, sector, onCreateCustomer, onClose, onStart }: {
    customers: Customer[];
    services: Service[];
    cabins: { id: string; name: string; status: CabinStatus; freeAt?: string }[];
    staff: { id: string; name: string }[];
    /** İşlemdeki uzmanlar — seçilemez gösterilir */
    staffBusy: Record<string, boolean>;
    /** İptal dışı tüm randevular — müşterinin ziyaret sayısı ve son hizmeti için */
    history: Reservation[];
    sector?: string | null;
    onCreateCustomer: (c: Omit<Customer, 'id' | 'createdAt' | 'totalReservations'>) => Promise<Customer | null>;
    onClose: () => void;
    onStart: (payload: Omit<Reservation, 'id' | 'createdAt'>) => Promise<void>;
}) {
    const [query, setQuery] = useState('');
    const [picked, setPicked] = useState<Customer | null>(null);
    // Kapıdan giren müşteri çoğunlukla KAYITLI DEĞİLDİR. Eski hâli "Müşteriler
    // sayfasından ekleyip geri dönün" diyordu; kutunun kendi vaadini
    // ("hemen işleme al") bozuyordu.
    const [creating, setCreating] = useState(false);
    const [newPhone, setNewPhone] = useState('');
    const [risks, setRisks] = useState<Record<string, boolean>>({});
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

    // Geçmiş kayıttaki hizmet metni ek taşıyabilir ("lazer · 4 seans",
    // "kaş, bıyık") — eşleşme ilk hizmet adıyla yapılır.
    const serviceIdOf = (text: string) => {
        const head = text.split(' · ')[0].split(',')[0].trim().toLocaleLowerCase('tr');
        return services.find((s) => s.name.trim().toLocaleLowerCase('tr') === head)?.id;
    };
    // Seçili müşterinin geçmişi: kaçıncı ziyaret, en son hangi hizmet
    const past = useMemo(() => {
        if (!picked) return null;
        const today = todayISO();
        const list = history
            .filter((r) => r.customerId === picked.id && r.date < today)
            .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
        const last = list[0];
        return {
            visits: list.length,
            last,
            lastLabel: last ? `${new Date(`${last.date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} · ${last.service}` : '',
            lastServiceId: last ? serviceIdOf(last.service) : undefined,
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serviceIdOf yalnız services'e bağlı
    }, [picked, history, services]);
    // Müşteri seçilince son aldığı hizmet önden seçilir
    const pick = (c: Customer) => {
        const last = history
            .filter((r) => r.customerId === c.id && r.date < todayISO())
            .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime))[0];
        const sid = last ? serviceIdOf(last.service) : undefined;
        if (sid) setServiceId(sid);
        setPicked(c);
    };

    // Özet kutusu: şimdi başlar → biter
    const nowD = new Date();
    const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const endsAt = hm(new Date(nowD.getTime() + (service?.duration || 60) * 60_000));
    const freeCabins = cabins.filter((c) => c.status === 'free').length;
    const freeStaff = staff.filter((s) => !staffBusy[s.id]).length;

    // Sektörün kontrendikasyon bayrakları — güzellikte "Hamilelik", kuaförde yok.
    const riskFlags = useMemo(() => profileForSector(sector).riskFlags ?? [], [sector]);

    /** Yeni müşteriyi açıp doğrudan seçili hâle getirir; akış kesilmez. */
    const createAndPick = async () => {
        const name = query.trim();
        if (!name || saving) return;
        setSaving(true);
        const customFields: Record<string, string | number | boolean> = {};
        for (const f of riskFlags) if (risks[f.key]) customFields[f.key] = true;
        const created = await onCreateCustomer({
            name,
            phone: newPhone.replace(/\s+/g, '').trim(),
            email: '',
            notes: 'Randevusuz — kapıda eklendi',
            ...(Object.keys(customFields).length > 0 ? { customFields } : {}),
        });
        setSaving(false);
        if (!created) return;   // addCustomer kendi hatasını zaten bildiriyor
        setCreating(false);
        setPicked(created);
    };

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

    // Randevusuz müşteri tasarımı (2026-11-17): numaralı üç adım + sağda koyu
    // özet kutusu (gün planındaki Şimdi kutusunun dili). Ünite/uzman açılır
    // menü değil, durumunu söyleyen düğme; dolu olan soluk ve seçilemez.
    const field = 'w-full h-12 px-4 rounded-xl border border-[var(--dc-border2)] bg-[var(--dc-card)] text-[15px] text-[color:var(--dc-ink)] outline-none focus:outline-2 focus:outline-[var(--dc-orange)] focus:-outline-offset-1';
    const staffName = staff.find((s) => s.id === staffId)?.name;
    const cabinLabel = cabins.find((c) => c.id === cabinId)?.name;

    return (
        <section className="gz-card gz-wi" aria-label="Randevusuz müşteri">
            <header className="gz-wi-head">
                <span className="ic"><Zap /></span>
                <div className="tt">
                    <b>Randevusuz müşteri</b>
                    <span>Kapıdan gireni üç dokunuşta işleme alın</span>
                </div>
                <div className="live">
                    {cabins.length > 0 && <span><i className={cn(freeCabins === 0 && 'off')} />{freeCabins > 0 ? `${freeCabins} ünite boş` : 'Boş ünite yok'}</span>}
                    {staff.length > 1 && <span><i className={cn(freeStaff === 0 && 'off')} />{freeStaff > 0 ? `${freeStaff} uzman müsait` : 'Herkes işlemde'}</span>}
                    <button type="button" onClick={onClose} aria-label="Kapat" className="x"><X /></button>
                </div>
            </header>

            <div className="gz-wi-body">
                <div className="gz-wi-main">
                    {/* 1 · Müşteri */}
                    <div>
                        <p className="gz-wi-lb">1 · Müşteri</p>
                        {!picked ? (
                            <>
                                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="İsim veya telefon yazın…" className={field} />
                                <div className="gz-wi-results">
                                    {results.map((c) => (
                                        <button key={c.id} type="button" onClick={() => pick(c)} className="gz-wi-row">
                                            <span className="av">{initialsOf(c.name)}</span>
                                            <span className="tx"><b>{c.name}</b><small>{c.phone}</small></span>
                                            {(c.loyaltyStamps ?? 0) > 0 && <span className="stamp"><Gift />{c.loyaltyStamps}</span>}
                                        </button>
                                    ))}
                                    {query.trim() && results.length === 0 && !creating && (
                                        <button type="button" onClick={() => setCreating(true)} className="gz-wi-row add">
                                            <span className="av"><Plus /></span>
                                            <span className="tx"><b>"{query.trim()}" adıyla yeni müşteri</b><small>Kaydı burada açıp işleme başlayın</small></span>
                                        </button>
                                    )}
                                    {creating && (
                                        <div className="gz-wi-new">
                                            <b>{query.trim()}</b>
                                            <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} inputMode="tel"
                                                placeholder="Telefon (opsiyonel — hatırlatma için)" className={field} />
                                            {/* Sektörün risk bayrakları burada SORULUR. Hızlı ekleme
                                                yolları bunu hiç sormuyordu; kaydı açıp aynı tıkla
                                                lazer seansı başlatmak, 076 guard'ının koruduğu şeyi
                                                boşa çıkarırdı — bayrağı hiç girilmemiş müşteride
                                                guard zaten engel görmez. */}
                                            {riskFlags.map((f) => (
                                                <label key={f.key} className="risk">
                                                    <input type="checkbox" checked={Boolean(risks[f.key])}
                                                        onChange={(e) => setRisks((r) => ({ ...r, [f.key]: e.target.checked }))} />
                                                    {f.label}
                                                    {f.note && <small>· {f.note}</small>}
                                                </label>
                                            ))}
                                            <div className="acts">
                                                <button type="button" onClick={() => { setCreating(false); setNewPhone(''); setRisks({}); }}
                                                    className="gz-btn line">Vazgeç</button>
                                                <button type="button" onClick={createAndPick} disabled={saving} className="gz-btn ink flex-1">
                                                    {saving ? 'Kaydediliyor…' : 'Kaydet ve devam et'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="gz-wi-who">
                                <span className="av">{initialsOf(picked.name)}</span>
                                <span className="tx">
                                    <b>{picked.name}</b>
                                    <small>
                                        {picked.phone && <span>{picked.phone}</span>}
                                        <span>{past && past.visits > 0 ? `${past.visits + 1}. ziyaret` : 'İlk ziyaret'}</span>
                                        {past?.lastLabel && <span>Son: {past.lastLabel}</span>}
                                    </small>
                                </span>
                                <button type="button" onClick={() => { setPicked(null); setQuery(''); }} className="chg">Değiştir</button>
                            </div>
                        )}
                    </div>

                    {/* 2 · Hizmet */}
                    <div>
                        <p className="gz-wi-lb">2 · Hizmet</p>
                        <div className="gz-wi-tiles">
                            {services.map((s) => (
                                <button key={s.id} type="button" aria-pressed={serviceId === s.id} onClick={() => setServiceId(s.id)}
                                    className={cn('gz-wi-tile', serviceId === s.id && 'on')}>
                                    {past?.lastServiceId === s.id && <span className="tag">Son seferki</span>}
                                    <span className="nm"><i style={{ background: s.color }} />{s.name}</span>
                                    <span className="mt">{s.duration} dk{s.price ? ` · ${fmtTL(s.price)}` : ''}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 3 · Nerede / Kim — tek seçenekli olan gizlenir */}
                    {(cabins.length > 0 || staff.length > 1) && (
                        <div className="gz-wi-where">
                            {cabins.length > 0 && (
                                <div>
                                    <p className="gz-wi-lb">3 · Nerede</p>
                                    <div className="gz-wi-chips">
                                        {cabins.map((c) => {
                                            const busy = c.status === 'busy';
                                            return (
                                                <button key={c.id} type="button" disabled={busy} aria-pressed={cabinId === c.id}
                                                    onClick={() => setCabinId(c.id)} className={cn('gz-wi-chip', cabinId === c.id && 'on', busy && 'off')}>
                                                    {c.name} <small>{busy ? (c.freeAt ? `~${c.freeAt}` : 'dolu') : c.status === 'prep' ? 'hazırlanıyor' : 'boş'}</small>
                                                </button>
                                            );
                                        })}
                                        <button type="button" aria-pressed={cabinId === ''} onClick={() => setCabinId('')}
                                            className={cn('gz-wi-chip', cabinId === '' && 'on')}>Fark etmez</button>
                                    </div>
                                </div>
                            )}
                            {staff.length > 1 && (
                                <div>
                                    <p className="gz-wi-lb">{cabins.length > 0 ? 'Kim' : '3 · Kim'}</p>
                                    <div className="gz-wi-chips">
                                        {staff.map((s) => {
                                            const busy = Boolean(staffBusy[s.id]);
                                            return (
                                                <button key={s.id} type="button" disabled={busy} aria-pressed={staffId === s.id}
                                                    onClick={() => setStaffId(s.id)} className={cn('gz-wi-chip person', staffId === s.id && 'on', busy && 'off')}>
                                                    <span className="av">{initialsOf(s.name)}</span>{s.name.split(' ')[0]} <small>{busy ? 'işlemde' : 'müsait'}</small>
                                                </button>
                                            );
                                        })}
                                        <button type="button" aria-pressed={staffId === ''} onClick={() => setStaffId('')}
                                            className={cn('gz-wi-chip', staffId === '' && 'on')}>Fark etmez</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Özet — koyu kutu, tek eylem */}
                <aside className="gz-wi-sum">
                    <span className="k"><i />Şimdi başlar</span>
                    <div className="when"><b>{hm(nowD)}</b><span>→ {endsAt} biter</span></div>
                    <dl>
                        <div><dt>Müşteri</dt><dd>{picked?.name ?? '—'}</dd></div>
                        <div><dt>Hizmet</dt><dd>{service ? `${service.name} · ${service.duration} dk` : '—'}</dd></div>
                        {cabins.length > 0 && <div><dt>Nerede</dt><dd>{cabinLabel ?? 'Fark etmez'}</dd></div>}
                        {staff.length > 1 && <div><dt>Kim</dt><dd>{staffName ?? 'Fark etmez'}</dd></div>}
                        {service?.price ? <div className="tot"><dt>Tutar</dt><dd>{fmtTL(service.price)}</dd></div> : null}
                    </dl>
                    <button type="button" disabled={!canStart} onClick={() => void start()} className="go">
                        {saving ? 'Başlatılıyor…' : picked ? 'Hemen başlat' : 'Önce müşteriyi seçin'}
                        {picked && !saving && <ArrowRight />}
                    </button>
                    <small className="note">Ödeme, işlem bitince Kasa'da alınır</small>
                </aside>
            </div>
        </section>
    );
}
