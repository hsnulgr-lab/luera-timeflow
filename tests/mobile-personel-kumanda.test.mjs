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
const sade = code(read('../mobile/src/components/AdisyonSade.tsx'));
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
            status: 'completed',
            arrived_at: '2026-09-03T10:00:00',
            service_ended_at: '2026-09-03T11:52:00',
            adisyon_items: [{ id: 'x' }],
        }, at('12:00')),
        'closed',
    );
    // Kapanış DURUMDAN: kalem yazılıp kapanış takılmışsa ziyaret hâlâ
    // kapanışta — personel yeniden gönderebilmeli.
    assert.equal(
        phaseOf({
            ...BASE,
            arrived_at: '2026-09-03T10:00:00',
            service_ended_at: '2026-09-03T11:52:00',
            adisyon_items: [{ id: 'x' }],
        }, at('12:00')),
        'closing',
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
    // Kadran ve eylem hep yerinde. Kumandada iki kaydırıcı: kapanışın kalem
    // listesi ve formül alt sayfası (Personel 08). Personel 15 (2026-10-15):
    // eski ekip listesi ve katalog sayfası kalktı; sade adisyon sayfasının
    // kaydırıcısı kendi bileşeninde (`AdisyonSade.tsx`), tek.
    assert.equal((screen.match(/<ScrollView/g) || []).length, 2, 'kapanış listesi · formül alt sayfası');
    assert.equal((sade.match(/<ScrollView/g) || []).length, 1, 'sade adisyon sayfası');
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
    // "Boyayı ekledim mi?" sorusu bir sayfa açtırmamalı. Personel 15: şeridin
    // üst satırı "4 kalem · son …"; sıfırda "yalnız randevu hizmeti"
    // (`stripLine`). Test gevşetilmedi — ölçülen şey aynı, yeri değişti.
    assert.match(screen, /const lastName = lastAdded \|\| liveLines\(lines\)\[liveLines\(lines\)\.length - 1\]\?\.name \|\| null;/);
    assert.match(screen, /<SadeStrip[\s\S]*?lastName=\{lastName\}/);
    assert.ok(screen.includes('setLastAdded'));
});

test('tutar AÇIK — maske iki kabukta da kalktı (kullanıcı kararları, 2026-10-15)', () => {
    // Eski kural: "para maskeli, 6 sn'de kapanıyor — ekranı müşteri görüyor".
    // Önce tek kişilikte, sonra ekipte kaldırıldı ("açık, tek kişilik gibi"):
    // her tahsilatta "Göster"e basmak fazladan bir adımdı ve "tutar
    // anlaşılmıyor" derdinin yarısıydı.
    assert.ok(!/setRevealed|revealTimer|const reveal\b/.test(screen), 'maske durumu geri gelmiş');
    assert.ok(!/eyeoff|Göster|Gizle/.test(screen + sade));
});

test('bekleme sayfası DOĞRUYU söylüyor: süre dolunca telefon haber verir (2026-10-16)', () => {
    // Eski metin "sunucuya yazılmaz · kapalıyken ses çalmaz" idi; 112 beklemeyi
    // sunucuya yazdı, `waitAlarm` kapalıyken de bildirim kuruyor — ikisi de
    // yanlış kalmıştı ("sunucu" ayrıca yasak kelime).
    assert.ok(screen.includes('Süre dolunca bu telefon haber verir'));
    assert.ok(screen.includes('bildirimleri kapalıysa'), 'izin yoksa bildirim gelmediği gizlenmemeli');
    assert.ok(!screen.includes('sunucuya yazılmaz') && !screen.includes('ses çalmaz'));
});

