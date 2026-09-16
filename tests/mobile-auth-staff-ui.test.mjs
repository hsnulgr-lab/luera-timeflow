import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function source(path) {
    const url = new URL(`../${path}`, import.meta.url);
    return existsSync(url) ? readFileSync(url, 'utf8') : '';
}

const welcome = source('mobile/app/(auth)/welcome.tsx');
const pair = source('mobile/app/(auth)/staff/pair.tsx');
const who = source('mobile/app/(auth)/staff/who.tsx');
const pin = source('mobile/app/(auth)/staff/pin.tsx');
const ui = source('mobile/src/components/ui.tsx');
const tokens = source('mobile/src/theme/tokens.ts');
const staffScreens = [pair, who, pin];
const staffBundle = staffScreens.join('\n');
const staffUiBundle = `${staffBundle}\n${ui}`;

test('Giriş 06–08 personel rotaları yeni staff ağacında bulunur ve birbirine bağlanır', () => {
    assert.notEqual(pair, '', 'staff/pair.tsx eksik');
    assert.notEqual(who, '', 'staff/who.tsx eksik');
    assert.notEqual(pin, '', 'staff/pin.tsx eksik');

    assert.match(welcome, /\/(?:\(auth\)\/)?staff\/pair/);
    assert.match(pair, /\/(?:\(auth\)\/)?staff\/who/);
    assert.match(who, /\/(?:\(auth\)\/)?staff\/pin/);
    assert.match(pin, /\/(?:\(auth\)\/)?biometric/);
});

