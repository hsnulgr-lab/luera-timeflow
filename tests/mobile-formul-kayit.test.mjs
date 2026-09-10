import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { demoCustomerFile } from '../mobile/src/lib/customerFile.ts';
import { saveVisitFormula, resetVisitFormulas } from '../mobile/src/lib/formulaStore.ts';

/**
 * "Kaydet" GERÇEKTEN kaydediyor mu.
 *
 * Düğme eskiden yalnız haptik verip sayfayı kapatıyordu. Personel formülü
 * yazdığını sanıp gidiyor, ertesi ay aynı müşteride hiçbir şey bulamıyordu.
 */

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const page = read('app/(staff-flow)/formul.tsx');
const card = read('app/(staff-flow)/musteri.tsx');
const kumanda = read('app/(staff-flow)/kumanda.tsx');

const TODAY = '2026-09-11';

test('kaydet düğmesi ARTIK bir yere yazıyor', () => {
    assert.doesNotMatch(page, /onPress=\{\(\) => \{ feedback\.medium\(\); router\.back\(\); \}\}/,
        'haptik + geri, kayıt yok — düzeltilen davranış');
    assert.match(page, /saveVisitFormula\(params\.id, \{/);
});

test('formül sayfası neye yazacağını BİLİYOR', () => {
    // Kimlik geçirilmezse `saveVisitFormula` sessizce hiçbir şey yapardı.
    assert.match(card, /id: row\.id,/);
    assert.match(page, /id\?: string;/);
});

test('malzeme İSTEMCİDEN gönderilmiyor', () => {
    // O yarı adisyondan türüyor (staff-api · visit.formula). İstemcinin
    // listesine güvenmek, adisyonla formülün ayrışması demek.
    const save = page.slice(page.indexOf('saveVisitFormula(params.id'), page.indexOf('feedback.medium();'));
    assert.match(save, /materials: \[\],/);
});

test('kumanda da AYNI depoya yazıyor ve ondan okuyor', () => {
    // İki yüzey ayrı yere yazsaydı, kumandada yazılan formül müşteri
    // sayfasında görünmezdi.
    assert.match(kumanda, /saveVisitFormula\(appointment\.id, next\)/);
    assert.match(kumanda, /visitFormulaOf\(base\?\.id\)/);
});

test('müşteri sayfası DÖNÜŞTE yeniden okuyor', () => {
    // Okunmazsa kaydedilen formül geçmiş satırında görünmez ve "Kaydet"
    // yine hiçbir şey yapmamış gibi olur.
    // `mudur/profile.tsx` ile aynı desen: durum + `useFocusEffect(load)`.
    // Önce bir "tazeleme sayacı" denendi; lint haklı olarak takıldı —
    // kullanılmayan bir bağımlılık, useMemo'nun ne zaman yeniden çalıştığını
    // okunamaz yapıyordu.
    assert.match(card, /const \[file, setFile\] = useState<CustomerFile \| null>\(load\)/);
    assert.match(card, /useFocusEffect\(useCallback\(\(\) => \{ setFile\(load\(\)\); \}, \[load\]\)\)/);
});

// ── Davranış ────────────────────────────────────────────────────────────────

test('kaydedilen formül geçmiş satırında GÖRÜNÜYOR', () => {
    resetVisitFormulas();
    // Nazlı Koç (c6): defterde `hasFormula: false` — formülsüz bir kişi.
    const before = demoCustomerFile({ id: 'c6' }, TODAY);
    assert.equal(before.formulas, 0);
    assert.equal(before.formula, null);
    const row = before.history[0];
    assert.equal(row.formula, false);

    saveVisitFormula(row.id, {
        materials: [], ratio: '1:1,5', waitMinutes: 30, waitSource: 'timer',
        result: 'tuttu', tags: [], note: null, staffId: null, writtenAt: TODAY,
    });

    const after = demoCustomerFile({ id: 'c6' }, TODAY);
    assert.equal(after.formulas, 1);
    assert.equal(after.history[0].formula, true);
    assert.equal(after.history[0].detail?.ratio, '1:1,5');
    resetVisitFormulas();
});

test('kaydedilen formül KARTA da çıkıyor', () => {
    resetVisitFormulas();
    const row = demoCustomerFile({ id: 'c6' }, TODAY).history[0];
    saveVisitFormula(row.id, {
        materials: [], ratio: '1:2', waitMinutes: null, waitSource: 'manual',
        result: 'açık kaldı', tags: [], note: 'uçlar gözenekli',
        staffId: null, writtenAt: TODAY,
    });

    const card2 = demoCustomerFile({ id: 'c6' }, TODAY).formula;
    assert.equal(card2?.ratio, '1:2');
    assert.equal(card2?.note, 'uçlar gözenekli');
    // Bekleme ölçülmediyse UYDURULMUYOR.
    assert.equal(card2?.wait, '—');
    assert.equal(card2?.waitSpan, null);
    // Renk KARARDAN çıkıyor: "tuttu" yeşil, ötekiler amber.
    assert.equal(card2?.tone, 'am');
    resetVisitFormulas();
});

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
            // Satırın dokunulabilir olması için bir İŞARET gerekiyor
            // (`HistoryLine`: işaret yoksa düz satır). Malzeme geçmişse
            // formül beklenir, işaret çizilir.
            if (!row.locked && !row.formula && row.hadMaterial) open.push(person.name);
        }
    }
    assert.ok(open.length > 0,
        'açık + malzemeli + formülsüz en az bir ziyaret olmalı, yoksa `new` modu ölü');
});

test('bir müşterinin formülü ÖTEKİNE geçmiyor', () => {
    resetVisitFormulas();
    const mine = demoCustomerFile({ id: 'c6' }, TODAY).history[0];
    saveVisitFormula(mine.id, {
        materials: [], ratio: '1:1', waitMinutes: 10, waitSource: 'manual',
        result: 'tuttu', tags: [], note: null, staffId: null, writtenAt: TODAY,
    });
    const other = demoCustomerFile({ id: 'c8' }, TODAY);
    assert.equal(other.formulas, 0);
    assert.equal(other.formula, null);
    resetVisitFormulas();
});
