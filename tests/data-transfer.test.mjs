import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { toCsv, parseCsv, detectDelimiter, CSV_DELIMITER } from '../src/lib/csv.ts';
import {
    autoMapHeaders, prepareImport, parseNumberTr, existingKeySet,
    importSpec, exportColumns, exportFileName, EXPORT_DATASETS,
} from '../src/lib/dataTransfer.ts';

// Veri taşıma (Faz 2.6 / 2.6b). Bu dosyadaki her test, salonun elindeki gerçek
// Excel dosyasının nasıl göründüğüne dayanır: Türkçe başlık, noktalı virgül,
// "0532 ..." biçimli telefon, "1.250,00" biçimli tutar.

// ── CSV yazımı ──────────────────────────────────────────────────────────────

test('Excel Türkçe yerelinde tek sütuna yapışmasın diye noktalı virgülle yazılır', () => {
    assert.equal(CSV_DELIMITER, ';');
    const csv = toCsv([{ a: 'x', b: 'y' }], [
        { header: 'A', value: (r) => r.a },
        { header: 'B', value: (r) => r.b },
    ]);
    assert.equal(csv, 'A;B\r\nx;y');
});

test('ayraç, tırnak ve satır sonu içeren hücre tırnaklanır', () => {
    const csv = toCsv([{ v: 'Ali;Veli' }, { v: 'de"mek' }, { v: 'iki\nsatır' }],
        [{ header: 'V', value: (r) => r.v }]);
    assert.match(csv, /"Ali;Veli"/);
    assert.match(csv, /"de""mek"/);
    assert.match(csv, /"iki\nsatır"/);
});

test('formül enjeksiyonu etkisizleştirilir', () => {
    // Müşteri adına =HYPERLINK(...) yazan biri, dosyayı açan kişide kod
    // çalıştırabilirdi. Değer korunur, formül olarak yorumlanmaz.
    const csv = toCsv([{ n: '=HYPERLINK("http://kotu","tikla")' }, { n: '+1' }, { n: '@x' }, { n: '-5' }],
        [{ header: 'Ad', value: (r) => r.n }]);
    for (const line of csv.split('\r\n').slice(1)) {
        assert.ok(line.startsWith("'") || line.startsWith('"\''), line);
    }
    // Normal değer tırnak kazanmaz
    assert.match(toCsv([{ n: 'Ayşe' }], [{ header: 'Ad', value: (r) => r.n }]), /\nAyşe$/);
});

test('boş değer boş hücre olur, sıfır kaybolmaz', () => {
    const csv = toCsv([{ a: null, b: 0, c: undefined }], [
        { header: 'A', value: (r) => r.a },
        { header: 'B', value: (r) => r.b },
        { header: 'C', value: (r) => r.c },
    ]);
    assert.equal(csv.split('\r\n')[1], ';0;');
});

// ── CSV okuma ───────────────────────────────────────────────────────────────

test('ayraç dosyadan tespit edilir — başka programdan gelen dosya virgüllü olabilir', () => {
    assert.equal(detectDelimiter('ad,telefon,mail\nx,y,z'), ',');
    assert.equal(detectDelimiter('ad;telefon;mail'), ';');
    assert.equal(detectDelimiter('ad\ttelefon'), '\t');
    // Tek sütunlu dosyada varsayılana düş
    assert.equal(detectDelimiter('ad\nAyşe'), ';');
});

test('BOM atılır — yoksa ilk başlık eşleşmez', () => {
    const { headers } = parseCsv('﻿Ad Soyad;Telefon\nAyşe;0532');
    assert.deepEqual(headers, ['Ad Soyad', 'Telefon']);
});

test('tırnaklı alan, kaçışlı tırnak ve alan içi satır sonu okunur', () => {
    const { rows } = parseCsv('a;b\n"Ali;Veli";"de""mek"\n"iki\nsatır";x');
    assert.deepEqual(rows[0], ['Ali;Veli', 'de"mek']);
    assert.deepEqual(rows[1], ['iki\nsatır', 'x']);
});

test('eksik hücreli satır başlık uzunluğuna tamamlanır, boş satır atılır', () => {
    const { rows } = parseCsv('a;b;c\n1;2\n\n\n4;5;6');
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], ['1', '2', '']);
});

