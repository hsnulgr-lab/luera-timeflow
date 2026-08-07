import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    SETUP_STEPS, isStepDone, remainingMinutes, setupProgress,
} from '../src/lib/setupProgress.ts';
import { SERVICE_SEEDS } from '../src/lib/serviceSeeds.ts';

// Kurulum sihirbazı. Bu hesabı ÜÇ yer okuyor — sihirbazın ilerleme çubuğu,
// bitiş özeti ve uygulamanın üstündeki "devam et" şeridi. Üçü ayrı hesaplasaydı
// biri "%60" derken diğeri "tamamlandı" diyebilirdi.

const BLANK = {
    sector: null, businessName: null, address: null, phone: null,
    openDays: 0, serviceCount: 0, resourceCount: 0, resourcesApply: true,
    staffCount: 0, soloDeclared: false, whatsappConnected: false,
};
const FULL = {
    sector: 'guzellik', businessName: 'Özmen Güzellik', address: 'Bağdat Cad. 184', phone: '02164112233',
    openDays: 6, serviceCount: 7, resourceCount: 3, resourcesApply: true,
    staffCount: 2, soloDeclared: false, whatsappConnected: true,
};

test('bomboş org — karşılama dışında hiçbir adım tamam değil', () => {
    const p = setupProgress(BLANK);
    assert.deepEqual(p.done, ['welcome']);
    assert.equal(p.next, 'sector');
    assert.equal(p.complete, false);
    // Yeni org'un gördüğü ilk sayı bu; %0 demek "hiç başlamadın" demek olurdu
    // ama karşılama adımı gerçekten yapılacak iş içermiyor.
    assert.equal(p.percent, 13);
});

test('her şey doluyken şerit hiç gösterilmez', () => {
    const p = setupProgress(FULL);
    assert.equal(p.complete, true);
    assert.equal(p.percent, 100);
    assert.equal(p.next, null);
});

test('"genel" sektör seçim SAYILMAZ', () => {
    // genel, sektör seçilmemiş org'ların düştüğü varsayılan. Seçim sayılsaydı
    // hiçbir şey seçmemiş kullanıcı o adımı tamamlamış görünürdü.
    assert.equal(isStepDone('sector', { ...BLANK, sector: 'genel' }), false);
    assert.equal(isStepDone('sector', { ...BLANK, sector: 'dis' }), true);
});

test('kimlik: ad şart, adres VEYA telefon yeter', () => {
    assert.equal(isStepDone('identity', { ...BLANK, businessName: 'X' }), false);
    assert.equal(isStepDone('identity', { ...BLANK, businessName: 'X', phone: '0216' }), true);
    assert.equal(isStepDone('identity', { ...BLANK, businessName: 'X', address: 'Cadde' }), true);
    // Boşluktan ibaret ad geçmez.
    assert.equal(isStepDone('identity', { ...BLANK, businessName: '   ', address: 'Cadde' }), false);
});

test('kaynak kavramı olmayan sektörde adım "atlandı" damgası yemez', () => {
    // Danışmanlıkta ve restoranda resourceTypes boş; "kaç odanız var" diye
    // sorulmuyor. Eksik saymak, hiç sorulmamış bir soruyu cevapsız göstermek
    // olurdu ve o org asla %100 olamazdı.
    assert.equal(isStepDone('resources', { ...BLANK, resourcesApply: false }), true);
    assert.equal(isStepDone('resources', { ...BLANK, resourcesApply: true }), false);
    assert.equal(isStepDone('resources', { ...BLANK, resourcesApply: true, resourceCount: 1 }), true);
});

test('"yalnız ben çalışıyorum" ekip adımını tamamlar', () => {
    // Tek kişilik işletme personel eklemez; eklemesini beklemek onu sonsuza
    // kadar "eksik" gösterirdi. Hedef kitlenin büyük kısmı burada.
    assert.equal(isStepDone('team', { ...BLANK, soloDeclared: true }), true);
    assert.equal(isStepDone('team', { ...BLANK, staffCount: 1 }), true);
    assert.equal(isStepDone('team', BLANK), false);
});

test('kalan süre tahmini adım başına bütçeden gelir', () => {
    assert.equal(remainingMinutes([]), 0);
    assert.equal(remainingMinutes(['whatsapp']), 1);
    assert.equal(remainingMinutes(['services', 'team', 'whatsapp']), 5);
    // Karşılama adımı süre yazmaz — kullanıcıdan bir şey istemiyor.
    assert.equal(remainingMinutes(['welcome']), 0);
});

