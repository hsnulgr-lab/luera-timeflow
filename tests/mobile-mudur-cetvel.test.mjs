import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    TICKS_PER_DAY, VISIBLE_DAYS,
    boundsFor, crossedMonth, dateAt, dayCount, indexFromOffset, indexOf,
    majorTickOffset, offsetForIndex, railCell, railTitle, showsBackToday,
    smallTickOffsets, stepFor, tickPitch,
} from '../mobile/src/lib/dayScrubber.ts';
import { formatDayShort, isMonthStart } from '../mobile/src/lib/calendar.ts';
import { scrubberMetrics as scrubber } from '../mobile/src/theme/tokens.ts';

// Müdür 13 — toplanmış çubuk · gün cetveli.
//
// Bu dosyanın koruduğu şey: cetvelin bütün ölçülerinin TÜRETİLMESİ. Gün adımı
// pencere genişliğinden, çentik aralığı gün adımından çıkar. Sabit pt yazılırsa
// panel genişliği değiştiğinde gün merkezi çentiği rakamın altından kayar.

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

const rail = code('src/components/DayScrubber.tsx');
const screen = code('app/mudur/index.tsx');
const tokens = read('src/theme/tokens.ts');

const TODAY = '2026-08-13';
const bounds = boundsFor(TODAY);

// ── Türetilen ölçüler ───────────────────────────────────────────────────────

test('gün adımı pencere genişliğinin yedide biri', () => {
    assert.equal(VISIBLE_DAYS, 7);
    // 393 ekran − 2 × 8 kenar = 377 pencere.
    assert.ok(Math.abs(stepFor(377) - 53.857) < 0.001);
    // 375 × 667: dar ama hâlâ dokunulabilir.
    assert.ok(Math.abs(stepFor(359) - 51.286) < 0.001);
    assert.ok(stepFor(359) > 44, 'küçük ekranda dokunma hedefi 44 altına inmemeli');
});

test('çentik aralığı gün adımının onda biri', () => {
    assert.equal(TICKS_PER_DAY, 10);
    const step = stepFor(377);
    assert.ok(Math.abs(tickPitch(step) - 5.3857) < 0.001);
    // Panel genişlerse aralık da genişler; oran sabit kalır.
    assert.equal(tickPitch(stepFor(500)) * TICKS_PER_DAY, stepFor(500));
});

test('gün merkezi çentiği rakamın TAM altında', () => {
    const step = stepFor(377);
    // Hücrenin ortası = beşinci çentik. Kayarsa cetvel eğri görünür.
    assert.equal(majorTickOffset(step), step / 2);
    assert.ok(Math.abs(majorTickOffset(step) - 5 * tickPitch(step)) < 1e-9);
});

test('hücrede dokuz küçük çentik var; ortadaki ayrı çizilir', () => {
    const step = stepFor(377);
    const offsets = smallTickOffsets(step);
    assert.equal(offsets.length, TICKS_PER_DAY - 1);
    assert.ok(!offsets.some((x) => Math.abs(x - majorTickOffset(step)) < 1e-9));
    assert.equal(offsets[0], 0);
});

test('ölçüler sabit pt olarak yazılmamış', () => {
    // Cetvel bileşeni adımı ve aralığı kendi hesaplamamalı.
    // Adım tasarımın formülünden: (levha genişliği − 2 × yan boşluk) / 7.
    assert.match(rail, /stepFor\(width - padX \* 2\)/);
    assert.match(rail, /smallTickOffsets\(step\)/);
    assert.match(rail, /majorTickOffset\(step\)/);
    assert.ok(!/53\.8|5\.38|48\.7/.test(rail), 'türetilmesi gereken sayı gömülmüş');
});

// ── Ray ─────────────────────────────────────────────────────────────────────

test('ray sonsuz değil', () => {
    assert.equal(dayCount(bounds), 731);
    assert.equal(bounds.firstISO, '2025-08-13');
    assert.equal(bounds.lastISO, '2027-08-13');
});

test('sınır dışına kayılamaz', () => {
    const step = stepFor(377);
    assert.equal(indexFromOffset(-9999, step, bounds), 0);
    assert.equal(indexFromOffset(9e9, step, bounds), dayCount(bounds) - 1);
    assert.equal(dateAt(-5, bounds), bounds.firstISO);
    assert.equal(dateAt(9e9, bounds), bounds.lastISO);
});

