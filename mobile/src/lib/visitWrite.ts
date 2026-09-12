/**
 * Personel 05/11 — ziyaretin YAZMA yolu.
 *
 * Ekranın karar katmanı `sendToCash.ts`te ve saf; burası o kararların
 * sunucuya dönüşmesi. Ayrı durmasının sebebi, gönderimin TEK bir uç değil iki
 * yazma olması: önce kalemler, sonra kapanış. Ekranın bu sırayı bilmesi
 * gerekmiyor.
 */

import { ApiError, api } from '../api/staff';
import { sendableOf, type AdisyonLine } from './adisyon.ts';

export interface WriteOutcome {
    /** Sunucunun hayırının kodu. `null` ise sunucu konuşmadı. */
    code: string | null;
    /** İş kuyruğa girdi — sinyal yok, sonra gidecek. */
    queued: boolean;
}

function codeOf(cause: unknown): string {
    return cause instanceof ApiError ? cause.code : 'write_failed';
}

/**
 * Adisyonu kasaya gönderir: önce kalemler, sonra kapanış.
 *
 * ── Neden İKİ yazma ─────────────────────────────────────────────────────────
 * `visit.items` adisyonu yazıyor ve iyimser kilitle korunuyor; `visit.finish`
 * ziyareti kapatıyor. Tek uçta birleştirmek, kalemleri yazıp kapanışta
 * takılan bir isteği "hiç olmamış" gibi göstermek olurdu — oysa kalemler
 * gerçekten yazıldı.
 *
 * ── YARIM adisyon gönderilmiyor ─────────────────────────────────────────────
 * Kimliği olmayan bir satır sunucuda TÜM isteği reddediyor. Onu atıp geri
 * kalanı göndermek, kasaya EKSİK bir hesap düşürmek demek — müşteri az öder
 * ve kimse fark etmez. O yüzden tek bir satır bile gönderilemiyorsa istek
 * hiç yola çıkmıyor.
 */
export async function sendVisitToCash(
    reservationId: string,
    lines: readonly AdisyonLine[],
    expectedUpdatedAt: string | null,
): Promise<WriteOutcome> {
    const { items, skipped } = sendableOf(lines);
    if (skipped > 0) return { code: 'items_unsendable', queued: false };

    let queued = false;
    try {
        const written = await api.visitItems(reservationId, items, expectedUpdatedAt);
        // Kuyruğa giren yazma `{ ok: false, queued: true }` dönüyor.
        if ((written as { queued?: boolean } | null)?.queued) queued = true;
    } catch (cause) {
        return { code: codeOf(cause), queued: false };
    }

    // Kalemler kuyrukta beklerken kapanışı göndermek, sunucuda BOŞ bir
    // adisyonun kapanması demek. Sıra korunuyor: kuyruk boşalınca ikisi de
    // kendi sırasında gidiyor.
    if (queued) return { code: null, queued: true };

    try {
        const closed = await api.visitFinish(reservationId);
        if ((closed as { queued?: boolean } | null)?.queued) return { code: null, queued: true };
    } catch (cause) {
        return { code: codeOf(cause), queued: false };
    }
    return { code: null, queued: false };
}

/**
 * İşleme başlama damgası.
 *
 * Damga önce EKRANA konuyor, sonra sunucuya gidiyor: iş gerçekten başladı ve
 * sayacın ağ cevabını beklemesi için bir sebep yok. Ama sunucu KALICI olarak
 * reddederse (403, `already_finished`) damga bir yalana dönüşüyor ve geri
 * alınması gerekiyor — geçici hatalar kuyruğa giriyor, damga duruyor.
 */
export async function startVisit(reservationId: string): Promise<WriteOutcome> {
    try {
        const started = await api.visitStart(reservationId);
        if ((started as { queued?: boolean } | null)?.queued) return { code: null, queued: true };
        return { code: null, queued: false };
    } catch (cause) {
        return { code: codeOf(cause), queued: false };
    }
}
