import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CALENDAR_PROFILES, calendarProfileFor } from '../src/lib/calendarSectorProfiles.ts';

// Sektör yüz registry'sinin davranış testi + App.tsx'e sektör dallanmasının
// geri sızmasını engelleyen kilit.

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const FACE_KEYS = ['genel', 'salon'];
const PAGES = ['calendar', 'reservations', 'customers'];

test('kuaför salon yüzünü, diğer sektörler genel yüzü alır', () => {
    const kuafor = calendarProfileFor('kuafor');
    assert.equal(kuafor.calendar, 'salon');
    assert.equal(kuafor.reservations, 'salon');
    assert.equal(kuafor.customers, 'salon');

    for (const sector of ['genel', 'dis', 'avukat', 'restoran', 'gym']) {
        const profile = calendarProfileFor(sector);
        assert.equal(profile.calendar, 'genel', `${sector} genel takvimi almalı`);
    }
});

test('bilinmeyen ve boş sektör fallback profile düşer', () => {
    for (const input of [undefined, null, '', 'bilinmeyen-sektor']) {
        const profile = calendarProfileFor(input);
        assert.equal(profile.calendar, 'genel');
        assert.equal(profile.reservations, 'genel');
        assert.equal(profile.customers, 'genel');
        assert.equal(profile.mobileCalendar, 'genel');
        assert.equal(profile.visitRoute, undefined, 'ziyaret ekranı yalnız tanımlayan sektörde olmalı');
    }
});

test('ziyaret ekranı yolu profilden gelir, sayfa içi sektör if’inden değil', () => {
    // Diş randevusu bir muayene kaydına bağlanır; MobileCalendar bunu
    // `sector === 'dis'` ile yapıyordu.
    assert.equal(calendarProfileFor('dis').visitRoute?.('res-1'), '/dental-visit/res-1');
    assert.equal(calendarProfileFor('dis').visitRoute?.('a/b'), '/dental-visit/a%2Fb', 'id URL-encode edilmeli');
    assert.equal(calendarProfileFor('kuafor').visitRoute, undefined);

    const mobile = read('../src/mobile/pages/MobileCalendar.tsx');
    assert.doesNotMatch(mobile, /sector === 'dis'/, 'Mobil takvimde sektör karşılaştırması kalmamalı');
    assert.match(mobile, /visitRoute/);
});

test('registry yalnız tanımlı yüz anahtarlarını kullanır', () => {
    // Tabloya elle yazılan bir yazım hatası ("saloon") çalışma zamanında sessizce
    // fallback'e düşer; burada yakalanır.
    for (const [sector, profile] of Object.entries(CALENDAR_PROFILES)) {
        for (const page of PAGES) {
            assert.ok(FACE_KEYS.includes(profile[page]), `${sector}.${page} geçersiz yüz anahtarı: ${profile[page]}`);
        }
    }
});

test('App.tsx sektöre göre dallanmaz — yüz seçimi registry’de', () => {
    const app = read('../src/App.tsx');
    assert.doesNotMatch(app, /sector === /, 'App.tsx içinde sektör karşılaştırması kalmamalı');
    assert.doesNotMatch(app, /Kuafor\w+Page/, 'Kuaför sayfaları App.tsx’ten import edilmemeli');
    assert.match(app, /sectorFaces/, 'Yüzler sectorFaces üzerinden bağlanmalı');
});

test('sectorFaces yüz seçimini profilden okur, if zinciriyle değil', () => {
    const faces = read('../src/pages/sectorFaces.tsx');
    assert.doesNotMatch(faces, /sector === /, 'Yüz haritası sektör karşılaştırması içermemeli');
    assert.match(faces, /calendarProfileFor/);
});
