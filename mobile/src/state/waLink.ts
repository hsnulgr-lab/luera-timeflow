// Müdür 37 · bağlama penceresi ile onu açan ekranlar arasındaki köprü.
//
// Pencere tam ekran bir rota (`(manager-flow)/whatsapp-bagla`); kapanınca
// açıldığı yere döner. Dönülen ekran iki şeyi bilmek ister:
//   - WhatsApp sayfası: F1'de "Test mesajı gönder"e mi basıldı (test alanına
//     odaklanılır),
//   - randevu onayı (A3): pencere açıldıktan sonra hat bağlandı mı (A3b).
// Veri taşımıyor; yalnız iki işaret. Uygulama kapanınca sıfırlanır, doğrusu da bu.

let linkedAt = 0;
let wantTest = false;
let dropped = false;

/**
 * Gün ekranının okuduğu hat durumu "düştü" mü. Eylem hapı kelimesini buradan
 * alır ("bağlantısı düştü · buradan yeniden bağlanır"); kelime yalnız hap
 * açılınca görünür, okuma ondan önce biter. Prop olarak beş kat bileşenden
 * geçirmek yerine tek işaret.
 */
export function setLineDropped(v: boolean): void {
    dropped = v;
}

export function lineDropped(): boolean {
    return dropped;
}

/** F1'e ulaşıldı: hat bağlandı. */
export function markLinked(): void {
    linkedAt = Date.now();
}

/** F1 · "Test mesajı gönder": sayfa açılınca test alanına odaklanır. */
export function requestTestFocus(): void {
    wantTest = true;
}

/** Bir kez okunur: okuyan ekran işareti tüketir. */
export function consumeTestFocus(): boolean {
    const v = wantTest;
    wantTest = false;
    return v;
}

/** `since` anından sonra bağlandı mı (A3 → A3b). */
export function linkedSince(since: number): boolean {
    return linkedAt > 0 && linkedAt >= since;
}
