// Personel 05/06 · İşlem kumandası — karar katmanı ve ekranın sözleşmesi.
//
// Kaynak: Claude Design "Personel 05 Islem Kumandasi" (tam tasarım) ve
// "Personel 06" (rötuş turu).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(here, p), 'utf8');
/** Yorum satırlarını atar: iddialar YAZILAN koda bakmalı, açıklamaya değil. */
const code = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

const {
    phaseOf, dialA, planBar, mmss, waitLevel, glowTone,
} = await import('../mobile/src/lib/visitControl.ts');

const screen = code(read('../mobile/app/(staff-flow)/kumanda.tsx'));
const controls = code(read('../mobile/src/components/VisitControls.tsx'));

const BASE = {
    date: '2026-09-03',
    start_time: '10:00',
    end_time: '12:00',
    status: 'confirmed',
    arrived_at: null,
    service_ended_at: null,
    adisyon_items: null,
    is_paid: false,
};
const at = (hhmm) => Date.parse(`2026-09-03T${hhmm}:00`);

// ── Evre veriden okunuyor ───────────────────────────────────────────────────

test('evre VERİDEN okunuyor, çağıran seçmiyor', () => {
    assert.equal(phaseOf(BASE, at('09:30')), 'before');
    assert.equal(phaseOf({ ...BASE, arrived_at: '2026-09-03T10:00:00' }, at('10:30')), 'running');
    assert.equal(
        phaseOf({ ...BASE, arrived_at: '2026-09-03T10:00:00', service_ended_at: '2026-09-03T11:52:00' }, at('12:00')),
        'closing',
    );
    assert.equal(
        phaseOf({
            ...BASE,
            arrived_at: '2026-09-03T10:00:00',
            service_ended_at: '2026-09-03T11:52:00',
            adisyon_items: [{ id: 'x' }],
        }, at('12:00')),
        'closed',
    );
});

// ── A evresinin kadranı ─────────────────────────────────────────────────────

test('A kadranı planlanan saati DEĞİL, haberi gösteriyor', () => {
    // Personel randevunun 10:00'da olduğunu zaten biliyor; haber olan
    // müşterinin kapıda beklediği ya da gecikme.
    const waiting = dialA({ ...BASE, customer_arrived_at: '2026-09-03T09:50:00' }, at('10:00'));
    assert.equal(waiting.kind, 'waiting');
    assert.equal(waiting.value, 10);
    assert.equal(waiting.unit, 'BEKLİYOR');
    assert.equal(waiting.chip, null, 'kapıdayken hap yok');

    const late = dialA(BASE, at('10:14'));
    assert.equal(late.kind, 'late');
    assert.equal(late.value, 14);
    assert.equal(late.unit, 'GECİKME');
    assert.equal(late.chip, "10:00'da başlayacaktı");

    const ahead = dialA(BASE, at('09:42'));
    assert.equal(ahead.kind, 'ahead');
    assert.equal(ahead.value, 18);
    assert.equal(ahead.tone, 'mut', 'saat gelmediyse haber yok, sönük durur');
    assert.equal(ahead.chip, "10:00'da başlıyor");
});

test('kapıdaki müşteri gecikmeyi bastırıyor', () => {
    // Saat de geçmiş, müşteri de kapıda: personelin görmesi gereken şey
    // müşterinin BEKLEDİĞİ, randevunun geciktiği değil.
    const d = dialA({ ...BASE, customer_arrived_at: '2026-09-03T10:05:00' }, at('10:20'));
    assert.equal(d.kind, 'waiting');
    assert.equal(d.value, 15);
});

// ── Plan çubuğu ─────────────────────────────────────────────────────────────

test('aşım turuncuyla DEĞİL kırmızıyla söyleniyor', () => {
    const normal = planBar(BASE, 75 * 60);
    assert.equal(normal.overMinutes, 0);
    assert.equal(normal.marker, 1);
    assert.equal(normal.label, '120 dk plan · 45 dk kaldı');

    const over = planBar(BASE, 132 * 60);
    assert.equal(over.overMinutes, 12);
    assert.equal(over.progress, 1, 'aşımda çubuk dolu');
    assert.ok(over.marker < 1, 'plan işareti geriye kayıyor');
});

test('gece yarısını aşan randevuda plan sıfır çıkmıyor', () => {
    const bar = planBar({ start_time: '23:30', end_time: '00:30' }, 0);
    assert.equal(bar.label, '60 dk plan · 60 dk kaldı');
});

// ── Bekleme sayacı ──────────────────────────────────────────────────────────

test('bekleme son beş dakikada kademe değiştiriyor', () => {
    assert.equal(waitLevel(20 * 60), 'calm');
    assert.equal(waitLevel(301), 'calm');
    assert.equal(waitLevel(300), 'hot');
    assert.equal(waitLevel(0), 'zero');
    assert.equal(mmss(724), '12:04');
});

