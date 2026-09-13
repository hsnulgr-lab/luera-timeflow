/**
 * Personel 10 — sunucunun `shift` cevabını ekranın `ShiftSource`una indirgeyen
 * SAF katman.
 *
 * `customerFileMap.ts` ile aynı gerekçeyle ayrı dosya: kaynağı okuyan kanca
 * React ve api katmanına bağlı, yani Node testleri onu çağıramıyor. Burası
 * çağrılabiliyor — ve bu eşlemede gerçekten çalıştırılarak sınanması gereken
 * bir karar var.
 *
 * ── HAFTANIN İLK GÜNÜ — bu dosyanın var oluş sebebi ─────────────────────────
 * Veritabanı JavaScript'in saymasını kullanıyor: `day: 0 = PAZAR`
 * (`useReservations.ts` · defaultSettings.workingHours). Mobilin şeması
 * `DaySchedule` ise `0 = PAZARTESİ` — takvim şeridi, hafta satırları ve
 * `mondayOf` hep pazartesiden sayıyor.
 *
 * Çevirmeden geçirilirse her şey BİR GÜN KAYIYOR: pazartesinin saatleri
 * pazar gününe yazılıyor, cumartesi kapalı olan salon cuma kapalı görünüyor.
 * Sessizce yanlış — kimse hata görmüyor, yalnız saatler tutmuyor.
 *
 * ── Saat biçimi ─────────────────────────────────────────────────────────────
 * DB `"09:00"` tutuyor, ekran dakika istiyor. Ayrıştırılamayan saat
 * UYDURULMUYOR: o gün kapalı sayılıyor ve sebebini kayıtta bırakıyor —
 * `0` yazmak "gece yarısı açılıyor" demek olurdu.
 */

import type { DaySchedule } from './managerProfile.ts';
import type { ShiftSource } from './staffShift.ts';

/** Sunucunun `shift` cevabının okunan kısmı. */
export interface ServerShift {
    today?: string;
    /** `null` = personelin ayrı saati YOK, salonunki geçerli. */
    staffHours?: unknown;
    salonHours?: unknown;
    timeOff?: { date?: unknown; reason?: unknown }[];
    window?: { from?: unknown; to?: unknown };
}

/** Veritabanının tuttuğu gün satırı. `day` PAZARdan sayıyor. */
interface DbDay {
    day?: unknown;
    start?: unknown;
    end?: unknown;
    isOff?: unknown;
}

/** `"09:30"` → `570`. Ayrıştırılamayan saat `null` — sıfır DEĞİL. */
export function minutesOf(value: unknown): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
}

/**
 * `0 = Pazar` → `0 = Pazartesi`.
 *
 * Tek satır, ama bütün ekranın doğruluğu buna bağlı.
 */
export function toMondayFirst(sundayFirst: number): number {
    return ((sundayFirst % 7) + 6) % 7;
}

function toDay(row: DbDay): DaySchedule | null {
    const raw = Number(row.day);
    if (!Number.isInteger(raw) || raw < 0 || raw > 6) return null;
    const open = minutesOf(row.start);
    const close = minutesOf(row.end);
    return {
        day: toMondayFirst(raw),
        // Saat okunamadıysa gün KAPALI sayılıyor ve saatleri kapalı bir günün
        // varsayılanına düşüyor. Uydurma bir aralık, "10:00–19:00 çalışıyorsun"
        // demek olurdu — personel ona bakıp işe gelir.
        open: open ?? 9 * 60,
        close: close ?? 19 * 60,
        closed: row.isOff === true || open === null || close === null || close <= open,
    };
}

/**
 * Gün listesini çevirir. Liste değilse `null` — BOŞ DİZİ DEĞİL.
 *
 * Ayrım kritik: `staffHours` alanında boş dizi "hiçbir gün çalışmıyor",
 * `null` ise "ayrı saati yok, salonunki geçerli". İkisini karıştırmak
 * personeli ya hiç çalışmıyor ya da yanlış saatte gösterirdi.
 */
export function toDays(value: unknown): DaySchedule[] | null {
    if (!Array.isArray(value)) return null;
    const out: DaySchedule[] = [];
    for (const row of value) {
        const day = toDay((row ?? {}) as DbDay);
        if (day) out.push(day);
    }
    return out;
}

/**
 * Ekranın beklediği kaynak. Salonun saatleri OKUNAMADIYSA `null` dönüyor:
 * `ShiftSource.salonHours` her hâlde gerekli (personelin `null`'ının karşılığı
 * o) ve onsuz ekran ne çalışma saati ne de kapalı gün söyleyebilir.
 */
export function toShiftSource(data: ServerShift): ShiftSource | null {
    const salonHours = toDays(data.salonHours);
    if (!salonHours) return null;
    return {
        staffHours: toDays(data.staffHours),
        salonHours,
        timeOff: (data.timeOff ?? [])
            .map((row) => String(row?.date ?? '').trim())
            .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)),
    };
}
