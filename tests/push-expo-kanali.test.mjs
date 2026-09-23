import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * EXPO PUSH KANALI (103/104) — 2026-09-23.
 *
 * Sunucuda push altyapısı 037'den beri duruyordu ama Web Push (VAPID) ile —
 * yani tarayıcı protokolüyle. Native uygulama hiçbir bildirim alamıyordu.
 * Bu tur aynı boruya ikinci kanal ekliyor.
 *
 * Bu dosyanın koruduğu şey çoğunlukla "GİTMEDİ AMA GİTTİ SANDIK" ailesi:
 * bildirim sessizce kaybolduğunda kimse fark etmiyor, çünkü bildirim bir
 * garanti değil — kaybını ancak arayan görüyor.
 */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sendPush = read('supabase/functions/send-push/index.ts');
const staffApi = read('supabase/functions/staff-api/index.ts');
const remind = read('supabase/functions/remind/index.ts');
const sql103 = read('supabase/103_push_expo_kanali.sql');
const sql104 = read('supabase/104_push_ilk_ad.sql');

// ── send-push ───────────────────────────────────────────────────────────────

test('SESSİZ KESİNTİ KAPANDI — sorgu hatası "abone yok" diye okunmuyor', () => {
    /*
     * Eskiden `const { data: subs } = await q;` yazıyordu ve `error` hiç
     * okunmuyordu. Sorgu patlayınca (şema/fonksiyon sırası ters gittiyse,
     * RLS, bağlantı) fonksiyon 200 + "no_subscribers" dönüyordu: bütün salon
     * bildirimsiz kalır ve hiçbir yerde iz olmazdı.
     */
    assert.match(sendPush, /const \{ data: subs, error: subsErr \} = await q;/);
    assert.match(sendPush, /if \(subsErr\) \{[\s\S]{0,200}return json\(\{ error: 'lookup_failed' \}, 500\);/);
    // "Abone yok" hâlâ AYRI ve 200 — o gerçekten bir hata değil.
    assert.match(sendPush, /return json\(\{ sent: 0, note: 'no_subscribers' \}, 200\);/);
});

test('VAPID kapısı WEB DALININ İÇİNDE — Expo\'yu öldürmüyor', () => {
    // Kapı fonksiyonun başındayken, hedefte tek bir web abonesi olmasa bile
    // VAPID'siz kurulumda Expo bildirimleri de ölüyordu.
    const gate = sendPush.indexOf("getSecret(admin, 'VAPID_PUBLIC_KEY')");
    const branch = sendPush.indexOf('if (web.length > 0)');
    const query = sendPush.indexOf('const { data: subs, error: subsErr }');
    assert.ok(branch > 0 && gate > branch, 'VAPID okuması web dalından sonra gelmeli');
    assert.ok(gate > query, 'VAPID kapısı abonelik sorgusundan önce çalışmamalı');
    // Eksik yapılandırma artık isteği düşürmüyor, yalnız kendi kanalını durduruyor.
    assert.doesNotMatch(sendPush, /push_not_configured/);
});

test('Expo ucu ve grup boyu', () => {
    // `expo.host` DEĞİL: yanlış host DNS'te ölür ve catch onu yutar.
    assert.match(sendPush, /const EXPO_PUSH_URL = 'https:\/\/exp\.host\/--\/api\/v2\/push\/send';/);
    assert.match(sendPush, /const EXPO_CHUNK = 100;/);
    assert.match(sendPush, /for \(let i = 0; i < expo\.length; i \+= EXPO_CHUNK\)/);
});

test('YALNIZ DeviceNotRegistered satır siliyor', () => {
    /*
     * `MismatchSenderId` ve `InvalidCredentials` sunucu tarafı yapılandırma
     * arızası — cihazın suçu değil. Bunları budamaya dahil etmek, tek bir
     * yanlış anahtarın salonun BÜTÜN aboneliklerini silmesi demekti.
     */
    assert.match(sendPush, /if \(reason === 'DeviceNotRegistered'\) \{[\s\S]{0,400}dead\.push\(sub\.endpoint\);/);
    const pushes = [...sendPush.matchAll(/dead\.push\(/g)];
    assert.equal(pushes.length, 2, 'yalnız iki budama noktası: web 404\\/410 ve Expo DeviceNotRegistered');
    // İstek tümden reddedilirse hiçbir şey silinmiyor.
    assert.match(sendPush, /if \(!res\.ok \|\| !Array\.isArray\(out\?\.data\)\) \{[\s\S]{0,400}continue;/);
});

test('biletler `to` dizisiyle AYNI SIRADA eşleniyor', () => {
    // Toplu `to: [...]` kullanılsaydı hangi biletin hangi satıra ait olduğu
    // kaybolurdu ve yanlış satır budanabilirdi.
    assert.match(sendPush, /out\.data\.forEach\(\(raw, index\) =>/);
    assert.match(sendPush, /const sub = chunk\[index\];/);
    assert.match(sendPush, /if \(!sub\) return;/);
});

test('çağıranların sözleşmesi DEĞİŞMEDİ', () => {
    // Tetikleyiciler, `remind` ve `notify.ts` bu fonksiyonu eskisi gibi çağırıyor.
    assert.match(sendPush, /if \(target\.staffId\) q = q\.eq\('staff_id', target\.staffId\);/);
    assert.match(sendPush, /else if \(target\.role === 'manager'\) q = q\.eq\('role', 'manager'\);/);
    assert.match(sendPush, /sent, pruned: dead\.length, total: rows\.length,/);
    // Web dalı aynen duruyor.
    assert.match(sendPush, /\{ endpoint: s\.endpoint, keys: \{ p256dh: s\.p256dh!, auth: s\.auth! \} \}/);
    assert.match(sendPush, /if \(code === 404 \|\| code === 410\) dead\.push\(s\.endpoint\);/);
});

test('gönderim tek satırlık iz bırakıyor', () => {
    // "Gitmedi"nin sebebini sonradan aramak zorunda kalmayalım.
    assert.match(sendPush, /console\.log\(`push org=\$\{organization_id\}/);
    assert.match(sendPush, /web=\$\{web\.length\}\/\$\{webSent\} expo=\$\{expo\.length\}\/\$\{expoSent\}/);
});

// ── Şema (103) ──────────────────────────────────────────────────────────────

test('103 mevcut web aboneliklerini BOZMUYOR', () => {
    // Varsayılan 'web' → veri taşıma yok, eski satırlar olduğu gibi çalışır.
    assert.match(sql103, /add column if not exists kind\s+text not null default 'web'/);
    assert.match(sql103, /check \(kind in \('web', 'expo'\)\)/);
    // NOT NULL düşüyor ama garanti kind'a bağlı olarak geri veriliyor.
    assert.match(sql103, /alter column p256dh drop not null/);
    assert.match(sql103, /\(kind = 'web'\s+and p256dh is not null and auth is not null\)/);
    assert.match(sql103, /\(kind = 'expo' and p256dh is null\s+and auth is null\)/);
});

test('cihaz başına TEK expo satırı', () => {
    assert.match(sql103, /create unique index if not exists uq_push_subs_device/);
    assert.match(sql103, /where kind = 'expo' and device_id is not null/);
});

// ── Personel jeton kaydı (staff-api) ────────────────────────────────────────

test('push.register kimliği GÖVDEDEN okumuyor', () => {
    const block = staffApi.slice(
        staffApi.indexOf("if (action === 'push.register')"),
        staffApi.indexOf("if (action === 'realtime.token')"),
    );
    assert.ok(block.length > 100, 'push.register bloğu bulunamadı');
    assert.match(block, /staff_id: me\.id,/);
    assert.match(block, /organization_id: me\.organization_id,/);
    assert.doesNotMatch(block, /body\.staffId|body\.organizationId|body\.orgId/);
});

test('push.register CİHAZ token\'ını kabul etmiyor', () => {
    /*
     * Cihaz token'ında `claims.sub === 'device'` — bir uuid değil. Kapı
     * olmasaydı `staff_id: 'device'` yazılmaya çalışılır, Postgres uuid hatası
     * verir, istemcideki `.catch()` onu yutar ve HİÇBİR ŞEY OLMAMIŞ GİBİ
     * görünürdü.
     */
    const gate = staffApi.indexOf("if (isDevice) return json({ error: 'staff_token_required' }, 403);");
    const register = staffApi.indexOf("if (action === 'push.register')");
    assert.ok(gate > 0 && register > gate, 'push.register personel kapısından SONRA olmalı');
});

test('push.unregister cihaz token\'ıyla da çalışıyor', () => {
    /*
     * Çıkışta personel token'ı siliniyor. Bekleyen bir silme işi ancak cihaz
     * token'ıyla tamamlanabilir — yoksa ORTAK TELEFONDA ayrılan personelin
     * bildirimleri yeni personelin elinde çalmaya devam eder.
     */
    const gate = staffApi.indexOf("if (isDevice) return json({ error: 'staff_token_required' }, 403);");
    const unregister = staffApi.indexOf("if (action === 'push.unregister')");
    assert.ok(unregister > 0 && unregister < gate, 'push.unregister personel kapısından ÖNCE olmalı');
    const block = staffApi.slice(unregister, gate);
    assert.match(block, /\.eq\('organization_id', claims\.org\)/, 'kapsam org ile sınırlı');
    assert.match(block, /\.eq\('device_id', deviceId\)/);
    assert.doesNotMatch(block, /staff_id/, 'çıkışın anlamı: bu telefon artık kimsenin değil');
});

test('jeton biçimi denetleniyor — açık 400', () => {
    assert.match(staffApi, /\^Expo\(nent\)\?PushToken/);
    assert.match(staffApi, /return json\(\{ error: 'invalid_push_token' \}, 400\);/);
});

test('eski jeton ÖNCE siliniyor, sonra upsert', () => {
    // İki ayrı tekillik kısıtı var; `on conflict` yalnız birini hedefleyebiliyor.
    const block = staffApi.slice(
        staffApi.indexOf("if (action === 'push.register')"),
        staffApi.indexOf("if (action === 'realtime.token')"),
    );
    assert.ok(block.indexOf('.delete()') < block.indexOf('.upsert('), 'silme upsert\'ten önce');
    assert.match(block, /\.neq\('endpoint', token\)/);
    assert.match(block, /\{ onConflict: 'endpoint' \}/);
});

// ── Gizlilik: yalnız ilk ad (104) ───────────────────────────────────────────

test('bildirimde YALNIZ İLK AD — kilit ekranı salonda herkese açık', () => {
    /*
     * Tam ad kararı web push dönemindendi: bildirim kullanıcının kendi
     * bilgisayarında açılıyordu. Salonda telefon tezgâhın üstünde duruyor.
     * KVKK'da veri sorumlusu salonun kendisi.
     */
    // Başlık yorumu eski hâli ANLATIYOR; iddia fonksiyon gövdesine bakmalı.
    const fn104 = sql104.slice(sql104.indexOf('AS $$'));
    assert.match(fn104, /split_part\(COALESCE\(NEW\.customer_name, ''\), ' ', 1\)/);
    assert.doesNotMatch(fn104, /COALESCE\(NEW\.customer_name, 'Müşteri'\)/);
    // Boş addan 'Müşteri'ye düşülüyor — satır " · Saç kesimi" diye başlamasın.
    assert.match(fn104, /'Müşteri'\)/);
});

test('104 olay listesine DOKUNMUYOR — 046\'nın kararı duruyor', () => {
    // Yalnız metin değişiyor; yöneticiye push hâlâ yok.
    assert.doesNotMatch(sql104, /jsonb_build_object\('role', 'manager'\)/);
    for (const tag of ['assign-', 'arrived-', 'cancel-', 'moved-']) {
        assert.match(sql104, new RegExp(`'${tag}'`), `${tag} olayı korunmalı`);
    }
});

test('remind de ilk adı yazıyor', () => {
    // İki kanala iki ayrı gizlilik kuralı, birinin unutulması demekti.
    assert.match(remind, /body: `\$\{firstName\(r\.customer_name\)\}/);
    assert.match(remind, /function firstName\(full: string \| null \| undefined\): string \{/);
    assert.doesNotMatch(remind, /\$\{r\.customer_name \|\| 'Müşteri'\}/);
});
