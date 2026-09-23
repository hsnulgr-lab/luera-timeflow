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

test('fırsat çarkı boşken gizlenmez, sakin bir hâle geçer', () => {
    // Önce boş listede `return null` yapıyordu: yeni kurulan salonda modül hiç
    // görünmüyor, kullanıcı böyle bir yer olduğunu öğrenemiyordu.
    const wheel = read('../src/components/dashboard/OpportunityWheel.tsx');
    assert.doesNotMatch(wheel, /if \(items\.length === 0\) return null/);
    assert.match(wheel, /opp-mod is-empty/);
    assert.match(wheel, /Bugün takip işi yok/);
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

// ── Randevu iptali · güzellikte kapısı yoktu ────────────────────────────────
//
// 2026-09-24: güzellik salonunda masaüstünden bir randevuyu İPTAL ETMEK
// mümkün değildi. Sebep tek bir satırdı — takvimde tık AdisyonModal yerine
// müşteri kartına gidiyor ("hızlı-bakış popup'ı kaldırıldı") ve iptal
// düğmesi o modalın içindeydi. Popup gidince Düzenle ve İptal de gitmiş,
// kimse fark etmemişti. Ekranda "İptal" filtresi duruyordu — hiçbir zaman
// ulaşılamayacak bir durumu süzen bir filtre.

const agendaGrid = read('../src/components/reservations/DayAgendaGrid.tsx');
const calendarPage = read('../src/pages/CalendarPage.tsx');
const adisyonModal = read('../src/components/reservations/AdisyonModal.tsx');

test('güzellikte tık müşteri kartına gider — bu bilinçli, korunuyor', () => {
    assert.match(calendarPage, /settings\.sector === 'guzellik'[\s\S]{0,160}beauty-customer/);
});

test('ama randevu detayına ULAŞILABİLİR bir kapı var', () => {
    // Kapı ızgaradaki ⋯ düğmesi. `onDetail` bağlı değilse düğme çizilmez ve
    // güzellik yine iptalsiz kalır — bu yüzden bağlantı da denetleniyor.
    assert.match(agendaGrid, /onDetail\?: \(r: Reservation\) => void;/);
    assert.match(agendaGrid, /onClick=\{\(e\) => \{ e\.stopPropagation\(\); setHover\(null\); onDetail\(r\); \}\}/);
    assert.match(calendarPage, /onDetail=\{openReservationDetail\}/);
    assert.match(calendarPage, /const openReservationDetail = useCallback\(\(r: Reservation\) => setAdisyonRes\(r\), \[\]\)/);
});

test('detay modalı SEKTÖRE GÖRE kapatılmamış', () => {
    // Modal zaten her sektöre çiziliyordu; eksik olan yalnızca onu açan
    // kapıydı. Buraya bir sektör koşulu girerse iptal yine kaybolur.
    assert.match(calendarPage, /\{adisyonRes && \(\s*<AdisyonModal/);
});

test('modalın içinde iptal GERİ ALINABİLİR', () => {
    /*
     * İptal edilen randevu bütün görünümlerden düşüyor (hepsi
     * `status !== 'cancelled'` süzüyor). Geri alma şeridi olmadan yanlışlıkla
     * basılan bir iptal, randevunun sessizce yok olması demek olurdu.
     */
    assert.match(adisyonModal, /status: 'cancelled'/);
    assert.match(adisyonModal, /toast\('Randevu iptal edildi', \{ action: \{ label: 'Geri Al'/);
});

test('ızgaradaki iki köşe düğmesi de KLAVYEYLE görünür oluyor', () => {
    // opacity-0 odağı engellemiyor; focus-within olmadan klavyeyle gezen
    // biri görünmeyen bir düğmeye odaklanırdı.
    assert.match(agendaGrid, /group-hover\/appt:opacity-100 group-focus-within\/appt:opacity-100/);
});
