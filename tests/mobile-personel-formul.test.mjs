import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    RATIOS, RESULTS, TONES, WAITS, debtLine, fieldCompare, groupState,
    hasMaterial, historyMark, historyState, isComplete, isLocked, materialsOf,
    modeOf, offList, ratioLabel, ratioValue, saveLabel, sendWarning, stepRatio,
    stepWait, summaryOf,
} from '../mobile/src/lib/formula.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const kumanda = code(read('../mobile/app/(staff-flow)/kumanda.tsx'));
const page = code(read('../mobile/app/(staff-flow)/formul.tsx'));
const file = code(read('../mobile/app/(staff-flow)/musteri.tsx'));
const fields = code(read('../mobile/src/components/FormulaFields.tsx'));
// Personel 12: dört alanın gövdesi iki yüzeyden çıkıp TEK bileşene taşındı.
const bodyc = code(read('../mobile/src/components/FormulaBody.tsx'));
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
    // Gruplar artık `groupsOf` ile diziliyor (Personel 13): üç tür karışmıyor
    // ve sıra sabit — EK HİZMET · ÜRÜN · MALZEME. Malzemenin başlığı ayrı
    // çiziliyor, çünkü o aynı zamanda formülün kapısı.
    assert.ok(kumanda.includes('groupsOf(lines)'), 'gruplar sabit sırada değil');
    assert.ok(kumanda.includes("group.kind !== 'material'"), 'hizmet ve ürünler önce');
    assert.ok(kumanda.includes("g.kind === 'material'"), 'malzeme kendi grubunda');
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
    //
    // Cümle artık iki ekranda değil, ORTAK GÖVDEDE (Personel 12): iki yüzey
    // altı yerde ayrışmıştı ve aynı formül iki farklı söz veriyordu. Test
    // gevşetilmedi, taşındı — tek yerde aranıyor çünkü tek yerde yazılı.
    assert.match(bodyc, /Sayaç kurulmadı/);
    assert.match(kumanda, /waitSource: timerRan \? 'timer' : 'manual'/);
});

