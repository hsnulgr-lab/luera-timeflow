import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    NOTIFICATION_FOOT, demoSource, mondayOf, scheduleFor, shiftCard, spanLabel,
    usesSalonHours, weekFoot, weekRows, weekSummary,
} from '../mobile/src/lib/staffShift.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const profile = code(read('../mobile/app/personel/profile.tsx'));
const week = code(read('../mobile/app/(staff-flow)/vardiyam.tsx'));

const MON = '2026-09-07';
const H = (day, open, close) => ({ day, open, close, closed: false });
const SALON = [0, 1, 2, 3, 4, 5].map((d) => H(d, 540, 1260))
    .concat([{ day: 6, open: 540, close: 1260, closed: true }]);
const MINE = [0, 1, 2, 3, 4].map((d) => H(d, 600, 1140))
    .concat([H(5, 600, 1260), { day: 6, open: 600, close: 1140, closed: true }]);

const src = (over = {}) => ({ staffHours: MINE, salonHours: SALON, timeOff: [], ...over });

// ── Kartın dört hâli ────────────────────────────────────────────────────────

test('vardiya kartı dört hâl söylüyor ve geri sayım yalnız işleyen zamanda', () => {
    // Pazartesi 10:00 – 19:00.
    const before = shiftCard(src(), MON, 0, 8 * 60);
    assert.equal(before.statusWord, 'Başlamadı');
    assert.equal(before.countdown, 'başlangıca 2 sa');
    assert.equal(before.open, false);

    const during = shiftCard(src(), MON, 0, 15 * 60 + 48);
    assert.equal(during.statusWord, 'Şu anda vardiyada');
    assert.equal(during.open, true);
    assert.equal(during.countdown, 'bitişe 3 sa 12 dk');

    const after = shiftCard(src(), MON, 0, 20 * 60);
    assert.equal(after.statusWord, 'Bugün bitti');
    // Bitmiş günde geri sayım YOK: turuncu yalnız işleyen bir zaman için.
    assert.equal(after.countdown, null);

    const off = shiftCard(src({ timeOff: [MON] }), MON, 0, 15 * 60);
    assert.equal(off.statusWord, 'Bugün izinli');
    assert.equal(off.range, 'İzinli');
    assert.equal(off.countdown, null);
    // Saat yerine kelime duruyor; kelime saatin mürekkebiyle yazılmıyor.
    assert.equal(off.dim, true);
});

test('izin şablonu EZİYOR: normalde çalışılan gün de izinli olabiliyor', () => {
    // Çarşamba şablonda çalışılıyor.
    assert.equal(scheduleFor(src(), 2).closed, false);
    const card = shiftCard(src({ timeOff: ['2026-09-09'] }), '2026-09-09', 2, 12 * 60);
    assert.equal(card.statusWord, 'Bugün izinli');
});

test('süre etiketi sıfır birimi yazmıyor', () => {
    assert.equal(spanLabel(192), '3 sa 12 dk');
    assert.equal(spanLabel(120), '2 sa');
    assert.equal(spanLabel(40), '40 dk');
    assert.equal(spanLabel(-5), '0 dk');
});

// ── Izgara ──────────────────────────────────────────────────────────────────

test('ızgara BU HAFTAYI gösteriyor: her satırda tarih var', () => {
    const rows = weekRows(src(), MON, '2026-09-08');
    assert.equal(rows.length, 7);
    assert.equal(rows[0].dateISO, MON);
    assert.equal(rows[0].dateLabel, '7 Eyl');
    // Bugün tarihten türüyor, haftanın gününden değil.
    assert.equal(rows[1].today, true);
    assert.equal(rows[0].today, false);
});

