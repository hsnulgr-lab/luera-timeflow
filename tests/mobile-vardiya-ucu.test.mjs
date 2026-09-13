import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    minutesOf, toDays, toMondayFirst, toShiftSource,
} from '../mobile/src/lib/shiftMap.ts';
import { scheduleFor, usesSalonHours, weekRows } from '../mobile/src/lib/staffShift.ts';
import { returnDateISO } from '../mobile/src/lib/staffDay.ts';

/**
 * VARDİYA UCU — `staff.working_hours` + `staff_time_off` mobile taşınıyor.
 *
 * Ekran bugüne kadar `demoSource`tan besleniyordu: herkese 10:00–19:00 ve
 * herkese PERŞEMBE–CUMA İZİNLİ. Personel kendi profilini açıp olmayan bir
 * izin görüyordu.
 *
 * Bu dosyanın asıl işi tek bir satırı korumak: veritabanı haftayı PAZARdan
 * sayıyor, mobil PAZARTESİden. Çevirme unutulursa her şey bir gün kayıyor ve
 * hiçbir yerde hata görünmüyor — yalnız saatler tutmuyor.
 */

const api = readFileSync(
    new URL('../supabase/functions/staff-api/index.ts', import.meta.url), 'utf8');
const client = readFileSync(
    new URL('../mobile/src/api/staff.ts', import.meta.url), 'utf8');

/** Veritabanının şekli: `day` PAZARdan, saat metin. */
const db = (day, start, end, isOff = false) => ({ day, start, end, isOff });
/** Pazar kapalı, Pzt–Cmt 09:00–19:00 — DB sayımıyla. */
const SALON = [
    db(0, '09:00', '19:00', true),
    db(1, '09:00', '19:00'), db(2, '09:00', '19:00'), db(3, '09:00', '19:00'),
    db(4, '09:00', '19:00'), db(5, '09:00', '19:00'), db(6, '10:00', '15:00'),
];

// ── Haftanın ilk günü ───────────────────────────────────────────────────────

test('PAZAR sayımı PAZARTESİ sayımına çevriliyor', () => {
    // DB 0 = Pazar · mobil 0 = Pazartesi. Çevirme unutulursa pazartesinin
    // saatleri pazar gününe yazılır.
    assert.equal(toMondayFirst(0), 6, 'Pazar → 6');
    assert.equal(toMondayFirst(1), 0, 'Pazartesi → 0');
    assert.equal(toMondayFirst(6), 5, 'Cumartesi → 5');
    // Yedi günün hiçbiri çakışmıyor.
    assert.equal(new Set([0, 1, 2, 3, 4, 5, 6].map(toMondayFirst)).size, 7);
});

test('kapalı gün DOĞRU güne düşüyor', () => {
    // Salon PAZAR kapalı. Çevirme yanlışsa cumartesi ya da pazartesi kapanır.
    const days = toDays(SALON);
    const closed = days.filter((d) => d.closed).map((d) => d.day);
    assert.deepEqual(closed, [6], 'yalnız pazar (mobil sayımıyla 6) kapalı');
    // Cumartesi 10:00–15:00 — mobil sayımıyla 5.
    const sat = days.find((d) => d.day === 5);
    assert.equal(sat.open, 600);
    assert.equal(sat.close, 900);
});

test('hafta satırları GERÇEK güne oturuyor', () => {
    // 2026-09-14 pazartesi. Pazar satırı haftanın SONUNDA ve kapalı olmalı.
    const source = toShiftSource({ salonHours: SALON, staffHours: null, timeOff: [] });
    const rows = weekRows(source, '2026-09-14', '2026-09-14');
    assert.equal(rows[0].name, 'Pazartesi');
    assert.equal(rows[0].hours, '09:00 – 19:00');
    assert.equal(rows[6].dateISO, '2026-09-20');
    assert.equal(rows[6].closedWord, 'Salon kapalı');
    assert.equal(rows[5].hours, '10:00 – 15:00', 'cumartesi kendi saatinde');
});

// ── Saat biçimi ─────────────────────────────────────────────────────────────

test('saat metni dakikaya çevriliyor — okunamayan UYDURULMUYOR', () => {
    assert.equal(minutesOf('09:00'), 540);
    assert.equal(minutesOf('9:30'), 570);
    assert.equal(minutesOf('23:59'), 1439);
    // Sıfır DEĞİL null: `0` "gece yarısı açılıyor" demek olurdu.
    assert.equal(minutesOf(''), null);
    assert.equal(minutesOf('abc'), null);
    assert.equal(minutesOf('25:00'), null);
    assert.equal(minutesOf('09:70'), null);
    assert.equal(minutesOf(null), null);
});

