// Bağlantı koptuğunda sayfa-yükleme hatalarını TEK uyarıya toplayan saf
// kurallar (2026-10-23). İnternet gidince her veri kancası kendi "… yüklenemedi"
// bildirimini atıyordu: Ayarlar › Abonelik açıkken üst üste "Personel listesi
// yüklenemedi" ×2 + "Rezervasyonlar yüklenemedi" çıktı, hiçbiri sebebi
// söylemedi.
//
// Saf modül — içe aktarım yok: tests/baglanti-uyarisi.test.mjs doğrudan import
// eder. Tarayıcıya bağlayan kısım (sonner, window olayları, fetch)
// baglantiUyarisi.ts'te.

export interface FetchErrorLike {
    name?: string | null;
    message?: string | null;
    code?: string | null;
}

/** Ağ katmanının kendi metinleri: Chrome · Safari · Firefox · RN · supabase-js. */
const AG_METNI = /failed to fetch|load failed|networkerror|network request failed|failed to send a request/i;

/**
 * Okuma hatası ağdan mı (istek sunucuya hiç varmadı) yoksa sunucudan mı geldi?
 *
 * supabase-js ağ hatasını fırlatmaz, `{ message: 'TypeError: Failed to fetch',
 * code: '' }` döndürür. Sunucu cevap verdiyse `code` doludur (PGRST116, 42501 …):
 * kod varsa sunucu konuşmuştur, metin ne derse desin bu gerçek bir hatadır ve
 * kendi bildirimini verir.
 */
export function isNetworkError(err: unknown, online: boolean): boolean {
    if (!err) return false;
    if (!online) return true;
    if (typeof err !== 'object') return AG_METNI.test(String(err));
    const e = err as FetchErrorLike;
    if (e.code) return false;
    if (e.name === 'AbortError') return false;
    if (e.name === 'AuthRetryableFetchError' || e.name === 'FunctionsFetchError') return true;
    return AG_METNI.test(`${e.name ?? ''} ${e.message ?? ''}`);
}

/** offline: tarayıcı ağı yok diyor · unreachable: ağ var ama sunucuya varılamıyor. */
export type BaglantiDurumu = 'offline' | 'unreachable';

export const BAGLANTI_METNI: Record<BaglantiDurumu, string> = {
    offline: 'İnternet bağlantınız yok. Bağlanınca sayfa kendiliğinden yenilenir.',
    unreachable: 'Sunucuya ulaşılamıyor. Bağlantı düzelince sayfa kendiliğinden yenilenir.',
};

/** Sunucu yoklamaları arası bekleme: 2 sn'den başlar, ikiye katlanır, 30 sn'de durur. */
export function probeDelayMs(attempt: number): number {
    return Math.min(30_000, 2_000 * 2 ** Math.max(0, attempt));
}

/** Toparlanmadan bu kadar sonra yeni bir kopma "yeni" sayılır, yoklama baştan hızlı başlar. */
export const STABLE_MS = 60_000;

export interface BekciOrtami {
    isOnline(): boolean;
    /** Sunucuya varılabiliyor mu? (Cevabın içeriği önemsiz, gelmesi yeter.) */
    probe(): Promise<boolean>;
    show(durum: BaglantiDurumu): void;
    hide(): void;
    schedule(fn: () => void, ms: number): unknown;
    cancel(handle: unknown): void;
    now(): number;
    /** Bağlantı döndü — açık sayfanın verisi yeniden çekilir. */
    recovered(): void;
}

/**
 * Bağlantı bekçisi: kaç kanca hata verirse versin uyarı bir kez gösterilir;
 * bağlantı dönünce kalkar ve `recovered` bir kez çağrılır.
 *
 * Tarayıcının "online" olayı ağın geldiğini söyler, sunucuya varıldığını değil
 * (modem açık, hat yok). O yüzden kaldırmadan önce sunucu yoklanır; tarayıcı
 * "çevrimiçiyim" derken istekler düşüyorsa (unreachable) "online" olayı hiç
 * gelmeyeceği için yoklama artan aralıklarla kendisi tekrar eder.
 */
export function createBekci(env: BekciOrtami) {
    let durum: BaglantiDurumu | null = null;
    let muted = false;
    let attempt = 0;
    let timer: unknown = null;
    let probing = false;
    let lastRecovered = -Infinity;

    const set = (next: BaglantiDurumu) => {
        if (durum === next) return;
        durum = next;
        if (!muted) env.show(next);
    };

    const stopTimer = () => {
        if (timer !== null) env.cancel(timer);
        timer = null;
    };

    const recover = () => {
        durum = null;
        muted = false;
        stopTimer();
        lastRecovered = env.now();
        env.hide();
        env.recovered();
    };

    const scheduleProbe = () => {
        if (timer !== null || probing) return;
        timer = env.schedule(() => { timer = null; checkNow(); }, probeDelayMs(attempt));
        attempt += 1;
    };

    function checkNow() {
        if (probing) return;
        probing = true;
        void env.probe().then((ok) => {
            probing = false;
            if (durum === null) return;
            if (!env.isOnline()) { set('offline'); return; }   // "online" olayı yeniden tetikler
            if (ok) { recover(); return; }
            set('unreachable');
            scheduleProbe();
        });
    }

    return {
        /** Bir sayfa-yükleme isteği ağ yüzünden düştü. */
        networkError() {
            if (!env.isOnline()) { stopTimer(); set('offline'); return; }
            if (durum === null && env.now() - lastRecovered > STABLE_MS) attempt = 0;
            set('unreachable');
            scheduleProbe();
        },
        /** Tarayıcı "offline" dedi: istek düşmesini beklemeden söyle. */
        wentOffline() {
            stopTimer();
            set('offline');
        },
        /** Tarayıcı "online" dedi: sunucuya varılıyorsa kaldır. */
        cameOnline() {
            attempt = 0;
            if (durum === null) return;
            stopTimer();
            checkNow();
        },
        /** Kullanıcı uyarıyı kendisi kapattı: bu kopma boyunca bir daha açma. */
        userDismissed() {
            if (durum !== null) muted = true;
        },
        /** Veri gösteren sayfa kalmadı (çıkış): uyarıyı sessizce kaldır. */
        reset() {
            const wasDown = durum !== null;
            durum = null;
            muted = false;
            attempt = 0;
            stopTimer();
            if (wasDown) env.hide();
        },
        get durum() { return durum; },
    };
}
