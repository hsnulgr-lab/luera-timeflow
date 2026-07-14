import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  canConfirmStaffAppointment,
  canTreatStaffAppointment,
  canViewStaffAppointment,
} from '../src/lib/staffAppointmentAccess.ts';

const actor = (staffId, role, permissions) => ({
  staffId,
  role,
  can: (permission) => permissions.includes(permission),
});

const pending = { staffId: 'doctor-a', status: 'pending', arrivedAt: undefined };

test('a doctor can view and confirm only their own pending appointment', () => {
  const doctorA = actor('doctor-a', 'doctor', [
    'appointments:view-own',
    'appointments:update-own',
  ]);
  const doctorB = actor('doctor-b', 'doctor', [
    'appointments:view-own',
    'appointments:update-own',
  ]);

  assert.equal(canViewStaffAppointment(pending, doctorA), true);
  assert.equal(canConfirmStaffAppointment(pending, doctorA), true);
  assert.equal(canTreatStaffAppointment({ ...pending, status: 'confirmed' }, doctorA), true);
  assert.equal(canViewStaffAppointment(pending, doctorB), false);
  assert.equal(canConfirmStaffAppointment(pending, doctorB), false);
  assert.equal(canTreatStaffAppointment({ ...pending, status: 'confirmed' }, doctorB), false);
});

test('assistant confirmation and cashier access follow their explicit permissions', () => {
  const assistant = actor('assistant-a', 'assistant', [
    'appointments:view-all',
    'appointments:update-all',
  ]);
  const cashier = actor('cashier-a', 'cashier', ['appointments:view-all']);

  assert.equal(canConfirmStaffAppointment(pending, assistant), true);
  assert.equal(canTreatStaffAppointment({ ...pending, status: 'confirmed' }, assistant), false);
  assert.equal(canViewStaffAppointment(pending, cashier), true);
  assert.equal(canConfirmStaffAppointment(pending, cashier), false);
  assert.equal(canTreatStaffAppointment({ ...pending, status: 'confirmed' }, cashier), false);
});

test('generic staff can still run their own non-dental service appointment', () => {
  const member = actor('staff-a', 'staff', [
    'appointments:view-own',
    'appointments:update-own',
  ]);
  const appointment = { staffId: 'staff-a', status: 'confirmed', arrivedAt: undefined };

  assert.equal(canViewStaffAppointment(appointment, member), true);
  assert.equal(canTreatStaffAppointment(appointment, member), true);
});

test('cancelled and already-started pending records cannot be confirmed or treated', () => {
  const doctor = actor('doctor-a', 'doctor', [
    'appointments:view-own',
    'appointments:update-own',
  ]);

  assert.equal(canConfirmStaffAppointment({ ...pending, status: 'cancelled' }, doctor), false);
  assert.equal(canTreatStaffAppointment({ ...pending, status: 'cancelled' }, doctor), false);
  assert.equal(canConfirmStaffAppointment({ ...pending, arrivedAt: '2026-07-14T09:00:00Z' }, doctor), false);
});

test('staff home reuses the mobile creation flow and locks doctors to themselves', () => {
  const home = readFileSync(new URL('../src/mobile/staff/MobileStaffHome.tsx', import.meta.url), 'utf8');
  const creation = readFileSync(new URL('../src/mobile/pages/MobileNewReservation.tsx', import.meta.url), 'utf8');
  const detail = readFileSync(new URL('../src/mobile/staff/MobileServiceDetail.tsx', import.meta.url), 'utf8');

  assert.match(home, /can\('appointments:create'\)/);
  assert.match(home, /creatingAppointment && canCreateAppointments/);
  assert.match(home, /<MobileNewReservation[\s\S]*?lockedStaffId=\{staff\?\.role === 'doctor' \? staff\.id : undefined\}/);
  assert.match(creation, /!lockedStaffId \|\| s\.id === lockedStaffId/);
  assert.match(creation, /onClose \? onClose\(\) : navigate\(-1\)/);
  assert.match(detail, /phase !== 'cancelled' && phase !== 'done' && !canTreat/);
});
