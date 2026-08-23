import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    actionsOf, durationBadge, FLOW_END, headline, isSettled, labelOf,
    mockDay, sortPresence, toneOf,
} from '../mobile/src/lib/managerFlow.ts';
import { todayISO } from '../mobile/src/lib/calendar.ts';
import { flowMetrics } from '../mobile/src/theme/tokens.ts';

// Müdür 03 — Bugünün akışı.
//
// Yerleşim Instagram ana ekranından SEÇEREK alıntı. Bu dosyanın koruduğu şey,
// alınmayanların alınmamış kalması: sonsuz kaydırma yok, görsel ağırlıklı
// düzen yok, araya araç çubuğu girmiyor. Bunlar unutulursa ekran bir iş
// uygulamasından bir tüketim uygulamasına döner.

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');

const screen = read('app/(manager)/index.tsx');
const parts = read('src/components/FlowParts.tsx');

// ── Personel şeridi ─────────────────────────────────────────────────────────

test('şerit sırası: işlemdekiler önce, sonra müsait, sonra çalışmayanlar', () => {
    const order = sortPresence(mockDay.presence).map((p) => p.state);
    assert.deepEqual(order, ['busy', 'busy', 'busy', 'free', 'leave', 'off']);
});

test('işlemdekiler en uzun sürene göre sıralanır', () => {
    // Müdürün ilk bakacağı kişi en uzun süredir işlemde olandır.
    const busy = sortPresence(mockDay.presence).filter((p) => p.state === 'busy');
    assert.deepEqual(busy.map((p) => p.minutes), [41, 24, 8]);
});

test('durum hem renkle hem kelimeyle söylenir', () => {
    // Renk tek başına anlam taşımaz.
    for (const word of ['işlemde', 'müsait', 'izinli', 'çalışmıyor']) {
        assert.match(parts, new RegExp(`'${word}'`), `${word} yazılmıyor`);
    }
    assert.match(parts, /state === 'busy'.*borderColor: c\.or/s);
    assert.match(parts, /borderStyle: 'dashed'/);
});

test('süre rozeti üç haneli dakikaya çıkmaz', () => {
    assert.equal(durationBadge(24), '24 dk');
    assert.equal(durationBadge(8), '08 dk');
    assert.equal(durationBadge(60), '1 sa');
    assert.equal(durationBadge(95), '1 sa 35 dk');
    assert.equal(durationBadge(-5), '00 dk');
});

// ── Özet şeridi ─────────────────────────────────────────────────────────────

test('özet üç rakam tek satır; kart ızgarası değil', () => {
    assert.match(parts, /export function StatLine/);
    const strip = parts.slice(parts.indexOf('export function StatLine'), parts.indexOf('function KindDot'));
    assert.match(strip, /flexDirection: 'row'/);
    assert.doesNotMatch(strip, /flexWrap/);
    assert.equal(flowMetrics.statValue, 24);
});

// ── Olay akışı ──────────────────────────────────────────────────────────────

test('her olay türünün kelimesi var', () => {
    for (const kind of ['next', 'arrived', 'started', 'finished', 'due', 'paid', 'booked', 'cancelled', 'noshow']) {
        assert.ok(labelOf(kind).length > 0, `${kind} etiketsiz`);
    }
});

test('eylem satırın içinde, üç nokta menüsünde değil', () => {
    assert.deepEqual(actionsOf('next').map((a) => a.label), ['Geldi', 'Gelmedi']);
    assert.deepEqual(actionsOf('due').map((a) => a.label), ['Tahsil et']);
    // Olmuş bitmiş olayda eylem yok.
    assert.deepEqual(actionsOf('paid'), []);
});

test('bitmiş olaylar soluk; "gelmedi" soluk DEĞİL', () => {
    assert.equal(isSettled('finished'), true);
    assert.equal(isSettled('paid'), true);
    assert.equal(isSettled('cancelled'), true);
    // Müdürün görmesi gereken bir şey: soluklaştırılmaz.
    assert.equal(isSettled('noshow'), false);
    assert.equal(isSettled('due'), false);
});

test('nokta rengi türü söyler', () => {
    assert.equal(toneOf('next'), 'orange');
    assert.equal(toneOf('due'), 'amber');
    assert.equal(toneOf('noshow'), 'red');
    assert.equal(toneOf('paid'), 'green');
});

