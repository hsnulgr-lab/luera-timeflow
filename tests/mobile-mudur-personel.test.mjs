import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    activeCountOf,
    buildStaffDayState,
    DEFAULT_ARRIVAL_TOLERANCE_MIN,
    formatElapsed,
    isNoShow,
    formatFreeDuration,
    resolveStaffStateKind,
    returnDateISO,
    returnLine,
    shiftPercentage,
    splitStaffName,
} from '../mobile/src/lib/staffDay.ts';
import {
    staffDayGlow,
    staffDayMetrics,
    staffDayMotion,
} from '../mobile/src/theme/tokens.ts';
import { emptyDraft } from '../mobile/src/lib/createFlow.ts';

// ── Müdür 24 · Personel Günü Test Paketi ────────────────────────────────────
//
// Kaynak: `docs/design-reference/Luera Mobil - Mudur 24 Personel Gunu.html`.
// Tek Sayaç, H1-H6 Boş Hâller, Yatay Sayfalama ve 4 Hareket Anı Sözleşmesi.

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

const screenCode = code('app/(manager-flow)/personel/[id].tsx');
const staffDayComponent = code('src/components/StaffDay.tsx');
const partsComponent = code('src/components/StaffDayParts.tsx');
const flow = read('app/(manager)/index.tsx');

const mockPresence = [
    { id: 'deniz', initials: 'DA', name: 'Deniz Aksoy', state: 'busy', minutes: 41 },
    { id: 'merve', initials: 'MK', name: 'Merve Kaya', state: 'busy', minutes: 24 },
    { id: 'selin', initials: 'SD', name: 'Selin Demir', state: 'busy', minutes: 8 },
    { id: 'ece', initials: 'EÇ', name: 'Ece Çelik', state: 'free' },
    { id: 'gul', initials: 'GT', name: 'Gül Tunç', state: 'leave', phone: '0532 118 24 11' },
    // Kaan'ın numarası YOK: "Ara" düğmesinin hiç çizilmediğini görmek için.
    { id: 'kaan', initials: 'KB', name: 'Kaan Bulut', state: 'off' },
];

const mockAppointments = [
    {
        id: 'a1', customer_id: 'c1', customer_name: 'Ayşe Yılmaz', customer_phone: '+905321110001',
        date: '2026-08-13', start_time: '11:00', end_time: '12:13', service: 'Saç boyama',
        service_color: '#FF5A1F', status: 'confirmed', staff_id: 'deniz', notes: null,
        arrived_at: '2026-08-13T11:00:00+03:00', service_ended_at: null, info: null,
    },
    {
        id: 'a2', customer_id: 'c2', customer_name: 'Merve Aydın', customer_phone: '+905321110002',
        date: '2026-08-13', start_time: '14:00', end_time: '15:00', service: 'Kesim + fön',
        service_color: '#2D8F32', status: 'confirmed', staff_id: 'deniz', notes: 'Uçları çok kısa istemiyor',
        arrived_at: null, service_ended_at: null, info: null,
    },
    {
        id: 'a3', customer_id: 'c3', customer_name: 'Nur Aksoy', customer_phone: '+905321110003',
        date: '2026-08-13', start_time: '16:30', end_time: '16:50', service: 'Kaş alma',
        service_color: '#B87A00', status: 'pending', staff_id: 'deniz', notes: null,
        arrived_at: null, service_ended_at: null, info: null,
    },
];

// ── Karar Katmanı Testleri ──────────────────────────────────────────────────

test('activeCountOf salondaki meşgul personel sayısını doğru sayar', () => {
    assert.equal(activeCountOf(mockPresence), 3);
    assert.equal(activeCountOf([]), 0);
});

test('formatElapsed mm:ss biçiminde tabular döner', () => {
    assert.equal(formatElapsed(41 * 60), '41:00');
    assert.equal(formatElapsed(24 * 60 + 18), '24:18');
    assert.equal(formatElapsed(0), '0:00');
    assert.equal(formatElapsed(65), '1:05');
});

