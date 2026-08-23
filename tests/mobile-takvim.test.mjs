import assert from 'node:assert/strict';
import test from 'node:test';
import {
    calendarCardStates,
    cardStates,
    elapsed,
    headline,
    hhmm,
    lateMinutes,
    monthGrid,
    nowLineAfter,
    statusWord,
    toMinutes,
    weekDays,
} from '../mobile/src/lib/calendar.ts';

const appt = (id, start_time, overrides = {}) => ({
    id,
    customer_id: `customer-${id}`,
    customer_name: `Müşteri ${id}`,
    customer_phone: null,
    date: '2026-09-24',
    start_time,
    end_time: hhmm(toMinutes(start_time) + 60),
    service: 'Kesim',
    service_color: null,
    status: 'confirmed',
    notes: null,
    arrived_at: null,
    service_ended_at: null,
    ...overrides,
});

test('saat yardımcıları saniyeli sunucu değerini kabul eder', () => {
    assert.equal(toMinutes('09:05'), 545);
    assert.equal(toMinutes('09:05:59'), 545);
    assert.equal(hhmm(545), '09:05');
});

test('live varken hiçbir kart due olmaz; en erken başlayan live olur', () => {
    const rows = [
        appt('due-adayi', '10:00'),
        appt('gec-live', '09:30', { arrived_at: '2026-09-24T09:30:00Z' }),
        appt('erken-live', '09:00', { arrived_at: '2026-09-24T09:00:00Z' }),
    ];
    const states = cardStates(rows, toMinutes('10:05'));

    assert.equal(states.get('erken-live'), 'live');
    assert.equal(states.get('gec-live'), 'plain');
    assert.equal(states.get('due-adayi'), 'plain');
    assert.equal([...states.values()].includes('due'), false);
});

test('due penceresi randevudan tam 10 dakika önce açılır', () => {
    const row = appt('r1', '11:00');
    assert.equal(cardStates([row], toMinutes('10:49')).get(row.id), 'plain');
    assert.equal(cardStates([row], toMinutes('10:50')).get(row.id), 'due');
});

test('sırası geldi ve canlı işlem görünümü başka güne taşınmaz', () => {
    const due = appt('due', '11:00');
    const live = appt('live', '10:00', { arrived_at: '2026-09-24T10:00:00Z' });

    assert.equal(calendarCardStates([due], toMinutes('11:00'), false).get(due.id), 'plain');
    assert.equal(calendarCardStates([live], toMinutes('11:00'), false).get(live.id), 'plain');
});

test('iptal edilen ve gelmedi sayılan randevu asla due olmaz', () => {
    const cancelled = appt('iptal', '11:00', { status: 'cancelled' });
    const missed = appt('gelmedi', '10:00', { end_time: '10:45' });
    const states = cardStates([cancelled, missed], toMinutes('11:00'));

    assert.equal(states.get(cancelled.id), 'plain');
    assert.equal(states.get(missed.id), 'plain');
    assert.equal([...states.values()].includes('due'), false);
});

test('birden çok due adayı varken yalnız en erken randevu eylem alır', () => {
    const later = appt('sonra', '11:05');
    const earlier = appt('once', '11:00');
    const states = cardStates([later, earlier], toMinutes('11:00'));

    assert.equal(states.get(earlier.id), 'due');
    assert.equal(states.get(later.id), 'plain');
    assert.equal([...states.values()].filter((state) => state === 'due').length, 1);
});

test('lateMinutes doğru işaret ve değeri korur', () => {
    const row = appt('r1', '11:00');
    assert.equal(lateMinutes(row, toMinutes('10:50')), -10);
    assert.equal(lateMinutes(row, toMinutes('11:00')), 0);
    assert.equal(lateMinutes(row, toMinutes('11:12')), 12);
});

test('nowLineAfter listenin üstünü, arasını ve sonunu doğru işaretler', () => {
    const rows = [appt('r1', '10:00'), appt('r2', '12:00'), appt('r3', '15:00')];
    assert.equal(nowLineAfter(rows, toMinutes('09:59'), true), -1);
    assert.equal(nowLineAfter(rows, toMinutes('12:30'), true), 1);
    assert.equal(nowLineAfter(rows, toMinutes('23:00'), true), 2);
    assert.equal(nowLineAfter(rows, toMinutes('12:30'), false), null);
});

