/**
 * Paket C — mobil ekran hataları (2026-11-12 denetimi).
 *
 * 1 · başka günün kartı kumandayı BUGÜNE açıyordu ("Bu randevu bulunamadı")
 * 2 · not kaydı damgayı ilerletiyor, sonraki kalem kaydı sessizce düşüyordu
 * 3 · "149,50" → ₺1.495 (tutar ve fiyat 10×)
 * 4 · önce tahsil edilen iş telefonda başlatılamıyor/bitirilemiyordu
 * 5 · biten abonelikte müdür yazımı "Bağlantı kesilmiş olabilir" diyordu
 * 6 · "Hizmeti sil" tek dokunuşla kalıcı siliyordu
 * 7 · `other` yöntemli ödemede Kaydet etkin ama sessizce hiçbir şey yapmıyordu
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { formatTRAmountDraft, parseTRAmount, sameAmount } from '../mobile/src/lib/trAmount.ts';
import { canCorrect, parseAmount } from '../mobile/src/lib/cash.ts';
import {
    parsePrice, priceDraft, priceTextValid, priceToSave, serviceDeleteDialog,
} from '../mobile/src/lib/managerProfile.ts';
import { defaultAmountText, parsePlanAmount, planPaymentFailureOf } from '../mobile/src/lib/planPayment.ts';
import { staleVerdict } from '../mobile/src/lib/itemsAutosave.ts';
import { cardState, localStamp, PAID_AHEAD_NOTE } from '../mobile/src/lib/staffCard.ts';
import { phaseOf } from '../mobile/src/lib/visitControl.ts';
import { isSubscriptionRefusal, outcomeOf, SUBSCRIPTION_LINE } from '../mobile/src/lib/managerWriteMap.ts';
import { createOutcomeOf } from '../mobile/src/lib/createLive.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ── 1 · kumandaya tarih ─────────────────────────────────────────────────────

test('1 · Bugün ve takvim kumandayı randevunun GÜNÜYLE açıyor', () => {
    const today = read('../mobile/app/personel/index.tsx');
    const calendar = read('../mobile/app/personel/calendar.tsx');
    assert.match(today, /pathname: '\/\(staff-flow\)\/kumanda',\s*params: \{ id: appointment\.id, date: appointment\.date \}/);
    assert.match(calendar, /pathname: '\/\(staff-flow\)\/kumanda',\s*params: \{ id: appointment\.id, date: appointment\.date \}/);
    // Kumanda tarihi okumaya geçiriyor; yoksa bugüne düşüyor.
    assert.match(read('../mobile/app/(staff-flow)/kumanda.tsx'), /useVisit\(params\.id, params\.date \|\| undefined\)/);
});

// ── 2 · not kaydı + bayat yeniden deneme ────────────────────────────────────

const L = (catalogId, qty = 1) => ({ id: catalogId, catalogId, name: catalogId, price: 100, qty, kind: 'product' });
const I = (catalogId, qty = 1) => ({ id: catalogId, catalog_id: catalogId, name: catalogId, price: 100, qty, kind: 'product' });

test('2 · not yazması sunucunun yeni damgasını gözlem olarak dönüyor', () => {
    const write = read('../mobile/src/lib/visitWrite.ts');
    const note = write.slice(write.indexOf('export async function writeVisitNote'));
    assert.match(note, /observation: observationOf\(out\)/);
    const k = read('../mobile/app/(staff-flow)/kumanda.tsx');
    assert.match(k, /if \(out\.queued\) \{ setNoteWrite\('queued'\); return; \}[\s\S]{0,400}?observe\(out\.observation\);\s*setNoteSaved\(out\.saved\);/);
});

test('2 · bayat cevap: kalemlere kimse dokunmadıysa yeni damgayla BİR KEZ yeniden', () => {
    const base = [I('p1')];
    // Not damgayı ilerletti; sunucudaki kalemler hâlâ temel liste.
    assert.equal(staleVerdict({ staleItems: base, list: [L('p1'), L('p2')], baseItems: base, ownItems: null }), 'retry');
    // Kendi son yazmamızla aynı → yine bizim.
    assert.equal(staleVerdict({ staleItems: [I('p1'), I('p2')], list: [L('p1'), L('p2'), L('p3')], baseItems: base, ownItems: [I('p1'), I('p2')] }), 'retry');
    // Sunucuda zaten yazmak istediğimiz liste var.
    assert.equal(staleVerdict({ staleItems: [I('p1'), I('p2')], list: [L('p1'), L('p2')], baseItems: base, ownItems: null }), 'landed');
    // Başkası kalem eklemiş: EZİLMEZ.
    assert.equal(staleVerdict({ staleItems: [I('p1'), I('x9')], list: [L('p1'), L('p2')], baseItems: base, ownItems: null }), 'foreign');
});

test('2 · kumanda bayat cevapta kararı uyguluyor, yazılmayan listeyi "yazıldı" saymıyor', () => {
    const k = read('../mobile/app/(staff-flow)/kumanda.tsx');
    const save = k.slice(k.indexOf('const startSave ='), k.indexOf('const startSave =') + 3200);
    assert.match(save, /const verdict = staleVerdict\(\{ staleItems: first\.stale\.items, list, baseItems, ownItems: own \}\);/);
    assert.match(save, /if \(verdict === 'foreign'\) return first;/);
    assert.match(save, /return write\(first\.stale\.stamp\);/);
    assert.match(save, /if \(savedKey\.current === key\) savedKey\.current = '';/);
    // Tek yazma yolu korunuyor.
    assert.equal((k.match(/saveVisitItems\(/g) ?? []).length, 1);
});

// ── 3 · TR tutar ────────────────────────────────────────────────────────────

test('3 · ortak TR ayrıştırıcı — sınır durumları', () => {
    assert.equal(parseTRAmount('149,5'), 149.5);
    assert.equal(parseTRAmount('149,50'), 149.5);
    assert.equal(parseTRAmount('149.50'), 149.5);
    assert.equal(parseTRAmount('149.5'), 149.5);
    assert.equal(parseTRAmount('1.495'), 1495, 'nokta + tam üçlü = binlik');
    assert.equal(parseTRAmount('1.234.567'), 1234567);
    assert.equal(parseTRAmount('1.495,50'), 1495.5);
    assert.equal(parseTRAmount('1,495.50'), 1495.5);
    assert.equal(parseTRAmount('₺ 1.800'), 1800);
    assert.equal(parseTRAmount('1500'), 1500);
    assert.equal(parseTRAmount(',5'), 0.5);
    assert.equal(parseTRAmount(''), null);
    assert.equal(parseTRAmount('   '), null);
    assert.equal(parseTRAmount('abc'), null);
    assert.equal(parseTRAmount('0'), 0);
    // Anlaşılmayan: tahmin edilmiyor.
    assert.equal(parseTRAmount('1,495'), null, 'virgülden sonra 3 hane — kuruş olamaz');
    assert.equal(parseTRAmount('149,555'), null);
    assert.equal(parseTRAmount('1,2,3'), null);
});

test('3 · taslak biçimleyici ayrıştırıcının eşleniği', () => {
    for (const value of [0.5, 1, 149.5, 149.9, 1495, 1495.5, 1234567.89]) {
        assert.equal(parseTRAmount(formatTRAmountDraft(value)), value, String(value));
    }
    assert.equal(formatTRAmountDraft(149.5), '149,50');
    assert.equal(formatTRAmountDraft(1500), '1500');
    assert.equal(formatTRAmountDraft(null), '');
    assert.equal(sameAmount(149.5, 149.499999), true);
    assert.equal(sameAmount(149.5, 149.51), false);
});

test('3 · Kasa düzeltmesi: ₺149,50 yalnız yöntem değişince ₺1.495 OLMUYOR', () => {
    assert.equal(parseAmount('149,50'), 149.5);
    assert.equal(parseAmount('0'), null, 'tahsilat sıfır olamaz');
    assert.equal(parseAmount(''), null);
    assert.equal(canCorrect(formatTRAmountDraft(149.5), 149.5, 'cash', 'cash'), false, 'hiçbir şey değişmedi');
    assert.equal(canCorrect(formatTRAmountDraft(149.5), 149.5, 'card', 'cash'), true, 'yalnız yöntem');
    const sheet = read('../mobile/src/components/CashSheets.tsx');
    assert.match(sheet, /setDraft\(formatTRAmountDraft\(movement\.amount\)\);/);
    assert.ok(!/setDraft\(String\(movement\.amount\)\)/.test(sheet));
    // Alan değişmediyse eski tutar olduğu gibi gidiyor.
    assert.match(sheet, /draft === formatTRAmountDraft\(movement\.amount\)\s*\|\| sameAmount\(parsed, movement\.amount\)\s*\? movement\.amount/);
    assert.match(sheet, /keyboardType="decimal-pad"/);
});

test('3 · hizmet fiyatı: adı değiştirmek ₺149,90\'ı 1499 yapmıyor', () => {
    assert.equal(parsePrice('149,90'), 149.9);
    assert.equal(parsePrice(''), null);
    assert.equal(parsePrice('0'), 0);
    assert.equal(priceDraft(149.9), '149,90');
    assert.equal(priceToSave(priceDraft(149.9), priceDraft(149.9), 149.9), 149.9, 'alan değişmedi');
    assert.equal(priceToSave('149,9', '149,90', 149.9), 149.9, 'aynı tutar');
    assert.equal(priceToSave('200', '149,90', 149.9), 200);
    assert.equal(priceToSave('', '149,90', 149.9), null, 'boşaltmak fiyatı kaldırır');
    assert.equal(priceTextValid('1,495'), false, 'anlaşılmayan fiyat kaydedilmez');
    assert.equal(priceTextValid(''), true);
    const sheets = read('../mobile/src/components/ProfileSheets.tsx');
    assert.match(sheets, /setPriceText\(service \? priceDraft\(service\.price\) : ''\);/);
    assert.match(sheets, /const price = priceToSave\(priceText, initialPriceText, service\?\.price \?\? null\);/);
    assert.ok(!/String\(service\.price\)/.test(sheets));
});

test('3 · paket kalan borcu kuruşuyla kapanabiliyor', () => {
    assert.equal(defaultAmountText(1234.5), '1234,50');
    assert.equal(parsePlanAmount('1234,50'), 1234.5);
    assert.equal(parsePlanAmount('1.000'), 1000);
    assert.equal(parsePlanAmount('0'), null);
});

// ── 4 · önce tahsil edilen iş ───────────────────────────────────────────────

const DATE = '2026-08-30';
const NOW = localStamp(DATE, '12:36');
const appt = {
    date: DATE, start_time: '12:00', end_time: '13:00', status: 'confirmed',
    arrived_at: null, service_ended_at: null, adisyon_items: null, is_paid: false,
    customer_arrived_at: null,
};

test('4 · tahsil edilmiş AÇIK ziyaret kapalı sayılmıyor; akış sürüyor', () => {
    // Başlamamış, önceden ödenmiş: başlatılabilir.
    const before = cardState({ ...appt, start_time: '13:00', end_time: '14:00', is_paid: true }, NOW);
    assert.notEqual(before.kind, 'paid');
    assert.equal(before.word, 'Ödendi');
    assert.equal(phaseOf({ ...appt, start_time: '13:00', end_time: '14:00', is_paid: true }, NOW), 'before');
    // Sürüyor + ödendi eki.
    const running = { ...appt, is_paid: true, arrived_at: new Date(NOW - 10 * 60_000).toISOString() };
    const r = cardState(running, NOW);
    assert.equal(r.kind, 'running');
    assert.ok(r.suffix?.endsWith(PAID_AHEAD_NOTE));
    assert.equal(phaseOf(running, NOW), 'running');
    // Bitti, gönderilmedi: kapanış adımı açık (visit.finish çalışabilir).
    const ended = { ...running, service_ended_at: new Date(NOW).toISOString() };
    assert.equal(phaseOf(ended, NOW), 'closing');
    // Kapanmış + ödenmiş: kapanış.
    assert.equal(cardState({ ...ended, status: 'completed' }, NOW).kind, 'paid');
    assert.equal(phaseOf({ ...ended, status: 'completed' }, NOW), 'closed');
    // İptal her şeyin üstünde.
    assert.equal(cardState({ ...appt, status: 'cancelled', is_paid: true }, NOW).kind, 'cancelled');
});

test('4 · tek kişilikte önceden ödenmiş işte tahsilat güvertesi yok, kasaya gönderim var', () => {
    const k = read('../mobile/app/(staff-flow)/kumanda.tsx');
    assert.match(k, /const paidAhead = appointment\?\.is_paid === true && closedCard === null;/);
    assert.match(k, /params\.from === 'tek' && !kasaOnly && !paidAhead \? \(\s*<CollectBar/);
});

// ── 5 · abonelik ────────────────────────────────────────────────────────────

test('5 · 42501 abonelik sonucu — "bağlantı" değil', () => {
    assert.deepEqual(outcomeOf({ code: '42501', message: 'new row violates row-level security policy' }, null, 0), { ok: false, kind: 'subscription' });
    assert.deepEqual(outcomeOf({ code: 'P0001', message: 'subscription_inactive' }, null, 0), { ok: false, kind: 'subscription' });
    assert.deepEqual(outcomeOf({ code: '500', message: 'boom' }, null, 0), { ok: false, kind: 'failed' });
    assert.deepEqual(createOutcomeOf({ code: '42501', message: 'rls' }, null), { ok: false, kind: 'subscription' });
    assert.equal(createOutcomeOf({ code: '23P01', message: 'x' }, 'Ada').kind, 'conflict', 'çakışma önce');
    assert.equal(isSubscriptionRefusal(null), false);
    // Paket ödemesiyle aynı işaret.
    assert.equal(planPaymentFailureOf({ code: '42501' }), 'subscription_inactive');
    assert.match(SUBSCRIPTION_LINE, /Aboneliğiniz kapalı/);
    for (const screen of ['../mobile/app/mudur/index.tsx', '../mobile/app/mudur/calendar.tsx',
        '../mobile/app/(manager-flow)/randevu/[id].tsx', '../mobile/app/(manager-flow)/personel/[id].tsx']) {
        assert.match(read(screen), /refused\.kind === 'subscription' \? SUBSCRIPTION_LINE/, screen);
    }
    assert.match(read('../mobile/src/lib/createLive.ts'), /case 'subscription':\s*return \{\s*tone: 'red',\s*title: 'Aboneliğiniz kapalı'/);
});

// ── 6 · hizmet silme ────────────────────────────────────────────────────────

test('6 · "Hizmeti sil" yıkıcı onayla ve istek sürerken ikinci dokunuş yok', () => {
    const d = serviceDeleteDialog('Saç kesimi');
    assert.equal(d.title, 'Hizmeti sil');
    assert.match(d.message, /Saç kesimi .*kalıcı.*geri alınamaz/);
    assert.equal(d.confirm, 'Sil');
    const sheets = read('../mobile/src/components/ProfileSheets.tsx');
    const row = sheets.slice(sheets.indexOf('title="Hizmeti sil"'), sheets.indexOf('title="Hizmeti sil"') + 1200);
    assert.match(row, /if \(busy\) return;/);
    assert.match(row, /Alert\.alert\(dialog\.title, dialog\.message, \[/);
    assert.match(row, /style: 'destructive',\s*onPress: \(\) => \{\s*setBusy\(true\);\s*void onDelete\(service\.id\)/);
});

// ── 7 · `other` yöntemli ödeme ──────────────────────────────────────────────

test('7 · seçicide olmayan yöntemde yöntem seçilmeden Kaydet kapalı', () => {
    assert.equal(canCorrect('200', 150, null, 'other'), false, 'tutar değişse de yöntem seçilmeli');
    assert.equal(canCorrect('200', 150, 'cash', 'other'), true);
    // Yöntem sorulmayan eski çağrı aynı.
    assert.equal(canCorrect('200', 150), true);
});
