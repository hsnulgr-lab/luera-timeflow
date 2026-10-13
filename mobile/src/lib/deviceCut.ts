/**
 * KAYIP TELEFON — "Telefonun bağlantısını kopar" (117 · 2026-10-13).
 *
 * Kullanıcı kararı: koparma yetkisi işletme sahibinde. Şifreyi sıfırlamak
 * bu işi görmüyordu: oturum düşüyor ama telefon işletmeye bağlı kalıyor ve
 * 099'da "şifresi yoksa kendisi belirler" — telefonu bulan kişi yeni şifre
 * belirleyip girebiliyordu. Sahibin doğal tepkisi açığı büyütüyordu.
 *
 * Sunucuda ne olduğu (`staff-api · staff.devices.cut`): açık oturum düşer,
 * kişi o andan önce bağlanmış hiçbir telefondan giremez ve şifre
 * belirleyemez, kişinin telefonları iptal edilir, telefon bildirimi silinir.
 * Şifre DEĞİŞMEZ.
 *
 * Saf — React ve Expo taşımıyor; Node testleri doğrudan okuyor.
 */

import type { TeamFailure } from './teamAccess';

export const CUT_TITLE = 'Telefonun bağlantısını kopar';

/** Kişinin sayfasındaki satırın alt yazısı. */
export const CUT_ROW_SUB = 'Kayıp ya da çalınan telefon · şifresi değişmez';

/** Onay sayfasının giriş cümlesi — neden sıfırlama değil de bu. */
export const CUT_LEAD = 'Telefon kaybolduysa ya da çalındıysa. Şifreyi sıfırlamak yetmez: telefon işletmeye bağlı kalır.';

export const CUT_LINES: readonly string[] = [
    'Açık oturumu hemen kapanır.',
    'Şimdiye kadar bağlandığı telefonlar işletmeden çıkar; o telefonlarda giremez, şifre de belirlenemez.',
    'Kaybolan telefona bildirim gitmez.',
    'Şifresi değişmez. Yeni telefonunu Telefon bağla ile bağlar ve aynı şifreyle girer.',
    'Ortak bir tabletten giriyorsa o tablet de Telefon bağla ile yeniden bağlanır.',
];

/** Şifre sıfırlama sayfasındaki uyarı — yanlış aracı seçen doğrusunu görsün. */
export const CUT_RESET_HINT = 'Telefonu kaybolduysa sıfırlamak yetmez; kişinin sayfasındaki “Telefonun bağlantısını kopar”ı kullanın.';

export const CUT_ACTION = 'Bağlantıyı kopar';
export const CUT_BUSY = 'Koparılıyor…';

/** Koparılamadıysa — telefonun hâlâ bağlı olduğunu söylüyor. */
export function cutProblem(reason: TeamFailure): string {
    switch (reason) {
        case 'owner_required': return 'Bağlantıyı yalnız işletme sahibi koparabilir.';
        case 'offline': return 'İnternet yok. Telefon hâlâ bağlı; bağlanınca tekrar deneyin.';
        default: return 'Koparılamadı. Telefon hâlâ bağlı olabilir; birazdan tekrar deneyin.';
    }
}
