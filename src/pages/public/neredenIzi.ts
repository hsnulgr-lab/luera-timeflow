// Online randevu sayfası: müşteri nereden geldi? — ham iz toplayıcı.
//
// Sayfa yalnız izi toplar ve 30 gün hatırlar; kanala karar SUNUCUDA verilir
// (supabase/functions/_shared/booking/nereden.ts). Pazartesi reklamı görüp
// perşembe randevu alan müşteri yine reklamdan sayılsın diye iz slug başına
// saklanır; yeni bir izli ziyaret eskisini ezer (son tıklama).
//
// Gizlilik: yönlendiren adresin yalnız alan adı alınır (tam URL değil),
// tarayıcı kimliğinden yalnız "Instagram / Facebook / TikTok uygulaması içi"
// bilgisi çıkarılır, ham metin gönderilmez.
//
// Saf modül: storage dışarıdan verilir, tests/nereden.test.mjs node'da sınar.

export interface NeredenSignals {
    n?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    fbclid?: string;
    gclid?: string;
    gbraid?: string;
    wbraid?: string;
    ttclid?: string;
    ref_host?: string;
    ua_app?: 'instagram' | 'facebook' | 'tiktok';
    embed?: true;
}

export type StoredAttribution = NeredenSignals & { landed_at: string };

const PARAM_KEYS = [
    'n', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'fbclid', 'gclid', 'gbraid', 'wbraid', 'ttclid',
] as const;

export const NEREDEN_STORE_PREFIX = 'tf-nereden:';
export const NEREDEN_TTL_DAYS = 30;

function hostOf(ref: string): string | undefined {
    if (!ref) return undefined;
    try {
        // android-app://com.instagram.android/ de host verir.
        const h = new URL(ref).host.toLowerCase();
        return h || undefined;
    } catch {
        return undefined;
    }
}

function uaApp(ua: string): NeredenSignals['ua_app'] {
    if (/Instagram/.test(ua)) return 'instagram';
    if (/FBAN|FBAV|FB_IAB/.test(ua)) return 'facebook';
    if (/BytedanceWebview|musical_ly|TikTok/i.test(ua)) return 'tiktok';
    return undefined;
}

/** Adres satırı + yönlendiren + tarayıcıdan ham iz. */
export function readSignals(input: {
    search: string;
    referrer: string;
    userAgent: string;
    selfHost: string;
    embed: boolean;
}): NeredenSignals {
    const out: NeredenSignals = {};
    const params = new URLSearchParams(input.search);
    for (const k of PARAM_KEYS) {
        const v = params.get(k)?.trim();
        if (v) out[k] = v.slice(0, 255);
    }
    const ref = hostOf(input.referrer);
    if (ref && ref !== input.selfHost.toLowerCase()) out.ref_host = ref;
    const app = uaApp(input.userAgent);
    if (app) out.ua_app = app;
    if (input.embed) out.embed = true;
    return out;
}

/** Gömülü olmak tek başına iz sayılmaz: kayıtlı izi ezmesin. */
function hasRealSignal(s: NeredenSignals): boolean {
    return Object.keys(s).some((k) => k !== 'embed');
}

/**
 * Bu ziyaretin izini hatırla ya da hatırlananı getir. Gerçek iz varsa
 * saklanır ve döner; yoksa süresi geçmemiş kayıt döner; o da yoksa yalnız
 * gömülü bilgisi (ya da null). Depolama kapalıysa (gizli sekme) sessizce geçer.
 */
export function rememberAttribution(
    slug: string,
    signals: NeredenSignals,
    storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
    now: Date = new Date(),
): StoredAttribution | null {
    const key = NEREDEN_STORE_PREFIX + slug;
    const landed = now.toISOString();

    if (hasRealSignal(signals)) {
        const value: StoredAttribution = { ...signals, landed_at: landed };
        try { storage?.setItem(key, JSON.stringify(value)); } catch { /* kota / gizli kip */ }
        return value;
    }

    try {
        const raw = storage?.getItem(key);
        if (raw) {
            const saved = JSON.parse(raw) as StoredAttribution;
            const age = now.getTime() - Date.parse(saved.landed_at);
            if (Number.isFinite(age) && age >= 0 && age <= NEREDEN_TTL_DAYS * 86_400_000) {
                return signals.embed ? { ...saved, embed: true } : saved;
            }
            storage?.removeItem(key);
        }
    } catch { /* bozuk kayıt ya da erişim yok */ }

    return signals.embed ? { embed: true, landed_at: landed } : null;
}
