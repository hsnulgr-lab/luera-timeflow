/**
 * Jetonu sunucuya YENİDEN yazmalı mıyız — saf karar katmanı, React'siz.
 *
 * Kayıt ucu ucuz ama bedava değil ve her öne dönüşte çağrılıyor. Öte yandan
 * ATLANAN bir kayıt, sessizce bildirimsiz kalan bir telefon demek. İkisinin
 * arasındaki çizgi burada, tek yerde ve test edilebilir hâlde.
 *
 * ── Üç gerçek tetikleyici ───────────────────────────────────────────────────
 *   • Jeton değişti — yeniden kurulum, yedekten dönüş, Expo projesi değişimi.
 *   • Personel değişti — ORTAK TELEFONDA en önemlisi. A çıkıp B girdiğinde
 *     satır B'ye dönmezse A'nın bildirimleri B'nin elinde çalar.
 *   • Kayıt bayatladı — `last_seen_at` tazelensin ki "hangi cihaz hâlâ
 *     kullanımda" sorusunun cevabı olsun.
 */

/** Bu kadar zaman geçtiyse, hiçbir şey değişmese bile kayıt tazelenir. */
export const REGISTER_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

export interface RegistrationInput {
    /** `pushPermission.stateOf` sonucu. */
    granted: boolean;
    token: string | null;
    staffId: string | null;
    /** Son BAŞARILI kaydın bilgisi (cihazda saklı). */
    lastToken: string | null;
    lastStaffId: string | null;
    lastAt: number;
    now: number;
}

export function shouldRegister(input: RegistrationInput): boolean {
    // İzin yoksa jeton da yok; olmayan şeyi yazmaya çalışmak boş istek.
    if (!input.granted || !input.token || !input.staffId) return false;
    if (input.token !== input.lastToken) return true;
    if (input.staffId !== input.lastStaffId) return true;
    return input.now - input.lastAt >= REGISTER_REFRESH_MS;
}

/**
 * İzin GERİ ALINDI mı — jetonu sunucudan koparmalı mıyız?
 *
 * OS ayarından bildirimi kapatan kullanıcı için APNs bir sonraki gönderimde
 * `DeviceNotRegistered` döndürüyor ve satır kendiliğinden budanıyor. FCM her
 * zaman böyle davranmıyor. İkisini beklemek yerine öne dönüşte kendimiz
 * bakıyoruz: kayıtlı bir jeton varken izin yoksa satır gitmeli.
 */
export function shouldUnregister(input: { granted: boolean; lastToken: string | null }): boolean {
    return !input.granted && Boolean(input.lastToken);
}
