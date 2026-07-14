import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeStaffRole,
  permissionsForStaffRole,
} from '../src/lib/staffPermissions.ts';

test('doctor can run the complete appointment and clinical workflow', () => {
  const permissions = permissionsForStaffRole('doctor');
  for (const permission of [
    'appointments:view-own',
    'appointments:create',
    'appointments:update-own',
    'dental-chart:edit',
    'treatment-plans:edit',
    'payments:collect',
  ]) {
    assert.ok(permissions.includes(permission));
  }
  assert.ok(!permissions.includes('appointments:view-all'));
});

test('assistant and cashier retain read/operations scope without clinical editing', () => {
  const assistant = permissionsForStaffRole('assistant');
  assert.ok(assistant.includes('appointments:update-all'));
  assert.ok(assistant.includes('dental-chart:view'));
  assert.ok(!assistant.includes('dental-chart:edit'));
  assert.ok(!assistant.includes('payments:collect'));

  const cashier = permissionsForStaffRole('cashier');
  assert.ok(cashier.includes('payments:collect'));
  assert.ok(!cashier.includes('appointments:update-all'));
  assert.ok(!cashier.includes('dental-chart:edit'));
});

test('legacy specialties infer safe roles and assistant wins over doctor wording', () => {
  assert.equal(normalizeStaffRole(undefined, 'Diş hekimi'), 'doctor');
  assert.equal(normalizeStaffRole(undefined, 'Diş hekimi asistanı'), 'assistant');
  assert.equal(normalizeStaffRole(undefined, 'Vezne'), 'cashier');
  assert.equal(normalizeStaffRole(undefined, 'Genel personel'), 'staff');
});
