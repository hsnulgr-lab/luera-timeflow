import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    addOutcome, addedTotal, breakdownLine, editNote, formulaFace, frequentHead, kalemCount,
    newestFirst, receiptParts, sadeTotal, stripLine, undoNote,
} from '../mobile/src/lib/adisyonSade.ts';
import { markDelete, money } from '../mobile/src/lib/adisyon.ts';
import { dark, light } from '../mobile/src/theme/tokens.ts';

// Personel 15 · iş sürerken adisyon, sade (Yol A) — YALNIZ tek kişilik.
// Kaynak: `docs/design-reference/Luera Mobil - Personel 15 Adisyon Sade.html`.
// Kullanıcının dört derdi: çok fazla bölüm · soluk/küçük yazı · tutar
// anlaşılmıyor · ekleme zor ("eklendi mi anlamıyorum", "adet/silme zor").

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const screen = code(read('../mobile/app/(staff-flow)/kumanda.tsx'));
const parts = code(read('../mobile/src/components/AdisyonSade.tsx'));
const ink = code(read('../mobile/src/lib/sadeInk.ts'));

const SVC = [{ name: 'Saç boyama', amount: 1800 }];
const KER = { id: 'a', name: 'Keratin bakım', kind: 'extra', price: 450, qty: 1 };
const FON = { id: 'b', name: 'Fön', kind: 'extra', price: 150, qty: 1 };
const SAMP = { id: 'c', name: 'Şampuan 250 ml', kind: 'product', price: 320, qty: 1 };
const BOYA = { id: 'd', name: 'Boya 7.3', kind: 'material', qty: 2 };
const OKS = { id: 'e', name: 'Oksidan %6', kind: 'material', qty: 1 };
const BASE = [KER, FON, SAMP, BOYA, OKS];

// ── Sayılar ─────────────────────────────────────────────────────────────────

test('"kalem" tek anlamda: randevu + ek hizmet + ürün; malzeme kalem DEĞİL', () => {
    // Canlıda kadran "2 kalem" (hizmet + Ağda), şerit "1 kalem" diyordu.
    assert.equal(kalemCount(SVC, BASE), 4);
    assert.equal(kalemCount(SVC, []), 1, 'yalnız randevu hizmeti');
    // Silinmek üzere olan satır sayılmıyor.
    assert.equal(kalemCount(SVC, markDelete(BASE, 'a')), 3);
    // Kadran ve şerit AYNI sayıyı yazıyor.
    assert.match(screen, /<SadeClosingDial[\s\S]*?count=\{kalem\}/);
    assert.match(screen, /<SadeStrip[\s\S]*?count=\{kalem\}/);
});

test('toplam = randevu + Σ fiyat × adet; malzeme toplama girmez', () => {
    // Tasarımın örneği: ₺1.800 + ₺920 = ₺2.720.
    assert.equal(sadeTotal(SVC, BASE), 2720);
    assert.equal(addedTotal([{ ...SAMP, qty: 2 }]), 640, 'fiyat × adet');
    assert.equal(sadeTotal([{ name: 'Saç boyama', amount: null }], [KER]), 450, 'bilinmeyen ücret uydurulmuyor');
});

test('kırılım: "Saç boyama ₺1.800 + 3 kalem ₺920"', () => {
    assert.equal(breakdownLine(SVC, BASE, money), 'Saç boyama ₺1.800 + 3 kalem ₺920');
    assert.equal(breakdownLine(SVC, [], money), 'Saç boyama ₺1.800 · eklenen kalem yok');
});

test('şerit: "4 kalem · son …" ya da "yalnız randevu hizmeti"', () => {
    assert.deepEqual(stripLine(4, 'Oksidan %6'), { count: '4 kalem', tail: 'son Oksidan %6' });
    assert.deepEqual(stripLine(1, null), { count: '1 kalem', tail: 'yalnız randevu hizmeti' });
});

// ── Ekleme ──────────────────────────────────────────────────────────────────

test('en yeni ÜSTTE; malzeme kendi bölümünde', () => {
    const { kalem, malzeme } = newestFirst(BASE);
    assert.deepEqual(kalem.map((l) => l.id), ['c', 'b', 'a']);
    assert.deepEqual(malzeme.map((l) => l.id), ['e', 'd']);
});

