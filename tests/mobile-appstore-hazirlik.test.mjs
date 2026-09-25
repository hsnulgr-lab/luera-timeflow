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

test('uygulamanın dili TÜRKÇE ilan ediliyor — mağaza "English" demiyor', () => {
    // Denetim 2026-09-25: `CFBundleDevelopmentRegion` Expo varsayılanı (en)
    // kalmıştı ve pakette `tr.lproj` yoktu. App Store dili paketteki lproj
    // klasörlerinden okuyor: arayüzü tamamen Türkçe bir uygulama mağazada
    // "English" görünecekti (2.3 — doğru metaveri).
    assert.equal(app.ios.infoPlist.CFBundleDevelopmentRegion, 'tr');
    assert.deepEqual(app.ios.infoPlist.CFBundleLocalizations, ['tr']);
    assert.equal(app.locales.tr, './locales/tr.json');

    // `locales` dosyası `tr.lproj/InfoPlist.strings` üretiyor. Yalnız iOS
    // anahtarları, `ios` altında — Android'e sızmıyor.
    const tr = JSON.parse(read('locales/tr.json'));
    assert.deepEqual(Object.keys(tr), ['ios']);
    assert.equal(tr.ios.CFBundleDisplayName, app.name);
    // Yerelleştirilmiş Face ID metni eklentideki ile AYNI: iki kaynak
    // ayrışırsa hangi dilde hangi cümlenin çıkacağı belirsizleşir.
    const plugin = app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-local-authentication');
    assert.equal(tr.ios.NSFaceIDUsageDescription, plugin[1].faceIDPermission);
    // InfoPlist.strings çift tırnağı kaçırmadan yazılıyor.
    assert.ok(Object.values(tr.ios).every((v) => !v.includes('"')));
});

test('ihracat uyumluluğu ve build numarası tanımlı', () => {
    assert.equal(app.ios.config.usesNonExemptEncryption, false);
    assert.ok(app.ios.buildNumber, 'buildNumber olmadan ikinci yükleme yapılamaz');
    assert.ok(app.ios.bundleIdentifier);
});

test('ölü bağlantı yok — gizlilik bağlantısı GERÇEK, var olmayan koşullara atıf yok', () => {
    // Altı çizili ama `onPress`siz metin, inceleyen kişinin ilk dokunduğu yer.
    // URL yokken düz metindi; `public/gizlilik.html` yayımlandı (2026-09-24)
    // ve metin artık gerçek bağlantı. Altı çizili olan her şey bir yere gider.
    const account = read('app/(auth)/signup/account.tsx');
    const terms = account.slice(account.indexOf('Devam ederek'), account.indexOf('kabul ediyorsunuz'));
    assert.match(terms,
        /onPress=\{\(\) => \{ void Linking\.openURL\(PRIVACY_URL\); \}\}\s*style=\{\{ color: c\.tx, textDecorationLine: 'underline' \}\}\s*>\s*Gizlilik Politikası\s*<\/Text>/,
        'Gizlilik Politikası altı çizili ama bir yere gitmiyor ya da bağlantı kalktı.');
    assert.match(account, /import \{ PRIVACY_URL \} from '\.\.\/\.\.\/\.\.\/src\/lib\/managerProfile';/);
    // Kullanım Koşulları sayfası YOK (2026-09-25) — ona onay istenmiyor.
    // Yorumlar ayıklanıyor: gerekçe yorumda anlatılıyor, metinde değil.
    const kodu = account.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!kodu.includes('Kullanım Koşulları'),
        'Var olmayan bir "Kullanım Koşulları" metnine yeniden onay isteniyor.');
});

test('AÇIK ENGEL — müdür hesabını silemiyor (5.1.1(v))', { skip: 'Müdür Profil ekranı Claude Design turunu bekliyor' }, () => {
    // Hesap silme ekranı YALNIZ personel Profil'inden erişilebiliyor, ama silme
    // fonksiyonu `session.actor === 'manager'` istiyor. Kapalı döngü.
    // Müdür Profil ekranı yazıldığında bu test açılacak ve şunu beklemeli:
    const profile = read('app/mudur/profile.tsx');
    assert.match(profile, /account/);
    assert.match(profile, /signOut/);
});
