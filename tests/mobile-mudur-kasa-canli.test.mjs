import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import {
    adisyonLines, catalogOf, GENERAL_CUSTOMER, packagesEnabledFor, periodRange, serviceLines,
    sumBetween, ticketsOf, toMovements,
} from '../mobile/src/lib/cashBuild.ts';
import { counterLine, movementSpeech, staffLine, totalsOf } from '../mobile/src/lib/cash.ts';
import { buildFlow } from '../mobile/src/lib/flowBuild.ts';
import { pendingOf, sortFlow } from '../mobile/src/lib/managerFlow.ts';

/**
 * MÜDÜR · KASA CANLIYA BAĞLANDI (plan 6. adım).
 *
 * Ölçü masaüstü Kasa. Telefondaki toplam, bekleyen adisyon sayısı ve kalan
 * tutar masaüstündekiyle aynı olmalı — iki ekran iki farklı borç söylerse
 * müdür hangisine inanacağını bilemez.
 *
 * İkinci ağır kural: Kasa telefonda SALT OKUNUR. Veritabanında iptal izi yok;
 * yerel "iptal" yenilenince geri geliyordu (kullanıcı kararı, 2026-09-16).
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const screen = strip(read('mobile/app/mudur/cash.tsx'));
const sheets = strip(read('mobile/src/components/CashSheets.tsx'));
const parts = strip(read('mobile/src/components/CashParts.tsx'));
const source = strip(read('mobile/src/lib/managerSource.ts'));
const hook = strip(read('mobile/src/lib/managerCash.ts'));
const day = strip(read('mobile/src/lib/managerFlowDay.ts'));
const store = strip(read('mobile/src/state/managerDay.tsx'));
const pure = read('mobile/src/lib/cashBuild.ts');
const desktop = read('src/pages/BeautyCashRegister.tsx');
const desktopTickets = read('src/lib/salonCashTickets.ts');

const GUN = '2026-09-16';
const res = (over = {}) => ({
    id: 'r1', customer_id: 'c1', customer_name: 'Zeynep Kaya', customer_phone: '+905321110402',
    date: GUN, start_time: '10:00:00', end_time: '11:00:00', service: 'Saç boyama',
    status: 'completed', staff_id: 's1', is_paid: false, group_id: null, custom_fields: null,
    adisyon_items: [], service_ended_at: `${GUN}T08:05:00.000Z`, ...over,
});
const pay = (over = {}) => ({
    id: 'p1', reservation_id: 'r1', customer_id: 'c1', staff_id: 's1', type: 'service',
    description: 'Saç boyama', amount: 1900, method: 'cash', paid_at: new Date(2026, 8, 16, 11, 12).toISOString(),
    ...over,
});
const CATALOG = [{ id: 'svc-boya', name: 'Saç boyama', price: 1900 }, { name: 'Fön', price: 350 }];

// ── Kalan tutar: masaüstünün balanceOf'u ────────────────────────────────────

test('kalan = hizmet + adisyon − indirim − alınan tahsilat', () => {
    const [ticket] = ticketsOf([
        res({
            custom_fields: { cash_discount_amount: 100 },
            adisyon_items: [
                { id: 'a', name: 'Bakım yağı', price: 250, qty: 1 },
                { id: 'b', name: 'Oksidan', price: 0, qty: 3 },
            ],
        }),
    ], [pay({ amount: 500 })], CATALOG, false);
    // 1900 + 250 − 100 − 500 (kapora)
    assert.equal(ticket.balance, 1550);
    assert.equal(ticket.key, 'reservation:r1');
});

test('kalan eksiye düşmüyor — fazla tahsilat borç üretmiyor', () => {
    const [ticket] = ticketsOf([res()], [pay({ amount: 5000 })], CATALOG, false);
    assert.equal(ticket.balance, 0);
});

test('masaüstü de aynı dört parçayı kullanıyor', () => {
    // Kural uydurulmadı: kaynağındaki satırlar hâlâ orada mı.
    const balance = desktop.slice(desktop.indexOf('const balanceOf'), desktop.indexOf('const removeExtra'));
    assert.match(balance, /coveringPlanId\(member\)/);
    assert.match(balance, /reservationPrice\(member/);
    assert.match(balance, /item\.price/);
    assert.match(balance, /savedDiscountOf/);
    assert.match(balance, /Math\.max\(0, gross - savedDiscount - already\)/);
    // Adisyon kalemi adetle ÇARPILMIYOR — telefon da çarpmıyor.
    assert.doesNotMatch(balance, /item\.qty/);
    assert.equal(adisyonLines([{ name: 'Şampuan', price: 200, qty: 2 }])[0].amount, 200);
});

test('pakete dahil seans YALNIZ paket sektöründe ücretsiz', () => {
    const covered = res({ custom_fields: { paket_plan_id: 'plan-1' } });
    assert.equal(ticketsOf([covered], [], CATALOG, packagesEnabledFor('kuafor'))[0].balance, 0);
    assert.equal(ticketsOf([covered], [], CATALOG, packagesEnabledFor('guzellik'))[0].balance, 0);
    // Berberde paket motoru yok: `paket_plan_id` taşısa da ücret sayılıyor.
    assert.equal(ticketsOf([covered], [], CATALOG, packagesEnabledFor('berber'))[0].balance, 1900);
    assert.equal(packagesEnabledFor(undefined), false);
});

test('çoklu hizmet ücreti custom_fields.hizmetler’den okunuyor', () => {
    const multi = res({
        service: 'Saç boyama + Fön',
        custom_fields: { hizmetler: JSON.stringify([{ name: 'Saç boyama', price: 1700 }, { name: 'Fön' }]) },
    });
    // Birinci kalem kendi fiyatını taşıyor, ikincisi katalogdan.
    assert.deepEqual(serviceLines(multi, CATALOG).map((l) => l.amount), [1700, 350]);
    // Kayıt yoksa birleşik ad ayrıştırılıyor.
    assert.deepEqual(serviceLines(res({ service: 'Saç boyama + Fön' }), CATALOG).map((l) => l.amount), [1900, 350]);
    // Bozuk katalog kaydı fiyat üretmiyor.
    assert.deepEqual(
        catalogOf([{ name: '' }, { name: 'Kesim', price: 'x' }, null]),
        [{ id: undefined, name: 'Kesim', price: undefined, duration: undefined, color: undefined }],
    );
    // NUMERIC metin olarak gelebiliyor; boş fiyat SIFIR sayılmıyor.
    assert.equal(catalogOf([{ name: 'Fön', price: '350.00' }])[0].price, 350);
    assert.equal(catalogOf([{ name: 'Fön', price: null }])[0].price, undefined);
});

// ── Grup tek adisyon ────────────────────────────────────────────────────────

test('grup randevusu TEK adisyon — kalanı üyelerin toplamı', () => {
    const tickets = ticketsOf([
        res({ id: 'g1', group_id: 'G', start_time: '10:00:00' }),
        res({ id: 'g2', group_id: 'G', start_time: '11:00:00', service: 'Fön', staff_id: 's2' }),
    ], [pay({ reservation_id: 'g2', amount: 100 })], CATALOG, false);
    assert.equal(tickets.length, 1);
    assert.equal(tickets[0].key, 'group:G');
    assert.equal(tickets[0].representative.id, 'g1');
    assert.equal(tickets[0].balance, 1900 + 350 - 100);
});

test('grubun bir üyesi bitmediyse adisyon kasaya düşmemiş', () => {
    const tickets = ticketsOf([
        res({ id: 'g1', group_id: 'G' }),
        res({ id: 'g2', group_id: 'G', status: 'confirmed' }),
    ], [], CATALOG, false);
    assert.equal(tickets.length, 0);
    // Masaüstünün aynı kuralı.
    assert.match(desktopTickets, /members\.some\(\(member\) => member\.status !== 'completed'\)\) continue;/);
});

test('iptal üye grubu bekletmiyor; tümü ödenmiş grup kapalı', () => {
    assert.equal(ticketsOf([
        res({ id: 'g1', group_id: 'G' }),
        res({ id: 'g2', group_id: 'G', status: 'cancelled' }),
    ], [], CATALOG, false)[0].balance, 1900);
    assert.equal(ticketsOf([res({ is_paid: true })], [], CATALOG, false).length, 0);
});

test('aynı satır iki sorgudan gelse de bir kez sayılıyor', () => {
    const twice = [res({ id: 'g1', group_id: 'G' }), res({ id: 'g1', group_id: 'G' })];
    assert.equal(ticketsOf(twice, [], CATALOG, false)[0].balance, 1900);
});

// ── Dönem ───────────────────────────────────────────────────────────────────

test('bugün: dünün AYNI saatine kadarıyla kıyaslanıyor', () => {
    const now = new Date(2026, 8, 16, 11, 30).getTime();
    const range = periodRange('today', now);
    assert.equal(range.from, new Date(2026, 8, 16).getTime());
    assert.equal(range.prevFrom, new Date(2026, 8, 15).getTime());
    assert.equal(range.prevTo, new Date(2026, 8, 15, 11, 30).getTime());
    assert.equal(range.to, now);
});

test('hafta Pazartesi başlıyor — Pazar günü de', () => {
    // 20 Eylül 2026 Pazar: hafta 14 Eylül Pazartesi'den.
    const sunday = new Date(2026, 8, 20, 18, 0).getTime();
    const range = periodRange('week', sunday);
    assert.equal(range.from, new Date(2026, 8, 14).getTime());
    assert.equal(range.prevFrom, new Date(2026, 8, 7).getTime());
});

test('ay: önceki ayın sonunu aşmıyor', () => {
    // 31 Ekim → önceki ay Eylül 30 gün; karşılaştırma Eylül'ün TAMAMI, Ekim'e taşmıyor.
    const range = periodRange('month', new Date(2026, 9, 31, 20, 0).getTime());
    assert.equal(range.prevFrom, new Date(2026, 8, 1).getTime());
    assert.equal(range.prevTo, new Date(2026, 9, 1).getTime());
});

test('dönem sınırındaki tahsilat iki döneme birden sayılmıyor', () => {
    const midnight = new Date(2026, 8, 16).getTime();
    const rows = [{ amount: 100, paid_at: new Date(midnight).toISOString() }];
    assert.equal(sumBetween(rows, midnight - 86_400_000, midnight), 0);
    assert.equal(sumBetween(rows, midnight, midnight + 1), 100);
});

// ── Hareketler ──────────────────────────────────────────────────────────────

const lookup = (over = {}) => ({
    reservations: new Map([['r1', res({ adisyon_items: [{ name: 'Fön', price: 350 }] })]]),
    customers: new Map([['c1', 'Zeynep Kaya']]),
    staff: new Map([['s1', 'Merve'], ['s2', 'Selin']]),
    services: CATALOG,
    ...over,
});

test('hareket: en yeni üstte, durum hep normal, yöntem bilinmiyorsa diğer', () => {
    const list = toMovements([
        pay({ id: 'eski', paid_at: new Date(2026, 8, 16, 9, 30).toISOString(), method: 'crypto' }),
        pay({ id: 'yeni', paid_at: new Date(2026, 8, 16, 11, 12).toISOString() }),
    ], lookup());
    assert.deepEqual(list.map((m) => m.id), ['yeni', 'eski']);
    assert.equal(list[0].time, '11:12');
    assert.equal(list[0].dateLabel, '16 Eylül 2026, 11:12');
    assert.equal(list[0].range, '10:00–11:00');
    assert.ok(list.every((m) => m.status === 'normal'));
    assert.equal(list[1].method, 'other');
});

test('kalem dökümü YALNIZ toplamı tahsilatı tutuyorsa', () => {
    const [full] = toMovements([pay({ amount: 2250 })], lookup());
    assert.deepEqual(full.lines, [{ name: 'Saç boyama', amount: 1900 }, { name: 'Fön', amount: 350 }]);
    // İndirimli / kaporalı tahsilat dökümü bozuyor — döküm hiç verilmiyor.
    const [partial] = toMovements([pay({ amount: 2000 })], lookup());
    assert.equal(partial.lines, undefined);
});

test('müşteri adı: kayıt → randevu → "Genel müşteri"', () => {
    const [known] = toMovements([pay()], lookup({ customers: new Map([['c1', 'Zeynep Aydın']]) }));
    assert.equal(known.customer, 'Zeynep Aydın');
    const [deleted] = toMovements([pay()], lookup({ customers: new Map() }));
    assert.equal(deleted.customer, 'Zeynep Kaya');
    const [walk] = toMovements([pay({ reservation_id: null, customer_id: null, description: null, type: 'product' })], lookup());
    assert.equal(walk.customer, GENERAL_CUSTOMER);
    assert.equal(walk.service, 'Ürün');
    assert.equal(walk.range, undefined);
});

test('personel: tahsilatın kaydı, yoksa randevununki; bilinmiyorsa boş', () => {
    assert.equal(toMovements([pay({ staff_id: 's2' })], lookup())[0].staff, 'Selin');
    assert.equal(toMovements([pay({ staff_id: null })], lookup())[0].staff, 'Merve');
    assert.equal(toMovements([pay({ staff_id: 'yok' })], lookup())[0].staff, '');
});

test('kart "verdi" diyor, "aldı" değil — ve boş isimle satır yazmıyor', () => {
    assert.equal(staffLine({ staff: 'Merve' }), 'Merve verdi');
    assert.equal(staffLine({ staff: '  ' }), null);
    assert.doesNotMatch(parts, /\{movement\.staff\} aldı/);
    assert.match(parts, /who \? \(/);
    const speech = movementSpeech({ customer: 'Genel müşteri', service: 'Ürün', time: '12:00', amount: 200, method: 'cash', staff: '', status: 'normal' });
    assert.doesNotMatch(speech, / verdi| aldı|, \./);
    assert.doesNotMatch(sheets, /label="Alan"/);
});

// ── Akış ile tek gerçek ─────────────────────────────────────────────────────

const flowRow = (over = {}) => ({
    id: 'r1', customer_id: 'c1', customer_name: 'Zeynep Kaya', customer_phone: null,
    start_time: '10:00:00', end_time: '11:00:00', service: 'Saç boyama', status: 'completed',
    staff_id: 's1', customer_arrived_at: null, arrived_at: null,
    service_ended_at: `${GUN}T08:05:00.000Z`, is_paid: false, ...over,
});
const flowInput = (over = {}) => ({
    rows: [], payments: [], crew: new Map([['s1', 'Merve']]), context: new Map(),
    dateISO: GUN, nowMs: Date.parse(`${GUN}T09:00:00.000Z`), ...over,
});

test('"tahsil edilmedi" kartı adisyonun KALANINI taşıyor — ₺0 değil', () => {
    const tickets = ticketsOf([res()], [pay({ amount: 400 })], CATALOG, false);
    const [event] = buildFlow(flowInput({ rows: [flowRow()], tickets }));
    assert.equal(event.kind, 'due');
    assert.equal(event.amountValue, 1500);
    assert.equal(event.ticketKey, 'reservation:r1');
    // Adisyonu bilinmeyen satırda tutar UYDURULMUYOR.
    const [bare] = buildFlow(flowInput({ rows: [flowRow()] }));
    assert.equal(bare.amountValue, undefined);
});

test('dünden kalan adisyon akışa "dünden kaldı" kartı olarak düşüyor', () => {
    const yesterday = '2026-09-15';
    const tickets = ticketsOf([
        res({ id: 'old', date: yesterday, service_ended_at: `${yesterday}T16:40:00.000Z`, customer_name: 'Sibel Acar' }),
    ], [], CATALOG, false);
    const events = sortFlow(buildFlow(flowInput({ rows: [flowRow({ status: 'confirmed', start_time: '15:00:00', end_time: '16:00:00' })], tickets })));
    const carried = events.find((e) => e.carriedOver);
    assert.ok(carried, 'devreden kart yok');
    assert.equal(carried.kind, 'due');
    assert.match(carried.time, /^Dün \d{2}:\d{2}$/);
    assert.equal(carried.amountValue, 1900);
    assert.equal(carried.appointmentId, 'old');
    assert.equal(carried.firstName, 'Sibel');
    assert.equal(carried.servedBy, 'Merve');
    // Saat biçiminde olmadığı için bugünün olaylarının ÖNÜNDE.
    assert.equal(events[0], carried);
    // Bugünün satırı ikinci kez devreden kart üretmiyor.
    assert.equal(buildFlow(flowInput({ tickets: ticketsOf([res()], [], CATALOG, false) })).length, 0);
});

test('daha eski adisyonun satırında tarih yazıyor', () => {
    const tickets = ticketsOf([res({ id: 'older', date: '2026-09-12' })], [], CATALOG, false);
    const [event] = buildFlow(flowInput({ tickets }));
    assert.match(event.time, /^12 Eylül \d{2}:\d{2}$/);
});

test('grup iki akış satırı ama Kasa panelinde TEK adisyon', () => {
    const tickets = ticketsOf([
        res({ id: 'g1', group_id: 'G' }),
        res({ id: 'g2', group_id: 'G', service: 'Fön', start_time: '11:00:00', end_time: '11:30:00' }),
    ], [], CATALOG, false);
    const events = buildFlow(flowInput({
        rows: [flowRow({ id: 'g1' }), flowRow({ id: 'g2', service: 'Fön' })],
        tickets,
    }));
    assert.equal(events.filter((e) => e.kind === 'due').length, 2);
    const pending = pendingOf(events);
    assert.equal(pending.count, 1);
    assert.equal(pending.amount, 2250);
});

test('akışın okuması adisyonları kuruyor ve sağlayıcı onları akışa veriyor', () => {
    assert.match(day, /fetchOpenTicketRows\(dateISO\)/);
    // Katalog `services` TABLOSUNDAN — `settings`te öyle bir kolon yok.
    assert.match(day, /fetchServices\(\),/);
    assert.match(day, /fetchOrgSettings\('sector, business_name'\)/);
    assert.doesNotMatch(strip(read('mobile/src/lib/managerCash.ts')) + day, /settings\?\.services|'services'\)|, services,? sector/);
    // `tags` (076) okunuyor; kolon yoksa etiketsiz okumaya düşülüyor, katalog kapanmıyor.
    assert.match(source, /from\('services'\)\s*\.select\(cols\)\s*\.eq\('organization_id', organizationId\)/);
    assert.match(source, /await read\('id, name, duration, price, color, tags'\)/);
    assert.match(source, /\(\{ data, error \} = await read\('id, name, duration, price, color'\)\);/);
    assert.match(day, /ticketsOf\(open\.rows, open\.payments, services, packagesEnabled\)/);
    assert.match(day, /tickets: \[\.\.\.grouped, \.\.\.singles\]/);
    assert.match(store, /tickets: data\.tickets,/);
});

// ── Okuma katmanı ───────────────────────────────────────────────────────────

test('1000 satırlık kesik sessizce yutulmuyor — sayfa sayfa okunuyor', () => {
    const pager = source.slice(source.indexOf('async function readAll('), source.indexOf('function chunksOf('));
    assert.match(pager, /if \(rows\.length < PAGE\) return out;/);
    assert.match(source, /const PAGE = 1000;/);
    // Dönem tahsilatları ve açık adisyonlar sayfalı; sıralama kararlı (id).
    assert.match(source, /readAll\(\(from, to\) => supabase\.from\('payments'\)[\s\S]*?\.order\('paid_at'\)\.order\('id'\)\s*\.range\(from, to\)/);
    assert.match(source, /readAll\(\(from, to\) => supabase\.from\('reservations'\)[\s\S]*?\.order\('id'\)\s*\.range\(from, to\)/);
});

test('uzun kimlik listeleri parça parça soruluyor', () => {
    assert.match(source, /const IN_CHUNK = 120;/);
    for (const col of ["'id'", "'group_id'", "'reservation_id'"]) {
        assert.match(source, new RegExp(`\\.in\\(${col}, chunk\\)`), col);
    }
});

test('Kasa sorgularının hepsi org süzgeçli', () => {
    const cash = source.slice(source.indexOf('const PAGE = 1000;'), source.indexOf('export async function fetchDayContext'));
    const froms = cash.match(/\.from\('\w+'\)/g) ?? [];
    const orgs = cash.match(/\.eq\('organization_id', organizationId\)/g) ?? [];
    assert.ok(froms.length >= 5, 'Kasa okumaları bulunamadı');
    assert.equal(orgs.length, froms.length);
});

test('bekleyen pencere masaüstünün 90 günü; masaüstünün 500 kesiği TAKLİT edilmiyor', () => {
    assert.match(source, /export const OPEN_TICKET_WINDOW_DAYS = 90;/);
    const open = source.slice(source.indexOf('export async function fetchOpenTicketRows'), source.indexOf('export async function fetchCashPayments'));
    assert.match(open, /\.eq\('status', 'completed'\)/);
    assert.match(open, /\.eq\('is_paid', false\)/);
    assert.doesNotMatch(open, /\.limit\(/);
    assert.match(read('src/hooks/useReservations.ts'), /ninetyDaysAgo\.getDate\(\) - 90/);
});

test('arşivlenmiş müşterinin geçmiş tahsilatında adı kaybolmuyor', () => {
    const cash = source.slice(source.indexOf('export async function fetchCashPayments'), source.indexOf('export async function fetchDayContext'));
    assert.match(cash, /from\('customers'\)\.select\('id, name'\)\s*\.eq\('organization_id', organizationId\)\.in\('id', chunk\)\s*\.returns/);
    assert.doesNotMatch(cash, /is_active/);
});

test('tolerans kolonu yoksa akış düşmüyor — yalnız 42703 yutuluyor', () => {
    const fn = source.slice(source.indexOf('export async function fetchArrivalTolerance'), source.indexOf('const UNDEFINED_COLUMN'));
    assert.match(fn, /=== UNDEFINED_COLUMN\) return null;\s*throw cause;/);
    assert.match(source, /const UNDEFINED_COLUMN = '42703';/);
    assert.match(day, /fetchArrivalTolerance\(\),/);
    assert.doesNotMatch(day, /arrival_tolerance_min/);
});

test('olmayan kolon istenmiyor — customers.deleted_at YOK', () => {
    // 009 arşivi `is_active` ile yapıyor. `deleted_at` hiçbir migration'da
    // yok; istenirse PostgREST 42703 döner ve okuma bütünüyle düşer.
    const migrations = readdirSync(new URL('../supabase/', import.meta.url))
        .filter((name) => name.endsWith('.sql'))
        .map((name) => read(`supabase/${name}`)).join('\n');
    assert.doesNotMatch(migrations, /customers[^;]*add column (if not exists )?deleted_at/i);
    assert.doesNotMatch(source, /deleted_at/);
});

test('saf katman React, Expo ve Supabase taşımıyor', () => {
    assert.doesNotMatch(pure, /from 'react|from 'expo|supabase/);
});

// ── Ekran ───────────────────────────────────────────────────────────────────

test('ekran sahte veriyi OKUMUYOR', () => {
    assert.doesNotMatch(screen, /mockMovements|mockPrevious|mockPending/);
    assert.match(screen, /useManagerCash\(period\)/);
    assert.match(hook, /periodRange\(period, Date\.now\(\)\)/);
    assert.match(hook, /previousTotal: sumBetween\(cash\.payments, range\.prevFrom, range\.prevTo\)/);
});

test('başka döneme ait veri seçili dönemin başlığı altına yazılmıyor', () => {
    assert.match(screen, /const known = cash\.data\.period === period;/);
    assert.match(screen, /const movements = known \? cash\.data\.movements : NO_MOVEMENTS;/);
    assert.match(screen, /const delta = known \? deltaOf\(totals\.total, cash\.data\.previousTotal, period\) : null;/);
    assert.match(screen, /<HeroAmount value=\{known \? totals\.total : null\}/);
});

test('okunamadı ≠ tahsilat yok', () => {
    // Red, okuma hatası ve boş dönem üç ayrı çizim.
    const list = screen.slice(screen.indexOf('{refusal ? ('), screen.indexOf('movements.map('));
    assert.ok(list.indexOf('<DurumBlock') < list.indexOf('<DurumUnread'));
    assert.ok(list.indexOf('<DurumUnread') < list.indexOf('EMPTY_TITLE'));
    assert.match(list, /!known && cash\.state === 'error' \? \(/);
    assert.match(list, /!known \? null : movements\.length === 0/);
    assert.match(screen, /cash\.state === 'error' \? 'okunamadı' : '…'/);
    assert.match(counterLine(totalsOf([])), /^0 işlem$/);
});

test('bayat okuma sayaçta saatle görünüyor', () => {
    assert.match(screen, /cash\.stale && cash\.at !== null/);
    assert.match(screen, /son güncelleme \$\{clockAt\(cash\.at\)\}/);
});

test('yenileme çarkı iki okuma bitmeden durmuyor', () => {
    assert.match(screen, /Promise\.all\(\[reloadCash\(\), reload\(\)\]\)\.finally\(\(\) => setRefreshing\(false\)\)/);
});

test('fiş salt okunur: eylem şeridi yok, yerinde nerede yapılacağı yazıyor', () => {
    assert.match(sheets, /\) : !onVoid \? null : \(/);
    assert.match(sheets, /\{onVoid \? CORRECTION_NOTE : READ_ONLY_NOTE\}/);
    assert.match(read('mobile/src/lib/cash.ts'), /READ_ONLY_NOTE = 'Düzeltme ve iptal masaüstündeki Kasa\\'dan yapılır\.'/);
});

test('müşteri kartı bağlantısı ölü değil — hedefi yoksa çizilmiyor', () => {
    assert.match(sheets, /\{onOpenCustomer \? \(/);
    assert.match(sheets, /onPress=\{\(\) => close\(onOpenCustomer\)\}/);
});