test('dokunuşun sonucu: yeni · ×2 oldu · tavan (20)', () => {
    const fresh = addOutcome(BASE, { name: 'Bakım maskesi', kind: 'product', price: 250 }, 'n1');
    assert.equal(fresh.kind, 'new');
    assert.equal(fresh.next.length, BASE.length + 1);

    const inc = addOutcome(BASE, { name: 'Fön', kind: 'extra', price: 150 }, 'n2');
    assert.equal(inc.kind, 'inc');
    assert.equal(inc.id, 'b', 'artış satırın KENDİSİNDE');
    assert.equal(inc.qty, 2);
    // Adet artışı satırın yerini değiştirmiyor.
    assert.deepEqual(newestFirst(inc.next).kalem.map((l) => l.id), ['c', 'b', 'a']);

    const full = addOutcome([{ ...FON, qty: 20 }], { name: 'Fön', kind: 'extra', price: 150 }, 'n3');
    assert.equal(full.kind, 'max');
    assert.equal(full.next[0].qty, 20, 'tavanda liste değişmiyor');
});

test('makbuz ne olduğunu YAZIYOR ve kalıcı', () => {
    assert.deepEqual(receiptParts({ kind: 'new', name: 'Bakım maskesi', qty: 1, material: false }),
        { bold: 'Bakım maskesi eklendi', rest: ' · listenin en üstünde' });
    assert.deepEqual(receiptParts({ kind: 'inc', name: 'Fön', qty: 2, material: false }),
        { bold: 'Fön ×2 oldu', rest: ' · satırı yerinde' });
    assert.deepEqual(receiptParts({ kind: 'max', name: 'Fön', qty: 20, material: false }),
        { bold: 'Fön', rest: ' zaten 20 adet · en çok 20' });
    assert.equal(receiptParts(null), null);
    assert.match(parts, /RECEIPT_IDLE/);
    // 0,9 sn'lik parlama YOK: kutu durum olarak kalıyor.
    assert.ok(!/setTimeout\(\(\) => setAdded\(null\), 900\)/.test(parts));
    assert.match(parts, /Adisyonda\{inQty > 1 \? ` ×\$\{inQty\}` : ''\}/);
});

