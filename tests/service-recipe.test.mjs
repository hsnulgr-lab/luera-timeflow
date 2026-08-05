import test from 'node:test';
import assert from 'node:assert/strict';
import {
    KF_USAGE_DONE_KEY, KF_USAGE_KEY, encodeUsage, recipeFor,
    usageAlreadyDeducted, usageFor, usageOverrides,
} from '../src/lib/serviceRecipe.ts';

// Hizmet reçetesi → sarf tüketimi. Reçete varsayılan, randevudaki düzeltme ezer.

const products = [
    { id: 'boya', organizationId: 'o', name: 'Boya 7.1', price: 0, isActive: true, createdAt: '', unit: 'ml', tracksStock: true },
    { id: 'oks', organizationId: 'o', name: 'Oksidan 20 vol', price: 0, isActive: true, createdAt: '', unit: 'ml', tracksStock: true },
    { id: 'kapali', organizationId: 'o', name: 'Havlu', price: 0, isActive: true, createdAt: '', unit: 'adet', tracksStock: false },
];

const services = [
    { id: 's1', name: 'Dip boya', duration: 60, color: '#000', recipe: [
        { productId: 'boya', quantity: 60 }, { productId: 'oks', quantity: 60 }, { productId: 'kapali', quantity: 2 },
    ] },
    { id: 's2', name: 'Kesim', duration: 30, color: '#000' },
];

const res = (over = {}) => ({
    id: 'r1', customerName: 'Elif', service: 'Dip boya', date: '2026-08-01',
    startTime: '10:00', endTime: '11:00', status: 'confirmed', ...over,
});

test('reçetesi olmayan hizmet hiçbir şey düşürmez', () => {
    assert.deepEqual(recipeFor('Kesim', services, products), []);
    assert.deepEqual(usageFor(res({ service: 'Kesim' }), services, products), []);
});

test('takibi kapalı ürün reçeteden elenir', () => {
    const lines = recipeFor('Dip boya', services, products);
    assert.deepEqual(lines.map((l) => l.productId), ['boya', 'oks']);
    assert.equal(lines[0].unit, 'ml');
});

test('silinmiş ürün reçeteden elenir', () => {
    const lines = recipeFor('Dip boya', services, [products[0]]);
    assert.deepEqual(lines.map((l) => l.productId), ['boya']);
});

test('düzeltme reçetenin miktarını ezer', () => {
    const r = res({ customFields: { [KF_USAGE_KEY]: JSON.stringify({ boya: 90 }) } });
    const lines = usageFor(r, services, products);
    assert.deepEqual(lines, [
        { productId: 'boya', name: 'Boya 7.1', unit: 'ml', quantity: 90 },
        { productId: 'oks', name: 'Oksidan 20 vol', unit: 'ml', quantity: 60 },
    ]);
});

test('düzeltmede 0 yazmak satırı düşürür', () => {
    const r = res({ customFields: { [KF_USAGE_KEY]: JSON.stringify({ oks: 0 }) } });
    assert.deepEqual(usageFor(r, services, products).map((l) => l.productId), ['boya']);
});

test('reçetede olmayan ürün düzeltmeye eklenebilir', () => {
    const r = res({ service: 'Kesim', customFields: { [KF_USAGE_KEY]: JSON.stringify({ boya: 25 }) } });
    assert.deepEqual(usageFor(r, services, products), [
        { productId: 'boya', name: 'Boya 7.1', unit: 'ml', quantity: 25 },
    ]);
});

test('düzeltme takibi kapalı ürünü geri getiremez', () => {
    const r = res({ customFields: { [KF_USAGE_KEY]: JSON.stringify({ kapali: 5 }) } });
    assert.equal(usageFor(r, services, products).some((l) => l.productId === 'kapali'), false);
});

test('bozuk veya eksik JSON sessizce yok sayılır', () => {
    assert.deepEqual(usageOverrides(res({ customFields: { [KF_USAGE_KEY]: '{bozuk' } })), {});
    assert.deepEqual(usageOverrides(res()), {});
    assert.deepEqual(usageOverrides(res({ customFields: { [KF_USAGE_KEY]: '"metin"' } })), {});
});

test('negatif düzeltme yok sayılır — stok tüketimle artmaz', () => {
    const r = res({ customFields: { [KF_USAGE_KEY]: JSON.stringify({ boya: -50 }) } });
    assert.equal(usageFor(r, services, products).find((l) => l.productId === 'boya').quantity, 60);
});

test('encodeUsage/usageOverrides gidiş-dönüş', () => {
    const lines = [{ productId: 'boya', name: 'x', unit: 'ml', quantity: 75 }];
    const r = res({ customFields: { [KF_USAGE_KEY]: encodeUsage(lines) } });
    assert.deepEqual(usageOverrides(r), { boya: 75 });
});

test('düşüldü bayrağı çift düşmeyi engeller', () => {
    assert.equal(usageAlreadyDeducted(res()), false);
    assert.equal(usageAlreadyDeducted(res({ customFields: { [KF_USAGE_DONE_KEY]: true } })), true);
    assert.equal(usageAlreadyDeducted(res({ customFields: { [KF_USAGE_DONE_KEY]: 'true' } })), true);
});
