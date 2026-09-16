import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    SEAL_MS, UNDO_NOTE_MS, WINDOW_MS, barFoot, barTitle, canUndo, errorLine,
    isSealed, plateWord, secondsLeft, windowLine,
} from '../mobile/src/lib/sendToCash.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const bar = code(read('../mobile/src/components/SendToCash.tsx'));
const screen = code(read('../mobile/app/(staff-flow)/kumanda.tsx'));

// ── Pencerenin kendisi ──────────────────────────────────────────────────────

test('geri alma YALNIZ pencerede — başka hiçbir hâlde', () => {
    assert.equal(canUndo('window'), true);
    for (const state of ['idle', 'going', 'sent', 'sealed', 'queued', 'error']) {
        assert.equal(canUndo(state), false, state);
    }
});

test('pencere boyunca İSTEK GÖNDERİLMİYOR — geri alma bir uç istemiyor', () => {
    // Turun tek büyük kararı bu: geri alınacak bir şey yok, çünkü henüz
    // gitmedi. Sunucuda "gönderilmiş adisyonu geri çağır" ucu da yok.
    assert.match(barFoot('window'), /istek gönderilmiyor/);
    assert.equal(WINDOW_MS, 6000);
    // Ekran isteği ancak pencere dolunca başlatıyor.
    assert.match(screen, /send === 'window'[\s\S]{0,120}setSend\('going'\), WINDOW_MS/);
    // Geri alma sunucuya hiçbir şey söylemiyor.
    assert.match(screen, /onUndo=\{\(\) => \{ setSend\('idle'\); setUndone\(true\); \}\}/);
});

test('fitil ve rakam TEK kaynaktan — asla ayrışmıyorlar', () => {
    const began = 1_000_000;
    assert.equal(secondsLeft(began, began), 6);
    assert.equal(secondsLeft(began, began + 2400), 4);
    assert.equal(secondsLeft(began, began + 6000), 0);
    // Geçmiş bir pencere negatif saniye üretmiyor.
    assert.equal(secondsLeft(began, began + 99_000), 0);
});

