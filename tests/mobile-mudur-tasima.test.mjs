import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    DIM_OPACITY, LIFT_SCALE, LONG_PRESS_MS, MOVE_HINT, MOVE_SNAP,
    applyMove, columnShift, conflictAt, conflictReason, durationOf, menuRows,
    menuSubtitle, moveBanner, moveResultCopy, resolveTarget, snapStart,
    targetLabel, undoMove, weekdayOf, UNDO_MS,
} from '../mobile/src/lib/moveAppointment.ts';
import { destructiveOptions } from '../mobile/src/lib/appointmentDetail.ts';
import { slotRows } from '../mobile/src/lib/createFlow.ts';
import { COLUMN_GAP, COLUMN_WIDTH, HOUR_HEIGHT } from '../mobile/src/lib/managerCalendar.ts';

// Müdür 07 — randevuyu taşıma.
//
// Bu dosyanın koruduğu şey: SESSİZCE ÜST ÜSTE BİNDİRME YOK. Hedef doluysa
// blok oraya yerleşmez ve alt bant sebebini yazar. Bir de iki yolun (sürükleme
// ve menü) aynı hedef çözümleyicisini kullanması.

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

const grid = code('src/components/ColumnCalendar.tsx');
const parts = code('src/components/MoveParts.tsx');
const calendar = code('app/mudur/calendar.tsx');
const staffDay = code('src/components/StaffDay.tsx');
const detail = code('app/(manager-flow)/randevu/[id].tsx');

const appt = (id, start, end, staffId, status = 'confirmed') => ({
    id, customer_id: null, customer_name: 'Elif Demir', customer_phone: null,
    date: '2026-08-13', start_time: start, end_time: end, service: 'Keratin bakımı',
    service_color: null, status, staff_id: staffId, notes: null,
    arrived_at: null, service_ended_at: null,
});

const staff = [
    { id: 'merve', initials: 'MK', name: 'Merve' },
    { id: 'selin', initials: 'SD', name: 'Selin' },
    { id: 'deniz', initials: 'DA', name: 'Deniz' },
];

const DAY_START = 9 * 60;
const DAY_END = 20 * 60;
const PITCH = COLUMN_WIDTH + COLUMN_GAP;

const target = (moving, others, dx, dy, fromIndex = 1) => resolveTarget({
    appointment: moving,
    appointments: [moving, ...others],
    staff,
    fromIndex,
    dx,
    dy,
    dayStartMinutes: DAY_START,
    dayEndMinutes: DAY_END,
});

// ── Kaldırma ────────────────────────────────────────────────────────────────

test('basılı tutma 250 ms; kısa dokunuş detaya gider', () => {
    assert.equal(LONG_PRESS_MS, 250);
    assert.match(grid, /delayLongPress=\{LONG_PRESS_MS\}/);
    // İki hareket birbirine karışmıyor: kısa dokunuş kendi eylemini çağırıyor.
    // `onLift?.` — çağrı isteğe bağlı hâle geldi çünkü personel takvimi aynı
    // ızgarayı SALT OKUNUR kullanıyor: orada kaldıracak bir el yok. Müdür
    // tarafında davranış birebir aynı.
    assert.match(grid, /onLongPress=\{\(\) => \{ dragging\.current = false; onLift\?\.\(appointment, index\); \}\}/);
    assert.match(grid, /onPress=\{\(\) => \{ feedback\.selection\(\); onPress\(\); \}\}/);
});

test('kalkan blok büyür, diğerleri geri çekilir', () => {
    assert.equal(LIFT_SCALE, 1.04);
    assert.equal(DIM_OPACITY, 0.45);
    assert.match(grid, /scale: LIFT_SCALE/);
    assert.match(grid, /dimmed \? DIM_OPACITY : 1/);
});

test('blok kalkınca iki kaydırıcı da kilitlenir', () => {
    // Yoksa parmak hem bloğu hem sayfayı çekerdi.
    assert.equal(grid.match(/scrollEnabled=\{!lifted\}/g)?.length, 2);
});

test('titreşim var ama tek başına anlam taşımıyor', () => {
    assert.match(grid, /feedback\.medium\(\)/);
    // Ekranda ayrıca görsel karşılık: kalkan blok ve alt bant.
    assert.match(grid, /MoveBanner/);
});

// ── Hedef çözümleme ─────────────────────────────────────────────────────────

