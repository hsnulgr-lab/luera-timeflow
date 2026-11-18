// İndirim kodu (kupon) — `/satin-al?kod=ANKARA50` reklam bağlantısı.
// Sunucudaki eşi supabase/functions/_shared/indirimKodu.ts; ikisi aynı
// sonucu verir (tests/indirim-kodu.test.mjs). Geçerliliğe Dodo karar verir.

const INDIRIM_KODU = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

/** Boşlukları atar, büyük harfe çevirir; biçime uymazsa null. */
export function indirimKodu(x: unknown): string | null {
    if (typeof x !== 'string') return null;
    const k = x.trim().toUpperCase();
    return INDIRIM_KODU.test(k) ? k : null;
}
