import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * CANLI SİNYAL — 2026-09-18.
 *
 * Ekranlar yoklayarak öğreniyordu: masaüstünden bir randevu oluşturulduğunda
 * telefona düşmesi en kötü 25 saniye sürüyordu. Sinyal bunu saniyesine
 * indiriyor — ama VERİ TAŞIMADAN: kanaldan geçen tek şey "değişti", veriyi
 * ekran her zamanki yoldan çekiyor.
 */

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
const signal = read('src/lib/liveSignal.ts');
const hook = read('src/lib/managerRead.ts');
const source = read('src/lib/managerSource.ts');

test('sinyal VERİ taşımıyor — yalnız haber', () => {
    /*
     * Kanaldan salon verisi geçseydi izin kontrolü de oraya taşınmış olurdu.
     * Ekran haberi duyup veriyi HER ZAMANKİ yoldan çekiyor: müdür RLS ile,
     * personel staff-api ile. Dinleyicinin imzası bu yüzden argümansız.
     */
    assert.match(signal, /type Listener = \(\) => void;/);
    assert.match(signal, /for \(const listener of \[\.\.\.listeners\]\) listener\(\);/);
    // Olayın gövdesi (`payload`) hiç okunmuyor.
    assert.doesNotMatch(signal, /payload/);
});

test('abonelik ORG SÜZGEÇLİ', () => {
    // RLS üye olunan BÜTÜN org'ları açıyor: süzgeçsiz bir abonelik başka
    // salonun hareketiyle tazelerdi.
    const filters = signal.match(/filter: `organization_id=eq\.\$\{orgId\}`/g) ?? [];
    assert.equal(filters.length, 2, 'reservations ve payments, ikisi de süzgeçli');
    assert.match(signal, /\.channel\(`live:\$\{orgId\}`\)/);
});

