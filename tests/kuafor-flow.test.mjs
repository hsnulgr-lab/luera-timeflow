import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  isKuaforColorService,
  isKuaforWashUnit,
  kuaforLiveStageOf,
  kuaforStageOf,
  KF_STAGE_KEY,
  KF_TIMER_KEY,
} from '../src/lib/kuaforFlow.ts';

// Kuaför yüzlerinin (dashboard + takvim + rezervasyonlar) paylaştığı akış
// kurallarının gerçek davranış testi. Üç yüzey aynı randevu için farklı aşama
// gösterirse salon ekranları birbiriyle çelişir.

const reservationsPage = readFileSync(
  new URL('../src/components/kuafor/KuaforReservationsPage.tsx', import.meta.url),
  'utf8',
);

const base = {
  id: 'r1',
  date: '2026-07-30',
  startTime: '10:00',
  endTime: '11:00',
  service: 'Saç Kesimi',
  status: 'confirmed',
};

const NOW = new Date('2026-07-30T10:05:00');

test('salon akışı zaman damgalarından türetilir', () => {
  assert.equal(kuaforStageOf(base), null);
  assert.equal(kuaforStageOf({ ...base, customerArrivedAt: '2026-07-30T10:01:00Z' }), 'waiting');
  assert.equal(kuaforStageOf({ ...base, arrivedAt: '2026-07-30T10:10:00Z' }), 'service');
  assert.equal(kuaforStageOf({
    ...base,
    arrivedAt: '2026-07-30T10:10:00Z',
    customFields: { [KF_STAGE_KEY]: 'processing', [KF_TIMER_KEY]: '2026-07-30T10:40:00Z' },
  }), 'processing');
  assert.equal(kuaforStageOf({
    ...base,
    arrivedAt: '2026-07-30T10:10:00Z',
    customFields: { [KF_STAGE_KEY]: 'finish' },
  }), 'finish');
});

test('hizmet bitti ama tahsilat yok → kasa aşaması; tahsilat da yapıldı → kapandı', () => {
  assert.equal(kuaforStageOf({ ...base, status: 'completed', isPaid: false }), 'checkout');
  assert.equal(kuaforLiveStageOf({ ...base, status: 'completed', isPaid: false }, { now: NOW }), 'checkout');
  assert.equal(kuaforLiveStageOf({ ...base, status: 'completed', isPaid: true }, { now: NOW }), 'completed');
});

test('canlı görünüm salon dışı durumları da kapsar', () => {
  assert.equal(kuaforLiveStageOf({ ...base, status: 'cancelled' }, { now: NOW }), 'cancelled');
  assert.equal(kuaforLiveStageOf({ ...base, status: 'pending' }, { now: NOW }), 'pending');
  assert.equal(kuaforLiveStageOf(base, { now: NOW }), 'confirmed');
});

test('gelmedi türetilmiştir: tolerans geçince görünür, geç geliş onu geri alır', () => {
  const late = new Date('2026-07-30T13:00:00');
  // Varsayılan tolerans 2 saat: 10:00 randevusu 13:00'te gelmedi sayılır.
  assert.equal(kuaforLiveStageOf(base, { now: late }), 'missed');
  // Tolerans yükseltilirse randevu hâlâ planlıdır.
  assert.equal(kuaforLiveStageOf(base, { now: late, toleranceMin: 240 }), 'confirmed');
  // Geç gelen müşteri damgalanınca randevu salon akışına döner.
  assert.equal(
    kuaforLiveStageOf({ ...base, customerArrivedAt: '2026-07-30T12:55:00Z' }, { now: late }),
    'waiting',
  );
  // İptal ve tamamlanan randevular hiçbir zaman 'gelmedi' olmaz.
  assert.equal(kuaforLiveStageOf({ ...base, status: 'cancelled' }, { now: late }), 'cancelled');
  assert.equal(kuaforLiveStageOf({ ...base, status: 'completed', isPaid: true }, { now: late }), 'completed');
});

test('boya süresi yalnız renk işlemlerinde, yıkama ünitesi koltuktan ayrışır', () => {
  for (const name of ['Dip Boya', 'Balyaj', 'Röfle', 'Keratin Bakım', 'Toner']) {
    assert.equal(isKuaforColorService(name), true, name);
  }
  for (const name of ['Saç Kesimi', 'Fön', 'Sakal Tıraşı']) {
    assert.equal(isKuaforColorService(name), false, name);
  }
  assert.equal(isKuaforWashUnit('Yıkama 1'), true);
  assert.equal(isKuaforWashUnit('Koltuk 2', 'Wash station'), true);
  assert.equal(isKuaforWashUnit('Koltuk 2', 'Koltuk'), false);
});

test('kasaya gönderme tahsilat durumuna dokunmaz', () => {
  // Peşin ödemiş müşteriyi "ödenmedi" yapmak parayı kayıp gösterirdi.
  const finishPatch = reservationsPage.slice(
    reservationsPage.indexOf("if (stage === 'finish')"),
    reservationsPage.indexOf("if (stage === 'checkout')"),
  )
    // Yorum satırları alanın kendisi değil — gerekçe metni isPaid'i anıyor.
    .split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  assert.match(finishPatch, /serviceEndedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(finishPatch, /status: 'completed'/);
  assert.doesNotMatch(finishPatch, /isPaid/);
});