test('formatFreeDuration boş süreyi saat ve dakika birimleriyle ayrıştırır', () => {
    const dur1 = formatFreeDuration(126); // 2 saat 6 dakika
    assert.equal(dur1.value, '2');
    assert.equal(dur1.unit, 'sa 6dk');

    const dur2 = formatFreeDuration(45); // 45 dakika
    assert.equal(dur2.value, '45');
    assert.equal(dur2.unit, 'dk');
});

test('shiftPercentage vardiya ilerlemesini 09:00-19:00 bandında hesaplar', () => {
    assert.equal(shiftPercentage(9 * 60), 0);
    assert.equal(shiftPercentage(19 * 60), 100);
    assert.equal(shiftPercentage(14 * 60), 50);
});

test('splitStaffName ad ve soyadı doğru ayırır', () => {
    assert.deepEqual(splitStaffName('Deniz Aksoy'), { given: 'Deniz', family: 'Aksoy' });
    assert.deepEqual(splitStaffName('Gülşah Karaosmanoğlu'), { given: 'Gülşah', family: 'Karaosmanoğlu' });
    assert.deepEqual(splitStaffName('Ece'), { given: 'Ece', family: '' });
});

// ── H1–H6 Durum Testleri ────────────────────────────────────────────────────

test('H1 · İşlemde: tek sayaç kahraman kartta, canlı randevu listeden ÇIKARILIR', () => {
    const state = buildStaffDayState(mockPresence[0], mockAppointments, mockPresence, 11 * 60 + 24, 41 * 60);
    assert.equal(state.kind, 'running');
    assert.equal(state.stampText, 'İŞLEMDE');
    assert.equal(state.stampTone, 'run');
    assert.equal(state.badgeText, '41 dk');
    assert.ok(state.panel);
    assert.equal(state.panel.label, 'SÜRÜYOR');
    assert.equal(state.panel.heroValue, '41:00');
    assert.equal(state.panel.subText, 'Ayşe Yılmaz · Saç boyama · 12:13’te biter');
    // Canlı randevu listeden çıkarıldı, kalan 2 randevu var
    assert.equal(state.listTitle, 'Sıradaki · 2 randevu');
    assert.equal(state.upcomingAppointments.length, 2);
});

test('H2 · Müsait (randevulu): kahraman rakam boş süredir, sayaç değildir', () => {
    const eceAppointments = [
        {
            id: 'e1', customer_id: 'c10', customer_name: 'Burak Şen', customer_phone: '+905321110010',
            date: '2026-08-13', start_time: '10:00', end_time: '10:30', service: 'Kesim',
            service_color: '#2D8F32', status: 'cancelled', staff_id: 'ece', notes: null,
            arrived_at: null, service_ended_at: null, info: null,
        },
        {
            id: 'e2', customer_id: 'c11', customer_name: 'Hakan Toprak', customer_phone: '+905321110011',
            date: '2026-08-13', start_time: '13:30', end_time: '14:30', service: 'Saç bakım maskesi',
            service_color: '#B87A00', status: 'confirmed', staff_id: 'ece', notes: null,
            arrived_at: null, service_ended_at: null, info: null,
        },
    ];

    const state = buildStaffDayState(mockPresence[3], eceAppointments, mockPresence, 11 * 60 + 24);
    assert.equal(state.kind, 'free');
    assert.equal(state.stampText, 'MÜSAİT');
    assert.equal(state.stampTone, 'free');
    assert.equal(state.badgeText, null);
    assert.ok(state.panel);
    assert.equal(state.panel.label, 'ŞU AN BOŞ');
    assert.equal(state.panel.heroValue, '2');
    assert.equal(state.panel.heroUnit, 'sa 6dk');
    assert.equal(state.panel.subText, '13:30’a kadar · sıradaki Hakan Toprak');
    assert.equal(state.showNowLine, true);
});

