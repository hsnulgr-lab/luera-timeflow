import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    dayDistance,
    dayPedal,
    dayPosition,
    emptyDayCopy,
    hourRailRows,
    HOUR_RAIL,
    longDayLabel,
    plateDateLine,
    flowEndLabel,
    pedalIsFixed,
    pedalVisible,
    plateIsPermanent,
    scrollEnabledOnDay,
    shortDayLabel,
    staffStripVisible,
    swipeClaims,
    swipeGesture,
    swipeResult,
} from '../mobile/src/lib/emptyDay.ts';
import { emptyDayMetrics, emptyDayMotion } from '../mobile/src/theme/tokens.ts';

// Müdür 22 — Boş gün ve günler arası geçiş.
//
// Bu dosyanın koruduğu tek şey şu: boş ekran ASLA çıkışsız kalmasın. Eski
// hâlde cetvel yalnız toplanmış cam levhada duruyordu, levha da kaydırınca
// geliyordu; boş günde kaydıracak içerik olmadığı için levha hiç gelmiyor ve
// müdür o günde kilitleniyordu. Aşağıdaki kurallardan biri bozulursa o
// kilitlenme geri gelir.
//
// Kaynak: `docs/design-reference/Luera Mobil - Mudur 22 Bos Gun.html`.

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

const flow = read('app/mudur/index.tsx');
const flowCode = code('app/mudur/index.tsx');
const parts = code('src/components/EmptyDayParts.tsx');

const TODAY = '2026-08-14';

// ── Levhanın kuralı ─────────────────────────────────────────────────────────

