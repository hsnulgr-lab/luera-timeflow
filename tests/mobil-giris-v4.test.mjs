import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    APPLE_DELETE_LINE, CODE_LIFETIME_MS, CODE_LOCK_MS, EMAIL_RECOVERY_READY, PASSWORD_RULE_TEXT,
    bridgeCopy, codeCopy, formatCountdown, loginMethodText, providerFailedText, providerWaitText,
    recoverCopy, remainingAttemptText,
} from '../mobile/src/lib/authCopy.ts';
import {
    LOGIN_NOTICE_TEXT, dropLoginNotice, onLoginNotice, queueLoginNotice, releaseLoginNotice,
} from '../mobile/src/lib/loginNotice.ts';
import { ssoInk, ssoMetrics, ssoMotion } from '../mobile/src/theme/tokens.ts';

/**
 * GİRİŞ v4 · APPLE VE GOOGLE (telefon) · 2026-10-19
 *
 * Kaynak: `Luera Mobil - Giris v4 Apple Google.html` + docs/giris-kararlar.md.
 * Bu dosya v4'ün kararlarını kilitliyor; v3'ün malzemesi (alan, cam,
 * `AuthField`) eski testlerinde.
 */

const oku = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** Yorumlar iddiayı yanlışlıkla karşılamasın. */
const kod = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const signIn = kod(oku('mobile/app/(auth)/manager/sign-in.tsx'));
const bridge = kod(oku('mobile/app/(auth)/manager/bridge.tsx'));
const business = kod(oku('mobile/app/(auth)/manager/business.tsx'));
const recover = kod(oku('mobile/app/(auth)/manager/recover.tsx'));
const account = kod(oku('mobile/app/(auth)/signup/account.tsx'));
const ready = kod(oku('mobile/app/(auth)/signup/ready.tsx'));
const welcome = kod(oku('mobile/app/(auth)/welcome.tsx'));
const layout = kod(oku('mobile/app/_layout.tsx'));
const profile = kod(oku('mobile/app/(staff-flow)/account.tsx'));
const sifre = kod(oku('mobile/app/(manager-flow)/profil/sifre.tsx'));
const hesapSil = kod(oku('mobile/app/(manager-flow)/profil/hesap-sil.tsx'));
const social = kod(oku('mobile/src/components/AuthSocial.tsx'));
const notice = kod(oku('mobile/src/components/LoginNotice.tsx'));
const socialAuth = oku('mobile/src/lib/socialAuth.ts');
const entry = kod(oku('mobile/src/lib/managerEntry.ts'));
const enterShell = kod(oku('mobile/src/lib/enterShell.ts'));
const live = kod(oku('mobile/src/api/auth.ts'));
const stub = kod(oku('mobile/src/api/authStub.ts'));
const session = kod(oku('mobile/src/api/session.ts'));
const deletion = kod(oku('mobile/src/api/accountDeletion.ts'));
const appJson = JSON.parse(oku('mobile/app.json')).expo;
const pkg = JSON.parse(oku('mobile/package.json'));

const fn = (src, start, end) => src.slice(src.indexOf(start), end ? src.indexOf(end, src.indexOf(start) + 1) : undefined);

// ── Kurulum ────────────────────────────────────────────────────────────────

