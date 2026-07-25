import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  normalizeDentalVisitTab,
  resolveDentalVisitAccess,
} from '../src/lib/dentalVisit.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const app = read('../src/App.tsx');
const page = read('../src/pages/DentalVisitPage.tsx');
const reservationHook = read('../src/hooks/useReservations.ts');
const customerHook = read('../src/hooks/useCustomers.ts');
const encounterHook = read('../src/hooks/usePatientEncounter.ts');
const workspace = read('../src/components/dental/PatientVisitWorkspace.tsx');
const dentalChart = read('../src/components/dental/DentalChart.tsx');
const treatmentPlans = read('../src/components/dental/TreatmentPlans.tsx');
const dashboard = read('../src/components/dashboard/DisDashboard.tsx');
const adisyon = read('../src/components/reservations/AdisyonModal.tsx');
const reservationsPage = read('../src/pages/ReservationsPage.tsx');
const customersPage = read('../src/pages/CustomersPage.tsx');
const mobileCalendar = read('../src/mobile/pages/MobileCalendar.tsx');

const reservation = {
  id: 'reservation-1',
  customerId: 'customer-1',
  staffId: 'doctor-1',
  status: 'confirmed',
};
const activeDoctor = { id: 'doctor-1', role: 'doctor', isActive: true };

test('visit route derives patient and doctor from the canonical reservation id', () => {
  assert.match(app, /path="dental-visit\/:reservationId"/);
  assert.match(page, /useParams<\{ reservationId: string \}>\(\)/);
  assert.match(page, /fetchReservationById\(reservationId\)/);
  assert.match(page, /const customerId = reservation\?\.customerId \|\| ''/);
  assert.match(page, /reservation\?\.staffId \? staff\.find/);
  assert.match(page, /searchParams\.get\('tab'\)/);
  assert.doesNotMatch(page, /searchParams\.get\(['"](?:patient|staff)['"]\)/);
});

test('exact reservation and archived patient lookups remain tenant scoped', () => {
  assert.match(reservationHook, /const fetchReservationById = useCallback/);
  assert.match(reservationHook, /\.eq\('organization_id', orgId\)/);
  assert.match(reservationHook, /\.eq\('id', id\)/);
  assert.match(customerHook, /const fetchCustomerById = useCallback/);
  assert.match(customerHook, /\.eq\('organization_id', orgId\)/);
  assert.match(customerHook, /\.eq\('id', id\)/);
});

test('clinical editing is blocked for unsafe reservation contexts', () => {
  assert.equal(normalizeDentalVisitTab('chart'), 'chart');
  assert.equal(normalizeDentalVisitTab('patient=fake'), 'exam');
  assert.equal(resolveDentalVisitAccess(reservation, activeDoctor).readOnly, false);
  assert.equal(resolveDentalVisitAccess({ ...reservation, status: 'pending' }, activeDoctor).readOnly, true);
  assert.equal(resolveDentalVisitAccess({ ...reservation, status: 'cancelled' }, activeDoctor).readOnly, true);
  assert.equal(resolveDentalVisitAccess(reservation, { ...activeDoctor, role: 'assistant' }).readOnly, true);
  assert.equal(resolveDentalVisitAccess({ ...reservation, customerId: undefined }, activeDoctor).readOnly, true);
});

test('visit workspace keeps examination, chart, plan, finance and recall in one context', () => {
  for (const label of ['Muayene', 'Diş Şeması', 'Tedavi Planı', 'Tahsilat', 'Kontrol / Recall']) {
    assert.match(workspace, new RegExp(label.replace('/', '\\/')));
  }
  assert.match(workspace, /encounterId=\{encounter\?\.id\}/);
  assert.match(workspace, /reservationId=\{reservation\?\.id\}/);
  assert.match(page, /key=\{`\$\{reservation\.id\}:\$\{customer\.id\}`\}/);
  assert.match(page, /staffLoading \|\| encounterApi\.isLoading/);
  assert.match(dentalChart, /encounterId\?: string/);
  assert.match(dentalChart, /reservationId\?: string/);
  assert.match(treatmentPlans, /encounterId\?: string/);
  assert.match(page, /Kontrol Randevusu Oluştur/);
  assert.match(page, /checkConflict\(date, time, end, undefined, reservation\.staffId, reservation\.resourceId\)/);
  assert.match(page, /kaynak ziyaret: \$\{reservation\.id\}/);
});

test('all appointment surfaces expose the same visit route', () => {
  for (const source of [dashboard, adisyon, reservationsPage, customersPage, mobileCalendar]) {
    assert.match(source, /dental-visit\/\$\{encodeURIComponent\(/);
  }
  assert.match(adisyon, /Hasta Ziyaretini Aç/);
  assert.match(dashboard, /Muayeneyi (?:Başlat|Aç)/);
  assert.match(dashboard, /!r\.customerId && !r\.customerPhone\?\.trim\(\)/);
  assert.match(page, /Hasta dosyasını bağla/);
});

test('pre-migration clinics retain a safe compatibility path', () => {
  assert.match(encounterHook, /function isMissingEncounterSchema/);
  assert.match(encounterHook, /available: boolean \| null/);
  assert.match(page, /encounterApi\.available === false/);
  assert.match(page, /basvuru_nedeni: input\.chiefComplaint\.trim\(\)/);
  assert.match(page, /tani: input\.diagnosis\.trim\(\)/);
  assert.match(page, /tedavi_notu: input\.examinationNote\.trim\(\)/);
});
