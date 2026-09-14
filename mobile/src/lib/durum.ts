/**
 * DURUM DİLİ — `Luera Mobil - Durumlar.html` turunun kural katmanı. Saf.
 *
 * ── Neden bu dosya var ──────────────────────────────────────────────────────
 * Tur ÜRETİLMİŞTİ ve uygulanmadı. Bu arada canlıya geçerken sekiz ayrı durum
 * bloğu yazdım — her biri kendi bağlamında doğru görünen ölçülerle, hiçbiri
 * ötekine bakmadan. Sonuç ölçüldüğünde şu çıktı:
 *
 *   • üç ayrı düğme puntosu (12.5 / 13 / 14), iki ayrı yükseklik (34 / 40)
 *   • aynı eylem için üç kelime: "Tekrar dene" · "Yenile" · "Listeyi tazele"
 *   • ve en kötüsü, AĞIRLIK TERS: personelin adisyonunu kaybettiğini söyleyen
 *     blok (34 pt), listenin bir saniye geç geldiğini söyleyenden (40 pt)
 *     KÜÇÜKTÜ
 *
 * Kurallar burada, saf ve çalıştırılabilir hâlde duruyor ki bir daha
 * gözden kaçmasın — testler bunları gerçekten ölçüyor.
 *
 * Saf: React yok, react-native yok.
 */

/**
 * YASAKLI SÖZLÜK — turun kendi cümlesi:
 * "Teknik kelime yok: 'senkronize', 'kayıt', 'sunucu', 'hata kodu' hiçbir
 * ekranda geçmiyor."
 *
 * Sebebi personelin ne yapacağını bilmesi. "Kayıt gönderilemedi" ona hangi
 * işin kaybolduğunu söylemiyor; "Adisyon gönderilemedi" söylüyor. "Sunucu"
 * ise onun sorunu değil — yapabileceği bir şey yok.
 *
 * `kayıt` en sinsisi: Türkçede masum bir kelime ve elin kendiliğinden
 * yazıyor. Ben de yazdım (`writeFailure.failureTitle`).
 */
export const BANNED_WORDS = ['senkronize', 'sunucu', 'hata kodu', 'kayıt'] as const;

/**
 * Metinde yasaklı kelime var mı — bulunanları döndürür.
 *
 * Kök eşleşmesi BİLİNÇLİ: "kayıtlar", "kayıtlı", "sunucuya" hepsi yakalanır.
 * Dar bir eşleşme, aynı kelimeyi çekimli hâliyle kaçırırdı.
 */
export function bannedIn(text: string): string[] {
    const low = text.toLocaleLowerCase('tr-TR');
    return BANNED_WORDS.filter((word) => low.includes(word));
}

/**
 * Eylem düğmesi ölçüsü.
 *
 * Tur: "Her durum ekranında en fazla iki eylem, ikisi de alt üçte birde ve
 * 52–60 pt." Alt sınır başparmak bölgesinin gereği; üst sınır düğmenin
 * ekranı ele geçirmemesi.
 *
 * Tek sayı DEĞİL aralık veriliyor, çünkü tur da öyle veriyor: satır içindeki
 * bir şerit ile tam ekran bir hata aynı ağırlıkta olamaz. Ama ikisi de bu
 * aralıkta kalmak zorunda — 34 pt'lik bir "Anladım" aralığın dışında.
 */
export const ACTION_MIN_HEIGHT = 52;
export const ACTION_MAX_HEIGHT = 60;

/** Tur: "en fazla iki eylem". Üçüncü bir düğme kararı zorlaştırır. */
export const MAX_ACTIONS = 2;

/**
 * İKİ AĞIRLIK, iki renk.
 *
 * Tur: "Amber — iş durmuyor demek: çevrimdışı, abonelik. Kırmızı — yalnız
 * gerçekten başarısız olan işlemde."
 *
 * Bu ayrım renk zevki değil, personelin ne yapacağını belirleyen şey:
 * amberde beklemek bir seçenek, kırmızıda değil.
 */
export type DurumTone = 'amber' | 'red';

/**
 * Hangi durum hangi tonda.
 *
 * `sending` kuyruğa girmiş bir yazma — iş DURMUYOR, sinyal gelince gidecek.
 * `lost` kalıcı olarak reddedilmiş — personelin yeniden girmesi gerekiyor.
 * İkisini aynı renge boyamak, birinde boşuna telaşlandırmak ötekinde
 * gerçek kaybı sıradanlaştırmak olurdu.
 */
export function toneOf(kind: 'offline' | 'stale' | 'unread' | 'sending' | 'lost'): DurumTone {
    return kind === 'lost' ? 'red' : 'amber';
}
