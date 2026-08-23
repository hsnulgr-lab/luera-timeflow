import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { flowMetrics } from '../mobile/src/theme/tokens.ts';

// Müdür 05 — Bir personelin günü.
//
// Bu dosyanın koruduğu şey tek bir ürün kuralı: "Saati değiştir" ve
// "Personeli" YALNIZ müdürde var. Personelin kendi ekranında yoklar çünkü
// kumanda kendi gününü düzenlemez, uygular. Aynı kart iki modda da
// kullanılıyor; farkı yaratan şey bu iki tutamağın verilip verilmemesi.

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');

const screen = read('app/(manager-flow)/personel/[id].tsx');
const cards = read('src/components/CalendarParts.tsx');
const parts = read('src/components/FlowParts.tsx');
const flow = read('app/(manager)/index.tsx');

test('aynı kart dili: müdür kendi zaman çizelgesini yazmadı', () => {
    // Tasarım "aynı kart dili" diyor; ikinci bir Timeline yazmak iki ekranın
    // zamanla ayrışması demekti.
    assert.match(screen, /import \{ Timeline \} from '[.\/]+src\/components\/CalendarParts'/);
    assert.match(screen, /<Timeline/);
});

test('müdür eylemleri yalnız verildiğinde çizilir', () => {
    // Personel ekranı bu iki eylemi HİÇ vermiyor; satır o zaman render bile
    // edilmiyor, gri/kilitli durmuyor.
    assert.match(cards, /function ManagerActions/);
    assert.match(cards, /if \(!actions\.onReschedule && !actions\.onReassign\) return null;/);
    assert.match(cards, /'Saati değiştir'/);
    assert.match(cards, /'Personeli'/);
});

test('personel ekranları bu iki eylemi vermez', () => {
    for (const path of ['app/(staff)/calendar.tsx', 'app/(staff-flow)/appointment.tsx']) {
        const source = read(path);
        assert.doesNotMatch(source, /onReschedule|onReassign/, `${path}: müdür eylemi sızmış`);
    }
});

test('müdür ekranı iki eylemi de veriyor', () => {
    assert.match(screen, /onReschedule:/);
    assert.match(screen, /onReassign:/);
});

test('eylem satırı kartın gövdesinde değil, ayrı şeritte', () => {
    // İkincil düzeltmeler; ana eylemle aynı ağırlıkta durmamalı.
    const block = cards.slice(cards.indexOf('function ManagerActions'), cards.indexOf('export function NowLine'));
    assert.match(block, /borderTopWidth: 1/);
    assert.equal(flowMetrics.miniHeight, 44);
    assert.equal(flowMetrics.miniRadius, 14);
});

test('başlık kartı kim ve ne kadar süredir sorusunu cevaplar', () => {
    assert.match(parts, /export function StaffLiveHero/);
    assert.equal(flowMetrics.heroRingBig, 64);
    assert.equal(flowMetrics.heroNameSize, 21);
    // Durum çipi: renk ve KELİME birlikte.
    assert.match(parts, /flowMetrics\.statChipDot/);
    assert.match(parts, /\{word\}/);
});

test('canlı şerit yeniden yazılmadı', () => {
    // Akıştaki LiveStrip'in aynısı; iki sayaç iki farklı biçimde yaşamasın.
    const hero = parts.slice(parts.indexOf('export function StaffLiveHero'));
    assert.match(hero, /<LiveStrip/);
});

test('canlılık kuralı tek kaynakta', () => {
    // Ekran kendi "sürüyor" tanımını uydurmuyor; kütüphanenin kuralını okuyor.
    assert.match(read('src/lib/calendar.ts'), /export function isLive/);
    assert.match(screen, /appointments\.find\(isLive\)/);
});

test('ekran sekme grubunun DIŞINDA', () => {
    // `(manager)` altındaki her rota NativeTabs için bir sekme sayılıyor;
    // tetikleyicisi olmayan bir rota oraya konulunca gezinme çalışmıyordu.
    // Personel modundaki `(staff-flow)` deseninin müdür karşılığı.
    const exists = (path) => {
        try { readFileSync(new URL(`../mobile/${path}`, import.meta.url)); return true; }
        catch { return false; }
    };
    assert.ok(exists('app/(manager-flow)/personel/[id].tsx'), 'yeni yolda değil');
    assert.ok(!exists('app/(manager)/staff/[id].tsx'), 'hâlâ sekme grubunun içinde');
});

test('şeritten avatara dokununca personelin günü açılır', () => {
    assert.match(flow, /const openStaff = \(staffId: string\) => router\.push\(`\/personel\/\$\{staffId\}`\)/);
    // Müdür 13'ten sonra şerit TEK yerde: toplanınca kayboluyor, altına
    // yapışkan bir kopya çizilmiyor.
    assert.equal((flow.match(/onOpen=\{openStaff\}/g) || []).length, 1);
});
