import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { demoCustomerFile } from '../mobile/src/lib/customerFile.ts';
import {
    formulaErrorLine, formulaOutcome, formulaPatch,
} from '../mobile/src/lib/formula.ts';

/**
 * "Kaydet" GERÇEKTEN kaydediyor mu — ve NEREYE.
 *
 * İki kez düzeltildi. Önce düğme yalnız haptik verip sayfayı kapatıyordu;
 * sonra yerel bir depoya yazıyordu ve o depo uygulama kapanınca boşalıyordu.
 * Personel her iki hâlde de formülü yazdığını sanıp gidiyor, ertesi ay aynı
 * müşteride hiçbir şey bulamıyordu. Kayıt artık SUNUCUYA gidiyor.
 */

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const page = read('app/(staff-flow)/formul.tsx');
const card = read('app/(staff-flow)/musteri.tsx');
const kumanda = read('app/(staff-flow)/kumanda.tsx');
const write = read('src/lib/visitWrite.ts');

const TODAY = '2026-09-11';

const DRAFT = {
    materials: [],
    ratio: '1:1,5',
    waitMinutes: 30,
    waitSource: 'timer',
    result: 'Tuttu',
    tags: ['turuncu'],
    note: '  uçlar gözenekli  ',
    staffId: null,
    writtenAt: '2026-09-13T09:00:00.000Z',
};

// ── Yazma yolu gerçekten sunucuya çıkıyor mu ────────────────────────────────

