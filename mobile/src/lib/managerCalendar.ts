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

/**
 * Görünen saat aralığı. Salonun çalışma saatleri dışını çizmek, ekranın
 * yarısını boş ızgaraya harcamak olurdu.
 */
export function hourRange(appointments: readonly Appt[]): { from: number; to: number } {
    if (appointments.length === 0) return { from: 9, to: 20 };
    let min = 24 * 60;
    let max = 0;
    for (const appointment of appointments) {
        min = Math.min(min, toMinutes(appointment.start_time));
        max = Math.max(max, toMinutes(appointment.end_time));
    }
    // Kenarlarda birer saat nefes: ilk randevu tam tepeye yapışmasın.
    return { from: Math.max(0, Math.floor(min / 60) - 1), to: Math.min(24, Math.ceil(max / 60) + 1) };
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
