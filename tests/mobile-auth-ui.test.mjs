import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function source(path) {
    const url = new URL(`../${path}`, import.meta.url);
    return existsSync(url) ? readFileSync(url, 'utf8') : '';
}

const welcome = source('mobile/app/(auth)/welcome.tsx');
const signIn = source('mobile/app/(auth)/manager/sign-in.tsx');
const recover = source('mobile/app/(auth)/manager/recover.tsx');
const business = source('mobile/app/(auth)/manager/business.tsx');
const ui = source('mobile/src/components/ui.tsx');
const managerScreens = [signIn, recover, business];
const managerBundle = managerScreens.join('\n');

test('Giriş 02–05 müdür rotaları ayrı ve gezilebilir ekranlar olarak bulunur', () => {
    assert.notEqual(signIn, '', 'manager/sign-in.tsx eksik');
    assert.notEqual(recover, '', 'manager/recover.tsx eksik');
    assert.notEqual(business, '', 'manager/business.tsx eksik');

    assert.match(welcome, /\/(?:\(auth\)\/)?manager\/sign-in/);
    assert.match(welcome, /\/(?:\(auth\)\/)?staff\/pair/);
    assert.match(welcome, /\/(?:\(auth\)\/)?signup\/account/);
    assert.match(signIn, /\/(?:\(auth\)\/)?manager\/recover/);
    // Giriş v4: girişten sonrası tek yerde — B5 köprüsü, "Hangi işletme?", Face ID.
    const entry = source('mobile/src/lib/managerEntry.ts');
    assert.match(signIn, /continueManager\(/);
    assert.match(entry, /\/(?:\(auth\)\/)?manager\/business/);
    assert.match(entry, /\/(?:\(auth\)\/)?manager\/bridge/);
    assert.match(entry, /\/(?:\(auth\)\/)?biometric/);
    assert.match(business, /\/(?:\(auth\)\/)?biometric/);
    assert.match(business, /\/(?:\(auth\)\/)?signup\/account/);
});

test('müdür ekranları kimlik doğrulamasını yalnız session üzerinden yapar', () => {
    for (const [name, screen] of [
        ['sign-in', signIn],
        ['recover', recover],
        ['business', business],
    ]) {
        assert.match(screen, /src\/api\/session/, `${name} authStub içe aktarmalı`);
        assert.doesNotMatch(screen, /\bfetch\s*\(/, `${name} doğrudan istek atmamalı`);
        assert.doesNotMatch(screen, /\bAsyncStorage\b/, `${name} oturumu kendi saklamamalı`);
        assert.doesNotMatch(screen, /\bsupabase\b|staff-api/i, `${name} sunucuya bağlanmamalı`);
    }

    assert.match(signIn, /authApi\.manager\.start\s*\(/);
    assert.match(recover, /authApi\.manager\.recover\s*\(/);
    assert.match(business, /authApi\.manager\.businesses\s*\(/);
    assert.match(business, /authApi\.manager\.selectBusiness\s*\(/);
});

test('müdür ekranlarında sabit e-posta, kişi, işletme veya gizli bilgi yoktur', () => {
    assert.doesNotMatch(managerBundle, /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    assert.doesNotMatch(
        managerBundle,
        /Studio Ayla|Ayla Beauty|Ayla Klinik|Ayla Demir|Merve|Kadıköy|Nişantaşı|Bebek/,
    );
    assert.doesNotMatch(managerBundle, /['"](?:1234|123456)['"]/);
    assert.doesNotMatch(managerBundle, /\b(?:password|pin)\s*===?\s*['"][^'"]+['"]/i);
    assert.doesNotMatch(managerBundle, /const\s+(?:staff|managers?|businesses)\s*=\s*\[/i);
});

test('müdür ekranları ortak UI kitini ve tema jetonlarını kullanır', () => {
    const rawMeasure = /\b(?:fontSize|height|minHeight|maxHeight|borderRadius|gap|padding(?:Top|Bottom|Left|Right|Horizontal|Vertical)?|margin(?:Top|Bottom|Left|Right|Horizontal|Vertical)?)\s*:\s*[1-9]\d*(?:\.\d+)?\b/;

    for (const [name, screen] of [
        ['sign-in', signIn],
        ['recover', recover],
        ['business', business],
    ]) {
        assert.match(screen, /src\/components\/ui/, `${name} ortak UI kitini kullanmalı`);
        assert.match(screen, /src\/theme/, `${name} ölçüleri temadan almalı`);
        assert.doesNotMatch(screen, rawMeasure, `${name} içine ham ölçü gömülmemeli`);
    }
});

test('Giriş 02 ve hata hâli tasarımdaki dil ile davranışları taşır', () => {
    // Giriş v4 · B1–B3.
    for (const copy of [
        'Hesabınıza girin',
        'Apple, Google ya da e-postanızla girin.',
        'E-posta',
        'Şifre',
        'Giriş yap',
        'Tekrar dene',
        'Şifremi unuttum',
        'Hesabınız yok mu?',
        'Yeni işletme oluşturun',
    ]) {
        assert.ok(signIn.includes(copy), `Giriş 02/03 metni eksik: ${copy}`);
    }

    assert.match(signIn, /remainingAttemptText\s*\(\s*['"]manager['"]/);
    const entry = source('mobile/src/lib/managerEntry.ts');
    assert.match(entry, /businesses\.length\s*===\s*0/);
    assert.match(entry, /businesses\.length\s*>\s*1/);
});

test('Giriş 04 aynı ekranda form ve gönderildi durumlarını eksiksiz taşır', () => {
    // Giriş v4 · S1–S3 — bağlantı yerine KOD; "unuttuysanız" değil "belirleyin".
    const recoverBundle = `${recover}\n${ui}\n${source('mobile/src/components/AuthSocial.tsx')}\n${source('mobile/src/lib/authCopy.ts')}`;
    for (const copy of [
        'Yeni şifre belirleyin',
        'Hesabınızın e-postasını yazın; 6 haneli bir kod gönderelim.',
        'Kod gönder',
        'Hesabınız varsa kodu birkaç dakika içinde alırsınız.',
        'Kodu girin',
        ' adresine 6 haneli kod gönderdik.',
        'Kod gelmedi mi?',
        'Yeniden gönder',
        'E-postayı değiştir',
        'Yeni şifrenizi yazın',
        'Bilgisayardan da bu şifreyle girersiniz.',
        'Şifreyi kaydet',
    ]) {
        assert.ok(recoverBundle.includes(copy), `Giriş 04 metni eksik: ${copy}`);
    }

    assert.match(recover, /result\.data\.email/);
    assert.match(recover, /result\.data\.resendAvailableAt/);
});

test('Giriş 05 işletme verisini stubdan alır ve tasarım metnini korur', () => {
    for (const copy of [
        'Hangi işletme?',
        'Sonra üst çubuktan değiştirebilirsiniz',
        'Aboneliği bitmiş bir işletme listede kalır, açılınca ne olduğunu söyler.',
        'Yeni işletme oluştur',
    ]) {
        assert.ok(business.includes(copy), `Giriş 05 metni eksik: ${copy}`);
    }

    assert.match(ui, /minHeight:\s*authMetrics\.selectionRowHeight/);
});

// Giriş v3: şifre formundan SARSINTI KALDIRILDI. Gerekçe tasarımda yazılı ve
// hedef kitleye dayanıyor — 40–55 yaş için sarsılan bir alan "hata" değil
// "arıza" gibi görünüyor. Yerine geleni bu test kilitliyor: kenar kırmızıya
// geçer (AuthField error → GlassPlate) ve bant açılır. Sarsıntı Face ID
// halkasında DURUYOR; orası bir alan değil bir cevap (bkz. FaceRing).
test('Giriş 03 hatası sarsmadan anlatılır: kenar kırmızı, bant açık', () => {
    assert.doesNotMatch(signIn, /translateX/);
    assert.doesNotMatch(signIn, /errorShake/);
    assert.match(signIn, /error=\{Boolean\(error\)\}/);
    // Giriş v4: opak bant `.berr` (AuthBand) — şifrenin altında.
    assert.match(signIn, /<AuthBand>\{error\.message\}<\/AuthBand>/);
    // `reduceMotion` kapısı da kalktı: kalan hareket yok. Kenar rengi bir
    // GEÇİŞ değil bir hâl, bant `entering` ile açılıyor ve reanimated
    // erişilebilirlik ayarını kendisi biliyor.
    assert.doesNotMatch(signIn, /Animated\.sequence/);
    assert.doesNotMatch(signIn, /Animated\.(?:timing|spring)[\s\S]{0,220}\b(?:height|backgroundColor|borderRadius|shadow)/);
});

test('müdür formu klavye, otomatik doldurma ve yapıştırma sözleşmesini korur', () => {
    const formBundle = `${signIn}\n${recover}\n${ui}`;

    assert.match(formBundle, /KeyboardAvoidingView/);
    assert.match(formBundle, /keyboardShouldPersistTaps\s*=\s*['"]handled['"]/);
    assert.match(formBundle, /automaticallyAdjustKeyboardInsets/);
    assert.match(formBundle, /keyboardType\s*=\s*['"]email-address['"]/);
    assert.match(formBundle, /autoCapitalize\s*=\s*['"]none['"]/);
    assert.match(formBundle, /textContentType\s*=\s*['"]username['"]/);
    assert.match(formBundle, /autoComplete\s*=\s*['"]email['"]/);
    assert.match(formBundle, /textContentType\s*=\s*['"]password['"]/);
    assert.match(formBundle, /secureTextEntry/);
    assert.match(formBundle, /returnKeyType\s*=\s*['"]next['"]/);
    assert.match(formBundle, /returnKeyType\s*=\s*['"]go['"]/);
    assert.doesNotMatch(formBundle, /contextMenuHidden/);
});