test('halkanın altındaki ad hizmete özel değil: "25 dk bekleme" — "Boya" her hizmette yazıyordu', () => {
    assert.match(screen, /function waitSource\(minutes: number\): string \{\s*return `\$\{minutes\} dk bekleme`;/);
    assert.ok(!/`Boya · \$\{minutes\} dk`/.test(screen));
});

// Sunucuda not ucu YOKTU, `NoteSheet` salt okunurdu ve bunu itiraf ediyordu
// ("Sunucuda not ucu henüz yok"). 2026-09-22'de `visit.note` açıldı — sayfa
// artık yazıyor, o yüzden eski itiraf da kalkmalı: hâlâ duruyorsa uç yine
// bağlanmamış demektir.

test('not artık yazılabiliyor — eski "ucu yok" itirafı kalkmış', () => {
    assert.ok(!screen.includes('Sunucuda not ucu henüz yok'), 'itiraf hâlâ duruyor — uç bağlanmamış olabilir');
    assert.ok(screen.includes('writeVisitNote'), 'kaydet yolunu bulamadım');
    assert.ok(screen.includes('TextInput'), 'NoteSheet hâlâ salt okunur görünüyor');
});

test('not sunucuya YALNIZ metin gerçekten değiştiyse gidiyor', () => {
    const note = screen.slice(screen.indexOf('function NoteSheet('));
    assert.match(note, /disabled=\{busy \|\| !changed\}/, 'dokunulmamış not tekrar gönderilebiliyor olabilir');
});

test('not kuyruğa düşerse sayfa "gitti" demiyor, kapanmıyor', () => {
    assert.match(screen, /if \(out\.queued\) \{ setNoteWrite\('queued'\); return; \}/);
});

test('malzeme kalemi fiyat yerine stok hareketi söylüyor', () => {
    // Metin BİRLEŞTİ: "stoktan düşer" ile "depodan düşer" aynı olgunun iki
    // kelimesiydi; "depodan" kaldı. Personel 15: malzeme bölümünün başında
    // yazıyor, tutar sütununda yalnız para duruyor.
    assert.ok(sade.includes('depodan düşer'));
    assert.ok(!(screen + sade).includes('stoktan düşer'), 'iki ayrı kelime geri gelmiş');
    assert.match(sade, /\{material \? null : \(\s*<Amount/);
});

test('kart artık dört ekrana değil tek kumandaya gidiyor', () => {
    const today = code(read('../mobile/app/personel/index.tsx'));
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
    // Bağımlılık `params.id` DEĞİL `base?.id`: randevu asenkron geliyor ve
    // ilk çizimde boş. Parametreye bağlı kalsaydı adisyon sunucudan
    // geldiğinde hiç yüklenmezdi.
    assert.ok(/\}, \[base\?\.id\]\);/.test(screen));
    // Sabit dört kalem GİTTİ: hangi randevu açılırsa açılsın aynı kaş alma,
    // aynı saç bakım yağı görünüyordu.
    assert.ok(!screen.includes('DEFAULT_LINES'), 'sabit adisyon kalmamalı');
    assert.ok(screen.includes('setLines(linesFromItems(base?.adisyon_items))'));
});

test('kasaya gitmiş iş "adisyon açık" demiyor — ve KUYRUKTAKİ "kasada" demiyor', () => {
    // Personel 11: kilitli hâlin iki türü var. Kuyruktaki adisyon kasada
    // DEĞİL, telefonda bekliyor; plaka bunu ayırmak zorunda.
    // Plaka sunucunun kapanış türünü de okuyor: yeniden açılan ziyaret
    // oturumda gönderilmemiş olsa bile Bugün kartıyla aynı kelimeyi söylüyor.
    // Kelime DE renk DE aynı kaynaktan: birinde sunucu kapanışı unutulursa
    // plaka yeşil "Adisyon açık" gibi çelişkili bir şey söylerdi.
    assert.equal((screen.match(/plateWord\(send, closedCard\)/g) ?? []).length, 2);
    assert.doesNotMatch(screen, /plateWord\(send\)/);
    const lib = code(read('../mobile/src/lib/sendToCash.ts'));
    assert.match(lib, /'queued'\) return \{ word: 'Sırada'/);
    assert.match(lib, /word: 'Kasada', tone: 'gr'/);
    // Gönder düğmesi tekrar basılamıyor: `idle` dışında Pressable hiç yok.
    // Koşul ÇÖZÜLMÜŞ hâle bakıyor (2026-09-24): ham `state` yerel ve her
    // açılışta `idle` başlıyordu, yani tahsil edilmiş bir ziyarette düğme
    // yine basılabilir çiziliyordu.
    const send = code(read('../mobile/src/components/SendToCash.tsx'));
    assert.match(send, /view === 'idle' \? \(\s*<Pressable/);
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

test('maskenin göz ikonu da kalktı', () => {
    assert.ok(!screen.includes("name={revealed ? 'eye' : 'eyeoff'}"));
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

test('fitil YALNIZ geri alma penceresinde, sol uç sabit', () => {
    // Maskenin fitili maskeyle gitti. Kalan tek fitil geri alma penceresi:
    // ölçekle değil kaydırmayla (sol uç sabit), native sürücüde.
    assert.ok(screen.includes('export const REVEAL_MS = 6000;'), 'risk satırı hâlâ 6 sn');
    assert.ok(!screen.includes('<Fuse'), 'maske fitili geri gelmiş');
    assert.match(sade, /<LeftFuse until=\{until\} total=\{DELETE_MS\} \/>/);
    assert.ok(!/duration: [^,]*,[\s\S]{0,80}useNativeDriver: false/.test(sade));
});

test('fitil kalan süreden başlıyor — kaldığı yer DOĞRU yer', () => {
    // Geri alma penceresi yeniden çizilince fitil baştan değil KALAN süreden
    // yanmalı; yoksa 6 sn'lik pencere ekranda daha uzun görünürdü.
    assert.match(sade, /x\.setValue\(-width \* \(1 - left \/ total\)\);/);
    assert.match(sade, /\}, \[until, total, width, reduceMotion, x\]\);/);
});

test('reduceMotion açıkken çizgi yok ama BİLGİ duruyor', () => {
    // Kalan saniye "Geri al 5" düğmesinde yazılı; çizgi hareketi azalt'ta yok.
    assert.match(sade, /<Text style=\{\[\{ \.\.\.hk\(700\), fontSize: 16, color: ink\.tx2, minWidth: 10 \}, numeric\]\}>\{left\}<\/Text>/);
    assert.match(sade, /if \(reduceMotion\) return null;/);
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
