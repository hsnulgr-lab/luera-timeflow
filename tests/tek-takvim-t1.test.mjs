/**
 * Tek Kişilik · T1 · TAKVİM — tek sütunlu ızgara (2026-10-13).
 *
 * Telefonda "bu takvim tasarımı çok kaba durmuyor mu": ekran T1'i değil,
 * müdürün 95 pt'lik sütun ölçülerini çiziyordu — ~320 pt'lik blokta köşede
 * 15,5 / 11,5 pt yazı, koyu (bd2) kenarlık, 74 pt saat. Bu dosya T1'in
 * ölçülerini (`Luera Mobil - Tek Kisilik v4.html` · `.cgrid .hr .cb .cnow`)
 * kilitliyor ve ekip takviminin hiçbir ölçüsünün değişmediğini doğruluyor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
    blockLayout, columnize, HOUR_HEIGHT, HOURS_WIDTH, MIN_BLOCK, nowLineTop, soloBlockShape,
} from '../mobile/src/lib/managerCalendar.ts';
import { resolveTarget } from '../mobile/src/lib/moveAppointment.ts';
import { columnMetrics, soloColumnMetrics } from '../mobile/src/theme/tokens.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** Yorumsuz kaynak — iddialar yorumda geçen kelimeye takılmasın. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

const v4 = read('docs/design-reference/Luera Mobil - Tek Kisilik v4.html');
const screens = read('docs/design-reference/tek4-ekranlar.js');
const grid = code('mobile/src/components/ColumnCalendar.tsx');

const appt = (id, start, end, extra = {}) => ({
    id, staff_id: 's1', start_time: `${start}:00`, end_time: `${end}:00`,
    customer_name: 'Elif Demir', service: 'Cilt Bakımı', status: 'confirmed', ...extra,
});
/** Bloğun görünen boyu: T1 `.cb` → `height: cy(e) − cy(t) − 4`. */
const shown = (start, end) => blockLayout(appt('a', start, end), 10 * 60, soloColumnMetrics.hourHeight).height
    - soloColumnMetrics.blockInset * 2;

// ── Ölçüler tasarımın CSS'inden ─────────────────────────────────────────────

test('ızgara: saat 69 pt, ilk çizgi 22 pt aşağıda, saat sütunu 58 pt', () => {
    assert.match(screens, /const cy=t=>\{const\[h,m\]=t\.split\(":"\)\.map\(Number\);return 22\+\(\(h-10\)\*60\+m\)\/60\*69\}/);
    assert.equal(soloColumnMetrics.hourHeight, 69);
    assert.equal(soloColumnMetrics.gridTop, 22);
    assert.ok(v4.includes('.hr i{position:absolute;left:58px;right:18px;top:0;height:1px;background:var(--bd)}'));
    assert.equal(soloColumnMetrics.hoursWidth, 58);
    // Sağ pay ekiptekiyle aynı 18 — sütun genişliği ona göre hesaplanıyor.
    assert.equal(columnMetrics.gridPadRight, 18);
});

test('saat etiketi çizginin 6 pt altında, 14 pt · 500', () => {
    assert.ok(v4.includes('.hr b{position:absolute;left:17px;top:6px;font-size:14px;font-weight:500;color:var(--tx2)}'));
    assert.equal(soloColumnMetrics.hourX, 17);
    assert.equal(soloColumnMetrics.hourTop, 6);
    assert.equal(soloColumnMetrics.hourText, 14);
    assert.match(grid, /hourWeight: '500' as const,/);
});

test('blok: 2 pt içeriden, ince kenarlık, 8/13 pay, 17 pt ad', () => {
    assert.match(screens, /top:\$\{cy\(t\)\+2\}px;height:\$\{cy\(e\)-cy\(t\)-4\}px/);
    assert.equal(soloColumnMetrics.blockInset, 2);
    assert.ok(v4.includes('.cb{position:absolute;left:58px;right:18px;border-radius:18px;background:var(--surf);border:1px solid var(--bd);padding:8px 13px;'));
    assert.equal(soloColumnMetrics.blockY, 8);
    assert.equal(soloColumnMetrics.blockX, 13);
    // Kenarlık bd — ekipteki bd2'nin değil.
    assert.ok(grid.includes('border: live ? `${c.or}${soloColumnMetrics.liveBorderAlpha}` : c.bd,'));
    assert.ok(v4.includes('.cb span{font-size:13.5px;font-weight:600;color:var(--tx2)}'));
    assert.ok(v4.includes('.cb b{font-size:17px;font-weight:800;letter-spacing:-.02em}'));
    assert.ok(v4.includes('.cb em{font-style:normal;font-size:14px;font-weight:500;color:var(--tx2)}'));
    assert.equal(soloColumnMetrics.blockTime, 13.5);
    assert.equal(soloColumnMetrics.blockName, 17);
    assert.equal(soloColumnMetrics.blockService, 14);
    assert.match(grid, /letterSpacing: m\.blockName \* -0\.02,/);
});

