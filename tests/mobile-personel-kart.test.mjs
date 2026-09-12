/**
 * Personel 02 — sıra kartının dokuz hâli.
 *
 * Buradaki testlerin çoğu SIRAYI kilitliyor, hâlleri değil. Dokuz koşulun
 * birkaçı aynı anda doğru olabiliyor: tahsil edilmiş bir randevu aynı zamanda
 * "saati geçti, damga yok" testini de geçer ve sıra yanlışsa GECİKTİ görünür.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    cardState, formatCounter, formatDuration, localStamp, nowLineAfter, stripDays,
} from '../mobile/src/lib/staffCard.ts';
import { dayNameShort, monthShort } from '../mobile/src/lib/calendar.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
/** Yorumlar elenir: dosya başlığı kaldırılan tasarımı ANLATIYOR, taşımıyor. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const screen = code(read('../mobile/app/personel/index.tsx'));
const card = code(read('../mobile/src/components/AppointmentCard.tsx'));

const DATE = '2026-08-30';
const NOW = localStamp(DATE, '12:36');
const ago = (minutes) => new Date(NOW - minutes * 60_000).toISOString();

const base = {
    date: DATE,
    start_time: '11:30',
    end_time: '13:30',
    status: 'confirmed',
    customer_arrived_at: null,
    arrived_at: null,
    service_ended_at: null,
    adisyon_items: null,
    is_paid: false,
};

test('01 · gelecek randevunun durum satırı YOK — kart iki satır', () => {
    const s = cardState({ ...base, start_time: '15:00', end_time: '15:20' }, NOW);
    assert.equal(s.kind, 'upcoming');
    assert.equal(s.word, null);
    assert.equal(s.tone, null, 'ton null olmazsa kartın sağında hat çizilir');
    assert.equal(s.duration, '20 dk');
});

test('02 · kapıda: bekleme süresi dakika dakika büyür', () => {
    const s = cardState({ ...base, start_time: '12:30', end_time: '13:00', customer_arrived_at: ago(6) }, NOW);
    assert.equal(s.kind, 'waiting');
    assert.equal(s.suffix, '6 dk bekliyor');
    assert.equal(s.tone, 'am');
});

test('02 · saati geçmiş ama müşteri kapıda olan randevu GECİKTİ değildir', () => {
    const s = cardState({ ...base, start_time: '12:30', end_time: '13:00', customer_arrived_at: ago(6) }, NOW);
    assert.equal(s.kind, 'waiting');
});

test('03 · sürüyor: sayaç var, planlanan süre durum satırında', () => {
    const s = cardState({ ...base, arrived_at: ago(66) }, NOW);
    assert.equal(s.kind, 'running');
    assert.equal(s.counter, '66:00');
    assert.equal(s.suffix, '120 dk planlandı');
    assert.equal(s.duration, null, 'sayaç ile süre aynı anda görünemez');
    assert.equal(s.tone, 'tx', 'normal akış kendi rengini istemiyor');
});

test('04 · uzadı: sayaç turuncu kalır, uzama KELİMEYLE söylenir', () => {
    const s = cardState({ ...base, end_time: '12:00', arrived_at: ago(37) }, NOW);
    assert.equal(s.kind, 'over');
    assert.equal(s.tone, 'rd');
    assert.equal(s.suffix, '7 dk aştı');
    assert.ok(s.counter, 'uzayan işlemde de sayaç sürüyor');
});

test('05 · gecikti: hiç damga yoksa ve saat geçtiyse', () => {
    const s = cardState({ ...base, start_time: '12:00', end_time: '12:30' }, NOW);
    assert.equal(s.kind, 'late');
    assert.equal(s.suffix, '36 dk');
    assert.equal(s.tone, 'rd');
});

test('06 · adisyon gönderilmemiş iş SÖNÜKLEŞMEZ — personelin işi bitmedi', () => {
    const s = cardState({ ...base, arrived_at: ago(120), service_ended_at: ago(60) }, NOW);
    assert.equal(s.kind, 'unbilled');
    assert.equal(s.dim, 0, 'sönükleşme "buna dönmene gerek yok" demektir');
    assert.equal(s.tone, 'am');
});

test('07 · kasada yeşildir ama "ödendi" demez', () => {
    const s = cardState({ ...base, service_ended_at: ago(60), adisyon_items: [{ id: 'x' }] }, NOW);
    assert.equal(s.kind, 'atcash');
    assert.equal(s.word, 'Kasada');
    assert.equal(s.dim, 1);
});

test('08 · tahsil edilmiş randevu GECİKTİ görünmez', () => {
    const s = cardState({ ...base, start_time: '09:00', end_time: '09:45', is_paid: true }, NOW);
    assert.equal(s.kind, 'paid');
    assert.equal(s.dim, 2);
});

test('09 · iptal: renkten önce okunan çizgi', () => {
    const s = cardState({ ...base, status: 'cancelled', is_paid: true }, NOW);
    assert.equal(s.kind, 'cancelled', 'iptal her damganın üstündedir');
    assert.equal(s.strike, true);
});

test('şimdi çizgisi son geçmiş randevudan SONRA durur', () => {
    const day = [
        { date: DATE, start_time: '10:00' },
        { date: DATE, start_time: '12:30' },
        { date: DATE, start_time: '15:00' },
    ];
    assert.equal(nowLineAfter(day, NOW), 1);
    assert.equal(nowLineAfter(day, localStamp(DATE, '08:00')), -1, 'gün başlamadıysa çizgi listenin üstünde');
});

test('sayaç saate çevrilmez: 66 dakika "66:12" kalır', () => {
    assert.equal(formatCounter(66 * 60 + 12), '66:12');
    assert.equal(formatDuration(45), '45 dk');
    assert.equal(formatDuration(90), '1 sa 30 dk');
});

test('kartın içinde ikinci bir dokunma hedefi yok', () => {
    // Sağdaki işaret DURUM işaretidir: dokunulursa ölü kontrol olurdu.
    const pressables = card.match(/<Pressable/g) ?? [];
    assert.equal(pressables.length, 1, 'kartın tamamı tek hedef');
});

test('eski kahraman kart ve morph ekrandan kalktı', () => {
    for (const dead of ['İşleme başla', 'LayoutAnimation', 'VisitStartMorph', 'Alerji notu var']) {
        assert.ok(!screen.includes(dead), `"${dead}" hâlâ ekranda`);
    }
});

test('gün başlığının alt satırı sayılardan türer, yazılı değildir', () => {
    assert.ok(!screen.includes('4 kaldı"'), 'sabit metin kalmış');
    assert.ok(screen.includes('iş bitti, ${left} kaldı'), 'alt satır sayılardan kurulmalı');
});

test('customer_arrived_at sunucudan geliyor — yoksa KAPIDA hâli ölü doğar', () => {
    const server = read('../supabase/functions/staff-api/index.ts');
    const cols = /const RES_COLS = ([\s\S]*?);/.exec(server);
    assert.ok(cols, 'RES_COLS bulunamadı');
    assert.ok(cols[1].includes('customer_arrived_at'), 'sütun uçta kapalı');
    assert.ok(read('../mobile/src/api/staff.ts').includes('customer_arrived_at'));
});

test('gün şeridi bugünün ETRAFINDA döner, pazartesi başlangıçlı hafta değil', () => {
    // 30 Ağustos 2026 bir PAZAR. Pazartesi başlangıçlı bir şeritte bugün en
    // sağda kalır ve personel yarını göremez.
    const days = stripDays('2026-08-30');
    assert.equal(days.length, 7);
    assert.equal(days[3], '2026-08-30', 'bugün ortada durmalı');
    assert.equal(days[0], '2026-08-27');
    assert.equal(days[6], '2026-09-02');
    assert.deepEqual(
        days.map(dayNameShort),
        ['Per', 'Cum', 'Cmt', 'Paz', 'Pzt', 'Sal', 'Çar'],
    );
});

test('ay sınırı kısaltması Türkçe büyük harfle çıkar', () => {
    assert.equal(monthShort('2026-09-01'), 'EYL');
    assert.equal(monthShort('2026-10-01'), 'EKİ', 'i → İ olmalı, I değil');
    assert.equal(monthShort('2026-08-30'), 'AĞU');
});

test('şeritte bugün ile seçili gün AYRI işaretler', () => {
    const strip = code(read('../mobile/src/components/StaffWeekStrip.tsx'));
    assert.ok(strip.includes('isToday ? c.or : c.tx3'), 'bugün etiketi turuncu olmalı');
    assert.ok(strip.includes('selected ? 38 : 34'), 'seçili gün rakamı çevrelemeli');
});

test('şeritteki gün BU EKRANDA açılır, Takvim sekmesine atlamaz', () => {
    // Önceki karar başka günü Takvim'e devrediyordu. Sahada personel şeride
    // "yarın kaç işim var" diye bakıyor ve sekme değiştirmek o soruyu üç
    // dokunuşa çıkarıyordu. Bölüşme duruyor ama gün seçiminde değil:
    // şeridin işi bu hafta, Takvim'in işi salonun tamamı ve ayın tamamı.
    assert.ok(!screen.includes("pathname: '/personel/calendar'"), 'şerit hâlâ sekme değiştiriyor');
    assert.ok(screen.includes('onSelect={setDateISO}'), 'gün seçimi yerinde açılmalı');
    // Bugün ile seçili gün AYRI: şeridin turuncu işareti seçime kaymaz.
    assert.ok(screen.includes('todayISO={today}') && screen.includes('selectedISO={dateISO}'));
});

test('şimdi çizgisi yalnız bugün çizilir', () => {
    // Başka günde "şimdi" diye bir yer yok; çizgi orada rastgele bir noktayı
    // işaretlerdi.
    assert.ok(screen.includes('isToday ? nowLineAfter(agenda, now) : -2'));
});

test('gün cümlesi güne göre değişir — "kaldı" bugünün ölçüsü', () => {
    // Geçmiş günde kalan iş yok, gelecek günde bitmiş iş yok.
    assert.ok(screen.includes('iş yapıldı'), 'geçmiş gün kendi cümlesini kurmalı');
    assert.ok(screen.includes('randevu yok'), 'boş gün kendi cümlesini kurmalı');
});

test('bilinmeyen gün ile boş gün aynı şey değil', () => {
    const strip = code(read('../mobile/src/components/StaffWeekStrip.tsx'));
    assert.ok(strip.includes('count !== undefined'), 'sıfır bir ölçüm, bilinmemek bir boşluk');
});

test('dönen halka yalnız koltuktaki işte, süs olduğu için bilgi taşımaz', () => {
    // Başta yalnız 'running' idi. Personel 03 tasarımı halkayı UZADI'ya da
    // taşıdı ve gerekçesi bu: iş sürüyor, sadece uzadı — "bu şu anda oluyor"
    // hâlâ doğru. UZADI'nın kendi nabzının olmamasının sebebi de bu.
    assert.ok(card.includes("RINGED = new Set(['running', 'over'])"));
    // Sağdaki 3pt hat glow'lu kartta da duruyor: halka kapandığında kart
    // hiçbir bilgi kaybetmemeli.
    assert.ok(card.includes('width: 3,'), 'durum hattı kaldırılmış');
});

test('halka RN Animated ile çiziliyor — kart reanimated\'e taşınmadı', () => {
    // 2026-09-05: `react-native-reanimated` kullanıcı kararıyla projeye
    // GİRDİ; gerekçesi kasaya gönderme anının hareket kısıtı dışına
    // çıkarılması (bkz. `docs/personel-11-kasaya-gonderme.md`).
    //
    // Paketin bulunması, yazılmış ekranların ona taşınacağı anlamına
    // GELMİYOR: çalışan bir animasyonu yeniden yazmanın kazancı yok, riski
    // var. Bu dosya kartın kendi çizimini koruyor.
    const raw = read('../mobile/src/components/AppointmentCard.tsx');
    assert.ok(!raw.includes('react-native-reanimated'));
    assert.ok(!raw.includes('react-native-gesture-handler'));
    // `gesture-handler` HÂLÂ kurulu değil: jest kütüphanesi ayrı bir karar.
    const pkg = JSON.parse(read('../mobile/package.json'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.ok(!deps['react-native-gesture-handler'], 'gesture-handler bağımlılığa girmiş');
});

test('dönen katman KARE ve köşegen kadar — yüzde ölçü kenarı açıkta bırakırdı', () => {
    assert.ok(card.includes('Math.hypot(box.width, box.height)'));
    assert.ok(!card.includes("width: '160%'"));
});

test('reduceMotion açıkken dönme durur, halka kalır', () => {
    assert.ok(card.includes('reduceMotion !== false'));
    // Sabit faz 0° değil 42°: sıfırda gradyanın başı ve sonu aynı köşede
    // birleşiyor ve halka tek renk bir kenar gibi okunuyor.
    assert.ok(card.includes('spin.setValue(42 / 360)'));
});

test('halkada mavi ve yeşil yok — "tamam" rengiyle çakışırdı', () => {
    const stops = /const GLOW = \{([\s\S]*?)\} as const;/.exec(card);
    assert.ok(stops, 'GLOW bulunamadı');
    for (const banned of ['#3b82f6', '#22c55e', '#5FBF64', '#2D8F32']) {
        assert.ok(!stops[1].includes(banned), `${banned} halkaya girmiş`);
    }
});

// ── Personel 03 · hâllerin karakteri ve hareketi ────────────────────────────

const { mixOklab, brighten, contrast } = await import('../mobile/src/lib/color.ts');

test('oklab karışımı uçlarda kimliği korur', () => {
    assert.equal(mixOklab('#5FBF64', '#241E16', 1), '#5FBF64');
    assert.equal(mixOklab('#5FBF64', '#241E16', 0), '#241E16');
});

test('sönükleşme merdiveni vurguyu KISIYOR ama okunur bırakıyor', () => {
    // Tasarımın iddiası: en sönük hâlde yeşil ≈3,2:1, kırmızı ≈4,0:1 —
    // 11,5 pt / 700 CAPS için 3:1 eşiğinin üstünde.
    const d2 = '#1E1911';
    const green = mixOklab('#5FBF64', d2, 0.58);
    const red = mixOklab('#E07272', d2, 0.80);
    assert.ok(contrast(green, d2) > 3, `sönük yeşil ${contrast(green, d2).toFixed(2)}:1`);
    assert.ok(contrast(red, d2) > 3, `sönük kırmızı ${contrast(red, d2).toFixed(2)}:1`);

    // Ve kusurun kendisi: sönük yeşil, kapıdaki tam güçlü amberden ZAYIF.
    const amber = mixOklab('#D9A43B', '#241E16', 1);
    assert.ok(
        contrast(amber, '#241E16') > contrast(green, d2),
        'tahsil edilmiş işin yeşili kapıdaki amberden güçlü kalmış',
    );
});

test('kırmızı 22 puan daha az kısılıyor — aynı sayı değil aynı okunurluk', () => {
    const card = code(read('../mobile/src/components/AppointmentCard.tsx'));
    assert.ok(card.includes('RED_BONUS = 0.22'));
    // Bonus olmasaydı kırmızı eşikten düşerdi.
    const bare = mixOklab('#E07272', '#1E1911', 0.58);
    const withBonus = mixOklab('#E07272', '#1E1911', 0.80);
    assert.ok(contrast(withBonus, '#1E1911') > contrast(bare, '#1E1911'));
});

test('nabız rengi parlatıyor, söndürmüyor', () => {
    const lit = brighten('#D9A43B', 1.55);
    assert.ok(contrast(lit, '#241E16') > contrast('#D9A43B', '#241E16'));
});

test('eşik nabzı 15 dakikada bir vuruyor, her dakika değil', () => {
    const base = {
        date: '2026-09-02', start_time: '12:00', end_time: '12:30',
        status: 'confirmed', arrived_at: null, service_ended_at: null,
        adisyon_items: null, is_paid: false,
    };
    const at = (min) => cardState(
        { ...base, customer_arrived_at: '2026-09-02T09:00:00Z' },
        Date.parse('2026-09-02T09:00:00Z') + min * 60_000,
    ).beatKey;
    assert.equal(at(0), 'w0');
    assert.equal(at(14), 'w0', '14. dakikada hâlâ vurmamalı');
    assert.equal(at(15), 'w1');
    assert.equal(at(29), 'w1');
    assert.equal(at(30), 'w2');
});

test('halkası olan hâllerde nabız YOK — bir kartta tek hareket', () => {
    const base = {
        date: '2026-09-02', start_time: '12:00', end_time: '12:30',
        status: 'confirmed', arrived_at: '2026-09-02T12:00:00Z',
        service_ended_at: null, adisyon_items: null, is_paid: false,
    };
    const running = cardState(base, Date.parse('2026-09-02T12:10:00Z'));
    const over = cardState(base, Date.parse('2026-09-02T13:00:00Z'));
    assert.equal(running.kind, 'running');
    assert.equal(over.kind, 'over');
    assert.equal(running.beatKey, null);
    assert.equal(over.beatKey, null, 'UZADI halkayı devralıyor, nabzı olamaz');
});

test('halka UZADI hâlinde de dönüyor — tasarımın gerekçesi bu', () => {
    const card = code(read('../mobile/src/components/AppointmentCard.tsx'));
    assert.ok(card.includes("RINGED = new Set(['running', 'over'])"));
});

test('halka fazı açılışta sıfırlanmıyor', () => {
    const card = code(read('../mobile/src/components/AppointmentCard.tsx'));
    assert.ok(card.includes('Date.now() % MS.turn'), 'faz sürekliliği yok');
});

test('hareketsiz hâlde halka çizilir ama dönmez, nabız hiç yok', () => {
    const card = code(read('../mobile/src/components/AppointmentCard.tsx'));
    assert.ok(card.includes('spin.setValue(42 / 360)'), 'sabit faz yok');
    assert.ok(/if \(key == null \|\| previous == null \|\| key === previous \|\| still\) return;/.test(card));
});

test('süre jetonları tasarımdan — uydurulmuş süre yok', () => {
    const card = code(read('../mobile/src/components/AppointmentCard.tsx'));
    for (const [name, value] of [
        ['out', 140], ['in', 180], ['move', 240], ['dim', 260],
        ['ring', 400], ['beat', 520], ['turn', 5000], ['minute', 90],
    ]) {
        assert.ok(
            new RegExp(`${name}: ${value},`).test(card),
            `${name} süresi ${value} değil`,
        );
    }
});

test('şimdi çizgisi yuvadan yuvaya taşınıyor — geçilen kart tepkisiz', () => {
    assert.ok(screen.includes('<NowLineSlot'), 'yuva kullanılmıyor');
    assert.ok(!screen.includes('<NowLine time'), 'çizgi hâlâ koşullu çiziliyor');
});

test('açılışta ve gün değişiminde hiçbir kart "yeni" sayılmaz', () => {
    // Gün değişince liste baştan aşağı değişiyor ama bu "randevu düştü"
    // demek değil, "başka güne baktın" demek. Bütün kartların yuva açarak
    // belirmesi yalan bir olay anlatırdı.
    assert.ok(screen.includes('before.day !== dateISO'), 'gün değişimi tazelik saymamalı');
    assert.ok(screen.includes('before == null'), 'ilk çizimde de canlanmamalı');
});

test('gece yarısını aşan randevu "0 dk" demez', () => {
    // 23:58 → 00:28 otuz dakikadır. Negatif farkı sıfıra kırpmak, kartın
    // ölçtüğü bir sıfır varmış gibi göstermekti.
    const s = cardState({
        date: '2026-09-02', start_time: '23:58', end_time: '00:28',
        status: 'confirmed', arrived_at: null, service_ended_at: null,
        adisyon_items: null, is_paid: false,
        customer_arrived_at: '2026-09-02T23:59:00Z',
    }, Date.parse('2026-09-03T00:13:00Z'));
    assert.equal(s.duration, '30 dk');
});

// ── Personel takvimi: salonun günü, salt okunur ─────────────────────────────

test('personel takvimi müdürün ızgarasını SALT OKUNUR kullanıyor', () => {
    const cal = code(read('../mobile/app/personel/calendar.tsx'));
    assert.ok(cal.includes('<ColumnCalendar'), 'gövde müdürünkiyle aynı bileşen');
    assert.ok(cal.includes('readOnly'), 'sürükleme ve boş saat kapalı');
    assert.ok(!cal.includes('onMove='), 'taşıma geri çağrısı bağlanmamalı');
    assert.ok(!cal.includes('onSlot='), 'boş saatten randevu açılmamalı');
});

test('kendi randevusu kumandayı açar, meslektaşınınki açmaz', () => {
    // Aynı işi iki yerden başlatabilen personel, iki kez başlatır.
    const cal = code(read('../mobile/app/personel/calendar.tsx'));
    // Karar SUNUCUDAN geliyor. Ekranda sabit bir `ME = 'merve'` duruyordu:
    // canlıda herkesin takvimi ya "hepsi benim" ya "hiçbiri benim değil"
    // diye okunurdu ve kendi randevusuna dokunmak kumandayı açmazdı.
    assert.ok(cal.includes('mine.has(appointment.id)'));
    assert.ok(!cal.includes("=== ME"), 'sabit kimlik kalmamalı');
    assert.ok(cal.includes("pathname: '/(staff-flow)/kumanda'"));
    assert.ok(cal.includes('setPeek(appointment)'), 'başkasının randevusu okunur bir kart açmalı');
});

test('ızgara salt okunurken blok KALKMIYOR', () => {
    // Ölü jest: blok kalkar, sürüklenir, bırakılır ve hiçbir şey olmaz.
    const grid = code(read('../mobile/src/components/ColumnCalendar.tsx'));
    assert.ok(grid.includes('onLift={readOnly ? undefined : beginLift}'));
    assert.ok(grid.includes('disabled={readOnly || Boolean(lifted)}'));
});

test('okunur kart sekme çubuğunun altında kalmıyor', () => {
    // iOS 26'nın yüzen sekme çubuğu içeriğin ÜSTÜNDE duruyor; güvenli alan
    // onu kapsamıyor. "Kapat" satırı çubuğun altında kalıyordu.
    const cal = code(read('../mobile/app/personel/calendar.tsx'));
    // Ölçü SABİT: `NativeTabs` gerçek yüksekliği bir bağlama yazmıyor ve SDK
    // 57 ile `@react-navigation/bottom-tabs` expo-router'ın içine gömüldü.
    // Yanlış bir yerden okumaktansa tek yerde tutuluyor.
    assert.ok(cal.includes('const TAB_BAR = 64;'));
    assert.ok(cal.includes('paddingBottom: insets.bottom + TAB_BAR + 16'));
});

test('personel takviminde çevrimdışı bandı ve yenileme var', () => {
    // Bu ekran bodrum katta, kötü sinyalde açılıyor: sessizce eski veri
    // göstermek, personelin yanlış saate güvenmesi demek.
    const cal = code(read('../mobile/app/personel/calendar.tsx'));
    assert.ok(cal.includes('<OfflineBar'), 'bant çizilmeli');
    assert.ok(cal.includes('animateOfflineBar(barProgress'), 'bant sözleşmedeki süreyle inmeli');
    assert.ok(cal.includes('<RefreshControl'), 'aşağı çekip yenileme');
    // Kaydırıcı ızgaranın İÇİNDE; dışarıdan bir ScrollView sarmak ikisini
    // birbiriyle yarıştırırdı.
    assert.ok(cal.includes('refreshControl={('));
    const grid = code(read('../mobile/src/components/ColumnCalendar.tsx'));
    assert.ok(grid.includes('refreshControl={lifted ? undefined : refreshControl}'),
        'blok havadayken yenileme olmamalı');
});

test('yenileme başarısızsa ekrandaki gün SİLİNMİYOR', () => {
    // Kural aynı, yeri değişti: okuma ekrandan `salonDay.ts`'e indi.
    const src = code(read('../mobile/src/lib/salonDay.ts'));
    const fail = src.slice(src.indexOf('.catch(() => {'), src.indexOf('}, [dateISO]);'));
    assert.ok(!fail.includes('setDay('), 'hata eldeki günü yazmamalı');
    // Sayılar BİRİKİYOR: tek günlük haritayı ezmek, az önce okunan günü
    // şeritte "bilinmiyor"a düşürürdü.
    assert.ok(src.includes('counts: { ...current.counts, ...next.counts }'));
});

test('okunur kart takvimin ÜSTÜNDE duruyor', () => {
    // İçerik katmanı zIndex:1 taşıyor; kart sıfırda kalınca takvim onun
    // üstüne çiziliyordu — perde kararmıyor, saatler yazının içinden geçiyordu.
    const cal = code(read('../mobile/app/personel/calendar.tsx'));
    assert.ok(cal.includes("position: 'absolute', zIndex: 60"), 'kart bandın da üstünde olmalı');
});

test('personel sekmesi DÖRT: Kazanç kalktı', () => {
    const layout = code(read('../mobile/app/personel/_layout.tsx'));
    const names = [...layout.matchAll(/NativeTabs\.Trigger name="([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(names, ['index', 'calendar', 'customers', 'profile']);
    // Sekme `staff_can_see_revenue` ile koşulluydu ve varsayılan KAPALI:
    // çoğu salonda dört, ayarı açanda beş sekme oluyordu. Sekme çubuğu
    // değişken olamaz.
    assert.ok(!layout.includes('Kazanç'), 'Kazanç sekmesi geri gelmiş');
    // Ekran silinmedi, sekme çubuğunun dışına alındı.
    assert.ok(read('../mobile/app/(staff-flow)/kazanc.tsx').length > 0);
});


// ── Sahiplik görsel dili ────────────────────────────────────────────────────

test('blok İKİ şeyi AYRI kanaldan söylüyor: kimin ve hangi hâlde', () => {
    // Eskiden şerit de kenarlık da yalnız `live` demekti; sahiplik hiçbir
    // kanalda yoktu. Turuncu bu üründe EYLEM demek ve meslektaşın süren
    // işlemi turuncu bir şerit çiziyordu — dokunulduğunda hiçbir şey
    // başlamayan bir eylem işareti.
    const grid = code(read('../mobile/src/components/ColumnCalendar.tsx'));
    // ŞERİT = senin.
    assert.ok(grid.includes('const bar = ownership ? owned : live;'));
    // Rengi HÂLİ söylüyor.
    assert.ok(grid.includes('const barColor = live ? c.or : c.tx3;'));
    assert.ok(grid.includes('backgroundColor: barColor,'));
    // KENARLIK = işlem sürüyor; sahiplikten bağımsız, HERKESTE.
    assert.ok(grid.includes('borderColor: lifted ? c.or : live ? `${c.or}70` : c.bd2'));
});

test('müdür görünümünde sahiplik diye bir soru YOK', () => {
    // Aynı bileşen iki ekranda. Müdürde "kimin randevusu" sorusu anlamsız ve
    // oradaki davranış hiç değişmemeli: şerit yalnız `live`de çizilir.
    const grid = code(read('../mobile/src/components/ColumnCalendar.tsx'));
    assert.ok(grid.includes('owned={mine ? mine.has(appointment.id) : null}'));
    assert.ok(grid.includes('const ownership = owned !== null;'));
    // `undefined` (soru yok) ile boş küme (hiçbiri senin değil) AYRI cevaplar.
    assert.ok(grid.includes('mine?: ReadonlySet<string>;'));
    const mgr = code(read('../mobile/app/mudur/calendar.tsx'));
    assert.ok(!mgr.includes('mine='), 'müdür ekranı sahiplik geçmemeli');
});

test('meslektaşın randevusu okunur kalıyor — yalnız ağırlığını bırakıyor', () => {
    // Salonun şeffaflığı işletmenin kararı: personel herkesin gününü GÖRÜR.
    // Geri çekilme boyuttan değil ağırlık ve renkten geliyor.
    const grid = code(read('../mobile/src/components/ColumnCalendar.tsx'));
    assert.ok(grid.includes('const faded = ownership && !owned;'));
    assert.ok(grid.includes('color: faded ? c.tx2 : c.tx,'));
    assert.ok(grid.includes('fontFamily: faded ? font.bold : font.extraBold,'));
    // Boyut KOŞULSUZ: küçültmek okunurluğu bozardı.
    assert.ok(grid.includes('fontSize: columnMetrics.blockName,'));
});

test('aynı bilgi ekran okuyucuya da gidiyor', () => {
    // Görsel bir ayrım, yalnız görenlere verilen bir ayrım değildir.
    const grid = code(read('../mobile/src/components/ColumnCalendar.tsx'));
    assert.ok(grid.includes("faded ? ' · meslektaşınızın randevusu' : ''"));
});

test('şeridin açtığı iç boşluk ŞERİDE bağlı, `live`e değil', () => {
    // Şerit artık `live` olmadan da çizilebiliyor; boşluk eski koşulda
    // kalsaydı metin şeridin altına girerdi.
    const grid = code(read('../mobile/src/components/ColumnCalendar.tsx'));
    assert.ok(grid.includes('paddingLeft: bar ? columnMetrics.blockLiveX : columnMetrics.blockX,'));
});

test('personel takvimi sahipliği ızgaraya GEÇİRİYOR', () => {
    const cal = code(read('../mobile/app/personel/calendar.tsx'));
    assert.ok(cal.includes('mine={mine}'));
});
