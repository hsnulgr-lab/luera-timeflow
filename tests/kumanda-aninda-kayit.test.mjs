/**
 * KUMANDADA KALEMLER ANINDA KAYDEDİLİYOR (2026-10-14 · kullanıcının notu 2).
 *
 * Telefonda: "İşlem kumandası açıkken geri sayfaya gelince tüm adisyon
 * siliniyor… veritabanına anında yazılması lazım." Kalemler yalnız "kasaya
 * gönder"de yazılıyordu. Kullanıcı kararı: anında; ekipte müdür ve masaüstü
 * de anında görsün.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ITEMS_SAVE_MS, chainedStamp, itemsKey, shouldFlushItems, shouldSaveItems } from '../mobile/src/lib/itemsAutosave.ts';
import { supersedes } from '../mobile/src/lib/retry.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const line = (over) => ({ id: 'a', kind: 'product', name: 'Şampuan', price: 120, qty: 1, catalogId: 'p1', ...over });
const gate = (over) => ({
    loaded: true, sendIdle: true, delivered: false, foreignChange: false, deleting: false,
    key: '[1]', savedKey: '[]', ...over,
});

test('anahtar sunucuya GİDECEK liste: silinmek üzere olan satır yok, ad ve fiyat yok', () => {
    const a = itemsKey([line(), line({ id: 'b', catalogId: 'p2', qty: 2 })]);
    const b = itemsKey([line({ name: 'başka ad', price: 999 }), line({ id: 'b', catalogId: 'p2', qty: 2 })]);
    assert.equal(a, b);
    assert.notEqual(itemsKey([line()]), itemsKey([line({ qty: 2 })]));
    assert.equal(itemsKey([line({ pendingDelete: true })]), '[]');
});

test('ne zaman yazılıyor — yalnız gerçekten değişmiş liste, uygun anda', () => {
    assert.equal(shouldSaveItems(gate()), true);
    // Aynı liste iki kez gitmiyor.
    assert.equal(shouldSaveItems(gate({ key: '[]', savedKey: '[]' })), false);
    // Sunucunun listesi benimsenmeden hiçbir şey gitmiyor (ilk okuma boşken).
    assert.equal(shouldSaveItems(gate({ loaded: false })), false);
    // "Kasaya gönder" süreci kalemleri kendisi yazıyor.
    assert.equal(shouldSaveItems(gate({ sendIdle: false })), false);
    // Kasadaki adisyon değişmez.
    assert.equal(shouldSaveItems(gate({ delivered: true })), false);
    // Başka cihaz yazdıysa önce kişi karar veriyor.
    assert.equal(shouldSaveItems(gate({ foreignChange: true })), false);
    // Silme penceresi (geri al) kapanınca.
    assert.equal(shouldSaveItems(gate({ deleting: true })), false);
    assert.ok(ITEMS_SAVE_MS > 0 && ITEMS_SAVE_MS <= 1000);
});

test('yazma: gönderimin ilk yarısı, kapanış YOK; kuyruğa girebilir; çakışmada güncel liste geri geliyor', () => {
    const write = read('mobile/src/lib/visitWrite.ts');
    const fn = write.slice(write.indexOf('export async function saveVisitItems'), write.indexOf('async function landedAsSent'));
    assert.match(fn, /await api\.visitItems\(reservationId, items, expectedUpdatedAt\)/);
    assert.doesNotMatch(fn, /visitFinish/);
    assert.match(fn, /if \(skipped > 0\) return \{ code: 'items_unsendable', queued: false \};/);
    assert.match(fn, /if \(code === 'items_stale' && cause instanceof ApiError\)/);
    // `visit.items` kuyruğa girebilen yazma.
    assert.match(read('mobile/src/api/staff.ts'), /write\('visit\.items', \{ reservationId, items, expectedUpdatedAt: expected \?\? null \}\)/);
});

test('kumanda: son dokunuştan sonra yazıyor; kendi yazması gözlem, çakışma şerit', () => {
    const kumanda = read('mobile/app/(staff-flow)/kumanda.tsx');
    assert.match(kumanda, /loaded: savedFor\.current === base\.id,\s*sendIdle: send === 'idle',\s*delivered,\s*foreignChange,\s*deleting: pending !== null,/);
    // Yazma bir SÖZ olarak tutuluyor: gönderim onu bekliyor (2026-10-15).
    assert.match(kumanda, /\.then\(\(fresh\) => saveVisitItems\(reservationId, list, chainedStamp\(fresh, stamp\)\)\)/);
    assert.match(kumanda, /setTimeout\(\(\) => startSave\(reservationId, lines, key, lockStamp\), ITEMS_SAVE_MS\)/);
    assert.match(kumanda, /if \(out\.stale\) observe\(out\.stale\);\s*else observe\(out\.observation, out\.ownItems === true\);/);
    // Benimsenen liste yeniden yazılmıyor — açılışta da tazelemede de.
    assert.equal((kumanda.match(/savedKey\.current = itemsKey\(linesFromItems\(base\?\.adisyon_items\)\);/g) ?? []).length, 2);
    assert.match(kumanda, /savedFor\.current = base\?\.id \?\? null;/);
});

test('gönderim YOLDAKİ otomatik yazmayı bekliyor — kendi yazmamıza takılmıyor', () => {
    // Telefonda görüldü (2026-10-15): kalem ekleyip hemen "Nakit tahsil et" →
    // "Tahsilat kaydedilmedi. Kasaya bir şey yazılmadı." Otomatik yazma
    // sunucuda `updated_at`i ilerletiyor; cevabı dönmeden başlayan gönderim
    // eski damgayla gidiyor ve `visit.items` `items_stale` diyordu.
    const k = read('mobile/app/(staff-flow)/kumanda.tsx');
    assert.match(k, /const savingRef = useRef<Promise<string \| null> \| null>\(null\);/);
    // Söz, KENDİ başarılı yazmamızın damgasıyla çözülüyor; başkası yazdıysa null.
    assert.match(k, /return out\.stale \? null : out\.observation\?\.stamp \?\? null;/);
    assert.match(k, /savingRef\.current = run;/);
    assert.match(k, /if \(savingRef\.current === run\) savingRef\.current = null;/);
    // Gönderim önce onu bekliyor, sonra o damgayla gidiyor.
    assert.match(k, /const inFlight = savingRef\.current \?\? Promise\.resolve\(null\);/);
    assert.match(k, /let stamp = fresh \?\? lockStamp;/);
    assert.match(k, /return sendVisitToCash\(reservationId, lines, stamp\);/);
});

// ── D4 · kalem kaybı (2026-10-15 denetimi) ──────────────────────────────────

test('D4 · çıkışta bekleyen yazma gidiyor; açık silme o anda uygulanıyor', () => {
    // Eski kod: zamanlayıcı ekranla iptal, silme penceresi açıkken yazma kapalı.
    // Kaldır'a basıp pencere dolmadan başka kalem ekleyip çıkan kişinin hem
    // eklediği hem sildiği kayboluyordu.
    const { deleting: _ignored, ...rest } = gate({ deleting: true });
    assert.equal(shouldSaveItems(gate({ deleting: true })), false, 'zamanlayıcı pencereyi bekliyor');
    assert.equal(shouldFlushItems(rest), true, 'çıkışta pencere beklenmiyor');
    // Silinmek üzere olan satır gidecek listede YOK — yazılan liste silmeyi uyguluyor.
    const withPending = [line(), line({ id: 'b', catalogId: 'p2', pendingDelete: true }), line({ id: 'c', catalogId: 'p3' })];
    assert.equal(itemsKey(withPending), itemsKey([line(), line({ id: 'c', catalogId: 'p3' })]));
    // Öteki kapılar çıkışta da aynı.
    assert.equal(shouldFlushItems({ ...rest, sendIdle: false }), false);
    assert.equal(shouldFlushItems({ ...rest, delivered: true }), false);
    assert.equal(shouldFlushItems({ ...rest, foreignChange: true }), false);
    assert.equal(shouldFlushItems({ ...rest, loaded: false }), false);
    assert.equal(shouldFlushItems({ ...rest, key: '[]', savedKey: '[]' }), false);
});

test('D4 · kumanda ayrılırken ve arka plana geçerken bekleyen listeyi yazıyor', () => {
    const k = read('mobile/app/(staff-flow)/kumanda.tsx');
    const flush = k.slice(k.indexOf('const flushItemsRef = useRef'), k.indexOf('const flushItemsRef = useRef') + 1400);
    assert.match(flush, /if \(!shouldFlushItems\(\{/);
    assert.match(flush, /startSave\(base\.id, lines, key, lockStamp\);/);
    // Arka plan (iOS uygulamayı askıya almadan önce) ve ekranın sökülmesi.
    assert.match(flush, /AppState\.addEventListener\('change', \(next\) => \{\s*if \(next !== 'active'\) flushItemsRef\.current\(\);/);
    assert.match(flush, /return \(\) => \{\s*sub\.remove\(\);\s*flushOnLeave\.current\(\);/);
    // Tek yazma yolu: zamanlayıcı ve çıkış aynı `startSave`.
    assert.equal((k.match(/saveVisitItems\(/g) ?? []).length, 1);
});

test('D4 · yoldaki yazma bitmeden yenisi başlamıyor ve onun YENİ damgasıyla gidiyor', () => {
    // Yavaş ağda iki yazma aynı damgayla üst üste biniyordu; ikincisi
    // `items_stale` alıp sahte "başka cihazda değişti" şeridi çıkarıyordu.
    assert.equal(chainedStamp('2026-10-16T10:00:01Z', '2026-10-16T10:00:00Z'), '2026-10-16T10:00:01Z');
    // Önceki başkasına takıldıysa ya da kuyruğa girdiyse ekranın kilidi geçerli.
    assert.equal(chainedStamp(null, '2026-10-16T10:00:00Z'), '2026-10-16T10:00:00Z');
    const k = read('mobile/app/(staff-flow)/kumanda.tsx');
    assert.match(k, /const prior = savingRef\.current \?\? Promise\.resolve\(null\);\s*const run = prior/);
});

test('D4 · kuyrukta aynı ziyaretin eski kalem listesi yenisine yer açıyor', () => {
    // Bodrum katında art arda eklenen her kalem kuyruğa ayrı bir liste
    // koyuyordu, hepsi aynı eski damgayla. Sinyal gelince ilki yazılıyor,
    // sonrakiler `items_stale` ile atılıyordu: sunucuda İLK liste kalıyordu.
    const items = (id, n = 1) => ({ action: 'visit.items', body: { reservationId: id, items: Array(n).fill({}) } });
    assert.equal(supersedes(items('r1', 3), items('r1', 1)), true);
    assert.equal(supersedes(items('r1'), items('r2')), false, 'başka ziyaretin listesine dokunulmuyor');
    for (const action of ['visit.start', 'visit.finish', 'visit.formula', 'visit.note', 'visit.wait']) {
        assert.equal(supersedes(items('r1'), { action, body: { reservationId: 'r1' } }), false, `${action} kalem listesiyle kapsanmaz`);
        assert.equal(supersedes({ action, body: { reservationId: 'r1' } }, items('r1')), false);
    }
    assert.equal(supersedes({ action: 'visit.items', body: {} }, { action: 'visit.items', body: {} }), false);

    const client = read('mobile/src/api/staff.ts');
    const enqueue = client.slice(client.indexOf('async function enqueue('), client.indexOf('async function enqueue(') + 900);
    assert.match(enqueue, /const queue = \(await readQueue\(\)\)\.filter\(\(queued\) => !supersedes\(job, queued\)\);/);
    // Doğrudan yazılan liste de kuyruktaki eskisini kapsıyor.
    const write = client.slice(client.indexOf('async function write('), client.indexOf('async function write(') + 700);
    assert.match(write, /const out = await call\(action, \{ \.\.\.body, idempotencyKey: key \}\);\s*\/\/[^\n]*\n[\s\S]*?await dropSuperseded\(\{ action, body \}\)\.catch\(\(\) => undefined\);\s*return out;/);
});
