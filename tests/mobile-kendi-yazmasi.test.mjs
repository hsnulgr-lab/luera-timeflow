import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    isForeignChange, isNewer, lockStampOf, observationOf,
} from '../mobile/src/lib/visitStamp.ts';

/**
 * KUMANDA KENDİ YAZMASINI "BAŞKA CİHAZ" SANIYORDU — telefonda bulundu,
 * 2026-09-15.
 *
 * Personel işlemi başlattı, üç kalem ekledi (henüz göndermedi). Yirmi beş
 * saniye sonra ekranda "Adisyon başka bir cihazda değişti" çıktı — başka
 * cihaz yoktu. "Listeyi tazele"ye basınca üç kalem SİLİNDİ.
 *
 * Aynı gün ikinci kusur: adisyon kasaya düştüğü hâlde ekran "Kasaya
 * gönderilemedi · Bu ziyaret kasada zaten kapandı" dedi. Gönderim zayıf
 * sinyalde İKİ KEZ tetikleniyordu.
 */

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const screen = strip(read('app/(staff-flow)/kumanda.tsx'));
const write = strip(read('src/lib/visitWrite.ts'));
const hook = strip(read('src/lib/visitSource.ts'));

/** Sunucunun kalem biçimi — adıyla, kimliğiyle. */
const item = (name, id, qty = 1) => ({ id: `i-${id}`, name, kind: 'product', productId: id, qty, price: 100 });
/** Ekranın satır biçimi. */
const line = (name, id, qty = 1) => ({ id: `l-${id}`, name, kind: 'product', catalogId: id, qty, price: 100 });

const A = '2026-09-15T01:35:00.000+00:00';
const B = '2026-09-15T01:35:30.000+00:00';

// ── Fotoğraftaki senaryo ────────────────────────────────────────────────────

test('İŞLEMİ BAŞLATMAK yabancı değişiklik DEĞİL — gönderilmemiş kalemler olsa bile', () => {
    // Başlatma damgayı ilerletti, adisyon sunucuda hâlâ boş; ekranda üç yeni
    // kalem var. Eskiden bu "başka bir cihazda değişti" diyordu.
    const input = {
        adopted: A, seen: B, baseItems: [], seenItems: [], ownItems: null,
        lines: [line('functional lazer', 'p1'), line('ağda', 'p2'), line('serum', 'p3')],
    };
    assert.equal(isForeignChange(input), false);
    // Ve kilit YENİ damgaya geçiyor: gönderim kendi başlatmamıza takılmıyor.
    assert.equal(lockStampOf(input), B);
});

test('FORMÜL yazmak da yabancı değişiklik değil', () => {
    const input = {
        adopted: A, seen: B, baseItems: [item('boya', 'p1')], seenItems: [item('boya', 'p1')],
        ownItems: null, lines: [line('boya', 'p1'), line('oksidan', 'p2')],
    };
    assert.equal(isForeignChange(input), false);
});

// ── Gerçek yabancı değişiklik HÂLÂ yakalanıyor ──────────────────────────────

test('masaüstü adisyona kalem EKLEDİYSE uyarı çıkıyor ve kilit ESKİ damgada kalıyor', () => {
    const input = {
        adopted: A, seen: B, baseItems: [item('boya', 'p1')],
        seenItems: [item('boya', 'p1'), item('maske', 'p9')],
        ownItems: null, lines: [line('boya', 'p1'), line('serum', 'p3')],
    };
    assert.equal(isForeignChange(input), true);
    // Eski damga: sunucu yazmayı reddetsin, kimsenin kalemi sessizce ezilmesin.
    assert.equal(lockStampOf(input), A);
});

test('masaüstü ADETİ değiştirdiyse de yakalanıyor', () => {
    const input = {
        adopted: A, seen: B, baseItems: [item('boya', 'p1', 1)], seenItems: [item('boya', 'p1', 3)],
        ownItems: null, lines: [line('boya', 'p1', 1)],
    };
    assert.equal(isForeignChange(input), true);
});

// ── Kendi kalem yazmamız ───────────────────────────────────────────────────

test('kendi KALEM yazmamızdan sonra düzenleme sürse de uyarı çıkmıyor', () => {
    // Kalemler yazıldı, kapanış takıldı; personel bir kalem daha ekledi.
    const input = {
        adopted: A, seen: B, baseItems: [],
        seenItems: [item('boya', 'p1')], ownItems: [item('boya', 'p1')],
        lines: [line('boya', 'p1'), line('maske', 'p9')],
    };
    assert.equal(isForeignChange(input), false);
});

test('kuyruktan SONRADAN giden kendi işimiz uyarı çıkarmıyor', () => {
    // Sinyal gelince kuyruk boşaldı; cevabı ekrana hiç ulaşmadı ama sunucudaki
    // liste ekrandakiyle aynı.
    const input = {
        adopted: A, seen: B, baseItems: [], seenItems: [item('boya', 'p1')],
        ownItems: null, lines: [line('boya', 'p1')],
    };
    assert.equal(isForeignChange(input), false);
});

// ── Sınırlar ────────────────────────────────────────────────────────────────

test('damga aynıysa ya da bilinmiyorsa değişiklik YOK', () => {
    const base = { baseItems: [], seenItems: [item('x', 'p1')], ownItems: null, lines: [] };
    assert.equal(isForeignChange({ ...base, adopted: A, seen: A }), false);
    assert.equal(isForeignChange({ ...base, adopted: null, seen: B }), false);
    assert.equal(isForeignChange({ ...base, adopted: A, seen: null }), false);
    assert.equal(lockStampOf({ ...base, adopted: A, seen: null }), A);
});

