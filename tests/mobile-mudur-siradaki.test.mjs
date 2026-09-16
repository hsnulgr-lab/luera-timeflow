import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    applyFlowAction, atClock, autoCancelled, minuteLabel, contextRows, etaColumn, etaPanel, graceLeft,
    hasContext, initialsOf, isLate, LATE_LIMIT_MINUTES, lateMinutes, mockDay,
    nextCardKind, nextInLineId, nextRowLabel, nowLineIndex, sortFlow, staffConflict,
    toleranceLabel,
} from '../mobile/src/lib/managerFlow.ts';
import { durationBadge } from '../mobile/src/lib/managerFlow.ts';
import { upperTR } from '../mobile/src/lib/text.ts';
import { cardSkin, nextCardMetrics, panelInk } from '../mobile/src/theme/tokens.ts';

// Müdür 17 — sıradaki randevu kartı.
//
// İki kart, iki hâl, tek karar ağacı. Bu dosyanın koruduğu şey kararın
// VERİDEN gelmesi: hiçbir çağıran "bana A2 çiz" diyemez, not girildiği an
// A1 kendiliğinden A2'ye döner.

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');

const parts = read('src/components/FlowParts.tsx');

// ── Kart seçimi ─────────────────────────────────────────────────────────────

test('bağlam yoksa A1 çizilir', () => {
    assert.equal(nextCardKind({}), 'a1');
    assert.equal(nextCardKind({ context: {} }), 'a1');
});

test('boş dize bağlam sayılmaz — boş kutu çizdirmez', () => {
    assert.equal(hasContext({ note: '   ' }), false);
    assert.equal(nextCardKind({ context: { note: '  ' } }), 'a1');
});

test('bağlamdan biri doluysa A2 çizilir', () => {
    assert.equal(nextCardKind({ context: { note: 'Hep geç kalır' } }), 'a2');
    assert.equal(nextCardKind({ context: { balance: '₺450 borç var' } }), 'a2');
    assert.equal(nextCardKind({ context: { package: '10 seanslık · 4/10' } }), 'a2');
});

test('"bağlamı ağır" ayrı bir kart değil — üçü dolu A2', () => {
    const heavy = { context: { balance: '₺450 borç var', note: 'Alerjisi var', package: '4/10' } };
    assert.equal(nextCardKind(heavy), 'a2');
    assert.equal(contextRows(heavy.context).length, 3);
});

// ── Gecikme ─────────────────────────────────────────────────────────────────

test('artı eta gecikme değil', () => {
    assert.equal(lateMinutes(6), 0);
    assert.equal(isLate(6), false);
});

test('eksi eta gecikme dakikasıdır', () => {
    assert.equal(lateMinutes(-8), 8);
    assert.equal(isLate(-8), true);
});

test('eta yoksa gecikme yok — veri gelmemişse kart suçlamaz', () => {
    assert.equal(lateMinutes(undefined), 0);
    assert.equal(isLate(undefined), false);
});

// ── "OTOMATİK DÜŞER" KALKTI (2026-09-15, kullanıcı onayıyla) ─────────────────
// Kartlar "22 dk sonra düşer", "randevu düştü · kayıt müşteri dosyasına
// yazıldı" diyordu; randevuyu düşüren bir iş ne sunucuda ne masaüstünde var.
// Masaüstünün mantığı: randevu saati + salonun toleransı (vars. 120) geçti ve
// müşteri gelmediyse "Gelmedi"; randevu açık kalır. Eşik de masaüstüyle aynı.
test('tolerans MASAÜSTÜNÜN varsayılanı — salonun ayarı verilirse o', () => {
    assert.equal(LATE_LIMIT_MINUTES, 120);
    assert.equal(graceLeft(-8), 112);
    assert.equal(graceLeft(-8, 30), 22, 'salon 30 dk seçtiyse o geçerli');
});

test('tolerans dolunca "gelmedi" sayılır, altında sayılmaz', () => {
    assert.equal(autoCancelled(-119), false);
    assert.equal(autoCancelled(-120), true);
    assert.equal(autoCancelled(-29, 30), false);
    assert.equal(autoCancelled(-30, 30), true);
    assert.equal(graceLeft(-45, 30), 0);
});

test('gecikme yokken tolerans rozeti hiç çizilmez', () => {
    assert.equal(toleranceLabel(6), null);
    assert.equal(toleranceLabel(undefined), null);
});

