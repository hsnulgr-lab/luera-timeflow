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

test('kumanda: RANDEVU grubu görünür, boş hâl yalnız gerçekten boşken', () => {
    const screen = code(read('../mobile/app/(staff-flow)/kumanda.tsx'));
    assert.match(screen, /<BookedGroup names=\{booked\} \/>/);
    assert.match(screen, /lines\.length === 0 && booked\.length === 0 \?/);
    assert.match(screen, /count > 0 \? rows : booked\.length > 0 \? null :/, 'sayfadaki boş hâl de');
    assert.match(screen, /Bu hizmetler kasaya randevuyla birlikte gidiyor; yeniden eklemeyin\./);
});

test('kumanda: randevudaki hizmet eklenmeden önce soruluyor — engel değil', () => {
    const screen = code(read('../mobile/app/(staff-flow)/kumanda.tsx'));
    assert.match(screen, /onAdd=\{\(item\) => guardAdd\(item, \(\) => \{/);
    assert.match(screen, /onPick=\{\(item\) => guardAdd\(item, \(\) => \{/);
    assert.match(screen, /if \(isBooked\(item, booked\)\) \{/);
    assert.match(screen, /Yine de ekle/);
    assert.match(screen, /iki kez tahsil edilir/);
    assert.match(screen, /if \(item\.inBooking\) \{ onAdd\(item\); return; \}/, 'onaydan önce "Eklendi" yanıp sönmüyor');
    assert.match(screen, /item\.inBooking \? 'RANDEVUDA' : KIND_LABEL\[item\.kind\]/);
});
