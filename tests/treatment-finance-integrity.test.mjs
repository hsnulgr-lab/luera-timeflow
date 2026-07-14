import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/061_treatment_finance_integrity.sql', import.meta.url),
  'utf8',
);
const regression = readFileSync(
  new URL('../supabase/tests/treatment_finance_regression.sql', import.meta.url),
  'utf8',
);
const installmentHook = readFileSync(
  new URL('../src/hooks/useInstallmentSchedules.ts', import.meta.url),
  'utf8',
);

test('finance guards use fixed-security trigger functions and a common plan-row lock', () => {
  for (const functionName of [
    'enforce_treatment_plan_integrity',
    'enforce_treatment_installment_integrity',
    'enforce_treatment_payment_integrity',
  ]) {
    assert.match(migration, new RegExp(`FUNCTION public\\.${functionName}\\(\\)[\\s\\S]*?SECURITY DEFINER`));
  }

  assert.equal(
    (migration.match(/SET search_path = pg_catalog, public, pg_temp/g) ?? []).length,
    3,
  );
  assert.match(migration, /FROM public\.treatment_plans AS locked_plan[\s\S]*?FOR UPDATE/);
  assert.match(migration, /ORDER BY candidate\.plan_id/);
  assert.match(migration, /DROP TRIGGER IF EXISTS trg_validate_installment_payment/);
});

test('payment and schedule limits exclude the updated row and enforce positive plan payments', () => {
  assert.match(migration, /payment\.id IS DISTINCT FROM NEW\.id/);
  assert.match(migration, /installment\.id IS DISTINCT FROM NEW\.id/);
  assert.match(migration, /MESSAGE = 'plan_payment_exceeds_balance'/);
  assert.match(migration, /MESSAGE = 'installment_payment_exceeds_balance'/);
  assert.match(migration, /MESSAGE = 'treatment_schedule_exceeds_plan_balance'/);
  assert.match(migration, /MESSAGE = 'installment_amount_below_paid'/);
  assert.match(migration, /RAISE EXCEPTION 'plan_payment_requires_installment'/);
  assert.match(migration, /NEW\.amount <= 0[\s\S]*?plan_payment_amount_must_be_positive/);
  assert.match(installmentHook, /treatment_schedule_exceeds_plan_balance/);
});

test('legacy repair is deterministic and missing inline foreign keys are restored safely', () => {
  assert.match(migration, /UPDATE public\.treatment_plans AS plan[\s\S]*?SET staff_id = NULL[\s\S]*?doctor\.role = 'doctor'/);
  assert.match(migration, /SELECT DISTINCT ON \(treatment_plan_id\)[\s\S]*?ORDER BY treatment_plan_id, source_priority, source_at, source_id/);
  assert.match(migration, /SET reservation_id = NULL[\s\S]*?reservation\.customer_id = plan\.customer_id/);
  assert.match(migration, /fk_061_treatment_plans_reservation[\s\S]*?NOT VALID/);
  assert.match(migration, /fk_061_treatment_plans_created_by[\s\S]*?NOT VALID/);
  assert.match(migration, /fk_061_payments_created_by[\s\S]*?NOT VALID/);
  assert.match(migration, /fk_061_payments_installment[\s\S]*?NOT VALID/);
  assert.match(migration, /ALTER TABLE public\.payments VALIDATE CONSTRAINT/);
});

test('database regression covers scope, caps, self exclusion and FK cascade behavior', () => {
  for (const contract of [
    'treatment_plan_staff_scope_or_role_mismatch',
    'payment_scope_mismatch',
    'treatment_schedule_exceeds_plan_balance',
    'plan_payment_requires_installment',
    'installment_payment_exceeds_balance',
    'installment_amount_below_paid',
    'plan_payment_exceeds_balance',
    'installment_with_payments_cannot_be_deleted',
  ]) {
    assert.match(regression, new RegExp(contract));
  }

  assert.match(regression, /payment UPDATE must exclude itself from plan sum/);
  assert.match(regression, /installment UPDATE must exclude itself from schedule sum/);
  assert.match(regression, /plan DELETE did not clear payment treatment references/);
  assert.match(regression, /ROLLBACK;/);
});
