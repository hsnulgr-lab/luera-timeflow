import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    RATIOS, RESULTS, WAITS, groupState, hasMaterial, historyMark,
    isComplete, isLocked, materialsOf, modeOf, summaryOf,
} from '../mobile/src/lib/formula.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const kumanda = code(read('../mobile/app/(staff-flow)/kumanda.tsx'));
const page = code(read('../mobile/app/(staff-flow)/formul.tsx'));
const file = code(read('../mobile/app/(staff-flow)/musteri.tsx'));
const fields = code(read('../mobile/src/components/FormulaFields.tsx'));
const api = code(read('../supabase/functions/staff-api/index.ts'));
const sql = read('../supabase/090_visit_formula.sql');

const MAT = [
    { id: 'k3', name: 'Boya · 7.3 kumral', kind: 'material', qty: 2 },
    { id: 'k4', name: 'Oksidan %6', kind: 'material', qty: 1 },
];
const CUT = [{ id: 'k1', name: 'Kesim', kind: 'extra', price: 350, qty: 1 }];

// ── Kural veriden türüyor ───────────────────────────────────────────────────

test('boya işi geçmemişse formül alanı YOK — kısık da değil, boş da değil', () => {
    // Kesimde formül alanı görmek personele "bir şey eksik bıraktım" dedirtir.
    assert.equal(groupState(CUT, null), 'none');
    assert.equal(hasMaterial(CUT), false);
});

test('malzeme varsa başlık bekliyor, dört alan tamamsa yazıldı', () => {
    assert.equal(groupState(MAT, null), 'pending');
    assert.equal(groupState(MAT, { ratio: '1:1,5', result: 'tuttu' }), 'done');
    // Yalnız oran girilmişse hâlâ bekliyor: iki alan da personelin.
    assert.equal(groupState(MAT, { ratio: '1:1,5', result: null }), 'pending');
});

test('malzeme yarısı adisyondan türüyor', () => {
    const mats = materialsOf([...CUT, ...MAT]);
    assert.equal(mats.length, 2);
    assert.deepEqual(mats[0], { id: 'k3', name: 'Boya · 7.3 kumral', qty: 2 });
});

// ── Başlığın içerik satırı ──────────────────────────────────────────────────

test('yazıldığında başlık SONUCUN KENDİSİNİ söylüyor', () => {
    // "Formül yazıldı" bir onay; "1:1,5 · 35 dk · tuttu" bilgi.
    assert.equal(
        summaryOf({ ratio: '1:1,5', waitMinutes: 35, result: 'tuttu' }),
        '1:1,5 · 35 dk · tuttu',
    );
    assert.equal(summaryOf(null), 'formül bekliyor');
});

test('bekleme yoksa özet onu ATLIYOR, boş yer bırakmıyor', () => {
    assert.equal(summaryOf({ ratio: '1:1', waitMinutes: null, result: 'tuttu' }), '1:1 · tuttu');
});

// ── Kilit ───────────────────────────────────────────────────────────────────

test('kilit VERİDEN geliyor, saklanan bir bayraktan değil', () => {
    assert.equal(isLocked({ is_paid: true }), true);
    assert.equal(isLocked({ status: 'completed' }), true);
    assert.equal(isLocked({ is_paid: false, status: 'confirmed' }), false);
});

test('dört mod: düzelt · yeni · kilitli · kilitli-boş', () => {
    assert.equal(modeOf({ formula: { ratio: '1:1' } }), 'edit');
    assert.equal(modeOf({}), 'new');
    assert.equal(modeOf({ is_paid: true, formula: { ratio: '1:1' } }), 'locked');
    assert.equal(modeOf({ is_paid: true }), 'lockedEmpty');
});

// ── Geçmiş satırının işareti (08 · 4b) ──────────────────────────────────────

test('geçmiş satırı üç hâl: formül · formül yok · hiçbir şey', () => {
    assert.equal(historyMark({ hasFormula: true, hadMaterial: true }), 'formül');
    assert.equal(historyMark({ hasFormula: false, hadMaterial: true }), 'formül yok');
    // Boya işi geçmemiş ziyaret: eksik olan bir şey yok, satır düz.
    assert.equal(historyMark({ hasFormula: false, hadMaterial: false }), null);
});

test('GELMEMİŞ randevuda formül beklenmiyor', () => {
    // Ortada işlem yok, yazılacak formül de yok. 08 ile 09 burada
    // çelişiyordu; kural veriden türüyor.
    assert.equal(historyMark({ hasFormula: false, hadMaterial: true, status: 'no_show' }), null);
    assert.equal(historyMark({ hasFormula: false, hadMaterial: true, status: 'cancelled' }), null);
});

// ── Kapalı kümeler ──────────────────────────────────────────────────────────