test('kaydırma konumu güne oturur, ara konum yok', () => {
    const step = stepFor(377);
    const todayIndex = indexOf(TODAY, bounds);
    assert.equal(indexFromOffset(offsetForIndex(todayIndex, step), step, bounds), todayIndex);
    // Yarım adımın altı aynı güne, üstü sonrakine oturur.
    assert.equal(indexFromOffset(offsetForIndex(todayIndex, step) + step * 0.4, step, bounds), todayIndex);
    assert.equal(indexFromOffset(offsetForIndex(todayIndex, step) + step * 0.6, step, bounds), todayIndex + 1);
});

test('gün ile sıra birbirinin tersi', () => {
    assert.equal(dateAt(indexOf(TODAY, bounds), bounds), TODAY);
    assert.equal(dateAt(indexOf('2026-09-01', bounds), bounds), '2026-09-01');
});

// ── Hücre modeli ────────────────────────────────────────────────────────────

test('seçim ile bugün ayrı iki şey', () => {
    const cell = railCell('2026-08-15', '2026-08-15', TODAY, bounds);
    assert.equal(cell.selected, true);
    assert.equal(cell.today, false);

    const todayCell = railCell(TODAY, '2026-08-15', TODAY, bounds);
    assert.equal(todayCell.selected, false);
    assert.equal(todayCell.today, true);
});

test('ay sınırı ve ray sonu farklı çentik', () => {
    assert.ok(isMonthStart('2026-09-01'));
    assert.equal(railCell('2026-09-01', TODAY, TODAY, bounds).centerTick, 'month');
    assert.equal(railCell('2026-08-15', TODAY, TODAY, bounds).centerTick, 'major');
    assert.equal(railCell(bounds.firstISO, TODAY, TODAY, bounds).centerTick, 'end');
    assert.equal(railCell(bounds.lastISO, TODAY, TODAY, bounds).centerTick, 'end');
});

test('rakam baştaki sıfırsız', () => {
    assert.equal(railCell('2026-09-01', TODAY, TODAY, bounds).label, '1');
    assert.equal(railCell('2026-08-13', TODAY, TODAY, bounds).label, '13');
});

test('ay sınırı geçişi ayrı titreşim ister', () => {
    assert.ok(crossedMonth('2026-08-31', '2026-09-01'));
    assert.ok(!crossedMonth('2026-08-13', '2026-08-14'));
    assert.match(rail, /if \(crossedMonth\(settled\.current, next\)\) feedback\.light\(\);/);
    assert.match(rail, /else feedback\.selection\(\);/);
});

// ── Başlık ──────────────────────────────────────────────────────────────────

test('levhada BAŞLIK YOK — yalnız rakamlar ve cetvel (Müdür 19 · A)', () => {
    // Eski levhada ortalanmış "Per. 13" vardı ve hemen altındaki hapta aynı
    // rakam ikinci kez yazıyordu. Referansta levha iki şey taşır.
    assert.ok(!/railTitle|titleHeight|titleSize/.test(rail), 'başlık satırı kalmış');
    assert.ok(!/randevu|sürüyor|doluluk|adisyon/.test(rail));
    // `railTitle` kütüphanede duruyor ama levha artık çağırmıyor.
    assert.equal(railTitle(TODAY), 'Per. 13');
    assert.equal(formatDayShort('2026-09-01'), 'Sal. 1');
});

