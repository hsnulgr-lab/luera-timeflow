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
const authLive = source('mobile/src/api/auth.ts');
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
    //
    // 108 · hedef artık SABİT DEĞİL. Kayıt sonundaki soru işletmenin modunu
    // belirliyor ve kabuk ona göre seçiliyor; `enterShell('manager')` yazmak
    // her yeni hesabı müdür kabuğuna sokardı.
    assert.match(ready, /enterShell\(result\.data\.actor, result\.data\.profile\.business\.solo\)/);
});

test('karşılamada İKİ kapı ve "Yeni işletme oluştur" — Solo kapısı YOK (D9)', () => {
    /*
     * Kullanıcı kararı (2026-10-16, seçenek A): 108'in üçüncü kapısı ("Solo ·
     * Tek kişilik işletme kurun") kalktı, karşılama 1.0'daki üç girişe döndü.
     * Yeni işletme TEK yoldan kuruluyor; tek kişilik mi ekip mi olduğu kaydın
     * sonundaki soruyla seçiliyor. Aynı forma çıkan iki kapı yok.
     */
    for (const title of ['İşletmemi yönetiyorum', 'Burada çalışıyorum', 'Yeni işletme oluştur']) {
        assert.ok(welcome.includes(title), `karşılamada eksik giriş: ${title}`);
    }
    assert.ok(!welcome.includes('title="Solo"'), 'Solo kapısı geri gelmiş');
    assert.doesNotMatch(welcome, /authApi\.signup\.intent\(true\)/, 'karşılama tek kişilik niyetini yazmamalı');
    assert.equal((welcome.match(/<AuthChoiceButton/g) ?? []).length, 2);
    // Mod sorusu kaydın sonunda duruyor ve iki cevap eşit.
    assert.match(ready, /label="Yalnız ben"/);
    assert.match(ready, /label="Ekibim var"/);
});

