import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    applyFlowAction, atClock, autoCancelled, minuteLabel, contextRows, etaColumn, etaPanel, graceLeft,
    hasContext, initialsOf, isLate, LATE_LIMIT_MINUTES, lateMinutes, mockDay,
    nextCardKind, staffConflict, toleranceLabel,
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

test('tolerans 30 dakika', () => {
    assert.equal(LATE_LIMIT_MINUTES, 30);
    assert.equal(graceLeft(-8), 22);
    assert.equal(graceLeft(-29), 1);
});

test('30 dakikada otomatik düşer, altında düşmez', () => {
    assert.equal(autoCancelled(-29), false);
    assert.equal(autoCancelled(-30), true);
    assert.equal(autoCancelled(-45), true);
    assert.equal(graceLeft(-45), 0);
});

test('gecikme yokken tolerans rozeti hiç çizilmez', () => {
    assert.equal(toleranceLabel(6), null);
    assert.equal(toleranceLabel(undefined), null);
});

test('tolerans rozeti kalan dakikayı söyler', () => {
    assert.equal(toleranceLabel(-8), '22 dk sonra düşer');
    assert.equal(toleranceLabel(-30), 'otomatik düştü');
});

// ── A1 paneli ───────────────────────────────────────────────────────────────

test('A1 zamanında: girmesine + saat · süre', () => {
    const panel = etaPanel({ time: '11:30', etaMinutes: 6, durationMinutes: 45 });
    assert.deepEqual(panel, { label: 'girmesine', value: '6 dk', sub: '11:30 · 45 dk', late: false });
});

test('A1 gecikmiş: gecikti + bekleniyordu', () => {
    const panel = etaPanel({ time: '11:30', etaMinutes: -8, durationMinutes: 45 });
    assert.equal(panel.label, 'gecikti');
    assert.equal(panel.value, '8 dk');
    assert.equal(panel.sub, '11:30’da bekleniyordu');
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
    assert.equal(elif.etaMinutes, 6);
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
    const card = parts.slice(parts.indexOf('function CustomerCard'), parts.indexOf('function ToleranceChip'));
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

test('"Tahsil et" adisyonu tahsilata çevirir', () => {
    const next = applyFlowAction({ id: 'x', time: '11:18', kind: 'due', firstName: 'M', lastName: 'A', detail: '' }, 'Tahsil et');
    assert.equal(next.kind, 'paid');
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
    assert.equal((parts.match(/onAction\?\.\('Gelmedi'\)/g) ?? []).length, 2);
    assert.ok(!/onPress=\{\(\) => \{ feedback\.medium\(\); \}\}/.test(parts));
});

test('⋮ randevusu olmayan olayda çizilmez', () => {
    const screen = readFileSync(new URL('../mobile/app/(manager)/index.tsx', import.meta.url), 'utf8');
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
