import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clockMin, addMinutesToTime, staffWorksAt, resolveSlot, resolveSlotStaff, findAvailableSlots,
} from '../src/lib/slotResolution.ts';

// Takvim ve Sağlık/Klinik dashboard'unun paylaştığı slot kurallarının GERÇEK
// davranış testi (string eşleşmesi değil). Kural gövdesi bu dosyadan çıkarıldığı
// için iki yüzey de bu sonuçlara uyar.

const HOURS = Array.from({ length: 7 }, (_, day) => ({
  day, dayName: '', start: '09:00', end: '17:00', isOff: false,
}));

const staffOf = (id, name, overrides = {}) => ({
  id, name, organizationId: 'o', role: 'doctor', color: '#000',
  isActive: true, createdAt: '', ...overrides,
});

const resOf = (id, name, capacity = 1) => ({
  id, name, organizationId: 'o', type: 'Oda', capacity, isActive: true, sort: 0, createdAt: '',
});

const apptOf = (over) => ({
  id: 'r1', customerId: 'c1', customerName: 'Test Hasta', customerPhone: '05321112233',
  date: '2026-08-05', startTime: '10:00', endTime: '10:30', service: 'Muayene',
  status: 'confirmed', createdAt: '', ...over,
});

/** Gerçek checkConflict ile aynı sözleşme: aynı personel (ya da ikisi de
 *  atanmamış) içinde örtüşme; ayrıca kaynak kapasitesi. */
const makeCheckConflict = (reservations) => (date, startTime, endTime, excludeId, staffId, resourceId, capacity = 1) => {
  const s = clockMin(startTime), e = clockMin(endTime);
  const overlaps = (r) => r.id !== excludeId && r.date === date && r.status !== 'cancelled'
    && s < clockMin(r.endTime) && clockMin(r.startTime) < e;
  const target = staffId || null;
  const hit = reservations.find((r) => (r.staffId || null) === target && overlaps(r));
  if (hit) return hit;
  if (resourceId) {
    const same = reservations.filter((r) => r.resourceId === resourceId && overlaps(r));
    if (same.length >= Math.max(1, capacity)) return same[0];
  }
  return null;
};

const rulesOf = ({ staff = [], reservations = [], resources = [], timeOff = [], loading = false } = {}) => ({
  staff, staffLoading: loading, timeOff, timeOffLoading: loading,
  workingHours: HOURS, reservations, resources,
  checkConflict: makeCheckConflict(reservations),
  staffWord: 'hekim', resourceTypeLabel: 'Oda',
});

// 2026-08-05 bir Çarşamba (getDay() === 3) — çalışma günü.
const DATE = '2026-08-05';

test('clock helpers', () => {
  assert.equal(clockMin('09:30'), 570);
  assert.equal(addMinutesToTime('09:45', 30), '10:15');
  assert.equal(addMinutesToTime('23:50', 20), '00:10');
});

test('staffWorksAt respects working hours, day off and time off', () => {
  const member = staffOf('s1', 'Dr. Aylin');
  const base = { timeOff: [], workingHours: HOURS };

  assert.equal(staffWorksAt(base, member, DATE, '10:00', '10:30'), true);
  // Çalışma saati dışı
  assert.equal(staffWorksAt(base, member, DATE, '08:00', '08:30'), false);
  assert.equal(staffWorksAt(base, member, DATE, '16:45', '17:30'), false);
  // İzinli gün
  assert.equal(
    staffWorksAt({ ...base, timeOff: [{ staffId: 's1', date: DATE }] }, member, DATE, '10:00', '10:30'),
    false,
  );
  // Personelin kendi takvimi org saatlerini ezer
  const early = staffOf('s2', 'Dr. Cem', {
    workingHours: HOURS.map((h) => ({ ...h, start: '08:00', end: '12:00' })),
  });
  assert.equal(staffWorksAt(base, early, DATE, '08:00', '08:30'), true);
  assert.equal(staffWorksAt(base, early, DATE, '13:00', '13:30'), false);
});

