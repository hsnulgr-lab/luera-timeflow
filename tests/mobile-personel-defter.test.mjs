import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    agoLabel, demoBook, matches, mineCount, normalize, sortBook, splitName,
} from '../mobile/src/lib/customerBook.ts';
// Baş harf üç ayrı yerden tek yere taşındı — bkz. `text.initialsOf`.
import { initialsOf } from '../mobile/src/lib/text.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const screen = code(read('../mobile/app/personel/customers.tsx'));
const api = code(read('../supabase/functions/staff-api/index.ts'));

// ── Zaman etiketi ───────────────────────────────────────────────────────────

test('zaman etiketi kuaförün ölçeğini kullanıyor', () => {
    // Yakın geçmiş gün, orta mesafe hafta, uzak ay. "47 gün" kimsenin
    // kafasında bir şey ifade etmiyor.
    assert.deepEqual(agoLabel('2026-09-04', '2026-09-04'), { text: 'BUGÜN', recent: true });
    assert.deepEqual(agoLabel('2026-09-03', '2026-09-04'), { text: 'DÜN', recent: true });
    assert.equal(agoLabel('2026-09-01', '2026-09-04').text, '3 GÜN');
    assert.equal(agoLabel('2026-08-21', '2026-09-04').text, '2 HAFTA');
    assert.equal(agoLabel('2026-06-04', '2026-09-04').text, '3 AY');
});

test('turuncu yalnız bugün ve dün — zaman demek, önem değil', () => {
    assert.equal(agoLabel('2026-09-02', '2026-09-04').recent, false);
    assert.equal(agoLabel('2026-09-03', '2026-09-04').recent, true);
});

test('hiç gelmemiş müşteri sıfır değil, boşluk', () => {
    assert.equal(agoLabel(null, '2026-09-04').text, 'HİÇ');
});

// ── Ad muamelesi ────────────────────────────────────────────────────────────

test('ad ikiye bölünüyor: ince ad, kalın soyad', () => {
    assert.deepEqual(splitName('Elif Demir'), { light: 'Elif ', bold: 'Demir' });
    assert.deepEqual(splitName('Ayşe Nur Yılmaz'), { light: 'Ayşe Nur ', bold: 'Yılmaz' });
});

test('tek kelimelik ad tamamen kalın — yarısı boş kalmıyor', () => {
    assert.deepEqual(splitName('Zeynep'), { light: '', bold: 'Zeynep' });
});

test('baş harfler Türkçe büyütmeyi kullanıyor', () => {
    // "İnci Işık" → varsayılan toUpperCase "I"yı "I" yapar ama küçültme
    // tarafında bozulur; disk işareti iki harfin kendisi.
    assert.equal(initialsOf('İnci Işık'), 'İI');
    assert.equal(initialsOf('Merve Kaya'), 'MK');
});

// ── Arama ───────────────────────────────────────────────────────────────────

test('arama Türkçe küçültme kullanıyor', () => {
    // Varsayılan toLowerCase "İ"yi "i̇" yapıyor ve "İnci" araması tutmuyordu.
    assert.equal(normalize('İNCİ'), 'inci');
    assert.equal(normalize('IŞIK'), 'ışık');
});

test('arama ad ya da telefonun son dört hanesiyle', () => {
    const [c] = demoBook('2026-09-04');
    assert.equal(matches(c, 'sibel'), true);
    assert.equal(matches(c, c.phoneTail), true);
    assert.equal(matches(c, 'zzz'), false);
    assert.equal(matches(c, ''), true, 'boş sorgu herkesi geçirmeli');
});

test('iki haneli sayı telefon araması SAYILMIYOR', () => {
    // "41" gibi kısa bir dizi her numarada bulunur ve liste anlamsızlaşır.
    const c = { ...demoBook('2026-09-04')[0], phoneTail: '4120', name: 'Sibel Arda' };
    assert.equal(matches(c, '41'), false);
    assert.equal(matches(c, '412'), true);
});

// ── Sıralama ────────────────────────────────────────────────────────────────

test('sıralama son gelişe göre azalan, kontrolsüz', () => {
    const list = sortBook(demoBook('2026-09-04'), '2026-09-04');
    // Bugün randevusu olan (henüz gelmemiş) en üstte: bugün gelecek.
    assert.equal(list[0].name, 'Zeyneb Öztürk');
    assert.equal(list.at(-1).name, 'Zeynep Arslan', 'en eski en altta');
    assert.ok(!screen.includes('Sırala'), 'sıralama kontrolü olmamalı');
});