test('tolerans rozeti kalan dakikayı söyler', () => {
    assert.equal(toleranceLabel(-8, 30), '22 dk sonra gelmedi sayılır');
    assert.equal(toleranceLabel(-30, 30), 'gelmedi sayıldı');
    // "düşer" / "düştü" hiçbir hâlde yok: düşüren bir iş yok.
    assert.doesNotMatch(String(toleranceLabel(-8)), /düş/);
});

// ── A1 paneli ───────────────────────────────────────────────────────────────

test('A1 zamanında: girmesine + saat · süre', () => {
    const panel = etaPanel({ time: '11:30', etaMinutes: 6, durationMinutes: 45 });
    assert.deepEqual(panel, { label: 'girmesine', value: '6 dk', sub: '11:30 · 45 dk', late: false });
});

// Müdür 33 · alt satır DEĞİŞTİ. Eskiden "11:30’da bekleniyordu" yazıyordu; ama
// saat satırın sol sütununda zaten var, cümle onu ikinci kez söylüyordu. O yer
// toleransın geri sayımına açıldı ve kartın ALTINDAKİ tolerans rozeti böylece
// tamamen kalktı — kart bitip altında ayrı bir şerit başlaması reddedilmişti.
test('A1 gecikmiş: gecikti + toleransın geri sayımı', () => {
    const panel = etaPanel({ time: '11:30', etaMinutes: -8, durationMinutes: 45, toleranceMinutes: 30 });
    assert.equal(panel.label, 'gecikti');
    assert.equal(panel.value, '8 dk');
    assert.equal(panel.sub, '22 dk sonra gelmedi sayılır');
    // Tolerans verilmezse masaüstünün varsayılanı.
    assert.equal(etaPanel({ time: '11:30', etaMinutes: -8 }).sub, '112 dk sonra gelmedi sayılır');
    assert.equal(panel.sub.includes('11:30'), false, 'saat ikinci kez yazılmaz');
    assert.equal(panel.late, true);
});

test('süre bilinmiyorsa alt satır uydurmaz', () => {
    assert.equal(etaPanel({ time: '12:15', etaMinutes: 51 }).sub, '12:15');
});

test('saat çekimi okunuşa göre — rakama göre değil', () => {
    assert.equal(atClock('11:30'), '11:30’da');
    assert.equal(atClock('12:15'), '12:15’te');
    assert.equal(atClock('11:40'), '11:40’ta');
    assert.equal(atClock('09:20'), '09:20’de');
    // Dakika 00 ise ek SAATİN okunuşundan gelir: "on birde".
    assert.equal(atClock('11:00'), '11:00’de');
    assert.equal(atClock('09:00'), '09:00’da');
});

// ── A2 sağ sütunu ───────────────────────────────────────────────────────────

test('A2 zamanında: rakam turuncu, altında randevu saati', () => {
    assert.deepEqual(etaColumn({ time: '11:30', etaMinutes: 6 }), {
        value: '6 dk', sub: '11:30', late: false,
    });
});

test('A2 gecikmiş: rakam kırmızı, altında "gecikti"', () => {
    assert.deepEqual(etaColumn({ time: '11:30', etaMinutes: -8 }), {
        value: '8 dk', sub: 'gecikti', late: true,
    });
});

// ── Bağlam satırları ────────────────────────────────────────────────────────

test('satır sırası sabit: bakiye → not → paket', () => {
    const rows = contextRows({ package: '4/10', note: 'Alerjisi var', balance: '₺450 borç var' });
    assert.deepEqual(rows.map((r) => r.label), ['bakiye', 'not', 'paket']);
});

test('boş alan satır üretmez — kart bağlam kadar uzar', () => {
    assert.equal(contextRows({ note: 'Hep geç kalır' }).length, 1);
    assert.equal(contextRows(undefined).length, 0);
    assert.equal(contextRows({}).length, 0);
});

// ── Personel çakışması ──────────────────────────────────────────────────────

test('personel işlemdeyse satır türetilir, sabit metin değil', () => {
    const hit = staffConflict({ staffId: 'selin' }, mockDay.presence);
    assert.deepEqual(hit, { name: 'Selin', badge: '08 dk' });
});

test('personel müsaitse satır hiç çizilmez', () => {
    assert.equal(staffConflict({ staffId: 'ece' }, mockDay.presence), null);
    assert.equal(staffConflict({}, mockDay.presence), null);
});