test('org başına TEK kanal; son dinleyici gidince kapanıyor', () => {
    // Her ekranın kendi aboneliği, aynı org için beş websocket demekti.
    assert.match(signal, /if \(channel \|\| opening \|\| listeners\.size === 0/);
    assert.match(signal, /if \(listeners\.size === 0\) closeChannel\(\);/);
    // Aynı anda iki kurulum başlamasın.
    assert.match(signal, /let opening = false;/);
});

test('dinleyiciler KANALDAN BAĞIMSIZ', () => {
    /*
     * İkisi birbirine bağlıyken salon değişince kanal kapanıyor, dinleyiciler
     * de onunla gidiyordu: ekran açık kalıyor ama artık hiçbir sinyal
     * duymuyordu. Yoklama tazelemeye devam ettiği için kimse fark etmezdi —
     * sessizce ölen bir hızlandırıcı.
     */
    assert.match(signal, /^const listeners = new Set<Listener>\(\);$/m);
    const channelType = signal.slice(signal.indexOf('interface Channel'), signal.indexOf('let channel'));
    assert.doesNotMatch(channelType, /listeners/);
    // Salon değişince kanal kapanıp DOĞRU org'la yeniden kuruluyor.
    assert.match(signal, /export function forgetLive\(\): void \{\s*closeChannel\(\);\s*void ensure\(\);/);
});

test('salon değişimi kaynağa KAYDOLARAK yakalanıyor', () => {
    // Ters yönde bir içe aktarma (managerSource → liveSignal) döngü yaratırdı;
    // her çağıran ekranın ayrıca hatırlaması gereken bir şey de olmamalı.
    assert.match(source, /export function onForgetOrg\(hook: \(\) => void\): void \{/);
    assert.match(source, /cached = null;\s*for \(const hook of forgetHooks\) hook\(\);/);
    assert.match(signal, /^onForgetOrg\(forgetLive\);$/m);
});

test('YOKLAMA KALKMIYOR — sinyal garanti değil', () => {
    /*
     * Websocket kopabilir, telefon uyuyabilir, sunucu yeniden başlayabilir.
     * Sinyale güvenip yoklamayı kapatmak, sessizce bayatlayan bir ekran
     * üretirdi.
     */
    assert.match(hook, /useLiveSignal\(useCallback\(\(\) => \{ void run\(false\); \}, \[run\]\)\);/);
    assert.match(hook, /const id = setInterval\(\(\) => \{[\s\S]{0,160}\}, POLL_MS\);/);
    // Sessiz tur: çalışan bir ekranı "yükleniyor"a düşürmek sinyali gürültüye
    // çevirirdi.
    assert.doesNotMatch(hook, /useLiveSignal\([\s\S]{0,80}run\(true\)/);
});

test('olaylar TEK tazelemeye iniyor', () => {
    // Bir taşıma iki satır, bir adisyon beş kalem yazabiliyor.
    assert.match(signal, /const COALESCE_MS = 300;/);
    assert.match(signal, /if \(timer\) return;/);
});

test('URL yaması kökte — realtime onsuz sessizce bağlanmıyor', () => {
    // Paket kuruluydu ama hiçbir yerden içe aktarılmıyordu; REST yamasız da
    // çalıştığı için bugüne kadar görünmedi.
    const root = read('app/_layout.tsx');
    assert.match(root, /^import 'react-native-url-polyfill\/auto';$/m);
    const head = root.slice(0, root.indexOf("from '@expo-google-fonts/hanken-grotesk'"));
    assert.ok(head.includes('react-native-url-polyfill/auto'), 'yama her şeyden önce yüklenmeli');
});

// ── Personelin zili (100) ───────────────────────────────────────────────────

const sql = readFileSync(new URL('../supabase/100_live_doorbell.sql', import.meta.url), 'utf8');
const server = readFileSync(new URL('../supabase/functions/staff-api/index.ts', import.meta.url), 'utf8');
const signer = readFileSync(new URL('../supabase/functions/_shared/staffToken.ts', import.meta.url), 'utf8');

test('zil jetonu VERİYE AÇILMIYOR — rolü yetkisiz', () => {
    /*
     * `authenticated` kullanılamazdı: aynı sırla imzalanmış bir jeton
     * PostgREST'e de geçerli gelir ve RLS org seviyesinde olduğu için salonun
     * BÜTÜN verisini açardı. `staff_rt` rolünün hiçbir tabloda yetkisi yok.
     */
    assert.match(signer, /role: 'staff_rt',/);
    assert.doesNotMatch(signer.slice(signer.indexOf('export function mintRingToken')), /authenticated/);
    assert.match(sql, /create role staff_rt nologin noinherit;/);
    // public şemasına TEK bir yetki bile verilmiyor.
    const grants = sql.match(/^grant .*$/gm) ?? [];
    for (const line of grants) {
        assert.doesNotMatch(line, /\bpublic\./, `zil rolüne public yetkisi: ${line}`);
    }
    assert.match(sql, /grant select on realtime\.messages to staff_rt;/);
});

test('org talebini SUNUCU yazıyor, telefon seçemiyor', () => {
    // Telefon hangi salonun zilini dinleyeceğini kendisi söyleyebilseydi,
    // başka salonun hareketini duyardı.
    assert.match(server, /token: await mintRingToken\(me\.id, me\.organization_id, jwtSecret\)/);
    assert.match(server, /topic: `org:\$\{me\.organization_id\}`/);
    assert.match(sql, /using \(realtime\.topic\(\) = 'org:' \|\| coalesce\(auth\.jwt\(\) ->> 'org', ''\)\)/);
});

test('müdür ÜYELİĞİNDEN doğrulanıyor', () => {
    assert.match(sql, /from public\.organization_members m\s*where m\.user_id = auth\.uid\(\)/);
    assert.match(sql, /realtime\.topic\(\) = 'org:' \|\| m\.org_id::text/);
});

test('zil VERİ taşımıyor — yalnız hangi tablo', () => {
    assert.match(sql, /jsonb_build_object\('t', tg_table_name\)/);
    // Randevunun kendisi gönderilseydi kanal bir veri yoluna dönerdi.
    assert.doesNotMatch(sql, /to_jsonb\(new\)|row_to_json/);
});

test('zil çalmazsa RANDEVU YAZILIR', () => {
    // Zil çalmadı diye bir randevunun kaydedilmemesi kabul edilemez;
    // yoklama emniyet ağı zaten duruyor.
    assert.match(sql, /exception when others then\s*null;/);
    assert.match(sql, /after insert or update or delete on public\.reservations/);
    assert.match(sql, /after insert or update or delete on public\.payments/);
});

test('sır yoksa uygulama ÇALIŞMAYA DEVAM ediyor', () => {
    // Zil bir hızlandırıcı: sunucuda JWT_SECRET tanımlı değilse uç 503 döner
    // ve telefon sessizce yoklamaya düşer.
    assert.match(server, /return json\(\{ error: 'realtime_unavailable' \}, 503\);/);
    assert.match(signal, /if \(!first\?\.token \|\| !first\.topic\) return null;/);
});

test('zil jetonu AYRI istemciye takılıyor', () => {
    /*
     * Paylaşılan istemciye takılsaydı müdürün oturumunu ezerdi ve o istemci
     * üzerinden giden her REST çağrısı bu YETKİSİZ jetonla giderdi.
     */
    assert.match(signal, /const client: SupabaseClient = createClient\(url, anonKey, \{/);
    assert.match(signal, /persistSession: false, autoRefreshToken: false/);
    assert.match(signal, /\.channel\(first\.topic, \{ config: \{ private: true \} \}\)/);
});

test('jeton UYGULANMADAN kanala katılınmıyor', () => {
    /*
     * `setAuth` bir söz döndürüyor. Beklemeden `subscribe` çağrıldığında kanal
     * jeton uygulanmadan katılıyor, sunucu kimliksiz görüp özel kanala almıyor
     * ve zil hiç çalmıyor. Telefonda tam olarak bu oldu (2026-09-18) ve
     * GÖRÜNMEDİ: ekran yoklamayla tazelenmeye devam ettiği için yalnız
     * "anında" olmaması fark edildi.
     */
    assert.match(signal, /await client\.realtime\.setAuth\(first\.token\);/);
    assert.ok(
        signal.indexOf('await client.realtime.setAuth(first.token);') < signal.indexOf('.channel(first.topic'),
        'jeton kanaldan ÖNCE uygulanmalı',
    );
    // Yenileme de bekleniyor.
    assert.match(signal, /if \(token\) await client\.realtime\.setAuth\(token\);/);
});

test('katılım hatası SESSİZ KALMIYOR', () => {
    // Zil bir hızlandırıcı: arızası ekranda görünmüyor, çünkü liste yoklamayla
    // tazelenmeye devam ediyor. Hiç değilse günlükte izi olsun.
    assert.match(signal, /\.subscribe\(\(status, error\) => \{/);
    assert.match(signal, /status === 'CHANNEL_ERROR' \|\| status === 'TIMED_OUT'/);
    assert.match(signal, /console\.warn\('canlı zil kapandı'/);
});

test('jeton süresi DOLMADAN yenileniyor', () => {
    // Realtime süresi geçmiş jetonu olan bağlantıyı düşürüyor ve kanal
    // sessizce ölüyordu — telefonda hiçbir iz bırakmadan.
    assert.match(signal, /\* 0\.8\)/);
    assert.match(signal, /client\.realtime\.setAuth\(token\)/);
    assert.match(signer, /RING_TOKEN_TTL_SEC = 60 \* 60/);
});

test('personel token’ı varsa zil, yoksa müdürün kanalı', () => {
    assert.match(signal, /const staff = await tokens\.staff\(\)\.catch\(\(\) => null\);/);
    assert.match(signal, /staff\s*\?\s*await openStaffRing/);
    assert.match(signal, /:\s*await openManagerChannel/);
});

test('personel ekranları da zili dinliyor', () => {
    for (const path of ['src/lib/agendaSource.ts', 'src/lib/visitSource.ts']) {
        const source = read(path);
        assert.match(source, /useLiveSignal\(useCallback\(/, path);
        // Yoklama KALKMIYOR: zil bir garanti değil.
        assert.match(source, /\}, POLL_MS\);/, path);
    }
});
