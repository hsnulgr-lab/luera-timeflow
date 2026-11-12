/**
 * Hız 3 · staff-api'nin istek başına maliyeti (2026-11-12).
 *
 * `index.ts` Node'da GERÇEKTEN çalıştırılıyor (tests/helpers/staff-api-harness.mjs):
 * sahte service_role istemcisi her sorguyu kaydediyor ve ARDIŞIK veritabanı
 * turunu ölçüyor. Önceki sürümün (c0963b0) aynı düzenekle ölçülen değerleri:
 *
 *   uç             önce  sonra     uç             önce  sonra
 *   agenda           6     1       visit.items     11     5
 *   customers        6     2       visit.wait      10     4
 *   customer         8     2       visit.formula   10     4
 *   visit.start     11     4       visit.finish    16     6
 *   me               5     1
 *
 * (sır bellekte; soğuk izolatta sonra +1). Testler sınırları ve — asıl önemlisi —
 * güvenlik kapılarının HÂLÂ her istekte taze veriyle çalıştığını koruyor.
 *
 * Göç 143 PGlite'ta: temiz zincir + iki kez + regresyon + söküm; müşteri
 * defteri fonksiyonu eski JavaScript algoritmasıyla rastgele veride KIYASLANIYOR.
 *   PGLITE_DIR=<pglite kurulu dizin> node --test tests/staff-api-hiz3.test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
    CUST, DEVICE, ME, ORG, OWNER, PROD, RES, SECRET, SERVICE,
    call, defaultWorld, loadStaffApi,
} from './helpers/staff-api-harness.mjs';
import { mintStaffToken } from '../supabase/functions/_shared/staffToken.ts';
import { accessWhen, computeAccess } from '../supabase/functions/_shared/entitlement.ts';
import { SECRET_TTL_MS, cachedSecret, forgetSecrets } from '../supabase/functions/staff-api/gate.ts';

const PGLITE_DIR = process.env.PGLITE_DIR;
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const INDEX = fileURLToPath(new URL('../supabase/functions/staff-api/index.ts', import.meta.url));

const handler = await loadStaffApi(INDEX);
const token = (over = {}, secret = SECRET) =>
    mintStaffToken({ sub: ME, org: ORG, role: 'staff', epoch: 1, did: DEVICE, ...over }, secret);
const world = (patch = {}) => ({ ...defaultWorld(), ...patch });
const reads = (r, table) => r.calls.filter((c) => c.table === table);
const secretReads = (r, key) => r.calls.filter((c) => c.table === 'app_secrets' && c.filters.some((f) => f[2] === key));

// ── 1 · Tur bütçeleri ───────────────────────────────────────────────────────

const BUDGET = {
    agenda: [1, {}],
    me: [1, {}],
    customers: [2, {}],
    customer: [2, { customerId: CUST }],
    'visit.start': [4, { reservationId: RES, idempotencyKey: 'b-start' }],
    'visit.items': [5, { reservationId: RES, idempotencyKey: 'b-items', items: [{ kind: 'material', productId: PROD, qty: 1 }] }],
    'visit.wait': [4, { reservationId: RES, idempotencyKey: 'b-wait', minutes: 10 }],
    'visit.formula': [4, { reservationId: RES, idempotencyKey: 'b-formula', ratio: '1:1' }],
    'visit.finish': [6, { reservationId: RES, idempotencyKey: 'b-finish' }],
};

test('1 · uç başına ardışık veritabanı turu bütçesi (sır bellekteyken)', async () => {
    const t = await token();
    await call(handler, world(), 'me', {}, t); // ısınma
    for (const [action, [max, body]] of Object.entries(BUDGET)) {
        const w = world();
        if (action === 'visit.start') w.reservation = { ...w.reservation, arrived_at: null };
        const r = await call(handler, w, action, body, t);
        assert.equal(r.status, 200, `${action}: ${JSON.stringify(r.body)}`);
        assert.ok(r.rounds <= max, `${action}: ${r.rounds} tur (sınır ${max})`);
    }
});

test('1 · kapı TEK turda: cihaz, ENFORCE, abonelik, personel (+ yazmada kütük ve vana) aynı anda', async () => {
    const t = await token();
    await call(handler, world(), 'me', {}, t);
    const r = await call(handler, world(), 'visit.wait', { reservationId: RES, idempotencyKey: 'tek-tur', minutes: 5 }, t);
    const first = r.calls.filter((c) => c.depth === 1).map((c) => c.table).sort();
    assert.deepEqual(first, ['app_secrets', 'app_secrets', 'org_entitlement', 'staff', 'staff_devices', 'staff_write_log'].sort());
    assert.equal(secretReads(r, 'ENTITLEMENT_ENFORCE').length, 1);
    assert.equal(secretReads(r, 'MOBILE_WRITES_ENABLED').length, 1);
});

// ── 1 · Bellek: yalnız imza sırrı ───────────────────────────────────────────

test('1 · imza sırrı bellekte: ikinci istek sırrı sormuyor; 60 sn sonra yeniden soruyor', async () => {
    forgetSecrets();
    const t = await token();
    const a = await call(handler, world(), 'me', {}, t);
    const b = await call(handler, world(), 'me', {}, t);
    assert.equal(secretReads(a, 'STAFF_TOKEN_SECRET').length, 1);
    assert.equal(secretReads(b, 'STAFF_TOKEN_SECRET').length, 0);

    // Saf ömür: TTL içinde bellek, sonrasında taze.
    forgetSecrets();
    let n = 0;
    const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { n += 1; return { data: { value: `s${n}` } }; } }) }) }) };
    assert.equal(await cachedSecret(admin, 'X', { now: 0 }), 's1');
    assert.equal(await cachedSecret(admin, 'X', { now: SECRET_TTL_MS - 1 }), 's1');
    assert.equal(await cachedSecret(admin, 'X', { now: SECRET_TTL_MS }), 's2');
    assert.equal(await cachedSecret(admin, 'X', { now: SECRET_TTL_MS + 1, fresh: true }), 's3');
    assert.equal(SECRET_TTL_MS, 60_000);
    forgetSecrets();
});

test('1 · sır döndürüldü: yeni sırla basılmış token bellekteki eski sıra takılmıyor; eski token ölüyor', async () => {
    forgetSecrets();
    await call(handler, world(), 'me', {}, await token()); // eski sır belleğe girdi
    const rotated = world();
    rotated.app_secrets = { ...rotated.app_secrets, STAFF_TOKEN_SECRET: 'yeni-sir-0123456789abcdefghij' };
    const fresh = await call(handler, rotated, 'me', {}, await token({}, 'yeni-sir-0123456789abcdefghij'));
    assert.equal(fresh.status, 200, JSON.stringify(fresh.body));
    const stale = await call(handler, rotated, 'me', {}, await token());
    assert.equal(stale.status, 401);
    assert.equal(stale.body.error, 'invalid_token');
    // Sahte imza her seferinde taze okumaya yol açıyor ama yine reddediliyor.
    const forged = await call(handler, rotated, 'me', {}, await token({}, 'sahte-sir-0123456789abcdefghijk'));
    assert.equal(forged.status, 401);
    forgetSecrets();
});

test('1 · güvenlik kararları HER istekte taze: koparma, abonelik, ENFORCE, aktiflik, epoch, vana', async () => {
    const t = await token();
    await call(handler, world(), 'me', {}, t);

    const cut = await call(handler, world({ device: { revoked_at: new Date().toISOString() } }), 'agenda', {}, t);
    assert.equal(cut.status, 401);
    assert.deepEqual(cut.body, { error: 'revoked' });

    const gone = await call(handler, world({ device: null }), 'agenda', {}, t);
    assert.equal(gone.status, 401);

    const locked = world({ entitlement: { state: 'active', expires_at: '2020-01-01T00:00:00Z', grace_until: null } });
    const lockedRes = await call(handler, locked, 'agenda', {}, t);
    assert.equal(lockedRes.status, 403);
    assert.equal(lockedRes.body.error, 'subscription_inactive');
    assert.equal(lockedRes.body.appointments, undefined, 'kapıdan dönen isteğe ajanda sızmamalı');

    // ENFORCE kapalıyken satırsız org geçer — bayrak her istekte okunuyor.
    const open = world({ entitlement: null });
    open.app_secrets = { ...open.app_secrets, ENTITLEMENT_ENFORCE: 'false' };
    assert.equal((await call(handler, open, 'agenda', {}, t)).status, 200);
    const closed = world({ entitlement: null });
    assert.equal((await call(handler, closed, 'agenda', {}, t)).status, 403);

    const inactive = await call(handler, world({ staff: { ...defaultWorld().staff, is_active: false } }), 'agenda', {}, t);
    assert.equal(inactive.status, 401);
    const epoch = await call(handler, world({ staff: { ...defaultWorld().staff, session_epoch: 2 } }), 'agenda', {}, t);
    assert.equal(epoch.status, 401);

    const off = world();
    off.app_secrets = { ...off.app_secrets, MOBILE_WRITES_ENABLED: 'off' };
    const valve = await call(handler, off, 'visit.note', { reservationId: RES, idempotencyKey: 'vana', note: 'x' }, t);
    assert.equal(valve.status, 503);
    assert.equal(reads(valve, 'reservations').length, 0, 'vana kapalıyken randevuya dokunulmamalı');
});

test('1 · koparılmış telefon abonelik kapısından ÖNCE tartılıyor (sıra korunuyor)', async () => {
    const t = await token();
    const w = world({ device: { revoked_at: '2026-11-01T00:00:00Z' }, entitlement: null });
    const r = await call(handler, w, 'access', {}, t);
    assert.equal(r.status, 401, 'kayıp telefon salonun adını öğrenmemeli');
});

test('1 · idempotens: kayıtlı cevap tekrar dönüyor (vana kapalıyken de), başka kişinin anahtarı 409', async () => {
    const t = await token();
    const replay = world({ prior: { staff_id: ME, action: 'visit.wait', status: 200, response: { ok: true, eski: 1 } } });
    replay.app_secrets = { ...replay.app_secrets, MOBILE_WRITES_ENABLED: 'off' };
    const r = await call(handler, replay, 'visit.wait', { reservationId: RES, idempotencyKey: 'k', minutes: 5 }, t);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true, eski: 1 });
    assert.equal(reads(r, 'reservations').length, 0);

    const other = world({ prior: { staff_id: OWNER, action: 'visit.wait', status: 200, response: { gizli: 1 } } });
    const o = await call(handler, other, 'visit.wait', { reservationId: RES, idempotencyKey: 'k', minutes: 5 }, t);
    assert.equal(o.status, 409);
    assert.equal(o.body.error, 'idempotency_key_reused');
});

// ── 3 · Ajanda: erken sorgu yetkiyi DB'den alıyor ───────────────────────────

test('3 · ajanda: token rolü ile DB rolü ayrışırsa erken satırlar atılıp kendi kapsamıyla yeniden soruluyor', async () => {
    // Token "assistant" (salonun tamamı) diyor, DB artık "staff" (yalnız kendi).
    const t = await token({ role: 'assistant' });
    const r = await call(handler, world(), 'agenda', {}, t);
    assert.equal(r.status, 200);
    const q = reads(r, 'reservations');
    assert.equal(q.length, 2, 'yeniden sorulmadı');
    const last = q[q.length - 1];
    assert.ok(last.filters.some((f) => f[0] === 'eq' && f[1] === 'staff_id' && f[2] === ME), 'yeniden sorgu kendi randevusuyla sınırlı değil');

    // Uyumlu rol: tek sorgu, kapıyla aynı turda, kendi randevusuyla sınırlı.
    const same = await call(handler, world(), 'agenda', {}, await token());
    const only = reads(same, 'reservations');
    assert.equal(only.length, 1);
    assert.equal(only[0].depth, 1);
    assert.ok(only[0].filters.some((f) => f[1] === 'staff_id' && f[2] === ME));
    assert.ok(only[0].filters.some((f) => f[1] === 'organization_id' && f[2] === ORG));
});

// ── 2 · customers: 1.0.1 sözleşmesi ─────────────────────────────────────────

const BOOK_KEYS = (() => {
    const client = read('mobile/src/api/staff.ts');
    const body = client.slice(client.indexOf('export interface BookRow'), client.indexOf('}', client.indexOf('export interface BookRow')));
    return [...body.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]).sort();
})();

test('2 · customers: cevap 1.0.1 BookRow alanlarını birebir taşıyor; sayfasız istek TAM liste, nextOffset yok', async () => {
    assert.deepEqual(BOOK_KEYS, ['hasFormula', 'id', 'lastService', 'lastStaffInitials', 'lastVisitDate', 'mine', 'name', 'phoneTail']);
    const r = await call(handler, world(), 'customers', {}, await token());
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ['customers', 'ok']);
    assert.deepEqual(Object.keys(r.body.customers[0]).sort(), BOOK_KEYS);
    assert.deepEqual(r.body.customers[0], {
        id: CUST, name: 'Ayşe', lastVisitDate: '2026-11-01', lastService: 'Boya', hasFormula: true,
        mine: true, lastStaffInitials: 'EK', phoneTail: '2233',
    });
    const rpc = r.calls.find((c) => c.rpc === 'staff_customer_book');
    assert.equal(rpc.args.p_org, ORG, 'org süzgeci token\'dan gelmeli');
    assert.equal(rpc.args.p_limit, null);
    assert.equal(reads(r, 'reservations').length, 0, 'rezervasyonlar artık fonksiyona taşınmamalı');
    assert.equal(reads(r, 'customers').length, 0, 'telefon numarası DB\'den çıkmamalı');
});

test('2 · customers: göç 143 yoksa eski yola düşüyor ve AYNI cevabı veriyor', async () => {
    const t = await token();
    const viaRpc = await call(handler, world(), 'customers', {}, t);
    const legacy = await call(handler, world({ bookError: { code: 'PGRST202', message: 'yok' } }), 'customers', {}, t);
    assert.equal(legacy.status, 200);
    assert.deepEqual(legacy.body, viaRpc.body);
    const other = await call(handler, world({ bookError: { code: '57014', message: 'zaman aşımı' } }), 'customers', {}, t);
    assert.equal(other.status, 500);
});

test('2 · customers: sayfa isteyene limit/offset + nextOffset; geçersiz limit = tam liste', async () => {
    const t = await token();
    const page = await call(handler, world(), 'customers', { limit: 1, offset: 0 }, t);
    assert.equal(page.body.nextOffset, 1);
    assert.equal(page.calls.find((c) => c.rpc).args.p_limit, 1);
    const last = await call(handler, world(), 'customers', { limit: 2, offset: 4 }, t);
    assert.equal(last.body.nextOffset, null);
    const bad = await call(handler, world(), 'customers', { limit: 100000 }, t);
    assert.equal(bad.calls.find((c) => c.rpc).args.p_limit, null);
    assert.equal('nextOffset' in bad.body, false);
});

// ── 3 · customer ────────────────────────────────────────────────────────────

test('3 · customer: alanlar aynı; ekip adları ve ayar satırı ana turda', async () => {
    const r = await call(handler, world(), 'customer', { customerId: CUST }, await token());
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ['customer', 'history', 'ok', 'packages', 'riskRules']);
    assert.deepEqual(Object.keys(r.body.history[0]).sort(),
        ['date', 'formula', 'hadMaterial', 'id', 'itemsUsed', 'locked', 'materials', 'mine', 'service', 'staffName', 'status']);
    const main = r.calls.filter((c) => c.depth === 2).map((c) => c.table).sort();
    assert.ok(main.includes('staff') && main.includes('settings') && main.includes('organizations'), main.join(','));
});

test('3 · orgSettings tek turda, seçim kuralı aynı: sahibin satırı, yoksa en eski', async () => {
    const t = await token();
    const rows = [
        { user_id: 'baska', created_at: '2025-01-01', risk_rules: ['eski'] },
        { user_id: OWNER, created_at: '2026-01-01', risk_rules: ['sahip'] },
    ];
    const owner = await call(handler, world({ settingsRows: rows }), 'customer', { customerId: CUST }, t);
    assert.deepEqual(owner.body.riskRules, ['sahip']);
    const fallback = await call(handler, world({ settingsRows: [rows[0]] }), 'customer', { customerId: CUST }, t);
    assert.deepEqual(fallback.body.riskRules, ['eski']);
});

// ── 4 · Yazmalar ────────────────────────────────────────────────────────────

test('4 · visit.start: denetim izi ve kütük asıl yazmadan SONRA, ikisi aynı turda', async () => {
    const w = world();
    w.reservation = { ...w.reservation, arrived_at: null };
    const r = await call(handler, w, 'visit.start', { reservationId: RES, idempotencyKey: 'iz' }, await token());
    const write = r.calls.find((c) => c.table === 'reservations' && c.op === 'update');
    const trail = r.calls.find((c) => c.table === 'staff_auth_log');
    const log = r.calls.find((c) => c.table === 'staff_write_log' && c.op === 'insert');
    assert.ok(write && trail && log);
    assert.ok(trail.depth > write.depth && log.depth > write.depth, 'iz yazmadan önce');
    assert.equal(trail.depth, log.depth);
});

test('4 · visit.finish: stok ve paket hakkı aynı anda; iz bitirişten sonra; cevap biçimi aynı', async () => {
    const r = await call(handler, world(), 'visit.finish', { reservationId: RES, idempotencyKey: 'bitir' }, await token());
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ['endedAt', 'itemCount', 'ok', 'reservation', 'stock', 'total']);
    const finish = r.calls.find((c) => c.table === 'reservations' && c.op === 'update');
    const products = r.calls.find((c) => c.table === 'products');
    const movements = r.calls.find((c) => c.table === 'stock_movements' && c.op === 'select');
    const plan = r.calls.find((c) => c.table === 'reservations' && c.op === 'select' && c.cols === 'custom_fields');
    assert.equal(products.depth, finish.depth + 1);
    assert.equal(movements.depth, products.depth, 'katalog ve mevcut hareket aynı turda değil');
    assert.equal(plan.depth, products.depth, 'paket hakkı stokla aynı turda değil');
    const insert = r.calls.find((c) => c.table === 'stock_movements' && c.op === 'insert');
    assert.equal(insert.body.delta, -1);
    const trail = r.calls.find((c) => c.table === 'staff_auth_log');
    assert.ok(trail.depth > insert.depth);
});

test('4 · visit.items: ürün ve hizmet kataloğu aynı turda', async () => {
    const r = await call(handler, world(), 'visit.items', {
        reservationId: RES, idempotencyKey: 'kalem',
        items: [{ kind: 'material', productId: PROD, qty: 1 }, { kind: 'extra', serviceId: SERVICE, qty: 1 }],
    }, await token());
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(Object.keys(r.body).sort(), ['items', 'ok', 'updatedAt']);
    const p = r.calls.find((c) => c.table === 'products');
    const s = r.calls.find((c) => c.table === 'services');
    assert.ok(p && s);
    assert.equal(p.depth, s.depth);
});

// ── accessWhen = checkAccess ────────────────────────────────────────────────

test('1 · accessWhen checkAccess ile aynı kuralı veriyor', () => {
    const now = Date.parse('2026-11-12T00:00:00Z');
    assert.equal(accessWhen('false', null, now).ok, true);
    assert.equal(accessWhen(null, null, now).ok, true);
    assert.equal(accessWhen('true', null, now).ok, false);
    const row = { state: 'trial', expires_at: '2026-11-20T00:00:00Z' };
    assert.deepEqual(accessWhen('true', row, now), computeAccess(row, now));
    const src = read('supabase/functions/_shared/entitlement.ts');
    assert.match(src, /if \(flag\?\.value !== 'true'\) return accessWhen\(flag\?\.value, null\);/);
});

// ── 5 · Zil: 1.0.1 gövdeden yalnız `t`yi okuyor ──────────────────────────────

test('5 · 1.0.1 zil gövdesinden yalnız `t`yi okuyor — alan eklemek geriye uyumlu', () => {
    const live = read('mobile/src/lib/liveSignal.ts');
    const fn = live.slice(live.indexOf('function tableOf'), live.indexOf('}', live.indexOf('function tableOf')) + 1);
    assert.match(fn, /payload\?: \{ t\?: unknown \}/);
    assert.doesNotMatch(fn, /staff_id|\bid\b/);
    const m = read('supabase/143_staff_api_hiz.sql');
    assert.match(m, /jsonb_build_object\('t', tg_table_name, 'op', lower\(tg_op\)\)/);
});

// ── PGlite ──────────────────────────────────────────────────────────────────

const STUB = `
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

    CREATE SCHEMA auth;
    CREATE TABLE auth.users (
        instance_id uuid, id uuid PRIMARY KEY, aud text, role text, email text, encrypted_password text,
        email_confirmed_at timestamptz, raw_app_meta_data jsonb NOT NULL DEFAULT '{}',
        raw_user_meta_data jsonb NOT NULL DEFAULT '{}', created_at timestamptz, updated_at timestamptz,
        confirmation_token text, email_change text, email_change_token_new text, recovery_token text);
    CREATE TABLE organizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
        owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE staff (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name text, role text, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE customers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
        organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
        name text NOT NULL, phone text NOT NULL);
    CREATE TABLE reservations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
        customer_name text NOT NULL, customer_phone text NOT NULL, date date NOT NULL,
        start_time time NOT NULL, end_time time NOT NULL, service text NOT NULL,
        status text NOT NULL DEFAULT 'pending', staff_id uuid REFERENCES staff(id), formula jsonb);
    CREATE TABLE payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid);
    -- 092 · 090 indeksleri (göç onlara güveniyor).
    CREATE INDEX idx_reservations_org_customer_date ON reservations (organization_id, customer_id, date DESC) WHERE customer_id IS NOT NULL;
    CREATE INDEX reservations_customer_formula_idx ON reservations (organization_id, customer_id, date DESC) WHERE formula IS NOT NULL;

    -- Realtime'ın taslağı: send() mesajı tabloya yazar (üretimdeki gibi).
    CREATE SCHEMA realtime;
    CREATE TABLE realtime.messages (
        id bigserial PRIMARY KEY, topic text NOT NULL, extension text NOT NULL DEFAULT 'broadcast',
        payload jsonb, event text, private boolean, inserted_at timestamptz NOT NULL DEFAULT now());
    CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true)
    RETURNS void LANGUAGE sql AS $f$
        INSERT INTO realtime.messages (topic, payload, event, private) VALUES (topic, payload, event, private) $f$;
`;

/** 100'ün zil fonksiyonu + iki tetikleyicisi (dosyanın kendisinden). */
const ring100 = () => {
    const m = read('supabase/100_live_doorbell.sql');
    return m.slice(m.indexOf('create or replace function public.ring_org()'), m.indexOf('commit;', m.indexOf('create or replace function public.ring_org()')));
};

