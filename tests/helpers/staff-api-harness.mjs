/**
 * staff-api'yi NODE'DA ÇALIŞTIRAN düzenek (Hız 3 · 2026-11-12).
 *
 * Kaynak metnine bakan test "kaç tur atıyor" sorusunu cevaplayamaz. Burada
 * `supabase/functions/staff-api/index.ts` GERÇEKTEN yükleniyor:
 *   - `https://esm.sh/@supabase/supabase-js@2` sahte bir istemciye yönleniyor,
 *   - `Deno.serve` istek işleyicisini yakalıyor,
 *   - sahte istemci her sorguyu kaydediyor ve ARDIŞIK TUR derinliğini ölçüyor.
 *
 * TUR DERİNLİĞİ: bir sorgunun derinliği, başladığı ana kadar BİTMİŞ en derin
 * sorgunun derinliği + 1. Aynı anda (Promise.all) başlayanlar aynı derinlikte;
 * birini bekleyip sonra başlayan bir derin. İsteğin derinliği = veritabanına
 * kaç kez sırayla gidildiği (kritik yol).
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const fakeClientUrl = new URL('./fake-supabase.mjs', import.meta.url).href;
const hooks = `
export async function resolve(specifier, context, next) {
    if (specifier.startsWith('https://esm.sh/@supabase/supabase-js')) {
        return { url: ${JSON.stringify(fakeClientUrl)}, shortCircuit: true };
    }
    return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`, import.meta.url);

export const ORG = '11111111-1111-4111-8111-111111111111';
export const OWNER = '22222222-2222-4222-8222-222222222222';
export const ME = '33333333-3333-4333-8333-333333333333';
export const DEVICE = '44444444-4444-4444-8444-444444444444';
export const RES = '55555555-5555-4555-8555-555555555555';
export const CUST = '66666666-6666-4666-8666-666666666666';
export const PROD = '77777777-7777-4777-8777-777777777777';
export const SERVICE = '99999999-9999-4999-8999-999999999999';
export const SECRET = 'hiz3-test-secret-0123456789abcdef';

/** Varsayılan veritabanı — her tablo için makul bir cevap. */
export function defaultWorld() {
    return {
        app_secrets: { STAFF_TOKEN_SECRET: SECRET, ENTITLEMENT_ENFORCE: 'true', MOBILE_WRITES_ENABLED: null },
        device: { revoked_at: null },
        entitlement: { state: 'active', plan: 'tek', cycle: 'monthly', trial_ends_at: null, expires_at: new Date(Date.now() + 864e5 * 30).toISOString(), grace_until: null },
        staff: { id: ME, organization_id: ORG, name: 'Elif Kaya', color: null, role: 'staff', is_active: true, session_epoch: 1 },
        reservation: {
            id: RES, customer_id: CUST, customer_name: 'Ayşe', customer_phone: '05551112233', date: '2026-11-12',
            start_time: '10:00', end_time: '11:00', service: 'Boya', service_color: null, status: 'confirmed',
            staff_id: ME, notes: null, customer_arrived_at: null, arrived_at: '2026-11-12T07:00:00Z',
            service_ended_at: null, adisyon_items: [{ kind: 'material', productId: PROD, name: 'Oksidan', qty: 1, price: 0 }],
            is_paid: false, formula: null, updated_at: '2026-11-12T07:00:00Z', wait_ends_at: null, wait_minutes: null,
            custom_fields: { paket_plan_id: '88888888-8888-4888-8888-888888888888' },
        },
        prior: null,
        book: [
            { id: CUST, name: 'Ayşe', phone_tail: '2233', last_date: '2026-11-01', last_service: 'Boya', last_staff_id: ME, has_formula: true },
        ],
    };
}

const filterOf = (q, key) => q.filters.find((f) => f[1] === key)?.[2];

