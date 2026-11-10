// Müşteri nereden geldi? — Kaynak Defteri'nin anahtar listesi (tek kaynak).
//
// Anahtarlar veritabanında CHECK ile sabit (supabase/135_nereden.sql) ve
// sunucu kopyası supabase/functions/_shared/booking/nereden.ts'te. Üçü
// tests/nereden.test.mjs ile eşlenir: birine anahtar ekleyip ötekini
// unutmak, seçilen değerin kaydı reddetmesi demek.
//
// Arayüzde "Kaynak" denmez (güzellik ve takvimde kabin/oda demek): "Nereden".
//
// Saf modül: testler doğrudan import eder, `@/` alias'ı kullanılmaz.

export const NEREDEN_KEYS = [
    'instagram', 'facebook', 'tiktok', 'google', 'google_maps',
    'web_sitesi', 'tavsiye', 'yoldan', 'diger',
] as const;

export type NeredenKey = typeof NEREDEN_KEYS[number];

export const NEREDEN_LABEL: Record<NeredenKey, string> = {
    instagram: 'Instagram',
    facebook: 'Facebook',
    tiktok: 'TikTok',
    google: 'Google arama',
    google_maps: 'Google Haritalar',
    web_sitesi: 'Web sitesi',
    tavsiye: 'Tavsiye',
    yoldan: 'Yoldan geçerken',
    diger: 'Diğer',
};

export const NEREDEN_BOS = 'Belirtilmemiş';

export function isNeredenKey(x: unknown): x is NeredenKey {
    return typeof x === 'string' && (NEREDEN_KEYS as readonly string[]).includes(x);
}

export function neredenLabel(k?: string | null): string {
    return isNeredenKey(k) ? NEREDEN_LABEL[k] : NEREDEN_BOS;
}
