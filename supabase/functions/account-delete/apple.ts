/**
 * Apple belge iptali — TN3194 · "B yolu" (karar 2026-10-19).
 *
 * Hesap silinirken istemci Apple'a BİR KEZ DAHA sorar ve tek kullanımlık
 * `authorization_code` gönderir. Burada:
 *   1. `.p8` anahtarıyla (ES256) kısa ömürlü istemci sırrı imzalanır,
 *   2. kod `appleid.apple.com/auth/token`'da belgeye çevrilir,
 *   3. dönen `id_token.sub` bu hesabın Apple kimliğiyle karşılaştırılır,
 *   4. belge `appleid.apple.com/auth/revoke` ile iptal edilir.
 * Belge HİÇBİR YERE yazılmaz (A yolu — girişte saklamak — reddedildi).
 *
 * ── Hata kuralı ─────────────────────────────────────────────────────────────
 *   • Kod geçersiz/süresi dolmuş (invalid_grant)  → 'code_invalid': silme DURUR,
 *     istemci yeniden doğrulatır (kod 5 dk geçerli, tek kullanımlık).
 *   • Başka bir Apple Kimliği                      → 'mismatch': silme DURUR.
 *   • Apple'a ulaşılamıyor / anahtar yapılandırılmamış / iptal reddedildi
 *                                                  → 'skipped': silme YAPILIR,
 *     log'a yazılır. Silme hakkı bir Apple kesintisine takılmamalı; kişi bağı
 *     Ayarlar → Apple Kimliği'nden kendisi de kaldırabilir.
 *
 * Core'a ya da `_shared`'a bağımlılık YOK (deploy dersi: `_shared` değişince
 * bütün fonksiyonlar yeniden gönderilmeli).
 */

const TEAM_ID = '5MYM3Z5C9R';
const KEY_ID = 'NSKX9A75PZ';
const AUD = 'https://appleid.apple.com';

/** Kodun hangi istemciden geldiği → Apple'daki istemci kimliği. */
const CLIENT_IDS: Record<string, string> = {
    web: 'ai.luera.timeflow.web',
    ios: 'ai.luera.timeflow',
};
/** Web kodunun takasında `redirect_uri` zorunlu ve Services ID'de kayıtlı olmalı. */
const WEB_REDIRECTS = new Set(['https://timeflow.lueratech.com/login']);

export type AppleOutcome =
    | { kind: 'revoked' }
    | { kind: 'skipped'; reason: string }
    | { kind: 'code_invalid' }
    | { kind: 'mismatch' }
    | { kind: 'bad_request'; reason: string };

const b64url = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

function pemToPkcs8(pem: string): Uint8Array {
    const body = pem.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '');
    const bin = atob(body);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/** ES256 istemci sırrı — 5 dakika geçerli; yalnız bu istek için. */
export async function clientSecret(pem: string, clientId: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
    const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(pem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const head = b64urlJson({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' });
    const body = b64urlJson({ iss: TEAM_ID, iat: now, exp: now + 300, aud: AUD, sub: clientId });
    const data = new TextEncoder().encode(`${head}.${body}`);
    // WebCrypto ECDSA imzası IEEE P1363 (r‖s, 64 bayt) — JWS ES256'nın istediği biçim.
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, data));
    return `${head}.${body}.${b64url(sig)}`;
}

function subOf(idToken: unknown): string | null {
    if (typeof idToken !== 'string') return null;
    try {
        const part = idToken.split('.')[1] ?? '';
        const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
        const sub = (JSON.parse(json) as { sub?: unknown }).sub;
        return typeof sub === 'string' ? sub : null;
    } catch {
        return null;
    }
}

/**
 * @param expectedSub hesabın Apple kimliğindeki `sub` (auth.identities).
 * @param pem `APPLE_SIGNIN_KEY` — yoksa iptal atlanır, silme sürer.
 */
export async function revokeApple(input: {
    code: string; client: string; redirectUri?: string | null; expectedSub: string | null; pem: string | null;
}): Promise<AppleOutcome> {
    const clientId = CLIENT_IDS[input.client];
    if (!clientId) return { kind: 'bad_request', reason: 'unknown_client' };
    if (input.client === 'web' && !(input.redirectUri && WEB_REDIRECTS.has(input.redirectUri))) {
        return { kind: 'bad_request', reason: 'bad_redirect' };
    }
    if (!input.pem) return { kind: 'skipped', reason: 'not_configured' };

    let secret: string;
    try { secret = await clientSecret(input.pem, clientId); } catch (e) {
        console.error('apple client secret', e);
        return { kind: 'skipped', reason: 'bad_key' };
    }

    // 1) Kod → belge
    const form = new URLSearchParams({ client_id: clientId, client_secret: secret, code: input.code, grant_type: 'authorization_code' });
    if (input.client === 'web' && input.redirectUri) form.set('redirect_uri', input.redirectUri);
    let tokenRes: Response;
    try {
        tokenRes = await fetch(`${AUD}/auth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    } catch (e) {
        console.error('apple token unreachable', e);
        return { kind: 'skipped', reason: 'unreachable' };
    }
    const tokenBody = await tokenRes.json().catch(() => ({})) as { error?: string; refresh_token?: string; access_token?: string; id_token?: string };
    if (!tokenRes.ok) {
        if (tokenBody.error === 'invalid_grant') return { kind: 'code_invalid' };
        console.error('apple token failed', tokenRes.status, tokenBody.error);
        return { kind: 'skipped', reason: `token_${tokenRes.status}_${tokenBody.error ?? 'unknown'}` };
    }

    // 2) Bu hesabın Apple'ı mı? Belge Apple'dan TLS ile doğrudan geldi — imza
    //    doğrulaması gerekmez, yalnız `sub` karşılaştırılır.
    const sub = subOf(tokenBody.id_token);
    if (input.expectedSub && sub && sub !== input.expectedSub) return { kind: 'mismatch' };

    // 3) İptal
    const token = tokenBody.refresh_token ?? tokenBody.access_token;
    if (!token) return { kind: 'skipped', reason: 'no_token' };
    try {
        const rv = await fetch(`${AUD}/auth/revoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId, client_secret: secret, token,
                token_type_hint: tokenBody.refresh_token ? 'refresh_token' : 'access_token',
            }),
        });
        if (!rv.ok) {
            console.error('apple revoke failed', rv.status, await rv.text().catch(() => ''));
            return { kind: 'skipped', reason: `revoke_${rv.status}` };
        }
    } catch (e) {
        console.error('apple revoke unreachable', e);
        return { kind: 'skipped', reason: 'unreachable' };
    }
    return { kind: 'revoked' };
}