test('oran ve sonuç KAPALI küme — klavye yok', () => {
    assert.deepEqual([...RATIOS], ['1:1', '1:1,5', '1:2']);
    assert.deepEqual(RESULTS.map((r) => r.label), ['Tuttu', 'Açık kaldı', 'Koyu çıktı']);
    assert.deepEqual([...WAITS], [25, 30, 35]);
});

test('sonuç bir ÖLÇEK değil — kaydırmalı ölçek sahte hassasiyet', () => {
    assert.ok(!fields.includes('Slider'), 'ölçek bileşeni girmemeli');
    assert.ok(!page.includes('Slider'));
});

// ── Kumanda: malzeme grubunun başlığı ───────────────────────────────────────

test('formül girişi malzeme grubunun BAŞLIĞI — ayrı bir kart değil', () => {
    // Formül listede zaten duran satırların tarifi; gönder düğmesinin üstüne
    // ikinci bir amber kart koymak dikkati bölüyordu.
    assert.ok(kumanda.includes('function GroupHead('));
    assert.ok(kumanda.includes("line.kind !== 'material'"), 'hizmet ve ürünler önce');
    assert.ok(kumanda.includes("line.kind === 'material'"), 'malzeme kendi grubunda');
});

test('başlık YAPIŞKAN değil, pinlenen kopya', () => {
    // Yapışkan başlık kaydırma boyunca kalem satırlarını örterdi.
    assert.ok(kumanda.includes('!headSeen'), 'kopya yalnız gerçek başlık görünmezken');
    assert.ok(kumanda.includes('headY.current'), 'başlığın konumu ölçülüyor');
    assert.ok(kumanda.includes('pinned'), 'kopya ayrı bir hâl');
});

test('pinlenen kopya SAYDAM değil — altındaki satır okunurdu', () => {
    assert.ok(kumanda.includes("'#241B0E'") && kumanda.includes("'#16220F'"));
});

// ── Kumanda: alerji ─────────────────────────────────────────────────────────

test('alerji işareti ADIN YANINDA, düğme sırasında değil', () => {
    // Düğme sırası EYLEM sırası; alerji bir DURUM.
    assert.ok(kumanda.includes("<Glyph name=\"warn\""));
    assert.ok(kumanda.includes('risks.length > 0 ?'));
    assert.ok(!/Tool label="Alerji"/.test(kumanda), 'dördüncü düğme olmamalı');
});

test('risk işareti ÜÇ EVREDE de görünüyor', () => {
    // Boyayı sürdükten sonra öğrenilen alerji öğrenilmemiş sayılır: işaret
    // plakada yaşıyor ve plaka üç evrede de aynı bileşen.
    const plate = kumanda.slice(kumanda.indexOf('function Plate('), kumanda.indexOf('function RiskRow('));
    assert.ok(plate.includes('risks'), 'plaka riski taşıyor');
    assert.ok(!/phase === 'closing'[\s\S]{0,80}risks/.test(plate), 'evreye bağlanmamalı');
});

test('işaret BÖLÜNMÜYOR: tür ve sayı açılan satırda', () => {
    assert.ok(kumanda.includes('`Risk · ${risks.length} kural`'));
    assert.ok(kumanda.includes('risks.length > 3'), 'üçten fazlası kartta');
});

test('iki ölü düğme bağlandı', () => {
    assert.ok(kumanda.includes('onPress={onCall}'));
    assert.ok(kumanda.includes('onPress={onCard}'));
    assert.ok(kumanda.includes('`tel:${appointment.customer_phone'));
});

// ── Formül sayfası ──────────────────────────────────────────────────────────

test('kilitli sayfada KISIK bir düzelt düğmesi yok', () => {
    // Yapılamayan görünmüyor, sebebi görünüyor.
    assert.ok(page.includes('{locked ? null : ('), 'kaydet düğmesi kilitliyken hiç çizilmiyor');
    assert.ok(page.includes('<LockLine'));
});

test('alt sayfa ile tam sayfa AYNI gövdeyi kullanıyor', () => {
    // İki ayrı uygulama zamanla ayrışırdı.
    assert.ok(page.includes("from '../../src/components/FormulaFields'"));
    assert.ok(kumanda.includes("from '../../src/components/FormulaFields'"));
});

test('bekleme sayaç kurulmamışsa alan KALKMIYOR', () => {
    // Kaldırmak dört alanın sabit sırasını bozar; boş bırakmak ölçülmemişle
    // sıfırı karıştırır.
    assert.ok(page.includes("'sayaç kurulmadı'"));
    assert.ok(kumanda.includes("'sayaç kurulmadı'"));
    assert.ok(kumanda.includes("waitSource: wait != null ? 'timer' : 'manual'"));
});

test('klavye yalnız serbest notta', () => {
    // Oran dört kutu (üçü + adım), sonuç üç kelime — hepsi `.map` ile
    // çiziliyor, o yüzden kaynakta beş `<GridButton` görünüyor.
    const grids = (page.match(/<GridButton/g) ?? []).length;
    assert.ok(grids >= 4, 'oran ve sonuç hazır seçenek');
    assert.equal((page.match(/<TextInput/g) ?? []).length, 1, 'tek metin alanı');
});

