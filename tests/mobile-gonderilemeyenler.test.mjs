import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    FAILURE_LIMIT, failureAdvice, failureLine, failureReason, failureTitle,
    lostThing, mergeFailures,
} from '../mobile/src/lib/writeFailure.ts';
import { fateOf } from '../mobile/src/lib/retry.ts';

/**
 * GÖNDERİLEMEYEN YAZMA SESSİZCE KAYBOLMUYOR.
 *
 * `flushQueue` kalıcı olarak reddedilen işi kuyruktan atıyor ve `dropped` ile
 * bildiriyordu. Tek çağıran (`backgroundSync`) o listeyi HİÇ OKUMUYORDU:
 * personel uçak modunda adisyonu gönderiyor, "Sırada" yazısını görüyor,
 * sinyal gelince sayaç 3'ten 0'a iniyor ve her şey gitmiş gibi duruyor.
 *
 * İkinci ve daha ağır kusur aynı yoldaydı: token ölünce kuyruk TOPLUCA
 * siliniyordu.
 */

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const client = code(read('src/api/staff.ts'));
const today = code(read('app/personel/index.tsx'));
const sync = code(read('src/lib/backgroundSync.ts'));

const fail = (over = {}) => ({
    key: 'visit.items:r1:1', action: 'visit.items', error: 'items_stale',
    at: 1000, reservationId: 'r1', ...over,
});

// ── Token ölünce kuyruk SİLİNMİYOR ──────────────────────────────────────────

test('401 KALICI sayılıyor — kuyruğu tokensiz taramak onu siler', () => {
    // Kuralın kendisi doğru (403 tekrar denemekle düzelmez), ama `no_session`
    // de 401: token yokken kuyruğu taramak her işi kalıcı hataya sokardı.
    assert.equal(fateOf({ status: 401 }), 'permanent');
});

test('oturum yoksa kuyruğa HİÇ dokunulmuyor', () => {
    // `api.refresh` 401 alınca token'ı KENDİSİ siliyor ve `syncNow` hemen
    // ardından flush'a giriyordu. Token ölmüş bir turda kuyruk boşalmıyor,
    // topluca siliniyordu.
    assert.match(client, /if \(queue\.length > 0 && !\(await tokens\.staff\(\)\)\) \{\s*\n\s*return \{ sent: 0, left: queue\.length, dropped: \[\] \};/);
    // Sıra hâlâ doğru: önce tazele, sonra boşalt.
    assert.match(sync, /await refreshIfStale\(now\);\s*\n\s*await flushQueue\(\);/);
});

// ── Kayıp DİSKTE ────────────────────────────────────────────────────────────

test('atılan iş DİSKE yazılıyor', () => {
    // Sonucu okuyan tek yer arka plan turu ve o sırada ekranda kimse
    // olmayabilir. Uygulama kapanınca da unutulmamalı.
    assert.match(client, /const merged = mergeFailures\(await readFailures\(\), failures\);/);
    assert.match(client, /AsyncStorage\.setItem\(K_FAILED, JSON\.stringify\(merged\)\)/);
    assert.match(client, /export async function readFailures/);
    assert.match(client, /export async function clearFailures/);
});

test('kayıp hangi ZİYARETE ait olduğunu taşıyor — HER İKİ düşüş yolunda', () => {
    // İş iki ayrı yerden atılıyor: kalıcı hata ve deneme hakkının bitmesi.
    // Yalnız birine kimlik koymak, ötekinden düşen kaybı adressiz bırakırdı —
    // ve bu tam olarak tek bir yeri düzeltip bitti sanılacak bir kusur.
    const pushes = client.match(/dropped\.push\(\{[^}]*\}\)/g) ?? [];
    assert.equal(pushes.length, 2, 'iki düşüş yolu bekleniyor');
    for (const push of pushes) {
        assert.match(push, /reservationId: reservationOf\(job\.body\)/);
    }
    assert.match(client, /function reservationOf\(body: Record<string, unknown>\)/);
});

// ── Birleştirme ─────────────────────────────────────────────────────────────

test('aynı iş iki kez listelenmiyor', () => {
    const before = [fail({ key: 'a', at: 1 }), fail({ key: 'b', at: 2 })];
    const merged = mergeFailures(before, [fail({ key: 'a', at: 9 })]);
    assert.equal(merged.length, 2);
    assert.equal(merged.filter((f) => f.key === 'a').length, 1);
    // Yeni kayıt ESKİYİ eziyor: sonraki hata daha güncel bir gerçek.
    assert.equal(merged.find((f) => f.key === 'a').at, 9);
});

