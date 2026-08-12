import assert from 'node:assert/strict';
import test from 'node:test';
import { mockSource } from '../mobile/src/lib/calendarSource.ts';

test('day yalnız seçilen günün randevularını döndürür; bilinmeyen gün boştur', async () => {
    const selected = await mockSource.day('2026-09-25');

    assert.equal(selected.length, 3);
    assert.ok(selected.every((appointment) => appointment.date === '2026-09-25'));
    assert.deepEqual(await mockSource.day('2026-10-01'), []);
});

test('day sonuçları birbirinden bağımsız kopyalardır', async () => {
    const first = await mockSource.day('2026-09-24');
    const packageAppointment = first.find((appointment) => appointment.info?.pkg);
    assert.ok(packageAppointment?.info?.pkg);

    packageAppointment.info.pkg.used = 99;
    first.pop();

    const second = await mockSource.day('2026-09-24');
    const freshPackage = second.find((appointment) => appointment.info?.pkg)?.info?.pkg;
    assert.equal(second.length, 3);
    assert.equal(freshPackage?.used, 3);
});

test('range iki sınırı da dahil eder ve boş günleri sayaçtan çıkarır', async () => {
    assert.deepEqual(
        await mockSource.range('2026-09-22', '2026-09-28'),
        {
            '2026-09-22': 1,
            '2026-09-23': 3,
            '2026-09-24': 3,
            '2026-09-25': 3,
            '2026-09-26': 3,
            '2026-09-28': 1,
        },
    );
    assert.deepEqual(await mockSource.range('2026-09-24', '2026-09-24'), {
        '2026-09-24': 3,
    });
});
