/**
 * Giriş v4 · Apple ve Google — telefonun kendi pencereleri.
 *
 * Bu dosya YALNIZ sağlayıcıdan kimlik belgesini (id_token) alır; oturumu
 * açan `src/api/auth.ts` (`signInWithIdToken`). Yol her yerde aynı (karar 10):
 * yönlendirme yok, belge doğrudan giriş servisine.
 *
 * ── Apple ───────────────────────────────────────────────────────────────────
 * Sistemin penceresi (`expo-apple-authentication`). Apple'a nonce'un ÖZETİ,
 * giriş servisine KENDİSİ verilir; servis belgedeki özeti buna göre denetler.
 * Ad yalnız İLK girişte gelir — saklanmazsa bir daha gelmez.
 *
 * ── Google ──────────────────────────────────────────────────────────────────
 * `@react-native-google-signin/google-signin`. Yerel modül Expo Go'da YOK:
 * paketi en üstte içe aktarmak Expo Go'da uygulamayı açılışta düşürürdü
 * (modül yüklenirken `TurboModuleRegistry.getEnforcing` atıyor). Bu yüzden
 * ilk dokunuşta `require` ile, `try` içinde yükleniyor — dinamik `import()`
 * DEĞİL (üretim paketinde kırılıyor, bkz. mobil-uretim-paketi testi).
 * Expo Go'da düğme görünür, basınca "şu an yapılamadı" bandı çıkar.
 *
 * Google'ın nonce'u: iOS kütüphanesi belgeye kendi nonce'unu koyuyor ve onu
 * vermiyor; giriş serviste Google için nonce denetimi kapalı
 * (`GOTRUE_EXTERNAL_GOOGLE_SKIP_NONCE_CHECK=true`, ops/giris).
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import type {
    GoogleSignin as GoogleSigninApi,
    statusCodes as GoogleStatusCodes,
} from '@react-native-google-signin/google-signin';

import type { SocialProvider } from '../api/authStub';

/** Google Cloud · `Luera TimeFlow` — gizli değil (docs/giris-kararlar.md). */
export const GOOGLE_IOS_CLIENT_ID = '477665756267-s0ffn786degg21i01uidr3pnoth7j5e7.apps.googleusercontent.com';
export const GOOGLE_WEB_CLIENT_ID = '477665756267-956h1cq5dn5kbghh52p1lmmgpeqd19vc.apps.googleusercontent.com';

export type CredentialFailure = 'cancelled' | 'unavailable' | 'failed';

export type SocialCredential =
    | {
        ok: true;
        provider: SocialProvider;
        idToken: string;
        /** Yalnız Apple: giriş servisine giden HAM nonce. */
        nonce?: string;
        /** Apple yalnız ilk girişte verir; Google her seferinde. */
        fullName: string | null;
    }
    | { ok: false; reason: CredentialFailure };

/** Apple düğmesi yalnız iOS'ta (karar 8: Android'de Apple yok). */
export async function appleAvailable(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    try {
        return await AppleAuthentication.isAvailableAsync();
    } catch {
        return false;
    }
}

const isCancel = (e: unknown) => (e as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED';

export async function appleCredential(): Promise<SocialCredential> {
    if (!(await appleAvailable())) return { ok: false, reason: 'unavailable' };
    try {
        const nonce = Crypto.randomUUID();
        const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
        const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
                AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
            nonce: hashed,
        });
        if (!credential.identityToken) return { ok: false, reason: 'failed' };
        const fullName = credential.fullName
            ? AppleAuthentication.formatFullName(credential.fullName).trim() || null
            : null;
        return { ok: true, provider: 'apple', idToken: credential.identityToken, nonce, fullName };
    } catch (e) {
        // Pencereyi kişi kapattı: bant yok, ses yok (B4 · çizilmeyen hâl).
        if (isCancel(e)) return { ok: false, reason: 'cancelled' };
        console.warn('[giriş] Apple belgesi alınamadı:', e);
        return { ok: false, reason: 'failed' };
    }
}

/**
 * Hesap silerken Apple'a BİR KEZ DAHA sorulur (TN3194 · B yolu): dönen tek
 * kullanımlık `authorizationCode` `account-delete`e gider, sunucu onu belgeye
 * çevirip Apple'da iptal eder. Bu bir giriş DEĞİL — oturuma dokunulmaz.
 */
export async function appleReauthCode(): Promise<
    { ok: true; code: string } | { ok: false; reason: CredentialFailure }
> {
    if (!(await appleAvailable())) return { ok: false, reason: 'unavailable' };
    try {
        const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
        return credential.authorizationCode
            ? { ok: true, code: credential.authorizationCode }
            : { ok: false, reason: 'failed' };
    } catch (e) {
        if (isCancel(e)) return { ok: false, reason: 'cancelled' };
        console.warn('[hesap sil] Apple yeniden doğrulama:', e);
        return { ok: false, reason: 'failed' };
    }
}

interface GoogleModule {
    GoogleSignin: typeof GoogleSigninApi;
    statusCodes: typeof GoogleStatusCodes;
}

let google: GoogleModule | null | undefined;

function googleModule(): GoogleModule | null {
    if (google !== undefined) return google;
    // Expo Go'da yerel modül yok — yüklemeyi hiç denemiyoruz.
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
        google = null;
        return google;
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const loaded = require('@react-native-google-signin/google-signin') as GoogleModule;
        loaded.GoogleSignin.configure({
            iosClientId: GOOGLE_IOS_CLIENT_ID,
            webClientId: GOOGLE_WEB_CLIENT_ID,
        });
        google = loaded;
    } catch (e) {
        console.warn('[giriş] Google modülü yüklenemedi:', e);
        google = null;
    }
    return google;
}

export async function googleCredential(): Promise<SocialCredential> {
    const mod = googleModule();
    if (!mod) return { ok: false, reason: 'unavailable' };
    const { GoogleSignin, statusCodes } = mod;
    try {
        if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        const result = await GoogleSignin.signIn();
        if (result.type !== 'success') return { ok: false, reason: 'cancelled' };
        // Uygulama Google oturumu TUTMUYOR: belge bir kez kullanılır. Sonraki
        // "Google ile giriş yap" yine hesap seçtirir — aynı telefonu kullanan
        // iki kişi birbirinin hesabına düşmez.
        await GoogleSignin.signOut().catch(() => undefined);
        const idToken = result.data.idToken;
        if (!idToken) return { ok: false, reason: 'failed' };
        return { ok: true, provider: 'google', idToken, fullName: result.data.user.name ?? null };
    } catch (e) {
        const code = (e as { code?: string } | null)?.code;
        if (code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS) {
            return { ok: false, reason: 'cancelled' };
        }
        console.warn('[giriş] Google belgesi alınamadı:', e);
        return { ok: false, reason: 'failed' };
    }
}