test('kaydet düğmesi SUNUCUYA yazıyor', () => {
    assert.doesNotMatch(page, /onPress=\{\(\) => \{ feedback\.medium\(\); router\.back\(\); \}\}/,
        'haptik + geri, kayıt yok — ilk düzeltilen davranış');
    assert.match(page, /writeVisitFormula\(params\.id as string, \{/);
    assert.match(write, /api\.visitFormula\(reservationId, formulaPatch\(draft\)\)/);
});

test('kumanda da AYNI yolu kullanıyor', () => {
    // İki yüzey ayrı yere yazsaydı, kumandada yazılan formül müşteri
    // sayfasında görünmezdi.
    assert.match(kumanda, /writeVisitFormula\(appointment\.id, next\)/);
});

test('kumanda formülü RANDEVUDAN okuyor, yerel depodan değil', () => {
    // Yerel depo uygulama kapanınca boşalıyordu: ikinci açılışta formül yoktu.
    assert.match(kumanda, /saved \?\? base\?\.formula \?\? null/);
    assert.match(read('src/lib/visitSource.ts'), /formula: row\.formula,/);
});

test('yerel depo KALKTI', () => {
    // İki kaynak bir gün ayrışırdı; hangisinin doğru olduğunu kimse bilemezdi.
    assert.throws(
        () => readFileSync(new URL('../mobile/src/lib/formulaStore.ts', import.meta.url)),
        'formulaStore.ts silinmiş olmalı',
    );
    for (const [name, src] of [['formul', page], ['kumanda', kumanda], ['musteri', card]]) {
        assert.doesNotMatch(src, /formulaStore/, `${name} hâlâ yerel depoya bakıyor`);
    }
});

test('formül sayfası neye yazacağını BİLİYOR', () => {
    // Kimlik geçirilmezse yazacak yer yok — ve düğme hiç çizilmiyor.
    assert.match(card, /id: row\.id,/);
    assert.match(page, /id\?: string;/);
    assert.match(page, /Bu ziyaret tanınmadı · formül yazılamıyor\./);
});

// ── Gönderilen gövde ────────────────────────────────────────────────────────

test('malzeme · imza · damga İSTEMCİDEN gönderilmiyor', () => {
    // Üçünü de sunucu kendi doğrusuyla yazıyor: malzemeyi adisyondan, imzayı
    // token'dan, damgayı kendi saatinden. İstemcinin listesine güvenmek,
    // adisyonla formülün ayrışması demek.
    const body = formulaPatch(DRAFT);
    assert.deepEqual(Object.keys(body).sort(),
        ['note', 'ratio', 'result', 'tags', 'waitMinutes', 'waitSource']);
});

test('sonuç KÜÇÜK HARFE çevriliyor — ve tek yerde', () => {
    // Sunucunun listesi küçük harf (`RESULTS`); büyük harf `bad_result` döner.
    // İki yüzey bunu ayrı ayrı yapıyordu, biri unutulsa formül kaydedilemezdi.
    assert.equal(formulaPatch(DRAFT).result, 'tuttu');
    assert.equal(formulaPatch({ ...DRAFT, result: 'Açık kaldı' }).result, 'açık kaldı');
    // Boş sonuç UYDURULMUYOR: "yazılmadı" bir değer değil.
    assert.equal(formulaPatch({ ...DRAFT, result: null }).result, null);
});

test('bekleme KAYNAĞI taşınıyor', () => {
    // "35 dk" ile "ölçüldü · 35 dk" aynı şey değil: ikincisi bir kanıt.
    assert.equal(formulaPatch(DRAFT).waitSource, 'timer');
    assert.equal(formulaPatch({ ...DRAFT, waitSource: 'manual' }).waitSource, 'manual');
    // Tanınmayan kaynak `timer` sayılmıyor: ölçülmemiş bir şeye ölçüldü demek.
    assert.equal(formulaPatch({ ...DRAFT, waitSource: 'wat' }).waitSource, 'manual');
});

test('etiket listesi HER ZAMAN dizi', () => {
    // `tags` yoksa sunucu `Array.isArray` kapısından geçemez ve etiket sessizce
    // düşerdi.
    assert.deepEqual(formulaPatch(DRAFT).tags, ['turuncu']);
    assert.deepEqual(formulaPatch({ ...DRAFT, tags: undefined }).tags, []);
});

// ── Cevabın okunması ────────────────────────────────────────────────────────

test('sunucunun formülü GEÇERLİ olan', () => {
    // Ekranın taslağı malzemeyi boş, imzayı null bırakıyor. Onu saklamak
    // formülü eksik göstermek olurdu — oysa kayıtta ikisi de var.
    const out = formulaOutcome({
        ok: true,
        reservation: {
            formula: {
                materials: [{ id: 'p1', name: 'Boya · 7.3', qty: 2 }],
                ratio: '1:1,5', waitMinutes: 30, waitSource: 'timer',
                result: 'tuttu', tags: [], note: null,
                staffId: 's1', writtenAt: '2026-09-13T09:00:01.000Z',
            },
        },
    });
    assert.equal(out.queued, false);
    assert.equal(out.saved.materials.length, 1);
    assert.equal(out.saved.staffId, 's1');
});

test('KUYRUK kaydedilmiş SAYILMIYOR', () => {
    // Sinyal yokken iş kuyruğa giriyor ve gidecek. Ama o ana kadar müşterinin
    // dosyasında formül YOK: "kaydedildi" deyip sayfayı kapatmak, personeli
    // geçmiş satırında hiçbir şey bulamayacağı bir yere gönderirdi.
    const out = formulaOutcome({ ok: false, queued: true });
    assert.equal(out.queued, true);
    assert.equal(out.saved, null);
});

test('formülsüz cevap formül UYDURMUYOR', () => {
    assert.deepEqual(formulaOutcome({ ok: true, reservation: {} }), { queued: false, saved: null });
    assert.deepEqual(formulaOutcome(null), { queued: false, saved: null });
});

test('iki ekran da kuyrukta KAPANMIYOR', () => {
    assert.match(page, /if \(out\.queued\) \{ setWrite\('queued'\); return; \}/);
    assert.match(kumanda, /if \(out\.queued\) \{ setFormulaWrite\('queued'\); return; \}/);
    // Ve ikisi de aynı cümleyi yazıyor.
    for (const src of [page, kumanda]) {
        assert.match(src, /Sırada · sinyal gelince gidecek/);
    }
});

// ── Hayırın dili ────────────────────────────────────────────────────────────

test('bilinmeyen hata SEBEP UYDURMUYOR', () => {
    // `sendToCash.errorLine`in varsayılanı "Bu adisyon kasada zaten açık" —
    // formül yolunda bu cümle uydurma olurdu ve personeli olmayan bir sorunu
    // çözmeye gönderirdi.
    assert.equal(formulaErrorLine('bilinmeyen_kod'), 'Formül kaydedilemedi');
    assert.equal(formulaErrorLine(null), 'Formül kaydedilemedi');
    assert.doesNotMatch(formulaErrorLine('bilinmeyen_kod'), /adisyon/i);
});

test('kilit SEBEBİNİ söylüyor', () => {
    assert.match(formulaErrorLine('formula_locked'), /kasaya gitti/);
    assert.match(formulaErrorLine('writes_disabled'), /kapalı/);
    // Her kod AYRI bir cümle: ikisi aynı olsaydı biri ötekini gizlerdi.
    const codes = ['formula_locked', 'forbidden', 'not_found', 'bad_ratio',
        'bad_result', 'writes_disabled', 'no_session'];
    const said = codes.map(formulaErrorLine);
    assert.equal(new Set(said).size, codes.length);
    assert.ok(!said.includes('Formül kaydedilemedi'), 'tanınan kod varsayılana düşmemeli');
});

// ── Dönüşte okuma ───────────────────────────────────────────────────────────

test('müşteri sayfası DÖNÜŞTE yeniden okuyor', () => {
    // Okunmazsa kaydedilen formül geçmiş satırında görünmez ve "Kaydet" yine
    // hiçbir şey yapmamış gibi olur. Kayıt sunucuda; dönüşteki okuma onu
    // geri getiriyor.
    assert.match(card, /useCustomerFile\(/);
    assert.match(read('src/lib/fileSource.ts'),
        /useFocusEffect\(useCallback\(\(\) => \{ void read\(false\); \}, \[read\]\)\)/);
});

// ── Sahte katman ────────────────────────────────────────────────────────────

test('ziyaret kimliği KARARLI — aynı gün aynı kimlik', () => {
    // Kimlik her okumada değişseydi, kaydedilen formül bir sonraki açılışta
    // başka bir ziyarete bakıyor olurdu.
    const first = demoCustomerFile({ id: 'c4' }, TODAY).history.map((r) => r.id);
    const again = demoCustomerFile({ id: 'c4' }, TODAY).history.map((r) => r.id);
    assert.deepEqual(first, again);
    assert.equal(new Set(first).size, first.length, 'kimlikler eşsiz olmalı');
});

test('formülü YAZILABİLİR bir satır demo içinde ULAŞILABİLİR', () => {
    // Kilit `daysAgo > 0` ile geliyor: geçmiş ziyaretler kasaya gitmiş
    // sayılıyor ve kilitli modda Kaydet düğmesi HİÇ çizilmiyor. Bir süre
    // demo verisinde açık + malzemeli + formülsüz hiçbir ziyaret yoktu:
    // `new` modu hiçbir yerden açılamıyor, yani kaydetme yolu telefonda
    // denenemiyordu. Bu test o boşluğun sessizce geri gelmesini engelliyor.
    const open = [];
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12', 'c13']) {
        const person = demoCustomerFile({ id }, TODAY);
        for (const row of person?.history ?? []) {
            if (!row.locked && !row.formula && row.hadMaterial) open.push(person.name);
        }
    }
    assert.ok(open.length > 0,
        'açık + malzemeli + formülsüz en az bir ziyaret olmalı, yoksa `new` modu ölü');
});
