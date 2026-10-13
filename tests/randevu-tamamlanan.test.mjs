/**
 * TAMAMLANAN RANDEVU BİR KAYIT (2026-10-13).
 *
 * Telefonda kullanıcı: "tamamlanan randevularda saati değiştir, hizmeti
 * değiştir olması mantıksız değil mi". Müdür 25'in A3 karesi bu düğmeleri
 * tamamlanan randevuda da çiziyordu; ürün sahibi değiştirdi. Kural tek
 * yerde (`isReschedulable`) ve dört yüzey ona bakıyor: randevu kartının
 * karoları ve satırları, takvimin kart menüsü, takvimde sürükleme.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    changeRows, changeTiles, doneInfo, isEditable, isReschedulable,
} from '../mobile/src/lib/appointmentDetail.ts';
import { menuRows } from '../mobile/src/lib/moveAppointment.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

const base = {
    id: 'a', customer_id: null, customer_name: 'Yasemin Kurt', customer_phone: '05329000004',
    date: '2026-10-13', start_time: '16:00:00', end_time: '16:45:00', service: 'Ağda',
    service_color: null, status: 'confirmed', staff_id: 's', notes: null,
    customer_arrived_at: null, arrived_at: null, service_ended_at: null,
};
const waiting = base;
const arrived = { ...base, customer_arrived_at: '2026-10-13T15:55:00Z' };
const running = { ...arrived, arrived_at: '2026-10-13T16:00:00Z' };
const done = { ...running, service_ended_at: '2026-10-13T16:41:00Z' };
const completed = { ...base, status: 'completed' };
const cancelled = { ...base, status: 'cancelled' };
const CATALOG = [{ id: 'x', name: 'Ağda', duration: 45, price: 900 }];

test('taşınabilir: bekleyen, gelen, süren — tamamlanan ve iptal DEĞİL', () => {
    for (const a of [waiting, arrived, running]) assert.equal(isReschedulable(a), true);
    for (const a of [done, completed, cancelled]) assert.equal(isReschedulable(a), false);
    // Tamamlanan yine düzenlenebilir (not); yalnız iptal edilen kapalı.
    assert.equal(isEditable(done), true);
    assert.equal(isEditable(cancelled), false);
});

test('randevu kartı: tamamlananda karo yok, satırlarda yalnız not', () => {
    assert.deepEqual(changeTiles(done, 'Selin'), []);
    assert.deepEqual(changeTiles(done, 'Derya', true), []);
    assert.deepEqual(changeRows(done, CATALOG).map((r) => r.action), ['note']);
    assert.deepEqual(changeRows(completed, CATALOG).map((r) => r.action), ['note']);
    // Süren işte değişmedi.
    assert.deepEqual(changeTiles(running, 'Selin').map((t) => t.action), ['time', 'staff']);
    assert.deepEqual(changeRows(running, CATALOG).map((r) => r.action), ['service', 'note']);
});

test('yerinde nedeni ve düzeltmenin yeri yazıyor — moda göre', () => {
    assert.equal(doneInfo(true), 'Tamamlanan randevunun saati ve hizmeti değişmez. Ücret yanlışsa Kasa’dan düzeltin.');
    // Ekipte telefondaki Kasa salt okunur: düzeltme masaüstünde.
    assert.match(doneInfo(false), /personeli/);
    assert.match(doneInfo(false), /masaüstündeki Kasa’dan/);
    const card = code('mobile/src/components/AppointmentDetail.tsx');
    assert.match(card, /\{stateOf\(appointment\) === 'done' \? <InfoLine text=\{doneInfo\(solo\)\} \/> : null\}/);
    assert.match(card, /\{tiles\.length > 0 \? \(\s*<ChangeTiles/);
});

test('takvimin kart menüsü aynı kuralda: tamamlananda ne taşıma ne iptal', () => {
    const actions = (a, solo = false) => menuRows(a, 'Selin', solo).map((r) => r.action);
    assert.deepEqual(actions(done), ['detail', 'delete']);
    assert.deepEqual(actions(done, true), ['detail', 'delete']);
    // İptal edilende taşıma da yok (eskiden "Saati değiştir" sunuyordu).
    assert.deepEqual(actions(cancelled), ['detail', 'delete']);
    assert.deepEqual(actions(waiting), ['time', 'staff', 'detail', 'cancel', 'delete']);
    assert.deepEqual(actions(running, true), ['time', 'detail', 'cancel', 'delete']);
});

test('takvimde tamamlanan blok kalkmıyor — kayıt sürüklenip taşınmaz', () => {
    const grid = code('mobile/src/components/ColumnCalendar.tsx');
    assert.match(grid, /onLift=\{readOnly \|\| !isReschedulable\(appointment\) \? undefined : beginLift\}/);
});
