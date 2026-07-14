import assert from 'node:assert/strict';
import test from 'node:test';
import { apptPhase, primaryAction } from '../src/lib/appointmentFlow.ts';

test('pending appointment must be confirmed before arrival', () => {
  const phase = apptPhase({ status: 'pending' });
  assert.equal(phase, 'pending');
  assert.deepEqual(primaryAction(phase), { kind: 'confirm', label: 'Randevuyu Onayla' });
});

test('confirmed appointment advances through arrival and completion', () => {
  assert.equal(apptPhase({ status: 'confirmed' }), 'upcoming');
  assert.equal(apptPhase({ status: 'confirmed', arrivedAt: '2026-07-14T09:00:00Z' }), 'inService');
  assert.equal(apptPhase({ status: 'completed', arrivedAt: '2026-07-14T09:00:00Z' }), 'done');
  assert.equal(primaryAction('upcoming').kind, 'arrive');
  assert.equal(primaryAction('inService').kind, 'completePay');
});

test('cancelled appointment never exposes a primary action', () => {
  assert.equal(apptPhase({ status: 'cancelled', arrivedAt: '2026-07-14T09:00:00Z' }), 'cancelled');
  assert.equal(primaryAction('cancelled').kind, 'none');
});
