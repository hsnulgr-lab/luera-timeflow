import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Personel · Takvim'in CANLI bağlanması.
 *
 * Ekran üç sahte sabitten besleniyordu ve üçü de canlıda yanlış cevap
 * veriyordu: sütunlar `mockDay.presence`ten, "kimin randevusu" kararı
 * `ME = 'merve'`ten, şerit sayıları sahte aralık kaynağından.
 */

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
/** Yorumları atar: "sabit kimlik kalmadı" iddiası KODA bakmalı, prozaya değil. */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const source = read('src/lib/salonDay.ts');
const screen = read('app/personel/calendar.tsx');
const screenCode = code(screen);
const server = readFileSync(
    new URL('../supabase/functions/staff-api/index.ts', import.meta.url),
    'utf8',
);

test('takvim KENDİ ucundan besleniyor — agenda ile karıştırılmıyor', () => {
    // `agenda` personelin KENDİ günü (telefon ve not dâhil, yazma uçlarına
    // girdi); `calendar` salonun günü — dar kolonlu, salt okunur. Aynı ucu
    // iki işe koşmak, "kendi randevusu" kuralının gevşemesi demekti.
    assert.match(source, /api\.calendar\(dateISO\)/);
    assert.doesNotMatch(source, /api\.agenda\(/);
});

test('müdürle ORTAK sahte kaynak canlıya çevrilmedi', () => {
    // `calendarSource.source` müdür ekranlarıyla ortak (mudur/calendar,
    // randevu/[id], CreateFlow, MoveParts). Onu canlıya çevirmek müdürü
    // staff-api'ye sokardı — müdürün personel token'ı YOK, o uç 401 döner.
    assert.match(readFileSync(new URL('../mobile/src/lib/calendarSource.ts', import.meta.url), 'utf8'),
        /export const source: CalendarSource = mockSource;/);
    // Ekran artık o kaynağı hiç çağırmıyor.
    assert.doesNotMatch(screen, /source\.(day|range|nextAfter)\(/);
    assert.match(screen, /useSalonDay\(selectedDate\)/);
});

test('"kimin randevusu" kararı SUNUCUDAN geliyor', () => {
    // Sunucu her satıra `mine` yazıyor ve bunu istemcinin işini kolaylaştırmak
    // için değil, İKİ DÜNYAYI AYIRMAK için yapıyor.
    assert.match(server, /mine: r\.staff_id === me\.id/);
    assert.match(source, /\.filter\(\(row\) => row\.mine === true\)/);
    assert.match(screen, /mine\.has\(appointment\.id\)/);
    // Sahte kipteki sabit kimlik YALNIZ sahte kipte kaldı.
    assert.match(source, /const MOCK_ME = 'merve';/);
    assert.doesNotMatch(screenCode, /'merve'/);
    assert.doesNotMatch(screenCode, /\bME\b/);
});

test('sütunlar salonun GERÇEK kadrosundan çiziliyor', () => {
    assert.match(source, /\(data\.staff \?\? \[\]\)\.map/);
    assert.match(source, /initials: initialsOf\(String\(person\.name\)\)/);
    assert.doesNotMatch(screen, /mockDay\.presence/);
    // Sunucu adı gönderiyor, baş harfi göndermiyor — tek `initialsOf`.
    assert.match(server, /admin\.from\('staff'\)\.select\('id, name, color'\)/);
});

test('şerit sayıları canlıda UYDURULMUYOR', () => {
    // Sunucuda ARALIK ucu yok. Sahte sayı çizmek düpedüz yalan olurdu;
    // eksik gün "bilinmiyor" diye çiziliyor, sıfır diye değil
    // (`personel/index.tsx` ile aynı kural).
    assert.match(source, /counts: \{ \[dateISO\]: rows\.length \}/);
    // Okunan günlerin sayıları BİRİKİYOR: tek günlük haritayı ezmek, az önce
    // okunan günü şeritte "bilinmiyor"a düşürürdü.
    assert.match(source, /counts: \{ \.\.\.current\.counts, \.\.\.next\.counts \}/);
});

test('telefon ve not bu ekrana HİÇ inmiyor', () => {
    // Telefon listesi, ayrılan personelin cebinde götürebileceği en değerli
    // şey; not ise takvim verisi değil. Ayrım SUNUCUDA.
    const cols = server.slice(server.indexOf("const CAL_COLS ="), server.indexOf("const [{ data: rows"));
    for (const banned of ['customer_phone', 'notes', 'adisyon_items', 'is_paid']) {
        assert.ok(!cols.includes(banned), `calendar kolonları ${banned} taşımamalı`);
    }
    assert.match(source, /customer_phone: null,/);
    assert.match(source, /notes: null,/);
});

test('başlık okunamayan günü BOŞ gün gibi göstermiyor', () => {
    // `fetched.length` hata hâlinde sıfır görünüyordu: gövde "okuyamadık"
    // derken başlık "0 randevu" diyordu.
    assert.match(screen, /dayState === 'error'\s*\?\s*'okunamadı'/);
    assert.match(screen, /dayState === 'loading'\s*\?\s*'…'/);
});

test('bayat takvim başlıkta kendini söylüyor', () => {
    // Yoklama sessizce cevap alamıyorsa ızgara donuyor ve tek iz bu satır.
    // "kaçı sizin"i kaybetmek, bayat bir saate güvenmekten iyi.
    assert.match(screen, /stale && readAt/);
    assert.match(screen, /son güncelleme \$\{clockOf\(readAt\)\}/);
    // Karar EKRANDA değil kaynakta: `Date.now()` çizim sırasında çağrılamıyor.
    assert.match(source, /setStale\(isStale\(atRef\.current, Date\.now\(\)\)\)/);
    assert.doesNotMatch(screen, /Date\.now\(\)/);
});

test('takvim de Bugün ile AYNI yenileme desenini taşıyor', () => {
    // İki ekranın ayrı davranması, aynı arızayı iki kez öğrenmek demekti.
    assert.match(source, /if \(AppState\.currentState !== 'active'\) return;/);
    assert.match(source, /}, POLL_MS\);/);
    assert.match(source, /AppState\.addEventListener\('change'/);
    assert.match(source, /useFocusEffect\(useCallback\(\(\) => \{ void read\(false\); \}, \[read\]\)\)/);
    assert.match(source, /if \(visible\) setState\('error'\);/);
});

test('seçili gün parametreden AYNALANMIYOR', () => {
    // Efektle state'e kopyalamak bir gerçeği ikiye bölüyordu. Seçim hangi
    // parametrenin üstüne yapıldığını saklıyor: Bugün'ün şeridinden YENİ bir
    // gün gelince eski seçim kendiliğinden düşüyor.
    assert.doesNotMatch(screen, /setSelectedDate/);
    assert.match(screen, /pick && pick\.over === params\.date/);
    assert.match(screen, /setPick\(\{ over: params\.date, date \}\)/);
});
