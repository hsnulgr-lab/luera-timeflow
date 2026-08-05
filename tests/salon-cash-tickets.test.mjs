import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSalonCashTickets, ticketContaining } from '../src/lib/salonCashTickets.ts';

const reservation = (overrides = {}) => ({
  id: 'r-1',
  customerId: 'customer-1',
  customerName: 'Ada Yılmaz',
  customerPhone: '5551112233',
  date: '2026-07-30',
  startTime: '10:00',
  endTime: '10:30',
  service: 'Saç Kesimi',
  status: 'completed',
  isPaid: false,
  createdAt: '2026-07-30T07:00:00.000Z',
  ...overrides,
});

test('tek tamamlanmış randevuyu tek kasa hesabına dönüştürür', () => {
  const tickets = buildSalonCashTickets([reservation()]);

  assert.equal(tickets.length, 1);
  assert.equal(tickets[0].key, 'reservation:r-1');
  assert.deepEqual(tickets[0].reservationIds, ['r-1']);
  assert.equal(tickets[0].serviceSummary, 'Saç Kesimi');
  assert.equal(tickets[0].isPaid, false);
});

test('groupId hizmetlerini kronolojik tek hesapta birleştirir', () => {
  const tickets = buildSalonCashTickets([
    reservation({
      id: 'r-color',
      groupId: 'visit-42',
      startTime: '10:30',
      endTime: '11:30',
      service: 'Boya',
      staffName: 'Ece',
    }),
    reservation({
      id: 'r-cut',
      groupId: 'visit-42',
      startTime: '10:00',
      endTime: '10:30',
      service: 'Saç Kesimi',
      staffName: 'Deniz',
    }),
  ]);

  assert.equal(tickets.length, 1);
  assert.equal(tickets[0].key, 'group:visit-42');
  assert.equal(tickets[0].representative.id, 'r-cut');
  assert.deepEqual(tickets[0].reservationIds, ['r-cut', 'r-color']);
  assert.equal(tickets[0].serviceSummary, 'Saç Kesimi + Boya');
  assert.deepEqual(tickets[0].staffNames, ['Deniz', 'Ece']);
  assert.equal(ticketContaining(tickets, 'r-color')?.key, 'group:visit-42');
});

test('çoklu ziyaretin bütün aktif hizmetleri bitmeden kasaya açılmaz', () => {
  const tickets = buildSalonCashTickets([
    reservation({ id: 'r-cut', groupId: 'visit-42' }),
    reservation({ id: 'r-color', groupId: 'visit-42', status: 'confirmed' }),
  ]);

  assert.deepEqual(tickets, []);
});

test('iptal edilen grup üyesi tahsilatı engellemez', () => {
  const tickets = buildSalonCashTickets([
    reservation({ id: 'r-cut', groupId: 'visit-42' }),
    reservation({ id: 'r-cancelled', groupId: 'visit-42', status: 'cancelled' }),
  ]);

  assert.equal(tickets.length, 1);
  assert.deepEqual(tickets[0].reservationIds, ['r-cut']);
});

test('grup ancak bütün hizmet satırları ödendiğinde kapanmış sayılır', () => {
  const mixed = buildSalonCashTickets([
    reservation({ id: 'r-cut', groupId: 'visit-42', isPaid: true }),
    reservation({ id: 'r-color', groupId: 'visit-42', isPaid: false }),
  ]);
  const paid = buildSalonCashTickets([
    reservation({ id: 'r-cut', groupId: 'visit-42', isPaid: true }),
    reservation({ id: 'r-color', groupId: 'visit-42', isPaid: true }),
  ]);

  assert.equal(mixed[0].isPaid, false);
  assert.equal(paid[0].isPaid, true);
});