/** Sorguya dünyadan cevap. Yalnız staff-api'nin sorduğu biçimler. */
function answer(world, q) {
    const one = (row) => ({ data: row, error: null });
    const many = (rows) => ({ data: rows, error: null });
    if (q.rpc) {
        if (q.rpc === 'staff_customer_book') return world.bookError ? { data: null, error: world.bookError } : many(world.book);
        return one(null);
    }
    switch (q.table) {
        case 'app_secrets': return one(world.app_secrets[filterOf(q, 'key')] != null ? { value: world.app_secrets[filterOf(q, 'key')] } : null);
        case 'staff_devices': return q.op === 'select' ? one(world.device) : one(null);
        case 'org_entitlement': return one(world.entitlement);
        case 'staff':
            if (q.single) return one(world.staff);
            return many([{ id: ME, name: 'Elif Kaya', color: null }, { id: OWNER, name: 'Sahip' }]);
        case 'staff_write_log': return q.op === 'select' ? one(world.prior) : one(null);
        case 'staff_auth_log': return one(null);
        case 'organizations': return one({ owner_id: OWNER, name: 'Salon', solo: false });
        case 'settings': {
            const rows = world.settingsRows
                ?? [{ user_id: OWNER, created_at: '2026-01-01', risk_rules: [], sector: 'kuafor', staff_can_see_revenue: true, working_hours: null }];
            if (!q.single) return many(rows);
            const uid = filterOf(q, 'user_id');
            return one(uid ? rows.find((r) => r.user_id === uid) ?? null : rows[0] ?? null);
        }
        case 'reservations':
            if (q.op === 'select' && !q.single) {
                return many(q.cols && q.cols.includes('formula, status') ? [{ customer_id: CUST, date: '2026-11-01', service: 'Boya', staff_id: ME, formula: { a: 1 }, status: 'completed' }] : [world.reservation]);
            }
            if (q.op === 'update') return one({ ...world.reservation, ...q.body });
            return one(world.reservation);
        case 'customers':
            return q.single
                ? one({ id: CUST, name: 'Ayşe', phone: '05551112233', notes: null, custom_fields: {} })
                : many([{ id: CUST, name: 'Ayşe', phone: '05551112233' }]);
        case 'customer_packages': return many([]);
        case 'treatment_plans': return many([]);
        case 'products': return many([{ id: PROD, name: 'Oksidan', price: 0, kind: 'consumable', tracks_stock: true }]);
        case 'services': return many([{ id: SERVICE, name: 'Fön', price: 100 }]);
        case 'stock_movements': return q.op === 'select' ? many([]) : one(null);
        default: return one(null);
    }
}

/** Sahte service_role istemcisi + tur ölçeri. */
export function fakeAdmin(world) {
    const meter = { calls: [], depth: 0 };
    let doneDepth = 0;
    const run = (q) => {
        const depth = doneDepth + 1;
        meter.calls.push({ ...q, depth });
        meter.depth = Math.max(meter.depth, depth);
        return new Promise((resolve) => setTimeout(() => {
            doneDepth = Math.max(doneDepth, depth);
            resolve(answer(world, q));
        }, 1));
    };
    class Query {
        constructor(table) { this.q = { table, op: 'select', filters: [], cols: null, single: false, body: null }; }
        select(cols) { if (this.q.op === 'select') this.q.cols = cols; else this.q.returning = cols; return this; }
        insert(body) { this.q.op = 'insert'; this.q.body = body; return this; }
        upsert(body) { this.q.op = 'upsert'; this.q.body = body; return this; }
        update(body) { this.q.op = 'update'; this.q.body = body; return this; }
        delete() { this.q.op = 'delete'; return this; }
        maybeSingle() { this.q.single = true; return this; }
        single() { this.q.single = true; return this; }
        then(ok, fail) { return run(this.q).then(ok, fail); }
    }
    for (const name of ['eq', 'neq', 'is', 'in', 'gt', 'gte', 'lt', 'lte', 'not', 'or', 'order', 'limit', 'range', 'match', 'filter']) {
        Query.prototype[name] = function (k, v) { this.q.filters.push([name, k, v]); return this; };
    }
    return {
        meter,
        from: (table) => new Query(table),
        rpc: (fn, args) => ({ then: (ok, fail) => run({ rpc: fn, args, filters: [] }).then(ok, fail) }),
    };
}

let handlers = new Map();

/** `index.ts`i (ya da başka bir kökteki kopyasını) yükler; işleyiciyi döner. */
export async function loadStaffApi(indexPath) {
    if (handlers.has(indexPath)) return handlers.get(indexPath);
    globalThis.Deno = {
        env: { get: (k) => (k === 'SUPABASE_URL' ? 'http://local' : k === 'SUPABASE_SERVICE_ROLE_KEY' ? 'service' : undefined) },
        serve: (fn) => { globalThis.__staffApiHandler = fn; },
    };
    await import(pathToFileURL(indexPath).href);
    const handler = globalThis.__staffApiHandler;
    handlers.set(indexPath, handler);
    return handler;
}

/** Bir isteği çalıştırır: cevap + o isteğin sorguları ve tur derinliği. */
export async function call(handler, world, action, body = {}, token) {
    const admin = fakeAdmin(world);
    globalThis.__staffApiAdmin = () => admin;
    const res = await handler(new Request('http://local/staff-api', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { 'x-staff-token': token } : {}) },
        body: JSON.stringify({ action, ...body }),
    }));
    // Cevaptan sonra kalan (beklenmemiş) sorgu da sayılsın diye bir tur bekle.
    await new Promise((r) => setTimeout(r, 5));
    return { status: res.status, body: await res.json(), rounds: admin.meter.depth, calls: admin.meter.calls };
}
