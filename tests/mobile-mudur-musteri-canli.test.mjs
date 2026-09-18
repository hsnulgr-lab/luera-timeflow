import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { cardRisk, customerCardOf, HISTORY_ROWS, shortDate } from '../mobile/src/lib/customerCardLive.ts';
import { customerPlates, heroWarns, trayReminder } from '../mobile/src/lib/customerCard.ts';

/**
 * MÜDÜR 23 · MÜŞTERİ KARTI CANLIYA BAĞLANDI.
 *
 * Kart dört sahte müşteriden besleniyordu; canlı kipte her gerçek müşteri
 * için "Müşteri bulunamadı" yazıyordu. Planın on adımında yoktu — 9. adımdan
 * sonra müdürün müşteriye nasıl ulaştığına bakılırken bulundu.
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const route = strip(read('mobile/app/(staff-flow)/customer.tsx'));
const source = strip(read('mobile/src/lib/managerSource.ts'));
const pure = read('mobile/src/lib/customerCardLive.ts');

const TODAY = '2026-09-16';
const base = (over = {}) => ({
    customer: { id: 'c1', name: 'Zeynep Kaya', phone: '05321112233', notes: null, custom_fields: null },
    riskRules: [],
    packages: [],
    visits: [],
    pastVisitCount: 0,
    payments: [],
    staff: new Map([['s1', 'Merve'], ['s2', 'Selin']]),
    todayISO: TODAY,
    nowClock: '11:00',
    ...over,
});
const visit = (id, date, start, status = 'completed', staff = 's1', service = 'Kesim') =>
    ({ id, date, start_time: `${start}:00`, service, status, staff_id: staff });

test('bakiye BİLEREK boş — borç satırı çizilmiyor, ₺0 yazılmıyor', () => {
    const card = customerCardOf(base());
    assert.equal(card.balance, null);
    assert.equal(heroWarns(card).some((w) => w.kind === 'debt'), false);
    assert.equal(trayReminder(card), null);
    assert.match(pure, /patientBalance\.ts/);
});

test('son geliş: bugünden önceki son ziyaret; iptal sayılmıyor; ziyaret no ayrı sayımdan', () => {
    const card = customerCardOf(base({
        visits: [
            visit('v3', '2026-09-10', '10:00', 'cancelled', 's2'),
            visit('v2', '2026-08-02', '14:00', 'completed', 's2'),
            visit('v1', '2026-07-01', '10:00'),
        ],
        pastVisitCount: 212,
    }));
    assert.deepEqual(card.lastVisit, { date: '2 Ağu', visitNo: 212, staff: 'Selin' });
    const [, right] = customerPlates(card);
    assert.equal(right.sub, '212. ziyaret · Selin ile');
    assert.match(source, /select\('id', \{ count: 'exact', head: true \}\)[\s\S]*?\.neq\('status', 'cancelled'\)\.lt\('date', todayISO\)/);
});

test('ilk ziyaret bugün: geçmiş yok, bugünkü randevu "İlk ziyaret · Bugün"; ikinci kez yaklaşan diye yazılmıyor', () => {
    const card = customerCardOf(base({ visits: [visit('t1', TODAY, '14:30', 'confirmed')] }));
    assert.equal(card.lastVisit, null);
    assert.deepEqual(card.firstVisitToday, { date: 'Bugün', time: '14:30', service: 'Kesim', staff: 'Merve' });
    assert.equal(card.upcoming, null);
    assert.equal(customerPlates(card)[1].value, 'Bugün');
});

test('yaklaşan: saati geçmiş bugünkü randevu ve bitmiş randevu yaklaşan DEĞİL', () => {
    const card = customerCardOf(base({
        pastVisitCount: 3,
        visits: [
            visit('p', '2026-09-01', '10:00'),
            visit('gecen', TODAY, '09:00', 'confirmed'),
            visit('biten', TODAY, '12:00', 'completed'),
            visit('sonra', '2026-09-24', '14:30', 'confirmed', 's1', 'Kesim + fön'),
            visit('iptal', '2026-09-20', '10:00', 'cancelled'),
        ],
    }));
    assert.deepEqual(card.upcoming, { date: '24 Eyl', time: '14:30', service: 'Kesim + fön', staff: 'Merve' });
    const later = customerCardOf(base({ pastVisitCount: 1, visits: [visit('p', '2026-09-01', '10:00'), visit('b', TODAY, '15:00', 'confirmed')] }));
    assert.equal(later.upcoming.date, 'Bugün');
});

test('son işlemler TAHSİLATTAN: randevunun hizmeti ve personeli, en fazla beş satır', () => {
    const payments = Array.from({ length: 8 }, (_, i) => ({
        id: `p${i}`, reservation_id: i === 0 ? 'v1' : null, amount: 100 * (i + 1),
        paid_at: new Date(2026, 8, 10 - i, 12).toISOString(), description: i === 0 ? null : 'Ürün satışı',
    }));
    const card = customerCardOf(base({ visits: [visit('v1', '2026-09-10', '10:00', 'completed', 's2', 'Saç boyama')], payments }));
    assert.equal(card.history.length, HISTORY_ROWS);
    assert.deepEqual(card.history[0], { id: 'p0', service: 'Saç boyama', date: '10 Eyl', staff: 'Selin', amount: 100 });
    assert.deepEqual([card.history[1].service, card.history[1].staff], ['Ürün satışı', null]);
});

test('paket: hakkı kalan ilk paket; risk kural motorundan; not paragraflara bölünüyor', () => {
    const card = customerCardOf(base({
        packages: [
            { name: 'bitmiş', total_sessions: 5, used_sessions: 5 },
            { name: 'bakım', total_sessions: 10, used_sessions: 4 },
        ],
        riskRules: [{ key: 'alerji', label: 'Alerji', note: 'Saç boyasına alerjisi var' }, { key: 'hamile', label: 'Hamilelik' }],
        customer: {
            id: 'c1', name: 'Elif Demir', phone: null,
            notes: 'Boya yerine bitkisel bakım.\n\nCumartesi sabahı tercih ediyor.',
            custom_fields: { alerji: true, hamile: false },
        },
    }));
    assert.deepEqual(card.pkg, { name: 'bakım', total: 10, used: 4 });
    assert.deepEqual(card.risk, { label: 'Alerji', text: 'Saç boyasına alerjisi var' });
    assert.deepEqual(card.notes, ['Boya yerine bitkisel bakım.', 'Cumartesi sabahı tercih ediyor.']);
    assert.equal(card.phone, null);
    assert.equal(cardRisk([], { alerji: true }), null);
    assert.equal(shortDate('2026-01-05'), '5 Oca');
});

test('okuma kimlikle, org süzgeçli; adla arama yok', () => {
    const fn = source.slice(source.indexOf('export async function fetchCustomerCardRows'), source.indexOf('export async function fetchDeletionFacts'));
    assert.match(fn, /from\('customers'\)\.select\('id, name, phone, notes, custom_fields, created_at'\)\s*\.eq\('organization_id', organizationId\)\.eq\('id', customerId\)/);
    const froms = fn.match(/\.from\('\w+'\)/g) ?? [];
    const orgs = fn.match(/\.eq\('organization_id', organizationId\)/g) ?? [];
    assert.equal(orgs.length, froms.length);
    assert.match(fn, /if \(result\.error\) throw result\.error;/);
    assert.match(fn, /if \(!customer\.data\) return null;/);
    assert.doesNotMatch(fn, /ilike|customer_name/);
});

test('rota dört hâli ayırıyor: red · okunamadı · kayda bağlı değil · bulunamadı', () => {
    assert.doesNotMatch(route, /findCustomer|mockCustomers/);
    assert.match(route, /if \(!customerId\) return null;/);
    assert.match(route, /<DurumUnread\s*what="Müşteri kartını"\s*notMeaning="Müşterinin silindiği"/);
    assert.match(route, /const missing = Boolean\(customerId\) && snap\.state === 'ok';/);
    assert.match(route, /\) : missing \? \(\s*<Empty\s*title="Müşteri bulunamadı"/);
    assert.match(route, /Bu randevu bir müşteri kaydına bağlı değil/);
    // Sıra: red, bağlı değil, okunamadı, bulunamadı.
    const order = ['snap.refusal ?', 'unlinked ?', "snap.state === 'error' ?", 'missing ?'].map((m) => route.indexOf(m));
    assert.ok(order.every((at) => at > 0), 'dal eksik');
    assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('saf katman React, Expo ve Supabase taşımıyor', () => {
    assert.doesNotMatch(pure, /from 'react|from 'expo|supabase\./);
});
