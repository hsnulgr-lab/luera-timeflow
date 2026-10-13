/**
 * BEKLEME BİTTİ bildirimi — saf karar katmanı (2026-10-13).
 *
 * Kullanıcı: "Bekleme süresi dolunca bildirim gelsin." Boya beklerken başka
 * müşteriye geçilmiş oluyor; kumanda ekranda değil, telefon tezgâhta.
 *
 * ── Neden telefonun KENDİ bildirimi, sunucunun değil ───────────────────────
 * Sunucuda zamanlayıcı yok (`pg_cron` kurulu değil; bildirim kararları §6).
 * Beklemeyi kuran telefon bitiş anını zaten biliyor: bildirimi O ANA kuruyor.
 * İnternetsiz de çalışıyor (kumanda bodrum katında da açılıyor) ve tam
 * saatinde düşüyor. Bekleme kaldırılınca ya da iş bitince bildirim siliniyor;
 * yeni bekleme aynı kimlikle eskisinin yerine geçiyor.
 *
 * ── Kilit ekranı ───────────────────────────────────────────────────────────
 * Yalnız İLK AD (bildirim kararı 2: telefon tezgâhta, ekran herkese açık).
 *
 * Saf — Expo taşımıyor; cihaz tarafı `waitAlarmDevice.ts`.
 */

/** Randevu başına tek bildirim: yeni bekleme eskisinin yerine geçiyor. */
export function waitAlarmId(reservationId: string): string {
    return `bekleme-${reservationId}`;
}

export interface WaitAlarmText {
    title: string;
    body: string;
}

/** "Tuğçe · Kalıcı Makyaj · 20 dk doldu" — ilk ad, hizmet, süre. */
export function waitAlarmText(input: { customerName: string; service: string; minutes: number }): WaitAlarmText {
    const first = input.customerName.trim().split(/\s+/)[0] || 'Müşteri';
    const parts = [first, input.service.trim(), `${input.minutes} dk doldu`].filter(Boolean);
    return { title: 'Bekleme bitti ⏱', body: parts.join(' · ') };
}

/**
 * Bildirim kurulur mu: bitiş GELECEKTE olmalı. Geçmişe kurulan bildirim
 * hemen düşerdi — beklemesi zaten bitmiş bir iş için "bitti" demek, ekranda
 * gördüğünü ikinci kez söylemek.
 */
export function waitAlarmDue(endsAt: number, nowMs: number): boolean {
    return Number.isFinite(endsAt) && endsAt - nowMs >= 1000;
}
