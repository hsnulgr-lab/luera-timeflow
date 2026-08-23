/**
 * Müdür 16 — randevu oluşturuldu onayının karar katmanı. Saf, React'siz.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 16 Randevu Onayi.html`.
 *
 * Ekranın işi üç adımda: önce "oldu" der, sonra ne olduğunu gösterir, sonra
 * tek bir sonraki adım sunar — müşteriye mesaj. Kimse dokunmazsa 7 saniyede
 * kendi kapanır.
 */

// Uzantı AÇIK: kök testleri bu dosyayı Node ile doğrudan içe aktarıyor.
import { formatDayLong, toMinutes, type Appt } from './calendar.ts';
import { formatPrice, maskPhone } from './createFlow.ts';

/** Onay ekranının hâlleri. Tasarımın A/B/C/D/E harfleriyle aynı. */
export type ConfirmState = 'idle' | 'sending' | 'sent' | 'failed';

/** Geri sayım: 7 saniye, iki kapak 3,5'er saniye. */
export const COUNTDOWN_MS = 7000;
export const HALF_MS = COUNTDOWN_MS / 2;
/** Mesaj gönderildikten sonraki kısa sayım. */
export const SENT_COUNTDOWN_MS = 3500;

/**
 * Halkanın iki kapağının açısı.
 *
 * Tam turuncu halka statik duruyor; üstündeki iki yarım kapak onu örterek
 * tüketiyor. Sağ kapak −180°'de görünmez, 0°'de sağ yarıyı tamamen örter
 * (12'den 6'ya). Sol kapak 0°'de dışarıda, 180°'de sol yarıyı örter.
 *
 * `stroke-dashoffset` kullanılmadı: `react-native-svg`'de o özellik native
 * sürücüde animasyonlanmıyor, her kareyi köprüden geçiriyor. `rotate` ise
 * doğrudan native katmanda.
 */
