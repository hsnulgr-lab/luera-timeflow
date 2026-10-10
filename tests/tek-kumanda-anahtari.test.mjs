import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * TEK KİŞİLİK KUMANDANIN ANAHTARI (108 · Faz 2b).
 *
 * Kumanda dar personel API'si üzerinde ve o API'nin kimliği `x-staff-token`:
 * cihaz eşleme + PIN ile alınıyor. Tek kişilik işletmenin sahibinin elinde
 * Supabase MÜDÜR oturumu var, personel jetonu yok — işi başlatma, bitirme ve
 * adisyon yolu bu kabukta hiç açılamıyordu.
 *
 * Çözüm sunucuda bir uç: sahip, KENDİ personel satırı için jeton alıyor.
 * Buradaki testler o ucun kapılarını ve mobil tarafın sınırlarını kolluyor —
 * ikisi de sessizce gevşerse kimse fark etmez.
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const fn = read('supabase/functions/staff-api/index.ts');
const session = read('mobile/src/lib/soloSession.ts');
const client = read('mobile/src/api/staff.ts');
const shell = read('mobile/app/tek/_layout.tsx');
const me = read('mobile/src/lib/me.ts');

/** Ucun gövdesi — kapıların hepsi bu aralıkta olmalı. */
const endpoint = (() => {
    const start = fn.indexOf("if (action === 'solo.session')");
    assert.ok(start > 0, 'solo.session ucu yok');
    const end = fn.indexOf("if (action === 'device.code.redeem')", start);
    assert.ok(end > start, 'ucun sonu bulunamadı');
    return fn.slice(start, end);
})();

test('uç SAHİP kapısının arkasında', () => {
    // `ownerOf()` geçerli Supabase oturumu istiyor ve `member` rolünü
    // reddediyor. Olmadan, elinde herhangi bir JWT olan biri personel
    // jetonu basabilirdi.
    assert.match(endpoint, /const owner = await ownerOf\(\);/);
    assert.match(endpoint, /if \(owner instanceof Response\) return owner;/);
});

test('org GERÇEKTEN tek kişilik olmalı', () => {
    /*
     * En kritik kapı. Olmadan, ekibi olan bir salonun sahibi personelinden
     * birinin kimliğine bürünüp onun adına iş başlatıp bitirebilirdi —
     * kendi yetkisiyle yapamayacağı tek şey tam olarak budur.
     */
    assert.match(endpoint, /\.select\('id, solo'\)/);
    assert.match(endpoint, /if \(!org\?\.solo\) return json\(\{ error: 'not_solo' \}, 403\);/);
});

test('TEK aktif personel yoksa sunucu TAHMİN ETMİYOR', () => {
    // Birden fazlaysa "hangisi" sorusunun cevabı yok; sıfırsa açılacak bir
    // kumanda yok. İkisi de ayrı hata, çünkü çözümleri ayrı.
    assert.match(endpoint, /\.eq\('is_active', true\)/);
    assert.match(endpoint, /if \(!crew \|\| crew\.length === 0\) return json\(\{ error: 'no_staff' \}, 409\);/);
    assert.match(endpoint, /if \(crew\.length > 1\) return json\(\{ error: 'not_solo' \}, 409\);/);
});

test('abonelik JETON VERİLMEDEN önce bakılıyor', () => {
    // Jeton verip her isteği 403'e düşürmek teknik olarak aynı kapı, ama
    // kullanıcıya "çalıştı sandım" dedirtir.
    assert.match(endpoint, /checkAccess\(admin, owner\.orgId\)/);
    assert.match(endpoint, /subscription_inactive/);
    assert.ok(
        endpoint.indexOf('checkAccess') < endpoint.indexOf("from('staff')"),
        'abonelik kapısı personel okumasından ÖNCE olmalı',
    );
});

test('denetim olayı kısıta UYGUN bir ad kullanıyor', () => {
    /*
     * `staff_auth_log_event_check` (090) sınırlı bir liste tutuyor ve
     * supabase-js `insert()` FIRLATMIYOR — listede olmayan bir ad yazsaydık
     * kayıt sessizce düşerdi. Olan şey zaten bir giriş; ayrımı `detail`
     * taşıyor.
     */
    assert.match(endpoint, /audit\(owner\.orgId, crew\[0\]\.id, 'login', 'solo'\)/);
});

test('uç personel jetonu kapısından ÖNCE duruyor', () => {
    // Sonra olsaydı kendisi personel jetonu isterdi — tavuk-yumurta.
    assert.ok(
        fn.indexOf("if (action === 'solo.session')")
            < fn.indexOf("const raw = req.headers.get('x-staff-token')"),
        'solo.session, token kapısından sonra kalmış',
    );
});

// ── Mobil taraf ─────────────────────────────────────────────────────────────