test('Apple ve Google yerel kütüphaneleri ve yapılandırması', () => {
    for (const dep of ['expo-apple-authentication', '@react-native-google-signin/google-signin', 'expo-crypto', '@expo-google-fonts/google-sans']) {
        assert.ok(pkg.dependencies[dep], `bağımlılık yok: ${dep}`);
    }
    // Apple ile giriş yetkisi (entitlement) ve Google'ın dönüş şeması.
    assert.equal(appJson.ios.usesAppleSignIn, true);
    assert.ok(appJson.plugins.includes('expo-apple-authentication'));
    const google = appJson.plugins.find((p) => Array.isArray(p) && p[0] === '@react-native-google-signin/google-signin');
    assert.ok(google, 'Google eklentisi yok');
    // Şema = iOS istemci kimliğinin tersi (docs/giris-kararlar.md · s0ffn — sıfır).
    const iosId = socialAuth.match(/GOOGLE_IOS_CLIENT_ID = '([^']+)'/)[1];
    assert.equal(google[1].iosUrlScheme, `com.googleusercontent.apps.${iosId.replace('.apps.googleusercontent.com', '')}`);
    assert.match(iosId, /^477665756267-s0ffn786degg21i01uidr3pnoth7j5e7\./);
    // Türkçe yerelleştirme: Apple'ın düğmesi yazısını buradan seçiyor (açık nokta 6).
    assert.deepEqual(appJson.ios.infoPlist.CFBundleLocalizations, ['tr']);
});

