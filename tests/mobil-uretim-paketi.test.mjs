import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';

/**
 * ÜRETİM PAKETİ — GELİŞTİRMEDE ÇALIŞIP MAĞAZADA KIRILAN ŞEYLER · 2026-09-25
 *
 * `expo start --no-dev --minify` ile yapılan bir denemede uygulama İLK
 * EKRANDA takıldı: "Oturum bilgisi okunamadı". Geliştirme kipinde aynı kod
 * kusursuz çalışıyordu.
 *
 * Sebep dinamik `import()`'tu. Üretim paketinde Metro onu ayrı bir JS parçası
 * indirmeye çeviriyor; React Native'de `location` global'i yok, adres
 * çözülemiyor ve çağrı 8 ms'de patlıyor:
 *
 *   "Unable to determine the production URL where additional JavaScript
 *    chunks are hosted because the global `location` variable is not defined."
 *
 * `src/api/auth.ts` içinde 9, `src/theme/index.tsx` içinde 2 tane vardı —
 * hepsi aynı küçük modülü (AsyncStorage) tembel yüklüyordu, hiçbirinin
 * kazancı yoktu. App Store derlemesi de `dev: false` ile üretiliyor: bu hata
 * mağazadan indiren HERKESTE olurdu.
 *
 * Bu dosya üç şeyi kilitliyor:
 *   1. Mobilde dinamik import yok.
 *   2. Açılış hatası SESSİZCE yutulmuyor.
 *   3. WhatsApp hattı 'connecting'de takılı kalamıyor.
 */

const KOK = new URL('../', import.meta.url);
const oku = (p) => readFileSync(new URL(p, KOK), 'utf8');
/** Yorumlar iddiayı yanlışlıkla karşılamasın ya da yanlışlıkla ihlal etmesin. */
const kod = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function* dosyalar(dizin) {
    for (const ad of readdirSync(new URL(dizin, KOK))) {
        if (ad === 'node_modules' || ad.startsWith('.')) continue;
        const yol = `${dizin}/${ad}`;
        if (statSync(new URL(yol, KOK)).isDirectory()) yield* dosyalar(yol);
        else if (/\.tsx?$/.test(ad)) yield yol;
    }
}

test('mobilde dinamik import YOK — üretim paketinde kırılıyor', () => {
    const suclu = [];
    for (const yol of [...dosyalar('mobile/src'), ...dosyalar('mobile/app')]) {
        const govde = kod(oku(yol));
        // `import(` — ama `import x from` ya da `import {` değil.
        if (/(?<![.\w])import\s*\(/.test(govde)) suclu.push(yol);
    }
    assert.deepEqual(suclu, [],
        'Dinamik import geri geldi. Üretim paketinde ayrı JS parçası indirmeye '
        + 'dönüşür ve RN\'de `location` olmadığı için açılışta patlar. '
        + 'Statik import kullan.');
});

test('açılış hatası sessizce yutulmuyor', () => {
    const index = oku('mobile/app/index.tsx');
    // Zaman aşımı hâlâ yerinde (bkz. mobil-splash-devri).
    assert.match(index, /const LAUNCH_TIMEOUT_MS = 5000;/);
    // Ama `catch` artık boş değil: sebep bir yere yazılıyor.
    assert.match(index, /\.catch\(\(err\) => \{/,
        'catch parametresiz hâle dönmüş — hata nesnesi kayboluyor.');
    assert.match(index, /console\.error\('\[açılış\] getLaunchState başarısız:', err\)/,
        'Açılış hatası tekrar sessizleşti; bu körlük bir kez haftalarca sürdü.');
});

test('WhatsApp hattı "connecting"de takılı kalamıyor', () => {
    const wa = oku('supabase/functions/_shared/wa.ts');
    const remind = oku('supabase/functions/remind/index.ts');

    // Süzgeç yalnız 'connected' olamaz: o zaman durumu düzeltecek olan
    // `verifyConnection` takılı org'a hiç uğramaz.
    assert.doesNotMatch(kod(wa), /\.eq\('status', 'connected'\)/,
        'Süzgeç yeniden yalnız "connected"a daraldı — "connecting" org sonsuza '
        + 'kadar orada kalır (7 hafta sürdü, 2026-09-25).');
    assert.match(wa, /\.in\('status', \['connected', 'connecting'\]\)/);
    assert.match(wa, /export async function linkedOrgs/);

    // Gönderim kapısı YERİNDE kalmalı: genişletmenin güvenli olmasının tek
    // sebebi bu — ölü hatta mesaj gitmez, yalnız durumu düzeltilir.
    assert.match(remind, /const orgList = await linkedOrgs\(supabase\);/);
    assert.match(remind, /if \(!\(await verifyConnection\(supabase, orgWa as OrgWa\)\)\) \{/);
});
