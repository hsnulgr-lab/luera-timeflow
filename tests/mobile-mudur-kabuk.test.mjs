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

const layout = read('app/mudur/_layout.tsx');
const staffLayout = read('app/personel/_layout.tsx');

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
    // SDK 57: `Label` ve `Icon` üst düzey dışa aktarım olmaktan çıkıp
    // `NativeTabs.Trigger`ın altına indi. Etiketlerin kendisi değişmedi.
    for (const label of ['Akış', 'Takvim', 'Randevu', 'Kasa', 'Profil']) {
        assert.match(
            layout,
            new RegExp(`<NativeTabs\\.Trigger\\.Label>${label}</NativeTabs\\.Trigger\\.Label>`),
            `${label} etiketi yok`,
        );
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
    // Hedefi artık `enterShell` seçiyor. Doğrudan `router.replace` yığının
    // yalnız en üstünü değiştiriyordu; altta bir önceki oturumun kabuğu
    // kalınca müdür profilinden geri kaydırınca personel profili çıkıyordu.
    for (const path of ['app/(auth)/biometric.tsx', 'app/(auth)/resume.tsx']) {
        assert.match(read(path), /enterShell\((?:result\.data|next)\.actor\)/, path);
    }
    // Yeni işletme açan kişi müdürdür.
    assert.match(read('app/(auth)/signup/ready.tsx'), /enterShell\('manager'\)/);
    // Eşleme tek yerde: rol → kabuk adresi.
    const shell = read('src/lib/enterShell.ts');
    assert.match(shell, /actor === 'manager' \? '\/mudur' : '\/personel'/);
    assert.match(shell, /router\.canDismiss\(\)/);
    assert.match(shell, /router\.dismissAll\(\)/);
});
