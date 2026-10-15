/**
 * D2 / D6 — kumandanın GÖNDERDİĞİ, sunucunun KURALINDAN geçiyor (2026-10-16).
 *
 * 2026-10-15 denetiminin dersi: "kaynak metnine bakan test ölü dalı
 * yakalamaz." İstemci testi ×2'yi, sunucu testi `qty !== 1`'i ayrı ayrı doğru
 * buluyordu; ikisini birlikte koşturan yoktu. Canlıda ücretli kalemde ×2 ve
 * katalog dışı kalem `visit.items`te BÜTÜN listeyi reddettiriyordu: otomatik
 * kayıt sessizce düşüyor, tek kişilik tahsilat kilitleniyor, ekipte yanlış
 * "kasada zaten açık" cümlesi çıkıyordu.
 *
 * Buradaki testler gerçek modülleri birlikte çalıştırıyor: kumandanın
 * listesi (`addLine` → `sendableOf`) sunucunun saf kuralına
 * (`staff-api/visitItems.ts`) gidiyor, dönen kalemler Kasa'nın ve
 * tahsilatın formülünden geçiyor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { addLine, freeItem, linesFromItems, sendableOf } from '../mobile/src/lib/adisyon.ts';
import { addedTotal } from '../mobile/src/lib/adisyonSade.ts';
import { adisyonLines, kasaOnlyReason as clientKasa } from '../mobile/src/lib/cashBuild.ts';
import {
    PAID_QTY_MAX,
    kasaOnlyReason as serverKasa,
    planVisitItems,
    resolveVisitItems,
} from '../supabase/functions/staff-api/visitItems.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const P_OIL = '3f2b6a1e-1111-4111-8111-111111111111';
const P_DYE = '3f2b6a1e-2222-4222-8222-222222222222';
const P_FOIL = '3f2b6a1e-3333-4333-8333-333333333333';
const S_BLOW = '3f2b6a1e-4444-4444-8444-444444444444';

const products = new Map([
    [P_OIL, { id: P_OIL, name: 'Saç bakım yağı', price: 450, kind: 'retail', tracks_stock: true }],
    [P_DYE, { id: P_DYE, name: 'Boya 7.3', price: 0, kind: 'consumable', tracks_stock: true }],
    // Stok İZLEMEYEN sarf — eskiden bütün listeyi reddettiriyordu.
    [P_FOIL, { id: P_FOIL, name: 'Folyo', price: 0, kind: 'consumable', tracks_stock: false }],
]);
const services = new Map([[S_BLOW, { id: S_BLOW, name: 'Fön', price: 300 }]]);

/** Sunucunun `visit.items` yolu: önce plan, sonra katalogdan çözüm. */
function server(request) {
    const plan = planVisitItems(request);
    if ('error' in plan) return { error: plan.error };
    for (const id of plan.productIds) assert.ok(products.has(id) || id.startsWith('free:'), `okunacak kimlik: ${id}`);
    const items = resolveVisitItems(request, products, services);
    return items ? { items } : { error: 'invalid_catalog_item' };
}

/** `visit.collect`in kalem formülü — index.ts'teki satırın aynısı. */
const collectItems = (items) => items.reduce((sum, item) => sum + (Number(item?.price) || 0) * (Number(item?.qty) || 1), 0);

