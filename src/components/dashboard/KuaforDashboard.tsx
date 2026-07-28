import { useEffect, useMemo, useState, type CSSProperties, type ElementType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle, ArrowRight, BadgeCheck, CalendarDays, Check, ChevronDown, ChevronRight,
    CircleDollarSign, Clock3, Coffee, DoorOpen, Droplets, Eye, EyeOff, Gauge, History,
    PackageOpen, Plus, Scissors, Search, ShieldCheck, Sparkles, TimerReset, WandSparkles,
    Waves, WalletCards, X, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { useResources } from '@/hooks/useResources';
import { useCustomers } from '@/hooks/useCustomers';
import { useStaff } from '@/hooks/useStaff';
import { useWaitlist } from '@/hooks/useWaitlist';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import { todayISO, toISODate } from '@/utils/date';
import { phaseOf, minsSince, advancePatch } from '@/lib/sessionPhase';
import { profileForSector } from '@/lib/sectorProfiles';
import { AdisyonModal } from '@/components/reservations/AdisyonModal';
import { EditReservationModal } from '@/components/reservations/EditReservationModal';
import type { Customer, Reservation, Service } from '@/types';
import './kuaforOps.css';

// ── Kuaför Dashboard'u · "Salon akışı" ───────────────────────────────────────
// Tasarım: Timeflow Kuafor Dashboard V2. İlke — kuaförde randevu saati değil
// müşterinin GERÇEK AŞAMASI yönetilir: bekliyor → uygulamada → boya süresi →
// yıkama/fön → kasa. Boya süresi salonun tek gerçek "sayaçlı" işidir; kaçırılan
// kontrol saçı yakar. Bu yüzden gecikmiş kontrol ekranın en koyu kartıdır.
//
// Aşama, yeni bir kolon değil: zaman damgalarından (sessionPhase) türetilir,
// yalnız 'active' fazının içindeki iki ara adım (boya süresi / yıkama) randevu
// custom_fields'ında saklanır — sayfa yenilense de sayaç doğru devam eder.

type KfStage = 'waiting' | 'service' | 'processing' | 'finish' | 'checkout';
type BoardView = 'flow' | 'seats' | 'team';
type ScheduleView = 'team' | 'resources';
type Tone = 'amber' | 'orange' | 'purple' | 'blue' | 'green' | 'red';

// custom_fields anahtarları — kuaför akışına özel, tek yerde tanımlı
const CF_STAGE = 'kf_stage';        // 'processing' | 'finish'
const CF_TIMER = 'kf_timer_end';    // ISO — boya süresi hedefi
const CF_FORMULA = 'kf_formula';    // renk formülü (varsa gösterilir)

// Boya süresi varsayılanı; hizmet süresi biliniyorsa onun yarısı kullanılır
const PROCESS_MIN = 30;

// Renk işlemi mi? Boya süresi aşaması YALNIZ bunlarda açılır — kesim/fön
// müşterisi boya sayacına zorlanmaz.
const COLOR_RE = /boya|renk|balyaj|r[öo]fle|ombre|somb?re|a[çc]ma|toner|me[çc]|perma|keratin|highlight|k[üu]ll[üu]/i;
const isColorService = (name: string) => COLOR_RE.test(name || '');

// Yıkama üniteleri koltuklardan ayrılır — "1/2 yıkama aktif" satırı buradan
const isWashUnit = (name: string, type?: string) => /y[ıi]kama|wash/i.test(`${name} ${type || ''}`);

const STAGES: { key: KfStage; label: string; icon: ElementType }[] = [
    { key: 'waiting', label: 'Bekliyor', icon: Clock3 },
    { key: 'service', label: 'Uygulamada', icon: Scissors },
    { key: 'processing', label: 'Boya süresi', icon: TimerReset },
    { key: 'finish', label: 'Yıkama · Fön', icon: Waves },
    { key: 'checkout', label: 'Kasaya hazır', icon: WalletCards },
];

const STAGE_TONE: Record<KfStage, Tone> = {
    waiting: 'amber', service: 'orange', processing: 'purple', finish: 'blue', checkout: 'green',
};

const money = (n: number) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const initialsOf = (name: string) => name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toLocaleUpperCase('tr');
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
/** "45 dakikalık" / "2,5 saatlik" — uzun boşluklarda dakika okunmuyor. */
const durText = (m: number) => (m < 90 ? `${m} dakikalık` : `${(m / 60).toFixed(m % 60 === 0 ? 0 : 1).replace('.', ',')} saatlik`);
/** Timestamp'ı temizlemek için — updateReservation undefined'ı atlar, null'ı yazar. */
const CLEAR = null as unknown as undefined;

/** Randevunun kuaför akışındaki aşaması; salon dışındaysa null. */
function stageOf(r: Reservation): KfStage | null {
    const ph = phaseOf(r);
    if (ph === 'arrived') return 'waiting';
    if (ph === 'active') {
        const s = r.customFields?.[CF_STAGE];
        if (s === 'processing') return 'processing';
        if (s === 'finish') return 'finish';
        return 'service';
    }
    if (ph === 'done') return 'checkout';
    return null;
}

export function KuaforDashboard() {
    const navigate = useNavigate();
    const { dark } = useTheme();
    const { reservations, settings, updateReservation, addReservation } = useReservations();
    const { resources } = useResources();
    const { customers } = useCustomers();
    const { staff } = useStaff();
    const { entries: waitlist } = useWaitlist();
    const today = todayISO();

    // Ağır hesaplar 20 saniyede bir tazelenir; saniyelik sayaçlar kendi
    // bileşenlerinde döner (bütün dashboard saniyede bir yeniden çizilmesin).
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 20_000);
        return () => clearInterval(t);
    }, []);
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const [boardView, setBoardView] = useState<BoardView>('flow');
    const [scheduleView, setScheduleView] = useState<ScheduleView>('team');
    const [privacy, setPrivacy] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [walkinOpen, setWalkinOpen] = useState(false);
    const [cardRes, setCardRes] = useState<Reservation | null>(null);
    const [editRes, setEditRes] = useState<Reservation | null>(null);

    const services: Service[] = useMemo(() => settings.services || [], [settings.services]);
    const active = useMemo(() => reservations.filter((r) => r.status !== 'cancelled'), [reservations]);
    const todayList = useMemo(
        () => active.filter((r) => r.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [active, today],
    );
    const activeResources = useMemo(() => resources.filter((r) => r.isActive).sort((a, b) => a.sort - b.sort), [resources]);
    const activeStaff = useMemo(() => staff.filter((s) => s.isActive !== false), [staff]);

    // ── Aşama kümeleri ────────────────────────────────────────────────────────
    const byStage = useMemo(() => {
        const map: Record<KfStage, Reservation[]> = { waiting: [], service: [], processing: [], finish: [], checkout: [] };
        for (const r of todayList) { const s = stageOf(r); if (s) map[s].push(r); }
        return map;
    }, [todayList]);
    const inSalon = useMemo(
        () => STAGES.flatMap((s) => byStage[s.key]),
        [byStage],
    );
    const upcoming = useMemo(
        () => todayList.filter((r) => phaseOf(r) === 'wait' && toMin(r.endTime) >= nowMin),
        [todayList, nowMin],
    );
    const doneToday = useMemo(() => todayList.filter((r) => phaseOf(r) === 'completed'), [todayList]);

    // Gecikmiş renk kontrolleri — ekranın en kritik sinyali
    const overdueChecks = useMemo(
        () => byStage.processing
            .filter((r) => { const e = r.customFields?.[CF_TIMER]; return typeof e === 'string' && new Date(e).getTime() <= now.getTime(); })
            .sort((a, b) => String(a.customFields?.[CF_TIMER]).localeCompare(String(b.customFields?.[CF_TIMER]))),
        [byStage.processing, now],
    );
    // 10 dakikayı geçen bekleme — karşılama sinyali
    const longWaits = useMemo(
        () => byStage.waiting
            .map((r) => ({ r, mins: r.customerArrivedAt ? minsSince(r.customerArrivedAt, now) : 0 }))
            .filter((x) => x.mins >= 10)
            .sort((a, b) => b.mins - a.mins),
        [byStage.waiting, now],
    );

    // ── Kaynak durumu (koltuk / yıkama) ───────────────────────────────────────
    const units = useMemo(() => activeResources.map((res) => {
        const here = inSalon.filter((r) => r.resourceId === res.id);
        const working = here.find((r) => { const s = stageOf(r); return s === 'service' || s === 'processing' || s === 'finish'; });
        const st = stageOf(working || ({} as Reservation));
        const overdue = working && overdueChecks.some((o) => o.id === working.id);
        const prep = !working && here.some((r) => stageOf(r) === 'waiting');
        const state: 'free' | 'busy' | 'processing' | 'prep' | 'late' =
            overdue ? 'late' : st === 'processing' ? 'processing' : working ? 'busy' : prep ? 'prep' : 'free';
        return {
            id: res.id, name: res.name, wash: isWashUnit(res.name, res.type), state,
            client: working?.customerName || (prep ? 'Hazırlanıyor' : 'Boş'),
            detail: overdue ? 'Renk kontrolü gecikti'
                : working ? working.service
                    : prep ? 'Müşteri bekliyor' : 'Hazır',
            freeAt: working?.endTime,
        };
    }), [activeResources, inSalon, overdueChecks]);

    const chairs = useMemo(() => units.filter((u) => !u.wash), [units]);
    const washes = useMemo(() => units.filter((u) => u.wash), [units]);
    const busyChairs = chairs.filter((c) => c.state !== 'free').length;
    const busyWashes = washes.filter((c) => c.state !== 'free').length;

    // ── Ekip yükü ─────────────────────────────────────────────────────────────
    const workDay = useMemo(() => {
        const wh = settings.workingHours?.find((w) => w.day === now.getDay());
        return { open: toMin(wh?.start || '09:00'), close: toMin(wh?.end || '19:00') };
    }, [settings.workingHours, now]);

    const team = useMemo(() => activeStaff.map((s) => {
        const mine = todayList.filter((r) => r.staffId === s.id);
        const minutes = mine.reduce((sum, r) => sum + Math.max(0, toMin(r.endTime) - toMin(r.startTime)), 0);
        const span = Math.max(60, workDay.close - workDay.open);
        const load = Math.min(100, Math.round((minutes / span) * 100));
        const current = inSalon.find((r) => r.staffId === s.id);
        const next = mine.find((r) => phaseOf(r) === 'wait' && toMin(r.startTime) >= nowMin);
        return {
            id: s.id, name: s.name, role: s.specialty || profileForSector(settings.sector).staffRoles?.doctor?.label || 'Kuaför',
            load, count: mine.length,
            current: current ? `${current.customerName.split(' ')[0]} · ${current.service}` : mine.length ? 'Şu an boşta' : 'Bugün randevusu yok',
            next: next ? `${next.customerName.split(' ')[0]} · ${next.startTime}` : 'Gün planı bitti',
            tone: load >= 85 ? 'red' : load >= 60 ? '' : load >= 30 ? 'blue' : 'green',
        };
    }), [activeStaff, todayList, inSalon, workDay, nowMin, settings.sector]);

    // ── Gizlilik maskesi (ortak ekranda soyad) ────────────────────────────────
    const mask = useMemo(() => (name: string) => {
        if (!privacy || !name) return name;
        const parts = name.trim().split(/\s+/);
        if (parts.length < 2) return parts[0] || name;
        return `${parts[0]} ${parts[parts.length - 1][0].toLocaleUpperCase('tr')}.`;
    }, [privacy]);

    // ── Seçili müşteri ────────────────────────────────────────────────────────
    const selected = useMemo(
        () => inSalon.find((r) => r.id === selectedId) || overdueChecks[0] || inSalon[0] || upcoming[0] || null,
        [inSalon, selectedId, overdueChecks, upcoming],
    );

    // ── Aşama ilerletme ───────────────────────────────────────────────────────
    // Her ilerletme geri alınabilir: sonner aksiyonu önceki alanları aynen yazar.
    const runStep = async (r: Reservation, patch: Partial<Reservation>, undo: Partial<Reservation>, message: string) => {
        if (busyId) return;                       // çift tıklama ikinci kayıt açmaz
        setBusyId(r.id);
        const ok = await updateReservation(r.id, patch);
        setBusyId(null);
        if (!ok) return;
        setSelectedId(r.id);
        toast.success(message, {
            action: { label: 'Geri al', onClick: () => { void updateReservation(r.id, undo); } },
        });
    };

    const cf = (r: Reservation, patch: Record<string, string | number | boolean | undefined>) => {
        const next = { ...(r.customFields || {}) };
        for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete next[k]; else next[k] = v; }
        return next;
    };

    /** Aşamaya göre TEK geçerli sonraki adım — kesim müşterisi boyaya zorlanmaz. */
    const nextStep = (r: Reservation): { label: string; run: () => void } | null => {
        const st = stageOf(r);
        const prevCF = { ...(r.customFields || {}) };
        if (st === 'waiting') return {
            label: 'Koltuğa al',
            run: () => void runStep(r, advancePatch('active'),
                { arrivedAt: CLEAR, status: 'confirmed' }, `${r.customerName.split(' ')[0]} koltuğa alındı`),
        };
        if (st === 'service') {
            if (isColorService(r.service)) {
                const dur = services.find((s) => s.name === r.service)?.duration;
                const mins = Math.max(10, Math.round((dur ? dur / 2 : PROCESS_MIN)));
                return {
                    label: 'Boya süresini başlat',
                    run: () => void runStep(r,
                        { customFields: cf(r, { [CF_STAGE]: 'processing', [CF_TIMER]: new Date(Date.now() + mins * 60_000).toISOString() }) },
                        { customFields: prevCF }, `Boya süresi başladı · ${mins} dk`),
                };
            }
            return {
                label: 'Yıkamaya al',
                run: () => void runStep(r, { customFields: cf(r, { [CF_STAGE]: 'finish' }) },
                    { customFields: prevCF }, `${r.customerName.split(' ')[0]} yıkamaya alındı`),
            };
        }
        if (st === 'processing') return {
            label: 'Kontrol edildi',
            run: () => void runStep(r, { customFields: cf(r, { [CF_STAGE]: 'finish', [CF_TIMER]: undefined }) },
                { customFields: prevCF }, 'Renk kontrolü kaydedildi · sırada yıkama'),
        };
        if (st === 'finish') return {
            label: 'Kasaya gönder',
            run: () => void runStep(r,
                { ...advancePatch('completed'), customFields: cf(r, { [CF_STAGE]: undefined, [CF_TIMER]: undefined }) },
                { serviceEndedAt: CLEAR, status: 'confirmed', customFields: prevCF }, `${r.customerName.split(' ')[0]} kasaya gönderildi`),
        };
        // Kasada aksiyon yok: tahsilat Kasa sayfasında yapılır (bkz. d6a7ce1)
        if (st === 'checkout') return { label: 'Kasayı aç', run: () => navigate('/kasa') };
        return null;
    };

    /** Gecikmiş kontrole gerekçeli +2 dk — audit için not olarak da yazılır. */
    const extendTimer = (r: Reservation) => {
        const endStr = r.customFields?.[CF_TIMER];
        const base = typeof endStr === 'string' ? Math.max(new Date(endStr).getTime(), Date.now()) : Date.now();
        void runStep(r, { customFields: cf(r, { [CF_TIMER]: new Date(base + 2 * 60_000).toISOString() }) },
            { customFields: { ...(r.customFields || {}) } }, '+2 dakika uzatma kaydedildi');
    };

    // ── Boşluk avı: bugünün satılabilir aralığı ───────────────────────────────
    const gap = useMemo(() => {
        const busy = todayList
            .map((r) => [toMin(r.startTime), toMin(r.endTime)] as [number, number])
            .sort((a, b) => a[0] - b[0]);
        const merged: [number, number][] = [];
        for (const b of busy) {
            const last = merged[merged.length - 1];
            if (last && b[0] <= last[1]) last[1] = Math.max(last[1], b[1]);
            else merged.push([...b]);
        }
        let cursor = Math.max(nowMin, workDay.open);
        let best: { start: number; end: number } | null = null;
        for (const [s, e] of merged) {
            if (s > cursor && s - cursor >= 30) { const g = { start: cursor, end: s }; if (!best || g.end - g.start > best.end - best.start) best = g; }
            cursor = Math.max(cursor, e);
        }
        if (workDay.close - cursor >= 30) { const g = { start: cursor, end: workDay.close }; if (!best || g.end - g.start > best.end - best.start) best = g; }
        if (!best) return null;
        const len = best.end - best.start;
        const fits = waitlist.filter((w) => {
            if (w.status !== 'waiting') return false;
            const dur = services.find((s) => s.id === w.serviceId)?.duration ?? 45;
            return dur <= len;
        }).length;
        return { ...best, len, fits };
    }, [todayList, nowMin, workDay, waitlist, services]);

    // ── Geri dönüş zamanı gelen müşteriler ────────────────────────────────────
    const recallDays = profileForSector(settings.sector).comms.recall?.afterDays ?? 28;
    const futureByCustomer = useMemo(() => {
        const set = new Set<string>();
        for (const r of active) if (r.date > today || (r.date === today && toMin(r.startTime) > nowMin)) set.add(r.customerId);
        return set;
    }, [active, today, nowMin]);

    const dueBack = useMemo(() => {
        const cutoff = new Date(now); cutoff.setDate(now.getDate() - recallDays);
        const cutoffISO = toISODate(cutoff);
        return customers
            .filter((c) => c.lastVisit && c.lastVisit <= cutoffISO && !futureByCustomer.has(c.id))
            .sort((a, b) => (a.lastVisit || '').localeCompare(b.lastVisit || ''));
    }, [customers, futureByCustomer, now, recallDays]);
    const reachable = useMemo(() => dueBack.filter((c) => Boolean(c.phone)).length, [dueBack]);

    // Yeniden randevu oranı — son 30 günde gelenlerin ileri randevusu var mı
    const rebookRate = useMemo(() => {
        const from = new Date(now); from.setDate(now.getDate() - 30);
        const fromISO = toISODate(from);
        const recent = new Set(active.filter((r) => r.date >= fromISO && r.date <= today && r.status === 'completed').map((r) => r.customerId));
        if (recent.size === 0) return null;
        let n = 0; recent.forEach((id) => { if (futureByCustomer.has(id)) n++; });
        return Math.round((n / recent.size) * 100);
    }, [active, now, today, futureByCustomer]);

    // ── Yarının hazırlığı (stok kolonu olmadığı için gerçek sinyal) ───────────
    const tomorrow = useMemo(() => {
        const t = new Date(now); t.setDate(now.getDate() + 1);
        const iso = toISODate(t);
        const list = active.filter((r) => r.date === iso).sort((a, b) => a.startTime.localeCompare(b.startTime));
        return {
            iso, list,
            color: list.filter((r) => isColorService(r.service)),
            pending: list.filter((r) => r.status === 'pending'),
        };
    }, [active, now]);

    // ── Ekip ritmi ölçüleri ───────────────────────────────────────────────────
    const rhythm = useMemo(() => {
        const started = todayList.filter((r) => r.arrivedAt);
        const onTime = started.filter((r) => {
            const d = new Date(r.arrivedAt as string);
            return (d.getHours() * 60 + d.getMinutes()) <= toMin(r.startTime) + 5;
        }).length;
        const span = Math.max(60, workDay.close - workDay.open);
        const capacity = span * Math.max(1, chairs.length);
        const booked = todayList.reduce((sum, r) => sum + Math.max(0, toMin(r.endTime) - toMin(r.startTime)), 0);
        return {
            onTime: started.length ? Math.round((onTime / started.length) * 100) : null,
            occupancy: Math.min(100, Math.round((booked / capacity) * 100)),
            completion: todayList.length ? Math.round((doneToday.length / todayList.length) * 100) : null,
        };
    }, [todayList, workDay, chairs.length, doneToday.length]);

    const behind = useMemo(
        () => team.filter((t) => t.load >= 85).sort((a, b) => b.load - a.load)[0] || null,
        [team],
    );
    const freeSoon = useMemo(
        () => team.filter((t) => t.load < 60).sort((a, b) => a.load - b.load)[0] || null,
        [team],
    );

    // ── Öncelik kuyruğu — gerçek veriden türetilir ────────────────────────────
    type Task = { id: string; level: 'now' | 'today' | 'opportunity'; title: string; detail: string; action: string; icon: ElementType; run: () => void };
    const tasks = useMemo(() => {
        const out: Task[] = [];
        for (const r of overdueChecks.slice(0, 2)) {
            out.push({
                id: `check-${r.id}`, level: 'now',
                title: `${mask(r.customerName)} · renk kontrolü gecikti`,
                detail: [units.find((u) => u.id === r.resourceId)?.name, r.staffName, r.customFields?.[CF_FORMULA]].filter(Boolean).join(' · ') || r.service,
                action: 'Kontrole git', icon: TimerReset,
                run: () => { setSelectedId(r.id); setBoardView('flow'); },
            });
        }
        for (const w of longWaits.slice(0, 2)) {
            out.push({
                id: `wait-${w.r.id}`, level: 'today',
                title: `${mask(w.r.customerName)} ${w.mins} dakikadır bekliyor`,
                detail: [w.r.service, w.r.staffName].filter(Boolean).join(' · '),
                action: 'Karşılamayı aç', icon: Coffee,
                run: () => { setSelectedId(w.r.id); setBoardView('flow'); },
            });
        }
        if (byStage.checkout.length > 0) {
            out.push({
                id: 'cash', level: 'today',
                title: `${byStage.checkout.length} müşteri kasada bekliyor`,
                detail: byStage.checkout.map((r) => mask(r.customerName)).join(' · '),
                action: 'Kasayı aç', icon: CircleDollarSign,
                run: () => navigate('/kasa'),
            });
        }
        if (gap && gap.fits > 0) {
            out.push({
                id: 'gap', level: 'opportunity',
                title: `${fromMin(gap.start)}'da ${durText(gap.len)} boşluk`,
                detail: `Bekleme listesindeki ${gap.fits} müşteri süreye uygun`,
                action: 'Eşleşmeleri gör', icon: Sparkles,
                run: () => navigate('/queue'),
            });
        }
        if (dueBack.length > 0) {
            out.push({
                id: 'recall', level: 'opportunity',
                title: `${dueBack.length} müşterinin dönüş zamanı geldi`,
                detail: `${recallDays} gündür gelmeyen · ${reachable} müşteriye ulaşılabiliyor`,
                action: 'Listeyi aç', icon: History,
                run: () => navigate('/customers'),
            });
        }
        return out.slice(0, 5);
    }, [overdueChecks, longWaits, byStage.checkout, gap, dueBack, reachable, recallDays, units, mask, navigate]);

    // ── FlowPilot fırsatları ──────────────────────────────────────────────────
    const opportunities = useMemo(() => {
        const out: { id: string; tone: string; title: string; detail: string; run: () => void }[] = [];
        if (gap) out.push({
            id: 'gap', tone: 'purple', title: 'Boşluğu doldur',
            detail: `${fromMin(gap.start)} · ${gap.fits > 0 ? `${gap.fits} uygun müşteri` : `${durText(gap.len)} boş`}`,
            run: () => navigate('/queue'),
        });
        if (dueBack.length > 0) out.push({
            id: 'recall', tone: 'orange', title: 'Geri dönüş zamanı',
            detail: `${reachable} müşteriye ulaşılabiliyor`,
            run: () => navigate('/customers'),
        });
        if (tomorrow.pending.length > 0) out.push({
            id: 'pending', tone: 'red', title: 'Onay bekleyen randevu',
            detail: `Yarın için ${tomorrow.pending.length} randevu`,
            run: () => navigate('/reservations'),
        });
        else if (tomorrow.color.length > 0) out.push({
            id: 'prep', tone: 'red', title: 'Yarının renk hazırlığı',
            detail: `${tomorrow.color.length} renk randevusu planlı`,
            run: () => navigate('/calendar'),
        });
        return out;
    }, [gap, dueBack.length, reachable, tomorrow, navigate]);

    // ── AI şeridi: bağlamsal tek cümle; söyleyecek şey yoksa şerit çıkmaz ─────
    const aiLine = useMemo(() => {
        if (overdueChecks[0]) {
            const r = overdueChecks[0];
            return { text: `${mask(r.customerName)} için renk kontrolü zamanı geçti — saç sağlığı için önce buraya bakın.`, action: 'Kontrole git', run: () => setSelectedId(r.id) };
        }
        if (gap && gap.fits > 0) {
            return { text: `${fromMin(gap.start)}'daki ${durText(gap.len)} boşluk, bekleme listesindeki ${gap.fits} müşteriyle eşleşiyor.`, action: 'Uygun müşterileri gör', run: () => navigate('/queue') };
        }
        if (longWaits[0]) {
            return { text: `${mask(longWaits[0].r.customerName)} ${longWaits[0].mins} dakikadır bekliyor — ikram sunmayı unutmayın.`, action: 'Karşılamayı aç', run: () => setSelectedId(longWaits[0].r.id) };
        }
        if (dueBack.length > 0) {
            return { text: `${dueBack.length} müşterinin dönüş zamanı geldi; ${reachable} müşteriye bugün ulaşılabilir.`, action: 'Listeyi aç', run: () => navigate('/customers') };
        }
        return null;
    }, [overdueChecks, gap, longWaits, dueBack.length, reachable, mask, navigate]);

    // ── Gün başlığı ───────────────────────────────────────────────────────────
    const weekdayLong = now.toLocaleDateString('tr-TR', { weekday: 'long' }).toLocaleUpperCase('tr');
    const dayNum = now.getDate();
    const monthYear = now.toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' }).toLocaleUpperCase('tr');

    // Yoğunluk penceresi — en çok randevunun üst üste bindiği 90 dakika
    const peak = useMemo(() => {
        if (todayList.length === 0) return null;
        let bestStart = workDay.open, bestCount = 0;
        for (let m = workDay.open; m <= workDay.close - 90; m += 30) {
            const c = todayList.filter((r) => toMin(r.startTime) < m + 90 && toMin(r.endTime) > m).length;
            if (c > bestCount) { bestCount = c; bestStart = m; }
        }
        return bestCount > 1 ? `${fromMin(bestStart)}–${fromMin(bestStart + 90)}` : null;
    }, [todayList, workDay]);

    const heroFacts = [
        inSalon.length > 0 && `${inSalon.length} müşteri salonda`,
        byStage.processing.length > 0 && `${byStage.processing.length} boya süresi`,
        byStage.checkout.length > 0 && `${byStage.checkout.length} kasaya hazır`,
        peak && `yoğunluk ${peak}`,
        inSalon.length === 0 && `${todayList.length} randevu planlı`,
    ].filter(Boolean).join(' · ');

    return (
        <div className={cn('dash-theme kf-ops flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--dc-page)]', dark && 'dark')}>
            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="content">

                    {/* AI şeridi — yalnız söyleyecek bağlamsal bir şey varken */}
                    {aiLine && (
                        <div className="ai-note">
                            <span className="ai-badge"><Sparkles size={13} />AI</span>
                            <span>{aiLine.text}</span>
                            <button onClick={aiLine.run}>{aiLine.action}</button>
                        </div>
                    )}

                    {/* ── Gün başlığı ────────────────────────────────────────── */}
                    <section className="day-hero">
                        <div className="date-tile">
                            <span>{weekdayLong}</span>
                            <strong>{dayNum}</strong>
                            <small>{monthYear}</small>
                        </div>
                        <div className="day-copy">
                            <span className="eyebrow">{(settings.businessName || 'KUAFÖR SALONU').toLocaleUpperCase('tr')} · <LiveClock /></span>
                            <h1>
                                {overdueChecks.length > 0
                                    ? <>Akışta gecikme var; <em>{overdueChecks.length} renk kontrolü gecikti.</em></>
                                    : todayList.length === 0
                                        ? <>Bugün için <em>planlanmış randevu yok.</em></>
                                        : <>Akış dengeli; <em>kritik gecikme yok.</em></>}
                            </h1>
                            <p>{heroFacts || 'Salon boş — randevusuz müşteriyi hemen işleme alabilirsiniz'}</p>
                            <div className="day-facts" aria-label="Salonun canlı durumu">
                                {chairs.length > 0 && <span><i className="green" /> {busyChairs} / {chairs.length} koltuk aktif</span>}
                                {washes.length > 0 && <span><i className="blue" /> {busyWashes} / {washes.length} yıkama aktif</span>}
                                <span><i className="purple" /> {activeStaff.length} kişi vardiyada</span>
                            </div>
                        </div>
                        <div className="hero-actions">
                            <button className="button secondary" onClick={() => navigate('/calendar')}>
                                <CalendarDays size={17} /> Takvimi aç
                            </button>
                            <button className="button secondary" onClick={() => setWalkinOpen(true)}>
                                <Zap size={17} /> Walk-in ekle
                            </button>
                            <button className="button primary" onClick={() => navigate('/calendar?new=1')}>
                                <Plus size={18} /> Yeni randevu
                            </button>
                        </div>
                    </section>

                    {/* ── Salonun ritmi + Şimdi ilgilen ──────────────────────── */}
                    <section className="command-grid">
                        <article className="salon-pulse">
                            <header className="section-head">
                                <div>
                                    <span className="eyebrow">CANLI SALON</span>
                                    <h2>Salonun ritmi</h2>
                                </div>
                                <span className="live-state"><i /> Şu an güncelleniyor</span>
                            </header>
                            <div className="pulse-stats">
                                {STAGES.map(({ key, label, icon: Icon }) => (
                                    <button key={key}
                                        className={cn(key, selected && stageOf(selected) === key && 'selected')}
                                        onClick={() => { setBoardView('flow'); const first = byStage[key][0]; if (first) setSelectedId(first.id); }}>
                                        <span><Icon size={17} /></span>
                                        <small>{label}</small>
                                        <strong>{byStage[key].length}</strong>
                                    </button>
                                ))}
                            </div>
                            <div className="resource-ribbon">
                                <span className="ribbon-label">KAYNAKLAR</span>
                                {units.length === 0 && (
                                    <button onClick={() => navigate('/settings')}>Henüz koltuk eklenmemiş — Ayarlar'dan ekleyin</button>
                                )}
                                {units.slice(0, 4).map((u) => (
                                    <button key={u.id} onClick={() => setBoardView('seats')}>
                                        <i className={u.state === 'free' ? 'green' : u.state === 'late' ? 'red' : u.state === 'processing' ? 'purple' : u.wash ? 'blue' : 'orange'} />
                                        {u.name} · {u.state === 'free' ? 'boş' : u.state === 'late' ? 'kontrol' : u.state === 'prep' ? 'hazırlık' : u.state === 'processing' ? 'boya süresi' : 'dolu'}
                                    </button>
                                ))}
                                {units.length > 4 && (
                                    <button className="ribbon-more" onClick={() => setBoardView('seats')}>
                                        Tümünü gör <ChevronRight size={14} />
                                    </button>
                                )}
                            </div>
                        </article>

                        <PriorityCard
                            overdue={overdueChecks[0] || null}
                            processing={byStage.processing.find((r) => !overdueChecks.some((o) => o.id === r.id)) || null}
                            waiting={longWaits[0]?.r || byStage.waiting[0] || null}
                            next={upcoming[0] || null}
                            now={now}
                            unitName={(id?: string) => units.find((u) => u.id === id)?.name}
                            mask={mask}
                            busyId={busyId}
                            onSelect={setSelectedId}
                            onStep={(r) => nextStep(r)?.run()}
                            onExtend={extendTimer}
                            onArrive={(r) => void runStep(r, advancePatch('arrived'),
                                { customerArrivedAt: CLEAR }, `${r.customerName.split(' ')[0]} geldi olarak işaretlendi`)}
                        />
                    </section>

                    {/* ── FlowPilot ──────────────────────────────────────────── */}
                    {opportunities.length > 0 && (
                        <section className="automation-strip">
                            <div className="automation-title">
                                <span><Sparkles size={16} /></span>
                                <div>
                                    <strong>FlowPilot</strong>
                                    <small>Salon için {opportunities.length} fırsat buldu</small>
                                </div>
                            </div>
                            {opportunities.map((o) => (
                                <button key={o.id} onClick={o.run}>
                                    <i className={o.tone} />
                                    <span><strong>{o.title}</strong><small>{o.detail}</small></span>
                                    <ChevronRight size={15} />
                                </button>
                            ))}
                            <span className="automation-safe"><ShieldCheck size={15} /> Onay olmadan işlem yapmaz</span>
                        </section>
                    )}

                    {/* ── Salon akışı + Öncelik kuyruğu ──────────────────────── */}
                    <section className="workspace-grid">
                        <article className="flow-board">
                            <header className="board-head">
                                <div>
                                    <span className="eyebrow">OPERASYON KONTROLÜ</span>
                                    <h2>Salon akışı</h2>
                                    <p>Randevu saatinden çok müşterinin gerçek aşamasını gösterir.</p>
                                </div>
                                <div className="board-controls">
                                    <div className="segmented" aria-label="Salon görünümü">
                                        {([['flow', 'Akış'], ['seats', 'Koltuklar'], ['team', 'Ekip']] as const).map(([k, t]) => (
                                            <button key={k} className={cn(boardView === k && 'selected')} aria-pressed={boardView === k}
                                                onClick={() => setBoardView(k)}>{t}</button>
                                        ))}
                                    </div>
                                    <label className="privacy-switch" title="Ortak ekranda müşteri soyadını gizler">
                                        <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
                                        <i />
                                        {privacy ? <EyeOff size={15} /> : <Eye size={15} />}
                                        Gizlilik
                                    </label>
                                </div>
                            </header>

                            {boardView === 'flow' && (
                                <>
                                    <div className="stage-grid">
                                        {STAGES.map((stage) => {
                                            const Icon = stage.icon;
                                            const items = byStage[stage.key];
                                            return (
                                                <section className={`stage-column ${stage.key}`} key={stage.key}>
                                                    <header>
                                                        <span><Icon size={15} /> {stage.label}</span>
                                                        <b>{items.length}</b>
                                                        <small>{stageHint(stage.key, items, now, overdueChecks)}</small>
                                                    </header>
                                                    <div className="stage-list">
                                                        {items.map((r) => {
                                                            const late = overdueChecks.some((o) => o.id === r.id);
                                                            const tone: Tone = late ? 'red' : STAGE_TONE[stage.key];
                                                            const formula = r.customFields?.[CF_FORMULA];
                                                            return (
                                                                <button key={r.id}
                                                                    className={cn('client-card', `tone-${tone}`, selected?.id === r.id && 'selected')}
                                                                    onClick={() => setSelectedId(r.id)}>
                                                                    <i className="client-rail" />
                                                                    <span className="client-top">
                                                                        <span className="mini-avatar">{initialsOf(r.customerName)}</span>
                                                                        <span className="client-name">
                                                                            <strong>{mask(r.customerName)}</strong>
                                                                            <small>{r.service}</small>
                                                                        </span>
                                                                        <ChevronRight size={14} />
                                                                    </span>
                                                                    <span className="client-meta">
                                                                        <b><StageTiming r={r} stage={stage.key} /></b>
                                                                        <small>{r.staffName || 'Atanmadı'}</small>
                                                                    </span>
                                                                    <span className="client-location">
                                                                        <DoorOpen size={13} /> {units.find((u) => u.id === r.resourceId)?.name || stageLocation(stage.key)}
                                                                    </span>
                                                                    {typeof formula === 'string' && formula && (
                                                                        <span className="client-note formula"><Droplets size={13} /> {formula}</span>
                                                                    )}
                                                                    {r.notes && <span className="client-note"><Sparkles size={13} />{r.notes}</span>}
                                                                    {stage.key === 'checkout' && (
                                                                        <span className="client-amount">
                                                                            <strong>{money(amountOf(r, services))}</strong>
                                                                            <small>tahsil edilecek</small>
                                                                        </span>
                                                                    )}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </section>
                                            );
                                        })}
                                    </div>

                                    {selected ? (() => {
                                        const st = stageOf(selected);
                                        const step = nextStep(selected);
                                        const formula = selected.customFields?.[CF_FORMULA];
                                        const cust = customers.find((c) => c.id === selected.customerId);
                                        const lastDays = cust?.lastVisit
                                            ? Math.round((now.getTime() - new Date(cust.lastVisit).getTime()) / 86_400_000) : null;
                                        return (
                                            <div className="selected-client" aria-live="polite">
                                                <span className={`selected-avatar tone-${st ? STAGE_TONE[st] : 'orange'}`}>{initialsOf(selected.customerName)}</span>
                                                <div className="selected-main">
                                                    <span className="eyebrow">SEÇİLİ MÜŞTERİ</span>
                                                    <strong>{mask(selected.customerName)}</strong>
                                                    <p>
                                                        <span>{selected.service}</span>
                                                        <span>{selected.staffName || 'Personel atanmadı'}</span>
                                                        <span>{units.find((u) => u.id === selected.resourceId)?.name || stageLocation(st)}</span>
                                                    </p>
                                                </div>
                                                <div className="selected-context">
                                                    {typeof formula === 'string' && formula ? (
                                                        <><Droplets size={15} /><span><small>SON FORMÜL</small><strong>{formula}</strong></span></>
                                                    ) : (
                                                        <><History size={15} /><span><small>SON ZİYARET</small><strong>{lastDays === null ? 'İlk ziyaret' : lastDays === 0 ? 'Bugün' : `${lastDays} gün önce`}</strong></span></>
                                                    )}
                                                </div>
                                                <button className="button secondary compact" onClick={() => setCardRes(selected)}>Müşteri kartı</button>
                                                {step && (
                                                    <button className="button primary compact" disabled={busyId === selected.id} onClick={step.run}>
                                                        {step.label} <ArrowRight size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })() : (
                                        <div className="selected-client">
                                            <span className="selected-avatar tone-green"><Check size={18} /></span>
                                            <div className="selected-main">
                                                <span className="eyebrow">SALON BOŞ</span>
                                                <strong>Şu an salonda müşteri yok</strong>
                                                <p><span>{doneToday.length} işlem tamamlandı</span><span>{upcoming.length} randevu kaldı</span></p>
                                            </div>
                                            <button className="button primary compact" onClick={() => setWalkinOpen(true)}>
                                                Walk-in ekle <ArrowRight size={16} />
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}

                            {boardView === 'seats' && (
                                <div className="resource-grid">
                                    {units.length === 0 && <p className="px-3 py-6 text-[12.5px] text-[var(--dc-muted)]">Önce Ayarlar'dan koltuk/yıkama ekleyin.</p>}
                                    {units.map((u) => (
                                        <button key={u.id} className={`resource-card ${u.state}`}
                                            onClick={() => { const r = inSalon.find((x) => x.resourceId === u.id); if (r) { setSelectedId(r.id); setBoardView('flow'); } }}>
                                            <span className="resource-icon">
                                                {u.wash ? <Droplets size={19} /> : <Scissors size={19} />}
                                            </span>
                                            <span>
                                                <small>{u.name}</small>
                                                <strong>{u.client === 'Boş' || u.client === 'Hazırlanıyor' ? u.client : mask(u.client)}</strong>
                                                <em>{u.detail}{u.freeAt ? ` · ${u.freeAt}` : ''}</em>
                                            </span>
                                            <i />
                                        </button>
                                    ))}
                                </div>
                            )}

                            {boardView === 'team' && (
                                <div className="team-grid">
                                    {team.length === 0 && <p className="px-3 py-6 text-[12.5px] text-[var(--dc-muted)]">Henüz personel eklenmemiş.</p>}
                                    {team.map((m) => (
                                        <button key={m.id} className="team-card" onClick={() => navigate(`/staff/${m.id}`)}>
                                            <span className="team-avatar">{initialsOf(m.name)}</span>
                                            <span className="team-copy">
                                                <small>{m.role}</small>
                                                <strong>{m.name}</strong>
                                                <em>{m.current}</em>
                                            </span>
                                            <span className={cn('team-load', m.tone)}>
                                                <b>%{m.load}</b>
                                                <i><em style={{ width: `${m.load}%` }} /></i>
                                                <small>{m.next}</small>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </article>

                        <aside className="task-panel">
                            <header>
                                <div>
                                    <span className="eyebrow">ÖNCELİK KUYRUĞU</span>
                                    <h2>Şimdi yapılacaklar</h2>
                                </div>
                                <span className="task-count">{tasks.length}</span>
                            </header>
                            <div className="task-list">
                                {tasks.length === 0 && (
                                    <article className="today">
                                        <span className="task-icon"><Check size={17} /></span>
                                        <div>
                                            <small>TEMİZ</small>
                                            <strong>Bekleyen iş yok</strong>
                                            <p>Gecikme, kasada bekleyen ya da kaçan fırsat görünmüyor.</p>
                                        </div>
                                    </article>
                                )}
                                {tasks.map((t) => {
                                    const Icon = t.icon;
                                    return (
                                        <article className={t.level} key={t.id}>
                                            <span className="task-icon"><Icon size={17} /></span>
                                            <div>
                                                <small>{t.level === 'now' ? 'ŞİMDİ' : t.level === 'today' ? 'BUGÜN' : 'FIRSAT'}</small>
                                                <strong>{t.title}</strong>
                                                <p>{t.detail}</p>
                                                <button onClick={t.run}>{t.action} <ChevronRight size={14} /></button>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                            <div className="task-safety">
                                <ShieldCheck size={17} />
                                <span>
                                    <strong>Otomasyon sınırı açık</strong>
                                    Mesaj, indirim, randevu ve stok işlemleri onayınız olmadan tamamlanmaz.
                                </span>
                            </div>
                        </aside>
                    </section>

                    {/* ── Bugünün planı ──────────────────────────────────────── */}
                    <section className="schedule-card">
                        <header className="schedule-head">
                            <div>
                                <span className="eyebrow">KAPASİTE PLANI</span>
                                <h2>Bugünün planı</h2>
                                <p>Aktif çalışma ile boya bekleme süresini ayrı gösterir.</p>
                            </div>
                            <div className="schedule-legend">
                                <span><i className="orange" /> Aktif çalışma</span>
                                <span><i className="purple pattern" /> İşlem süresi</span>
                                <span><i className="blue" /> Yıkama · bitiriş</span>
                                <span><i className="green" /> Tamamlandı</span>
                            </div>
                            <div className="segmented" aria-label="Plan sütunları">
                                <button className={cn(scheduleView === 'team' && 'selected')} aria-pressed={scheduleView === 'team'}
                                    onClick={() => setScheduleView('team')}>Ekip</button>
                                <button className={cn(scheduleView === 'resources' && 'selected')} aria-pressed={scheduleView === 'resources'}
                                    onClick={() => setScheduleView('resources')}>Kaynaklar</button>
                            </div>
                        </header>
                        <Timeline
                            view={scheduleView}
                            list={todayList}
                            lanes={scheduleView === 'team'
                                ? team.map((t) => ({ id: t.id, name: t.name, sub: t.load >= 85 ? 'Yoğun' : t.current, state: t.load >= 85 ? 'warn' : t.load > 0 ? 'busy' : 'free' }))
                                : units.map((u) => ({ id: u.id, name: u.name, sub: u.state === 'free' ? 'Hazır' : u.detail, state: u.state === 'late' ? 'warn' : u.state === 'free' ? 'free' : 'busy' }))}
                            laneKeyOf={(r) => (scheduleView === 'team' ? r.staffId : r.resourceId) || '__none'}
                            workDay={workDay}
                            now={now}
                            mask={mask}
                            onSelect={(id) => { setSelectedId(id); setBoardView('flow'); }}
                        />
                    </section>

                    {/* ── Büyüme kartları ────────────────────────────────────── */}
                    <section className="growth-grid">
                        <article className="growth-card return-card">
                            <header><span><History size={17} /></span><small>GERİ DÖNÜŞ</small><button onClick={() => navigate('/customers')}><ChevronRight size={15} /></button></header>
                            <strong>{dueBack.length > 0 ? `${dueBack.length} müşterinin zamanı geldi` : 'Geri dönüş listesi temiz'}</strong>
                            <p>{dueBack.length > 0
                                ? `${recallDays} gündür gelmeyen müşteriler; ${reachable} tanesine telefonla ulaşılabiliyor.`
                                : `Son ${recallDays} gün içinde herkesin ya ziyareti ya da ileri randevusu var.`}</p>
                            <div className="mini-metrics">
                                <span><b>{dueBack.length}</b><small>dönüş zamanı</small></span>
                                <span><b>{reachable}</b><small>iletişime uygun</small></span>
                                <span><b>{rebookRate === null ? '—' : `%${rebookRate}`}</b><small>yeniden randevu</small></span>
                            </div>
                            <button className="text-action" onClick={() => navigate('/customers')}>
                                Uygun müşterileri gör <ArrowRight size={15} />
                            </button>
                        </article>

                        <article className="growth-card stock-card">
                            <header><span><PackageOpen size={17} /></span><small>HAZIRLIK · YARIN</small><button onClick={() => navigate('/calendar')}><ChevronRight size={15} /></button></header>
                            <strong>{tomorrow.list.length > 0 ? `Yarın ${tomorrow.list.length} randevu var` : 'Yarın için randevu yok'}</strong>
                            <p>{tomorrow.color.length > 0
                                ? `${tomorrow.color.length} renk işlemi planlı — boya ve açıcı hazırlığını bugün yapın.`
                                : 'Renk işlemi planlı değil; hazırlık gerektiren randevu görünmüyor.'}</p>
                            <div className="stock-line">
                                <span className="product-mark"><Droplets size={18} /></span>
                                <span>
                                    <strong>{tomorrow.color[0] ? `${tomorrow.color[0].startTime} · ${mask(tomorrow.color[0].customerName)}` : 'Renk randevusu yok'}</strong>
                                    <small>{tomorrow.color[0]?.service || `${tomorrow.list.length} randevu · ${tomorrow.pending.length} onay bekliyor`}</small>
                                </span>
                                {tomorrow.pending.length > 0 && <b>{tomorrow.pending.length} ONAY</b>}
                            </div>
                            <button className="text-action" onClick={() => navigate('/calendar')}>
                                Yarının planını aç <ArrowRight size={15} />
                            </button>
                        </article>

                        <article className="growth-card rhythm-card">
                            <header><span><Gauge size={17} /></span><small>EKİP RİTMİ</small><button onClick={() => navigate('/analytics')}><ChevronRight size={15} /></button></header>
                            <strong>{behind ? 'Yük dengesiz' : 'Akış hedefe yakın'}</strong>
                            <p>{behind
                                ? `${behind.name} bugün %${behind.load} dolu${freeSoon ? `; ${freeSoon.name} destek verebilir` : ''}.`
                                : 'Bugün kimsenin planı taşmıyor; koltuk dağılımı dengeli.'}</p>
                            <div className="rhythm-list">
                                <span><i className="green" /><small>Zamanında başlama</small><b>{rhythm.onTime === null ? '—' : `%${rhythm.onTime}`}</b></span>
                                <span><i className="orange" /><small>Koltuk doluluğu</small><b>%{rhythm.occupancy}</b></span>
                                <span><i className="purple" /><small>Tamamlanma</small><b>{rhythm.completion === null ? '—' : `%${rhythm.completion}`}</b></span>
                            </div>
                            <button className="text-action" onClick={() => navigate('/analytics')}>
                                Akışı dengele <ArrowRight size={15} />
                            </button>
                        </article>
                    </section>
                </div>
            </div>

            {walkinOpen && (
                <WalkinModal
                    customers={customers}
                    services={services}
                    units={units}
                    staff={activeStaff.map((s) => ({ id: s.id, name: s.name }))}
                    onClose={() => setWalkinOpen(false)}
                    onCreate={async (payload) => {
                        const created = await addReservation(payload);
                        if (!created) return false;
                        await updateReservation(created.id, { customerArrivedAt: new Date().toISOString() });
                        toast.success(`${payload.customerName} sıraya eklendi ⚡`);
                        setWalkinOpen(false);
                        return true;
                    }}
                />
            )}

            {cardRes && (
                <AdisyonModal
                    reservation={reservations.find((x) => x.id === cardRes.id) || cardRes}
                    onClose={() => setCardRes(null)}
                    onEdit={(res) => setEditRes(res)}
                />
            )}
            {editRes && (
                <EditReservationModal
                    reservation={reservations.find((x) => x.id === editRes.id) || editRes}
                    isOpen={!!editRes}
                    onClose={() => setEditRes(null)}
                />
            )}
        </div>
    );
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────

function amountOf(r: Reservation, services: Service[]): number {
    const extras = (r.adisyonItems || []).reduce((sum, i) => sum + (i.price || 0), 0);
    const base = services.find((s) => s.name === r.service)?.price || 0;
    return base + extras;
}

/** Bir sütundaki çakışan randevuları yan yana kolonlara paylaştırır. */
function placeLane(list: Reservation[]): { r: Reservation; col: number; cols: number }[] {
    const items = [...list].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const out: { r: Reservation; col: number; cols: number }[] = [];
    let cluster: Reservation[] = [];
    let clusterEnd = -1;
    const flush = () => {
        if (cluster.length === 0) return;
        const colEnds: number[] = [];
        const assigned = cluster.map((r) => {
            let c = colEnds.findIndex((e) => e <= toMin(r.startTime));
            if (c === -1) c = colEnds.length;
            colEnds[c] = toMin(r.endTime);
            return { r, col: c };
        });
        for (const a of assigned) out.push({ ...a, cols: colEnds.length });
        cluster = [];
        clusterEnd = -1;
    };
    for (const r of items) {
        if (cluster.length > 0 && toMin(r.startTime) >= clusterEnd) flush();
        cluster.push(r);
        clusterEnd = Math.max(clusterEnd, toMin(r.endTime));
    }
    flush();
    return out;
}

function stageLocation(stage: KfStage | null): string {
    if (stage === 'waiting') return 'Bekleme alanı';
    if (stage === 'checkout') return 'Kasa';
    if (stage === 'finish') return 'Yıkama';
    return 'Salon';
}

/** Sütun başlığındaki tek satırlık gerçek durum özeti. */
function stageHint(stage: KfStage, items: Reservation[], now: Date, overdue: Reservation[]): string {
    if (items.length === 0) return 'Boş';
    if (stage === 'waiting') {
        const longest = Math.max(...items.map((r) => (r.customerArrivedAt ? minsSince(r.customerArrivedAt, now) : 0)));
        return `En uzun ${longest} dk`;
    }
    if (stage === 'service') return `${items.length} koltuk aktif`;
    if (stage === 'processing') {
        const late = items.filter((r) => overdue.some((o) => o.id === r.id)).length;
        return late > 0 ? `${late} kontrol gecikti` : 'Sayaçlar akıyor';
    }
    if (stage === 'finish') return `${items.length} müşteri bitirişte`;
    return `${items.length} tahsilat bekliyor`;
}

/** Aşamaya göre canlı süre metni — boya sayacı saniyede bir döner. */
function StageTiming({ r, stage }: { r: Reservation; stage: KfStage }) {
    const [tick, setTick] = useState(() => Date.now());
    useEffect(() => {
        if (stage !== 'processing') return;
        const t = setInterval(() => setTick(Date.now()), 1000);
        return () => clearInterval(t);
    }, [stage]);

    if (stage === 'processing') {
        const end = r.customFields?.[CF_TIMER];
        if (typeof end !== 'string') return <>Sayaç yok</>;
        const diff = Math.round((new Date(end).getTime() - tick) / 1000);
        const s = Math.abs(diff);
        const txt = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
        return <>{diff <= 0 ? `Kontrol gecikti · ${txt}` : `${txt} kaldı`}</>;
    }
    if (stage === 'waiting') {
        const mins = r.customerArrivedAt ? minsSince(r.customerArrivedAt, new Date(tick)) : 0;
        return <>{r.startTime} · {mins} dk bekliyor</>;
    }
    if (stage === 'service' || stage === 'finish') {
        const run = r.arrivedAt ? minsSince(r.arrivedAt, new Date(tick)) : 0;
        const planned = Math.max(0, toMin(r.endTime) - toMin(r.startTime));
        return <>{run} / {planned} dk</>;
    }
    return <>{r.serviceEndedAt ? `${minsSince(r.serviceEndedAt, new Date(tick))} dk önce bitti` : 'Hazır'}</>;
}

/** Başlıktaki canlı saat — bütün dashboard'ı değil, yalnız kendini tazeler. */
function LiveClock() {
    const [t, setT] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setT(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    return <>{String(t.getHours()).padStart(2, '0')}:{String(t.getMinutes()).padStart(2, '0')}:{String(t.getSeconds()).padStart(2, '0')}</>;
}

// ── Şimdi ilgilen kartı ──────────────────────────────────────────────────────
// Tek bir şey söyler: salonun şu anda en pahalı hatası. Gecikmiş renk kontrolü
// > akan boya sayacı > uzun bekleyen > sıradaki randevu.
function PriorityCard({ overdue, processing, waiting, next, now, unitName, mask, busyId, onSelect, onStep, onExtend, onArrive }: {
    overdue: Reservation | null;
    processing: Reservation | null;
    waiting: Reservation | null;
    next: Reservation | null;
    now: Date;
    unitName: (id?: string) => string | undefined;
    mask: (n: string) => string;
    busyId: string | null;
    onSelect: (id: string) => void;
    onStep: (r: Reservation) => void;
    onExtend: (r: Reservation) => void;
    onArrive: (r: Reservation) => void;
}) {
    const target = overdue || processing || waiting || next;
    const critical = Boolean(overdue);

    useEffect(() => { if (target) onSelect(target.id); }, [target?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

    if (!target) {
        return (
            <article className="priority-card resolved">
                <header><span>SIRADAKİ HAREKET</span><i /></header>
                <div className="priority-time">—</div>
                <span className="priority-status">GÜN TEMİZ</span>
                <h2>Bekleyen iş yok</h2>
                <p>Salonda ilgilenilmesi gereken müşteri görünmüyor.</p>
            </article>
        );
    }

    const stage = stageOf(target);
    const timerEnd = target.customFields?.[CF_TIMER];
    const formula = target.customFields?.[CF_FORMULA];
    const waitMins = target.customerArrivedAt ? minsSince(target.customerArrivedAt, now) : 0;
    const etaMin = toMin(target.startTime) - (now.getHours() * 60 + now.getMinutes());

    return (
        <article className={cn('priority-card', !critical && 'resolved')}>
            <header>
                <span>{critical ? 'ŞİMDİ İLGİLEN' : 'SIRADAKİ HAREKET'}</span>
                <i />
            </header>

            <div className={cn('priority-time', critical && 'overdue')}>
                {typeof timerEnd === 'string'
                    ? <PriorityClock end={timerEnd} />
                    : stage === 'waiting' ? `${waitMins} dk`
                        : target.startTime}
            </div>
            <span className={cn('priority-status', critical && 'danger')}>
                {critical ? 'GECİKTİ'
                    : stage === 'processing' ? 'KONTROLE KALAN'
                        : stage === 'waiting' ? 'BEKLİYOR'
                            : etaMin <= 1 ? 'BİRAZDAN' : `${etaMin} DK SONRA`}
            </span>
            <h2>{mask(target.customerName)}</h2>
            <p>{[target.service, target.staffName].filter(Boolean).join(' · ')}</p>

            <div className="priority-context">
                {critical ? <TimerReset size={17} /> : <WandSparkles size={16} />}
                <span>
                    <strong>{[unitName(target.resourceId), target.staffName].filter(Boolean).join(' · ') || 'Kaynak atanmadı'}</strong>
                    {typeof formula === 'string' && formula ? formula : stage === 'waiting' ? 'Bekleme alanında' : 'Hazırlık tamam'}
                </span>
                {critical ? <AlertTriangle size={18} /> : <BadgeCheck size={18} />}
            </div>

            {stage === null ? (
                <button className="priority-action" disabled={busyId === target.id} onClick={() => onArrive(target)}>
                    <Check size={17} /> Geldi olarak işaretle
                </button>
            ) : critical ? (
                <div className="priority-actions">
                    <button className="priority-action" disabled={busyId === target.id} onClick={() => onStep(target)}>
                        <Check size={17} /> Kontrol edildi
                    </button>
                    <button className="time-extension" disabled={busyId === target.id} onClick={() => onExtend(target)}>+2 dk</button>
                </div>
            ) : (
                <button className="priority-action" disabled={busyId === target.id} onClick={() => onStep(target)}>
                    <Check size={17} /> {stage === 'processing' ? 'Kontrol edildi' : stage === 'waiting' ? 'Koltuğa al' : 'Sonraki aşama'}
                </button>
            )}
        </article>
    );
}

/** Kritik karttaki sayaç — hedefe kalan ya da geçen süre, saniyede bir. */
function PriorityClock({ end }: { end: string }) {
    const [tick, setTick] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setTick(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    const s = Math.abs(Math.round((new Date(end).getTime() - tick) / 1000));
    return <>{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</>;
}

// ── Bugünün planı ızgarası ───────────────────────────────────────────────────
function Timeline({ view, list, lanes, laneKeyOf, workDay, now, mask, onSelect }: {
    view: ScheduleView;
    list: Reservation[];
    lanes: { id: string; name: string; sub: string; state: string }[];
    laneKeyOf: (r: Reservation) => string;
    workDay: { open: number; close: number };
    now: Date;
    mask: (n: string) => string;
    onSelect: (id: string) => void;
}) {
    const ppm = 1.12;
    const nowM = now.getHours() * 60 + now.getMinutes();

    // Eksen gerçek işi gösterir: mesainin bomboş baş/son saatleri çizilmez —
    // yoksa 09:00–20:00 açık bir salonda plan 700 px boş ızgara olur.
    const range = useMemo(() => {
        let lo: number, hi: number;
        if (list.length > 0) {
            lo = Math.min(...list.map((r) => toMin(r.startTime)));
            hi = Math.max(...list.map((r) => toMin(r.endTime)));
        } else {
            lo = Math.max(workDay.open, nowM - 60);
            hi = lo + 240;
        }
        if (nowM >= lo - 60 && nowM <= hi + 60) { lo = Math.min(lo, nowM); hi = Math.max(hi, nowM + 30); }
        const start = Math.floor(lo / 60) * 60;
        const end = Math.max(start + 240, Math.ceil(hi / 60) * 60);
        return { start, end };
    }, [list, workDay, nowM]);

    const height = (range.end - range.start) * ppm;
    const hourMarks = useMemo(() => {
        const out: number[] = [];
        for (let h = range.start; h <= range.end; h += 60) out.push(h / 60);
        return out;
    }, [range]);

    if (lanes.length === 0) {
        return (
            <p className="px-4 py-8 text-[12.5px] text-[var(--dc-muted)]">
                {view === 'team' ? 'Henüz personel eklenmemiş.' : "Önce Ayarlar'dan koltuk/yıkama ekleyin."} Plan burada sütunlara ayrılacak.
            </p>
        );
    }

    return (
        <div className="timeline-shell">
            <div className="timeline-heads">
                <span className="axis-head">SAAT</span>
                {lanes.map((lane) => (
                    <span className="lane-head" key={lane.id}>
                        <i className={lane.state === 'warn' ? 'warn' : lane.state === 'free' ? 'free' : 'busy'} />
                        <strong>{lane.name}</strong>
                        <small>{lane.sub}</small>
                    </span>
                ))}
            </div>
            <div className="timeline-canvas" style={{ height }}>
                <div className="axis-band" />
                {hourMarks.map((h) => (
                    <div className="hour-row" style={{ top: (h * 60 - range.start) * ppm }} key={h}>
                        <span>{String(h).padStart(2, '0')}:00</span>
                        <i />
                    </div>
                ))}
                {lanes.map((lane, index) => (
                    <div className={cn('timeline-lane', index % 2 && 'alt')} key={lane.id}
                        style={{ '--lane-index': index, '--lane-count': lanes.length } as CSSProperties}>
                        {placeLane(list.filter((r) => laneKeyOf(r) === lane.id)).map(({ r, col, cols }) => {
                            const st = stageOf(r);
                            const tone = st === 'processing' ? 'purple'
                                : st === 'finish' ? 'blue'
                                    : phaseOf(r) === 'completed' ? 'green'
                                        : st === 'waiting' ? 'amber' : 'orange';
                            const top = (toMin(r.startTime) - range.start) * ppm;
                            const h = Math.max(34, (toMin(r.endTime) - toMin(r.startTime)) * ppm - 4);
                            return (
                                <button key={r.id} className={cn('timeline-block', tone, st === 'processing' && 'pattern')}
                                    style={{
                                        top, height: h,
                                        // Aynı personelin çakışan işleri (biri boyada beklerken diğeri
                                        // koltukta) üst üste binmesin — küme içinde sütuna paylaşılır.
                                        left: `calc(${(col / cols) * 100}% + 6px)`,
                                        width: `calc(${100 / cols}% - ${cols > 1 ? 8 : 12}px)`,
                                        right: 'auto',
                                    }}
                                    onClick={() => onSelect(r.id)}>
                                    <small>{r.startTime}</small>
                                    <strong>{mask(r.customerName)}</strong>
                                    {/* Dar/kısa bloklarda ad kırpılıyordu: yalnız sığan satırlar yazılır */}
                                    {cols === 1 && h >= 52 && <span>{r.service}</span>}
                                    {cols === 1 && h >= 70 && <em>{view === 'team' ? (r.resourceName || '') : (r.staffName || '')}</em>}
                                </button>
                            );
                        })}
                    </div>
                ))}
                {nowM >= range.start && nowM <= range.end && (
                    <div className="now-line" style={{ top: (nowM - range.start) * ppm }}>
                        <span>ŞİMDİ {hhmm(now)}</span>
                        <i />
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Walk-in: kapıdan giren müşteriyi sıraya al ───────────────────────────────
function WalkinModal({ customers, services, units, staff, onClose, onCreate }: {
    customers: Customer[];
    services: Service[];
    units: { id: string; name: string; state: string }[];
    staff: { id: string; name: string }[];
    onClose: () => void;
    onCreate: (payload: Omit<Reservation, 'id' | 'createdAt'>) => Promise<boolean>;
}) {
    const [query, setQuery] = useState('');
    const [picked, setPicked] = useState<Customer | null>(null);
    const [serviceId, setServiceId] = useState(services[0]?.id || '');
    const [unitId, setUnitId] = useState(units.find((u) => u.state === 'free')?.id || '');
    const [staffId, setStaffId] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const results = useMemo(() => {
        const q = query.trim().toLocaleLowerCase('tr');
        if (!q || picked) return [];
        return customers.filter((c) => c.name.toLocaleLowerCase('tr').includes(q) || c.phone.includes(q)).slice(0, 4);
    }, [query, customers, picked]);

    const service = services.find((s) => s.id === serviceId);
    const freeUnit = units.find((u) => u.id === unitId) || units.find((u) => u.state === 'free');

    const submit = async () => {
        if (!picked || !service || saving) return;
        setSaving(true);
        const start = new Date();
        const end = new Date(start.getTime() + (service.duration || 45) * 60_000);
        const ok = await onCreate({
            customerId: picked.id, customerName: picked.name, customerPhone: picked.phone, customerEmail: picked.email,
            date: toISODate(start), startTime: hhmm(start), endTime: hhmm(end),
            service: service.name, serviceColor: service.color,
            status: 'confirmed',
            staffId: staffId || undefined,
            staffName: staff.find((s) => s.id === staffId)?.name,
            resourceId: unitId || undefined,
        });
        setSaving(false);
        if (!ok) return;
    };

    return (
        <div className="modal-layer">
            <button className="scrim" aria-label="Pencereyi kapat" onClick={onClose} />
            <section className="quick-modal" role="dialog" aria-modal="true" aria-labelledby="kf-modal-title">
                <header>
                    <span className="modal-symbol"><Zap size={20} /></span>
                    <div>
                        <span className="eyebrow">RANDEVUSUZ MÜŞTERİ</span>
                        <h2 id="kf-modal-title">Sıraya müşteri ekle</h2>
                        <p>Müşteri bekleme alanına eklenir; koltuğa alma kararı sizde kalır.</p>
                    </div>
                    <button aria-label="Kapat" onClick={onClose}><X size={18} /></button>
                </header>
                <div className="modal-body">
                    <label>
                        <span>Müşteri</span>
                        {picked ? (
                            <div className="field">
                                <Search size={16} />
                                <input value={picked.name} readOnly />
                                <button type="button" onClick={() => { setPicked(null); setQuery(''); }}
                                    className="text-[12px] font-bold text-[var(--dc-orange-d)] px-2">Değiştir</button>
                            </div>
                        ) : (
                            <div className="field">
                                <Search size={16} />
                                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ad soyad veya telefon" autoFocus />
                            </div>
                        )}
                    </label>
                    {!picked && results.map((c) => (
                        <button key={c.id} type="button" onClick={() => setPicked(c)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[var(--dc-card)] border border-[var(--dc-border)] hover:border-[var(--dc-ink)] transition-colors text-left">
                            <span className="w-[30px] h-[30px] rounded-[10px] bg-[var(--dc-inkbox)] text-[var(--dc-inkbox-fg)] text-[11px] font-extrabold grid place-items-center flex-shrink-0">{initialsOf(c.name)}</span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[13px] font-bold text-[var(--dc-ink)] truncate">{c.name}</span>
                                <span className="block text-[11px] text-[var(--dc-muted)]">{c.phone}</span>
                            </span>
                        </button>
                    ))}
                    {!picked && query.trim() && results.length === 0 && (
                        <p className="text-[12px] text-[var(--dc-muted)] px-1">Sonuç yok — Müşteriler sayfasından ekleyip geri dönün.</p>
                    )}

                    <label>
                        <span>Hizmet</span>
                        <div className="field select-field">
                            <Scissors size={16} />
                            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                                {services.length === 0 && <option value="">Önce hizmet tanımlayın</option>}
                                {services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.duration} dk</option>)}
                            </select>
                            <ChevronDown size={15} />
                        </div>
                    </label>

                    <label>
                        <span>Koltuk ve kuaför</span>
                        <div className="field select-field">
                            <DoorOpen size={16} />
                            <select value={unitId} onChange={(e) => setUnitId(e.target.value)} aria-label="Koltuk">
                                <option value="">Koltuk fark etmez</option>
                                {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.state !== 'free' ? ' (dolu)' : ''}</option>)}
                            </select>
                            <ChevronDown size={15} />
                        </div>
                        <div className="field select-field">
                            <Scissors size={16} />
                            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Kuaför">
                                <option value="">İlk müsait kuaför</option>
                                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <ChevronDown size={15} />
                        </div>
                    </label>

                    <div className="availability-card">
                        <span><Clock3 size={18} /></span>
                        <div>
                            <small>TAHMİNİ BAŞLAMA</small>
                            <strong>{freeUnit && freeUnit.state === 'free' ? 'Şimdi' : 'İlk koltuk boşalınca'}</strong>
                            <p>{[freeUnit?.name, service ? `${service.duration} dk` : null].filter(Boolean).join(' · ') || 'Koltuk seçilmedi'}</p>
                        </div>
                        <BadgeCheck size={19} />
                    </div>
                    <div className="modal-note"><ShieldCheck size={16} /> Kayıt bekleme alanına düşer; hizmet süresi koltuğa alınca başlar.</div>
                </div>
                <footer>
                    <button className="button secondary" onClick={onClose}>Vazgeç</button>
                    <button className="button primary" disabled={!picked || !service || saving} onClick={() => void submit()}>
                        {saving ? 'Ekleniyor…' : 'Sıraya ekle'} <ArrowRight size={16} />
                    </button>
                </footer>
            </section>
        </div>
    );
}
