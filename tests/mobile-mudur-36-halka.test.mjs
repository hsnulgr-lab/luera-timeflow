import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isLastSession, remainingHead, ringStrokes, RING_SLICE_MAX } from '../mobile/src/lib/sessionRing.ts';
import { packageName } from '../mobile/src/lib/packageBook.ts';

// Müdür 36 · bağlam kutusu — kullanıcı Yol 1'i (halka) seçti, iki ayarla
// (2026-10-16): son seansta yalnız "Son seans"; 16'dan çok seansta düz yay.
// Kaynak: docs/design-reference/Luera Mobil - Mudur 36 Baglam Kutusu.html

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const flow = code(read('../mobile/src/components/FlowParts.tsx'));
const ring = code(read('../mobile/src/components/SessionRing.tsx'));
const appt = code(read('../mobile/src/components/ApptParts25.tsx'));
const card = code(read('../mobile/src/components/CustomerCard.tsx'));
const source = code(read('../mobile/src/lib/managerSource.ts'));

// ── Halkanın kuralı ─────────────────────────────────────────────────────────

test('seans başına bir dilim; YANAN dilimler kalan, saat 12\'den başlayarak', () => {
    const parts = ringStrokes({ size: 40, stroke: 3.5, total: 6, left: 4 });
    assert.equal(parts.length, 6);
    assert.deepEqual(parts.map((p) => p.on), [true, true, true, true, false, false]);
    // Aralık dilimin %30'u ama en çok 3,2 pt (tasarımın kuralı).
    const C = 2 * Math.PI * ((40 - 3.5) / 2);
    const gap = parts[0].dash[1] - (C - C / 6);
    assert.ok(gap > 0 && gap <= 3.2 + 1e-9, `aralık ${gap}`);
});

test(`${RING_SLICE_MAX}'dan çok seansta dilim yok — iz + kalan kadar düz yay`, () => {
    const parts = ringStrokes({ size: 40, stroke: 3.5, total: 20, left: 5 });
    assert.equal(parts.length, 2);
    assert.equal(parts[0].on, false, 'önce bütün halka sönük iz');
    const C = 2 * Math.PI * ((40 - 3.5) / 2);
    assert.ok(Math.abs(parts[1].dash[0] - C * 0.25) < 1e-6, 'yay kalanın oranı kadar');
    // Kalan yoksa yalnız iz; 16'da hâlâ dilim.
    assert.equal(ringStrokes({ size: 40, stroke: 3.5, total: 20, left: 0 }).length, 1);
    assert.equal(ringStrokes({ size: 40, stroke: 3.5, total: RING_SLICE_MAX, left: 3 }).length, RING_SLICE_MAX);
});

test('son seansta tek söz: "Son seans" — "1 seans kaldı" + etiket üç kez söylüyordu', () => {
    assert.equal(remainingHead(6, 6), '6 seans kaldı');
    assert.equal(remainingHead(6, 1), 'Son seans');
    assert.equal(isLastSession(1, 1), false, 'tek seanslık pakette "son seans" yanmaz');
    assert.equal(remainingHead(1, 1), '1 seans kaldı');
    assert.equal(packageName('Lazer Epilasyon · 6 Seans', 6), 'Lazer Epilasyon');
});

test('halka durağan: yalnız opacity + scale, yerli sürücü; çizgi uzunluğu oynamaz', () => {
    assert.match(ring, /useNativeDriver: true/);
    assert.match(ring, /outputRange: \[0\.96, 1\]/);
    assert.match(ring, /duration: 180/);
    assert.match(ring, /if \(reduceMotion\) \{ appear\.setValue\(1\); return; \}/);
    assert.doesNotMatch(ring, /Animated\.createAnimatedComponent|strokeDashoffset=\{appear/);
});

// ── Üç yer, tek dil ─────────────────────────────────────────────────────────

test('Akış A2: paket halkayla; uyarı amber nokta + cümle; "NOT / PAKET" etiket sütunu yok', () => {
    assert.match(flow, /const ringPkg = event\.context\?\.pkg \?\? null;/);
    assert.match(flow, /const lineRows = ringPkg \? rows\.filter\(\(row\) => row\.label !== 'paket'\) : rows;/);
    assert.match(flow, /\{ringPkg \? <PackageRingRow pkg=\{ringPkg\} \/> : null\}/);
    assert.match(flow, /<SessionRing\s+size=\{nextCardMetrics\.ring\}[\s\S]{0,200}color=\{cardSkin\.tx\}\s+number/);
    assert.doesNotMatch(flow, /width: nextCardMetrics\.liLabelWidth/, 'eski etiket sütunu');
    // Halka krem: turuncu geri sayıma ve "Geldi"ye kalıyor.
    const block = flow.slice(flow.indexOf('function PackageRingRow'), flow.indexOf('function PackageRingRow') + 3000);
    assert.doesNotMatch(block, /cardSkin\.or|c\.or/);
});

test('Akış verisi halkanın sayılarını taşıyor (borç dahil, bilinmiyorsa null)', () => {
    assert.match(source, /pkg: \{ name: packageName\(row\.name, total\), total, left: total - used, owed: row\.owed \?\? null \}/);
});

test('randevu kartı: başlıkta Ø18 rakamsız halka + kalan; müşteri kartı: "0/6" yerine Ø36 rakamlı halka', () => {
    assert.match(appt, /<SessionRing size=\{18\} stroke=\{2\.6\} total=\{summary\.ring\.total\} left=\{summary\.ring\.left\} color=\{bodyInk\} \/>/);
    assert.match(card, /<SessionRing size=\{36\} stroke=\{3\.2\} total=\{pack\.total\} left=\{left\} color=\{c\.tx\} number numberSize=\{13\} \/>/);
    assert.doesNotMatch(card, /\{pack\.used\}\/\{pack\.total\}/);
    // Borç: renk noktada, yazı mürekkepte.
    assert.match(card, /backgroundColor: c\.am \}\} \/>[\s\S]{0,200}color: c\.tx, fontSize: 12\.5/);
});

// ── A2 hizmet satırı tek satır (kullanıcı: "bu alta geçmese … kart kısalır") ──

test('A2 hizmet satırı TEK SATIR: personelin yalnız adı; sığmazsa biraz küçülür', async () => {
    const { a2Detail } = await import('../mobile/src/lib/managerFlow.ts');
    assert.equal(a2Detail('Kaş Tasarımı · 20 dk · Selin Kaya ile', 'Selin Kaya'), 'Kaş Tasarımı · 20 dk · Selin ile');
    assert.equal(a2Detail('Ağda · 45 dk · Derya ile', 'Derya'), 'Ağda · 45 dk · Derya ile', 'tek adlı personel aynı kalır');
    assert.equal(a2Detail('Ağda · 45 dk', undefined), 'Ağda · 45 dk', 'personelsiz satır aynı kalır');
    assert.equal(a2Detail('Ağda · 45 dk · Ayşe Nur Kaya ile', 'Ayşe Nur Kaya'), 'Ağda · 45 dk · Ayşe Nur ile');
    assert.match(flow, /numberOfLines=\{1\}\s+adjustsFontSizeToFit\s+minimumFontScale=\{0\.85\}[\s\S]{0,500}\{a2Detail\(event\.detail, event\.staffName\)\}/);
});
