import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function source(path) {
    const url = new URL(`../${path}`, import.meta.url);
    return existsSync(url) ? readFileSync(url, 'utf8') : '';
}

const welcome = source('mobile/app/(auth)/welcome.tsx');
const account = source('mobile/app/(auth)/signup/account.tsx');
const business = source('mobile/app/(auth)/signup/business.tsx');
const ready = source('mobile/app/(auth)/signup/ready.tsx');
const authStub = source('mobile/src/api/authStub.ts');
const ui = source('mobile/src/components/ui.tsx');
const tokens = source('mobile/src/theme/tokens.ts');
const authValidation = source('mobile/src/lib/authValidation.ts');
const signupScreens = [account, business, ready];
const signupBundle = signupScreens.join('\n');
const signupUiBundle = `${signupBundle}\n${ui}`;

test('Giriş 11–13 üç ayrı signup rotasıdır ve sırayla gezilir', () => {
    assert.notEqual(account, '', 'signup/account.tsx eksik');
    assert.notEqual(business, '', 'signup/business.tsx eksik');
    assert.notEqual(ready, '', 'signup/ready.tsx eksik');

    assert.match(welcome, /\/(?:\(auth\)\/)?signup\/account/);
    assert.match(account, /\/(?:\(auth\)\/)?signup\/business/);
    assert.match(business, /\/(?:\(auth\)\/)?signup\/ready/);
    // Son adım kabuğa `enterShell` ile giriyor: adres tek yerde,
    // `src/lib/enterShell.ts` içinde, ve giriş yığını boşaltıyor.
    assert.match(ready, /enterShell\('manager'\)/);
});

