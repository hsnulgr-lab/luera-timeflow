import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    blockDetail, blockLayout, columnize, COLUMN_WIDTH, HOUR_HEIGHT, HOURS_WIDTH,
    hourLabels, hourRange, MIN_BLOCK, nowLineTop,
} from '../mobile/src/lib/managerCalendar.ts';

// Müdür 06 — personel sütunlu takvim.
//
// Bu dosyanın koruduğu şey: müdür takviminin personel takvimiyle TEK bir
// noktada ayrılması. Dev başlık, hafta şeridi, yoğunluk noktaları ve şimdi
// çizgisi ortak; ayrılan yalnız gövde.

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');

const screen = read('app/(manager)/calendar.tsx');
const grid = read('src/components/ColumnCalendar.tsx');
const parts = read('src/components/CalendarParts.tsx');

const appt = (id, start, end, staffId) => ({
    id, customer_id: null, customer_name: 'Test Müşteri', customer_phone: null,
    date: '2026-08-13', start_time: start, end_time: end, service: 'Kesim',
    service_color: null, status: 'confirmed', staff_id: staffId, notes: null,
    arrived_at: null, service_ended_at: null,
});

test('bir saat 74 pt: blok yüksekliği süreyi söyler', () => {
    const { top, height } = blockLayout(appt('a', '11:00', '12:30'), 9 * 60);
    assert.equal(top, 2 * HOUR_HEIGHT);
    assert.equal(height, 1.5 * HOUR_HEIGHT);
});

test('çok kısa randevu bile dokunulabilir kalır', () => {
    // 10 dakikalık bir kayıt 12 pt olurdu; görünmez demekti.
    const { height } = blockLayout(appt('a', '11:00', '11:10'), 9 * 60);
    assert.equal(height, MIN_BLOCK);
});

test('blok içeriği yüksekliğe göre azalır', () => {
    // Sığmayan metni küçültmek yerine çıkarıyoruz; 11 pt altı okunmuyor.
    assert.equal(blockDetail(111), 'full');
    assert.equal(blockDetail(56), 'full');
    assert.equal(blockDetail(45), 'timeAndName');
    assert.equal(blockDetail(MIN_BLOCK), 'nameOnly');
});

