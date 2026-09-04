import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const calendar = readFileSync(
    new URL('../mobile/app/(staff)/calendar.tsx', import.meta.url),
    'utf8',
);
const tabs = readFileSync(
    new URL('../mobile/app/(staff)/_layout.tsx', import.meta.url),
    'utf8',
);

// BORÇ — Personel Takvim'i sütunlu salon görünümüne geçti (işletme kararı:
// personel salonun tamamını görür). Sütunlu ızgara kendi dikey ve yatay
// kaydırıcılarını taşıyor; dıştaki kaydırıcıya bağlı olan bu davranışların
// karşılıkları o ızgarada HENÜZ ÇİZİLMEDİ. Bileşenler duruyor
// (`CalendarParts`), test siliNMEdi: hâller tasarlanınca geri açılacak.
test.skip('hareket 02 başlık eşikleri sözleşmedeki scroll aralıklarını kullanır', () => {
    assert.match(calendar, /inputRange: \[0, 48\],[\s\S]*?outputRange: \[1, 0\]/);
    assert.match(calendar, /inputRange: \[32, 64\],[\s\S]*?outputRange: \[0, 1\]/);
    assert.match(calendar, /inputRange: \[32, 64\],[\s\S]*?outputRange: \[6, 0\]/);
    assert.match(calendar, /inputRange: \[0, 24\],[\s\S]*?outputRange: \[0, 1\]/);
    assert.match(calendar, /inputRange: \[0, 64\],[\s\S]*?outputRange: \[1, 0\]/);
    assert.doesNotMatch(calendar, /63\.99/);
});

test('native tab bar sabit kalır ve güvenli alan yalnız bir kez uygulanır', () => {
    assert.match(calendar, /collapsable=\{false\}/);
    assert.match(calendar, /paddingTop: insets\.top/);
    assert.doesNotMatch(calendar, /contentInsetAdjustmentBehavior="automatic"/);
    // Kaydırma alanı tek katman: flex + zIndex. Çevrimdışı bandı indiğinde
    // buraya YALNIZ translateY eklenir; yükseklik ya da dolgu animasyonu yok.
    assert.match(calendar, /flex: 1,\s*\n\s*zIndex: 1,/);
    assert.match(calendar, /transform: \[\{\s*\n\s*translateY: barProgress\.interpolate\(/);
    assert.match(calendar, /outputRange: \[0, offlineBar\.height\]/);
    assert.doesNotMatch(calendar, /stickyHeaderIndices/);
    assert.match(tabs, /minimizeBehavior="never"/);
});
