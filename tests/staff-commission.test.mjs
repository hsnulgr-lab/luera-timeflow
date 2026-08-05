import assert from 'node:assert/strict';
import test from 'node:test';
import { commissionFor, monthRange } from '../src/lib/staffCommission.ts';

const payment = (overrides = {}) => ({
  id: 'p-1',
  organizationId: 'org-1',
  staffId: 'staff-1',
  type: 'service',
  amount: 1000,
  method: 'cash',
  paidAt: '2026-07-15T09:00:00.000Z',
  createdAt: '2026-07-15T09:00:00.000Z',
  ...overrides,
});

const reservation = (overrides = {}) => ({
  id: 'r-1',
  customerId: 'c-1',
  customerName: 'Ada Yılmaz',
  customerPhone: '5551112233',
  date: '2026-07-15',
  startTime: '10:00',
  endTime: '10:30',
  service: 'Saç Kesimi',
  status: 'completed',
  createdAt: '2026-07-15T07:00:00.000Z',
  ...overrides,
});

test('prim yalnız o personele bağlı tahsilatlardan hesaplanır', () => {
  const summary = commissionFor({ id: 'staff-1', commissionRate: 40 }, {
    payments: [
      payment({ id: 'p-1', amount: 1000 }),
      payment({ id: 'p-2', amount: 500 }),
      payment({ id: 'p-3', amount: 9000, staffId: 'staff-2' }),
    ],
  });
  assert.equal(summary.revenue, 1500);
  assert.equal(summary.commission, 600);
  assert.equal(summary.count, 2);
  assert.equal(summary.rate, 40);
});

test('oran tanımsız ya da sıfırsa prim üretilmez ama ciro yine okunur', () => {
  const none = commissionFor({ id: 'staff-1' }, { payments: [payment()] });
  assert.equal(none.rate, 0);
  assert.equal(none.commission, 0);
  assert.equal(none.revenue, 1000);
});

test('dönem dışındaki tahsilatlar prime girmez', () => {
  const summary = commissionFor({ id: 'staff-1', commissionRate: 50 }, {
    payments: [
      payment({ id: 'p-1', amount: 400, paidAt: '2026-06-30T20:00:00.000Z' }),
      payment({ id: 'p-2', amount: 600, paidAt: '2026-07-01T08:00:00.000Z' }),
      payment({ id: 'p-3', amount: 200, paidAt: '2026-08-01T08:00:00.000Z' }),
    ],
    range: { from: '2026-07-01', to: '2026-07-31' },
  });
  assert.equal(summary.revenue, 600);
  assert.equal(summary.commission, 300);
  assert.equal(summary.count, 1);
});

test('oran 0–100 aralığına sıkıştırılır; bozuk veri primi şişirmez', () => {
  const over = commissionFor({ id: 'staff-1', commissionRate: 450 }, { payments: [payment({ amount: 1000 })] });
  assert.equal(over.rate, 100);
  assert.equal(over.commission, 1000);

  const negative = commissionFor({ id: 'staff-1', commissionRate: -20 }, { payments: [payment({ amount: 1000 })] });
  assert.equal(negative.rate, 0);
  assert.equal(negative.commission, 0);
});

test('prim indirimli ciro üzerinden hesaplanır — baz tahsil edilen paradır', () => {
  const summary = commissionFor({ id: 'staff-1', commissionRate: 35 }, { payments: [payment({ amount: 800 })] });
  assert.equal(summary.commission, 280);
});

// ── Çoklu hizmetli ziyaret ───────────────────────────────────────────────────
// Kesim A'da (400₺), boya B'de (600₺). Kasada tek hesap, tek tahsilat ve
// tahsilatta staff_id boş — pay randevu satırlarından çözülmeli.
const group = [
  reservation({ id: 'r-kesim', groupId: 'g-1', service: 'Saç Kesimi', staffId: 'staff-1' }),
  reservation({ id: 'r-boya', groupId: 'g-1', service: 'Boya', staffId: 'staff-2', startTime: '10:30', endTime: '11:30' }),
];
const services = [
  { id: 's-kesim', name: 'Saç Kesimi', price: 400, duration: 30, color: '#000' },
  { id: 's-boya', name: 'Boya', price: 600, duration: 60, color: '#111' },
];

