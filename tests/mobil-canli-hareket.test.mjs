/**
 * Canlı değişimin hareketi — B-canli-degisim.html'den YALNIZ güvenlik ve
 * belirme/sönme kısmı (kullanıcı kararı 2026-09-18). Vurgu, kart içi çapraz
 * sönmeler, iptalin izsiz kaybolması ve yer değiştirme kayması ALINMADI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { LIVE_MOTION, liveDiff, withLeaving } from '../mobile/src/lib/liveMotion.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const rows = (...pairs) => pairs.map(([id, shape]) => ({ id, shape }));

test('ölçüler tasarımın tablosu', () => {
    assert.equal(LIVE_MOTION.enterMs, 240);
    assert.equal(LIVE_MOTION.lift, 8);
    assert.equal(LIVE_MOTION.exitMs, 200);
    assert.equal(LIVE_MOTION.swapMs, 200);
    assert.equal(LIVE_MOTION.bulk, 4);
    assert.equal(LIVE_MOTION.releaseMs, 120);
    assert.equal(LIVE_MOTION.holdMaxMs, 2000);
});

test('fark: yeni, giden, biçimi değişen', () => {
    const d = liveDiff(rows(['a', 'next'], ['b', 'booked']), rows(['a', 'arrived'], ['c', 'booked']));
    assert.deepEqual([...d.added], ['c']);
    assert.deepEqual([...d.removed], ['b']);
    assert.deepEqual([...d.reshaped], ['a']);
    assert.equal(d.moves, true);
    assert.equal(d.bulk, false);
});

test('yalnız içerik değiştiyse hareket yok ve beklenmiyor', () => {
    const d = liveDiff(rows(['a', 'booked']), rows(['a', 'booked']));
    assert.equal(d.moves, false);
});

test('dört ve üzeri değişiklik: liste tek karede yerleşir', () => {
    const d = liveDiff(rows(['a', 'x']), rows(['b', 'x'], ['c', 'x'], ['d', 'x']));
    assert.equal(d.added.size + d.removed.size, 4);
    assert.equal(d.bulk, true);
});

test('giden satır sönerken eski komşusunun ardında kalır', () => {
    const idOf = (row) => row.id;
    const prev = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const next = [{ id: 'a' }, { id: 'c' }];
    assert.deepEqual(withLeaving(prev, next, new Set(['b']), idOf).map(idOf), ['a', 'b', 'c']);
    assert.deepEqual(withLeaving(prev, [{ id: 'b' }, { id: 'c' }], new Set(['a']), idOf).map(idOf), ['a', 'b', 'c']);
    assert.deepEqual(withLeaving([{ id: 'x' }], [], new Set(['x']), idOf).map(idOf), ['x']);
});

test('sarmalayıcı yalnız opacity + translateY, native; yükseklik yok', () => {
    const src = code(read('../mobile/src/components/LiveRow.tsx'));
    assert.match(src, /useNativeDriver: true/);
    assert.doesNotMatch(src, /useNativeDriver: false/);
    assert.doesNotMatch(src, /height|LayoutAnimation|reanimated/);
    assert.match(src, /pointerEvents=\{mode === 'leave' \? 'none'/, 'sönen karta dokunulamaz');
    assert.match(src, /reduceMotion/);
});

test('bekletme yalnız yükseklik değişirken ve parmak ekrandayken', () => {
    const src = code(read('../mobile/src/lib/useLiveList.ts'));
    assert.match(src, /if \(!\(touching && diff\.moves\) \|\| bypass === items\)/);
    assert.match(src, /LIVE_MOTION\.releaseMs/);
    assert.match(src, /LIVE_MOTION\.holdMaxMs/);
    assert.match(src, /diff\.bulk \|\| reduceMotion/);
});

test('Akış: kaydırma sabitleme, parmak takibi, yalnız bugün ve okunmuşken', () => {
    const screen = code(read('../mobile/app/mudur/index.tsx'));
    assert.match(screen, /maintainVisibleContentPosition=\{\{ minIndexForVisible: 0 \}\}/);
    assert.match(screen, /\{\.\.\.live\.touchProps\}/);
    assert.match(screen, /enabled: isToday && state === 'ok'/);
    assert.match(screen, /live\.shown\.map/);
    // Elle basılan "Gelmedi" kendi 5 sn kartıyla; takas yalnız kendiliğinden düşende.
    assert.match(screen, /event\.kind === 'noshow' && event\.id !== freshId \? 'swap'/);
});

test('personel Bugün: aynı güvenlik; yeni kart kendi yuva hareketiyle', () => {
    const screen = code(read('../mobile/app/personel/index.tsx'));
    assert.match(screen, /maintainVisibleContentPosition=\{\{ minIndexForVisible: 0 \}\}/);
    assert.match(screen, /\{\.\.\.live\.touchProps\}/);
    assert.match(screen, /entering=\{live\.entering\.has\(appointment\.id\)\}/);
    assert.match(screen, /mode=\{live\.leaving\.has\(appointment\.id\) \? 'leave' : 'still'\}/,
        'kartın içi ve girişi kartın kendi hareketi — sarmalayıcı yalnız söndürür');
    assert.match(screen, /appointment\.id === lineAfterId/, 'şimdi çizgisi kimliğe bağlı');
});

test('alınmayanlar: turuncu vurgu yok, iptal Akış\'ta kalıyor', () => {
    const lib = code(read('../mobile/src/lib/liveMotion.ts'));
    const hook = code(read('../mobile/src/lib/useLiveList.ts'));
    const row = code(read('../mobile/src/components/LiveRow.tsx'));
    for (const src of [lib, hook, row]) {
        assert.doesNotMatch(src, /#FF5A1F|c\.or\b|highlight|vurgu/i);
    }
    const flow = read('../mobile/src/lib/flowBuild.ts');
    assert.match(flow, /if \(row\.status === 'cancelled'\) return 'cancelled';/, 'iptal satırı hâlâ Akış\'ta');
});

// ── Ekler (2026-09-18): B2 beklememe · gün özeti geçişi · sesli okuma ────────

test('B2: görünen alanın üstündeki değişiklik parmak ekrandayken de beklemez', () => {
    const hook = code(read('../mobile/src/lib/useLiveList.ts'));
    assert.match(hook, /if \(!\(touching && diff\.moves\) \|\| bypass === items\)/);
    assert.match(hook, /requestAnimationFrame/, 'konum kararı çizimde değil, sonraki karede');
    const screen = code(read('../mobile/app/mudur/index.tsx'));
    assert.match(screen, /safeWhileTouching: aboveView/);
    assert.match(screen, /bottom == null \|\| bottom > top\) return false/, 'bilinmeyen konum güvenli sayılmaz');
    assert.match(screen, /offsetY\.current = y;/, 'programla kaydırma da konumu günceller');
    // Personel ekranında bu istisna yok: orada her zaman bekler (daha temkinli).
    assert.doesNotMatch(code(read('../mobile/app/personel/index.tsx')), /safeWhileTouching/);
});

test('gün özeti yalnız personel Bugün\'de çapraz söner; rakam sayılmaz', () => {
    const parts = code(read('../mobile/src/components/CalendarParts.tsx'));
    const fn = parts.slice(parts.indexOf('function CrossfadeText'), parts.indexOf('export function DayHeader'));
    assert.match(fn, /duration: 200, easing: Easing\.linear, useNativeDriver: true/);
    assert.match(fn, /reduceMotion \? null/);
    assert.match(code(read('../mobile/app/personel/index.tsx')), /subtitle=\{subtitle\} transparent fadeSubtitle/);
    assert.doesNotMatch(code(read('../mobile/app/mudur/index.tsx')), /fadeSubtitle/, 'tasarım Akış için istemiyor');
});

test('sesli okuma: yalnız gelen ve giden satır, bir kez', () => {
    for (const path of ['../mobile/app/mudur/index.tsx', '../mobile/app/personel/index.tsx']) {
        const screen = code(read(path));
        assert.match(screen, /AccessibilityInfo\.announceForAccessibility\(text\)/);
        assert.match(screen, /\}, \[live\.news\]\);/);
        assert.match(screen, /Yeni randevu, /);
        assert.match(screen, /Randevu listeden çıktı, /);
    }
    const hook = code(read('../mobile/src/lib/useLiveList.ts'));
    assert.match(hook, /still\(items, diff\.moves \? news : model\.news\)/, 'toplu değişimde de duyurulur, içerik değişiminde duyurulmaz');
});
