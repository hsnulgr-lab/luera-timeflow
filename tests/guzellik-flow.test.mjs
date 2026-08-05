import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { labelsForSector, profileForSector } from '../src/lib/sectorProfiles.ts';
import { serviceSeedFor } from '../src/lib/serviceSeeds.ts';
import { eligibilityTagsFor, evaluateEligibility } from '../src/lib/serviceEligibility.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const dashboard = read('../src/components/dashboard/GuzellikDashboard.tsx');
const sessionModal = read('../src/components/beauty/BeautySessionModal.tsx');
const cash = read('../src/pages/BeautyCashRegister.tsx');
const packages = read('../src/pages/BeautyPackages.tsx');
const customerPage = read('../src/pages/BeautyCustomerPage.tsx');
const reservationsHook = read('../src/hooks/useReservations.ts');

// Güzellik satış akışının uçtan uca garantileri. Her biri bu modülde gerçekten
// yaşanmış bir hatanın kilididir; hepsi 2026-08-05'te yerelde elle de doğrulandı
// (paket sat → seans → tamamla → kasa).

// ── Paket motoru ────────────────────────────────────────────────────────────

test('pakete bağlı seans plana customFields ile bağlanır ve ücret alınmaz', () => {
    assert.match(sessionModal, /paket_plan_id: selectedPlan\.id/);
    assert.match(sessionModal, /paket_seans: `\$\{selectedPlan\.sessionsDone \+ 1\}\/\$\{selectedPlan\.sessionCount\}`/);
});

test('hak düşümü tek yerde ve tek kez olur', () => {
    // Sayaç YALNIZ useReservations'ta ilerler. İkinci bir yer hakkı düşürürse
    // aynı seans iki hak yakar; bileşenlerde plan güncellemesi olmamalı.
    for (const [name, src] of [['dashboard', dashboard], ['kasa', cash], ['modal', sessionModal]]) {
        assert.doesNotMatch(src, /sessions_done:/, `${name} sayacı doğrudan yazmamalı`);
    }
    assert.match(reservationsHook, /consume_plan_session/);
    // Çifte sayım bayrağı hem koşulda hem yazımda olmalı
    assert.match(reservationsHook, /!updated\.customFields\?\.paket_sayildi/);
});

test('paket kuyruğu klinik planları almaz', () => {
    const orgPackages = read('../src/hooks/useOrgPackages.ts');
    assert.match(orgPackages, /\.eq\('plan_kind', 'paket'\)/);
});

test('rezerve hak sayımı, sayılmış randevuları dışarıda bırakır', () => {
    // "0 kullanıldı + 1 rezerve + 3 kullanılabilir = 4" denklemi buna dayanır:
    // tamamlanıp sayılmış randevu hâlâ rezerve görünürse toplam şişer.
    assert.match(packages, /r\.customFields\?\.paket_sayildi\) continue/);
});

// ── Tahsilat ────────────────────────────────────────────────────────────────

test('dashboard tahsilat yapmaz, kasaya yönlendirir', () => {
    // Eskiden dashboard method:'cash' sabitiyle ödeme yazıyordu: kartlı tahsilat
    // kasada nakit görünüyor, insert başarısız olsa bile seans "ödendi" oluyordu.
    assert.match(dashboard, /Kasayı aç/);
    assert.doesNotMatch(dashboard, /method: 'cash'/);
    assert.doesNotMatch(dashboard, /addPayment\(/);
});

test('sadakat damgası tahsilatın bittiği tek yerde basılır', () => {
    assert.match(cash, /const awardLoyaltyStamps = async \(\) =>/);
    assert.match(cash, /await awardLoyaltyStamps\(\)/);
    // Damga yalnız birikmemeli, kullanılabilmeli de: müşteri kartında ödül aksiyonu
    assert.match(customerPage, /redeemLoyalty\(customer\.id, loyaltyThreshold\)/);
    assert.match(customerPage, /Ödülü kullan/);
});

// ── Uygunluk (kontrendikasyon) ──────────────────────────────────────────────

test('randevu oluşturan her yüzey uygunluk kaynağını okur', () => {
    // Kural eskiden yalnız seans modalindeydi; takvim, mobil ve düzenleme
    // aynı müşteriye aynı işlemi serbestçe seçtiriyordu.
    for (const path of [
        '../src/components/beauty/BeautySessionModal.tsx',
        '../src/pages/CalendarPage.tsx',
        '../src/mobile/pages/MobileNewReservation.tsx',
        '../src/pages/BeautyPackages.tsx',
        '../src/pages/BeautyCustomerPage.tsx',
    ]) {
        assert.match(read(path), /from '@\/lib\/serviceEligibility'/, path);
    }
});

test('hamile müşteriye lazer paketi seans planlatmaz', () => {
    const pregnant = { customFields: { hamilelik: true } };
    const verdict = evaluateEligibility(pregnant, { name: 'Lazer Epilasyon Paketi' }, 'guzellik');
    assert.equal(verdict.blocked, true);
    assert.match(verdict.message, /Hamilelik/);
});

// ── Sektör profili ──────────────────────────────────────────────────────────

test('terminoloji seans dili konuşur — tekil ve çoğul birlikte', () => {
    const l = labelsForSector('guzellik');
    assert.equal(l.reservation, 'Seans');
    assert.equal(l.reservations, 'Seanslar');   // sidebar "Rezervasyonlar" diyordu
    assert.equal(l.staff, 'Uzman');
    assert.equal(l.staffPlural, 'Uzmanlar');
});

test('hizmet seed listesi etiketli ve dönüş periyotlu gelir', () => {
    const seeds = serviceSeedFor('guzellik')?.services ?? [];
    assert.ok(seeds.length >= 8, `seed sayısı: ${seeds.length}`);
    const tags = eligibilityTagsFor('guzellik');
    // En az bir hizmet kapatılabilir etiket taşımalı, yoksa koruma yalnız ada kalır
    assert.ok(seeds.some((s) => (s.tags || []).some((t) => tags.includes(t))));
    // Recall olmadan "bakım yenileme" hatırlatması hiç tetiklenmez
    assert.ok(seeds.some((s) => typeof s.recallDays === 'number' && s.recallDays > 0));
});

test('güzellik sektörünün recall periyodu ve kabin kaynağı tanımlı', () => {
    const p = profileForSector('guzellik');
    assert.equal(p.comms.recall?.afterDays, 30);
    assert.deepEqual(p.resourceTypes, ['Kabin']);
    assert.ok(p.riskFlags?.some((f) => f.key === 'hamilelik'));
});
