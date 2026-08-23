import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function source(path) {
    const url = new URL(`../${path}`, import.meta.url);
    return existsSync(url) ? readFileSync(url, 'utf8') : '';
}

const index = source('mobile/app/index.tsx');
const resume = source('mobile/app/(auth)/resume.tsx');
const authStub = source('mobile/src/api/authStub.ts');
const ui = source('mobile/src/components/ui.tsx');
const tokens = source('mobile/src/theme/tokens.ts');
const packageJson = source('mobile/package.json');
const resumeUiBundle = `${resume}\n${ui}`;

const realAuth = readFileSync(
    new URL('../mobile/src/api/auth.ts', import.meta.url),
    'utf8',
);

test('Giriş 10 saklı oturumdan açılır ve rota kararı yalnız session üzerinden verilir', () => {
    assert.notEqual(resume, '', 'resume.tsx eksik');
    assert.match(index, /authApi\.getLaunchState\s*\(/);
    assert.match(index, /launch\.target\s*===\s*['"]resume['"]/);
    assert.match(index, /\/(?:\(auth\)\/)?resume/);
    assert.match(authStub, /target:\s*['"]resume['"]/);
    assert.match(resume, /src\/api\/session/);
    assert.match(resume, /authApi\.resume\.get\s*\(/);
});

test('Giriş 10 müdür ve personel kopyalarını aynı kimlik kabuğunda eksiksiz taşır', () => {
    for (const copy of [
        'Girmek için bakın',
        'Şifreyle gir',
        'PIN ile gir',
        'Oturumu değiştir',
        'Bu telefon benim değil',
    ]) {
        assert.ok(resume.includes(copy), `Giriş 10 metni eksik: ${copy}`);
    }

    assert.match(resume, /session\.actor\s*===\s*['"]manager['"]/);
    assert.match(resume, /profile\.initials/);
    assert.match(resume, /profile\.name/);
    assert.match(resume, /profile\.business\.name/);
    assert.match(resume, /profile\.business\.location/);
});

test('dönüş ekranında sabit kimlik, e-posta, PIN veya personel listesi bulunmaz', () => {
    assert.doesNotMatch(resume, /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    assert.doesNotMatch(
        resume,
        /Studio Ayla|Ayla Beauty|Ayla Klinik|Kadıköy|Nişantaşı|Bebek|Ayla Demir|Merve Kaya|Selin Boz|Emre Yıldız|Hande Arslan/,
    );
    assert.doesNotMatch(resume, /['"](?:1234|123456)['"]/);
    assert.doesNotMatch(resume, /\bTextInput\b|AuthStaffRow|\.map\s*\(/);
    assert.doesNotMatch(resume, /(?:profile|staff|business)(?:Id|Name)?\s*[:=]\s*['"][^'"]+['"]/i);
});

test('Face ID ve yedek giriş kararlarının tamamı session dikişinden geçer', () => {
    assert.match(resume, /authApi\.biometric\.authenticate\s*\(/);
    assert.match(resume, /authApi\.resume\.prepareFallback\s*\(/);
    assert.match(resume, /authApi\.resume\.signOut\s*\(/);
    assert.match(resume, /authApi\.staff\.unlinkDevice\s*\(/);
    assert.doesNotMatch(resume, /\bfetch\s*\(/);
    assert.doesNotMatch(resume, /\bAsyncStorage\b/);
    assert.doesNotMatch(resume, /\bsupabase\b|staff-api/i);
    assert.doesNotMatch(resume, /expo-local-authentication|LocalAuthentication/);
    // Faz 3'te gerçek biyometri KURULDU; korunacak kural değişmedi:
    // LocalAuthentication yalnız src/api/auth.ts içinde çağrılır.
    assert.match(packageJson, /expo-local-authentication/);
    assert.match(realAuth, /LocalAuthentication\.authenticateAsync/);
});

test('Face ID kapalıysa boş halka gösterilmez; kişi doğru yedek girişe gönderilir', () => {
    assert.match(
        resume,
        /if\s*\(\s*!result\.data\.biometricEnabled\s*\)[\s\S]{0,180}openFallback\s*\(/,
    );
    assert.match(resume, /result\.data\.actor\s*===\s*['"]manager['"]/);
    assert.match(resume, /\/(?:\(auth\)\/)?manager\/sign-in/);
    assert.match(resume, /\/(?:\(auth\)\/)?staff\/pin/);
    assert.match(authStub, /prepareResumeFallback/);
});

test('Face ID halkası dokunulabilir SVG olur; dolgu değil yalnız okuma kenarı turunculaşır', () => {
    assert.match(resume, /accessibilityLabel=["']Face ID ile gir["']/);
    assert.match(resume, /onPress=\{authenticate\}/);
    assert.match(resumeUiBundle, /react-native-svg/);
    assert.match(resumeUiBundle, /function\s+(?:Auth)?FaceIdIcon/);
    assert.match(resumeUiBundle, /function\s+(?:Auth)?FaceIdIcon[\s\S]{0,1800}<Svg[\s\S]{0,1000}<Path/);
    assert.match(resumeUiBundle, /strokeWidth=\{authMetrics\.iconStroke\}/);
    assert.match(resumeUiBundle, /strokeLinecap=["']round["']/);
    assert.match(resumeUiBundle, /strokeLinejoin=["']round["']/);
    assert.match(resume, /borderColor:\s*busy\s*\?\s*c\.or\s*:\s*c\.bd2/);
    assert.match(resume, /backgroundColor:\s*c\.surf/);
    assert.doesNotMatch(resume, /backgroundColor:\s*`?\$\{?c\.or/);
});

test('iki başarısız Face ID denemesinden sonra yedek giriş kendiliğinden açılır', () => {
    assert.match(resume, /(?:biometric|faceId)(?:Failure|Fail|Attempt)/i);
    assert.match(resume, /(?:>=|===?)\s*2|2\s*(?:<=|===?)/);
    assert.match(resume, /(?:>=|===?)\s*2[\s\S]{0,220}openFallback\s*\(|openFallback\s*\([\s\S]{0,220}(?:>=|===?)\s*2/);
});

test('hesap değiştirme müdür oturumunu, telefon değişimi personel eşleştirmesini doğru temizler', () => {
    assert.match(
        resume,
        /session\.actor\s*===\s*['"]staff['"][\s\S]{0,220}authApi\.staff\.unlinkDevice\s*\([\s\S]{0,220}staff\/pair/,
    );
    assert.match(
        resume,
        /authApi\.resume\.signOut\s*\([\s\S]{0,220}(?:\(auth\)\/)?welcome/,
    );
});

test('Giriş 10 ortak UI kitini, tema jetonlarını ve HTML ölçülerini kullanır', () => {
    const rawMeasure = /\b(?:fontSize|height|minHeight|maxHeight|width|minWidth|maxWidth|borderRadius|gap|padding(?:Top|Bottom|Left|Right|Horizontal|Vertical)?|margin(?:Top|Bottom|Left|Right|Horizontal|Vertical)?)\s*:\s*[2-9]\d*(?:\.\d+)?\b/;

    assert.match(resume, /src\/components\/ui/);
    assert.match(resume, /src\/theme/);
    assert.match(resume, /AuthActionButton/);
    assert.match(resume, /LueraMark/);
    assert.doesNotMatch(resume, rawMeasure, 'resume ekranına ham ölçü gömülmemeli');
    assert.match(tokens, /faceIdRing:\s*118/);
    assert.match(tokens, /resumeAvatar:\s*76/);
    assert.match(tokens, /resumeAvatarText:\s*26/);
    assert.match(tokens, /resumeNameSize:\s*24/);
    assert.match(tokens, /resumeBusinessSize:\s*14\.5/);
    assert.match(tokens, /resumePromptSize:\s*15\.5/);
    assert.match(resume, /authMetrics\.faceIdRing/);
    assert.match(resume, /authMetrics\.resumeAvatar/);
});

test('Giriş 10 basma geri bildirimini hareket sözleşmesinden alır', () => {
    assert.match(resumeUiBundle, /pressMotion\.(?:in|out)/);
    assert.match(resumeUiBundle, /useNativeDriver:\s*true/);
    assert.match(resumeUiBundle, /reduceMotion/);
    assert.doesNotMatch(
        resume,
        /Animated\.(?:timing|spring)[\s\S]{0,220}\b(?:height|width|backgroundColor|borderRadius|shadow)/,
    );
});
