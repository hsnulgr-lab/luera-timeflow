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
    assert.match(visit, /return row \? toVisit\(row\) : null;/);
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
