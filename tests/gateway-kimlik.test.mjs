/**
 * gateway · kimlik ve kiracı sınırı (denetim 2026-11-24 · B2).
 *
 * Eskiden API anahtarı isteğe bağlıydı; anahtarsız istekte işletme ve kullanıcı
 * GÖVDEDEN okunuyordu. Kayıtlı herhangi biri başka salona randevu yazabiliyor,
 * müşteri adını değiştirebiliyor, 409 cevabından müşteri adı okuyabiliyordu.
 *
 * Bu test `supabase/functions/gateway/index.ts`i GERÇEKTEN yükler: supabase-js
 * sahte bir istemciye yönlenir, her sorgu kaydedilir.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const fakeUrl = new URL('./helpers/gateway-fake-supabase.mjs', import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
    if (specifier.startsWith('https://esm.sh/@supabase/supabase-js')) {
        return { url: ${JSON.stringify(fakeUrl)}, shortCircuit: true };
    }
    return next(specifier, context);
}`)}`, import.meta.url);

const KEY = 'tf_live_key_0123456789';
const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER = '22222222-2222-4222-8222-222222222222';
const STAFF = '33333333-3333-4333-8333-333333333333';
const CUST = '44444444-4444-4444-8444-444444444444';

const ok = (data) => ({ data, error: null });

function world(over = {}) {
    return {
        conn: { user_id: USER, organization_id: ORG },
        members: [{ org_id: ORG }],
        staff: { id: STAFF },
        busy: [],
        customerById: null,
        customerByPhone: null,
        ...over,
    };
}

const f = (q, name, key) => q.filters.find((x) => x[0] === name && x[1] === key)?.[2];

function answer(w, q) {
    switch (q.table) {
        case 'app_secrets': return ok(null); // ENFORCE kapalı → kapı açık
        case 'integration_connections':
            if (q.op === 'update') return ok(null);
            return ok(f(q, 'eq', 'api_key') === KEY ? w.conn : null);
        case 'organization_members': return ok(w.members);
        case 'staff':
            return ok(f(q, 'eq', 'organization_id') === ORG && f(q, 'eq', 'id') === STAFF ? w.staff : null);
        case 'reservations':
            if (q.op === 'insert') return ok({ id: 'r1', ...q.body });
            return ok(w.busy);
        case 'customers':
            if (q.op === 'insert') return ok({ id: 'c-new' });
            if (f(q, 'eq', 'id')) return ok(f(q, 'eq', 'organization_id') === ORG ? w.customerById : null);
            return ok(w.customerByPhone);
        default: return ok(null);
    }
}

let handler;
async function call(w, { key, body }) {
    const calls = [];
    globalThis.__gatewayAdmin = () => {
        class Q {
            constructor(table) { this.q = { table, op: 'select', filters: [], body: null }; }
            select() { return this; }
            insert(b) { this.q.op = 'insert'; this.q.body = b; return this; }
            update(b) { this.q.op = 'update'; this.q.body = b; return this; }
            maybeSingle() { return this; }
            single() { return this; }
            then(res, rej) { calls.push(this.q); return Promise.resolve(answer(w, this.q)).then(res, rej); }
        }
        for (const m of ['eq', 'neq', 'is', 'in', 'order', 'limit', 'gte', 'lte']) {
            Q.prototype[m] = function (k, v) { this.q.filters.push([m, k, v]); return this; };
        }
        return { from: (t) => new Q(t) };
    };
    if (!handler) {
        globalThis.Deno = {
            env: { get: (k) => (k === 'SUPABASE_URL' ? 'http://local' : k === 'SUPABASE_SERVICE_ROLE_KEY' ? 'service' : undefined) },
            serve: (fn) => { handler = fn; },
        };
        await import(pathToFileURL(new URL('../supabase/functions/gateway/index.ts', import.meta.url).pathname).href);
    }
    const res = await handler(new Request('http://local/gateway', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify(body),
    }));
    return { status: res.status, body: await res.json(), calls };
}

const booking = (extra = {}) => ({
    customer_name: 'Saldırgan', customer_phone: '05551112233', date: '2026-12-01',
    start_time: '10:00', end_time: '11:00', service: 'Kesim', ...extra,
});
const writes = (calls) => calls.filter((c) => c.op !== 'select' && c.table !== 'integration_connections');

test('anahtarsız istek: gövdedeki işletme/kullanıcı ile HİÇBİR ŞEY yazılmaz', async () => {
    const r = await call(world(), { body: booking({ organization_id: OTHER_ORG, user_id: USER }) });
    assert.equal(r.status, 401);
    assert.deepEqual(writes(r.calls), []);
    assert.ok(!r.calls.some((c) => c.table === 'reservations' || c.table === 'customers'));
});

test('yanlış anahtar: 401, gövdeye düşülmez', async () => {
    const r = await call(world(), { key: 'uydurma', body: booking({ organization_id: OTHER_ORG, user_id: USER }) });
    assert.equal(r.status, 401);
    assert.deepEqual(writes(r.calls), []);
});

test('geçerli anahtar: işletme anahtardan gelir, gövdedeki organization_id yok sayılır', async () => {
    const r = await call(world(), { key: KEY, body: booking({ organization_id: OTHER_ORG, user_id: 'baska' }) });
    assert.equal(r.status, 201);
    const ins = r.calls.find((c) => c.table === 'reservations' && c.op === 'insert');
    assert.equal(ins.body.organization_id, ORG);
    assert.equal(ins.body.user_id, USER);
});

test('bağlantı dizesi "anahtar|user_id": yalnız anahtar kullanılır', async () => {
    const r = await call(world(), { key: `${KEY}|${'99999999-9999-4999-8999-999999999999'}`, body: booking() });
    assert.equal(r.status, 201);
    assert.equal(r.calls.find((c) => c.op === 'insert' && c.table === 'reservations').body.user_id, USER);
});

test('çakışma cevabı müşteri adını ve kimliğini SÖYLEMEZ', async () => {
    const r = await call(world({ busy: [{ id: 'gizli', customer_name: 'Ayşe Yılmaz', start_time: '10:30:00', end_time: '11:30:00' }] }),
        { key: KEY, body: booking() });
    assert.equal(r.status, 409);
    assert.deepEqual(r.body.conflict, { start_time: '10:30', end_time: '11:30' });
    assert.ok(!JSON.stringify(r.body).includes('Ayşe'));
    const q = r.calls.find((c) => c.table === 'reservations' && c.op === 'select');
    assert.ok(q, 'çakışma sorgusu yapılmalı');
});

test('var olan müşterinin adı/e-postası güncellenmez', async () => {
    const r = await call(world({ customerByPhone: { id: CUST } }), { key: KEY, body: booking({ customer_email: 'x@y.z' }) });
    assert.equal(r.status, 201);
    assert.ok(!r.calls.some((c) => c.table === 'customers' && c.op === 'update'));
    assert.equal(r.calls.find((c) => c.op === 'insert' && c.table === 'reservations').body.customer_id, CUST);
});

test('başka işletmenin müşteri kimliği yok sayılır, telefondan bulunur', async () => {
    const r = await call(world({ customerById: null, customerByPhone: null }), { key: KEY, body: booking({ customer_id: 'yabanci-musteri' }) });
    assert.equal(r.status, 201);
    assert.equal(r.calls.find((c) => c.op === 'insert' && c.table === 'reservations').body.customer_id, 'c-new');
});

test('başka işletmenin personeli: 400, randevu yazılmaz', async () => {
    const r = await call(world(), { key: KEY, body: booking({ staff_id: 'yabanci-personel' }) });
    assert.equal(r.status, 400);
    assert.deepEqual(writes(r.calls), []);
});

test('durum yalnız pending/confirmed olabilir', async () => {
    const r = await call(world(), { key: KEY, body: booking({ status: 'completed' }) });
    assert.equal(r.calls.find((c) => c.op === 'insert' && c.table === 'reservations').body.status, 'pending');
    const r2 = await call(world(), { key: KEY, body: booking({ status: 'confirmed' }) });
    assert.equal(r2.calls.find((c) => c.op === 'insert' && c.table === 'reservations').body.status, 'confirmed');
});

test('eski anahtar (organization_id boş): iki üyelikte rastgele seçmez', async () => {
    const r = await call(world({ conn: { user_id: USER, organization_id: null }, members: [{ org_id: ORG }, { org_id: OTHER_ORG }] }),
        { key: KEY, body: booking() });
    assert.equal(r.status, 400);
    assert.deepEqual(writes(r.calls), []);
    const r1 = await call(world({ conn: { user_id: USER, organization_id: null } }), { key: KEY, body: booking() });
    assert.equal(r1.status, 201);
});

test('ping: geçerli anahtarla 200, hiçbir şey yazılmaz', async () => {
    const r = await call(world(), { key: KEY, body: { event_type: 'ping', source_module: 'timeflow' } });
    assert.equal(r.status, 200);
    assert.deepEqual(writes(r.calls), []);
});
