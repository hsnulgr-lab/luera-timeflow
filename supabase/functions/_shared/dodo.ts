// Dodo Payments API — sunucu tarafı ortak çağrılar.
//
// Anahtar (`DODO_API_KEY`) ve adres (`DODO_API_BASE`) app_secrets'te; hiçbiri
// istemciye inmez. Her çağrı süre sınırlı: Dodo webhook'u içinden de
// çağrılıyor ve webhook 30 sn içinde cevap vermek zorunda.

import { getSecret, type Admin } from './wa.ts';

export interface DodoApi { base: string; key: string }

const TIMEOUT_MS = 8_000;
/** Bu durumlardaki abonelik bir daha tahsilat yapmaz. */
const TERMINAL = new Set(['cancelled', 'expired', 'failed']);

export async function dodoApi(admin: Admin): Promise<DodoApi | null> {
    const key = await getSecret(admin, 'DODO_API_KEY');
    if (!key) return null;
    const base = (await getSecret(admin, 'DODO_API_BASE')) || 'https://test.dodopayments.com';
    return { base: base.replace(/\/+$/, ''), key };
}

export function dodoFetch(api: DodoApi, path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${api.base}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${api.key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
}

/**
 * Aboneliği okur ve okunamamayı TÜRÜYLE döner:
 *   missing   → Dodo'da yok (404; ör. test kipinden canlıya geçişte kalan kimlik)
 *   transient → ağ, zaman aşımı, 429, 5xx — yeniden denemek düzeltir
 *   failed    → öteki 4xx — yeniden denemek düzeltmez
 */
export type SubLookup =
    // deno-lint-ignore no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | { kind: 'found'; sub: any }
    | { kind: 'missing' | 'transient' | 'failed' };

export async function lookupSubscription(api: DodoApi, id: string): Promise<SubLookup> {
    try {
        const res = await dodoFetch(api, `/subscriptions/${encodeURIComponent(id)}`);
        if (res.ok) return { kind: 'found', sub: await res.json() };
        console.error('dodo get subscription', id, res.status);
        if (res.status === 404) return { kind: 'missing' };
        return { kind: res.status === 429 || res.status >= 500 ? 'transient' : 'failed' };
    } catch (e) {
        console.error('dodo get subscription', id, e);
        return { kind: 'transient' };
    }
}

/** Aboneliğin Dodo'daki anlık hâli; okunamazsa null. */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSubscription(api: DodoApi, id: string): Promise<any | null> {
    const r = await lookupSubscription(api, id);
    return r.kind === 'found' ? r.sub : null;
}

/**
 * Aboneliği ŞİMDİ iptal eder (dönem sonu değil).
 *
 * Dodo iptali reddederse abonelik zaten kapanmış olabilir (süresi dolmuş,
 * daha önce iptal edilmiş): durum okunur ve bir daha tahsilat yapmayacaksa
 * başarı sayılır. Yoksa hesap silme "silindi" diyip faturayı açık bırakırdı.
 */
export async function cancelNow(api: DodoApi, id: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
        const res = await dodoFetch(api, `/subscriptions/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'cancelled' }),
        });
        if (res.ok) return { ok: true };
        console.error('dodo cancel', id, res.status, await res.text().catch(() => ''));
    } catch (e) {
        console.error('dodo cancel', id, e);
    }
    const sub = await getSubscription(api, id);
    if (sub && TERMINAL.has(String(sub.status))) return { ok: true };
    return { ok: false, reason: 'dodo_cancel_failed' };
}