test('H3 · Müsait (bugün randevu yok): 0 randevu + vardiya çubuğu + aktif işlem cümlesi', () => {
    const state = buildStaffDayState({ id: 'merve', initials: 'MK', name: 'Merve Kaya', state: 'free' }, [], mockPresence, 11 * 60 + 24);
    assert.equal(state.kind, 'empty');
    assert.ok(state.panel);
    assert.equal(state.panel.label, 'BUGÜN');
    assert.equal(state.panel.heroValue, '0');
    assert.equal(state.panel.heroUnit, 'randevu');
    assert.ok(state.shift);
    assert.equal(state.shift.dash, false);
    assert.match(state.emptyNote, /Salonda şu an 3 işlem sürüyor/);
    assert.match(state.emptyNote, /Merve bugün hiç randevu almadı/);
});

// ── İzin dönüşü ─────────────────────────────────────────────────────────────
//
// Veritabanında "izin bitişi" kolonu YOK: `staff_time_off` izni gün gün tutuyor
// (`UNIQUE(staff_id, date)`). Dönüş tarihi bu yüzden bir veri değil, ardışık
// günlerden bir çıkarım.

test('dönüş tarihi ardışık izin günlerinden türetilir', () => {
    const off = ['2026-08-27', '2026-08-28', '2026-08-29'];
    assert.equal(returnDateISO(off, '2026-08-27'), '2026-08-30');
    assert.equal(returnDateISO(off, '2026-08-29'), '2026-08-30');
});

test('izin listesi yoksa ya da bugün izinli değilse dönüş tarihi UYDURULMAZ', () => {
    assert.equal(returnDateISO(undefined, '2026-08-27'), null);
    assert.equal(returnDateISO([], '2026-08-27'), null);
    assert.equal(returnDateISO(['2026-09-10'], '2026-08-27'), null);
});

test('izin dizisi arada kesiliyorsa ilk boşluk dönüş günüdür', () => {
    // 27–28 izinli, 29 çalışıyor, 30 yine izinli: dönüş 29'dur.
    const off = ['2026-08-27', '2026-08-28', '2026-08-30'];
    assert.equal(returnDateISO(off, '2026-08-27'), '2026-08-29');
});

test('cümle yalnız tarih bilindiğinde kurulur', () => {
    assert.equal(returnLine(['2026-08-27'], '2026-08-27'), 'Dönüş: Cuma 28 Ağustos');
    assert.equal(returnLine(undefined, '2026-08-27'), null);
});

test('izin günleri BİLİNİYORSA ayak cümlesi dönüş tarihini yazar', () => {
    const person = { ...mockPresence[4], leaveDates: ['2026-08-27', '2026-08-28'] };
    const state = buildStaffDayState(
        person, [], mockPresence, 11 * 60 + 24, 0, 'Kuaför', '2026-08-27',
    );
    assert.equal(state.shift.foot, 'Dönüş: Cumartesi 29 Ağustos');
});

test('H4 · İzinli: krem kart YOK, dönüş tarihi UYDURULMAZ, kesik vardiya çubuğu, birincil Ara', () => {
    const state = buildStaffDayState(mockPresence[4], [], mockPresence, 11 * 60 + 24);
    assert.equal(state.kind, 'leave');
    assert.equal(state.stampText, 'İZİNLİ');
    assert.equal(state.stampTone, 'am');
    assert.equal(state.panel, null); // Krem kart YOK
    assert.ok(state.shift);
    assert.equal(state.shift.dash, true); // Kesik çizgi
    assert.equal(state.shift.right, 'bugün yok');
    // Liste bilinmiyor: cümle uydurulmaz, eksiğin ne olduğu yazılır.
    assert.equal(state.shift.foot, 'Dönüş tarihi için izin kaydı gerekiyor.');
    assert.match(state.emptyNote, /Gül bugün salonda değil/);
    assert.match(state.emptyNote, /Bugün randevu yazılamaz/);
    assert.equal(state.primaryAction.label, 'Ara');
    assert.equal(state.primaryAction.filled, true);
    assert.equal(state.ghostAction.label, 'Müsait personeli gör');
});

