/**
 * Sistem açılış karesinden (splash) ilk ekrana devir.
 *
 * iOS'un açılış karesi STATİK: kod çalışmadan çiziliyor, kımıldayamaz. Kare
 * `scripts/render-splash.swift` ile karşılamanın ilk anından üretiliyor —
 * zemin, kor + sis ve **"luera."**: kelime ve nokta, hap henüz açılmamış.
 * Giriş v3'ün marka hikâyesinin (kelime → nokta → hap → timeflow) 1,3.
 * saniyesindeki kare; karşılama oradan devam edip hapı açıyor.
 *
 * ── Kare neden JS'de bir kez daha çiziliyor ─────────────────────────────────
 * Sistem görüntüyü `cover` ile yerleştiriyor, yani ekranın en-boy oranına
 * göre kırpıyor; güvenli alan da cihazdan cihaza değişiyor. Görüntünün içine
 * pişmiş "luera." bu yüzden her telefonda canlı markanın TAM üstüne
 * düşmüyor — 393 pt ailesinde düşüyor, ötekilerde birkaç pt kayıyor. Sistem
 * karesini kaldırıp canlı ekranı göstermek o kaymayı bir sıçrama olarak
 * gösterirdi. Onun yerine karşılama ilk karesinde AYNI görüntüyü aynı
 * `cover` ile çiziyor (sistemle piksel piksel aynı, devralma görünmüyor) ve
 * canlı ekrana kısa bir çapraz solmayla geçiyor.
 *
 * ── Yalnız soğuk açılışta ───────────────────────────────────────────────────
 * Çıkış yapıp karşılamaya dönen kişi splash görmedi; ona hikâye baştan
 * anlatılıyor. Bu yüzden devir tek kullanımlık.
 */

import * as SplashScreen from 'expo-splash-screen';

// Kök modül yüklenir yüklenmez: yazı tipleri ve oturum okunurken sistem
// karesi yerinde kalsın. Aksi hâlde ilk JS karesi boş zemin olurdu.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// Emniyet: bir yol karar vermeyi unutursa (derin bağlantı, beklenmeyen rota)
// uygulama sistem karesinin arkasında kilitli kalmasın.
setTimeout(() => { pending = false; hideSplash(); }, 6000);

let pending = true;
let hidden = false;

/** Karşılama devralıyorsa `true` — bir kez. Sonraki çağrılar `false`. */
export function takeSplashHandoff(): boolean {
    const was = pending;
    pending = false;
    return was;
}

/**
 * Sistem karesini kaldır. Karşılama DIŞINDAKİ yollar (şifre ekranı, uygulama,
 * hata) devri almıyor: onlar için kare doğrudan kalkar.
 */
export function hideSplash(): void {
    if (hidden) return;
    hidden = true;
    void SplashScreen.hideAsync().catch(() => {});
}

/** Karşılama dışına gidiliyor — devir artık kimseye ait değil. */
export function dropSplashHandoff(): void {
    pending = false;
    hideSplash();
}
