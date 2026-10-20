import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { computeAccess, shownAccess, shownEnd } from '../supabase/functions/_shared/entitlement.ts';
import { coreStatus, decide, isTrialPeriod, needsMineNow, PERIOD_TOLERANCE_MS } from '../supabase/functions/dodo-webhook/durum.ts';

/*
 * Abonelik gerçeği TimeFlow'da, Core kopya — 123 · devir 10 §10 (2026-10-19).
 *
 * Eylül'de LUERA Core düştü, webhook günlerce 500 döndü, Dodo ucu KAPATTI ve
 * 8 hafta tek abonelik olayı gelmedi. Bu dosya üç şeyi kilitler:
 *   1. Ayna, olay türüne değil aboneliğin ANLIK GÖRÜNTÜSÜNE göre yazılır;
 *      eski olay geri sarmaz, başka abonelik karışmaz (`durum.ts`).
 *   2. SQL kapısı (`has_timeflow_access`) ile TS kapısı (`computeAccess`)
 *      aynı örneklerde aynı cevabı verir — gerçek Postgres'te (PGlite).
 *      PGLITE_DIR verilmezse o test atlanır:
 *        PGLITE_DIR=<pglite kurulu dizin> node --test tests/abonelik-yerel.test.mjs
 *   3. Para yolunda çalışma anında Core'a gidilmez.
 */

const H = 3_600_000;
const DAY = 24 * H;
const NOW = Date.parse('2026-10-19T12:00:00Z');
const iso = (t) => new Date(t).toISOString();

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** Dodo Subscription nesnesinin okunan alanları. */
function sub(over = {}) {
    return {
        subscription_id: 'sub_A',
        status: 'active',
        created_at: iso(NOW - 3 * DAY),
        next_billing_date: iso(NOW + 27 * DAY),
        trial_period_days: 0,
        cancel_at_next_billing_date: false,
        cancelled_at: null,
        customer: { customer_id: 'cus_1' },
        metadata: { organization_id: '6d93e1c4-8dd9-49ad-824f-f44ce6da0d97', plan: 'pro', cycle: 'monthly' },
        ...over,
    };
}

// ── 1 · Anlık görüntüden ayna ───────────────────────────────────────────────

test('ilk etkinleşme: kimlikler, plan ve dönem sonu (+tolerans) yazılır', () => {
    const d = decide('subscription.active', sub(), iso(NOW), null, NOW);
    assert.equal(d.kind, 'apply');
    assert.equal(d.patch.state, 'active');
    assert.equal(d.patch.dodo_subscription_id, 'sub_A');
    assert.equal(d.patch.dodo_customer_id, 'cus_1');
    assert.equal(d.patch.plan, 'pro');
    assert.equal(d.patch.cycle, 'monthly');
    assert.equal(d.patch.expires_at, iso(NOW + 27 * DAY + PERIOD_TOLERANCE_MS));
    assert.equal(d.patch.trial_ends_at, null);
    assert.equal(d.patch.grace_until, null);
    assert.equal(d.patch.last_event, 'subscription.active');
    assert.equal(d.enteredGrace, false);
    assert.equal(d.replaced, null);
});

test('deneme dönemi "trial" yazılır, deneme bitince "active"', () => {
    const created = NOW - 1 * DAY;
    const trial = sub({ trial_period_days: 7, created_at: iso(created), next_billing_date: iso(created + 7 * DAY) });
    const d1 = decide('subscription.active', trial, iso(NOW), null, NOW);
    assert.equal(d1.patch.state, 'trial');
    assert.equal(d1.patch.trial_ends_at, d1.patch.expires_at);

    // İlk tahsilat: dönem bir ay ileri kaydı, trial_period_days hâlâ 7.
    const paid = sub({ trial_period_days: 7, created_at: iso(created), next_billing_date: iso(created + 37 * DAY) });
    const d2 = decide('subscription.renewed', paid, iso(NOW + 6 * DAY), { state: 'trial', grace_until: null, dodo_subscription_id: 'sub_A', dodo_event_at: iso(NOW) }, NOW + 6 * DAY);
    assert.equal(d2.patch.state, 'active');
    assert.equal(d2.patch.trial_ends_at, null);
});