// ── Baş harfler ─────────────────────────────────────────────────────────────

test('baş harf verilmemişse addan türer, Türkçe büyütmeyle', () => {
    assert.equal(initialsOf({ firstName: 'Elif', lastName: 'Demir' }), 'ED');
    assert.equal(initialsOf({ firstName: 'ilker', lastName: 'şen' }), 'İŞ');
});

// ── Ölçü sözleşmesi ─────────────────────────────────────────────────────────

test('A1 paneli CSS ölçülerini taşır', () => {
    assert.equal(nextCardMetrics.panelPad, 14);
    assert.equal(nextCardMetrics.panelRadius, 18);
    assert.equal(nextCardMetrics.eta, 40);
    assert.equal(nextCardMetrics.label, 11.5);
});

test('gecikme çizgisi + dolgu toplamı sabit 14 — metin kaymaz', () => {
    assert.equal(nextCardMetrics.lateBar + nextCardMetrics.panelPadLate, nextCardMetrics.panelPad);
});

test('A2 yarıçapı eşmerkezli: 22 − 12 = 10', () => {
    assert.equal(nextCardMetrics.cardRadius - nextCardMetrics.cardPad, nextCardMetrics.noteRadius);
});

test('hiçbir dokunma hedefi 44’ün altına inmez', () => {
    assert.ok(nextCardMetrics.goHeight >= 44);
    assert.ok(nextCardMetrics.noHeight >= 44);
    assert.ok(nextCardMetrics.ghostHeight >= 44);
    assert.ok(nextCardMetrics.avatar >= 44);
});

test('ters panel: koyu temada krem, aydınlık temada koyu', () => {
    assert.equal(panelInk.dark.panel, '#FAF3E9');
    assert.equal(panelInk.light.panel, '#1C1710');
    assert.notEqual(panelInk.dark.panel, panelInk.light.panel);
});

// ── Malzeme ve envanter ─────────────────────────────────────────────────────

test('kart CAM DEĞİL — cam yalnız yüzen kabukta', () => {
    const card = parts.slice(parts.indexOf('function EtaPanel'), parts.indexOf('export function FlowRow'));
    assert.ok(!/GlassView|glassEffectStyle/.test(card));
});

test('gecikme çizgisi ayrı katmanda — borderLeftWidth iOS köşesini bozar', () => {
    assert.ok(!/borderLeftWidth\s*:/.test(parts));
    assert.ok(parts.includes('width: nextCardMetrics.lateBar'));
});

test('sıradaki randevu genel eylem satırını çizmez — kart kendi eylemini taşır', () => {
    // Kendi kartını taşıyan her tür genel eylem satırından muaf: sıradaki
    // randevu, tahsilat, alınmış tahsilat ve gelmedi.
    assert.ok(parts.includes("{!isNext && slot !== 'due' && slot !== 'paid' && slot !== 'settled' && slot !== 'gone'"));
    assert.ok(parts.includes('&& (actions.length > 0 || event.amount) ? ('));
});

// ── Mock veri ───────────────────────────────────────────────────────────────

test('mock gün her iki kartı da gösterir', () => {
    const next = mockDay.events.filter((e) => e.kind === 'next');
    assert.deepEqual(next.map(nextCardKind).sort(), ['a1', 'a2']);
});

test('eta istemcide sayaçla üretilmez — veriden gelir', () => {
    const elif = mockDay.events.find((e) => e.id === 'e1');
    // Müdür 33: bu satır artık GECİKMİŞ (eksi eta). Eylem hapının asıl
    // sahnesi burası — ikinci yuva `Gelmedi`den `Yönet`e takas oluyor.
    assert.equal(elif.etaMinutes, -8);
    assert.equal(elif.durationMinutes, 45);
});

// ── Rakam biçimi ────────────────────────────────────────────────────────────

test('kahraman rakam sıfırla doldurulmaz — "6 dk", "06 dk" değil', () => {
    assert.equal(minuteLabel(6), '6 dk');
    assert.equal(minuteLabel(51), '51 dk');
});

test('rozet rakamı SIFIRLA doldurulur — dar kutuda zıplamasın', () => {
    assert.equal(durationBadge(8), '08 dk');
});

test('uzun bekleme saate döner, üç haneli dakika okunmaz', () => {
    assert.equal(minuteLabel(90), '1 sa 30 dk');
    assert.equal(minuteLabel(120), '2 sa');
});

