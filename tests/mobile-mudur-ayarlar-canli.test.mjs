import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    DB_DAY_NAMES, dbDayOf, isNewService, salonServicesOf, schedulesOf, screenDayOf,
    servicePatchOf, settingsRefusal, workingHoursOf,
} from '../mobile/src/lib/settingsMap.ts';
import { dayName, hoursSummary, MANAGER_NOTIFICATIONS_READY, WEEKDAYS } from '../mobile/src/lib/managerProfile.ts';
import { openWindowOf } from '../mobile/src/lib/createLive.ts';

/**
 * MÜDÜR · AYARLAR CANLIYA BAĞLANDI (plan 8. adım) — planın en tehlikeli adımı.
 *
 * Buradaki bir hata tek ekranı değil salonun NE ZAMAN açık olduğunu bozar:
 * masaüstü, çevrim içi randevu, WhatsApp botu ve personelin telefonu aynı
 * `working_hours`u okuyor. En ağır kural gün numarası: veritabanı 0 = Pazar,
 * ekran 0 = Pazartesi. Bir birim kayma hata vermez, yalnız yanlış günü kapatır.
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const hoursScreen = strip(read('mobile/app/(manager-flow)/profil/saatler.tsx'));
const servicesScreen = strip(read('mobile/app/(manager-flow)/profil/hizmetler.tsx'));
const notifyScreen = strip(read('mobile/app/(manager-flow)/profil/bildirimler.tsx'));
const profile = strip(read('mobile/app/mudur/profile.tsx'));
const write = strip(read('mobile/src/lib/managerWrite.ts'));
const source = strip(read('mobile/src/lib/managerSource.ts'));
const pure = read('mobile/src/lib/settingsMap.ts');
const desktopRes = read('src/hooks/useReservations.ts');

/** Masaüstünün yeni salon varsayılanı — kaynağından okunuyor, elle kopyalanmıyor. */
function desktopDefaultHours() {
    const block = desktopRes.slice(desktopRes.indexOf('workingHours: ['), desktopRes.indexOf('],', desktopRes.indexOf('workingHours: [')) + 1);
    return [...block.matchAll(/\{ day: (\d), dayName: '([^']+)', start: '([^']+)', end: '([^']+)', isOff: (true|false) \}/g)]
        .map((m) => ({ day: Number(m[1]), dayName: m[2], start: m[3], end: m[4], isOff: m[5] === 'true' }));
}

// ── Gün numarası ────────────────────────────────────────────────────────────

test('gün çevirisi: veritabanı 0 = Pazar, ekran 0 = Pazartesi — iki yönde birebir', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(screenDayOf), [6, 0, 1, 2, 3, 4, 5]);
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(dbDayOf), [1, 2, 3, 4, 5, 6, 0]);
    for (let d = 0; d < 7; d += 1) {
        assert.equal(dbDayOf(screenDayOf(d)), d);
        // Adlar da aynı günü söylüyor.
        assert.equal(WEEKDAYS[screenDayOf(d)], DB_DAY_NAMES[d]);
    }
});

test('masaüstünün varsayılanı: PAZAR kapalı, CUMARTESİ 10–15 — ekranda da öyle', () => {
    const defaults = desktopDefaultHours();
    assert.equal(defaults.length, 7, 'masaüstü varsayılanı okunamadı');
    const screen = schedulesOf(defaults);
    const sunday = screen.find((d) => dayName(d.day) === 'Pazar');
    const saturday = screen.find((d) => dayName(d.day) === 'Cumartesi');
    assert.equal(sunday.closed, true);
    assert.deepEqual([saturday.closed, saturday.open, saturday.close], [false, 600, 900]);
    assert.equal(screen.filter((d) => d.closed).length, 1);
    assert.equal(hoursSummary(screen), '7 gün · Pazar kapalı');
});

test('UÇTAN UCA: telefonda Cumartesi kapatılır → cumartesi kapanır, pazar değil', () => {
    const defaults = desktopDefaultHours();
    const screen = schedulesOf(defaults).map((d) => (dayName(d.day) === 'Cumartesi' ? { ...d, closed: true } : d));
    const written = workingHoursOf(screen, defaults);
    // 2026-09-19 CUMARTESİ, 2026-09-20 PAZAR, 2026-09-18 CUMA.
    assert.equal(new Date('2026-09-19T12:00:00').getDay(), 6);
    assert.equal(openWindowOf(written, '2026-09-19'), null, 'cumartesi kapanmadı');
    assert.equal(openWindowOf(written, '2026-09-20'), null, 'pazar zaten kapalıydı');
    assert.deepEqual(openWindowOf(written, '2026-09-18'), { from: 540, to: 1080 }, 'cuma bozuldu');
    // Masaüstünün uygunluk kuralı aynı diziyi `getDay()` ile okuyor.
    const saturday = written.find((entry) => entry.day === new Date('2026-09-19T12:00:00').getDay());
    assert.equal(saturday.isOff, true);
    assert.equal(saturday.dayName, 'Cumartesi');
});