test('askıdan dönen ödeyen salon "deneme"ye DÜŞMEZ (bulgu 9)', () => {
    // trial_period_days aboneliğin kalıcı alanı; eski kod her `active`
    // olayında ona bakıp ödeyeni denemeye çeviriyordu.
    const created = NOW - 90 * DAY;
    const back = sub({ trial_period_days: 7, created_at: iso(created), next_billing_date: iso(NOW + 30 * DAY) });
    assert.equal(isTrialPeriod(back), false);
    const d = decide('subscription.active', back, iso(NOW), { state: 'grace', grace_until: iso(NOW + DAY), dodo_subscription_id: 'sub_A', dodo_event_at: iso(NOW - DAY) }, NOW);
    assert.equal(d.patch.state, 'active');
    assert.equal(d.patch.grace_until, null, 'ek süre kalkar');
});

test('ödeme alınamadı → ek süre; tekrar gelen askı olayı süreyi UZATMAZ', () => {
    const cur = { state: 'active', grace_until: null, dodo_subscription_id: 'sub_A', dodo_event_at: iso(NOW - DAY) };
    const d1 = decide('subscription.on_hold', sub({ status: 'on_hold' }), iso(NOW), cur, NOW);
    assert.equal(d1.patch.state, 'grace');
    assert.equal(d1.patch.grace_until, iso(NOW + 2 * DAY));
    assert.equal(d1.enteredGrace, true, 'sahibine bildirim gider');

    const inGrace = { ...cur, state: 'grace', grace_until: d1.patch.grace_until, dodo_event_at: iso(NOW) };
    const d2 = decide('subscription.updated', sub({ status: 'on_hold' }), iso(NOW + DAY), inGrace, NOW + DAY);
    assert.equal(d2.patch.grace_until, d1.patch.grace_until);
    assert.equal(d2.enteredGrace, false, 'ikinci bildirim yok');
});

test('Dodo ek süresi (past_due) varsa onun son günü kullanılır', () => {
    const deadline = iso(NOW + 5 * DAY);
    const d = decide('subscription.past_due', sub({ status: 'past_due', past_due_ends_at: deadline }), iso(NOW), null, NOW);
    assert.equal(d.patch.state, 'grace');
    assert.equal(d.patch.grace_until, deadline);
});

test('iptal durumu değiştirmez: erişim dönem sonuna kadar sürer', () => {
    const cur = { state: 'active', grace_until: null, dodo_subscription_id: 'sub_A', dodo_event_at: iso(NOW - DAY) };
    const d = decide('subscription.cancelled', sub({ status: 'cancelled', cancelled_at: iso(NOW) }), iso(NOW), cur, NOW);
    assert.equal(d.kind, 'apply');
    assert.equal('state' in d.patch, false);
    assert.equal(d.patch.cancel_at_period_end, true);
    assert.equal(d.patch.cancelled_at, iso(NOW));
});

test('dönem sonu iptali ve iptalden vazgeçme bayrağı taşınır', () => {
    const cur = { state: 'active', grace_until: null, dodo_subscription_id: 'sub_A', dodo_event_at: iso(NOW - DAY) };
    const on = decide('subscription.updated', sub({ cancel_at_next_billing_date: true }), iso(NOW), cur, NOW);
    assert.equal(on.patch.cancel_at_period_end, true);
    assert.equal(on.patch.state, 'active');
    const off = decide('subscription.updated', sub({ cancel_at_next_billing_date: false }), iso(NOW + H), { ...cur, dodo_event_at: iso(NOW) }, NOW + H);
    assert.equal(off.patch.cancel_at_period_end, false);
    assert.equal(off.patch.cancelled_at, null);
});

test('süresi dolan, kurulamayan ve duraklatılan abonelik kapıyı kapatır', () => {
    for (const status of ['expired', 'failed', 'paused']) {
        const d = decide(`subscription.${status}`, sub({ status }), iso(NOW), null, NOW);
        assert.equal(d.patch.state, 'locked', status);
        assert.equal(d.patch.grace_until, null, status);
    }
});

test('ESKİ olay aynayı geri sarmaz (sırasız teslim)', () => {
    const cur = { state: 'active', grace_until: null, dodo_subscription_id: 'sub_A', dodo_event_at: iso(NOW) };
    const d = decide('subscription.on_hold', sub({ status: 'on_hold' }), iso(NOW - H), cur, NOW);
    assert.deepEqual(d, { kind: 'skip', outcome: 'stale' });
});