test('okunamayan saat günü KAPALI yapıyor, 00:00 açmıyor', () => {
    const [broken] = toDays([db(1, 'bozuk', '19:00')]);
    assert.equal(broken.closed, true);
    // Ters aralık da kapalı: 19:00–09:00 bir vardiya değil.
    const [reversed] = toDays([db(1, '19:00', '09:00')]);
    assert.equal(reversed.closed, true);
});

test('tanınmayan gün numarası ATILIYOR', () => {
    // `day: 9` bir güne denk gelmiyor; onu 2'ye kırpmak yanlış güne saat yazardı.
    assert.equal(toDays([db(9, '09:00', '19:00'), db(1, '09:00', '19:00')]).length, 1);
});

// ── null ile boş dizi ───────────────────────────────────────────────────────

test('"ayrı saati yok" ile "hiç çalışmıyor" AYRI', () => {
    // `staffHours: null` salonunkini kullanıyor demek. Boş diziye çevirmek,
    // personeli hiçbir gün çalışmıyor gösterirdi.
    const salonOnly = toShiftSource({ salonHours: SALON, staffHours: null, timeOff: [] });
    assert.equal(salonOnly.staffHours, null);
    assert.equal(usesSalonHours(salonOnly), true);
    assert.equal(scheduleFor(salonOnly, 0).open, 540, 'salonun pazartesisi');

    const own = toShiftSource({
        salonHours: SALON, timeOff: [],
        staffHours: [db(1, '10:00', '17:00')],
    });
    assert.equal(usesSalonHours(own), false);
    assert.equal(scheduleFor(own, 0).open, 600, 'personelin kendi pazartesisi');
    // Personelin listesinde OLMAYAN gün: kapalı sayılıyor, salonunkine
    // düşmüyor — ayrı saati olan personel o gün çalışmıyor demektir.
    assert.equal(scheduleFor(own, 2).closed, true);
});

test('salonun saatleri okunamazsa kaynak KURULMUYOR', () => {
    // `salonHours` personelin `null`'ının karşılığı; onsuz ekran ne çalışma
    // saati ne kapalı gün söyleyebilir. Boş bir haftayı çizmek, herkesi
    // sürekli kapalı göstermek olurdu.
    assert.equal(toShiftSource({ salonHours: null, staffHours: null, timeOff: [] }), null);
    assert.equal(toShiftSource({}), null);
});

// ── İzin ────────────────────────────────────────────────────────────────────

test('izin tarihleri taşınıyor, biçimsizler eleniyor', () => {
    const src = toShiftSource({
        salonHours: SALON, staffHours: null,
        timeOff: [{ date: '2026-09-17' }, { date: '' }, { date: 'yarın' }, { date: '2026-09-18', reason: 'rapor' }],
    });
    assert.deepEqual(src.timeOff, ['2026-09-17', '2026-09-18']);
});

test('izin ŞABLONU EZMİYOR — üstüne biniyor', () => {
    // "Normalde perşembeleri çalışırım ama bu perşembe izinliyim."
    const src = toShiftSource({
        salonHours: SALON, staffHours: null, timeOff: [{ date: '2026-09-17' }],
    });
    const rows = weekRows(src, '2026-09-14', '2026-09-14');
    const thu = rows[3];
    assert.equal(thu.dateISO, '2026-09-17');
    assert.equal(thu.leave, true);
    assert.equal(thu.hours, '09:00 – 19:00', 'şablon saati yerinde duruyor');
});

test('pencerenin ötesine taşan izinde dönüş günü UYDURULMUYOR', () => {
    // Sunucu izinleri sınırlı bir pencerede dönüyor. Liste son gününde
    // bitiyorsa izin gerçekten bitmiş olmayabilir — `returnDateISO` o hâlde
    // tarih söylemiyor.
    assert.equal(returnDateISO(['2026-09-14', '2026-09-15'], '2026-09-14'), '2026-09-16');
    assert.equal(returnDateISO(['2026-09-14'], '2026-09-14'), '2026-09-15');
    // Bugün izinli değilse cümle hiç kurulmuyor.
    assert.equal(returnDateISO(['2026-09-20'], '2026-09-14'), null);
});

// ── Sunucu ucu ──────────────────────────────────────────────────────────────

