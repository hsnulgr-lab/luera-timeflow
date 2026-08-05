import assert from 'node:assert/strict';
import test from 'node:test';
import {
    expandExpenses, expensesByCategory, monthsBetween, totalExpenses,
} from '../src/lib/expenses.ts';

// Gider defteri (080). Kritik karar: tekrarlı gider veritabanında TEK satırdır,
// her ay için satır ÜRETİLMEZ. Üretim yaklaşımında cron kaçarsa ay eksik, iki
// kez çalışırsa kâr yanlış çıkardı. Yayma işi burada, deterministik biçimde.

const kira = {
    id: 'kira', organizationId: 'o', category: 'kira', amount: 15000,
    method: 'transfer', spentOn: '2026-01-05', recurrence: 'monthly', createdAt: '',
};
const boya = {
    id: 'boya', organizationId: 'o', category: 'malzeme', amount: 2400,
    method: 'card', spentOn: '2026-08-03', createdAt: '',
};

test('ay aralığı iki ucu da içerir ve yıl sınırını geçer', () => {
    assert.deepEqual(monthsBetween('2026-08-01', '2026-08-31'), ['2026-08']);
    assert.deepEqual(monthsBetween('2026-11-15', '2027-02-02'),
        ['2026-11', '2026-12', '2027-01', '2027-02']);
});

test('tek seferlik gider yalnız kendi tarihinde sayılır', () => {
    assert.equal(expandExpenses([boya], '2026-08-01', '2026-08-31').length, 1);
    assert.equal(expandExpenses([boya], '2026-07-01', '2026-07-31').length, 0);
});

test('tekrarlı gider aralık dışında başlamış olsa da her ay sayılır', () => {
    // Kira Ocak'ta girildi; Ağustos raporunda da olmalı. Bu, "gider görünmüyor"
    // şikâyetinin en olası kaynağı — spent_on'a göre filtrelenirse kaybolur.
    const aug = expandExpenses([kira], '2026-08-01', '2026-08-31');
    assert.equal(aug.length, 1);
    assert.equal(aug[0].date, '2026-08-05');
    assert.equal(aug[0].recurring, true);
    assert.equal(totalExpenses(aug), 15000);
});

test('tekrarlı gider başlangıcından önce sayılmaz', () => {
    assert.equal(expandExpenses([kira], '2025-12-01', '2025-12-31').length, 0);
});

test('bitirilen tekrar, bitiş ayından sonra sayılmaz — geçmiş aylar korunur', () => {
    const biten = { ...kira, endedOn: '2026-06-30' };
    assert.equal(expandExpenses([biten], '2026-05-01', '2026-05-31').length, 1);
    assert.equal(expandExpenses([biten], '2026-06-01', '2026-06-30').length, 1);
    assert.equal(expandExpenses([biten], '2026-07-01', '2026-07-31').length, 0);
});

test('çeyreklik aralıkta tekrarlı gider her ay bir kez sayılır', () => {
    const q = expandExpenses([kira], '2026-06-01', '2026-08-31');
    assert.deepEqual(q.map((o) => o.date), ['2026-06-05', '2026-07-05', '2026-08-05']);
    assert.equal(totalExpenses(q), 45000);
});

test('ayın 31inde başlayan tekrar, kısa aylarda son güne düşer', () => {
    const maas = { ...kira, id: 'maas', spentOn: '2026-01-31', amount: 30000 };
    const feb = expandExpenses([maas], '2026-02-01', '2026-02-28');
    assert.equal(feb.length, 1, 'Şubatta kaybolmamalı');
    assert.equal(feb[0].date, '2026-02-28');
});

test('ay ortasından başlayan aralık, o ayın tekrarını gün bazında kırpar', () => {
    // "1–3 Ağustos" raporu ayın 5'indeki kirayı içermemeli.
    assert.equal(expandExpenses([kira], '2026-08-01', '2026-08-03').length, 0);
    assert.equal(expandExpenses([kira], '2026-08-04', '2026-08-10').length, 1);
});

test('kategori dökümü tekrarlı ve tek seferliği birlikte toplar', () => {
    const occ = expandExpenses([kira, boya], '2026-08-01', '2026-08-31');
    assert.deepEqual(expensesByCategory(occ), { kira: 15000, malzeme: 2400 });
    assert.equal(totalExpenses(occ), 17400);
});

test('sonuç tarihe göre sıralı gelir', () => {
    const occ = expandExpenses([kira, boya], '2026-08-01', '2026-08-31');
    assert.deepEqual(occ.map((o) => o.date), ['2026-08-03', '2026-08-05']);
});
