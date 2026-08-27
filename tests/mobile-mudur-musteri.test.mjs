/**
 * Müdür 23 — Müşteri kartı testleri.
 *
 * Bu dosyanın koruduğu sözleşmeler:
 *   • Ekran tek bir soruya cevap verir: "bu müşteri kim ve ona nasıl davranmalıyım?"
 *   • Kimlik BAŞ HARFLERDEN gelir — fotoğraf yok, olmayacak.
 *   • Bilinmeyen bakiye satır üretmez ("₺0" asla yazılmaz).
 *   • Risk ve borç aynı bileşendir; ikisi birden varsa RİSK ÜSTTE, borç altta.
 *   • Levhalar bakiye TAŞIMAZ ("kalan seans" ve "son geliş" taşır).
 *   • Ok yalnız gidilecek yer varsa çizilir (opens: true).
 *   • Toplanmış asılı levhada RİSK kalır, BORÇ kalmaz.
 *   • Toplanma eşikleri: [0, 24, 32, 48, 64].
 *   • useNativeDriver: true zorunlu; LayoutAnimation / Reanimated / GestureHandler YOK.
 *   • Cam yalnız üç yüzeyde: kroma satırı, iki levha, toplanmış asılı levha.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 23 Musteri Karti.html`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    cardLabel, customerPlates, dialPhone, displayPhone, findCustomer, formatTRY,
    hangRisk, heroGrows, heroWarns, historyEmpty, historyMeta, mockCustomers,
    monogramOf, nameLines, trayReminder, upcomingSub, NOTES_EMPTY, TRAY_GHOST, TRAY_MAIN,
} from '../mobile/src/lib/customerCard.ts';
import {
    customerGlass, customerHero, customerMetrics, customerMotion,
} from '../mobile/src/theme/tokens.ts';

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

const cardComponent = code('src/components/CustomerCard.tsx');
const partsComponent = code('src/components/CustomerParts.tsx');
const customerRoute = code('app/(staff-flow)/customer.tsx');
const randevuRoute = code('app/(manager-flow)/randevu/[id].tsx');
const tokensFile = read('src/theme/tokens.ts');
const designHtml = readFileSync(
    new URL('../docs/design-reference/Luera Mobil - Mudur 23 Musteri Karti.html', import.meta.url),
    'utf8',
);

// ── 1. Baş harfler & İsim Bölme ─────────────────────────────────────────────

test('monogram baş harflerden gelir, en fazla 2 harf, Türkçe i->İ', () => {
    assert.equal(monogramOf('Zeynep Kaya'), 'ZK');
    assert.equal(monogramOf('Elif Demir'), 'ED');
    assert.equal(monogramOf('Kerem Yıldız'), 'KY');
    assert.equal(monogramOf('Gülşah Karaosmanoğlu'), 'GK');
    assert.equal(monogramOf('İpek Öztürk'), 'İÖ');
    assert.equal(monogramOf('Ahmet'), 'A');
    assert.equal(monogramOf(''), '');
});

test('isim iki satıra bölünür: ad ince, soyad kalın; üçüncü satır yok', () => {
    assert.deepEqual(nameLines('Zeynep Kaya'), { given: 'Zeynep', family: 'Kaya' });
    assert.deepEqual(nameLines('Elif Demir'), { given: 'Elif', family: 'Demir' });
    assert.deepEqual(nameLines('Gülşah Karaosmanoğlu'), { given: 'Gülşah', family: 'Karaosmanoğlu' });
    assert.deepEqual(nameLines('Ayşe Fatma Demir'), { given: 'Ayşe Fatma', family: 'Demir' });
    assert.deepEqual(nameLines('Tek'), { given: '', family: 'Tek' });
});

test('tutar formatı kuruşsuz, binlik noktalı', () => {
    assert.equal(formatTRY(450), '450');
    assert.equal(formatTRY(1200), '1.200');
    assert.equal(formatTRY(25000), '25.000');
});

// ── 2. Kahraman Uyarı Satırı (Risk & Borç) ──────────────────────────────────

test('bilinmeyen bakiye (null) satır üretmez; "₺0" asla yazılmaz', () => {
    const gulsah = mockCustomers.find((c) => c.id === 'c-gulsah');
    assert.ok(gulsah);
    assert.equal(gulsah.balance, null);
    const warns = heroWarns(gulsah);
    assert.deepEqual(warns, []);
    assert.equal(heroGrows(gulsah), false);
});

test('sıfır bakiye (0) borç satırı üretmez', () => {
    const zeynep = mockCustomers.find((c) => c.id === 'c-zeynep');
    assert.ok(zeynep);
    assert.equal(zeynep.balance, 0);
    const warns = heroWarns(zeynep);
    assert.deepEqual(warns, []);
    assert.equal(heroGrows(zeynep), false);
});

test('risk satırı kırmızı uyarı üretir ve kahraman alanı uzatır', () => {
    const elif = mockCustomers.find((c) => c.id === 'c-elif');
    assert.ok(elif);
    const warns = heroWarns(elif);
    assert.equal(warns.length, 1);
    assert.equal(warns[0].kind, 'risk');
    assert.equal(warns[0].label, 'Alerji');
    assert.equal(warns[0].text, 'Saç boyasına alerjisi var');
    assert.equal(heroGrows(elif), true);
});

test('borç satırı amber uyarı üretir ve kahraman alanı uzatır', () => {
    const kerem = mockCustomers.find((c) => c.id === 'c-kerem');
    assert.ok(kerem);
    const warns = heroWarns(kerem);
    assert.equal(warns.length, 1);
    assert.equal(warns[0].kind, 'debt');
    assert.equal(warns[0].label, 'Bakiye');
    assert.equal(warns[0].text, '₺450 borç var · 12 Haz işleminden');
    assert.equal(heroGrows(kerem), true);
});

test('hem risk hem borç varsa RİSK ÜSTTE, borç altta', () => {
    const dualCard = {
        id: 'c-dual',
        name: 'Merve Can',
        phone: '+905551234567',
        risk: { label: 'Hamile', text: '6 aylık hamile' },
        balance: 750,
        balanceSince: '5 Haz işleminden',
        pkg: null,
        lastVisit: null,
        firstVisitToday: null,
        upcoming: null,
        history: [],
        notes: [],
    };
    const warns = heroWarns(dualCard);
    assert.equal(warns.length, 2);
    assert.equal(warns[0].kind, 'risk');
    assert.equal(warns[0].label, 'Hamile');
    assert.equal(warns[1].kind, 'debt');
    assert.equal(warns[1].label, 'Bakiye');
});

// ── 3. İki Levha (Kalan Seans & Son Geliş) ───────────────────────────────────

test('levhalar bakiye TAŞIMAZ; kalan seans ve son geliş taşır', () => {
    const zeynep = mockCustomers.find((c) => c.id === 'c-zeynep');
    assert.ok(zeynep);
    const [left, right] = customerPlates(zeynep);

    assert.equal(left.key, 'sessions');
    assert.equal(left.label, 'Kalan seans');
    assert.equal(left.value, '6'); // 10 - 4 = 6
    assert.equal(left.soft, false);
    assert.equal(left.sub, '10 seanslık bakım · 4 kullanıldı');
    assert.equal(left.opens, false);

    assert.equal(right.key, 'lastVisit');
    assert.equal(right.label, 'Son geliş');
    assert.equal(right.value, '18 Haz');
    assert.equal(right.soft, false);
    assert.equal(right.sub, '7. ziyaret · Merve ile');
    // OK YOK: `CustomerVisit` randevu kimliği taşımıyor, açılacak bir kart
    // yok — ve son geliş zaten aşağıdaki listenin ilk satırı.
    assert.equal(right.opens, false);
});

test('hiçbir levha ok çizmiyor — ölü kontrol bırakılmadı', () => {
    for (const customer of mockCustomers) {
        for (const plate of customerPlates(customer)) {
            assert.equal(plate.opens, false, `${customer.id}/${plate.key} ok çiziyor`);
        }
    }
});

test('paket yoksa sol levha "Yok" yazar ve soft işaretlenir', () => {
    const gulsah = mockCustomers.find((c) => c.id === 'c-gulsah');
    assert.ok(gulsah);
    const [left, right] = customerPlates(gulsah);

    assert.equal(left.label, 'Paket');
    assert.equal(left.value, 'Yok');
    assert.equal(left.soft, true);
    assert.equal(left.sub, 'Randevuda tanımlanabilir');
    assert.equal(left.opens, false);

    assert.equal(right.label, 'İlk ziyaret');
    assert.equal(right.value, 'Bugün');
    assert.equal(right.soft, false);
    assert.equal(right.opens, false); // Gidilecek geçmiş yok, ok çizilmez
});

test('ok yalnız opens: true olduğunda çizilir (ölü kontrol yok)', () => {
    assert.match(partsComponent, /plate\.opens\s*\?\s*\(/);
    assert.match(partsComponent, /if\s*\(!plate\.opens\s*\|\|\s*!onOpen\)\s*return inner/);
});

// ── 4. Alt Eylem Çubuğu Hatırlatması ────────────────────────────────────────

test('trayReminder yalnız borç varsa amber satır döner, yoksa null', () => {
    const zeynep = mockCustomers.find((c) => c.id === 'c-zeynep');
    const elif = mockCustomers.find((c) => c.id === 'c-elif');
    const kerem = mockCustomers.find((c) => c.id === 'c-kerem');
    const gulsah = mockCustomers.find((c) => c.id === 'c-gulsah');

    assert.equal(trayReminder(zeynep), null);
    assert.equal(trayReminder(elif), null);
    assert.equal(trayReminder(gulsah), null);
    assert.equal(trayReminder(kerem), '₺450 borç var — randevu vermeden önce hatırlat');
});

// ── 5. Toplanmış Asılı Levha ────────────────────────────────────────────────

test('toplanmış asılı levhada RİSK kalır, BORÇ KALMAZ', () => {
    const elif = mockCustomers.find((c) => c.id === 'c-elif');
    const kerem = mockCustomers.find((c) => c.id === 'c-kerem');
    const zeynep = mockCustomers.find((c) => c.id === 'c-zeynep');

    assert.equal(hangRisk(elif), 'Saç boyasına alerjisi var');
    // Kerem borçlu ama borç asılı levhada kalmaz!
    assert.equal(hangRisk(kerem), null);
    assert.equal(hangRisk(zeynep), null);
});

// ── 6. Telefon Dönüşümleri ──────────────────────────────────────────────────

test('displayPhone numarayı maskelemeden tam gösterir', () => {
    const zeynep = mockCustomers.find((c) => c.id === 'c-zeynep');
    assert.equal(displayPhone(zeynep), '0532 118 24 06');
    assert.equal(dialPhone(zeynep), '+905321182406');
});

// ── 7. Müşteri Arama (findCustomer) ─────────────────────────────────────────

test('findCustomer id veya Türkçe isimle bulur', () => {
    assert.equal(findCustomer({ id: 'c-zeynep' })?.name, 'Zeynep Kaya');
    assert.equal(findCustomer({ name: 'elif demir' })?.id, 'c-elif');
    assert.equal(findCustomer({ name: 'GÜLŞAH KARAOSMANOĞLU' })?.id, 'c-gulsah');
    assert.equal(findCustomer({ id: 'c-olmayan' }), null);
});

// ── 8. Erişilebilirlik Cümlesi ──────────────────────────────────────────────

test('cardLabel risk bilgisini her zaman ikinci sırada okur', () => {
    const elif = mockCustomers.find((c) => c.id === 'c-elif');
    assert.ok(elif);
    const label = cardLabel(elif);
    assert.ok(label.startsWith('Elif Demir, Saç boyasına alerjisi var'));
});

// ── 9. Kaynak Kod Sözleşme Denetimleri (Regex) ──────────────────────────────

test('useNativeDriver: true zorunlu, useNativeDriver: false YOK', () => {
    assert.ok(!/useNativeDriver:\s*false/.test(cardComponent));
    assert.ok(!/useNativeDriver:\s*false/.test(partsComponent));
    assert.match(cardComponent, /useNativeDriver:\s*true/);
});

test('LayoutAnimation, Reanimated ve GestureHandler KULLANILMAZ', () => {
    assert.ok(!/LayoutAnimation/.test(cardComponent));
    assert.ok(!/LayoutAnimation/.test(partsComponent));
    assert.ok(!/react-native-reanimated/.test(cardComponent));
    assert.ok(!/react-native-reanimated/.test(partsComponent));
    assert.ok(!/react-native-gesture-handler/.test(cardComponent));
    assert.ok(!/react-native-gesture-handler/.test(partsComponent));
});

test('toplanma eşikleri [0, 24, 32, 48, 64] olarak tanımlıdır', () => {
    assert.deepEqual(customerMotion.collapse, [0, 24, 32, 48, 64]);
    assert.match(tokensFile, /collapse:\s*\[0,\s*24,\s*32,\s*48,\s*64\]/);
});

test('cam yalnız kroma satırı, levhalar ve asılı levhada kullanılır', () => {
    assert.match(partsComponent, /HeroGlass/);
    assert.match(partsComponent, /kind="plate"/);
    assert.match(cardComponent, /<HeroGlass[\s\S]*?kind="hang"/);
});

test('risk satırında numberOfLines yoktur (metin sarar)', () => {
    const rawParts = read('src/components/CustomerParts.tsx');
    assert.match(rawParts, /numberOfLines YOK/);
    assert.match(partsComponent, /fontSize:\s*customerMetrics\.warnText[\s\S]*?\{warn\.text\}/);
});

test('gömülü yaklaşan randevu kartı tema değişimine uygundur', () => {
    assert.match(cardComponent, /UpcomingEmbedCard/);
    assert.match(cardComponent, /panelInk/);
});

test('alt eylem çubuğu scroll dışında sabittir (hiç toplanmaz)', () => {
    // Tray, ScrollView'ın dışında yer alır
    assert.match(cardComponent, /<\/Animated\.ScrollView>[\s\S]*?{TRAY_MAIN}/);
});

test('customer rotasında Zeynep Kaya sessiz yedeği GEÇMEMELİ', () => {
    assert.ok(!/Zeynep Kaya/.test(customerRoute));
    assert.match(customerRoute, /if\s*\(!query\.id\s*&&\s*!query\.name\)\s*\{\s*return null;\s*\}/);
});

test('randevu rotasındaki onCustomer push çağrısı customerId ve customerName params taşır', () => {
    assert.match(randevuRoute, /onCustomer=\{[\s\S]*?pathname:\s*'\/(\(staff-flow\)\/)?customer'/);
    assert.match(randevuRoute, /customerId:\s*appointment\.customer_id/);
    assert.match(randevuRoute, /customerName:\s*appointment\.customer_name/);
});

test('parametre verilmediğinde findCustomer null döner ve rota Empty gösterir', () => {
    assert.equal(findCustomer({}), null);
    assert.equal(findCustomer({ id: undefined, name: undefined }), null);
    assert.match(customerRoute, /<Empty[\s\S]*?title="Müşteri bulunamadı"/);
});


// ── Yerleşim kapısı: levhalar uyarı satırının üstüne binmemeli ───────────────

test('levhalar kahraman alanın DOĞRUDAN çocuğu — araya sarmalayıcı View girmez', () => {
    const screen = code('src/components/CustomerCard.tsx');
    // <Plates> bir opacity sarmalayıcısının içinde olsaydı, mutlak konumu o
    // sarmalayıcıya göre çözülür ve akışın bittiği yere — uyarı satırının
    // üstüne — düşerdi. Sönüm bu yüzden prop olarak geçer.
    assert.ok(/<Plates[\s\S]{0,200}opacity=\{platesOpacity\}/.test(screen));
    assert.ok(!/<Animated\.View style=\{\{ opacity: platesOpacity \}\}/.test(screen));
});

test('kahraman alanın kendisinde dolgu yok — dolgu iç akış katmanında', () => {
    const screen = code('src/components/CustomerCard.tsx');
    const hero = screen.slice(screen.indexOf('height: heroHeight'));
    const heroBox = hero.slice(0, hero.indexOf('<HeroGradient'));
    // Mutlak konumlu levha/monogram/gradyan alanın gerçek kenarlarından
    // ölçülsün diye kutunun kendisi dolgusuz kalır.
    assert.ok(!/padding/.test(heroBox));
    assert.ok(/paddingBottom: customerMetrics\.heroPadBottom/.test(screen));
});

test('uyarı varsa kahraman alan uzar — levhaya yer açılır', () => {
    const screen = code('src/components/CustomerCard.tsx');
    assert.ok(/heroGrows\(card\)/.test(screen));
    assert.ok(/customerMetrics\.heroHeightWarn\b/.test(screen));
    // 76 dolgu + 44 taşma: levhanın üstü akışın altından ayrı durur.
    assert.equal(customerMetricsBottomGap(), 14);
});

function customerMetricsBottomGap() {
    const tokens = read('src/theme/tokens.ts');
    // Aynı adlar başka token bloklarında da geçiyor — yalnız customerMetrics.
    const block = tokens.slice(tokens.indexOf('export const customerMetrics'));
    const pick = (key) => Number(new RegExp(`${key}: (-?\\d+)`).exec(block)[1]);
    // Levhanın üstü: alanın alt kenarından (plateHeight + plateBottom) yukarıda.
    // Akışın altı:   alanın alt kenarından heroPadBottom yukarıda.
    return pick('heroPadBottom') - (pick('plateHeight') + pick('plateBottom'));
}
