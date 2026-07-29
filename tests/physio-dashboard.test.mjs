import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const dashboard = read('../src/components/dashboard/FizyoterapiDashboard.tsx');
const styles = read('../src/components/dashboard/physioOps.css');
const registry = read('../src/pages/DashboardPage.tsx');
const profiles = read('../src/lib/sectorProfiles.ts');

test('fizyoterapi sector renders its own dashboard face through the registry', () => {
  assert.match(registry, /import \{ FizyoterapiDashboard \} from '@\/components\/dashboard\/FizyoterapiDashboard'/);
  assert.match(registry, /fizyoterapiFace: FizyoterapiDashboard/);
  assert.match(profiles, /fizyoterapi: \{[\s\S]*?dashboardKpis: \['fizyoterapiFace'\]/);
});

test('other sector faces keep their own dashboards', () => {
  for (const face of ['masaFace', 'disFace', 'dovmeFace', 'guzellikFace', 'kuaforFace', 'berberFace', 'estetikFace']) {
    assert.match(registry, new RegExp(`${face}:`), `${face} kaydı kayboldu`);
  }
  assert.match(registry, /get randevuFace\(\) \{ return RandevuDashboard; \}/);
});

test('clinical plan and commercial package rights stay two separate counters', () => {
  // Klinik plan treatment_plans'tan, ticari hak customer_packages'tan okunur;
  // tek bir "kalan seans" sayacında birleştirilmez.
  assert.match(dashboard, /const clinicalPlan = useMemo/);
  assert.match(dashboard, /const commercialRight = useMemo/);
  assert.match(dashboard, /useTreatmentPlans\(selected\?\.customerId\)/);
  assert.match(dashboard, /forCustomer\(selected\.customerId\)/);
  assert.match(dashboard, /Klinik plan ile paket hakkı ayrı tutulur/);
  assert.doesNotMatch(profiles, /fizyoterapi: \{[\s\S]*?key: 'kalan_seans'/);
});

test('shared-screen privacy is on by default and masks surnames', () => {
  assert.match(dashboard, /useState\(true\);\s*\/\/ ortak ekran: varsayılan AÇIK/);
  assert.match(dashboard, /const maskName = \(full: string, on: boolean\)/);
  // Zaman çizelgesi, fonksiyon rotası ve ev programı ortak ekranda görünür
  // yüzeylerdir — üçü de maskeli ad kullanmalı.
  assert.ok(dashboard.match(/maskName\(/g).length >= 8);
  assert.match(dashboard, /Ortak ekranda tanı ve ayrıntılı klinik ölçümler gösterilmez/);
  // Klinik uyarının içeriği dashboard'da değil, yetkili hasta dosyasında açılır
  assert.match(dashboard, /Ayrıntı yalnız yetkili hasta dosyasında görünür/);
});

test('automation never decides treatment', () => {
  assert.match(dashboard, /Sistem tedavi kararı vermez/);
  assert.match(dashboard, /ÖLÇÜMÜ TERAPİST GİRER/);
  assert.match(dashboard, /Sistem tanı koymaz, tedavi önermez ve planı değiştirmez/);
  // Destek mesajı otomatik GÖNDERİLMEZ; yalnız taslak açılır.
  assert.match(dashboard, /window\.open\(`\$\{waLink\(c\.phone\)\}\?text=/);
  assert.match(dashboard, /metin ve gönderim kararı sizde kalır/);
});

test('session states carry a Turkish label and an icon, not colour alone', () => {
  const states = dashboard.match(/label: '[^']+', tone: '[^']+', icon: \w+/g) || [];
  assert.ok(states.length >= 5, 'beş seans durumu da etiket+ikon taşımalı');
  for (const label of ['Seans sürüyor', 'Değerlendirme', 'Karar bekliyor', 'Tamamlandı', 'Yaklaşıyor']) {
    assert.match(dashboard, new RegExp(`label: '${label}'`));
  }
});

test('non-judgemental language for home programme adherence', () => {
  assert.match(dashboard, /Programa destek gerekiyor/);
  // Yorum satırları hariç — kullanıcıya görünen hiçbir metin suçlayıcı olmamalı.
  const visible = dashboard.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(visible, /uyumsuz|ihmal|başarısız hasta/i);
});

test('dashboard reads exactly the custom fields the sector profile declares', () => {
  const declared = [...profiles.matchAll(/key: '(islevsel_hedef|klinik_uyari|ev_programi|ev_programi_gun|agri|rom)'/g)]
    .map((m) => m[1]);
  assert.deepEqual(new Set(declared).size, 6, 'altı özel alan şablonu tanımlı olmalı');
  for (const [constName, key] of [
    ['CF_GOAL', 'islevsel_hedef'], ['CF_ALERT', 'klinik_uyari'],
    ['CF_HOME', 'ev_programi'], ['CF_HOME_DAYS', 'ev_programi_gun'],
    ['CF_PAIN', 'agri'], ['CF_ROM', 'rom'],
  ]) {
    assert.match(dashboard, new RegExp(`const ${constName} = '${key}'`));
    assert.ok(declared.includes(key), `${key} sektör profilinde tanımlı değil`);
  }
});

test('styles stay scoped and keep the Timeflow + physio palette', () => {
  // Her kural .fz-ops (veya modal kökü .fz-ops-modal) altında olmalı — başka
  // sektör yüzlerine sızmamalı.
  const selectors = styles
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((block) => block.split('{')[0].trim())
    .filter((s) => s && !s.startsWith('@') && !s.startsWith('from') && !s.startsWith('to'));
  for (const selector of selectors) {
    assert.ok(
      selector.split(',').every((part) => /(^|\s|\.)fz-ops/.test(part.trim())),
      `scope dışı seçici: ${selector}`,
    );
  }
  assert.match(styles, /--fz-teal: #16796f/);
  assert.match(styles, /--fz-teal-soft: #e6f3ef/);
  assert.match(styles, /prefers-reduced-motion/);
});

test('layout avoids the shapes the brief rules out', () => {
  // Büyük siyah sağ panel, dev tarih bloğu, dört eş KPI kartı ve Kanban yok.
  assert.doesNotMatch(dashboard, /StatCard|Sparkline|ProgressBar/);
  assert.doesNotMatch(dashboard, /grid-cols-4/);
  // Yatay canlı seans ritmi ana bileşen
  assert.match(dashboard, /CANLI SEANS RİTMİ/);
  assert.match(dashboard, /FONKSİYON ROTASI/);
  assert.match(dashboard, /BUGÜN KARAR VERİLECEKLER/);
  assert.match(dashboard, /EV PROGRAMI NABZI/);
});

test('empty states never fabricate clinical data', () => {
  for (const copy of [
    'Bugün seans planlanmamış',
    'Klinik plan tanımlı değil',
    'Paket tanımlı değil',
    'Ev programı kaydı yok',
    'En az iki ölçüm girildiğinde değişim burada çizilir.',
  ]) {
    assert.ok(dashboard.includes(copy), `eksik boş durum metni: ${copy}`);
  }
});
