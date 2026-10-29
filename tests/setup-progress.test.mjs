import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    CORE_STEPS, SETUP_SCREENS, SETUP_STEPS, isSavedServiceId, isStepDone, nextCoreStep,
    ownBusinessName, screenFor, screenProgress,
} from '../src/lib/setupProgress.ts';
import { SERVICE_SEEDS } from '../src/lib/serviceSeeds.ts';

// Kurulum sihirbazı. Bu hesabı ÜÇ yer okuyor — sihirbazın göstergesi, bitiş
// özeti ve uygulamanın üstündeki "devam et" şeridi. Üçü ayrı hesaplasaydı
// biri "2 / 3" derken diğeri "tamamlandı" diyebilirdi.

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

test('bomboş org — hiçbir ekran tamam değil, sıradaki İşletmeniz', () => {
    const p = screenProgress(BLANK);
    assert.deepEqual(p.done, []);
    assert.equal(p.next, 'isletme');
    assert.equal(p.complete, false);
});

test('her şey doluyken şerit hiç gösterilmez', () => {
    const p = screenProgress(FULL);
    assert.equal(p.complete, true);
    assert.equal(p.next, null);
    assert.deepEqual(p.done, ['isletme', 'hizmetler', 'whatsapp']);
});

test('üç ekran + bitiş, sırası tasarımdan', () => {
    // Kullanıcı kararı 2026-10-19: "çok az adım, az ve öz".
    assert.deepEqual(SETUP_SCREENS.map((s) => s.key), ['isletme', 'hizmetler', 'whatsapp']);
    assert.deepEqual(SETUP_SCREENS.map((s) => s.label), ['İşletmeniz', 'Hizmetler ve saatler', 'WhatsApp']);
});

test('?adim= — ekran anahtarı da, eski adım anahtarı da ekrana düşer', () => {
    // Ödeme duvarı /kurulum?adim=identity gibi ADIM anahtarı gönderiyor;
    // şerit ekran anahtarı. İkisi de kaldığı ekranı açmalı.
    for (const s of SETUP_SCREENS) assert.equal(screenFor(s.key), s.key);
    for (const { key } of SETUP_STEPS) assert.ok(screenFor(key), `${key} hiçbir ekrana düşmüyor`);
    assert.equal(screenFor('sector'), 'isletme');
    assert.equal(screenFor('identity'), 'isletme');
    assert.equal(screenFor('team'), 'isletme');
    assert.equal(screenFor('hours'), 'hizmetler');
    assert.equal(screenFor('services'), 'hizmetler');
    assert.equal(screenFor('whatsapp'), 'whatsapp');
    assert.equal(screenFor('yok-boyle'), null);
    assert.equal(screenFor(null), null);
});

test('ödeme dönüşünün gittiği ekran ile şeridin "Sırada"sı hep aynı', () => {
    // nextCoreStep (PaywallPage) ve screenProgress (şerit) ayrı yazılmış iki
    // hesap; biri "Hizmetler" derken öteki "İşletmeniz" demesin.
    const opts = {
        sector: [null, 'genel', 'kuafor'], businessName: ['', '  ', 'Salon'], address: ['', 'Kadıköy'],
        openDays: [0, 5], serviceCount: [0, 3], whatsappConnected: [false, true],
    };
    const keys = Object.keys(opts);
    const walk = (i, f) => {
        if (i === keys.length) {
            const facts = { ...BLANK, ...f };
            const core = nextCoreStep(facts);
            const strip = screenProgress(facts).next;
            if (core) assert.equal(strip, screenFor(core), JSON.stringify(f));
            else assert.ok(strip === 'whatsapp' || strip === null, JSON.stringify(f));
            return;
        }
        for (const v of opts[keys[i]]) walk(i + 1, { ...f, [keys[i]]: v });
    };
    walk(0, {});
});

test('İşletmeniz: sektör + ad yeter; adres/telefon sihirbazda sorulmaz, şerit de istemez', () => {
    const f = { ...BLANK, sector: 'kuafor', businessName: 'Salon Ayşe' };
    assert.deepEqual(screenProgress(f).done, ['isletme']);
    assert.equal(screenProgress(f).next, 'hizmetler');
    assert.equal(screenProgress({ ...f, sector: 'genel' }).next, 'isletme', '"genel" seçim sayılmaz');
    assert.equal(screenProgress({ ...f, businessName: '  ' }).next, 'isletme');
    // Ekip ve yer sayısı sorulur ama sayılmaz: v1'den kalan org'larda saklı değil.
    assert.equal(screenProgress({ ...f, staffCount: 0, soloDeclared: false }).done.includes('isletme'), true);
});

test('"genel" sektör seçim SAYILMAZ', () => {
    // genel, sektör seçilmemiş org'ların düştüğü varsayılan. Seçim sayılsaydı
    // hiçbir şey seçmemiş kullanıcı o adımı tamamlamış görünürdü.
    assert.equal(isStepDone('sector', { ...BLANK, sector: 'genel' }), false);
    assert.equal(isStepDone('sector', { ...BLANK, sector: 'dis' }), true);
});

