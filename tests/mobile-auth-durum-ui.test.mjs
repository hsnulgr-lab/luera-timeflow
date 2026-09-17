import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { expiredPairCode, offlineGate, sessionGate, subscriptionLocked } from '../mobile/src/lib/authCopy.ts';
import { authMetrics } from '../mobile/src/theme/tokens.ts';

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');

const ui = read('src/components/ui.tsx');
const stub = read('src/api/authStub.ts');

const GATED = [
    'app/(auth)/manager/sign-in.tsx',
    'app/(auth)/manager/recover.tsx',
    'app/(auth)/staff/pair.tsx',
    'app/(auth)/staff/pin.tsx',
    'app/(auth)/signup/account.tsx',
];

// ── Giriş 15a — Bağlantı yok ────────────────────────────────────────────────

test('çevrimdışı metni tasarımdaki üç cümledir', () => {
    assert.equal(offlineGate.title, 'İnternet bağlantısı\ngörünmüyor');
    assert.match(offlineGate.body, /^Girişi bağlantısız yapamıyoruz\./);
    // "yazdıklarınız kaybolmadı" bir söz: form state'i korunuyor (aşağıda sınanıyor).
    assert.match(offlineGate.body, /yazdıklarınız kaybolmadı\.$/);
    assert.equal(offlineGate.action, 'Tekrar dene');
});

test('durum ekranı bant değil, tam ekrandır', () => {
    const start = ui.indexOf('export function AuthStatusScreen');
    const screen = ui.slice(start, ui.indexOf('export function AuthOfflineScreen'));
    // Gövde dikeyde ortalanır — okunacak ikinci bölüm yok.
    assert.match(screen, /justifyContent: 'center'/);
    assert.match(screen, /flex: 1/);
    // Eylemler alt üçte birde, tek elle erişilebilir.
    assert.match(screen, /paddingBottom: Math\.max\(insets\.bottom, authMetrics\.actionsBottom\)/);
});

test('halka ve başlık küçük ekranda küçülür, dokunma hedefi küçülmez', () => {
    assert.equal(authMetrics.heroRing, 80);
    assert.equal(authMetrics.heroRingSmall, 64);
    assert.equal(authMetrics.heroTitle, 27);
    assert.equal(authMetrics.heroTitleSmall, 23);
    const start = ui.indexOf('export function AuthStatusScreen');
    const screen = ui.slice(start, ui.indexOf('export function AuthOfflineScreen'));
    assert.match(screen, /small \? authMetrics\.heroRingSmall : authMetrics\.heroRing/);
    assert.match(screen, /small \? authMetrics\.heroTitleSmall : authMetrics\.heroTitle/);
});

test('halka amber; kırmızı değil, çünkü arıza değil', () => {
    const start = ui.indexOf('export function AuthStatusScreen');
    const screen = ui.slice(start, ui.indexOf('export function AuthOfflineScreen'));
    assert.match(screen, /tone === 'amber' \? c\.am : c\.rd/);
    assert.match(ui, /<AuthStatusScreen tone="amber"/);
});

test('tek eylem var: tekrar dene', () => {
    // Sınır `ChevronIcon`dı; araya oturum hatası ekranı girdi. Kural aynı:
    // bağlantı ekranında TEK eylem var.
    const start = ui.indexOf('export function AuthOfflineScreen');
    const screen = ui.slice(start, ui.indexOf('export function AuthSessionErrorScreen'));
    assert.equal((screen.match(/<AuthActionButton/g) || []).length, 1);
    assert.match(screen, /label=\{offlineGate\.action\}/);
});

test('oturum okunamadı ekranı bağlantı ekranından AYRI', () => {
    // Sorun internette değil cihazda; bağlantı metnini ödünç almak yanlış
    // yönlendirirdi ("Wi-Fi'yi açın" deyip sorunu çözmezdi).
    const start = ui.indexOf('export function AuthSessionErrorScreen');
    const screen = ui.slice(start, ui.indexOf('function ChevronIcon'));
    assert.equal((screen.match(/<AuthActionButton/g) || []).length, 1);
    assert.match(screen, /label=\{sessionGate\.action\}/);
    assert.match(screen, /icon="lock"/);
    // Metin de ayrı olmalı, yalnız ekran değil.
    assert.notEqual(sessionGate.title, offlineGate.title);
    assert.notEqual(sessionGate.body, offlineGate.body);
});

