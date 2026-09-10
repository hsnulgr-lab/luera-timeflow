/**
 * Kasaya gönderimin SAHTE sunucu cevabı — SİLİNECEK.
 *
 * `visit.finish` ucu canlıda hazır ama mobil hâlâ `AUTH_MODE=stub`: bugün
 * gerçek bir cevap yok. Ekranın `error` hâli tasarlandı, yazıldı ve test
 * edildi; ama hiçbir yerden tetiklenemediği için telefonda bir kez bile
 * görülemedi.
 *
 * Sonuç RASTGELE DEĞİL ve seyrek de değil — TEK bir randevuya bağlı. Kardeş
 * dosya `mockSend.ts` "her onuncu kart" diyor; orası WhatsApp yazması ve
 * başarısızlık orada olağan bir sonuç. Burada `error` "adisyon kasaya
 * gidemedi, git kasaya sor" demek: onu demo içinde rastgele dağıtmak, normal
 * akışta hata gibi okunurdu. Bilinen tek bir randevuda durması hem
 * görülebilir hem sürpriz değil.
 *
 * SAF KATMAN: React, react-native ve Expo import edilmez.
 */

/** Gönderimi reddedilen tek demo randevusu — günün son işi. */
const REFUSING = 'd5';

/**
 * Sunucunun hata kodu — yoksa null (gönderim geçer).
 *
 * Kod dizisi `sendToCash.errorLine` ile aynı: `already_open`, `forbidden`,
 * `formula_locked`.
 */
export function mockCashResult(reservationId: string | null | undefined): string | null {
    return reservationId === REFUSING ? 'already_open' : null;
}