test('Google modülü Expo Go\'yu düşürmüyor — üstte içe aktarılmıyor, dinamik import yok', () => {
    const body = kod(socialAuth);
    // Yalnız TÜR içe aktarımı: çalışma anında hiçbir şey yüklenmiyor.
    assert.doesNotMatch(body, /^import (?!type)[^;]*'@react-native-google-signin\/google-signin'/m);
    assert.match(body, /import type \{[^}]*\} from '@react-native-google-signin\/google-signin';/);
    // İlk dokunuşta `require`, `try` içinde; Expo Go'da hiç denenmiyor.
    assert.match(body, /try \{\s*\n\s*(?:\/\/[^\n]*\n\s*)*const loaded = require\('@react-native-google-signin\/google-signin'\)/);
    assert.match(body, /Constants\.executionEnvironment === ExecutionEnvironment\.StoreClient/);
    assert.doesNotMatch(body, /(?<![.\w])import\s*\(/);
});

test('Apple: özet Apple\'a, ham nonce giriş servisine; ad yalnız ilk girişte saklanıyor', () => {
    const apple = fn(kod(socialAuth), 'export async function appleCredential', 'export async function appleReauthCode');
    assert.match(apple, /const nonce = Crypto\.randomUUID\(\);/);
    assert.match(apple, /digestStringAsync\(Crypto\.CryptoDigestAlgorithm\.SHA256, nonce\)/);
    assert.match(apple, /nonce: hashed,/);
    assert.match(apple, /return \{ ok: true, provider: 'apple', idToken: credential\.identityToken, nonce, fullName \};/);
    // Kapatılan pencere bant DEĞİL.
    assert.match(apple, /if \(isCancel\(e\)\) return \{ ok: false, reason: 'cancelled' \};/);
    const start = fn(live, 'async function socialStart', 'async function socialBridge');
    assert.match(start, /signInWithIdToken\(\{\s*provider,\s*token: credential\.idToken,\s*\.\.\.\(credential\.nonce \? \{ nonce: credential\.nonce \} : \{\}\),/);
    assert.match(start, /if \(credential\.fullName && !data\.user\.user_metadata\?\.full_name\)/);
    // Bekleme ANCAK pencere kapanınca (B4).
    assert.ok(start.indexOf('onCredential?.()') > start.indexOf('await googleCredential()'));
    assert.ok(start.indexOf('onCredential?.()') < start.indexOf('signInWithIdToken'));
});

test('Google belgesi bir kez kullanılıyor — uygulama Google oturumu tutmuyor', () => {
    const google = fn(kod(socialAuth), 'export async function googleCredential');
    assert.match(google, /await GoogleSignin\.signOut\(\)\.catch\(\(\) => undefined\);/);
    assert.ok(google.indexOf('GoogleSignin.signOut') < google.indexOf('return { ok: true'));
    assert.match(google, /if \(result\.type !== 'success'\) return \{ ok: false, reason: 'cancelled' \};/);
});

// ── B1–B4 · Giriş ───────────────────────────────────────────────────────────

test('karşılama: üst kapının alt satırı üç yolu söylüyor (A)', () => {
    assert.match(welcome, /subtitle="Apple, Google ya da e-postayla girin"/);
    assert.doesNotMatch(welcome, /E-posta ve şifrenizle girin/);
});

test('B1 sırası: (sağlayıcı bandı) → Apple + Google → "ya da" → form → alt satır', () => {
    const order = ['<AuthBand>{providerFailedText(providerError)}', '<SsoPair', '<AuthOrWait', 'label="E-posta"', 'label="Şifre"',
        "label={error ? 'Tekrar dene' : 'Gir'}", 'label="Şifremi unuttum"', 'question="Hesabınız yok mu?"'];
    let at = -1;
    for (const part of order) {
        const next = signIn.indexOf(part);
        assert.ok(next > at, `sıra bozuk: ${part}`);
        at = next;
    }
    assert.match(signIn, /intent="login"/);
    // Klavye kendiliğinden açılmıyor: Apple ve Google ilk anda görünür.
    assert.doesNotMatch(signIn, /autoFocus|emailRef\.current\?\.focus\(\)/);
    // B4: bekleme sürerken form ve alt satır %42, düğmelerin dokunuşu kapalı.
    assert.equal((signIn.match(/<AuthDim dimmed=\{dimmed\}/g) ?? []).length, 2);
    assert.match(signIn, /locked=\{busy \|\| dimmed\}/);
    assert.equal(ssoMetrics.dimmed, 0.42);
});

test('B2: klavye açılınca "ya da" güvenli alanın 28 pt altına kayar', () => {
    assert.match(signIn, /const target = Math\.max\(0, pad \+ divider - insets\.top - S\.keyboardDividerTop\);/);
    assert.match(signIn, /scrollRef\.current\?\.scrollTo\(\{ y: target, animated: true \}\)/);
    assert.match(signIn, /scrollRef\.current\?\.scrollTo\(\{ y: 0, animated: true \}\)/);
    assert.equal(ssoMetrics.keyboardDividerTop, 28);
});

test('B3: "E-posta veya şifre hatalı." — sayı yalnız sunucu verirse, kilit süresi uydurulmuyor', () => {
    assert.equal(remainingAttemptText('manager', null), 'E-posta veya şifre hatalı.');
    assert.equal(remainingAttemptText('manager', 2), 'E-posta veya şifre hatalı. 2 denemeniz kaldı.');
    // İstek sınırı "hatalı" değil; bant süre yazmıyor, düğme 60 sn kapalı.
    assert.match(signIn, /if \(result\.error === 'locked'\) \{\s*setError\(\{\s*message: codeCopy\.locked,\s*lockedUntil: result\.lockedUntil \?\? Date\.now\(\) \+ CODE_LOCK_MS,/);
    assert.doesNotMatch(codeCopy.locked, /\d/);
    assert.equal(CODE_LOCK_MS, 60_000);
});

test('B4: sağlayıcı hatası düğmenin adıyla; kapatılan pencere sessiz', () => {
    assert.equal(providerFailedText('apple'), 'Apple ile giriş şu an yapılamadı. E-postanızla deneyebilirsiniz.');
    assert.equal(providerFailedText('google'), 'Google ile giriş şu an yapılamadı. E-postanızla deneyebilirsiniz.');
    assert.equal(providerWaitText('apple', 'login'), 'Apple ile giriş yapılıyor');
    for (const screen of [signIn, account]) {
        assert.match(screen, /if \(result\.error === 'cancelled'\) return;/);
    }
});

test('canlı giriş formu DEMO hesabıyla dolu açılmıyor', () => {
    /*
     * Canlıda `manager.prefill` yoktu ve çağrı stub'a düşüyordu: form
     * "ayla@studioayla.com" ve demo şifresiyle açılıyordu. v4 · B1 boş.
     */
    assert.match(live, /async function managerPrefill\(\): Promise<\{ email: string; password: string \}> \{\s*return \{ email: typedEmail, password: '' \};/);
    const manager = fn(live, '    manager: {', '    },');
    assert.match(manager, /prefill: managerPrefill,/);
    assert.match(session, /manager: \{ \.\.\.authStub\.manager, \.\.\.live\.manager \}/);
});

// ── Sağlayıcı düğmeleri ────────────────────────────────────────────────────

test('Apple sistemin düğmesi: SIGN_IN / SIGN_UP · WHITE koyu / BLACK açık · yarıçap 18', () => {
    assert.match(social, /<AppleAuthentication\.AppleAuthenticationButton/);
    assert.match(social, /buttonType=\{signup\s*\? AppleAuthentication\.AppleAuthenticationButtonType\.SIGN_UP\s*: AppleAuthentication\.AppleAuthenticationButtonType\.SIGN_IN\}/);
    assert.match(social, /buttonStyle=\{dark\s*\? AppleAuthentication\.AppleAuthenticationButtonStyle\.WHITE\s*: AppleAuthentication\.AppleAuthenticationButtonStyle\.BLACK\}/);
    assert.match(social, /cornerRadius=\{S\.buttonRadius\}/);
    // Android'de Apple yok (karar 8).
    assert.match(social, /\{apple && Platform\.OS === 'ios' \? \(/);
    assert.equal(ssoMetrics.buttonHeight, 60);
    assert.equal(ssoMetrics.buttonHeightSmall, 56);
    assert.equal(ssoMetrics.buttonRadius, 18);
    assert.equal(ssoMetrics.pairGap, 10);
});

test('Google özel düğme tarifi: renkler, G 20, Google Sans Medium 17, 16 · 12 · 16', () => {
    assert.deepEqual(
        [ssoInk.dark.googleBg, ssoInk.dark.googleBorder, ssoInk.dark.googleText],
        ['#131314', '#8E918F', '#E3E3E3'],
    );
    assert.deepEqual(
        [ssoInk.light.googleBg, ssoInk.light.googleBorder, ssoInk.light.googleText],
        ['#FFFFFF', '#747775', '#1F1F1F'],
    );
    assert.equal(ssoMetrics.googleIcon, 20);
    assert.equal(ssoMetrics.googleText, 17);
    assert.equal(ssoMetrics.googleX, 16);
    assert.equal(ssoMetrics.googleGap, 12);
    assert.match(social, /fontFamily: font\.googleMedium/);
    // G'nin dört rengi değişmeden.
    for (const color of ['#EA4335', '#4285F4', '#FBBC05', '#34A853']) assert.match(social, new RegExp(color));
    assert.match(social, /label=\{signup \? 'Google ile kaydol' : 'Google ile giriş yap'\}/);
    // Yazı tipi yalnız bu ağırlık, alt yoldan (sekiz dosyanın hepsi pakete girmesin).
    assert.match(layout, /import \{ GoogleSans_500Medium \} from '@expo-google-fonts\/google-sans\/500Medium';/);
    assert.match(layout, /GoogleSans_500Medium,\n\s*\}\);/);
});

test('cam nerede biter: Apple, Google ve bantlar OPAK (karar 4)', () => {
    const google = fn(social, 'function GoogleButton', 'export function SsoPair');
    assert.doesNotMatch(google, /GlassPlate|BlurView/);
    const band = fn(social, 'export function AuthBand', 'function CheckIcon');
    assert.doesNotMatch(band, /GlassPlate|BlurView/);
    assert.match(band, /backgroundColor: warn \? c\.surf2 : ink\.errBg/);
});

test('hareket sözleşmesi: 80 ms ritim, durum 140, ileri 240, geri 200, yay 20 · 330', () => {
    assert.deepEqual(
        [ssoMotion.stagger, ssoMotion.state, ssoMotion.forward, ssoMotion.back, ssoMotion.damping, ssoMotion.stiffness],
        [80, 140, 240, 200, 20, 330],
    );
    assert.equal(ssoMotion.reduced, 140);
    // Yalnız opacity / translate (açık nokta 2) — v4 parçalarında renk ya da boy animasyonu yok.
    assert.doesNotMatch(social, /interpolateColor|withTiming\([^)]*height/);
});

// ── B5 · Köprü ──────────────────────────────────────────────────────────────

test('B5: işletmesiz Apple/Google hesabına sessizce işletme AÇILMIYOR', () => {
    assert.match(entry, /if \(businesses\.length === 0\) \{\s*router\.push\('\/\(auth\)\/manager\/bridge'\);/);
    // Uygulama köprüde kapanıp açılırsa boş liste değil yine köprü.
    assert.match(business, /if \(result\.data\.length === 0\) \{\s*router\.replace\('\/\(auth\)\/manager\/bridge'\);/);
    assert.match(bridge, /authApi\.social\.createBusiness\(\)/);
    assert.match(bridge, /router\.replace\('\/\(auth\)\/signup\/business'\)/);
    // "E-postayla giriş yap" ve kaydırarak geri dönmek aynı iş: oturum kapanır.
    assert.match(bridge, /navigation\.addListener\('beforeRemove', \(\) => \{\s*if \(!forward\.current\) void authApi\.social\.leave\(\);/);
    assert.match(live, /async function socialLeave\(\): Promise<void> \{\s*await supabase\.auth\.signOut\(\)/);
    // Sunucu fonksiyonu göç 121'de.
    assert.match(live, /supabase\.rpc\('create_own_business'\)/);
    assert.match(oku('supabase/121_sosyal_giris.sql'), /CREATE OR REPLACE FUNCTION public\.create_own_business\(\)/);
});

test('B5 metni: not YALNIZ Apple\'da; geri oku yok', () => {
    assert.equal(bridgeCopy.title, 'Bu hesapla bir işletme bulamadık');
    assert.equal(bridgeCopy.body('google'), 'Google hesabınızla henüz işletme açılmamış. Daha önce e-postayla kaydolduysanız e-postanızla girin.');
    assert.match(bridgeCopy.appleNote, /E-postamı gizle/);
    assert.match(bridge, /\{account\.provider === 'apple' \? <AuthV4Note>\{bridgeCopy\.appleNote\}<\/AuthV4Note> : null\}/);
    assert.doesNotMatch(bridge, /AuthV4Nav|AuthBackBar/);
    assert.match(bridge, /<AuthV4Button glass label=\{bridgeCopy\.email\}/);
});

// ── K1 · K2 · Kayıt ────────────────────────────────────────────────────────

test('K1: Apple ile Kaydol / Google ile kaydol formun üstünde, alt satır girişe', () => {
    assert.match(account, /intent="signup"/);
    assert.ok(account.indexOf('<SsoPair') < account.indexOf('label="E-posta"'));
    assert.match(account, /question="Zaten hesabınız var mı\?"\s*action="Giriş yapın"/);
    assert.match(account, /<AuthStepIndicator step=\{1\} \/>/);
    // İki ekran arasında gidip gelmek yığını büyütmesin.
    assert.match(account, /router\.dismissTo\('\/\(auth\)\/manager\/sign-in'\)/);
    assert.match(signIn, /router\.dismissTo\('\/\(auth\)\/signup\/account'\)/);
});

test('Apple/Google ile kayıt: işletme yoksa açılır ve 2/3; varsa doğrudan içeri + K4', () => {
    const fnSocial = fn(account, 'const social = async', 'const verify = async');
    assert.match(fnSocial, /continueManager\(router, result\.data\.businesses, \{ offer: false, notice: 'social' \}\)/);
    assert.ok(fnSocial.indexOf("notice: 'social'") < fnSocial.indexOf('authApi.social.createBusiness()'));
    assert.match(fnSocial, /router\.push\('\/\(auth\)\/signup\/business'\)/);
    // Kod adımı YOK — hesap Apple/Google'da doğrulandı.
    assert.doesNotMatch(fnSocial, /toCode|setPhase\('code'\)/);
});

test('karar 2: kayıtlı e-posta ekrandan okunmuyor — içeri + not, ya da kod ekranı (kod gitmez)', () => {
    const create = fn(live, 'async function createSignupAccount', 'async function verifySignupCode');
    assert.match(create, /error\.code === 'user_already_exists'[\s\S]{0,120}return existingOrCode\(normalized, password\);/);
    assert.match(create, /\(data\.user\?\.identities \?\? \[\]\)\.length === 0\) return existingOrCode/);
    const existing = fn(live, 'async function existingOrCode', 'async function writeCodeDraft');
    assert.match(existing, /signInWithPassword\(\{ email, password \}\)/);
    assert.match(existing, /return done\(\{ email, next: 'existing', businesses: list\.data \}\);/);
    assert.match(existing, /await writeCodeDraft\(email\);\s*return done\(\{ email, next: 'code' \}\);/);
    // "Bu e-posta zaten kullanılıyor" hiçbir yerde yok.
    assert.doesNotMatch(account, /zaten kullanılıyor/);
    assert.match(account, /continueManager\(router, result\.data\.businesses \?\? \[\], \{ offer: false, notice: 'email' \}\)/);
    // Kod ekranında HER ZAMAN: "Kod gelmediyse bu adresle zaten hesabınız olabilir".
    assert.match(account, /\{codeCopy\.maybeAccount\}/);
    assert.equal(codeCopy.maybeAccount, 'Kod gelmediyse bu adresle zaten hesabınız olabilir:');
    // Şifre cihazda tutulmuyor.
    assert.doesNotMatch(fn(live, 'async function writeCodeDraft', 'async function verifySignupCode'), /password/);
});

test('K2: tek gizli alan, 6 kutu çizimi, sistemin sayı klavyesi, 6. hanede kendiliğinden', () => {
    const otp = fn(social, 'export const AuthOtp', 'export function AuthResend');
    assert.match(otp, /keyboardType="number-pad"/);
    assert.match(otp, /textContentType="oneTimeCode"/);
    assert.match(otp, /autoComplete=\{Platform\.OS === 'android' \? 'sms-otp' : 'one-time-code'\}/);
    assert.equal((otp.match(/<TextInput\s/g) ?? []).length, 1);
    assert.match(otp, /Array\.from\(\{ length: S\.codeLength \}/);
    assert.equal(ssoMetrics.codeLength, 6);
    // Boşluklu yapıştırma ("482 107") tek seferde.
    assert.match(otp, /const digits = raw\.replace\(\/\\D\/g, ''\);/);
    assert.match(otp, /if \(!error && next\.length === S\.codeLength\) onComplete\(next\);/);
    // Yanlış kodda rakamlar kalır; ilk tuş hepsini siler.
    assert.match(otp, /\? \(digits\.length > value\.length \? digits\.slice\(value\.length\)\.slice\(0, 1\) : ''\)/);
    // Ayrı "Doğrula" düğmesi yok.
    assert.doesNotMatch(account, /label="Doğrula"/);
    assert.deepEqual([ssoMetrics.codeHeight, ssoMetrics.codeHeightSmall, ssoMetrics.codeRadius, ssoMetrics.codeGap, ssoMetrics.codeText],
        [66, 58, 16, 9, 28]);
});

test('K2 hâlleri: yanlış (kırmızı, birleşik cümle), süresi doldu (amber, yalnız ömür geçince), çok deneme (amber, süresiz)', () => {
    // Sunucu yanlış ile süresi dolmuşu AYIRMIYOR (otp_expired) — masaüstüyle aynı cümle.
    assert.match(codeCopy.wrong, /^Kod doğru değil ya da süresi doldu\./);
    assert.equal(codeCopy.expired, 'Bu kodun süresi doldu.');
    assert.equal(CODE_LIFETIME_MS, 24 * 60 * 60 * 1000);
    for (const screen of [account, recover]) {
        assert.match(screen, /const expired = phase === 'code' && sentAt > 0 && now - sentAt > CODE_LIFETIME_MS;/);
        assert.match(screen, /<AuthBand kind="warn">\{codeCopy\.locked\}<\/AuthBand>/);
        assert.match(screen, /<AuthBand kind="warn">\{codeCopy\.expired\}<\/AuthBand>/);
        assert.match(screen, /<AuthBand>\{codeCopy\.wrong\}<\/AuthBand>/);
        assert.match(screen, /<AuthV4Button label=\{codeCopy\.newCode\}/);
        // Kilitte "Yeniden gönder" de yok.
        assert.match(screen, /\{codeLocked \? null : expired \? \(/);
    }
    assert.match(live, /function codeFailure[\s\S]{0,400}return fail\('invalid_code'\);/);
});

test('"Yeniden gönder" 60 sn kapalı, geri sayım m:ss', () => {
    assert.equal(formatCountdown(59), '0:59');
    assert.equal(formatCountdown(60), '1:00');
    assert.equal(formatCountdown(0), '0:00');
    assert.match(live, /const RESEND_MS = 60_000;/);
    assert.match(social, /Kod gelmedi mi\?/);
});

// ── K3 · K4 ─────────────────────────────────────────────────────────────────

test('K3: "Kim yapıyor?" markası "luera" + "timeflow"', () => {
    assert.match(ready, /<LueraTimeflowMark size=\{authMetrics\.modeMarkSize\} animate=\{false\} \/>/);
    assert.doesNotMatch(ready, /<LueraMark\b/);
});

test('K4: not KABUĞA varınca gösteriliyor — kökte, 6 sn, dokununca kapanıyor', () => {
    assert.equal(LOGIN_NOTICE_TEXT.social, 'Bu hesapla zaten işletmeniz var — giriş yaptınız.');
    assert.equal(LOGIN_NOTICE_TEXT.email, 'Bu e-postayla zaten hesabınız var — giriş yaptınız.');
    assert.ok(enterShell.indexOf('releaseLoginNotice()') > enterShell.indexOf('router.replace(shellHref(actor, solo));'));
    assert.match(layout, /<LoginNoticeHost \/>/);
    assert.equal(ssoMotion.toastHold, 6000);
    assert.match(notice, /onPress=\{\(\) => setClosing\(true\)\}/);
    assert.match(notice, /<GlassPlate radius=\{S\.toastRadius\}>/);
});

test('K4 sırası davranışta: kuyruktaki not bir kez, kabukta bırakılınca gösteriliyor', () => {
    const seen = [];
    const off = onLoginNotice((text) => seen.push(text));
    releaseLoginNotice();
    assert.deepEqual(seen, [], 'sırada not yokken bir şey gösterildi');
    queueLoginNotice('social');
    assert.deepEqual(seen, [], 'not kabuğa varmadan gösterildi');
    releaseLoginNotice();
    releaseLoginNotice();
    assert.deepEqual(seen, [LOGIN_NOTICE_TEXT.social], 'not bir kez gösterilmeli');
    queueLoginNotice('email');
    dropLoginNotice();
    releaseLoginNotice();
    assert.equal(seen.length, 1, 'düşürülen not yine gösterildi');
    off();
});

// ── S1–S3 · Şifre ───────────────────────────────────────────────────────────

test('S1–S3: bağlantı değil kod; "belirleyin"; S1 B1\'in e-postasıyla', () => {
    assert.equal(EMAIL_RECOVERY_READY, true);
    assert.equal(recoverCopy.title, 'Yeni şifre belirleyin');
    assert.equal(recoverCopy.hint, 'Hesabınız varsa kodu birkaç dakika içinde alırsınız.');
    assert.match(signIn, /authApi\.manager\.remember\(email\);\s*router\.push\('\/\(auth\)\/manager\/recover'\);/);
    assert.match(live, /function rememberTypedEmail\(email: string\): void \{\s*typedEmail = email\.trim\(\);/);
    // Sızdırmama: yalnız ağ yoksa "gönderdik" denmiyor.
    const rec = fn(live, 'async function recoverManagerPassword', 'function codeFailure');
    assert.match(rec, /if \(error && isAuthRetryableFetchError\(error\)\) return fail\('offline'\);/);
    assert.equal((rec.match(/return /g) ?? []).length, 3);
    // S3: yeniden giriş yok; normal girişin yolu (karar 5: Face ID teklifi).
    assert.match(recover, /await continueManager\(router, result\.data\.businesses, \{ offer: true \}\);/);
    assert.match(live, /updateUser\(\{ password, data: \{ password_set: true \} \}\)/);
    assert.equal(PASSWORD_RULE_TEXT, 'En az 8 karakter olsun, içinde bir rakam bulunsun.');
});

// ── P1 · Profil › Hesap ────────────────────────────────────────────────────

test('P1: giriş yöntemi YALNIZ yazıyla, logo yok (karar 7)', () => {
    assert.equal(loginMethodText(['apple']), 'Apple ile');
    assert.equal(loginMethodText(['google']), 'Google ile');
    assert.equal(loginMethodText(['email']), 'E-posta ile');
    assert.equal(loginMethodText(['email', 'google']), 'E-posta ve Google ile');
    assert.match(profile, /<AuthAccountInfoRow\s*title="Giriş yöntemi"\s*value=\{loginMethodText\(account\.login\.providers\)\}/);
    assert.doesNotMatch(profile, /AppleAuthentication|GoogleMark|#4285F4/);
});

test('P1: şifresiz Apple/Google hesabında "Şifre belirle"; şifreli hesapta bu kapı KAPALI', () => {
    assert.match(profile, /title=\{noPassword \? passwordSet\.row : 'Şifreyi değiştir'\}/);
    const set = fn(live, 'async function setAccountPassword', 'async function accountRequestDeletion');
    assert.match(set, /if \(loginMethodOf\(userData\.user\)\.hasPassword\) return fail\('no_session'\);/);
    assert.ok(set.indexOf('hasPassword') < set.indexOf('updateUser'));
    assert.match(live, /hasPassword: providers\.includes\('email'\) \|\| user\.user_metadata\?\.password_set === true,/);
    // Şifre ekranı iki kipli: belirlemede "şu anki şifre" alanı yok.
    assert.match(sifre, /\{settingFirst \? null : \(/);
    assert.match(sifre, /\? await authApi\.account\.setPassword\(next\)\s*: await authApi\.account\.changePassword\(current, next\);/);
});

test('P1 · silme: Apple hesabında tek satır + Apple\'a bir kez daha sorulur; vazgeçen silinmez', () => {
    assert.equal(APPLE_DELETE_LINE, 'Apple ile girişiniz de kaldırılır.');
    assert.match(hesapSil, /\{apple \? \(/);
    assert.match(hesapSil, /deleteAccount\(orgId, \{ apple \}\)/);
    assert.match(hesapSil, /if \(!result\.ok && result\.reason === 'cancelled'\) return;/);
    const del = fn(deletion, 'export async function deleteAccount');
    assert.match(del, /if \(!reauth\.ok && reauth\.reason === 'cancelled'\) return \{ ok: false, reason: 'cancelled' \};/);
    // Apple'a ulaşılamazsa silme yine yapılır (sunucunun kuralıyla aynı).
    assert.match(del, /appleCode = reauth\.ok \? reauth\.code : null;/);
    assert.ok(del.indexOf('appleReauthCode()') < del.indexOf("functions.invoke('account-delete'"));
});

// ── Sözleşme ────────────────────────────────────────────────────────────────

test('Apple/Google canlıda — iki kipte aynı yüzey', () => {
    assert.match(session, /'social'/);
    assert.match(session, /social: \{ \.\.\.authStub\.social, \.\.\.live\.social \}/);
    for (const src of [live, stub]) {
        for (const name of ['available:', 'start:', 'bridge:', 'createBusiness:', 'leave:', 'verify:', 'resend:', 'verifyRecovery:', 'setPassword:']) {
            assert.ok(src.includes(name), `eksik: ${name}`);
        }
    }
});
