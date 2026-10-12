import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    amountSize, canCorrect, comparisonLabel, correctionProblem, correctionTrace, counterLine, customerCardLabel, deltaOf,
    emptyComparison, formatAmount, formatMoney, hasPending, isCounted, methodLabel,
    methodWord, mockEmptyPending, mockMovements, mockPending, movementSpeech, pendingSubtitle,
    parseAmount, periodLabel, periodSummaryTitle, PERIODS, ratioSpeech, revertProblem, summaryLine, totalsOf,
    traceLine, voidDialog, voidedNote, voidSub,
    waitLabel, ACTION_CORRECT, ACTION_CORRECT_SUB, ACTION_VOID, ACTION_VOID_SUB, ACTION_VOID_SUB_FREE,
    ACTIONS_NOTE, CORRECTION_NOTE, EMPTY_TITLE, READ_ONLY_NOTE,
} from '../mobile/src/lib/cash.ts';
import { mockDay, pendingOf } from '../mobile/src/lib/managerFlow.ts';
import { cashInk, cashMetrics } from '../mobile/src/theme/tokens.ts';

// Müdür 14 — Kasa.
//
// Bu dosyanın koruduğu şey iki ürün kuralı ve bir bilinçli istisna:
//   • İptal edilen kayıt toplama girmez ama LİSTEDEN DE KAYBOLMAZ. Para
//     ekranında izsiz silme, sildiğini kimsenin göremediği bir kasa demektir.
//   • Mobilde tahsilat YOK. Müdür izler ve düzeltir; para masaüstünde alınır.
//   • Turuncu envanteri bu ekranda BİLEREK gevşetildi — aşağıda tek tek yazılı.

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

const screen = code('app/mudur/cash.tsx');
const screenDoc = read('app/mudur/cash.tsx');
const parts = code('src/components/CashParts.tsx');
const lib = code('src/lib/cash.ts');

// ── Denetim izi ─────────────────────────────────────────────────────────────

test('iptal edilen kayıt toplama girmez', () => {
    const voided = mockMovements.find((m) => m.status === 'voided');
    assert.ok(voided, 'sahte veride iptal örneği yok');
    assert.equal(isCounted(voided), false);

    const totals = totalsOf(mockMovements);
    const sumOfAll = mockMovements.reduce((s, m) => s + m.amount, 0);
    assert.equal(totals.total, sumOfAll - voided.amount);
});