test('H5 · Çalışmıyor: krem kart YOK, damga GRİ, kesik vardiya çubuğu, ölü buton yok', () => {
    const state = buildStaffDayState(mockPresence[5], [], mockPresence, 11 * 60 + 24);
    assert.equal(state.kind, 'off');
    assert.equal(state.stampText, 'BUGÜN ÇALIŞMIYOR');
    assert.equal(state.stampTone, 'non'); // Gri damga
    assert.equal(state.panel, null); // Krem kart YOK
    assert.ok(state.shift);
    assert.equal(state.shift.dash, true);
    assert.equal(state.shift.right, 'planda yok');
    assert.match(state.emptyNote, /Vardiya planında bugün yok/);
    // Kaan'ın numarası yok: "Ara" da çizilmez. Ölü düğme yerine hiç düğme.
    assert.equal(state.primaryAction, null);
    assert.equal(state.secondaryAction, null);
    assert.equal(state.ghostAction, null);
});

test('H6 · Gün bitti: CİRO YOK, tamamlananlar soluk, gelmedi tam mürekkep, birincil Yarına randevu ver', () => {
    const closedAppointments = [
        { id: 'c1', customer_id: 'x1', customer_name: 'Elif Demir', date: '2026-08-13', start_time: '10:30', end_time: '11:15', service: 'Keratin bakımı', status: 'completed', staff_id: 'selin', notes: null, arrived_at: '10:30', service_ended_at: '11:15', info: null },
        { id: 'c2', customer_id: 'x2', customer_name: 'Nur Aksoy', date: '2026-08-13', start_time: '13:00', end_time: '13:20', service: 'Kaş alma', status: 'completed', staff_id: 'selin', notes: null, arrived_at: '13:00', service_ended_at: '13:20', info: null },
        { id: 'c3', customer_id: 'x3', customer_name: 'Hakan Toprak', date: '2026-08-13', start_time: '15:00', end_time: '15:30', service: 'Kesim', status: 'confirmed', staff_id: 'selin', notes: null, arrived_at: null, service_ended_at: null, info: null },
        { id: 'c4', customer_id: 'x4', customer_name: 'Ayşe Yılmaz', date: '2026-08-13', start_time: '17:30', end_time: '18:00', service: 'Fön', status: 'completed', staff_id: 'selin', notes: null, arrived_at: '17:30', service_ended_at: '18:00', info: null },
    ];

    const state = buildStaffDayState({ id: 'selin', initials: 'SD', name: 'Selin Demir', state: 'free' }, closedAppointments, mockPresence, 19 * 60 + 48);
    assert.equal(state.kind, 'ended');
    assert.equal(state.stampText, 'GÜNÜN SONU');
    assert.equal(state.isDayEnded, true);
    assert.ok(state.panel);
    assert.equal(state.panel.label, 'BUGÜN');
    assert.equal(state.panel.heroValue, '4');
    assert.equal(state.panel.subText, '3 tamamlandı · 1 gelmedi');
    assert.doesNotMatch(state.panel.subText, /₺|ciro/i);
    assert.equal(state.listTitle, 'Bugün · kapandı');
    assert.equal(state.primaryAction.label, 'Yarına randevu ver');
});

// ── Jetonlar ve Ölçüler ─────────────────────────────────────────────────────

test('staffDayMetrics jetonları CSS tasarım ölçüleriyle birebirdir', () => {
    assert.equal(staffDayMetrics.topBarHeight, 52);
    assert.equal(staffDayMetrics.railHeight, 46);
    assert.equal(staffDayMetrics.ringSize, 76);
    assert.equal(staffDayMetrics.panelHeight, 92);
    assert.equal(staffDayMetrics.panelRadius, 18);
    assert.equal(staffDayMetrics.stampHeight, 28);
    assert.equal(staffDayMetrics.hapHeight, 40);
    assert.equal(staffDayMetrics.fadeOpacity, 0.52);
});

test('staffDayMotion 4 hareket anının süre ve eğrilerini taşır', () => {
    assert.equal(staffDayMotion.enter.stripOut, 160);
    assert.equal(staffDayMotion.enter.ringIn, 220);
    assert.equal(staffDayMotion.enter.ringDelay, 60);
    assert.equal(staffDayMotion.enter.ringScaleFrom, 0.684);
    assert.equal(staffDayMotion.swap.out, 160);
    assert.equal(staffDayMotion.swap.in, 220);
    assert.deepEqual(staffDayMotion.empty.steps, [60, 120, 180]);
});