test('ücretli kalemde ×2 KABUL ediliyor ve tahsilat ekrandaki Toplam\'la aynı', () => {
    // Kumanda: ürüne iki kez dokun (×2), ek hizmet bir kez, malzeme üç kez.
    let lines = [];
    lines = addLine(lines, { name: 'Saç bakım yağı', kind: 'product', price: 450, catalogId: P_OIL }, 'a');
    lines = addLine(lines, { name: 'Saç bakım yağı', kind: 'product', price: 450, catalogId: P_OIL }, 'b');
    lines = addLine(lines, { name: 'Fön', kind: 'extra', price: 300, catalogId: S_BLOW }, 'c');
    for (const id of ['d', 'e', 'f']) lines = addLine(lines, { name: 'Boya 7.3', kind: 'material', catalogId: P_DYE }, id);

    const { items: request, skipped } = sendableOf(lines);
    assert.equal(skipped, 0);
    const out = server(request);
    assert.ok(out.items, `sunucu reddetti: ${out.error}`);

    const oil = out.items.find((item) => item.productId === P_OIL);
    assert.equal(oil.qty, 2, 'adet satırda kalıyor');
    assert.equal(oil.price, 450, 'fiyat katalogdan');
    assert.equal(out.items.find((item) => item.productId === P_DYE).price, 0, 'malzeme müşteriye yazılmıyor');

    // Üç rakam AYNI: ekranın Toplam'ı (kalemler), tahsilatın formülü, Kasa satırları.
    assert.equal(addedTotal(lines), 1200);
    assert.equal(collectItems(out.items), 1200);
    assert.equal(adisyonLines(out.items).reduce((sum, line) => sum + line.amount, 0), 1200);
});

test('katalog dışı MALZEME kabul ediliyor; geri dönen liste aynı isteği doğuruyor', () => {
    let lines = [];
    lines = addLine(lines, { ...freeItem('  Keratin   ampul '), catalogId: freeItem('  Keratin   ampul ').id }, 'a');
    const { items: request, skipped } = sendableOf(lines);
    assert.equal(skipped, 0);
    assert.deepEqual(request, [{ kind: 'material', productId: 'free:Keratin ampul', qty: 1 }]);

    const out = server(request);
    assert.ok(out.items, `sunucu reddetti: ${out.error}`);
    assert.deepEqual(out.items, [{ id: 'free:Keratin ampul', name: 'Keratin ampul', price: 0, kind: 'material', productId: 'free:Keratin ampul' }]);

    // Kumanda yeniden açılınca aynı kalem aynı istekle gidiyor — otomatik
    // kayıt kendi yazdığını "başka cihaz" sanmıyor.
    assert.deepEqual(sendableOf(linesFromItems(out.items)).items, request);
    assert.equal(collectItems(out.items), 0);
});

test('katalog dışı ÜCRETLİ kalem reddediliyor (kullanıcı kararı) — 1.0\'ın biçimi dahil', () => {
    // Mağazadaki 1.0 katalog dışı ürünü böyle gönderiyordu.
    assert.deepEqual(server([{ kind: 'product', productId: 'free:Yeni şampuan', qty: 1 }]), { error: 'invalid_catalog_item' });
    assert.deepEqual(server([{ kind: 'extra', serviceId: 'free:Masaj', qty: 1 }]), { error: 'invalid_catalog_item' });
    // Yeni kumanda ücretli türü hiç sunmuyor.
    assert.equal(freeItem('Yeni şampuan').kind, 'material');
});

test('stok İZLEMEYEN sarf malzeme olarak kabul; adet sınırları', () => {
    assert.deepEqual(server([{ kind: 'material', productId: P_FOIL, qty: 2 }]).items,
        [{ id: `material:${P_FOIL}`, name: 'Folyo', price: 0, kind: 'material', productId: P_FOIL, qty: 2 }]);
    assert.ok(server([{ kind: 'product', productId: P_OIL, qty: PAID_QTY_MAX }]).items);
    assert.deepEqual(server([{ kind: 'product', productId: P_OIL, qty: PAID_QTY_MAX + 1 }]), { error: 'invalid_catalog_item' });
    assert.ok(server([{ kind: 'extra', serviceId: S_BLOW, qty: 2 }]).items);
    assert.deepEqual(server([{ kind: 'extra', serviceId: S_BLOW, qty: 0 }]), { error: 'invalid_catalog_item' });
    assert.deepEqual(server([{ kind: 'extra', serviceId: S_BLOW, qty: 1.5 }]), { error: 'invalid_catalog_item' });
    // Uzun ad sessizce kesilmiyor — reddediliyor (arama kutusu aynı sınırda).
    assert.deepEqual(server([{ kind: 'material', productId: `free:${'a'.repeat(61)}`, qty: 1 }]), { error: 'invalid_catalog_item' });
    // Aynı katalog dışı ad iki satır olamaz.
    assert.deepEqual(server([
        { kind: 'material', productId: 'free:Ampul', qty: 1 },
        { kind: 'material', productId: 'free:ampul', qty: 1 },
    ]), { error: 'duplicate_catalog_item' });
});

