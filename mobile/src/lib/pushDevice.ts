import * as SecureStore from 'expo-secure-store';

import { newPlanId } from './packageSale.ts';

/**
 * BU TELEFONUN kimliği — kurulum başına bir kez üretilen UUID.
 *
 * ── Neden Expo jetonu yetmiyor ──────────────────────────────────────────────
 * Abonelik satırının doğal anahtarı jetonun kendisi (`endpoint`) ve çoğu iş
 * onunla yürüyor. Ama jetonun elde OLMADIĞI iki an var ve ikisi de tam olarak
 * satırı silmemiz gereken an:
 *
 *   1. Kullanıcı bildirim iznini OS ayarından geri aldı. Jeton üretmek izin
 *      ister; izin yoksa jetonu üretemeyiz, yani hangi satırı sileceğimizi
 *      bilemeyiz.
 *   2. Personel çıkış yaptı ve o sırada ağ yoktu. Silme işi bekliyor; tekrar
 *      denendiğinde jeton yeniden istenmek zorunda ve izin o arada değişmiş
 *      olabilir.
 *
 * ORTAK TELEFONDA bunun bedeli somut: ayrılan personelin bildirimleri yeni
 * personelin elinde çalmaya devam eder. Bu kimlik izinden bağımsız durduğu
 * için silme her koşulda tamamlanabiliyor.
 *
 * SecureStore'da: bir sır değil ama cihazla birlikte yaşamalı. Jetonlarla
 * aynı raf.
 *
 * ── PLATFORM FARKI ──────────────────────────────────────────────────────────
 * iOS'ta SecureStore Keychain'e yazıyor ve Keychain kaydı uygulama SİLİNSE DE
 * duruyor — yeniden kurulumda aynı kimlik geri geliyor ve eski satır doğru
 * biçimde eziliyor. Android'de öyle değil: kayıt uygulamayla gidiyor ve yeniden
 * kurulumda YENİ bir kimlik üretiliyor.
 *
 * Android'deki sonuç: eski satır bir süre duruyor ve ilk gönderimde Expo
 * `DeviceNotRegistered` deyince budanıyor. Yani bir olay gecikmeyle kendini
 * düzeltiyor. Bu kabul edildi — alternatifi cihazı donanım kimliğiyle
 * tanımak olurdu ve o, olmayan bir sorun için gizlilik bedeli demekti.
 */

const KEY = 'tf.push.device';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

let cached: string | null = null;

/**
 * Cihaz kimliğini döner; yoksa üretip saklar.
 *
 * Yazma başarısız olursa (kilitli keychain) üretilen kimlik yine dönüyor ama
 * SAKLANMIYOR — bir sonraki çağrıda yenisi üretilir. Bunun bedeli kayıt
 * satırının bir kez fazladan yazılması; alternatifi kaydı hiç yapmamaktı.
 */
export async function deviceIdOnce(): Promise<string> {
    if (cached) return cached;
    try {
        const found = await SecureStore.getItemAsync(KEY, options);
        if (found) { cached = found; return found; }
    } catch {
        // Okunamadı: aşağıda yenisi üretiliyor.
    }
    const made = newPlanId();
    try {
        await SecureStore.setItemAsync(KEY, made, options);
        cached = made;
    } catch {
        // Saklanamadı — kimlik yine de dönüyor.
    }
    return made;
}

/** Cihaz koparılınca: bir sonraki eşleşme yeni bir kimlikle başlasın. */
export async function forgetDeviceId(): Promise<void> {
    cached = null;
    try {
        await SecureStore.deleteItemAsync(KEY, options);
    } catch {
        // Silinemedi — zararsız: kimlik yalnız bu org kapsamında anlamlı.
    }
}