test('geç dönen eski yoklama YENİ damgayı ezmiyor', () => {
    assert.equal(isNewer(A, B), false);
    assert.equal(isNewer(B, A), true);
    assert.equal(isNewer(B, null), true);
    assert.equal(isNewer(null, A), false);
});

// ── Cevaptan gözlem ─────────────────────────────────────────────────────────

test('başlatma ve formül cevabı satırın DAMGASINI ve KALEMLERİNİ taşıyor', () => {
    const obs = observationOf({ ok: true, reservation: { updated_at: B, adisyon_items: [item('boya', 'p1')] } });
    assert.equal(obs.stamp, B);
    assert.equal(obs.items.length, 1);
});

test('kalem cevabında SUNUCUNUN çözdüğü liste esas — gönderilen gövde değil', () => {
    // Gönderilen gövde ad taşımıyor; satır dönüştürücüsü adsız kalemi atar ve
    // "kendi yazdığımız liste" boş görünürdü.
    const sent = [{ kind: 'product', productId: 'p1', qty: 1 }];
    const obs = observationOf({ ok: true, updatedAt: B, items: [item('boya', 'p1')] }, sent);
    assert.equal(obs.items[0].name, 'boya');
});

test('kuyruğa giren yazma GÖZLEM değil', () => {
    assert.equal(observationOf({ ok: false, queued: true, updatedAt: B }), null);
    assert.equal(observationOf(null), null);
});

// ── Kablolama ───────────────────────────────────────────────────────────────

test('üç yazmanın üçü de cevabını gözlem olarak işliyor', () => {
    assert.match(screen, /void startVisit\(appointment\.id\)\.then\(\(out\) => \{\s*\n\s*observe\(out\.observation\);/);
    assert.match(screen, /void writeVisitFormula\(appointment\.id, next\)\.then\(\(out\) => \{\s*\n\s*observe\(out\.observation\);/);
    assert.match(screen, /observe\(out\.observation, out\.ownItems === true\);/);
});

test('uyarı YALNIZ yabancı değişiklikte ve gönderim türetilmiş kilitle', () => {
    assert.match(screen, /const foreignChange = changed && isForeignChange\(lockInput\);/);
    assert.match(screen, /\{foreignChange && !delivered \? \(/);
    assert.match(screen, /sendVisitToCash\(base\.id, lines, lockStamp\)/);
});

test('benimseme gözlemleri SIFIRLIYOR', () => {
    // Personel tazeledi: temel liste artık sunucununki, eski "kendi yazdığım"
    // kaydı karara karışmamalı.
    assert.match(hook, /setSeen\(observed\);\s*\n\s*setOwnItems\(null\);/);
});

test('kapanış takılsa da kalem yazmasının damgası işleniyor', () => {
    // İşlenmezse bir sonraki deneme kendi kalem yazmamıza takılırdı.
    assert.match(write, /return \{ code: codeOf\(cause\), queued: false, observation, ownItems: true \};/);
});

// ── Çift gönderim ───────────────────────────────────────────────────────────

test('gönderim etkisi AĞ DURUMUNA bağlı değil', () => {
    // Bağlıyken zayıf sinyalde etki istek sürerken yeniden çalışıyor ve
    // adisyonu ikinci kez gönderiyordu.
    assert.match(screen, /\}, \[send, base\?\.id\]\);/);
    assert.doesNotMatch(screen, /\[send, offline, base\?\.id\]/);
});

test('süren gönderim varken İKİNCİSİ başlamıyor', () => {
    const fn = screen.slice(screen.indexOf("if (send === 'going') {"));
    const body = fn.slice(0, fn.indexOf("if (send === 'sent')"));
    // `indexOf` bulamazsa -1 döner ve "-1 < konum" her zaman doğrudur: sıra
    // karşılaştırmasından ÖNCE varlık doğrulanıyor. (Bu tuzak ilk yazımda
    // kapının silinmesini sessizce geçirdi.)
    const at = (needle) => {
        const index = body.indexOf(needle);
        assert.ok(index > -1, `bulunamadı: ${needle}`);
        return index;
    };
    assert.ok(at('if (sendingRef.current) return undefined;') < at('sendVisitToCash('));
    assert.ok(at('sendingRef.current = true;') < at('sendVisitToCash('));
    // Cevap gelince kapı açılıyor — ekran kapansa bile.
    assert.ok(at('sendingRef.current = false;') < at('if (!alive) return;'));
});

test('"zaten kapandı" — kalemler aynıysa GİTMİŞ sayılıyor', () => {
    assert.match(write, /if \(code === 'already_finished' && \(await landedAsSent\(reservationId, lines\)\)\) \{\s*\n\s*return \{ code: null, queued: false \};/);
    const fn = write.slice(write.indexOf('async function landedAsSent'));
    // Tamamlanmamışsa ya da kalemler farklıysa gitmiş SAYILMIYOR.
    assert.match(fn, /if \(!row \|\| row\.status !== 'completed'\) return false;/);
    assert.match(fn, /return !linesDiffer\(lines, linesFromItems\(row\.adisyon_items\)\);/);
    // Okunamazsa "gitti" DENMİYOR.
    assert.match(fn, /catch \{\s*\n\s*return false;/);
});
