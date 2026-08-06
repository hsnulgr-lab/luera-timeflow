import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { serviceProfitability, staffProductivity, lastDaysRange } from '../src/lib/profitability.ts';

// Hizmet brüt kârı + uzman verimliliği. Gider defteri İSTEMEYEN kârlılık dilimi:
// tahsilat (payments) ve reçete (serviceRecipe + products.cost) zaten var.

const RANGE = { from: '2026-08-01', to: '2026-08-31' };

const services = [
    { id: 's1', name: 'Cilt Bakımı', duration: 60, color: '#1', price: 1000, recipe: [{ productId: 'p1', quantity: 2 }] },
    { id: 's2', name: 'Lazer Epilasyon', duration: 30, color: '#2', price: 500 },
    { id: 's3', name: 'Kaş Alımı', duration: 15, color: '#3', price: 200 },
];
const products = [
    { id: 'p1', organizationId: 'o', name: 'Serum', price: 300, isActive: true, createdAt: '', cost: 120, unit: 'ml' },
];
const staff = [{ id: 'st1', name: 'Elif' }, { id: 'st2', name: 'Derya' }];

const res = (over) => ({
    id: 'r1', customerId: 'c1', customerName: 'Ayşe', customerPhone: '5321112233',
    date: '2026-08-10', startTime: '10:00', endTime: '11:00', service: 'Cilt Bakımı',
    serviceColor: '#1', status: 'completed', notes: '', createdAt: '', isPaid: true,
    reminder24hSent: false, reminder2hSent: false, source: 'manual', adisyonItems: [],
    customFields: {}, staffId: 'st1', ...over,
});
const pay = (over) => ({
    id: 'pay1', organizationId: 'o', type: 'service', amount: 1000, method: 'cash',
    paidAt: '2026-08-10T12:00:00Z', createdAt: '2026-08-10T12:00:00Z', ...over,
});

const ctx = (over) => ({ payments: [], reservations: [], services, products, staff, range: RANGE, ...over });

// ── Hizmet brüt kârı ────────────────────────────────────────────────────────

test('brüt kâr tahsil EDİLEN tutardan hesaplanır, liste fiyatından değil', () => {
    // 1000 liralık bakım 800'e yapıldıysa kâr da 800 üzerinden çıkmalı.
    const rows = serviceProfitability(ctx({
        reservations: [res({})],
        payments: [pay({ reservationId: 'r1', amount: 800 })],
    }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].revenue, 800);
    assert.equal(rows[0].cost, 240);          // 2 ml × 120
    assert.equal(rows[0].gross, 560);
    assert.equal(rows[0].margin, 70);
});

test('reçetesi olmayan hizmetin maliyeti sıfır, kârı ciroya eşit', () => {
    const rows = serviceProfitability(ctx({
        reservations: [res({ service: 'Lazer Epilasyon' })],
        payments: [pay({ reservationId: 'r1', amount: 500 })],
    }));
    assert.equal(rows[0].cost, 0);
    assert.equal(rows[0].gross, 500);
    assert.equal(rows[0].margin, 100);
});

test('çoklu hizmetli seansta tek tahsilat satır ücretleri oranında bölünür', () => {
    // Kasada TEK hesap: "Cilt Bakımı + Kaş Alımı" → 1200. Ağırlık 1000/200.
    const lines = JSON.stringify([
        { id: 's1', name: 'Cilt Bakımı', price: 1000, duration: 60 },
        { id: 's3', name: 'Kaş Alımı', price: 200, duration: 15 },
    ]);
    const rows = serviceProfitability(ctx({
        reservations: [res({ service: 'Cilt Bakımı + Kaş Alımı', customFields: { hizmetler: lines } })],
        payments: [pay({ reservationId: 'r1', amount: 1200 })],
    }));
    const bakim = rows.find((r) => r.name === 'Cilt Bakımı');
    const kas = rows.find((r) => r.name === 'Kaş Alımı');
    assert.equal(bakim.revenue, 1000);
    assert.equal(kas.revenue, 200);
    // Maliyet katalog reçetesinden gelir; kaşın reçetesi yok
    assert.equal(bakim.cost, 240);
    assert.equal(kas.cost, 0);
});

test('ücreti tanımsız satırlar eşit böler — kaybolan pay kalmaz', () => {
    const lines = JSON.stringify([
        { id: 'x1', name: 'A', price: 0, duration: 30 },
        { id: 'x2', name: 'B', price: 0, duration: 30 },
    ]);
    const rows = serviceProfitability(ctx({
        reservations: [res({ service: 'A + B', customFields: { hizmetler: lines } })],
        payments: [pay({ reservationId: 'r1', amount: 300 })],
    }));
    assert.equal(rows.reduce((s, r) => s + r.revenue, 0), 300);
    assert.equal(rows[0].revenue, 150);
});

test('parçalı ödemede ciro toplanır ama adet ve maliyet bir kez sayılır', () => {
    // Aynı seans iki taksitte tahsil edildi: 2 seans gibi görünmemeli, sarf da
    // iki kez düşülmemeli — yoksa hizmet olduğundan zararlı çıkar.
    const rows = serviceProfitability(ctx({
        reservations: [res({})],
        payments: [
            pay({ id: 'a', reservationId: 'r1', amount: 400 }),
            pay({ id: 'b', reservationId: 'r1', amount: 600, paidAt: '2026-08-12T09:00:00Z' }),
        ],
    }));
    assert.equal(rows[0].revenue, 1000);
    assert.equal(rows[0].count, 1);
    assert.equal(rows[0].cost, 240);
});