test('süre hiçbir hâlde yazılmaz', () => {
    // Blok yüksekliği süreyi zaten söylüyor; bir de yazmak aynı bilgiyi iki
    // kez vermek olurdu.
    assert.doesNotMatch(grid, /end_time/);
    assert.doesNotMatch(grid, /dk`|\bdk\b/);
});

test('personelsiz randevu hiçbir sütuna düşmez', () => {
    const staff = [{ id: 'merve', initials: 'MK', name: 'Merve' }];
    const map = columnize(
        [appt('a', '10:00', '11:00', 'merve'), appt('b', '10:00', '11:00', null), appt('c', '10:00', '11:00', 'yok')],
        staff,
        9 * 60,
    );
    assert.equal(map.get('merve').length, 1);
    assert.equal(map.size, 1);
});

test('bloklar sütun içinde saate göre sıralı', () => {
    const staff = [{ id: 'merve', initials: 'MK', name: 'Merve' }];
    const map = columnize(
        [appt('gec', '15:00', '16:00', 'merve'), appt('erken', '09:30', '10:00', 'merve')],
        staff,
        9 * 60,
    );
    assert.deepEqual(map.get('merve').map((b) => b.appointment.id), ['erken', 'gec']);
});

test('görünen saat aralığı randevulara göre daralır', () => {
    // Salonun çalışmadığı saatleri çizmek ekranın yarısını boş ızgaraya harcardı.
    const { from, to } = hourRange([appt('a', '10:00', '11:00'), appt('b', '13:00', '14:30')]);
    assert.equal(from, 9);
    assert.equal(to, 16);
    // Randevu yoksa makul bir varsayılan.
    assert.deepEqual(hourRange([]), { from: 9, to: 20 });
});

test('saat etiketleri iki haneli', () => {
    assert.deepEqual(hourLabels(9, 12), ['09:00', '10:00', '11:00']);
});

test('şimdi çizgisi dakikaya göre yerleşir', () => {
    // Kayan nokta: iki ifade matematiksel olarak eşit ama bit düzeyinde değil.
    assert.ok(Math.abs(nowLineTop(11 * 60 + 24, 9 * 60) - (2 + 24 / 60) * HOUR_HEIGHT) < 1e-9);
    assert.equal(nowLineTop(9 * 60, 9 * 60), 0);
    assert.equal(nowLineTop(10 * 60, 9 * 60), HOUR_HEIGHT);
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('takvim dili yeniden yazılmadı: başlık ve şerit ortak', () => {
    assert.match(screen, /import \{ DayHeader, WeekStrip \} from '\.\.\/\.\.\/src\/components\/CalendarParts'/);
    assert.match(screen, /<DayHeader/);
    assert.match(screen, /<WeekStrip/);
});

test('sol saat sütunu sabit; sütunlar altından geçer', () => {
    // Saatler de kaysaydı müdür üçüncü sütundayken hangi saate baktığını
    // kaybederdi.
    assert.equal(HOURS_WIDTH, 62);
    assert.equal(COLUMN_WIDTH, 95);
    const hours = grid.slice(grid.indexOf('Sabit saat sütunu'), grid.indexOf('<ScrollView\n                horizontal'));
    assert.match(hours, /width: HOURS_WIDTH/);
    // Yatay kaydırma YALNIZ sütunları sarıyor; saat sütunu onun DIŞINDA.
    assert.equal((grid.match(/^\s+horizontal$/gm) || []).length, 1);
    assert.ok(
        grid.indexOf('width: HOURS_WIDTH') < grid.indexOf('horizontal'),
        'saat sütunu yatay kaydırıcının içinde kalmış',
    );
});

test('ızgara dikeyde kaydırılır', () => {
    // Onbir saatlik bir gün 814 pt tutuyor; ekrana sığmıyor. Dikey kaydırma
    // DIŞTA, çünkü saat sütunu ve ızgara birlikte kaymalı — yoksa saatler
    // yerinde kalıp bloklarla hizası bozulur.
    assert.ok(
        grid.indexOf('<ScrollView') < grid.indexOf('width: HOURS_WIDTH'),
        'dikey kaydırıcı saat sütununu da sarmalı',
    );
    assert.match(grid, /contentInsetAdjustmentBehavior="automatic"/);
});

test('şimdi çizgisi bütün sütunları keser', () => {
    assert.match(grid, /left: 0,\s*\n\s*right: 0,\s*\n\s*top: nowTop/);
    assert.match(grid, /isToday && nowTop >= 0/);
});

test('boş saate dokunmak randevu oluşturmayı açar', () => {
    // Müdürün en hızlı yolu: o personel ve o saatle ön dolu.
    assert.match(grid, /onSlot\?\.\(person\.id, dayStart \+ hourIndex \* 60\)/);
    // Ön dolgu parametreleri Müdür 09'un kendi testinde ayrıntılı kontrol
    // ediliyor; burada yalnız bağlantının kurulduğu doğrulanıyor.
    assert.match(screen, /onSlot=\{\(staffId, minutes\) => router\.navigate\(/);
});

test('canlı blok soldaki turuncu şeritle işaretlenir', () => {
    // Takvim kartındaki dille aynı.
    assert.match(grid, /isLive\(appointment\)/);
    assert.match(grid, /columnMetrics\.liveBar/);
});

// ── Bilinmeyen gün ≠ boş gün ────────────────────────────────────────────────

test('sayısı okunamayan gün SIFIR diye çizilmez', () => {
    /*
     * `counts[gün] ?? 0` yazıyordu: `source.range()` hata verince bütün günler
     * "randevu yok" oluyordu ve ekran müdüre olmayan bir bilgiyi söylüyordu.
     * Sıfır bir ölçümdür, bilinmemek bir boşluktur.
     */
    assert.match(parts, /const count = counts\[day\.date\];/);
    assert.match(parts, /const known = count !== undefined;/);
    // Yorumlar eşleşmeye karışmasın: iddia gerçek koda bakmalı.
    const partsCode = parts.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    assert.doesNotMatch(partsCode, /counts\[[a-z]+\.date\] \?\? 0/);
    // Ekran okuyucu da yalan söylemiyor.
    assert.match(parts, /randevu sayısı bilinmiyor/);
    // Nokta yalnız SAYI BİLİNİYORSA çizilir.
    assert.match(parts, /known && count > 0 \?/);
});

test('gün listesi okunamazsa boş gün YAZILMAZ', () => {
    // Yakalama yoksa hata sessizce yutulup ekran boş güne dönüyordu.
    assert.match(screen, /source\.day\(selectedDate\)\s*\n\s*\.then/);
    assert.match(screen, /\.catch\(\(\) => undefined\)/);
});
