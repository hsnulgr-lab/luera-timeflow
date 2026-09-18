import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { activeFlags, blockLabel, closedBy, closedReason, foldTr } from '../mobile/src/lib/eligibility.ts';
import { customerFieldCells, SECTOR_CUSTOMER_FIELDS } from '../mobile/src/lib/sectorFields.ts';
import {
    customerCardOf, frequencyText, fullHistoryOf, sinceText,
} from '../mobile/src/lib/customerCardLive.ts';

/**
 * MÜDÜR 23 v2 · Müşteri kartı (2026-09-18).
 *
 * Kart bir belge değil, bir cevap: "bu hizmeti bu kişiye verebilir miyim?"
 * Risk bir BLOK (kapalı hizmetleriyle), borç bir SATIR. Kapalı hizmet kararı
 * masaüstünün yazdığı `settings.risk_rules`tan — telefon kural uydurmuyor.
 */

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const card = strip(read('src/components/CustomerCard.tsx'));
const route = strip(read('app/(staff-flow)/customer.tsx'));
const flow = strip(read('src/components/CreateFlow.tsx'));
const sheet = strip(read('src/components/CustomerNoteSheet.tsx'));
const write = read('src/lib/managerWrite.ts');
const desktopProfiles = readFileSync(new URL('../src/lib/sectorProfiles.ts', import.meta.url), 'utf8');

// Masaüstünün 076 ile yazdığı kural — güzellik: hamilelik lazer + medikal kapatır.
const RULES = [{
    key: 'hamilelik', label: 'Hamilelik', note: 'gebelikte uygulanmaz',
    blocks: ['lazer', 'medikal'], legacyNamePattern: 'lazer|incelme|zayiflama|g5|radyofrekans',
}];

// ── Uygunluk ────────────────────────────────────────────────────────────────

test('bayrak masaüstünün kuralıyla açılıyor: checkbox true ya da dolu metin', () => {
    assert.equal(activeFlags(RULES, { hamilelik: true }).length, 1);
    assert.equal(activeFlags(RULES, { hamilelik: 'Mayıs' }).length, 1);
    assert.equal(activeFlags(RULES, { hamilelik: false }).length, 0);
    assert.equal(activeFlags(RULES, { hamilelik: '  ' }).length, 0);
    assert.equal(activeFlags(RULES, null).length, 0);
});

test('hizmet etiketiyle kapanıyor; etiketsiz eski hizmet ADINDAN', () => {
    const on = { hamilelik: true };
    assert.deepEqual(closedBy(RULES, on, { name: 'Diode', tags: ['lazer'] }), { label: 'Hamilelik', note: 'gebelikte uygulanmaz' });
    assert.equal(closedBy(RULES, on, { name: 'Cilt bakımı', tags: ['bakim'] }), null);
    // Etiket VARSA ada bakılmıyor (masaüstünün `targetMatches`i).
    assert.equal(closedBy(RULES, on, { name: 'Lazer epilasyon', tags: ['bakim'] }), null);
    // Etiketsiz: Türkçe katlama — "İNCELME" de yakalanıyor.
    assert.ok(closedBy(RULES, on, { name: 'Bölgesel İNCELME' }));
    assert.equal(closedBy(RULES, {}, { name: 'Lazer epilasyon' }), null);
    assert.equal(foldTr('ZAYIFLAMA'), 'zayiflama');
    assert.equal(closedReason({ label: 'Hamilelik', note: 'gebelikte uygulanmaz' }), 'Hamilelik · gebelikte uygulanmaz');
    assert.equal(blockLabel('medikal'), 'Medikal');
    assert.equal(blockLabel('ic_bakim'), 'İc bakim');
});

// ── Sektör alanları ─────────────────────────────────────────────────────────