test('Solo kapısından gelene mod BİR DAHA sorulmuyor', () => {
    // Verilmiş bir cevabı tekrar sormak, kullanıcının az önce bastığı
    // düğmeyi duymamak olurdu.
    assert.match(ready, /authApi\.signup\.draft\(\)[\s\S]{0,160}draft\.data\.solo === true/);
    // Niyet okunmadan HİÇBİR ŞEY çizilmiyor: önce soruyu çizip sonra "hazır"a
    // atlamak, cevabı verilmiş kişiye soruyu bir an yeniden göstermekti.
    assert.match(ready, /useState<boolean \| null>\(null\)/);
    assert.match(ready, /if \(!businessName \|\| intentSolo === null\) return/);
    // Soru yerine tek düğme ve kendi gövde metni; iki cevap öteki dalda.
    const solo = ready.slice(ready.indexOf('{intentSolo ? ('), ready.indexOf(') : ('));
    assert.match(solo, /body="Tek kişilik işletme olarak kuruluyor/);
    assert.match(solo, /label="Uygulamayı kullanmaya başla"/);
    assert.doesNotMatch(solo, /Yalnız ben|Ekibim var|Bu işletmede işi kim yapıyor/);
});

test('Solo niyeti kaydın SONUNA kadar yaşıyor — mod sorusu onu okuyabiliyor', () => {
    /*
     * 108'in kırığı: niyet karşılamada yazılıyordu ama hesap adımı taslağı
     * sıfırdan yazıyor, kurulumun sonu da siliyordu. Hazır ekranı taslağı
     * okuduğunda niyet hiç yoktu ve Solo kapısından gelene soru yeniden
     * soruluyordu — "bir daha sorulmuyor" dalı hiç çalışmıyordu.
     */
    const liveAccount = authLive.slice(
        authLive.indexOf('async function createSignupAccount'),
        authLive.indexOf('async function saveSignupBusiness'),
    );
    assert.match(liveAccount, /const intent = \(await readSignupDraft\(\)\)\?\.solo;/);
    assert.match(liveAccount, /\{ email: normalized, solo: intent \}/);
    const liveComplete = authLive.slice(
        authLive.indexOf('async function completeSignup'),
        authLive.indexOf('async function setBusinessMode'),
    );
    assert.doesNotMatch(liveComplete, /clearSignupDraft\(\)/, 'kurulumun sonu niyeti silmemeli');
    const liveMode = authLive.slice(
        authLive.indexOf('async function setBusinessMode'),
        authLive.indexOf('const TEAM_REFUSALS'),
    );
    // Silme modun yazıldığı yerde, yalnız BAŞARIDAN sonra.
    assert.match(liveMode, /if \(error\) return fail\('offline'\);[\s\S]{0,200}if \(session\.ok\) await clearSignupDraft\(\);/);

    // Stub aynı kuralı taşıyor: tasarım turları stub'la geziliyor.
    assert.match(authStub, /password: _password, solo: previous\?\.solo/);
    assert.match(authStub, /businessName: normalizedName,\s*solo: pending\.solo,/);
    const stubComplete = authStub.slice(
        authStub.indexOf('async function completeSignup'),
        authStub.indexOf('async function markSignupIntent'),
    );
    assert.doesNotMatch(stubComplete, /removeItem\(storageKeys\.pendingSignup\)/);
    const stubMode = authStub.slice(
        authStub.indexOf('async function setBusinessMode'),
        authStub.indexOf('async function startTeam'),
    );
    assert.match(stubMode, /removeItem\(storageKeys\.pendingSignup\)/);

    // Öteki kayıt kapısı niyeti SIFIRLIYOR: yarım bir Solo kaydının niyeti
    // "Yeni işletme oluştur"dan girene geçmesin.
    assert.match(
        welcome,
        /authApi\.signup\.intent\(false\)[\s\S]{0,120}router\.push\([\s\S]{0,60}signup\/account/,
    );
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
        'AuthSectorOption',
        'AuthReadyChecklist',
    ]) {
        assert.match(ui, new RegExp(`export\\s+function\\s+${component}\\b`), `${component} UI kitinde olmalı`);
        assert.match(signupBundle, new RegExp(`\\b${component}\\b`), `${component} ekranda kullanılmalı`);
    }

    // Giriş v4 · K1: kural v4'ün `.rule`'u (daire 18, yazı 13,5) — v4 kitinde.
    const social = source('mobile/src/components/AuthSocial.tsx');
    assert.match(social, /export function AuthV4Rule\b/);
    assert.match(account, /<AuthV4Rule valid=\{passwordRule\.valid\} \/>/);
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
    const social = source('mobile/src/components/AuthSocial.tsx');
    const copyFile = source('mobile/src/lib/authCopy.ts');
    const accountUiBundle = `${account}\n${ui}\n${authValidation}\n${social}\n${copyFile}`;
    for (const copy of [
        // Giriş v4 · K1 — Apple ve Google formun üstünde, alt satır girişe bağlı.
        'Hesabınızı açalım',
        'Apple, Google ya da e-postayla açın. Bilgisayardan da aynı yolla girersiniz.',
        'Google ile kaydol',
        'ya da',
        'E-posta',
        'Şifre',
        'En az 8 karakter olsun, içinde bir rakam bulunsun.',
        // "Kullanım Koşulları" 2026-09-25'te çıkarıldı: öyle bir sayfa yok.
        // Karar 6 (KVKK): gizlilik metni kabul ettirilmez, bilgi verilir.
        'Gizlilik Politikası',
        "'na göre işlenir.",
        'Devam',
        'Zaten hesabınız var mı?',
        'Giriş yapın',
        // "Abonelik daha sonra BİLGİSAYARDAN seçilir" 2026-09-24'te çıkarıldı:
        // uygulama dışında satın almaya çağrıydı ve App Store 3.1.3(f)
        // muafiyetinin koşulunu deliyordu. Kalan cümle güven veriyor,
        // yönlendirmiyor — ve IAP olmadığını açıkça söylüyor.
        'Şimdi ödeme yapmıyorsunuz. Uygulama içinden satın alma yoktur.',
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
    // Giriş v4 · K1: klavye kendiliğinden AÇILMIYOR — açılsaydı Apple ve
    // Google ilk anda ekranın üstünden çıkardı (K1 klavyesiz çiziliyor).
    assert.doesNotMatch(account, /autoFocus/);
    assert.doesNotMatch(accountInputBundle, /contextMenuHidden/);
});

// Tasarım yedi sektör çiziyordu; Diş ve Klinik 2026-09-25'te mobil kayıttan
// çıktı (App Store 5.1.1(ix), bireysel geliştirici hesabı — bkz. auth.ts).
// Kalan beşin sırası tasarımdaki gibi.
test('Giriş 12 işletme adı ve beş sektör seçeneğini tasarımdaki sırayla taşır', () => {
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
        'Dövme',
        'Restoran',
        'Diğer',
        'Sonradan değiştirebilirsiniz.',
        'Devam',
    ]) {
        assert.ok(businessDataBundle.includes(copy), `Giriş 12 metni eksik: ${copy}`);
    }

    const order = ['Kuaför', 'Güzellik', 'Dövme', 'Restoran', 'Diğer'];
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

test('Giriş 13 hazır ekranı tamamlanmış oturumdan işletme adını alır ve MODU SORAR', () => {
    for (const copy of [
        'hazır',
        // Tek Kişilik v4 · S1 — soru ekranının kendi metinleri.
        'Bu işletmede işi kim yapıyor?',
        'Uygulama cevabınıza göre açılır. Sonradan İşletme’den değiştirebilirsiniz.',
        'Hizmetlerinizi ekleyin',
        'Çalışma saatlerini girin',
        'Yalnız ben',
        'Ekibim var',
    ]) {
        assert.ok(ready.includes(copy), `Giriş 13 metni eksik: ${copy}`);
    }

    /*
     * S1 · eski "hazır" düzeni soru dalından kalktı: adım çubuğu, "X hazır"
     * başlığı ve liste yalnız Solo kapısından gelenin ekranında. "Personelinizi
     * ekleyin" o ekranda da YOK — tek kişilik işletmenin personeli yok.
     */
    for (const gone of ['Son bir soru', 'Personelinizi ekleyin']) {
        assert.ok(!ready.includes(gone), `Giriş 13'te kalmamalıydı: ${gone}`);
    }
    const question = ready.slice(ready.indexOf(') : ('));
    assert.doesNotMatch(question, /AuthStepIndicator|AuthReadyChecklist|AuthHeader/);
    // Giriş v4 · K3: "luera." değil "luera" + "timeflow" etiketi.
    assert.match(question, /<LueraTimeflowMark size=\{authMetrics\.modeMarkSize\} animate=\{false\} \/>/);
    assert.doesNotMatch(question, /<LueraMark\b/);
    // İki cevap EŞİT: biri turuncu değil, soru tarafsız (v4 S1).
    assert.equal((question.match(/kind="tall"/g) ?? []).length, 2);
    assert.doesNotMatch(question, /kind="secondary"/);
    assert.match(tokens, /modeMarkSize: 44,/);
    assert.match(tokens, /modeTitleSize: 29,/);
    assert.match(tokens, /modeBodySize: 17,/);
    assert.match(tokens, /modeChoiceRadius: 22,/);
    // 66 pt, yüzey zemin ve bd2 çizgi.
    assert.match(ui, /const height = primary \|\| tall\s*\?\s*compact \|\| small \? authMetrics\.smallPrimaryHeight : hit\.action/);
    assert.match(ui, /borderColor: danger \? `\$\{c\.rd\}57` : tall \? c\.bd2/);
    assert.match(ui, /primary \? c\.or : tall \? c\.surf/);

    /*
     * BİLGİSAYARA YÖNLENDİREN YOL KALKTI (108).
     *
     * "Kurulumu bilgisayardan tamamla" düğmesi ve onu öven kutu, tek kişilik
     * işletme sahibi için bir duvardı: o kişinin bilgisayarı yok. Yerine
     * modu soran iki cevap geldi; adım sayısı aynı kaldı.
     */
    for (const gone of [
        'Kurulumu bilgisayardan tamamla',
        'Ayrıntılı kurulum bilgisayarda daha hızlı',
        'DesktopIcon',
    ]) {
        assert.ok(!ready.includes(gone), `Giriş 13'te kalmamalıydı: ${gone}`);
    }

    assert.match(ready, /(?:session|result)(?:Result)?\.data\.(?:profile\.)?business\.name/);
    assert.match(ready, /authApi\.resume\.get\s*\(/);
    assert.doesNotMatch(ready, /Tebrik|Konfeti|confetti|✅/i);
});

test('Giriş 12 oturumu sektör seçildikten sonra tamamlar; Giriş 13 MODU yazar', () => {
    assert.match(
        business,
        /authApi\.signup\.sector\s*\([\s\S]{0,700}authApi\.signup\.complete\s*\([\s\S]{0,700}router\.(?:replace|push)\s*\([\s\S]{0,120}signup\/ready/,
    );
    // İki cevap da aynı işlevden geçiyor: tek yazma yolu, tek hata yolu.
    assert.match(ready, /answer\(true\)/);
    assert.match(ready, /answer\(false\)/);
    /*
     * CEVAP ÖNCE SUNUCUYA, SONRA KABUK.
     *
     * Sıra tersine çevrilemez: "Yalnız ben" diyen kişi için sunucu bayrağı
     * yazmanın yanında sahibe bir personel satırı da açıyor. Yazma tutmadan
     * kabuğu açsaydık kullanıcı tek kişilik modda ama personelsiz kalır ve
     * hiç randevu kuramazdı.
     */
    assert.match(ready, /authApi\.signup\.mode\([\s\S]{0,200}if \(!result\.ok\)[\s\S]{0,200}enterShell/);
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