test('yeni işletme akışının tek veri dikişi authApi.signup olur', () => {
    for (const [name, screen] of [
        ['account', account],
        ['business', business],
        ['ready', ready],
    ]) {
        assert.match(screen, /src\/api\/session/, `${name} authStub içe aktarmalı`);
        assert.doesNotMatch(screen, /src\/api\/staff(?:['"]|\.ts)/, `${name} staff-api çağırmamalı`);
        assert.doesNotMatch(screen, /\bfetch\s*\(/, `${name} doğrudan istek atmamalı`);
        assert.doesNotMatch(screen, /\bAsyncStorage\b/, `${name} taslağı kendi saklamamalı`);
        assert.doesNotMatch(screen, /\bsupabase\b|staff-api/i, `${name} sunucuya bağlanmamalı`);
    }

    assert.match(account, /authApi\.signup\.account\s*\(/);
    assert.match(business, /authApi\.signup\.draft\s*\(/);
    assert.match(business, /authApi\.signup\.sectors\s*\(/);
    assert.match(business, /authApi\.signup\.business\s*\(/);
    assert.match(business, /authApi\.signup\.sector\s*\(/);
    assert.match(business, /authApi\.signup\.complete\s*\(/);
    assert.match(ready, /authApi\.resume\.get\s*\(/);
    assert.match(authStub, /signup:\s*\{[\s\S]{0,500}\bdraft:/);
    assert.match(authStub, /signup:\s*\{[\s\S]{0,500}\bsectors:/);
});

test('e-posta, işletme ve sektör route paramına yazılmaz; ekranlarda sabit kimlik yoktur', () => {
    assert.doesNotMatch(signupBundle, /useLocalSearchParams|searchParams|params\s*:\s*\{/);
    assert.doesNotMatch(signupBundle, /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    assert.doesNotMatch(
        signupBundle,
        /Studio Ayla|Ayla Beauty|Ayla Klinik|Saç ve Bakım|Kadıköy|Nişantaşı|Bebek|Ayla Demir|Merve Kaya/,
    );
    assert.doesNotMatch(signupBundle, /['"](?:1234|123456)['"]/);
    assert.doesNotMatch(signupBundle, /router\.(?:push|replace)\s*\(\s*\{[\s\S]{0,180}\bparams\b/);
});

test('signup ekranları ortak UI kitini ve yalnız tema jetonlarını kullanır', () => {
    const rawMeasure = /\b(?:fontSize|height|minHeight|maxHeight|width|minWidth|maxWidth|borderRadius|gap|padding(?:Top|Bottom|Left|Right|Horizontal|Vertical)?|margin(?:Top|Bottom|Left|Right|Horizontal|Vertical)?)\s*:\s*[2-9]\d*(?:\.\d+)?\b/;

    for (const [name, screen] of [
        ['account', account],
        ['business', business],
        ['ready', ready],
    ]) {
        assert.match(screen, /src\/components\/ui/, `${name} ortak UI kitini kullanmalı`);
        assert.match(screen, /src\/theme/, `${name} ölçüleri temadan almalı`);
        assert.doesNotMatch(screen, rawMeasure, `${name} içine ham ölçü gömülmemeli`);
    }

    for (const component of [
        'AuthStepIndicator',
        'AuthPasswordRule',
        'AuthSectorOption',
        'AuthReadyChecklist',
    ]) {
        assert.match(ui, new RegExp(`export\\s+function\\s+${component}\\b`), `${component} UI kitinde olmalı`);
        assert.match(signupBundle, new RegExp(`\\b${component}\\b`), `${component} ekranda kullanılmalı`);
    }

    assert.match(account, /\bAuthPage\b/);
    assert.match(account, /\bAuthField\b/);
    assert.match(business, /\bAuthField\b/);
    assert.match(ready, /\bAuthBanner\b/);
    assert.match(signupBundle, /\bAuthActionButton\b/);
});

test('signup ölçüleri HTML CSS değerleriyle token dosyasında tek yerde tutulur', () => {
    assert.match(tokens, /inputHeight:\s*60/);
    assert.match(tokens, /inputHeightSmall:\s*56/);
    assert.match(tokens, /sectorRowHeight:\s*60/);
    assert.match(tokens, /signupStepHeight:\s*3/);
    assert.match(tokens, /signupStepsGap:\s*6/);
    assert.match(tokens, /passwordHintCircle:\s*14/);
    assert.match(tokens, /passwordHintSize:\s*12\.5/);
    assert.match(tokens, /sectorGap:\s*9/);
    assert.match(tokens, /sectorRadio:\s*22/);
    assert.match(tokens, /readyRowHeight:\s*62/);
    assert.match(tokens, /readyNumberCircle:\s*26/);
});

test('Giriş 11 hesap metni, nötr şifre kuralı ve koşul satırı eksiksizdir', () => {
    const accountUiBundle = `${account}\n${ui}\n${authValidation}`;
    for (const copy of [
        'Hesabınızı açalım',
        'Bu e-posta ve şifreyle bilgisayardan da girersiniz.',
        'E-posta',
        'Şifre',
        'En az 8 karakter olsun, içinde bir rakam bulunsun.',
        'Kullanım Koşulları',
        'Gizlilik Politikası',
        'Devam',
        'Abonelik daha sonra bilgisayardan seçilir. Şimdi ödeme yapmıyorsunuz.',
    ]) {
        assert.ok(accountUiBundle.includes(copy), `Giriş 11 metni eksik: ${copy}`);
    }

    assert.match(account, /passwordRuleState\s*\(/);
    assert.match(account, /isValidEmail\s*\(/);
    assert.match(account, /passwordRule[^\n]*\.valid|passwordState[^\n]*\.valid|rules[^\n]*\.valid/);
    assert.match(account, /disabled\s*=\s*\{[^}]*valid/);
});

test('Giriş 11 klavye, güçlü şifre, otomatik doldurma ve yapıştırma sözleşmesini korur', () => {
    const accountInputBundle = `${account}\n${ui}`;

    assert.match(accountInputBundle, /KeyboardAvoidingView/);
    assert.match(accountInputBundle, /keyboardShouldPersistTaps\s*=\s*['"]handled['"]/);
    assert.match(accountInputBundle, /automaticallyAdjustKeyboardInsets/);
    assert.match(account, /keyboardType\s*=\s*['"]email-address['"]/);
    assert.match(account, /autoCapitalize\s*=\s*['"]none['"]/);
    assert.match(account, /textContentType\s*=\s*['"]username['"]/);
    assert.match(account, /autoComplete\s*=\s*['"]email['"]/);
    assert.match(account, /textContentType\s*=\s*['"]newPassword['"]/);
    assert.match(account, /autoComplete\s*=\s*['"]new-password['"]/);
    assert.match(account, /passwordRules\s*=/);
    assert.match(account, /returnKeyType\s*=\s*['"]next['"]/);
    assert.match(account, /returnKeyType\s*=\s*['"]go['"]/);
    assert.match(account, /autoFocus/);
    assert.doesNotMatch(accountInputBundle, /contextMenuHidden/);
});

test('Giriş 12 işletme adı ve yedi sektör seçeneğini tasarımdaki sırayla taşır', () => {
    const sectorCatalog = authStub.match(
        /const signupSectors:[\s\S]*?\n\];/,
    )?.[0] ?? '';
    const businessDataBundle = `${business}\n${sectorCatalog}`;
    for (const copy of [
        'İşletmeniz',
        'Adı müşterilere gönderilen hatırlatmalarda görünür.',
        'İşletme adı',
        'Ne iş yapıyorsunuz?',
        'Hizmet listesi, süreler ve kayıt alanları buna göre kurulur.',
        'Kuaför',
        'Güzellik',
        'Diş',
        'Klinik',
        'Dövme',
        'Restoran',
        'Diğer',
        'Sonradan değiştirebilirsiniz.',
        'Devam',
    ]) {
        assert.ok(businessDataBundle.includes(copy), `Giriş 12 metni eksik: ${copy}`);
    }

    const order = ['Kuaför', 'Güzellik', 'Diş', 'Klinik', 'Dövme', 'Restoran', 'Diğer'];
    let cursor = -1;
    for (const sector of order) {
        const next = businessDataBundle.indexOf(sector);
        assert.ok(next > cursor, `sektör sırası yanlış veya eksik: ${sector}`);
        cursor = next;
    }
});

test('Giriş 12 aynı rotada ad ve sektör hâllerini yönetir; veri stub taslağından gelir', () => {
    assert.match(business, /(?:stage|step|phase)/i);
    assert.match(business, /Keyboard\.dismiss\s*\(/);
    assert.match(business, /\.trim\s*\(\s*\)/);
    assert.match(business, /draft(?:Result)?\.data\.businessName|draft\.businessName/);
    assert.match(business, /selectedSector|sector[^\n]*setSector|setSector[^\n]*sector/i);
    assert.match(signupUiBundle, /accessibilityState\s*=\s*\{\{[^}]*(?:checked|selected)/);
    assert.match(signupUiBundle, /react-native-svg/);
    assert.match(ui, /function\s+(?:Auth)?CheckIcon/);
});

test('Giriş 13 hazır ekranı tamamlanmış oturumdan işletme adını alır ve sıradaki işleri söyler', () => {
    for (const copy of [
        'hazır',
        'Randevu almaya bugün başlayabilirsiniz. Üç şey eklendiğinde uygulama tam çalışır:',
        'Hizmetlerinizi ekleyin',
        'Personelinizi ekleyin',
        'Çalışma saatlerini girin',
        'Ayrıntılı kurulum bilgisayarda daha hızlı: hizmet listesini, fiyatları ve saatleri orada topluca girersiniz.',
        'Uygulamayı kullanmaya başla',
        'Kurulumu bilgisayardan tamamla',
    ]) {
        assert.ok(ready.includes(copy), `Giriş 13 metni eksik: ${copy}`);
    }

    assert.match(ready, /(?:session|result)(?:Result)?\.data\.(?:profile\.)?business\.name/);
    assert.match(ready, /authApi\.resume\.get\s*\(/);
    assert.doesNotMatch(ready, /Tebrik|Konfeti|confetti|✅/i);
});

test('Giriş 12 oturumu sektör seçildikten sonra tamamlar; Giriş 13 iki ayrı yol sunar', () => {
    assert.match(
        business,
        /authApi\.signup\.sector\s*\([\s\S]{0,700}authApi\.signup\.complete\s*\([\s\S]{0,700}router\.(?:replace|push)\s*\([\s\S]{0,120}signup\/ready/,
    );
    assert.match(ready, /(?:startApp|useApp|openApp|finishInApp)/);
    assert.match(ready, /(?:finishOnDesktop|desktopSetup|openDesktop|continueOnDesktop)/);
    assert.match(ready, /router\.(?:replace|push)\s*\(/);
});

test('signup durum ve basma hareketleri ortak sözleşmeden gelir', () => {
    assert.match(signupUiBundle, /pressMotion\.(?:in|out)/);
    assert.match(signupUiBundle, /authMotion\.status(?:In|Reduced)/);
    assert.match(signupUiBundle, /useNativeDriver:\s*true/);
    assert.match(signupUiBundle, /reduceMotion/);
    assert.doesNotMatch(
        signupBundle,
        /Animated\.(?:timing|spring)[\s\S]{0,220}\b(?:height|width|backgroundColor|borderRadius|shadow)/,
    );
});