// ── Müşteri sayfası ─────────────────────────────────────────────────────────

test('sayfada TEK kabuk var: son formül kartı', () => {
    // Kabuk sorunun cevabında, başka hiçbir yerde değil.
    assert.equal((file.match(/borderRadius: 22/g) ?? []).length, 1);
});

test('"Önceki formüller" bölümü YOK — geçmişle ikizdi', () => {
    assert.ok(!file.includes('Önceki formüller'));
    assert.ok(file.includes('title="Geçmiş"'));
});

test('geçmiş satırı dokunulabilir, formül beklenmeyen satır DÜZ', () => {
    assert.ok(file.includes('if (!mark) return <View style={style}>{body}</View>;'));
});

test('kartta para YOK', () => {
    for (const money of ['₺', 'bakiye', 'Bakiye', 'borç', 'tahsil']) {
        assert.ok(!file.includes(money), `${money} girmemeli`);
    }
});

test('maske alerjinin TÜRÜNÜ söylüyor, detayını değil', () => {
    assert.ok(file.includes("label: 'Risk · Alerji'"));
    assert.ok(file.includes('danger'));
});

test('paket 8 seansı aşınca çizgi değil oran çubuğu', () => {
    // Yirmi seanslık pakette yirmi çizgi sığmaz.
    assert.ok(file.includes('const ticks = pack.total <= 8;'));
});

// ── Sunucu ──────────────────────────────────────────────────────────────────

test('formula kolonu randevunun üstünde, ayrı tablo değil', () => {
    assert.ok(sql.includes('ALTER TABLE public.reservations'));
    assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS formula JSONB'));
    assert.ok(!/CREATE TABLE/.test(sql), 'ikinci bir RLS yüzeyi açılmamalı');
});

test('visit.formula ucu kilidi VERİDEN okuyor', () => {
    assert.ok(api.includes("action === 'visit.formula'"));
    const cut = api.slice(api.indexOf("action === 'visit.formula'"), api.indexOf("action === 'visit.finish'"));
    assert.ok(cut.includes("res!.is_paid === true || res!.status === 'completed'"));
    assert.ok(cut.includes("json({ error: 'formula_locked' }, 409)"));
});

test('malzeme yarısı SUNUCUDA türüyor, istemciden gelmiyor', () => {
    // İstemcinin listesine güvenmek adisyonla formülün ayrışması demek.
    const cut = api.slice(api.indexOf("action === 'visit.formula'"), api.indexOf("action === 'visit.finish'"));
    assert.ok(cut.includes("res!.adisyon_items"));
    assert.ok(!/body_\.materials/.test(cut), 'malzeme gövdeden okunmamalı');
});

test('oran ve sonuç biçimi doğrulanıyor', () => {
    const cut = api.slice(api.indexOf("action === 'visit.formula'"), api.indexOf("action === 'visit.finish'"));
    assert.ok(cut.includes("json({ error: 'bad_ratio' }, 400)"));
    assert.ok(cut.includes("json({ error: 'bad_result' }, 400)"));
});

test('customer ucu geçmiş satırına formül ve kilit ekliyor', () => {
    const cut = api.slice(api.indexOf("action === 'customer'"), api.indexOf("action === 'performance'"));
    assert.ok(cut.includes('hadMaterial:'), 'boya işi geçmiş mi');
    assert.ok(cut.includes('locked:'), 'kilit satırda');
    assert.ok(cut.includes('staffName:'), 'kim yaptı');
});

// ── Türkçe büyütme ──────────────────────────────────────────────────────────

test('büyük harfli etiketler Türkçe büyütme kullanıyor', () => {
    // `textTransform: 'uppercase'` dile duyarsız: "RİSK · ALERJİ" ekranda
    // "RISK · ALERJI" oluyordu. Projede bunun için `upperTR` var.
    for (const [name, src] of [['musteri', file], ['alanlar', fields]]) {
        assert.ok(!src.includes("textTransform: 'uppercase'"), `${name}: dile duyarsız büyütme`);
        assert.ok(src.includes('upperTR('), `${name}: upperTR kullanılmalı`);
    }
});

test('büyük ad satırı Ö ve Ş işaretlerini KIRPMIYOR', () => {
    // Tasarımın 1.02 satır yüksekliği CSS'te sorun değil; RN o kutuda büyük
    // harfin üstündeki işareti kesiyor ve "Öztürk" → "Oztürk" oluyordu.
    assert.ok(!/lineHeight: \(small \? 28 : 34\) \* 1\.02/.test(file));
    assert.ok(file.includes('* 1.22'), 'ad satırı nefes almalı');
    assert.ok(page.includes('* 1.22'));
});