test('statusWord yalnız sapan durumları söyler, tamamlanan sessizdir', () => {
    assert.equal(statusWord(appt('pending', '10:00', { status: 'pending' })), 'onay bekliyor');
    assert.equal(statusWord(appt('cancelled', '10:00', { status: 'cancelled' })), 'iptal');
    assert.equal(statusWord(appt('missed', '10:00', { date: '2000-01-01' })), 'gelmedi');
    assert.equal(statusWord(appt('done', '10:00', { status: 'completed' })), null);
});

test('weekDays pazartesiden başlar ve ay sonunu doğru geçer', () => {
    assert.deepEqual(weekDays('2026-09-30'), [
        { date: '2026-09-28', num: 28, label: 'Pzt' },
        { date: '2026-09-29', num: 29, label: 'Sal' },
        { date: '2026-09-30', num: 30, label: 'Çar' },
        { date: '2026-10-01', num: 1, label: 'Per' },
        { date: '2026-10-02', num: 2, label: 'Cum' },
        { date: '2026-10-03', num: 3, label: 'Cmt' },
        { date: '2026-10-04', num: 4, label: 'Paz' },
    ]);
});

test('weekDays yıl sonunu doğru geçer', () => {
    const days = weekDays('2026-12-31');
    assert.equal(days[0].date, '2026-12-28');
    assert.equal(days[6].date, '2027-01-03');
    assert.equal(days[0].label, 'Pzt');
    assert.equal(days[6].label, 'Paz');
});

test('monthGrid ayın 1\'i pazar olduğunda önceki ayın altı gününü gösterir', () => {
    const grid = monthGrid('2021-08-15');
    assert.equal(grid.length, 6);
    assert.ok(grid.every((week) => week.length === 7));
    // Tasarım komşu ayı boş bırakmaz, soluk gösterir: hücre hep doludur.
    assert.deepEqual(grid[0].map((cell) => cell.date), [
        '2021-07-26', '2021-07-27', '2021-07-28',
        '2021-07-29', '2021-07-30', '2021-07-31', '2021-08-01',
    ]);
    assert.deepEqual(grid[0].map((cell) => cell.inMonth), [
        false, false, false, false, false, false, true,
    ]);
});

test('monthGrid 42 hücrenin tamamını kesintisiz üretir', () => {
    const cells = monthGrid('2026-05-12').flat();
    assert.equal(cells.length, 42);
    for (let i = 1; i < cells.length; i += 1) {
        const previous = Date.parse(`${cells[i - 1].date}T00:00:00Z`);
        const current = Date.parse(`${cells[i].date}T00:00:00Z`);
        assert.equal(current - previous, 86_400_000, `${cells[i - 1].date} → ${cells[i].date}`);
    }
});

test('monthGrid 31 çeken ayın hiçbir gününü kaybetmez', () => {
    const own = monthGrid('2026-05-12').flat().filter((cell) => cell.inMonth);
    assert.equal(own.length, 31);
    assert.equal(own[0].date, '2026-05-01');
    assert.equal(own.at(-1).date, '2026-05-31');
});

test('monthGrid artık yıl şubatını 29 gün üretir', () => {
    const leap = monthGrid('2024-02-10').flat().filter((cell) => cell.inMonth);
    const ordinary = monthGrid('2025-02-10').flat().filter((cell) => cell.inMonth);
    assert.equal(leap.length, 29);
    assert.equal(leap.at(-1).date, '2024-02-29');
    assert.equal(ordinary.length, 28);
});

test('headline sayı ve canlı durumunu gerçek listeden türetir', () => {
    const rows = [
        appt('done', '10:00', { status: 'completed', service_ended_at: '2026-09-24T10:30:00Z' }),
        appt('live', '11:00', { arrived_at: '2026-09-24T11:00:00Z' }),
        appt('later', '13:00'),
    ];
    assert.equal(
        headline('2026-09-24', '2026-09-24', rows),
        'Eylül 2026 · bugün · 3 randevu · 1 işlem sürüyor',
    );
});

test('elapsed dakika ve saat sınırlarını doğru biçimler', () => {
    assert.equal(elapsed(59), '00:59');
    assert.equal(elapsed(60), '01:00');
    assert.equal(elapsed(3599), '59:59');
    assert.equal(elapsed(3600), '1:00:00');
});
