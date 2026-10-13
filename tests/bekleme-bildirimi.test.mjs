/**
 * BEKLEME BİTTİ BİLDİRİMİ (2026-10-13).
 *
 * Kullanıcı: "Bekleme süresi dolunca bildirim gelsin." Bildirimi telefonun
 * kendisi kuruyor (sunucuda zamanlayıcı yok): bekleme kurulurken bitiş anına,
 * kaldırılınca ve iş bitince siliniyor, sunucunun saati gelince ona çekiliyor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { waitAlarmDue, waitAlarmId, waitAlarmText } from '../mobile/src/lib/waitAlarm.ts';

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

test('kilit ekranında yalnız ilk ad, hizmet ve süre', () => {
    assert.deepEqual(waitAlarmText({ customerName: 'Tuğçe Erden', service: 'Kalıcı Makyaj', minutes: 20 }), {
        title: 'Bekleme bitti ⏱',
        body: 'Tuğçe · Kalıcı Makyaj · 20 dk doldu',
    });
    assert.equal(waitAlarmText({ customerName: '  ', service: 'Boya', minutes: 30 }).body, 'Müşteri · Boya · 30 dk doldu');
});

test('randevu başına tek bildirim — yeni bekleme eskisinin yerine geçiyor', () => {
    assert.equal(waitAlarmId('abc'), 'bekleme-abc');
    const device = code('src/lib/waitAlarmDevice.ts');
    assert.match(device, /scheduleNotificationAsync\(\{\s*identifier,/);
    assert.match(device, /type: Notifications\.SchedulableTriggerInputTypes\.DATE,\s*date: new Date\(input\.endsAt\),/);
    assert.match(device, /channelId: 'randevu',/);
    assert.match(device, /sound: 'default'/);
    // İzin burada SORULMUYOR (bildirim kararı 5).
    assert.doesNotMatch(device, /requestPermissionsAsync/);
});

test('geçmişe kurulmuyor — bitmiş beklemeye "bitti" demek ikinci kez söylemek', () => {
    const now = 1_000_000;
    assert.equal(waitAlarmDue(now + 60_000, now), true);
    assert.equal(waitAlarmDue(now + 500, now), false);
    assert.equal(waitAlarmDue(now - 1, now), false);
    assert.equal(waitAlarmDue(Number.NaN, now), false);
    assert.match(code('src/lib/waitAlarmDevice.ts'), /if \(!waitAlarmDue\(input\.endsAt, Date\.now\(\)\)\) \{\s*await Notifications\.cancelScheduledNotificationAsync\(identifier\);/);
});

test('kumanda: kurulunca kuruyor, sunucu saatine çekiyor; kaldırılınca ve bitince siliyor', () => {
    const kumanda = code('app/(staff-flow)/kumanda.tsx');
    assert.match(kumanda, /void armWaitAlarm\(\{ \.\.\.alarm, endsAt \}\);/);
    assert.match(kumanda, /void armWaitAlarm\(\{ \.\.\.alarm, endsAt: serverEnds \}\);/);
    // Halkaya dokunup beklemeyi kaldırmak.
    assert.match(kumanda, /rememberWait\(appointment\.id, null\);\s*void disarmWaitAlarm\(appointment\.id\);\s*void writeVisitWait\(appointment\.id, null\)/);
    // İşi bitirmek.
    assert.match(kumanda, /setEndedAt\(new Date\(\)\.toISOString\(\)\);[\s\S]{0,200}void disarmWaitAlarm\(appointment\.id\);/);
    assert.equal((kumanda.match(/disarmWaitAlarm\(/g) || []).length, 2);
});

test('kilit ekranı kuralı ve dokunma: adres yok, kabuğun kökü (Gün\'de BEKLEMEDE kartı)', () => {
    const device = code('src/lib/waitAlarmDevice.ts');
    assert.doesNotMatch(device, /url:/);
});
