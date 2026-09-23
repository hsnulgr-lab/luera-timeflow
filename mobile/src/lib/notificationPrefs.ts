import type { NotificationKey } from './managerProfile.ts';

/**
 * Müdürün bildirim tercihleri — saf çeviri katmanı, React'siz.
 *
 * `settings.notification_prefs` (105) bir JSONB nesnesi:
 * `{"booked": true, "cancelled": false, "cash": true}`.
 *
 * ── EKSİK ANAHTAR AÇIK DEMEK ────────────────────────────────────────────────
 * Sunucudaki kural da bu (`send-push` · tercih kapısı): anahtar yoksa ya da
 * tercih okunamıyorsa GÖNDERİLİYOR. Burada aynı kuralı tekrarlamak zorundayız
 * — ekran "kapalı" derken sunucu gönderirse, ikisinden biri yalan söylüyor
 * demektir ve kullanıcı hangisine inanacağını bilemez.
 *
 * Bir şema boşluğunun bütün salonu sessize alması, birkaç fazla bildirimden
 * kötü. Yokluk "kapalı" demek değil.
 */

/** Hiçbir tercih yazılmamışken geçerli olan — sunucunun fail-open'ı ile AYNI. */
export const PREF_DEFAULT = true;

export type NotificationPrefs = Record<NotificationKey, boolean>;

/**
 * Ham JSONB → ekranın okuduğu kayıt.
 *
 * Nesne değilse, kolon yoksa ya da değer boolean değilse anahtar AÇIK sayılıyor.
 * `null` DÖNMÜYOR: "okunamadı" hâli bu katmanın işi değil, `useManagerRead`ın
 * `state`/`refusal` alanları onu ayrı taşıyor. İkisini karıştırmak, bir ağ
 * hatasını kullanıcının kararı gibi göstermek olurdu.
 */
export function prefsOf(raw: unknown, keys: readonly NotificationKey[]): NotificationPrefs {
    const source = raw !== null && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const out = {} as NotificationPrefs;
    for (const key of keys) {
        out[key] = typeof source[key] === 'boolean' ? source[key] as boolean : PREF_DEFAULT;
    }
    return out;
}

/**
 * Yazılacak JSONB gövdesi.
 *
 * BİLİNMEYEN ANAHTARLAR KORUNUYOR. Gövdeyi sıfırdan kurmak, ileride eklenen
 * (ya da masaüstünün yazdığı) bir anahtarı sessizce silmek olurdu — çalışma
 * saatlerinde tam bunu yaşadık (`settingsMap` · `workingHoursOf`).
 */
export function prefsPatchOf(
    raw: unknown,
    key: NotificationKey,
    value: boolean,
): Record<string, unknown> {
    const source = raw !== null && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    return { ...source, [key]: value };
}

/**
 * "Hepsi kapalı" mı — altyazının ve özet satırının kullandığı tek soru.
 *
 * Ayrı bir ana anahtar yok: üçü de kapalıysa bildirim gelmez, bu zaten aynı
 * şey. İki yerden kapatılabilen bir şey, iki yerden çelişebilir.
 */
export function allOff(prefs: NotificationPrefs, keys: readonly NotificationKey[]): boolean {
    return keys.every((key) => prefs[key] === false);
}
