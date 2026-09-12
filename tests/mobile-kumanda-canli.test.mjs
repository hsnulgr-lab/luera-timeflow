import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { riskList, riskMask } from '../mobile/src/lib/customerFileMap.ts';

/**
 * Personel 05 — kumandanın OKUMASI canlıya bağlandı.
 *
 * İki kusur vardı ve ikisi de canlıda tehlikeliydi: randevu bulunamazsa
 * BAŞKA bir randevu açılıyordu, ve alerji uyarısı müşterinin ADINA göre
 * uyduruluyordu.
 */

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const screen = code(read('../mobile/app/(staff-flow)/kumanda.tsx'));
const visit = code(read('../mobile/src/lib/visitSource.ts'));
const file = code(read('../mobile/src/lib/fileSource.ts'));

test('bulunamayan randevu BAŞKA randevu açmıyor', () => {
    // `?? list[1]` canlıda yanlış müşterinin kartını açmak demekti: adisyon o
    // kişiye yazılır, formül o kişinin dosyasına düşerdi.
    assert.ok(!screen.includes('?? list[1]'), 'yedek randevu kalmamalı');
    assert.ok(!screen.includes('demoAgenda('), 'ekran sahte ajandayı çağırmamalı');
    assert.match(screen, /useVisit\(params\.id\)/);
    assert.match(visit, /const row = list\.find\(\(item\) => item\.id === id\);/);
    assert.match(visit, /row: row \? toVisit\(row\) : null/);
});

test('randevu yoksa BOŞ EKRAN değil, cümle çiziliyor', () => {
    // Eskiden `return null` vardı: kullanıcı uygulamanın donduğunu sanıyordu.
    assert.ok(!screen.includes('if (!appointment) return null;'));
    assert.match(screen, /Bu <Text[^>]*>randevu bulunamadı<\/Text>/);
    // Üç hâl AYRI: okunuyor · okunamadı · gerçekten yok.
    assert.match(screen, /visitState === 'error'/);
    assert.match(screen, /Randevuyu <Text[^>]*>okuyamadık<\/Text>/);
    assert.match(screen, /Randevu silinmiş anlamına gelmez/);
    assert.match(screen, /visitState === 'loading' \? null/);
});

test('alerji uyarısı ADA göre UYDURULMUYOR', () => {
    // Gerçek bir salonda adaşı olan birine olmayan bir alerji yazardı — ve
    // tersi daha kötü: alerjisi OLAN ama adı tutmayan müşteri hiç uyarı almaz.
    assert.ok(!screen.includes("who === 'Ayşe Yılmaz'"), 'ada göre risk kalmamalı');
    assert.ok(!screen.includes("who === 'Elif Demir'"));
    assert.match(screen, /const \{ risks, usedItems \} = useCustomerFile\(appointment\?\.customer_id \?\? undefined, undefined\)/);
});

test('risk kuralı İKİ ekranda da TEK kaynaktan', () => {
    // Müşteri sayfası tek maskede topluyor, kumanda satır satır gösteriyor —
    // ama ikisi de `riskList`ten okuyor.
    assert.match(file, /riskList\(data\.riskRules \?\? \[\], data\.customer\?\.custom_fields\)/);
    const map = code(read('../mobile/src/lib/customerFileMap.ts'));
    assert.match(map, /const active = riskList\(rules, fields\);/);
});

test('riskList kural motorunu masaüstüyle aynı uyguluyor', () => {
    const rules = [
        { key: 'alerji', label: 'Alerji', note: 'Kulak arkası testi şart.' },
        { key: 'hassas', label: 'Hassasiyet', note: null },
        { key: 'hamile', label: 'Hamilelik', note: 'Amonyak yok.' },
    ];
    assert.deepEqual(riskList(rules, null), []);
    assert.deepEqual(riskList(rules, { baska: true }), []);

    const lines = riskList(rules, { alerji: true, hassas: 1 });
    assert.equal(lines.length, 2);
    assert.deepEqual(lines[0], { kind: 'Alerji', text: 'Kulak arkası testi şart.' });
    // Notu olmayan kural etiketini tekrar ediyor: boş bir uyarı satırı,
    // uyarının kendisinden kötü.
    assert.deepEqual(lines[1], { kind: 'Hassasiyet', text: 'Hassasiyet' });

    // Maske aynı listeden doğuyor — ikisi ayrışamaz.
    const mask = riskMask(rules, { alerji: true, hamile: true });
    assert.equal(mask.sub, '2 kural');
    assert.equal(mask.label, 'Risk · Alerji · Hamilelik');
});

