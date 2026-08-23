import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    amountSize, applyVoid, comparisonLabel, counterLine, customerCardLabel, deltaOf,
    emptyComparison, formatAmount, formatMoney, hasPending, isCounted, methodLabel,
    methodWord, mockEmptyPending, mockMovements, mockPending, pendingSubtitle,
    periodLabel, PERIODS, ratioSpeech, summaryLine, totalsOf, traceLine, voidDialog,
    waitLabel, ACTION_CORRECT, ACTION_VOID, CORRECTION_NOTE, EMPTY_TITLE,
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

const screen = code('app/(manager)/cash.tsx');
const screenDoc = read('app/(manager)/cash.tsx');
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

test('iz satırı kimin ne zaman iptal ettiğini söyler', () => {
    const voided = mockMovements.find((m) => m.status === 'voided');
    assert.equal(traceLine(voided), 'İPTAL · AYLA, 11:42');
    // Normal kayıt iz üretmez.
    assert.equal(traceLine(mockMovements[0]), null);
});

test('sayaç toplamın neyi saymadığını söyler', () => {
    assert.equal(counterLine(totalsOf(mockMovements)), '6 işlem · 1 iptal');
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
    assert.match(hero, /<Money style=\{style\}>\{formatAmount\(value\)\}<\/Money>/);
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
    assert.match(screen, /accessibilityLabel=\{`\$\{periodLabel\(period\)\}[^`]*\$\{summaryLine\(totals\)\}`\}/);
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

test('sheet iki eylem veriyor; yıkıcı olan dolgulu DEĞİL', () => {
    // Yanlışlıkla en cazip görünen şey yıkıcı eylem olmamalı.
    assert.equal(ACTION_CORRECT, 'Düzelt');
    assert.equal(ACTION_VOID, 'İptal et');
    const actions = sheets.slice(sheets.indexOf('ACTION_CORRECT}</Txt>') - 900);
    // Düzelt dolgulu (surf2), İptal et yalnız kenarlı.
    assert.match(sheets, /backgroundColor: c\.surf2, borderWidth: 1, borderColor: c\.bd2/);
    assert.match(sheets, /borderWidth: 1, borderColor: ink\.voidedBorder/);
    assert.doesNotMatch(actions, /backgroundColor: c\.rd/);
});

test('düzeltmenin ne yapacağı eylemlerin ÜSTÜNDE yazıyor', () => {
    assert.match(CORRECTION_NOTE, /eski kayıt iptal edilir, yenisi yazılır/);
    // Not, buton satırından önce geliyor. (İçe aktarım satırı sayılmasın diye
    // yalnız JSX bölgesine bakılıyor.)
    const jsx = sheets.slice(sheets.indexOf('<ScrollView'));
    assert.ok(jsx.indexOf('CORRECTION_NOTE') < jsx.indexOf('ACTION_CORRECT'));
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

test('diyalog "emin misiniz" sormuyor, ne olacağını söylüyor', () => {
    const copy = voidDialog(mockMovements[0]);
    assert.equal(copy.title, 'Tahsilatı iptal et');
    assert.doesNotMatch(copy.warning, /emin misiniz/i);
    assert.match(copy.warning, /gün toplamından düşer/);
    assert.match(copy.warning, /Kayıt silinmez/);
    assert.match(copy.warning, /geri alınamaz/);
    // Alıntı kutusu: müşteri, tutar, yöntem, saat, alan personel.
    assert.match(copy.what, /₺[\d.]+ \w+ · \d{2}:\d{2} · \w+ aldı/);
});

test('yıkıcı eylem ÜSTTE, vazgeçme altta', () => {
    // iOS alarm grameri. Kırmızı ve 800 ağırlık yalnız "İptal et"te.
    // Arka plan düğmesinin etiketi de copy.cancel kullanıyor; yalnız buton
    // bloğuna bakılıyor.
    const dialog = sheets.slice(sheets.indexOf('export function VoidDialog'));
    const actions = dialog.slice(dialog.indexOf('onPress={onConfirm}') - 400);
    assert.ok(actions.indexOf('copy.confirm') < actions.indexOf('copy.cancel'));
    assert.match(dialog, /font\.extraBold, fontSize: 17[^}]*color: c\.rd/);
    assert.match(dialog, /font\.bold, fontSize: 17[^}]*color: c\.tx2/);
});

test('ekrandaki TEK onay diyaloğu iptal için', () => {
    // Düzeltme, dönem değişimi, sheet kapama, gün sonu — hiçbiri onay istemez.
    assert.equal((screen.match(/VoidDialog/g) || []).length, 2); // import + kullanım
    assert.doesNotMatch(screen, /Alert\.alert/);
});

test('iptal kaydı SİLMEZ, durumunu değiştirir', () => {
    const target = mockMovements[0];
    const after = applyVoid(mockMovements, target.id, 'Ayla', '11:42');
    assert.equal(after.length, mockMovements.length, 'kayıt silinmiş');
    const changed = after.find((m) => m.id === target.id);
    assert.equal(changed.status, 'voided');
    assert.equal(changed.voidedBy, 'Ayla');
    assert.equal(traceLine(changed), 'İPTAL · AYLA, 11:42');
    // Toplam düşer.
    assert.equal(totalsOf(after).total, totalsOf(mockMovements).total - target.amount);
    // Zaten iptal olan tekrar iptal edilmez.
    const twice = applyVoid(after, target.id, 'Başkası', '12:00');
    assert.equal(twice.find((m) => m.id === target.id).voidedBy, 'Ayla');
});

test('iptal sunucuya yazıldığını iddia etmiyor', () => {
    // Sunucuda müdür ucu yok; sahte "kaydedildi" mesajı üretilmiyor.
    assert.doesNotMatch(screen, /kaydedildi|başarıyla|gönderildi/i);
    assert.match(screenDoc, /sunucuda müdür ucu yok/i);
});

// ── 14d · boş gün ───────────────────────────────────────────────────────────

test('boş gün suçlayıcı değil, ne olacağını söylüyor', () => {
    assert.equal(EMPTY_TITLE, 'Henüz tahsilat yok. Personel kasaya gönderdikçe burada görünür.');
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
    assert.match(sheets, /outputRange: \[0\.96, 1\]/);
    assert.equal(cashMetrics.sheetMotion, 320);
});

test('hareketi azalt açıkken sheet yalnız sönümleniyor', () => {
    assert.match(sheets, /reduceMotion\s*\n?\s*\?\s*Animated\.timing\(backdrop/);
});

test('sheet ve diyalog sekme çubuğunun ÜSTÜNDE', () => {
    // Sekme çubuğunu sistem çiziyor (NativeTabs); ekran içindeki zIndex ona
    // yetmiyor. Mutlak konumlu sheet'te eylem butonları çubuğun arkasında
    // yutuluyor ve karartma çubuğu karartamıyordu.
    const uses = sheets.match(/<Modal /g) || [];
    assert.equal(uses.length, 2, 'sheet ve diyalog Modal içinde olmalı');
    assert.match(sheets, /statusBarTranslucent/);
    // Kapatma jesti geri tuşuyla da çalışsın.
    assert.equal((sheets.match(/onRequestClose=/g) || []).length, 2);
    // Alt pay artık çubuğu değil yalnız güvenli alanı hesaba katıyor.
    assert.match(sheets, /paddingBottom: insets\.bottom \+ 30/);
});

test('iptal izi kim olduğunu UYDURMAZ', () => {
    // Sabit "Ayla · 11:42" yazıyordu. An cihazın saati (iptal şu an oluyor),
    // kim olduğu oturumdan gelecek — gelene kadar izde hiç yazılmaz.
    assert.equal(traceLine({ status: 'voided', voidedAt: '11:42' }), 'İPTAL · 11:42');
    assert.equal(traceLine({ status: 'voided', voidedBy: 'Ayla', voidedAt: '11:42' }), 'İPTAL · AYLA, 11:42');
    assert.equal(traceLine({ status: 'voided' }), 'İPTAL');
    assert.match(screen, /applyVoid\(list, voidingId, null, hhmm\(nowInMinutes\(\)\)\)/);
});