test('en yeni BAŞTA', () => {
    const merged = mergeFailures([fail({ key: 'x', at: 5 })], [fail({ key: 'y', at: 50 })]);
    assert.deepEqual(merged.map((f) => f.key), ['y', 'x']);
});

test('tavan aşılınca ESKİLER düşüyor', () => {
    // Yeni kayıp eskisinden daha eyleme çevrilebilir: personel bugünkü
    // adisyonu yeniden girebilir, üç hafta öncekini giremez.
    const many = Array.from({ length: FAILURE_LIMIT + 5 }, (_, i) => fail({ key: `k${i}`, at: i }));
    const merged = mergeFailures([], many);
    assert.equal(merged.length, FAILURE_LIMIT);
    assert.equal(merged[0].at, FAILURE_LIMIT + 4, 'en yenisi duruyor');
    assert.ok(!merged.some((f) => f.at === 0), 'en eskisi düştü');
});

// ── Dil ─────────────────────────────────────────────────────────────────────

test('kayıp EYLEM adıyla değil, kaybedilen ŞEYLE anlatılıyor', () => {
    // `visit.items` bir kavram; "adisyon kalemleri" bir kayıp.
    assert.equal(lostThing('visit.items'), 'Adisyon kalemleri');
    assert.equal(lostThing('visit.formula'), 'Formül');
    assert.equal(lostThing('visit.finish'), 'Kasaya gönderme');
    assert.equal(lostThing('visit.start'), 'İşleme başlama damgası');
    // Dördü de AYRI: ikisi aynı olsaydı biri ötekini gizlerdi.
    const said = ['visit.items', 'visit.formula', 'visit.finish', 'visit.start'].map(lostThing);
    assert.equal(new Set(said).size, 4);
    assert.ok(!said.includes(lostThing('bilinmeyen')), 'tanınan eylem varsayılana düşmemeli');
});

test('bilinmeyen kod SEBEP UYDURMUYOR', () => {
    assert.equal(failureReason('bir_sey'), 'sunucu kabul etmedi');
    // Az şey söylüyor ama YANLIŞ bir şey söylemiyor.
    assert.doesNotMatch(failureReason('bir_sey'), /adisyon|randevu|yetki|oturum/);
    assert.match(failureReason('items_stale'), /başka bir cihazda/);
    assert.match(failureReason('no_session'), /oturum/);
});

test('başlık GERÇEK sayıyı söylüyor', () => {
    // "Bazı kayıtlar" demek üç kaybı bir kayıp gibi okutur; personel kaç
    // adisyonu yeniden gireceğini bilmek zorunda.
    assert.equal(failureTitle(1), 'Bir kayıt gönderilemedi');
    assert.equal(failureTitle(3), '3 kayıt gönderilemedi');
    assert.doesNotMatch(failureTitle(3), /bazı/i);
});

test('satır NE ve NEDEN taşıyor', () => {
    assert.equal(
        failureLine(fail()),
        'Adisyon kalemleri gitmedi · adisyon başka bir cihazda değişmişti',
    );
});

test('eylem cümlesi YALNIZ yapılabilecek bir şey varsa', () => {
    assert.match(failureAdvice([fail({ action: 'visit.items' })]), /yeniden girin/);
    assert.match(failureAdvice([fail({ action: 'visit.formula' })]), /yeniden yaz/);
    // Başlatma damgası geri yazılamaz; boş bir umut cümlesi kurulmuyor.
    assert.equal(failureAdvice([fail({ action: 'visit.start' })]), null);
    assert.equal(failureAdvice([]), null);
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('Bugün ekranı kaybı GÖSTERİYOR', () => {
    assert.match(today, /<FailedWrites \/>/);
    assert.match(today, /useFailedWrites\(\)/);
    assert.match(today, /if \(items\.length === 0\) return null;/);
    // Her kayıp AYRI satır.
    assert.match(today, /items\.map\(\(item\) => \(/);
});

test('blok KABUL EDİLENE kadar duruyor', () => {
    // Geçici bir bildirim olamaz: kayıp arka planda doğuyor ve o an personel
    // başka bir ekranda olabilir. Ama kendiliğinden de kapanmıyor.
    assert.match(today, /accept\(\);/);
    assert.match(today, /Anladım/);
    const hook = code(read('src/lib/failedWrites.ts'));
    assert.match(hook, /setItems\(\[\]\);/);
    assert.match(hook, /void clearFailures\(\)/);
});