test('sekiz adım, hepsi tekil', () => {
    assert.equal(SETUP_STEPS.length, 8);
    assert.equal(new Set(SETUP_STEPS.map((s) => s.key)).size, 8);
    // Karşılama ilk, WhatsApp son: sıra tasarımdan geliyor ve şeritteki
    // "sırada: X" metni bu diziye dayanıyor.
    assert.equal(SETUP_STEPS[0].key, 'welcome');
    assert.equal(SETUP_STEPS[SETUP_STEPS.length - 1].key, 'whatsapp');
});

// ── Hizmet tohumları ────────────────────────────────────────────────────────
// Sihirbazın 5. adımı listeyi DOLU açar; kullanıcının işi eklemek değil
// çıkarmak olur. Seti olmayan sektör eski (kötü) davranışa düşer: boş tablo.

test('13 sektörün hepsinde hizmet seti var', () => {
    const profiles = readFileSync(new URL('../src/lib/sectorProfiles.ts', import.meta.url), 'utf8');
    const sectors = [...profiles.matchAll(/\n {4}(\w+): \{\n {8}label: '/g)]
        .map((m) => m[1])
        .filter((k) => k !== 'genel');
    assert.ok(sectors.length >= 13, `sektör sayısı: ${sectors.length}`);
    for (const s of sectors) {
        assert.ok(SERVICE_SEEDS[s], `${s} sektörünün hizmet seti yok — kurulum boş tabloyla açılır`);
        assert.ok(SERVICE_SEEDS[s].services.length >= 5, `${s} seti çok kısa`);
    }
});

test('her tohum hizmeti ad, süre ve renk taşır', () => {
    for (const [sector, seed] of Object.entries(SERVICE_SEEDS)) {
        for (const s of seed.services) {
            assert.ok(s.name.trim(), `${sector}: adsız hizmet`);
            assert.ok(s.duration > 0 && s.duration <= 360, `${sector}/${s.name}: süre ${s.duration}`);
            assert.match(s.color, /^#[0-9A-Fa-f]{6}$/, `${sector}/${s.name}: renk`);
        }
        // probeName gerçekten sette olmalı; yoksa "set zaten yüklü mü" kontrolü
        // hep "yüklü değil" der ve set her açılışta yeniden önerilir.
        assert.ok(
            seed.services.some((s) => s.name === seed.probeName),
            `${sector}: probeName sette yok`,
        );
    }
});

// ── Arayüz bağlantıları ─────────────────────────────────────────────────────

const wizard = readFileSync(new URL('../src/pages/SetupWizardPage.tsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/components/layout/Layout.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('/kurulum artık ulaşılabilir', () => {
    // ASIL HATA BUYDU: sayfa vardı, hiçbir yerden ulaşılmıyordu (grep sıfır
    // referans buldu) ve yeni org bomboş uygulamaya düşüyordu.
    assert.match(app, /path="kurulum" element=\{<SetupWizardPage \/>\}/);
    assert.match(layout, /<SetupBanner \/>/);
});

test('sektör sözcükleri gömülü değil', () => {
    // Tasarımın kuralı: "Ünite", "Koltuk", "Tedavi" sektöre göre değişir.
    // Bileşenin içinde sabit yazılırsa 13 sektörden 12'sinde yanlış olur.
    assert.match(wizard, /const resourceWord = resourceTypes\[0\]/);
    assert.match(wizard, /sp\.labels\?\.service/);
    assert.ok(!/if \(sector === /.test(wizard), 'sektör davranışı registry\'de kalmalı');
});

test('mevcut hizmet listesi hazır setle EZİLMEZ', () => {
    // Sihirbazı sonradan açan bir işletmenin listesini seed ile değiştirmek
    // veri kaybıdır.
    assert.match(wizard, /if \(settings\.services\?\.length\)/);
});

test('adımlar tek tek kaydeder', () => {
    // Sonda topluca kaydetmek, yarıda bırakanın hiçbir şeyini saklamamaktı.
    assert.match(wizard, /async function commitStep\(key: StepKey\)/);
    assert.match(wizard, /case 'sector':/);
    assert.match(wizard, /case 'whatsapp':/);
});

test('AI asistan anahtarı yalnız bağlıyken çevrilebilir', () => {
    // Hat bağlı değilken açmak sessiz bir yalan olurdu: anahtar açık görünür,
    // hiçbir mesaj cevaplanmaz.
    assert.match(wizard, /disabled=\{connection\.status !== 'connected'\}/);
});