test('yazılan dosya geri okunabilir', () => {
    const source = [{ ad: 'Ayşe Yılmaz', not: 'Cilt;kuru\nikinci satır' }];
    const csv = toCsv(source, [
        { header: 'Ad', value: (r) => r.ad },
        { header: 'Not', value: (r) => r.not },
    ]);
    const { headers, rows } = parseCsv(csv);
    assert.deepEqual(headers, ['Ad', 'Not']);
    assert.deepEqual(rows[0], ['Ayşe Yılmaz', 'Cilt;kuru\nikinci satır']);
});

// ── Sütun eşleme ────────────────────────────────────────────────────────────

test('Türkçe başlıklar otomatik tanınır — büyük I/İ tuzağı dahil', () => {
    const spec = importSpec('customers');
    const m = autoMapHeaders(['AD SOYAD', 'GSM', 'E-Posta', 'Açıklama'], spec);
    assert.equal(m.name, 0);
    assert.equal(m.phone, 1);
    assert.equal(m.email, 2);
    assert.equal(m.notes, 3);
});

test('tam eşleşme yoksa içerme ile bulunur', () => {
    const m = autoMapHeaders(['Müşteri Adı Soyadı', 'Cep Telefonu No'], importSpec('customers'));
    assert.equal(m.name, 0);
    assert.equal(m.phone, 1);
});

test('tanınmayan sütun null kalır — kullanıcı elle eşler', () => {
    const m = autoMapHeaders(['kolon1', 'kolon2'], importSpec('customers'));
    assert.equal(m.name, null);
    assert.equal(m.phone, null);
});

test('bir sütun iki alana birden atanmaz', () => {
    // "Ad" hem name hem (ürün spec'inde) başka alanların takma adı; aynı indeks
    // iki kez kullanılırsa aynı veri iki alana yazılır.
    const m = autoMapHeaders(['Ad', 'Telefon'], importSpec('customers'));
    const used = Object.values(m).filter((v) => v !== null);
    assert.equal(new Set(used).size, used.length);
});

// ── Sayı biçimi ─────────────────────────────────────────────────────────────

test('Türkçe ve İngiliz sayı biçimi birlikte anlaşılır', () => {
    assert.equal(parseNumberTr('1.250,50'), 1250.5);
    assert.equal(parseNumberTr('1,250.50'), 1250.5);
    // Tek ayraç belirsiz: 3 hane izliyorsa bindir, değilse ondalık.
    assert.equal(parseNumberTr('₺1.200'), 1200);
    assert.equal(parseNumberTr('1,250'), 1250);
    assert.equal(parseNumberTr('1.234.567'), 1234567);
    assert.equal(parseNumberTr('1,25'), 1.25);
    assert.equal(parseNumberTr('1.5'), 1.5);
    assert.equal(parseNumberTr('60'), 60);
    assert.equal(parseNumberTr('0'), 0);
    assert.equal(parseNumberTr(''), null);
    assert.equal(parseNumberTr('abc'), null);
});

// ── İçe aktarma doğrulaması ─────────────────────────────────────────────────

const customerSpec = importSpec('customers');
const customerMap = { name: 0, phone: 1, email: 2, notes: 3 };

test('telefon normalize edilir — 0 ile, +90 ile, boşluklu hepsi aynı kayıt', () => {
    const { rows } = prepareImport([
        ['Ayşe', '0532 111 22 33', '', ''],
        ['Fatma', '+90 533 111 22 33', '', ''],
        ['Zeynep', '5341112233', '', ''],
    ], customerSpec, customerMap, new Set());
    assert.deepEqual(rows.map((r) => r.values.phone),
        ['905321112233', '905331112233', '905341112233']);
    assert.ok(rows.every((r) => r.status === 'new'));
});

test('okunamayan telefon ve boş ad hatalı işaretlenir, içe aktarılmaz', () => {
    const { rows, counts } = prepareImport([
        ['Ayşe', '123', '', ''],
        ['', '0532 111 22 33', '', ''],
    ], customerSpec, customerMap, new Set());
    assert.equal(counts.invalid, 2);
    assert.equal(counts.new, 0);
    assert.match(rows[0].problem, /Telefon okunamadı/);
    assert.match(rows[1].problem, /boş/);
});

test('mevcut kayıtla mükerrer olan satır eklenmez', () => {
    const existing = existingKeySet(['0532 111 22 33'], 'phone');
    const { rows, counts } = prepareImport([['Ayşe', '905321112233', '', '']],
        customerSpec, customerMap, existing);
    assert.equal(rows[0].status, 'duplicate');
    assert.equal(counts.new, 0);
});