// ── Türkçe büyütme ──────────────────────────────────────────────────────────

test('büyütme yerelden geçer: "i" harfi "İ" olur, "I" değil', () => {
    assert.equal(upperTR('girmesine'), 'GİRMESİNE');
    assert.equal(upperTR('bakiye'), 'BAKİYE');
    assert.equal(upperTR('sıradaki randevu'), 'SIRADAKİ RANDEVU');
    assert.equal(upperTR('işlem başladı'), 'İŞLEM BAŞLADI');
});

test('ekranda textTransform kalmadı — RN Türkçe bilmiyor', () => {
    assert.ok(!/textTransform/.test(parts));
});

// ── Derinlik ────────────────────────────────────────────────────────────────

const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
};

test('A2 kartı İKİ TEMADA DA koyu — krem sayfada beyaz kart yıkanıyordu', () => {
    // Tek nesne: temaya göre dallanma yok, dolayısıyla aydınlıkta koyu zeminde
    // koyu yazı çıkma ihtimali de yok.
    assert.equal(typeof cardSkin.bg, 'string');
    assert.ok(lum(cardSkin.bg) < 60);
    assert.ok(lum(cardSkin.tx) > 200);
});

test('not kutusu kartın içine ÇÖKER — kartından daha koyu', () => {
    assert.ok(lum(cardSkin.note) < lum(cardSkin.bg));
});

test('kart mürekkebi temaya bakan jeton kullanmaz', () => {
    // Sınır `ToleranceChip`ti; o rozet Müdür 33'te kaldırıldı (geri sayım
    // artık kartın kendi alt satırında). Dilim bir sonraki tanıma kadar.
    const start = parts.indexOf('function CustomerCard');
    const end = parts.indexOf('function useWaitPulse');
    assert.ok(start > 0 && end > start, 'dilimin iki ucu da bulunmalı');
    const card = parts.slice(start, end);
    assert.ok(!/\bc\.(tx|tx2|bd|bd2|surf|or|rd|am)\b/.test(card));
});

test('gömülü kahraman panellerin hepsi temanın tersi', () => {
    // A1 paneli ve canlı işlem şeridi aynı `panelInk`ten besleniyor: aydınlık
    // temada ikisi de koyu, koyu temada ikisi de krem.
    assert.equal(panelInk.dark.panel, '#FAF3E9');
    assert.equal(panelInk.light.panel, '#1C1710');
    assert.ok(!/(backgroundColor|color): flowMetrics\.live(Bg|Tx)/.test(parts));
});

test('panelin içindeki hap panelin tersi — krem panelde koyu, koyu panelde krem', () => {
    assert.ok(lum(panelInk.dark.pill) < lum(panelInk.dark.panel));
    assert.ok(lum(panelInk.light.pill) > lum(panelInk.light.panel));
});

// ── Eylemler ────────────────────────────────────────────────────────────────
// Sunucuda müdür ucu yok; eylemler YEREL. Ama ölü de değil: dokununca olayın
// türü gerçekten değişiyor. Sahte "kaydedildi" mesajı yok.

test('"Geldi" olayı sıradaki randevudan müşteri geldiye çevirir', () => {
    const next = applyFlowAction({ id: 'x', time: '11:30', kind: 'next', firstName: 'E', lastName: 'D', detail: '', etaMinutes: 6 }, 'Geldi');
    assert.equal(next.kind, 'arrived');
    // Bekleme sayacı sıfırdan başlar.
    assert.equal(next.waitMinutes, 0);
    // `etaMinutes` KORUNUR. Önceden siliniyordu; Müdür 20 ile bu adımın 5
    // saniyelik geri alması olduğu için silmek geri sayımı kaybettirirdi.
    // Kind değiştiği için hiçbir yerde çizilmiyor.
    assert.equal(next.etaMinutes, 6);
});

test('"Gelmedi" müşteri gelmediye çevirir', () => {
    const next = applyFlowAction({ id: 'x', time: '11:30', kind: 'next', firstName: 'E', lastName: 'D', detail: '', etaMinutes: -8 }, 'Gelmedi');
    assert.equal(next.kind, 'noshow');
});

test('"Tahsil et" artık bir geçiş DEĞİL — adisyon telefondan tahsil edilmiyor', () => {
    const due = { id: 'x', time: '11:18', kind: 'due', firstName: 'M', lastName: 'A', detail: '' };
    assert.equal(applyFlowAction(due, 'Tahsil et'), null);
});