test('personel API istemcisi Supabase’i İTHAL ETMİYOR', () => {
    /*
     * Dosyanın kendi kuralı: "personel cihazında Supabase kimliği YOKTUR".
     * Tazeleme için oraya `supabase` ithal etmek o kuralı delerdi; onun
     * yerine kabuk kendi tazeleyicisini takıyor.
     */
    assert.doesNotMatch(client, /from '\.\.\/lib\/supabase'/);
    assert.match(client, /export function setStaffTokenRefresher/);
});

test('tazeleme BİR KEZ deneniyor, döngü yok', () => {
    // Yeni jeton da reddedilirse hata olduğu gibi yukarı çıkmalı; yoksa
    // süresi dolmuş bir oturum sonsuz istek üretirdi.
    assert.match(client, /if \(!fresh \|\| fresh === t\) throw cause;/);
    assert.match(client, /needsFreshToken = \(code: string\) =>/);
});

test('tazeleyici kabuk kapanınca SÖKÜLÜYOR', () => {
    /*
     * Aynı uygulama oturumunda kabuk değişebiliyor (mod değişimi, çıkış,
     * başka hesapla giriş). Takılı kalan tazeleyici, personel kabuğundaki
     * bir 401'de org oturumuna uzanmaya çalışırdı.
     */
    assert.match(session, /setStaffTokenRefresher\(fn: TokenRefresher \| null\)|setStaffTokenRefresher\(null\)/);
    assert.match(session, /return \(\) => setStaffTokenRefresher\(null\);/);
    assert.match(shell, /useEffect\(\(\) => attachSoloTokenRefresher\(\), \[\]\);/);
});

test('tazeleyici kendi hatasını asıl hatanın ÜSTÜNE yazmıyor', () => {
    // Bir isteğin ortasında çalışıyor; başarısız olursa asıl isteğin kendi
    // hatası yukarı çıkmalı. Sebep yine de günlüğe düşüyor.
    assert.match(session, /return false;/);
    assert.match(session, /console\.error\('\[tek\] personel jetonu tazelenemedi:'/);
});

test('sunucu 200 deyip jeton göndermezse SESSİZ GEÇİLMİYOR', () => {
    // Sessiz geçmek, bir sonraki isteğin anlaşılmaz bir 401'le düşmesi
    // demekti.
    assert.match(session, /jetonsuz cevap döndü/);
});


// ── Kimlik ──────────────────────────────────────────────────────────────────

test('sunucunun söylediği personel kimliği SAKLANIYOR', () => {
    /*
     * Sahip müdür oturumuyla bağlı ve `profile.id`si bir Supabase KULLANICI
     * kimliği — `staff.id` değil. Kumandadaki "sık kullandıkların" ızgarası
     * kişinin kendi geçmişini bu kimlikle arıyor; yanlışıyla hiçbir satır
     * tutmaz ve ızgara sessizce salon moduna düşer.
     */
    assert.match(session, /tokens\.setSoloStaffId\(staffId\)/);
    assert.match(client, /soloStaffId: \(\) => readSecure\(K_SOLO_STAFF\)/);
});

test('kimlik jetonla BİRLİKTE düşüyor', () => {
    // Ardında bırakmak, başka bir hesapla girildiğinde önceki salonun
    // personel kimliğini taşımaktı.
    const clearStaff = client.slice(client.indexOf('clearStaff:'), client.indexOf('clearDevice:'));
    assert.match(clearStaff, /K_SOLO_STAFF/);
});

test('KANCA ile FONKSİYON ayrışıyor — bildirim yanlış kanala yazılmasın', () => {
    /*
     * `myStaffId()`yi bildirim kaydı çağırıyor (`syncPush`). Orada müdür
     * oturumunda bir kimlik döndürmek, tek kişilik sahibin cihazını hem
     * müdür hem personel kanalına kaydetmek olurdu — aynı bildirimi iki kez
     * alırdı. Kanca ise yalnız bir ARAMA ANAHTARI besliyor.
     */
    // Yorumlar ayıklanıyor: kancanın gerekçe bloğu iki tanımın ARASINDA
    // duruyor ve içinde `soloStaffId` geçiyor — metinde arayan bir iddia
    // onu kodun bir parçası sanardı.
    const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const fnBody = code(me.slice(me.indexOf('export async function myStaffId'),
                                 me.indexOf('export function useMyStaffId')));
    assert.match(fnBody, /result\.data\.actor !== 'staff'\) return null;/);
    assert.doesNotMatch(fnBody, /soloStaffId/);

    const hookBody = me.slice(me.indexOf('export function useMyStaffId'));
    assert.match(hookBody, /tokens\.soloStaffId\(\)/);
    assert.match(hookBody, /result\.data\.actor === 'staff'/);
});