test('kaynak kavramı olmayan sektörde adım "atlandı" damgası yemez', () => {
    assert.equal(isStepDone('resources', { ...BLANK, resourcesApply: false }), true);
    assert.equal(isStepDone('resources', { ...BLANK, resourcesApply: true }), false);
    assert.equal(isStepDone('resources', { ...BLANK, resourcesApply: true, resourceCount: 1 }), true);
});

test('"yalnız ben çalışıyorum" ekip adımını tamamlar', () => {
    assert.equal(isStepDone('team', { ...BLANK, soloDeclared: true }), true);
    assert.equal(isStepDone('team', { ...BLANK, staffCount: 1 }), true);
    assert.equal(isStepDone('team', BLANK), false);
});

test('zorunlu adımlar değişmedi — ödeme dönüşü aynı kararı veriyor', () => {
    assert.deepEqual([...CORE_STEPS], ['welcome', 'sector', 'identity', 'hours', 'services']);
});

test('yer tutucu hizmetler sayılmaz', () => {
    // Hizmeti olmayan işletmede ayarlar beş yer tutucu taşır (kimlik '1'…'5').
    // Sayılsalardı yeni işletme "hizmetleri var" görünür, sihirbaz da sektörün
    // hazır listesi yerine "Genel Randevu, Konsültasyon…" gösterirdi.
    for (const id of ['1', '2', '5', '', 'abc12345']) assert.equal(isSavedServiceId(id), false, id);
    assert.equal(isSavedServiceId('3f2b8c1e-9a4d-4b7e-8c2a-1d5e6f7a8b9c'), true);
});

test('işletme adı alanı kayıt anının adıyla dolmaz (devir 12 §2.1)', () => {
    // E-postayla kayıtta sunucu adı e-posta yazıyor; Apple/Google'da kişinin adı.
    assert.equal(ownBusinessName('ayse@ornek.com', 'ayse'), '');
    assert.equal(ownBusinessName('Ayşe Yılmaz', 'Ayşe Yılmaz'), '', 'Apple/Google: kişinin kendi adı');
    assert.equal(ownBusinessName('Luera TimeFlow', 'ayse'), '', 'uygulamanın varsayılanı');
    assert.equal(ownBusinessName('Workspace', 'ayse'), '');
    assert.equal(ownBusinessName('  ', 'ayse'), '');
    assert.equal(ownBusinessName(null, 'ayse'), '');
    assert.equal(ownBusinessName('Özmen Güzellik', 'ayse'), 'Özmen Güzellik', 'telefonda yazılmış gerçek ad gelir');
});

// ── Hizmet tohumları ────────────────────────────────────────────────────────
// Hizmetler ekranı listeyi DOLU açar; kullanıcının işi eklemek değil
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

test('kurulumda sektör simgesi her sektör için çizili', () => {
    const icons = readFileSync(new URL('../src/pages/kurulumIkonlar.tsx', import.meta.url), 'utf8');
    for (const s of Object.keys(SERVICE_SEEDS)) assert.match(icons, new RegExp(`'sector-${s}':`), `${s} simgesi yok`);
});

// ── Arayüz bağlantıları ─────────────────────────────────────────────────────

const wizard = readFileSync(new URL('../src/pages/SetupWizardPage.tsx', import.meta.url), 'utf8');
const banner = readFileSync(new URL('../src/components/layout/SetupBanner.tsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/components/layout/Layout.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('/kurulum ulaşılabilir', () => {
    // ASIL HATA BUYDU: sayfa vardı, hiçbir yerden ulaşılmıyordu (grep sıfır
    // referans buldu) ve yeni org bomboş uygulamaya düşüyordu.
    assert.match(app, /path="kurulum" element=\{<SetupWizardPage \/>\}/);
    assert.match(layout, /<SetupBanner \/>/);
});

