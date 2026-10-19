// Apple ve Google ile giriş — masaüstü (web).
//
// Sunucu ayağı (2026-10-19'da canlı): giriş servisinde Apple + Google açık,
// kayıt tetikleyicisi Apple/Google hesabına kendiliğinden işletme açmıyor,
// `create_own_business()` ve 24 saatlik temizlik göç 121'de
// (docs/giris-kararlar.md · devir 11).
//
// Yollar (karar 10 — sunucunun iç adresine dokunmadan):
//   · Apple  → Apple JS açılır pencere → kimlik belgesi → signInWithIdToken.
//   · Google → giriş servisinin kendi Google yönlendirmesi (signInWithOAuth);
//     dönüşte oturum adres satırından okunur. Niyet (giriş/kayıt) yönlendirme
//     boyunca sessionStorage'da taşınır.
import { supabase } from '@/lib/supabase';

export type Provider = 'apple' | 'google';
export type Intent = 'login' | 'signup';

// AÇIK (2026-10-19, kullanıcı kararı: "herkese, tam işlevsel"). Sunucu tarafı
// aynı gece açıldı (göç 121 + giriş servisi). Acil kapatma: Coolify'da masaüstü
// uygulamasına `VITE_SOCIAL_LOGIN=0` + yeniden deploy — düğmeler kalkar,
// e-postayla giriş aynen çalışır.
export const SOCIAL_ENABLED = import.meta.env.VITE_SOCIAL_LOGIN !== '0';
// Apple web kimliği (Services ID) gizli değil; ortam değişkeni yoksa bu.
const APPLE_SERVICES_ID = (import.meta.env.VITE_APPLE_SERVICES_ID as string | undefined) || 'ai.luera.timeflow.web';

const INTENT_KEY = 'tf.giris.niyet';
const INTENT_TTL_MS = 10 * 60 * 1000;

interface StoredIntent { intent: Intent; provider: Provider; search: string; at: number }

function rememberIntent(value: Omit<StoredIntent, 'at'>): void {
    try { sessionStorage.setItem(INTENT_KEY, JSON.stringify({ ...value, at: Date.now() })); } catch { /* özel pencere: niyet kaybolur, giriş sayılır */ }
}