test('üç gün hâli birbirinden ayrı', () => {
    const mine = weekRows(src(), MON, MON);
    assert.equal(mine[0].hours, '10:00 – 19:00');
    assert.equal(mine[0].salon, false);
    // Düzenli izin günü: saat yerine kelime, ve kelime kaynağını söylüyor.
    assert.equal(mine[6].hours, null);
    assert.equal(mine[6].closedWord, 'Çalışmıyor');

    const salon = weekRows(src({ staffHours: null }), MON, MON);
    assert.equal(salon[0].hours, '09:00 – 21:00');
    assert.equal(salon[0].salon, true);
    // Salonun kapalı olması ile personelin çalışmaması AYNI ŞEY DEĞİL.
    assert.equal(salon[6].closedWord, 'Salon kapalı');
});

test('izin ikinci katman: şablon saati satırda KALIYOR', () => {
    const rows = weekRows(src({ timeOff: ['2026-09-10'] }), MON, MON);
    const thursday = rows[3];
    assert.equal(thursday.leave, true);
    // Satır silinmiyor, saat yok olmuyor — sönüyor. İzin kalkarsa satır
    // kendi eski hâline döner.
    assert.equal(thursday.hours, '10:00 – 19:00');
});

test('haftanın pazartesisi pazar günü de doğru', () => {
    assert.equal(mondayOf('2026-09-13'), MON);
    assert.equal(mondayOf(MON), MON);
});

// ── Foot cümleleri ──────────────────────────────────────────────────────────

const text = (spans) => spans.map((s) => s.text).join('');
const strong = (spans) => spans.filter((s) => s.strong).map((s) => s.text).join(' | ');

test('NULL "salonla aynı saatler" demiyor: cümle GELECEK zaman kuruyor', () => {
    const source = src({ staffHours: null });
    assert.equal(usesSalonHours(source), true);
    const foot = weekFoot(source, weekRows(source, MON, MON), MON);
    assert.match(text(foot), /salonun saatlerinde çalışıyorsunuz/);
    // Dondurulmuş bir kopya sanılmasını engelleyen şey bu yan cümle.
    assert.match(text(foot), /Salonun saatleri değişirse sizinki de değişir/);
    assert.equal(strong(foot), 'salonun saatlerinde çalışıyorsunuz');
});

test('dönüş tarihi türetilemiyorsa cümle KURULMUYOR', () => {
    // İzin bilinen günlerin sonuna kadar sürüyor: uydurulmuş bir dönüş günü
    // müşterinin gözü önünde yanlış olabilir.
    const timeOff = ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];
    const source = src({ timeOff });
    const foot = weekFoot(source, weekRows(source, MON, MON), '2026-09-10');
    assert.match(text(foot), /dönüş tarihi girilmemiş/);
    assert.doesNotMatch(text(foot), /dönüyorsunuz/);
});

test('dönüş tarihi biliniyorsa söyleniyor', () => {
    const timeOff = ['2026-09-10', '2026-09-11'];
    const source = src({ timeOff });
    const foot = weekFoot(source, weekRows(source, MON, MON), '2026-09-10');
    assert.match(text(foot), /12 Eylül cumartesi dönüyorsunuz/);
});

test('yetki cümlesi TAM OLARAK BİR KEZ, ve yalnız ızgaranın altında', () => {
    const source = src({ timeOff: ['2026-09-10'] });
    const foot = text(weekFoot(source, weekRows(source, MON, MON), MON));
    const hits = foot.match(/işletme belirler/g) ?? [];
    assert.equal(hits.length, 1);
    // Ana ekranda tekrar edilmiyor, satırlarda kilit ikonu yok.
    assert.doesNotMatch(profile, /işletme belirler/);
    assert.doesNotMatch(week, /kilit|lock/i);
});

test('hiç çalışma günü olmayan hafta kendi cümlesini kuruyor', () => {
    const source = { staffHours: [], salonHours: SALON, timeOff: [] };
    const foot = text(weekFoot(source, weekRows(source, MON, MON), MON));
    assert.match(foot, /Bu hafta çalışma gününüz yok/);
});