test('iptal edilen kayıt listeden KAYBOLMAZ', () => {
    // Ekran `movements` dizisini süzmeden çiziyor; süzme eklenirse iz kaybolur.
    assert.match(screen, /movements\.map\(\(m\) => \(/);
    assert.doesNotMatch(screen, /movements\.filter/);
});

test('iz satırı NE ZAMAN geri alındığını söyler (v4 · C2)', () => {
    const voided = mockMovements.find((m) => m.status === 'voided');
    assert.equal(traceLine(voided), 'geri alındı 11:42');
    // Normal kayıt iz üretmez.
    assert.equal(traceLine(mockMovements[0]), null);
});

test('sayaç toplamın neyi saymadığını söyler — satırın izinin sözcüğüyle', () => {
    // Başlık "iptal" derken satır "geri alındı" deseydi aynı şey iki adla anılırdı.
    assert.equal(counterLine(totalsOf(mockMovements)), '6 işlem · 1 geri alındı');
    // İptal yoksa ikinci parça hiç yazılmaz.
    assert.equal(counterLine(totalsOf(mockMovements.filter(isCounted))), '6 işlem');
});

// ── Mobilde tahsilat yok ────────────────────────────────────────────────────

test('ekran tahsilat yapmıyor ve yapıyormuş gibi görünmüyor', () => {
    assert.doesNotMatch(screen, /Tahsil et|Öde|Ödeme al/i);
    // "Yakında" diye gri bir buton da yok: olmayan yetenek vaat edilmiyor.
    assert.doesNotMatch(screen, /yakında/i);
});

test('bekleyen tahsilat görünür ama eylemi yok', () => {
    assert.ok(hasPending(mockPending));
    assert.match(screen, /pendingTitle\(pending\)/);
    assert.match(screen, /pendingSubtitle\(pending\)/);
});

// ── Turuncu envanteri: bilinçli istisna ─────────────────────────────────────

test('turuncu YALNIZ bekleyen tahsilat panelinde — bilinçli istisna', () => {
    // Uygulamanın geri kalanında turuncu zaman ve eylem demek. Kasa'da bekleyen
    // tahsilat paneli turuncu; karar kullanıcının. Kural sessizce gevşetilmedi:
    // istisna hem ekranın başlığında hem burada yazılı.
    assert.match(screenDoc, /TURUNCU ENVANTERİ — BİLİNÇLİ İSTİSNA/);

    // Turuncu tek bir yerden geliyor: bekleyen panelin gradyanı.
    assert.deepEqual([...cashMetrics.pendGradient], ['#C63C0C', '#E8430F', '#FF5A1F']);
    assert.match(screen, /colors=\{\[\.\.\.cashMetrics\.pendGradient\]\}/);

    // Ve başka hiçbir yere sızmamış: tutarlar, daireler, çubuk nötr/kil.
    const hex = (s) => (s.match(/#[0-9A-Fa-f]{6}/g) || []).map((v) => v.toUpperCase());
    for (const value of hex(parts)) {
        assert.notEqual(value, '#FF5A1F', 'turuncu hareket kartlarına sızmış');
    }
    for (const ink of [cashInk.dark, cashInk.light]) {
        for (const key of ['cash', 'card', 'transfer', 'other']) {
            assert.notEqual(ink[key].fill.toUpperCase(), '#FF5A1F');
        }
    }
});

test('düşüş kırmızıyla dramatize edilmiyor', () => {
    // Salonun sakin bir günü hata değil: aşağı yön NÖTR, ne yeşil ne kırmızı.
    const down = deltaOf(800, 1000, 'today');
    assert.equal(down.tone, 'flat');
    assert.equal(deltaOf(1200, 1000, 'today').tone, 'up');
    // Ekran yalnız iki tonu tanıyor.
    assert.doesNotMatch(screen, /tone === 'down'/);
});

test('önceki dönem yoksa değişim hapı uydurulmuyor', () => {
    assert.equal(deltaOf(8450, 0, 'today'), null);
    // Değişim sıfırsa da hap çizilmez.
    assert.equal(deltaOf(1000, 1000, 'today'), null);
});

// ── Para tipografisi ────────────────────────────────────────────────────────

test('para sistem yazı tipiyle: fontFamily VERİLMEZ', () => {
    // İki yazı tipi iş bölümü yapıyor: metin Hanken, para sistem (SF Pro).
    // Money bileşeni fontFamily almıyor — sistem yazı tipi böyle seçiliyor.
    const money = parts.slice(parts.indexOf('export function Money'), parts.indexOf('function Txt'));
    assert.doesNotMatch(money, /fontFamily/);
    assert.match(money, /numeric/);
});

test('₺ rakamla eşit: aynı boy, aynı ağırlık, aynı renk', () => {
    const hero = parts.slice(parts.indexOf('export function HeroAmount'), parts.indexOf('export function RatioBar'));
    // Tek bir `style` iki Text'e de veriliyor; küçültme/soluklaştırma yok.
    // ₺ ile rakam TEK stili paylaşıyor; işarete yalnız sağ boşluk ekleniyor.
    assert.match(hero, /<Money style=\{\[style, \{ marginRight: size \* cashMetrics\.currencyGap \}\]\}>₺<\/Money>/);
    // Okunmamış dönemde rakamın yerine çizgi — AYNI stil, ₺0 değil.
    assert.match(hero, /<Money style=\{style\}>\{value === null \? '—' : formatAmount\(value\)\}<\/Money>/);
    // Küçültme, soluklaştırma ya da ayrı bir renk yok.
    assert.doesNotMatch(hero, /fontSize: size \* 0\.|opacity/);
});

test('dev rakamın satır yüksekliği puntosunu KIRPMIYOR', () => {
    // CSS'te line-height .84 metni kırpmaz; React Native'de Text kendi
    // kutusuna kırpar ve rakamların tepesi kesilir. lineHeight fontSize'ın
    // altına inerse bu hata sessizce geri gelir.
    assert.ok(cashMetrics.moneyLineRatio >= 1, 'lineHeight fontSize altında — rakam kırpılır');
    // Tasarımın sıkı dikey ritmi paylardan geri alınıyor: toplam ayak izi
    // tasarımdaki 79,1 pt ile aynı bantta kalmalı.
    const footprint = cashMetrics.moneyTop + cashMetrics.money * cashMetrics.moneyLineRatio + cashMetrics.moneyBottom;
    assert.ok(Math.abs(footprint - 79.1) < 3, `dikey ayak izi kaymış: ${footprint}`);
});

test('dev rakam ölçeklenmiyor — ekranın tek istisnası', () => {
    assert.equal(cashMetrics.money, 68);
    assert.equal(cashMetrics.moneySmall, 58);
    assert.equal(cashMetrics.moneyAx, 72);
});

test('tutarlar kuruşsuz ve hizalı', () => {
    assert.equal(formatAmount(8450), '8.450');
    assert.equal(formatMoney(2650), '₺2.650');
    assert.equal(formatAmount(1799.6), '1.800');
});

// ── Büyüklük ipucu ──────────────────────────────────────────────────────────

test('büyüklük ipucu hane sayısından', () => {
    // ₺700 ile ₺2.400 aynı görünmüyor ama kart bir grafiğe dönüşmüyor.
    assert.equal(amountSize(700, 12000), 'small');
    assert.equal(amountSize(2400, 12000), 'normal');
    assert.equal(amountSize(12000, 12000), 'large');
    // Günün en büyüğü binler basamağında olsa da büyük çizilir.
    assert.equal(amountSize(2400, 2400), 'large');
});

// ── Yöntem rengi tek kaynaktan ──────────────────────────────────────────────

test('oran çubuğu ile daireler aynı kaynaktan besleniyor', () => {
    // İkisi ayrışırsa hata bileşende değil kaynakta olur.
    assert.match(parts, /export function methodColor/);
    assert.equal((parts.match(/methodColor\(/g) || []).length >= 3, true);
});

test('"diğer" renk almaz, kelimesi DİĞER', () => {
    assert.equal(methodLabel('other'), 'DİĞER');
    assert.equal(cashInk.dark.other.fill, '#252015');
    assert.equal(cashInk.light.other.fill, '#F0E9DF');
});

test('yöntem renkleri kil ailesinin üç basamağı', () => {
    assert.equal(cashInk.dark.cash.fill, '#C08457');
    assert.equal(cashInk.dark.card.fill, '#D6A583');
    assert.equal(cashInk.dark.transfer.fill, '#EBCFB6');
    assert.equal(cashInk.light.cash.fill, '#8A4A2B');
    assert.equal(cashInk.light.card.fill, '#A5643B');
    assert.equal(cashInk.light.transfer.fill, '#C08A5E');
    // Açık temada havale en açık basamak; krem mürekkep üstünde kaybolur.
    assert.equal(cashInk.light.transfer.ink, '#3A2214');
});

// ── Kahraman panel ──────────────────────────────────────────────────────────

test('kahraman panel iki temada da koyu', () => {
    assert.equal(cashMetrics.heroBg, '#1C1710');
    // Tema koşuluna bağlanmamış: açık temada da aynı blok.
    assert.match(screen, /backgroundColor: cashMetrics\.heroBg/);
    assert.match(screen, /<StatusBar style="light" \/>/);
});

test('istif gerçek: turuncu panel koyu panelin ALTINA giriyor', () => {
    assert.equal(cashMetrics.pendOverlap, -26);
    assert.equal(cashMetrics.pendPadTop, 38);
    assert.match(screen, /marginTop: cashMetrics\.pendOverlap/);
    // Android'de zIndex yetmiyor; elevation ile sıralanıyor.
    assert.ok(cashMetrics.heroElevation > cashMetrics.pendElevation);
});

test('etek gradyanı alt kenara kadar kesintisiz ısınıyor', () => {
    assert.equal(cashMetrics.skirtRatio, 0.38);
    assert.deepEqual(cashMetrics.skirtLocations, [0, 0.34, 0.68, 1]);
    // En sıcak nokta TAM ALT KENAR: son durak en doygun.
    assert.equal(cashMetrics.skirtColors[0], 'rgba(120,52,12,0)');
    assert.equal(cashMetrics.skirtColors[3], 'rgba(214,84,18,0.96)');
});

test('bekleyen panel yoksa istif tek katmana düşer', () => {
    assert.equal(hasPending(null), false);
    assert.equal(hasPending({ count: 0, amount: 0, oldestMinutes: 0 }), false);
    assert.match(screen, /hasPending\(pending\) \? \(/);
});

// ── İçerik katmanında cam yok ───────────────────────────────────────────────

test('gradyanlar LinearGradient, hiçbiri bulanıklık değil', () => {
    assert.match(screen, /expo-linear-gradient/);
    assert.doesNotMatch(screen, /BlurView|GlassView/);
    assert.doesNotMatch(parts, /BlurView|GlassView/);
});

// ── Dönem ───────────────────────────────────────────────────────────────────

test('etiket ve karşılaştırma dönemle birlikte değişir', () => {
    assert.equal(periodLabel('today'), 'BUGÜN GİREN');
    assert.equal(periodLabel('week'), 'BU HAFTA GİREN');
    assert.equal(periodLabel('month'), 'BU AY GİREN');
    assert.equal(comparisonLabel('week'), 'geçen haftaya göre');
    assert.equal(deltaOf(1200, 1000, 'month').text, '%20 · geçen aya göre');
});

test('gün cetveli Kasa\'da YOK', () => {
    // Müdür paraya bakarken bugünü, haftayı ve ayı soruyor; rastgele bir günü
    // değil. Cetvel Akış ekranına özel kalıyor.
    assert.doesNotMatch(screen, /DayScrubber|scrubberMetrics/);
    assert.equal(PERIODS.length, 3);
});

// ── Sesli okuma ─────────────────────────────────────────────────────────────

test('oran çubuğu tek düğüm olarak okunur', () => {
    const speech = ratioSpeech(totalsOf(mockMovements));
    assert.match(speech, /^Yöntem dağılımı: /);
    assert.match(speech, /nakit yüzde \d+, [\d.]+ lira/);
    assert.match(parts, /accessibilityRole="image"/);
    assert.match(parts, /importantForAccessibility="no-hide-descendants"/);
});

test('daireler dekoratif; yöntem kelimeyle de yazıyor', () => {
    // Renk tek başına anlam taşımaz.
    assert.match(parts, /accessible=\{false\}/);
    assert.equal(methodWord('transfer'), 'havale');
    assert.match(parts, /methodLabel\(movement\.method\)/);
});

// ── Özet ────────────────────────────────────────────────────────────────────

test('özet satırı EKRANDA yazmaz, sesli okumada durur', () => {
    const totals = totalsOf(mockMovements);
    assert.equal(summaryLine(totals), '6 tahsilat · son giriş 11:34');
    assert.equal(summaryLine(totalsOf([])), 'Henüz tahsilat yok');

    // Kullanıcı "6 tahsilat" satırını istemedi: kahraman blok rakamla hapla
    // bitiyor, hemen ardından oran çubuğu geliyor. Bilgi yine de kaybolmuyor —
    // sayaç kahraman etiketin sesli okuma cümlesinde yaşıyor.
    assert.doesNotMatch(screen, /<Text[^>]*>\s*\{summaryLine\(totals\)\}/);
    assert.match(screen, /`\$\{periodLabel\(period\)\}: \$\{formatAmount\(totals\.total\)\} lira\. \$\{summaryLine\(totals\)\}`/);
});

test('gölge ve kırpma AYRI katmanlarda', () => {
    // iOS'ta `overflow:'hidden'` gölgeyi de kırpıyor. Gölge burada süs değil:
    // turuncu panelin üstüne düşüp iki nesneyi ayırıyor; olmayınca etek
    // turuncusu ile panel turuncusu birbirine karışıyor.
    const hero = screen.slice(screen.indexOf('shadowColor'), screen.indexOf('<LinearGradient'));
    assert.doesNotMatch(hero.slice(0, hero.indexOf('</View>') + 1), /overflow: 'hidden'/);
    assert.match(screen, /shadowRadius: cashMetrics\.heroShadowRadius/);
    assert.match(screen, /overflow: 'hidden'/);
});

test('₺ rakama yapışmıyor', () => {
    // Tasarımda .money s{margin-right:.04em} — boy, ağırlık ve renk aynı,
    // yalnız araya nefes giriyor.
    assert.equal(cashMetrics.currencyGap, 0.04);
    assert.match(parts, /marginRight: size \* cashMetrics\.currencyGap/);
});

test('oran çubuğu yalnız girdisi olan yöntemleri çizer', () => {
    const totals = totalsOf(mockMovements);
    assert.equal(totals.shares.every((s) => s.amount > 0), true);
    const sum = totals.shares.reduce((s, x) => s + x.percent, 0);
    assert.ok(Math.abs(sum - 100) < 0.001);
});

test('saf kütüphane React ve Expo taşımıyor', () => {
    // Yorumlar ayıklanmış hâlde bakılıyor: dosyanın başlığı zaten
    // "react-native bağımlılığı TAŞIMAZ" diye yazıyor, o cümle eşleşmesin.
    assert.doesNotMatch(lib, /from 'react|from "react|react-native|expo-/);
    // Tek içe aktarım tip düzeyinde ve derlemede siliniyor.
    assert.match(lib, /import type \{ CashMethod, CashStatus \} from '\.\.\/theme\/tokens\.ts'/);
});

// ── 14b · hareket detayı ────────────────────────────────────────────────────

const sheets = code('src/components/CashSheets.tsx');

test('fiş iki eylem SATIRI veriyor; yıkıcı olan dolgulu DEĞİL (v4 · C2)', () => {
    // Düğme değil satır: alt yazı olmadan "Düzelt" neyin düzeltilebildiğini,
    // "Geri al" sonucunu söylemiyordu.
    assert.equal(ACTION_CORRECT, 'Düzelt');
    assert.equal(ACTION_CORRECT_SUB, 'Tutar ya da yöntem');
    assert.equal(ACTION_VOID, 'Geri al');
    const rows = sheets.slice(sheets.indexOf("{ key: 'correct'"), sheets.indexOf('{ACTIONS_NOTE}'));
    assert.match(rows, /\{ key: 'void', title: ACTION_VOID, sub: voidSub\(movement\), danger: true \}/);
    // Yanlışlıkla en cazip görünen şey yıkıcı eylem olmamalı: yalnız yazısı kırmızı.
    assert.match(rows, /color: row\.danger \? c\.rd : c\.tx/);
    assert.doesNotMatch(rows, /backgroundColor: c\.rd/);
});

test('"Geri al"ın alt yazısı olacak şeyi söylüyor — serbest satışta adisyon YOK', () => {
    assert.equal(voidSub({ reservationId: 'r1' }), ACTION_VOID_SUB);
    assert.equal(ACTION_VOID_SUB, 'Adisyon yeniden açılır');
    assert.equal(voidSub({ reservationId: null }), ACTION_VOID_SUB_FREE);
    assert.equal(ACTION_VOID_SUB_FREE, 'Tutar gün toplamından düşer');
});

test('notlar v4\'ün yerinde: eylemlerin ALTINDA, düzeltme düğmesinin ALTINDA', () => {
    assert.equal(ACTIONS_NOTE, 'Eski kayıt silinmez. Düzeltme ve geri alma Kasa\'da saatiyle görünür.');
    assert.equal(CORRECTION_NOTE, 'Eski kayıt silinmez; yanına düzeltme kaydı yazılır.');
    const jsx = sheets.slice(sheets.indexOf('<ScrollView'));
    assert.ok(jsx.indexOf("{ key: 'correct'") < jsx.indexOf('{ACTIONS_NOTE}'), 'eylem notu satırların altında');
    assert.ok(jsx.indexOf('{ACTION_SAVE}') < jsx.indexOf('{CORRECTION_NOTE}'), 'düzeltme notu düğmenin altında');
});

test('cam yalnız sheet tutamağında', () => {
    // Cam envanteri: kabuk dışında hiçbir yerde yok.
    // Cam TEK yerde: tutamak. Dışarıda kalan hiçbir GlassView olmamalı.
    const grab = sheets.slice(sheets.indexOf('const grabStyle'), sheets.indexOf('<ScrollView'));
    assert.match(grab, /GlassView/);
    const outside = sheets.replace(grab, '').replace(/import \{ GlassView \}[^\n]*\n/, '');
    assert.doesNotMatch(outside, /GlassView/);
    assert.doesNotMatch(parts, /GlassView|BlurView/);
    assert.equal(cashMetrics.grabHeight, 26);
    assert.equal(cashMetrics.grabBarWidth, 38);
    assert.equal(cashMetrics.grabBarHeight, 5);
});

test('müşteri kartı bağlantısı Türkçe iyelik ekini doğru seçiyor', () => {
    assert.equal(customerCardLabel('Zeynep Kaya'), 'Zeynep Kaya\'nın kartı');
    assert.equal(customerCardLabel('Merve Aydın'), 'Merve Aydın\'ın kartı');
    assert.equal(customerCardLabel('Elif Demir'), 'Elif Demir\'in kartı');
    assert.equal(customerCardLabel('Buket Şen'), 'Buket Şen\'in kartı');
    assert.equal(customerCardLabel('Hale Toprak'), 'Hale Toprak\'ın kartı');
});

test('sheet kalemleri toplamı tutarı vermeli', () => {
    const detailed = mockMovements.find((m) => m.lines && m.lines.length > 0);
    assert.ok(detailed, 'sahte veride kalemli örnek yok');
    const sum = detailed.lines.reduce((s, l) => s + l.amount, 0);
    assert.equal(sum, detailed.amount);
});

// ── 14c · iptal onayı ───────────────────────────────────────────────────────

test('onay "emin misiniz" sormuyor, ne olacağını söylüyor (v4 · C2)', () => {
    // v4: "₺1.200 kart tahsilatı geri alınsın mı? Adisyon yeniden açılır."
    const bound = voidDialog({ ...mockMovements[0], amount: 1200, method: 'card', reservationId: 'r1' });
    assert.equal(bound.title, 'Tahsilatı geri al');
    assert.equal(bound.message, '₺1.200 kart tahsilatı geri alınsın mı? Adisyon yeniden açılır.');
    assert.equal(bound.confirm, 'Geri al');
    assert.equal(bound.cancel, 'Vazgeç');
    assert.doesNotMatch(bound.message, /emin misiniz/i);
    // Serbest satışın adisyonu yok — olmayan bir şeyin açılacağı söylenmez.
    const free = voidDialog({ ...mockMovements[0], amount: 1200, method: 'card', reservationId: null });
    assert.equal(free.message, '₺1.200 kart tahsilatı geri alınsın mı?');
});

test('"Geri al" SİSTEM uyarısıyla onaylanıyor — yıkıcı stil, vazgeç ayrı', () => {
    // Özel diyalog kalktı: para geri alan eylem sistemin tanıdık uyarısını
    // kullanıyor (hesap silmeyle aynı kalıp).
    assert.doesNotMatch(sheets, /export function VoidDialog/);
    assert.match(screen, /Alert\.alert\(dialog\.title, dialog\.message, \[\s*\{ text: dialog\.cancel, style: 'cancel' \},\s*\{ text: dialog\.confirm, style: 'destructive', onPress: \(\) => \{ void revert\(movement\); \} \},/);
    // Düzeltme onay istemiyor: yanlış düzeltme yine düzeltilir.
    const correct = screen.slice(screen.indexOf('const correct = useCallback'), screen.indexOf('const editable'));
    assert.doesNotMatch(correct, /Alert\.alert/);
});

test('ekipte Kasa SALT OKUNUR; eylemler yalnız tek kişilikte ve canlı satırda (karar 4)', () => {
    assert.match(screenDoc, /EKİPTE SALT OKUNUR, TEK KİŞİLİKTE DÜZELT \/ GERİ AL/);
    assert.match(screen, /const editable = solo && openMovement !== null && openMovement\.status !== 'voided';/);
    const sheet = screen.slice(screen.indexOf('<MovementSheet'), screen.indexOf('/>', screen.indexOf('<MovementSheet')));
    assert.match(sheet, /\{\.\.\.\(editable \? \{\s*onVoid: \(\) => askRevert\(openMovement\),\s*onCorrect: /);
    // Ekipte "masaüstündeki Kasa'dan"; tek kişilikte geri alınmış satır kendi cümlesini söylüyor.
    assert.match(sheet, /note: solo \? voidedNote\(openMovement\) : undefined,/);
    assert.equal(READ_ONLY_NOTE, 'Düzeltme ve iptal masaüstündeki Kasa\'dan yapılır.');
});

test('yazma ÖNCE sunucuya — yerel "düzeltildi" katmanı yok', () => {
    // Eskiden "İptal et" yalnız cihazda işaret bırakıyordu ve sayfa yenilenince
    // tahsilat geri geliyordu. Şimdi ekran yalnız okumayla değişiyor.
    assert.doesNotMatch(screen, /applyVoid|applyCorrection|setMovements/);
    assert.doesNotMatch(lib, /export function applyVoid|export function applyCorrection/);
    assert.doesNotMatch(screen, /kaydedildi|başarıyla|gönderildi/i);
    // Başarıdan SONRA iki okuma da tazeleniyor: Kasa ve günün verisi (G4, şerit).
    const revert = screen.slice(screen.indexOf('const revert = useCallback'), screen.indexOf('const askRevert'));
    assert.match(revert, /const result = await revertPayment\(movement\.id\);[\s\S]*void reloadCash\(\);\s*reload\(\);/);
    const correct = screen.slice(screen.indexOf('const correct = useCallback'), screen.indexOf('const editable'));
    assert.match(correct, /const result = await correctPayment\(movement\.id, amount, method\);/);
    assert.match(correct, /return correctionProblem\(result\.code\);/);
    assert.match(correct, /void reloadCash\(\);\s*reload\(\);\s*return null;/);
});

test('"Geri al" fişi KENDİSİ kapatıyor — görünmez katman kalmıyor', () => {
    // `close(onVoid)` onClose'u çağırmıyor; ekran açık hâli kendisi düşürmeli.
    assert.match(sheets, /if \(after\) after\(\); else onClose\(\);/);
    const ask = screen.slice(screen.indexOf('const askRevert'), screen.indexOf('const correct = useCallback'));
    assert.match(ask, /setOpenId\(null\);/);
});

test('geri alınmış satırın fişi neden sayılmadığını söylüyor', () => {
    assert.equal(voidedNote({ voidedAt: '15:42' }), '15:42’de geri alındı; tutar gün toplamına girmiyor.');
    assert.equal(voidedNote({}), 'Geri alındı; tutar gün toplamına girmiyor.');
});

test('hayırların cümlesi kaydın DEĞİŞMEDİĞİNİ söylüyor', () => {
    assert.match(correctionProblem('no_change'), /düzeltilecek bir şey yok/);
    assert.match(correctionProblem('zero_amount'), /Geri al/);
    assert.match(correctionProblem('plan_payment_amount_must_be_positive'), /sıfır lira olamaz/);
    assert.match(correctionProblem('already_voided'), /Kasa yenilendi/);
    assert.match(correctionProblem('installment_payment_exceeds_balance'), /kalan borcunu aşıyor/);
    assert.match(correctionProblem('plan_payment_exceeds_balance'), /kalan borcunu aşıyor/);
    assert.match(correctionProblem('paused'), /şimdilik alınmıyor/);
    assert.match(correctionProblem('beklenmedik'), /kaydedilmedi/);
    assert.match(revertProblem('already_voided'), /zaten geri alınmış/);
    assert.match(revertProblem('beklenmedik'), /tahsilat yerinde duruyor/i);
});

// ── 14d · boş gün ───────────────────────────────────────────────────────────

test('boş gün suçlayıcı değil, ne olacağını söylüyor', () => {
    // "Personel kasaya gönderdikçe" DEĞİL: gönderilen adisyon turuncu
    // panelde bekliyor, listeye tahsil edilen para düşüyor.
    assert.equal(EMPTY_TITLE, 'Henüz tahsilat yok. Kasada tahsil edildikçe burada görünür.');
    assert.match(screen, /EMPTY_TITLE/);
});

test('bekleyen adisyonlar AKIŞTAN türer — iki ekran tek gerçek', () => {
    // Kasa kendi sabit sayısını taşıyordu (2 adisyon / ₺2.650) ve akış üç
    // adisyon gösteriyordu; müdür hangisine inanacağını bilemezdi.
    const pending = pendingOf(mockDay.events);
    const dues = mockDay.events.filter((e) => e.kind === 'due');
    assert.equal(pending.count, dues.length);
    assert.equal(pending.amount, dues.reduce((sum, e) => sum + e.amountValue, 0));
    assert.ok(hasPending(pending));
    // İki ekran da ORTAK kaynaktan okur; Kasa kendi kopyasını tutmaz.
    assert.match(screen, /pendingOf\(events\)/);
    assert.match(screen, /useManagerDay\(\)/);
});

test('en eski bekleme ve devir bayrağı da listeden gelir', () => {
    const pending = pendingOf(mockDay.events);
    // Dünden devreden 1080 dakikalık adisyon en eskisi.
    assert.equal(pending.oldestMinutes, 1080);
    assert.equal(pending.carriedOver, true);
});

test('bekleyen yoksa panel de yok', () => {
    assert.equal(pendingOf([]).count, 0);
    assert.equal(hasPending(pendingOf([])), false);
});

test('bir saati geçen bekleme dakikayla okunmuyor', () => {
    assert.equal(waitLabel(24), '24 dk');
    assert.equal(waitLabel(1080), '18 saat');
    assert.equal(pendingSubtitle(mockEmptyPending), '₺900 · dünden kaldı, 18 saat bekliyor');
    assert.equal(pendingSubtitle(mockPending), '₺2.650 · en eskisi 24 dk bekliyor');
});

test('boş günde hap yerine sakin bir karşılaştırma satırı var', () => {
    assert.equal(emptyComparison('today'), 'dün bu saatte de ₺0');
    assert.equal(emptyComparison('month'), 'geçen ay de ₺0');
    assert.match(screen, /emptyComparison\(period\)/);
});

// ── Hareket sözleşmesi ──────────────────────────────────────────────────────

test('yalnız opaklık ve dönüşüm anime ediliyor', () => {
    // Yükseklik, renk, yarıçap ve gölge animasyonu YASAK.
    for (const src of [sheets, parts, screen]) {
        assert.doesNotMatch(src, /Animated\.[a-zA-Z]+\([^)]*(height|backgroundColor|borderRadius|shadow)/);
    }
    assert.match(sheets, /translateY: y/);
    // Karartma yalnız opaklıkla geliyor. (Özel onay diyaloğunun ölçeği kalktı:
    // onay artık sistemin uyarısı.)
    assert.match(sheets, /zIndex: 70, opacity: backdrop \}\}/);
    assert.equal(cashMetrics.sheetMotion, 320);
});

test('hareketi azalt açıkken sheet yalnız sönümleniyor', () => {
    assert.match(sheets, /reduceMotion\s*\n?\s*\?\s*Animated\.timing\(backdrop/);
});

test('fiş sekme çubuğunun ÜSTÜNDE', () => {
    // Sekme çubuğunu sistem çiziyor (NativeTabs); ekran içindeki zIndex ona
    // yetmiyor. Mutlak konumlu sheet'te eylem butonları çubuğun arkasında
    // yutuluyor ve karartma çubuğu karartamıyordu. (Onay artık sistem uyarısı;
    // özel diyaloğun Modal'ı kalktı.)
    const uses = sheets.match(/<Modal /g) || [];
    assert.equal(uses.length, 1, 'fiş Modal içinde olmalı');
    assert.match(sheets, /statusBarTranslucent/);
    // Kapatma jesti geri tuşuyla da çalışsın.
    assert.equal((sheets.match(/onRequestClose=/g) || []).length, 1);
    // Alt pay artık çubuğu değil yalnız güvenli alanı hesaba katıyor.
    assert.match(sheets, /paddingBottom: insets\.bottom \+ 30/);
});

test('iz kimin yaptığını YAZMIYOR — saat sunucunun damgasından', () => {
    // Tek kişilikte cevap hep "sen"; ekipte satır zaten çizilmiyor. Boş bir
    // isim uydurmaktansa hiç yazmamak. Saat `voided_at`ten (cashBuild).
    assert.equal(traceLine({ status: 'voided', voidedAt: '11:42' }), 'geri alındı 11:42');
    assert.equal(traceLine({ status: 'voided', voidedBy: 'Ayla', voidedAt: '11:42' }), 'geri alındı 11:42');
    assert.equal(traceLine({ status: 'voided' }), 'geri alındı');
    assert.doesNotMatch(screen, /applyVoid\(/);
});

test('bekleyen adisyon şeridi ÖLÜ DEĞİL — ekipte Akış\'a, tek kişilikte tahsilata götürüyor', () => {
    // Şeridin sağında ok vardı ama dokununca hiçbir şey olmuyordu. Ekipte
    // bekleyen adisyonların gerçek yeri Akış: her biri kendi satırında,
    // "Tahsil et" düğmesiyle duruyor.
    assert.match(screen, /onPress=\{onPendingPress\}/);
    assert.match(screen, /if \(!solo\) \{\s*router\.navigate\('\/mudur'\);/);
    // Tek kişilikte Akış YOK (v4 C1): `/mudur` kapısı kişiyi geri atardı.
    // Tek adisyon doğrudan kumandanın tahsilat adımında; birden çoksa önce liste.
    assert.match(screen, /if \(tickets\.length === 1\) openTicket\(tickets\[0\]\);\s*else setTicketsOpen\(true\);/);
    assert.match(screen, /pathname: '\/\(staff-flow\)\/kumanda'/);
    assert.match(screen, /from: 'tek',/);
    // Dünden kalan adisyon bugünün ajandasında yok: kumanda onu kendi gününde açıyor.
    assert.match(screen, /\.\.\.\(ticket\.dateISO \? \{ date: ticket\.dateISO \} : \{\}\)/);
    assert.match(screen, /<PendingTicketsSheet[\s\S]{0,200}onPick=\{openTicket\}/);
});

// ── Düzeltme · 2026-08-30 ───────────────────────────────────────────────────
//
// "Düzelt" düğmesi vardı ve `onPress`i YOKTU: basılıp hiçbir şey olmuyordu.
// Ekranın kendi cümlesi davranışı zaten tarif ediyordu; eksik olan davranıştı.

test('düzeltilmiş satırın izi "X verdi"nin yuvasında (v4 · C1)', () => {
    const fixed = { status: 'corrected', correctedAt: '15:40', correctedFromAmount: 1200 };
    assert.equal(correctionTrace(fixed), 'düzeltildi 15:40 · önce ₺1.200');
    // Önceki tutar bilinmiyorsa uydurulmuyor.
    assert.equal(correctionTrace({ status: 'corrected', correctedAt: '15:40' }), 'düzeltildi 15:40');
    assert.equal(correctionTrace({ status: 'normal' }), null);
    // Kart: iz satırı ve SADE çizim — eskinin kehribar tonu ve "DÜZELTİLDİ" çipi yok.
    assert.match(parts, /\) : correction \? \(/);
    assert.doesNotMatch(parts, /DÜZELTİLDİ/);
    assert.match(parts, /const tone = voided\s*\?/);
});

test('düzeltme ve geri alma sesli okunuyor — "lira" ile, işaretle değil', () => {
    const base = { ...mockMovements[0], amount: 1000, method: 'card', staff: '' };
    const fixed = movementSpeech({ ...base, status: 'corrected', correctedAt: '15:40', correctedFromAmount: 1200 });
    assert.match(fixed, /Düzeltildi 15:40, önce 1\.200 lira\.$/);
    assert.doesNotMatch(fixed, /₺/);
    assert.match(movementSpeech({ ...base, status: 'voided', voidedAt: '15:42' }), /^Geri alındı\. /);
});

test('geri alınmış satır düzeltilmez de yeniden geri alınmaz', () => {
    // Ekran eylemleri açmıyor; sunucu da `already_voided` diyor.
    assert.match(screen, /openMovement\.status !== 'voided'/);
    assert.match(correctionProblem('already_voided'), /değişti/);
});

test('sıfır ve hiçbir şey değiştirmeyen düzeltme kaydedilemez', () => {
    // Sıfır bir tahsilat değil; öyle bir şey olduysa yapılacak şey GERİ ALMA.
    assert.equal(parseAmount('0'), null);
    assert.equal(parseAmount(''), null);
    assert.equal(parseAmount('1.500'), 1500, 'ayırıcı yazan müdür cezalandırılmaz');
    // Aynı tutar ve aynı yöntem düzeltme değildir (sunucu da `no_change` der).
    assert.equal(canCorrect('1800', 1800), false);
    assert.equal(canCorrect('1800', 1800, 'cash', 'cash'), false);
    assert.equal(canCorrect('1500', 1800), true);
    // v4 C3: yalnız YÖNTEM değişse de düzeltme var — nakit iş karta yazılmış olabilir.
    assert.equal(canCorrect('1800', 1800, 'card', 'cash'), true);
});

test('Düzelt satırı ölü değil — sayfayı açıyor, kaydet sunucuya gidiyor', () => {
    const src = readFileSync(new URL('../mobile/src/components/CashSheets.tsx', import.meta.url), 'utf8');
    const sheet = src.slice(src.indexOf('export function MovementSheet('), src.indexOf('function Section('));
    assert.match(sheet, /if \(row\.danger\) \{ close\(onVoid\); return; \}[\s\S]{0,400}setCorrecting\(true\);/);
    assert.match(sheet, /const failure = await onCorrect\?\.\(amount, methodDraft\) \?\? null;/);
    // v4 C3: ret gelirse sayfa açık kalır, sebep düğmenin üstünde.
    assert.match(sheet, /if \(failure === null\) close\(\);\s*else setSaveError\(failure\);/);
    assert.ok(sheet.indexOf('{saveError}') < sheet.indexOf('accessibilityLabel={ACTION_SAVE}'));
});

test('kasa fişi aşağı çekilerek kapanır', () => {
    const src = readFileSync(new URL('../mobile/src/components/CashSheets.tsx', import.meta.url), 'utf8');
    assert.match(src, /PanResponder\.create/, 'tutamaç hâlâ dekoratif');
    assert.match(src, /drag\.panHandlers/);
});

test('fişin boyu içerikten türer', () => {
    const src = readFileSync(new URL('../mobile/src/components/CashSheets.tsx', import.meta.url), 'utf8');
    const sheet = src.slice(src.indexOf('export function MovementSheet('), src.indexOf('function Section('));
    // Sabit `height` kısa fişi de ekranın dörtte üçüne şişiriyordu.
    assert.match(sheet, /maxHeight: sheetHeight/);
    assert.equal(/\n\s+height: sheetHeight,/.test(sheet), false, 'boy hâlâ sabit');
});

test('düzeltme alanı klavyenin altında kalmaz', () => {
    const src = readFileSync(new URL('../mobile/src/components/CashSheets.tsx', import.meta.url), 'utf8');
    assert.match(src, /Keyboard\.addListener/, 'fiş klavyeyle birlikte kalkmıyor');
    // Kaldırma, SÜRÜKLEME değerinden ayrı bir katman: parmakla çekerken ikisi
    // aynı değeri yazsaydı fiş zıplardı.
    assert.match(src, /transform: \[\{ translateY: y \}, \{ translateY: lift \}\]/);
    assert.match(src, /keyboardDidShow/, 'Android olayı dinlenmiyor');
});

// ── Gün sonu / dönem özeti ───────────────────────────────────────────────────
//
// Envanter borcuydu: "Gün sonu özeti" düğmesi çizili duruyordu ama basınca
// hiçbir şey olmuyordu. Yeni sunucu ucu gerekmedi — ekran zaten seçili
// dönemin `totals`ını hesaplamıştı, düğme onu bir sayfada dökmeye başladı.

test('başlık seçili döneme göre değişir', () => {
    assert.equal(periodSummaryTitle('today'), 'Gün sonu özeti');
    assert.equal(periodSummaryTitle('week'), 'Hafta özeti');
    assert.equal(periodSummaryTitle('month'), 'Ay özeti');
});

test('Gün sonu düğmesi artık ölü değil', () => {
    assert.match(screen, /setDayEndOpen\(true\)/, 'düğmenin onPress\'i yok');
    // Dönem henüz okunmadıysa (yükleniyor/hata) açılmıyor: `totals` o an boş
    // dizinin toplamı olur, "tahsilat yok" sahte bir sonuç olurdu — "okunamadı"
    // ile "yok" bu ekranda da karışmamalı.
    assert.match(screen, /disabled=\{!known\}[\s\S]{0,400}setDayEndOpen\(true\)/);
});

test('özet sayfası ekrana bağlı ve aynı totals\'ı kullanıyor', () => {
    assert.match(screen, /<DayEndSheet/);
    assert.match(screen, /visible=\{dayEndOpen\}/);
    assert.match(screen, /totals=\{totals\}/, 'ikinci bir hesap açılmış olabilir — tek kaynak totalsOf olmalı');
});

test('özet sayfası salt okunur — Yazdır/Paylaş yok, yalnız arka plana dokunarak kapanır', () => {
    const src = readFileSync(new URL('../mobile/src/components/CashSheets.tsx', import.meta.url), 'utf8');
    const dayEnd = src.slice(src.indexOf('export function DayEndSheet('), src.indexOf('function Section('));
    assert.match(dayEnd, /BottomSheet/, 'genel sheet kabuğu kullanılmıyor');
    assert.doesNotMatch(dayEnd, /Yazdır|Paylaş|Share\./, 'kullanıcı kararı: hiçbir aksiyon yok');
    assert.doesNotMatch(dayEnd, /accessibilityRole="button"/, 'kendine özgü bir Kapat düğmesi eklenmemeli');
});