// ── Sözleşme ve Kod Denetimleri ─────────────────────────────────────────────

test('üst çubukta YALNIZ geri düğmesi var — ad ve rol kahraman blokta', () => {
    assert.doesNotMatch(partsComponent, /randevu sayısı|bugün \d+ randevu/i);
    assert.match(partsComponent, /function StaffTopBar/);
    const bar = partsComponent.slice(
        partsComponent.indexOf('function StaffTopBar'),
        partsComponent.indexOf('export function StaffRail'),
    );
    // Aynı kimlik iki kere okunmaz.
    assert.doesNotMatch(bar, /\{name\}|\{role\}/);
    assert.match(bar, /accessibilityLabel="Geri"/);
});

test('personeller arası yatay sayfalama: pagingEnabled ScrollView kullanır', () => {
    assert.match(staffDayComponent, /<ScrollView[\s\S]*?horizontal[\s\S]*?pagingEnabled/);
    assert.match(staffDayComponent, /StaffRail/);
});

test('gesture-handler ve reanimated kullanılmaz, yalnız RN Animated kullanılır', () => {
    assert.doesNotMatch(staffDayComponent, /react-native-gesture-handler|react-native-reanimated|LayoutAnimation/);
    assert.doesNotMatch(partsComponent, /react-native-gesture-handler|react-native-reanimated|LayoutAnimation/);
    assert.doesNotMatch(screenCode, /react-native-gesture-handler|react-native-reanimated|LayoutAnimation/);
});

test('tüm animasyonlar useNativeDriver: true kullanır', () => {
    assert.doesNotMatch(staffDayComponent, /useNativeDriver:\s*false/);
    assert.doesNotMatch(partsComponent, /useNativeDriver:\s*false/);
    assert.match(staffDayComponent, /useNativeDriver:\s*true/);
    assert.match(partsComponent, /useNativeDriver:\s*true/);
});

test('canlı sayaç komşu sayfalarda durur (yalnız isActive sayfada işler)', () => {
    assert.match(staffDayComponent, /if \(!isActive \|\| person\.state !== 'busy'\) return;/);
});

test('ekran sekme grubunun DIŞINDADIR', () => {
    const exists = (path) => {
        try { readFileSync(new URL(`../mobile/${path}`, import.meta.url)); return true; }
        catch { return false; }
    };
    assert.ok(exists('app/(manager-flow)/personel/[id].tsx'), 'yeni yolda değil');
    assert.ok(!exists('app/(manager)/staff/[id].tsx'), 'hâlâ sekme grubunun içinde');
});

test('şeritten avatara dokununca personelin günü açılır', () => {
    assert.match(flow, /const openStaff = \(staffId: string\) => router\.push\(`\/personel\/\$\{staffId\}`\)/);
});

test('hareket sözleşmesi: staffDayMotion süre ve eğrileri tasarımla birebir', () => {
    assert.equal(staffDayMotion.enter.stripOut, 160);
    assert.equal(staffDayMotion.enter.ringIn, 220);
    assert.equal(staffDayMotion.enter.ringDelay, 60);
    assert.equal(staffDayMotion.enter.ringScaleFrom, 0.684);
    assert.equal(staffDayMotion.enter.panelRise, 10);
    assert.equal(staffDayMotion.enter.listDelay, 180);
    assert.equal(staffDayMotion.page.railOut, 160);
    assert.equal(staffDayMotion.page.railIn, 220);
    assert.equal(staffDayMotion.swap.out, 160);
    assert.equal(staffDayMotion.swap.outShift, -6);
    assert.equal(staffDayMotion.swap.badgeScale, 0.9);
    assert.equal(staffDayMotion.swap.in, 220);
    assert.equal(staffDayMotion.swap.inDelay, 60);
    assert.equal(staffDayMotion.swap.inShift, 8);
    assert.equal(staffDayMotion.empty.duration, 220);
    assert.equal(staffDayMotion.empty.rise, 8);
    assert.deepEqual(staffDayMotion.empty.steps, [60, 120, 180]);
    assert.deepEqual([...staffDayMotion.outCurve], [0.4, 0, 1, 1]);
    assert.deepEqual([...staffDayMotion.inCurve], [0.2, 0.8, 0.25, 1]);
});