test('özet satırı izin günlerini adıyla sayıyor', () => {
    assert.equal(weekSummary(weekRows(src(), MON, MON)), '6 gün · Pazar izinli');
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('profil müdürün bileşenlerini kullanıyor, kendi satırını çizmiyor', () => {
    for (const part of ['ProfileHead', 'TodayCard', 'Group', 'ProfileRow', 'Foot']) {
        assert.match(profile, new RegExp(`\\b${part}\\b`), part);
    }
    // Kendi başlık çubuğu, kendi bölüm başlığı, kendi anahtarı YOK.
    assert.doesNotMatch(profile, /function (TopBar|SectionTitle|SettingRow|Toggle|NotificationRow)\b/);
});

test('avatar diski ve yazı boyutu satırı kalktı', () => {
    // Müdürünkinde avatar yok; iki ekranın aynı ürün görünmesinin şartı bu.
    assert.doesNotMatch(profile, /borderRadius:\s*38|initials/);
    assert.doesNotMatch(profile, /Yazı boyutu/);
});

test('sahte bildirim anahtarları kalktı, yerine tek cümle geldi', () => {
    assert.doesNotMatch(profile, /SwitchRow|ProfileSwitch/);
    assert.match(profile, /NOTIFICATION_FOOT/);
    assert.match(NOTIFICATION_FOOT, /Bugün sekmesinde/);
});

test('ölü satırlar kalktı: PIN ve Yardım pasif bırakılmadı, silindi', () => {
    assert.doesNotMatch(profile, /PIN.?i değiştir|Şifremi değiştir|Yardım/);
});

test('cihaz satırı bir beyan: gidilecek yer yoksa chevron da yok', () => {
    assert.match(profile, /title="Bu telefon"/);
    assert.match(profile, /chevron=\{false\}[\s\S]{0,200}title="Bu telefon"/);
    // Oturum kapatma satırı KIRMIZI DEĞİL: kırmızı "geri dönüşü zor" demek,
    // oysa çıkış yapan kişi telefonu bağlı kalarak şifresiyle geri giriyor.
    const head = profile.indexOf('title="Bu telefon"');
    const device = profile.slice(head, profile.indexOf('</Group>', head));
    assert.doesNotMatch(device, /danger/);
    // Kırmızı YALNIZ eşleşmeyi bozan satırda — o gerçekten geri dönüşü zor.
    assert.match(profile, /danger[\s\S]{0,120}title="Bu telefonu işletmeden çıkar"/);
});

test('Görünüm ve Yasal ortak gruptan açılıyor, müdür klasöründen değil', () => {
    assert.match(profile, /\(ortak\)\/profil\/gorunum/);
    assert.match(profile, /\(ortak\)\/profil\/yasal/);
    assert.doesNotMatch(profile, /manager-flow/);
});

test('ızgara satırları dokunulamaz: Pressable değil, chevron yok', () => {
    // Kural SATIRIN kuralı, dosyanın değil. Dosya geneline bakmak, ekrana
    // eklenen her düğmede patlıyordu — "Tekrar dene" bir gün satırı değil ve
    // onu yasaklamak, okunamayan haftayı çıkışsız bırakırdı.
    const row = week.slice(week.indexOf('function DayRow'));
    assert.doesNotMatch(row, /Pressable/);
    assert.doesNotMatch(row, /Chevron/);
    // Ekran okuyucu da düğme diye okumamalı.
    assert.doesNotMatch(row, /accessibilityRole="button"/);
    // Izgaranın KENDİSİ de dokunulabilir bir kapsayıcıya sarılmamalı.
    const grid = week.slice(week.indexOf('<Group>'), week.indexOf('</Group>'));
    assert.doesNotMatch(grid, /Pressable|onPress/);
});

test('ızgara müdürün ölçülerini koruyor', () => {
    assert.match(week, /minHeight: M\.dayHeight/);
    assert.match(week, /M\.daySpine/);
    assert.match(week, /size=\{M\.dayName\}|fontSize: M\.dayName/);
});

test('demo kaynağı sunucu ucu gelene kadar; tablolar canlı', () => {
    const source = demoSource('2026-09-08');
    assert.equal(source.timeOff.length, 2);
    assert.equal(usesSalonHours(source), false);
});
