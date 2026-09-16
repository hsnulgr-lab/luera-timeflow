/**
 * Personel sütunlu takvimin karar katmanı — saf, React'siz.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır: Expo ya da react-native
 * bağımlılığı TAŞIMAZ.
 *
 * Müdürün takvimi personelinkinden TEK bir şeyde ayrılır: gövde tek sütun
 * değil, personel sütunları. Dev başlık, hafta şeridi, şimdi çizgisi ve
 * yoğunluk noktaları aynı kalır.
 */

// Uzantı AÇIK yazılıyor: kök testleri bu dosyayı Node ile doğrudan içe
// aktarıyor ve Node saf ESM'de uzantısız yol çözemiyor. Metro ve TypeScript
// ikisi de bu biçimi kabul ediyor (`allowImportingTsExtensions`).
import { toMinutes, type Appt } from './calendar.ts';

/** 1 saat = 74 pt. Blok yüksekliği süreyi zaten söylüyor. */
export const HOUR_HEIGHT = 74;

export interface ColumnStaff {
    id: string;
    initials: string;
    name: string;
    /** Avatar kenarlığı hizmet türünü söyler; yoksa nötr. */
    color?: string;
}

export interface Block {
    appointment: Appt;
    /** Sütunun tepesinden piksel. */
    top: number;
    height: number;
}

/**
 * Bloğun yeri ve boyu. Süre asla kırpılmaz — blok yüksekliği süreyi zaten
 * söylüyor, bir de yazmak aynı bilgiyi iki kez vermek olurdu.
 */
export function blockLayout(
    appointment: Appt,
    dayStartMinutes: number,
    hourHeight = HOUR_HEIGHT,
): { top: number; height: number } {
    const start = toMinutes(appointment.start_time);
    const end = toMinutes(appointment.end_time);
    const perMinute = hourHeight / 60;
    const top = (start - dayStartMinutes) * perMinute;
    // En kısa randevu bile dokunulabilir kalmalı; 30 dakikanın altı 37 pt'de
    // sabitlenir, aksi hâlde 10 dakikalık bir kayıt görünmez olurdu.
    const height = Math.max((end - start) * perMinute, MIN_BLOCK);
    return { top, height };
}

/** Altında blok okunmaz hâle gelir. */
export const MIN_BLOCK = 37;

export type BlockDetail = 'full' | 'timeAndName' | 'nameOnly';

/**
 * Blokta ne yazılacağı YÜKSEKLİĞE bağlı. Sığmayan metni küçültmek yerine
 * çıkarıyoruz: 11 pt'nin altına inen bir yazı zaten okunmuyor.
 *
 *   56 pt ve üstü → saat · ad · hizmet
 *   37–56 pt      → saat · ad
 *   37 pt         → yalnız ad
 */
export function blockDetail(height: number): BlockDetail {
    if (height >= 56) return 'full';
    if (height > MIN_BLOCK) return 'timeAndName';
    return 'nameOnly';
}

/** Sütun başlıklarının ve ızgaranın ortak genişliği. */
export const COLUMN_WIDTH = 95;
export const COLUMN_GAP = 8;
/** Sol saat sütunu: yana kaydırmada SABİT kalır, sütunlar altından geçer. */
export const HOURS_WIDTH = 62;

/** Salonun saati BİLİNMİYORSA çizilen gün — saat cinsinden. */
export const DEFAULT_DAY_HOURS = { from: 9, to: 20 } as const;

/**
 * Görünen saat aralığı — SALONUN O GÜNKÜ ÇALIŞMA SAATLERİ, dakika cinsinden
 * `open` (`createLive.dayWindowOf`: salonun ve personelin saatlerinin
 * birleşimi).
 *
 * ── Eskiden randevulara göre DARALIYORDU ────────────────────────────────────
 * Tek randevulu bir günde ızgara 07:00–09:00'a iniyordu: randevuyu ileri bir
 * saate sürükleyecek YER kalmıyordu ve boş saate dokunup randevu vermek de
 * mümkün değildi. Müdürün takvimi randevuların değil salonun gününü çizer.
 *
 * Randevu çalışma saatinin DIŞINA taşıyorsa (erken açılış, geç kalan işlem)
 * aralık o tarafa bir saat nefesle genişliyor: randevu hiçbir zaman
 * ızgaranın dışında kalmıyor.
 *
 * Kapalı gün (`null`) ya da bilinmeyen saat (`undefined`) varsayılanı
 * çiziyor — müdür kapalı güne de randevu taşıyabilmeli.
 */