test('reduceMotion fitili kaldırır, SÜREYİ kaldırmaz', () => {
    assert.match(windowLine(4, true), /geri alma penceresi · 4 sn/);
    assert.match(windowLine(4, false), /4 sn içinde geri alabilirsiniz/);
    // Fitil yalnız hareket açıkken çiziliyor; sayaç her hâlde akıyor.
    assert.match(bar, /windowOpen && !reduceMotion \?/);
    assert.match(bar, /if \(reduceMotion\) return;\s*fuse\.value = withTiming\(0/);
});

// ── Üç ağ hâli ──────────────────────────────────────────────────────────────

test('"sıraya alındı" yeşilin KISIK HÂLİ DEĞİL', () => {
    // Üç şey birden ayrışıyor: renk, gövde ve kelime.
    assert.equal(barTitle('queued'), 'Sırada · gönderilmedi');
    assert.equal(barTitle('sent'), 'Kasaya gönderildi');
    assert.match(barFoot('queued'), /tekrar basmanız gerekmiyor/);
    // Kuyruk ve hata dolgusuz çerçeve; yeşil dolgu yalnız `sent`te.
    assert.match(bar, /backgroundColor: bad \? 'rgba\(224,114,114,0\.09\)' : 'transparent'/);
});

test('plaka kuyruktakine KASADA demiyor', () => {
    assert.deepEqual(plateWord('queued'), { word: 'Sırada', tone: 'am' });
    assert.deepEqual(plateWord('sealed'), { word: 'Kasada', tone: 'gr' });
    assert.deepEqual(plateWord('window'), { word: 'Adisyon açık', tone: 'am' });
    // Kumanda BUGÜN KARTIYLA AYNI (kullanıcı kararı, 2026-09-15): yeniden
    // açılan kasadaki ziyaret "Adisyon açık" DEMİYOR, ödenmişse "Tahsil edildi".
    assert.deepEqual(plateWord('idle', 'atcash'), { word: 'Kasada', tone: 'gr' });
    assert.deepEqual(plateWord('idle', 'paid'), { word: 'Tahsil edildi', tone: 'gr' });
    // Ödenmiş ziyaret her şeyin üstünde; sunucuda kapanmamışsa eski davranış.
    assert.deepEqual(plateWord('queued', 'paid'), { word: 'Tahsil edildi', tone: 'gr' });
    assert.deepEqual(plateWord('idle', null), { word: 'Adisyon açık', tone: 'am' });
    // Kelimeler Bugün kartıyla BİREBİR.
    const card = code(read('../mobile/src/lib/staffCard.ts'));
    assert.match(card, /word: 'Kasada', tone: 'gr'/);
    assert.match(card, /word: 'Tahsil edildi', tone: 'gr'/);
});

test('hata kuyruğa GİRMİYOR ve tekrar dene düğmesi yok', () => {
    // 403 ve 409 tekrar denemekle düzelmiyor.
    assert.match(barFoot('error'), /tekrar denemek düzeltmez/);
    assert.doesNotMatch(bar, /Tekrar dene|tekrar dene/);
    assert.equal(errorLine('forbidden'), 'Bu adisyonu gönderme yetkiniz yok');
    assert.equal(errorLine('already_open'), 'Kasadaki adisyon açıldı');
});

test('hata TİTREMİYOR — kötü haber kendini sallayarak duyurmaz', () => {
    // `Frozen` kuyruğu ve hatayı çiziyor: içinde hiçbir animasyon yok.
    const frozen = bar.slice(bar.indexOf('function Frozen'), bar.indexOf('function Pulse'));
    assert.doesNotMatch(frozen, /withTiming|withSpring|withRepeat|Animated\./);
    assert.doesNotMatch(bar, /shake/);
});

// ── Kilit ───────────────────────────────────────────────────────────────────

test('kilit VERİDEN geliyor ve `going` kilitli DEĞİL', () => {
    assert.equal(isSealed('sent'), true);
    assert.equal(isSealed('sealed'), true);
    assert.equal(isSealed('queued'), true);
    // İstek yolda ama henüz kabul edilmedi: erken mühür erken bir söz olurdu.
    assert.equal(isSealed('going'), false);
    assert.equal(isSealed('window'), false);
});

test('kilit bir İKON değil: yapılamayan kontrol ekranda durmuyor', () => {
    // "Kalem ekle" mühürlüyken kısık değil, hiç çizilmiyor.
    assert.match(screen, /\{sealed \? null : \(/);
    // Şerit dolgusunu ve çerçevesini bırakıyor — yüzey değil, etiket.
    assert.match(screen, /backgroundColor: sealed \? 'transparent' : c\.surf/);
    assert.match(screen, /mühürlü · değiştirilemez/);
});

test('düzeltme isteği DÜĞMESİ çizilmedi, cümlesi yazıldı', () => {
    // Sunucuda karşılığı yok: ölü düğme yerine nereye söyleneceği yazılı.
    assert.match(barFoot('sealed'), /kasaya söylemeniz gerekiyor/);
    assert.doesNotMatch(bar, /Düzeltme iste|düzeltme isteği/);
});

// ── Zamanlar ────────────────────────────────────────────────────────────────

test('süreler tasarımın söylediği yerde', () => {
    assert.equal(WINDOW_MS, 6000);
    assert.equal(SEAL_MS, 2600);
    assert.equal(UNDO_NOTE_MS, 2600);
    assert.match(bar, /duration: done \? 220 : 180/);
    assert.match(bar, /damping: 20, stiffness: 210/);
    assert.match(bar, /FadeIn\.duration\(140\)/);
    assert.match(bar, /FadeOut\.duration\(100\)/);
});

test('yazılmış ekranlar reanimated\'e TAŞINMADI', () => {
    // Yeni paket yalnız bu anın ihtiyacı kadar kullanıldı.
    assert.doesNotMatch(screen, /react-native-reanimated/);
    const controls = code(read('../mobile/src/components/VisitControls.tsx'));
    assert.doesNotMatch(controls, /react-native-reanimated/);
    assert.match(controls, /PanResponder/);
});

test('onay ikonu ÇİZİLMİYOR, takas ediliyor', () => {
    // Çizilen bir onay işareti gösteriye dönüşüyor; onay okunmak için var.
    assert.doesNotMatch(bar, /strokeDashoffset|dashoffset/);
});

// ── Yerleşim ────────────────────────────────────────────────────────────────

test('düğme kendi genişliğini dayatıyor', () => {
    // Eylem bölgesi ortalayan bir kap. Dolgusuz bir düğme orada iki
    // piksellik dikey bir şeride çöküyordu; genişlik çağırana bırakılamaz.
    // Üç gövde: animasyonlu, mühür ve donmuş (kuyruk/hata).
    const roots = bar.match(/alignSelf: 'stretch', gap: 9/g) ?? [];
    assert.equal(roots.length, 3, 'her gövde kendi genişliğini almalı');
});

test('para maskesi C evresinde bir kez çiziliyor', () => {
    // Kadran ve şerit aynı tutarı iki kez maskeleyince biri açılıp öteki
    // kapalı kalabiliyordu — tek sır, iki kapak.
    assert.match(screen, /money=\{false\}/);
    // Koşula ikinci bir şart eklendi: SIFIR kalemde maske hiç çizilmiyor —
    // sıfır lirayı üç noktayla saklamak sahte bir gizlilik (Personel 13).
    assert.match(screen, /showMoney && strip\.money \? \(/);
});

test('turuncu YALNIZ basılmayı bekleyen düğmede', () => {
    // Turuncu bu üründe EYLEM demek. `going` (istek yolda) ve `sealed`
    // (mühür) bir zamanlar sessizce turuncuya düşüyordu; ikisinde de
    // yapılacak bir şey yok.
    assert.match(bar, /const stopOf = windowOpen \|\| going \? STOP\.window/);
    assert.match(bar, /if \(state === 'sealed'\)/);
});

test('mühür yeşil DOLGU değil, sönük çerçeve', () => {
    // Dolgu "az önce oldu" demek ve 2.6 saniye yaşıyor; mühür kalıcı.
    assert.match(bar, /borderColor: 'rgba\(95,191,100,0\.30\)'/);
    assert.match(bar, /backgroundColor: 'rgba\(95,191,100,0\.10\)'/);
});

test('istek yoldayken halka değil, üç nokta', () => {
    // Halka bu üründe bekleme sayacının işi ve 238 pt'lik bir kahraman.
    assert.match(bar, /function Pulse/);
    // Üç nokta, 1200 ms'lik nefes: 600 + 600.
    assert.match(bar, /duration: 600/);
    assert.match(bar, /\[0, 160, 320\]/);
});
