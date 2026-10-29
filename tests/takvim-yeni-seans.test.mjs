// Takvim · Yeni seans — 2026-10-29.
// Kullanıcı eski 9 bölümlük pencereyi "çok eski kaldı, basit hızlı randevu
// alma olsun" dedi; taslaklardan B'yi seçti: boş saate tıklayınca pencere o
// hücrenin yanında açılır. "Personel ve saat/işlem biraz daha detaylı olsun":
// işlem süre+fiyatla, saat ‹ › ve yakın boş saatlerle, personel o saatteki
// durumuyla. "Ayrıntılar" ve araç çubuğu aynı taslağı tam pencerede açar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const page = read('../src/pages/CalendarPage.tsx');
const css = read('../src/pages/calendarNewBooking.css');
const agenda = read('../src/components/reservations/DayAgendaGrid.tsx');
const lane = read('../src/components/reservations/ResourceLaneGrid.tsx');

test('eski pencere kalktı: daktilo yazı, eski saat kutusu, büyük başarı ekranı yok', () => {
    assert.doesNotMatch(page, /JetBrains Mono|TIME_BLOCK_CSS|function MLabel|function MHelp|successData/);
    assert.doesNotMatch(css, /monospace/);
});

test('hücreye tıklayınca mini pencere o hücrenin yanında açılır', () => {
    assert.match(page, /setQuickAnchor\(anchor && window\.innerWidth >= 760 \? anchor : null\);/);
    assert.match(agenda, /onClick=\{\(e\) => onAddAt\(h, col\.id, groupBy, e\.currentTarget\.getBoundingClientRect\(\)\)\}/);
    assert.match(lane, /onAddAt\(hour, c\.id, e\.currentTarget\.getBoundingClientRect\(\)\)/);
    // hafta ve liste görünümleri de hücrenin yerini verir
    assert.equal((page.match(/openNewAt\([^\n]*e\.currentTarget\.getBoundingClientRect\(\)\)/g) || []).length, 2);
    // Ayrıntılar aynı taslakla tam pencereye geçer
    assert.match(page, /className="nb-link" onClick=\{\(\) => setQuickAnchor\(null\)\}>Ayrıntılar/);
});

test('personel durumu kural katmanından: boş · dolu · çalışmıyor', () => {
    assert.match(page, /resolveStaff\(\{ date: selectedDate, startTime: newRes\.startTime, endTime: newRes\.endTime, staffId: member\.id, cart: resLines \}\)/);
    assert.match(page, /`Dolu · \$\{r\.conflict!\.startTime\}–\$\{r\.conflict!\.endTime\}`/);
    assert.match(page, /'Bu saatte çalışmıyor'/);
});

test('saat: ‹ › kaydırma ve gerçek boş saatler (findSlots)', () => {
    assert.match(page, /const shiftStart = \(delta: number\) => setStart\(hhmmOf\(clockMin\(newRes\.startTime\) \+ delta\)\);/);
    assert.match(page, /return findSlots\(\{\s*date: selectedDate, durationMin: draftDur, staffId: newRes\.staffId \|\| undefined,/);
    assert.match(page, /\{draftConflict\.sug\.start\} boş · al/);
});

test('işlem süre ve fiyatla gösterilir', () => {
    assert.match(page, /<small>\{sv\.duration\} dk\{sv\.price \? ` · ₺\$\{sv\.price\.toLocaleString\('tr-TR'\)\}` : ''\}<\/small>/);
});

test('kaydedince pencere kapanır, bildirimde WhatsApp düğmesi', () => {
    assert.match(page, /action: \{ label: "WhatsApp'tan bildir"/);
    assert.match(page, /toast\.success\(`\$\{t\('reservation'\)\} eklendi · \$\{newRes\.customerName\}`/);
    assert.match(page, /\}\);\s*closeDialog\(\);/);
});

test('Esc kapatır; dolu formda dışarı tıklamak kapatmaz, pencere kıpırdar', () => {
    assert.match(page, /if \(e\.key === 'Escape'\) closeDialog\(\);/);
    assert.match(page, /const tryClose = \(\) => \{\s*if \(!isDirty\) \{ closeDialog\(\); return; \}/);
});