const MIG = read('supabase/143_staff_api_hiz.sql');
const REG = read('supabase/tests/143_staff_api_hiz_regression.sql');

const fresh = async () => {
    const { PGlite } = await import(pathToFileURL(join(PGLITE_DIR, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
    const db = new PGlite();
    await db.exec(STUB);
    await db.exec(ring100());
    return db;
};

test('143 PGlite: temiz zincir + iki kez göç + regresyon geçiyor', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    const db = await fresh();
    await db.exec(MIG);
    await db.exec(MIG); // yeniden çalıştırılabilir
    await db.exec(REG);
    // Regresyon ROLLBACK ile bitiyor: iz kalmamalı.
    const left = await db.query('SELECT count(*)::int AS n FROM reservations');
    assert.equal(left.rows[0].n, 0);
});

test('143 PGlite: göçten ÖNCE zil yalnız `t` taşıyordu, sonra kimlik de taşıyor (t korunuyor)', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    const db = await fresh();
    await db.exec(`
        INSERT INTO auth.users (id) VALUES ('${OWNER}');
        INSERT INTO organizations (id, name, owner_id) VALUES ('${ORG}', 'z', '${OWNER}');
        INSERT INTO staff (id, organization_id, name) VALUES ('${ME}', '${ORG}', 'Elif');
        INSERT INTO reservations (id, user_id, organization_id, customer_name, customer_phone, date, start_time, end_time, service, staff_id)
        VALUES ('${RES}', '${OWNER}', '${ORG}', 'A', '1', '2026-11-12', '10:00', '11:00', 'Kesim', '${ME}');`);
    const before = await db.query('SELECT payload FROM realtime.messages ORDER BY id DESC LIMIT 1');
    assert.deepEqual(before.rows[0].payload, { t: 'reservations' });
    await db.exec(MIG);
    await db.exec(`UPDATE reservations SET date = '2026-11-13' WHERE id = '${RES}'`);
    const after = await db.query('SELECT payload FROM realtime.messages ORDER BY id DESC LIMIT 1');
    assert.deepEqual(after.rows[0].payload, {
        t: 'reservations', op: 'update', id: RES, staff_id: ME, date: '2026-11-13', prev_date: '2026-11-12',
    });
    await db.exec(`DELETE FROM reservations WHERE id = '${RES}'`);
    const del = await db.query('SELECT payload FROM realtime.messages ORDER BY id DESC LIMIT 1');
    assert.equal(del.rows[0].payload.op, 'delete');
    assert.equal(del.rows[0].payload.id, RES);
    // Ödeme gibi öteki tablolarda yalnız t/op/id.
    await db.exec(`INSERT INTO payments (organization_id) VALUES ('${ORG}')`);
    const pay = await db.query('SELECT payload FROM realtime.messages ORDER BY id DESC LIMIT 1');
    assert.deepEqual(Object.keys(pay.rows[0].payload).sort(), ['id', 'op', 't']);
});

test('143 PGlite: zil gövdesi kurulamazsa bile randevu yazılıyor', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    const db = await fresh();
    await db.exec(MIG);
    await db.exec(`CREATE OR REPLACE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true)
        RETURNS void LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'realtime kapalı'; END $f$;`);
    await db.exec(`
        INSERT INTO auth.users (id) VALUES ('${OWNER}');
        INSERT INTO organizations (id, name, owner_id) VALUES ('${ORG}', 'z', '${OWNER}');
        INSERT INTO reservations (user_id, organization_id, customer_name, customer_phone, date, start_time, end_time, service)
        VALUES ('${OWNER}', '${ORG}', 'A', '1', '2026-11-12', '10:00', '11:00', 'Kesim');`);
    const n = await db.query('SELECT count(*)::int AS n FROM reservations');
    assert.equal(n.rows[0].n, 1);
});