test('dikey taşıma saati değiştirir', () => {
    const moving = appt('m', '12:00', '12:45', 'selin');
    // Bir saat aşağı.
    const t = target(moving, [], 0, HOUR_HEIGHT);
    assert.equal(t.startMinutes, 13 * 60);
    assert.equal(t.endMinutes, 13 * 60 + 45);
    assert.equal(t.staffId, 'selin');
    assert.ok(t.valid);
});

test('yatay taşıma personeli değiştirir', () => {
    const moving = appt('m', '12:00', '12:45', 'selin');
    const t = target(moving, [], PITCH, 0);
    assert.equal(t.staffId, 'deniz');
    assert.equal(t.startMinutes, 12 * 60);
    assert.equal(columnShift(PITCH), 1);
});

test('ikisi aynı harekette olabilir', () => {
    const moving = appt('m', '12:00', '12:45', 'selin');
    const t = target(moving, [], PITCH, HOUR_HEIGHT * 1.5);
    assert.equal(t.staffId, 'deniz');
    assert.equal(t.startMinutes, 13 * 60 + 30);
    assert.equal(targetLabel(t), '13:30 · Deniz');
});

test('saat 15 dakikalık ızgaraya oturur', () => {
    assert.equal(MOVE_SNAP, 15);
    assert.equal(snapStart(12 * 60 + 7, DAY_START, DAY_END, 45), 12 * 60);
    assert.equal(snapStart(12 * 60 + 8, DAY_START, DAY_END, 45), 12 * 60 + 15);
});

test('gün dışına taşınamaz', () => {
    assert.equal(snapStart(4 * 60, DAY_START, DAY_END, 45), DAY_START);
    // Randevunun SONU da günün içinde kalmalı.
    assert.equal(snapStart(23 * 60, DAY_START, DAY_END, 45), DAY_END - 45);
});

test('sütun dışına taşınamaz', () => {
    const moving = appt('m', '12:00', '12:45', 'merve');
    assert.equal(target(moving, [], -10 * PITCH, 0, 0).staffId, 'merve');
    assert.equal(target(moving, [], 10 * PITCH, 0, 0).staffId, 'deniz');
});

// ── Doluluk ─────────────────────────────────────────────────────────────────

test('hedef doluysa geçersiz ve SEBEBİ yazılı', () => {
    const moving = appt('m', '12:00', '12:45', 'selin');
    const blocking = appt('b', '13:00', '14:30', 'deniz');
    const t = target(moving, [blocking], PITCH, HOUR_HEIGHT * 1.5);

    assert.equal(t.valid, false);
    assert.equal(t.reason, 'Deniz · 13:00–14:30');
    // "Dolu" tek başına cevap değil.
    assert.equal(moveBanner(moving, t).text, 'Bu saat dolu: Deniz · 13:00–14:30');
    assert.equal(moveBanner(moving, t).tone, 'red');
});

test('geçersiz hedef vurgulanmaz: vurgu bir söz veriyor', () => {
    assert.match(grid, /target && target\.valid && !target\.unchanged/);
});

test('geçersiz hedefe bırakmak hiçbir şey yapmaz', () => {
    assert.match(grid, /!landing\.valid \|\| landing\.unchanged/);
    assert.match(grid, /onMove\?\.\(current\.appointment, landing\)/);
});

test('randevu kendine engel değildir', () => {
    const moving = appt('m', '12:00', '12:45', 'selin');
    // Aynı yere bırakmak: dolu değil, sadece değişmemiş.
    const t = target(moving, [], 0, 0);
    assert.ok(t.valid);
    assert.ok(t.unchanged);
    assert.equal(conflictAt([moving], 'selin', 12 * 60, 12 * 60 + 45, 'm'), null);
});

test('iptal edilmiş randevu yer tutmaz', () => {
    const moving = appt('m', '12:00', '12:45', 'selin');
    const cancelled = appt('b', '13:00', '14:30', 'deniz', 'cancelled');
    assert.ok(target(moving, [cancelled], PITCH, HOUR_HEIGHT * 1.5).valid);
});

test('doluluk sebebi tek biçimde yazılır', () => {
    assert.equal(conflictReason(appt('b', '13:00', '14:30', 'deniz'), 'Deniz'), 'Deniz · 13:00–14:30');
});

// ── Alt bant ────────────────────────────────────────────────────────────────

