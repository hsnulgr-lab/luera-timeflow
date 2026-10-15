import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    keepServiceFor, openPlansOf, packageHint, planMeta, planOption, planServiceOf, plansFor, priceLabel,
    PLAN_MINUTES,
} from '../mobile/src/lib/createPackage.ts';
import { insertRowOf } from '../mobile/src/lib/createLive.ts';
import { formatPrice } from '../mobile/src/lib/createFlow.ts';
import { kasaOnlyReason, ticketsOf } from '../mobile/src/lib/cashBuild.ts';

/**
 * 1.0.1 · PAKETTEN RANDEVU (2026-10-16, telefon turu).
 *
 * Kusur: paket satılıyor, telefondan randevu veriliyor — paket hiç azalmıyor.
 * Telefonun randevusu `custom_fields.paket_plan_id` taşımıyordu; `visit.finish`
 * hakkı yalnız o bağdan düşürüyor, Kasa hizmeti yalnız o bağla ₺0 sayıyor.
 *
 * Karar (kullanıcı): paket GÖRÜNÜR, seçmek müdürde — kendiliğinden seçilmez.
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const MASAJ = { id: 's1', name: 'Aromaterapi Masajı', minutes: 50, price: 2200, color: '#8E7CC3', tags: ['masaj'] };
const KESIM = { id: 's2', name: 'Saç kesimi', minutes: 45, price: 450, color: '#7E93A8', tags: [] };
const PLAN_ROW = {
    id: 'p1', customer_id: 'c1', title: 'Aromaterapi Masajı', status: 'active',
    session_count: 4, sessions_done: 0, created_at: '2026-10-15T10:00:00Z',
};

// ── Okuma ───────────────────────────────────────────────────────────────────

test('hakkı kalan, aktif, adlı paket seçenek oluyor; gerisi olmuyor', () => {
    const plans = openPlansOf([
        PLAN_ROW,
        { ...PLAN_ROW, id: 'p2', sessions_done: 4 },                 // tükenmiş
        { ...PLAN_ROW, id: 'p3', status: 'proposed' },               // teklif
        { ...PLAN_ROW, id: 'p4', status: 'completed', sessions_done: 1 },
        { ...PLAN_ROW, id: 'p5', title: '   ' },                     // adsız
        { ...PLAN_ROW, id: 'p6', session_count: null, sessions_done: null }, // tek seans
    ]);
    assert.deepEqual(plans.map((plan) => plan.id), ['p1', 'p6']);
    assert.deepEqual(plans[0], { id: 'p1', customerId: 'c1', title: 'Aromaterapi Masajı', total: 4, done: 0 });
    assert.equal(plans[1].total, 1);
});

test('paketler müşteriye göre; yeni müşterinin paketi yok', () => {
    const plans = openPlansOf([PLAN_ROW, { ...PLAN_ROW, id: 'p9', customer_id: 'c2' }]);
    assert.deepEqual(plansFor(plans, 'c1').map((plan) => plan.id), ['p1']);
    assert.deepEqual(plansFor(plans, null), []);
    assert.deepEqual(plansFor(plans, undefined), []);
});

// ── Seçenek ─────────────────────────────────────────────────────────────────

test('paketin hizmeti: önce birebir ad, sonra "içeriyor" kuralı', () => {
    const MASAJ_KISA = { ...MASAJ, id: 's0', name: 'Masaj', minutes: 30 };
    assert.equal(planServiceOf('Aromaterapi Masajı', [MASAJ_KISA, MASAJ]).id, 's1');
    assert.equal(planServiceOf('aromaterapi masajı', [KESIM, MASAJ]).id, 's1');
    assert.equal(planServiceOf('Masaj 10 seans', [KESIM, MASAJ_KISA]).id, 's0');
    assert.equal(planServiceOf('Lazer', [KESIM, MASAJ]), null);
});

test('paket seçeneği ₺0, süre paketin hizmetinden, bağ "1/4"', () => {
    const [plan] = openPlansOf([{ ...PLAN_ROW, sessions_done: 1 }]);
    const option = planOption(plan, [KESIM, MASAJ]);
    assert.equal(option.name, 'Aromaterapi Masajı');
    assert.equal(option.price, 0);
    assert.equal(option.minutes, 50);
    assert.equal(option.color, '#8E7CC3');
    assert.deepEqual(option.tags, ['masaj']);
    assert.notEqual(option.id, MASAJ.id, 'paket seçimi aynı adlı hizmetin seçimiyle karışmaz');
    assert.deepEqual(option.plan, { id: 'p1', customerId: 'c1', seans: '2/4', left: 3 });
    assert.equal(planMeta(option), 'kalan 3 seans · ₺0');
});

test('hizmeti bulunmayan paket masaüstünün varsayılan süresiyle', () => {
    const [plan] = openPlansOf([{ ...PLAN_ROW, title: 'Lazer 8 seans' }]);
    const option = planOption(plan, [KESIM]);
    assert.equal(option.minutes, PLAN_MINUTES);
    assert.equal(PLAN_MINUTES, 60);
    assert.ok(option.color);
});

// ── Kayıt: bağ randevunun üstünde ───────────────────────────────────────────

const BASE = {
    customerId: 'c1', customerName: 'Pınar Aksoy', customerPhone: '0532 111 22 33',
    dateISO: '2026-10-16', startMinutes: 11 * 60, staffId: 'st1', note: null,
};

test('paketten randevu custom_fields ile pakete bağlanıyor — masaüstünün iki alanı', () => {
    const [plan] = openPlansOf([PLAN_ROW]);
    const row = insertRowOf({ ...BASE, service: planOption(plan, [MASAJ]) }, { userId: 'u1', organizationId: 'o1' });
    assert.deepEqual(row.custom_fields, { paket_plan_id: 'p1', paket_seans: '1/4' });
    assert.equal(row.service, 'Aromaterapi Masajı');
    assert.equal(row.end_time, '11:50:00');

    // Masaüstü aynı iki alanı yazıyor.
    const desktop = read('src/components/beauty/BeautySessionModal.tsx');
    assert.match(desktop, /paket_plan_id: selectedPlan\.id, paket_seans: `\$\{selectedPlan\.sessionsDone \+ 1\}\/\$\{selectedPlan\.sessionCount\}`/);
});

test('normal hizmetin satırında custom_fields YOK (kolonun varsayılanı kalır)', () => {
    const row = insertRowOf({ ...BASE, service: MASAJ }, { userId: 'u1', organizationId: 'o1' });
    assert.equal('custom_fields' in row, false);
});

test('bağın okunduğu her yer AYNI anahtarı okuyor', () => {
    const [plan] = openPlansOf([PLAN_ROW]);
    const fields = insertRowOf({ ...BASE, service: planOption(plan, [MASAJ]) }, { userId: 'u1', organizationId: 'o1' }).custom_fields;

    // Bitirince hak düşüyor (staff-api visit.finish).
    const api = read('supabase/functions/staff-api/index.ts');
    assert.match(api, /fields\.paket_plan_id === 'string' \? fields\.paket_plan_id : null/);
    assert.match(api, /consume_plan_session_for_staff/);

    // Kumanda tutarı Kasa'ya bırakıyor; Kasa hizmeti ₺0 sayıyor.
    assert.equal(kasaOnlyReason({ custom_fields: fields }, 0), 'package');
    const rows = [{
        id: 'r1', customer_id: 'c1', customer_name: 'Pınar Aksoy', service: 'Aromaterapi Masajı',
        status: 'completed', date: '2026-10-16', start_time: '11:00:00', staff_id: 'st1',
        adisyon_items: [], is_paid: false, group_id: null, custom_fields: fields,
    }];
    const catalog = [{ name: 'Aromaterapi Masajı', price: 2200 }];
    const [ticket] = ticketsOf(rows, [], catalog, true);
    assert.ok(ticket, 'adisyon oluştu');
    assert.equal(ticket.balance, 0, 'paketten seans Kasa\'da ₺0');
    // Kontrol: bağsız aynı randevu tam fiyat — bugünkü kusurun kendisi.
    const [plain] = ticketsOf([{ ...rows[0], custom_fields: {} }], [], catalog, true);
    assert.equal(plain.balance, 2200);
});

// ── Müşteri değişince ───────────────────────────────────────────────────────

test('müşteri değişince başkasının paketi düşer, normal hizmet kalır', () => {
    const [plan] = openPlansOf([PLAN_ROW]);
    const option = planOption(plan, [MASAJ]);
    assert.equal(keepServiceFor(option, 'c1'), option);
    assert.equal(keepServiceFor(option, 'c2'), null);
    assert.equal(keepServiceFor(option, null), null);
    assert.equal(keepServiceFor(KESIM, 'c2'), KESIM);
    assert.equal(keepServiceFor(null, 'c1'), null);
});

// ── Söz ─────────────────────────────────────────────────────────────────────

test('müşteri satırı paketi seçmeden söylüyor', () => {
    assert.equal(packageHint('son 2 Ağu', 1), 'son 2 Ağu · paketi var');
    assert.equal(packageHint('', 1), 'Paketi var');
    assert.equal(packageHint('son 2 Ağu', 2), 'son 2 Ağu · 2 paketi var');
    assert.equal(packageHint('son 2 Ağu', 0), 'son 2 Ağu');
});

test('özet çubuğunun tutarı: paket "₺0 · paket", fiyatsız çizgi', () => {
    const [plan] = openPlansOf([PLAN_ROW]);
    assert.equal(priceLabel(planOption(plan, [MASAJ]), formatPrice), '₺0 · paket');
    assert.equal(priceLabel(MASAJ, formatPrice), '₺2.200');
    assert.equal(priceLabel({ ...MASAJ, price: null }, formatPrice), '—');
    assert.equal(priceLabel(null, formatPrice), '—');
});

// ── Ekran ve okuma ──────────────────────────────────────────────────────────

const flow = strip(read('mobile/src/components/CreateFlow.tsx'));
const hooks = strip(read('mobile/src/lib/managerCreate.ts'));
const source = strip(read('mobile/src/lib/managerSource.ts'));

test('salonun açık paketleri tek turda, yalnız paket türü ve aktif', () => {
    const fn = source.slice(source.indexOf('export async function fetchOpenPlans'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    assert.match(body, /from\('treatment_plans'\)/);
    assert.match(body, /\.eq\('plan_kind', 'paket'\)/);
    assert.match(body, /\.eq\('status', 'active'\)/);
    assert.match(body, /\.eq\('organization_id', organizationId\)/);
});

test('bağlam paketleri okuyor; paket motoru olmayan sektörde boş, okunamazsa null', () => {
    assert.match(hooks, /fetchOpenPlans\(\)\.catch\(/);
    assert.match(hooks, /if \(cause instanceof OrgError\) throw cause;/);
    assert.match(hooks, /packages: !packagesEnabledFor\(settings\.sector\) \? \[\] : plans === null \? null : openPlansOf\(plans\)/);
});

test('ekran paketi gösteriyor ama KENDİLİĞİNDEN SEÇMİYOR', () => {
    assert.match(flow, /<SectionHead title="Paketten"/);
    assert.match(flow, /<PackageRow[\s\S]*?selected=\{draft\.service\?\.id === option\.id\}/);
    // Paket seçeneği yalnız dokunuşla taslağa giriyor: başka hiçbir yerde
    // `service: option` ya da `planOption(...)` taslağa yazılmıyor.
    assert.equal((flow.match(/service: draft\.service\?\.id === option\.id \? null : option/g) ?? []).length, 1);
    assert.doesNotMatch(flow, /service:\s*packageOptions\[/);
    assert.doesNotMatch(flow, /service:\s*planOption\(/);
});

test('müşteri değişince ve temizlenince paket seçimi düşüyor', () => {
    assert.match(flow, /const kept = keepServiceFor\(draft\.service, customer\.id\);/);
    assert.equal((flow.match(/service: keepServiceFor\(draft\.service, null\)/g) ?? []).length, 2);
    assert.match(flow, /hint=\{hintOf\(customer\)\}/);
    assert.match(flow, /context\.packages === null/);
});
