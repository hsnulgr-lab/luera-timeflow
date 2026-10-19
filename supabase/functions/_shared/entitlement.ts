// Abonelik kapısı — "bu org şu an TimeFlow'u kullanabilir mi?"
//
// Bu sorunun bugüne kadar TEK bir cevabı yoktu ve hiçbir yerde sorulmuyordu:
// kayıt olan herkes sınırsız, süresiz, ücretsiz tam sisteme düşüyordu. Süresi
// dolmuş bir org'un WhatsApp botu mesaj atmaya, cron'u hatırlatma göndermeye
// devam ediyordu — bu doğrudan işletmenin (bizim) cebimizden çıkıyordu.
//
// ÜÇ KURAL:
//
// 1. KARAR ZAMAN TABANLI. expires_at/grace_until geçmişse erişim yoktur, satır
//    ne derse desin. Webhook kaçsa bile kapı kendiliğinden kapanır.
//
// 2. ÖDEME YOLU ASLA KAPANMAZ. dodo-checkout, dodo-webhook, billing-status ve
//    push uçları bu kapıdan geçmez; yoksa parası biten müşteri ödeme de
//    yapamaz — kilitlenmenin en aptalca hâli.
//
// 3. VARSAYILAN AÇIK (SHADOW). ENTITLEMENT_ENFORCE 'true' değilse herkes
//    geçer. gateway'deki CORE_SUBSCRIPTION_ENFORCE deseninin aynısı: kapıyı
//    kurmak ile kapatmak ayrı günlerde yapılır.
//
// Saf kısım (computeAccess) tests/entitlement.test.mjs'ten doğrudan import
// edilir — bu yüzden dosyanın üstünde ağ/Deno bağımlılığı yoktur.

export type EntState = 'none' | 'trial' | 'active' | 'grace' | 'locked';

export interface EntitlementRow {
    state: EntState;
    /** Dodo aboneliği varsa dolu (123); dönem sonuna tolerans eklenmiştir. */
    dodo_subscription_id?: string | null;
    plan?: string | null;
    cycle?: string | null;
    trial_ends_at?: string | null;
    expires_at?: string | null;
    grace_until?: string | null;
}

export interface Access {
    /** Ürün kullanılabilir mi? */
    ok: boolean;
    /** Satırdaki ham durum. */
    state: EntState;
    /**
     * ZAMAN uygulandıktan sonraki gerçek durum. Satırda 'trial' yazıp süresi
     * dolmuşsa burası 'locked' der — arayüz "denemeniz sürüyor" yazmasın.
     */
    effective: EntState;
    /** Erişimin biteceği an (ISO) — şeritteki geri sayım bunu okur. */
    until: string | null;
    /** Bugün dahil kalan tam gün; süre yoksa null. */
    daysLeft: number | null;
}

/** Ödeme alınamadıktan sonra tanınan ek süre. */
export const GRACE_DAYS = 2;
/** Varsayılan ücretsiz deneme. Dodo'ya checkout'ta bu sayı geçilir. */
export const DEFAULT_TRIAL_DAYS = 7;
/**
 * Pilot/demo için izin verilen deneme uzunlukları.
 *
 * Beyaz liste, çünkü bu değer istemciden gelebiliyor: serbest bırakılsaydı
 * herhangi biri kendine 10000 günlük deneme açardı. Dodo alan sınırı 0–10000.
 */
export const ALLOWED_TRIAL_DAYS: readonly number[] = [7, 30, 90];

const DAY_MS = 86_400_000;

function ms(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
}

/**
 * Erişim kararı — SAF.
 *
 * has_timeflow_access() (son hâli 123_abonelik_yerel_kaynak.sql) ile AYNI
 * mantığı uygular; ikisi ayrışırsa RLS bir şey, arayüz başka bir şey söyler.
 * 086'daki sürüm ek sürede ayrışıyordu — tests/abonelik-yerel.test.mjs iki
 * tarafı aynı örneklerle gerçek Postgres'te (PGlite) koşturur.
 */
export function computeAccess(row: EntitlementRow | null | undefined, now: number = Date.now()): Access {
    if (!row) {
        return { ok: false, state: 'none', effective: 'none', until: null, daysLeft: null };
    }
    const expires = ms(row.expires_at);
    const grace = ms(row.grace_until);

    // Kilit ve "hiç yok" zamana bakmaz.
    if (row.state === 'locked' || row.state === 'none') {
        return { ok: false, state: row.state, effective: row.state, until: null, daysLeft: null };
    }

    // Ek süre: bitiş anı grace_until'dir, expires_at değil. Ödeme alınamadığında
    // dönem zaten bitmiş oluyor; ek süreyi expires_at'e bağlamak onu anlamsız
    // kılardı (hep geçmişte kalırdı).
    const until = row.state === 'grace' ? grace : expires;

    // Süresiz abonelik (elle açılmış Core kaydı) — until yoksa süre işlemez.
    if (until === null) {
        return row.state === 'grace'
            // grace_until'siz bir 'grace' tutarsız veridir; sonsuz ek süre
            // vermektense kapatmak doğru taraf.
            ? { ok: false, state: 'grace', effective: 'locked', until: null, daysLeft: null }
            : { ok: true, state: row.state, effective: row.state, until: null, daysLeft: null };
    }

    const ok = until > now;
    return {
        ok,
        state: row.state,
        effective: ok ? row.state : 'locked',
        until: new Date(until).toISOString(),
        daysLeft: ok ? Math.ceil((until - now) / DAY_MS) : 0,
    };
}