test('sahte kipte saat DONUYOR', () => {
    // `demoAgenda` saatleri "şimdi"ye göre üretiyor; her okumada yeniden
    // üretilirse randevu saatleri kayar ve sayaç yerinde saymaya başlar.
    assert.match(visit, /const \[anchor\] = useState\(\(\) => Date\.now\(\)\);/);
    assert.match(visit, /demoAgenda\(anchor, today\)/);
    // Canlıda böyle bir sorun yok: saatler sunucudan geliyor.
    assert.match(visit, /LIVE_AUTH\s*\n?\s*\? api\.agenda\(today\)/);
});

test('saat biçimi SINIRDA indirgeniyor', () => {
    // Postgres "13:00:00" gönderiyor, ekran "13:00" bekliyor —
    // `agendaSource.toRow` ile aynı indirgeme.
    assert.match(visit, /start_time: clockText\(row\.start_time\)/);
    assert.match(visit, /end_time: clockText\(row\.end_time\)/);
});

// ── Katalog ─────────────────────────────────────────────────────────────────

const catalogSrc = code(read('../mobile/src/lib/catalogSource.ts'));
const api = code(read('../supabase/functions/staff-api/index.ts'));

test('katalog TEK turda geliyor', () => {
    // Kumanda sık sık bodrum katında açılıyor; kötü sinyalde iki ayrı istek,
    // ikisinden birinin düşmesi demek.
    assert.match(catalogSrc, /api\.catalog\(\)/);
    assert.ok(!screen.includes('const CATALOG:'), 'ekranda sahte katalog kalmamalı');
    assert.ok(!screen.includes('const USAGE:'), 'ekranda sahte geçmiş kalmamalı');
    assert.match(screen, /useCatalog\(\)/);
    // Sunucu üçünü birlikte dönüyor.
    assert.match(api, /services: services \?\? \[\],/);
    assert.match(api, /products: products \?\? \[\],/);
    assert.match(api, /usage: \[\.\.\.tally\.values\(\)\],/);
});

test('ürün türü YAZMA yolunun beklediğiyle aynı eşleşiyor', async () => {
    const { lineKindOf, toCatalog } = await import('../mobile/src/lib/catalogMap.ts');
    // Veritabanı: 'consumable' (sarf) · 'retail' (satılan).
    assert.equal(lineKindOf('consumable'), 'material');
    assert.equal(lineKindOf('retail'), 'product');
    // Türü OKUNAMAYAN ürünü sarf saymak, onu sessizce depodan düşürüp
    // müşteriye hiç yazmamak olurdu. Varsayılan `retail` (075).
    assert.equal(lineKindOf(null), 'product');
    assert.equal(lineKindOf(undefined), 'product');

    const items = toCatalog({
        services: [{ id: 's1', name: 'Fön', price: 350 }],
        products: [
            { id: 'p1', name: 'Oksidan %6', kind: 'consumable', price: 90 },
            { id: 'p2', name: 'Şampuan', kind: 'retail', price: 320 },
        ],
    });
    assert.deepEqual(items[0], { id: 's1', name: 'Fön', kind: 'extra', price: 350 });
    // Malzemenin FİYATI YOK: depodan düşüyor, müşteriye yazılmıyor.
    assert.deepEqual(items[1], { id: 'p1', name: 'Oksidan %6', kind: 'material' });
    assert.deepEqual(items[2], { id: 'p2', name: 'Şampuan', kind: 'product', price: 320 });
    // Sunucu `extra` gelirse HİZMET kataloğunda, ötekiler için ÜRÜN
    // kataloğunda arıyor; eşleme ayrışırsa kalem "bulunamadı" diye reddedilir.
    assert.match(api, /if \(kind === 'extra'\) serviceIds\.push\(catalogId\);/);
});

