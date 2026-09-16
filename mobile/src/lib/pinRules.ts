// Personel şifresinin kuralı — TEK KAYNAK, iki kopya.
//
// Bu dosyanın aynısı `supabase/functions/_shared/pinRules.ts`. Telefon kuralı yazarken
// kontrol ediyor (kullanıcı beklemesin), sunucu kaydederken yeniden ediyor
// (telefona güvenilmez). İkisinin ayrışmaması `tests/staff-pin-setup.test.mjs`
// ile korunuyor: iki dosya aynı girdilere aynı cevabı vermek zorunda.
//
// Import YOK: Deno'da da Node testinde de aynen çalışır.

/** Personel şifresi dört hane — telefon tuş takımı ve masaüstü Personel Modu aynı. */
export const PIN_LENGTH = 4;

export type PinProblem = 'format' | 'weak';

/**
 * Şifre kabul edilebilir mi? `null` = sorun yok.
 *
 * "Zayıf" dar tutuldu: yalnız herkesin ilk denediği şifreler — dört aynı hane
 * (0000, 7777) ve düz sıra (1234, 4321, 6789). Doğum yılı gibi şeyleri
 * yasaklamak personeli kâğıda yazmaya iter; o daha kötü.
 */
export function pinProblem(pin: string): PinProblem | null {
    if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return 'format';
    const digits = [...pin].map(Number);
    if (digits.every((d) => d === digits[0])) return 'weak';
    const steps = digits.slice(1).map((d, i) => d - digits[i]);
    if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return 'weak';
    return null;
}