test('yazılan dizi masaüstünün biçiminde: 0..6 sıralı, dayName, "HH:MM", isOff', () => {
    const defaults = desktopDefaultHours();
    const written = workingHoursOf(schedulesOf(defaults), defaults);
    assert.deepEqual(written, defaults, 'dokunulmamış saatler aynen geri yazılmalı');
    const edited = schedulesOf(defaults).map((d) => (d.day === 0 ? { ...d, open: 8 * 60 + 15, close: 20 * 60 + 45 } : d));
    const monday = workingHoursOf(edited, defaults).find((e) => e.day === 1);
    assert.deepEqual(monday, { day: 1, dayName: 'Pazartesi', start: '08:15', end: '20:45', isOff: false });
});

test('bilinmeyen alanlar ve adlar KORUNUYOR; eksik ad masaüstünün adıyla doluyor', () => {
    const raw = [
        { day: 1, dayName: 'Pzt (özel)', start: '09:00', end: '18:00', isOff: false, breakStart: '13:00' },
    ];
    const written = workingHoursOf(schedulesOf(raw), raw);
    assert.equal(written.length, 7);
    assert.equal(written[1].breakStart, '13:00');
    assert.equal(written[1].dayName, 'Pzt (özel)');
    assert.equal(written[3].dayName, 'Çarşamba');
});

test('tanımsız ya da bozuk gün KAPALI; okunamayan dizi saat UYDURMUYOR', () => {
    const screen = schedulesOf([
        { day: 1, start: '09:00', end: '18:00', isOff: false },
        { day: 2, start: 'bozuk', end: '18:00', isOff: false },
        { day: 3, start: '18:00', end: '09:00', isOff: false },
    ]);
    assert.equal(screen.find((d) => d.day === 0).closed, false);
    assert.equal(screen.find((d) => d.day === 1).closed, true);
    assert.equal(screen.find((d) => d.day === 2).closed, true);
    assert.equal(screen.find((d) => d.day === 6).closed, true);
    assert.equal(schedulesOf(null), null);
    assert.equal(schedulesOf('[]'), null);
});

// ── Hangi satır, nasıl yazılıyor ────────────────────────────────────────────

test('saatler okunan satıra yazılıyor — org sahibinin satırı, kilitli, yalnız working_hours', () => {
    const fn = write.slice(write.indexOf('export async function saveWorkingHours'), write.indexOf('export async function saveSalonService'));
    assert.match(fn, /if \(await writesPaused\(\)\) return \{ ok: false, kind: 'paused' \}/);
    assert.match(fn, /\.update\(\{ working_hours: next, updated_at: stampedAt \}\)/);
    assert.match(fn, /\.eq\('organization_id', organizationId\)\s*\.eq\('user_id', row\.userId\)/);
    assert.match(fn, /row\.stamp === null \? query\.is\('updated_at', null\) : query\.eq\('updated_at', row\.stamp\)/);
    assert.match(fn, /if \(!saved\) return \{ ok: false, kind: 'stale' \};/);
    assert.doesNotMatch(fn, /upsert/);
    const row = source.slice(source.indexOf('export async function fetchHoursRow'));
    assert.match(row.slice(0, 400), /fetchOrgSettings\('user_id, working_hours, updated_at'\)/);
    // Okuma org SAHİBİNİN satırına bakıyor (staff-api ile aynı).
    assert.match(source, /\.eq\('user_id', ownerId\)/);
});

test('hizmet: yalnız dört alan — masaüstünün etiketleri ve dönüş periyodu ezilmiyor', () => {
    const patch = servicePatchOf({ id: 'x', name: '  Fön ', minutes: 30.4, price: null, color: '' });
    assert.deepEqual(patch, { name: 'Fön', duration: 30, price: null, color: '#CCFF00' });
    assert.ok(!('tags' in patch) && !('recall_days' in patch));
    assert.equal(servicePatchOf({ id: 'x', name: 'Ücretsiz', minutes: 15, price: 0, color: '#abc' }).price, 0);
    const fn = write.slice(write.indexOf('export async function saveSalonService'), write.indexOf('export async function deleteSalonService'));
    assert.match(fn, /\.insert\(\{ \.\.\.patch, user_id: userId, organization_id: organizationId \}\)/);
    assert.match(fn, /\.update\(patch\)\s*\.eq\('id', service\.id\)\s*\.eq\('organization_id', organizationId\)/);
    assert.match(fn, /if \(!data \|\| data\.length === 0\) return \{ ok: false, kind: 'stale' \};/);
    assert.match(fn, /return \{ ok: true, value: await fetchServices\(\) \};/);
    const del = write.slice(write.indexOf('export async function deleteSalonService'));
    assert.match(del, /\.delete\(\)\s*\.eq\('id', id\)\s*\.eq\('organization_id', organizationId\)/);
});