export function coverAngles(elapsedMs: number, totalMs = COUNTDOWN_MS): {
    right: number; left: number;
} {
    const half = totalMs / 2;
    const first = clamp01(elapsedMs / half);
    const second = clamp01((elapsedMs - half) / half);
    return { right: -180 + 180 * first, left: 180 * second };
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

/** Kalan tam saniye — yalnız "hareketi azalt" açıkken ekranda yazılır. */
export function secondsLeft(elapsedMs: number, totalMs = COUNTDOWN_MS): number {
    return Math.max(0, Math.ceil((totalMs - elapsedMs) / 1000));
}

/**
 * Sayaç yalnız BEKLEMEDE, NUMARASIZ ve GÖNDERİLDİ hâllerinde işler.
 *
 * Gönderilirken durur (müdür bir şey yaptı, ekran onu aceleye getirmez),
 * hatada hiç çalışmaz (hata kendi kendine kaybolmaz), ekran okuyucu açıkken
 * tamamen durur — 7 saniye de 15 saniye de rastgele bir tahmin, sıfır tahmin
 * daha dürüst.
 */
export function countdownRuns(input: {
    state: ConfirmState;
    screenReader: boolean;
    foreground: boolean;
}): boolean {
    if (input.screenReader || !input.foreground) return false;
    return input.state === 'idle' || input.state === 'sent';
}

/** O hâlde sayım kaç milisaniye sürer? */
export function countdownFor(state: ConfirmState): number {
    return state === 'sent' ? SENT_COUNTDOWN_MS : COUNTDOWN_MS;
}

// ── Metinler ────────────────────────────────────────────────────────────────

export interface ConfirmCopy {
    title: string;
    subtitle: string | null;
    primary: string;
    secondary: string;
    note: string | null;
}

export function confirmCopy(state: ConfirmState, hasPhone: boolean): ConfirmCopy {
    switch (state) {
        case 'sending':
            return {
                title: 'Randevu oluşturuldu',
                subtitle: 'Sayım durdu — mesaj gönderiliyor.',
                primary: 'Gönderiliyor',
                secondary: 'Kapat',
                note: 'Mesaj arka planda gider; kapatabilirsiniz.',
            };
        case 'sent':
            return {
                title: 'Mesaj gönderildi',
                subtitle: null,
                primary: 'Bitti',
                secondary: '',
                note: '3 saniye sonra Akış’a döner.',
            };
        case 'failed':
            return {
                title: 'Mesaj gönderilemedi',
                subtitle: 'Bağlantı kurulamadı. Mesaj gitmedi.',
                primary: 'Tekrar dene',
                secondary: 'Sonra',
                note: 'Bu ekran kendi kapanmaz.',
            };
        default:
            return {
                title: 'Randevu oluşturuldu',
                subtitle: null,
                primary: 'Randevu mesajı gönder',
                secondary: 'Kapat',
                note: hasPhone
                    ? 'Beklemezseniz de olur — sayım bitince Akış’a döner.'
                    : 'Sayım bitince Akış’a döner.',
            };
    }
}

/** Numarası olmayan müşteriye mesaj gidemez; sebep KELİMEYLE yazılır. */
export const NO_PHONE_REASON = 'Numara yok, mesaj gönderilemez.';

/**
 * MESAJ GÖNDERME HENÜZ BAĞLI DEĞİL.
 *
 * Mesaj sunucudan gidecek; mobilde müdür API'si yok. Buton bu yüzden pasif
 * ve sebebini söylüyor. Basıp hiçbir şey olmaması ya da sahte bir
 * "gönderildi" ekranı göstermek yerine ekran ne olduğunu yazıyor.
 *
 * Uç yazıldığında burası `true` olacak; C, D ve E hâlleri zaten tasarlandı ve
 * uygulandı, başka hiçbir şey değişmeyecek.
 */
export const MESSAGING_READY = false;
export const MESSAGING_PENDING_REASON = 'Mesaj gönderme henüz açık değil.';

/** Birincil buton basılabilir mi, ve değilse sebebi ne? */
export function sendGate(state: ConfirmState, hasPhone: boolean): {
    enabled: boolean; reason: string | null;
} {
    if (state === 'failed') return { enabled: true, reason: null };
    if (state !== 'idle') return { enabled: false, reason: null };
    if (!hasPhone) return { enabled: false, reason: NO_PHONE_REASON };
    if (!MESSAGING_READY) return { enabled: false, reason: MESSAGING_PENDING_REASON };
    return { enabled: true, reason: null };
}

/**
 * Salon adı. Sunucudan işletme bilgisi ucu gelene kadar tek kaynak burası;
 * mesajın imzası buradan çıkıyor.
 */
export const SALON_NAME = 'Luera Kuaför';

/** Müşteriye gidecek metnin önizlemesi. Ekranda ne yazdığını müdür görür. */
export function messageText(appointment: Appt, staffName: string, salon: string): string {
    const day = formatDayLong(appointment.date);
    const start = appointment.start_time.slice(0, 5);
    return `Randevunuz oluşturuldu: ${day} ${start}, ${appointment.service}, ${staffName}. ${salon}.`;
}

// ── Kartın bantları ─────────────────────────────────────────────────────────

/** "11:00 – 12:15" — kartın 32 pt'lik saat satırı. */
export function rangeText(appointment: Appt): string {
    return `${appointment.start_time.slice(0, 5)} – ${appointment.end_time.slice(0, 5)}`;
}

/** "75 dk" — hizmet bandının süresi, randevunun kendisinden çıkar. */
export function durationText(appointment: Appt): string {
    return `${toMinutes(appointment.end_time) - toMinutes(appointment.start_time)} dk`;
}

/** Kartın telefon alanı boş bırakılmaz: boşluk "yüklenmedi mi?" sorusu doğurur. */
export function phoneText(appointment: Appt): { text: string; missing: boolean } {
    return appointment.customer_phone
        ? { text: maskPhone(appointment.customer_phone), missing: false }
        : { text: 'numara yok', missing: true };
}

export function priceText(price: number | null): string | null {
    return price === null ? null : formatPrice(price);
}

// ── Sesli okuma ─────────────────────────────────────────────────────────────
//
// Her hâl BİR KEZ duyurulur. Geri sayım hiç okunmaz.

export function confirmSpeech(input: {
    state: ConfirmState;
    appointment: Appt;
    staffName: string;
    hasPhone: boolean;
}): string {
    const { appointment, staffName } = input;
    const when = `${formatDayLong(appointment.date)}, ${appointment.start_time.slice(0, 5)}'dan `
        + `${appointment.end_time.slice(0, 5)}'e`;

    switch (input.state) {
        case 'sending':
            return 'Mesaj gönderiliyor.';
        case 'sent':
            return `Mesaj gönderildi. ${appointment.customer_name}'a randevu bilgisi iletildi.`;
        case 'failed':
            return `Mesaj gönderilemedi. Randevu duruyor: ${when}, ${staffName}. `
                + 'Tekrar deneyebilirsiniz.';
        default: {
            const base = `Randevu oluşturuldu. ${when}, ${appointment.service}, `
                + `${staffName} yapacak. ${appointment.customer_name}.`;
            return input.hasPhone ? base : `${base} Müşterinin numarası kayıtlı değil, mesaj gönderilemiyor.`;
        }
    }
}

/** "Randevu duruyor" şeridinin metni — hatada müdürün ilk korkusunu keser. */
export function stillBookedLine(appointment: Appt, staffName: string): string {
    return `${formatDayLong(appointment.date)} ${rangeText(appointment)} · ${staffName}`;
}
