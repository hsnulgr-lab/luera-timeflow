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
    assert.match(signIn, /\/(?:\(auth\)\/)?manager\/business/);
    assert.match(signIn, /\/(?:\(auth\)\/)?biometric/);
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
    for (const copy of [
        'Hesabınıza girin',
        'Bilgisayarda kullandığınız e-posta ve şifre.',
        'E-posta',
        'Şifre',
        'Gir',
        'Yeniden dene',
        'Şifremi unuttum',
        'Şifrenizi bilgisayardan da değiştirebilirsiniz. Değiştirdiğinizde ikisi birlikte değişir.',
    ]) {
        assert.ok(signIn.includes(copy), `Giriş 02/03 metni eksik: ${copy}`);
    }

    assert.match(signIn, /remainingAttemptText\s*\(\s*['"]manager['"]/);
    assert.match(signIn, /businesses\.length\s*===\s*1/);
});

test('Giriş 04 aynı ekranda form ve gönderildi durumlarını eksiksiz taşır', () => {
    const recoverBundle = `${recover}\n${ui}`;
    for (const copy of [
        'Şifrenizi yenileyelim',
        'E-postanızı yazın, yeni şifre bağlantısını oraya gönderelim.',
        'Bağlantıyı gönder',
        'Bilgisayardan giriş yapabiliyorsanız şifrenizi orada da değiştirebilirsiniz.',
        'Bağlantıyı gönderdik',
        'Gelen kutusunda yok mu?',
        'Spam / önemsiz klasörüne de bakın',
        'Adres yanlış mıydı?',
        'Geri dönüp yeniden yazabilirsiniz',
        'Yeniden gönder',
        'Girişe dön',
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

test('Giriş 03 hata hareketi yalnız dönüşümle, tek sözleşme değeriyle çalışır', () => {
    assert.match(signIn, /authMotion\.errorShake/);
    assert.match(signIn, /authMotion\.errorOffset/);
    assert.match(signIn, /translateX/);
    assert.match(signIn, /useNativeDriver:\s*true/);
    assert.match(signIn, /if\s*\(reduceMotion\)\s*return/);
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