test('alt bant her an ne olacağını yazar', () => {
    const moving = appt('m', '12:00', '12:45', 'selin');

    // Kalktı ama kımıldamadı.
    assert.deepEqual(moveBanner(moving, null), { text: MOVE_HINT, tone: 'neutral' });
    assert.match(MOVE_HINT, /Parmağınızı kaldırmadan/);
    assert.deepEqual(moveBanner(moving, target(moving, [], 0, 0)), { text: MOVE_HINT, tone: 'neutral' });

    // Geçerli hedef.
    const ok = moveBanner(moving, target(moving, [], PITCH, HOUR_HEIGHT * 1.5));
    assert.equal(ok.tone, 'orange');
    assert.equal(ok.text, 'Elif Demir · Keratin bakımı → 13:30 · Deniz. Bırakın, taşıyalım.');
});

// ── Taşımanın kendisi ───────────────────────────────────────────────────────

test('taşıma süreyi korur', () => {
    const moving = appt('m', '12:00', '12:45', 'selin');
    const moved = applyMove(moving, target(moving, [], PITCH, HOUR_HEIGHT * 1.5));
    assert.equal(moved.start_time, '13:30');
    assert.equal(moved.end_time, '14:15');
    assert.equal(moved.staff_id, 'deniz');
    assert.equal(durationOf(moved), durationOf(moving));
});

// ── Müdür 07c — menü ────────────────────────────────────────────────────────

test('menü: sık ve zararsız üstte, geri alınamaz en altta', () => {
    const rows = menuRows(appt('m', '12:00', '12:45', 'selin'), 'Selin');
    assert.deepEqual(rows.map((row) => row.action), ['time', 'staff', 'detail', 'cancel', 'delete']);
    // Geri alınamaz olan AYRI durur.
    assert.equal(rows.find((row) => row.action === 'cancel').separated, true);
    assert.equal(rows.at(-1).danger, true);
});

test('"Şu an: Selin" — müdürün hafızasına güvenilmiyor', () => {
    const rows = menuRows(appt('m', '12:00', '12:45', 'selin'), 'Selin');
    assert.equal(rows[1].value, 'Şu an: Selin');
    assert.equal(rows[0].value, 'Aynı gün veya başka gün');
});

test('iptal/silme metinleri tek kaynaktan', () => {
    // Aynı cümleyi iki yerde yazmak, ikisinin ayrışması demekti.
    const rows = menuRows(appt('m', '12:00', '12:45', 'selin'), 'Selin');
    for (const option of destructiveOptions) {
        assert.equal(rows.find((row) => row.action === option.action).value, option.body);
    }
});

test('zaten iptal edilmiş randevuya "iptal et" sunulmaz', () => {
    const rows = menuRows(appt('m', '12:00', '12:45', 'selin', 'cancelled'), 'Selin');
    assert.ok(!rows.some((row) => row.action === 'cancel'));
    assert.equal(rows.at(-1).separated, true, 'silme yine ayrı durmalı');
});

test('menü başlığı randevuyu tarif eder', () => {
    assert.equal(
        menuSubtitle(appt('m', '12:00', '12:45', 'selin'), 'Selin'),
        'Keratin bakımı · 45 dk · Perşembe 12:00 · Selin ile',
    );
    assert.equal(weekdayOf('2026-08-14'), 'Cuma');
});

