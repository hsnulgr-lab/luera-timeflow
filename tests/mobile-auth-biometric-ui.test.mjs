import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function source(path) {
    const url = new URL(`../${path}`, import.meta.url);
    return existsSync(url) ? readFileSync(url, 'utf8') : '';
}

const biometric = source('mobile/app/(auth)/biometric.tsx');
const signIn = source('mobile/app/(auth)/manager/sign-in.tsx');
const business = source('mobile/app/(auth)/manager/business.tsx');
const staffPin = source('mobile/app/(auth)/staff/pin.tsx');
const welcome = source('mobile/app/(auth)/welcome.tsx');
const ui = source('mobile/src/components/ui.tsx');
const tokens = source('mobile/src/theme/tokens.ts');
const packageJson = source('mobile/package.json');
const biometricBundle = `${biometric}\n${ui}`;

const realAuth = readFileSync(
    new URL('../mobile/src/api/auth.ts', import.meta.url),
    'utf8',
);

test('Giriş 09 yalnız başarılı müdür veya personel girişinden sonra ulaşılır', () => {
    assert.notEqual(biometric, '', 'biometric.tsx eksik');
    assert.match(signIn, /\/(?:\(auth\)\/)?biometric/);
    assert.match(business, /\/(?:\(auth\)\/)?biometric/);
    assert.match(staffPin, /\/(?:\(auth\)\/)?biometric/);
    assert.doesNotMatch(welcome, /\/(?:\(auth\)\/)?biometric/);
});

test('Giriş 09 HTML referansındaki Face ID teklifini eksiksiz taşır', () => {
    for (const copy of [
        'Bir dahaki sefere',
        'Face ID ile açalım mı?',
        'Şifrenizi her açılışta yazmak zorunda kalmazsınız.',
        'Telefonunuzu tanıdıktan sonra tek bakışta girer.',
        'Face ID’yi aç',
        'Şimdi değil',
        'Bunu daha sonra Profil’den de açabilirsiniz.',
    ]) {
        assert.ok(biometricBundle.includes(copy), `Giriş 09 metni eksik: ${copy}`);
    }
});

test('Face ID kararı yalnız session dikişinden geçer; gerçek biyometri bu turda kurulmaz', () => {
    assert.match(biometric, /src\/api\/session/);
    assert.match(biometric, /authApi\.biometric\.enable\s*\(/);
    assert.match(biometric, /authApi\.biometric\.skip\s*\(/);
    assert.doesNotMatch(biometric, /\bfetch\s*\(/);
    assert.doesNotMatch(biometric, /\bAsyncStorage\b/);
    assert.doesNotMatch(biometric, /\bsupabase\b|staff-api/i);
    assert.doesNotMatch(biometric, /expo-local-authentication|LocalAuthentication/);
    // Faz 3'te gerçek biyometri KURULDU; korunacak kural değişmedi:
    // LocalAuthentication yalnız src/api/auth.ts içinde çağrılır.
    assert.match(packageJson, /expo-local-authentication/);
    assert.match(realAuth, /LocalAuthentication\.authenticateAsync/);
});

test('iki gerçek seçenek de stub cevabındaki oturuma göre ana ekrana götürür', () => {
    assert.match(biometric, /result\.ok/);
    assert.match(biometric, /result\.data\.actor/);
    assert.match(biometric, /router\.replace\s*\(/);
    assert.doesNotMatch(biometric, /setTimeout\s*\(/);
});

test('Giriş 09 ortak UI kitini, tema jetonlarını ve 118 pt halkayı kullanır', () => {
    const rawMeasure = /\b(?:fontSize|height|minHeight|maxHeight|width|minWidth|maxWidth|borderRadius|gap|padding(?:Top|Bottom|Left|Right|Horizontal|Vertical)?|margin(?:Top|Bottom|Left|Right|Horizontal|Vertical)?)\s*:\s*[1-9]\d*(?:\.\d+)?\b/;

    assert.match(biometric, /src\/components\/ui/);
    assert.match(biometric, /src\/theme/);
    assert.doesNotMatch(biometric, rawMeasure, 'biometric ekranına ham ölçü gömülmemeli');
    assert.match(tokens, /faceIdRing:\s*118/);
    assert.match(biometricBundle, /authMetrics\.faceIdRing/);
    assert.match(biometricBundle, /AuthActionButton/);
    assert.match(ui, /secondary\s*\?\s*hit\.actionSm/);
});

test('Face ID işareti metin karakteri veya View hilesi değil SVG path olur', () => {
    assert.match(biometricBundle, /react-native-svg/);
    assert.match(biometricBundle, /function\s+(?:Auth)?FaceIdIcon/);
    assert.match(biometricBundle, /function\s+(?:Auth)?FaceIdIcon[\s\S]{0,1800}<Svg[\s\S]{0,1000}<Path/);
    assert.match(biometricBundle, /strokeWidth=\{authMetrics\.iconStroke\}/);
    assert.match(biometricBundle, /strokeLinecap=["']round["']/);
    assert.match(biometricBundle, /strokeLinejoin=["']round["']/);
    assert.doesNotMatch(biometric, /(?:🙂|👤|◯|◎)/);
});

test('Giriş 09 basma davranışını ortak hareket sözleşmesinden alır', () => {
    assert.match(ui, /pressMotion\.(?:in|out)/);
    assert.match(ui, /useNativeDriver:\s*true/);
    assert.match(ui, /reduceMotion/);
    assert.doesNotMatch(
        biometric,
        /Animated\.(?:timing|spring)[\s\S]{0,220}\b(?:height|width|backgroundColor|borderRadius|shadow)/,
    );
});