test('yanlış eylem yanlış türe uygulanmaz', () => {
    assert.equal(applyFlowAction({ id: 'x', time: '1', kind: 'due', firstName: 'a', lastName: 'b', detail: '' }, 'Geldi'), null);
    assert.equal(applyFlowAction({ id: 'x', time: '1', kind: 'next', firstName: 'a', lastName: 'b', detail: '' }, 'Tahsil et'), null);
    assert.equal(applyFlowAction({ id: 'x', time: '1', kind: 'paid', firstName: 'a', lastName: 'b', detail: '' }, 'Geldi'), null);
});

test('saat uydurulmaz — olayın anı sunucudan gelecek', () => {
    const next = applyFlowAction({ id: 'x', time: '11:30', kind: 'next', firstName: 'E', lastName: 'D', detail: '' }, 'Geldi');
    assert.equal(next.time, '11:30');
});

test('kart butonları ÖLÜ DEĞİL — dördü de eylem taşıyor', () => {
    // Titreşim tek başına geri bildirim değildir; proje kuralı "ölü buton yok".
    assert.equal((parts.match(/onAction\?\.\('Geldi'\)/g) ?? []).length, 2);
    // v2: "Gelmedi" artık düz buton değil, hapın içinde (gecikince).
    assert.equal((parts.match(/onAction\?\.\('Gelmedi'\)/g) ?? []).length, 0);
    assert.equal((parts.match(/<ActionPill/g) ?? []).length >= 2, true);
    assert.ok(!/onPress=\{\(\) => \{ feedback\.medium\(\); \}\}/.test(parts));
});

test('⋮ randevusu olmayan olayda çizilmez', () => {
    const screen = readFileSync(new URL('../mobile/app/mudur/index.tsx', import.meta.url), 'utf8');
    assert.match(screen, /onMore=\{event\.appointmentId \? openAppointment : undefined\}/);
    // Gülşah uydurma bir olay; gerçek bir randevusu yok, ⋮'sı da olmamalı.
    const e0 = mockDay.events.find((e) => e.id === 'e0');
    assert.equal(e0.appointmentId, undefined);
});

test('akış olayları gerçek randevulara bağlı', () => {
    const linked = mockDay.events.filter((e) => e.appointmentId);
    assert.equal(linked.length, 5);
    assert.ok(linked.every((e) => e.appointmentId.startsWith('mgr-')));
});

// ── Akışın sırası · 2026-08-30 ──────────────────────────────────────────────
//
// Karşılaştırıcı yazılmıştı ama listeye HİÇ UYGULANMIYORDU: yalnız yeni olay
// eklenirken çalışıyor, ilk yükleme ve yenileme ham sırayı alıyordu. Solda
// saat yazılı bir ray vardı ve sıra saate uymuyordu.

test('akış kronolojik ARTAN sıralanır — zaman aşağı akar', () => {
    // Yön kararı: bu ekran bir haber akışı değil, GÜNÜN KENDİSİ. Azalan
    // sırada tepede 13:00'teki bir iptal duruyordu; müdür telefonu açınca
    // günün en uzak ucunu değil şu anı görmeli.
    const times = sortFlow(mockDay.events).map((e) => e.time);
    const clock = times.filter((t) => /^\d{2}:\d{2}$/.test(t));
    const sorted = [...clock].sort((a, b) => a.localeCompare(b, 'tr-TR'));
    assert.deepEqual(clock, sorted, 'saatler artan değil');
});

test('"Dün 19:40" akışın BAŞINA düşer — en eski olan o', () => {
    const times = sortFlow(mockDay.events).map((e) => e.time);
    const dayPrefixed = times.filter((t) => !/^\d{2}:\d{2}$/.test(t));
    assert.ok(dayPrefixed.length > 0, 'sınanacak gün önekli satır yok');
    // Ayrım BİÇİMDEN geliyor, ayrı bir bayraktan değil: veri zaten söylüyor.
    assert.deepEqual(times.slice(0, dayPrefixed.length), dayPrefixed);
});

