import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';

/**
 * APPLE EŞİĞİ · A — sistem açılış karesi ve karşılamaya devir (2026-09-18).
 *
 * iOS'un açılış karesi STATİK. Kare karşılamanın ilk anından üretiliyor ve
 * markası "luera." — kelime + nokta, hap açılmamış. Giriş v3'ün marka
 * hikâyesi (kelime → nokta → hap → timeflow) karşılamada oradan devam ediyor.
 * Tasarımın önerdiği ayrı "TIMEFLOW" satırı markada hiç olmayan üçüncü bir
 * biçimdi; alınmadı.
 */

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
const app = JSON.parse(read('app.json'));
const handoff = read('src/lib/splashHandoff.ts');
const welcome = read('app/(auth)/welcome.tsx');
const index = read('app/index.tsx');
const mark = read('src/components/BrandMark.tsx');
const root = read('app/_layout.tsx');
const script = read('scripts/render-splash.swift');

test('sistem karesi iki temada, tam ekran', () => {
    // `userInterfaceStyle: automatic` — koyu temadaki kişi beyaz flaş görmesin.
    const entry = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen');
    assert.ok(entry, 'expo-splash-screen eklentisi yapılandırılmış');
    const ios = entry[1].ios;
    assert.equal(ios.enableFullScreenImage_legacy, true);
    assert.equal(ios.resizeMode, 'cover');
    assert.equal(ios.image, './assets/splash-light.png');
    assert.equal(ios.dark.image, './assets/splash-dark.png');
    assert.equal(ios.backgroundColor, '#F3ECE0');
    assert.equal(ios.dark.backgroundColor, '#120E08');
    for (const name of ['splash-dark.png', 'splash-light.png']) {
        assert.ok(statSync(new URL(`../mobile/assets/${name}`, import.meta.url)).size > 0, name);
    }
});

test('kare KODUN sayılarından üretiliyor — elle çizilmiyor', () => {
    // Işık alanı değişirse görüntü betikle yeniden üretilir.
    assert.match(script, /Mass\(color: 0xFF4700, size: 440, left: -90, top: 0\.44 \* H/);
    assert.match(script, /Mass\(color: 0xFFD38C, size: 280, left: 0\.08 \* W, top: 0\.08 \* H/);
    // Marka "luera." — ayrı bir TIMEFLOW satırı YOK.
    assert.match(script, /NSAttributedString\(string: "luera"/);
    assert.doesNotMatch(script, /TIMEFLOW|"timeflow"/i);
});

test('sistem karesi kod karar verene kadar yerinde', () => {
    assert.match(handoff, /SplashScreen\.preventAutoHideAsync\(\)/);
    assert.match(root, /^import '\.\.\/src\/lib\/splashHandoff';$/m);
    // Emniyet: hiçbir yol karar vermezse bile uygulama kilitli kalmıyor.
    assert.match(handoff, /setTimeout\(\(\) => \{ pending = false; hideSplash\(\); \}, 6000\);/);
});

test('karşılama dışındaki yollar kareyi DOĞRUDAN kaldırıyor', () => {
    assert.match(index, /if \(failed \|\| \(launch && launch\.target !== 'welcome'\)\) dropSplashHandoff\(\);/);
    // 5 sn'de okuma bırakılıyor ve hata ekranı geliyor — karşılamaya değil.
    assert.match(index, /const LAUNCH_TIMEOUT_MS = 5000;/);
    assert.match(index, /setTimeout\(\(\) => \{ if \(alive\) setFailed\(true\); \}, LAUNCH_TIMEOUT_MS\)/);
});

test('karşılama kareyi devralıyor: aynı görüntü, aynı cover, sonra solma', () => {
    assert.match(welcome, /const \[handoff\] = useState\(takeSplashHandoff\);/);
    assert.match(welcome, /require\('\.\.\/\.\.\/assets\/splash-dark\.png'\)/);
    assert.match(welcome, /resizeMode="cover"/);
    // Sistem karesi ancak ikizi çizildiğinde kalkıyor — araya boş kare girmez.
    assert.match(welcome, /onLoad=\{\(\) => \{ hideSplash\(\); setGone\(true\); \}\}/);
    assert.match(welcome, /const HANDOFF_MS = 240;/);
});

test('devirde marka NOKTADAN devam ediyor', () => {
    assert.match(welcome, /from=\{handoff \? 'dot' : 'start'\}/);
    // İlk kare splash'la aynı: kelime ve nokta ölçüm gelmeden görünür.
    assert.match(mark, /const word = useSharedValue\(still \|\| from === 'dot' \? 1 : 0\);/);
    assert.match(mark, /const pop = useSharedValue\(still \|\| from === 'dot' \? 1 : 0\.3\);/);
    // Hap ile yazı arasındaki aralık v3'teki gibi.
    assert.match(mark, /text: \{ at: 360 \+ \(BRAND_STEPS\.text\.at - BRAND_STEPS\.pill\.at\)/);
});

test('devir TEK KULLANIMLIK — çıkış yapıp dönen hikâyeyi baştan görür', () => {
    assert.match(handoff, /const was = pending;\s*pending = false;\s*return was;/);
});
