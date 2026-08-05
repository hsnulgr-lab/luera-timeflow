import assert from 'node:assert/strict';
import test from 'node:test';
import {
    packLanes, weekDaysOf, monthGridOf, roundToStep, timeOfMinutes,
} from '../src/lib/calendarGrid.ts';

// Takvim ızgara geometrisinin GERÇEK davranış testi. Bu fonksiyonlar üç ayrı
// yazımdan tek gövdeye indirildi; eşdeğerlik burada sabitlenir.

const at = (startTime, endTime, id = `${startTime}-${endTime}`) => ({ id, startTime, endTime });
const lanesOf = (placements) => placements.map((p) => ({ id: p.item.id, lane: p.lane, lanes: p.lanes }));

test('ardışık randevular aynı şeridi geri kullanır', () => {
    const out = packLanes([at('09:00', '10:00', 'a'), at('10:00', '11:00', 'b')]);
    assert.deepEqual(lanesOf(out), [
        { id: 'a', lane: 0, lanes: 1 },
        { id: 'b', lane: 0, lanes: 1 },
    ]);
});

test('ikili çakışma iki şeride bölünür', () => {
    const out = packLanes([at('09:00', '10:00', 'a'), at('09:30', '10:30', 'b')]);
    assert.deepEqual(lanesOf(out), [
        { id: 'a', lane: 0, lanes: 2 },
        { id: 'b', lane: 1, lanes: 2 },
    ]);
});

test('kümedeki en yoğun nokta bütün kümenin genişliğini belirler', () => {
    // a ve c çakışmıyor ama ikisi de b ile çakışıyor → tek küme, 2 şerit.
    const out = packLanes([at('09:00', '10:00', 'a'), at('09:30', '11:30', 'b'), at('10:00', '11:00', 'c')]);
    const byId = Object.fromEntries(lanesOf(out).map((x) => [x.id, x]));
    assert.equal(byId.a.lanes, 2);
    assert.equal(byId.b.lanes, 2);
    assert.equal(byId.c.lanes, 2);
    assert.equal(byId.c.lane, 0, 'c, a biter bitmez 0. şeridi geri kullanmalı');
    assert.equal(byId.b.lane, 1);
});

test('üçlü çakışma üç şerit üretir', () => {
    const out = packLanes([at('09:00', '10:00', 'a'), at('09:15', '10:15', 'b'), at('09:30', '10:30', 'c')]);
    assert.deepEqual(lanesOf(out).map((x) => x.lane), [0, 1, 2]);
    assert.ok(lanesOf(out).every((x) => x.lanes === 3));
});

test('ayrı kümeler birbirinin genişliğini etkilemez', () => {
    const out = packLanes([
        at('09:00', '10:00', 'a'), at('09:30', '10:30', 'b'),   // küme 1: 2 şerit
        at('14:00', '15:00', 'c'),                               // küme 2: 1 şerit
    ]);
    const byId = Object.fromEntries(lanesOf(out).map((x) => [x.id, x]));
    assert.equal(byId.a.lanes, 2);
    assert.equal(byId.c.lanes, 1);
});

test('sıfır süreli kayıt kartı yutmaz', () => {
    const out = packLanes([at('09:00', '09:00', 'a'), at('09:00', '10:00', 'b')]);
    assert.equal(out.length, 2);
    assert.equal(out.find((x) => x.item.id === 'a').lanes, 2, 'sıfır süre 1 dakika sayılır → çakışma gerçek');
});

test('boş liste boş sonuç verir', () => {
    assert.deepEqual(packLanes([]), []);
});

test('hafta pazartesi başlar ve ay sınırını aşar', () => {
    // 2026-08-01 cumartesi → haftası 27 Temmuz Pazartesi'de başlar.
    assert.deepEqual(weekDaysOf('2026-08-01'), [
        '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30',
        '2026-07-31', '2026-08-01', '2026-08-02',
    ]);
});

test('pazar günü kendi haftasının SONUNA düşer', () => {
    // getDay()=0 tuzağı: naif kaydırma pazarı bir sonraki haftaya atıyordu.
    const week = weekDaysOf('2026-08-02'); // pazar
    assert.equal(week[0], '2026-07-27');
    assert.equal(week[6], '2026-08-02');
});

test('geçersiz tarih boş hafta verir', () => {
    assert.deepEqual(weekDaysOf('bozuk-tarih'), []);
});

test('ay ızgarası 42 hücre ve pazartesi başlangıçlı', () => {
    const grid = monthGridOf(2026, 7); // Ağustos 2026
    assert.equal(grid.length, 42);
    assert.equal(grid[0].iso, '2026-07-27');
    assert.equal(grid[0].inMonth, false);
    assert.ok(grid.some((c) => c.iso === '2026-08-01' && c.inMonth));
    assert.equal(grid.filter((c) => c.inMonth).length, 31, 'Ağustos 31 gün');
});

test('roundToStep tıklanan dakikayı slot adımına oturtur', () => {
    assert.equal(roundToStep(0, 15), 0);
    assert.equal(roundToStep(7, 15), 0);
    assert.equal(roundToStep(8, 15), 15);
    assert.equal(roundToStep(22, 15), 15);
    assert.equal(roundToStep(23, 15), 30);
    assert.equal(roundToStep(31, 20), 40);
    assert.equal(roundToStep(44, 30), 30);
    assert.equal(roundToStep(-5, 15), 0, 'negatif dakika sıfıra kırpılır');
    assert.equal(roundToStep(37, 0), 30, 'geçersiz adım 15 dakikaya düşer');
});

test('timeOfMinutes gün sınırını aşmaz', () => {
    assert.equal(timeOfMinutes(0), '00:00');
    assert.equal(timeOfMinutes(9 * 60 + 5), '09:05');
    assert.equal(timeOfMinutes(-30), '00:00');
    assert.equal(timeOfMinutes(25 * 60), '23:59');
});