test('AÇIK KAYIP — "bugüne dön" levhadan çıktı', () => {
    // Müdür 19 · A levhada yalnız rakamları ve cetveli bırakıyor; başlık da
    // "Bugün" hapı da yok. Kural kütüphanede duruyor ama hiçbir yer çağırmıyor:
    // bugüne dönmenin tek yolu kaydırmak. Karşılığı B varyantındaki sol düğme.
    assert.ok(!showsBackToday(TODAY, TODAY));
    assert.ok(showsBackToday('2026-08-15', TODAY));
    assert.ok(!/showsBackToday/.test(rail), 'levhada geri kalmış');
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('levhanın üstü AÇIK: ekranın tepesinden başlar', () => {
    // Kapalı bir hap olsaydı üstünde boşluk kalır, durum çubuğu dışarıda
    // dururdu ve içerik saatin ardından okunurdu.
    assert.match(screen, /top: 0,/);
    assert.match(screen, /borderBottomLeftRadius: scrubberMetrics\.bottomRadius/);
    assert.match(screen, /borderTopWidth: 0/);
    assert.match(screen, /height: insets\.top \+ panelInset/);
});

test('hiçbir şey levhanın dışına taşmaz', () => {
    assert.match(screen, /overflow: 'hidden'/);
});

test('personel şeridi toplanınca kaybolur', () => {
    assert.match(screen, /stripOpacity/);
    assert.match(screen, /inputRange: \[0, 40\], outputRange: \[1, 0\]/);
    // Levhanın altına yapışkan bir şerit KOPYASI çizilmiyor: şerit tek yerde.
    assert.equal(screen.match(/<StaffStrip/g)?.length, 1);
    assert.ok(!/StaffStrip[^>]*compact/.test(screen), 'compact şerit kopyası kalmış');
});

test('açık hâl bozulmadı', () => {
    // Zil ve mod değiştirici EKLENMEDİ — tasarım belgesi öneriyordu, istenmedi.
    assert.ok(!/bell|Bildirim|modeswap|ModeSwitch/i.test(screen));
    // Dev başlık, parıltı, akış yerinde. Özet şeridi (ciro · doluluk ·
    // adisyon) KALDIRILDI: aynı sayılar Kasa'da zaten var ve akış ekranında
    // randevuların yerini yiyordu.
    for (const part of ['DayHeader', 'FlowRow', 'FlowEnd', 'LinearGradient']) {
        assert.ok(screen.includes(part), `açık hâlden düşen parça: ${part}`);
    }
});

test('cetvel şimdilik akışı değiştirmiyor ve bunu iddia etmiyor', () => {
    // Sunucuda "o günün olayları" ucu yok; sahte bir gün üretmek çalışıyor
    // izlenimi verirdi.
    assert.match(screen, /onSelect=\{setSelectedISO\}/);
    assert.match(read('app/mudur/index.tsx'), /Sunucuda "o günün\s+\/\/ olayları" diye bir uç yok/);
});

test('turuncu yalnız bugün işaretinde', () => {
    const between = (from, to) => rail.slice(rail.indexOf(from), rail.indexOf(to));
    // Seçili hap ve dikey çizgi NÖTR.
    const pill = between('{selected ? (', '{today ? (');
    assert.ok(!/ACCENT|c\.or\b/.test(pill), 'seçim turuncuya kaçmış');
    // Bugün bölümünde turuncu var. Levhanın zemini camdan geldiği için vurgu
    // tema jetonu değil sabit: iki temada da #FF5A1F.
    assert.match(rail.slice(rail.indexOf('{today ? (')), /backgroundColor: ACCENT/);
    assert.match(rail, /const ACCENT = '#FF5A1F'/);
});

test('jetonlar tasarım belgesinden', () => {
    for (const key of ['sideMargin: 8', 'bottomRadius: 20', 'tickSmall: 6', 'tickMajor: 10', 'tickMonth: 12', 'tickBand: 12', 'todayDot: 6', 'pillWidth: 40', 'pillHeight: 30', 'pillRadius: 11', 'numberSize: 16']) {
        assert.ok(tokens.includes(key), `jeton eksik: ${key}`);
    }
});

// ── Çentik hiyerarşisi (Müdür 19 revizyonu) ─────────────────────────────────
// Bir gün periyodu = 1 uzun + 9 kısa. Eskiden hepsi eşit boydaydı ve cetvel
// düz bir tarak gibi görünüyordu; gün rakamlarının nereye oturduğu okunmuyordu.

test('bir günde bir uzun, dokuz kısa çentik', () => {
    const step = 49;
    assert.equal(smallTickOffsets(step).length, 9);
    // Onuncusu ayrı çiziliyor: gün merkezi.
    assert.equal(smallTickOffsets(step).length + 1, 10);
});

test('uzun çentik rakamın TAM altında, kısalar ona hiç denk gelmez', () => {
    const step = 49;
    const center = majorTickOffset(step);
    assert.equal(center, step / 2);
    // Merkez küçüklerin arasında YOK: üst üste binen iki yarı saydam çizgi
    // uzun çentiğin altını üstünden koyu gösterirdi.
    assert.ok(!smallTickOffsets(step).includes(center));
});

test('üç kademe boy: kısa < uzun < ay sınırı', () => {
    assert.ok(scrubber.tickSmall < scrubber.tickMajor);
    assert.ok(scrubber.tickMajor < scrubber.tickMonth);
    // Bant en uzun çentiğe göre; hiçbiri taşmaz.
    assert.equal(scrubber.tickBand, scrubber.tickMonth);
});

test('oynatma çizgisi uzun çentiğin TEPESİNDE biter — tek kesintisiz eksen', () => {
    // Hapın alt kenarı ile bandın dibi arası 14 pt. Çizgi 5 + uzun çentik 9
    // = 14: ikisi birleşip tek eksen olur. Çizgi dibe kadar inseydi uzun
    // çentiğin üstünden geçer, iki ayrı çizgi gibi görünürdü.
    const gap = scrubber.railHeight - scrubber.numberRow;
    assert.equal(gap, 14);
    assert.equal(scrubber.playheadHeight + scrubber.tickMajor, gap);
});

test('bugün noktasının MERKEZİ hapın alt kenarı hizasında', () => {
    const gap = scrubber.railHeight - scrubber.numberRow;
    assert.equal(scrubber.todayDotBottom + scrubber.todayDot / 2, gap);
});

test('adım yan boşluğu düşer — çentik rakamın altından kaymaz', () => {
    // Levha 359 pt, yan boşluk 8 ⇒ adım (359 − 16)/7 = 49.
    assert.equal(stepFor(359 - scrubber.padX * 2), 49);
    // Çentik aralığı adımdan türer, sabit değil.
    assert.equal(smallTickOffsets(49)[0], 0);
    assert.equal(majorTickOffset(49), 24.5);
});

test('levha başlıksız kalınca 39 pt kısaldı', () => {
    // Toplanmanın amacı ekranı geri vermekti; başlık satırı gidince kazanç
    // gerçekleşti. Eski: 12 + 32 (başlık) + 51 (ray) = 95. Yeni: 12 + 44 = 56.
    assert.equal(scrubber.topGap + scrubber.railHeight, 56);
});

test('seçili hap ÇERÇEVELİ — dolgu değil kenar', () => {
    const pill = rail.slice(rail.indexOf('{selected ? ('), rail.indexOf('{today ? ('));
    assert.match(pill, /borderWidth: 1/);
    assert.match(pill, /pillBorderDark : M\.pillBorderLight/);
    // Dolgu var ama neredeyse görünmez; camın kendisi zemin.
    assert.match(pill, /pillFillDark : M\.pillFillLight/);
});

test('rakam renkleri LEVHANIN paletinden, sayfanınkinden değil', () => {
    // Levha buzlu cam: arkasından geçen içerik her karede farklı zemin yapıyor.
    // `c.tx2` gibi sayfa jetonları kâğıda göre seçilmişti, camda kayboluyordu.
    const cell = rail.slice(rail.indexOf('const RailDay'));
    assert.ok(!/c\.tx\b|c\.tx2|c\.tx3|c\.surf2|c\.bd2/.test(cell), 'sayfa jetonu kalmış');
    assert.match(cell, /M\.numDark : M\.numLight/);
});

// ── Kaydırma sağlamlığı ─────────────────────────────────────────────────────
// Şikâyet: "kaydırınca bir sağa bir sola kayıyor, ne yapacağını bilmiyor."
// Üç ayrı sebep vardı; üçü de bu testlerle kilitli.

test('kaydırma sırasında ebeveyne haber verilmez', () => {
    // Her karede `onSelect` çağrılıyordu; ebeveynin durumu değişiyor, bileşen
    // baştan çiziliyor ve FlatList kendi konumunu yeniden uyguluyordu.
    const scroll = rail.slice(rail.indexOf('const onScroll'), rail.indexOf('const commit'));
    assert.ok(!/onSelect/.test(scroll), 'kaydırma ortasında ebeveyne bildiriliyor');
    // Kaydırırken yalnız YEREL durum ve titreşim.
    assert.match(scroll, /setCentered\(next\)/);
    assert.match(scroll, /feedback\.(light|selection)\(\)/);
});

test('seçim liste DURUNCA bildirilir', () => {
    assert.match(rail, /onMomentumScrollEnd=\{commit\}/);
    assert.match(rail, /onScrollEndDrag=\{commit\}/);
    // Aynı güne ikinci kez bildirim yok.
    assert.match(rail, /if \(settled\.current === selectedISO\) return;/);
});

test('başlangıç konumu montajda donar', () => {
    // `initialScrollIndex` her çizimde yeniden hesaplanırsa FlatList onu prop
    // değişikliği sanıp listeyi yeniden konumlandırıyor.
    assert.match(rail, /const initialIndex = useRef\(indexOf\(selectedISO, bounds\)\)\.current/);
    assert.match(rail, /initialScrollIndex=\{initialIndex\}/);
    assert.ok(!/initialScrollIndex=\{indexOf\(/.test(rail));
});

test('savuruş tek güne kilitlenmez', () => {
    // `disableIntervalMomentum` hızlı savuruşta bile listeyi bir güne
    // kilitliyor, sonra sürtünme geri çekiyordu. Hareket sözleşmesi yalnız
    // `snapToInterval` + `decelerationRate` yazıyor.
    assert.ok(!/disableIntervalMomentum/.test(rail));
    assert.match(rail, /snapToInterval=\{step\}/);
    assert.match(rail, /decelerationRate="fast"/);
});

test('dışarıdan gelen seçim raya taşınır ama döngü kurmaz', () => {
    // Derin bağlantı, bildirim, "bugüne dön" — ray o güne kayar. Kaydırmanın
    // kendi ürettiği değişiklikte `settled` zaten eşit olduğu için çalışmaz.
    const effect = rail.slice(rail.indexOf('useEffect(() => {'));
    assert.match(effect, /if \(selectedISO === settled\.current\) return;/);
    assert.match(effect, /scrollToDay\(selectedISO, true\)/);
});

test('hücreler İLKEL değerle çizilir — memo ancak böyle tutar', () => {
    // `railCell` her çizimde yeni nesne üretiyordu; `memo` referans
    // karşılaştırdığı için ekrandaki dokuz gün her karede yeniden çiziliyordu.
    assert.match(rail, /const RailDay = memo\(function RailDay\(\{\s*\n\s*dateISO, label, selected, today, centerTick, step, numberRow, onPress,/);
    assert.ok(!/cell: RailCell/.test(rail), 'hücre hâlâ nesne olarak geçiyor');
    assert.match(rail, /const renderDay = useCallback/);
});

test('aynı güne dokunmak kaydırma başlatmaz', () => {
    assert.match(rail, /if \(dateISO === settled\.current\) return;/);
});

test('dokunuşla seçim gidip gelmez', () => {
    // Hap dokunulan güne anında taşınıyor ama listenin animasyonu ESKİ
    // konumdan başlıyor; araya giren ilk kare hapı geri çekiyordu.
    // Hedef doluyken `onScroll` karışmaz, ray varınca bayrak kendi düşer.
    assert.match(rail, /const jumpTarget = useRef<string \| null>\(null\)/);
    const scroll = rail.slice(rail.indexOf('const onScroll'), rail.indexOf('const commit'));
    assert.match(scroll, /if \(jumpTarget\.current\) \{[\s\S]{0,160}return;/);
    assert.match(scroll, /if \(next === jumpTarget\.current\) jumpTarget\.current = null;/);
});

test('bayrak her yoldan temizlenir — ray kilitlenemez', () => {
    // Varış (onScroll), duruş (commit) ve parmak teması (onScrollBeginDrag).
    assert.match(rail, /onScrollBeginDrag=\{\(\) => \{ jumpTarget\.current = null; \}\}/);
    assert.match(rail, /const commit = useCallback\(\(\) => \{\s*\n\s*jumpTarget\.current = null;/);
});

test('bir dokunuş bir titreşim', () => {
    // Aradan geçen günler için titreşim atılmaz; `onScroll` zaten erken dönüyor.
    const jump = rail.slice(rail.indexOf('const jumpTo'), rail.indexOf('Seçim DIŞARIDAN'));
    assert.match(jump, /feedback\.selection\(\)/);
});