// ── Kapı: sunucuya giden her çağrının önünde ────────────────────────────────

test('bağlantı yokken kimlik doğrulaması DENENMEZ', () => {
    // Kimliği yalnız sunucu doğrulayabilir; yarım açık form bırakmak yalan olurdu.
    // 099: şifre değiştirme de sunucuya soruyor → altı yer.
    assert.equal((stub.match(/if \(await offline\(\)\) return failure\('offline'\);/g) || []).length, 6);
});

test('bilinmeyen ağ durumu çevrimdışı sayılmaz', () => {
    // isInternetReachable === null iken girişi kilitlemek, sorunsuz çalışan bir
    // salonu durdurmak olurdu. Aynı kural connectivity.ts'teki bant için de var.
    assert.match(stub, /state\.isConnected === false \|\| state\.isInternetReachable === false/);
    // Yalnız `=== false` sayılıyor; null'ı çevrimdışıya çeviren bir dal yok.
    const fn = stub.slice(stub.indexOf('async function offline()'), stub.indexOf('export async function getLaunchState'));
    assert.doesNotMatch(fn.replace(/\/\*[\s\S]*?\*\//g, ''), /null/);
});

test('ağ okunamıyorsa çevrimiçi kabul edilir', () => {
    const start = stub.indexOf('async function offline()');
    const fn = stub.slice(start, stub.indexOf('export async function getLaunchState'));
    assert.match(fn, /catch \{\s*\n\s*return false;/);
});

// ── Beş giriş ekranının hepsi aynı hâli taşır ───────────────────────────────

test('kapı eklenen her ekran çevrimdışı hâlini gösterir', () => {
    for (const path of GATED) {
        const screen = read(path);
        assert.match(screen, /error === 'offline'/, `${path}: dal yok`);
        assert.match(screen, /<AuthOfflineScreen/, `${path}: ekran yok`);
        assert.match(screen, /const \[offline, setOffline\] = useState\(false\)/, `${path}: state yok`);
    }
});

test('çevrimdışı hâli formu silmez', () => {
    // "yazdıklarınız kaybolmadı" sözü buna dayanıyor: offline ayrı bir state,
    // e-posta/şifre/kod state'i yerinde kalır ve dönünce baştan yazılmaz.
    const signIn = read('app/(auth)/manager/sign-in.tsx');
    assert.doesNotMatch(signIn, /setEmail\(''\)|setPassword\(''\)/);
    const pair = read('app/(auth)/staff/pair.tsx');
    const submit = pair.slice(pair.indexOf('const submit = async'), pair.indexOf('return ('));
    assert.doesNotMatch(submit, /updateCode\(''\)/);
});

// ── Giriş 15b — Kod geçersiz ────────────────────────────────────────────────

test('geçersiz kod aynı ekranda çözülür', () => {
    // Yazım hatası: kullanıcı ekranda kalır, kutular kızarır, bir kez sarsılır.
    // Yeni kod istemesi gerekmiyor — çözüm elinde.
    const pair = read('app/(auth)/staff/pair.tsx');
    assert.match(pair, /<AuthCodeBoxes code=\{code\} error=\{invalid\} \/>/);
    // 099 · doğru kod müdürün EKRANINDA duruyor; "rakamları yeniden yaz" demek
    // kişiyi aynı yanlış kodu tekrar yazmaya itiyordu.
    assert.match(pair, /Bu kod eşleşmedi\. Müdürün ekranındaki kodu bir daha kontrol edin\./);
    assert.match(pair, /runPairErrorShake/);
    assert.match(pair, /label=\{invalid \? 'Yeniden dene' : 'Devam'\}/);
});

// ── Giriş 15c — Kodun süresi dolmuş ─────────────────────────────────────────

test('süresi dolmuş kod geçersiz koddan AYRI bir hâldir', () => {
    // Aynı metni vermek kullanıcıyı aynı kodu üç kez yazmaya iterdi.
    assert.notEqual(expiredPairCode.title, undefined);
    assert.equal(expiredPairCode.title, 'Bu kodun\nsüresi doldu');
    // 099 · ekip kodu 15 dakika.
    assert.match(expiredPairCode.body, /15 dakika geçerli/);
    assert.match(stub, /if \(digits === DEMO_EXPIRED_CODE\) return failure\('expired_pair_code'\);/);
    assert.match(stub, /\| 'expired_pair_code'/);
});

/** Bir `submit` dalını, yorumları atarak yalnız ÇALIŞAN satırlarıyla verir. */
function branchOf(source, from, to) {
    const start = source.indexOf(from);
    const end = source.indexOf(to, start + from.length);
    assert.ok(start >= 0 && end > start, `dal bulunamadı: ${from}`);
    return source.slice(start, end)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}

test('süresi dolan kod banner değil kendi ekranını açar', () => {
    const pair = read('app/(auth)/staff/pair.tsx');
    assert.match(pair, /result\.error === 'expired_pair_code'/);
    assert.match(pair, /icon="clock"/);
    // Çözüm kullanıcıda değil: sarsıntı ve kırmızı kutu YOK.
    const branch = branchOf(pair, "result.error === 'expired_pair_code'", "result.error === 'locked'");
    assert.doesNotMatch(branch, /setInvalid\(true\)|runPairErrorShake/);
});

test('süresi dolan kod ekranı kişiyi ancak GERÇEKTEN biliyorsa gösterir', () => {
    const pair = read('app/(auth)/staff/pair.tsx');
    assert.match(pair, /<AuthDetailList rows=\{\[\{/);
    assert.match(pair, /status: expiredPairCode\.ownerStatus/);
    assert.match(pair, /Linking\.openURL\(`tel:\$\{expired\.owner\?\.phone \?\? ''\}`\)/);
    assert.equal(expiredPairCode.retype, 'Yeni kodu yazacağım');
    assert.equal(expiredPairCode.call, 'İşletme sahibini ara');

    // Kart da arama düğmesi de KOŞULLU. `authApi.staff.owner()` canlıda
    // karşılığı olmayan bir uç: `auth.ts`'in staff yüzeyinde yok, çağrı
    // sahte katmana düşüyor ve UYDURMA bir ad ile UYDURMA bir telefon
    // dönüyor. Koşulsuz çizilen bir "İşletme sahibini ara" düğmesi canlıda
    // tanımadığı birini arardı.
    assert.match(pair, /detail=\{expired\.owner \? \(/);
    assert.match(pair, /\{expired\.owner \? \([\s\S]{0,400}expiredPairCode\.call/);
});

test('sahibin kartı canlı kipte hiç okunmuyor', () => {
    const pair = read('app/(auth)/staff/pair.tsx');
    // Tek kapı: ekran `owner()` ucunu DOĞRUDAN çağırmıyor.
    assert.doesNotMatch(pair, /await authApi\.staff\.owner\(\)/);
    assert.match(pair, /async function ownerOrNull\(\)[\s\S]{0,200}if \(LIVE_AUTH\) return null;/);
    assert.match(pair, /setExpired\(\{ owner: await ownerOrNull\(\), used: result\.error === 'used_pair_code' \}\)/);
});

// ── Eşleştirme KİLİDİ ───────────────────────────────────────────────────────

test('kilit kendi hâli: kod eşleşmedi denmiyor, sarsıntı da yok', () => {
    // `staff-api` on yanlış denemeden sonra IP'yi 15 dakika kilitliyor ve o
    // andan itibaren koda HİÇ BAKMIYOR — doğru kod da reddediliyor. Ekran
    // bunu "bu kod eşleşmedi" diye gösteriyordu: kişi doğru kodu yeniden
    // yazıyor, her deneme kilidi besliyordu.
    const pair = read('app/(auth)/staff/pair.tsx');
    assert.match(pair, /result\.error === 'locked'/);
    const branch = branchOf(pair, "result.error === 'locked'", 'setInvalid(true)');
    assert.doesNotMatch(branch, /setInvalid\(true\)|runPairErrorShake/);
    assert.match(branch, /setLocked\(\{ until: result\.lockedUntil \?\? null/);
});

test('kilit ekranı süreyi gösteriyor ve süre dolunca KENDİ açılıyor', () => {
    const pair = read('app/(auth)/staff/pair.tsx');
    assert.match(pair, /icon="lock"/);
    assert.match(pair, /lockWaitText\(waiting\)/);
    // Kişiyi "bitti mi acaba" diye denemeye zorlamak, her denemesi kilidi
    // uzatan bir uçta yapılmaması gereken şey.
    assert.match(pair, /if \(next >= until\) setLocked\(null\)/);
});

test('süre BİLİNMİYORSA sahte bir geri sayım çizilmiyor', () => {
    // Sunucu `minutes` ya da `until` göndermezse uydurulmuş bir sayaç biter,
    // kilit bitmez — kişi "şimdi olur" diye denemeye devam eder.
    const pair = read('app/(auth)/staff/pair.tsx');
    assert.match(pair, /locked\.until \? lockWaitText\(waiting\) : pairLocked\.hint/);
    assert.match(pair, /extra=\{locked\.until \? \(/);
});

test('kilidin bitiş anı sunucudan TAŞINIYOR — iki ayrı biçimden tek biçime', () => {
    const auth = read('src/api/auth.ts');
    // PIN kilidinde mutlak an (`until`), eşleştirme kilidinde süre (`minutes`).
    assert.match(auth, /function lockDeadline\(e: ApiError\)/);
    assert.match(auth, /const until = e\.until \? Date\.parse\(e\.until\) : Number\.NaN;/);
    assert.match(auth, /minutes \* 60_000/);
    assert.match(auth, /case 'pair_locked': return fail\('locked', lockDeadline\(e\)\);/);
    // Hiçbiri gelmediyse alan BOŞ — uydurulmuyor.
    assert.match(auth, /if \(minutes !== null && minutes > 0\)[\s\S]{0,120}return \{\};/);
});

test('“yeni kodu yaz” alanı temizler', () => {
    // Süresi dolmuş kodu ekranda bırakmak, kullanıcıyı onu tekrar denemeye iter.
    const pair = read('app/(auth)/staff/pair.tsx');
    assert.match(pair, /setExpired\(null\); updateCode\(''\);/);
});

// ── Giriş 15d / 15e — Abonelik bitmiş ───────────────────────────────────────

test('hiçbir varyantta fiyat, plan ya da ödeme yok', () => {
    // App Store 3.1.1: abonelik uygulama dışında satılıyor, uygulama içinden
    // satın almaya yönlendirilemez.
    const locked = read('app/(auth)/locked.tsx');
    const words = /₺|fiyat|Fiyat|plan|Plan|ödeme|Ödeme|satın al|Satın al|abonelik satın/;
    const copy = JSON.stringify(subscriptionLocked);
    assert.doesNotMatch(copy, words);
    assert.doesNotMatch(locked.replace(/\/\*[\s\S]*?\*\//g, ''), words);
});

test('müdür varyantı yenilemenin nerede yapıldığını söyler', () => {
    const copy = subscriptionLocked.manager;
    assert.equal(copy.title, 'Aboneliğiniz bitti');
    assert.match(copy.cardLabel, /bilgisayardan yapılır/);
    assert.match(copy.retention, /90 gün saklanır/);
    // Tek somut eylem: yenileyip dönünce basılacak buton.
    assert.equal(copy.retry, 'Yeniledim, tekrar dene');
    assert.equal(copy.signOut, 'Oturumu kapat');
});

test('personel varyantı sorumluluğu personele yüklemez', () => {
    const copy = subscriptionLocked.staff;
    assert.equal(copy.title, 'Uygulama şu an\nkullanılamıyor');
    assert.match(copy.body, /Bu bir hata değil ve sizinle ilgili değil/);
    // "Yetkiniz yok" denmiyor; sebep yazılıyor ve tek somut eylem veriliyor.
    assert.doesNotMatch(copy.body, /yetki/i);
    assert.equal(copy.call, 'İşletme sahibini ara');
});

test('kilit ayrı bir rotadır, çünkü ileri gidilemez', () => {
    const locked = read('app/(auth)/locked.tsx');
    assert.match(locked, /session\.actor === 'manager'/);
    assert.match(locked, /icon="lock"/);
    // Müdürde kart ve bant var, o yüzden hero üstten hizalı.
    assert.match(locked, /align="top"/);
    assert.match(locked, /<AuthNoteCard/);
});

test('dört giriş yolunun hepsi kilide düşer', () => {
    for (const path of [
        'app/(auth)/manager/sign-in.tsx',
        'app/(auth)/manager/business.tsx',
        'app/(auth)/staff/pin.tsx',
        'app/(auth)/resume.tsx',
    ]) {
        const screen = read(path);
        assert.match(screen, /error === 'subscription_inactive'/, `${path}: dal yok`);
        assert.match(screen, /router\.replace\('\/\(auth\)\/locked'\)/, `${path}: rota yok`);
    }
});

test('kimlik doğruydu: oturum açılır, kapıyı abonelik indirir', () => {
    // Sunucu da böyle davranıyor — session.start başarılı, sonraki çağrı 403.
    const manager = stub.slice(stub.indexOf('async function selectManagerBusiness'), stub.indexOf('async function recoverManagerPassword'));
    assert.ok(
        manager.indexOf('await saveSession') < manager.indexOf("failure('subscription_inactive')"),
        'oturum, abonelik kapısından ÖNCE kaydedilmeli',
    );
    assert.match(stub, /async function lockedSubscription/);
});

test('abonelik dönüş girişinde tekrar denetlenir', () => {
    // Abonelik oturum açıldıktan sonra da bitebilir.
    const resume = stub.slice(stub.indexOf('async function resumeSession'), stub.indexOf('async function lockedSubscription'));
    assert.match(resume, /subscriptionStatus === 'expired'/);
});

test('abonelik bitmişse PIN yanlış sayılmaz', () => {
    const pin = read('app/(auth)/staff/pin.tsx');
    const verify = pin.slice(pin.indexOf('const verify = async'), pin.indexOf('const keyPress'));
    // 099 tasarımı: şifre ekranında sarsıntı yok; yanlışın işareti uyarı
    // titreşimi ve kırmızı yuva. Abonelik dalı ikisinden de ÖNCE dönmeli.
    assert.ok(
        verify.indexOf("result.error === 'subscription_inactive'") < verify.indexOf('feedback.warning()'),
        'abonelik dalı yanlış-şifre geri bildiriminden ÖNCE dönmeli',
    );
});

test('çevrimdışı yanlış PIN sayılmaz', () => {
    // Metroda uygulamayı açan personel kendini kilitlememeli: sayaç artmaz,
    // sarsıntı olmaz, hata metni yazılmaz.
    const pin = read('app/(auth)/staff/pin.tsx');
    const verify = pin.slice(pin.indexOf('const verify = async'), pin.indexOf('const keyPress'));
    const offlineBranch = verify.indexOf("result.error === 'offline'");
    assert.ok(offlineBranch > 0, 'offline dalı yok');
    assert.ok(
        offlineBranch < verify.indexOf('feedback.warning()'),
        'offline dalı yanlış-şifre geri bildiriminden ÖNCE dönmeli',
    );
    assert.ok(
        offlineBranch < verify.indexOf('remainingAttemptText'),
        'offline dalı kalan deneme metninden ÖNCE dönmeli',
    );
});

test('ışık alanının üstündeki bant CAM VARKEN de çizilmiyor', () => {
    // İlk düzeltme `overField && !glass` idi: yalnız cam yokken saydam.
    // Yanlıştı — cam VARKEN de bant bir yüzey çiziyor ve alanın üstünde gri
    // bir levha gibi duruyor. Alanın işi arkada görünmek.
    assert.match(ui, /const bare = overField;/);
    assert.match(ui, /return glass && !bare \?/);
    // Alanı olan iki giriş ekranı bunu istiyor, `account.tsx` istemiyor.
    for (const path of ['app/(auth)/staff/pin.tsx', 'app/(auth)/staff/who.tsx']) {
        assert.match(read(path), /<AuthIdentityBar\s+overField/, `${path} overField vermeli`);
    }
    assert.doesNotMatch(read('app/(staff-flow)/account.tsx'), /<AuthIdentityBar\s+overField/);
});