test('etiketler sayfa her açılışta temizleniyor', () => {
    assert.match(screen, /const openAdisyon = \(\) => \{[\s\S]*?setTags\(\{\}\);[\s\S]*?setReceipt\(null\);[\s\S]*?setSheet\('catalog'\);/);
});

// ── Adet ve kaldırma ────────────────────────────────────────────────────────

test('adet ve kaldırma satır PANELİNDE; uzun basma ve kaydırma yok', () => {
    assert.equal(editNote(1), 'En az 1 adet · silmek için Kaldır');
    assert.equal(editNote(20), 'En çok 20 adet');
    assert.equal(editNote(3), 'Adet 1–20');
    assert.match(parts, /width: 68, height: 64, borderRadius: 20/);
    assert.ok(!/onLongPress/.test(parts));
    assert.match(screen, /solo && editLine && !delivered \? \(\s*<Sheet onClose=\{\(\) => setEditing\(null\)\}>/);
});

test('geri alma penceresi: satırın yerinde, fitil SOL UÇ SABİT', () => {
    assert.equal(undoNote({ kind: 'extra' }, true), 'Pencere kapanınca liste gönderilir');
    assert.equal(undoNote({ kind: 'material' }, true), 'Formülün malzeme yarısı değişir');
    // Eski fitil `scaleX` ile ORTAYA kısalıyordu (telefonda görüldü).
    assert.match(parts, /transform: \[\{ translateX: x \}\]/);
    assert.ok(!/scaleX/.test(parts));
    // İkinci kaldırma bir öncekinin penceresini kapatıyor (satır asılı kalmıyor).
    assert.match(screen, /markDelete\(pending \? commitDelete\(current, pending\.id\) : current, id\)/);
});

// ── Maske ───────────────────────────────────────────────────────────────────

test('tek kişilikte maske YOK: tutar hep açık (kullanıcı kararı, 2026-10-15)', () => {
    // Sahip tutarı müşteriye zaten kendisi söylüyor; "Göster"e basıp 6 sn
    // beklemek her tahsilatta fazladan bir adımdı.
    for (const gone of ['MaskButton', 'MaskedMoney', 'Göster', 'Gizle', 'maskUntil', 'eyeoff']) {
        assert.ok(!parts.includes(gone), `${gone} kalmamalı`);
    }
    assert.ok(!/maskUntil|toggleMoney|hideMoney/.test(screen));
    // Sayfa başlığı FİŞ SATIRI (2026-10-15, kullanıcı seçimi "3"): solda
    // Toplam + kalem sayısı, sağda tutar; tutar satırların tutar sütunuyla
    // aynı hizada (sağ dolgu 14 + ok 20 + aralık 10). Kırılım yok — liste yazıyor.
    const head = parts.slice(parts.indexOf('export function SadeSheetHead'), parts.indexOf('function Tile('));
    assert.match(head, /paddingTop: 8, paddingLeft: 20, paddingRight: 44, paddingBottom: 18/);
    assert.match(head, />Toplam</);
    assert.match(head, /\{count\} kalem/);
    assert.ok(!/breakdown/.test(head));
    // Ekip personelinin maskesi duruyor.
    assert.ok(screen.includes('setTimeout(() => setRevealed(false), 6000)'));
});

test('kapanışta tekrar yok: saat satırı ve şeritteki sayı kalktı', () => {
    // Plaka zaten "00:30 – 01:04 · 11 dk sürdü" diyor; kadran "TOPLAM · 3 KALEM".
    const dial = parts.slice(parts.indexOf('export function SadeClosingDial'));
    assert.ok(!/dk sürdü/.test(dial), 'kadranın altındaki saat satırı');
    assert.match(dial, /TOPLAM · \{count\} KALEM/);
    // Kapanış şeridi yalnız "Kalem ekle"; mühürlüde sayı yok.
    assert.match(parts, /variant === 'closing' \? \(/);
    assert.match(parts, />Kalem ekle</);
    assert.match(parts, /Mühürlü · değiştirilemez/);
    assert.ok(!/mühürlü, değiştirilemez/.test(parts));
});

// ── Okunurluk ───────────────────────────────────────────────────────────────

test('yazı 13 pt altında değil; tx2 YALNIZ bu ekranlarda koyulaştı', () => {
    const sizes = [...parts.matchAll(/fontSize: (\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    assert.ok(sizes.length > 10);
    assert.ok(sizes.every((size) => size >= 13), `13 pt altı: ${sizes.filter((s) => s < 13)}`);
    assert.match(ink, /tx2: dark \? 'rgba\(243,237,227,0\.62\)' : 'rgba\(14,14,14,0\.66\)'/);
    // Tema jetonları DEĞİŞMEDİ (kullanıcı kararı: yalnız bu ekranlar).
    assert.equal(light.tx2, 'rgba(14,14,14,0.52)');
    assert.equal(dark.tx2, 'rgba(243,237,227,0.58)');
    // tx3 yazıda yok.
    assert.ok(!/c\.tx3/.test(parts));
});

test('renk işarette, yazı mürekkepte: açık temada renkli yazı yok', () => {
    assert.match(ink, /orT: dark \? '#FF7A45' : c\.tx/);
    assert.match(ink, /amT: dark \? '#D9A43B' : c\.tx/);
    assert.match(ink, /grT: dark \? '#5FBF64' : c\.tx/);
    assert.match(ink, /rdT: dark \? '#E07272' : c\.tx/);
});

test('üst yarı ESKİ hâlinde, adisyon sistem yazısıyla (kullanıcı kararı, 2026-10-15)', () => {
    // Telefonda denendi: eski kumandanın renkleri ve yazısı "keskin ve güzel".
    // Yeni tasarım yalnız adisyon parçalarında; plaka, sayaç, plan ve Bekleme
    // kur iki kabukta da aynı eski bileşen.
    assert.ok(!/sade=\{solo\}/.test(screen), 'plakanın tek kişilik yüzü kalktı');
    assert.ok(!/SadePlanTrack|SadeWaitChip|useSadeInk|sadeFont/.test(screen));
    assert.match(screen, /\{phase === 'running' && !wait \? \(/);
    assert.match(screen, /color: c\.or,\s*\}, numeric\]\}>\s*\{formatCounter\(elapsedSec\)\}/);
    // Yazı tipi telefonun kendisi: ağırlık var, aile yok.
    assert.ok(!/fontFamily/.test(ink));
    assert.ok(!/fontFamily/.test(parts));
});

// ── Kapsam ──────────────────────────────────────────────────────────────────

test('YALNIZ tek kişilikte — ekip personelinin kumandası değişmedi', () => {
    for (const branch of [
        /phase === 'running' && solo \? \(\s*<View style=\{\{ marginBottom: 12 \}\}>\s*<SadeStrip/,
        /phase === 'running' && !solo \? \(\s*<Strip/,
        /\(phase === 'closing' \|\| phase === 'closed'\) && solo \? \(\s*<SadeClosingDial/,
        /\(phase === 'closing' \|\| phase === 'closed'\) && !solo \? \(\s*<ClosingDial/,
        /sheet === 'catalog' && solo \? \(/,
        /sheet === 'catalog' && !solo \? \(\s*<CatalogSheet/,
    ]) assert.match(screen, branch);
    assert.match(screen, /<Sheet\s+onClose=\{\(\) => setSheet\(null\)\}\s+full=\{solo && sheet === 'catalog'\}/);
});

test('sayfa dört bölüm: "Bitti" ve büyük harfli soluk başlıklar yok', () => {
    assert.ok(!/Bitti/.test(parts), '"Bitti" kalktı — yazma 0,7 sn\'de kendiliğinden');
    for (const head of ['KALEMLER', 'RANDEVU', 'EK HİZMET', "'MALZEME'"]) {
        assert.ok(!parts.includes(head), `${head} başlığı kalktı`);
    }
    // "Kapat" de yok (2026-10-15): başlık tutamağın parçası, aşağı çekince iner.
    assert.ok(!/>Kapat</.test(parts));
    assert.match(screen, /<View\s+\{\.\.\.pan\.panHandlers\}[\s\S]*?\{head\}\s*<\/View>/);
    // Görünüm "C" (2026-10-15): iOS ölçüsünde tutamaç ve iki ton — yalnız tek
    // kişilik adisyon sayfası.
    assert.match(screen, /look=\{solo && sheet === 'catalog' \? 'sade' : 'plain'\}/);
    assert.match(screen, /width: 36, height: 5, borderRadius: 2\.5, backgroundColor: c\.tx, opacity: 0\.38/);
    assert.match(screen, /backgroundColor: look === 'sade' \? c\.surf : c\.card/);
    // Açık ton köşelere uyuyor (köşesiz zemin kenardan taşıyordu).
    assert.match(screen, /backgroundColor: c\.surf2, borderTopLeftRadius: 29, borderTopRightRadius: 29,/);
    assert.match(screen, /head=\{solo && sheet === 'catalog' \? \(\s*<SadeSheetHead/);
    assert.match(parts, /Toplama girmez · iş bitince depodan düşer/);
    assert.match(parts, /Randevu hizmeti/);
});

test('formül satırının üç hâli', () => {
    assert.deepEqual(formulaFace({ tone: 'am', value: 'oran yazılabilir', tail: 'geçen sefer formül yazılmadı', done: false }),
        { title: 'Formül yazılmadı', sub: 'oran yazılabilir · geçen sefer formül yazılmadı', bar: 'am' });
    assert.equal(formulaFace({ tone: 'mid', value: '1:1,5', tail: '', done: false }).bar, 'half');
    assert.equal(formulaFace({ tone: 'ok', value: '1:1,5 · 35 dk', tail: '', done: true }).title, 'Formül yazıldı');
});

test('sık kullanılan başlığı küçük harfle: "Sık kullanılan · saç boyama işinde"', () => {
    assert.equal(frequentHead('Saç boyama işinde'), 'Sık kullanılan · saç boyama işinde');
    assert.equal(frequentHead('salonda · İpek kirpik işinde'), 'Sık kullanılan · salonda · ipek kirpik işinde');
});

test('randevu hizmetinin ücreti Kasa\'nın hesabından, satır satır', () => {
    const source = code(read('../mobile/src/lib/managerSource.ts'));
    assert.match(source, /return \{ \.\.\.serviceCharge\(row, services\), lines: serviceLines\(row, services\) \};/);
    assert.match(screen, /serviceCharge\.lines\.map\(\(row\) => \(\{ name: row\.name, amount: row\.amount \}\)\)/);
    // Okunamazsa adlar duruyor, tutar yazılmıyor.
    assert.match(screen, /booked\.map\(\(name\) => \(\{ name, amount: null \}\)\)/);
});
