/**
 * Giriş ekranlarının React'ten bağımsız doğrulama katmanı.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır; bu yüzden Expo, React Native
 * ya da cihaz depolaması bağımlılığı taşımaz.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;

/** Kullanıcı girdisini karşılaştırma ve gönderim için tek biçime getirir. */
export function normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
}

/**
 * Ürünün ihtiyaç duyduğu sade e-posta biçim kontrolü.
 * RFC'nin bütün uç durumlarını taklit etmez; açık yazım hatalarını engeller.
 */
export function isValidEmail(value: string): boolean {
    return EMAIL_PATTERN.test(normalizeEmail(value));
}

export interface PasswordRuleState {
    length: number;
    hasMinLength: boolean;
    hasDigit: boolean;
    valid: boolean;
    message: string;
}

/** Yeni hesap şifresinin tek kural kaynağı. */
export function passwordRuleState(password: string): PasswordRuleState {
    const length = Array.from(password).length;
    const hasMinLength = length >= 8;
    const hasDigit = /[0-9]/.test(password);
    const valid = hasMinLength && hasDigit;

    return {
        length,
        hasMinLength,
        hasDigit,
        valid,
        message: valid
            ? `Şifreniz uygun: ${length} karakter, içinde rakam var.`
            : 'En az 8 karakter olsun, içinde bir rakam bulunsun.',
    };
}

/** Yapıştırılan veya yazılan eşleştirme kodunu altı ASCII rakama indirger. */
export function formatPairingCode(value: string): string {
    return value.replace(/[^0-9]/g, '').slice(0, 6);
}
