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
/** Yorumlar elenir: kural KODA ait, açıklama metnine değil. */
const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const sync = readFileSync(
    new URL('../mobile/src/lib/backgroundSync.ts', import.meta.url), 'utf8');
const root = readFileSync(
    new URL('../mobile/app/_layout.tsx', import.meta.url), 'utf8');

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

test('KAPANDI · kuyruk gerçekten boşaltılıyor (Faz 2)', () => {
    // Faz 1'de bu bir BOŞLUK testiydi: `flushQueue` yazılmış ama hiçbir
    // yerden çağrılmıyordu. Şimdi kök kabuktan çağrılıyor ve iki gerçek olay
    // tetikliyor — bağlantının geri gelmesi ve uygulamanın öne dönmesi.
    assert.match(sync, /await flushQueue\(\)/);
    assert.match(sync, /AppState\.addEventListener\('change'/);
    assert.match(sync, /Network\.addNetworkStateListener/);
    assert.match(root, /useBackgroundSync\(\)/, 'kök kabukta çağrılmalı');
});

test('KAPANDI · istekte zaman aşımı var (Faz 2)', () => {
    // Zaman aşımı olmadan zayıf sinyalde istek ne kuyruğa giriyor ne hata
    // veriyordu: ekran sonsuza kadar "gönderiliyor" diyordu.
    // `AbortSignal.timeout()` KULLANILAMAZ: React Native `AbortSignal`i
    // `abort-controller` paketiyle polyfill ediyor ve o pakette bu statik
    // metot yok — çağırmak telefonda HER İSTEKTE çökerdi. Tarayıcıda ve
    // Node'da çalıştığı için kolayca gözden kaçıyor; test onu kapatıyor.
    assert.doesNotMatch(stripComments(client), /AbortSignal\.timeout/);
    assert.match(client, /const controller = new AbortController\(\);/);
    assert.match(client, /setTimeout\(\(\) => controller\.abort\(\), REQUEST_TIMEOUT_MS\)/);
    assert.match(client, /clearTimeout\(timer\);/, 'sayaç sönmezse her istek için birikir');
});

test('KAPANDI · token DOLMADAN ÖNCE tazeleniyor (Faz 2)', () => {
    // `session.refresh` ucu da geçerli token istiyor (kimlik doğrulamasından
    // SONRA geliyor): süresi dolmuş bir token kendini yenileyemez. O yüzden
    // yenileme öne dönüşte ve saatte bir yapılıyor.
    assert.match(api, /action === 'me' \|\| action === 'session\.refresh'/);
    assert.match(client, /call\('session\.refresh'\)/);
    assert.match(sync, /await refreshIfStale\(now\);\s*await flushQueue\(\);/,
        'kuyruk ölü token\'la boşaltılırsa her iş 401 alır ve KALICI sayılıp atılır');
});

test('KAPANDI · yenilenemeyen oturum PIN ekranına düşüyor (Faz 2)', () => {
    // Personel token'ı ölünce kullanıcı YENİDEN EŞLEŞTİRMEYE düşüyordu;
    // cihaz eşleşmesi ayrı bir belge ve durmalı, yoksa her vardiya başında
    // işletme sahibinin gelip telefonu yeniden eşlemesi gerekirdi.
    assert.match(client, /if \(e instanceof ApiError && e\.status === 401\) await tokens\.clearStaff\(\);/);
    assert.doesNotMatch(client, /clearDevice\(\) *;? *\n *\} *catch/);
});

test('BOŞLUK · iyimser kilit sunucuda hazır, istemci damga göndermiyor (Faz 4)', () => {
    assert.ok(reads.get('visit.items')?.has('expectedUpdatedAt'), 'sunucu damgayı okumalı');
    assert.ok(!sends.get('visit.items')?.has('expectedUpdatedAt'),
        'istemci damgayı göndermeye başladı — Faz 4 maddesi kapandı, testi güncelle');
});

test('KAPANDI · ApiError sunucunun gövdesini taşıyor (Faz 2)', () => {
    // Sunucu `remaining`, `minutes` ve `until` dönüyor; istemci yalnız kodu
    // alıyordu ve yazılmış "3 hakkınız kaldı" ekranı ölü koddu.
    assert.match(api, /error: 'invalid_credentials', remaining:/);
    assert.match(client, /public body: Record<string, unknown> = \{\}/);
    for (const field of ['remaining', 'minutes', 'until']) {
        assert.match(client, new RegExp(`get ${field}\\(`), `ApiError.${field} yok`);
    }
});
