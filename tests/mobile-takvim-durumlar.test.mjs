import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { offlineBannerText } from '../mobile/src/lib/offline.ts';
import { offlineBar, skeleton } from '../mobile/src/theme/tokens.ts';

const calendar = readFileSync(
    new URL('../mobile/app/(staff)/calendar.tsx', import.meta.url),
    'utf8',
);
const parts = readFileSync(
    new URL('../mobile/src/components/CalendarParts.tsx', import.meta.url),
    'utf8',
);

// ── Çevrimdışı bandı ────────────────────────────────────────────────────────

test('bant yalnız söyleyecek bir şey varken görünür', () => {
    // Her şey yolundayken sarı bir bant, kalıcı bir arıza hissi yaratır.
    assert.equal(offlineBannerText(false, 0), null);
});

test('bant bağlantıyı ve kuyruğu birlikte söyler', () => {
    assert.equal(offlineBannerText(true, 3), 'Çevrimdışı · 3 işlem sırada');
    assert.equal(offlineBannerText(true, 0), 'Çevrimdışı');
});

test('bağlantı geri geldiğinde kuyruk boşalana kadar bant kalır', () => {
    // Bağlantı var ama iş hâlâ sırada: durum "çevrimdışı" DEĞİL, ve bunu
    // söylemek gerekiyor — yoksa personel gönderildi sanır.
    assert.equal(offlineBannerText(false, 2), 'Bağlantı geldi · 2 işlem sırada');
});

test('bant yükseklik değil dönüşümle iner', () => {
    assert.equal(offlineBar.height, 26);
    assert.match(parts, /translateY: reduceMotion\s*\n\s*\? 0/);
    assert.match(parts, /outputRange: \[-offlineBar\.height, 0\]/);
    // Yükseklik animasyonu sözleşmede yasak; bant hep monte.
    assert.doesNotMatch(parts, /height: progress\.interpolate/);
});

test('bandın iniş ve çıkış süreleri sözleşmedeki değerlerdir', () => {
    // 220 iniş (OUT) · 180 çıkış (IN) · hareket azaltılmışsa 140 solma.
    assert.match(parts, /reduceMotion \? 140 : shown \? 220 : 180/);
});

test('bant ile içerik aynı ilerlemeden sürülür', () => {
    // İki hareket ayrı zamanlanırsa bant ile içerik arasında boşluk açılır.
    assert.match(calendar, /progress=\{barProgress\}/);
    assert.match(calendar, /translateY: barProgress\.interpolate/);
});

// ── Yükleniyor iskeleti ─────────────────────────────────────────────────────

test('iskelette parlama yoktur', () => {
    // Takvim tasarımı bu ekran için açıkça "parlama/shimmer yok" diyor;
    // genel hareket sözleşmesindeki shimmer döngüsü burada uygulanmaz.
    const skel = parts.slice(parts.indexOf('function Skel('), parts.indexOf('export function TimelineSkeleton'));
    assert.doesNotMatch(skel, /Animated/);
    assert.doesNotMatch(skel, /loop/);
});

test('iskelet gerçek kartın geometrisini kullanır', () => {
    // Şart: iskelet son geometriyi 4 pt içinde tutmalı, yoksa geçiş solma
    // değil zıplama olur. Bu yüzden serbest sayı değil, kartın kendi ölçüleri.
    assert.match(parts, /const padding = small \? calendarMetrics\.cardPaddingSmall : calendarMetrics\.cardPadding;/);
    assert.match(parts, /styles\.card,\s*\n\s*\{ backgroundColor: c\.surf, borderColor: c\.bd, padding, gap: space\.xs \}/);
    assert.equal(skeleton.time.width, 38);
    assert.equal(skeleton.radius, 10);
});