test('levha kimliği BAŞKA GÜNDE taşır — dolu olsun ya da olmasın', () => {
    // Başka günde dev başlığın söyleyebileceği tek şey gün adı: randevu
    // sayısı ve "kaç işlem sürüyor" ŞU ANIN gerçeği.
    assert.equal(plateIsPermanent(true, false), true);
    assert.equal(plateIsPermanent(false, false), true);
    // Bugün istisna: başlık ve şerit doğruyu söylüyor, levha kaydırınca gelir.
    assert.equal(plateIsPermanent(true, true), false);
    assert.equal(plateIsPermanent(false, true), false);
    assert.match(flowCode, /\{platePermanent \? null : \(/);
});

test('pedal her yerde bulunur — bugünün dolu akışı dışında', () => {
    assert.equal(pedalVisible(true, false), true);   // boş başka gün
    assert.equal(pedalVisible(false, false), true);  // dolu başka gün
    assert.equal(pedalVisible(true, true), true);    // boş bugün
    assert.equal(pedalVisible(false, true), false);  // dolu bugün — zaten oradayız
    // Boş günde sabit, dolu günde listeyle birlikte kayar.
    assert.equal(pedalIsFixed(true), true);
    assert.equal(pedalIsFixed(false), false);
});

test('"Bugünlük bu kadar" YALNIZ bugün yazar', () => {
    assert.equal(flowEndLabel(true), 'Bugünlük bu kadar');
    assert.notEqual(flowEndLabel(false), 'Bugünlük bu kadar');
    assert.match(flowCode, /<FlowEnd label=\{flowEndLabel\(isToday\)\}/);
});

test('yalnız BOŞ başka gün kilitlenir — dolu gün kaydırılır', () => {
    assert.equal(scrollEnabledOnDay(true, false), false);
    assert.equal(scrollEnabledOnDay(false, false), true);
    assert.equal(scrollEnabledOnDay(true, true), true);
    assert.match(flowCode, /scrollEnabled=\{canScroll\}/);
});

test('personel şeridi YALNIZ bugün — başka günün altında yalan olur', () => {
    assert.equal(staffStripVisible(true), true);
    assert.equal(staffStripVisible(false), false);
});

// ── Üç boş gün, üç ayrı cümle ───────────────────────────────────────────────

test('gelecek günde "boş geçti" KULLANILMAZ — gün henüz yaşanmadı', () => {
    const future = emptyDayCopy('2026-08-19', TODAY);
    assert.doesNotMatch(future.title, /boş geçti/);
    assert.match(future.title, /kayıt yok$/);
    assert.equal(future.hint, 'O güne henüz randevu kurulmadı.');
    assert.match(future.label, /İLERİDEKİ GÜN · 5 GÜN SONRA/);
});

test('geçmiş günde eylem YOK — geçmişe randevu kurulmaz', () => {
    const past = emptyDayCopy('2026-08-08', TODAY);
    assert.equal(past.action, null);
    assert.match(past.title, /boş geçti$/);
    assert.match(past.label, /GEÇMİŞ GÜN · 6 GÜN ÖNCE/);
    assert.equal(past.hint, 'O gün randevu, işlem ve tahsilat kaydı yok.');
});

test('bugünde "henüz" günü açık bırakır ve nokta yalnız burada', () => {
    const today = emptyDayCopy(TODAY, TODAY);
    assert.match(today.title, /Bugün henüz bir şey olmadı/);
    assert.equal(today.dot, true);
    assert.equal(emptyDayCopy('2026-08-08', TODAY).dot, false);
    assert.equal(emptyDayCopy('2026-08-19', TODAY).dot, false);
});

test('cümle her zaman GÜNLE başlar — yasak sözler geçmez', () => {
    for (const iso of ['2026-08-08', TODAY, '2026-08-19']) {
        const copy = emptyDayCopy(iso, TODAY);
        // "Kayıt yok" tek başına, "Hiç" ve ünlem yasak: kayıt yokluğu bir
        // hata değil; özne gün, eksik olan liste değil.
        assert.doesNotMatch(copy.title, /^Kayıt yok$/);
        assert.doesNotMatch(`${copy.title} ${copy.hint}`, /!/);
        assert.doesNotMatch(copy.title, /\bHiç\b/);
    }
});

test('büyük harfe çevirme tr-TR — İLERİDEKİ noktalı İ ile', () => {
    assert.ok(emptyDayCopy('2026-08-19', TODAY).label.startsWith('İLERİDEKİ'));
    assert.equal(emptyDayCopy(TODAY, TODAY).label, 'BUGÜN');
});

// ── Tarih biçimi ────────────────────────────────────────────────────────────

test('levhanın tarih satırı sayı SAYMAZ, gün söyler', () => {
    assert.equal(plateDateLine('2026-08-14'), '14 Ağustos, Cuma');
    assert.equal(plateDateLine('2026-08-19'), '19 Ağustos, Çarşamba');
});

test('pedalın gün adı HER EKRANDA üç harf — kırpma oluşmaz', () => {
    assert.equal(shortDayLabel('2026-08-13'), 'Per 13');
    assert.equal(shortDayLabel('2026-08-15'), 'Cmt 15');
    for (const iso of ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-16']) {
        assert.equal(shortDayLabel(iso).split(' ')[0].length, 3);
    }
});

test('gün mesafesi yön taşımaz — işareti dayPosition söyler', () => {
    assert.equal(dayDistance('2026-08-19', TODAY), 5);
    assert.equal(dayDistance('2026-08-08', TODAY), 6);
    assert.equal(dayPosition('2026-08-19', TODAY), 'future');
    assert.equal(dayPosition('2026-08-08', TODAY), 'past');
    assert.equal(dayPosition(TODAY, TODAY), 'today');
});

// ── Gün pedalı ──────────────────────────────────────────────────────────────

test('pedal üç bölmeli kalır — bugünde orta bölme KAYBOLMAZ, kapanır', () => {
    const onToday = dayPedal(TODAY, TODAY);
    assert.equal(onToday.mid.label, 'Bugündesiniz');
    assert.equal(onToday.mid.disabled, true);
    assert.equal(onToday.mid.targetISO, null);
    // Yan bölmeler bugünde de çalışır.
    assert.equal(onToday.prev.disabled, false);
    assert.equal(onToday.next.disabled, false);
});

test('pedalın orta bölmesi bugüne döner ve mesafeyi söyler', () => {
    const ahead = dayPedal('2026-08-19', TODAY);
    assert.equal(ahead.mid.label, 'Bugüne dön');
    assert.equal(ahead.mid.targetISO, TODAY);
    assert.equal(ahead.mid.spoken, 'Bugüne dön, 5 gün ileri');
    const behind = dayPedal('2026-08-08', TODAY);
    assert.equal(behind.mid.spoken, 'Bugüne dön, 6 gün geri');
});

test('pedal komşu günleri gösterir', () => {
    const pedal = dayPedal('2026-08-14', TODAY);
    assert.equal(pedal.prev.label, shortDayLabel('2026-08-13'));
    assert.equal(pedal.next.label, shortDayLabel('2026-08-15'));
    assert.equal(pedal.prev.spoken, `Önceki gün, ${longDayLabel('2026-08-13')}`);
});

test('pedal bölmeleri 44 pt kuralını geçer', () => {
    assert.ok(emptyDayMetrics.pedalHeight >= 44);
    assert.ok(emptyDayMetrics.pedalSideSmall >= 44);
    assert.ok(emptyDayMetrics.pedalMidSmall >= 44);
});

test('basış ÖLÇÜ değiştirmez — pedal bir gezinme yüzeyi, karar düğmesi değil', () => {
    const bar = parts.slice(parts.indexOf('export function DayPedalBar'));
    const body = bar.slice(0, bar.indexOf('export function EmptyDayAction'));
    assert.match(body, /pedalPressFill/);
    // scale(.96) yalnız haplarda; pedalda ölçek yok.
    assert.doesNotMatch(body, /scale:/);
});

// ── Saat rayı ───────────────────────────────────────────────────────────────

test('saat rayı beş basamak — gün 21’e kadar var', () => {
    assert.deepEqual([...HOUR_RAIL], ['09', '12', '15', '18', '21']);
    assert.equal(hourRailRows(false, 0).length, 5);
});

test('başka günde hiçbir basamak vurgulanmaz — sönük varyant YAPILMADI', () => {
    const rows = hourRailRows(false, 14 * 60);
    assert.ok(rows.every((r) => !r.now && !r.past));
});

test('bugünde "şu an" basamağı turuncu, geçmiş çizgiler soluk', () => {
    const rows = hourRailRows(true, 13 * 60);
    assert.deepEqual(rows.map((r) => r.now), [false, true, false, false, false]);
    assert.deepEqual(rows.map((r) => r.past), [true, false, false, false, false]);
});

// ── Yatay kaydırma ──────────────────────────────────────────────────────────

test('jest eşiği YÜKSEK — tek çıkış olamayacak kadar yanılabilir', () => {
    assert.equal(swipeGesture.commitDx, 48);
    assert.equal(swipeGesture.axisRatio, 2);
    // Düşey ağırlıklı hareket yakalanmaz.
    assert.equal(swipeClaims(20, 30), false);
    assert.equal(swipeClaims(60, 10), true);
    // Küçük hareket günü değiştirmez.
    assert.equal(swipeResult(30, 0.1), 0);
});

test('sola çekmek İLERİ gider', () => {
    assert.equal(swipeResult(-60, 0), 1);
    assert.equal(swipeResult(60, 0), -1);
    // Hız tek başına da yeter.
    assert.equal(swipeResult(-20, -0.5), 1);
});

test('jest gesture-handler KULLANMAZ — PanResponder ile kurulur', () => {
    assert.match(flowCode, /PanResponder\.create/);
    // Yorumda adı geçebilir; import edilmemesi önemli.
    assert.doesNotMatch(flowCode, /gesture-handler|reanimated/);
});

test('jest yalnız boş ekranda — dolu günde düşey kaydırmayla çakışır', () => {
    assert.match(flowCode, /isEmptyDay \? swipe\.panHandlers : null/);
    assert.match(flowCode, /isEmptyDay \? <SwipeHints \/> : null/);
});

test('jest okları dokunulamaz — jest çalışmasa da pedal duruyor', () => {
    const hints = parts.slice(parts.indexOf('export function SwipeHints'));
    assert.match(hints, /pointerEvents="none"/);
    assert.equal(emptyDayMetrics.arrowOpacity, 0.36);
});

// ── Başparmak bölgesi ───────────────────────────────────────────────────────

test('birincil eylem pedalın ÜSTÜNDE — karar veren eylem daha yukarı', () => {
    // Sabit başparmak bölgesi — kayan pedalla karışmasın diye kabından bul.
    const foot = flowCode.slice(flowCode.indexOf('pointerEvents="box-none"'));
    const action = foot.indexOf('<EmptyDayAction');
    const bar = foot.indexOf('<DayPedalBar');
    assert.ok(action > 0 && bar > action, 'pedal birincil eylemin üstünde kalmış');
});

test('geçmiş günde eylem satırı HİÇ render edilmez', () => {
    assert.match(flowCode, /\{blank\.action \? \(/);
});

test('pedal alttan hizalı — eylemi olan ve olmayan gün arasında kıpırdamaz', () => {
    assert.match(flowCode, /position: 'absolute',[\s\S]{0,200}bottom: calendarMetrics\.bottomInset/);
});

test('boş hâl bloğu ekranın alt üçte birine girmez', () => {
    // 852’de alt üçte bir 568’de başlar; blok levhadan 46 pt aşağıda ve
    // en uzun hâli 254 pt. 145 + 46 + 254 = 445 < 568.
    const plate = 145;
    const tallest = 254;
    assert.ok(plate + emptyDayMetrics.topFromPlate + tallest < 568);
});

// ── Hareket ─────────────────────────────────────────────────────────────────

test('yalnız opacity ve transform — yükseklik, renk, yarıçap animasyonu yok', () => {
    assert.doesNotMatch(parts, /useNativeDriver: false/);
    assert.doesNotMatch(parts, /LayoutAnimation|interpolateColor/);
    // Animasyonlanan tek özellikler.
    assert.doesNotMatch(parts, /Animated[\s\S]{0,80}(height|borderRadius|backgroundColor):/);
});

test('cümle çapraz SOLDURULMAZ, yatay takas edilir', () => {
    const hook = parts.slice(parts.indexOf('export function useVoidSwap'));
    const body = hook.slice(0, hook.indexOf('export function VoidBlock'));
    assert.match(body, /translateX/);
    assert.equal(emptyDayMotion.slide.shift, 12);
    assert.equal(emptyDayMotion.slide.out, 160);
    assert.equal(emptyDayMotion.slide.in, 220);
});

test('hareketi azalt: süre sıfırlanır, bilgi durmaz', () => {
    assert.match(parts, /if \(reduceMotion\) \{ shift\.setValue\(0\); return; \}/);
    // Levha ve pedal reduceMotion'da da yerinde: hareket durur, bilgi durmaz.
    assert.doesNotMatch(flowCode, /reduceMotion[\s\S]{0,60}DayPedalBar/);
});

test('satır sıralamasının gecikme tavanı var', () => {
    assert.equal(emptyDayMotion.rows.step, 40);
    assert.equal(emptyDayMotion.rows.cap, 120);
});

// ── Ölçüler ─────────────────────────────────────────────────────────────────

test('ölçü jetonları tasarımın CSS’iyle birebir', () => {
    assert.equal(emptyDayMetrics.pedalHeight, 44);
    assert.equal(emptyDayMetrics.pedalSide, 123);
    assert.equal(emptyDayMetrics.pedalMid, 141);
    assert.equal(emptyDayMetrics.actionHeight, 40);
    assert.equal(emptyDayMetrics.title, 22);
    assert.equal(emptyDayMetrics.hint, 14.5);
    assert.equal(emptyDayMetrics.hintWidth, 290);
    assert.equal(emptyDayMetrics.dot, 7);
    assert.equal(emptyDayMetrics.railWidth, 257);
    assert.equal(emptyDayMetrics.glowHeight, 340);
});

test('375 pt’de bölmeler daralır ama 44’ün altına inmez', () => {
    assert.equal(emptyDayMetrics.pedalSideSmall, 117);
    assert.equal(emptyDayMetrics.pedalMidSmall, 133);
    assert.equal(emptyDayMetrics.railWidthSmall, 239);
    assert.equal(emptyDayMetrics.railRowSmall, 28);
});

// ── Erişilebilirlik ─────────────────────────────────────────────────────────

test('renk ve nokta tek başına anlam taşımaz — kelimeler yazılı', () => {
    assert.match(emptyDayCopy(TODAY, TODAY).label, /BUGÜN/);
    assert.match(emptyDayCopy('2026-08-19', TODAY).label, /İLERİDEKİ GÜN/);
    assert.match(emptyDayCopy('2026-08-08', TODAY).label, /GEÇMİŞ GÜN/);
});

test('boş hâl tek cümlede okunur ve yalnız gün değişiminde konuşur', () => {
    const future = emptyDayCopy('2026-08-19', TODAY);
    assert.match(future.spoken, /ileride, kayıt yok/);
    assert.match(future.spoken, /Randevu kurmak için düğme/);
    assert.match(parts, /accessibilityLiveRegion="polite"/);
});

test('geçmiş günün sesli cümlesi düğmeden söz ETMEZ', () => {
    assert.doesNotMatch(emptyDayCopy('2026-08-08', TODAY).spoken, /düğme/);
});

// ── Saf kütüphane ───────────────────────────────────────────────────────────

test('karar katmanı saf — React, react-native, Expo yok', () => {
    const lib = code('src/lib/emptyDay.ts');
    assert.doesNotMatch(lib, /from 'react|from "react|from 'expo|react-native/);
});

// ── Başka günün randevuları ─────────────────────────────────────────────────

test('akış SEÇİLİ günü okur — başka güne kurulan randevu akışta da görünür', () => {
    // Eskiden liste `isToday ? events : []` idi: randevu takvimde görünüyor,
    // akışta hiç görünmüyordu. Kaynak zaten güne göre sorgulanabiliyordu.
    assert.doesNotMatch(flowCode, /const dayEvents = isToday \? events : \[\]/);
    assert.match(flowCode, /source\.day\(selectedISO\)/);
    assert.match(flowCode, /\.map\(\(appointment\) => bookedEvent\(/);
});

test('başka günün listesi geri dönünce tazelenir', () => {
    assert.match(flowCode, /useFocusEffect\(loadOtherDay\)/);
});

test('iptal edilen randevu başka günün akışında görünmez', () => {
    assert.match(flowCode, /appointment\.status !== 'cancelled'/);
});

test('kalıcı levha içeriği ÖRTMEZ — ilk satırın saati görünür kalır', () => {
    // Kaydırmaya bağlı levhada içerik altından geçer (geçici örtü); kalıcı
    // levhada geçseydi ilk satırın saati ve etiketi sürekli gizli kalırdı.
    assert.match(flowCode, /paddingTop: platePermanent \? panelInset \+ insets\.top : 0/);
});

// ── Yükleniyor ≠ boş ────────────────────────────────────────────────────────

test('gün okunmadan boş hâlin cümlesi YAZILMAZ', () => {
    // Yanlış cümle saniyeler sonra kendini yalanlıyor; kullanıcı bunu
    // "sayfa iki kez yüklendi" diye görüyor.
    const staffDay = code('src/components/StaffDay.tsx');
    assert.match(staffDay, /if \(loading\) \{[\s\S]{0,160}<DaySkeleton \/>/);
    const route = code('app/(manager-flow)/personel/[id].tsx');
    assert.match(route, /loading=\{loading\}/);
    assert.match(route, /setLoading\(false\)/);
});

test('iskelet hiçbir şey iddia etmez — cümle taşımaz', () => {
    const skeleton = parts.slice(parts.indexOf('export function DaySkeleton'));
    assert.doesNotMatch(skeleton, /<Text/);
    assert.match(skeleton, /accessibilityElementsHidden/);
});