test('kendi müşterilerimin sayısı üçüncü boş hâli sürüyor', () => {
    assert.equal(mineCount(demoBook('2026-09-04')) > 0, true);
    // Altyazı artık yalnız OKUNMUŞ defterde çiziliyor: okunamayan bir
    // defterde "henüz kimseye bakmadınız" demek, bilinmeyeni sıfır saymaktı.
    assert.ok(screen.includes("const noneMine = bookState === 'ok' && mineCount(book) === 0;"));
    assert.ok(screen.includes('Henüz kimseye bakmadınız'));
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('arama ÖLÜ bir kontrol değil', () => {
    // Tasarımda düğme gibi çizilmiş olması onu ölü kontrole çevirmez.
    assert.ok(screen.includes('<TextInput'), 'gerçek metin alanı');
    assert.ok(screen.includes('onChangeText={onChange}'));
    assert.ok(screen.includes('Aramayı temizle'));
});

test('kendi müşterim BÖLÜM değil, disk işareti', () => {
    // Bölüm listeyi ikiye kesip "hangi koşudayım" sorusunu doğuruyordu.
    assert.ok(screen.includes('customer.lastStaffInitials'));
    assert.ok(screen.includes('backgroundColor: customer.mine ? c.fld'));
    assert.ok(!/BENİM MÜŞTERİLERİM/.test(screen), 'koşu başlığı kalmamalı');
});

test('listede telefon YOK', () => {
    assert.ok(!/customer\.phone\b/.test(screen), 'numara listede görünmemeli');
});

test('krom yok: filtre, segment, sıralama menüsü', () => {
    for (const chrome of ['SegmentedControl', 'Filtre', 'filterRow']) {
        assert.ok(!screen.includes(chrome), `${chrome} girmemeli`);
    }
});

// ── Sunucu ──────────────────────────────────────────────────────────────────

test('customers ucu var ve kimliği token\'dan alıyor', () => {
    assert.ok(api.includes("action === 'customers'"));
    const cut = api.slice(api.indexOf("action === 'customers'"), api.indexOf("action === 'customer'"));
    assert.ok(cut.includes('me.organization_id'));
    assert.ok(!/body\.organization_id|body\.staffId/.test(cut));
});

test('liste ucu TAM telefon döndürmüyor', () => {
    // Ekran müşterinin gözü önünde; numara listesi ayrılan personelin
    // götürebileceği en değerli şey. Yalnız son dört hane, o da arama için.
    const cut = api.slice(api.indexOf("action === 'customers'"), api.indexOf("action === 'customer'"));
    assert.ok(cut.includes('phoneTail'), 'arama için son dört hane');
    assert.ok(!/phone: person\.phone/.test(cut), 'tam numara dönmemeli');
});

test('son geliş TÜRETİLİYOR, saklanmıyor', () => {
    // Türetilmiş veri saklanırsa bir gün gerçekle ayrışır.
    const cut = api.slice(api.indexOf("action === 'customers'"), api.indexOf("action === 'customer'"));
    assert.ok(cut.includes("from('reservations')"));
    assert.ok(cut.includes('mine: staffId === me.id'));
});

// ── Klavye ──────────────────────────────────────────────────────────────────

test('klavye takılıp kalmıyor: her iki hâlde de sürüklenerek kapanıyor', () => {
    // Arama alanının dışında dokunulacak yer yok — satıra dokunmak sayfa
    // açıyor. Kapanma yolu listeyi sürüklemek; iOS'un kendi sözlüğü de bu.
    const hits = screen.match(/keyboardDismissMode="on-drag"/g) ?? [];
    assert.equal(hits.length, 2, 'liste ve boş hâl ayrı ayrı sürüklenebilmeli');
    // Boş hâlde eskiden düz bir View vardı: sonuç çıkmayınca klavyenin
    // kapanacağı hiçbir yer kalmıyordu.
    assert.match(screen, /flexGrow: 1, justifyContent: 'center'/);
});

test('liste klavyenin ALTINDA kalmıyor', () => {
    const hits = screen.match(/automaticallyAdjustKeyboardInsets/g) ?? [];
    assert.equal(hits.length, 2);
});

test('müşteri açılırken klavye kapanıyor', () => {
    assert.match(screen, /Keyboard\.dismiss\(\)/);
});

test('başlık arama sırasında DÜŞMÜYOR — sayfa sıçramıyor', () => {
    // Düşerse arama alanı ve liste 44 pt yukarı sıçrıyor ve yazılar üst üste
    // binmiş gibi görünüyor. Kazanılan yer klavye açıkken bir satır bile
    // göstermiyor.
    assert.doesNotMatch(screen, /searching \? null : \(/);
    // Başlık durduğuna göre sağdaki sayı da aramaya uymalı.
    assert.match(screen, /searching \? `\$\{shown\.length\} SONUÇ`/);
});

// ── Defter CANLI ────────────────────────────────────────────────────────────

const source = code(read('../mobile/src/lib/bookSource.ts'));

test('defter kendi ucundan besleniyor, sahte kaynak ekrandan çıktı', () => {
    assert.match(source, /api\.customers\(\)/);
    assert.ok(!screen.includes('demoBook'), 'ekran sahte defteri çağırmamalı');
    assert.match(screen, /useBook\(today\)/);
    // Sahte kaynak SİLİNMEDİ: `AUTH_MODE=live` verilmeden geliştirme akışı
    // sürüyor ve canlıya geçiş tek değişkenle geri alınabiliyor.
    assert.match(source, /if \(!LIVE_AUTH\) return demoBook\(todayISO\)/);
});

test('okunamayan defter "müşteri yok" DEMİYOR', () => {
    // Ekranın iki boş hâli var (kayıt yok · arama eşleşmedi) ve okunamayan bir
    // defterin ikisine de benzemesi, olmayan bir gerçeği söylemek olurdu.
    assert.match(screen, /bookState === 'error' \? \(/);
    assert.match(screen, /<DurumUnread/);
    assert.match(screen, /what="Defteri"/);
    assert.match(screen, /notMeaning="Müşteriniz olmadığı"/);
    // Başlıktaki sayı da susuyor: "0 KAYIT" derken gövde "okuyamadık" diyordu.
    assert.match(screen, /bookState === 'error' \? '—'/);
    // "Henüz kimseye bakmadınız" altyazısı da yalnız OKUNMUŞ defterde.
    assert.match(screen, /bookState === 'ok' && mineCount\(book\) === 0/);
});

test('defterde YOKLAMA yok — ve bu bilinçli', () => {
    // Ajanda gün içinde değişiyor; defter yalnız yeni bir randevudan doğuyor.
    // Saniye saniye çekmek hiçbir soruyu daha iyi cevaplamadan pil harcardı.
    assert.ok(!source.includes('POLL_MS'), 'defter yoklamamalı');
    assert.ok(!source.includes('setInterval'), 'defterde sayaç olmamalı');
    // Ama okuma ÜÇ anda oluyor: açılış, sekmeye dönüş, öne dönüş.
    assert.match(source, /void read\(true\);/);
    assert.match(source, /useFocusEffect\(useCallback\(\(\) => \{ void read\(false\); \}, \[read\]\)\)/);
    assert.match(source, /AppState\.addEventListener\('change'/);
});

test('sunucunun satırı ekranın beklediği beş olguyu karşılıyor', () => {
    // Satır beş olgu taşıyor: ad · ne zaman · ne yapıldı · kim yaptı · formül.
    for (const field of ['lastVisitDate', 'lastService', 'hasFormula', 'mine', 'lastStaffInitials']) {
        assert.ok(source.includes(field), `istemci ${field} okumalı`);
        assert.ok(api.includes(field), `sunucu ${field} göndermeli`);
    }
    // Telefon TAM hâliyle inmiyor: liste müşterinin gözü önünde ve numara
    // listesi ayrılan personelin götürebileceği en değerli şey.
    assert.match(source, /phoneTail: String\(row\.phoneTail \?\? ''\)/);
    assert.ok(!source.includes('phone:'), 'defterde tam numara olmamalı');
});

test('sunucuda karşılığı olmayan alan UYDURULMUYOR', () => {
    // `upcomingTime` (bugünün bekleyen randevusunun saati) `customers` ucunda
    // yok. Uydurulmuş bir saat, olmayan bir randevuyu varmış gibi gösterirdi.
    assert.ok(!source.includes('upcomingTime'), 'olmayan alan taşınmamalı');
    // Alan boşken satır son gelişin etiketini gösteriyor ve bu doğru cevap.
    assert.match(source, /toBookCustomer/);
});
