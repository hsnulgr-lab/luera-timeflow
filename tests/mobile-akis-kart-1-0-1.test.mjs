import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { planTitle, tidyPlanTitle } from '../mobile/src/lib/packageSale.ts';
import { packageLine } from '../mobile/src/lib/packageBook.ts';
import { staffRecord, waRecord } from '../mobile/src/lib/actionPill.ts';
import { etaPanel } from '../mobile/src/lib/managerFlow.ts';
import { planTitle as desktopPlanTitle } from '../src/lib/packageTitle.ts';

// Müdür Akış kartları — TestFlight 1.0.1 (5)'te bulunanlar (2026-10-16).
// Kullanıcı dört düzeltmeyi seçti: başlık tekrarı · kesik durum satırı ·
// "0/6" yerine kalan · tek birim.

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const source = code(read('../mobile/src/lib/managerSource.ts'));
const flow = code(read('../mobile/src/components/FlowParts.tsx'));

// ── 1 · Başlıkta tekrar ─────────────────────────────────────────────────────

test('ad seans sayısını zaten söylüyorsa başlığa EKLENMEZ — telefon ve masaüstü aynı', () => {
    for (const fn of [planTitle, desktopPlanTitle]) {
        assert.equal(fn('Lazer Epilasyon · 6 Seans', 6), 'Lazer Epilasyon · 6 Seans');
        assert.equal(fn('10 seanslık bakım', 10), '10 seanslık bakım');
        assert.equal(fn('Lazer', 6), 'Lazer · 6 seans');
        assert.equal(fn('Cilt bakımı', 1), 'Cilt bakımı');
        // 16 ≠ 6: sayının parçası eşleşme sayılmaz.
        assert.equal(fn('Lazer · 16 seans', 6), 'Lazer · 16 seans · 6 seans');
    }
});

test('var olan tekrarlı başlık gösterimde tek kez okunur; kayıt değişmez', () => {
    assert.equal(tidyPlanTitle('Lazer Epilasyon · 6 Seans · 6 seans'), 'Lazer Epilasyon · 6 Seans');
    assert.equal(tidyPlanTitle('Lazer · 6 seans'), 'Lazer · 6 seans');
    assert.equal(tidyPlanTitle('Ağda'), 'Ağda');
    assert.equal(tidyPlanTitle('Lazer 6 Seans · 8 seans'), 'Lazer 6 Seans · 8 seans', 'farklı sayı atılmaz');
    // İki okuyucu da temizlenmiş başlığı taşıyor: kart/Akış ve Paketler.
    assert.match(source, /name: tidyPlanTitle\(String\(row\.title \?\? ''\)\)/);
    assert.match(source, /title: typeof row\.title === 'string' \? tidyPlanTitle\(row\.title\) : null/);
});

// ── 3 · Kalanı söyle ────────────────────────────────────────────────────────

test('Akış\'ın paket satırı KALANI söyler — "0/6" değil', () => {
    assert.match(source, /package: packageLine\(\{ title: row\.name, left: total - used, total \}\)/);
    assert.doesNotMatch(source, /package: `\$\{row\.name\} · \$\{used\}\/\$\{total\}`/);
    const plain = (s) => s.replace(/\u00A0/g, ' ');
    // Telefonda görüldü: "… · 6 Seans · 6 / seans kaldı" — sayı iki kez, satır ortadan bölünmüş.
    assert.equal(plain(packageLine({ title: 'Lazer Epilasyon · 6 Seans', total: 6, left: 6 })),
        'Lazer Epilasyon · 6 seans kaldı');
    assert.equal(plain(packageLine({ title: 'Lazer Epilasyon · 6 Seans', total: 6, left: 1 })),
        'Lazer Epilasyon · son seans');
});

// ── 2 · Durum satırı sütunda kalır ──────────────────────────────────────────

test('krem kartın durum satırı sütunun İÇİNDE: kısa yazı + sığmazsa küçülür', () => {
    // ~188 pt'lik sol sütun, tek satır (kart 118'de). 30 harf sınır.
    const texts = [
        ...['ok', 'no_staff', 'unreachable', 'failed'].map((r) => staffRecord(r, 59).text),
        ...['ok', 'not_connected', 'opt_out', 'invalid_phone', 'queued', 'failed'].map((r) => waRecord(r, 59).text),
    ];
    for (const text of texts) assert.ok([...text].length <= 30, `${text} (${[...text].length})`);
    assert.equal(staffRecord('unreachable', 0).text, 'Personelin bildirimi kapalı');
    assert.match(flow, /<Num fit size=\{nextCardMetrics\.sub\} style=\{\{\s*flex: 1, color: ink\.ink2, fontWeight: '700', letterSpacing: 0,\s*\}\}>\s*\{record\.text\}/);
});

// ── 4 · Tek birim ───────────────────────────────────────────────────────────

test('A1 paneli süreyi üst satırla AYNI birimde yazar: "60 dk", "90 dk", "8 dk"', () => {
    assert.equal(etaPanel({ time: '14:30', etaMinutes: 600, durationMinutes: 60 }).sub, '14:30 · 60 dk');
    assert.equal(etaPanel({ time: '14:30', etaMinutes: 10, durationMinutes: 90 }).sub, '14:30 · 90 dk');
    assert.equal(etaPanel({ time: '14:30', etaMinutes: 10, durationMinutes: 8 }).sub, '14:30 · 8 dk');
});
