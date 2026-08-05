import test from 'node:test';
import assert from 'node:assert/strict';
import {
    IDLE_DAYS, STATUS_RANK, consumptionCost, fillPercent, isIdle, lastMovementAt,
    marginOf, monthBounds, quantityMap, quantityOf, statusOf, stockTotals, valueOf,
} from '../src/lib/stock.ts';

// Stok türetimi — miktar saklanmaz, hareketlerden hesaplanır (074).

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

const product = (over = {}) => ({
    id: 'p1', organizationId: 'o', name: 'Boya 7.1', price: 0, isActive: true,
    createdAt: daysAgo(200), kind: 'consumable', unit: 'ml', cost: 0.42,
    threshold: 300, parLevel: 1200, tracksStock: true, ...over,
});

const move = (over = {}) => ({
    id: `m${Math.random()}`, organizationId: 'o', productId: 'p1', type: 'in',
    delta: 100, createdAt: daysAgo(1), ...over,
});

test('miktar hareketlerin toplamıdır', () => {
    const moves = [move({ delta: 600 }), move({ delta: -90, type: 'usage' }), move({ delta: -120, type: 'usage' })];
    assert.equal(quantityOf('p1', moves), 390);
    assert.deepEqual(quantityMap(moves), { p1: 390 });
});

test('hareketi olmayan ürünün miktarı sıfırdır', () => {
    assert.equal(quantityOf('yok', [move()]), 0);
});

test('durum eşiğe göre belirlenir', () => {
    const p = product();
    assert.equal(statusOf(p, 900), 'ok');
    assert.equal(statusOf(p, 300), 'low');   // eşiğe eşit de kritiktir
    assert.equal(statusOf(p, 0), 'out');
    assert.equal(statusOf(p, -150), 'neg');  // eksi stok sayım ister
});

test('eşik 0 ise uyarı üretilmez', () => {
    const p = product({ threshold: 0 });
    assert.equal(statusOf(p, 1), 'ok');
    assert.equal(statusOf(p, 0), 'out');     // yine de tükenmiştir
});

test('takip kapalı ürün her miktarda off döner', () => {
    const p = product({ tracksStock: false });
    assert.equal(statusOf(p, 0), 'off');
    assert.equal(statusOf(p, -5), 'off');
});

test('kritiklik sırası sayım gerekenleri öne alır', () => {
    assert.ok(STATUS_RANK.neg < STATUS_RANK.out);
    assert.ok(STATUS_RANK.out < STATUS_RANK.low);
    assert.ok(STATUS_RANK.low < STATUS_RANK.ok);
    assert.ok(STATUS_RANK.ok < STATUS_RANK.off);
});

test('dolu raf yüzdesi 0–100 arasına kırpılır', () => {
    const p = product();
    assert.equal(fillPercent(p, 600), 50);
    assert.equal(fillPercent(p, 5000), 100);
    assert.equal(fillPercent(p, -100), 0);
    assert.equal(fillPercent(product({ parLevel: 0 }), 5), 100); // hedef yoksa dolu say
});

test('eksi stok değer üretmez', () => {
    assert.equal(valueOf(product(), -200), 0);
    assert.equal(valueOf(product({ cost: 2 }), 10), 20);
});

test('marj satış fiyatı yoksa null', () => {
    assert.equal(marginOf(product({ price: 0 })), null);
    assert.equal(marginOf(product({ price: 200, cost: 50 })), 75);
});

test('son hareket en yeni tarihtir', () => {
    const moves = [move({ createdAt: daysAgo(9) }), move({ createdAt: daysAgo(2) }), move({ productId: 'p2', createdAt: daysAgo(0) })];
    assert.equal(lastMovementAt('p1', moves), moves[1].createdAt);
    assert.equal(lastMovementAt('p3', moves), null);
});

test('hareketsizlik eşiği IDLE_DAYS gündür; hiç hareketi olmayan da hareketsizdir', () => {
    const now = new Date();
    assert.equal(isIdle('p1', [move({ createdAt: daysAgo(IDLE_DAYS + 5) })], now), true);
    assert.equal(isIdle('p1', [move({ createdAt: daysAgo(3) })], now), false);
    assert.equal(isIdle('p1', [], now), true);
});

test('toplamlar tükenen/kritik/değer/hareketsizi ayırır', () => {
    const products = [
        product({ id: 'a', kind: 'consumable', cost: 1, threshold: 10, parLevel: 100 }),
        product({ id: 'b', kind: 'retail', cost: 100, threshold: 3, parLevel: 10 }),
        product({ id: 'c', kind: 'retail', cost: 5, tracksStock: false }),
    ];
    const moves = [
        move({ productId: 'a', delta: 5, createdAt: daysAgo(1) }),    // kritik
        move({ productId: 'b', delta: 0, createdAt: daysAgo(1) }),    // tükendi
        move({ productId: 'c', delta: 20, createdAt: daysAgo(90) }),  // takip kapalı + hareketsiz
    ];
    const t = stockTotals(products, moves, new Date());
    assert.equal(t.lowCount, 1);
    assert.equal(t.outCount, 1);
    assert.equal(t.orderNeeded, 2);
    assert.equal(t.totalValue, 5 + 0 + 100);   // a: 5×1, b: 0, c: 20×5
    assert.equal(t.retailValue, 100);          // yalnız satılık raf
    assert.equal(t.idleCount, 1);
});

test('tüketim maliyeti yalnız çıkışları sayar, satışı saymaz', () => {
    const products = [product({ id: 'a', cost: 2 })];
    const from = daysAgo(30), to = daysAgo(0);
    const moves = [
        move({ productId: 'a', type: 'usage', delta: -10, createdAt: daysAgo(5) }),
        move({ productId: 'a', type: 'waste', delta: -5, createdAt: daysAgo(4) }),
        move({ productId: 'a', type: 'sale', delta: -3, createdAt: daysAgo(3) }),   // ciro, gider değil
        move({ productId: 'a', type: 'in', delta: 100, createdAt: daysAgo(2) }),    // giriş
        move({ productId: 'a', type: 'usage', delta: -50, createdAt: daysAgo(90) }),// aralık dışı
    ];
    assert.equal(consumptionCost(products, moves, from, to), (10 + 5) * 2);
});

test('ay sınırları bitişiktir ve üst uç dışarıda kalır', () => {
    const b = monthBounds(new Date('2026-08-14T10:00:00Z'));
    assert.equal(b.current.from, '2026-08-01T00:00:00.000Z');
    assert.equal(b.current.to, '2026-09-01T00:00:00.000Z');
    assert.equal(b.previous.to, b.current.from);
    assert.equal(b.previous.from, '2026-07-01T00:00:00.000Z');
});
