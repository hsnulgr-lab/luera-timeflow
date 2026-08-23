import assert from 'node:assert/strict';
import test from 'node:test';
import { mockSource, shownDate } from '../mobile/src/lib/calendarSource.ts';

test('day yalnız seçilen günün randevularını döndürür; bilinmeyen gün boştur', async () => {
    const selected = await mockSource.day(shownDate('2026-09-25'));

    assert.equal(selected.length, 3);
    assert.ok(selected.every((appointment) => appointment.date === shownDate('2026-09-25')));
    assert.deepEqual(await mockSource.day(shownDate('2026-10-01')), []);
});

test('day sonuçları birbirinden bağımsız kopyalardır', async () => {
    const first = await mockSource.day(shownDate('2026-09-24'));
    const packageAppointment = first.find((appointment) => appointment.info?.pkg);
    assert.ok(packageAppointment?.info?.pkg);

    packageAppointment.info.pkg.used = 99;
    first.pop();

    const second = await mockSource.day(shownDate('2026-09-24'));
    const freshPackage = second.find((appointment) => appointment.info?.pkg)?.info?.pkg;
    assert.equal(second.length, 3);
    assert.equal(freshPackage?.used, 3);
});

test('range iki sınırı da dahil eder ve boş günleri sayaçtan çıkarır', async () => {
    assert.deepEqual(
        await mockSource.range(shownDate('2026-09-22'), shownDate('2026-09-28')),
        {
            [shownDate('2026-09-22')]: 1,
            [shownDate('2026-09-23')]: 3,
            [shownDate('2026-09-24')]: 3,
            [shownDate('2026-09-25')]: 3,
            [shownDate('2026-09-26')]: 3,
            [shownDate('2026-09-28')]: 1,
        },
    );
    assert.deepEqual(await mockSource.range(shownDate('2026-09-24'), shownDate('2026-09-24')), {
        [shownDate('2026-09-24')]: 3,
    });
});

test('boş gün sıradaki gerçek randevuya yönlendirir', async () => {
    assert.deepEqual(await mockSource.day(shownDate('2026-09-27')), []);

    const next = await mockSource.nextAfter(shownDate('2026-09-27'));
    assert.equal(next?.date, shownDate('2026-09-28'));
    assert.equal(next?.start_time, '09:30');
    assert.equal(next?.customer_name, 'Elif Aydın');
});

test('son kayıttan sonra sıradaki randevu yoktur', async () => {
    assert.equal(await mockSource.nextAfter(shownDate('2026-09-28')), null);
});