export function hourRange(
    appointments: readonly Appt[],
    open?: { from: number; to: number } | null,
): { from: number; to: number } {
    let from = open ? Math.floor(open.from / 60) : DEFAULT_DAY_HOURS.from;
    let to = open ? Math.ceil(open.to / 60) : DEFAULT_DAY_HOURS.to;
    for (const appointment of appointments) {
        const start = toMinutes(appointment.start_time);
        const end = toMinutes(appointment.end_time);
        // Kenarlarda birer saat nefes: dışarıdaki randevu tam kenara yapışmasın.
        if (start < from * 60) from = Math.floor(start / 60) - 1;
        if (end > to * 60) to = Math.ceil(end / 60) + 1;
    }
    return { from: Math.max(0, from), to: Math.min(24, to) };
}

// ── Sürüklerken kenarda kaydırma ────────────────────────────────────────────

/**
 * Parmak ekranın kenarına bu kadar yaklaşınca ızgara kendiliğinden kayar (pt).
 *
 * ── Neden ───────────────────────────────────────────────────────────────────
 * Blok kalkınca iki kaydırıcı da kilitleniyor (parmak hem bloğu hem sayfayı
 * çekmesin diye). Ama 09–20 arası bir gün 814 pt ve ekrana sığmıyor: sabahki
 * randevu akşama, ya da ekran dışındaki beşinci personelin sütununa TEK
 * hamlede taşınamıyordu. Müdür bloğu kenara götürünce ızgara onu takip
 * etmeli.
 */
export const DRAG_EDGE_ZONE = 96;

/**
 * Sürüklerken alt kenar sekme çubuğunun değil, TURUNCU BANDIN üstü (pt).
 *
 * Bant ("hasan ulger · İmplant → 15:15 · Kemal. Bırakın, taşıyalım.") sekme
 * çubuğunun hemen üstünde, iki satır metinle yaklaşık bu kadar yer tutuyor.
 * İlk sürümde bölge bandın ALTINDAYDI: müdür parmağını okunacak tek metnin
 * üstüne koymuyor, bandın üstünde bekliyordu — ve bölgeye hiç girmiyordu
 * (2026-09-17, telefon). Bandın üstü ve altı artık en hızlı kaydırma.
 */
export const DRAG_BANNER_RESERVE = 72;
/** Kare başına en fazla kaydırma (pt). Kenara ne kadar yakınsa o kadar hızlı. */
export const DRAG_EDGE_MAX_STEP = 14;

/**
 * Bu karede ne kadar kaydırılacak: eksi geriye (yukarı / sola), artı ileriye.
 *
 * `start`–`end` görünür alanın ekran koordinatları. Hız bölgenin derinliğiyle
 * doğrusal artıyor; bölgeye yeni giren parmak yavaş başlıyor, kenara dayanan
 * en hızlı gidiyor. Bilinmeyen konum (`NaN`, henüz kıpırdanmadı) kaydırmıyor.
 */
export function edgeStep(
    position: number,
    start: number,
    end: number,
    zone: number = DRAG_EDGE_ZONE,
    max: number = DRAG_EDGE_MAX_STEP,
): number {
    if (!Number.isFinite(position) || !(end - start > zone * 2)) return 0;
    if (position < start + zone) {
        const depth = Math.min(1, (start + zone - position) / zone);
        return -Math.max(1, Math.round(max * depth));
    }
    if (position > end - zone) {
        const depth = Math.min(1, (position - (end - zone)) / zone);
        return Math.max(1, Math.round(max * depth));
    }
    return 0;
}

export function hourLabels(from: number, to: number): string[] {
    return Array.from({ length: Math.max(0, to - from) }, (_, index) => (
        `${String(from + index).padStart(2, '0')}:00`
    ));
}

/** Randevuları personele böler. Personelsiz randevu HİÇBİR sütuna düşmez. */
export function columnize(
    appointments: readonly Appt[],
    staff: readonly ColumnStaff[],
    dayStartMinutes: number,
): Map<string, Block[]> {
    const byStaff = new Map<string, Block[]>();
    for (const person of staff) byStaff.set(person.id, []);

    for (const appointment of appointments) {
        const columnId = appointment.staff_id;
        if (!columnId || !byStaff.has(columnId)) continue;
        byStaff.get(columnId)?.push({ appointment, ...blockLayout(appointment, dayStartMinutes) });
    }

    for (const list of byStaff.values()) list.sort((a, b) => a.top - b.top);
    return byStaff;
}

/** Şimdi çizgisinin sütun ızgarasındaki yeri. Bütün sütunları keser. */
export function nowLineTop(nowMinutes: number, dayStartMinutes: number, hourHeight = HOUR_HEIGHT): number {
    return (nowMinutes - dayStartMinutes) * (hourHeight / 60);
}