/**
 * Dodo dönem sonuna eklenen tolerans (dodo-webhook · durum.ts yazar): Dodo'nun
 * tahsilatı birkaç saat gecikirse salon kilitlenmesin. Erişim bu paya kadar
 * sürer ama kullanıcıya gösterilmez.
 */
export const PERIOD_TOLERANCE_MS = 3 * DAY_MS;

/**
 * Ekranda gösterilecek dönem sonu — Dodo'nun GERÇEK günü ("deneme 26 Ekim'de
 * biter"). Dodo aboneliğinde `expires_at` = gerçek gün + tolerans; hediye,
 * demo ve elle onarılmış satırlarda tolerans yok, olduğu gibi döner. Süre
 * yoksa ya da satır deneme/aktif değilse null (çağıran `until`a düşer).
 */
export function shownEnd(row: EntitlementRow | null | undefined): string | null {
    if (!row || (row.state !== 'trial' && row.state !== 'active')) return null;
    const end = ms(row.expires_at);
    if (end === null) return null;
    return new Date(row.dodo_subscription_id ? end - PERIOD_TOLERANCE_MS : end).toISOString();
}

/**
 * Ekranda gösterilecek bitiş ve kalan gün (banner, abonelik ekranı). Erişim
 * bitmişse ya da süre yoksa `computeAccess`in değerlerine düşer.
 */
export function shownAccess(row: EntitlementRow | null | undefined, now: number = Date.now()): { shownUntil: string | null; shownDaysLeft: number | null } {
    const access = computeAccess(row, now);
    if (!access.ok) return { shownUntil: access.until, shownDaysLeft: access.daysLeft };
    const shown = shownEnd(row) ?? access.until;
    const t = ms(shown);
    return {
        shownUntil: shown,
        shownDaysLeft: t === null ? access.daysLeft : Math.max(0, Math.ceil((t - now) / DAY_MS)),
    };
}

/** Ödeme alınamadı → ek sürenin biteceği an. */
export function graceUntil(from: number = Date.now()): string {
    return new Date(from + GRACE_DAYS * DAY_MS).toISOString();
}

/** İstemciden gelen deneme uzunluğunu güvenli bir değere indirger. */
export function safeTrialDays(raw: unknown): number {
    const n = Number(raw);
    return ALLOWED_TRIAL_DAYS.includes(n) ? n : DEFAULT_TRIAL_DAYS;
}

// ── Veritabanı tarafı ───────────────────────────────────────────────────────
// Buradan aşağısı I/O. Saf kısmı bozmamak için hepsi tek bir tabloya bakar.

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any; // service_role SupabaseClient (bkz. wa.ts — aynı desen)

/**
 * Kapı. Edge fonksiyonlarının çağırdığı tek şey.
 *
 * ENFORCE kapalıyken satıra hiç bakmaz — kapıyı kurmak ile kapatmayı ayırmak,
 * canlıda bütün org'ları bir anda kilitleme riskini ortadan kaldırır.
 */
export async function checkAccess(admin: Admin, orgId: string): Promise<Access> {
    const { data: flag } = await admin.from('app_secrets')
        .select('value').eq('key', 'ENTITLEMENT_ENFORCE').maybeSingle();
    if (flag?.value !== 'true') {
        return { ok: true, state: 'active', effective: 'active', until: null, daysLeft: null };
    }
    const { data } = await admin.from('org_entitlement')
        .select('state, plan, cycle, trial_ends_at, expires_at, grace_until')
        .eq('organization_id', orgId).maybeSingle();
    return computeAccess(data as EntitlementRow | null);
}

/**
 * Aynayı günceller — tek yazar dodo-webhook.
 *
 * 123'ten beri abonelik gerçeği BURASI; Core kopya. Hata YUTULMAZ: eskiden
 * yalnız loglanıyordu, webhook 200 dönüyor ve Dodo yeniden denemiyordu —
 * ayna sessizce eski kalıyordu. Çağıran hatayı Dodo'ya 500 olarak iletir.
 */
export async function mirrorEntitlement(
    admin: Admin,
    orgId: string,
    patch: Partial<EntitlementRow> & Record<string, unknown>,
): Promise<{ code?: string; message?: string } | null> {
    const { error } = await admin.from('org_entitlement').upsert(
        { organization_id: orgId, ...patch, updated_at: new Date().toISOString() },
        { onConflict: 'organization_id' },
    );
    if (error) console.error('mirrorEntitlement', orgId, error);
    return error ?? null;
}