test('personel ekranlarında doğrulamanın tek dikiş yeri authStub olur', () => {
    for (const [name, screen] of [
        ['pair', pair],
        ['who', who],
        ['pin', pin],
    ]) {
        assert.match(screen, /src\/api\/session/, `${name} authStub içe aktarmalı`);
        assert.doesNotMatch(screen, /src\/api\/staff(?:['"]|\.ts)/, `${name} staff-api çağırmamalı`);
        assert.doesNotMatch(screen, /\bfetch\s*\(/, `${name} doğrudan istek atmamalı`);
        assert.doesNotMatch(screen, /\bAsyncStorage\b/, `${name} oturum veya cihaz saklamamalı`);
        assert.doesNotMatch(screen, /\bsupabase\b|staff-api/i, `${name} sunucuya bağlanmamalı`);
    }

    assert.match(pair, /authApi\.staff\.pair\s*\(/);
    assert.match(who, /authApi\.staff\.roster\s*\(/);
    assert.match(pin, /authApi\.staff\.start\s*\(/);
});

test('personel ekranlarında sabit kod, PIN, personel veya işletme kimliği kalmaz', () => {
    assert.doesNotMatch(staffBundle, /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    assert.doesNotMatch(
        staffBundle,
        /Studio Ayla|Ayla Beauty|Ayla Klinik|Kadıköy|Nişantaşı|Bebek|Merve Kaya|Selin Boz|Emre Yıldız|Hande Arslan|Kuaför|Estetisyen|Manikürist/,
    );
    assert.doesNotMatch(staffBundle, /['"](?:1234|123456)['"]/);
    assert.doesNotMatch(staffBundle, /\b(?:pin|code)\s*===?\s*['"][^'"]+['"]/i);
    assert.doesNotMatch(staffBundle, /const\s+STAFF\s*=|const\s+staff\s*=\s*\[/i);
});

test('personel ekranları ortak giriş parçalarını ve tema jetonlarını kullanır', () => {
    const rawMeasure = /\b(?:fontSize|height|minHeight|maxHeight|borderRadius|gap|padding(?:Top|Bottom|Left|Right|Horizontal|Vertical)?|margin(?:Top|Bottom|Left|Right|Horizontal|Vertical)?)\s*:\s*[1-9]\d*(?:\.\d+)?\b/;

    for (const [name, screen] of [
        ['pair', pair],
        ['who', who],
        ['pin', pin],
    ]) {
        assert.match(screen, /src\/components\/ui/, `${name} ortak UI kitini kullanmalı`);
        assert.match(screen, /src\/theme/, `${name} ölçüleri temadan almalı`);
        assert.doesNotMatch(screen, rawMeasure, `${name} içine ham ölçü gömülmemeli`);
    }

    assert.match(pair, /AuthCodeBoxes/);
    assert.match(pair, /AuthKeypad/);
    assert.match(who, /AuthStaffRow/);
    assert.match(pin, /AuthPinDots/);
    assert.match(pin, /AuthKeypad/);
    assert.match(tokens, /keypadKeyHeight:\s*62/);
    assert.match(tokens, /keypadKeyHeightSmall:\s*52/);
    assert.match(tokens, /selectionRowHeight:\s*74/);
});

test('Giriş 06 kod ekranı tasarım metnini ve altı hane kapısını korur', () => {
    for (const copy of [
        'Bu telefonu',
        'işletmeye bağlayın',
        'Bilgisayardaki Luera ekranında görünen altı haneli kodu yazın. Kodu işletme sahibi verir.',
        // "Kare kodu okut" KALDIRILDI. Canlı bir ekranda duruyordu, dokununca
        // hiçbir şey olmuyordu ve `expo-camera` kurulu bile değil. Görünen
        // ama çalışmayan bir özellik App Store 2.1'in doğrudan konusu.
        'Devam',
        'Kodum yok',
        'Bu kod eşleşmedi. Rakamları bir daha kontrol edip yeniden yazın.',
    ]) {
        assert.ok(staffUiBundle.includes(copy), `Giriş 06 metni eksik: ${copy}`);
    }

    assert.match(pair, /formatPairingCode\s*\(/);
    assert.match(pair, /code\.length\s*===\s*6/);
    assert.match(pair, /disabled\s*=\s*\{[^}]*complete/);
    assert.match(pair, /result\.ok/);
});

test('Giriş 06 kod alanı tek gizli girdidir; OTP, yapıştırma ve özel tuş takımı birlikte çalışır', () => {
    const pairInputBundle = `${pair}\n${ui}`;

    assert.match(pairInputBundle, /TextInput/);
    assert.match(pairInputBundle, /textContentType\s*=\s*['"]oneTimeCode['"]/);
    assert.match(pairInputBundle, /keyboardType\s*=\s*['"]number-pad['"]/);
    assert.match(pairInputBundle, /maxLength\s*=\s*\{?6\}?/);
    assert.match(pairInputBundle, /onChangeText/);
    assert.doesNotMatch(pairInputBundle, /contextMenuHidden/);
    assert.match(pairInputBundle, /Son haneyi sil/);
});

test('Giriş 06b ayrı rota değil, kodu koruyan tek cevaplık alt sayfadır', () => {
    for (const copy of [
        'Kodu nereden alacaksınız?',
        // 099 · ekip kodu: masaüstü ya da müdür telefonu, tek kod, 15 dakika.
        'Müdür Luera’da Personel ekranını açar — bilgisayarda ya da kendi telefonunda.',
        'Telefon bağla’ya basar; ekranda altı haneli kod çıkar.',
        'Kodu buraya yazıp listeden kendinizi seçin. Kod 15 dakika geçerli, bütün ekip aynı kodu kullanır.',
        'Kodu yalnız müdür üretebilir. Uygulamadan istek gönderemezsiniz.',
        'Anladım',
    ]) {
        assert.ok(staffUiBundle.includes(copy), `Giriş 06b metni eksik: ${copy}`);
    }

    assert.match(pair, /(?:sheet|help|modal)/i);
    assert.doesNotMatch(pair, /staff\/pair-help|staff\/code-help/);
    assert.doesNotMatch(staffUiBundle, /Talep gönder/);
});

test('Giriş 07 personeli ve işletmeyi yalnız roster cevabından gösterir', () => {
    for (const copy of [
        'Siz kimsiniz?',
        'Listeden kendinizi seçin',
        'Listede yoksanız müdür sizi Personel sayfasından eklemeli.',
    ]) {
        assert.ok(who.includes(copy), `Giriş 07 metni eksik: ${copy}`);
    }

    assert.match(who, /result\.data\.business/);
    assert.match(who, /result\.data\.staff/);
    assert.match(who, /\.map\s*\(/);
    assert.match(who, /staffId/);
});

test('Giriş 08 dört hanede otomatik doğrular ve PIN için ayrı onay düğmesi eklemez', () => {
    for (const copy of [
        'Şifrenizi girin',
        'Şifremi hatırlamıyorum',
    ]) {
        assert.ok(staffUiBundle.includes(copy), `Giriş 08 metni eksik: ${copy}`);
    }

    assert.match(pin, /pin\.length\s*===?\s*4/);
    assert.match(pin, /remainingAttemptText\s*\(\s*['"]staff['"]/);
    assert.match(pin, /remainingAttempts/);
    assert.doesNotMatch(pin, /(?:label|title)\s*=\s*['"]Devam['"]/);
});

test('Giriş 08 PIN girdisi güvenli kalır; kilit sunucu süresini izler ve tuş takımını kapatır', () => {
    const pinInputBundle = `${pin}\n${ui}`;

    assert.match(pinInputBundle, /secureTextEntry/);
    assert.match(pinInputBundle, /showSoftInputOnFocus\s*=\s*\{?false\}?/);
    assert.match(pinInputBundle, /maxLength\s*=\s*\{?4\}?/);
    assert.match(pin, /lockedUntil/);
    assert.match(pin, /Date\.now\s*\(/);
    assert.match(pin, /disabled\s*=\s*\{[^}]*locked/);
    assert.match(pin, /setInterval\s*\(/);
});

test('kod ve PIN hatası sözleşmedeki tek ±6 px / 180 ms sarsıntıyı kullanır', () => {
    for (const [name, screen] of [
        ['pair', pair],
        ['pin', pin],
    ]) {
        assert.match(screen, /authMotion\.errorShake/, `${name} 180 ms jetonunu kullanmalı`);
        assert.match(screen, /authMotion\.errorOffset/, `${name} ±6 px jetonunu kullanmalı`);
        assert.match(screen, /Animated\.sequence\s*\(/, `${name} tek hata dizisi çalıştırmalı`);
        assert.match(screen, /translateX/, `${name} yalnız dönüşümle sarsılmalı`);
        assert.match(screen, /useNativeDriver:\s*true/);
        assert.match(screen, /if\s*\(reduceMotion\)\s*return/);
        assert.doesNotMatch(
            screen,
            /Animated\.(?:timing|spring)[\s\S]{0,220}\b(?:height|backgroundColor|borderRadius|shadow)/,
        );
    }

    assert.match(tokens, /errorShake:\s*180/);
    assert.match(tokens, /errorOffset:\s*6/);
    assert.match(ui, /pressMotion\.(?:in|out)/);
});

test('özel tuş takımının simgeleri metin karakteri değil SVG olur', () => {
    assert.match(ui, /react-native-svg/);
    assert.match(ui, /function\s+DeleteIcon/);
    // `ScanIcon` düğmesiyle birlikte kalktı — kullanılmayan bir simge.
    assert.doesNotMatch(ui, /function\s+ScanIcon/);
    assert.doesNotMatch(ui, /AuthScanButton/);
    assert.doesNotMatch(staffUiBundle, /⌫|☎|↗|•••/);
});

test('kadro okunamazsa EŞLEŞTİRME ekranına atılmıyor', () => {
    // Her başarısızlık oraya atıyordu: ağ hatası, zaman aşımı, sunucu
    // hıçkırığı. Telefon pekâlâ işletmeye bağlıyken "bu telefonu işletmeye
    // bağlayın" ekranı açılıyor ve kullanıcı yeni bir kod aramaya gidiyordu.
    assert.match(who, /if \(result\.error === 'not_paired'\) \{\s*router\.replace\('\/\(auth\)\/staff\/pair'\)/);
    assert.doesNotMatch(who, /if \(!result\.ok\) \{\s*router\.replace\('\/\(auth\)\/staff\/pair'\)/);
    // Ve okunamadığı SÖYLENİYOR, sessizce boş liste bırakılmıyor.
    assert.match(who, /setListError\(true\)/);
    assert.match(who, /Telefonunuz işletmeye BAĞLI/);
});

test('seçilen personel YENİDEN YÜKLEMEYE dayanıyor', () => {
    // `pendingStaffId` bir MODÜL DEĞİŞKENİ: uygulama yeniden yüklenince
    // kayboluyor. Seçim yalnız diske yazılınca `startStaffSession` onu
    // göremiyor, PIN her seferinde `staff_not_found` alıyor ve ekran kadroya
    // geri dönüyordu — kullanıcı için sonsuz döngü.
    const live = readFileSync(new URL('../mobile/src/api/auth.ts', import.meta.url), 'utf8');
    assert.match(live, /pendingStaffId = staffId;\s*await writePending\(\{ \.\.\.member, businessName: list\.data\.business\.name \}\)/);
    assert.match(live, /async function resolvePendingStaffId\(\)/);
    assert.match(live, /const staffId = await resolvePendingStaffId\(\);\s*if \(!staffId\) return fail\('staff_not_found'\)/);
});
