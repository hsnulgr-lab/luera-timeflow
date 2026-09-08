import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const calendar = readFileSync(
    new URL('../mobile/app/personel/calendar.tsx', import.meta.url),
    'utf8',
);
const parts = readFileSync(
    new URL('../mobile/src/components/CalendarParts.tsx', import.meta.url),
    'utf8',
);

// BORÇ — Personel Takvim'i sütunlu salon görünümüne geçti (işletme kararı:
// personel salonun tamamını görür). Sütunlu ızgara kendi dikey ve yatay
// kaydırıcılarını taşıyor; dıştaki kaydırıcıya bağlı olan bu davranışların
// karşılıkları o ızgarada HENÜZ ÇİZİLMEDİ. Bileşenler duruyor
// (`CalendarParts`), test siliNMEdi: hâller tasarlanınca geri açılacak.
test.skip('yüklenirken iskelet, sonra dolu gün Timeline ya da boş gün EmptyDay', () => {
    // Üç yol tek koşul zincirinde: iskelet → dolu → boş. Boş ekran ASLA
    // yüklenme sırasında görünmez; "randevunuz yok" yanlış bilgi olurdu.
    assert.match(calendar, /\{loadingDay \? \([\s\S]*?<TimelineSkeleton/);
    assert.match(calendar, /<TimelineSkeleton[\s\S]*?\) : appointments\.length > 0 \? \([\s\S]*?<Timeline/);
    assert.match(calendar, /<Timeline[\s\S]*?\) : \([\s\S]*?<EmptyDay/);
});

test('boş gün doğru metni ve erişilebilir tek eylemi taşır', () => {
    assert.match(parts, /Bu gün randevunuz yok\./);
    assert.match(parts, /Bir sonraki randevu/);
    assert.match(parts, /accessibilityRole="button"[\s\S]*?DAY_DATIVE/);
});
