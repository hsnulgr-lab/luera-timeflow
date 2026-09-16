import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function source(path) {
    const url = new URL(`../${path}`, import.meta.url);
    return existsSync(url) ? readFileSync(url, 'utf8') : '';
}

const profile = source('mobile/app/personel/profile.tsx');
const nestedAccount = source('mobile/app/(staff-flow)/account.tsx');
const account = nestedAccount || profile;
const authStub = source('mobile/src/api/authStub.ts');
const authCopy = source('mobile/src/lib/authCopy.ts');
const ui = source('mobile/src/components/ui.tsx');
const tokens = source('mobile/src/theme/tokens.ts');
const accountUiBundle = `${account}\n${ui}`;
const accountCopyBundle = `${accountUiBundle}\n${authCopy}`;

test('Giriş 14 Profil altında gezilebilir tek rol-duyarlı hesap yüzeyidir', () => {
    assert.notEqual(profile, '', 'Profil sekmesi eksik');
    assert.notEqual(account, '', 'Giriş 14 hesap yüzeyi eksik');

    if (nestedAccount) {
        assert.match(
            profile,
            /\/(?:\(staff-flow\)\/)?account/,
            'ayrı hesap rotası kullanılıyorsa Profil ekranından açılmalı',
        );
    }

    assert.match(account, /(?:session|profile|account)[\s\S]{0,180}\.actor|\.actor[\s\S]{0,180}(?:session|profile|account)/);
    assert.match(account, /(?:actor|isManager)\s*={0,3}\s*[^\n;]*['"]manager['"]/);
});

test('Giriş 14 kimliği yalnız session üzerinden okur ve ekran kendi oturumunu uydurmaz', () => {
    assert.match(account, /src\/api\/session/);
    assert.match(account, /authApi\.(?:account\.(?:get|overview)|resume\.get)\s*\(/);
    assert.doesNotMatch(account, /src\/api\/staff(?:['"]|\.ts)/);
    assert.doesNotMatch(account, /\bfetch\s*\(/);
    assert.doesNotMatch(account, /\bAsyncStorage\b/);
    assert.doesNotMatch(account, /\bsupabase\b|staff-api/i);
    assert.doesNotMatch(account, /useLocalSearchParams|searchParams|params\s*:\s*\{/);
});

test('hesap ekranında sabit kişi, işletme, e-posta, PIN veya işletme sayısı bulunmaz', () => {
    const screenBundle = `${profile}\n${nestedAccount}`;

    assert.doesNotMatch(screenBundle, /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    assert.doesNotMatch(
        screenBundle,
        /Studio Ayla|Ayla Beauty|Ayla Klinik|Kadıköy|Nişantaşı|Bebek|Ayla Demir|Merve Kaya|Selin Boz|Emre Yıldız|Hande Arslan/,
    );
    assert.doesNotMatch(screenBundle, /['"](?:1234|123456)['"]/);
    assert.doesNotMatch(screenBundle, /['"]3 işletme['"]/);
    assert.match(account, /\.profile\.(?:name|email|business)|profile\.(?:name|email|business)/);
    assert.match(account, /(?:businesses\.length|businessCount)/);
});

test('müdür varyantı Hesap başlığını ve üç ayar satırını eksiksiz taşır', () => {
    for (const copy of [
        'Hesap',
        'Şifreyi değiştir',
        'Face ID ile aç',
        'Açık',
        'İşletme değiştir',
        'işletme',
        'Oturumu kapat',
        'Hesabınızı silmek geri alınamaz.',
        'Hesabımı sil',
    ]) {
        assert.ok(accountCopyBundle.includes(copy), `Giriş 14 müdür metni eksik: ${copy}`);
    }

    assert.match(account, /(?:actor|isManager)[\s\S]{0,4000}Hesabımı sil/);
    assert.match(account, /biometricEnabled/);
});

test('personel varyantı PIN ve yeniden eşleştirme sonucunu söyler; silme yetkisi vermez', () => {
    for (const copy of [
        'Profil',
        // "PIN'i değiştir" KALDIRILDI, pasif bırakılmadı: hedef ekranı ve
        // sunucu tarafı yok, dokununca hiçbir şey olmuyordu. Aynı kararı
        // `personel/profile.tsx` zaten vermişti ("Pasif bırakılmadı,
        // kaldırıldı"); burası o kararın atlanmış hâliydi.
        'Face ID ile aç',
        'Kapalı',
        'Oturumu kapat',
        // 099 · çıkış eşleşmeyi SİLMEZ (müdür kararı): cümle de öyle söylüyor.
        'Telefon işletmeye bağlı kalır; sonraki girişte yalnız şifreniz sorulur.',
        'Şifreyi değiştir',
        'Bilgileriniz işletmenin kaydında tutuluyor. Çıkarılmak isterseniz işletme sahibiyle konuşun.',
    ]) {
        assert.ok(accountCopyBundle.includes(copy), `Giriş 14 personel metni eksik: ${copy}`);
    }

    assert.match(account, /(?:actor|isManager)[^\n]*['"]manager['"][\s\S]{0,4000}(?:AuthDeleteDialog|Hesabımı sil)/);
});

test('Oturumu kapat doğrudan çalışır; yalnız geri alınamaz hesap silme onay ister', () => {
    const directManagerSignOut = /authApi\.resume\.signOut\s*\(/.test(account);
    const directStaffUnlink = /authApi\.staff\.unlinkDevice\s*\(/.test(account);
    const unifiedAccountSignOut = /authApi\.account\.signOut\s*\(/.test(account)
        && /account:\s*\{[\s\S]{0,700}\bsignOut(?:\s*:|\s*[,}])/.test(authStub);

    assert.ok(
        unifiedAccountSignOut || (directManagerSignOut && directStaffUnlink),
        'çıkış rolün sonucunu session üzerinden uygulamalı',
    );
    assert.match(account, /router\.replace\s*\([\s\S]{0,100}\/(?:\(auth\)\/)?welcome/);
    assert.doesNotMatch(account, /Alert\.alert\s*\(/, 'Oturumu kapat için sistem onayı gösterilmemeli');
    assert.doesNotMatch(account, /Çıkış yapılsın mı\?|Emin misiniz\?/i);
});

test('Giriş 14b özel silme diyaloğu sonucu açıklayıp dört dinamik maddeyi listeler', () => {
    for (const copy of [
        'Hesabınızı silelim mi?',
        'Bu işlem geri alınamaz. Silinince aynı e-postayla yeniden açsanız bile eski bilgileriniz gelmez.',
        'Personelinizin telefon bağlantıları kesilir; uygulamaya giremezler.',
        'Yasal olarak tutmamız gereken satış kayıtları 10 yıl saklanır, adınıza bağlı kalmaz.',
        'Silme 30 gün içinde tamamlanır. Bu süre içinde girerseniz işlem durur.',
        'Hesabımı sil',
        'Vazgeç',
    ]) {
        assert.ok(accountCopyBundle.includes(copy), `Giriş 14b metni eksik: ${copy}`);
    }

    assert.match(accountUiBundle, /(?:accessibilityViewIsModal|accessibilityRole\s*=\s*['"]dialog['"]|\bModal\b)/);
    assert.match(account, /accountDeletionItems\s*\(/);
    assert.match(account, /business(?:es)?[^\n]*\.map\s*\(/);
    assert.match(accountUiBundle, /(?:deletionItems|items)\.map\s*\(/);

    const dialogSource = ui.includes('Hesabınızı silelim mi?') ? ui : account;
    assert.ok(
        dialogSource.indexOf('Hesabımı sil') < dialogSource.indexOf('Vazgeç'),
        'silme eylemi Vazgeç düğmesinden önce gelmeli',
    );
});

test('silme onayı yalnız stub içinde yeniden doğrulama aşaması hazırlar; gerçek hesabı silmez', () => {
    assert.match(account, /authApi\.account\.requestDeletion\s*\(/);
    assert.match(authStub, /account:\s*\{[\s\S]{0,700}\brequestDeletion(?:\s*:|\s*[,}])/);

    const requestDeletion = authStub.match(
        /async function\s+(?:request|prepare)[A-Za-z]*Deletion[\s\S]*?\n\}/,
    )?.[0] ?? '';
    assert.notEqual(requestDeletion, '', 'silme talebi stub içinde tek bir aşama olmalı');
    assert.match(requestDeletion, /(?:reauth|password|required)/i);
    assert.doesNotMatch(requestDeletion, /removeItem\s*\(\s*storageKeys\.createdManager|multiRemove\s*\([\s\S]{0,200}storageKeys\.createdManager/);
});

test('Giriş 14 ortak UI kitini, tema jetonlarını ve SVG ikonlarını kullanır', () => {
    const rawMeasure = /\b(?:fontSize|height|minHeight|maxHeight|width|minWidth|maxWidth|borderRadius|gap|padding(?:Top|Bottom|Left|Right|Horizontal|Vertical)?|margin(?:Top|Bottom|Left|Right|Horizontal|Vertical)?)\s*:\s*[2-9]\d*(?:\.\d+)?\b/;

    assert.match(account, /src\/components\/ui/);
    assert.match(account, /src\/theme/);
    assert.match(account, /\bAuthIdentityBar\b/);
    assert.match(account, /\bAuthActionButton\b/);
    assert.match(account, /\bAuthAccountRow\b/);
    assert.match(account, /\bAuthDeleteDialog\b/);
    assert.match(ui, /export\s+function\s+AuthAccountRow\b/);
    assert.match(ui, /export\s+function\s+AuthDeleteDialog\b/);
    assert.match(account, /kind\s*=\s*["']danger["']/);
    assert.match(ui, /AuthActionKind[\s\S]{0,160}['"]danger['"]/);
    assert.doesNotMatch(account, rawMeasure, 'Giriş 14 ekranına ham ölçü gömülmemeli');

    assert.match(accountUiBundle, /react-native-svg/);
    assert.match(accountUiBundle, /<(?:Svg|Path)\b/);
    assert.match(accountUiBundle, /strokeWidth=\{authMetrics\.iconStroke\}/);
    assert.match(accountUiBundle, /strokeLinecap=["']round["']/);
    assert.match(accountUiBundle, /strokeLinejoin=["']round["']/);
    assert.doesNotMatch(accountUiBundle, /[☎︎→›←🔒🗑]/);
});

test('hesap ve diyalog ölçüleri HTML CSS değerleriyle token dosyasında tek yerde tutulur', () => {
    assert.match(tokens, /topBarHeight:\s*52/);
    assert.match(tokens, /row:\s*62/);
    assert.match(tokens, /actionSm:\s*60/);
    assert.match(tokens, /xl:\s*22/);
    assert.match(tokens, /h2:\s*\{\s*fontSize:\s*21/);
    assert.match(tokens, /small:\s*\{\s*fontSize:\s*13\.5/);
    assert.match(tokens, /accountPageTitleTop:\s*14/);
    assert.match(tokens, /accountPageTitleSize:\s*30/);
    assert.match(tokens, /accountDangerHintSize:\s*12\.5/);
    assert.match(tokens, /deleteDialogPadding:\s*20/);
    assert.match(tokens, /deleteDialogBodySize:\s*14\.5/);
    assert.match(tokens, /deleteDialogDot:\s*5/);
});

test('Giriş 14 basma ve diyalog durumu hareket sözleşmesinden gelir', () => {
    assert.match(accountUiBundle, /pressMotion\.(?:in|out)/);
    assert.match(accountUiBundle, /authMotion\.(?:statusIn|statusReduced)/);
    assert.match(accountUiBundle, /useNativeDriver:\s*true/);
    assert.match(accountUiBundle, /reduceMotion/);
    assert.doesNotMatch(
        account,
        /Animated\.(?:timing|spring)[\s\S]{0,220}\b(?:height|width|backgroundColor|borderRadius|shadow)/,
    );
});
