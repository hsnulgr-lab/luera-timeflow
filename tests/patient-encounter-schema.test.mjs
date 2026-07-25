import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/062_patient_encounters.sql', import.meta.url), 'utf8');
const dbRegression = readFileSync(new URL('../supabase/tests/patient_encounter_regression.sql', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../src/hooks/usePatientEncounter.ts', import.meta.url), 'utf8');
const types = readFileSync(new URL('../src/types/index.ts', import.meta.url), 'utf8');

test('062 defines one tenant-scoped encounter per reservation and validates reservation context', () => {
  assert.match(migration, /UNIQUE \(organization_id, reservation_id\)/);
  assert.match(migration, /MESSAGE = 'encounter_reservation_scope_mismatch'/);
  assert.match(migration, /MESSAGE = 'encounter_staff_reservation_mismatch'/);
  assert.match(migration, /MESSAGE = 'encounter_reservation_staff_role_mismatch'/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.ensure_patient_encounter/);
  assert.match(migration, /ON CONFLICT \(organization_id, reservation_id\) DO NOTHING/);
  assert.match(migration, /MESSAGE = 'encounter_reservation_staff_locked'/);
  assert.match(migration, /CREATE TRIGGER trg_062_guard_reservation_encounter_staff[\s\S]*BEFORE UPDATE OF staff_id/);
  assert.match(migration, /OLD\.status IN \('scheduled', 'checked_in'\)[\s\S]*NEW\.attending_staff_id := reservation_staff/);
  assert.match(migration, /attending_staff_was_deleted/);
});

test('062 keeps tenant RLS and immutable append-only audit history', () => {
  for (const table of [
    'patient_encounters',
    'patient_encounter_events',
    'clinical_procedures',
    'clinical_procedure_events',
  ]) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(migration, /CREATE TRIGGER trg_062_patient_encounter_events_append_only[\s\S]*BEFORE UPDATE OR DELETE/);
  assert.match(migration, /CREATE TRIGGER trg_062_clinical_procedure_events_append_only[\s\S]*BEFORE UPDATE OR DELETE/);
  assert.match(migration, /MESSAGE = 'clinical_event_is_append_only'/);
  assert.match(migration, /MESSAGE = 'clinical_history_is_append_only'/);
  assert.doesNotMatch(migration, /CREATE POLICY "patient_encounters_delete"/);
  assert.doesNotMatch(migration, /CREATE POLICY "clinical_procedures_delete"/);
});

test('062 connects legacy dental records and treatment plans without replacing existing tables', () => {
  assert.match(migration, /ALTER TABLE public\.dental_records[\s\S]*ADD COLUMN IF NOT EXISTS encounter_id/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS reservation_id/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS created_by UUID DEFAULT auth\.uid\(\)/);
  assert.match(migration, /ALTER TABLE public\.treatment_plans[\s\S]*ADD COLUMN IF NOT EXISTS encounter_id/);
  assert.match(migration, /CREATE TRIGGER trg_062_treatment_plan_encounter_scope\s+BEFORE INSERT OR UPDATE OF encounter_id, organization_id, customer_id, reservation_id/);
  assert.match(migration, /INSERT INTO public\.clinical_procedures[\s\S]*FROM public\.dental_records AS dental/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.normalize_clinical_tooth_number/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.normalize_clinical_tooth_surfaces/);
  assert.match(migration, /public\.normalize_clinical_tooth_number\(dental\.tooth_number\)/);
  assert.match(migration, /public\.normalize_clinical_tooth_surfaces\(dental\.surfaces\)/);
  assert.match(migration, /'source_tooth_number', dental\.tooth_number/);
  assert.match(migration, /'source_surfaces', to_jsonb\(COALESCE\(dental\.surfaces/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.project_dental_record_to_clinical_procedure/);
  assert.match(migration, /CREATE TRIGGER trg_062_project_dental_record[\s\S]*AFTER INSERT ON public\.dental_records/);
  assert.match(migration, /ON CONFLICT \(source_dental_record_id\) DO NOTHING/);
  assert.match(migration, /ELSIF NOT reservation_was_deleted[\s\S]*dental_record_encounter_reservation_mismatch/);
  assert.match(migration, /'legacy_backfill', TRUE/);
  assert.match(migration, /NOTIFY pgrst, 'reload schema'/);
});

test('database regression exercises reassign, projection sanitization and FK delete order', () => {
  assert.match(dbRegression, /pre-start doctor reassignment was not synchronized/);
  assert.match(dbRegression, /encounter_reservation_staff_locked/);
  assert.match(dbRegression, /treatment_plan_encounter_scope_mismatch/);
  assert.match(dbRegression, /dental projection normalization failed/);
  assert.match(dbRegression, /staff delete did not preserve FK SET NULL semantics/);
  assert.match(dbRegression, /reservation delete did not preserve clinical history/);
});

test('encounter hook uses the canonical RPC and scopes every write', () => {
  assert.match(hook, /supabase\s*\.rpc\('ensure_patient_encounter'/);
  assert.match(hook, /p_organization_id: orgId/);
  assert.match(hook, /p_reservation_id: reservationId/);
  assert.match(hook, /\.eq\('organization_id', orgId\)/);
  assert.match(hook, /\.eq\('customer_id', current\.customerId\)/);
  assert.match(hook, /updateClinicalSummary/);
  assert.match(hook, /diagnosis/);
});

test('public TypeScript contract exposes encounter, diagnosis and clinical procedure links', () => {
  assert.match(types, /export interface PatientEncounter/);
  assert.match(types, /diagnosis\?: string/);
  assert.match(types, /export interface ClinicalProcedure/);
  assert.match(types, /encounterId\?: string/);
  assert.match(types, /sourceDentalRecordId\?: string/);
});
