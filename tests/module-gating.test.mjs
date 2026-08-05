import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SECTOR_PROFILES, profileForSector } from '../src/lib/sectorProfiles.ts';

// Modül kapılarının davranış testi.
//
// İki tür iddia var:
//  1. Sektör profillerinin modül setleri (gerçek davranış — profil import edilir)
//  2. Kasa yüzeylerinin kapıya bağlı olduğu (kaynak taraması) — yeni bir
//     "/kasa" linki eklenip kapı unutulursa bu test kırılır. Kasa linkleri
//     kod tabanına dağılmış durumda ve tek tek gözle takip edilemiyor.

const SRC = new URL('../src/', import.meta.url).pathname;
const ALL_MODULE_KEYS = ['randevu', 'personel', 'hizmet', 'kasa', 'masa', 'analiz', 'sira'];

function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
}

const SOURCES = walk(SRC).map((path) => ({ path, text: readFileSync(path, 'utf8') }));

test('kasa yalnız avukatlık bürosunda varsayılan kapalı', () => {
    assert.equal(profileForSector('avukat').modules.kasa, false);

    const withCash = Object.entries(SECTOR_PROFILES)
        .filter(([, profile]) => profile.modules.kasa !== false)
        .map(([sector]) => sector);
    const withoutCash = Object.keys(SECTOR_PROFILES).filter((s) => !withCash.includes(s));

    assert.deepEqual(withoutCash, ['avukat']);
    assert.equal(withCash.length, Object.keys(SECTOR_PROFILES).length - 1);
});

test('her sektör profili modül anahtarlarının tamamını tanımlar', () => {
    // Eksik anahtar normalizeModules'ta sessizce DEFAULT_MODULES'a düşer;
    // profilin niyeti ile çalışan sistem sessizce ayrışırdı.
    for (const [sector, profile] of Object.entries(SECTOR_PROFILES)) {
        for (const key of ALL_MODULE_KEYS) {
            assert.equal(typeof profile.modules[key], 'boolean', `${sector}.modules.${key} boolean değil`);
        }
    }
});

test('masa açık olan sektörde kasa da açık', () => {
    // Restoran adisyonu kasadan tahsil ediliyor; {masa:true, kasa:false} kırık
    // bir durum. Profil düzeyinde bu kombinasyon hiç üretilmemeli.
    for (const [sector, profile] of Object.entries(SECTOR_PROFILES)) {
        if (profile.modules.masa) {
            assert.equal(profile.modules.kasa, true, `${sector}: masa açıkken kasa kapalı olamaz`);
        }
    }
});

test('/kasa navigasyonu içeren her yüzey kasa kapısını kullanır', () => {
    // Muafiyetler ve gerekçeleri — her biri kasayı BAŞKA bir yolla zaten
    // koruyor. Listeye ekleme yaparken gerekçe de yazılmalı.
    const EXEMPT = [
        'hooks/useModules.ts',           // kapının kendisi
        'lib/nav.ts',                    // module:'kasa' alanıyla bildirimli
        'pages/KasaPage.tsx',            // sayfa açıldıysa ModuleRoute geçmiştir
        'pages/BeautyCashRegister.tsx',  // aynı
        'mobile/pages/MobileKasa.tsx',   // aynı
        'App.tsx',                       // ModuleRoute tanımının kendisi
        'components/layout/Layout.tsx',  // yalnız stil (path.startsWith), navigasyon değil
        'components/layout/Sidebar.tsx', // NAV_ITEMS.module filtresi
        'mobile/BottomTabBar.tsx',       // NAV_ITEMS.module filtresi + isEnabled('kasa')
    ];

    // Kasıtlı olarak GENİŞ: navigate(), to:, navigateTo:, path: — hangi biçimde
    // yazılırsa yazılsın "/kasa" adresini anan dosya kapıyı da anmalı.
    const offenders = SOURCES
        .filter(({ path }) => !EXEMPT.some((suffix) => path.endsWith(suffix)))
        .filter(({ text }) => /['"`]\/kasa/.test(text))
        .filter(({ text }) => !text.includes('useCashEnabled'))
        .map(({ path }) => path.slice(SRC.length));

    assert.deepEqual(offenders, [],
        `Bu dosyalar /kasa'ya kapısız yönlendiriyor — useCashEnabled() ile koşullayın:\n  ${offenders.join('\n  ')}`);
});