test('a busy doctor is not offered, a free colleague is', () => {
  const staff = [staffOf('s1', 'Dr. Aylin'), staffOf('s2', 'Dr. Cem')];
  const reservations = [apptOf({ id: 'a1', staffId: 's1', startTime: '10:00', endTime: '10:30' })];
  const rules = rulesOf({ staff, reservations });

  // Dolu hekim açıkça istenirse gerekçeli reddedilir
  const busy = resolveSlotStaff(rules, { date: DATE, startTime: '10:00', endTime: '10:30', staffId: 's1' });
  assert.match(busy.issue, /Dr\. Aylin, 10:00–10:30 saatinde dolu/);

  // "Fark etmez" istendiğinde müsait olan çözülür
  const any = resolveSlotStaff(rules, { date: DATE, startTime: '10:00', endTime: '10:30' });
  assert.equal(any.issue, undefined);
  assert.equal(any.staffMember.id, 's2');
});

test('a doctor on leave is never reported as available', () => {
  const rules = rulesOf({
    staff: [staffOf('s1', 'Dr. Aylin')],
    timeOff: [{ staffId: 's1', date: DATE }],
  });
  const requested = resolveSlot(rules, { date: DATE, startTime: '10:00', endTime: '10:30', staffId: 's1' });
  assert.match(requested.issue, /çalışmıyor veya izinli/);

  const any = resolveSlot(rules, { date: DATE, startTime: '10:00', endTime: '10:30' });
  assert.match(any.issue, /Bu saatte uygun hekim yok/);
  assert.equal(findAvailableSlots(rules, { date: DATE, durationMin: 30 }).length, 0);
});

test('a full room blocks the slot even when the doctor is free', () => {
  const staff = [staffOf('s1', 'Dr. Aylin'), staffOf('s2', 'Dr. Cem')];
  const reservations = [apptOf({ id: 'a1', staffId: 's2', resourceId: 'room1', startTime: '10:00', endTime: '10:30' })];
  const rules = rulesOf({ staff, reservations, resources: [resOf('room1', 'Muayene 1')] });

  const blocked = resolveSlot(rules, { date: DATE, startTime: '10:00', endTime: '10:30', staffId: 's1', resourceId: 'room1' });
  assert.match(blocked.issue, /Muayene 1 bu saatte dolu/);

  // Oda seçilmezse aynı saat uygundur — kapasite kuralı yalnız seçili odaya işler
  const free = resolveSlot(rules, { date: DATE, startTime: '10:00', endTime: '10:30', staffId: 's1' });
  assert.equal(free.issue, undefined);
});

test('room capacity greater than one allows parallel bookings', () => {
  const staff = [staffOf('s1', 'A'), staffOf('s2', 'B'), staffOf('s3', 'C')];
  const reservations = [apptOf({ id: 'a1', staffId: 's2', resourceId: 'g1', startTime: '10:00', endTime: '10:30' })];
  const rules = rulesOf({ staff, reservations, resources: [resOf('g1', 'Grup Odası', 2)] });

  assert.equal(
    resolveSlot(rules, { date: DATE, startTime: '10:00', endTime: '10:30', staffId: 's1', resourceId: 'g1' }).issue,
    undefined,
  );
  const second = [...reservations, apptOf({ id: 'a2', staffId: 's3', resourceId: 'g1', startTime: '10:00', endTime: '10:30' })];
  const fullRules = rulesOf({ staff, reservations: second, resources: [resOf('g1', 'Grup Odası', 2)] });
  assert.match(
    resolveSlot(fullRules, { date: DATE, startTime: '10:00', endTime: '10:30', staffId: 's1', resourceId: 'g1' }).issue,
    /Grup Odası bu saatte dolu/,
  );
});

test('unsaved draft lines (cart) block the same doctor', () => {
  const rules = rulesOf({ staff: [staffOf('s1', 'Dr. Aylin')] });
  const cart = [{ staffId: 's1', startTime: '10:00', endTime: '10:30' }];
  const clash = resolveSlot(rules, { date: DATE, startTime: '10:15', endTime: '10:45', staffId: 's1', cart });
  assert.match(clash.issue, /sepetteki başka bir işlemde/);
});