test('dosyanın kendi içindeki tekrar da yakalanır', () => {
    // Salonun listesinde aynı müşterinin iki kez olması olağan; ilki alınır.
    const { counts } = prepareImport([
        ['Ayşe', '0532 111 22 33', '', ''],
        ['Ayşe Y.', '532 111 22 33', '', ''],
    ], customerSpec, customerMap, new Set());
    assert.equal(counts.new, 1);
    assert.equal(counts.duplicate, 1);
});

test('satır numarası dosyadaki numaradır (başlık = 1)', () => {
    const { rows } = prepareImport([['Ayşe', '0532 111 22 33', '', '']],
        customerSpec, customerMap, new Set());
    assert.equal(rows[0].line, 2);
});

test('eşlenmemiş isteğe bağlı sütun sorun değil', () => {
    const { counts } = prepareImport([['Ayşe', '0532 111 22 33', '', '']],
        customerSpec, { name: 0, phone: 1, email: null, notes: null }, new Set());
    assert.equal(counts.new, 1);
});

test('hizmet adı mükerreri Türkçe duyarlı karşılaştırılır', () => {
    const spec = importSpec('services');
    const existing = existingKeySet(['Bölgesel İncelme'], 'name');
    const { rows } = prepareImport([['BÖLGESEL INCELME', '60', '', '']],
        spec, { name: 0, duration: 1, price: 2, recallDays: 3 }, existing);
    assert.equal(rows[0].status, 'duplicate');
});

// ── Dışa aktarma sütunları ──────────────────────────────────────────────────

const ctx = { customerName: (id) => (id === 'c1' ? 'Ayşe Yılmaz' : ''), staffName: () => 'Elif' };

test('dışa aktarmada uuid değil isim yazılır', () => {
    const cols = exportColumns('payments', ctx);
    const row = { customer_id: 'c1', amount: '1200.00', method: 'card', paid_at: '2026-08-06T14:30:00Z' };
    const csv = toCsv([row], cols);
    assert.match(csv, /Ayşe Yılmaz/);
    assert.doesNotMatch(csv, /c1/);
    // Yöntem Türkçeye çevrilir; muhasebeciye "card" gitmemeli
    assert.match(csv, /Kart/);
});

test('her veri kümesinin sütun tanımı var ve boş değil', () => {
    for (const d of EXPORT_DATASETS) {
        const cols = exportColumns(d.id, ctx);
        assert.ok(cols.length > 0, d.id);
        // Başlıklar benzersiz olmalı — Excel'de aynı adlı iki sütun karıştırır
        assert.equal(new Set(cols.map((c) => c.header)).size, cols.length, d.id);
    }
});

test('sektöre özel alanlar müşteri dosyasında kaybolmaz', () => {
    const csv = toCsv([{ name: 'Ayşe', custom_fields: { hamilelik: true, alerji: 'lateks' } }],
        exportColumns('customers', ctx));
    assert.match(csv, /hamilelik=evet/);
    assert.match(csv, /alerji=lateks/);
});

test('dosya adı tarihli', () => {
    const d = EXPORT_DATASETS.find((x) => x.id === 'customers');
    assert.equal(exportFileName(d, '2026-08-06'), 'musteriler-2026-08-06.csv');
});

// ── Sözleşme: kodda durması gereken davranışlar ─────────────────────────────

const hook = readFileSync(new URL('../src/hooks/useDataTransfer.ts', import.meta.url), 'utf8');
const tab = readFileSync(new URL('../src/components/settings/DataTab.tsx', import.meta.url), 'utf8');

test('dışa aktarma sayfalanır — 1000 satırda sessizce kesilmez', () => {
    // Kesilen dosyayı kullanıcı tam sanar; dışa aktarmada bu hatanın en kötü biçimi.
    assert.match(hook, /\.range\(page \* PAGE, page \* PAGE \+ PAGE - 1\)/);
    assert.match(hook, /if \(rows\.length < PAGE\) return all/);
});

test('dışa aktarma org sınırında kalır', () => {
    assert.match(hook, /\.eq\('organization_id', orgId\)/);
});

test('içe aktarma yalnız yeni satırı yazar, üstüne yazmaz', () => {
    assert.match(hook, /rows\.filter\(\(r\) => r\.status === 'new'\)/);
    assert.doesNotMatch(hook, /\.upsert\(/);
    assert.match(tab, /Mevcut kayıtların üzerine yazılmaz/);
});

test('parça düşerse satır satır denenir — 800 müşteri tek hatalı satır yüzünden kaybolmaz', () => {
    assert.match(hook, /for \(const one of chunk\)/);
});
