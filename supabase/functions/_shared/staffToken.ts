// Personel oturum token'ı — HS256 JWT, tek kaynak.
//
// Neden Supabase Auth kullanıcısı değil: her personele gerçek bir Auth
// kullanıcısı açmak (davet akışı + tüm tabloların RLS politikalarının yeniden
// yazımı) haftalar sürer ve yedi sektörün tamamını riske atar. Dar çözüm:
// personel cihazı YALNIZ bu token'ı taşır, veriye doğrudan erişemez; her istek
// staff-api'den geçer ve orada sunucu tarafında daraltılır.
//
// Token'ın kendisi bir yetki BELGESİ değil, bir KİMLİK belgesidir: içinde ne
// yapabileceği değil, kim olduğu yazar. Yetki her istekte rolden yeniden
// türetilir — eski token yeni yetkiyi taşımasın diye.

export interface StaffClaims {
    /** staff.id */
    sub: string;
    /** organization_id */
    org: string;
    /** staff.role — yalnız bilgi amaçlı; yetki her istekte DB'den tazelenir. */
    role: string;
    /** staff.session_epoch — DB'dekiyle eşleşmezse token ölü sayılır. */
    epoch: number;
    iat: number;
    exp: number;
}

/** 12 saat: bir vardiya. Daha uzunu çalınan cihazda fazla pencere açar. */
export const STAFF_TOKEN_TTL_SEC = 12 * 60 * 60;

/**
 * Cihaz token'ı 90 gün. Personel token'ından uzun olması bilinçli: cihaz
 * eşleme kurulum işidir, her gün tekrarlanamaz. Cihazın tek yetkisi personel
 * listesini görmek ve PIN denemek — kendi başına hiçbir veriye erişmez.
 */
export const DEVICE_TOKEN_TTL_SEC = 90 * 24 * 60 * 60;

/** Art arda kaç yanlış PIN'den sonra kilit. */
export const PIN_MAX_ATTEMPTS = 5;
/** Kilit süresi (dakika). Kalıcı kilit, salonu işlemez hâle getirirdi. */
export const PIN_LOCK_MINUTES = 15;

const enc = new TextEncoder();

const b64url = (bytes: Uint8Array): string =>
    btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const b64urlJson = (value: unknown): string => b64url(enc.encode(JSON.stringify(value)));

function fromB64url(input: string): Uint8Array {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/')
        + '='.repeat((4 - (input.length % 4)) % 4);
    const raw = atob(padded);
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function key(secret: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw', enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign', 'verify'],
    );
}

export async function mintStaffToken(
    claims: Omit<StaffClaims, 'iat' | 'exp'>,
    secret: string,
    nowSec = Math.floor(Date.now() / 1000),
    ttlSec = STAFF_TOKEN_TTL_SEC,
): Promise<string> {
    const payload: StaffClaims = { ...claims, iat: nowSec, exp: nowSec + ttlSec };
    const head = b64urlJson({ alg: 'HS256', typ: 'JWT' });
    const body = b64urlJson(payload);
    const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(`${head}.${body}`));
    return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

export type VerifyResult =
    | { ok: true; claims: StaffClaims }
    | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

/**
 * İmzayı ve süreyi doğrular. `epoch` KONTROL EDİLMEZ — o, DB'deki güncel
 * değerle karşılaştırılmak üzere çağırana bırakılır (bkz. staff-api).
 */
export async function verifyStaffToken(
    token: string,
    secret: string,
    nowSec = Math.floor(Date.now() / 1000),
): Promise<VerifyResult> {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return { ok: false, reason: 'malformed' };
    const [head, body, sig] = parts;

    let valid = false;
    try {
        valid = await crypto.subtle.verify(
            'HMAC', await key(secret), fromB64url(sig), enc.encode(`${head}.${body}`),
        );
    } catch {
        return { ok: false, reason: 'malformed' };
    }
    // Algoritma başlıktan OKUNMAZ: "alg: none" ve HS/RS karışıklığı JWT'nin en
    // bilinen açığı. Doğrulama her zaman HS256.
    if (!valid) return { ok: false, reason: 'bad_signature' };

    let claims: StaffClaims;
    try {
        claims = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    } catch {
        return { ok: false, reason: 'malformed' };
    }
    if (typeof claims?.sub !== 'string' || typeof claims?.org !== 'string'
        || typeof claims?.epoch !== 'number' || typeof claims?.exp !== 'number') {
        return { ok: false, reason: 'malformed' };
    }
    if (claims.exp <= nowSec) return { ok: false, reason: 'expired' };
    return { ok: true, claims };
}

/** PIN hash'i — istemcideki src/lib/pin.ts ile AYNI olmak zorunda. */
export async function hashPin(pin: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(String(pin).trim()));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sabit süreli karşılaştırma. Hash eşitliğinde zamanlama sızıntısı pratikte
 * zayıf bir vektör ama maliyeti sıfır ve `===` görmenin denetimde
 * açıklaması yok.
 */
export function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