test('availability is never claimed while staff data is still loading', () => {
  const rules = rulesOf({ staff: [staffOf('s1', 'Dr. Aylin')], loading: true });
  assert.match(resolveSlot(rules, { date: DATE, startTime: '10:00', endTime: '10:30' }).issue, /kontrol ediliyor/);
  assert.equal(findAvailableSlots(rules, { date: DATE, durationMin: 30 }).length, 0);
});

test('findAvailableSlots only returns slots that pass resolveSlot', () => {
  const staff = [staffOf('s1', 'Dr. Aylin')];
  const reservations = [
    apptOf({ id: 'a1', staffId: 's1', startTime: '09:00', endTime: '10:00' }),
    apptOf({ id: 'a2', staffId: 's1', startTime: '10:30', endTime: '11:30' }),
  ];
  const rules = rulesOf({ staff, reservations });

  const slots = findAvailableSlots(rules, { date: DATE, durationMin: 30, staffId: 's1', stepMin: 15, limit: 3 });
  assert.ok(slots.length > 0);
  assert.equal(slots[0].startTime, '10:00');           // iki randevunun arasındaki gerçek boşluk
  for (const s of slots) {
    assert.equal(
      resolveSlot(rules, { date: DATE, startTime: s.startTime, endTime: s.endTime, staffId: 's1' }).issue,
      undefined,
      `${s.startTime} uygun değil ama önerildi`,
    );
    assert.equal(s.staffId, 's1');
  }
});

test('slot search honours service duration and the notBefore floor', () => {
  const rules = rulesOf({ staff: [staffOf('s1', 'Dr. Aylin')] });

  const long = findAvailableSlots(rules, { date: DATE, durationMin: 90, stepMin: 30, limit: 1 });
  assert.equal(long[0].startTime, '09:00');
  assert.equal(long[0].endTime, '10:30');              // süre hizmetten gelir

  const later = findAvailableSlots(rules, { date: DATE, durationMin: 30, notBefore: '14:20', stepMin: 15, limit: 1 });
  assert.equal(later[0].startTime, '14:30');           // geçmiş saat önerilmez

  // Gün sonunu taşan süre hiç önerilmez
  assert.equal(findAvailableSlots(rules, { date: DATE, durationMin: 600, stepMin: 30 }).length, 0);
});

test('closed day yields no slots', () => {
  const closed = { ...rulesOf({ staff: [staffOf('s1', 'A')] }), workingHours: HOURS.map((h) => ({ ...h, isOff: true })) };
  assert.equal(findAvailableSlots(closed, { date: DATE, durationMin: 30 }).length, 0);
});

test('legacy unassigned reservations consume only one slot of capacity', () => {
  // staff_id = NULL eski kayıt kliniğin tamamını bloke etmemeli.
  const staff = [staffOf('s1', 'A'), staffOf('s2', 'B')];
  const reservations = [apptOf({ id: 'a1', staffId: undefined, startTime: '10:00', endTime: '10:30' })];
  const rules = rulesOf({ staff, reservations });

  const any = resolveSlotStaff(rules, { date: DATE, startTime: '10:00', endTime: '10:30' });
  assert.equal(any.issue, undefined);
  assert.equal(any.staffMember.id, 's2');   // biri atanmamış kaydın payına düşer
});

test('with no staff at all, conflicts fall back to the whole-business pool', () => {
  const reservations = [apptOf({ id: 'a1', startTime: '10:00', endTime: '10:30' })];
  const rules = rulesOf({ staff: [], reservations });
  const clash = resolveSlot(rules, { date: DATE, startTime: '10:00', endTime: '10:30' });
  assert.match(clash.issue, /Test Hasta · 10:00–10:30 ile çakışıyor/);
  assert.equal(resolveSlot(rules, { date: DATE, startTime: '11:00', endTime: '11:30' }).issue, undefined);
});

test('cancelled reservations never block a slot', () => {
  const reservations = [apptOf({ id: 'a1', staffId: 's1', status: 'cancelled' })];
  const rules = rulesOf({ staff: [staffOf('s1', 'A')], reservations });
  assert.equal(resolveSlot(rules, { date: DATE, startTime: '10:00', endTime: '10:30', staffId: 's1' }).issue, undefined);
});