// BORÇ — Personel Takvim'i sütunlu salon görünümüne geçti (işletme kararı:
// personel salonun tamamını görür). Sütunlu ızgara kendi dikey ve yatay
// kaydırıcılarını taşıyor; dıştaki kaydırıcıya bağlı olan bu davranışların
// karşılıkları o ızgarada HENÜZ ÇİZİLMEDİ. Bileşenler duruyor
// (`CalendarParts`), test siliNMEdi: hâller tasarlanınca geri açılacak.
test.skip('yüklenirken boş gün ekranı gösterilmez', () => {
    // "Randevunuz yok" henüz bilinmiyorken yanlış bilgidir.
    const branch = calendar.slice(calendar.indexOf('{loadingDay ? ('), calendar.indexOf('</Animated.ScrollView>'));
    assert.match(branch, /<TimelineSkeleton/);
    assert.ok(
        branch.indexOf('<TimelineSkeleton') < branch.indexOf('<EmptyDay'),
        'iskelet dalı boş gün dalından önce gelmeli',
    );
});

test('gömülü özet yüklenmemişken iskelet, boşken hiç çizilmez', () => {
    // undefined ile null farkı bilinçli: biri "gelmedi", diğeri "yok".
    assert.match(parts, /if \(info === undefined\) return <SummarySkeleton \/>;/);
    assert.match(parts, /if \(!info \|\| \(!info\.pkg && info\.visitNo == null\)\) return null;/);
});

// ── Aşağı çekip yenileme ────────────────────────────────────────────────────

test('yenileme sistemin RefreshControl\'ünü kullanır', () => {
    // Çekme hareketi bize ait değil: parmağı birebir takip eder, eğrisi yok.
    assert.match(calendar, /<RefreshControl/);
    assert.match(calendar, /refreshing=\{refreshing\}/);
    assert.match(calendar, /onRefresh=\{refresh\}/);
});

// BORÇ — Personel Takvim'i sütunlu salon görünümüne geçti (işletme kararı:
// personel salonun tamamını görür). Sütunlu ızgara kendi dikey ve yatay
// kaydırıcılarını taşıyor; dıştaki kaydırıcıya bağlı olan bu davranışların
// karşılıkları o ızgarada HENÜZ ÇİZİLMEDİ. Bileşenler duruyor
// (`CalendarParts`), test siliNMEdi: hâller tasarlanınca geri açılacak.
test.skip('yenilemeden sonra yalnız değişen satır belirir', () => {
    assert.match(calendar, /const changed = new Set<string>\(\)/);
    assert.match(calendar, /if \(previous\.get\(appointment\.id\) !== signature\) changed\.add/);
    assert.match(parts, /enteringIds\?\.has\(appointment\.id\) \?\? false/);
});

test('beliriş 140 ms ve LINEAR', () => {
    // Dilimin sonu 'Timeline({' ile aranır: yalnız 'Timeline' TimelineSkeleton'ı
    // yakalar ve dilim ters döner.
    const fade = parts.slice(parts.indexOf('function EnterFade('), parts.indexOf('export function Timeline({'));
    assert.match(fade, /duration: 140/);
    assert.match(fade, /easing: Easing\.linear/);
    assert.match(fade, /useNativeDriver: true/);
    // Hareket azaltılmışsa animasyon hiç başlamaz, satır doğrudan görünür.
    assert.match(fade, /if \(reduceMotion\) return;/);
});

// BORÇ — Personel Takvim'i sütunlu salon görünümüne geçti (işletme kararı:
// personel salonun tamamını görür). Sütunlu ızgara kendi dikey ve yatay
// kaydırıcılarını taşıyor; dıştaki kaydırıcıya bağlı olan bu davranışların
// karşılıkları o ızgarada HENÜZ ÇİZİLMEDİ. Bileşenler duruyor
// (`CalendarParts`), test siliNMEdi: hâller tasarlanınca geri açılacak.
test.skip('gün değiştirmek beliriş animasyonu tetiklemez', () => {
    // Yeni gün zaten baştan sona yeni; her satırı yakıp söndürmek gürültü olur.
    assert.match(calendar, /setEnteringIds\(new Set\(\)\);/);
});