test('sıcak ışık okumadan durum veriyor', () => {
    assert.equal(glowTone('running', null), 'or');
    assert.equal(glowTone('running', 'calm'), 'am');
    assert.equal(glowTone('running', 'hot'), 'rd');
    assert.equal(glowTone('running', 'zero'), 'rd');
});

// ── Ekranın sözleşmesi ──────────────────────────────────────────────────────

test('cam güverte kalktı — her evrenin eylemi kendi gövdesi', () => {
    assert.ok(!/GlassView|BlurView/.test(screen), 'kumandada cam kabuk kalmamalı');
    assert.ok(!screen.includes('deck'), 'güverte kavramı tamamen kalkmıştı');
});

test('sayfa kaydırılmıyor — yalnız kapanış listesi kendi içinde kayıyor', () => {
    // Tek ScrollView C evresinin kalem listesi; kadran ve eylem hep yerinde.
    const count = (screen.match(/<ScrollView/g) || []).length;
    assert.equal(count, 2, 'yalnız kalem listesi ve katalog sayfası kayabilir');
});

test('ekranda kaç onay var: BİR', () => {
    assert.ok(!/emin misin/i.test(screen), 'jestin kendisi onay, ikinci pencere yok');
    assert.ok(!/Alert\.alert/.test(screen));
});

test('kaydırma tek yol değil — ekran okuyucu da başlatabiliyor', () => {
    assert.ok(controls.includes('onAccessibilityTap'), 'kaydıramayan kullanıcı kilitlenirdi');
});

test('reanimated ve gesture-handler kullanılmıyor', () => {
    for (const src of [screen, controls]) {
        assert.ok(!src.includes('react-native-reanimated'));
        assert.ok(!src.includes('react-native-gesture-handler'));
    }
    assert.ok(controls.includes('PanResponder'), 'kaydırma PanResponder ile');
});

test('kaydırma eşiği %72 ve bitirme 900 ms', () => {
    assert.ok(controls.includes('threshold: 0.72'));
    assert.ok(controls.includes('hold: 900'));
});

test('adisyon şeridi son eklenen kalemi söylüyor', () => {
    // "Boyayı ekledim mi?" sorusu bir sayfa açtırmamalı.
    assert.ok(screen.includes('last={lastAdded}'));
    assert.ok(screen.includes('setLastAdded'));
});

test('para maskeli ve kendiliğinden kapanıyor — ekranı müşteri görüyor', () => {
    assert.ok(screen.includes('setTimeout(() => setRevealed(false), 6000)'));
});

test('bekleme sayacının sunucuya yazılmadığı personele SÖYLENİYOR', () => {
    assert.ok(screen.includes('Bu sayaç sunucuya yazılmaz'));
    assert.ok(screen.includes('ses çalmaz'), 'bildirim yokluğu gizlenmemeli');
});

test('not ucu yok — ölü kontrol değil, bekleyen iş olarak yazılı', () => {
    assert.ok(screen.includes('Sunucuda not ucu henüz yok'));
});

test('malzeme kalemi fiyat yerine stok hareketi söylüyor', () => {
    assert.ok(screen.includes('stoktan düşer'));
});

test('kart artık dört ekrana değil tek kumandaya gidiyor', () => {
    const today = code(read('../mobile/app/(staff)/index.tsx'));
    assert.ok(today.includes("pathname: '/(staff-flow)/kumanda'"));
    assert.ok(!today.includes("'/visit'"), 'eski iki rota kalmamalı');
    assert.ok(!today.includes("'/appointment'"));
});

// ── Cihazda görülen üç hata ─────────────────────────────────────────────────

test('bitmiş randevunun sayacı DURUYOR — akşam "156 dk sürdü" demiyor', () => {
    // Merve 19:05'te başladı, 19:50'de bitti: 45 dakika. Saat 21:41 olduğunda
    // hâlâ 45 dakika olmalı, 156 değil.
    assert.ok(
        screen.includes('appointment.service_ended_at\n        ? Date.parse(appointment.service_ended_at)\n        : now'),
        'geçen süre bitiş damgasına kadar hesaplanmalı',
    );
});

test('randevu değişince yerel durum sıfırlanıyor', () => {
    // expo-router aynı rotayı yeniden kullanabiliyor; sıfırlama olmadan bir
    // önceki randevunun "bitti" damgası sonrakine sızıyordu.
    assert.ok(/\}, \[params\.id\]\);/.test(screen));
    assert.ok(screen.includes('setLines(DEFAULT_LINES)'));
});

test('kasaya gitmiş iş "adisyon açık" demiyor', () => {
    assert.ok(screen.includes("delivered ? { word: 'Kasada'"));
    assert.ok(screen.includes('disabled={delivered}'), 'gönder düğmesi tekrar basılamamalı');
});