for (const [name, mutation, expected] of [
    ['iptal süzgeci', MIG.replace(/AND r\.status <> 'cancelled'/, ''), /1: Ayşe son geliş yanlış/],
    ['pencere süzgeci', MIG.replace(/AND r\.date >= p_from\n/, '\n'), /1: Cem pencere dışı sayıldı/],
    ['JSON null formül', MIG.replace(/\n\s+AND f\.formula NOT IN [^\n]+/, ''), /1: Deniz JSON null/],
    ['org süzgeci', MIG.replace(/WHERE c\.organization_id = p_org/, 'WHERE true'), /1: tam liste 4 olmalı/],
    ['izin', MIG.replace(/REVOKE ALL ON FUNCTION public\.staff_customer_book[^\n]+\n/, ''), /0: .* istemci rolüne açık/],
    ['zil kimliği', MIG.replace(/'staff_id', v_row -> 'staff_id',/, ''), /2: gövde eksik/],
]) {
    test(`143 PGlite söküm: ${name} → regresyon düşer`, { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
        assert.notEqual(mutation, MIG, 'söküm uygulanamadı');
        const db = await fresh();
        await db.exec(mutation);
        await assert.rejects(db.exec(REG), expected);
    });
}

// ── Eşdeğerlik: fonksiyon = eski JavaScript algoritması ─────────────────────

