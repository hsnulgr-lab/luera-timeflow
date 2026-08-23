import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Müdür kabuğu.
//
// Tasarım belgesi yüzen, kenarlara değmeyen bir cam hap çiziyordu. Denendi ve
// bırakıldı — sebep biçimsel değil TEKNİK: gerçek Liquid Glass yalnız sistemin
// çizdiği tab bar'a veriliyor. Barı hap yapmak için elle çizince materyal opak
// yedeğine düşüyor. Biçimi seçmek, materyali kaybetmek demekti.
//
// Bu dosyanın koruduğu şey: bir daha elle tab bar çizilmemesi.

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');

const layout = read('app/(manager)/_layout.tsx');
const staffLayout = read('app/(staff)/_layout.tsx');

test('tab bar sistemin; elle çizilmiyor', () => {
    assert.match(layout, /NativeTabs/);
    // Elle çizilen bir bar gerçek materyali alamaz.
    assert.doesNotMatch(layout, /tabBar=|ManagerTabBar|GlassView|backdropFilter/);
});

test('müdür kabuğu personel kabuğuyla aynı malzemeden kurulur', () => {
    for (const source of [layout, staffLayout]) {
        assert.match(source, /NativeTabs/);
        assert.match(source, /labelVisibilityMode="labeled"/);
        assert.match(source, /tintColor=\{c\.or\}/);
    }
});

test('daralma davranışı bilerek FARKLI', () => {
    // Kumandanın tek büyük butonu ("İşleme başla") her an erişilebilir
    // kalmalı; bar küçülürse başparmak hedefi kayar. Müdür uzun bir akış
    // kaydırıyor — orada barın küçülmesi ekranı ona geri veriyor.
    assert.match(layout, /minimizeBehavior="onScrollDown"/);
    assert.match(staffLayout, /minimizeBehavior="never"/);
});

test('etiketler kalır: "Kasa" ikonunu kimse bilmiyor', () => {
    for (const label of ['Akış', 'Takvim', 'Randevu', 'Kasa', 'Profil']) {
        assert.match(layout, new RegExp(`<Label>${label}</Label>`), `${label} etiketi yok`);
    }
});

test('ikonlar tasarımdan gelir, SF Symbol değil', () => {
    // Native tab bar SVG bileşeni kabul etmiyor: ikon `templateSource` olarak
    // native tarafa geçiyor. Tasarımdaki çizgi ikonlar üç yoğunlukta PNG'ye
    // çevrildi; iOS onları şablon görsel sayıp kendi rengiyle boyuyor.
    assert.doesNotMatch(layout, /sf=/);
    for (const asset of ['akis', 'takvim', 'randevu', 'kasa', 'profil']) {
        assert.match(layout, new RegExp(`assets/tabs/${asset}\\.png`), `${asset} ikonu yok`);
    }
});

test('beş sekme, "+" tam ortada', () => {
    const order = [...layout.matchAll(/name="([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(order, ['index', 'calendar', 'create', 'cash', 'profile']);
});

test('rol eve karar verir: müdür müdür moduna gider', () => {
    for (const path of ['app/(auth)/biometric.tsx', 'app/(auth)/resume.tsx']) {
        assert.match(read(path), /=== 'manager' \? '\/\(manager\)' : '\/\(staff\)'/, path);
    }
    // Yeni işletme açan kişi müdürdür.
    assert.match(read('app/(auth)/signup/ready.tsx'), /router\.replace\('\/\(manager\)'\)/);
});