test('hareket sözleşmesi: useNativeDriver false yok, reduceMotion dalı var', () => {
    assert.doesNotMatch(staffDayComponent, /useNativeDriver:\s*false/);
    assert.doesNotMatch(partsComponent, /useNativeDriver:\s*false/);
    assert.match(staffDayComponent, /useNativeDriver:\s*true/);
    assert.match(partsComponent, /useNativeDriver:\s*true/);
    assert.match(staffDayComponent, /reduceMotion/);
    assert.match(partsComponent, /if \(reduceMotion\)/);
    assert.match(partsComponent, /Animated\.divide/);
    assert.match(partsComponent, /\.interpolate\(/);
    assert.doesNotMatch(staffDayComponent, /LayoutAnimation/);
    assert.doesNotMatch(partsComponent, /LayoutAnimation/);
});

// ── Dürüstlük kapıları ───────────────────────────────────────────────────────

test('iptal "gelmedi" sayılmaz — iptali müdür yazar, gelmemeyi müşteri yapar', () => {
    const base = {
        customer_id: null, date: '2026-08-13', service: 'Kesim', staff_id: 'selin',
        notes: null, arrived_at: null, service_ended_at: null, info: null,
    };
    const closed = [
        { ...base, id: 'a', customer_name: 'A', start_time: '10:00', end_time: '10:30', status: 'completed', arrived_at: '10:00', service_ended_at: '10:30' },
        { ...base, id: 'b', customer_name: 'B', start_time: '11:00', end_time: '11:30', status: 'cancelled' },
        { ...base, id: 'c', customer_name: 'C', start_time: '12:00', end_time: '12:30', status: 'confirmed' },
    ];
    const state = buildStaffDayState(
        { id: 'selin', initials: 'SD', name: 'Selin Demir', state: 'free' },
        closed, mockPresence, 19 * 60 + 48,
    );
    assert.equal(state.kind, 'ended');
    // Yalnız C gelmedi: B iptal, A tamamlandı.
    assert.equal(state.panel.subText, '1 tamamlandı · 1 gelmedi');
});

test('şerit "işlemde" derken randevu yüklenmemişse müşteri UYDURULMAZ', () => {
    const state = buildStaffDayState(
        { id: 'deniz', initials: 'DA', name: 'Deniz Arslan', state: 'busy', minutes: 12 },
        [], mockPresence, 11 * 60 + 24, 12 * 60,
    );
    assert.equal(state.kind, 'running');
    // Sayaç gerçek, bağlam satırı yok — sahte isim/hizmet/bitiş saati yazılmaz.
    assert.equal(state.panel.subText, null);
    const body = JSON.stringify(state);
    assert.ok(!/Ayşe Yılmaz|Saç boyama|12:13/.test(body));
});

test('durum değişimi hareketi zamanlayıcıyla sahte tetiklenmez', () => {
    const screen = code('src/components/StaffDay.tsx');
    assert.ok(!/demoFree|demoAfter/.test(screen));
    // Hareket gerçek kind değişiminden doğar.
    assert.ok(/useStaffKindSwap\(dayState/.test(screen));
});

test('krem kartın bağlam satırı boşsa hiç çizilmez', () => {
    const parts = code('src/components/StaffDayParts.tsx');
    assert.ok(/\{panel\.subText \? \(/.test(parts));
});

test('büyük harfe çevirme metin katmanında kalır — textTransform yok', () => {
    assert.ok(!/textTransform/.test(read('src/components/StaffDay.tsx')));
    assert.ok(!/textTransform/.test(read('src/components/StaffDayParts.tsx')));
});

// ── Eylemler: kişi üzerinden ve gerçekten çalışır ────────────────────────────

test('"Yarına randevu ver" ile "Randevu ver" AYRI eylem kodları taşır', () => {
    const busy = buildStaffDayState(mockPresence[0], mockAppointments, mockPresence, 11 * 60 + 24);
    assert.equal(busy.primaryAction.action, 'book-today');

    const closed = [{
        id: 'z1', customer_id: null, customer_name: 'A', date: '2026-08-13',
        start_time: '10:00', end_time: '10:30', service: 'Kesim', status: 'completed',
        staff_id: 'selin', notes: null, arrived_at: '10:00', service_ended_at: '10:30', info: null,
    }];
    // Ece: state 'free' — gün bitmiş sayılabilsin diye (busy olan H1'de kalır).
    const ended = buildStaffDayState(mockPresence[3], closed, mockPresence, 19 * 60 + 48);
    assert.equal(ended.primaryAction.label, 'Yarına randevu ver');
    assert.equal(ended.primaryAction.action, 'book-tomorrow');
});

test('eylem ETİKETE göre dallanmaz — kod okunur', () => {
    const screen = code('src/components/StaffDay.tsx');
    assert.ok(!/primaryAction\?\.label/.test(screen));
    assert.ok(/runAction\(dayState\.primaryAction\?\.action\)/.test(screen));
    assert.ok(/action === 'book-tomorrow'/.test(screen));
});

test('randevu akışına doğru parametreler gider: staff + date', () => {
    const route = code('app/(manager-flow)/personel/[id].tsx');
    // `staffId` diye gönderilirse akış ön dolgusu sessizce boş kalır.
    assert.ok(!/params: \{ staffId \}/.test(route));
    assert.ok(/staff: staffId/.test(route));
    assert.ok(/date: dateISO/.test(route));
});

test('uydurma telefon numarası çevrilmez', () => {
    const screen = code('src/components/StaffDay.tsx');
    assert.ok(!/tel:\+?9?0?5\d{9}/.test(screen));
    assert.ok(/person\.phone/.test(screen));
});

test('numarası olmayan personelde "Ara" düğmesi hiç çizilmez', () => {
    const noPhone = { id: 'x', initials: 'XX', name: 'İsimsiz Kişi', state: 'free' };
    const state = buildStaffDayState(noPhone, mockAppointments.slice(0, 1), mockPresence, 11 * 60 + 24);
    assert.equal(state.secondaryAction, null);

    const withPhone = { ...noPhone, phone: '0532 118 24 10' };
    const state2 = buildStaffDayState(withPhone, mockAppointments.slice(0, 1), mockPresence, 11 * 60 + 24);
    assert.equal(state2.secondaryAction.label, 'Ara');
    assert.equal(state2.secondaryAction.action, 'call');
});

// ── 1. hareket anı: halkadan sayfaya ────────────────────────────────────────

test('personel günü yığın kaydırmasıyla AÇILMAZ — halka büyümesi görünsün', () => {
    const layout = code('app/_layout.tsx');
    assert.match(layout, /personel\/\[id\][\s\S]{0,80}animation: 'none'/);
});

test('şerit dokunulunca sönerek büyür, sonra sayfa açılır', () => {
    const parts = code('src/components/FlowParts.tsx');
    assert.ok(/staffDayMotion\.enter\.stripOut/.test(parts));
    assert.ok(/staffDayMotion\.enter\.stripScale/.test(parts));
    // Önce hareket, SONRA gezinme.
    assert.match(parts, /\}\)\.start\(\(\) => \{\s*onOpen\(id\);/);
    // Ve şerit hemen dinlenme hâline alınır: geri dönüşte çift çakma olmasın.
    assert.match(parts, /onOpen\(id\);\s*exit\.setValue\(1\);/);
});

// ── Tasarımla görsel denklik ────────────────────────────────────────────────

test('üst parıltı çizilir — tasarımdaki 120 pt .grad', () => {
    const screen = code('src/components/StaffDay.tsx');
    assert.ok(/staffDayGlow/.test(screen));
    assert.equal(staffDayGlow.height, 120);
    assert.equal(staffDayGlow.colors[0], 'rgba(255,90,31,0.10)');
});

test('satırda hizmet süresi yazar: "Kesim + fön · 60 dk"', () => {
    const parts = code('src/components/StaffDayParts.tsx');
    assert.match(parts, /\$\{appointment\.service\} · \$\{minutes\} dk/);
});

test('satır rozeti iptali "gelmedi" göstermez', () => {
    const parts = code('src/components/StaffDayParts.tsx');
    assert.match(parts, /status === 'cancelled'\)\s*\{\s*miniStamp = \{ label: 'iptal'/);
});

test('artı simgesi ÇEMBER içinde — tasarımdaki .ico.plus', () => {
    const parts = read('src/components/StaffDayParts.tsx');
    const icon = parts.slice(parts.indexOf('function ActionIcon'));
    assert.match(icon.slice(0, 600), /<Circle/);
});

test('üst parıltı durum çubuğunun ARDINA uzar — çentikte siyah şerit kalmaz', () => {
    const screen = code('src/components/StaffDay.tsx');
    assert.match(screen, /height: staffDayGlow\.height \+ insets\.top/);
    // Güvenli alan boşluğu ekranın kabında DEĞİL, üst çubuğun kendisinde.
    const route = code('app/(manager-flow)/personel/[id].tsx');
    assert.ok(!/paddingTop: insets\.top/.test(route));
    assert.match(screen, /topInset=\{insets\.top\}/);
});

test('"gelmedi" türetimi WEB ile birebir — aynı müşteri iki yüzeyde ayrışmaz', () => {
    const base = {
        id: 'n1', customer_id: null, customer_name: 'A', date: '2026-08-13',
        start_time: '10:00', end_time: '10:30', service: 'Kesim', staff_id: 'selin',
        status: 'confirmed', notes: null, arrived_at: null,
        customer_arrived_at: null, service_ended_at: null, info: null,
    };
    // Randevu saati + tolerans (120 dk) geçmeden gelmemiş sayılmaz.
    assert.equal(isNoShow(base, 11 * 60), false);
    assert.equal(isNoShow(base, 12 * 60 + 1), true);

    // MÜŞTERİ SALONA GELDİYSE asla gelmemiş sayılmaz — koltuktaki müşteri
    // yanlış damgalanmasın.
    assert.equal(isNoShow({ ...base, customer_arrived_at: '10:05' }, 14 * 60), false);
    // Onay bekleyen randevu da gelmemiş sayılmaz.
    assert.equal(isNoShow({ ...base, status: 'pending' }, 14 * 60), false);
    // İptal ayrı bir şeydir.
    assert.equal(isNoShow({ ...base, status: 'cancelled' }, 14 * 60), false);

    // Tolerans salon ayarından gelir.
    assert.equal(DEFAULT_ARRIVAL_TOLERANCE_MIN, 120);
    assert.equal(isNoShow(base, 10 * 60 + 31, 30), true);
});

test('personelin gününden randevu verilince O PERSONEL sabitlenir', () => {
    // Müdür oraya "kim yapacak" diye değil, "Merve'ye iş vereyim" diye gelir:
    // saat sorulmaya devam eder ama seçenekler o kişiyle sınırlıdır.
    const onlyStaff = emptyDraft({ dateISO: '2026-08-13', staffId: 'merve' });
    assert.equal(onlyStaff.staffId, 'merve');
    assert.ok(onlyStaff.locked.includes('staff'));
    assert.ok(!onlyStaff.locked.includes('slot'));
    // Saat de geldiyse adım tamamen kapanır.
    const both = emptyDraft({ dateISO: '2026-08-13', staffId: 'merve', startMinutes: 600 });
    assert.ok(both.locked.includes('slot'));
    assert.equal(both.startMinutes, 600);
    // Personel gelmediyse hiçbiri kilitlenmez.
    const neither = emptyDraft({ dateISO: '2026-08-13' });
    assert.equal(neither.staffId, null);
    assert.ok(!neither.locked.includes('staff'));

    const flow = code('src/components/CreateFlow.tsx');
    assert.match(flow, /locked\.includes\('slot'\) \|\| draft\.locked\.includes\('staff'\)/);
    // Sabit personel çevrilemez.
    assert.match(flow, /if \(draft\.locked\.includes\('staff'\) \|\| draft\.locked\.includes\('slot'\)\) return;/);
});
