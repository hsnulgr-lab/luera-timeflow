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
const faceRing = source('mobile/src/components/FaceRing.tsx');
const resumeUiBundle = `${resume}\n${ui}\n${faceRing}`;

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
    // Konum boşsa sonda ayraç kalmasın diye satır tek yardımcıdan kuruluyor;
    // yardımcı adı VE konumu taşıyor.
    assert.match(resume, /businessLine\(profile\.business\)/);
    const map = readFileSync(new URL('../mobile/src/lib/accountMap.ts', import.meta.url), 'utf8');
    assert.match(map, /\[business\.name, business\.location\]/);
});

test('dönüş ekranında sabit kimlik, e-posta, PIN veya personel listesi bulunmaz', () => {
    assert.doesNotMatch(resume, /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    assert.doesNotMatch(
        resume,
        /Studio Ayla|Ayla Beauty|Ayla Klinik|Kadıköy|Nişantaşı|Bebek|Ayla Demir|Merve Kaya|Selin Boz|Emre Yıldız|Hande Arslan/,
    );
    assert.doesNotMatch(resume, /['"](?:1234|123456)['"]/);
    assert.doesNotMatch(resume, /\bTextInput\b|AuthStaffRow|\.map\s*\(/);
    // `profile="lock"` ışık alanının katmanı, bir kimlik değil — testin
    // aradığı şey sabitlenmiş bir kişi/işletme adı olduğu için dışarıda.
    assert.doesNotMatch(
        resume,
        /(?:profileName|staffName|businessName|staffId|businessId)\s*[:=]\s*['"][^'"]+['"]/i,
    );
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
    // Halka `FaceRing.tsx`'e taşındı; erişilebilirlik etiketi onunla gitti.
    assert.match(faceRing, /accessibilityLabel="Face ID ile gir"/);
    assert.match(resume, /onPress=\{authenticate\}/);
    assert.match(resumeUiBundle, /react-native-svg/);
    assert.match(resumeUiBundle, /function\s+(?:Auth)?FaceIdIcon/);
    assert.match(resumeUiBundle, /function\s+(?:Auth)?FaceIdIcon[\s\S]{0,1800}<Svg[\s\S]{0,1000}<Path/);
    assert.match(resumeUiBundle, /strokeWidth=\{authMetrics\.iconStroke\}/);
    assert.match(resumeUiBundle, /strokeLinecap=["']round["']/);
    assert.match(resumeUiBundle, /strokeLinejoin=["']round["']/);
    // Giriş v3: halka `FaceRing`'e taşındı ve CAM oldu. Kenar rengi artık üç
    // hâl taşıyor (nötr nefes · turuncu tanınma · kırmızı başarısızlık), o
    // yüzden tek satırlık `busy ? c.or : c.bd2` koşulu yerini bir duruma
    // bıraktı. Değişmeyen kural burada: DOLGU turunculaşmıyor, yalnız KENAR.
    assert.match(resume, /<FaceRing[\s\S]{0,200}state=\{face\}/);
    assert.match(faceRing, /borderColor:\s*border/);
    assert.match(faceRing, /backgroundColor:\s*g\.fill/);
    assert.doesNotMatch(faceRing, /backgroundColor:\s*`?\$\{?c\.or/);
});

test('iki başarısız Face ID denemesinden sonra yedek giriş kendiliğinden açılır', () => {
    assert.match(resume, /(?:biometric|faceId)(?:Failure|Fail|Attempt)/i);
    assert.match(resume, /(?:>=|===?)\s*2|2\s*(?:<=|===?)/);
    assert.match(resume, /(?:>=|===?)\s*2[\s\S]{0,220}openFallback\s*\(|openFallback\s*\([\s\S]{0,220}(?:>=|===?)\s*2/);
});

test('hesap değiştirme müdür oturumunu, telefon değişimi personel eşleştirmesini doğru temizler', () => {
    // Kural aynı — personel yolu eşleşmeyi siler ve eşleştirme ekranına
    // gider. Değişen tek şey ARAYA ONAY GİRMESİ: geri alınamayan bu işlem
    // tek dokunuşta duruyordu. O yüzden zincir artık tek blokta değil;
    // parçaları ayrı ayrı doğrulanıyor.
    assert.match(resume, /session\.actor === 'staff'[\s\S]{0,800}Alert\.alert\(/);
    assert.match(
        resume,
        /const unlinkPhone = async \(\) => \{[\s\S]{0,200}authApi\.staff\.unlinkDevice\(\)[\s\S]{0,120}staff\/pair/,
    );
    assert.match(resume, /onPress: \(\) => \{ void unlinkPhone\(\); \}/);
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
    assert.match(faceRing, /authMetrics\.faceIdRing/);
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

test('telefonu işletmeden çıkarmak ONAY istiyor', () => {
    // "Bu telefon benim değil" eşleşmeyi siliyor ve geri dönmek için işletme
    // sahibinden yeni kod gerekiyor. Geri alınamayan bu işlem tek dokunuşta
    // duruyordu; uygulamayı denerken defalarca kazayla basıldı.
    const screen = readFileSync(new URL('../mobile/app/(auth)/resume.tsx', import.meta.url), 'utf8');
    assert.match(screen, /Alert\.alert\(\s*'Bu telefonu işletmeden çıkaralım mı\?'/);
    assert.match(screen, /style: 'destructive'/);
    assert.match(screen, /text: 'Vazgeç', style: 'cancel'/);
    // Onaysız yol kapandı.
    assert.doesNotMatch(screen, /if \(session\.actor === 'staff'\) \{\s*await authApi\.staff\.unlinkDevice\(\)/);
});

// ── Müdürün oturumu profil yuvasından BAĞIMSIZ ──────────────────────────────

test('profil kaydı silinse de müdür şifresini yeniden yazmıyor', () => {
    /*
     * Profil tek yuvada duruyor (`tf.auth.profile`): aynı telefonda personel
     * girişi yapılınca müdürünkinin üzerine yazılıyor, personel çıkınca yuva
     * siliniyor. Supabase oturumu ise yerinde. Açılış yalnız yuvaya baktığı
     * için müdür her seferinde e-posta ve şifre yazmak zorunda kalıyordu.
     */
    const launch = realAuth.slice(
        realAuth.indexOf('async function getLaunchState'),
        realAuth.indexOf('async function pendingStaffMember'),
    );
    assert.match(launch, /supabaseConfigured && \(await supabase\.auth\.getSession\(\)\)\.data\.session/);
    assert.match(launch, /return \{ target: 'managerBusiness' \};/);
    // 099 KARARI KORUNUYOR: telefon personele bağlıysa oraya gidilir, müdür
    // oturumu o kapıyı kapatmaz.
    assert.ok(launch.indexOf('tokens.device()') < launch.indexOf("target: 'managerBusiness'"));
    assert.match(authStub, /\| \{ target: 'managerBusiness' \}/);
    assert.match(index, /launch\.target === 'managerBusiness'[\s\S]{0,140}\/\(auth\)\/manager\/business/);
});

test('geri düğmesi geçmiş yoksa ölü kalmıyor', () => {
    // `replace` ile gelinen ekranda `back()` hiçbir şey yapmadan
    // "GO_BACK was not handled" uyarısı bırakıyordu: kapısı olmayan bir düğme.
    for (const path of [
        'mobile/app/(auth)/manager/sign-in.tsx',
        'mobile/app/(auth)/manager/business.tsx',
        'mobile/app/(auth)/manager/recover.tsx',
    ]) {
        const screen = source(path);
        assert.match(screen, /if \(router\.canGoBack\(\)\) router\.back\(\);/, path);
        assert.match(screen, /else router\.replace\('\/\(auth\)\/welcome'\);/, path);
    }
});
