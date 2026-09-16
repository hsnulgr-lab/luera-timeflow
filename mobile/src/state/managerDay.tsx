import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
    buildFlow, occupancyOf, revenueOf,
} from '../lib/flowBuild';
import { mergeLocal, sortFlow, type FlowEvent, type FlowKind, type StaffPresence } from '../lib/managerFlow';
import type { OrgRefusal } from '../lib/managerMap';
import type { ManagerReadState } from '../lib/managerRead';
import { useManagerFlowDay } from '../lib/managerFlowDay';
import { updateAppointment } from '../lib/managerWrite';
import type { WriteOutcome } from '../lib/managerWriteMap';

/**
 * Müdür modunun ORTAK GÜN VERİSİ.
 *
 * Neden var: sekmeler kendi kopyalarını tutuyordu. Akış'ta "Tahsil et"e
 * basınca o satır akışta tahsilata dönüyor ama Kasa'nın bekleyen paneli
 * hiçbir şey duymuyordu — aynı salonun iki ekranı iki farklı gerçek
 * söylüyordu.
 *
 * ── Artık SUNUCUDAN besleniyor ──────────────────────────────────────────────
 * Dışı değişmedi, içi değişti: olaylar `mockDay.events` yerine veritabanından
 * türüyor (`flowBuild`). Dokunuşlar sunucu kaydının ÜSTÜNE ince bir yerel
 * katman olarak biniyor ve sunucu o satırı değiştirdiği an kendiliğinden
 * düşüyor — efekt kurmadan, türetmeyle.
 *
 * ── Neden YALNIZ müdür sekmelerinin içinde ──────────────────────────────────
 * Önceden uygulamanın KÖKÜNDEYDİ: personel telefonu da dâhil her ekranı
 * sarıyordu. Sahte veriyle bunun bedeli yoktu. Canlı okumayla olurdu — her
 * personel cihazı yirmi beş saniyede bir müdür sorgusu atardı (oturumu
 * olmadığı için reddedilecek bir sorgu). Sağlayıcı `app/mudur/_layout.tsx`
 * içinde, rol kapısının ARKASINDA.
 */
export interface ManagerDayValue {
    /** Günün olayları — sunucu kaydı + yerel dokunuşlar, kronolojik. */
    events: FlowEvent[];
    /** Bir olayı yerel olarak yerine koyar (pencere sayaçları, geri alma). */
    replace: (id: string, next: FlowEvent) => void;
    /** Yeni olay ekler — randevu oluşturma henüz yerel. */
    add: (event: FlowEvent) => void;
    /** Görünür yeniden okuma; yerel dokunuşlar sıfırlanır. */
    reload: () => void;
    /**
     * Randevuya GERÇEK yazma — iyimser kilitle.
     *
     * Kilit damgası okumadan geliyor; bir önceki yazmanın yeni damgası
     * yerel olarak tutuluyor ki "Geldi" → "Geri al" beş saniye içinde
     * kendi ilk yazmasına takılmasın.
     */
    write: (appointmentId: string, patch: Record<string, unknown>) => Promise<WriteOutcome>;
    /** Sunucu saatine göre ŞU AN, ISO. Damgalar cihaz saatinden yazılmıyor. */
    stampNow: () => string;

    state: ManagerReadState;
    refusal: OrgRefusal | null;
    at: number | null;
    stale: boolean;
    /** Okumanın günü — cihazın günü değil, okumanın yapıldığı gün. */
    dateISO: string;
    presence: StaffPresence[];
    appointmentCount: number;
    /** Günün tahsilatı (₺). */
    revenue: number;
    /** Doluluk yüzdesi. Salonun saati bilinmiyorsa `null` — uydurulmuyor. */
    occupancy: number | null;
    /** Salonun adı — hazır mesaj metni için. Bilinmiyorsa boş. */
    businessName: string;
}

const ManagerDayContext = createContext<ManagerDayValue | null>(null);

/** Sunucu saatli çizim için dakika adımı — eşiklerin (5 · 10 dk) geçişi bunu bekler. */
const CLOCK_TICK_MS = 30_000;

type Overlay = { event: FlowEvent; basedOn: FlowKind | null };
type StampOverride = { from: string | undefined; to: string | null };

