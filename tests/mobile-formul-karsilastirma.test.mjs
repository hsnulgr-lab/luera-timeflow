import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { comparisonFor, materialField, toCustomerFile } from '../mobile/src/lib/customerFileMap.ts';

/**
 * "GEÇEN SEFER" GERÇEK Mİ.
 *
 * Kuaförün altı ay sonra sorduğu tek soru "geçen sefer bu saça ne yapmıştım?"
 * ve bir sonraki karışım o cevaba göre ayarlanıyor. Cevap bugüne kadar
 * SABİTTİ: `12 Mart · MK · 1:1,5 · 35 dk · açık kaldı`, hangi müşteri
 * açılırsa açılsın aynı. Uydurma bir geçmiş, hiç geçmiş olmamasından kötü.
 */

const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
const page = read('app/(staff-flow)/formul.tsx');
const kumanda = read('app/(staff-flow)/kumanda.tsx');
const card = read('app/(staff-flow)/musteri.tsx');
const server = readFileSync(
    new URL('../supabase/functions/staff-api/index.ts', import.meta.url), 'utf8');

const formula = (over = {}) => ({
    materials: [], ratio: '1:1,5', waitMinutes: 35, waitSource: 'manual',
    result: 'tuttu', tags: [], note: null, staffId: 's1',
    writtenAt: '2026-03-12T10:00:00.000Z', ...over,
});

/** Sunucunun döndüğü satır şekli — yeniden eskiye. */
const srv = (id, over = {}) => ({
    id, date: '2026-03-12', service: 'Saç boyama', status: 'confirmed',
    hadMaterial: true, itemsUsed: [], formula: null, locked: true,
    staffName: 'Merve Kaya', mine: false, materials: [], ...over,
});

const file = (rows) => toCustomerFile({ customer: { id: 'c1', name: 'Ayşe' }, history: rows }, '2026-09-13');

// ── Sabit kalktı mı ─────────────────────────────────────────────────────────

test('uydurma karşılaştırma İKİ yüzeyden de kalktı', () => {
    // Yorumlar eleniyor: kural KODA ait. İki dosyanın açıklaması kaldırılan
    // sabiti alıntılıyor ve o alıntı bir kusur değil, kaydın kendisi.
    const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const [name, src] of [['formul', code(page)], ['kumanda', code(kumanda)]]) {
        assert.doesNotMatch(src, /DEMO_PREVIOUS/, `${name} hâlâ sabit formüle bakıyor`);
        assert.doesNotMatch(src, /12 Mart/, `${name} hâlâ uydurma tarihi taşıyor`);
    }
    assert.doesNotMatch(code(page), /DEMO_MATERIALS/);
    // Sayfa artık kimin geçmişine bakacağını BİLİYOR.
    assert.match(card, /customerId: file\.id,/);
    assert.match(page, /customerId\?: string;/);
    assert.match(page, /useCustomerFile\(params\.customerId, undefined\)/);
});

// ── Hangi ziyaret "geçen sefer" ─────────────────────────────────────────────

test('geçen sefer = daha ESKİ ve formüllü ilk ziyaret', () => {
    const f = file([
        srv('v3', { date: '2026-09-10' }),
        srv('v2', { date: '2026-08-01', formula: formula({ ratio: '1:2' }) }),
        srv('v1', { date: '2026-07-01', formula: formula({ ratio: '1:1' }) }),
    ]);
    const out = comparisonFor(f.history, 'v3');
    assert.equal(out.state, 'var');
    assert.equal(out.previous.ratio, '1:2', 'en yakın eski formül seçilmeli');
    assert.equal(out.previous.waitMinutes, 35);
    assert.equal(out.previous.initials, 'MK');
});

test('formülsüz kesimler ATLANIYOR', () => {
    // Aradaki kesim karşılaştırılacak bir değer taşımıyor; onu "geçen sefer"
    // saymak, gerçekten karşılaştırılabilir olanı gizlerdi.
    const f = file([
        srv('v3', { date: '2026-09-10' }),
        srv('v2', { date: '2026-08-01', service: 'Kesim', hadMaterial: false }),
        srv('v1', { date: '2026-07-01', formula: formula({ ratio: '1:1' }) }),
    ]);
    assert.equal(comparisonFor(f.history, 'v3').previous.ratio, '1:1');
});

test('SONRAKİ ziyaret geçen sefer sayılmıyor', () => {
    // Liste yeniden eskiye; bakılan ziyaretten YENİ olanı göstermek, geleceği
    // geçmiş diye okutmak olurdu.
    const f = file([
        srv('v3', { date: '2026-09-10', formula: formula({ ratio: '1:2' }) }),
        srv('v2', { date: '2026-08-01' }),
        srv('v1', { date: '2026-07-01' }),
    ]);
    const out = comparisonFor(f.history, 'v2');
    assert.equal(out.previous, null);
    assert.equal(out.state, 'yok', 'daha eski ziyaret var ama formülü yok');
});