test('başlık sürmeyen işlemi yazmaz', () => {
    assert.equal(headline('Perşembe', 14, 3), 'Perşembe · 14 randevu · 3 işlem sürüyor');
    assert.equal(headline('Pazar', 2, 0), 'Pazar · 2 randevu');
});

// ── Instagram'dan ALINMAYANLAR ──────────────────────────────────────────────

test('akış günde biter: sonsuz kaydırma yok', () => {
    assert.equal(FLOW_END, 'Bugünlük bu kadar');
    assert.match(screen, /<FlowEnd label=\{FLOW_END\}/);
    // Sayfalama ya da sonsuz yükleme yok.
    assert.doesNotMatch(screen, /onEndReached|FlatList|loadMore/);
});

test('araya araç çubuğu, filtre satırı, sekme grubu girmez', () => {
    const body = screen.slice(screen.indexOf('<ScrollView'), screen.indexOf('</ScrollView>'));
    // ScrollView kaydırma kabıdır, içerik değil.
    const allowed = /ScrollView|DayHeader|StaffStrip|StatLine|FlowDivider|FlowRow|FlowEnd|Fragment/;
    for (const tag of body.match(/<[A-Z][A-Za-z]*/g) ?? []) {
        assert.match(tag.slice(1), allowed, `beklenmeyen bileşen: ${tag}`);
    }
});

test('satırlar kart değil: kenardan kenara, arada saç teli', () => {
    // Kart içinde kart yığını telefonda daralır; nefes boşlukla verilir.
    const row = parts.slice(parts.indexOf('export function FlowRow'), parts.indexOf('export function FlowDivider'));
    assert.doesNotMatch(row, /borderRadius: radius\.(md|lg|xl)/);
    assert.match(parts, /export function FlowDivider[\s\S]*?height: 1,[\s\S]*?marginHorizontal/);
});

test('canlı işlem şeridi gömülü ve SAYFANIN TERSİ', () => {
    // Eskiden iki temada da kremdi (Müdür 03). Aydınlık temada krem sayfa
    // üstünde krem panel düzlem değiştirmediği için yıkanıp kayboluyordu;
    // 2026-08-21'de A1 paneliyle aynı `panelInk`e bağlandı.
    assert.match(parts, /function LiveStrip/);
    assert.match(parts, /const ink = dark \? panelInk\.dark : panelInk\.light/);
    assert.doesNotMatch(parts, /backgroundColor: flowMetrics\.liveBg/);
    assert.equal(flowMetrics.liveCounter, 34);
    assert.doesNotMatch(parts, /embed:/);
    // Sayaç tabular; rakamlar saniyede zıplamasın.
    assert.match(parts, /<Num\s+size=\{flowMetrics\.liveCounter\}/);
    assert.match(parts, /elapsed\(event\.elapsedSeconds \?\? 0\)/);
    // Kimin işlemi olduğu panelin TERSİ renkte hapta yazar.
    assert.match(parts, /backgroundColor: ink\.pill/);
});

