import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * BİLDİRİMİN BAĞLANTILARI (103) — 2026-09-23.
 *
 * Kararlar `mobil-push-karar.test.mjs`'te çalıştırılarak sınanıyor. Burada
 * sınanan şey, o kararların DOĞRU YERE bağlanmış olması: React bileşenleri
 * ve Expo modülleri node'dan içe aktarılamadığı için kaynak metni okunuyor.
 */

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
const repo = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const setup = code(read('src/lib/pushSetup.ts'));
const push = code(read('src/lib/push.ts'));
const staffApi = code(read('src/api/staff.ts'));
const auth = code(read('src/api/auth.ts'));
const sync = code(read('src/lib/backgroundSync.ts'));

test('uygulama açıkken: banner + ses, rozet YOK', () => {
    /*
     * Ses kullanıcı kararı (2026-09-23) ve Android'de zorunlu: kurulu tiplerin
     * notuna göre `shouldPlaySound: false` verildiğinde açılır uyarı hiç
     * görünmüyor — "sessiz banner" orada banner'sızlık demekti.
     *
     * Rozet YÖNETİLMİYOR: "okunmamış" vaadi, ama üründe "okundu" kavramı yok.
     * Hiç temizlenmeyen bir sayı, hiç olmayan sayıdan kötü.
     */
    assert.match(setup, /shouldShowBanner: true/);
    assert.match(setup, /shouldShowList: true/);
    assert.match(setup, /shouldPlaySound: true/);
    assert.match(setup, /shouldSetBadge: false/);
    assert.doesNotMatch(setup, /setBadgeCountAsync/);
    // Kullanımdan kalkmış alan adı geri gelmesin (SDK 52+).
    assert.doesNotMatch(setup, /shouldShowAlert/);
});

