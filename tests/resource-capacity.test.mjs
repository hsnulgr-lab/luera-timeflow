import assert from 'node:assert/strict';
import test from 'node:test';
import {
    allResourcesFull, isResourceFull, pickFreeResource, resourceLoadAt,
} from '../src/lib/resourceCapacity.ts';

// Kabin doluluğu. İki regresyon:
//  1) Kapasitesi > 1 olan kabin ilk seanstan sonra dolu sayılıyordu; DB guard'ı
//     (060) ise kapasiteye kadar izin veriyor — UI kendini DB'den katı kısıtlıyordu.
//  2) Tüm kabinler doluyken seans sessizce KABİNSİZ kaydediliyordu.

const kabin1 = { id: 'k1', capacity: 1 };
const kabin2 = { id: 'k2', capacity: 2 };

const at = (resourceId, start, end) => ({ resourceId, start, end });

test('çakışma sayımı yalnız ilgili kaynağı ve gerçek kesişimi sayar', () => {
    const busy = [at('k1', 600, 660), at('k2', 600, 660), at('k1', 660, 720)];
    assert.equal(resourceLoadAt('k1', busy, 600, 660), 1);
    // Bitişik randevu çakışma değildir: [600,660) ile [660,720) kesişmez.
    assert.equal(resourceLoadAt('k1', busy, 660, 720), 1);
    assert.equal(resourceLoadAt('k1', busy, 720, 780), 0);
});

test('kapasite 2 olan kabin ikinci seansı kabul eder, üçüncüde dolar', () => {
    assert.equal(isResourceFull(kabin2, [], 600, 660), false);
    assert.equal(isResourceFull(kabin2, [at('k2', 600, 660)], 600, 660), false);
    assert.equal(isResourceFull(kabin2, [at('k2', 600, 660), at('k2', 630, 690)], 600, 660), true);
});

test('kapasite 1 kabin ilk seansta dolar', () => {
    assert.equal(isResourceFull(kabin1, [at('k1', 600, 660)], 630, 690), true);
});

test('kapasitesi tanımsız/0 olan kaynak 1 sayılır', () => {
    assert.equal(isResourceFull({ id: 'x' }, [at('x', 600, 660)], 600, 660), true);
    assert.equal(isResourceFull({ id: 'x', capacity: 0 }, [at('x', 600, 660)], 600, 660), true);
});

test('otomatik atama sıradaki ilk müsait kabini verir (deterministik)', () => {
    const resources = [kabin1, kabin2];
    assert.equal(pickFreeResource(resources, [], 600, 660)?.id, 'k1');
    assert.equal(pickFreeResource(resources, [at('k1', 600, 660)], 600, 660)?.id, 'k2');
    // k1 dolu, k2'nin 2 kapasitesinden 1'i kullanılmış → hâlâ k2
    assert.equal(pickFreeResource(resources, [at('k1', 600, 660), at('k2', 600, 660)], 600, 660)?.id, 'k2');
});

test('hepsi doluyken atanacak kabin kalmaz ve slot kapanır', () => {
    const resources = [kabin1, kabin2];
    const busy = [at('k1', 600, 660), at('k2', 600, 660), at('k2', 600, 660)];
    assert.equal(pickFreeResource(resources, busy, 600, 660), undefined);
    assert.equal(allResourcesFull(resources, busy, 600, 660), true);
});

test('kabin tanımlı değilse kural hiç işlemez', () => {
    assert.equal(allResourcesFull([], [], 600, 660), false);
});
