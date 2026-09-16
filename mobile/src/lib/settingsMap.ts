/**
 * Salon ayarlarının VERİTABANI ↔ EKRAN çevirisi. Saf, React'siz.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır: Expo, react-native ya da
 * Supabase bağımlılığı TAŞIMAZ.
 *
 * ── Planın en tehlikeli adımı, üç sessiz tuzak ──────────────────────────────
 * 1. GÜN NUMARASI. Veritabanı `working_hours[].day` için JS'in `getDay()`
 *    düzenini kullanıyor: 0 = PAZAR. Ekran (`DaySchedule.day`) 0 = PAZARTESİ.
 *    Bir birimlik kayma salonun kapalı gününü oynatır ve hiçbir hata vermez:
 *    müdür cumartesiyi kapatır, pazar kapanır.
 * 2. BİÇİM. Veritabanı `{day, dayName, start:"09:00", end:"18:00", isOff}`,
 *    ekran `{day, open: dakika, close: dakika, closed}`. `dayName` korunmazsa
 *    masaüstünün ayar sayfasında gün adları boşalır; bilinmeyen alanlar da
 *    olduğu gibi geri yazılıyor.
 * 3. HANGİ SATIR. `settings.user_id` TEKİL — satır kullanıcı başına. Okuyan
 *    ve yazan AYNI satır: org sahibinin (`managerSource.fetchOrgSettings`).
 *    `staff-api` de o satırı okuyor; başka satıra yazmak müdürün değiştirdiği
 *    saati personelin telefonuna hiç ulaştırmazdı.
 */

import type { CatalogService } from './cashBuild.ts';
import type { DaySchedule, SalonService } from './managerProfile.ts';

/** Veritabanının gün adları — 0 = Pazar. Masaüstünün varsayılan dizisiyle aynı. */
export const DB_DAY_NAMES = [
    'Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi',
] as const;

/** Veritabanı günü (0 = Pazar) → ekran günü (0 = Pazartesi). */
export function screenDayOf(dbDay: number): number {
    return (((dbDay + 6) % 7) + 7) % 7;
}

/** Ekran günü (0 = Pazartesi) → veritabanı günü (0 = Pazar). */
export function dbDayOf(screenDay: number): number {
    return (((screenDay + 1) % 7) + 7) % 7;
}

/** Masaüstünün yeni satır varsayılanı — tanımsız gün bu saatlerle KAPALI gelir. */
const FALLBACK_OPEN = 9 * 60;
const FALLBACK_CLOSE = 18 * 60;

function minutesOf(value: unknown): number | null {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim());
    if (!match) return null;
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    return minutes >= 0 && minutes <= 24 * 60 ? minutes : null;
}