test('başka aboneliğin olayı işletmeyi kilitlemez; yenisi etkinleşince eskisi devredilir', () => {
    const cur = { state: 'active', grace_until: null, dodo_subscription_id: 'sub_B', dodo_event_at: iso(NOW - DAY) };
    // Eski A'nın "süresi doldu" olayı — işletmenin aboneliği artık B.
    assert.deepEqual(
        decide('subscription.expired', sub({ subscription_id: 'sub_A', status: 'expired' }), iso(NOW), cur, NOW),
        { kind: 'skip', outcome: 'other_subscription' });
    // Yeni C etkinleşti (B'den sonra açıldı): aynaya C yazılır, B Dodo'da kapatılır.
    const bNow = { found: true, status: 'on_hold', created_at: iso(NOW - 40 * DAY) };
    const d = decide('subscription.active', sub({ subscription_id: 'sub_C', created_at: iso(NOW - H) }), iso(NOW), cur, NOW, bNow);
    assert.equal(d.kind, 'apply');
    assert.equal(d.patch.dodo_subscription_id, 'sub_C');
    assert.equal(d.replaced, 'sub_B');
});

// ── En yeni abonelik kazanır (devir 10 §10, 2026-10-20) ─────────────────────
// Test kipinde yaşandı: furkan@luera.ai işletmesinde 4 aktif abonelik.
// "Son gelen active kazanır" kuralında 9 Kasım'da eskinin yenilemesi
// 20 Ekim'de alınan yeniyi iptal edecekti.

const YENI = { state: 'active', grace_until: null, dodo_subscription_id: 'sub_YENI', dodo_event_at: iso(NOW - DAY) };
const yeniNow = (status = 'active') => ({ found: true, status, created_at: iso(NOW - DAY) });

test('eski kopyanın yenilemesi yeniyi İPTAL ETMEZ; eski kopya kapatılır', () => {
    const eski = sub({ subscription_id: 'sub_ESKI', created_at: iso(NOW - 70 * DAY) });
    assert.equal(needsMineNow(eski, YENI), true);
    const d = decide('subscription.renewed', eski, iso(NOW), YENI, NOW, yeniNow());
    assert.deepEqual(d, { kind: 'skip', outcome: 'older_subscription', cancel: 'sub_ESKI' });
});

test('yeni abonelik olay zamanı aynadakinden eski olsa da devralır', () => {
    // İki aboneliğin olay saatleri karşılaştırılamaz: eskinin son olayı
    // yeninin "active" olayından sonra gelmiş olabilir.
    const cur = { ...YENI, dodo_subscription_id: 'sub_ESKI', dodo_event_at: iso(NOW) };
    const eskiNow = { found: true, status: 'active', created_at: iso(NOW - 70 * DAY) };
    const d = decide('subscription.active', sub({ subscription_id: 'sub_YENI', created_at: iso(NOW - 2 * H) }), iso(NOW - H), cur, NOW, eskiNow);
    assert.equal(d.kind, 'apply');
    assert.equal(d.patch.dodo_subscription_id, 'sub_YENI');
    assert.equal(d.replaced, 'sub_ESKI');
});

test('aynadaki abonelik kapanmışsa ya da Dodo\'da yoksa yenisi iptalsiz devralır', () => {
    const gelen = sub({ subscription_id: 'sub_C', created_at: iso(NOW - 90 * DAY) });
    for (const mineNow of [{ found: false }, yeniNow('cancelled'), yeniNow('expired'), yeniNow('failed')]) {
        const d = decide('subscription.active', gelen, iso(NOW), YENI, NOW, mineNow);
        assert.equal(d.kind, 'apply', JSON.stringify(mineNow));
        assert.equal(d.patch.dodo_subscription_id, 'sub_C');
        assert.equal(d.replaced, null, 'kapatılacak bir şey yok');
    }
});