test('şimdi-çizgisi gün önekli satırı GEÇMİŞ sayar', () => {
    // Dün 19:40'ta kapanmamış bir adisyon, bugün 19:40'ta olacakmış gibi
    // çizginin altına düşemez.
    const list = sortFlow(mockDay.events);
    assert.equal(nowLineIndex(list, 0), 1, 'gün önekli satır geleceğe düşmüş');
    // Akşam: gelecek satır kalmaz ve bu bir hata değil.
    assert.equal(nowLineIndex(list, 23 * 60), list.length);
});

test('akış şimdi-çizgisine kaydırılmış açılır', () => {
    const src = readFileSync(new URL('../mobile/app/mudur/index.tsx', import.meta.url), 'utf8');
    assert.match(src, /nowLineIndex\(dayEvents, nowMinutes\)/);
    // Sıçrama BİR KEZ ve yalnız bugünde: başka güne bakarken "şimdi" yok.
    assert.match(src, /if \(jumped\.current \|\| !isToday/);
    // Gün değişince hak yenilenir; bugüne dönünce yine şimdiye gider.
    assert.match(src, /jumped\.current = false; \}, \[selectedISO\]/);
});

test('sıra TEK YERDEN gelir — üç okuma da aynı kuralı kullanır', () => {
    const src = readFileSync(new URL('../mobile/src/state/managerDay.tsx', import.meta.url), 'utf8');
    // İlk yükleme, yenileme ve ekleme: üçü de AYNI türetmeden geçiyor ve o
    // türetme tek bir sortFlow çağrısında bitiyor. Sayı 3'ten 1'e indi çünkü
    // artık üç ayrı liste yok — kural hâlâ tek.
    assert.equal((src.match(/sortFlow\(/g) ?? []).length, 1);
    assert.equal(/\.sort\(\(a, b\)/.test(src), false, 'sıralama yine yerelde kopyalanmış');
});

test('sıralama kararlı — aynı liste iki kez sıralanınca değişmez', () => {
    const once = sortFlow(mockDay.events);
    const twice = sortFlow(once);
    assert.deepEqual(twice.map((e) => e.id), once.map((e) => e.id));
});

// ── "Sıradaki" tekildir · 2026-08-30 ────────────────────────────────────────
//
// Dokuz etiketten sekizi bir DURUM anlatıyor; yalnız `next` bir SIRA İDDİASI
// taşıyordu. İki randevu aynı anda "sıradaki" olamaz ama ekranda ikisi de
// öyle diyordu. Kusur veri kopyasından değil, kelimenin kendisinden doğdu.

test('akışta yalnız BİR satır "sıradaki randevu" der', () => {
    const list = sortFlow(mockDay.events);
    const id = nextInLineId(list);
    const said = list.filter((e) => (
        e.kind === 'next' && nextRowLabel(e, e.id === id) === 'sıradaki randevu'
    ));
    assert.equal(said.length, 1);
});

test('geciken randevu KARTLA aynı kelimeyi söyler', () => {
    // Kartın paneli "gecikti" diyor; satır "sıradaki randevu" diyordu.
    const late = { etaMinutes: -8 };
    assert.equal(nextRowLabel(late, true), 'gecikti');
    assert.equal(nextRowLabel(late, false), 'gecikti');
    assert.equal(etaPanel({ time: '11:30', etaMinutes: -8 }).label, 'gecikti');
});

test('sırada olan, zamanında gidenlerin EN ERKENİ', () => {
    const events = [
        { id: 'a', kind: 'next', time: '14:00', etaMinutes: 90 },
        { id: 'b', kind: 'next', time: '12:15', etaMinutes: 41 },
        // Geciken sayılmaz: onun satırı zaten "gecikti" diyor.
        { id: 'c', kind: 'next', time: '11:30', etaMinutes: -8 },
    ];
    assert.equal(nextInLineId(events), 'b');
    assert.equal(nextRowLabel(events[0], false), 'yaklaşan randevu');
});

test('zamanında randevu yoksa hiçbir satır "sıradaki" demez', () => {
    // Sıfır bir ölçümdür: uydurma bir "sıradaki" seçilmez.
    assert.equal(nextInLineId([{ id: 'c', kind: 'next', time: '11:30', etaMinutes: -8 }]), null);
    assert.equal(nextInLineId([]), null);
});

test('sıra kararını EKRAN verir, satır değil', () => {
    const src = readFileSync(new URL('../mobile/app/mudur/index.tsx', import.meta.url), 'utf8');
    assert.match(src, /nextInLineId\(dayEvents\)/);
    assert.match(src, /inLine=\{event\.id === inLineId\}/);
});