test('kurulum balonu yüzer: sayfanın akışına girmez, telefonda kenarlardan 16 px', () => {
    // Tam genişlik şerit her sayfanın tepesinde yer açıp düzeni bozuyordu (2026-10-29).
    const css = readFileSync(new URL('../src/pages/setupWizard.css', import.meta.url), 'utf8');
    assert.match(css, /\.kv-strip-w \{ position: fixed; right: 24px; bottom: 24px; z-index: 30;/);
    assert.match(css, /\.kv-strip \{[^}]*border-radius: 999px;/);
    assert.match(css, /@media \(max-width: 560px\) \{\s*\.kv-strip-w \{ left: 16px; right: 16px; bottom: 16px;/);
});

test('balon sihirbazı KALDIĞI EKRANDAN açar, tek sayaçtan okur', () => {
    assert.match(banner, /\/kurulum\?adim=\$\{progress\.next\}/);
    assert.match(banner, /screenProgress\(/);
    assert.doesNotMatch(banner, /percent|%\{/, 'v1 yüzdesi geri geldi');
    assert.match(wizard, /screenFor\(searchParams\.get\('adim'\)\)/);
    // Anahtar tutulur, indis değil.
    assert.match(wizard, /useState<Screen>/);
    assert.ok(!/setStepIdx/.test(wizard), 'ekran indisle tutulmamalı');
    // Şerit yer tutucu hizmetleri saymaz (yoksa yeni işletmede "Hizmetler" hep tamam görünür).
    assert.match(banner, /isSavedServiceId\(s\.id\)/);
});

test('kurulum tam ekran: sol menü yok, çıkış sağ üstte', () => {
    const setup = layout.indexOf("if (path.startsWith('/kurulum'))");
    assert.ok(setup > 0, 'Layout kurulumda kendi kabuğunu çizmiyor');
    assert.ok(setup < layout.indexOf('<Sidebar'), 'kurulumda sol menü çiziliyor');
    assert.match(wizard, /Sonra tamamlarım/);
});

test('sektör sözcükleri gömülü değil', () => {
    assert.match(wizard, /const resourceTypes = sp\.resourceTypes/);
    assert.match(wizard, /sp\.labels\?\.service/);
    assert.ok(!/if \(sector === /.test(wizard), 'sektör davranışı registry\'de kalmalı');
});

test('kayıtlı hizmet listesi hazır setle EZİLMEZ', () => {
    assert.match(wizard, /if \(savedServices\.length\)/);
    // Kayıtlı hizmetin reçetesi ve etiketi kayıtta korunur.
    assert.match(wizard, /\.\.\.r\.orig,/);
});

test('her ekran Devam\'da kaydeder; cevap gelmezse "doğrulayamadık"', () => {
    assert.match(wizard, /async function saveIsletme\(\)/);
    assert.match(wizard, /async function saveHizmetler\(\)/);
    assert.match(wizard, /withTimeout\(save\(\)/);
    assert.match(wizard, /if \(isTimeout\(out\)\) \{ setFail\('unknown'\); return; \}/);
    assert.match(wizard, /Kaydedildiğini doğrulayamadık\. Tekrar deneyin; girdikleriniz yerinde\./);
    assert.match(wizard, /Kaydedilemedi, tekrar deneyin\./);
});

test('İşletmeniz yer tutucu hizmetleri veritabanına yazmaz', () => {
    assert.match(wizard, /businessName: trimmed, sector, services: savedServices/);
});

test('v1 kusurları (devir 12 §2) geri gelmez', () => {
    // 2 · "Yalnız ben" telefondaki tek kişilik kiple aynı bayrak.
    assert.match(wizard, /supabase\.rpc\('set_business_mode', \{ p_solo: team === 'solo'/);
    // 3 · Randevu adresi addan oluşur, alınmışsa -2, -3…
    assert.match(wizard, /const slugFromName = /);
    assert.match(wizard, /if \(code !== '23505'\) return false;/);
    // 5 · Olmayan davet özelliği vaat edilmez.
    assert.doesNotMatch(wizard, /davet/i);
    // 6 · Süre yalnız bir kez ve tek sayı.
    assert.equal(wizard.match(/Yaklaşık \d+ dakika/g)?.length, 1);
    assert.doesNotMatch(wizard, /6 dakika|Adım \{/);
});

test('AI asistan anahtarı yalnız bağlıyken çevrilebilir', () => {
    // Hat bağlı değilken açmak sessiz bir yalan olurdu: anahtar açık görünür,
    // hiçbir mesaj cevaplanmaz.
    assert.match(wizard, /disabled=\{connection\.status !== 'connected'\}/);
});

test('bitiş: aboneliği olmayan duvara, denemesi başlamış olan uygulamaya', () => {
    // Siteden gelen denemesi başlamış gelir; panelden kaydolanı kapı
    // /abonelik'e atacak — bitiş bunu söyler ve oraya götürür.
    assert.match(wizard, /const locked = ent\.locked;/);
    assert.match(wizard, /onPri: \(\) => navigate\('\/abonelik'\)/);
    assert.match(wizard, /pri: 'Uygulamaya git', onPri: \(\) => navigate\('\/'\)/);
});

test('kurulumu tek bir sayaç sayıyor — paneller kendi adımlarını saymıyor', () => {
    // Güzellik panelinde 4 adımlı ayrı bir kart vardı: şerit "3 adım kaldı"
    // derken kart "3/4" diyordu (2026-10-19). Tek kaynak lib/setupProgress.
    const dashDir = new URL('../src/components/dashboard/', import.meta.url);
    for (const f of ['GuzellikDashboard.tsx', 'KuaforDashboard.tsx', 'BerberDashboard.tsx']) {
        let src = '';
        try { src = readFileSync(new URL(f, dashDir), 'utf8'); } catch { continue; }
        assert.doesNotMatch(src, /adımda hazırsınız|setupSteps|Kurulum bitince/, `${f} kendi kurulum sayacını tutuyor`);
    }
});