function clock(minutes: number): string {
    const safe = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * `working_hours` → yedi gün, Pazartesi'den.
 *
 * `null` — dizi değil, okunamaz: ekran saatleri UYDURMUYOR, "okuyamadık"
 * diyor. Dizide olmayan gün KAPALI geliyor; masaüstünün uygunluk kuralı da
 * tanımsız günü çalışılmayan gün sayıyor (`staffWorksAt`).
 *
 * Saati bozuk olan gün de KAPALI: masaüstü o günde randevu vermiyor; ekran
 * "açık" dese yalan olurdu.
 */
export function schedulesOf(raw: unknown): DaySchedule[] | null {
    if (!Array.isArray(raw)) return null;
    const byDb = new Map<number, Record<string, unknown>>();
    for (const item of raw) {
        const entry = (item ?? {}) as Record<string, unknown>;
        const day = Number(entry.day);
        if (Number.isInteger(day) && day >= 0 && day <= 6 && !byDb.has(day)) byDb.set(day, entry);
    }
    const out: DaySchedule[] = [];
    for (let screen = 0; screen < 7; screen += 1) {
        const entry = byDb.get(dbDayOf(screen));
        const open = minutesOf(entry?.start);
        const close = minutesOf(entry?.end);
        const broken = open === null || close === null || close <= open;
        out.push({
            day: screen,
            open: open ?? FALLBACK_OPEN,
            close: close !== null && open !== null && close > open ? close : FALLBACK_CLOSE,
            closed: !entry || entry.isOff === true || broken,
        });
    }
    return out;
}

/**
 * Yedi gün → `working_hours`, Pazar'dan.
 *
 * Eski girdinin BİLİNMEYEN alanları korunuyor (ileride eklenmiş bir mola
 * alanı sessizce silinmesin); `dayName` yoksa masaüstünün adı yazılıyor.
 * Sıra her zaman 0..6: masaüstü diziyi sırasıyla çiziyor.
 */
export function workingHoursOf(
    schedules: readonly DaySchedule[],
    previous: unknown,
): Record<string, unknown>[] {
    const old = new Map<number, Record<string, unknown>>();
    if (Array.isArray(previous)) {
        for (const item of previous) {
            const entry = (item ?? {}) as Record<string, unknown>;
            const day = Number(entry.day);
            if (Number.isInteger(day) && !old.has(day)) old.set(day, entry);
        }
    }
    const byScreen = new Map(schedules.map((day) => [day.day, day]));
    return DB_DAY_NAMES.map((name, dbDay) => {
        const day = byScreen.get(screenDayOf(dbDay));
        const before = old.get(dbDay) ?? {};
        const dayName = typeof before.dayName === 'string' && before.dayName ? before.dayName : name;
        if (!day) {
            return { ...before, day: dbDay, dayName, isOff: before.isOff === true || !('start' in before) };
        }
        return {
            ...before,
            day: dbDay,
            dayName,
            start: clock(day.open),
            end: clock(day.close),
            isOff: day.closed,
        };
    });
}

// ── Hizmetler ───────────────────────────────────────────────────────────────

/** Masaüstünün `services.color` varsayılanı. */
const DEFAULT_COLOR = '#CCFF00';

/** Katalog → ayar ekranının hizmetleri. Kimliksiz satır düzenlenemez, listede yok. */
export function salonServicesOf(catalog: readonly CatalogService[]): SalonService[] {
    return catalog
        .filter((service): service is CatalogService & { id: string } => Boolean(service.id))
        .map((service) => ({
            id: service.id,
            name: service.name,
            minutes: service.duration ?? 30,
            price: service.price ?? null,
            color: service.color ?? DEFAULT_COLOR,
        }));
}

/**
 * `services` satırının müdürün DEĞİŞTİREBİLDİĞİ alanları.
 *
 * `recall_days`, `tags` (076 uygunluk etiketleri) ve reçete bu ekranda yok —
 * gövdeye HİÇ girmiyorlar ki masaüstünde girilmiş değerler ezilmesin.
 * Masaüstü tüm satırı yeniden yazıyor; telefon yalnız dokunduğunu.
 */
export function servicePatchOf(service: SalonService): Record<string, unknown> {
    return {
        name: service.name.trim(),
        duration: Math.max(1, Math.round(service.minutes)),
        price: service.price,
        color: service.color || DEFAULT_COLOR,
    };
}

/** Ekranın geçici kimliği mi (`svc-…`), veritabanının mı? */
export function isNewService(id: string, known: readonly SalonService[]): boolean {
    return !known.some((service) => service.id === id);
}

/**
 * Ayar yazmasının sonucu. Randevu kartının dilini paylaşıyor ki müdür iki
 * ekranda iki farklı cümle öğrenmesin.
 */
export type SettingsOutcome<T> =
    | { ok: true; value: T }
    /** Başka bir cihaz satırı az önce değiştirdi — ezilmedi. */
    | { ok: false; kind: 'stale' }
    | { ok: false; kind: 'paused' }
    | { ok: false; kind: 'failed' };

export interface SettingsRefusal {
    tone: 'amber' | 'red';
    title: string;
    line: string;
}

export function settingsRefusal(kind: 'stale' | 'paused' | 'failed'): SettingsRefusal {
    switch (kind) {
        case 'stale':
            return {
                tone: 'amber',
                title: 'Saatler başka bir cihazda değişti',
                line: 'Değişikliğiniz uygulanmadı. Güncel saatleri getirdik — yeniden deneyin.',
            };
        case 'paused':
            return {
                tone: 'amber',
                title: 'Değişiklik şimdilik alınmıyor',
                line: 'Kısa bir süre sonra tekrar deneyin.',
            };
        default:
            return {
                tone: 'red',
                title: 'Değişiklik uygulanmadı',
                line: 'Bağlantı kesilmiş olabilir. Tekrar deneyin.',
            };
    }
}
