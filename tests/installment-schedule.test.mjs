import assert from 'node:assert/strict';
import test from 'node:test';
import { installmentDueDate, splitInstallmentAmounts } from '../src/lib/installmentSchedule.ts';

test('splits installment amounts in cents without losing the total', () => {
  assert.deepEqual(splitInstallmentAmounts(30_000, 3), [10_000, 10_000, 10_000]);
  assert.deepEqual(splitInstallmentAmounts(100, 3), [33.34, 33.33, 33.33]);
  assert.equal(
    Math.round(splitInstallmentAmounts(100, 3).reduce((sum, amount) => sum + amount, 0) * 100),
    10_000,
  );
});

test('monthly schedules clamp the 31st to the end of short months', () => {
  assert.equal(installmentDueDate('2026-01-31', 0, 'monthly'), '2026-01-31');
  assert.equal(installmentDueDate('2026-01-31', 1, 'monthly'), '2026-02-28');
  assert.equal(installmentDueDate('2026-01-31', 2, 'monthly'), '2026-03-31');
  assert.equal(installmentDueDate('2028-01-31', 1, 'monthly'), '2028-02-29');
});

test('weekly schedules preserve seven-day intervals across month boundaries', () => {
  assert.equal(installmentDueDate('2026-07-28', 0, 'weekly'), '2026-07-28');
  assert.equal(installmentDueDate('2026-07-28', 1, 'weekly'), '2026-08-04');
  assert.equal(installmentDueDate('2026-07-28', 2, 'weekly'), '2026-08-11');
});

test('invalid schedules are rejected before rows are generated', () => {
  assert.throws(() => splitInstallmentAmounts(1, 101), /invalid_installment_amount/);
  assert.throws(() => splitInstallmentAmounts(Number.NaN, 3), /invalid_installment_amount/);
  assert.throws(() => installmentDueDate('not-a-date', 0, 'monthly'), /invalid_installment_due_date/);
  assert.throws(() => installmentDueDate('2026-02-31', 0, 'monthly'), /invalid_installment_due_date/);
});