test('karşılaştırılamayan başka abonelik hiçbir şeyi değiştirmez ve iptal etmez', () => {
    const gelen = sub({ subscription_id: 'sub_C' });
    // Aynadakinin hâli verilmedi (webhook okumadı) — tahminle devir YOK.
    assert.deepEqual(decide('subscription.active', gelen, iso(NOW), YENI, NOW), { kind: 'skip', outcome: 'other_subscription' });
    // Tarih yok: kimin yeni olduğu bilinmiyor.
    assert.deepEqual(
        decide('subscription.active', sub({ subscription_id: 'sub_C', created_at: undefined }), iso(NOW), YENI, NOW, yeniNow()),
        { kind: 'skip', outcome: 'other_subscription' });
});

test('aynadakinin hâli yalnız başka abonelik "active" gelince okunur', () => {
    assert.equal(needsMineNow(sub({ subscription_id: 'sub_YENI' }), YENI), false, 'aynı abonelik');
    assert.equal(needsMineNow(sub({ subscription_id: 'sub_C', status: 'on_hold' }), YENI), false, 'aktif değil');
    assert.equal(needsMineNow(sub(), null), false, 'ayna boş');
    assert.equal(needsMineNow(sub({ subscription_id: 'sub_C' }), YENI), true);
});

test('tarihsiz yük dönem sonunu SİLMEZ (süresiz abonelik olmaz)', () => {
    const d = decide('subscription.active', sub({ next_billing_date: undefined }), iso(NOW), null, NOW);
    assert.equal('expires_at' in d.patch, false);
});

test('pending ve bilinmeyen durum yalnız kimlikleri yazar', () => {
    const d = decide('subscription.updated', sub({ status: 'pending' }), iso(NOW), null, NOW);
    assert.equal('state' in d.patch, false);
    assert.equal(d.patch.dodo_subscription_id, 'sub_A');
});

test('Core kopyasının durumu aynadan türetilir', () => {
    assert.equal(coreStatus('trial', null), 'trial');
    assert.equal(coreStatus('active', null), 'active');
    assert.equal(coreStatus('grace', null), 'past_due');
    assert.equal(coreStatus('locked', 'subscription.failed'), 'cancelled');
    assert.equal(coreStatus('locked', 'subscription.expired'), 'expired');
    assert.equal(coreStatus('none', null), null);
});

// ── 2 · SQL kapısı = TS kapısı (gerçek Postgres) ────────────────────────────

const SAMPLES = [
    ['satır yok', null],
    ['deneme sürüyor', { state: 'trial', expires_at: 72 * H }],
    ['deneme bitti', { state: 'trial', expires_at: -H }],
    ['aktif', { state: 'active', expires_at: 480 * H }],
    ['aktif dönemi geçmiş', { state: 'active', expires_at: -H }],
    ['süresiz (demo)', { state: 'active', expires_at: null }],
    ['ek süre, dönem geçmiş', { state: 'grace', expires_at: -24 * H, grace_until: 24 * H }],
    ['ek süre bitti', { state: 'grace', expires_at: -72 * H, grace_until: -24 * H }],
    ['ek süre tarihsiz', { state: 'grace', expires_at: 24 * H, grace_until: null }],
    ['ek süre bitti, dönem ileride', { state: 'grace', expires_at: 24 * H, grace_until: -H }],
    ['kilit, tarih ileride', { state: 'locked', expires_at: 2400 * H }],
    ['none', { state: 'none' }],
];

const PGLITE_DIR = process.env.PGLITE_DIR;

