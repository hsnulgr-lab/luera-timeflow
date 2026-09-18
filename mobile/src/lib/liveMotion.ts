/**
 * Canlı değişimin hareket kuralları — saf, React'siz.
 *
 * Kaynak: `Downloads/finalssooo/B-canli-degisim.html`. Tasarımdan YALNIZ şu
 * kısım alındı (kullanıcı kararı, 2026-09-18):
 *   • Kaydırma sabitleme — üste eklenen satır parmağın altındaki kartı
 *     oynatmaz (ScrollView `maintainVisibleContentPosition`).
 *   • Parmak ekrandayken, satırların yüksekliğini değiştiren tazeleme bekler;
 *     parmak kalkınca 120 ms sonra, en geç 2 sn'de uygulanır.
 *   • Yeni satır yerinde belirir, giden satır söner ve yeri sonra kapanır,
 *     30 dk kuralıyla düşen kart soluk satır olarak belirir.
 *   • Tek tazelemede 4+ satır değiştiyse hiçbiri hareket etmez.
 *
 * ALINMAYANLAR: turuncu "yeni" vurgusu, kartların İÇİNDEKİ çapraz sönmeler
 * (kart mutasyonlarının kendi hareketi var), iptalin izsiz kaybolması (iptal
 * Akış'ta soluk satır olarak kalıyor), yer değiştiren kartın kayması.
 */

export const LIVE_MOTION = {
    /** Yeni satır: opacity 0→1 + translateY 8→0. */
    enterMs: 240,
    lift: 8,
    /** Giden satır söner; yeri sönme bitince kapanır. */
    exitMs: 200,
    /** Kart → soluk satır takası. */
    swapMs: 200,
    /** Bu kadar ve fazlası tek tazelemede değiştiyse hareket yok. */
    bulk: 4,
    /** Parmak kalktıktan sonra bekleyen tazeleme. */
    releaseMs: 120,
    /** Parmak hâlâ aşağıdaysa bile bu kadar sonra uygulanır. */
    holdMaxMs: 2000,
} as const;

export interface LiveRow {
    id: string;
    /** Satırın yüksekliğini belirleyen biçim — kart türü gibi. */
    shape: string;
}

export interface LiveDiff {
    added: Set<string>;
    removed: Set<string>;
    /** Aynı satır, farklı biçim (yükseklik değişebilir). */
    reshaped: Set<string>;
    /** Yükseklik değişen bir şey var mı — parmak aşağıdayken bekletilir. */
    moves: boolean;
    /** Hareket anlamsız: liste tek karede yerleşir. */
    bulk: boolean;
}

export function liveDiff(prev: readonly LiveRow[], next: readonly LiveRow[]): LiveDiff {
    const before = new Map(prev.map((row) => [row.id, row.shape]));
    const after = new Map(next.map((row) => [row.id, row.shape]));
    const added = new Set([...after.keys()].filter((id) => !before.has(id)));
    const removed = new Set([...before.keys()].filter((id) => !after.has(id)));
    const reshaped = new Set([...after.keys()].filter((id) => before.has(id) && before.get(id) !== after.get(id)));
    const count = added.size + removed.size + reshaped.size;
    return { added, removed, reshaped, moves: count > 0, bulk: count >= LIVE_MOTION.bulk };
}

/**
 * Giden satırlar sönerken listede kalıyor — ESKİ komşusunun hemen ardında.
 * Komşu da gittiyse bir öncekine bakılır; hiçbiri yoksa listenin başına.
 */
export function withLeaving<T>(
    prev: readonly T[],
    next: readonly T[],
    removed: ReadonlySet<string>,
    idOf: (item: T) => string,
): T[] {
    if (removed.size === 0) return [...next];
    const out = [...next];
    prev.forEach((item, index) => {
        const id = idOf(item);
        if (!removed.has(id)) return;
        let anchor = -1;
        for (let i = index - 1; i >= 0; i -= 1) {
            const found = out.findIndex((row) => idOf(row) === idOf(prev[i]));
            if (found >= 0) { anchor = found; break; }
        }
        out.splice(anchor + 1, 0, item);
    });
    return out;
}