test('index.ts sunucu kuralını bu modülden alıyor; stok düşümü katalog dışını ve izlemeyeni atlıyor', () => {
    const api = read('supabase/functions/staff-api/index.ts');
    assert.match(api, /from '\.\/visitItems\.ts';/);
    const items = api.slice(api.indexOf("action === 'visit.items'"), api.indexOf("action === 'visit.formula'"));
    assert.match(items, /const plan = planVisitItems\(requested\);/);
    assert.match(items, /const items = resolveVisitItems\(requested, productById, serviceById\);/);
    assert.doesNotMatch(items, /qty !== 1/, 'ücretli kalemde ×2 yeniden reddediliyor');
    const stock = api.slice(api.indexOf('const reconcileUsageStock'), api.indexOf("action === 'agenda'"));
    assert.match(stock, /if \(freeMaterialName\(line\)\) continue;/);
    assert.match(stock, /if \(product\.kind === 'consumable' && product\.tracks_stock === false\) continue;/);
});

// ── D6 · Kasa'ya ait adisyon ────────────────────────────────────────────────

test('D6 · "Kasa\'ya ait" kuralı telefonda ve sunucuda AYNI', () => {
    const cases = [
        [{ group_id: 'g1', custom_fields: null }, 0, 'group'],
        [{ group_id: null, custom_fields: { paket_plan_id: 'plan-1' } }, 0, 'package'],
        [{ group_id: null, custom_fields: { cash_discount_amount: '50' } }, 0, 'discount'],
        [{ group_id: null, custom_fields: { cash_discount_amount: 0 } }, 0, null],
        [{ group_id: null, custom_fields: {} }, 200, 'partial'],
        [{ group_id: null, custom_fields: null }, 0, null],
        [{ group_id: '', custom_fields: { paket_plan_id: '' } }, 0, null],
    ];
    for (const [row, paid, expected] of cases) {
        assert.equal(serverKasa(row, paid), expected, `sunucu: ${JSON.stringify(row)} / ${paid}`);
        assert.equal(clientKasa(row, paid), expected, `telefon: ${JSON.stringify(row)} / ${paid}`);
    }
});

test('D6 · visit.collect Kasa\'ya ait adisyonda para YAZMIYOR; visit.charge sebebi söylüyor', () => {
    const api = read('supabase/functions/staff-api/index.ts');
    const collect = api.slice(api.indexOf("if (action === 'visit.collect')"), api.indexOf("if (action === 'catalog')"));
    const reason = collect.indexOf("if (kasaReason) return json({ error: 'collect_in_kasa', reason: kasaReason }, 409);");
    assert.ok(reason > 0, 'paket / indirim / grup reddi yok');
    assert.ok(reason < collect.indexOf("from('payments').insert"), 'red para kaydından ÖNCE');
    assert.match(collect, /select\('custom_fields, group_id'\)/);
    // Önceki tahsilatın TOPLAMI — tek satır değil (kısmi ödeme).
    assert.doesNotMatch(collect, /\.limit\(1\)\s*\.maybeSingle\(\);/);

    const charge = api.slice(api.indexOf("if (action === 'visit.charge')"), api.indexOf("if (action === 'visit.collect')"));
    assert.match(charge, /const kasaOnly = res!\.is_paid === true \? null : kasaOnlyReason\(cfRow \?\? \{\}, paid\);/);
    assert.match(charge, /return json\(\{ lines, amount, count: lines\.length, kasaOnly \}\);/);
});