/** 143'ten önceki staff-api `customers` mantığı (c0963b0), satır satır. */
function legacyBook(people, visits, from) {
    const sorted = visits
        .filter((v) => v.status !== 'cancelled' && v.date >= from)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const latest = new Map();
    const hasFormula = new Set();
    for (const row of sorted) {
        if (!row.customer_id) continue;
        if (!latest.has(row.customer_id)) latest.set(row.customer_id, row);
        if (row.formula) hasFormula.add(row.customer_id);
    }
    return people.map((p) => {
        const last = latest.get(p.id);
        return {
            id: p.id,
            last_date: last?.date ?? null,
            last_service: last?.service ?? null,
            last_staff_id: last?.staff_id ?? null,
            has_formula: hasFormula.has(p.id),
            phone_tail: String(p.phone ?? '').replace(/\D/g, '').slice(-4),
        };
    });
}

test('143 PGlite eşdeğerlik: rastgele veride fonksiyon = eski algoritma', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    const db = await fresh();
    await db.exec(MIG);
    let seed = 143;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
    await db.exec(`INSERT INTO auth.users (id) VALUES ('${OWNER}');
        INSERT INTO organizations (id, name, owner_id) VALUES ('${ORG}', 'e', '${OWNER}'), ('${CUST}', 'öteki', '${OWNER}');
        INSERT INTO staff (id, organization_id, name) VALUES ('${ME}', '${ORG}', 'Elif');`);
    const people = [];
    for (let i = 0; i < 60; i++) {
        const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
        const phone = pick(['+90 (5', '0532 111 22 33', '12', '', '5x5y5z9']) + i;
        people.push({ id, name: `M${String(i).padStart(3, '0')}`, phone });
    }
    await db.query(`INSERT INTO customers (id, user_id, organization_id, name, phone)
        SELECT (p->>'id')::uuid, '${OWNER}', '${ORG}', p->>'name', p->>'phone' FROM jsonb_array_elements($1::jsonb) p`, [JSON.stringify(people)]);
    const visits = [];
    for (let i = 0; i < 400; i++) {
        const cust = rnd() < 0.85 ? pick(people).id : null;
        const day = Math.floor(rnd() * 900);
        // Aynı müşteride aynı gün iki ziyaret yok: eski algoritmada sıra belirsizdi.
        if (visits.some((v) => v.customer_id === cust && v.day === day)) continue;
        const date = new Date(Date.UTC(2026, 10, 12) - day * 864e5).toISOString().slice(0, 10);
        visits.push({
            day, customer_id: cust, date, service: pick(['Kesim', 'Boya', 'Fön']),
            status: pick(['completed', 'confirmed', 'cancelled', 'pending']),
            staff_id: rnd() < 0.7 ? ME : null,
            formula: pick([null, null, null, { ratio: '1:1' }, 'null', false, 0, '', {}]),
        });
    }
    await db.query(`INSERT INTO reservations (user_id, organization_id, customer_id, customer_name, customer_phone, date, start_time, end_time, service, status, staff_id, formula)
        SELECT '${OWNER}', '${ORG}', NULLIF(v->>'customer_id', '')::uuid, 'x', '1', (v->>'date')::date, '10:00', '11:00', v->>'service', v->>'status',
               NULLIF(v->>'staff_id', '')::uuid,
               CASE WHEN v->'formula' = 'null'::jsonb THEN NULL WHEN v->>'formula' = 'null' THEN 'null'::jsonb ELSE v->'formula' END
        FROM jsonb_array_elements($1::jsonb) v`, [JSON.stringify(visits.map((v) => ({ ...v, formula: v.formula === 'null' ? 'null' : v.formula })))]);
    // 'null' dizgesi JSON null olarak saklandı; JS tarafında da öyle görünür (PostgREST null döner).
    const jsVisits = visits.map((v) => ({ ...v, formula: v.formula === 'null' ? null : v.formula }));
    const from = '2024-11-12';
    const want = legacyBook(people.sort((a, b) => a.name.localeCompare(b.name)), jsVisits, from);
    const got = (await db.query(`SELECT id::text, to_char(last_date, 'YYYY-MM-DD') AS last_date, last_service, last_staff_id::text, has_formula, phone_tail
        FROM public.staff_customer_book('${ORG}', '${from}')`)).rows;
    assert.deepEqual(got, want);
    // Sayfalar birleşince tam liste.
    const pages = [];
    for (let off = 0; off < 60; off += 25) {
        pages.push(...(await db.query(`SELECT id::text FROM public.staff_customer_book('${ORG}', '${from}', 25, ${off})`)).rows.map((r) => r.id));
    }
    assert.deepEqual(pages, want.map((w) => w.id));
});