test('yeni hizmet ekranın geçici kimliğiyle ayırt ediliyor', () => {
    const known = salonServicesOf([{ id: 'uuid-1', name: 'Kesim', duration: 30, price: 450, color: '#5B8FD9' }]);
    assert.deepEqual(known, [{ id: 'uuid-1', name: 'Kesim', minutes: 30, price: 450, color: '#5B8FD9' }]);
    assert.equal(isNewService('svc-123', known), true);
    assert.equal(isNewService('uuid-1', known), false);
    assert.equal(salonServicesOf([{ name: 'Kimliksiz' }]).length, 0);
});

// ── Ekranlar ────────────────────────────────────────────────────────────────

test('ekranlar sahte kaynağı OKUMUYOR', () => {
    for (const [name, code] of [['saatler', hoursScreen], ['hizmetler', servicesScreen], ['profil', profile]]) {
        assert.doesNotMatch(code, /readHours|readServices|saveDay|saveService\(|deleteService\(/, name);
    }
    assert.match(hoursScreen, /fetchHoursRow\(\)/);
    assert.match(hoursScreen, /saveWorkingHours\(next, row\)/);
    assert.match(servicesScreen, /fetchServices\(\)/);
    assert.match(servicesScreen, /saveSalonService\(service, isNewService\(service\.id, services \?\? \[\]\)\)/);
    assert.match(profile, /Promise\.all\(\[fetchHoursRow\(\), fetchServices\(\)\]\)/);
});

test('okunamayan saat "kapalı", okunamayan katalog "hizmet yok" diye çizilmiyor', () => {
    assert.match(hoursScreen, /<DurumUnread\s*what="Çalışma saatlerini"\s*notMeaning="Salonun kapalı olduğu"/);
    assert.match(hoursScreen, /\{hours \? \(\s*<Group>/);
    assert.match(servicesScreen, /<DurumUnread\s*what="Hizmetleri"\s*notMeaning="Hizmet olmadığı"/);
    // Boş blok ("Henüz hizmet yok") YALNIZ okuma başarılıysa.
    assert.match(servicesScreen, /\{services === null \? \(\s*!snap\.refusal && snap\.state === 'error' \? \(/);
    assert.ok(servicesScreen.indexOf('services === null ?') < servicesScreen.indexOf('services.length === 0 ?'));
});

test('"Tüm günlere uygula" kapalı günü AÇMIYOR', () => {
    assert.match(hoursScreen, /candidate\.day === day\.day \|\| candidate\.closed\s*\? candidate/);
});

test('yazılamayan değişiklik söyleniyor; başka cihaz değiştirdiyse güncel hâl getiriliyor', () => {
    assert.match(hoursScreen, /if \(result\.kind === 'stale'\) void snap\.reload\(\);/);
    assert.match(servicesScreen, /if \(result\.kind === 'stale'\) void snap\.reload\(\);/);
    assert.match(hoursScreen, /setLocal\(\{ row: result\.value, from: row\.stamp \}\);/);
    assert.match(hoursScreen, /local && snap\.data && snap\.data\.stamp === local\.from \? local\.row : snap\.data/);
    assert.match(servicesScreen, /written && written\.at === snap\.at \? written\.list : snap\.data/);
    for (const kind of ['stale', 'paused', 'failed']) {
        const copy = settingsRefusal(kind);
        assert.doesNotMatch(`${copy.title} ${copy.line}`, /kayıt|sunucu|senkron|hata kodu/i, kind);
    }
});

test('bildirimler GİZLİ — arkasında bildirim yolu yok (kullanıcı kararı)', () => {
    assert.equal(MANAGER_NOTIFICATIONS_READY, false);
    assert.match(profile, /\{MANAGER_NOTIFICATIONS_READY \? \(\s*<ProfileRow\s*title="Bildirimler"/);
    assert.match(notifyScreen, /if \(!MANAGER_NOTIFICATIONS_READY\) return <Redirect href="\/mudur\/profile" \/>;/);
    assert.match(read('supabase/046_push_only_staff.sql'), /GÖNDERİLMEZ/i);
});

test('saf katman React, Expo ve Supabase taşımıyor', () => {
    assert.doesNotMatch(pure, /from 'react|from 'expo|supabase\./);
});
