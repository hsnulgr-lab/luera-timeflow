/**
 * staff-api'nin İSTEK KAPISI — her personel isteğinin işe başlamadan önce
 * okuduğu şeyler (Hız 3 · 2026-11-12).
 *
 * ── Neden ayrı dosya ─────────────────────────────────────────────────────────
 * Önceden her istek işe başlamadan ARDIŞIK beş tur atıyordu: imza sırrı →
 * telefon satırı (117) → ENFORCE bayrağı → abonelik satırı → personel satırı;
 * yazmalarda üstüne idempotens kütüğü ve acil durum vanası (+2). Bunların
 * hiçbiri bir öncekinin SONUCUNA bakmıyor: hepsi token'daki org / kişi /
 * telefon kimliğiyle sorulabiliyor. Burada tek turda (Promise.all) soruluyor.
 *
 * KARARLARIN SIRASI DEĞİŞMEDİ. Okumalar aynı anda gidiyor, ama `index.ts`
 * sonuçları eskisiyle AYNI sırada tartıyor: önce koparılan telefon, sonra
 * abonelik, sonra personelin kendisi (aktif mi, epoch tutuyor mu), sonra
 * idempotens, sonra vana. Kapıdan geçemeyen isteğin önceden okunmuş verisi
 * hiçbir cevaba girmiyor — yalnız atılıyor.
 *
 * ── Bellekte ne tutuluyor ────────────────────────────────────────────────────
 * YALNIZ imza sırları (STAFF_TOKEN_SECRET, JWT_SECRET), en çok 60 sn. Telefon
 * koparma, `session_epoch`, `is_active`, abonelik ve ENFORCE bayrağı HER
 * istekte taze okunuyor — paralel turda oldukları için bunun gecikmeye maliyeti
 * yok. Vana (MOBILE_WRITES_ENABLED) da taze: acil durumda 60 sn beklemesin.
 *
 * Node testleri bu dosyayı ÇALIŞTIRIYOR (tests/staff-api-hiz3.test.mjs): Deno'ya
 * ve ağa bağlı değil, `admin` dışarıdan veriliyor.
 */

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any; // service_role SupabaseClient

type Row = Record<string, unknown>;
interface Res<T = Row> { data: T | null; error: { code?: string; message?: string } | null }

/** Sırrın izolat belleğindeki ömrü. Döndürmede en geç bu kadar sonra yenisine geçilir. */
export const SECRET_TTL_MS = 60_000;

const secretCache = new Map<string, { value: string; at: number }>();

function envOf(key: string): string | undefined {
    // deno-lint-ignore no-explicit-any
    const deno = (globalThis as any).Deno;
    return deno?.env?.get?.(key) || undefined;
}

/**
 * `getSecret` (_shared/wa.ts) ile AYNI çözüm sırası: önce ortam, sonra
 * `app_secrets`. Önbellek YOK — vana gibi taze okunması gerekenler için.
 */
export async function readSecret(admin: Admin, key: string): Promise<string | null> {
    const env = envOf(key);
    if (env) return env;
    const { data } = await admin.from('app_secrets').select('value').eq('key', key).maybeSingle();
    return (data?.value as string | undefined) ?? null;
}

/**
 * İmza sırrı — izolat belleğinde en çok `SECRET_TTL_MS`.
 *
 * Yalnız BULUNAN değer saklanıyor: sır yoksa (503 not_configured) bir sonraki
 * istek yeniden sorar, eksik kurulum onarıldığı an düzelir.
 *
 * `fresh: true` belleği atlar. Kapı bunu imza tutmadığında kullanıyor: sır
 * döndürüldüyse yeni token'lar eski bellekle reddedilmesin (bkz. `index.ts`).
 */
export async function cachedSecret(
    admin: Admin,
    key: string,
    opts: { fresh?: boolean; now?: number } = {},
): Promise<string | null> {
    const now = opts.now ?? Date.now();
    const hit = secretCache.get(key);
    if (!opts.fresh && hit && now - hit.at < SECRET_TTL_MS) return hit.value;
    const value = await readSecret(admin, key);
    if (value) secretCache.set(key, { value, at: now });
    else secretCache.delete(key);
    return value;
}

/** Yalnız testler için. */
export function forgetSecrets(): void {
    secretCache.clear();
}

/** Personel satırının kapıda okunan kolonları — eski sorguyla aynı. */
export const STAFF_GATE_COLS = 'id, organization_id, name, color, role, is_active, session_epoch';
/** `checkAccess` (_shared/entitlement.ts) ile aynı kolonlar. */
export const ENTITLEMENT_COLS = 'state, plan, cycle, trial_ends_at, expires_at, grace_until';

export interface GateInput {
    org: string;
    /** Personel kimliği (`claims.sub`); cihaz belgesinde okunmaz. */
    sub: string;
    /** Telefon kimliği (117); eski belgelerde yok. */
    did?: string | null;
    isDevice: boolean;
    /** Yazma eylemi mi — vana ve idempotens kütüğü yalnız onda okunur. */
    write: boolean;
    /** Yazma eyleminin idempotens anahtarı (kırpılmış). */
    idemKey: string | null;
}

export interface GateResult {
    /** `staff_devices` satırı — `did` yoksa null. */
    device: Res | null;
    /** ENTITLEMENT_ENFORCE değeri ('true' değilse kapı açık). */
    enforce: string | null;
    /** `org_entitlement` satırı. */
    entitlement: Row | null;
    /** Personel satırı — cihaz belgesinde null. */
    staff: Res | null;
    /** Aynı anahtarla daha önce yazılmış cevap — yazma + anahtar yoksa null. */
    prior: Res | null;
    /** MOBILE_WRITES_ENABLED — yazma değilse undefined. */
    writesFlag: string | null | undefined;
}

/**
 * Kapının bütün okumaları TEK turda.
 *
 * Her sorgu token'daki org ile süzülüyor (eskisiyle aynı süzgeçler). Abonelik
 * satırı ENFORCE bayrağını BEKLEMEDEN okunuyor: bayrak kapalıysa satır
 * kullanılmıyor — bir fazla okuma, ama aynı turda.
 */
export async function loadGate(admin: Admin, input: GateInput): Promise<GateResult> {
    const none = Promise.resolve(null);
    const [device, enforce, entitlement, staff, prior, writesFlag] = await Promise.all([
        input.did
            ? admin.from('staff_devices').select('revoked_at')
                .eq('id', input.did).eq('organization_id', input.org).maybeSingle()
            : none,
        admin.from('app_secrets').select('value').eq('key', 'ENTITLEMENT_ENFORCE').maybeSingle()
            .then((r: Res) => (r.data?.value as string | undefined) ?? null),
        admin.from('org_entitlement').select(ENTITLEMENT_COLS)
            .eq('organization_id', input.org).maybeSingle()
            .then((r: Res) => r.data ?? null),
        input.isDevice
            ? none
            : admin.from('staff').select(STAFF_GATE_COLS)
                .eq('id', input.sub).eq('organization_id', input.org).maybeSingle(),
        !input.isDevice && input.write && input.idemKey
            ? admin.from('staff_write_log').select('staff_id, action, status, response')
                .eq('organization_id', input.org).eq('idempotency_key', input.idemKey).maybeSingle()
            : none,
        !input.isDevice && input.write
            ? readSecret(admin, 'MOBILE_WRITES_ENABLED')
            : Promise.resolve(undefined),
    ]);
    return { device, enforce, entitlement, staff, prior, writesFlag };
}
