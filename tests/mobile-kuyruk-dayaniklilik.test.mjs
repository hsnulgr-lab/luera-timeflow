import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    fateOf, backoffMs, shouldRetry, MAX_ATTEMPTS, QUEUE_LIMIT,
} from '../mobile/src/lib/retry.ts';

/**
 * Kuyruğun dayanıklılığı.
 *
 * Kuyruk yazılmıştı ama devreye alınsa VERİ KAYBEDECEKTİ: `flushQueue` her
 * `ApiError`ü kalıcı sayıp işi siliyordu — sunucudan 500 alan bir adisyon
 * kuyruktan atılıyordu.
 */

const client = readFileSync(
    new URL('../mobile/src/api/staff.ts', import.meta.url), 'utf8');

// ── Kader ───────────────────────────────────────────────────────────────────

test('sunucunun ARIZASI işi öldürmüyor', () => {
    // Eski kural "sunucu konuştuysa kuyruğa girme" idi. 500 de sunucunun
    // konuşmasıdır ama istek geçerliydi; bir dakikalık aksama personelin
    // yazdığı adisyonu kaybettiriyordu.
    for (const status of [500, 502, 503, 504]) {
        assert.equal(fateOf({ status }), 'transient', `${status} geçici olmalı`);
    }
});

test('isteğin KENDİSİ yanlışsa tekrar denenmiyor', () => {
    // 403 ve 409 tekrar denemekle düzelmez; kuyrukta sonsuza kadar dönerdi.
    for (const status of [400, 401, 403, 404, 409, 422]) {
        assert.equal(fateOf({ status }), 'permanent', `${status} kalıcı olmalı`);
    }
});

test('408 ve 429 istisna — "sonra gel" demek', () => {
    assert.equal(fateOf({ status: 408 }), 'transient');
    assert.equal(fateOf({ status: 429 }), 'transient');
});

test('sunucuya HİÇ ulaşılamadıysa geçici', () => {
    // Ağ hatası, zaman aşımı, DNS: hiçbirinde durum kodu yok.
    assert.equal(fateOf({}), 'transient');
    assert.equal(fateOf({ status: null }), 'transient');
    assert.equal(fateOf({ status: undefined }), 'transient');
});

test('BİLİNMEYEN geçici sayılıyor — bedeller eşit değil', () => {
    // Yanlış "kalıcı" kararı işi SİLER; yanlış "geçici" kararı yalnız birkaç
    // kez gereksiz dener.
    assert.equal(fateOf({ status: 200 }), 'transient');
    assert.equal(fateOf({ status: 302 }), 'transient');
});

// ── Bekleme ─────────────────────────────────────────────────────────────────

test('bekleme üssel büyüyor ve TAVANI var', () => {
    const mid = (attempt) => backoffMs(attempt, 0.5);
    assert.equal(mid(0), 1000);
    assert.equal(mid(1), 2000);
    assert.equal(mid(2), 4000);
    assert.equal(mid(3), 8000);
    // Tavan: sonsuza kadar büyüyen bekleme, kuyruğu fiilen dondurur.
    assert.equal(mid(20), 60_000);
});

test('jitter GERÇEKTEN dağıtıyor', () => {
    // Jitter olmadan sinyal geldiği anda kuyruktaki bütün işler aynı
    // milisaniyede yola çıkar: bodrumdan çıkan beş telefon sunucuya aynı
    // anda vurur ve 5xx'i kendileri üretir.
    const low = backoffMs(3, 0);
    const high = backoffMs(3, 1);
    assert.ok(low < 8000 && high > 8000, `dağılmıyor: ${low}–${high}`);
    assert.equal(low, 6000);
    assert.equal(high, 10_000);
});

test('bekleme hiç negatif olmuyor', () => {
    for (let attempt = 0; attempt < 25; attempt++) {
        for (const r of [0, 0.5, 1]) {
            assert.ok(backoffMs(attempt, r) >= 0);
        }
    }
});

test('sonsuza kadar denenmiyor', () => {
    assert.equal(shouldRetry(0), true);
    assert.equal(shouldRetry(MAX_ATTEMPTS - 1), true);
    assert.equal(shouldRetry(MAX_ATTEMPTS), false);
});

// ── Kuyruğun kendisi ────────────────────────────────────────────────────────

test('geçici hata işi SİLMİYOR, kalıcı hata bildiriliyor', () => {
    const flush = client.slice(client.indexOf('export async function flushQueue'));
    // Kalıcıda atılıyor AMA sessizce değil.
    assert.match(flush, /if \(fateOf\(\{ status \}\) === 'permanent'\) \{\s*queue\.shift\(\);\s*dropped\.push\(/);
    // Geçicide sayaç artıyor ve iş KUYRUKTA KALIYOR.
    assert.match(flush, /job\.attempts \+= 1;/);
    assert.match(flush, /job\.nextAt = now \+ backoffMs\(job\.attempts, Math\.random\(\)\);/);
    assert.doesNotMatch(flush, /if \(e instanceof ApiError\) \{ queue\.shift\(\); continue; \}/,
        'her ApiError\'ü atan eski kural geri gelmiş');
});

test('atılan iş SESSİZCE kaybolmuyor', () => {
    // Kullanıcı neyin gitmediğini öğrenebilmeli.
    assert.match(client, /dropped: \{ key: string; action: string; error: string \}\[\]/);
});

test('bekleme dolmadıysa sıra BEKLİYOR', () => {
    // Sıradaki iş de aynı sunucuya gidecek; atlayıp denemek onu da yakardı.
    const flush = client.slice(client.indexOf('export async function flushQueue'));
    assert.match(flush, /if \(job\.nextAt > now\) break;/);
});

test('kuyruk dolduğunda ESKİLER atılmıyor', () => {
    // Eski `writeQueue` sessizce son 50'yi tutuyordu: sınırı aşan her iş
    // haber verilmeden siliniyordu. Eski iş, yenisinden az değerli değil.
    assert.doesNotMatch(client, /queue\.slice\(-50\)|q\.slice\(-50\)/);
    assert.match(client, /if \(queue\.length >= QUEUE_LIMIT\) return \{ queued: false, overflow: true \};/);
    assert.ok(QUEUE_LIMIT >= 200, `sınır çok dar: ${QUEUE_LIMIT}`);
});

test('kuyruk yazımı TEK SIRADA', () => {
    // Oku-değiştir-yaz üç ayrı `await`; iki yazma aynı anda çalışırsa
    // ikincisi birincinin eklediği işi görmeden yazıyor ve o iş kayboluyordu.
    assert.match(client, /function inQueueOrder<T>/);
    assert.match(client, /queueChain = next\.then\(\(\) => undefined, \(\) => undefined\);/,
        'zincir hatayla kırılırsa sonraki işler hiç çalışmaz');
    for (const fn of ['enqueue', 'export async function flushQueue']) {
        const cut = client.slice(client.indexOf(fn), client.indexOf(fn) + 400);
        assert.match(cut, /inQueueOrder\(/, `${fn} sıraya girmiyor`);
    }
});

test('eski kuyruk kayıtları okunurken TAMAMLANIYOR', () => {
    // Güncellemeden önce kuyrukta bekleyen işlerde `attempts` ve `nextAt`
    // yok; `undefined > now` false döner ve `undefined + 1` NaN olurdu.
    assert.match(client, /attempts: typeof job\.attempts === 'number' \? job\.attempts : 0/);
    assert.match(client, /nextAt: typeof job\.nextAt === 'number' \? job\.nextAt : 0/);
});
