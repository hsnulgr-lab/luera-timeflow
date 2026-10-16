/**
 * Müdür 36 · Yol 1 — paketin HALKASI. Saf, React'siz.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 36 Baglam Kutusu.html`
 * (+ `m36.js · ring()`), brief `docs/mudur-36-baglam-kutusu-claude-design-prompt.md`.
 * Kullanıcı Yol 1'i seçti, iki ayarla (2026-10-16):
 *   1. Son seansta TEK söz: "Son seans" — "1 seans kaldı" + SON SEANS etiketi
 *      aynı şeyi üç kez söylüyordu (halkada da "1").
 *   2. Çok seanslı pakette (16'dan fazla) dilim yerine DÜZ YAY: dilimler
 *      okunmaz incelikte kalıyordu; ortadaki rakam yine kalanı söylüyor.
 *
 * Aynı halka ÜÇ yerde: Akış A2 kutusu (Ø40, rakamlı), randevu kartı (Ø18,
 * rakamsız), müşteri kartı (Ø36, rakamlı). Göz üç ekranda aynı şekli ve
 * aynı sayıyı — KALANI — görüyor.
 */

/** Bu sayının üstünde dilim çizilmez; tek yay. */
export const RING_SLICE_MAX = 16;

/** Kullanılmış dilimin (ve yayın izinin) görünürlüğü — tasarımın %17'si. */
export const RING_SPENT_OPACITY = 0.17;

/** Bir halka parçası: SVG `Circle`ın çizgi deseni. */
export interface RingStroke {
    /** `strokeDasharray`: [çizgi, boşluk]. */
    dash: [number, number];
    /** `strokeDashoffset`. */
    offset: number;
    /** Kalan mı (tam mürekkep) yoksa kullanılmış/iz mi (sönük). */
    on: boolean;
}

/**
 * Halkanın çizgileri. Saat 12'den saat yönünde; YANAN dilimler KALAN.
 *
 * Dilimli: seans başına bir parça, aralık dilimin %30'u ama en çok 3,2 pt
 * (`m36.js`'in kuralı). Düz: önce bütün halka sönük iz, üstüne kalan kadar yay.
 * Çağıran halkayı -90° döndürür (12'den başlasın).
 */
export function ringStrokes(input: { size: number; stroke: number; total: number; left: number }): RingStroke[] {
    const total = Math.max(1, Math.round(input.total));
    const left = Math.min(total, Math.max(0, Math.round(input.left)));
    const r = (input.size - input.stroke) / 2;
    const circumference = 2 * Math.PI * r;

    if (total > RING_SLICE_MAX || total === 1) {
        const arc = circumference * (left / total);
        const strokes: RingStroke[] = [{ dash: [circumference, 0], offset: 0, on: false }];
        if (arc > 0) strokes.push({ dash: [arc, circumference - arc], offset: 0, on: true });
        return strokes;
    }

    const segment = circumference / total;
    const gap = Math.min(3.2, segment * 0.3);
    return Array.from({ length: total }, (_, index) => ({
        dash: [segment - gap, circumference - segment + gap],
        offset: -(index * segment + gap / 2),
        on: index < left,
    }));
}

/** Son seans mı — yalnız ÇOK seanslı pakette anlamlı (`packageBook.lastSession`). */
export const isLastSession = (total: number, left: number): boolean => total > 1 && left === 1;

/** Halkanın yanındaki ana söz: "6 seans kaldı" · "Son seans". */
export function remainingHead(total: number, left: number): string {
    return isLastSession(total, left) ? 'Son seans' : `${left} seans kaldı`;
}
