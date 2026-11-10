// Müşteri sayfaları rötuşu — 2026-10-30.
// Kullanıcı Randevu Yönetimi sayfasını "çok vasat" buldu; online randevu
// sayfasının görünüşünü beğeniyor, "sadece rötuş" istedi. Yönetim sayfası
// online randevunun koyu ailesine geçti (ortak stil), hatalar sayfa içinde,
// "Onay bekliyor" yeşil değil, salona ulaşma ve takvime ekle var.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { icsUtc, icsText } from '../src/lib/icsFile.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const booking = read('../src/pages/public/BookingPage.tsx');
const manage = read('../src/pages/public/BookingManagePage.tsx');
const styles = read('../src/pages/public/bookingStyles.tsx');
const fn = read('../supabase/functions/booking-manage/index.ts');

test('takvime ekle: Türkiye saati UTC+3 olarak yazılır', () => {
    assert.equal(icsUtc('2026-10-31', '12:00'), '20261031T090000Z');
    assert.equal(icsUtc('2026-11-01', '01:30'), '20261031T223000Z'); // gün geri döner
    const ics = icsText([{ title: 'Cilt bakımı · Test Salon, Kadıköy', date: '2026-10-31', start: '12:00', end: '12:45', location: 'Bağdat Cd; No:2' }], new Date('2026-10-30T10:00:00Z'));
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /DTSTART:20261031T090000Z\r\nDTEND:20261031T094500Z/);
    assert.match(ics, /SUMMARY:Cilt bakımı · Test Salon\\, Kadıköy/);
    assert.match(ics, /LOCATION:Bağdat Cd\\; No:2/);
    assert.match(ics, /TRIGGER:-PT1H/);
    assert.match(ics, /END:VCALENDAR$/);
});

test('iki sayfa aynı koyu aileden: ortak stil, daktilo yazı yok', () => {
    assert.match(booking, /import \{ BookingCSS \} from '\.\/bookingStyles';/);
    assert.match(manage, /import \{ BookingCSS \} from '\.\/bookingStyles';/);
    assert.doesNotMatch(styles, /JetBrains|monospace/);
    // eski açık renkli tema ve tarayıcı kutuları kalktı
    assert.doesNotMatch(manage, /page: '#F3ECE0'|confirmDialog|alert\(/);
    assert.doesNotMatch(booking, /\balert\(/);
});

test('yönetim: "Onay bekliyor" kendi renginde, iptal sayfanın içinde onaylanır', () => {
    assert.match(manage, /pending: \{ label: 'Onay bekliyor', cls: 'pending' \}/);
    assert.match(styles, /\.tf-chip\.pending\{/);
    assert.match(manage, /setMode\('cancel'\)/);
    assert.match(manage, /Evet, iptal et/);
    // salon çevrim içi değişiklik almıyorsa (403) aramaya yönlendirir
    assert.match(manage, /call: status === 403/);
});

test('yönetim sunucusu salonu tanıtır: adres, telefon, harita, logo, randevu adresi', () => {
    // owner_id: ayar sahibin satırından okunur (göç 140 · ownerSettings) — korunur.
    assert.match(fn, /select\('name, owner_id, slug, logo_url, public_phone, address, maps_url'\)/);
    assert.match(fn, /ownerSettings\(supabase, orgId, 'business_name, working_hours, slot_duration, comms', org\?\.owner_id \?\? null\)/);
    assert.match(fn, /slug: org\?\.slug \?\? null,/);
    assert.match(fn, /phone: org\?\.public_phone \?\? null,/);
    // sayfa eski sunucuda bu alanlar yokken de çalışır (düğmeler yalnız varsa)
    assert.match(manage, /const callHref = biz\.phone \?/);
});

test('online randevu rötuşu: ilk açık gün hazır, "siz" hitabı, KVKK her randevuda yeniden', () => {
    assert.match(booking, /onClick=\{toDateStep\}/);
    assert.doesNotMatch(booking, /katılabilirsin\b|eklendin!|placeholder="Adın"/);
    assert.match(booking, /setKvkkOk\(false\); setNotice\(null\);/);
    assert.match(booking, /download="randevu\.ics"/);
});
