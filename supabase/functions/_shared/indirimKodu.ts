// İndirim kodu (kupon) — reklam bağlantısı `/satin-al?kod=ANKARA50`.
// SAF: Deno yok; dodo-satin-al, dodo-checkout ve testler import eder.
// Tarayıcıdaki eşi src/lib/indirimKodu.ts (testte aynı sonucu verdiği sınanır).
//
// Kodun geçerli olup olmadığına Dodo karar verir; burada yalnız biçim
// süzülür: adresten gelen keyfi metin ödeme isteğine taşınmasın.

/** Harf/rakamla başlar; harf, rakam, alt çizgi, tire; 3–32 karakter. */
export const INDIRIM_KODU = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

/** Boşlukları atar, büyük harfe çevirir; biçime uymazsa null. */
export function indirimKodu(x: unknown): string | null {
    if (typeof x !== 'string') return null;
    const k = x.trim().toUpperCase();
    return INDIRIM_KODU.test(k) ? k : null;
}

/**
 * Dodo ödeme oturumunu kodla açar; Dodo kodu REDDEDERSE (4xx: süresi
 * dolmuş, bu ürüne tanımlı değil, yazım yanlış) bir kez KODSUZ dener.
 * Reklamdan gelen salon kırık bir kupon yüzünden ödeme sayfasına
 * ulaşamamasın; indirim satırı Dodo sayfasında görünmez, kişi tam fiyatı
 * görür. Kodun düştüğü günlüğe yazılır (Dodo panelinden kuponu kontrol et).
 */
export async function kodlaAc(
    post: (kod: string | null) => Promise<Response>,
    kod: string | null,
    etiket: string,
): Promise<{ res: Response; kodDustu: boolean }> {
    const res = await post(kod);
    if (res.ok || !kod || res.status < 400 || res.status >= 500) return { res, kodDustu: false };
    console.warn(`${etiket}: Dodo '${kod}' kodunu reddetti, kodsuz deneniyor`, res.status, await res.text().catch(() => ''));
    return { res: await post(null), kodDustu: true };
}