test('randevuya bağlı olmayan tahsilat hiçbir hizmete yazılmaz', () => {
    // Ürün satışı ya da serbest tahsilat. Uydurma bir hizmete yazmak raporu kirletir.
    const rows = serviceProfitability(ctx({
        reservations: [res({})],
        payments: [pay({ amount: 900, type: 'product' })],
    }));
    assert.equal(rows.length, 0);
});

test('dönem dışındaki tahsilat sayılmaz', () => {
    const rows = serviceProfitability(ctx({
        reservations: [res({})],
        payments: [pay({ reservationId: 'r1', paidAt: '2026-07-31T22:00:00Z' })],
    }));
    assert.equal(rows.length, 0);
});

test('miktar düzeltmesi tek hizmetli seansta maliyete yansır', () => {
    // Uzun saç gerçekten fazla malzeme yazar; reçetenin varsayılanını ezer.
    const rows = serviceProfitability(ctx({
        reservations: [res({ customFields: { kf_sarf: JSON.stringify({ p1: 5 }) } })],
        payments: [pay({ reservationId: 'r1', amount: 1000 })],
    }));
    assert.equal(rows[0].cost, 600);   // 5 × 120
});

test('liste ciroya göre azalan sıralanır', () => {
    const rows = serviceProfitability(ctx({
        reservations: [res({ id: 'r1' }), res({ id: 'r2', service: 'Lazer Epilasyon' })],
        payments: [
            pay({ id: 'a', reservationId: 'r1', amount: 300 }),
            pay({ id: 'b', reservationId: 'r2', amount: 900 }),
        ],
    }));
    assert.deepEqual(rows.map((r) => r.name), ['Lazer Epilasyon', 'Cilt Bakımı']);
});

// ── Uzman verimliliği ───────────────────────────────────────────────────────

test('verimlilik dolu saat başına ciro — çok çalışan otomatik önde değil', () => {
    // Elif 1 saatte 1000, Derya 4 saatte 2000 kazandırıyor. Ciroda Derya önde,
    // verimlilikte Elif. Rapor ikincisini söylemeli.
    const rows = staffProductivity(ctx({
        reservations: [
            res({ id: 'r1', staffId: 'st1', startTime: '10:00', endTime: '11:00' }),
            res({ id: 'r2', staffId: 'st2', startTime: '12:00', endTime: '16:00', service: 'Lazer Epilasyon' }),
        ],
        payments: [
            pay({ id: 'a', reservationId: 'r1', amount: 1000 }),
            pay({ id: 'b', reservationId: 'r2', amount: 2000 }),
        ],
    }));
    assert.equal(rows[0].name, 'Elif');
    assert.equal(rows[0].perHour, 1000);
    assert.equal(rows[1].name, 'Derya');
    assert.equal(rows[1].perHour, 500);
    assert.equal(rows[1].revenue, 2000);
});

test('randevusuz satış yapan uzman görünmez kalmaz', () => {
    const rows = staffProductivity(ctx({
        reservations: [res({ id: 'r1', staffId: 'st1' })],
        payments: [
            pay({ id: 'a', reservationId: 'r1', amount: 1000 }),
            pay({ id: 'b', staffId: 'st1', amount: 500, type: 'product' }),
        ],
    }));
    assert.equal(rows[0].revenue, 1500);
});

test('iptal edilen randevu dolu saat saymaz', () => {
    const rows = staffProductivity(ctx({
        reservations: [
            res({ id: 'r1', staffId: 'st1', startTime: '10:00', endTime: '11:00' }),
            res({ id: 'r2', staffId: 'st1', startTime: '12:00', endTime: '15:00', status: 'cancelled' }),
        ],
        payments: [pay({ reservationId: 'r1', amount: 1000 })],
    }));
    assert.equal(rows[0].minutes, 60);
    assert.equal(rows[0].perHour, 1000);
});

test('saat okunamazsa hizmet süresine düşülür', () => {
    const rows = staffProductivity(ctx({
        reservations: [res({ id: 'r1', staffId: 'st1', startTime: '', endTime: '' })],
        payments: [pay({ reservationId: 'r1', amount: 1000 })],
    }));
    assert.equal(rows[0].minutes, 60);   // Cilt Bakımı kataloğu
});

test('hiç kaydı olmayan personel listede yer kaplamaz', () => {
    const rows = staffProductivity(ctx({
        reservations: [res({ id: 'r1', staffId: 'st1' })],
        payments: [pay({ reservationId: 'r1', amount: 1000 })],
    }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Elif');
});

test('personelsiz randevu kimseye yazılmaz, çökmez', () => {
    const rows = staffProductivity(ctx({
        reservations: [res({ id: 'r1', staffId: undefined })],
        payments: [pay({ reservationId: 'r1', amount: 1000 })],
    }));
    assert.equal(rows.length, 0);
});

test('boş veride her iki rapor da boş döner', () => {
    assert.deepEqual(serviceProfitability(ctx({})), []);
    assert.deepEqual(staffProductivity(ctx({})), []);
});

// ── Aralık ──────────────────────────────────────────────────────────────────

test('son N gün bugünü içerir', () => {
    const r = lastDaysRange(30, new Date('2026-08-07T10:00:00Z'));
    assert.equal(r.to, '2026-08-07');
    assert.equal(r.from, '2026-07-09');
});

// ── Sözleşme ────────────────────────────────────────────────────────────────

const src = readFileSync(new URL('../src/lib/profitability.ts', import.meta.url), 'utf8');

test('rapor BRÜT kâr olduğunu saklamıyor — gider defteri yok', () => {
    // Kira/maaş dahil net kâr ayrı bir iş; "kâr" demek yanıltıcı olurdu.
    assert.match(src, /yalnız\s*\n?\/\/ BRÜT kâr/);
    assert.doesNotMatch(src, /from '\.\/expenses/);
});
