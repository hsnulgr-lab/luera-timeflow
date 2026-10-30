import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMoves, presetRange, summarize, mapVoidRow } from '../src/lib/kasaDefteri.ts';

// Kasa defteri (2026-10-31): Hareketler + Gün sonu aynı hesaptan beslenir.
// Kritik kurallar: tekrarlı gider kasaya girmez, iptal toplamı bozmaz,
// beklenen nakit = nakit tahsilat − nakit gider.

const at = (day, hm) => new Date(`${day}T${hm}:00`).toISOString();
const pay = (id, day, amount, method, extra = {}) => ({
    id, organizationId: 'o', type: 'service', amount, method, paidAt: at(day, '10:00'), createdAt: '', ...extra,
});
const exp = (id, day, amount, method, extra = {}) => ({
    id, organizationId: 'o', category: 'malzeme', amount, method, spentOn: day, createdAt: '', ...extra,
});

test('hazır aralıklar: dün, hafta pazartesiden, ay 1’inden', () => {
    assert.deepEqual(presetRange('today', '2026-10-31'), { from: '2026-10-31', to: '2026-10-31' });
    assert.deepEqual(presetRange('yesterday', '2026-11-01'), { from: '2026-10-31', to: '2026-10-31' });
    // 31 Ekim 2026 cumartesi → hafta 26 Ekim pazartesi
    assert.deepEqual(presetRange('week', '2026-10-31'), { from: '2026-10-26', to: '2026-10-31' });
    assert.deepEqual(presetRange('month', '2026-10-31'), { from: '2026-10-01', to: '2026-10-31' });
});

test('aralık dışı tahsilat ve tekrarlı gider listeye girmez', () => {
    const moves = buildMoves(
        [pay('a', '2026-10-31', 500, 'cash'), pay('b', '2026-10-30', 900, 'card')],
        [],
        [exp('kira', '2026-10-31', 15000, 'transfer', { recurrence: 'monthly' }), exp('boya', '2026-10-31', 300, 'cash')],
        '2026-10-31', '2026-10-31',
    );
    assert.deepEqual(moves.map((m) => m.id).sort(), ['e:boya', 'p:a']);
});

test('beklenen nakit = nakit giriş − nakit gider; kartlı gider nakdi düşürmez', () => {
    const s = summarize(buildMoves(
        [pay('a', '2026-10-31', 1000, 'cash'), pay('b', '2026-10-31', 700, 'card')],
        [],
        [exp('boya', '2026-10-31', 300, 'cash'), exp('kargo', '2026-10-31', 120, 'card')],
        '2026-10-31', '2026-10-31',
    ));
    assert.equal(s.income, 1700);
    assert.equal(s.expense, 420);
    assert.equal(s.net, 1280);
    assert.equal(s.expectedCash, 700);
    assert.equal(s.byMethod.card, 700);
});

test('iptal satırı görünür ama toplamları değiştirmez', () => {
    const v = mapVoidRow({
        id: 'v1', payment_id: 'x', voided_at: at('2026-10-31', '15:00'),
        payment_snapshot: { amount: '450', method: 'cash', type: 'service', description: 'Ağda', paid_at: at('2026-10-31', '14:00') },
    });
    const s = summarize(buildMoves([pay('a', '2026-10-31', 1000, 'cash')], [v], [], '2026-10-31', '2026-10-31'));
    assert.equal(s.income, 1000);
    assert.equal(s.expectedCash, 1000);
    assert.equal(s.voidCount, 1);
    assert.equal(s.voidTotal, 450);
});

test('tahsilat türü: plan → paket, ürün → ürün, hizmet → hizmet', () => {
    const s = summarize(buildMoves([
        pay('a', '2026-10-31', 100, 'cash', { treatmentPlanId: 'p1' }),
        pay('b', '2026-10-31', 200, 'cash', { type: 'product', productId: 'u1' }),
        pay('c', '2026-10-31', 300, 'cash'),
    ], [], [], '2026-10-31', '2026-10-31'));
    assert.deepEqual(s.byIncome, { service: 300, package: 100, product: 200, other: 0 });
});
