/**
 * Giriş v3 · ışık alanının sözleşmesi.
 *
 * Bu testler bir görünümü değil, tasarımın SAYILARINI kilitliyor. Alanın
 * kendisi gözle doğrulanır; ama katman kararı, saydamlık tavanları, donuk
 * karenin hangi ana denk geldiği ve kilit ekranının ne kadar sakin olduğu
 * kaymamalı — kayarsa kimse fark etmez.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const src = (p) => {
    const url = fileURLToPath(new URL(`../${p}`, import.meta.url));
    return existsSync(url) ? readFileSync(url, 'utf8') : '';
};

const lib = src('mobile/src/lib/lightField.ts');
const field = src('mobile/src/components/LightField.tsx');
const glass = src('mobile/src/components/GlassPlate.tsx');
const ring = src('mobile/src/components/FaceRing.tsx');
const entrance = src('mobile/src/components/Entrance.tsx');
const welcome = src('mobile/app/(auth)/welcome.tsx');
const brand = src('mobile/src/components/BrandMark.tsx');
const resume = src('mobile/app/(auth)/resume.tsx');

const mod = await import('../mobile/src/lib/lightField.ts').catch(() => null);

test('beş kütle, tasarımdaki renk ve süreleriyle duruyor', () => {
    // Renkler tasarımda yazandan DAHA DOYGUN: mock'un `saturate(160%)` filtresi
    // RN'de yok, karşılığı kaynak renge işlendi (CSS'in kendi saturate matrisi).
    for (const [id, color, size, dur] of [
        ['kor', '#FF4700', 440, 34],
        ['murekkep', '#1B3EE5', 390, 27],
        ['erik', '#C12591', 360, 41],
        ['teal', '#00A797', 320, 23],
        ['sis', '#FFD38C', 280, 19],
    ]) {
        assert.match(lib, new RegExp(`id: '${id}', color: '${color}', size: ${size}`));
        assert.match(lib, new RegExp(`id: '${id}'[\\s\\S]{0,220}duration: ${dur}`));
    }
});

test('süreler ortak katına yakın düşmüyor — desen tekrarlamıyor', () => {
    // 19 · 23 · 27 · 34 · 41: üçü asal. En küçük ortak kat dört saatin
    // ötesinde olmalı, yoksa "aynı animasyonu yine gördüm" hissi doğuyor.
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const lcm = [19, 23, 27, 34, 41].reduce((a, b) => (a * b) / gcd(a, b));
    assert.ok(lcm / 3600 > 4, `ortak kat ${lcm / 3600} saat — dörtten büyük olmalı`);
});

test('katman OS\'a değil cihaz yaşına bakıyor, bilinmeyende düşük', () => {
    assert.match(lib, /yearClass >= 2021 \? 'rich' : 'lite'/);
    assert.match(lib, /if \(typeof yearClass !== 'number'[\s\S]{0,80}return 'lite'/);
});

test('kilit ekranı sayıyla sakin: iki kütle, 2,5× yavaş, bulanıklık 66', () => {
    assert.match(lib, /lockDuration[\s\S]{0,60}kor: 67, sis: 54/);
    assert.match(lib, /\['kor', 'sis'\]/);
    assert.match(lib, /if \(lock\) blur = 66/);
    assert.match(lib, /amp = 0\.18/);
    assert.match(lib, /scaleAmp = 0\.27/);
});

test('donuk kare sıfırıncı saniye DEĞİL — elle seçilmiş bir an', () => {
    assert.match(lib, /FROZEN_AT = 3\.2/);
    assert.doesNotMatch(lib, /FROZEN_AT = 0\b/);
});

test('alanın fazı küresel — ekran değişince kütle baştan başlamıyor', () => {
    assert.match(lib, /const EPOCH = Date\.now\(\)/);
    assert.match(field, /fieldClock\(\)/);
});

test('bant OPAK: bilgi taşıyan renk camdan geçmiyor', () => {
    const ui = src('mobile/src/components/ui.tsx');
    assert.match(ui, /backgroundColor: error \? \(dark \? '#3A1414' : '#FBE7E7'\)/);
});

// Tarif telefonda düzeltildi: `saturate(160%)` RN'de olmadığı için tasarımın
// dolguları camın arkasında gösterecek renk bırakmıyordu ve plakalar siyah
// kutuya dönüyordu. Testin kilitlediği şey artık sayının kendisi değil KURAL:
// aydınlık her zaman koyudan opak (orada risk plakanın kaybolması), ve
// kabartma yalnız tek başına duran büyük yüzeyde.
test('cam tarifi iki temada AYRI: aydınlıkta dolgu daha opak', () => {
    // Dolgular mock'un .52'sinden .08 açık: `expo-blur`'ün `tint="dark"`'ı
    // CSS'in `backdrop-filter`'ında olmayan bir karartma ekliyor, .44 tonun
    // perdesi düşüldükten sonra mock'un bileşiğine denk geliyor.
    assert.match(glass, /plate: \{ blur: 18, darkFill: 0\.44, lightFill: 0\.58/);
    assert.match(glass, /key: \{ blur: 16, darkFill: 0\.44/);
    for (const [, d, l] of glass.matchAll(/darkFill: ([\d.]+), lightFill: ([\d.]+)/g)) {
        assert.ok(Number(l) > Number(d), `aydınlık dolgu ${l}, koyudan (${d}) opak olmalı`);
    }
});

// Android, kenar renkleri kenardan kenara farklı olduğu anda yuvarlak
// dikdörtgen yolunu bırakıp dört düz çizgi çiziyor — köşe kavisleri
// kayboluyor. Bu test o tuzağı kapatıyor: cam plakanın kenarı TEK RENK.
test('kenar tek renk — yoksa Android köşeyi çizmiyor', () => {
    assert.doesNotMatch(glass, /borderBottomColor/);
    assert.doesNotMatch(glass, /emboss/);
});

test('parıltı yalnız büyük plakada ve köşeye girmiyor', () => {
    assert.match(glass, /plate: \{[^}]*sheen: true/);
    assert.match(glass, /key: \{[^}]*sheen: false/);
    assert.match(glass, /left: radius \* 0\.7, right: radius \* 0\.7/);
});

test('halka nefes alır ama BÜYÜMEZ — yükleniyor demiyor', () => {
    assert.match(ring, /duration: 1200/);
    assert.doesNotMatch(ring, /withRepeat[\s\S]{0,160}scale/);
});

test('tanınma 200 ms\'yi geçmiyor', () => {
    assert.match(resume, /setTimeout\(\(\) => enterApp\(result\.data\), 200\)/);
});

test('karşılamada turuncu birincil düğme YOK — bir kapı doğru cevap değil', () => {
    assert.doesNotMatch(welcome, /AuthActionButton/);
});

test('koreografi 1 saniyede bitiyor, alan 5 saniyeye kadar olgunlaşıyor', () => {
    assert.match(entrance, /brand: 0, tagline: 240, dot: 300, door1: 420, door2: 500, foot: 620/);
    assert.match(lib, /INTRO_SECONDS = 5/);
    assert.match(lib, /INTRO_BLUR_FROM = 34/);
});

test('reduceMotion hareketi durduruyor ama alanı boşaltmıyor', () => {
    assert.match(entrance, /REDUCED_MS = 120/);
    assert.match(field, /const still = reduceMotion/);
    assert.match(field, /frozenFrame/);
});

test('kütlelerin tavanı aydınlıkta ×0,62 — krem zeminde leke olmuyor', () => {
    assert.match(lib, /ceilingScale = o\.dark \? 1 : 0\.62/);
});

if (mod) {
    test('frameAt döngü başı ve sonu AYNI kareyi veriyor — sıçrama yok', () => {
        const kor = mod.MASSES[0];
        const a = mod.frameAt(kor, 0);
        const b = mod.frameAt(kor, kor.duration);
        assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6);
    });

    test('introFactor kor ve sis için her zaman 1, ötekiler penceresinde açılıyor', () => {
        assert.equal(mod.introFactor('kor', 0), 1);
        assert.equal(mod.introFactor('sis', 0), 1);
        assert.equal(mod.introFactor('murekkep', 0.5), 0);
        assert.equal(mod.introFactor('murekkep', 3), 1);
        assert.ok(mod.introFactor('erik', 2.2) > 0 && mod.introFactor('erik', 2.2) < 1);
    });

    test('form ekranında alan KISILMIYOR — mock da kısmıyor', () => {
        const form = mod.fieldPlan({ profile: 'form', tier: 'rich', dark: true, small: false, android: false });
        const wel = mod.fieldPlan({ profile: 'welcome', tier: 'rich', dark: true, small: false, android: false });
        assert.equal(form.masses[0].ceiling, wel.masses[0].ceiling);
        assert.ok(form.masses[0].duration > wel.masses[0].duration, 'yalnız yavaşlıyor');
    });

    test('klavye alanı DURDURMUYOR, bir kademe geriye çekiyor', () => {
        const open = mod.fieldPlan({ profile: 'form', tier: 'rich', dark: true, small: false, android: false, keyboard: true });
        const shut = mod.fieldPlan({ profile: 'form', tier: 'rich', dark: true, small: false, android: false });
        assert.ok(open.blur > shut.blur, 'klavye açıkken daha bulanık olmalı');
        assert.ok(open.masses[0].ceiling < shut.masses[0].ceiling, 'daha soluk olmalı');
        assert.equal(open.masses.length, shut.masses.length, 'kütle sayısı değişmemeli');
    });

    test('düşük katmanda hareket DURMUYOR, yalnız seyreliyor', () => {
        const lite = mod.fieldPlan({ profile: 'welcome', tier: 'lite', dark: true, small: false, android: true });
        assert.equal(lite.masses.length, 3);
        assert.equal(lite.blur, 30);
        assert.equal(lite.breathe, false);
        assert.ok(lite.masses.every((m) => m.duration > 0), 'süreler sıfırlanmamalı');
    });

    test('Android\'de bulanıklık nefesi kapalı — her kare yeni çizim geçişi', () => {
        const droid = mod.fieldPlan({ profile: 'welcome', tier: 'rich', dark: true, small: false, android: true });
        assert.equal(droid.breathe, false);
        assert.equal(droid.blur, 44);
    });

    test('kilit ekranı karşılamadan belirgin soluk (mock\'un `.calm`\'ı)', () => {
        const a = mod.fieldPlan({ profile: 'welcome', tier: 'rich', dark: true, small: false, android: false });
        const d = mod.fieldPlan({ profile: 'lock', tier: 'rich', dark: true, small: false, android: false });
        const oran = a.masses[0].ceiling / d.masses[0].ceiling;
        assert.ok(oran > 2 && oran < 2.6, `oran ${oran.toFixed(2)} — 2,3 civarı olmalı`);
        assert.equal(d.masses.length, 2);
    });
}

// ── Marka · luera + timeflow hapı ──────────────────────────────────────────

test('hap noktadan doğuyor — ayrı bir nesne belirmiyor', () => {
    // Aynı yuvarlaklık, aynı turuncu; değişen yalnız ölçü. Bağ buradan geliyor.
    assert.match(brand, /width: dot \+ \(pillW - dot\) \* open\.value/);
    assert.match(brand, /height: dot \+ \(pillH - dot\) \* open\.value/);
    assert.match(brand, /backgroundColor: c\.or/);
});

test('dört adımın süreleri kaynağındaki gibi', () => {
    assert.match(brand, /word: \{ at: 0, ms: 650 \}/);
    assert.match(brand, /pop: \{ at: 900, ms: 380 \}/);
    assert.match(brand, /pill: \{ at: 1360, ms: 520 \}/);
    assert.match(brand, /text: \{ at: 1920, ms: 350 \}/);
});

test('genişlik ÖLÇÜLÜYOR, hesaplanmıyor', () => {
    // "timeflow"un eni yazı tipine ve puntoya bağlı; tahmin edilirse hap ya
    // kelimeyi kesiyor ya da yanında boşluk kalıyor.
    assert.match(brand, /onLayout=\{\(e\) => setTextW\(e\.nativeEvent\.layout\.width\)\}/);
    assert.match(brand, /if \(!ready\) return;/);
});

test('hapın tabanı TABAN ÇİZGİSİNDE, metin kutusunun dibinde değil', () => {
    // `flex-end` hapı kutunun dibine yaslıyor; o dip taban çizgisi değil,
    // altında iniş payı var ve hap çizginin altında kalıyordu.
    assert.match(brand, /const baseline = size \* 0\.18;/);
    assert.match(brand, /marginBottom: baseline,/);
    assert.doesNotMatch(brand, /marginBottom: size \* authMetrics\.brandDotBottomRatio/);
});

test('hap kelimenin bandında — taban çizgisinin altına sarkmıyor', () => {
    // Kaynaktaki 0,38 em hapı aşağıda asılı bir rozete çeviriyordu. Hap
    // noktanın alt payını koruyup YUKARI büyüyor: tabanı taban çizgisinde
    // kalıyor, tepesi x-yüksekliğine (≈0,52 em) çıkıyor.
    assert.match(brand, /const pillH = size \* 0\.54;/);
    assert.doesNotMatch(brand, /size \* 0\.38/);
});

test('timeflow hapın 0,52\'si kadar ve 9,5 pt\'nin altına inmiyor', () => {
    assert.match(brand, /Math\.max\(pillH \* 0\.52, 9\.5\)/);
});

test('reduceMotion ve animate kapalıyken hap AÇIK duruyor, gösteri yok', () => {
    assert.match(brand, /const still = reduceMotion \|\| !animate;/);
    assert.match(brand, /if \(still\) \{ word\.value = 1; pop\.value = 1; open\.value = 1; label\.value = 1;/);
});

test('marka kendi koreografisini taşıyor — Entrance\'ın marka adımı karşılamada yok', () => {
    assert.doesNotMatch(welcome, /useEntrance\('brand'\)/);
    assert.doesNotMatch(welcome, /useEntrance\('dot'\)/);
    assert.match(welcome, /<LueraTimeflowMark/);
});
