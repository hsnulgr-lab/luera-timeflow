// Müşteri nereden geldi? — online randevu sayfasının izinden kanal çıkarma.
//
// Sayfa (src/pages/public/neredenIzi.ts) yalnız ham izi toplar: utm_*,
// tıklama kimlikleri, yönlendiren alan adı, uygulama içi tarayıcı. Burada
// temizlenir ve tek bir anahtara indirilir; karar sunucuda, çünkü anonim uca
// gelen her alan uydurulabilir.
//
// Sıra önemli: salonun kendi etiketi (?n=) her şeyi yener — Google Haritalar
// tıklaması yönlendiren adresten aramayla ayırt EDİLEMEZ, ancak salon
// İşletme Profili'ne ?n=google_maps koyarsa bilinir. fbclid "reklam"
// demek DEĞİL: Meta her dış bağlantıya ekler.
//
// Anahtar listesi src/lib/nereden.ts ve supabase/135_nereden.sql ile AYNI
// (tests/nereden.test.mjs). Saf modül, importsuz.

export const NEREDEN_KEYS = [
    'instagram', 'facebook', 'tiktok', 'google', 'google_maps',
    'web_sitesi', 'tavsiye', 'yoldan', 'diger',
] as const;

export type NeredenKey = typeof NEREDEN_KEYS[number];

export interface Attribution {
    n?: NeredenKey;
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
    landed_at?: string;
    embed?: true;
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
const CLICK_KEYS = ['fbclid', 'gclid', 'gbraid', 'wbraid', 'ttclid'] as const;
const UA_APPS = ['instagram', 'facebook', 'tiktok'] as const;
const PAID_MEDIUMS = new Set(['cpc', 'ppc', 'paid', 'paid_social', 'paidsocial', 'ads', 'ad', 'cpm', 'display']);
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

function isKey(x: unknown): x is NeredenKey {
    return typeof x === 'string' && (NEREDEN_KEYS as readonly string[]).includes(x);
}

/** Kontrol karakterlerini atar, kırpar; boşsa undefined. */
function cleanText(x: unknown, max: number): string | undefined {
    if (typeof x !== 'string') return undefined;
    // deno-lint-ignore no-control-regex
    // eslint-disable-next-line no-control-regex
    const s = x.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
    return s || undefined;
}

/**
 * Anonim uçtan gelen izi beyaz listeyle temizler. Bilinmeyen alan düşer,
 * uzun metin kırpılır, biçimi bozuk kimlik/alan adı/tarih atılır.
 * Geriye bir şey kalmazsa null.
 */
export function sanitizeAttribution(raw: unknown, now: Date = new Date()): Attribution | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const out: Attribution = {};

    if (isKey(r.n)) out.n = r.n;
    for (const k of UTM_KEYS) {
        const v = cleanText(r[k], 100);
        if (v) out[k] = v;
    }
    for (const k of CLICK_KEYS) {
        const v = r[k];
        if (typeof v === 'string' && /^[\w.~-]{1,255}$/.test(v)) out[k] = v;
    }
    if (typeof r.ref_host === 'string') {
        const h = r.ref_host.trim().toLowerCase();
        if (/^[a-z0-9.-]{1,253}$/.test(h)) out.ref_host = h;
    }
    if (typeof r.ua_app === 'string' && (UA_APPS as readonly string[]).includes(r.ua_app)) {
        out.ua_app = r.ua_app as Attribution['ua_app'];
    }
    if (typeof r.landed_at === 'string') {
        const t = Date.parse(r.landed_at);
        const n = now.getTime();
        if (Number.isFinite(t) && t <= n + CLOCK_SKEW_MS && t >= n - MAX_AGE_MS) {
            out.landed_at = new Date(t).toISOString();
        }
    }
    if (r.embed === true) out.embed = true;

    return Object.keys(out).length ? out : null;
}

const isInstagramHost = (h: string) =>
    h === 'instagram.com' || h.endsWith('.instagram.com') || h === 'com.instagram.android';

/** Yönlendiren alan adından (ya da android-app paketinden) kanal. */
function originFromHost(h: string): NeredenKey {
    if (isInstagramHost(h)) return 'instagram';
    if (h === 'facebook.com' || h.endsWith('.facebook.com') || h === 'fb.com' || h === 'fb.me'
        || h === 'com.facebook.katana' || h === 'com.facebook.lite') return 'facebook';
    if (h === 'tiktok.com' || h.endsWith('.tiktok.com')
        || h === 'com.zhiliaoapp.musically' || h === 'com.ss.android.ugc.trill') return 'tiktok';
    if (h.startsWith('maps.google.') || h === 'com.google.android.apps.maps' || h === 'maps.app.goo.gl') {
        return 'google_maps';
    }
    if (/(^|\.)google\.[a-z.]+$/.test(h) || h === 'com.google.android.googlequicksearchbox') return 'google';
    if (h === 'com.whatsapp' || h === 'wa.me' || h.endsWith('whatsapp.com')) return 'diger';
    // Tanınmayan bir site: çoğunlukla salonun kendi sitesi. Alan adı meta'da kalır.
    return 'web_sitesi';
}

/** utm_source eş adlarından kanal. */
function originFromUtm(src: string, medium: string, igHint: boolean): NeredenKey {
    if (['ig', 'insta', 'instagram'].includes(src)) return 'instagram';
    if (['fb', 'facebook', 'meta'].includes(src)) return igHint ? 'instagram' : 'facebook';
    if (['tt', 'tiktok'].includes(src)) return 'tiktok';
    if (['gbp', 'gmb', 'google_maps', 'googlemaps', 'maps'].includes(src)) return 'google_maps';
    if (['google', 'adwords', 'gads', 'googleads'].includes(src)) {
        return ['maps', 'gbp', 'gmb', 'local'].includes(medium) ? 'google_maps' : 'google';
    }
    if (['web', 'website', 'site', 'web_sitesi'].includes(src)) return 'web_sitesi';
    return isKey(src) ? src : 'diger';
}

/** Temizlenmiş izden tek kanal; hiçbir ipucu yoksa null. */
export function deriveOrigin(a: Attribution): NeredenKey | null {
    const igHint = a.ua_app === 'instagram' || (!!a.ref_host && isInstagramHost(a.ref_host));

    if (a.n) return a.n;
    const src = a.utm_source?.toLowerCase();
    if (src) return originFromUtm(src, a.utm_medium?.toLowerCase() ?? '', igHint);
    if (a.gclid || a.gbraid || a.wbraid) return 'google';
    if (a.ttclid) return 'tiktok';
    if (a.fbclid) return igHint ? 'instagram' : 'facebook';
    if (a.ua_app) return a.ua_app;
    if (a.ref_host) return originFromHost(a.ref_host);
    if (a.embed) return 'web_sitesi';
    return null;
}

/** Ücretli tıklama mı? Google tıklama kimliği ya da ücretli utm_medium. */
export function isPaid(a: Attribution): boolean {
    if (a.gclid || a.gbraid || a.wbraid) return true;
    const m = a.utm_medium?.toLowerCase();
    return !!m && PAID_MEDIUMS.has(m);
}

/** origin_meta sütununa yazılan biçim. `v`: BrandFlow için şema sürümü. */
export function attributionMeta(a: Attribution): Attribution & { paid: boolean; v: 1 } {
    return { ...a, paid: isPaid(a), v: 1 };
}
