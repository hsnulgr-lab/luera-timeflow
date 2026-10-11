/**
 * Beklemenin BU TELEFONDAKİ son hâli — kumanda ile Gün arasında (112 · v4 G3).
 *
 * Bekleme sunucuya yazılıyor (`visit.wait`), ama sinyal yokken yazma düşer ve
 * kumandanın halkası yine de dönmeli: kumanda sık sık bodrum katında açılıyor
 * ve bekleme bugüne kadar internetsiz çalışıyordu. O durumda Gün ekranı
 * sunucudan okuyarak beklemeyi göremezdi; aynı telefonda az önce kurulmuş bir
 * beklemeyi "SÜRÜYOR" diye göstermek, onu yok saymak olurdu.
 *
 * Kumanda son niyetini buraya da yazıyor, Gün önce buna bakıyor:
 *   kurulan bekleme     → { endsAt, minutes }
 *   kaldırılan bekleme  → null (sunucuda hâlâ duruyor olsa bile bu telefon
 *                         onu kaldırdı ve kaldırma birazdan oraya da gider)
 * Kayıt yoksa söz sunucunun.
 *
 * Bellekte tutuluyor, diske yazılmıyor: uygulama kapanınca söz yine
 * sunucunun. Saf — React ve Expo taşımıyor, Node testleri doğrudan okuyor.
 */

export interface WaitIntent {
    /** Bitiş anı, ms. Sunucunun cevabı gelince onun saatine çekiliyor. */
    endsAt: number;
    minutes: number;
}

const intents = new Map<string, WaitIntent | null>();

/** Kumanda bekleme kurunca ya da kaldırınca. */
export function rememberWait(reservationId: string, intent: WaitIntent | null): void {
    intents.set(reservationId, intent);
}

/**
 * `undefined`: bu telefonda bir niyet yok, sunucuya bakılır.
 * `null`: bu telefon beklemeyi kaldırdı.
 */
export function waitIntentOf(reservationId: string): WaitIntent | null | undefined {
    return intents.has(reservationId) ? intents.get(reservationId) ?? null : undefined;
}

/** Testler için: bir önceki testin niyeti sonrakine sızmasın. */
export function clearWaitIntents(): void {
    intents.clear();
}

/**
 * Süren işin GEÇERLİ beklemesi: telefonun niyeti varsa o, yoksa sunucunun
 * damgası. Bitmiş bekleme bekleme değil — `null`.
 */
export function activeWait(
    row: { wait_ends_at?: string | null; wait_minutes?: number | null },
    local: WaitIntent | null | undefined,
    nowMs: number,
): WaitIntent | null {
    const chosen = local !== undefined
        ? local
        : row.wait_ends_at && row.wait_minutes
            ? { endsAt: Date.parse(row.wait_ends_at), minutes: row.wait_minutes }
            : null;
    if (!chosen || !Number.isFinite(chosen.endsAt) || chosen.endsAt <= nowMs) return null;
    return chosen;
}