test('sektör alanları masaüstünün şablonuyla AYNI (kopya kilitli)', () => {
    for (const [sector, defs] of Object.entries(SECTOR_CUSTOMER_FIELDS)) {
        const block = desktopProfiles.slice(desktopProfiles.indexOf(`\n    ${sector}: {`));
        const end = block.indexOf('\n    },\n');
        const desktop = [...block.slice(0, end).matchAll(/\{ entity: 'customer', key: '(\w+)', label: '([^']+)', type: '(\w+)'/g)]
            .map((m) => [m[1], m[2], m[3]]);
        assert.deepEqual(defs.map((d) => [d.key, d.label, d.type]), desktop, sector);
    }
});

test('ızgara yalnız dolu alanlar; bayrak üreten alan TEKRARLANMIYOR', () => {
    const cells = customerFieldCells('guzellik', { cilt_tipi: 'Karma', alerji: '', hamilelik: true }, ['hamilelik']);
    assert.deepEqual(cells, [{ label: 'Cilt tipi', value: 'Karma' }]);
    assert.deepEqual(customerFieldCells('berber', { x: 1 }), []);
    assert.deepEqual(customerFieldCells('gelinlikci', { dugun_tarihi: '2026-10-04' }), [{ label: 'Düğün tarihi', value: '4 Eki 2026' }]);
});

// ── Canlı kart ──────────────────────────────────────────────────────────────

const BASE = {
    customer: {
        id: 'c1', name: 'Selin Aydın', phone: '05052207146', notes: 'Hamilelik Mayıs\'ta bildirildi.',
        custom_fields: { hamilelik: true, cilt_tipi: 'Kuru' }, created_at: '2024-01-12T10:00:00Z',
    },
    riskRules: RULES,
    sector: 'guzellik',
    packages: [{ name: 'Lazer epilasyon · 6 seans', total_sessions: 6, used_sessions: 2 }],
    visits: [
        { id: 'r3', date: '2026-09-25', start_time: '14:00:00', service: 'Cilt bakımı', status: 'confirmed', staff_id: 's1' },
        { id: 'r2', date: '2026-08-02', start_time: '10:00:00', service: 'Cilt bakımı', status: 'completed', staff_id: 's1' },
        { id: 'r1', date: '2026-04-11', start_time: '10:00:00', service: 'Lazer epilasyon', status: 'completed', staff_id: 's2' },
    ],
    pastVisitCount: 2,
    payments: [],
    staff: new Map([['s1', 'Selin'], ['s2', 'Deniz']]),
    todayISO: '2026-09-18',
    nowClock: '12:00',
    totalPaid: 3180,
    firstVisitISO: '2026-04-11',
};

test('kart: bayrak + kapalı çipler, kapalı paket, alanlar, sayılar', () => {
    const out = customerCardOf(BASE);
    assert.deepEqual(out.flags, [{ label: 'Hamilelik', note: 'gebelikte uygulanmaz' }]);
    assert.deepEqual(out.closed, ['Lazer', 'Medikal']);
    // Parası ödenmiş hak: satır silinmiyor, KAPALI.
    assert.equal(out.packages[0].closedBy, 'Hamilelik');
    assert.deepEqual(out.fields, [{ label: 'Cilt tipi', value: 'Kuru' }]);
    assert.equal(out.since, 'Ocak 2024’ten beri');
    assert.equal(out.visitCount, 2);
    assert.equal(out.totalPaid, 3180);
    assert.equal(out.upcomingId, 'r3');
    assert.equal(out.topService, 'Cilt bakımı');
    assert.equal(out.notesText, 'Hamilelik Mayıs\'ta bildirildi.');
});

test('sıklık bir ziyaretten ÇIKMAZ; kayıt günü değil ilk ziyaret', () => {
    assert.equal(frequencyText('2026-04-11', '2026-09-18', 1), null);
    assert.equal(frequencyText(null, '2026-09-18', 5), null);
    assert.equal(frequencyText('2026-04-11', '2026-09-18', 6), '27 günde bir'); // 160 gün ÷ 6
    assert.equal(sinceText('2026-09-18T09:00:00', '2026-09-18'), 'Bugün kaydedildi');
    assert.equal(sinceText('2023-03-02T09:00:00', '2026-09-18'), 'Mart 2023’ten beri');
    assert.equal(sinceText('2026-02-02T09:00:00', '2026-09-18'), 'Şubat 2026’dan beri');
    assert.equal(sinceText(null, '2026-09-18'), null);
});

test('tüm geçmiş: ay başlıklı, tutar yalnız bağlı tahsilat varsa', () => {
    const groups = fullHistoryOf({
        visits: [
            { id: 'a', date: '2026-08-14', service: 'Cilt bakımı', staff_id: 's1' },
            { id: 'b', date: '2025-12-02', service: '', staff_id: null },
        ],
        payments: [{ reservation_id: 'a', amount: 400 }, { reservation_id: 'a', amount: 250 }],
        staff: new Map([['s1', 'Selin']]),
        todayISO: '2026-09-18',
    });
    assert.deepEqual(groups.map((g) => g.month), ['Ağustos 2026', 'Aralık 2025']);
    assert.equal(groups[0].rows[0].amount, 650);
    assert.equal(groups[1].rows[0].amount, null);
    assert.equal(groups[1].rows[0].date, '2 Ara 2025');
    assert.equal(groups[1].rows[0].service, 'Randevu');
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('ölü kontrol yok: her hedef bir yere gidiyor', () => {
    assert.match(route, /onOpenUpcoming=\{\(id\) => router\.push\(\{ pathname: '\/randevu\/\[id\]', params: \{ id \} \}\)\}/);
    assert.match(route, /onEditNote=\{\(\) => setNoting\(true\)\}/);
    assert.match(route, /pathname: '\/\(manager-flow\)\/musteri-gecmis'/);
    // Geçmiş yoksa düğme yok; tahsilat yok. "Paket sat" Müdür 35'le geldi
    // ve yalnız satış açık sektörde, ekranı varken çiziliyor.
    assert.match(card, /\{visits > 0 && onOpenHistory \? \(/);
    assert.doesNotMatch(card, /Tahsil et/);
    assert.match(card, /\{canSell && onSellPackage \? \(/);
    assert.match(route, /pathname: '\/\(manager-flow\)\/paket-sat'/);
    // v1'in süsleri kalktı.
    assert.doesNotMatch(card, /HeroGradient|Monogram|HeroGlass|Plates/);
});

test('risk bloğu kaydırmasız görünür yerde, bir kez girer, tek düğüm okunur', () => {
    assert.ok(card.indexOf('UYARI · HİZMET KAPALI') < card.indexOf('HESAP'));
    assert.match(card, /accessibilityLabel=\{riskSpeech\}/);
    assert.doesNotMatch(card, /Animated\.loop|withRepeat/);
    assert.doesNotMatch(card, /useNativeDriver: false|textTransform/);
});

test('telefon yoksa haplar çizilmez, yokluk söyleniyor', () => {
    assert.match(card, /\{phone && onCall \? <Tap label="Ara"/);
    assert.match(card, /\{phone \?\? 'telefon yok'\}/);
});

test('bilinmeyen tutar yazılmaz; "Borç yok" da uydurulmuyor', () => {
    assert.doesNotMatch(card, /Borç yok/);
    assert.match(card, /card\.totalPaid != null && visits > 0/);
});

test('not: masaüstünün alanına yazılıyor, başarısızsa metin kaybolmuyor', () => {
    assert.match(write, /\.from\('customers'\)\s*\.update\(\{ notes: clean \|\| null \}\)/);
    assert.match(write, /if \(!data \|\| data\.length === 0\) return \{ ok: false, kind: 'stale' \};/);
    assert.match(sheet, /Not kaydedilemedi\. Metin burada duruyor/);
    assert.doesNotMatch(sheet, /Kaydedildi|kaydedildi!/);
});

test('randevu anı kartın sözünü tutuyor: kapalı hizmet basılamaz', () => {
    assert.match(flow, /closedBy\(context\.settings\.riskRules, draft\.customer\.fields, service\)/);
    assert.match(flow, /<ClosedServiceRow key=\{service\.id\}/);
    // Müşteri değişince kapalı kalan seçim düşüyor.
    assert.match(flow, /service: null \} : \{ customer, newCustomerName: null \}/);
    const parts = strip(read('src/components/ApptParts.tsx'));
    const row = parts.slice(parts.indexOf('export function ClosedServiceRow'), parts.indexOf('export function NoteRow'));
    assert.doesNotMatch(row, /Pressable|onPress/);
    assert.match(row, /KAPALI/);
});
