import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const treatmentPlans = read('../src/components/dental/TreatmentPlans.tsx');
const treatmentPlanHook = read('../src/hooks/useTreatmentPlans.ts');
const adisyon = read('../src/components/reservations/AdisyonModal.tsx');
const paymentsHook = read('../src/hooks/usePayments.ts');
const editReservation = read('../src/components/reservations/EditReservationModal.tsx');
const dentalChart = read('../src/components/dental/DentalChart.tsx');

test('clinical completion is explicit and independent from financial completion', () => {
  assert.match(treatmentPlans, /const financiallyPaid = remaining <= 0/);
  assert.match(treatmentPlans, /const clinicallyCompleted = plan\.status === 'completed'/);
  assert.match(treatmentPlans, /Tedaviyi tamamla/);
  assert.match(treatmentPlans, /Planı yeniden aç/);
  assert.match(treatmentPlans, /setPlanStatus\(plan\.id, nextStatus, responsibleStaffId\)/);
  assert.match(treatmentPlans, /if \(readOnly \|\| plansLoading \|\| staffLoading/);
  assert.match(treatmentPlans, /Bu tedaviyi yalnız sorumlu hekim tamamlayabilir/);

  assert.match(treatmentPlanHook, /status === 'completed'[\s\S]*?record_type: 'existing'/);
  assert.match(treatmentPlanHook, /alreadyCompleted[\s\S]*?record\.created_at/);
  assert.match(treatmentPlanHook, /rollbackStatus\('Diş şeması güncellenemediği için tedavi tamamlanmadı'/);
});

test('group checkout uses one canonical reservation and clears all legacy group payments before unpaid state', () => {
  assert.match(adisyon, /const billingReservation = groupRes\[0\] \|\| r/);
  assert.match(adisyon, /reservationId: billingReservationId/);
  assert.match(adisyon, /removeByReservations\(groupReservationIds, true\)[\s\S]*?updateReservation\(item\.id, \{ isPaid: false \}\)/);

  assert.match(paymentsHook, /\.in\('reservation_id', uniqueIds\)/);
  assert.match(paymentsHook, /\.is\('treatment_plan_id', null\)[\s\S]*?\.select\('id'\)/);
  assert.match(paymentsHook, /if \(!data \|\| data\.length === 0\)[\s\S]*?return false/);
});

test('newly linked reservation payment uses the resolved patient id', () => {
  assert.match(editReservation, /let linkedCustomerId = updated\.customerId \|\| reservation\.customerId \|\| null/);
  assert.match(editReservation, /linkedCustomerId = await ensureReservationCustomer\(updated\)/);
  assert.match(editReservation, /customerId: linkedCustomerId/);
  assert.match(editReservation, /const restorePaidFlag = async \(\) =>/);
  assert.match(editReservation, /if \(!payment\) \{[\s\S]*?await restorePaidFlag\(\)/);
  assert.match(editReservation, /if \(!removed\) \{[\s\S]*?await restorePaidFlag\(\)/);
  assert.match(editReservation, /finally \{[\s\S]*?setSaving\(false\)/);
  assert.match(editReservation, /if \(saving \|\| saved \|\|/);
  assert.match(editReservation, /disabled=\{saving \|\| saved \|\|/);
  assert.match(editReservation, /removeByReservation\(reservation\.id, true\)/);
});

test('read-only compact chart opens tooth details and history without exposing editors', () => {
  assert.match(dentalChart, /disabled=\{isLoading\}/);
  assert.match(dentalChart, /onClick=\{\(\) => openTooth\(n\)\}/);
  assert.match(dentalChart, /\{readOnly && active !== null && \(/);
  assert.match(dentalChart, /activeHistory\.map/);
  assert.match(dentalChart, /\{!readOnly && active !== null && \(/);
});