test('ikonlar tasarımın kendi yolları — View taklidi değil', () => {
    const glyph = code(read('../mobile/src/components/Glyph.tsx'));
    // Telefon bir döndürülmüş kare, göz bir daire olmuştu.
    assert.ok(glyph.includes('M7.2 3.6h2.2l1.4 3.6'), 'telefon yolu');
    assert.ok(glyph.includes('M2.6 12S6 6.4 12 6.4'), 'göz yolu');
    assert.ok(glyph.includes('cy={13.4}'), 'zamanlayıcı yolu');
    assert.ok(!screen.includes('ToolGlyph'), 'elle çizilmiş ikonlar kalmamalı');
    assert.ok(!controls.includes('borderRightWidth: 2.2'), 'ok taklidi kalmamalı');
});

test('para maskesi göz ikonuyla durumunu söylüyor', () => {
    assert.ok(screen.includes("name={revealed ? 'eye' : 'eyeoff'}"));
});

test('alt sayfanın tutamacı gerçekten çekiliyor', () => {
    // Tutamaç bir süs değil: iOS'ta o çubuk "beni aşağı çek" demek. Çekilince
    // kapanmayan sayfa ölü bir kontroldür.
    assert.ok(screen.includes('PanResponder.create'), 'jest tanımlı olmalı');
    assert.ok(screen.includes('onPanResponderMove: (_e, g) => drag.setValue'));
    assert.ok(/const far = g\.dy > Math\.max\(96/.test(screen), 'eşik mesafe');
    assert.ok(screen.includes('g.vy > 1.1'), 'hızlı fiske de kapatmalı');
});

test('tutamaç şeridi 44 pt ve ekran okuyucuya açık', () => {
    // Eller dolu: 32 pt'lik şerit ıslak parmakla tutulmuyordu. Sürükleyemeyen
    // bir kullanıcı için de kapanma yolu kalmalı.
    assert.ok(screen.includes('{...pan.panHandlers}'));
    assert.ok(screen.includes('height: 44, alignItems: \'center\''), 'tutamaç şeridi 44 pt');
    assert.ok(screen.includes('onAccessibilityTap={shut}'));
});

test('perde parmağa bağlı — sayfa indikçe arka iş görünüyor', () => {
    assert.ok(screen.includes('const veil = Animated.multiply('));
    assert.ok(screen.includes("extrapolate: 'clamp'"));
});

// ── Kaydırma çubuğunun akıcılığı ────────────────────────────────────────────

test('ok nefes alıyor ama parmak değince susuyor', () => {
    assert.ok(controls.includes('const loop = Animated.loop('));
    assert.ok(controls.includes('if (reduceMotion || disabled || held)'), 'durgunluk koşulu');
});

// ── Para maskesinin fitili ──────────────────────────────────────────────────

test('maske açıkken fitil yanıyor — tutar sebepsizce kaybolmuyor', () => {
    // Sayaç zaten vardı ama görünmüyordu: 6 saniye sonra tutar sebepsiz
    // kayboluyordu. Fitil o sebebi ekrana koyuyor.
    assert.ok(screen.includes('export const REVEAL_MS = 6000;'));
    assert.ok(screen.includes('{revealed ? <Fuse runKey={runKey} big={big} /> : null}'));
    assert.ok(screen.includes('{ scaleX: p }'), 'fitil ölçekle sürülmeli');
    assert.ok(!/duration: REVEAL_MS[\s\S]{0,120}useNativeDriver: false/.test(screen));
});

test('her açılışta fitil BAŞTAN yanıyor', () => {
    // Kaldığı yerden devam etseydi ikinci dokunuş bir saniye açıp kapatırdı.
    assert.ok(screen.includes('setRevealKey((n) => n + 1)'));
    assert.ok(screen.includes('}, [p, runKey, reduceMotion]);'));
});

test('reduceMotion açıkken çizgi yok ama BİLGİ duruyor', () => {
    assert.ok(screen.includes('{left} sn'), 'kalan saniye yazıyla söylenmeli');
    assert.ok(screen.includes('if (reduceMotion) return;'));
});

test('not noktası gerçek nota bağlı', () => {
    // Sabit noktaydı: notu olmayan randevuda da yanıyordu. Üçüncü boş
    // açılıştan sonra personel o noktaya bakmayı bırakır.
    assert.ok(screen.includes('dot={Boolean(appointment.notes)}'));
    assert.ok(!/glyph="note" dot /.test(screen), 'koşulsuz nokta kalmamalı');
});

test('defterin ikonları tasarımın yollarıyla eklendi', () => {
    const glyph = code(read('../mobile/src/components/Glyph.tsx'));
    assert.ok(glyph.includes('M4 5.4h16v10.2h-7.4L8 19.4v-3.8H4z'), 'msg yolu');
    assert.ok(glyph.includes('M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6'), 'close yolu');
    assert.ok(glyph.includes('msg: 1.7, close: 1.8'), 'çizgi kalınlıkları tasarımdan');
});
