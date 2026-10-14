/**
 * Adisyon ikilemesi (2026-09-19): randevunun hizmetleri kumandada görünmüyordu;
 * personel aynı işi EK HİZMET olarak ekliyor, Kasa ikisini topluyordu
 * (3 hizmet → ₺246.000 yerine ₺123.000).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { bookedServiceNames, isBooked } from '../mobile/src/lib/adisyon.ts';
import { serviceLines, adisyonLines } from '../mobile/src/lib/cashBuild.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('Kasa randevu hizmetlerini ve ek hizmetleri AYRI topluyor — ikilemenin sebebi', () => {
    const catalog = [{ id: 's1', name: 'botox', price: 120000 }];
    const row = { service: 'botox', custom_fields: null };
    const extras = [{ id: 'service:s1', name: 'botox', price: 120000, kind: 'extra', serviceId: 's1' }];
    const total = [...serviceLines(row, catalog), ...adisyonLines(extras)].reduce((s, l) => s + l.amount, 0);
    assert.equal(total, 240000, 'aynı hizmet iki kez sayılıyor — kumanda bunu önlemeli');
});

test('randevunun hizmet adları masaüstünün birleşik adından', () => {
    assert.deepEqual(bookedServiceNames('gençlik aşısı + mezo terapi + botox'), ['gençlik aşısı', 'mezo terapi', 'botox']);
    assert.deepEqual(bookedServiceNames(''), []);
    assert.deepEqual(bookedServiceNames(null), []);
});

test('yalnız EK HİZMET randevuda sayılır; ürün ve malzeme sayılmaz', () => {
    const booked = ['Botox', 'Mezo terapi'];
    assert.equal(isBooked({ kind: 'extra', name: 'botox' }, booked), true, 'büyük/küçük harf fark etmez');
    assert.equal(isBooked({ kind: 'extra', name: 'Manikür' }, booked), false);
    assert.equal(isBooked({ kind: 'product', name: 'Botox' }, booked), false);
    assert.equal(isBooked({ kind: 'material', name: 'Botox' }, booked), false);
});

test('kumanda: randevu hizmeti listede KENDİ satırında (Personel 15)', () => {
    // Eskiden "RANDEVU" grubu ve "yeniden eklemeyin" cümlesiydi. Sade adisyon
    // (2026-10-15): randevu hizmeti listede "Randevu hizmeti" satırı, kendi
    // tutarıyla ve oksuz; cümlenin işini tek soru yapıyor (aşağıdaki test).
    const screen = code(read('../mobile/app/(staff-flow)/kumanda.tsx'));
    const sade = code(read('../mobile/src/components/AdisyonSade.tsx'));
    assert.match(sade, /services\.map\(\(service, index\) => \(\s*<SadeServiceRow/);
    assert.match(sade, /Randevu hizmeti/);
    // İki yerde de: adisyon sayfası ve kapanış listesi — aynı bileşen.
    assert.equal((screen.match(/<SadeList\s/g) ?? []).length, 2);
    assert.equal((screen.match(/services=\{services\}/g) ?? []).length, 2);
    assert.ok(!/yeniden eklemeyin/.test(screen + sade), 'cümle kalktı');
});

test('kumanda: randevudaki hizmet eklenmeden önce soruluyor — engel değil', () => {
    const screen = code(read('../mobile/app/(staff-flow)/kumanda.tsx'));
    const sade = code(read('../mobile/src/components/AdisyonSade.tsx'));
    // Kutu ve arama aynı kapıdan geçiyor.
    assert.match(screen, /onTile=\{\(item\) => guardAdd\(item, \(\) => addItem\(item\)\)\}/);
    assert.match(screen, /onPick=\{\(item\) => guardAdd\(item, \(\) => \{/);
    assert.match(screen, /if \(isBooked\(item, booked\)\) \{/);
    assert.match(screen, /Yine de ekle/);
    assert.match(screen, /iki kez tahsil edilir/);
    // Onaydan önce "eklendi" görünmüyor: makbuz yalnız `addItem`de yazılıyor.
    assert.match(screen, /const addItem = \(item: CatalogItem\) => \{[\s\S]*?setReceipt\(/);
    assert.match(sade, /item\.inBooking \? 'Randevuda var' : KIND_NAME\[item\.kind\]/);
});