test('"geçmiş yok" ile "formül yazılmamış" AYRI', () => {
    const only = file([srv('v1', { date: '2026-09-10' })]);
    assert.deepEqual(comparisonFor(only.history, 'v1'), { previous: null, state: 'ilk' });

    const twice = file([srv('v2', { date: '2026-09-10' }), srv('v1', { date: '2026-07-01' })]);
    assert.equal(comparisonFor(twice.history, 'v2').state, 'yok');
});

test('listede olmayan ziyaret karşılaştırma UYDURMUYOR', () => {
    // Sunucu son 10 ziyareti dönüyor. Daha eski bir kayda bakılıyorsa listenin
    // en yenisini "geçen sefer" diye göstermek, sonraki bir ziyareti geçmiş
    // gibi okutmak olurdu.
    // Liste FORMÜLLÜ satır taşımalı, yoksa "bulunamadı" ile "karşılaştıracak
    // bir şey yok" aynı cevabı verir ve test hiçbir şey ayırt etmez.
    const f = file([
        srv('v3', { date: '2026-09-10' }),
        srv('v2', { date: '2026-08-01', formula: formula({ ratio: '1:2' }) }),
    ]);
    assert.deepEqual(comparisonFor(f.history, 'cok-eski'), { previous: null, state: 'ilk' });
    assert.deepEqual(comparisonFor(f.history, null), { previous: null, state: 'ilk' });
    // Aynı liste, LİSTEDEKİ bir ziyaret için karşılaştırma ÜRETİYOR — yani
    // yukarıdaki boşluk "veri yok"tan değil, kimliğin bulunamamasından.
    assert.equal(comparisonFor(f.history, 'v3').previous.ratio, '1:2');
});

test('imzası okunamayan ziyaret baş harf UYDURMUYOR', () => {
    const f = file([
        srv('v2', { date: '2026-09-10' }),
        srv('v1', { date: '2026-07-01', formula: formula(), staffName: null }),
    ]);
    assert.equal(comparisonFor(f.history, 'v2').previous.initials, '');
});

// ── Malzeme ─────────────────────────────────────────────────────────────────

test('sunucu ziyaretin MALZEMESİNİ miktarıyla gönderiyor', () => {
    // `itemsUsed`ten türetilemez: orası ürünü de sayıyor, tekilleştiriyor ve
    // miktarı atıyor. Formül sayfası için ×2 ile ×1 arasındaki fark önemli.
    assert.match(server, /materials: Array\.isArray\(row\.adisyon_items\)/);
    const cut = server.slice(server.indexOf('materials: Array.isArray(row.adisyon_items)'));
    assert.match(cut.slice(0, 400), /item\?\.kind === 'material'/);
    assert.match(cut.slice(0, 400), /qty: typeof item\.qty === 'number' \? item\.qty : 1/);
});

test('malzeme alanının ÜÇ hâli', () => {
    const f = file([
        srv('v3', { materials: [{ name: 'Boya · 7.3', qty: 2 }, { name: 'Oksidan %6', qty: 1 }] }),
        srv('v2', { hadMaterial: false, materials: [] }),
        // Malzeme geçmiş ama listesi gelmemiş — eski sunucu dağıtımı.
        srv('v1', { hadMaterial: true, materials: [] }),
    ]);
    const [full, none, unknown] = f.history;

    assert.deepEqual(materialField(full),
        { rows: [['Boya · 7.3', '×2'], ['Oksidan %6', '×1']], unknown: false });
    // Malzeme GEÇMEDİ: boş ve bilinmiyor DEĞİL.
    assert.deepEqual(materialField(none), { rows: [], unknown: false });
    // OKUNAMADI: boş ama bunu söylüyor. İkisini aynı çizmek, personele
    // adisyonunda olmayan bir boşluk göstermek olurdu.
    assert.deepEqual(materialField(unknown), { rows: [], unknown: true });
    // Satır hiç yoksa da iddia yok.
    assert.deepEqual(materialField(null), { rows: [], unknown: false });
});

test('sayfa "okunamadı" hâlini SÖYLÜYOR', () => {
    assert.match(page, /material\.unknown/);
    assert.match(page, /adisyondan · okunamadı/);
    assert.match(page, /materials=\{material\.rows\}/);
});

// ── Bilinmiyor hâli ekranlara taşınıyor mu ──────────────────────────────────

test('dosya okunmadan ekran İDDİA ETMİYOR', () => {
    // `comparison` null iken kapı, satır ve etiketler sessiz kalıyor.
    for (const [name, src] of [['formul', page], ['kumanda', kumanda]]) {
        assert.match(src, /comparison\?\.previous \?\? null/, `${name}`);
        assert.match(src, /comparison\?\.state \?\? null/, `${name}`);
    }
    const body = read('src/components/FormulaBody.tsx');
    assert.match(body, /if \(state === null\) return null;/);
});
