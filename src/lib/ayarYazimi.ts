/*
 * AYAR YAZIMI — masaüstü `updateSettings`'in saf hesapları (2026-11-12,
 * mobil↔masaüstü uyum denetimi, Paket D).
 *
 * İki kusur vardı:
 *
 * 1. Her ayar kaydı (saat, sadakat, işletme adı, WhatsApp, PIN…) `services`
 *    tablosundaki BÜTÜN kimlikleri okuyup bellekte olmayanları siliyordu.
 *    Masaüstünde hizmetler için canlı kanal yok; telefondan eklenen hizmet ya
 *    da yüklemede elenen aynı adlı ikiz, açık bir sekmede çalışma saati
 *    değişince etiketi, reçetesi, notuyla kalıcı siliniyordu.
 *    → Hizmetlere yalnız liste bu çağrıda gerçekten değiştiyse dokunulur;
 *      silme yalnız bu oturumda YÜKLENİP ekranda gösterilen ve kullanıcının
 *      listeden çıkardığı kimlikler için.
 *
 * 2. `settings` satırının tamamı bayat bellekten `upsert` ediliyordu: telefonda
 *    saat değişir, masaüstünde sadakat anahtarı çevrilir → saatler geri döner.
 *    → Yalnız bu çağrıda değişen kolonlar yazılır, `updated_at` kilidiyle
 *      (telefonun `saveWorkingHours`'ı ile aynı desen).
 */
import type { Service, Settings } from '@/types';

/** `settings` satırında masaüstünün yazdığı kolonlar. */
export type SettingsColumns = {
    business_name: string;
    slot_duration: number;
    working_hours: Settings['workingHours'];
    webhook_url: string | null;
    sector: string;
    manager_pin: string | null;
    loyalty_enabled: boolean;
    loyalty_threshold: number;
    loyalty_reward: string;
    rebook_enabled: boolean;
    rebook_note: string;
};

/** Bellekteki ayarı satır kolonlarına çevirir (eski `upsert` ile aynı normalleştirme). */
export function settingsColumnsOf(s: Settings): SettingsColumns {
    return {
        business_name: s.businessName,
        slot_duration: s.slotDuration,
        working_hours: s.workingHours,
        webhook_url: s.webhookUrl || null,
        sector: s.sector || 'genel',
        manager_pin: s.managerPin || null,
        loyalty_enabled: s.loyaltyEnabled ?? false,
        loyalty_threshold: s.loyaltyThreshold ?? 10,
        loyalty_reward: s.loyaltyReward || 'Ücretsiz hizmet',
        rebook_enabled: s.rebookEnabled ?? false,
        rebook_note: s.rebookNote || '',
    };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Yalnız tabandan farklı kolonlar — çağıranın `{...settings}` ile taşıdığı bayat alanlar yazılmaz. */
export function changedSettingsColumns(base: Settings, next: Settings): Partial<SettingsColumns> {
    const a = settingsColumnsOf(base);
    const b = settingsColumnsOf(next);
    const out: Partial<SettingsColumns> = {};
    for (const key of Object.keys(b) as (keyof SettingsColumns)[]) {
        if (!same(a[key], b[key])) (out as Record<string, unknown>)[key] = b[key];
    }
    return out;
}

const FIELD_OF: Record<keyof SettingsColumns, keyof Settings> = {
    business_name: 'businessName',
    slot_duration: 'slotDuration',
    working_hours: 'workingHours',
    webhook_url: 'webhookUrl',
    sector: 'sector',
    manager_pin: 'managerPin',
    loyalty_enabled: 'loyaltyEnabled',
    loyalty_threshold: 'loyaltyThreshold',
    loyalty_reward: 'loyaltyReward',
    rebook_enabled: 'rebookEnabled',
    rebook_note: 'rebookNote',
};

/**
 * Tabana yalnız `next`'in tabandan farklı olan alanlarını uygular. Başarılı
 * yazımdan sonra yeni taban ve bellekteki ayar bu olur — çağıranın taşıdığı
 * bayat alanlar belleğe geri sızmaz.
 */
export function mergeSettingsFields<T extends Settings>(base: T, next: Settings): T {
    const changed = changedSettingsColumns(base, next);
    const out = { ...base } as Record<string, unknown>;
    for (const col of Object.keys(changed) as (keyof SettingsColumns)[]) {
        const field = FIELD_OF[col];
        out[field] = next[field];
    }
    return out as T;
}

/** Settings'ten yalnız `settings` kolonlarına karşılık gelen alanlar. */
export function pickColumnFields(s: Settings): Partial<Settings> {
    const out: Record<string, unknown> = {};
    for (const field of Object.values(FIELD_OF)) out[field] = s[field];
    return out as Partial<Settings>;
}

/** Hizmetin kalıcı alanları — değişti mi karşılaştırması için. */
function serviceKey(s: Service): string {
    return JSON.stringify([
        s.name, s.duration, s.color, s.price || null, s.recallDays || null, s.tags ?? [],
        s.recipe ?? [], s.description?.trim() || null, s.prepNote?.trim() || null,
    ]);
}

export function servicesChanged(base: readonly Service[], next: readonly Service[]): boolean {
    if (base === next) return false;
    if (base.length !== next.length) return true;
    return base.some((s, i) => s.id !== next[i].id || serviceKey(s) !== serviceKey(next[i]));
}

export type ServicePlan = { toDelete: string[]; toUpdate: Service[]; toInsert: Service[] };

/**
 * Hizmet yazım planı.
 *
 * @param shown     Yüklemede/son kayıtta ekranda gösterilen liste (taban).
 * @param loadedIds Yüklemede veritabanında görülen TÜM kimlikler (elenen ikizler dahil).
 * @param dbIds     Şu an veritabanında olan kimlikler.
 * @param next      Kaydedilmek istenen liste.
 * @param isPlaceholder Dokunulmamış yer tutucu mu (eklenmez).
 */
export function planServiceWrites(
    shown: readonly Service[],
    loadedIds: ReadonlySet<string>,
    dbIds: ReadonlySet<string>,
    next: readonly Service[],
    isPlaceholder: (s: Service) => boolean,
): ServicePlan {
    const nextIds = new Set(next.map((s) => s.id));
    const before = new Map(shown.map((s) => [s.id, s]));
    // Silme: yalnız ekranda gösterilmiş, yüklemede DB'de olan ve listeden çıkarılan.
    // Yüklemede elenen ikizler `shown`'da yok; telefondan sonradan eklenenler
    // `loadedIds`'de yok → ikisine de dokunulmaz.
    const toDelete = shown
        .map((s) => s.id)
        .filter((id) => loadedIds.has(id) && dbIds.has(id) && !nextIds.has(id));
    const toUpdate = next.filter((s) => {
        if (!dbIds.has(s.id)) return false;
        const old = before.get(s.id);
        return !old || serviceKey(old) !== serviceKey(s);
    });
    // Ekleme: bu oturumda yeni yaratılan kimlikler. Yüklemede DB'de olup şimdi
    // olmayan (başka cihaz sildi) hizmet yeni kimlikle diriltilmez.
    const toInsert = next.filter((s) => !dbIds.has(s.id) && !loadedIds.has(s.id) && !isPlaceholder(s));
    return { toDelete, toUpdate, toInsert };
}

/** Yüklemede aynı adlı ikizleri eler (ekranda ilk görülen kalır). */
export function dedupeByName<T extends { name: string }>(list: readonly T[]): T[] {
    const seen = new Set<string>();
    return list.filter((s) => {
        if (seen.has(s.name)) return false;
        seen.add(s.name);
        return true;
    });
}
