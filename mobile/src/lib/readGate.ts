/**
 * Arka plan okumalarının KAPISI (Hız 2 · 2026-11-12). Saf — React yok,
 * react-native yok; testte gerçekten çalıştırılarak sınanıyor.
 *
 * ── Neden var ────────────────────────────────────────────────────────────────
 * Org'daki her rezervasyon güncellemesi her telefonda bir zil çaldırıyor.
 * Başka bir personelin kalem otomatik kaydı (`ITEMS_SAVE_MS` ≈ 0,7 sn) bir
 * yazışma boyunca saniyede bir zil demek; `liveSignal`'in 300 ms'lik
 * penceresi bunları TEK pencereye indiriyor ama 0,7 sn arayla gelenleri
 * ayrı ayrı geçiriyor. Her biri bu telefonda bir `agenda` + bir dosya
 * okuması açıyordu — ve önceki okuma daha dönmeden ikincisi başlıyordu.
 *
 * İki kural:
 *   • Zil SUSANA kadar bekle (`RING_QUIET_MS`, sondan sayılır). Ama sonsuza
 *     dek değil: zil hiç susmazsa `RING_MAX_WAIT_MS` dolunca yine oku —
 *     yoksa durmadan yazan bir meslektaş bu ekranı DONDURURDU.
 *   • Süren bir okuma varken ikincisini AÇMA. Arada bir istek geldiyse
 *     okuma bitince BİR KEZ daha oku: o istek okumanın başlamasından SONRA
 *     gelmiş olabilir ve cevabı onu içermeyebilir.
 *
 * Görünür okumalar (açılış, "tekrar dene") bu kapıdan GEÇMİYOR: kullanıcı
 * bir cevap bekliyor, onu ertelemek yanlış olurdu.
 */

/** Zilin susmuş sayıldığı süre. Kalem otomatik kaydının (0,7 sn) üstünde. */
export const RING_QUIET_MS = 800;

/** Zil hiç susmasa da en geç bu kadar sonra okunur. */
export const RING_MAX_WAIT_MS = 2500;

/**
 * Odağa dönüşte "az önce okundu" sayılan süre.
 *
 * Ekran ilk açıldığında açılış okuması ile odak okuması aynı anda
 * başlıyordu: aynı veri için iki istek. Bu süre içinde başlamış bir okuma
 * varsa odak okuması atlanıyor — ama ekran odakta değilken bir değişiklik
 * kaçırıldıysa (`dirty`) asla atlanmıyor.
 */
export const JUST_READ_MS = 1500;

export interface ReadGate {
    /** Canlı zil: susmasını bekle, sonra oku. */
    ring: () => void;
    /** Hemen oku (yoklama, öne dönüş, odak) — süren okuma varsa ardına ekle. */
    fire: () => void;
    /** Bekleyen zili ve "bir kez daha" işaretini bırak (ekran kapanıyor). */
    cancel: () => void;
    /** Şu an bir okuma sürüyor mu — testler için. */
    busy: () => boolean;
    /**
     * Okuma fonksiyonunu değiştir (gün ya da kimlik değişti). Kapı aynı
     * kalıyor: bekleyen zil ve süren okuma kaybolmuyor.
     */
    retarget: (next: () => unknown) => void;
}

export interface GateTimers {
    now: () => number;
    set: (fn: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
}

const realTimers: GateTimers = {
    now: () => Date.now(),
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function readGate(
    run: () => unknown,
    timers: GateTimers = realTimers,
    quietMs: number = RING_QUIET_MS,
    maxWaitMs: number = RING_MAX_WAIT_MS,
): ReadGate {
    let timer: unknown = null;
    let firstRingAt: number | null = null;
    let inflight = false;
    let again = false;

    const clearRing = () => {
        if (timer !== null) timers.clear(timer);
        timer = null;
        firstRingAt = null;
    };

    const fire = () => {
        // Hemen okuma bekleyen zili de karşılıyor.
        clearRing();
        if (inflight) { again = true; return; }
        inflight = true;
        let pending: Promise<unknown>;
        try {
            pending = Promise.resolve(run());
        } catch (cause) {
            pending = Promise.reject(cause);
        }
        void pending
            .catch(() => undefined)
            .then(() => {
                inflight = false;
                if (!again) return;
                again = false;
                fire();
            });
    };

    const ring = () => {
        const now = timers.now();
        if (firstRingAt === null) firstRingAt = now;
        const waited = now - firstRingAt;
        const wait = Math.max(0, Math.min(quietMs, maxWaitMs - waited));
        if (timer !== null) timers.clear(timer);
        timer = timers.set(() => { timer = null; firstRingAt = null; fire(); }, wait);
    };

    return {
        ring,
        fire,
        cancel: () => { clearRing(); again = false; },
        busy: () => inflight,
        retarget: (next) => { run = next; },
    };
}

/**
 * Odağa dönüşte okunsun mu?
 *
 * Kaçırılan bir şey varsa (`dirty`) her zaman. Yoksa az önce başlamış bir
 * okuma (açılış) varken ikinci kez gitme.
 */
export function focusNeedsRead(lastReadAt: number | null, now: number, dirty: boolean): boolean {
    if (dirty) return true;
    if (lastReadAt === null) return true;
    return now - lastReadAt >= JUST_READ_MS;
}