/** Google dönüşünde bir kez okunur ve silinir; 10 dakikadan eskiyse yok sayılır. */
export function takeIntent(): StoredIntent | null {
    try {
        const raw = sessionStorage.getItem(INTENT_KEY);
        sessionStorage.removeItem(INTENT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredIntent;
        if (Date.now() - parsed.at > INTENT_TTL_MS) return null;
        return parsed;
    } catch {
        return null;
    }
}

/** Google'a yönlendirir; başarılıysa sayfa terk edilir. */
export async function startGoogle(intent: Intent, search: string): Promise<boolean> {
    rememberIntent({ intent, provider: 'google', search });
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/login${search}` },
    });
    if (error) { takeIntent(); return false; }
    return true;
}

// ── Apple ───────────────────────────────────────────────────────────────────

interface AppleSignInResponse { authorization?: { id_token?: string; code?: string } }
interface AppleIdGlobal {
    auth: {
        init(config: { clientId: string; scope: string; redirectURI: string; usePopup: boolean; nonce: string; state?: string }): void;
        signIn(): Promise<AppleSignInResponse>;
    };
}
declare global { interface Window { AppleID?: AppleIdGlobal } }

const APPLE_JS = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/tr_TR/appleid.auth.js';
let appleScript: Promise<void> | null = null;

function loadAppleJs(): Promise<void> {
    if (window.AppleID) return Promise.resolve();
    if (!appleScript) {
        appleScript = new Promise<void>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = APPLE_JS;
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => { appleScript = null; reject(new Error('apple_js')); };
            document.head.appendChild(s);
        });
    }
    return appleScript;
}

function randomNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Apple'a açılır pencereyle gider. Apple'a nonce'un özeti, giriş servisine
 * kendisi verilir — servis belgedeki özeti buna göre denetler.
 * Pencere kapatılırsa 'cancelled': bant yok, ekran sessizce döner (M2e notu).
 */
export async function signInWithApple(): Promise<'ok' | 'cancelled' | 'failed'> {
    if (!APPLE_SERVICES_ID) return 'failed';
    try {
        await loadAppleJs();
        const apple = window.AppleID;
        if (!apple) return 'failed';
        const nonce = randomNonce();
        apple.auth.init({
            clientId: APPLE_SERVICES_ID,
            scope: 'name email',
            redirectURI: `${window.location.origin}/login`,
            usePopup: true,
            nonce: await sha256Hex(nonce),
        });
        const res = await apple.auth.signIn();
        const token = res.authorization?.id_token;
        if (!token) return 'failed';
        const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce });
        return error ? 'failed' : 'ok';
    } catch (e) {
        const code = (e as { error?: string } | null)?.error;
        if (code === 'popup_closed_by_user' || code === 'user_cancelled_authorize') return 'cancelled';
        return 'failed';
    }
}

// ── Hesap silme: Apple ile yeniden doğrulama (TN3194 · B yolu) ─────────────

/**
 * Hesabı silerken Apple'a bir kez daha sorulur; dönen TEK KULLANIMLIK
 * `authorization.code` `account-delete`'e gider ve sunucu onu belgeye çevirip
 * Apple'da iptal eder (Apple Kimliği → "Apple ile Giriş" listesinden
 * TimeFlow düşer). Belge hiçbir yerde SAKLANMAZ — karar: 2026-10-19, B yolu.
 *
 * Bu bir giriş DEĞİL: Supabase oturumuna dokunulmaz. `redirectURI` Services
 * ID'de kayıtlı TEK adres olan `…/login` olmak zorunda (Ayarlar'dan
 * çağrılsa da) — açılır pencere ana sayfayı yönlendirmez.
 */
export type AppleReauth =
    | { ok: true; code: string; idToken: string | null; redirectUri: string }
    | { ok: false; reason: 'cancelled' | 'unreachable' | 'failed' };

export async function appleReauth(): Promise<AppleReauth> {
    if (!APPLE_SERVICES_ID) return { ok: false, reason: 'failed' };
    try { await loadAppleJs(); } catch { return { ok: false, reason: 'unreachable' }; }
    const apple = window.AppleID;
    if (!apple) return { ok: false, reason: 'unreachable' };
    const redirectUri = `${window.location.origin}/login`;
    try {
        apple.auth.init({
            clientId: APPLE_SERVICES_ID,
            scope: 'name email',
            redirectURI: redirectUri,
            usePopup: true,
            nonce: await sha256Hex(randomNonce()),
        });
        const res = await apple.auth.signIn();
        const code = res.authorization?.code;
        if (!code) return { ok: false, reason: 'failed' };
        return { ok: true, code, idToken: res.authorization?.id_token ?? null, redirectUri };
    } catch (e) {
        const err = (e as { error?: string } | null)?.error;
        if (err === 'popup_closed_by_user' || err === 'user_cancelled_authorize') return { ok: false, reason: 'cancelled' };
        if (err === 'popup_blocked_by_browser') return { ok: false, reason: 'failed' };
        return { ok: false, reason: navigator.onLine === false ? 'unreachable' : 'failed' };
    }
}

/** Apple kimlik belgesinin `sub`'ı — yalnız istemcide "bu hesabın Apple'ı mı" ön kontrolü. Sunucu yeniden doğrular. */
export function appleSubOf(idToken: string | null): string | null {
    if (!idToken) return null;
    try {
        const part = idToken.split('.')[1] ?? '';
        const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
        const sub = (JSON.parse(json) as { sub?: unknown }).sub;
        return typeof sub === 'string' ? sub : null;
    } catch {
        return null;
    }
}

// ── Giriş sonrası: işletme var mı? ──────────────────────────────────────────

/** Kişinin üyesi olduğu işletme sayısı; okunamazsa null. */
export async function businessCount(userId: string): Promise<number | null> {
    const { count, error } = await supabase
        .from('organization_members')
        .select('org_id', { count: 'exact', head: true })
        .eq('user_id', userId);
    return error ? null : (count ?? 0);
}

/** Köprüde "Yeni işletme oluştur" ve Apple/Google ile kayıt: işletmeyi açar. */
export async function createOwnBusiness(): Promise<boolean> {
    const { error } = await supabase.rpc('create_own_business');
    return !error;
}
