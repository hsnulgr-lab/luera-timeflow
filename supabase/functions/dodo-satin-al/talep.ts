// Ödeme önce akışının SAF kuralları (göç 127) — Deno yok; dodo-satin-al,
// _shared/odemeTalebi.ts ve testler import eder.

export const VALID_PLANS = ['baslangic', 'pro', 'isletme'] as const;
export const VALID_CYCLES = ['monthly', 'yearly'] as const;
export type ClaimPlan = (typeof VALID_PLANS)[number];
export type ClaimCycle = (typeof VALID_CYCLES)[number];

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Aynı adresten 10 dakikada en çok bu kadar ödeme oturumu (herkese açık uç). */
export const START_LIMIT = 10;
export const START_WINDOW_MS = 10 * 60_000;

/** Tarayıcıya giden gizli jeton: 32 rastgele bayt, adres güvenli base64. */
export function newToken(): string {
    const b = crypto.getRandomValues(new Uint8Array(32));
    let s = '';
    for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Jetonun SHA-256'sı (hex) — tabloda yalnız bu durur. */
export async function hashToken(token: string): Promise<string> {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Jeton biçimi: 43 karakter base64url (32 bayt). Başka her şey reddedilir. */
export function validToken(t: unknown): t is string {
    return typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);
}

export function validPlan(p: unknown): p is ClaimPlan {
    return typeof p === 'string' && (VALID_PLANS as readonly string[]).includes(p);
}

export function validCycle(c: unknown): c is ClaimCycle {
    return typeof c === 'string' && (VALID_CYCLES as readonly string[]).includes(c);
}

/**
 * Dodo aboneliği bu talebe mi ait: oturumu biz açtık ve metadata'ya talep
 * kimliğini koyduk. Başkasının abonelik kimliğiyle kendi jetonunu bağlamak
 * buna takılır.
 */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function subBelongsToClaim(sub: any, claimId: string): boolean {
    return sub?.metadata?.claim_id === claimId && sub?.metadata?.module === 'timeflow';
}

/**
 * Hesap açılacak kadar kesin mi: deneme de ödeme de Dodo'da `active` görünür.
 * `pending` (ödeme sürüyor), `failed`, `cancelled` için hesap açılmaz.
 */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function subIsLive(sub: any): boolean {
    return String(sub?.status ?? '') === 'active';
}

/** Dodo'daki e-posta; yoksa boş. Küçük harf, boşluksuz. */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function subEmail(sub: any): string {
    const e = String(sub?.customer?.email ?? '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : '';
}
