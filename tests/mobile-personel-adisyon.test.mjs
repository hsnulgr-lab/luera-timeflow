import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    DELETE_MS, KIND_ORDER, QTY_MAX, QTY_MIN, addLine, addResult, commitDelete,
    deleteNotice, groupsOf, liveLines, markDelete, secondsLeft, setQty,
    stepQty, stripOf, totalOf, undoDelete,
} from '../mobile/src/lib/adisyon.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const row = code(read('../mobile/src/components/AdisyonRow.tsx'));
const screen = code(read('../mobile/app/(staff-flow)/kumanda.tsx'));

const BOYA = { name: 'Boya · 7.3 kumral', kind: 'material' };
const SAMP = { name: 'Şampuan 300 ml', kind: 'product', price: 320 };

// ── Miktar · ikinci dokunuş ─────────────────────────────────────────────────

test('aynı kalemin ikinci dokunuşu ×2 yapıyor, ikinci satır AÇMIYOR', () => {
    // Aynı kalemin iki ayrı satırı altı ay sonra okuyan kişiye hata gibi
    // görünür; ayrıca boyada miktar ölçünün kendisi.
    let lines = addLine([], BOYA, 'a');
    assert.equal(lines.length, 1);
    lines = addLine(lines, BOYA, 'b');
    assert.equal(lines.length, 1, 'ikinci satır açılmış');
    assert.equal(lines[0].qty, 2);
});

test('farklı kalem kendi satırını açıyor', () => {
    const lines = addLine(addLine([], BOYA, 'a'), SAMP, 'b');
    assert.equal(lines.length, 2);
});

test('silinmek üzere olan satır eşleşme sayılmıyor', () => {
    // Personel kaldırıp aynısını yeniden eklediyse niyeti geri getirmek değil.
    const lines = addLine(markDelete(addLine([], BOYA, 'a'), 'a'), BOYA, 'b');
    assert.equal(lines.length, 2);
});

test('onay ikinci dokunuşu SÖYLÜYOR', () => {
    // Yoksa personel dokunuşun işlediğini bilemez: kutu sönüp gidiyor.
    assert.deepEqual(addResult([], BOYA), { merged: false, qty: 1 });
    assert.deepEqual(addResult(addLine([], BOYA, 'a'), BOYA), { merged: true, qty: 2 });
    assert.match(screen, /×\$\{result\.qty\} oldu/);
});

test('miktar tabanı 1 — altı silme demek ve silmenin kendi kontrolü var', () => {
    assert.equal(stepQty(QTY_MIN, -1), null);
    assert.equal(stepQty(QTY_MAX, 1), null);
    assert.equal(stepQty(2, -1), 1);
    assert.equal(setQty([{ id: 'a', name: 'x', kind: 'extra', qty: 3 }], 'a', 99)[0].qty, QTY_MAX);
});

test('toplam MİKTARI çarpıyor', () => {
    // `qty` her zaman 1 olduğu sürece fark etmiyordu; ×2 gelince etti.
    assert.equal(totalOf([{ id: 'a', name: 'x', kind: 'product', price: 320, qty: 2 }]), 640);
    // Malzemenin fiyatı yok: toplama girmiyor.
    assert.equal(totalOf([{ id: 'b', name: 'y', kind: 'material', qty: 3 }]), 0);
});

// ── Silme · geri alınabilir ─────────────────────────────────────────────────

test('silinen satır YERİNDE kalıyor — liste zıplamıyor', () => {
    const start = [
        { id: 'a', name: 'a', kind: 'extra', qty: 1 },
        { id: 'b', name: 'b', kind: 'extra', qty: 1 },
        { id: 'c', name: 'c', kind: 'extra', qty: 1 },
    ];
    const marked = markDelete(start, 'b');
    assert.equal(marked.length, 3, 'satır listeden çıkarılmış');
    assert.equal(marked[1].pendingDelete, true);
    // Geri alınan satır AYNI yere dönüyor.
    assert.deepEqual(undoDelete(marked, 'b')[1], start[1]);
    // Pencere kapanınca gerçekten gidiyor.
    assert.deepEqual(commitDelete(marked, 'b').map((l) => l.id), ['a', 'c']);
});

