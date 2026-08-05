import { useEffect, useMemo, useState, type ElementType, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlarmClock, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3,
    Lock, MessageCircle, Package, Plus, ReceiptText, RotateCcw, Scissors, Search,
    ShieldCheck, Sparkles, WalletCards, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { useQueue } from '@/hooks/useQueue';
import { useResources } from '@/hooks/useResources';
import { useCustomers } from '@/hooks/useCustomers';
import { useStaff } from '@/hooks/useStaff';
import { useWaitlist } from '@/hooks/useWaitlist';
import { useCashEnabled } from '@/hooks/useModules';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/cn';
import { normalizePhone } from '@/lib/phone';
import { todayISO, toISODate } from '@/utils/date';
import { phaseOf, minsSince, advancePatch } from '@/lib/sessionPhase';
import { profileForSector } from '@/lib/sectorProfiles';
import { AdisyonModal } from '@/components/reservations/AdisyonModal';
import { EditReservationModal } from '@/components/reservations/EditReservationModal';
import type { Customer, QueueEntry, Reservation, Service } from '@/types';
import './berberOps.css';

// ── Berber Dashboard'u · "Salon kumandası" ───────────────────────────────────
// Tasarım: Timeflow Berber Dashboard Final. İlke — berberde gün takvimle değil
// SIRAYLA yönetilir: randevulu ve randevusuz müşteri tek canlı akışta durur.
//   bekleniyor → bekliyor (sırada) → koltukta → kasaya hazır → tamamlandı
// Randevulu müşteri sessionPhase üzerinden, randevusuz müşteri Sıra modülünden
// (queue_entries) gelir; ikisi aynı listede aynı eylemlerle yönetilir.
//
// Koltuk, ustadan ayrı bir kaynaktır: usta boşta olsa da koltuk temizlikteyse
// müşteri oturtulmaz. Temizlik durumu yeni kolon açmadan son biten hizmetin
// zaman damgasından türetilir (bkz. CLEAN_MIN / CF_CLEANED).

type FlowView = 'chairs' | 'waiting' | 'upcoming';
type ChairState = 'active' | 'ready' | 'cleaning';
type ModalType = 'walkin' | 'search' | null;

// Hizmet bittikten sonra koltuğun varsayılan hazırlık süresi (dk).
// "Hazır işaretle" bu süreyi beklemeden kapatır.
const CLEAN_MIN = 5;
const CF_CLEANED = 'br_cleaned_at';   // randevu custom_fields: koltuk erken hazırlandı
const UPCOMING_WINDOW = 90;           // "Yaklaşan" penceresi (dk)
const PLAN_WINDOW = 90;               // Günün planı şeridi (dk) — 4 yarım saatlik işaret
const PLAN_MAX_OFFSET = 64;           // prototipin en alt olay konumu (px)

const initialsOf = (name: string) => name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toLocaleUpperCase('tr');
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const fromMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const money = (n: number) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const waLink = (phone: string) => `https://wa.me/${normalizePhone(phone) ?? phone.replace(/\D/g, '')}`;
/** Timestamp temizlemek için — updateReservation undefined'ı atlar, null'ı yazar. */
const CLEAR = null as unknown as undefined;

/** Bekleyen satırı: randevulu (geldi, oturmayı bekliyor) ya da randevusuz (sıra). */
type WaitingItem = {
    key: string;
    name: string;
    service: string;
    source: 'Randevulu' | 'Randevusuz';
    since: number;              // kaç dakikadır bekliyor
    at: string;                 // saat
    staffName: string | null;   // usta tercihi; null = İlk müsait
    staffId?: string;
    note?: string;
    reservation?: Reservation;
    entry?: QueueEntry;
};

export function BerberDashboard() {
    const navigate = useNavigate();
    const { dark } = useTheme();
    const { reservations, settings, updateReservation, addReservation } = useReservations();
    const { waiting: queueWaiting, called: queueCalled, addEntry, serveEntry } = useQueue();
    const { resources } = useResources();
    const { customers, customerById } = useCustomers();
    const { staff } = useStaff();
    const { entries: waitlist } = useWaitlist();
    const cashOn = useCashEnabled();
    const today = todayISO();

    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 20_000);
        return () => clearInterval(t);
    }, []);
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const [flowView, setFlowView] = useState<FlowView>('chairs');
    const [modal, setModal] = useState<ModalType>(null);
    // Ortak bilgisayar varsayılanı: soyad kısaltılır, telefon ve özel not gizlenir
    const [privacy, setPrivacy] = useState(true);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [cardRes, setCardRes] = useState<Reservation | null>(null);
    const [editRes, setEditRes] = useState<Reservation | null>(null);

    const services: Service[] = useMemo(() => settings.services || [], [settings.services]);
    const activeList = useMemo(() => reservations.filter((r) => r.status !== 'cancelled'), [reservations]);
    const todayList = useMemo(
        () => activeList.filter((r) => r.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [activeList, today],
    );
    const activeStaff = useMemo(() => staff.filter((s) => s.isActive !== false), [staff]);
    const activeChairs = useMemo(() => resources.filter((r) => r.isActive).sort((a, b) => a.sort - b.sort), [resources]);
    // Tek çalışan işletme: ekip/kapasite ayrıntısı kendiliğinden gizlenir
    const solo = activeStaff.length <= 1;

    // ── Faz kümeleri ──────────────────────────────────────────────────────────
    const inChair = useMemo(() => todayList.filter((r) => phaseOf(r) === 'active'), [todayList]);
    const atTill = useMemo(() => todayList.filter((r) => phaseOf(r) === 'done'), [todayList]);
    const doneToday = useMemo(() => todayList.filter((r) => phaseOf(r) === 'completed'), [todayList]);
    const arrived = useMemo(() => todayList.filter((r) => phaseOf(r) === 'arrived'), [todayList]);
    const upcoming = useMemo(
        () => todayList.filter((r) => phaseOf(r) === 'wait' && toMin(r.startTime) >= nowMin - 5),
        [todayList, nowMin],
    );
    const upcomingSoon = useMemo(
        () => upcoming.filter((r) => toMin(r.startTime) <= nowMin + UPCOMING_WINDOW),
        [upcoming, nowMin],
    );

    // ── Bekleyenler: randevulu + randevusuz tek akışta ────────────────────────
    const waitingItems = useMemo<WaitingItem[]>(() => {
        const fromRes: WaitingItem[] = arrived.map((r) => ({
            key: `r-${r.id}`,
            name: r.customerName,
            service: r.service,
            source: 'Randevulu',
            since: r.customerArrivedAt ? minsSince(r.customerArrivedAt, now) : 0,
            at: r.startTime,
            staffName: r.staffName || null,
            staffId: r.staffId,
            note: customerById.get(r.customerId)?.notes || undefined,
            reservation: r,
        }));
        const fromQueue: WaitingItem[] = [...queueWaiting, ...queueCalled].map((e) => ({
            key: `q-${e.id}`,
            name: e.customerName,
            service: e.service || 'Saç kesimi',
            source: 'Randevusuz',
            since: minsSince(e.joinedAt, now),
            at: hhmm(new Date(e.joinedAt)),
            staffName: activeStaff.find((s) => s.id === e.staffId)?.name || null,
            staffId: e.staffId,
            note: e.notes || undefined,
            entry: e,
        }));
        return [...fromRes, ...fromQueue].sort((a, b) => b.since - a.since);
    }, [arrived, queueWaiting, queueCalled, now, activeStaff, customerById]);

    // ── Koltuk durumu: kullanımda / temizleniyor / hazır ──────────────────────
    const chairs = useMemo(() => activeChairs.map((res) => {
        const occupied = inChair.find((r) => r.resourceId === res.id);
        // Temizlik: bu koltukta en son biten hizmetten CLEAN_MIN dakika geçmediyse
        const lastEnded = [...atTill, ...doneToday]
            .filter((r) => r.resourceId === res.id && r.serviceEndedAt && !r.customFields?.[CF_CLEANED])
            .sort((a, b) => String(b.serviceEndedAt).localeCompare(String(a.serviceEndedAt)))[0];
        const cleanMins = lastEnded?.serviceEndedAt ? minsSince(lastEnded.serviceEndedAt, now) : null;
        const cleaning = !occupied && cleanMins !== null && cleanMins < CLEAN_MIN;
        const state: ChairState = occupied ? 'active' : cleaning ? 'cleaning' : 'ready';
        const staffName = occupied?.staffName
            || upcoming.find((r) => r.resourceId === res.id)?.staffName
            || null;
        const nextHere = upcoming.find((r) => r.resourceId === res.id);
        return {
            id: res.id, name: res.name, state, staffName,
            reservation: occupied,
            cleaningRes: cleaning ? lastEnded : undefined,
            cleanLeft: cleaning && cleanMins !== null ? Math.max(1, CLEAN_MIN - cleanMins) : null,
            next: nextHere ? `${nextHere.customerName} · ${nextHere.startTime}` : null,
        };
    }), [activeChairs, inChair, atTill, doneToday, upcoming, now]);

    const readyChairs = useMemo(() => chairs.filter((c) => c.state === 'ready'), [chairs]);
    const cleaningChairs = useMemo(() => chairs.filter((c) => c.state === 'cleaning'), [chairs]);

    // ── Gizlilik: soyad kısalt, telefon/özel not gizle ────────────────────────
    const mask = useMemo(() => (name: string) => {
        if (!privacy || !name) return name;
        const parts = name.trim().split(/\s+/);
        if (parts.length < 2) return parts[0] || name;
        return `${parts[0]} ${parts[parts.length - 1][0].toLocaleUpperCase('tr')}.`;
    }, [privacy]);

    // Kesim hafızası: kartta yalnız kısa özet; ayrıntı müşteri kartında kalır
    const memoryOf = (customerId?: string): string | null => {
        if (privacy || !customerId) return null;
        const note = customerById.get(customerId)?.notes?.trim();
        if (!note) return null;
        const first = note.split('\n')[0];
        return first.length > 46 ? `${first.slice(0, 46)}…` : first;
    };

    const priceOf = (r: Reservation) => {
        const extras = (r.adisyonItems || []).reduce((s, i) => s + (i.price || 0), 0);
        return (services.find((s) => s.name === r.service)?.price || 0) + extras;
    };
    const durationOf = (name: string) => services.find((s) => s.name === name)?.duration || 30;

    // ── Eylemler ──────────────────────────────────────────────────────────────
    const run = async (key: string, fn: () => Promise<boolean | void>, message?: string, undo?: () => void) => {
        if (busyKey) return;                       // çift tıklama ikinci kayıt açmaz
        setBusyKey(key);
        const ok = await fn();
        setBusyKey(null);
        if (ok === false || !message) return;
        toast.success(message, undo ? { action: { label: 'Geri al', onClick: undo } } : undefined);
    };

    /** Randevulu müşteri geldi — hizmet başlamaz, bekleyenlere düşer. */
    const markArrived = (r: Reservation) => run(`arr-${r.id}`,
        async () => { await updateReservation(r.id, advancePatch('arrived')); },
        `${mask(r.customerName)} geldi olarak işaretlendi`,
        () => { void updateReservation(r.id, { customerArrivedAt: CLEAR }); });

    /** Koltuğa al — usta tercihi sessizce değiştirilmez. */
    const seat = async (item: WaitingItem, chairId?: string) => {
        const chair = chairId ? chairs.find((c) => c.id === chairId) : null;
        const target = chair?.state === 'ready' ? chair
            : readyChairs.find((c) => c.id === item.reservation?.resourceId) || readyChairs[0];
        if (!target) { toast.error('Hazır koltuk yok — müşteri sırada tutuldu'); return; }

        if (item.reservation) {
            const r = item.reservation;
            await run(item.key, async () => {
                await updateReservation(r.id, { ...advancePatch('active'), resourceId: r.resourceId || target.id });
            }, `${mask(item.name)} ${target.name} için işleme alındı`,
                () => { void updateReservation(r.id, { arrivedAt: CLEAR, status: 'confirmed' }); });
            setFlowView('chairs');
            return;
        }

        const e = item.entry;
        if (!e) return;
        await run(item.key, async () => {
            const svc = services.find((s) => s.name === item.service);
            const start = new Date();
            const end = new Date(start.getTime() + (svc?.duration || 30) * 60_000);
            const stamp = start.toISOString();
            const created = await addReservation({
                customerId: '', customerName: e.customerName, customerPhone: e.customerPhone || '',
                date: toISODate(start), startTime: hhmm(start), endTime: hhmm(end),
                service: svc?.name || item.service, serviceColor: svc?.color,
                status: 'confirmed', notes: e.notes,
                staffId: e.staffId || undefined,
                staffName: activeStaff.find((s) => s.id === e.staffId)?.name,
                resourceId: target.id,
            });
            if (!created) return false;
            await updateReservation(created.id, { customerArrivedAt: stamp, arrivedAt: stamp });
            await serveEntry(e.id);
        }, `${mask(item.name)} ${target.name} için işleme alındı`);
        setFlowView('chairs');
    };

    /** Hizmeti tamamla → müşteri kasaya hazır, koltuk temizliğe geçer. */
    const complete = (r: Reservation) => run(`done-${r.id}`,
        async () => { await updateReservation(r.id, advancePatch('completed')); },
        `${mask(r.customerName)} kasaya hazır · koltuk temizliğe alındı`,
        () => { void updateReservation(r.id, { serviceEndedAt: CLEAR, status: 'confirmed' }); });

    /** Koltuğu erken hazır işaretle — temizlik sayacını kapatır. */
    const markChairReady = (chairId: string) => {
        const chair = chairs.find((c) => c.id === chairId);
        const src = chair?.cleaningRes;
        if (!src) return;
        void run(`clean-${chairId}`, async () => {
            await updateReservation(src.id, {
                customFields: { ...(src.customFields || {}), [CF_CLEANED]: new Date().toISOString() },
            });
        }, `${chair?.name} hazır olarak işaretlendi`);
    };

    // ── Ortalama bekleme + tahmini sıra ───────────────────────────────────────
    const avgWait = useMemo(() => {
        if (waitingItems.length === 0) return null;
        return Math.round(waitingItems.reduce((s, w) => s + w.since, 0) / waitingItems.length);
    }, [waitingItems]);

    /** Yeni gelen için tahmini başlama: hazır koltuk varsa şimdi, yoksa ilk boşalma. */
    const estimateWait = useMemo(() => {
        if (readyChairs.length > 0 && waitingItems.length === 0) return 0;
        const frees = inChair
            .map((r) => Math.max(0, toMin(r.endTime) - nowMin))
            .sort((a, b) => a - b);
        const ahead = waitingItems.length;
        if (frees.length === 0) return ahead * 20;
        const slot = frees[Math.min(ahead, frees.length - 1)] ?? frees[frees.length - 1];
        return Math.max(0, slot);
    }, [readyChairs.length, waitingItems.length, inChair, nowMin]);

    // ── Sıradaki hareket ──────────────────────────────────────────────────────
    // Öncelik: gelmesi beklenen ilk randevu > en uzun bekleyen > kasadaki.
    const nextUp = upcoming[0] || null;
    const longestWait = waitingItems[0] || null;
    const nextAction = useMemo(() => {
        // Salonda bekleyen + hazır koltuk varsa yapılacak iş bellidir: oturt.
        // Henüz gelmemiş randevuyu "geldi" işaretlemek ancak saati yaklaşınca öne geçer.
        if (longestWait && readyChairs.length > 0) return { kind: 'seat' as const, item: longestWait };
        if (nextUp && toMin(nextUp.startTime) - nowMin <= 30) return { kind: 'arrive' as const, res: nextUp };
        if (longestWait) return { kind: 'seat' as const, item: longestWait };
        if (nextUp) return { kind: 'arrive' as const, res: nextUp };
        // Kasa modülü kapalıysa "Hesabı aç" gidecek yer bulamaz — sonraki iş
        // olarak hiç önerilmez (bkz. useCashEnabled).
        if (cashOn && atTill[0]) return { kind: 'till' as const, res: atTill[0] };
        return null;
    }, [nextUp, longestWait, atTill, nowMin, readyChairs.length, cashOn]);

    // ── FlowPilot: tek öneri ──────────────────────────────────────────────────
    const gap = useMemo(() => {
        const wh = settings.workingHours?.find((w) => w.day === now.getDay());
        const open = toMin(wh?.start || '09:00');
        const close = toMin(wh?.end || '21:00');
        const busy = todayList.map((r) => [toMin(r.startTime), toMin(r.endTime)] as [number, number]).sort((a, b) => a[0] - b[0]);
        const merged: [number, number][] = [];
        for (const b of busy) {
            const last = merged[merged.length - 1];
            if (last && b[0] <= last[1]) last[1] = Math.max(last[1], b[1]);
            else merged.push([...b]);
        }
        let cursor = Math.max(nowMin, open);
        let best: { start: number; end: number } | null = null;
        for (const [s, e] of merged) {
            if (s > cursor && s - cursor >= 30 && (!best || s - cursor > best.end - best.start)) best = { start: cursor, end: s };
            cursor = Math.max(cursor, e);
        }
        if (close - cursor >= 30 && (!best || close - cursor > best.end - best.start)) best = { start: cursor, end: close };
        if (!best) return null;
        const len = best.end - best.start;
        const fits = waitlist.filter((w) => w.status === 'waiting' && (services.find((s) => s.id === w.serviceId)?.duration ?? 30) <= len).length;
        return { ...best, len, fits };
    }, [todayList, nowMin, settings.workingHours, waitlist, services, now]);

    const recallDays = profileForSector(settings.sector).comms.recall?.afterDays ?? 21;
    const dueBack = useMemo(() => {
        const cutoff = new Date(now); cutoff.setDate(now.getDate() - recallDays);
        const cutoffISO = toISODate(cutoff);
        const future = new Set(activeList.filter((r) => r.date > today).map((r) => r.customerId));
        return customers.filter((c) => c.lastVisit && c.lastVisit <= cutoffISO && !future.has(c.id) && c.phone);
    }, [customers, activeList, today, now, recallDays]);

    const pilot = useMemo(() => {
        if (gap && gap.fits > 0) return {
            title: `${fromMin(gap.start)} boşluğunu doldur`,
            detail: `Hizmet süresine uyan ${gap.fits} izinli müşteri bulundu.`,
            action: 'Eşleşmeleri aç', tone: 'purple', run: () => navigate('/queue'),
        };
        if (dueBack.length > 0) return {
            title: 'Geri dönüş zamanı geldi',
            detail: `${recallDays} gündür gelmeyen ${dueBack.length} müşteriye ulaşılabiliyor.`,
            action: 'Listeyi aç', tone: 'orange', run: () => navigate('/customers'),
        };
        if (gap) return {
            title: `${fromMin(gap.start)} sonrası boş`,
            detail: `${gap.len} dakikalık boşluk var; bekleme listesinde uyan müşteri yok.`,
            action: 'Takvimi aç', tone: 'purple', run: () => navigate('/calendar'),
        };
        return null;
    }, [gap, dueBack.length, recallDays, navigate]);

    // ── Öncelik sırası: en fazla 3 gerçek iş ─────────────────────────────────
    type Job = { key: string; kicker: string; title: string; sub: string; tone: string; icon: ElementType; run: () => void };
    // Ucuz hesap; useMemo yerine doğrudan — eylemler her render'da tazedir
    const jobs = (() => {
        const out: Job[] = [];
        for (const c of cleaningChairs.slice(0, 1)) {
            out.push({
                key: `clean-${c.id}`, kicker: 'ŞİMDİ', title: `${c.name} temizliği`,
                sub: [c.staffName, `${c.cleanLeft} dk içinde hazır`].filter(Boolean).join(' · '),
                tone: 'amber', icon: RotateCcw, run: () => markChairReady(c.id),
            });
        }
        for (const r of (cashOn ? atTill.slice(0, 1) : [])) {
            const amount = priceOf(r);
            out.push({
                key: `till-${r.id}`, kicker: 'KASAYA HAZIR',
                title: `${mask(r.customerName)}${amount > 0 ? ` · ${money(amount)}` : ''}`,
                sub: [r.service, r.staffName].filter(Boolean).join(' · '),
                tone: 'green', icon: ReceiptText, run: () => navigate('/kasa'),
            });
        }
        const late = waitingItems.find((w) => w.since >= 15);
        if (late) out.push({
            key: `late-${late.key}`, kicker: 'BUGÜN', title: `${mask(late.name)} ${late.since} dakikadır bekliyor`,
            sub: [late.service, late.staffName || 'İlk müsait'].filter(Boolean).join(' · '),
            tone: 'red', icon: Clock3, run: () => setFlowView('waiting'),
        });
        else if (dueBack.length > 0) out.push({
            key: 'recall', kicker: 'BUGÜN', title: `${dueBack.length} müşterinin dönüş zamanı geldi`,
            sub: `${recallDays} gündür gelmeyen · telefonla ulaşılabiliyor`,
            tone: 'red', icon: Package, run: () => navigate('/customers'),
        });
        return out.slice(0, 3);
    })();

    // ── Günün planı: usta başına sıradaki randevu ────────────────────────────
    const planLanes = useMemo(() => {
        const from = Math.floor(nowMin / 30) * 30;
        const marks = [0, 1, 2, 3].map((i) => fromMin(from + i * 30));
        const lanes = (solo ? activeStaff.slice(0, 1) : activeStaff).map((s) => {
            const next = upcoming.find((r) => r.staffId === s.id && toMin(r.startTime) <= from + PLAN_WINDOW);
            const busyNow = inChair.find((r) => r.staffId === s.id);
            return {
                id: s.id, name: s.name,
                state: busyNow ? 'Görevde' : 'Hazır',
                res: next,
                offset: next ? Math.max(0, Math.min(PLAN_MAX_OFFSET, ((toMin(next.startTime) - from) / PLAN_WINDOW) * PLAN_MAX_OFFSET)) : 0,
            };
        });
        return { marks, lanes };
    }, [activeStaff, upcoming, inChair, nowMin, solo]);

    // ── Başlık ────────────────────────────────────────────────────────────────
    const weekday = now.toLocaleDateString('tr-TR', { weekday: 'long' }).toLocaleUpperCase('tr');
    const monthShort = now.toLocaleDateString('tr-TR', { month: 'short' }).toLocaleUpperCase('tr');
    const busyStaff = useMemo(() => new Set(inChair.map((r) => r.staffId).filter(Boolean)).size, [inChair]);

    const stats: { key: FlowView; label: string; value: number; detail: string; tone: string; icon: ElementType }[] = [
        {
            key: 'waiting', label: 'Bekliyor', value: waitingItems.length,
            detail: `${waitingItems.filter((w) => w.source === 'Randevusuz').length} randevusuz`,
            tone: 'amber', icon: Clock3,
        },
        {
            key: 'chairs', label: 'Koltukta', value: inChair.length,
            detail: readyChairs.length > 0 ? `${readyChairs.length} koltuk hazır` : 'Hazır koltuk yok',
            tone: 'orange', icon: Scissors,
        },
        {
            key: 'upcoming', label: 'Yaklaşan', value: upcomingSoon.length,
            detail: `${UPCOMING_WINDOW} dakika`, tone: 'blue', icon: CalendarDays,
        },
        {
            key: 'chairs', label: 'Kasaya hazır', value: atTill.length,
            detail: atTill.length > 0 ? `${money(atTill.reduce((s, r) => s + priceOf(r), 0))} bekliyor` : 'Açık hesap yok',
            tone: 'green', icon: WalletCards,
        },
    ];

    // ⌘K / Ctrl+K → müşteri arama
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setModal('search'); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    return (
        <div className={cn('dash-theme br-ops flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--dc-page)]', dark && 'dark')}>
            <div className="dashboard-scroll">
                <div className="dashboard-container">

                    {/* ── Gün başlığı ────────────────────────────────────────── */}
                    <section className="hero-card" aria-labelledby="berber-title">
                        <div className="date-tile">
                            <span>{weekday}</span>
                            <b>{now.getDate()}</b>
                            <small>{monthShort} {now.getFullYear()}</small>
                        </div>
                        <div className="hero-copy">
                            <div className="eyebrow">
                                <span>{(settings.businessName || 'BERBER SALONU').toLocaleUpperCase('tr')}</span>
                                <span aria-hidden="true">·</span>
                                <span className="live-time"><LiveClock /></span>
                            </div>
                            <h1 id="berber-title">
                                {waitingItems.length > 0
                                    ? <>Akış kontrollü; <em>{waitingItems.length} müşteri sırada.</em></>
                                    : inChair.length > 0
                                        ? <>Sıra boş; <em>{inChair.length} müşteri koltukta.</em></>
                                        : <>Salon sakin; <em>bekleyen müşteri yok.</em></>}
                            </h1>
                            <p>
                                {[
                                    inChair.length > 0 && `${inChair.length} müşteri koltukta`,
                                    atTill.length > 0 && `${atTill.length} müşteri kasaya hazır`,
                                    avgWait !== null && `ortalama bekleme ${avgWait} dk`,
                                    waitingItems.length === 0 && inChair.length === 0 && `bugün ${doneToday.length} işlem tamamlandı`,
                                    upcomingSoon.length > 0 && `${UPCOMING_WINDOW} dakikada ${upcomingSoon.length} randevu`,
                                ].filter(Boolean).join(' · ')}
                            </p>
                            <div className="operational-notes">
                                {!solo && (
                                    <span><i className="status-dot green" /> {busyStaff} / {activeStaff.length} berber görevde</span>
                                )}
                                {cleaningChairs.length > 0 && (
                                    <span><i className="status-dot orange" /> {cleaningChairs.length} koltuk temizleniyor</span>
                                )}
                                <button type="button" className="privacy-button"
                                    onClick={() => setPrivacy((v) => !v)} aria-pressed={privacy}>
                                    <Lock size={13} aria-hidden="true" />
                                    Gizlilik {privacy ? 'açık' : 'kapalı'}
                                </button>
                            </div>
                        </div>
                        <div className="hero-actions">
                            <button type="button" className="button button-light" onClick={() => navigate('/calendar')}>
                                <CalendarDays size={19} aria-hidden="true" />Takvimi aç
                            </button>
                            <button type="button" className="button button-light" onClick={() => setModal('walkin')}>
                                <Scissors size={19} aria-hidden="true" />Randevusuz müşteri
                            </button>
                            <button type="button" className="button button-dark" onClick={() => navigate('/calendar?new=1')}>
                                <Plus size={20} aria-hidden="true" />Yeni randevu
                            </button>
                        </div>
                    </section>

                    {/* ── Salon akışı + Sıradaki hareket ─────────────────────── */}
                    <section className="main-grid">
                        <div className="live-card">
                            <div className="section-heading">
                                <div>
                                    <span className="section-kicker">CANLI SALON</span>
                                    <h2>Salon akışı</h2>
                                    <p>Randevulu ve randevusuz müşteriler aynı akışta.</p>
                                </div>
                                <div className="updated-copy">
                                    <CheckCircle2 size={16} aria-hidden="true" />Şimdi güncellendi
                                </div>
                            </div>

                            <div className="stat-strip">
                                {stats.map((stat) => {
                                    const Icon = stat.icon;
                                    return (
                                        <button type="button" key={stat.label}
                                            className={cn('flow-stat', `tone-${stat.tone}`, flowView === stat.key && 'is-selected')}
                                            onClick={() => setFlowView(stat.key)} aria-pressed={flowView === stat.key}>
                                            <span className="flow-stat-icon"><Icon size={18} aria-hidden="true" /></span>
                                            <span className="flow-stat-copy"><small>{stat.label}</small><b>{stat.value}</b></span>
                                            <span className="flow-stat-detail">{stat.detail}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="view-toolbar">
                                <div className="segmented" aria-label="Salon akışı görünümü">
                                    {([['chairs', 'Koltuklar'], ['waiting', 'Bekleyenler'], ['upcoming', `Yaklaşan ${UPCOMING_WINDOW} dk`]] as const).map(([k, label]) => (
                                        <button type="button" key={k} className={cn(flowView === k && 'is-active')}
                                            onClick={() => setFlowView(k)} aria-pressed={flowView === k}>{label}</button>
                                    ))}
                                </div>
                                <button type="button" className="search-trigger" onClick={() => setModal('search')}>
                                    <Search size={17} aria-hidden="true" />Müşteri ara<kbd>⌘ K</kbd>
                                </button>
                            </div>

                            <div className="flow-content">
                                {flowView === 'chairs' && (
                                    <div className={cn('chair-grid', chairs.length === 1 && 'single', chairs.length >= 5 && 'many')}>
                                        {chairs.length === 0 && (
                                            <div className="empty-list">
                                                <Scissors size={32} aria-hidden="true" />
                                                <h3>Koltuk tanımlı değil</h3>
                                                <p>Ayarlar'dan koltuklarınızı ekleyin; salon akışı burada görünecek.</p>
                                            </div>
                                        )}
                                        {chairs.map((chair) => {
                                            const r = chair.reservation;
                                            const elapsed = r?.arrivedAt ? minsSince(r.arrivedAt, now) : 0;
                                            const total = r ? Math.max(durationOf(r.service), Math.max(1, toMin(r.endTime) - toMin(r.startTime))) : 0;
                                            const memory = r ? memoryOf(r.customerId) : null;
                                            return (
                                                <article className={`chair-card chair-${chair.state}`} key={chair.id}>
                                                    <div className="chair-card-head">
                                                        <div className="barber-identity">
                                                            <span className="barber-avatar">{(chair.staffName || chair.name).slice(0, 1).toLocaleUpperCase('tr')}</span>
                                                            <div>
                                                                <b>{chair.staffName || chair.name}</b>
                                                                <small>{chair.staffName ? chair.name : 'Usta atanmadı'}</small>
                                                            </div>
                                                        </div>
                                                        <span className={`chair-status status-${chair.state}`}>
                                                            {chair.state === 'active' ? 'Koltukta' : chair.state === 'ready' ? 'Hazır' : 'Temizleniyor'}
                                                        </span>
                                                    </div>

                                                    {chair.state === 'active' && r ? (
                                                        <>
                                                            <div className="active-client">
                                                                <span className="client-initials">{initialsOf(r.customerName)}</span>
                                                                <div>
                                                                    <h3>{mask(r.customerName)}</h3>
                                                                    <p>{r.service}</p>
                                                                </div>
                                                                <span className="time-left">{Math.max(total - elapsed, 0)} dk</span>
                                                            </div>
                                                            <div className="progress-copy">
                                                                <span>{elapsed} dk geçti</span>
                                                                <span>{total} dk planlandı</span>
                                                            </div>
                                                            <div className="progress-track" role="progressbar"
                                                                aria-valuenow={Math.min(Math.round((elapsed / total) * 100), 100)} aria-valuemin={0} aria-valuemax={100}>
                                                                <span style={{ width: `${Math.min((elapsed / total) * 100, 100)}%` }} />
                                                            </div>
                                                            {memory && (
                                                                <div className="memory-chip"><Scissors size={14} aria-hidden="true" />{memory}</div>
                                                            )}
                                                            <div className="chair-card-footer">
                                                                <span>Sıradaki <b>{chair.next || 'randevu yok'}</b></span>
                                                                <button type="button" disabled={busyKey === `done-${r.id}`}
                                                                    onClick={() => void complete(r)}>Hizmeti tamamla</button>
                                                            </div>
                                                        </>
                                                    ) : chair.state === 'ready' ? (
                                                        <div className="empty-chair">
                                                            <span className="empty-chair-icon"><Check size={24} aria-hidden="true" /></span>
                                                            <div>
                                                                <h3>Koltuk hazır</h3>
                                                                <p>{waitingItems[0] ? `${mask(waitingItems[0].name)} bekliyor` : chair.next ? `Sıradaki ${chair.next}` : 'Bekleyen müşteri yok'}</p>
                                                            </div>
                                                            <button type="button" disabled={!waitingItems[0] || busyKey === waitingItems[0]?.key}
                                                                onClick={() => waitingItems[0] && void seat(waitingItems[0], chair.id)}>
                                                                Sıradakini al<ArrowRight size={17} aria-hidden="true" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="empty-chair cleaning">
                                                            <span className="empty-chair-icon"><Sparkles size={22} aria-hidden="true" /></span>
                                                            <div>
                                                                <h3>Koltuk hazırlanıyor</h3>
                                                                <p>{chair.cleanLeft} dk içinde hazır</p>
                                                            </div>
                                                            <button type="button" disabled={busyKey === `clean-${chair.id}`}
                                                                onClick={() => markChairReady(chair.id)}>
                                                                Hazır işaretle<Check size={17} aria-hidden="true" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </article>
                                            );
                                        })}
                                    </div>
                                )}

                                {flowView === 'waiting' && (
                                    <div className="waiting-list">
                                        <div className={cn('list-columns', solo && 'solo')} aria-hidden="true">
                                            <span>SIRA</span><span>MÜŞTERİ</span><span>HİZMET</span><span>BEKLEME</span>
                                            {!solo && <span>USTA</span>}
                                            <span />
                                        </div>
                                        {waitingItems.length > 0 ? waitingItems.map((item, i) => (
                                            <article className={cn('waiting-row', solo && 'solo')} key={item.key}>
                                                <span className="queue-number">{i + 1}</span>
                                                <div className="waiting-customer">
                                                    <span>{initialsOf(item.name)}</span>
                                                    <div>
                                                        <b>{mask(item.name)}</b>
                                                        <small className={item.source === 'Randevusuz' ? 'walkin' : 'booked'}>{item.source}</small>
                                                    </div>
                                                </div>
                                                <div className="waiting-service">
                                                    <b>{item.service}</b>
                                                    <small>{(!privacy && item.note) || 'Standart hizmet'}</small>
                                                </div>
                                                <div className="waiting-time">
                                                    <b>{item.since} dk</b>
                                                    <small>{item.at}</small>
                                                </div>
                                                {!solo && (
                                                    <div className="waiting-barber">
                                                        <b>{item.staffName || 'İlk müsait'}</b>
                                                        <small>{item.staffName ? 'Tercihli' : 'Otomatik atanır'}</small>
                                                    </div>
                                                )}
                                                <button type="button" className="seat-button" disabled={busyKey === item.key}
                                                    onClick={() => void seat(item)}>
                                                    Koltuğa al<ArrowRight size={17} aria-hidden="true" />
                                                </button>
                                            </article>
                                        )) : (
                                            <div className="empty-list">
                                                <CheckCircle2 size={32} aria-hidden="true" />
                                                <h3>Bekleyen müşteri yok</h3>
                                                <p>Yeni gelen müşteriyi birkaç saniyede sıraya ekleyebilirsiniz.</p>
                                            </div>
                                        )}
                                        <button type="button" className="add-waiting" onClick={() => setModal('walkin')}>
                                            <Plus size={18} aria-hidden="true" />Randevusuz müşteri ekle
                                        </button>
                                    </div>
                                )}

                                {flowView === 'upcoming' && (
                                    <div className="upcoming-list">
                                        {upcomingSoon.length > 0 ? upcomingSoon.map((r, i) => {
                                            const eta = toMin(r.startTime) - nowMin;
                                            return (
                                                <button type="button" className="upcoming-row" key={r.id} onClick={() => setCardRes(r)}>
                                                    <span className="upcoming-time">{r.startTime}</span>
                                                    <span className={cn('upcoming-line', ['orange', 'blue', 'purple', 'green'][i % 4])} />
                                                    <span className="upcoming-person">
                                                        <b>{mask(r.customerName)}</b>
                                                        <small>{r.service}</small>
                                                    </span>
                                                    {!solo && (
                                                        <span className="upcoming-barber">
                                                            <b>{r.staffName || 'İlk müsait'}</b>
                                                            <small>Usta</small>
                                                        </span>
                                                    )}
                                                    <span className="upcoming-meta">{eta <= 0 ? 'Şimdi' : `${eta} dk sonra`}</span>
                                                    <ChevronRight size={18} aria-hidden="true" />
                                                </button>
                                            );
                                        }) : (
                                            <div className="empty-list">
                                                <CalendarDays size={32} aria-hidden="true" />
                                                <h3>Yaklaşan randevu yok</h3>
                                                <p>Önümüzdeki {UPCOMING_WINDOW} dakikada planlanmış randevu bulunmuyor.</p>
                                            </div>
                                        )}
                                        {gap && (
                                            <div className="timeline-note">
                                                <Clock3 size={17} aria-hidden="true" />
                                                {fromMin(gap.start)}–{fromMin(gap.end)} arasında {gap.len} dakikalık boşluk var
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <aside className="next-card" aria-label="Sıradaki hareket">
                            <div className="next-card-topline">
                                <span>SIRADAKİ HAREKET</span>
                                <span className="availability">
                                    <i />{readyChairs.length > 0 ? 'Hazır' : 'Koltuk dolu'}
                                </span>
                            </div>
                            {nextAction ? (() => {
                                const res = nextAction.kind === 'seat' ? nextAction.item.reservation : nextAction.res;
                                const name = nextAction.kind === 'seat' ? nextAction.item.name : nextAction.res.customerName;
                                const service = nextAction.kind === 'seat' ? nextAction.item.service : nextAction.res.service;
                                const staffName = nextAction.kind === 'seat' ? nextAction.item.staffName : nextAction.res.staffName;
                                const eta = nextAction.kind === 'arrive' ? toMin(nextAction.res.startTime) - nowMin : 0;
                                const phone = nextAction.kind === 'seat' ? nextAction.item.entry?.customerPhone : nextAction.res.customerPhone;
                                const memory = res ? memoryOf(res.customerId) : null;
                                const chairFor = nextAction.kind === 'seat'
                                    ? readyChairs[0]?.name
                                    : chairs.find((c) => c.id === nextAction.res.resourceId)?.name || readyChairs[0]?.name;
                                const bigLabel = nextAction.kind === 'seat' ? `${nextAction.item.since} dk` : nextAction.res.startTime;
                                const stateLabel = nextAction.kind === 'arrive' ? (eta <= 0 ? 'BEKLENİYOR' : `${eta} DK SONRA`)
                                    : nextAction.kind === 'seat' ? 'SIRADA' : 'KASADA';
                                return (
                                    <>
                                        <div className="next-time-row">
                                            <b>{bigLabel}</b>
                                            <span>{stateLabel}</span>
                                        </div>
                                        <h2>{mask(name)}</h2>
                                        <p>{[service, staffName || 'İlk müsait'].filter(Boolean).join(' · ')}</p>
                                        <div className="next-detail">
                                            <div className="next-detail-icon"><Scissors size={20} aria-hidden="true" /></div>
                                            <div>
                                                <b>{chairFor ? 'Hazırlık tamam' : 'Koltuk bekleniyor'}</b>
                                                <span>{chairFor ? `${chairFor} hazır` : `${cleaningChairs.length > 0 ? 'Temizlik sürüyor' : 'Tüm koltuklar dolu'}`}</span>
                                            </div>
                                            <ShieldCheck size={20} aria-hidden="true" />
                                        </div>
                                        {memory && (
                                            <div className="preference-note">
                                                <span>Önceki kesim</span>
                                                <b>{memory}</b>
                                            </div>
                                        )}
                                        {nextAction.kind === 'arrive' ? (
                                            <button type="button" className="next-primary" disabled={busyKey === `arr-${nextAction.res.id}`}
                                                onClick={() => void markArrived(nextAction.res)}>
                                                <Check size={20} aria-hidden="true" />Geldi olarak işaretle
                                            </button>
                                        ) : nextAction.kind === 'seat' ? (
                                            <button type="button" className="next-primary" disabled={busyKey === nextAction.item.key}
                                                onClick={() => void seat(nextAction.item)}>
                                                Koltuğa al<ArrowRight size={20} aria-hidden="true" />
                                            </button>
                                        ) : (
                                            <button type="button" className="next-primary" onClick={() => navigate('/kasa')}>
                                                Hesabı aç<ArrowRight size={20} aria-hidden="true" />
                                            </button>
                                        )}
                                        {phone && (
                                            <a className="next-secondary" href={waLink(phone)} target="_blank" rel="noopener noreferrer">
                                                <MessageCircle size={18} aria-hidden="true" />Müşteriye mesaj gönder
                                            </a>
                                        )}
                                    </>
                                );
                            })() : (
                                <>
                                    <div className="next-time-row"><b>—</b><span>SIRA BOŞ</span></div>
                                    <h2>Bekleyen iş yok</h2>
                                    <p>Bugün {doneToday.length} işlem tamamlandı</p>
                                    <button type="button" className="next-primary" onClick={() => setModal('walkin')}>
                                        <Plus size={20} aria-hidden="true" />Randevusuz müşteri ekle
                                    </button>
                                </>
                            )}
                        </aside>
                    </section>

                    {/* ── FlowPilot: tek öneri ───────────────────────────────── */}
                    {pilot && (
                        <section className="opportunity-strip" aria-label="Akıllı öneri">
                            <div className="opportunity-title">
                                <span className="opportunity-icon"><Sparkles size={19} aria-hidden="true" /></span>
                                <div><b>FlowPilot</b><small>Salon için tek öneri</small></div>
                            </div>
                            <div className="opportunity-copy">
                                <span className={`status-dot ${pilot.tone}`} />
                                <div><b>{pilot.title}</b><small>{pilot.detail}</small></div>
                            </div>
                            <button type="button" className="opportunity-action" onClick={pilot.run}>
                                {pilot.action}<ArrowRight size={18} aria-hidden="true" />
                            </button>
                            <div className="safe-automation">
                                <ShieldCheck size={17} aria-hidden="true" />Onayınız olmadan mesaj gönderilmez
                            </div>
                        </section>
                    )}

                    {/* ── Günün planı + Öncelik sırası ───────────────────────── */}
                    <section className="lower-grid">
                        <div className="schedule-card">
                            <div className="lower-card-heading">
                                <div>
                                    <span className="section-kicker">GÜNÜN PLANI</span>
                                    <h2>Yaklaşan randevular</h2>
                                </div>
                                <button type="button" onClick={() => navigate('/calendar')}>
                                    Tüm takvimi aç<ArrowRight size={17} aria-hidden="true" />
                                </button>
                            </div>
                            {planLanes.lanes.length === 0 ? (
                                <div className="empty-list">
                                    <CalendarDays size={32} aria-hidden="true" />
                                    <h3>Personel tanımlı değil</h3>
                                    <p>Personel ekleyince günün planı ustalara göre bölünecek.</p>
                                </div>
                            ) : (
                                <div className="schedule-table">
                                    <div className="schedule-hours" aria-hidden="true">
                                        {planLanes.marks.map((m) => <span key={m}>{m}</span>)}
                                    </div>
                                    <div className="schedule-lanes" style={{ gridTemplateColumns: `repeat(${planLanes.lanes.length}, minmax(0, 1fr))` }}>
                                        {planLanes.lanes.map((lane) => (
                                            <div className="schedule-lane" key={lane.id}>
                                                <div className="lane-head">
                                                    <span>{lane.name.slice(0, 1).toLocaleUpperCase('tr')}</span>
                                                    <b>{lane.name}</b>
                                                    <small>{lane.state}</small>
                                                </div>
                                                {lane.res ? (
                                                    <button type="button" className="schedule-event"
                                                        style={{ marginTop: lane.offset }}
                                                        onClick={() => setCardRes(lane.res as Reservation)}>
                                                        <span>{lane.res.startTime}</span>
                                                        <b>{mask(lane.res.customerName)}</b>
                                                        <small>{lane.res.service}</small>
                                                    </button>
                                                ) : (
                                                    <p className="lane-empty">Bu saatlerde randevu yok</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <aside className="priority-card">
                            <div className="lower-card-heading">
                                <div>
                                    <span className="section-kicker">ÖNCELİK SIRASI</span>
                                    <h2>Şimdi yapılacaklar</h2>
                                </div>
                                <span className="priority-count">{jobs.length}</span>
                            </div>
                            <div className="priority-list">
                                {jobs.length === 0 && (
                                    <div className="empty-list">
                                        <CheckCircle2 size={32} aria-hidden="true" />
                                        <h3>Bekleyen iş yok</h3>
                                        <p>Temizlik, açık hesap ya da uzun bekleyen müşteri görünmüyor.</p>
                                    </div>
                                )}
                                {jobs.map((job) => {
                                    const Icon = job.icon;
                                    return (
                                        <button type="button" key={job.key} disabled={busyKey === job.key} onClick={job.run}>
                                            <span className={`priority-icon ${job.tone}`}><Icon size={18} aria-hidden="true" /></span>
                                            <span>
                                                <small>{job.kicker}</small>
                                                <b>{job.title}</b>
                                                <em>{job.sub}</em>
                                            </span>
                                            <ChevronRight size={18} aria-hidden="true" />
                                        </button>
                                    );
                                })}
                            </div>
                        </aside>
                    </section>
                </div>
            </div>

            {modal === 'walkin' && (
                <WalkinModal
                    services={services}
                    staff={activeStaff.map((s) => ({ id: s.id, name: s.name }))}
                    customers={customers}
                    estimate={estimateWait}
                    solo={solo}
                    onClose={() => setModal(null)}
                    onSubmit={async (payload) => {
                        const created = await addEntry(payload);
                        if (!created) return false;
                        toast.success(`${payload.customerName} randevusuz sıraya eklendi`);
                        setModal(null);
                        setFlowView('waiting');
                        return true;
                    }}
                />
            )}

            {modal === 'search' && (
                <SearchModal
                    customers={customers}
                    privacy={privacy}
                    onClose={() => setModal(null)}
                    onPick={(c) => { setModal(null); navigate(`/customers?q=${encodeURIComponent(c.phone || c.name)}`); }}
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

/** Başlıktaki canlı saat — yalnız kendini tazeler. */
function LiveClock() {
    const [t, setT] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setT(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    return <>{hhmm(t)}</>;
}

// ── Randevusuz müşteri: ad, hizmet, usta tercihi ─────────────────────────────
// Usta tercihi sessizce değiştirilmez: "İlk müsait" ayrı bir seçimdir.
function WalkinModal({ services, staff, customers, estimate, solo, onClose, onSubmit }: {
    services: Service[];
    staff: { id: string; name: string }[];
    customers: Customer[];
    estimate: number;
    solo: boolean;
    onClose: () => void;
    onSubmit: (p: { customerName: string; customerPhone?: string; service?: string; staffId?: string; partySize?: number }) => Promise<boolean>;
}) {
    const [name, setName] = useState('');
    const [serviceName, setServiceName] = useState(services[0]?.name || '');
    const [staffId, setStaffId] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Kayıtlı müşteriyle eşleşirse telefon da sıraya geçsin (mesaj gönderebilmek için)
    const match = useMemo(() => {
        const q = name.trim().toLocaleLowerCase('tr');
        if (q.length < 3) return null;
        return customers.find((c) => c.name.toLocaleLowerCase('tr') === q)
            || customers.find((c) => c.name.toLocaleLowerCase('tr').startsWith(q)) || null;
    }, [name, customers]);

    const submit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!name.trim() || saving) return;
        setSaving(true);
        await onSubmit({
            customerName: match?.name || name.trim(),
            customerPhone: match?.phone,
            service: serviceName || undefined,
            staffId: staffId || undefined,
            partySize: 1,
        });
        setSaving(false);
    };

    return (
        <div className="modal-layer" role="presentation" onMouseDown={onClose}>
            <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="br-modal-title"
                onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-heading">
                    <div>
                        <span className="section-kicker">HIZLI SIRA</span>
                        <h2 id="br-modal-title">Randevusuz müşteri ekle</h2>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Pencereyi kapat"><X size={21} aria-hidden="true" /></button>
                </div>
                <form className="quick-form" onSubmit={submit}>
                    <div className="form-field full">
                        <label htmlFor="br-name">Müşteri adı</label>
                        <input id="br-name" value={name} onChange={(e) => setName(e.target.value)}
                            autoFocus required placeholder="Örn. Ahmet Yılmaz" />
                        {match && <small className="field-hint">Kayıtlı müşteri bulundu: {match.name}</small>}
                    </div>
                    <div className="form-field">
                        <label htmlFor="br-service">Hizmet</label>
                        <select id="br-service" value={serviceName} onChange={(e) => setServiceName(e.target.value)}>
                            {services.length === 0 && <option value="">Önce hizmet tanımlayın</option>}
                            {services.map((s) => <option key={s.id} value={s.name}>{s.name} · {s.duration} dk</option>)}
                        </select>
                    </div>
                    {!solo && (
                        <div className="form-field">
                            <label htmlFor="br-staff">Usta tercihi</label>
                            <select id="br-staff" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                                <option value="">İlk müsait</option>
                                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="wait-estimate full">
                        <AlarmClock size={21} aria-hidden="true" />
                        <div>
                            <b>Tahmini bekleme: {estimate <= 0 ? 'şimdi başlayabilir' : `${estimate} dakika`}</b>
                            <span>İlk müsait koltuk, sıradaki müşteriler ve hizmet süresine göre hesaplandı.</span>
                        </div>
                    </div>
                    <div className="form-actions full">
                        <button type="button" className="button button-light" onClick={onClose}>Vazgeç</button>
                        <button type="submit" className="button button-dark" disabled={!name.trim() || saving}>
                            <Check size={19} aria-hidden="true" />{saving ? 'Ekleniyor…' : 'Sıraya ekle'}
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
}

// ── Müşteri ara (⌘K) ─────────────────────────────────────────────────────────
function SearchModal({ customers, privacy, onClose, onPick }: {
    customers: Customer[];
    privacy: boolean;
    onClose: () => void;
    onPick: (c: Customer) => void;
}) {
    const [q, setQ] = useState('');
    const [openedAt] = useState(() => Date.now());
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const results = useMemo(() => {
        const s = q.trim().toLocaleLowerCase('tr');
        if (!s) return [];
        return customers.filter((c) => c.name.toLocaleLowerCase('tr').includes(s) || c.phone.includes(s)).slice(0, 6);
    }, [q, customers]);

    const hidePhone = (p: string) => (privacy ? `••• ••• ${p.replace(/\D/g, '').slice(-4, -2)} ${p.replace(/\D/g, '').slice(-2)}` : p);
    const sinceText = (last?: string) => {
        if (!last) return 'İlk ziyaret bekleniyor';
        const days = Math.round((openedAt - new Date(last).getTime()) / 86_400_000);
        return days <= 0 ? 'Bugün geldi' : `Son ziyaret ${days} gün önce`;
    };

    return (
        <div className="modal-layer" role="presentation" onMouseDown={onClose}>
            <section className="modal-card search-modal" role="dialog" aria-modal="true" aria-labelledby="br-search-title"
                onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-heading">
                    <div>
                        <span className="section-kicker">MÜŞTERİ BUL</span>
                        <h2 id="br-search-title">Müşteri ara</h2>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Pencereyi kapat"><X size={21} aria-hidden="true" /></button>
                </div>
                <div className="search-panel">
                    <label className="search-input">
                        <Search size={19} aria-hidden="true" />
                        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                            placeholder="Ad veya telefonla ara" aria-label="Müşteri ara" />
                        <kbd>ESC</kbd>
                    </label>
                    <div className="search-results">
                        <span className="field-label">SONUÇLAR</span>
                        {q.trim() === '' && <p className="search-hint">Aramak için yazmaya başlayın.</p>}
                        {q.trim() !== '' && results.length === 0 && <p className="search-hint">Sonuç bulunamadı.</p>}
                        {results.map((c) => (
                            <button type="button" key={c.id} onClick={() => onPick(c)}>
                                <span>{initialsOf(c.name)}</span>
                                <div>
                                    <b>{c.name}</b>
                                    <small>{hidePhone(c.phone)}</small>
                                </div>
                                <em>{sinceText(c.lastVisit)}</em>
                                <ChevronRight size={18} aria-hidden="true" />
                            </button>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
