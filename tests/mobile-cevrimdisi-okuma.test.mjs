import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    AGENDA_CACHE_KEY, cachePayload, parseCache,
} from '../mobile/src/lib/agendaCache.ts';

/**
 * ÇEVRİMDIŞI OKUMA.
 *
 * Kuyruk bugüne kadar yalnız YAZMAYI biriktiriyordu. Oysa salonun bodrum
 * katında sinyal yokken personelin asıl kaybı yazamamak değil, GÜNÜNÜ HİÇ
 * GÖREMEMEK: ekran "Bu günü okuyamadık" diyor ve kimin ne zaman geleceği
 * bilinmiyor. Yazma kaybı telafi edilebilir; görülemeyen bir gün edilemez.
 *
 * Ama kopya CANLI DEĞİL ve bunu söylemek zorunda — iptal edilmiş bir randevu
 * orada hâlâ duruyor.
 */

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const source = code(read('src/lib/agendaSource.ts'));
const screen = code(read('app/personel/index.tsx'));

const TODAY = '2026-09-14';
const rows = [{ id: 'a1', customer_name: 'Ayşe' }];

// ── Yazma kapısı ────────────────────────────────────────────────────────────

test('YALNIZ bugün diske yazılıyor', () => {
    // Şeritten yarına bakan personel, bugünün kopyasını yarınınkiyle ezerdi ve
    // bodrumda YANLIŞ günü görürdü.
    assert.ok(cachePayload(TODAY, TODAY, 1000, rows));
    assert.equal(cachePayload('2026-09-15', TODAY, 1000, rows), null);
    assert.equal(cachePayload('2026-09-13', TODAY, 1000, rows), null);
});

test('BOŞ liste de yazılıyor', () => {
    // "Bugün randevun yok" gerçek bir cevap. Yazmamak, çevrimdışı açılışta onu
    // "okunamadı"ya çevirirdi.
    const body = cachePayload(TODAY, TODAY, 1000, []);
    assert.ok(body);
    assert.deepEqual(parseCache(body, TODAY).rows, []);
});

test('yazılan gövde damgayı TAŞIYOR', () => {
    const hit = parseCache(cachePayload(TODAY, TODAY, 1757000000000, rows), TODAY);
    assert.equal(hit.at, 1757000000000);
    assert.equal(hit.date, TODAY);
    assert.equal(hit.rows.length, 1);
});

// ── Okuma kapısı ────────────────────────────────────────────────────────────

test('BAŞKA güne ait kayıt kullanılmıyor', () => {
    // Tarihin kendisi ömrü sınırlıyor: yarın açıldığında kayıt başka bir güne
    // ait olur ve hiç kullanılmaz. Ayrı bir "son kullanma" alanı gerekmiyor.
    const dun = cachePayload('2026-09-13', '2026-09-13', 1000, rows);
    assert.equal(parseCache(dun, TODAY), null);
});

test('BOZUK kayıt kullanılmıyor', () => {
    // Yarım bir kayda güvenip ekrana basmak, bozuk veriyi gerçek gibi
    // göstermek olurdu — kayıt uygulamanın eski bir sürümünden de gelebilir.
    assert.equal(parseCache(null, TODAY), null);
    assert.equal(parseCache('', TODAY), null);
    assert.equal(parseCache('{bozuk', TODAY), null);
    assert.equal(parseCache('null', TODAY), null);
    assert.equal(parseCache('"metin"', TODAY), null);
    assert.equal(parseCache(JSON.stringify({ date: TODAY, rows: [] }), TODAY), null, 'damgasız');
    assert.equal(parseCache(JSON.stringify({ date: TODAY, at: 'dün', rows: [] }), TODAY), null);
    assert.equal(parseCache(JSON.stringify({ date: TODAY, at: 1, rows: 'yok' }), TODAY), null);
    assert.equal(parseCache(JSON.stringify({ at: 1, rows: [] }), TODAY), null, 'tarihsiz');
});

// ── Kaynak ──────────────────────────────────────────────────────────────────

test('DÖRT hâl var, üç değil', () => {
    // `cached` ile `ok` ayrı: diskten gelen listeyi "okuduk" diye göstermek,
    // iptal edilmiş bir randevuyu duruyor gibi göstermek demek.
    assert.match(source, /export type AgendaState = 'loading' \| 'ok' \| 'cached' \| 'error';/);
    assert.match(source, /setState\('cached'\);/);
});

test('kopya bulunamazsa HATA — sessiz boş gün değil', () => {
    assert.match(source, /if \(!hit\) \{ setState\('error'\); return; \}/);
    // Diskin kendisi okunamazsa da hata.
    assert.match(source, /\.catch\(\(\) => \{ if \(wanted\.current === target\) setState\('error'\); \}\)/);
});

test('damga ŞİMDİ değil KOPYANIN anı', () => {
    // Şimdiyi yazmak, kopyayı taze göstermek olurdu.
    assert.match(source, /setAt\(hit\.at\);/);
});

test('kopyaya yalnız GÖRÜNÜR başarısızlıkta düşülüyor', () => {
    // Arka plan yoklaması kaçtığında elde canlı liste duruyor; onu kopyayla
    // değiştirmek, çalışan ekranı geriye almak olurdu.
    assert.match(source, /if \(!visible\) return;/);
});

test('önbellek yazımı EKRANI bozmuyor', () => {
    // Disk yazılamazsa okuma yine başarılı: önbellek bir kolaylık, ekranın
    // çalışması ona bağlı değil.
    assert.match(source, /void AsyncStorage\.setItem\(AGENDA_CACHE_KEY, body\)\.catch\(\(\) => undefined\)/);
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('ekran kopyanın CANLI OLMADIĞINI söylüyor', () => {
    assert.match(screen, /<CachedBand at=\{readAt\} onRetry=/);
    assert.match(screen, /Çevrimdışı liste/);
    assert.match(screen, /'te okundu/);
});

test('bayatlık satırı kopyayla YAN YANA durmuyor', () => {
    // İkisi de amber ve ikisi de tazelikten söz ediyor; birlikte durmaları
    // hangisinin ne dediğini bulandırırdı.
    assert.match(screen, /\{agendaState === 'ok' && isStale\(readAt, now\) \? \(/);
});

test('kopyada Yenile yolu VAR', () => {
    // Sinyal geri geldiğinde personelin bekleyecek bir şeyi olmamalı.
    const band = screen.slice(screen.indexOf('function CachedBand'));
    assert.match(band.slice(0, 1600), /onPress=\{onRetry\}/);
    assert.match(band.slice(0, 1600), /Yenile/);
});

test('anahtar TEK ve gün başına çoğalmıyor', () => {
    // Her güne bir kayıt tutmak sınırsız büyüyen bir depo demekti.
    assert.equal(AGENDA_CACHE_KEY, 'tf.agenda.today');
    assert.doesNotMatch(source, /AGENDA_CACHE_KEY \+|`\$\{AGENDA_CACHE_KEY\}/);
});