test('nabız hareket azaltılmışsa durur ve tam opaklıkta kalır', () => {
    // "Sürüyor" bilgisi harekete emanet edilmez.
    const strip = parts.slice(parts.indexOf('function LiveStrip'), parts.indexOf('function DotsButton'));
    assert.match(strip, /if \(reduceMotion\) \{[\s\S]{0,120}pulse\.setValue\(1\)/);
    assert.match(strip, /useNativeDriver: true/);
});

test('üç nokta yalnız ikincil işler için', () => {
    // Ana eylem hiçbir zaman menüye girmez: Geldi ve Tahsil et açıkta.
    assert.match(parts, /function DotsButton/);
    assert.match(parts, /accessibilityLabel="Diğer işlemler"/);
    const actions = parts.slice(parts.indexOf('{actions.map('), parts.indexOf('</Pressable>', parts.indexOf('{actions.map(')));
    assert.doesNotMatch(actions, /DotsButton/);
});

test('tutar 26 pt: kartın en büyük rakamı', () => {
    assert.equal(flowMetrics.amountSize, 26);
    assert.match(parts, /size=\{flowMetrics\.amountSize\}/);
});

test('mock gün BUGÜNDÜR — cihazın günüyle ayrışmaz', () => {
    // Sabit "2026-08-13" idi ve cihazın günüyle ayrışıyordu: 12:00'deki bir
    // randevu "gelmedi" damgası yiyor, takvimin "şimdi" çizgisi başlığın
    // günüyle tutmuyordu. Ekranda iki farklı "şimdi" vardı.
    assert.equal(mockDay.dateISO, todayISO());
    assert.match(mockDay.dateISO, /^\d{4}-\d{2}-\d{2}$/);
});

// ── Müdür 04 — Kaydırılmış hâl ──────────────────────────────────────────────

test('toplanma eşikleri Takvim ekranıyla birebir aynı', () => {
    // İki ekran farklı hızda toplanırsa uygulama iki ayrı ürün gibi hisseder.
    const calendar = read('app/(staff)/calendar.tsx');
    const ranges = (src) => [...src.matchAll(/inputRange: \[(\d+), (\d+)\],\s*outputRange: \[([\d.]+), ([\d.]+)\]/g)]
        .map((m) => m.slice(1).join(','));
    for (const range of ['0,48,1,0', '32,64,0,1', '32,64,6,0', '0,24,0,1', '0,64,1,0']) {
        assert.ok(ranges(screen).includes(range), `müdür ekranında eksik eşik: ${range}`);
        assert.ok(ranges(calendar).includes(range), `takvimde eksik eşik: ${range}`);
    }
});

test('toplanmış hâl BUZLU CAM levha (Müdür 19)', () => {
    // `expo-glass-effect` bırakıldı: iOS 26 istiyordu ve altındaki sürümlerde
    // opak yüzeye düşüyordu — levha siyah bir blok gibi duruyor, altından
    // geçen özet satırı ortadan biçiliyordu. Referanstaki efekt zaten Liquid
    // Glass değil; klasik buzlu cam, yani `expo-blur`.
    assert.match(screen, /<BlurView/);
    assert.match(screen, /from 'expo-blur'/);
    // İçe aktarma ve etiket gitmeli; gerekçesi yorumda kalıyor.
    assert.doesNotMatch(screen, /<GlassView|from 'expo-glass-effect'/);
    // Okunurluk bulanıklıktan değil TON ÖRTÜSÜNDEN gelir; örtü ayrı katman ve
    // bulanıklık kapalıyken (saydamlığı azalt) tek başına taşır.
    assert.match(screen, /scrubberMetrics\.toneDark : scrubberMetrics\.toneLight/);
    assert.match(screen, /: c\.surf,/);
    assert.match(screen, /<DayScrubber/);
});

test('parıltı kaydırınca söner', () => {
    assert.match(screen, /opacity: glowOpacity/);
    assert.match(screen, /useNativeDriver: true/);
});

test('personel şeridi toplanınca kaybolur', () => {
    // Müdür 13 ile değişti: şerit artık levhanın altına YAPIŞMIYOR, sönüyor.
    // Gerekçe yer: levha 95 pt, eski kabuk 138 pt (52 çubuk + 86 şerit)
    // tutuyordu. Şerit kalsaydı toplanma kazanç değil kayıp olurdu.
    assert.equal(screen.match(/<StaffStrip/g)?.length, 1);
    assert.ok(!/StaffStrip[^>]*compact/.test(screen), 'yapışkan şerit kopyası kalmış');
    assert.match(screen, /opacity: stripOpacity/);
    const calendar = read('app/(staff)/calendar.tsx');
    assert.doesNotMatch(calendar, /stickyHeaderIndices/);
});

test('camın altına örtü serilmiyor', () => {
    // Eski düz çubukta camın altına `c.glass` + `c.bg` örtüsü seriliyordu,
    // çünkü panel şeffaf kalınca altından kayan rakamlar içinden okunuyordu.
    // Müdür 13'te gerek kalmadı: levha ekranın tepesinden başlıyor ve güvenli
    // alanı örtüyor; içeriğin altından geçmesi zaten kabul edilen davranış.
    assert.ok(!/miniBarScrim/.test(screen), 'örtü kaldırılmalıydı');
    assert.match(screen, /glass \? \(/);
});

test('şerit avatarı basma tepkisi verir', () => {
    // Şeridin dokunulabilir olduğunu söyleyen görsel işaret yok; parmak
    // değdiği an cevap veriyor. Sözleşme 02: yalnız opaklık ve ölçek.
    assert.match(parts, /function StaffAvatar/);
    assert.match(parts, /onPressIn=\{\(\) => run\(true\)\}/);
    assert.match(parts, /outputRange: \[1, reduceMotion \? 1 : pressMotion\.primaryScale\]/);
    const avatar = parts.slice(parts.indexOf('function StaffAvatar'), parts.indexOf('// ── Özet şeridi'));
    assert.match(avatar, /useNativeDriver: true/);
    // Yükseklik, renk, yarıçap animasyonlanmaz.
    assert.doesNotMatch(avatar, /height:|borderRadius:|backgroundColor:/);
});

test('levha güvenli alanı da örter', () => {
    // Yoksa içerik saat çubuğunun ardından geçip okunur hâlde görünüyor.
    // Yükseklik cetvelden türer, sabit yazılmaz.
    assert.match(screen, /height: insets\.top \+ panelInset/);
    assert.match(screen, /const panelInset = scrubberInset\(small\)/);
    const chrome = screen.slice(screen.indexOf('asılı cam levha'));
    assert.match(chrome, /top: 0,/);
});

test('görünmeyen yapışkan şerit dokunuş yakalamaz', () => {
    // Açık hâlde başlığın üstünde duran şeffaf bir katman, dev başlığa
    // dokunmayı engellerdi.
    assert.match(screen, /pointerEvents=\{collapsed \? 'auto' : 'none'\}/);
    assert.match(screen, /scrollY\.addListener/);
    assert.match(screen, /scrollY\.removeListener/);
});

test('sistem kaydırıcıyı görebilsin diye güvenli alanı iOS ekliyor', () => {
    // Tab bar'ın daralması buna bağlı: UIKit izleyeceği kaydırma görünümünü
    // güvenli alan ayarından tanıyor. Elle `paddingTop: insets.top` verirsek
    // kaydırıcı birincil sayılmıyor ve daralma hiç tetiklenmiyor.
    assert.match(screen, /contentInsetAdjustmentBehavior="automatic"/);
    const body = screen.slice(screen.indexOf('<Animated.ScrollView'), screen.indexOf('</Animated.ScrollView>'));
    assert.doesNotMatch(body, /paddingTop: insets\.top/);
});

test('eşikler güvenli alandan bağımsız kalır', () => {
    // `automatic` ile contentOffset -insets.top'tan başlıyor; `scrolled` onu
    // geri alıyor ki eşikler Takvim'inkiyle aynı sayılar kalsın.
    assert.match(screen, /const scrolled = Animated\.add\(scrollY, insets\.top\)/);
    assert.doesNotMatch(screen, /scrollY\.interpolate/);
    assert.match(screen, /value \+ insets\.top > 48/);
});

test('müdür barı kaydırınca daralır, personel barı daralmaz', () => {
    // Kumandanın tek büyük butonu her an erişilebilir kalmalı; müdür uzun
    // akış kaydırıyor, barın küçülmesi ekranı ona geri veriyor.
    assert.match(read('app/(manager)/_layout.tsx'), /minimizeBehavior="onScrollDown"/);
    assert.match(read('app/(staff)/_layout.tsx'), /minimizeBehavior="never"/);
});

test('içerik opak; cam yalnız kabukta', () => {
    // "Başlık, personel şeridi, özet şeridi ve akış satırları opak — bulanık
    // zemin üstünde rakam okunmaz." Cam olan: tab bar ve toplanmış üst çubuk.
    assert.doesNotMatch(parts, /GlassView|BlurView|expo-glass-effect|expo-blur/);
    assert.match(parts, /backgroundColor: c\.surf/);
    // Ekranda cam TEK yerde: toplanmış levha.
    assert.equal((screen.match(/<BlurView/g) || []).length, 1);
    const chrome = screen.slice(screen.indexOf('BUZLU CAM'));
    assert.match(chrome, /<BlurView/);
});

test('uygulamanın tek gradyanı: tepedeki parıltı', () => {
    assert.equal((screen.match(/LinearGradient/g) || []).length, 2);
    assert.match(screen, /colors=\{dark \? glow\.dark : glow\.light\}/);
});
