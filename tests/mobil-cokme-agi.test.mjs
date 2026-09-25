import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { crashGate, offlineGate, sessionGate } from '../mobile/src/lib/authCopy.ts';

/**
 * KÖK ÇÖKME AĞI · 2026-09-25 · App Store 2.1
 *
 * App Store öncesi denetimde `app/` ve `src/` içinde TEK BİR `ErrorBoundary`
 * bulunamadı. Geliştirmede bir çizim hatası kırmızı ekran olarak görünüyor;
 * üretim derlemesinde aynı hata uygulamayı KAPATIYOR. Hakemin gördüğü çökme
 * en sık ret sebebi.
 *
 * expo-router, bir rota dosyasından dışa aktarılan `ErrorBoundary`yi o
 * rotanın ve altındakilerin hata sınırı yapıyor. Kök düzende olması bütün
 * uygulamayı kapsıyor.
 *
 * Bu dosya dört şeyi kilitliyor:
 *   1. Kök düzen `ErrorBoundary` dışa aktarıyor.
 *   2. Sınır kendi tema ve güvenli alan sağlayıcılarını kuruyor — çünkü
 *      `RootLayout`un YERİNE çiziliyor, onun sağlayıcıları onu sarmıyor.
 *   3. Sistem açılış karesini kaldırıyor — yoksa açılıştaki bir hata karenin
 *      arkasında saklanır.
 *   4. Metni bağlantı ve oturum metinlerinden AYRI.
 */

const oku = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** Yorumlar iddiayı yanlışlıkla karşılamasın. */
const kod = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const layout = kod(oku('mobile/app/_layout.tsx'));
const ui = kod(oku('mobile/src/components/ui.tsx'));

test('kök düzen ErrorBoundary dışa aktarıyor', () => {
    assert.match(layout, /export function ErrorBoundary\(\{ error, retry \}: ErrorBoundaryProps\)/,
        'Kök hata sınırı kalkmış — üretimde bir çizim hatası uygulamayı kapatır.');
    assert.match(layout, /import \{ Stack, type ErrorBoundaryProps \} from 'expo-router';/);
});

test('sınır kendi sağlayıcılarını kuruyor', () => {
    const sinir = layout.slice(layout.indexOf('export function ErrorBoundary'),
        layout.indexOf('function Shell'));
    assert.match(sinir, /<SafeAreaProvider>\s*<ThemeProvider>\s*<AuthCrashScreen/,
        'Sağlayıcısız hata ekranı koyu modda beyaz açılır ve güvenli alanı bilmez.');
    // "Tekrar dene" expo-router'ın kendi yeniden denemesine bağlı.
    assert.match(sinir, /onRetry=\{\(\) => \{ void retry\(\); \}\}/);
});

test('sınır açılış karesini kaldırıyor ve hatayı yazıyor', () => {
    const sinir = layout.slice(layout.indexOf('export function ErrorBoundary'),
        layout.indexOf('function Shell'));
    assert.match(sinir, /dropSplashHandoff\(\);/,
        'Açılışta çıkan hata 6 saniye boyunca sistem karesinin arkasında kalır.');
    assert.match(sinir, /console\.error\('\[kök hata sınırı\]', error\);/,
        'Hata sessizce yutuluyor — sebebi hiçbir yerde görünmez.');
});

test('hata ekranı kendi metni ve ünlem ikonuyla çiziliyor', () => {
    assert.match(ui, /export function AuthCrashScreen\(\{ onRetry \}: \{ onRetry: \(\) => void \}\)/);
    assert.match(ui, /icon="alert" title=\{crashGate\.title\} body=\{crashGate\.body\}/);
    assert.match(ui, /icon === 'alert' \? AlertIcon/);

    assert.equal(crashGate.title, 'Bir şey ters\ngitti');
    assert.equal(crashGate.action, 'Tekrar dene');
    // Kullanıcıya veri kaybı olmadığını söylüyor.
    assert.match(crashGate.body, /Kayıtlı bilgileriniz yerinde/);
    // Bağlantı ya da oturum metni ödünç alınmamış.
    assert.notEqual(crashGate.body, offlineGate.body);
    assert.notEqual(crashGate.body, sessionGate.body);
});