test('SQL kapısı ile computeAccess aynı örneklerde aynı cevabı verir (PGlite)', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    const { PGlite } = await import(pathToFileURL(join(PGLITE_DIR, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
    const db = new PGlite();
    await db.exec(`
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
        END $$;
        -- Supabase'in varsayılanı: yeni tablolar istemci rollerine AÇIK doğar
        -- (096'nın sebebi). Bu olmadan defterin kapalılığı boşa ölçülürdü.
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
        CREATE TABLE organizations (id uuid PRIMARY KEY);
        CREATE TABLE app_secrets (key text PRIMARY KEY, value text);
        CREATE FUNCTION auth_user_org_ids() RETURNS SETOF uuid LANGUAGE sql STABLE AS $f$ SELECT NULL::uuid WHERE false $f$;
        INSERT INTO app_secrets VALUES ('ENTITLEMENT_ENFORCE', 'true');
    `);

    const now = Date.now();
    const at = (d) => (d === null || d === undefined ? null : new Date(now + d).toISOString());
    const ids = [];
    const rows = [];
    for (let i = 0; i < SAMPLES.length; i++) {
        const id = `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`;
        ids.push(id);
        const s = SAMPLES[i][1];
        rows.push(s && { state: s.state, expires_at: at(s.expires_at), grace_until: at(s.grace_until) });
    }

    async function sqlAnswers() {
        const out = [];
        for (const id of ids) {
            const r = await db.query('SELECT public.has_timeflow_access($1::uuid) AS ok', [id]);
            out.push(r.rows[0].ok);
        }
        return out;
    }

    await db.exec(read('supabase/086_entitlement.sql'));
    for (let i = 0; i < ids.length; i++) {
        await db.query('INSERT INTO organizations VALUES ($1)', [ids[i]]);
        if (rows[i]) {
            await db.query('INSERT INTO org_entitlement (organization_id, state, expires_at, grace_until) VALUES ($1, $2, $3, $4)',
                [ids[i], rows[i].state, rows[i].expires_at, rows[i].grace_until]);
        }
    }
    const ts = rows.map((r) => computeAccess(r, now).ok);

    // Kontrol: 086 bu örneklerde AYRIŞIYORDU — test ayrışmayı yakalayabiliyor.
    const old = await sqlAnswers();
    const diverged = SAMPLES.filter((_, i) => old[i] !== ts[i]).map(([n]) => n);
    assert.deepEqual(diverged, ['ek süre, dönem geçmiş']);

    await db.exec(read('supabase/123_abonelik_yerel_kaynak.sql'));
    const now123 = await sqlAnswers();
    for (let i = 0; i < SAMPLES.length; i++) {
        assert.equal(now123[i], ts[i], `${SAMPLES[i][0]}: SQL ${now123[i]} ≠ TS ${ts[i]}`);
    }

    // ENFORCE kapalıyken herkes geçer.
    await db.exec(`UPDATE app_secrets SET value = 'false' WHERE key = 'ENTITLEMENT_ENFORCE'`);
    assert.ok((await sqlAnswers()).every(Boolean));

    // Defter istemciye kapalı: politika yok, rol izni yok.
    const grants = await db.query(`SELECT grantee, privilege_type FROM information_schema.role_table_grants
        WHERE table_name = 'dodo_events' AND grantee IN ('anon', 'authenticated')`);
    assert.deepEqual(grants.rows, []);
    // Aynı Dodo aboneliği iki işletmeye yazılamaz.
    await db.query(`UPDATE org_entitlement SET dodo_subscription_id = 'sub_X' WHERE organization_id = $1`, [ids[1]]);
    await assert.rejects(
        db.query(`UPDATE org_entitlement SET dodo_subscription_id = 'sub_X' WHERE organization_id = $1`, [ids[3]]),
        /duplicate key|uq_org_entitlement_dodo_sub/);
    await db.close();
});

// ── 3 · Para yolunda Core yok ───────────────────────────────────────────────

const fnSrc = (name) => read(`supabase/functions/${name}/index.ts`);

test('iptal, silme ve abonelik ekranı Core\'a gitmez', () => {
    for (const name of ['account-delete', 'billing-status', 'dodo-checkout']) {
        assert.doesNotMatch(fnSrc(name), /CORE_/, `${name}: çalışma anında Core'a bağlı`);
    }
});

test('webhook: ayna önce, Core sonra ve Core hatası Dodo\'ya yansımaz', () => {
    const hook = fnSrc('dodo-webhook');
    const core = read('supabase/functions/dodo-webhook/core.ts');
    // Ana akış Core tablolarına hiç yazmıyor; kopya ayrı modülde.
    assert.doesNotMatch(hook, /from\('subscriptions'\)|from\('billing_events'\)/);
    assert.ok(hook.indexOf('mirrorEntitlement(admin, orgId, decision.patch)') < hook.indexOf('async function finish('));
    // Core modülü yanıt üretmez, süre sınırlıdır, kuyruktan yeniden dener.
    assert.doesNotMatch(core, /new Response|json\(/);
    assert.match(core, /AbortSignal\.timeout\(BUDGET_MS\)/);
    assert.match(core, /\.is\('core_synced_at', null\)/);
    // Ayna yazılamazsa 500 → Dodo yeniden dener; kalıcı bütünlük hatası 500 DEĞİL.
    assert.match(hook, /return fail\('ayna yazılamadı', mirrorErr\)/);
    assert.match(hook, /startsWith\('23'\)/);
    // Silinmiş işletmenin ve işletmesiz olayın cevabı 200.
    assert.match(hook, /'org_gone'/);
    assert.match(hook, /'no_org'/);
    // En yeni kazanır: aynadakinin hâli okunur; geçici hatada Dodo yeniden
    // dener; eski kopya da, yerine yenisi geçen de Dodo'da kapatılır.
    assert.match(hook, /decide\(type, data, eventAt, current, Date\.now\(\), mineNow\)/);
    assert.match(hook, /if \(mineNow === 'retry'\) return fail\(/);
    assert.match(hook, /if \(decision\.cancel\) await cancelOther\(admin, decision\.cancel,/);
    assert.match(hook, /await cancelOther\(admin, decision\.replaced,/);
    const dodo = read('supabase/functions/_shared/dodo.ts');
    assert.match(dodo, /res\.status === 404\) return \{ kind: 'missing' \}/);
});

test('mirrorEntitlement hatayı YUTMAZ', () => {
    const ent = read('supabase/functions/_shared/entitlement.ts');
    assert.match(ent, /return error \?\? null;/);
});

test('checkout: işletme doğrulanır, süren aboneliğe ikinci abonelik açılmaz', () => {
    const co = fnSrc('dodo-checkout');
    assert.match(co, /resolveOrg\(admin, user\.id,/);
    assert.doesNotMatch(co, /\.limit\(1\)/);
    assert.match(co, /already_subscribed/);
    // "Kartı güncelle" yeni checkout değil; portal da değil (USD tutar ve
    // bütün abonelikler) — yalnız o aboneliğin kart sayfası.
    assert.match(co, /\/update-payment-method`/);
    assert.match(co, /type: 'new', return_url:/);
    assert.doesNotMatch(co, /customer-portal/);
    // Eski istemci ('portal') de aynı sayfaya gider.
    assert.match(co, /body\.action === 'card' \|\| body\.action === 'portal'/);
    const ui = read('src/pages/settings/bolumler/Abonelik.tsx');
    assert.match(ui, /onClick=\{\(\) => void updateCard\(\)\}>Kartı güncelle/);
});

test('istemci işletmeyi her faturalama çağrısında gönderir', () => {
    const hook = read('src/hooks/useBilling.ts');
    assert.match(hook, /invoke\('billing-status', \{ body: \{ orgId \} \}\)/);
    assert.match(hook, /body: \{ plan, cycle, orgId \}/);
    assert.match(hook, /body: \{ action: 'cancel', orgId \}/);
    assert.match(hook, /body: \{ action: 'card', orgId \}/);
});

// ── 4 · Hediye üyelik (ops/abonelik/hediye.sql) ─────────────────────────────
// Dodo'ya hiç gitmeyen abonelik: aynaya elle "aktif" yazılır. Koruması
// olmayan bir elle-yazma komutu, ödeyen bir abonenin kaydını ezip Dodo
// tahsilata devam ederken aynayı "hediye" yapabilirdi.

test('hediye: ver / süresiz / al ve üç koruma (PGlite)', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    const { PGlite } = await import(pathToFileURL(join(PGLITE_DIR, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
    const db = new PGlite();
    await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated;
        CREATE SCHEMA auth;
        CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
        CREATE TABLE organizations (id uuid PRIMARY KEY);
        CREATE TABLE organization_members (org_id uuid, user_id uuid, role text);
        CREATE TABLE app_secrets (key text PRIMARY KEY, value text);
        CREATE FUNCTION auth_user_org_ids() RETURNS SETOF uuid LANGUAGE sql STABLE AS $f$ SELECT NULL::uuid WHERE false $f$;
    `);
    await db.exec(read('supabase/086_entitlement.sql'));
    await db.exec(read('supabase/123_abonelik_yerel_kaynak.sql'));
    const u = (n) => `00000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
    const o = (n) => `10000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
    await db.exec(`
        INSERT INTO auth.users VALUES ('${u(1)}', 'ayse@ornek.com'), ('${u(2)}', 'oder@ornek.com'),
            ('${u(3)}', 'demo@lueratech.com'), ('${u(4)}', 'iki@ornek.com');
        INSERT INTO organizations VALUES ('${o(1)}'), ('${o(2)}'), ('${o(3)}'), ('${o(4)}'), ('${o(5)}');
        INSERT INTO organization_members VALUES ('${o(1)}', '${u(1)}', 'owner'), ('${o(2)}', '${u(2)}', 'owner'),
            ('${o(3)}', '${u(3)}', 'owner'), ('${o(4)}', '${u(4)}', 'owner'), ('${o(5)}', '${u(4)}', 'owner');
        INSERT INTO org_entitlement (organization_id, state, plan, expires_at, dodo_subscription_id, last_event)
            VALUES ('${o(2)}', 'active', 'pro', now() + interval '20 days', 'sub_X', 'subscription.renewed'),
                   ('${o(3)}', 'active', 'pro', NULL, NULL, 'demo_manual');
    `);

    const sql = read('ops/abonelik/hediye.sql');
    const doBlock = sql.match(/DO \$\$[\s\S]*?END \$\$;/)[0];
    const liste = sql.slice(sql.indexOf('-- Hediye listesi'));
    const calis = async (islem, email = '', gun = 0, plan = 'pro') => {
        await db.query(`SELECT set_config('hediye.islem', $1, false), set_config('hediye.email', $2, false),
            set_config('hediye.gun', $3, false), set_config('hediye.plan', $4, false)`, [islem, email, String(gun), plan]);
        await db.exec(doBlock);
    };
    const satir = async (n) => (await db.query(`SELECT state, plan, expires_at, last_event FROM org_entitlement WHERE organization_id = $1`, [o(n)])).rows[0];
    const kapi = async (n) => {
        await db.exec(`INSERT INTO app_secrets VALUES ('ENTITLEMENT_ENFORCE', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'`);
        return (await db.query(`SELECT has_timeflow_access($1::uuid) AS ok`, [o(n)])).rows[0].ok;
    };

    // Ver: 90 gün → aktif, kapı açık, ~90 gün sonra biter.
    await calis('ver', 'Ayse@Ornek.com', 90, 'isletme');
    let r = await satir(1);
    assert.equal(r.state, 'active');
    assert.equal(r.plan, 'isletme');
    assert.equal(r.last_event, 'comp_manual');
    const gun = (new Date(r.expires_at).getTime() - Date.now()) / DAY;
    assert.ok(gun > 89.9 && gun < 90.1, `bitiş ~90 gün olmalı (${gun})`);
    assert.equal(await kapi(1), true);

    // Süresiz.
    await calis('ver', 'ayse@ornek.com', 0, 'pro');
    assert.equal((await satir(1)).expires_at, null);

    // Al → kilit; ikinci "al" reddedilir.
    await calis('al', 'ayse@ornek.com');
    r = await satir(1);
    assert.deepEqual([r.state, r.last_event], ['locked', 'comp_revoked']);
    assert.equal(await kapi(1), false);
    await assert.rejects(calis('al', 'ayse@ornek.com'), /süren hediye üyelik yok/);

    // Korumalar: ödeyen abone, demo salon, belirsiz kişi/işletme.
    await assert.rejects(calis('ver', 'oder@ornek.com', 30), /süren bir Dodo aboneliği var/);
    assert.equal((await satir(2)).last_event, 'subscription.renewed', 'ödeyenin satırı değişmemeli');
    await assert.rejects(calis('ver', 'demo@lueratech.com', 30), /demo salon/);
    await assert.rejects(calis('ver', 'yok@ornek.com', 30), /0 kullanıcı/);
    await assert.rejects(calis('ver', 'iki@ornek.com', 30), /2 işletme/);
    await assert.rejects(calis('ver', 'ayse@ornek.com', 30, 'vip'), /plan baslangic/);

    const l = (await db.query(liste.replace(/;\s*$/, ''))).rows;
    assert.deepEqual(l.map((x) => [x.email, x.durum, x.son]), [['ayse@ornek.com', 'locked', 'comp_revoked']]);
    await db.close();
});

test('hediye üye ekranda tahsilat/kart/iptal görmez', () => {
    const bs = read('supabase/functions/billing-status/index.ts');
    assert.match(bs, /comp: row\.last_event === 'comp_manual' \|\| row\.last_event === 'demo_manual'/);
    const ui = read('src/pages/settings/bolumler/Abonelik.tsx');
    const blok = ui.slice(ui.indexOf("if (subscription?.comp && subscription.status === 'active')"), ui.indexOf('if (!hasSub && !onTrial)'));
    assert.ok(blok.length > 100, 'hediye dalı bulunamadı');
    assert.match(blok, /Hediye/);
    assert.match(blok, /'Süresiz'/);
    for (const yok of ['Kartı güncelle', 'Sonraki tahsilat', 'updateCard', 'cancelSubscription', 'formatTRY']) {
        assert.ok(!blok.includes(yok), `hediye dalında "${yok}" olmamalı`);
    }
    assert.match(read('src/pages/settings/bolumler/Ozet.tsx'), /sub\?\.comp && sub\.status === 'active'/);
    // Komut uzak satıra yalnız doğrulanmış değer gönderir.
    const sh = read('ops/abonelik/hediye.sh');
    assert.match(sh, /EMAIL" =~ \^\[A-Za-z0-9\._%\+-\]\+@/);
});

// ── 5 · Ekrandaki tarih = Dodo'nun gerçek günü ──────────────────────────────
// Test 1'de (2026-10-19) görüldü: Dodo "deneme 26 Ekim'de biter" dedi, ekran
// 29 Ekim yazacaktı — erişime eklenen 3 günlük tolerans tarihe karışıyordu.

test('gösterilen tarih toleransı içermez; erişim yine toleransa kadar sürer', () => {
    const now = Date.parse('2026-10-19T18:46:00Z');
    const real = Date.parse('2026-10-26T18:46:00Z');
    const row = { state: 'trial', expires_at: iso(real + PERIOD_TOLERANCE_MS), trial_ends_at: iso(real + PERIOD_TOLERANCE_MS), dodo_subscription_id: 'sub_T' };
    assert.equal(shownEnd(row), iso(real));
    const a = shownAccess(row, now);
    assert.equal(a.shownUntil, iso(real));
    assert.equal(a.shownDaysLeft, 7);
    // Erişim kararı değişmedi: gerçek günden 2 gün sonra hâlâ içeride.
    assert.equal(computeAccess(row, real + 2 * DAY).ok, true);
    assert.equal(computeAccess(row, real + 4 * DAY).ok, false);
    // Hediye/demo/elle onarım: Dodo yok, tolerans da yok → olduğu gibi.
    assert.equal(shownEnd({ state: 'active', expires_at: iso(real) }), iso(real));
    assert.equal(shownEnd({ state: 'active', expires_at: null }), null);
    assert.equal(shownEnd({ state: 'grace', expires_at: iso(real), grace_until: iso(real), dodo_subscription_id: 'x' }), null);
    // Erişimi bitmiş satır computeAccess'e düşer.
    assert.deepEqual(shownAccess({ state: 'trial', expires_at: iso(now - DAY), dodo_subscription_id: 'x' }, now), { shownUntil: iso(now - DAY), shownDaysLeft: 0 });
});

test('ekranlar gerçek günü kullanır; ₺0 kart doğrulaması fatura sayılmaz', () => {
    const bs = read('supabase/functions/billing-status/index.ts');
    assert.match(bs, /expires_at: shownEnd\(row as EntitlementRow\) \?\? row\.expires_at/);
    assert.match(bs, /Number\(e\.amount\) > 0/);
    assert.match(read('src/pages/settings/bolumler/Abonelik.tsx'), /const until = ent\.shownUntil \?\? subscription\?\.expires_at/);
    const banner = read('src/components/layout/SubscriptionBanner.tsx');
    assert.match(banner, /ent\.shownDaysLeft <= NUDGE_DAYS/);
    assert.match(banner, /ent\.shownUntil \? new Date\(ent\.shownUntil\)/);
    assert.ok(!/ent\.until\b/.test(read('src/pages/settings/bolumler/Ozet.tsx')), 'özet erişim tarihini göstermemeli');
    assert.match(read('src/pages/PaywallPage.tsx'), /Sonraki tahsilat: \{fullFmt\.format\(new Date\(ent\.shownUntil\)\)\}/);
});
