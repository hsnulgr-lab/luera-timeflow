import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * İSTEMCİ ↔ SUNUCU SÖZLEŞMESİ.
 *
 * Bugüne kadarki `staff-api.test.mjs` kaynak METNİNİ grep'liyordu ve en
 * pahalı kusuru göremedi: `idempotencyKey` istemcide her yazma isteğine
 * konuyor, yorumunda "tekrar gönderim çift kayıt oluşturmaz" yazıyordu ve
 * sunucuda HİÇ OKUNMUYORDU. Onu elle bulduk.
 *
 * Bu dosya iki tarafı KARŞILAŞTIRIYOR:
 *   1. istemcinin gönderdiği alanlar ↔ sunucunun okuduğu alanlar
 *   2. sunucunun döndürdüğü kolonlar ↔ istemcinin tipi
 *   3. bilinen boşluklar — kapanınca test "artık bağlandı" diye patlıyor
 */

const api = readFileSync(
    new URL('../supabase/functions/staff-api/index.ts', import.meta.url), 'utf8');
const client = readFileSync(
    new URL('../mobile/src/api/staff.ts', import.meta.url), 'utf8');

// ── Ayıklama ────────────────────────────────────────────────────────────────

/** Sunucunun her eylemde `body`den okuduğu alanlar. */
function serverReads() {
    const marks = [...api.matchAll(/if \(action === '([a-z.]+)'\)/g)]
        .map((m) => ({ action: m[1], at: m.index }));
    marks.push({ action: '<son>', at: api.length });
    const out = new Map();
    for (let i = 0; i < marks.length - 1; i++) {
        const cut = api.slice(marks[i].at, marks[i + 1].at);
        const keys = new Set([...cut.matchAll(/\bbody_?\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
        out.set(marks[i].action, keys);
    }
    return out;
}

/** İstemcinin her eylemde gönderdiği alanlar. */
function clientSends() {
    const out = new Map();
    for (const m of client.matchAll(/(?:call|write)\('([a-z.]+)',\s*([\s\S]*?)\)[,;]/g)) {
        // Süslü parantezlerin İÇİ alınıp virgülle bölünüyor. Tek bir regex'le
        // yürümek bindirmeli eşleşmeye takılıyordu: `{ a, b }` içinde virgül
        // ilk eşleşmede tüketildiği için `b` hiç görünmüyor ve karşılaştırma
        // sessizce boşa düşüyordu.
        const inner = [...m[2].matchAll(/\{([^{}]*)\}/g)].map((g) => g[1]).join(',');
        const keys = new Set(inner.split(',')
            .map((piece) => piece.trim())
            .filter((piece) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(piece)));
        // `...patch` yayılıyorsa alanları imzadaki tipten geliyor.
        if (/\.\.\.patch/.test(m[2])) {
            const sig = client.slice(client.lastIndexOf('patch: {', m.index), m.index);
            for (const f of sig.matchAll(/^\s{8}([a-zA-Z_][a-zA-Z0-9_]*)\??:/gm)) keys.add(f[1]);
        }
        out.set(m[1], keys);
    }
    return out;
}

const reads = serverReads();
const sends = clientSends();

test('ayıklama GERÇEKTEN çalışıyor', () => {
    // Desen boşa düşerse bu dosya hiçbir şeyi karşılaştırmaz.
    assert.ok(reads.size >= 10, `sunucudan yalnız ${reads.size} eylem okundu`);
    assert.ok(sends.size >= 7, `istemciden yalnız ${sends.size} eylem okundu`);
    assert.deepEqual([...(sends.get('visit.items') ?? [])].sort(), ['items', 'reservationId']);
    assert.ok(reads.get('visit.formula')?.has('tags'), 'sunucu tags okumalı');
});

// ── 1 · Gönderilen her alan OKUNUYOR mu ────────────────────────────────────

test('istemcinin gönderdiği hiçbir alan sunucuda DÜŞMÜYOR', () => {
    const dropped = [];
    for (const [action, keys] of sends) {
        const read = reads.get(action) ?? new Set();
        for (const key of keys) {
            if (!read.has(key)) dropped.push(`${action}.${key}`);
        }
    }
    assert.deepEqual(dropped, [],
        `istemci gönderiyor, sunucu okumuyor:\n  ${dropped.join('\n  ')}`);
});

test('idempotency anahtarı GERÇEKTEN okunuyor', () => {
    // Tarihsel kusur: istemci her yazmaya koyuyordu, sunucu hiç bakmıyordu.
    // Kapı eylem bloklarının DIŞINDA olduğu için yukarıdaki karşılaştırma onu
    // görmüyor; ayrıca sınanıyor.
    assert.match(api, /const rawKey = body\.idempotencyKey;/);
    assert.match(client, /idempotencyKey: key/);
    assert.match(client, /idempotencyKey: job\.key/);
});

// ── 2 · Dönen kolonlar ↔ istemcinin tipi ───────────────────────────────────

test('RES_COLS ile Appointment tipi AYNI alanları taşıyor', () => {
    const raw = api.slice(api.indexOf('const RES_COLS'), api.indexOf(';', api.indexOf('const RES_COLS')));
    const cols = [...raw.matchAll(/'([^']+)'/g)].map((m) => m[1]).join('')
        .split(',').map((s) => s.trim()).filter(Boolean);

    const start = client.indexOf('export interface Appointment {');
    const body = client.slice(start, client.indexOf('\n}', start));
    const fields = [...body.matchAll(/^\s{4}([a-z_]+)\??:/gm)].map((m) => m[1]);

    assert.ok(cols.length >= 15, `RES_COLS okunamadı (${cols.length})`);
    assert.deepEqual(cols.filter((x) => !fields.includes(x)), [],
        'sunucu gönderiyor, tip bilmiyor');
    assert.deepEqual(fields.filter((x) => !cols.includes(x)), [],
        'tip bekliyor, sunucu göndermiyor');
});

// ── 3 · Bilinen boşluklar ──────────────────────────────────────────────────
//
// Aşağıdakiler HENÜZ bağlanmadı ve bu bilinçli. Testler boşluğun VARLIĞINI
// kilitliyor: biri bağlandığında test patlıyor ve "artık bağlandı, bu
// maddeyi kaldır" demiş oluyor. Sessizce kapanan bir boşluk, açık kalan
// kadar tehlikeli — kimse ötekini haberdar etmiyor.

test('BOŞLUK · kuyruk hâlâ hiçbir yerden boşaltılmıyor (Faz 2)', () => {
    const calls = [...client.matchAll(/flushQueue\(/g)].length;
    assert.equal(calls, 1, 'flushQueue artık çağrılıyor — Faz 2 maddesi kapandı, testi güncelle');
});

test('BOŞLUK · istekte zaman aşımı yok (Faz 2)', () => {
    assert.doesNotMatch(client, /AbortSignal|signal:/,
        'timeout eklendi — Faz 2 maddesi kapandı, testi güncelle');
});

test('BOŞLUK · istemcide session.refresh yolu yok (Faz 2)', () => {
    // Sunucuda VAR (`staff-api` · action === 'session.refresh'); personel
    // token'ı 12 saatte ölüyor ve istemci yenileyemediği için kullanıcı PIN
    // yerine YENİDEN EŞLEŞTİRMEYE düşüyor.
    assert.match(api, /action === 'me' \|\| action === 'session\.refresh'/);
    assert.doesNotMatch(client, /session\.refresh/,
        'yenileme eklendi — Faz 2 maddesi kapandı, testi güncelle');
});

test('BOŞLUK · iyimser kilit sunucuda hazır, istemci damga göndermiyor (Faz 4)', () => {
    assert.ok(reads.get('visit.items')?.has('expectedUpdatedAt'), 'sunucu damgayı okumalı');
    assert.ok(!sends.get('visit.items')?.has('expectedUpdatedAt'),
        'istemci damgayı göndermeye başladı — Faz 4 maddesi kapandı, testi güncelle');
});

test('BOŞLUK · ApiError sunucunun gövdesini taşımıyor (Faz 2)', () => {
    // Sunucu `remaining`, `minutes` ve `until` dönüyor; istemci yalnız kodu
    // alıyor. "3 hakkınız kaldı" ekranı bu yüzden ölü kod.
    assert.match(api, /error: 'invalid_credentials', remaining:/);
    assert.match(client, /new ApiError\(String\(data\?\.error \?\? 'server_error'\), res\.status\)/,
        'ApiError zenginleşti — Faz 2 maddesi kapandı, testi güncelle');
});