test('adsız ya da sıfır sayılı kullanım satırı ELENİYOR', async () => {
    const { toUsage } = await import('../mobile/src/lib/catalogMap.ts');
    const rows = toUsage({
        usage: [
            { name: 'Boya', service: 'Saç boyama', staffId: 'x', dateISO: '2026-09-01', count: 3 },
            { name: '', service: 'Saç boyama', staffId: 'x', dateISO: '2026-09-01', count: 9 },
            { name: 'Fön', service: 'Kesim', staffId: null, dateISO: '2026-09-01', count: 0 },
        ],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Boya');
    assert.equal(rows[0].staffId, 'x');
});

test('"bu müşteride kullanıldı" işareti MÜŞTERİDEN geliyor', () => {
    // Sorunun cevabı salonun kataloğunda değil, o kişinin geçmişinde.
    // Sunucu `customer` ucunda `itemsUsed` olarak zaten gönderiyordu;
    // bugüne kadar hiç okunmuyordu.
    assert.match(api, /itemsUsed: Array\.isArray\(row\.adisyon_items\)/);
    assert.match(file, /Array\.isArray\(row\.itemsUsed\) \? row\.itemsUsed\.map\(String\) : \[\]/);
    assert.match(screen, /usedItems\.has\(item\.name\)\s*\n?\s*\? \{ \.\.\.item, usedHere: true \}/);
});

test('sıklık ızgarası KİŞİNİN kendi geçmişinden kuruluyor', () => {
    // Sabit `ME = 'merve'` canlıda hiçbir kullanım satırıyla eşleşmiyordu ve
    // ızgara sessizce salon moduna düşüyordu.
    assert.ok(!screen.includes("const ME = 'merve'"), 'sabit kimlik kalmamalı');
    assert.match(screen, /staffId: myStaffId \?\? ''/);
    const me = code(read('../mobile/src/lib/me.ts'));
    assert.match(me, /authApi\.resume\.get\(\)/);
    assert.match(me, /setId\(result\.data\.profile\.id\)/);
});

test('katalog okunamazsa BOŞ katalog gösterilmiyor', () => {
    // Boş bir katalog "salonda hiçbir şey yok" demek olurdu ve personel kalem
    // ekleyemediğini sanardı — oysa sorun listede değil, bağlantıda.
    assert.match(catalogSrc, /if \(visible\) setState\('error'\);/);
    const fail = catalogSrc.slice(catalogSrc.indexOf('.catch(() => {'), catalogSrc.length);
    assert.ok(!fail.includes('setItems('), 'hata eldeki kataloğu silmemeli');
});

// ── Adisyon satırı katalog kimliğini taşıyor ────────────────────────────────

test('satır ADI değil KİMLİĞİ taşıyor', async () => {
    const { addLine, linesFromItems, sendableOf } = await import('../mobile/src/lib/adisyon.ts');
    // Sunucu adı ve fiyatı KENDİ kataloğundan çözüyor; istemcinin
    // gönderdiğine güvenmek, elle atılan bir isteğin kasadaki toplamı
    // değiştirebilmesi demek.
    const lines = addLine([], { name: 'Fön', kind: 'extra', price: 350, catalogId: 'u1' }, 'n1');
    assert.equal(lines[0].catalogId, 'u1');

    // Aynı adı taşıyan İKİ AYRI katalog kalemi tek satırda birleşmemeli:
    // bir salonun iki tedarikçiden aynı boyası ayrı kalemler.
    const two = addLine(lines, { name: 'Fön', kind: 'extra', price: 350, catalogId: 'u2' }, 'n2');
    assert.equal(two.length, 2);
    // Aynı kimlik ise MİKTAR artıyor, ikinci satır açılmıyor.
    const merged = addLine(lines, { name: 'Fön', kind: 'extra', price: 350, catalogId: 'u1' }, 'n3');
    assert.equal(merged.length, 1);
    assert.equal(merged[0].qty, 2);
    void linesFromItems; void sendableOf;
});

test('sunucudan gelen adisyon satırlara çevriliyor', async () => {
    const { linesFromItems } = await import('../mobile/src/lib/adisyon.ts');
    const lines = linesFromItems([
        { id: 'a', name: 'Fön', kind: 'extra', price: 350, serviceId: 's1', qty: 2 },
        // Fiyat SUNUCUDAN geliyor ama malzemede taşınmamalı; alanı boş
        // bırakırsak kural hiç sınanmaz.
        { id: 'b', name: 'Oksidan', kind: 'material', price: 90, productId: 'p1', qty: 3 },
        { id: 'c', name: 'Şampuan', kind: 'product', price: 320, productId: 'p2' },
        { id: 'd', name: '', kind: 'product', productId: 'p3', qty: 1 },
        { id: 'e', name: 'Bilinmeyen', kind: 'baska', qty: 1 },
    ]);
    assert.equal(lines.length, 3);
    assert.equal(lines[0].catalogId, 's1');
    assert.equal(lines[0].qty, 2);
    // Malzemenin fiyatı taşınmıyor: depodan düşüyor, müşteriye yazılmıyor.
    assert.equal(lines[1].price, undefined);
    assert.equal(lines[1].catalogId, 'p1');
    // Miktarı olmayan satır BİR sayılıyor, sıfır değil.
    assert.equal(lines[2].qty, 1);
    assert.deepEqual(linesFromItems(null), []);
});

test('gönderilemeyen satır SESSİZCE ATILMIYOR', async () => {
    const { sendableOf } = await import('../mobile/src/lib/adisyon.ts');
    const out = sendableOf([
        { id: '1', catalogId: 's1', name: 'Fön', kind: 'extra', qty: 1 },
        { id: '2', catalogId: 'p1', name: 'Oksidan', kind: 'material', qty: 2 },
        // Kimliksiz eski satır: sunucu `invalid_catalog_item` ile TÜM isteği
        // reddederdi. Çağıran taraf kaç satırın gidemediğini ÖĞRENİYOR.
        { id: '3', name: 'Eski kalem', kind: 'product', qty: 1 },
        // Silinmek üzere işaretli satır da gitmiyor: pencere kapanmadan
        // gönderilen bir silme, geri almayı anlamsız kılardı.
        { id: '4', catalogId: 'p2', name: 'Silinen', kind: 'product', qty: 1, pendingDelete: true },
    ]);
    assert.equal(out.skipped, 1);
    assert.equal(out.items.length, 2);
    assert.deepEqual(out.items[0], { kind: 'extra', serviceId: 's1', qty: 1 });
    assert.deepEqual(out.items[1], { kind: 'material', productId: 'p1', qty: 2 });
});

test('kumanda SABİT dört kalemle açılmıyor', () => {
    assert.ok(!screen.includes('DEFAULT_LINES'), 'sabit adisyon kalmamalı');
    assert.match(screen, /setLines\(linesFromItems\(base\?\.adisyon_items\)\)/);
    // HER çağrı yeri kimlik taşımalı: biri unutulursa o kutudan eklenen
    // kalem sunucuya gidemez ve sessizce düşerdi.
    const calls = screen.match(/addLine\(current,[^)]*/g) ?? [];
    assert.ok(calls.length >= 3, 'kalem ekleme yolları sayılmalı');
    for (const call of calls) {
        assert.match(call, /\{ \.\.\.item, catalogId: item\.id \}/, `kimliksiz çağrı: ${call}`);
    }
});

// ── YAZMA ───────────────────────────────────────────────────────────────────

const writeSrc = code(read('../mobile/src/lib/visitWrite.ts'));

test('işleme başlamak SUNUCUYA yazıyor', () => {
    // Jest yalnız yerel damga koyuyordu: kumanda içinde "SÜRÜYOR" görünüyor
    // ama sunucuda `arrived_at` yok, Bugün kartı "GECİKTİ" demeye devam
    // ediyordu — ve geri çıkıp girince damga kayboluyordu.
    assert.match(screen, /void startVisit\(appointment\.id\)/);
    assert.match(writeSrc, /api\.visitStart\(reservationId\)/);
});

test('damga ÖNCE ekrana, sonra sunucuya — kalıcı ret geri alıyor', () => {
    // İş gerçekten başladı; sayacın ağ cevabını beklemesi için sebep yok.
    // Ama sunucu KALICI reddederse damga bir yalana dönüşüyor.
    assert.match(screen, /setStartedAt\(new Date\(\)\.toISOString\(\)\);[\s\S]{0,200}void startVisit/);
    assert.match(screen, /if \(!out\.code\) return;\s*setStartedAt\(null\);/);
    assert.match(screen, /<Band label=\{errorLine\(startCode\)\} note="başlatılmadı" \/>/);
});

test('gönderim İKİ yazma: önce kalemler, sonra kapanış', () => {
    // Tek uçta birleştirmek, kalemleri yazıp kapanışta takılan bir isteği
    // "hiç olmamış" gibi göstermek olurdu.
    const order = writeSrc.indexOf('api.visitItems') < writeSrc.indexOf('api.visitFinish');
    assert.ok(order, 'kalemler kapanıştan ÖNCE yazılmalı');
    // Kalemler kuyruktayken kapanış GÖNDERİLMİYOR: sunucuda BOŞ bir
    // adisyonun kapanması demek olurdu.
    assert.match(writeSrc, /if \(queued\) return \{ code: null, queued: true \};/);
});

test('YARIM adisyon gönderilmiyor', () => {
    // Kimliksiz satırı atıp gerisini göndermek, kasaya EKSİK hesap düşürmek
    // demek — müşteri az öder ve kimse fark etmez.
    assert.match(writeSrc, /if \(skipped > 0\) return \{ code: 'items_unsendable', queued: false \};/);
});

test('kuyruk kararı YAZMA katmanından, bağlantı bayrağından değil', () => {
    // Sinyal "var" görünürken de istek düşebiliyor ve o iş yine kuyruğa
    // giriyor; yalnız `offline`a bakmak onu "gönderildi" sayardı.
    assert.match(screen, /offline: offline \|\| out\.queued,/);
    assert.match(screen, /serverCode: out\.code,/);
    assert.ok(!screen.includes('mockCashResult'), 'sahte cevap üreteci kalmamalı');
});

test('gönderim tuttuysa ELDEKİ kopya tazeleniyor', () => {
    // Yoksa iyimser kilit eski damgayla çalışır ve kendi yazdığımıza
    // takılırdık.
    assert.match(screen, /if \(result\.state === 'sent'\) void reloadVisit\(\);/);
});