test('klavye yalnız serbest notta', () => {
    // Üç alan hazır seçenek: oran · bekleme · sonuç. Üçü de `.map` ile
    // çiziliyor, o yüzden kaynakta ÜÇ `<GridButton` çağrısı görünüyor.
    //
    // Sayı beşti: iki fazlası, `.map` dışında tek tek yazılmış `± adım`
    // düğmeleriydi ve ikisi de ölüydü (A2). Eşik onları da saydığı için
    // `>= 4` yazıyordu; düğmeler kalkınca bu test kırıldı. Beklenti
    // düşürülmedi, DÜZELTİLDİ: ölçülen şey "kaç düğme var" değil, "her
    // alan hazır seçenekle mi çiziliyor".
    //
    // Personel 12 ile ızgaralar ortak gövdeye taşındı; sayım orada yapılıyor.
    const grids = (bodyc.match(/<GridButton/g) ?? []).length;
    assert.equal(grids, 3, 'oran, bekleme ve sonuç hazır seçenek');
    // Klavye TEK yerde: notun kendi adımında. Eskiden not alanı gövdenin
    // içindeydi ve 375 pt'lik telefonda kaydet düğmesiyle birlikte klavyenin
    // altında kalıyordu.
    assert.equal((bodyc.match(/<TextInput/g) ?? []).length, 1, 'tek metin alanı');
    assert.equal((page.match(/<TextInput/g) ?? []).length, 0, 'sayfada klavye yok');
    assert.match(bodyc, /NoteStep/);
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

// ── Kasadaki boşluk ─────────────────────────────────────────────────────────

test('kilitli ve boş ziyaret "bekliyor" DEMİYOR', () => {
    const items = [{ id: 'm1', name: 'Boya', kind: 'material' }];
    // Adisyon açıkken davet: amber, yazılabilir.
    assert.equal(groupState(items, null, false), 'pending');
    assert.equal(summaryOf(null, false), 'formül bekliyor');
    // Kasaya gittiğinde kapı kapandı: "bekliyor" artık yalan.
    assert.equal(groupState(items, null, true), 'missed');
    assert.equal(summaryOf(null, true), 'formül yazılmadı');
    // Yazılmış formül kilitliyken de kendi içeriğini söylüyor.
    const written = { ratio: '1:1,5', waitMinutes: 35, result: 'tuttu' };
    assert.equal(groupState(items, written, true), 'done');
    assert.match(summaryOf(written, true), /1:1,5/);
});

test('kasadaki boş formül dört tire değil, bir cümle gösteriyor', () => {
    assert.match(kumanda, /locked && !written/);
    assert.match(kumanda, /kasada · yazılmadı/);
    // Cümle TEK ve iki yüzeyde AYNI. Eskiden iki dosyada birbirinden hafifçe
    // farklı yazılmıştı — aynı olgu iki türlü anlatılıyordu.
    const one = 'Bu ziyarette formül yazılmadı.';
    assert.ok(kumanda.includes(one), 'kumanda kararlaştırılan cümleyi yazmıyor');
    assert.ok(page.includes(one), 'sayfa kararlaştırılan cümleyi yazmıyor');
    for (const src of [kumanda, page]) {
        assert.match(src, /oran · bekleme · sonuç girilmedi/);
    }
});

test('kaçırılmış formül AMBER değil — amber "hâlâ yapılabilir" der', () => {
    assert.match(kumanda, /missed \? c\.tx3 : c\.am/);
});

// ── A2 · "± adım" düğmeleri kaldırıldı ──────────────────────────────────────
//
// Dört adet vardı: `formul.tsx`'te ikisi, kumandanın `FormulaSheet`'inde
// ikisi. Hepsi `onPress={() => feedback.selection()}` idi — yani yalnız
// titriyorlardı. Dokunan personel değeri girdiğini sanıyordu; bu ölü bir
// kontrolden kötü, çünkü titreşim bir onay sesi.

test('formül ızgaralarında ölü "± adım" düğmesi yok', () => {
    for (const [name, src] of [['formul.tsx', page], ['kumanda.tsx', kumanda]]) {
        assert.ok(!src.includes('±'), `${name}: ± düğmesi geri gelmiş`);
        assert.ok(!/sub="adım"/.test(src), `${name}: "adım" düğmesi geri gelmiş`);
    }
});

test('hiçbir GridButton yalnız titreşim için var değil', () => {
    // `feedback.selection()` tek başına bir eylem değildir: yanında bir
    // durum değişikliği olmalı. Bu kalıp aynı hatayı her biçimde yakalar.
    for (const [name, src] of [['formul.tsx', page], ['kumanda.tsx', kumanda]]) {
        const dead = src.match(/onPress=\{\(\) => feedback\.\w+\(\)\}/g) ?? [];
        assert.deepEqual(dead, [], `${name}: yalnız titreyen düğme var`);
    }
});

test('ızgaranın genişliği çocuk sayısından geliyor, ölü bir proptan değil', () => {
    // `columns` hiçbir zaman okunmuyordu; ± gidince yazdığı sayı da yanlıştı.
    assert.ok(!fields.includes('columns'), 'Grid ölü columns propunu geri almış');
    assert.ok(!page.includes('Grid columns'), 'formul.tsx columns yazıyor');
    assert.ok(!kumanda.includes('Grid columns'), 'kumanda.tsx columns yazıyor');
});

test('liste dışı değer KAYDA giriyor, serbest nota değil', () => {
    // Bu testin öncülü değişti ve değişmesi turun ASIL kazancı.
    //
    // A2'de ± düğmeleri ölü olduğu için kaldırılmıştı ve liste dışı değerin
    // kaçış kapısı serbest nottu. Ama karşılaştırma `formula.ratio`'yu
    // okuyor: nota yazılan `1:2,5`, bir sonraki ziyarette "geçen sefer 1:2"
    // diye görünüyordu — üstelik tam da hatırlanmaya en değer ziyarette.
    //
    // Personel 12 bunu adım satırıyla çözdü: gerçek değer alanın kendisine
    // giriyor. Serbest not asıl işine döndü, etiketinden "liste dışı oran
    // buraya" kalktı.
    assert.match(bodyc, /stepRatio/);
    assert.match(bodyc, /− 0,5/);
    assert.ok(!bodyc.includes('liste dışı oran buraya'), 'not hâlâ oranın deposu');
    assert.ok(!page.includes('liste dışı oran buraya'));
});

// ── Personel 12 · karşılaştırma, adım ve eksiğin dili ───────────────────────

test('oran adımı ikinci terimi 0,5 ile yürütüyor ve sınırda duruyor', () => {
    assert.equal(ratioValue('1:1,5'), 1.5);
    assert.equal(ratioLabel(2), '1:2');
    assert.equal(ratioLabel(2.5), '1:2,5');
    assert.equal(stepRatio('1:2', 1), '1:2,5');
    assert.equal(stepRatio('1:1,5', -1), '1:1');
    // Sınırda null: çağıran düğmeyi SÖNDÜRÜYOR, gizlemiyor — kaybolan bir
    // düğme yerleşimi her basışta oynatırdı.
    assert.equal(stepRatio('1:1', -1), null);
    assert.equal(stepRatio('1:3', 1), null);
});

test('liste dışı oran KAYDA giriyor — turun asıl kazancı', () => {
    // Karşılaştırma `formula.ratio`yu okuyor. Değer serbest notta kalsaydı
    // bir sonraki ziyaret "geçen sefer 1:2" derdi; oysa 1:2,5'ti.
    assert.equal(offList.ratio('1:2,5'), true);
    assert.equal(offList.ratio('1:2'), false);
    assert.equal(offList.wait(40), true);
    assert.equal(offList.wait(30), false);
});

test('bekleme adımı 5 dakika — sayacın gerçek çözünürlüğü', () => {
    assert.equal(stepWait(35, 1), 40);
    assert.equal(stepWait(5, -1), null);
    assert.equal(stepWait(90, 1), null);
});

test('karşılaştırma: seçim yapılana kadar MUTLAK, sonra fark', () => {
    // "+5 dk" demek için ikinci bir değer gerekiyor.
    assert.deepEqual(fieldCompare('var', '35 dk', null), { text: 'geçen sefer 35 dk', strong: false });
    assert.deepEqual(fieldCompare('var', '35 dk', '40 dk'), { text: '35 dk → 40 dk', strong: true });
    // Tekrar da bir karardır.
    assert.deepEqual(fieldCompare('var', '35 dk', '35 dk'), { text: 'geçen seferle aynı', strong: true });
});

test('üç yokluk üç ayrı cümle — boş etiket "veri gelmedi" diye okunur', () => {
    assert.equal(historyState(null, false), 'ilk');
    assert.equal(historyState(null, true), 'yok');
    assert.equal(historyState({ ratio: '1:2' }, true), 'var');
    assert.equal(fieldCompare('ilk', null, null).text, 'ilk ziyaret');
    assert.equal(fieldCompare('yok', null, null).text, 'karşılaştırma yok');
});

test('sayaç satırı GERÇEKTEN sayıyor', () => {
    // Eskiden "2 alan dolu geldi" sabitti: sayaç kurulmadığında bile 2 diyordu.
    assert.equal(debtLine({}, false), 'üç alan kaldı');
    assert.equal(debtLine({}, true), 'iki alan kaldı', 'sayaç kurulduysa bekleme sayılmıyor');
    assert.equal(debtLine({ ratio: '1:2', result: 'tuttu' }, true), 'dört alan hazır');
    assert.equal(debtLine({ ratio: '1:2', result: 'tuttu', wait: 30 }, false), 'dört alan hazır');
});

test('"Şimdilik" gitti: etiket olgu, alt satır imkân', () => {
    const eksik = saveLabel(false, {}, false);
    assert.equal(eksik.label, 'Eksik hâliyle kaydet');
    assert.match(eksik.note, /Kasaya gitmeden düzeltilebilir/);
    assert.ok(!eksik.label.includes('Şimdilik'), 'tutulamayan söz geri gelmiş');
    assert.equal(saveLabel(false, { ratio: '1:2', result: 'tuttu' }, true).note, null);
    assert.equal(saveLabel(true, {}, false).label, 'Düzeltmeyi kaydet');
});

test('gönderme uyarısı window boyunca durur, going\'de düşer', () => {
    const mat = [{ id: 'm', name: 'Boya', kind: 'material' }];
    // O altı saniyede hiçbir şey gönderilmedi ve "Geri al" ekranda: cümle
    // hâlâ doğru ve hâlâ eyleme çevrilebilir.
    assert.match(sendWarning('idle', null, mat), /kalıcı olur/);
    assert.match(sendWarning('window', null, mat), /kalıcı olur/);
    assert.equal(sendWarning('going', null, mat), null, 'karar verildi');
    assert.equal(sendWarning('sealed', null, mat), null);
    // Formül tamsa uyarı yok; malzeme yoksa zaten formül beklenmiyor.
    assert.equal(sendWarning('idle', { ratio: '1:2', result: 'tuttu' }, mat), null);
    assert.equal(sendWarning('idle', null, [{ id: 'k', name: 'Kesim', kind: 'extra' }]), null);
});

test('sonucun ikinci ekseni AYRI alan — result kirletilmiyor', () => {
    // "tuttu · turuncu" diye tek alana yazılsaydı kayıt tekrar açıldığında
    // hangi kelimenin seçili olduğu bulunamazdı.
    assert.deepEqual([...TONES], ['turuncu', 'eşitsiz']);
    assert.match(bodyc, /tags/);
    assert.match(kumanda, /tags: draft\.tags/);
    // Ve yalnız sonuç seçildikten SONRA çiziliyor: varsayılan yerleşimde yok.
    assert.match(bodyc, /draft\.result \? \(\s*<ToneRow/);
});
