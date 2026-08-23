/**
 * Müdür 13 — gün cetvelinin karar katmanı. Saf, React'siz.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır: Expo ya da react-native
 * bağımlılığı TAŞIMAZ.
 *
 * Cetvelin bütün ölçüleri TÜRETİLİR, sabit yazılmaz. Gün adımı pencerenin
 * genişliğinden, çentik aralığı gün adımından çıkar. Sabit pt yazılsaydı panel
 * genişliği değiştiğinde gün merkezi çentiği rakamın altından kayardı ve cetvel
 * eğri görünürdü.
 */

import { addDaysISO, daysBetween, formatDayShort, isMonthStart } from './calendar.ts';

/** Pencerede tam görünen gün sayısı. Kenarlarda ray kırpılır. */
export const VISIBLE_DAYS = 7;
/** Gün başına çentik. Her onuncu çentik gün merkezidir. */
export const TICKS_PER_DAY = 10;

/** Ray penceresinin genişliğinden gün adımı. */
export function stepFor(windowWidth: number): number {
    return windowWidth / VISIBLE_DAYS;
}

/** Gün adımından çentik aralığı. Sabit pt DEĞİL. */
export function tickPitch(step: number): number {
    return step / TICKS_PER_DAY;
}

export interface Bounds {
    firstISO: string;
    lastISO: string;
}

/**
 * Ray sonsuz değil.
 *
 * İleri sınır tasarımın verdiği +365. Geri sınır aslında işletmenin ilk kayıt
 * günü olmalı; o veri henüz sunucudan gelmiyor, şimdilik simetrik bir yıl
 * kullanılıyor ve gerçek değer geldiğinde yalnız burası değişecek.
 */
export const FORWARD_DAYS = 365;
export const BACKWARD_DAYS = 365;

export function boundsFor(todayISO: string, backward = BACKWARD_DAYS, forward = FORWARD_DAYS): Bounds {
    return {
        firstISO: addDaysISO(todayISO, -backward),
        lastISO: addDaysISO(todayISO, forward),
    };
}

/** Raydaki toplam gün sayısı. */
export function dayCount(bounds: Bounds): number {
    return daysBetween(bounds.firstISO, bounds.lastISO) + 1;
}

/** Günün raydaki sırası. Sınır dışındaki gün kırpılır. */
export function indexOf(dateISO: string, bounds: Bounds): number {
    const raw = daysBetween(bounds.firstISO, dateISO);
    return Math.max(0, Math.min(dayCount(bounds) - 1, raw));
}

export function dateAt(index: number, bounds: Bounds): string {
    const clamped = Math.max(0, Math.min(dayCount(bounds) - 1, Math.round(index)));
    return addDaysISO(bounds.firstISO, clamped);
}

/** Kaydırma konumundan oturulacak gün. Ara konum yok. */
export function indexFromOffset(offsetX: number, step: number, bounds: Bounds): number {
    if (step <= 0) return 0;
    return Math.max(0, Math.min(dayCount(bounds) - 1, Math.round(offsetX / step)));
}

export function offsetForIndex(index: number, step: number): number {
    return index * step;
}

// ── Hücrenin çizim modeli ───────────────────────────────────────────────────

export type TickKind = 'small' | 'major' | 'month' | 'end';

export interface RailCell {
    dateISO: string;
    /** "13" — rakam satırı. */
    label: string;
    selected: boolean;
    today: boolean;
    /** Gün merkezi çentiğinin türü; ay sınırı ve ray sonu farklı çizilir. */
    centerTick: TickKind;
}

export function railCell(dateISO: string, selectedISO: string, todayISO: string, bounds: Bounds): RailCell {
    const isEnd = dateISO === bounds.firstISO || dateISO === bounds.lastISO;
    return {
        dateISO,
        label: String(Number(dateISO.slice(8, 10))),
        selected: dateISO === selectedISO,
        today: dateISO === todayISO,
        centerTick: isEnd ? 'end' : isMonthStart(dateISO) ? 'month' : 'major',
    };
}

/**
 * Gün merkezi çentiğinin hücre içindeki yeri: hücrenin tam ortası, yani
 * rakamın tam altı. Onuncu çentiğin beşincisine denk gelir.
 */
export function majorTickOffset(step: number): number {
    return step / 2;
}

/**
 * Bir hücredeki küçük çentiklerin yatay konumları — gün merkezi HARİÇ.
 * On çentiğin dokuzu; ortadaki ayrı çizilir çünkü boyu ve rengi farklı.
 */
export function smallTickOffsets(step: number): number[] {
    const pitch = tickPitch(step);
    const center = TICKS_PER_DAY / 2;
    return Array.from({ length: TICKS_PER_DAY }, (_, index) => index)
        .filter((index) => index !== center)
        .map((index) => index * pitch);
}

// ── Başlık ──────────────────────────────────────────────────────────────────

/** "Per. 13" — levhadaki TEK metin. */
export function railTitle(dateISO: string): string {
    return formatDayShort(dateISO);
}

/** Seçim bugün değilse "Bugün" hapı çıkar; bugündeyse levha uzamaz. */
export function showsBackToday(selectedISO: string, todayISO: string): boolean {
    return selectedISO !== todayISO;
}

/** Ay sınırı geçildi mi? Geçişte tek seferlik, daha yumuşak bir titreşim var. */
export function crossedMonth(fromISO: string, toISO: string): boolean {
    return fromISO.slice(0, 7) !== toISO.slice(0, 7);
}
