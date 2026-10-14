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

import { ITEMS_SAVE_MS, itemsKey, shouldSaveItems } from '../mobile/src/lib/itemsAutosave.ts';

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
    assert.match(kumanda, /const run = saveVisitItems\(reservationId, lines, lockStamp\)/);
    assert.match(kumanda, /if \(out\.stale\) observe\(out\.stale\);\s*else observe\(out\.observation, out\.ownItems === true\);/);
    assert.match(kumanda, /\}, ITEMS_SAVE_MS\);/);
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
    assert.match(k, /return sendVisitToCash\(reservationId, lines, fresh \?\? lockStamp\);/);
});