export function ManagerDayProvider({ children }: { children: ReactNode }) {
    const snapshot = useManagerFlowDay();
    const { data } = snapshot;

    const [clock, setClock] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setClock(Date.now()), CLOCK_TICK_MS);
        return () => clearInterval(id);
    }, []);

    /*
     * ŞU AN — sunucu saati + geçen cihaz süresi.
     *
     * `clock` okumadan ESKİ olabilir (okuma sayaçtan sonra bitti); o durumda
     * okuma anı esas alınıyor, yoksa sayaçlar bir an geri giderdi.
     */
    const nowMs = data.serverNow !== null && data.deviceAt !== null
        ? data.serverNow + (Math.max(clock, data.deviceAt) - data.deviceAt)
        : null;

    const [overlay, setOverlay] = useState<ReadonlyMap<string, Overlay>>(() => new Map());
    const [added, setAdded] = useState<readonly FlowEvent[]>([]);
    const [stampOverride, setStampOverride] = useState<ReadonlyMap<string, StampOverride>>(() => new Map());

    const serverEvents = useMemo(() => (nowMs === null ? [] : buildFlow({
        rows: data.rows,
        payments: data.payments,
        crew: new Map(data.crew.map((person) => [person.id, person.name])),
        context: data.context,
        dateISO: data.dateISO,
        nowMs,
        toleranceMin: data.toleranceMin,
        tickets: data.tickets,
    })), [data, nowMs]);

    const serverKind = useMemo(
        () => new Map(serverEvents.map((event) => [event.id, event.kind])),
        [serverEvents],
    );

    const events = useMemo(() => {
        const merged = serverEvents.map((event) => {
            const local = overlay.get(event.id);
            // Yerel dokunuş YALNIZ sunucu hâlâ aynı yerdeyken geçerli. Sunucu
            // ilerlediyse (bizim yazmamız ya da başka bir cihaz) gerçek o.
            // Tür değiştirmeyen dokunuşta kart SUNUCUDAN gelir, yalnız hapın
            // yerel alanları dokunuştan (`mergeLocal`) — sayaç donmasın.
            return local && local.basedOn === event.kind ? mergeLocal(event, local.event) : event;
        });
        const known = new Set(serverEvents.map((event) => event.appointmentId));
        // Yerel eklenen, sunucuya ulaştığı an kendiliğinden düşüyor.
        const pendingAdds = added.filter((event) => !known.has(event.appointmentId));
        return sortFlow([...merged, ...pendingAdds]);
    }, [serverEvents, overlay, added]);

    const replace = useCallback((id: string, next: FlowEvent) => {
        setOverlay((current) => {
            const map = new Map(current);
            // Dayanak BİR KEZ yazılıyor: saniyelik pencere güncellemeleri
            // dayanağı yerel hâle kaydırsaydı dokunuş hiç düşmezdi.
            const basedOn = current.get(id)?.basedOn ?? serverKind.get(id) ?? null;
            map.set(id, { event: next, basedOn });
            return map;
        });
        setAdded((list) => (list.some((event) => event.id === id)
            ? list.map((event) => (event.id === id ? next : event))
            : list));
    }, [serverKind]);

    const add = useCallback((event: FlowEvent) => {
        setAdded((list) => [...list, event]);
    }, []);

    const { reload: readAgain } = snapshot;
    const reload = useCallback(() => {
        setOverlay(new Map());
        setAdded([]);
        setStampOverride(new Map());
        void readAgain();
    }, [readAgain]);

    const stampNow = useCallback(() => {
        // Olay işleyicisinden çağrılıyor — çizimde değil; saat okumak serbest.
        if (data.serverNow === null || data.deviceAt === null) return new Date().toISOString();
        return new Date(data.serverNow + (Date.now() - data.deviceAt)).toISOString();
    }, [data.serverNow, data.deviceAt]);

    const write = useCallback(async (appointmentId: string, patch: Record<string, unknown>) => {
        const fromRead = data.stamps.get(appointmentId);
        const local = stampOverride.get(appointmentId);
        const lock = local && local.from === fromRead ? local.to : fromRead;
        // DAMGASIZ yazma yok: kilidi baştan devre dışı bırakmak olurdu.
        if (!lock) return { ok: false, kind: 'stale' } as WriteOutcome;
        const outcome = await updateAppointment(appointmentId, lock, patch)
            .catch(() => ({ ok: false, kind: 'failed' } as WriteOutcome));
        if (outcome.ok && outcome.updatedAt) {
            setStampOverride((current) => new Map(current).set(appointmentId, {
                from: fromRead, to: outcome.updatedAt,
            }));
        }
        return outcome;
    }, [data.stamps, stampOverride]);

    const presence = data.presence;
    const appointmentCount = data.rows.filter((row) => row.status !== 'cancelled').length;
    const revenue = revenueOf(data.payments);
    const occupancy = occupancyOf(
        data.rows,
        data.openMinutes,
        presence.filter((person) => person.state !== 'leave').length,
    );

    const value = useMemo<ManagerDayValue>(() => ({
        events, replace, add, reload, write, stampNow,
        state: snapshot.state,
        refusal: snapshot.refusal,
        at: snapshot.at,
        stale: snapshot.stale,
        dateISO: data.dateISO,
        presence,
        appointmentCount,
        revenue,
        occupancy,
        businessName: data.businessName,
    }), [
        events, replace, add, reload, write, stampNow,
        snapshot.state, snapshot.refusal, snapshot.at, snapshot.stale,
        data.dateISO, presence, appointmentCount, revenue, occupancy, data.businessName,
    ]);
    return <ManagerDayContext.Provider value={value}>{children}</ManagerDayContext.Provider>;
}

/**
 * Sağlayıcı yoksa PATLAR — sessizce boş güne düşmez.
 *
 * Sessiz yedek, ekranın veriyi kaybettiğini gizler: müdür boş bir kasa görür
 * ve gerçekten boş sanır. Kurulum hatası kurulum anında görünmeli.
 */
export function useManagerDay(): ManagerDayValue {
    const value = useContext(ManagerDayContext);
    if (!value) throw new Error('useManagerDay: ManagerDayProvider ağacın üstünde yok');
    return value;
}