test('uç KENDİ personelini okuyor, kadroyu değil', () => {
    const cut = api.slice(api.indexOf("if (action === 'shift')"), api.indexOf("return json({ error: 'unknown_action' }"));
    assert.match(cut, /\.eq\('id', me\.id\)/, 'staff satırı token sahibinin');
    assert.match(cut, /\.eq\('staff_id', me\.id\)/, 'izinler token sahibinin');
    assert.match(cut, /\.eq\('organization_id', me\.organization_id\)/);
    // Başkasının kimliği gövdeden OKUNMUYOR.
    assert.doesNotMatch(cut, /body\.staffId/);
});

test('üç okumanın hiçbiri sessizce boş geçmiyor', () => {
    // İzin listesi hata yutup boş dönerse personel izinli gününü çalışma günü
    // sanar ve işe gelir.
    const cut = api.slice(api.indexOf("if (action === 'shift')"), api.indexOf("return json({ error: 'unknown_action' }"));
    assert.match(cut, /if \(mineErr \|\| stErr \|\| offErr\)/);
    assert.match(cut, /return json\(\{ error: 'lookup_failed' \}, 500\)/);
});

test('uç sözleşmede ve istemcide KAYITLI', () => {
    assert.match(api, /\| 'shift'\s/);
    assert.match(client, /shift: \(\) => call\('shift'\)/);
    // Pencere DÖNÜYOR: istemci listenin nerede bittiğini bilmeli.
    const cut = api.slice(api.indexOf("if (action === 'shift')"));
    assert.match(cut.slice(0, 4000), /window: \{ from, to \}/);
});

// ── Ekranlar ────────────────────────────────────────────────────────────────

const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const profile = code(readFileSync(
    new URL('../mobile/app/personel/profile.tsx', import.meta.url), 'utf8'));
const shiftPage = code(readFileSync(
    new URL('../mobile/app/(staff-flow)/vardiyam.tsx', import.meta.url), 'utf8'));
const source = code(readFileSync(
    new URL('../mobile/src/lib/shiftSource.ts', import.meta.url), 'utf8'));

test('iki ekran da SAHTE haftadan koptu', () => {
    // `demoSource` herkese 10:00–19:00 ve PERŞEMBE–CUMA İZİNLİ veriyordu.
    for (const [name, src] of [['profile', profile], ['vardiyam', shiftPage]]) {
        assert.doesNotMatch(src, /demoSource/, `${name} hâlâ sahte haftaya bakıyor`);
        assert.match(src, /useShift\(\)/, `${name} canlı kaynağa bağlanmalı`);
    }
    // Sahte hafta YALNIZ kaynağın içinde, `LIVE_AUTH` kapısının ardında.
    assert.match(source, /LIVE_AUTH\s*\n?\s*\?\s*api\.shift\(\)/);
});

test('okunamayan hafta BOŞ HAFTA gibi çizilmiyor', () => {
    // Yedi kapalı satır "bu hafta hiç çalışmıyorsun" der ve o cümle bir arıza
    // hâlinde yalan olur — personel ona göre plan yapar.
    assert.match(shiftPage, /source \? \(/);
    assert.match(shiftPage, /<Unread onRetry=/);
    assert.match(shiftPage, /Çalışma gününüz olmadığı anlamına gelmez/);
    // Kaynak boş hafta ÜRETMİYOR.
    assert.match(source, /source: ShiftSource \| null;/);
});

test('vardiya kartı okunamayınca HİÇ çizilmiyor', () => {
    // Sönük ya da boş bir kart "bugün izinlisin" gibi okunur: saat yerine
    // kelime duran hâl zaten izinli hâli.
    assert.match(profile, /\{card \? <TodayCard card=\{card\} onPress=\{openShift\} \/> : null\}/);
    // Satır sebebini SÖYLÜYOR — üç hâl ayrı.
    assert.match(profile, /Okunamadı · dokunup tekrar deneyin/);
    assert.match(profile, /Okunuyor…/);
});

test('sayfanın GERİ KALANI vardiyaya bağlı değil', () => {
    // Ad, hesap, görünüm ve cihaz satırları oturumdan geliyor ve vardiya
    // okunamasa da doğru. Ekranı bütünüyle bekletmek, doğru bilgiyi de
    // saklamak olurdu.
    assert.match(profile, /if \(!session\) return/);
    assert.doesNotMatch(profile, /if \(!source\) return/);
});

test('odağa dönüşte YENİDEN okunuyor', () => {
    // İzin bugün girilmişse personel onu telefonu bir dahaki açışında görmeli.
    assert.match(source, /useFocusEffect\(useCallback\(\(\) => \{ void read\(false\); \}, \[read\]\)\)/);
    assert.match(source, /AppState\.addEventListener/);
});
