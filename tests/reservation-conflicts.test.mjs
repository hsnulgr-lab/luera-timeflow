import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getReservationConflictError } from '../src/lib/reservationErrors.ts';

const minutes = (value) => {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
};

// Client conflict contract. Intervals are half-open: [start, end). This lets a
// 10:00 appointment begin exactly when the previous one ends at 10:00.
const overlaps = (left, right) =>
  minutes(left.startTime) < minutes(right.endTime)
  && minutes(right.startTime) < minutes(left.endTime);

const findConflict = (reservations, candidate, resourceCapacity = 1) => {
  const relevant = (reservation) =>
    reservation.id !== candidate.excludeId
    && reservation.date === candidate.date
    && reservation.status !== 'cancelled'
    && overlaps(candidate, reservation);

  const targetStaff = candidate.staffId || null;
  const staffConflict = reservations.find((reservation) =>
    (reservation.staffId || null) === targetStaff && relevant(reservation));
  if (staffConflict) return staffConflict;

  if (candidate.resourceId) {
    const resourceConflicts = reservations.filter((reservation) =>
      reservation.resourceId === candidate.resourceId && relevant(reservation));
    if (resourceConflicts.length >= Math.max(1, resourceCapacity)) {
      return resourceConflicts[0];
    }
  }

  return null;
};

const reservation = (overrides = {}) => ({
  id: 'existing',
  date: '2026-07-14',
  startTime: '09:00',
  endTime: '10:00',
  status: 'confirmed',
  staffId: 'doctor-a',
  ...overrides,
});

test('uses half-open time ranges: touching endpoints are available', () => {
  const existing = reservation();

  assert.equal(overlaps(existing, reservation({ startTime: '10:00', endTime: '10:30' })), false);
  assert.equal(overlaps(existing, reservation({ startTime: '08:30', endTime: '09:00' })), false);
  assert.equal(overlaps(existing, reservation({ startTime: '09:59', endTime: '10:30' })), true);
  assert.equal(overlaps(existing, reservation({ startTime: '08:30', endTime: '09:01' })), true);
  assert.equal(overlaps(existing, reservation({ startTime: '09:00', endTime: '10:00' })), true);
});

test('only the same doctor conflicts; unassigned appointments form their own lane', () => {
  const rows = [
    reservation({ id: 'doctor-a-row' }),
    reservation({ id: 'unassigned-row', staffId: undefined }),
  ];

  assert.equal(findConflict(rows, reservation({ id: 'candidate-a' }))?.id, 'doctor-a-row');
  assert.equal(findConflict(rows, reservation({ id: 'candidate-b', staffId: 'doctor-b' })), null);
  assert.equal(findConflict(rows, reservation({ id: 'candidate-free', staffId: undefined }))?.id, 'unassigned-row');
});

test('cancelled rows and the edited row are ignored, completed rows still occupy their slot', () => {
  const candidate = reservation({ id: 'candidate', excludeId: 'edited' });

  assert.equal(findConflict([
    reservation({ id: 'cancelled', status: 'cancelled' }),
    reservation({ id: 'edited' }),
  ], candidate), null);

  assert.equal(findConflict([
    reservation({ id: 'completed', status: 'completed' }),
  ], candidate)?.id, 'completed');
});

test('a physical resource can conflict across doctors and respects capacity', () => {
  const rows = [
    reservation({ id: 'chair-1-a', staffId: 'doctor-a', resourceId: 'chair-1' }),
    reservation({ id: 'chair-1-b', staffId: 'doctor-b', resourceId: 'chair-1' }),
  ];
  const candidate = reservation({
    id: 'doctor-c-row',
    staffId: 'doctor-c',
    resourceId: 'chair-1',
  });

  assert.equal(findConflict(rows.slice(0, 1), candidate, 1)?.id, 'chair-1-a');
  assert.equal(findConflict(rows.slice(0, 1), candidate, 2), null);
  assert.equal(findConflict(rows, candidate, 2)?.id, 'chair-1-a');
});

test('production client keeps the same conflict semantics', () => {
  const source = readFileSync(new URL('../src/hooks/useReservations.ts', import.meta.url), 'utf8');

  assert.match(source, /return startMin < rEnd && rStart < endMin;/);
  assert.match(source, /if \(r\.status === 'cancelled'\) return false;/);
  assert.match(source, /\(r\.staffId \|\| null\) !== target/);
  assert.match(source, /sameResource\.length >= Math\.max\(1, resourceCapacity\)/);
});

test('server conflict outcomes map to actionable staff and resource messages', () => {
  const staff = getReservationConflictError({
    code: '23P01',
    message: 'reservation_staff_conflict',
    details: '{"conflicting_reservation_id":"one"}',
  });
  const resource = getReservationConflictError({
    code: '23P01',
    message: 'reservation_resource_conflict',
    details: '{"conflicting_reservation_id":"two"}',
  });

  assert.equal(staff?.kind, 'staff');
  assert.match(staff?.message ?? '', /personel/i);
  assert.equal(resource?.kind, 'resource');
  assert.match(resource?.message ?? '', /kaynak|ünite/i);
});

test('message-only trigger errors are recognised and unrelated errors are not', () => {
  assert.equal(
    getReservationConflictError({ message: 'reservation_staff_conflict' })?.kind,
    'staff',
  );
  assert.equal(
    getReservationConflictError({ message: 'reservation_resource_conflict' })?.kind,
    'resource',
  );
  assert.equal(getReservationConflictError({ code: '23505', message: 'duplicate key' }), null);
});

test('database migration exposes the documented atomic conflict contract', () => {
  const migration = readFileSync(
    new URL('../supabase/060_reservation_conflict_guard.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /FUNCTION public\.enforce_reservation_conflicts\(\)/);
  assert.match(migration, /CREATE TRIGGER trg_reservations_conflict_guard/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /tsrange\(v_start_at, v_end_at, '\[\)'\)/);
  assert.match(migration, /ERRCODE = '23P01',[\s\S]*?MESSAGE = 'reservation_staff_conflict'/);
  assert.match(migration, /ERRCODE = '23P01',[\s\S]*?MESSAGE = 'reservation_resource_conflict'/);
  assert.match(migration, /v_overlap_count >= v_resource_capacity/);
});

test('linking a patient is not treated as an occupancy change', () => {
  const migration = readFileSync(
    new URL('../supabase/060_reservation_conflict_guard.sql', import.meta.url),
    'utf8',
  );
  const occupancyFastPath = migration.match(
    /-- Tenant bağları[\s\S]*?IF TG_OP = 'UPDATE'([\s\S]*?)RETURN NEW;[\s\S]*?END IF;/,
  )?.[1] ?? '';

  assert.ok(occupancyFastPath, 'customer-only UPDATE fast path is missing');
  assert.doesNotMatch(occupancyFastPath, /customer_id/);
  assert.match(occupancyFastPath, /staff_id/);
  assert.match(occupancyFastPath, /resource_id/);
  assert.match(occupancyFastPath, /start_time/);
});
