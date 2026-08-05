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
  // Klinik durum artık iki ayrı butonla değil, geri alınabilir bir anahtarla
  // değiştiriliyor ("Tedaviyi tamamla" / "Planı yeniden aç" metinleri kalktı).
  // Korunması gereken şey metin değil davranış: durum açıkça görünür, basılı
  // olup olmadığı erişilebilirlik katmanına yansır ve geri alınabilir.
  assert.match(treatmentPlans, /aria-pressed=\{clinicallyCompleted\}/);
  assert.match(treatmentPlans, /Klinik: \{clinicallyCompleted \? 'Tamamlandı'/);
  assert.match(treatmentPlans, /Planı yeniden açmak için dokunun/);
  assert.match(treatmentPlans, /disabled=\{readOnly \|\| cancelled \|\| busy \|\| staffLoading\}/);
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
  // Yükleme sırasında ark artık "disabled" değil, hiç çizilmiyor: kayıtlar
  // gelmeden çizilirse TÜM dişler sağlam görünür ve bu klinik olarak yanıltıcı.
  // Korunan garanti aynı — yükleme bitmeden şema okunamaz.
  assert.match(dentalChart, /\{isLoading \? \(/);
  assert.match(dentalChart, /role="status" aria-live="polite"/);
  assert.match(dentalChart, /dchart-skeleton-arch/);
  // Diş seçimi ark bileşenine devredildi (ToothArchBoard); şema artık her diş
  // için kendi onClick'ini yazmıyor.
  assert.match(dentalChart, /onSelect=\{openTooth\}/);
  // Geçmiş salt-okunur modda da açılır — readOnly'ye bağlı DEĞİL. Asıl kural
  // düzenleyicilerin gizlenmesi: durum çipleri, yüzey seçimi ve not alanı.
  assert.match(dentalChart, /\{active !== null && \([\s\S]*?dchart-history/);
  assert.match(dentalChart, /activeHistory\.map/);
  assert.match(dentalChart, /\{!readOnly && \(/);
  assert.match(dentalChart, /if \(readOnly \|\| !active\) return;/);
});
