import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const dashboard = read('../src/components/dashboard/HealthClinicDashboard.tsx');
const composer = read('../src/components/dashboard/AppointmentComposer.tsx');
const styles = read('../src/components/dashboard/healthOps.css');
const registry = read('../src/pages/DashboardPage.tsx');
const profiles = read('../src/lib/sectorProfiles.ts');
const slotLib = read('../src/lib/slotResolution.ts');
const slotHook = read('../src/hooks/useSlotResolver.ts');
const calendar = read('../src/pages/CalendarPage.tsx');

/** Yorum satırlarını atar — sözleşme kontrolleri yalnız gerçek koda baksın. */
const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('saglik sector renders its own dashboard face', () => {
  assert.match(registry, /import \{ HealthClinicDashboard \} from '@\/components\/dashboard\/HealthClinicDashboard'/);
  assert.match(registry, /saglikFace: HealthClinicDashboard/);
  assert.match(profiles, /saglik: \{[\s\S]*?dashboardKpis: \['saglikFace'\]/);
});

test('other sector faces are untouched', () => {
  for (const face of ['masaFace', 'disFace', 'dovmeFace', 'guzellikFace', 'kuaforFace', 'berberFace', 'estetikFace', 'fizyoterapiFace']) {
    assert.match(registry, new RegExp(`${face}:`), `${face} kaydı kayboldu`);
  }
  assert.match(registry, /get randevuFace\(\) \{ return RandevuDashboard; \}/);
});

test('calendar and the clinic dashboard share ONE slot rule layer', () => {
  // Kural gövdesi tek dosyada; Takvim de dashboard da aynı fonksiyonu çağırır.
  assert.match(slotLib, /export function resolveSlot\(rules: SlotRules, q: SlotQuery\)/);
  assert.match(slotLib, /export function resolveSlotStaff\(rules: SlotRules, q: SlotQuery\)/);
  assert.match(slotLib, /export function findAvailableSlots\(rules: SlotRules, search: SlotSearch\)/);

  // Takvim kendi kopyasını taşımıyor: yerel kural fonksiyonları kaldırıldı.
  assert.doesNotMatch(codeOf(calendar), /const resolveSlotStaff = useCallback/);
  assert.doesNotMatch(codeOf(calendar), /const staffWorksAt = useCallback/);

  // Takvim de dashboard da kuralları AYNI hook'tan alır. Eskiden takvim kural
  // nesnesini kendi elleriyle kuruyordu (useSlotResolver'ın gövdesinin ikinci
  // bir yazımı); bir alan eklenip diğerinde unutulduğunda iki yüzey aynı
  // taslağa farklı "uygun" cevabı verebiliyordu.
  assert.match(calendar, /useSlotResolver\(\)/);
  assert.doesNotMatch(codeOf(calendar), /const slotRules: SlotRules = useMemo/,
    'Takvim kural nesnesini kendisi kurmamalı — useSlotResolver tek kaynak');
  assert.match(calendar, /resolveSlotWith\(\{ date, startTime, endTime, staffId: requestedId, resourceId, cart: resLines \}\)/);

  // Dashboard tarafı aynı kuralları hook üzerinden alır.
  assert.match(slotHook, /from '@\/lib\/slotResolution'/);
  assert.match(composer, /useSlotResolver\(\)/);
});

test('slot resolution checks working hours, time off, conflicts and resource capacity', () => {
  assert.match(slotLib, /rules\.timeOff\.some\(\(x\) => x\.staffId === member\.id && x\.date === date\)/);
  assert.match(slotLib, /hours\.isOff/);
  assert.match(slotLib, /checkConflict\(q\.date, q\.startTime, q\.endTime, undefined, member\.id\)/);
  assert.match(slotLib, /capacity = Math\.max\(1, selectedResource\?\.capacity \|\| 1\)/);
  assert.match(slotLib, /dbOverlaps\.length \+ cartCount >= capacity/);
  // Uygunluk verisi yüklenmeden "uygun" denmez.
  assert.match(slotLib, /if \(staffLoading \|\| timeOffLoading\) return \{ issue: 'Personel uygunluğu kontrol ediliyor…' \}/);
  assert.match(slotHook, /isReady: !staffLoading && !timeOffLoading/);
});

test('composer never pre-selects patient, visit type, doctor, room or date', () => {
  assert.match(composer, /const \[patientId, setPatientId\] = useState<string \| null>\(seed\?\.customerId \?\? null\)/);
  assert.match(composer, /const \[visitType, setVisitType\] = useState<VisitType \| ''>\(seed\?\.visitType \?\? ''\)/);
  assert.match(composer, /const \[staffId, setStaffId\] = useState\(''\)/);
  assert.match(composer, /const \[resourceId, setResourceId\] = useState<string \| null>\(null\)/);
  assert.match(composer, /const \[date, setDate\] = useState\(''\)/);
  assert.match(composer, /const \[slot, setSlot\] = useState<AvailableSlot \| null>\(null\)/);
  // Genel giriş boş seed ile açılır; yalnız bağlamsal eylem hasta/tür taşır.
  assert.match(dashboard, /setComposer\(\{\}\)/);
  assert.match(dashboard, /setComposer\(\{ customerId: [^}]+, visitType: 'Kontrol'/);
});

test('visit duration comes from the real service, never a hardcoded table', () => {
  assert.match(composer, /const durationMin = service\?\.duration \?\? 0/);
  // Prototipteki sabit 20/30/40 dk eşlemesi taşınmadı.
  assert.doesNotMatch(codeOf(composer), /'20 dakika'|"20 dakika"/);
  assert.doesNotMatch(codeOf(composer), /type === 'Kontrol' \? 20/);
});

test('slot is re-validated immediately before saving and the draft survives a race', () => {
  assert.match(composer, /const recheck = resolve\(\{/);
  assert.match(composer, /if \(recheck\.issue\) \{[\s\S]*?setConflictMsg\(recheck\.issue\)/);
  assert.match(composer, /setFallbacks\(findSlots\(\{/);
  // Yarışta taslak korunur: hasta seçimi sıfırlanmaz, drawer kapanmaz.
  assert.doesNotMatch(composer, /setConflictMsg\(recheck\.issue\)[\s\S]{0,400}?setPatientId\(null\)/);
  assert.match(composer, /return;                      \/\/ taslak ve hasta seçimi korunur/);
});

test('double submit is blocked and the record goes only through addReservation', () => {
  // Kilit REF ile: setBusy asenkron olduğu için aynı tick'teki ikinci tık
  // `busy` state'ini hâlâ false görür ve mükerrer randevu oluşurdu.
  assert.match(composer, /const submittingRef = useRef\(false\)/);
  assert.match(composer, /if \(submittingRef\.current\) return;/);
  assert.match(composer, /submittingRef\.current = true;\s*\n\s*setBusy\(true\)/);
  assert.match(composer, /finally \{\s*\n\s*submittingRef\.current = false;/);
  assert.match(composer, /disabled=\{!canCreate\}/);
  assert.match(composer, /canCreate = Boolean\([^)]*&& !busy\)/);
  assert.match(composer, /await addReservation\(\{/);
  assert.doesNotMatch(codeOf(composer), /supabase|\.from\(/);
});

test('undo is a recoverable cancel, never a silent delete', () => {
  assert.match(composer, /updateReservation\(created\.id, \{ status: 'cancelled' \}\)/);
  assert.doesNotMatch(codeOf(composer), /deleteReservation/);
  // Bildirim kuyruğu yokken "mesaj gitmedi" vaadi verilmez.
  assert.match(composer, /Teyit mesajı gönderilmiş olabilir/);
  assert.match(composer, /hastayı ayrıca bilgilendirin/);
});

test('patient matching uses normalizePhone and defers to the store for duplicates', () => {
  assert.match(composer, /import \{ normalizePhone, hasWa \} from '@\/lib\/phone'/);
  assert.match(composer, /normalizePhone\(c\.phone\) === qPhone/);
  assert.match(composer, /const phoneTwin = useMemo/);
  assert.match(composer, /addCustomer aktif mükerrerde null döner, arşivli kaydı geri getirir/);
  assert.match(composer, /const created = await addCustomer\(\{ name: newPatient\.name\.trim\(\), phone: newPatient\.phone\.trim\(\) \}\)/);
  assert.match(composer, /if \(!created\) return;/);
  // Yakın tarihli aktif randevu açık uyarı üretir.
  assert.match(composer, /const nearbyExisting = useMemo/);
  assert.match(composer, /Yakın tarihli aktif randevu var/);
});

test('finance never reorders patients or AI candidates', () => {
  // Bugünün listesi yalnız saate göre sıralanır.
  assert.match(dashboard, /\.sort\(\(a, b\) => a\.startTime\.localeCompare\(b\.startTime\)\)/);
  // AI adayları yalnız kontrol tarihine göre sıralanır.
  assert.match(dashboard, /\.sort\(\(a, b\) => \(a\.recallDate \|\| ''\)\.localeCompare\(b\.recallDate \|\| ''\)\)/);
  // Hiçbir sıralama isPaid / tutar okumaz.
  const sorts = dashboard.match(/\.sort\(\([^)]*\) => [^;]*?\)/g) || [];
  for (const s of sorts) {
    assert.doesNotMatch(s, /isPaid|price|amount|total|reservationPrice/, `finansal sıralama: ${s}`);
  }
  assert.match(dashboard, /Finans hasta sırasını ve AI aday sırasını değiştirmez/);
});

test('clinical closure and financial closure stay separate states', () => {
  assert.match(dashboard, /Klinik kapanıştan ayrıdır/);
  assert.match(dashboard, /Klinik kapanış ile finansal kapanış ayrı izlenir/);
  // "Çıkışta" klinik aşamadır; tahsilat ayrı yüzeye (Kasa) yönlendirir.
  assert.match(dashboard, /label: 'Kasaya gönder', run: \(\) => navigate\('\/kasa'\)/);
});

test('operation stages derive from the single existing source', () => {
  assert.match(dashboard, /import \{ phaseOf, minsSince, advancePatch \} from '@\/lib\/sessionPhase'/);
  assert.match(dashboard, /import \{ apptPhase \} from '@\/lib\/appointmentFlow'/);
  assert.match(dashboard, /advancePatch\('arrived'\)/);
  assert.match(dashboard, /advancePatch\('active'\)/);
  assert.match(dashboard, /advancePatch\('completed'\)/);
  // Paralel bir durum kolonu/uydurma statü yok.
  assert.doesNotMatch(codeOf(dashboard), /status: 'in_?progress'|customStatus/);
});

test('Timeflow AI stays inside the operational boundary', () => {
  assert.match(dashboard, /Tıbbi öncelik veya triyaj üretmez; randevu yalnız onayınızla oluşur/);
  assert.match(dashboard, /Dayanak: hekim\/oda müsaitliği · hizmet süresi · daha önce kaydedilmiş kontrol tarihi/);
  assert.match(dashboard, /Yalnız operasyon verisine dayanır; tıbbi karar üretmez/);
  // AI hiçbir randevuyu kendisi oluşturmaz — yalnız taslak açar.
  assert.doesNotMatch(codeOf(dashboard), /addReservation/);
  assert.match(dashboard, /setComposer\(\{ customerId: c\.id, visitType: 'Kontrol' as VisitType \}\)/);
});

test('privacy is on by default and clinical detail is never rendered', () => {
  assert.match(dashboard, /useState\(true\);          \/\/ varsayılan AÇIK/);
  assert.match(dashboard, /const maskName = /);
  assert.match(dashboard, /const maskPhone = /);
  // Tanı / sonuç / alerji ayrıntısı DOM'a hiç basılmaz: yalnız varlık bayrağı.
  assert.match(dashboard, /Klinik uyarının VARLIĞI — içeriği hiçbir mahremiyet seviyesinde basılmaz/);
  assert.match(dashboard, /Klinik uyarı var/);
  const code = codeOf(dashboard);
  assert.doesNotMatch(code, /customFields\?\.\[?'?(alerji|kronik|ilaclar)/);
  assert.doesNotMatch(code, /\{c?\.?notes\}|\{selected\.notes\}|diagnosis|clinicalNotes/);
});

test('no dental route or dental permission is reused', () => {
  for (const src of [dashboard, composer]) {
    assert.doesNotMatch(codeOf(src), /dental|dis-chart|dental-chart/i);
  }
});

test('layout avoids the shapes the brief rules out', () => {
  assert.doesNotMatch(dashboard, /StatCard|Sparkline|ProgressBar/);
  assert.doesNotMatch(dashboard, /grid-cols-4/);
  assert.match(dashboard, /CANLI KLİNİK NABZI/);
  assert.match(dashboard, /RANDEVU KONTROL MERKEZİ/);
  assert.match(dashboard, /RANDEVU MERCEĞİ/);
  assert.match(dashboard, /Takip Defteri/);
  assert.match(dashboard, /AKIŞ KAÇAKLARI/);
  // Akıllı liste ve Hekim akışı AYNI filtrelenmiş veriyi kullanır.
  assert.match(dashboard, /rows = filtered\.filter\(\(r\) => groupOf\(r\) === group\)/);
  assert.match(dashboard, /rows = filtered\.filter\(\(r\) => r\.staffId === s\.id\)/);
});

test('styles stay scoped and keep the Timeflow palette', () => {
  const selectors = styles
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((block) => block.split('{')[0].trim())
    .filter((s) => s && !s.startsWith('@') && !s.startsWith('from') && !s.startsWith('to'));
  for (const selector of selectors) {
    assert.ok(
      selector.split(',').every((part) => /(^|\s|\.)hc-ops/.test(part.trim())),
      `scope dışı seçici: ${selector}`,
    );
  }
  assert.match(styles, /--hc-clinic: #315c79/);      // sakin petrol mavisi
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /@media \(max-width: 1024px\)/); // satır → kart
});

test('empty and loading states are explicit Turkish copy', () => {
  for (const copy of [
    'Bugün randevu yok',
    'Seçili randevu yok',
    'Bekleyen takip yok',
    'Bekleyen bildirim yok',
  ]) {
    assert.ok(dashboard.includes(copy), `eksik boş durum metni: ${copy}`);
  }
  for (const copy of [
    'Personel uygunluğu kontrol ediliyor…',
    'Uygun saatleri görmek için tarih seçin.',
    'Bu tarihte seçili kaynaklarla uygun saat bulunamadı',
    'Bu saat az önce doldu',
  ]) {
    assert.ok(composer.includes(copy), `eksik durum metni: ${copy}`);
  }
});

test('routes follow the existing contract', () => {
  assert.match(dashboard, /navigate\('\/calendar'\)/);
  assert.match(dashboard, /\/customers\?open=/);
  assert.match(dashboard, /\/calendar\?new=1&customer=/);
  assert.match(dashboard, /navigate\('\/kasa'\)/);
});