test('menüden taşıma boş saatleri Müdür 09 ile aynı hesaptan alır', () => {
    // İki ekranda farklı "boş" tanımı olamaz.
    assert.match(parts, /slotRows\(\{/);
    assert.match(parts, /excludeId: appointment\.id/);
});

test('taşınan randevu kendi yerini dolu saymaz', () => {
    const moving = appt('m', '12:00', '12:45', 'selin');
    const rows = slotRows({
        appointments: [moving],
        staff: [{ id: 'selin', initials: 'SD', name: 'Selin', available: true }],
        durationMinutes: 45,
        onlyStaffId: 'selin',
        excludeId: 'm',
    });
    assert.equal(rows.find((row) => row.minutes === 12 * 60).kind, 'free');
});

// ── Müdür 07d — sonuç ───────────────────────────────────────────────────────

test('taşıma sonucu hareketi gösterir; “Evet, yaz” KALKTI', () => {
    const moving = appt('m', '12:00', '12:45', 'selin');
    const copy = moveResultCopy({
        appointment: moving,
        fromStartMinutes: 12 * 60,
        fromStaffName: 'Selin',
        toStartMinutes: 13 * 60 + 30,
        toStaffName: 'Deniz',
    });

    assert.equal(copy.badge, 'taşındı');
    assert.equal(copy.tone, 'ok');
    // Taşıma ZATEN OLDU: "emin misin", "onayla", "vazgeç" yok.
    assert.ok(!/emin|onayla|vazgeç/i.test(copy.undo + copy.call + copy.done));
    // Değişim ESKİ → YENİ olarak okunur; tek bir "yeni saat" değil.
    assert.equal(copy.fromTime, '12:00');
    assert.equal(copy.fromLabel, 'Selin');
    assert.equal(copy.toTime, '13:30');
    assert.equal(copy.toLabel, 'Deniz');
    assert.equal(copy.given, 'Elif');
    assert.equal(copy.family, 'Demir');
    assert.equal(copy.sub, 'Keratin bakımı · 45 dk');
    assert.equal(copy.undo, 'Geri al');
    assert.equal(copy.call, 'Müşteriyi ara');
    assert.equal(copy.done, 'Tamam');
    // Mesaj vaadi YOK: uygulamanın müşteriye yazacak kanalı yok.
    assert.ok(!/yaz|haber|bildir|mesaj/i.test(
        copy.badge + copy.sub + copy.undo + copy.call + copy.done,
    ));
});

test('geçmiş saate düşen taşıma UYARIR, engellemez', () => {
    const moving = appt('m', '12:00', '12:45', 'selin');
    const copy = moveResultCopy({
        appointment: moving,
        fromStartMinutes: 12 * 60,
        fromStaffName: 'Selin',
        toStartMinutes: 8 * 60 + 30,
        toStaffName: 'Merve',
    }, 12 * 60 + 4);

    assert.equal(copy.badge, 'taşındı · geçmiş saate');
    assert.equal(copy.tone, 'warn');
    // Ne olduğunu değil, müdürün NEREDE arayacağını söyler.
    assert.match(copy.sub, /geçmişte görünecek/);
});

test('şimdi verilmezse geçmiş uyarısı UYDURULMAZ', () => {
    const copy = moveResultCopy({
        appointment: appt('m', '12:00', '12:45', 'selin'),
        fromStartMinutes: 12 * 60,
        fromStaffName: 'Selin',
        toStartMinutes: 8 * 60,
        toStaffName: 'Merve',
    });
    assert.equal(copy.tone, 'ok');
});

test('geri al randevuyu eski saatine döndürür', () => {
    const moving = appt('m', '13:30', '14:15', 'selin');
    const back = undoMove({
        appointment: moving,
        fromStartMinutes: 12 * 60,
        fromStaffName: 'Selin',
        toStartMinutes: 13 * 60 + 30,
        toStaffName: 'Deniz',
    });
    assert.equal(back.start_time, '12:00:00');
    assert.equal(back.end_time, '12:45:00');
});

test('geri al’ın ömrü 8 saniye ve sheet KENDİLİĞİNDEN KAPANMAZ', () => {
    assert.equal(UNDO_MS, 8000);
    // Kapanan sheet hem "ne oldu" bilgisini hem "Müşteriyi ara"yı götürürdü.
    assert.ok(!/onDone\(\)[^)]*setTimeout/.test(parts));
});

// ── Ekranlar ────────────────────────────────────────────────────────────────

test('iki yol da aynı taşımaya düşer', () => {
    // Sürükleme hızlı yol, menü güvenilir yol; ikisi de `applyMove`.
    assert.match(calendar, /onMove=\{\(appointment, target\) => \{ void commitMove\(appointment, target\); \}\}/);
    assert.match(calendar, /applyMove\(appointment, target\)/);
    assert.match(calendar, /commitMove\(appointment, target\)/);
});

test('aynı yere "taşımak" sonuç ekranı açmaz', () => {
    for (const file of [calendar, staffDay, detail]) {
        assert.match(file, /if \(!target\.unchanged\)/);
    }
});

test('Müdür 24: taşıma akışları (saat ve personel) seçenekler menüsünden açılır', () => {
    assert.match(staffDay, /setMoveFor\(\{\s*appointment,\s*mode:\s*action\s*\}\)/);
    assert.match(staffDay, /<MoveSheet[\s\S]*?mode=\{moveFor\.mode\}/);
    assert.match(staffDay, /<MoveResultSheet/);
});

test('detaydaki jetonlar taşımayı açar', () => {
    // Müdür 25: "Saati değiştir" ve "Personeli değiştir" artık satır değil
    // jeton; ikisi de aynı güvenilir taşıma yoluna düşüyor.
    assert.match(detail, /onMove=\{\(mode\) => setMoveMode\(mode\)\}/);
    assert.ok(!/onChange=\{\(\) => undefined\}/.test(detail));
});

test('taşıma YAZILMADAN sonuç ekranı açılmıyor', () => {
    /*
     * Asıl kural: müdürün yapılmış sandığı ve aslında yapılmamış bir işlemi
     * olmamalı. Eskiden takvim ve personel günü taşımayı yalnız ekranda
     * yapıyor, sonuç sayfası yine de "taşındı" diyordu.
     *
     * Şimdi üç ekran da sunucunun cevabını bekliyor; reddedilen taşıma sonuç
     * sayfası değil, durum bloğu açıyor.
     */
    assert.ok(!/Kaydedildi|başarıyla/i.test(calendar + parts));
    for (const file of [calendar, staffDay]) {
        assert.match(file, /if \(!ok\) return;/);
    }
    // Ve reddin ekranda bir karşılığı var — sessiz geçmiyor.
    assert.match(calendar, /title=\{\s*\n?\s*refused\.kind === 'stale' \? STALE_TITLE/);
});

test('el değiştirirken taşıma kendi kendini iptal etmiyor', () => {
    // Gerçek hata: sorumluluk `Pressable`'dan `PanResponder`'a geçerken RN
    // önce eskisini sonlandırıyor, `onPressOut` yayılıyor ve "kımıldatmadan
    // bıraktı" sanılıyordu. Bayrak GRANT'ta değil, capture'da kalkmalı.
    assert.match(grid, /if \(!liftedRef\.current\) return false;[\s\S]{0,80}dragging\.current = true;\s*\n\s*return true;/);
    assert.ok(!/onPanResponderGrant/.test(grid), 'bayrak grant’a geri taşınmış');
});

test('alt bant tab bar’ın altında kalmıyor', () => {
    assert.match(grid, /bottom: calendarMetrics\.bottomInset/);
});

test('gövdesi KAYAN sayfa sabit yükseklik ister — liste sıfıra inmesin', () => {
    // SheetBody bir ScrollView ve `flex: 1` kullanıyor. Yüksekliği belirsiz
    // bir kapta `flex: 1` çocuk SIFIR yükseklik alır: ekranda yalnız tutamak
    // ve başlık kalır, saat/personel listesi hiç çizilmez.
    const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
    const strip = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

    const move = strip(read('src/components/MoveParts.tsx'));
    // Uzun liste taşıyan sayfa tam boy; kısa menü içeriği kadar kalır.
    const sheets = move.match(/<BottomSheet[^>]*>/g) ?? [];
    assert.equal(sheets.filter((tag) => tag.includes('fill')).length, 1);

    const shell = strip(read('src/components/Sheet.tsx'));
    assert.match(shell, /fill \? \{ height: '88%' as const \} : null/);
    // Kutuyu uzatmak yetmez: içindeki yüzey de dolmalı, yoksa tepede
    // bir şerit olarak durur.
    assert.match(shell, /fill \? \{ flex: 1 \} : null/);
    // Gövde `flex: 1` DEĞİL: belirsiz yükseklikli kapta sıfıra iner.
    const parts = strip(read('src/components/CreateParts.tsx'));
    const body = parts.slice(parts.indexOf('export function SheetBody'));
    assert.match(body.slice(0, 300), /flexShrink: 1, minHeight: 0/);
    assert.doesNotMatch(body.slice(0, 300), /style=\{\{ flex: 1 \}\}/);
});

// ── Saati değiştir: YALNIZ saat ─────────────────────────────────────────────

test('saat sayfasında gün seçimi YOK — soru "kaçta", "hangi gün" değil', () => {
    /*
     * Sayfada yedi günlük bir şerit vardı ve "Saati değiştir" diyen müdüre
     * önce TARİH soruyordu. Saat değiştirmek isteyen kişi günü değiştirmek
     * istemiyor; şerit şaşırtıyordu. Başka güne taşıma yolu duruyor: takvimde
     * bloğu basılı tutup sürüklemek.
     */
    const move = read('src/components/MoveParts.tsx');
    assert.doesNotMatch(move, /<Kicker label="Gün"/);
    assert.doesNotMatch(move, /setDateISO/);
    // Gün yine de YAZILI: hangi güne baktığı belirsiz kalmasın.
    assert.match(move, /<Kicker label="Boş saatler" right=\{dayLabel/);
});