test('çoklu hizmetli ziyaret tahsilatı satır ücretleri oranında paylaşılır', () => {
  const payments = [payment({ id: 'p-1', staffId: undefined, reservationId: 'r-kesim', amount: 1000 })];
  const kesimci = commissionFor({ id: 'staff-1', commissionRate: 50 }, { payments, reservations: group, services });
  const boyaci = commissionFor({ id: 'staff-2', commissionRate: 50 }, { payments, reservations: group, services });

  assert.equal(kesimci.revenue, 400);
  assert.equal(kesimci.commission, 200);
  assert.equal(boyaci.revenue, 600);
  assert.equal(boyaci.commission, 300);
  // Tek kuruş kaybolmuyor: paylar tahsil edilen tutarı veriyor.
  assert.equal(kesimci.revenue + boyaci.revenue, 1000);
});

test('ziyarete indirim uygulandıysa indirim de orantılı paylaşılır', () => {
  // 1000₺'lik ziyaret 800₺'ye kapandı — herkes kendi payı oranında düşer.
  const payments = [payment({ id: 'p-1', staffId: undefined, reservationId: 'r-boya', amount: 800 })];
  const kesimci = commissionFor({ id: 'staff-1', commissionRate: 50 }, { payments, reservations: group, services });
  const boyaci = commissionFor({ id: 'staff-2', commissionRate: 50 }, { payments, reservations: group, services });

  assert.equal(kesimci.revenue, 320);
  assert.equal(boyaci.revenue, 480);
  assert.equal(kesimci.revenue + boyaci.revenue, 800);
});

test('iptal edilen satır paydaya girmez', () => {
  const withCancelled = [
    ...group,
    reservation({ id: 'r-fon', groupId: 'g-1', service: 'Fön', staffId: 'staff-3', status: 'cancelled' }),
  ];
  const payments = [payment({ id: 'p-1', staffId: undefined, reservationId: 'r-kesim', amount: 1000 })];
  const iptalEdilen = commissionFor({ id: 'staff-3', commissionRate: 50 }, {
    payments, reservations: withCancelled, services,
  });
  assert.equal(iptalEdilen.revenue, 0);
  assert.equal(iptalEdilen.count, 0);
});

test('tahsilattaki staff_id dağıtımı ezer — açık atama her zaman kazanır', () => {
  const payments = [payment({ id: 'p-1', staffId: 'staff-2', reservationId: 'r-kesim', amount: 1000 })];
  const boyaci = commissionFor({ id: 'staff-2', commissionRate: 10 }, { payments, reservations: group, services });
  assert.equal(boyaci.revenue, 1000);
});

test('personelsiz ve randevusuz kasa hareketi prime girmez', () => {
  const summary = commissionFor({ id: 'staff-1', commissionRate: 50 }, {
    payments: [payment({ id: 'p-1', staffId: undefined, reservationId: undefined, amount: 5000 })],
    reservations: group,
    services,
  });
  assert.equal(summary.revenue, 0);
  assert.equal(summary.count, 0);
});

test('ücreti tanımsız satırlar payı eşit böler', () => {
  const payments = [payment({ id: 'p-1', staffId: undefined, reservationId: 'r-kesim', amount: 900 })];
  const a = commissionFor({ id: 'staff-1', commissionRate: 100 }, { payments, reservations: group, services: [] });
  const b = commissionFor({ id: 'staff-2', commissionRate: 100 }, { payments, reservations: group, services: [] });
  assert.equal(a.revenue, 450);
  assert.equal(b.revenue, 450);
});

test('ay aralığı ayın ilk ve son gününü kapsar', () => {
  assert.deepEqual(
    { from: monthRange(new Date(2026, 1, 12)).from, to: monthRange(new Date(2026, 1, 12)).to },
    { from: '2026-02-01', to: '2026-02-28' },
  );
  assert.deepEqual(
    { from: monthRange(new Date(2026, 11, 3)).from, to: monthRange(new Date(2026, 11, 3)).to },
    { from: '2026-12-01', to: '2026-12-31' },
  );
});
