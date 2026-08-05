import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const booking = read('../src/pages/public/BookingPage.tsx');
const fn = read('../supabase/functions/public-booking/index.ts');
const orgProfile = read('../src/hooks/useOrgProfile.ts');
const settings = read('../src/pages/SettingsPage.tsx');
const migration = read('../supabase/081_kvkk_url.sql');

// KVKK zinciri. Rıza kutusu ürünün İÇİNDE, aydınlatma metni ise DIŞINDA olmak
// zorunda: veri sorumlusu her salonun kendisi, Luera yalnız veri işleyen. Metin
// salonun beyanı olduğu için ürün yazamaz, yalnız yayınlanmış metne bağlanır.

test('rıza olmadan randevu gönderilemez — arayüzde', () => {
    assert.match(booking, /disabled=\{submitting \|\| !kvkkOk/);
});

test('rıza sunucuda da zorunlu ve zaman damgasıyla saklanır', () => {
    // Yalnız arayüzde zorunlu olsaydı doğrudan istek atarak atlanabilirdi.
    assert.match(fn, /if \(!kvkkConsentAt\) return json\(\{ error: 'KVKK aydınlatma onayı gerekli' \}, 400\)/);
    assert.match(fn, /custom_fields: \{ kvkk_onay: kvkkConsentAt \}/);
});

test('aydınlatma metni bağlantısı org bazlı ve uçtan uca bağlı', () => {
    assert.match(migration, /add column if not exists kvkk_url text/);
    // organizations'ta olmalı: settings kullanıcı başına tek satır, metin org başına tek
    assert.match(migration, /alter table public\.organizations/);
    assert.match(orgProfile, /kvkkUrl: row\.kvkk_url \|\| ''/);
    assert.match(orgProfile, /kvkk_url: p\.kvkkUrl \|\| null/);
    assert.match(orgProfile, /kvkkUrl: 'kvkk_url'/);
    assert.match(settings, /profile\.kvkkUrl/);
    assert.match(fn, /kvkkUrl: org\.kvkk_url/);
    assert.match(booking, /biz\?\.kvkkUrl &&/);
});

test('bağlantı boşken rıza yine zorunlu kalır', () => {
    // Bağlantı koşullu render içinde; kutunun kendisi koşulsuz.
    const start = booking.indexOf('tf-kvkk');
    const consentBlock = booking.slice(start, booking.indexOf('tf-cta', start));
    assert.match(consentBlock, /type="checkbox"[\s\S]{0,40}checked=\{kvkkOk\}/);
    // Kutu, bağlantının varlığına bağlı bir koşulun içine alınmamış olmalı
    assert.doesNotMatch(consentBlock, /kvkkUrl && \([\s\S]{0,200}type="checkbox"/);
});
