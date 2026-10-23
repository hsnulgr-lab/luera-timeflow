import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    hashToken, newToken, subBelongsToClaim, subEmail, subIsLive, validCycle, validPlan, validToken,
} from '../supabase/functions/dodo-satin-al/talep.ts';

// Ödeme önce, hesap sonra (kullanıcı kararı 2026-10-23 · göç 127):
// lueratech.com "Planı seç" → /satin-al → Dodo → /hosgeldin → panel.
// Hesap Dodo'ya yazılan e-postayla kendiliğinden açılır; şifresiz giriş
// YALNIZ hesabı bu talep açtıysa ve yalnız jeton sahibine.

const oku = (yol) => readFileSync(new URL(`../${yol}`, import.meta.url), 'utf8');

test('talep jetonu: 32 bayt base64url, tabloda yalnız SHA-256', async () => {
    const t = newToken();
    assert.ok(validToken(t), t);
    assert.notEqual(newToken(), t, 'her seferinde yeni');
    const h = await hashToken(t);
    assert.match(h, /^[0-9a-f]{64}$/);
    assert.equal(await hashToken(t), h, 'aynı jeton aynı özet');
    for (const kotu of ['', 'kısa', `${t}x`, t.replace(/.$/, '+'), null, 42]) assert.equal(validToken(kotu), false, String(kotu));
});

test('paket ve dönem beyaz listede; istemciden başka bir şey geçmez', () => {
    for (const p of ['baslangic', 'pro', 'isletme']) assert.ok(validPlan(p));
    for (const p of ['', 'Pro', 'free', 'pro;drop', undefined]) assert.equal(validPlan(p), false);
    assert.ok(validCycle('monthly')); assert.ok(validCycle('yearly'));
    assert.equal(validCycle('weekly'), false);
});

test('abonelik talebe ait mi, canlı mı, e-postası ne', () => {
    const id = '6e206ea8-2fa8-4c9e-a2d2-aba3317a3c7e';
    const sub = { status: 'active', metadata: { claim_id: id, module: 'timeflow' }, customer: { email: '  Hsn@Ornek.COM ' } };
    assert.ok(subBelongsToClaim(sub, id));
    assert.equal(subBelongsToClaim(sub, '00000000-0000-4000-8000-000000000000'), false, 'başkasının talebi');
    assert.equal(subBelongsToClaim({ ...sub, metadata: { claim_id: id } }, id), false, 'modül şart');
    assert.ok(subIsLive(sub));
    for (const s of ['pending', 'failed', 'cancelled', 'on_hold', undefined]) assert.equal(subIsLive({ status: s }), false, String(s));
    assert.equal(subEmail(sub), 'hsn@ornek.com');
    assert.equal(subEmail({ customer: { email: 'adres-degil' } }), '');
    assert.equal(subEmail({}), '');
});

test('sunucu: herkese açık uç sunucuda karar verir, jeton adrese girmez', () => {
    const fn = oku('supabase/functions/dodo-satin-al/index.ts');
    assert.match(fn, /return_url: `\$\{appUrl\}\/hosgeldin`,/, 'jeton dönüş adresinde değil');
    assert.match(fn, /metadata: \{ module: MODULE, plan, cycle, claim_id: row\.id \},/);
    assert.match(fn, /\.insert\(\{ token_hash: await hashToken\(token\), plan, cycle, ip_hash: ipHash \}\)/, 'jetonun kendisi saklanmaz');
    assert.match(fn, /if \(\(count \?\? 0\) >= START_LIMIT\) return json\(\{ error: 'too_many' \}, 429\);/);
    assert.match(fn, /if \(!validPlan\(plan\) \|\| !validCycle\(cycle\)\) return json\(\{ error: 'invalid_plan' \}, 400\);/);
    // Giriş jetonu yalnız hesabı bu talep açtıysa.
    assert.match(fn, /if \(!current\.user_created\) return json\(\{ existing: true, email: maskEmail\(current\.email\) \}, 200\);\s*const login = await issueLogin\(admin, current\);/);
    // Ödeme sayfası rengi dodo-checkout'takiyle aynı.
    const tema = (s) => s.slice(s.indexOf('const TURUNCU = {'), s.indexOf('const CHECKOUT_THEME'));
    assert.equal(tema(fn), tema(oku('supabase/functions/dodo-checkout/index.ts')));
    assert.match(oku('supabase/config.toml'), /\[functions\.dodo-satin-al\]\nverify_jwt = false/);
});

