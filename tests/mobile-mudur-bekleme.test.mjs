/**
 * Müdür 20 — bekleme kartları ("Geldi" ile "Sürüyor" arası).
 *
 * Tasarım: docs/design-reference/Luera Mobil - Mudur 20 Bekleme Kartlari.html
 *
 * Akış kararı veritabanında yazılı (supabase/043_customer_arrived.sql):
 * müdür "Geldi"ye basar → personele bildirim gider → hizmeti PERSONEL başlatır.
 * Bu dosya o aradaki kartın kurallarını kilitler.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    applyFlowAction, applyWaitAction, demoTick, labelOf, mockDay, toneOf,
    stampAge, STAMP_FRESH_MINUTES, waitCard, waitHero, waitLevel,
    WAIT_LATE_MINUTES, WAIT_WARN_MINUTES,
} from '../mobile/src/lib/managerFlow.ts';
import { accusative, dative } from '../mobile/src/lib/text.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const tokens = read('../mobile/src/theme/tokens.ts');
// Ölçüler yalnız kendi bloğundan okunur: `ghostHeight` gibi adlar
// nextCardMetrics'te de var, dosyanın tamamında aranırsa yanlış jeton gelir.
const waitTokens = tokens.slice(tokens.indexOf('export const waitCardMetrics'));
const px = (key) => Number(new RegExp(`\\b${key}: ([\\d.]+)`).exec(waitTokens)[1]);
const parts = read('../mobile/src/components/FlowParts.tsx');
const screen = read('../mobile/app/(manager)/index.tsx');

const base = {
    id: 'w', time: '11:30', kind: 'arrived',
    firstName: 'Elif', lastName: 'Demir',
    detail: 'Keratin bakımı · 45 dk · Selin ile',
    staffId: 'selin', staffName: 'Selin',
};

// ── Türkçe ek çekimi ────────────────────────────────────────────────────────
// "Merve'e düştü" yanlışı hemen göze batar; isimler veriden geldiği için ek
// elle yazılamaz.

test('yönelme hâli ünlü uyumuna uyar', () => {
    assert.equal(dative('Selin'), 'Selin’e');
    assert.equal(dative('Deniz'), 'Deniz’e');
    assert.equal(dative('Kaan'), 'Kaan’a');
    assert.equal(dative('Burak'), 'Burak’a');
});

test('yönelme hâli ünlüyle biten adda kaynaştırma "y"si alır', () => {
    assert.equal(dative('Merve'), 'Merve’ye');
    assert.equal(dative('Ece'), 'Ece’ye');
    assert.equal(dative('Hatice'), 'Hatice’ye');
});

test('belirtme hâli dört ekli çalışır', () => {
    assert.equal(accusative('Selin'), 'Selin’i');
    assert.equal(accusative('Kaan'), 'Kaan’ı');
    assert.equal(accusative('Gül'), 'Gül’ü');
    assert.equal(accusative('Merve'), 'Merve’yi');
});

test('ek tipografik kesme işaretiyle ayrılır — düz tırnak değil', () => {
    assert.ok(dative('Selin').includes('’'));
    assert.ok(!dative('Selin').includes("'"));
});

test('boş ad çökertmez', () => {
    assert.equal(dative(''), '');
    assert.equal(accusative('   '), '');
});

// ── Eşikler ─────────────────────────────────────────────────────────────────

test('uzun bekleme eşiği masaüstüyle aynı sayı', () => {
    // KuaforReservationsPage lateWaits / GuzellikDashboard uyarısı: 10 dk.
    // Aynı müşteri iki ekranda iki farklı renkte görünmesin.
    assert.equal(WAIT_LATE_MINUTES, 10);
    assert.equal(WAIT_WARN_MINUTES, 5);
});

test('seviye eşikleri kapsayıcı', () => {
    assert.equal(waitLevel(0), 'calm');
    assert.equal(waitLevel(4), 'calm');
    assert.equal(waitLevel(5), 'warn');
    assert.equal(waitLevel(9), 'warn');
    assert.equal(waitLevel(10), 'late');
    assert.equal(waitLevel(41), 'late');
});

test('seviye eksi ve tanımsız değerde sakin kalır', () => {
    assert.equal(waitLevel(undefined), 'calm');
    assert.equal(waitLevel(-3), 'calm');
    assert.equal(waitLevel(Number.NaN), 'calm');
});

// ── Kahraman rakam ──────────────────────────────────────────────────────────

test('bekleme rakamı SIFIRSIZ ve birim ayrı düğüm', () => {
    // Birim ayrı olmasa "dk" da rakam gibi davranırdı (tabular, 34 pt).
    assert.deepEqual(waitHero(4), { value: '4', unit: 'dk' });
    assert.deepEqual(waitHero(0), { value: '0', unit: 'dk' });
    assert.notEqual(waitHero(4).value, '04');
});

test('bir saati aşan bekleme saate döner', () => {
    assert.deepEqual(waitHero(60), { value: '1', unit: 'sa' });
    assert.deepEqual(waitHero(65), { value: '1 sa 5', unit: 'dk' });
});

// ── Kart · sakin ────────────────────────────────────────────────────────────

test('C1 · personel müsait — düştü cümlesi teslimat İDDİA ETMEZ', () => {
    const card = waitCard({ ...base, waitMinutes: 1 }, []);
    assert.equal(card.level, 'calm');
    assert.equal(card.label, 'geldi · bekliyor');
    assert.equal(card.value, '1');
    assert.equal(card.sub, 'Bekleme alanı · Selin’e düştü');
    assert.equal(card.conflict, null);
});

test('hiçbir hâlde "bildirim gönderildi" yazmaz', () => {
    const states = [
        waitCard({ ...base, waitMinutes: 1 }, []),
        waitCard({ ...base, waitMinutes: 6 }, []),
        waitCard({ ...base, waitMinutes: 12 }, []),
        waitCard({ ...base, waitMinutes: 2, walkin: true }, []),
    ];
    for (const card of states) {
        const text = `${card.label} ${card.sub ?? ''} ${card.conflict ?? ''}`;
        assert.ok(!/bildirim/i.test(text), text);
        assert.ok(!/gönderildi/i.test(text), text);
    }
});

test('C1 · taze basışta yalnız geri alma sunulur', () => {
    const card = waitCard({ ...base, waitMinutes: 0 }, [], true);
    assert.deepEqual(card.actions, [{ label: 'Geri al', kind: 'ghost' }]);
});

test('C2 · personel hizmetteyse alt satırın yerini çakışma cümlesi alır', () => {
    const presence = [{ id: 'selin', initials: 'SD', name: 'Selin', state: 'busy', minutes: 8 }];
    const card = waitCard({ ...base, waitMinutes: 3 }, presence);
    assert.equal(card.conflict, 'Selin şu an işlemde · 08 dk');
    // Kart bir müşteri dosyası değil: bilgi eklemek için bir şey çıkarıldı.
    assert.equal(card.sub, null);
});

test('C2 · çakışma rozeti sıfırla dolu — kahraman rakam değil', () => {
    const presence = [{ id: 'selin', initials: 'SD', name: 'Selin', state: 'busy', minutes: 8 }];
    const card = waitCard({ ...base, waitMinutes: 3 }, presence);
    assert.ok(card.conflict.includes('08 dk'));
});

test('personel müsaitken çakışma satırı HİÇ çizilmez', () => {
    const presence = [{ id: 'selin', initials: 'SD', name: 'Selin', state: 'free' }];
    assert.equal(waitCard({ ...base, waitMinutes: 3 }, presence).conflict, null);
});

test('eşik aşıldığında çakışma satırı yerini süreye bırakır', () => {
    const presence = [{ id: 'selin', initials: 'SD', name: 'Selin', state: 'busy', minutes: 8 }];
    assert.equal(waitCard({ ...base, waitMinutes: 6 }, presence).conflict, null);
    assert.equal(waitCard({ ...base, waitMinutes: 12 }, presence).conflict, null);
});

// ── Kart · eşikler ──────────────────────────────────────────────────────────

test('C3a · 5. dakikada etiket KELİMEYLE değişir', () => {
    // Renk tek başına anlam taşımaz: eşik her zaman yazıyla da geçilir.
    const card = waitCard({ ...base, waitMinutes: 5 }, []);
    assert.equal(card.level, 'warn');
    assert.equal(card.label, 'bekliyor · karşıla');
    assert.equal(card.sub, 'Bekleme alanı · Selin’i bekliyor');
    // Her seviyede TEK eylem: kartta ikinci bir karar yok.
    assert.deepEqual(card.actions, [{ label: 'Karşılamayı aç', kind: 'ghost' }]);
});

test('C3b · 10. dakikada masaüstünün cümlesi birebir kurulur', () => {
    const card = waitCard({ ...base, waitMinutes: 10 }, []);
    assert.equal(card.label, 'uzun bekliyor');
    assert.equal(card.sub, 'Elif 10 dakikadır bekliyor');
});

test('C3b · tek dolu hap 10. dakikada çıkar, başka hiçbir hâlde yok', () => {
    const late = waitCard({ ...base, waitMinutes: 12 }, []);
    // "Hatırlat" DEĞİL: uygulama kimseye haber vermiyor, düğme müdürün kendi
    // yaptığı sözlü işin kaydı. Kelimesi de bunu söylüyor.
    assert.deepEqual(late.actions[0], { label: 'Personele söyle', kind: 'fill' });
    for (const minutes of [0, 3, 5, 9]) {
        const card = waitCard({ ...base, waitMinutes: minutes }, []);
        assert.ok(!card.actions.some((a) => a.kind === 'fill'), `${minutes} dk`);
    }
});

test('C5 · randevusuz kendi etiketini taşır', () => {
    const card = waitCard({
        ...base, staffId: 'ece', staffName: 'Ece', waitMinutes: 2, walkin: true,
    }, []);
    assert.equal(card.label, 'randevusuz · bekliyor');
    assert.equal(card.sub, 'Bekleme alanı · Ece’ye düştü');
});

test('C5 · eşikler randevusuzda da işler', () => {
    const card = waitCard({ ...base, waitMinutes: 11, walkin: true }, []);
    // Bekleyen müşteri, randevusu olsun olmasın bekliyor.
    assert.equal(card.level, 'late');
    assert.equal(card.label, 'uzun bekliyor');
});

test('personel adı yoksa cümle uydurulmaz', () => {
    const { staffName: _s, ...noStaff } = base;
    assert.equal(waitCard({ ...noStaff, waitMinutes: 1 }, []).sub, 'Bekleme alanı');
});

// ── Eylemler ────────────────────────────────────────────────────────────────

test('"Geri al" beklemeyi sıradaki randevuya KAYIPSIZ döndürür', () => {
    const arrived = applyFlowAction(
        { ...base, kind: 'next', etaMinutes: 6, durationMinutes: 45 }, 'Geldi',
    );
    const back = applyWaitAction(arrived, 'Geri al');
    assert.equal(back.kind, 'next');
    assert.equal(back.etaMinutes, 6);
    assert.equal(back.waitMinutes, undefined);
});

test('"Geri al" biriken işaretleri de temizler', () => {
    const back = applyWaitAction(
        { ...base, waitMinutes: 3, remindedAt: 2, parked: true }, 'Geri al',
    );
    assert.equal(back.remindedAt, undefined);
    assert.equal(back.parked, undefined);
});

test('sakin kartta tek eylem: beklemeyi kabul etmek', () => {
    // "Müşteriye söyle" KALDIRILDI — kaydı okuyan hiçbir yer yoktu ve müdürün
    // ihtiyacı olan cümle zaten kartta yazılı.
    assert.deepEqual(waitCard({ ...base, waitMinutes: 3 }, []).actions, [
        { label: 'Beklemeye al', kind: 'hap' },
    ]);
});

test('uzun beklemede de tek eylem kalır', () => {
    assert.deepEqual(waitCard({ ...base, waitMinutes: 12 }, []).actions, [
        { label: 'Personele söyle', kind: 'fill' },
    ]);
});

test('"Personele söyle" DAMGAYA dönüşür ve YAŞINI taşır', () => {
    const after = applyWaitAction({ ...base, waitMinutes: 12 }, 'Personele söyle');
    // Boole değil, beklemenin kaçıncı dakikası: saat tutulmuyor.
    assert.equal(after.remindedAt, 12);
    const card = waitCard(after, []);
    assert.deepEqual(card.actions[0], { label: 'Personele · şimdi', kind: 'stamp' });
    assert.ok(!card.actions.some((a) => a.label === 'Personele söyle'));
});

test('damga dakika geçtikçe yaşlanır', () => {
    const after = applyWaitAction({ ...base, waitMinutes: 11 }, 'Personele söyle');
    assert.equal(waitCard({ ...after, waitMinutes: 14 }, []).actions[0].label, 'Personele · 3 dk');
});

test('damga 5 dakikada SÖNER, düğme geri gelir — kart ölmez', () => {
    // 6 dakika önce söylenmiş söz bayattır; müşteri hâlâ bekliyorsa
    // yenilenmelidir.
    assert.equal(STAMP_FRESH_MINUTES, 5);
    const after = applyWaitAction({ ...base, waitMinutes: 11 }, 'Personele söyle');
    const stale = waitCard({ ...after, waitMinutes: 17 }, []);
    assert.deepEqual(stale.actions, [{ label: 'Personele söyle', kind: 'fill' }]);
});

test('yaş yazısı sıfırda "şimdi" der', () => {
    assert.equal(stampAge(0), 'şimdi');
    assert.equal(stampAge(3), '3 dk');
});

test('"Beklemeye al" eşik tırmanışını susturur', () => {
    const after = applyWaitAction({ ...base, waitMinutes: 12 }, 'Beklemeye al');
    const card = waitCard(after, []);
    assert.equal(card.level, 'calm');
    assert.equal(card.sub, 'Beklemeye alındı · Selin’i bekliyor');
    assert.ok(!card.actions.some((a) => a.label === 'Beklemeye al'));
});

test('"Karşılamayı aç" durum değiştirmez — ekranda geçiş yapar', () => {
    assert.equal(applyWaitAction({ ...base, waitMinutes: 6 }, 'Karşılamayı aç'), null);
    assert.ok(screen.includes("label === 'Karşılamayı aç'"));
    assert.ok(screen.includes("pathname: '/randevu/[id]'"));
});

test('bekleme eylemleri yalnız bekleyen satırda çalışır', () => {
    assert.equal(applyWaitAction({ ...base, kind: 'next' }, 'Geri al'), null);
    assert.equal(applyWaitAction({ ...base, kind: 'started' }, 'Personele söyle'), null);
});

test('tanınmayan eylem hiçbir şey değiştirmez', () => {
    assert.equal(applyWaitAction({ ...base, waitMinutes: 3 }, 'Sil'), null);
});

// ── Akıştaki yeri ───────────────────────────────────────────────────────────

test('"müşteri geldi" YEŞİL DEĞİL amber — hiçbir şey bitmedi', () => {
    assert.equal(toneOf('arrived'), 'amber');
    assert.equal(labelOf('arrived'), 'geldi · bekliyor');
});

test('satır ve kart aynı kelimeyi söyler — iki sözlük olmaz', () => {
    // Bekleme seviyeden, düşmüş randevu kendi etiketinden konuşur; ikisi de
    // satıra kartla AYNI kelimeyi veriyor.
    assert.ok(parts.includes('const kindLabel = waiting ? waiting.label'));
    assert.ok(parts.includes('gone ? noshowRowLabel(event)'));
});

test('mock gün dört bekleme seviyesini de taşır', () => {
    const waits = mockDay.events.filter((e) => e.kind === 'arrived');
    const levels = waits.map((e) => (e.handoff ? 'handoff' : waitLevel(e.waitMinutes)));
    assert.ok(levels.includes('calm'));
    assert.ok(levels.includes('warn'));
    assert.ok(levels.includes('late'));
    assert.ok(levels.includes('handoff'));
    assert.ok(waits.some((e) => e.walkin));
});

// ── Ölçüler ─────────────────────────────────────────────────────────────────

test('çerçeve A1 paneli ve canlı şeritle AYNI — üç hâl aynı kart', () => {
    assert.ok(tokens.includes('pad: 14'));
    assert.ok(tokens.includes('radius: 18'));
    assert.ok(tokens.includes('gap: 12'));
    // Karşılaştırma: A1 ve canlı şerit de 14 / 18 / 12.
    assert.ok(tokens.includes('panelPad: 14'));
    assert.ok(tokens.includes('livePadding: 14'));
});

test('uyarı çizgisi + dolgu toplamı 14 — metin yerinden oynamaz', () => {
    assert.equal(px('stripe') + px('padWarn'), px('pad'));
    // Çizgi mutlak katmanda ve dolgunun ÜSTÜNE biniyor; dolgu her hâlde 14.
    // İkisi birden küçültülseydi metin eşik geçilirken 4 pt sıçrardı.
    assert.ok(!parts.includes('paddingLeft: warn ?'));
    assert.ok(parts.includes('padding: waitCardMetrics.pad'));
});

test('kart 100 pt tavanını aşmaz', () => {
    const pad = px('pad');
    const left = pad * 2 + px('label') * px('labelLine') + px('heroBox') + px('sub') * px('subLine');
    // Sağ sütun: hap 40 + boşluk 6 + hayalet 22.
    const right = pad * 2 + px('hapHeight') + px('actGap') + px('ghostHeight');
    assert.ok(left <= 100, `sol sütun ${left}`);
    assert.ok(right <= 100, `sağ sütun ${right}`);
    // Tasarımın ölçtüğü değerler: C1 92, geri kalanı 96.
    assert.equal(Math.round(left), 92);
    assert.equal(right, 96);
});

test('kahraman rakam canlı sayaçla aynı boyda, A1 geri sayımından küçük', () => {
    // 40 yalnız HENÜZ BURADA OLMAYAN müşterinin rakamı; içeri girince rakam
    // tahminden ölçüme döner ve ölçen iki hâl aynı boyda durur.
    assert.ok(tokens.includes('hero: 34'));
    assert.ok(tokens.includes('liveCounter: 34'));
    assert.ok(tokens.includes('eta: 40'));
});

test('görünen 40/22, dokunulan 44 — hitSlop farkı kapatır', () => {
    assert.equal(px('hapHeight') + px('hapSlop') * 2, 44);
    assert.equal(px('ghostHeight') + px('ghostSlop') * 2, 44);
});

test('devir satırı kartın yarısından küçük', () => {
    assert.ok(px('handHeight') < 92 / 2);
});

test('bekleme amberi yazı ve grafik olarak ayrı — krem zeminde kontrast', () => {
    assert.ok(tokens.includes("am: '#8A5C00'"));
    assert.ok(tokens.includes("amDot: '#D9A43B'"));
});

// ── Hareket ─────────────────────────────────────────────────────────────────

test('bekleme nabzı canlı sayacınkinden üç kat yavaş', () => {
    // İki kart aynı ekranda üst üste durur: biri tikler, öteki nefes alır.
    assert.ok(tokens.includes('pulse: 2600'));
    assert.ok(parts.includes('duration: 800'));
});

test('her hareket native sürücüde çalışır', () => {
    const uses = parts.match(/useNativeDriver:\s*true/g) ?? [];
    const wrong = parts.match(/useNativeDriver:\s*false/g) ?? [];
    assert.ok(uses.length >= 6);
    assert.equal(wrong.length, 0);
});

test('renk, yükseklik ve yarıçap animasyona GİRMEZ', () => {
    // Renk geçişi iki yüzeyin çapraz soldurulmasıyla yapılır; renk
    // interpolasyonu native sürücüde çalışmaz ve yeniden yerleşim ister.
    // Çağrıyı ara, açıklamayı değil: aynı kelime yorumlarda gerekçe olarak geçiyor.
    assert.ok(!/interpolateColor\(/.test(parts));
    const animated = parts.match(/Animated\.timing\([^)]*\{[^}]*\}/g) ?? [];
    for (const block of animated) {
        assert.ok(!/height|borderRadius|backgroundColor/.test(block), block);
    }
});

test('hareket azaltılmışsa bilgi harekete emanet edilmez', () => {
    // Nabız durur ama nokta GÖRÜNÜR kalır — sıfıra düşmez.
    assert.ok(tokens.includes('reducedOpacity: 0.7'));
    assert.ok(parts.includes('pulse.setValue(waitCardMetrics.reducedOpacity)'));
});

test('geri alma penceresi 5 saniye', () => {
    assert.ok(tokens.includes('undoHold: 5000'));
});

test('devir satırı hareketle doğar, sayaç taşımaz', () => {
    // Devir 5-20 saniyelik bir aralık: dakika birimli sayaç "0 dk" gösterirdi.
    const hand = parts.slice(parts.indexOf('function HandoffRow'));
    const body = hand.slice(0, hand.indexOf('\n}\n'));
    assert.ok(!body.includes('RollingHero'));
    assert.ok(body.includes('scale'));
});

// ── Erişilebilirlik ─────────────────────────────────────────────────────────

test('kart tek cümle olarak okunur, düğmeler ayrı kalır', () => {
    // `accessible` bir kabı tek öğeye indirger; kartın tamamına konsaydı
    // içindeki düğmeler VoiceOver'a kapanırdı.
    assert.ok(parts.includes('accessible accessibilityLabel={spoken}'));
    // Çerçeve artık ortak (`PanelCard`); etiket orada, kartın tamamında değil.
    const card = parts.slice(parts.indexOf('function PanelCard'));
    const body = card.slice(0, card.indexOf('\nfunction HandoffRow'));
    assert.equal((body.match(/accessible /g) ?? []).length, 1);
    // Cümle noktaya ve renge muhtaç değil: kim, ne oldu, ne kadardır.
    assert.ok(body.includes('${event.firstName} ${event.lastName}'));
    assert.ok(body.includes('card.conflict ?? card.sub'));
});

test('birim sakin hâlde ikincil mürekkep, gecikmede kırmızı', () => {
    assert.ok(parts.includes('unitColor={hot ? ink.red : ink.ink2}'));
    assert.ok(parts.includes('unitFade={hot ? 0.72 : 1}'));
});

// ── Eşik geçişi ve dönüşüm (demo sürücüsü) ──────────────────────────────────
// İkisi de canlı veriye bağlıydı; sunucu gelene kadar cihazda görülebilsin
// diye bir saat taklidi var. Animasyonlar bileşende, sürücü ayrı — sunucu
// bağlanınca yalnız sürücü silinecek.

test('demo saati bekleme dakikasını yürütür', () => {
    const one = demoTick({ ...base, waitMinutes: 4 });
    assert.equal(one.waitMinutes, 5);
    // Beşinci dakika: kart uyarı hâline geçer, çapraz soldurma burada çalışır.
    assert.equal(waitLevel(one.waitMinutes), 'warn');
});

test('demo saati sonsuza kadar tırmanmaz', () => {
    let event = { ...base, waitMinutes: 13 };
    for (let i = 0; i < 5; i += 1) event = demoTick(event);
    assert.ok(event.waitMinutes <= 14);
});

test('demo saati yalnız bekleyen satıra dokunur', () => {
    const started = { ...base, kind: 'started', elapsedSeconds: 60 };
    assert.equal(demoTick(started), started);
    const next = { ...base, kind: 'next', etaMinutes: 6 };
    assert.equal(demoTick(next), next);
});

test('devir satırı işleme dönüşür ve bekleme izleri silinir', () => {
    let event = { ...base, waitMinutes: 4, handoff: true, staffInitials: 'SL' };
    for (let i = 0; i < 3; i += 1) event = demoTick(event);
    assert.equal(event.kind, 'started');
    assert.equal(event.handoff, undefined);
    assert.equal(event.waitMinutes, undefined);
    // Sayaç sıfırdan başlar ve saat uydurulmaz: satırın kendi saati kullanılır.
    assert.ok(event.elapsedSeconds > 0);
    assert.ok(event.startedAt.startsWith('11:30'));
});

test('eşik geçişi iki yüzeyin çapraz soldurulmasıyla yapılır', () => {
    // Renk değeri animasyona girmez; eski yüz üstte kalıp söner.
    assert.ok(parts.includes('function WaitFace'));
    assert.ok(parts.includes('setPast(from)'));
    assert.ok(tokens.includes('crossFade: 900'));
    assert.ok(tokens.includes('sweep: 1200'));
});

test('geçmiş yüz dokunuşları YAKALAMAZ', () => {
    // Sönen kopya üstte duruyor; pointerEvents açık olsaydı düğmeler ölürdü.
    const idx = parts.indexOf('{past ? (');
    assert.ok(idx > 0);
    assert.ok(parts.slice(idx, idx + 200).includes('pointerEvents="none"'));
});

test('ışık süpürmesi tek seferlik ve dokunulmaz', () => {
    const idx = parts.indexOf('{past && width > 0 ? (');
    assert.ok(idx > 0);
    const block = parts.slice(idx, idx + 900);
    assert.ok(block.includes('pointerEvents="none"'));
    assert.ok(block.includes('LinearGradient'));
    // Döngü yok: `Animated.loop` ile sarılsaydı dikkat çekmez, rahatsız ederdi.
    assert.ok(!block.includes('Animated.loop'));
});

test('BEKLİYOR → SÜRÜYOR kartın yerini ve yüzeyini korur', () => {
    const live = parts.slice(parts.indexOf('function LiveStrip'));
    const body = live.slice(0, live.indexOf('\nfunction '));
    // Kartın girişi CardSwap'in işi; burada M6'ya özel tek parça var:
    // personel hapı sağdan kayarak girer.
    assert.ok(body.includes('waitCardMetrics.morphPillShift'));
    assert.ok(body.includes('waitCardMetrics.morphPill'));
    // Yüzeyin kendisi animasyona girmiyor.
    assert.ok(body.includes('backgroundColor: ink.panel'));
});

// ── Kart yuvası ─────────────────────────────────────────────────────────────
// İlk uygulamada yalnız GİREN yarı vardı; çıkan kart bir karede yok oluyordu
// ve cihazda sert kesme olarak görünüyordu.

test('kartlar tek yuvada durur — geçişte iki kart üst üste biner', () => {
    assert.ok(parts.includes('function CardSwap'));
    const idx = parts.indexOf('<CardSwap id={slot}');
    assert.ok(idx > 0);
    // Beş kart da aynı yuvanın içinde: ayrı ayrı takılıp sökülmezler.
    const slot = parts.slice(idx, idx + 1200);
    for (const card of ['EtaPanel', 'CustomerCard', 'HandoffRow', 'WaitCardView', 'LiveStrip']) {
        assert.ok(slot.includes(`<${card}`), card);
    }
});

test('çıkan kart yerleşimi etkilemez ve dokunuş yakalamaz', () => {
    const swap = parts.slice(parts.indexOf('function CardSwap'));
    const body = swap.slice(0, swap.indexOf('\n/**'));
    assert.ok(body.includes("position: 'absolute'"));
    assert.ok(body.includes('pointerEvents="none"'));
});

test('geçiş süreleri tasarımın tablosundan birebir', () => {
    // Geldi'ye basış 160/220 · 60 ms gecikme
    assert.ok(tokens.includes('press: { out: 160, in: 220, delay: 60'));
    // Devir 260/300 · 80 ms gecikme
    assert.ok(tokens.includes('handoff: { out: 260, in: 300, delay: 80'));
    // İşlem başlangıcı 180/240 · 140 ms gecikme → toplam 380 ms
    assert.ok(tokens.includes('start: { out: 180, in: 240, delay: 140'));
    const start = /start: \{ out: 180, in: (\d+), delay: (\d+)/.exec(tokens);
    assert.equal(Number(start[1]) + Number(start[2]), 380);
});

test('eğriler tasarımın kübik bezier değerleri', () => {
    assert.ok(tokens.includes('swapOutCurve = [0.4, 0, 1, 1]'));
    assert.ok(tokens.includes('swapInCurve = [0.2, 0.8, 0.25, 1]'));
    assert.ok(parts.includes('Easing.bezier(...swapOutCurve)'));
    assert.ok(parts.includes('Easing.bezier(...swapInCurve)'));
});

test('hareket azaltılmışsa geçiş tek karede olur', () => {
    const swap = parts.slice(parts.indexOf('function CardSwap'));
    const body = swap.slice(0, swap.indexOf('\n/**'));
    assert.ok(body.includes('if (reduceMotion)'));
    assert.ok(body.includes('setPast(null)'));
});

test('dönüşüm yalnız taze satırda oynar', () => {
    assert.ok(parts.includes('<LiveStrip event={event} enter={fresh} />'));
    assert.ok(screen.includes("kinds.current.get(event.id) === 'arrived' && event.kind === 'started'"));
});

test('demo sürücüsü tek bayrakla kapanır ve silinecek yeri belli', () => {
    const lib = read('../mobile/src/lib/managerFlow.ts');
    assert.ok(lib.includes('export const DEMO_FLOW = true'));
    assert.ok(lib.includes('DEMO SÜRÜCÜSÜ'));
    assert.ok(screen.includes('if (!DEMO_FLOW) return;'));
});

test('satır etiketi de yumuşak değişir — kart soldururken zıplamaz', () => {
    assert.ok(parts.includes('function useSwapped'));
    assert.ok(parts.includes('const kind = useSwapped('));
    // ⋮ menüsü sönmeye dahil değil: etiket değişirken menünün yanıp sönmesi
    // gereksiz bir hareket olurdu.
    const idx = parts.indexOf('opacity: kind.opacity');
    const after = parts.slice(idx, idx + 900);
    assert.ok(after.includes('</Animated.View>'));
    assert.ok(after.indexOf('</Animated.View>') < after.indexOf('DotsButton'));
});
