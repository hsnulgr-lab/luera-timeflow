import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// App Store gönderim engelleri.
//
// Bu dosya güzellik denetlemez; YÜKLEMEYİ ya da ÇALIŞMAYI engelleyen şeyleri
// bekler. Her satırın karşılığı Apple'ın somut bir kuralı ya da somut bir
// çökme.

const app = JSON.parse(readFileSync(new URL('../mobile/app.json', import.meta.url), 'utf8')).expo;
const pkg = JSON.parse(readFileSync(new URL('../mobile/package.json', import.meta.url), 'utf8'));
const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');

test('Face ID kullanım metni tanımlı — yoksa iOS uygulamayı ÖLDÜRÜR', () => {
    // `expo-local-authentication` çağrıldığı anda NSFaceIDUsageDescription
    // yoksa iOS süreci sonlandırıyor. Bu bir mağaza sorunu değil, çökme.
    assert.ok(pkg.dependencies['expo-local-authentication']);
    const plugin = app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-local-authentication');
    assert.ok(plugin, 'expo-local-authentication config plugin eklenmemiş');
    assert.ok(plugin[1].faceIDPermission.length > 20, 'Face ID metni Apple için fazla kısa');
    // Metin TÜRKÇE ve NE İÇİN sorusunu cevaplamalı; Apple gerekçesiz metni reddeder.
    assert.match(plugin[1].faceIDPermission, /Face ID/);
});

test('gizlilik manifestosu var — AsyncStorage UserDefaults kullanıyor', () => {
    const types = app.ios.privacyManifests?.NSPrivacyAccessedAPITypes ?? [];
    const kinds = types.map((t) => t.NSPrivacyAccessedAPIType);
    assert.ok(kinds.includes('NSPrivacyAccessedAPICategoryUserDefaults'));
    assert.ok(types.every((t) => t.NSPrivacyAccessedAPITypeReasons.length > 0));
});

test('ihracat uyumluluğu ve build numarası tanımlı', () => {
    assert.equal(app.ios.config.usesNonExemptEncryption, false);
    assert.ok(app.ios.buildNumber, 'buildNumber olmadan ikinci yükleme yapılamaz');
    assert.ok(app.ios.bundleIdentifier);
});

test('ölü bağlantı yok — koşul metinleri dokunulabilir görünmüyor', () => {
    // Altı çizili ama `onPress`siz metin, inceleyen kişinin ilk dokunduğu yer.
    // Luera'nın yayımlanmış politika URL'si olana kadar DÜZ METİN.
    const account = read('app/(auth)/signup/account.tsx');
    const terms = account.slice(account.indexOf('Devam ederek'), account.indexOf('kabul ediyorsunuz'));
    assert.ok(!/textDecorationLine: 'underline'/.test(terms));
    assert.ok(account.includes('Kullanım Koşulları'));
    assert.ok(account.includes('Gizlilik Politikası'));
});

test('AÇIK ENGEL — müdür hesabını silemiyor (5.1.1(v))', { skip: 'Müdür Profil ekranı Claude Design turunu bekliyor' }, () => {
    // Hesap silme ekranı YALNIZ personel Profil'inden erişilebiliyor, ama silme
    // fonksiyonu `session.actor === 'manager'` istiyor. Kapalı döngü.
    // Müdür Profil ekranı yazıldığında bu test açılacak ve şunu beklemeli:
    const profile = read('app/mudur/profile.tsx');
    assert.match(profile, /account/);
    assert.match(profile, /signOut/);
});