test('talep bağlama: hesabı bu talep mi açtı — zamanla değil damgayla', () => {
    const m = oku('supabase/functions/_shared/odemeTalebi.ts');
    assert.match(m, /createUser\(\{\s*email, email_confirm: true, app_metadata: \{ checkout_claim: row\.id \},\s*\}\)/);
    assert.match(m, /const created = u\.user\.app_metadata\?\.checkout_claim === row\.id;/);
    assert.doesNotMatch(m, /created_at\s*[<>]/, 'zaman karşılaştırmasıyla giriş verilmez');
    // Yalnız ilk bağlayan yazar; giriş jetonu tek kullanımlık.
    assert.match(m, /\.eq\('id', row\.id\)\s*\.is\('attached_at', null\)\s*\.select\('id'\);/);
    assert.match(m, /\.update\(\{ login_issued_at: new Date\(\)\.toISOString\(\) \}\)\s*\.eq\('id', row\.id\)\s*\.is\('login_issued_at', null\)/);
    assert.match(m, /if \(!row\.user_created \|\| !row\.email \|\| row\.login_issued_at\) return null;/);
    // Var olan hesapta yalnız TEK işletme varsa eklenir.
    assert.match(m, /if \(!owned \|\| owned\.length !== 1\) \{/);
    assert.match(m, /if \(!subBelongsToClaim\(sub, row\.id\)\) return \{ kind: 'not_ours' \};\s*if \(!subIsLive\(sub\)\) return \{ kind: 'not_live' \};/);
});

test('webhook: işletmesiz ama talepli abonelik bağlanır, sonra her zamanki gibi aynaya', () => {
    const w = oku('supabase/functions/dodo-webhook/index.ts');
    const i = w.indexOf("if (!orgId && type.startsWith('subscription.') && typeof data.metadata?.claim_id === 'string')");
    const j = w.indexOf("if (!orgId) return await finish(admin, core, whId, null, 'no_org');");
    assert.ok(i > 0 && j > i, 'talep, no_org çıkışından ÖNCE');
    const blok = w.slice(i, j);
    assert.match(blok, /if \(r\.kind === 'retry'\) return fail\(/, 'geçici hata → 500, Dodo yeniden dener');
    assert.match(blok, /return await finish\(admin, core, whId, null, `claim_\$\{r\.kind\}`\);/, 'kalıcı durum 200 — uç kapanmaz');
});

test('uygulama: /satin-al ve /hosgeldin oturumsuz açılır', () => {
    const app = oku('src/App.tsx');
    const korumali = app.indexOf('<Route path="/" element={');
    for (const yol of ['/satin-al', '/hosgeldin']) {
        const k = app.indexOf(`<Route path="${yol}"`);
        assert.ok(k > 0 && k < korumali, yol);
        assert.doesNotMatch(app.slice(k, app.indexOf('/>', k)), /ProtectedRoute/, yol);
    }
    const sa = oku('src/pages/SatinAlPage.tsx');
    assert.match(sa, /saveClaimToken\(body\.token\);\s*window\.location\.replace\(body\.url\);/);
    assert.match(sa, /if \(s\.session\) \{\s*navigate\(`\/abonelik\?plan=\$\{plan\.id\}&cycle=\$\{cycle\}`, \{ replace: true \}\);/, 'oturumu olan kendi işletmesinden alır');
    const hg = oku('src/pages/HosgeldinPage.tsx');
    assert.match(hg, /verifyOtp\(\{ token_hash: body\.login, type: 'email' \}\)/);
    assert.match(hg, /const DONUS = '\/abonelik\?checkout=success';/, 'dönüş ödeme duvarından: kurulum ya da ana sayfa');
    assert.match(oku('src/lib/odemeTalebi.ts'), /sessionStorage\.setItem\(KEY/);
});

const PGLITE_DIR = process.env.PGLITE_DIR;
test('göç 127: iki kez uygulanır; istemci tabloyu göremez; e-postadan kullanıcı (PGlite)', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    const { join } = await import('node:path');
    const { pathToFileURL } = await import('node:url');
    const { PGlite } = await import(pathToFileURL(join(PGLITE_DIR, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
    const db = new PGlite();
    await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create schema auth;
        create table auth.users (id uuid primary key, email text, created_at timestamptz default now());
        create table organizations (id uuid primary key);
        insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111', 'Salon@Ornek.com');
    `);
    const goc = oku('supabase/127_odeme_talepleri.sql');
    await db.exec(goc);
    await db.exec(goc);

    const u = (await db.query("select public.checkout_claim_user('  salon@ornek.COM ') as id")).rows[0].id;
    assert.equal(u, '11111111-1111-4111-8111-111111111111', 'büyük/küçük harf ve boşluk duyarsız');
    assert.equal((await db.query("select public.checkout_claim_user('yok@ornek.com') as id")).rows[0].id, null);

    await db.exec("insert into checkout_claims (token_hash, plan, cycle) values ('a', 'pro', 'yearly')");
    await assert.rejects(db.exec("insert into checkout_claims (token_hash, plan, cycle) values ('a', 'pro', 'yearly')"), /unique|duplicate/i);
    await assert.rejects(db.exec("insert into checkout_claims (token_hash, plan, cycle) values ('b', 'free', 'monthly')"), /check/i);
    const r = (await db.query("select user_created, attached_at, login_issued_at, expires_at > now() + interval '47 hours' as uzun from checkout_claims")).rows[0];
    assert.deepEqual(r, { user_created: false, attached_at: null, login_issued_at: null, uzun: true });

    for (const rol of ['anon', 'authenticated']) {
        await db.exec(`set role ${rol}`);
        await assert.rejects(db.query('select * from checkout_claims'), /permission denied/i, rol);
        await assert.rejects(db.query("select public.checkout_claim_user('salon@ornek.com')"), /permission denied/i, `${rol} kullanıcı arayamaz`);
        await db.exec('reset role');
    }
    await db.close();
});