test('pencere açıkken liste GÖNDERİLMİYOR', () => {
    // Geri alma bir sunucu ucu istemiyor: o altı saniyede istek hiç gitmedi.
    const marked = markDelete([{ id: 'a', name: 'a', kind: 'extra', qty: 1 }], 'a');
    assert.equal(liveLines(marked).length, 0);
    assert.equal(DELETE_MS, 6000, 'Personel 11 ile aynı pencere');
});

test('malzeme silinince formülün değiştiği SÖYLENİYOR', () => {
    // Formül malzeme yarısını adisyondan türetiyor: kayıt bozulmuyor, yeniden
    // türüyor. Ama yazılmış bir formül sessizce değişemez.
    assert.equal(deleteNotice({ kind: 'material' }, true).warn, true);
    assert.match(deleteNotice({ kind: 'material' }, true).text, /Formülün malzeme satırı/);
    // Formül yazılmamışsa söylenecek bir şey yok.
    assert.equal(deleteNotice({ kind: 'material' }, false).warn, false);
    assert.equal(deleteNotice({ kind: 'product' }, true).warn, false);
});

test('fitil dursa da SANİYE sayıyor', () => {
    // reduceMotion hareketi durduruyor, bilgiyi değil.
    assert.equal(secondsLeft(1000, 1000), 6);
    assert.equal(secondsLeft(1000, 4000), 3);
    assert.equal(secondsLeft(1000, 9000), 0);
    assert.match(row, /setLeft\(secondsLeft/);
    assert.match(row, /reduceMotion \? null : \(/, 'fitil reduceMotion ile duruyor');
});

// ── Sıfır ve gruplar ────────────────────────────────────────────────────────

test('sıfırın kendi cümlesi var, maskesi YOK', () => {
    const empty = stripOf([], null);
    assert.equal(empty.head, 'Adisyon · boş');
    assert.equal(empty.tail, 'ilk kalem eklenmedi');
    // Sıfır lirayı üç noktayla saklamak sahte bir gizlilik.
    assert.equal(empty.money, false);
    const full = stripOf([{ id: 'a', name: 'Fön', kind: 'extra', price: 350, qty: 1 }], 'Fön');
    assert.equal(full.head, 'Adisyon · 1 kalem');
    assert.equal(full.money, true);
});

test('tür sırası SABİT ve boş grup çizilmiyor', () => {
    assert.deepEqual([...KIND_ORDER], ['extra', 'product', 'material']);
    const groups = groupsOf([
        { id: 'a', name: 'Boya', kind: 'material', qty: 1 },
        { id: 'b', name: 'Fön', kind: 'extra', price: 350, qty: 1 },
    ]);
    assert.deepEqual(groups.map((g) => g.kind), ['extra', 'material'], 'sıra veriye göre değişmiş');
});

// ── Kabuk ve kilit ──────────────────────────────────────────────────────────

test('satır TEK bileşen, iki kabuk', () => {
    // Alt sayfa ve tam sayfa aynı satırı çiziyor; iki uygulama ayrışırdı.
    assert.match(row, /export function AdisyonRow/);
    assert.ok(!screen.includes('function LineRow'), 'eski satır kopyası duruyor');
});

test('kilitliyken düzenleme kontrolleri ÇİZİLMİYOR — kısık değil, yok', () => {
    assert.match(row, /open && !locked \? \(/);
    assert.match(row, /locked \? \(/);
    assert.ok(!row.includes('disabled={locked}'), 'kısık kontrol ölü kontroldür');
});

test('aynı anda YALNIZ BİR satır açık', () => {
    assert.match(screen, /setOpenRow\(\(current\) => \(current === line\.id \? null : line\.id\)\)/);
});

test('kaydırarak silme YOK — gesture-handler kurulu değil', () => {
    for (const [name, src] of [['AdisyonRow', row], ['kumanda', screen]]) {
        assert.ok(!src.includes('gesture-handler'), name);
        assert.ok(!/Swipeable/.test(src), `${name}: kaydırmalı satır girmiş`);
    }
});

test('yükseklik animasyonlanmıyor — fitil ÖLÇEK', () => {
    assert.ok(!/animate.*height|height:\s*fuse/i.test(row), 'yükseklik animasyonu');
    assert.match(row, /transform: \[\{ scaleX: fuse \}\]/);
    assert.match(row, /useNativeDriver: true/);
});

// ── B · Katalog ve arama ────────────────────────────────────────────────────

import {
    catalogMatch, emphasise, freeItem, searchCatalog, searchState, splitCode,
} from '../mobile/src/lib/adisyon.ts';

const search = code(read('../mobile/src/components/CatalogSearch.tsx'));

const CAT = [
    { id: '1', name: 'Boya · 7.3 kumral', kind: 'material', usedHere: true },
    { id: '2', name: 'Boya · 7.31 küllü kumral', kind: 'material' },
    { id: '3', name: 'Boya · 8.3 açık kumral', kind: 'material' },
    { id: '4', name: 'Şampuan 300 ml', kind: 'product', price: 320 },
];

test('arama alanı artık GERÇEK bir alan', () => {
    // Eskiden `Text` içeren bir `View`di: giriş alanı gibi çizilmiş,
    // dokunulunca hiçbir şey yapmayan bir yüzey. Ölü düğmeden kötü.
    assert.match(search, /<TextInput/);
    assert.match(search, /autoFocus/);
    assert.match(screen, /onSearch\(\)/, 'kutu arama yüzünü açmıyor');
});

test('eşleşme BULANIK DEĞİL — 7.3 yazınca 8.3 gelmiyor', () => {
    // Bulanık eşleşme tam olarak yanlış şeyi yapardı: yakın kodları bir araya
    // getirip aralarından seçtirmek, korunmaya çalışılan hatanın kendisi.
    const hits = searchCatalog(CAT, '7.3').map((i) => i.id);
    assert.deepEqual(hits, ['1', '2']);
    assert.equal(catalogMatch(CAT[2], '7.3'), false, '8.3 sızmış');
});

test('kod adın önüne alınıyor — yakın kodlar sütun oluyor', () => {
    // Ortadaki "·" DURUYOR: ürün ailesini tondan ayıran gerçek bir ayraç.
    // "Boya · küllü kumral", "Boya küllü kumral"dan daha okunur.
    assert.deepEqual(splitCode('Boya · 7.31 küllü kumral'), { code: '7.31', rest: 'Boya · küllü kumral' });
    // Sayı bulunamayan adlarda sütun yok: satır adla başlıyor.
    assert.equal(splitCode('Saç bakım yağı').code, null);
});

test('vurgu TERS — eşleşen sönük, AYIRAN hane koyu', () => {
    // Eşleşen kısım ortak olan, yani bilgi taşımayan kısım. Ekranda en parlak
    // şey satırları birbirinden ayıran şey oluyor.
    assert.deepEqual(emphasise('7.31', '7.3'), [{ dim: '7.3', bold: '1' }]);
    assert.deepEqual(emphasise('7.3', ''), [{ dim: '', bold: '7.3' }]);
});

test('katalogda yoksa ölü uç yok: kalem yazılabiliyor', () => {
    assert.equal(searchState([], 'zzz'), 'none');
    assert.equal(searchState(CAT, ''), 'idle');
    // Fiyatsız gidiyor; tutarını kasada müdür yazıyor.
    assert.equal(freeItem('Yeni ürün').price, undefined);
    assert.match(search, /Tutarı kasada yazılır/);
    // Türü personel seçiyor: malzeme olup olmadığı formülü doğrudan
    // ilgilendiriyor, o yüzden varsayılana bırakılmıyor.
    assert.match(search, /KIND_ORDER\.map/);
    assert.match(search, /height: 68/);
});

test('« bu müşteride » işareti TARİHSİZ ve SAYISIZ', () => {
    // Kararı veren tek işaret bu — ama ekran müşterinin gözü önünde ve ona
    // kendi defterini okutmuyoruz.
    assert.match(search, /bu müşteride/);
    assert.ok(!/usedHere.*\d+ kez|son kullan/i.test(search), 'sayı ya da tarih girmiş');
});

test('klavye adımında ALTINDA kalan kontrol yok', () => {
    // Klavye gövdenin üstüne değil YERİNE geliyor: kutular ve "Bitti" bu
    // adımda çizilmiyor.
    assert.ok(!search.includes('SheetFoot'), 'klavyenin altında düğme var');
    assert.match(search, /keyboardShouldPersistTaps="handled"/);
});

// ── C · Sıralama ve hâller ──────────────────────────────────────────────────

import { FREQUENT_COUNT, frequentFor, usageAsOf } from '../mobile/src/lib/adisyon.ts';

const CAT2 = [
    { id: '1', name: 'Boya', kind: 'material' },
    { id: '2', name: 'Oksidan', kind: 'material' },
    { id: '3', name: 'Oje', kind: 'material' },
];
const U = (name, service, staffId, dateISO, count) => ({ name, service, staffId, dateISO, count });

test('sıralama HİZMETE bağlı, müşteriye değil', () => {
    // Müşteriye göre sıralama reddedildi: müşteri her randevuda değişir, liste
    // her açılışta karışır, ezber ölür. Müşteri bilgisi işarete gidiyor.
    const usage = [
        U('Oje', 'Manikür', 'merve', '2026-09-01', 20),
        U('Boya', 'Saç boyama', 'merve', '2026-09-01', 5),
    ];
    assert.deepEqual(
        frequentFor(CAT2, usage, { service: 'Saç boyama', staffId: 'merve' }).items.map((i) => i.name),
        ['Boya'],
    );
    assert.deepEqual(
        frequentFor(CAT2, usage, { service: 'Manikür', staffId: 'merve' }).items.map((i) => i.name),
        ['Oje'],
    );
});

test('liste GÜN İÇİNDE DONUK — bir tuhaf ziyaret kutuları oynatmıyor', () => {
    const usage = [
        U('Boya', 'Saç boyama', 'merve', '2026-09-01', 10),
        U('Oje', 'Saç boyama', 'merve', '2026-09-09', 99),
    ];
    assert.deepEqual(usageAsOf(usage, '2026-09-09').map((r) => r.name), ['Boya']);
});

test('kutu sayısı SABİT — yedincisi gelirse biri çıkıyor, ızgara büyümüyor', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `x${i}`, name: `K${i}`, kind: 'extra' }));
    const usage = many.map((m, i) => U(m.name, 'S', 'merve', '2026-09-01', 20 - i));
    assert.equal(frequentFor(many, usage, { service: 'S', staffId: 'merve' }).items.length, FREQUENT_COUNT);
    assert.equal(FREQUENT_COUNT, 6);
});

test('verisi olmayan personel: kaynak SALON, etiket bunu söylüyor', () => {
    // Kutu sayısı, ölçüsü ve yeri değişmiyor — yalnız hangi veriden geldiği
    // okunuyor.
    const out = frequentFor(CAT2, [U('Boya', 'Saç boyama', null, '2026-09-01', 4)], {
        service: 'Saç boyama', staffId: 'yeni',
    });
    assert.equal(out.source, 'salon');
    assert.match(out.label, /^salonda · /);
    assert.equal(out.items.length, 1);
});

test('salonun da geçmişi yoksa ızgara ÇİZİLMİYOR — altı boş kutu ölü kontrol', () => {
    const out = frequentFor(CAT2, [], { service: 'Saç boyama', staffId: 'merve' });
    assert.equal(out.source, 'none');
    assert.deepEqual(out.items, []);
    assert.match(screen, /frequent\.source === 'none' \? \(/);
    assert.match(screen, /Sık kullanılanlar henüz yok/);
});

test('boş adisyonun kendi cümlesi var — boş satır iskeleti yok', () => {
    assert.match(screen, /Bu ziyarette henüz kalem yok/);
});