test('hâller: bitti ,5 · sürüyor turuncu yarım kenarlık + 4 pt köşesiz şerit', () => {
    assert.ok(v4.includes('.cb.done{opacity:.5}'));
    assert.equal(soloColumnMetrics.doneOpacity, 0.5);
    assert.ok(v4.includes('.cb.live{border-color:rgba(255,90,31,.5);padding-left:16px}'));
    // `${c.or}80` = %50 opak turuncu.
    assert.equal(parseInt(soloColumnMetrics.liveBorderAlpha, 16) / 255 > 0.49, true);
    assert.equal(soloColumnMetrics.blockLiveX, 16);
    assert.ok(v4.includes('.cb.live::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--or)}'));
    assert.equal(soloColumnMetrics.liveBar, 4);
    assert.match(grid, /barRadius: 0,/);
});

test('şimdi çizgisi 1,5 pt', () => {
    assert.ok(v4.includes('.cnow{position:absolute;left:58px;right:18px;height:1.5px;background:var(--or);z-index:3}'));
    assert.equal(soloColumnMetrics.nowLine, 1.5);
    assert.match(grid, /height: grid\.nowLine,/);
});

// ── Diziliş: yazı küçülmüyor, diziliyor ─────────────────────────────────────

test('T1 sahnesinin blokları: 30 ve 45 dk tek satır, 1 saat sıkışık, 2 saat tam', () => {
    // tek4-ekranlar.js · s-takvim: 10:30–11:00 row1 · 12:00–13:00 tight ·
    // 14:00–16:00 (live) · 16:30–17:15 row1 · 17:30–18:00 row1.
    assert.match(screens, /cb\("10:30","11:00","done row1"/);
    assert.match(screens, /cb\("12:00","13:00","done tight"/);
    assert.match(screens, /cb\("14:00","16:00","live"/);
    assert.match(screens, /cb\("16:30","17:15","row1"/);
    assert.equal(soloBlockShape(shown('10:30', '11:00')), 'row');
    assert.equal(soloBlockShape(shown('16:30', '17:15')), 'row');
    assert.equal(soloBlockShape(shown('12:00', '13:00')), 'tight');
    assert.equal(soloBlockShape(shown('14:00', '16:00')), 'full');
    assert.ok(v4.includes('.cb.tight{padding-top:5px;padding-bottom:5px;gap:0;line-height:1.15}'));
    assert.equal(soloColumnMetrics.blockTightY, 5);
    assert.equal(soloColumnMetrics.tightLine, 1.15);
    assert.ok(v4.includes('.cb.row1{flex-direction:row;align-items:center;gap:10px}'));
    assert.equal(soloColumnMetrics.rowGap, 10);
});

test('eşikler yazı tipinin satır yüksekliğinden: 78 ve 64 pt', () => {
    assert.equal(soloBlockShape(78), 'full');
    assert.equal(soloBlockShape(77.9), 'tight');
    assert.equal(soloBlockShape(64), 'tight');
    assert.equal(soloBlockShape(63.9), 'row');

    const ttf = new URL('../mobile/node_modules/@expo-google-fonts/hanken-grotesk/800ExtraBold/HankenGrotesk_800ExtraBold.ttf', import.meta.url);
    if (!existsSync(ttf)) return;
    const b = readFileSync(ttf);
    const tables = {};
    for (let i = 0; i < b.readUInt16BE(4); i++) tables[b.toString('ascii', 12 + i * 16, 16 + i * 16)] = b.readUInt32BE(20 + i * 16);
    const upm = b.readUInt16BE(tables.head + 18);
    const ratio = (b.readInt16BE(tables.hhea + 4) - b.readInt16BE(tables.hhea + 6) + b.readInt16BE(tables.hhea + 8)) / upm;
    const m = soloColumnMetrics;
    const text = m.blockTime + m.blockName + m.blockService;
    // Üç satır + iki 1 pt boşluk + 8'er pt pay + 1'er pt kenarlık.
    assert.equal(Math.ceil(text * ratio + 2 + m.blockY * 2 + 2), 78);
    // Sıkışık: satır 1,15, boşluk 0, 5'er pt pay.
    assert.equal(Math.ceil(text * m.tightLine + m.blockTightY * 2 + 2), 64);
});

test('tek satırda saat ve ad kırpılmıyor, sığmayan hizmet', () => {
    const solo = grid.slice(grid.indexOf('function SoloBlockText'), grid.indexOf('function Ghost'));
    assert.match(solo, /flexShrink: row \? 0 : undefined,[\s\S]*\{appointment\.customer_name\.split\(' '\)\[0\]\}/);
    assert.match(solo, /flexShrink: row \? 1 : undefined,[\s\S]*\{appointment\.service\}/);
    // Her boyda üçü birden — ekipteki gibi çıkarma yok.
    assert.ok(!solo.includes('blockDetail'));
    assert.match(grid, /flexDirection: shape === 'row' \? 'row' : 'column',/);
});

// ── Geometri tek kaynaktan ──────────────────────────────────────────────────

test('blok, şimdi çizgisi ve sürükleme hedefi AYNI saat boyunu kullanıyor', () => {
    // Biri 69, öbürü 74 olsaydı bırakılan blok parmağın altından kayardı.
    assert.match(grid, /const byStaff = columnize\(appointments, staff, dayStart, hourHeight\);/);
    assert.match(grid, /const nowTop = nowLineTop\(nowMinutes, dayStart, hourHeight\);/);
    assert.match(grid, /hourHeight: input\.hourHeight,/);
    assert.match(grid, /hourHeight=\{hourHeight\}/);
    assert.match(grid, /const perMinute = hourHeight \/ 60;/);
    // HOUR_HEIGHT yalnız içe aktarmada ve ekibin ölçü setinde.
    assert.equal((grid.match(/HOUR_HEIGHT/g) || []).length, 2);

    const h = soloColumnMetrics.hourHeight;
    const map = columnize([appt('a', '13:00', '15:00')], [{ id: 's1', initials: 'E', name: 'E' }], 10 * 60, h);
    const [block] = map.get('s1');
    assert.ok(Math.abs(block.top - 3 * h) < 1e-9 && Math.abs(block.height - 2 * h) < 1e-9);
    assert.ok(Math.abs(nowLineTop(11 * 60 + 30, 10 * 60, h) - 1.5 * h) < 1e-9);

    // Bir saatlik sürükleme 69 pt: blok tam bir saat ilerliyor.
    const moving = appt('m', '11:00', '12:00');
    const target = resolveTarget({
        appointment: moving, appointments: [moving], staff: [{ id: 's1', initials: 'E', name: 'E' }],
        fromIndex: 0, dx: 0, dy: h, dayStartMinutes: 10 * 60, dayEndMinutes: 18 * 60, hourHeight: h, solo: true,
    });
    assert.equal(target.startMinutes, 12 * 60);
});

test('en kısa blok yarım saat boyunda — ekipte 37, tek sütunda 34,5', () => {
    assert.equal(blockLayout(appt('a', '11:00', '11:10'), 9 * 60).height, MIN_BLOCK);
    assert.equal(blockLayout(appt('a', '11:00', '11:10'), 9 * 60, 69).height, 34.5);
    assert.equal(blockLayout(appt('a', '11:00', '11:30'), 9 * 60, 69).height, 34.5);
});

test('tek sütunda başlığın yerinde 22 pt pay — saat sütunu da aynı payla başlıyor', () => {
    assert.match(grid, /const headerHeight = soloColumn \? soloColumnMetrics\.gridTop : columnMetrics\.headerHeight;/);
    assert.match(grid, /\{soloColumn \? <View style=\{\{ height: headerHeight \}\} \/> : null\}/);
    assert.match(grid, /<View style=\{\{ height: headerHeight \}\} \/>\s*\{hours\.map/);
});

// ── Ekip takvimi olduğu gibi ────────────────────────────────────────────────

test('ekip takviminin hiçbir ölçüsü değişmedi', () => {
    assert.equal(HOUR_HEIGHT, 74);
    assert.equal(HOURS_WIDTH, 62);
    assert.equal(MIN_BLOCK, 37);
    assert.equal(columnMetrics.blockName, 15.5);
    assert.equal(columnMetrics.blockService, 11.5);
    assert.equal(columnMetrics.blockTime, 12);
    assert.equal(columnMetrics.blockX, 10);
    assert.equal(columnMetrics.liveBar, 3);
    assert.equal(columnMetrics.doneOpacity, 0.56);
    assert.ok(grid.includes('border: live ? `${c.or}70` : c.bd2,'));
    assert.match(grid, /hourWeight: '600' as const,/);
    // İnset yalnız tek sütunda.
    assert.match(grid, /const inset = solo \? soloColumnMetrics\.blockInset : 0;/);
    // Ekipte içerik yine boya göre ÇIKARILIYOR.
    assert.match(grid, /!shape && \(detail === 'full' \|\| detail === 'timeAndName'\)/);
    // Personel takvimi tek sütun bayrağını geçmiyor.
    assert.ok(!code('mobile/app/personel/calendar.tsx').includes('soloColumn'));
});