test('Android kanalı sunucunun gönderdiği adla kuruluyor', () => {
    assert.match(setup, /setNotificationChannelAsync\('randevu'/);
    assert.match(repo('supabase/functions/send-push/index.ts'), /channelId: 'randevu'/);
});

test('işleyici KÖK kabukta, ilk bildirimden önce', () => {
    // Geç kurulursa uygulama açıkken gelen ilk bildirim sessizce yutulur.
    assert.match(read('app/_layout.tsx'), /import '\.\.\/src\/lib\/pushSetup';/);
});

test('hedef KAPI GEÇİLDİKTEN sonra tüketiliyor', () => {
    /*
     * `roleGate` oturumu okurken yanlış rolü yönlendiriyor, `useShellIsRoot`
     * kabuğu köke çekiyor. Erken gidilen hedef bu iki sıfırlamayla kayboluyordu.
     */
    for (const [path, actor] of [['app/personel/_layout.tsx', 'staff'], ['app/mudur/_layout.tsx', 'manager']]) {
        const shell = code(read(path));
        assert.match(shell, new RegExp(`usePushIntent\\('${actor}', gate\\.state === 'allowed'\\)`), path);
    }
    // Ve çizim sırasında gezinilmiyor.
    assert.match(setup, /setTimeout\(\(\) => router\.push\(href as never\), 0\)/);
});

test('soğuk açılış yanıtı kaçmıyor', () => {
    // Uygulama KAPALIYKEN basılan bildirimin olayı, React ağacı kurulmadan
    // düşüyor; `addNotificationResponseReceivedListener` onu kaçırırdı.
    assert.match(setup, /useLastNotificationResponse\(\)/);
    assert.doesNotMatch(setup, /addNotificationResponseReceivedListener/);
});

test('jeton kaydı KUYRUĞA girmiyor', () => {
    /*
     * Çevrimdışı kuyruğa giren bir kayıt saatler sonra boşalırsa, o arada
     * ÇIKIŞ YAPMIŞ personelin jetonunu diriltir ve bildirimler yanlış kişiye
     * gider. Kuyruk burada bir özellik değil, bir açık.
     */
    assert.match(staffApi, /pushRegister: \(token: string, platform: 'ios' \| 'android', deviceId: string\) =>\s*\n?\s*call\('push\.register'/);
    assert.doesNotMatch(staffApi, /write\('push\./);
});

test('kopar: personel jetonu yoksa CİHAZ jetonuyla', () => {
    // Çıkışta personel token'ı siliniyor; bekleyen silme işi ancak böyle
    // tamamlanabiliyor.
    assert.match(staffApi, /const t = \(await tokens\.staff\(\)\) \?\? \(await tokens\.device\(\)\);/);
});

test('ÇIKIŞTA abonelik önce koparılıyor, sonra token siliniyor', () => {
    const block = auth.slice(auth.indexOf('async function signOut'), auth.indexOf('async function signOut') + 900);
    assert.ok(block.indexOf('unregisterPush()') < block.indexOf('tokens.clearStaff()'),
        'sıra ters olsaydı çağrı kimliksiz kalır ve bekleyen işe düşerdi');
    // Müdür oturumunda çağrılmıyor: müdürün expo kaydı Tur 1'de yok.
    assert.match(block, /if \(stored\?\.profile\.actor === 'staff'\) await unregisterPush\(\)/);
    assert.match(block, /forgetIntent\(\);/);
});

test('öne dönüşte jeton eşitleniyor — turun SONUNDA', () => {
    // Kullanıcının işini (kuyruk, token) geciktirmeden.
    assert.ok(sync.indexOf('flushQueue()') < sync.indexOf('syncPush('));
    assert.match(sync, /await syncPush\(await myStaffId\(\)\)\.catch\(\(\) => undefined\);/);
});

test('MÜDÜR oturumunda personel kimliği dönmüyor', () => {
    /*
     * Müdürün `profile.id`si bir Supabase kullanıcı kimliği, `staff.id` DEĞİL.
     * Onu personel jetonuna kaydetmek, o cihaza başka birinin bildirimlerini
     * göndermek demekti.
     */
    const me = code(read('src/lib/me.ts'));
    assert.match(me, /if \(!result\.ok \|\| result\.data\.actor !== 'staff'\) return null;/);
});

test('izin yokken jeton istenmiyor; kayıt başarısızsa iz BIRAKILMIYOR', () => {
    assert.match(push, /if \(state !== 'granted' \|\| !staffId\) return state;/);
    // `tf.push.last` yalnız BAŞARIDAN sonra yazılıyor → bir sonraki turda
    // yeniden denenir. Kendi kendini iyileştiren kayıt.
    const block = push.slice(push.indexOf('export async function syncPush'));
    assert.ok(block.indexOf('api.pushRegister') < block.indexOf('AsyncStorage.setItem(K_LAST'));
});

test('koparma başarısızsa iş BEKLİYOR — ortak telefonun kuralı', () => {
    assert.match(push, /AsyncStorage\.setItem\(K_PENDING_OFF, deviceId\)/);
    assert.match(push, /export async function flushPendingUnregister/);
    // Bekleyen silme, yeni kayıttan ÖNCE deneniyor: sırası gelmeden yazılan
    // bir kayıt, az önce koparılmak istenen satırı geri getirebilirdi.
    const block = push.slice(push.indexOf('export async function syncPush'));
    assert.ok(block.indexOf('flushPendingUnregister()') < block.indexOf('readPushState()'));
});

test('izin kartı YALNIZ hiç sorulmamışken ve bir kez', () => {
    const prompt = code(read('src/components/PushPrompt.tsx'));
    assert.match(prompt, /setVisible\(shouldAsk\(state\)\)/);
    assert.match(prompt, /AsyncStorage\.setItem\(K_DISMISSED, 'off'\)/);
    // "Şimdi değil" tek OS diyaloğunu harcamıyor.
    assert.match(prompt, /label: 'Şimdi değil'/);
    assert.match(prompt, /tone="amber"/, 'iş durmuyor — kırmızı yalnız gerçek başarısızlıkta');
});

test('personel profilinde ANAHTAR yok, DURUM satırı var', () => {
    /*
     * Anahtar kapatma yetkisi olduğunu söyler; oysa tek kapı OS izni. Kendi
     * çizdiğimiz bir anahtarın "açık" görünüp bildirimin gelmemesi mümkün
     * olurdu — ekranın yalan söylemesi buradan başlardı.
     */
    const profile = code(read('app/personel/profile.tsx'));
    assert.doesNotMatch(profile, /SwitchRow|ProfileSwitch/);
    assert.match(profile, /title="Bildirimler"\s*\n\s*value=\{permissionText\(push\)\}/);
    // Gidecek yeri olmayan satır dokunulabilir değil.
    assert.match(profile, /chevron=\{shouldAsk\(push\) \|\| opensSettings\(push\)\}/);
});
