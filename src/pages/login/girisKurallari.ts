// Masaüstü girişin saf kuralları: sunucu hatalarının sınıflanması, şifre ve
// e-posta denetimi, ekranda görünen metinler.
//
// Saf modül — içe aktarım yok: tests/masaustu-giris.test.mjs doğrudan import
// eder (`@/` alias'ı Node'da çözülmez).
//
// SIZDIRMAMA: hiçbir metin bir e-postanın kayıtlı olup olmadığını söylemez.
// Kayıtta da şifre yenilemede de ekran her zaman "kod gönderdik" der.

export type AuthFailure =
    | 'invalid_credentials'
    | 'not_confirmed'
    | 'exists'
    | 'rate_limited'
    | 'email_rate_limited'
    | 'otp_invalid'
    | 'weak_password'
    | 'same_password'
    | 'invalid_email'
    | 'offline'
    | 'unknown';

export interface AuthErrorLike {
    code?: string | null;
    status?: number | null;
    name?: string | null;
    message?: string | null;
}

/**
 * GoTrue hatası → ekranın bildiği tek bir sınıf.
 *
 * Kod (`error.code`) önce; eski sunucular kod göndermediği için ileti metni
 * yedek. Yanlış kod ile süresi dolmuş kod sunucudan AYNI cevabı alıyor
 * (`otp_expired` · "Token has expired or is invalid") — ayırt edilemez, tek
 * sınıf.
 */
export function classifyAuthError(err: AuthErrorLike | null | undefined): AuthFailure {
    if (!err) return 'unknown';
    const code = err.code ?? '';
    const msg = err.message ?? '';
    if (err.name === 'AuthRetryableFetchError' || /failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
        return 'offline';
    }
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return 'invalid_credentials';
    if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) return 'not_confirmed';
    if (code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(msg)) return 'exists';
    if (code === 'over_email_send_rate_limit' || /only request this after|email rate limit/i.test(msg)) return 'email_rate_limited';
    if (code === 'over_request_rate_limit' || err.status === 429) return 'rate_limited';
    if (code === 'otp_expired' || /token has expired or is invalid/i.test(msg)) return 'otp_invalid';
    if (code === 'weak_password') return 'weak_password';
    if (code === 'same_password') return 'same_password';
    if (code === 'email_address_invalid' || /invalid format|unable to validate email/i.test(msg)) return 'invalid_email';
    return 'unknown';
}

/** "En az 8 karakter olsun, içinde bir rakam bulunsun." — telefondakiyle aynı kural. */
export function passwordOk(password: string): boolean {
    return password.length >= 8 && /\d/.test(password);
}

export function emailLooksValid(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Kod alanı: yalnız rakam, en çok 6. Yapıştırılan "123 456" de kabul. */
export function cleanCode(raw: string): string {
    return raw.replace(/\D/g, '').slice(0, 6);
}

/** Yeniden gönder sayacı: "· 0:59". */
export function formatCountdown(seconds: number): string {
    const s = Math.max(0, Math.ceil(seconds));
    return `· ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Yeni kod isteme aralığı — sunucunun e-posta başına bekleme süresiyle aynı. */
export const RESEND_SECONDS = 60;

/** Sunucu kilit süresi vermiyor: düğme bu kadar kapalı kalır, metin süre yazmaz. */
export const LOCK_SECONDS = 60;

export const METIN = {
    passwordRule: 'En az 8 karakter olsun, içinde bir rakam bulunsun.',
    wrongCredentials: 'E-posta veya şifre hatalı.',
    tooMany: 'Çok fazla deneme yapıldı. Birkaç dakika sonra yeniden deneyin.',
    offline: 'İnternet bağlantınız yok. Bağlantı gelince yeniden deneyin.',
    loginFailed: 'Giriş şu an yapılamadı. Biraz sonra yeniden deneyin.',
    signupFailed: 'Hesap şu an açılamadı. Biraz sonra yeniden deneyin.',
    fillLogin: 'E-posta ve şifrenizi yazın.',
    badEmail: 'Geçerli bir e-posta adresi yazın.',
    weakPassword: 'Şifre en az 8 karakter olmalı ve içinde bir rakam bulunmalı.',
    samePassword: 'Yeni şifre eskisiyle aynı olamaz.',
    codeWrong: 'Kod doğru değil ya da süresi doldu.',
    resendLater: 'Yeni kodu biraz sonra isteyebilirsiniz.',
    passwordSaveFailed: 'Şifre şu an kaydedilemedi. Biraz sonra yeniden deneyin.',
    existingAccount: 'Bu e-postayla zaten hesabınız var — giriş yaptınız.',
} as const;

/** Apple / Google hatası — bant sağlayıcı düğmelerinin üstünde (M2f). */
export function ssoFailedText(provider: 'apple' | 'google', intent: 'login' | 'signup'): string {
    const who = provider === 'apple' ? 'Apple' : 'Google';
    return intent === 'login'
        ? `${who} ile giriş şu an yapılamadı. E-postanızla deneyebilirsiniz.`
        : `${who} ile kayıt şu an yapılamadı. E-postanızla deneyebilirsiniz.`;
}
