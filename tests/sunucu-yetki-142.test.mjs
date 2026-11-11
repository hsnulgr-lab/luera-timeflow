/**
 * Paket B · SUNUCU YETKİ VE BÜTÜNLÜK (142 · 2026-11-12).
 *
 *   1. visit.collect yetkisi: ekipte `payments:collect` yoksa 403; tek kişilikte açık.
 *   2. PIN denemesi karşılaştırmadan ÖNCE atomik ayrılıyor (staff_pin_reserve).
 *   3. Eşleştirme kodu: güvenilir IP (en sağdaki genel adres), IP'siz ortak
 *      kova, dakikalık genel tavan (staff_pair_reserve).
 *   4. organizations / organization_members'a doğrudan INSERT kapalı.
 *   5. Pasif personel bildirim almıyor (tetikleyici + send-push kapısı).
 *   6. Hesap silme başka işletmesi olan sahipte hiçbir şey silmiyor.
 *   7. visit.start no_show_at'i temizliyor; tahsilat staff_id yazıyor ve
 *      rezervasyonu kilitleyerek çift kayıt açmıyor; biten işin beklemesi /
 *      formülü yazılmıyor; gereksiz EXECUTE izinleri geri alındı.
 *
 * Göçün DAVRANIŞI gerçek Postgres'te (PGlite) sınanıyor: Supabase'in ilgili
 * kısmının taslağı + üretimdeki gerçek fonksiyonlar (086/123/121/124) + 003'ün
 * politikaları + 142 (iki kez: yeniden çalıştırılabilir) +
 * `supabase/tests/142_sunucu_yetki_regression.sql`. Korumalar tek tek
 * sökülünce regresyon düşmeli. PGLITE_DIR verilmezse o testler atlanır:
 *   PGLITE_DIR=<pglite kurulu dizin> node --test tests/sunucu-yetki-142.test.mjs
 * Üretimde son söz kuru koşu (regresyon dosyasının başındaki tarif).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { clientIp } from '../supabase/functions/staff-api/clientIp.ts';

const PGLITE_DIR = process.env.PGLITE_DIR;
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** Yorumsuz kaynak — iddialar yorumda geçen kelimeye takılmasın. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
const sql = (p) => read(p).replace(/--[^\n]*/g, '');

const MIG = 'supabase/142_sunucu_yetki_butunluk.sql';
const REG = 'supabase/tests/142_sunucu_yetki_regression.sql';
const api = code('supabase/functions/staff-api/index.ts');
const push = code('supabase/functions/send-push/index.ts');
const del = code('supabase/functions/account-delete/index.ts');
const m142 = sql(MIG);

/** `action === 'x'` bloğunun gövdesi (bir sonraki eyleme kadar). */
const block = (action) => {
    const start = api.indexOf(`if (action === '${action}')`);
    assert.ok(start > 0, `${action} yok`);
    const next = api.indexOf("if (action === '", start + 20);
    return api.slice(start, next > 0 ? next : undefined);
};

// ── 1 · visit.collect yetkisi ───────────────────────────────────────────────

test('1 · visit.collect: payments:collect yoksa ve tek kişilik değilse 403, hiçbir şeye dokunmadan', () => {
    const b = block('visit.collect');
    const gate = b.indexOf("if (!can(me.role, 'payments:collect'))");
    assert.ok(gate > 0, 'yetki kapısı yok');
    assert.match(b, /\.from\('organizations'\)\s*\.select\('solo'\)\.eq\('id', me\.organization_id\)/);
    assert.match(b, /if \(!org\?\.solo\) \{[\s\S]*?return json\(\{ error: 'forbidden' \}, 403\);/);
    // Kapı rezervasyon okunmadan ve para yazılmadan önce.
    assert.ok(gate < b.indexOf('loadOwnReservation('), 'kapı rezervasyondan sonra');
    assert.ok(gate < b.indexOf("rpc('staff_collect_payment'"), 'kapı yazmadan sonra');
});

test('1 · rol haritası: düz staff tahsil edemez, doctor/cashier edebilir', async () => {
    const { can } = await import('../supabase/functions/_shared/staffPerms.ts');
    assert.equal(can('staff', 'payments:collect'), false);
    assert.equal(can(null, 'payments:collect'), false);
    assert.equal(can('doctor', 'payments:collect'), true);
    assert.equal(can('cashier', 'payments:collect'), true);
});

// ── 2 · PIN ─────────────────────────────────────────────────────────────────

test('2 · PIN: iki uçta da hak karşılaştırmadan ÖNCE ayrılıyor; cevap biçimi aynı', () => {
    for (const action of ['session.start', 'pin.change']) {
        const b = block(action);
        const reserve = b.indexOf('reservePinAttempt(admin, member)');
        const compare = b.indexOf('safeEqual(await hashPin(');
        assert.ok(reserve > 0 && compare > 0 && reserve < compare, `${action}: ayırma karşılaştırmadan sonra`);
        assert.match(b, /json\(\{ error: 'locked', minutes: PIN_LOCK_MINUTES \}, 429\)/);
        assert.match(b, /json\(\{ error: 'invalid_credentials', remaining: PIN_MAX_ATTEMPTS - slot\.attempts \}, 401\)/);
        assert.match(b, /json\(\{ error: 'locked', until: slot\.lockedUntil \}, 429\)/);
        // Eski oku-artır-yaz yolu bu uçlarda kalmadı.
        assert.doesNotMatch(b, /\(member\.pin_attempts \|\| 0\) \+ 1/);
    }
    assert.match(api, /admin\.rpc\('staff_pin_reserve', \{\s*p_staff: member\.id,\s*p_max: PIN_MAX_ATTEMPTS,\s*p_lock_minutes: PIN_LOCK_MINUTES,/);
});

// ── 3 · Eşleştirme ──────────────────────────────────────────────────────────

test('3 · IP: istemcinin yazdığı soldaki değer değil, en sağdaki genel adres', () => {
    // Traefik gerçek adresi ekler, Kong kendi iç adresini.
    assert.equal(clientIp('85.105.1.2, 10.0.1.5'), '85.105.1.2');
    // İstemci sahte bir başlık gönderdi: sola düşer, sayılmaz.
    assert.equal(clientIp('1.2.3.4, 85.105.1.2, 172.18.0.3'), '85.105.1.2');
    assert.equal(clientIp('evil, 85.105.1.2, 192.168.1.1'), '85.105.1.2');
    assert.equal(clientIp('2a02:e0:1::5, fd00::1'), '2a02:e0:1::5');
    // Genel adres yoksa en sağdaki; hiç yoksa null (→ ortak kova).
    assert.equal(clientIp('10.0.0.1, 172.18.0.3'), '172.18.0.3');
    assert.equal(clientIp(null), null);
    assert.equal(clientIp(''), null);
    assert.match(api, /const ip = clientIp\(req\.headers\.get\('x-forwarded-for'\)\);/);
    assert.doesNotMatch(api, /x-forwarded-for'\)\?\.split\(','\)\[0\]/);
});

test('3 · redeem: hak kod aranmadan ÖNCE ayrılıyor; var olan kod hakkı geri veriyor', () => {
    const b = block('device.code.redeem');
    const reserve = b.indexOf('reservePairAttempt(admin, ip)');
    assert.ok(reserve > 0 && reserve < b.indexOf(".from('staff_device_codes')"), 'ayırma aramadan sonra');
    assert.match(b, /if \(lockMinutes !== null\) return json\(\{ error: 'pair_locked', minutes: lockMinutes \}, 429\);/);
    // Kapanmış kod ve bulunan kod: iki geri verme.
    assert.equal(b.split('refundPairAttempt(admin, ip)').length - 1, 2);
    assert.match(api, /p_global_max: PAIR_GLOBAL_MAX_PER_MINUTE/);
    assert.match(api, /const PAIR_GLOBAL_MAX_PER_MINUTE = 60;/);
});

// ── 4 · Politikalar ─────────────────────────────────────────────────────────

test('4 · istemci iki tabloya ekleme yapmıyor; organizations UPDATE\'i politikada kaldı (taramanın kilidi)', async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const root = new URL('../', import.meta.url);
    const walk = (dir, out = []) => {
        for (const name of readdirSync(new URL(dir, root))) {
            if (name === 'node_modules' || name.startsWith('.')) continue;
            const rel = `${dir}${name}`;
            const st = statSync(new URL(rel, root));
            if (st.isDirectory()) walk(`${rel}/`, out);
            else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(rel);
        }
        return out;
    };
    const files = [...walk('src/'), ...walk('mobile/src/'), ...walk('mobile/app/')];
    const hits = [];
    for (const f of files) {
        const text = read(f);
        const re = /from\(\s*['"](organizations|organization_members)['"]\s*\)([\s\S]{0,200})/g;
        let m;
        while ((m = re.exec(text))) {
            const chain = m[2].split(/;|\n\s*\n/)[0];
            // organizations: UPDATE meşru ve korunuyor (ModulesProvider,
            // useOrgProfile, telefonda işletme adı) — yasak yalnız ekleme.
            // organization_members: UPDATE de ekleme sayılır (user_id değişimi).
            const banned = m[1] === 'organizations' ? /\.(insert|upsert)\(/ : /\.(insert|upsert|update)\(/;
            if (banned.test(chain)) hits.push(`${f}: ${m[1]}`);
        }
    }
    assert.deepEqual(hits, [], 'istemci doğrudan yazıyor — 142 politikası onu bozar');
});

test('4 · 142: FOR ALL politikaları INSERT içermeyen parçalara bölündü', () => {
    assert.match(m142, /DROP POLICY IF EXISTS "orgs_owner_modify" ON public\.organizations;/);
    assert.match(m142, /DROP POLICY IF EXISTS "org_members_owner_manage" ON public\.organization_members;/);
    assert.match(m142, /CREATE POLICY "orgs_owner_update" ON public\.organizations\s+FOR UPDATE TO authenticated/);
    assert.match(m142, /CREATE POLICY "orgs_owner_delete" ON public\.organizations\s+FOR DELETE TO authenticated/);
    assert.match(m142, /CREATE POLICY "org_members_owner_delete" ON public\.organization_members\s+FOR DELETE TO authenticated/);
    assert.doesNotMatch(m142, /FOR (ALL|INSERT)/);
});

// ── 5 · Pasif personel ──────────────────────────────────────────────────────

test('5 · send-push: hedef personel aktif değilse abonelik bile okunmadan dönüyor', () => {
    const gate = push.indexOf("if (!member || member.is_active === false)");
    assert.ok(gate > 0, 'aktiflik kapısı yok');
    assert.ok(gate < push.indexOf(".from('push_subscriptions')"), 'kapı abonelik sorgusundan sonra');
    assert.match(push, /\.from\('staff'\)\s*\.select\('is_active'\)\s*\.eq\('id', target\.staffId\)\s*\.eq\('organization_id', organization_id\)/);
    assert.match(m142, /AFTER UPDATE OF is_active ON public\.staff[\s\S]*?WHEN \(OLD\.is_active IS DISTINCT FROM NEW\.is_active AND NEW\.is_active = false\)/);
});

// ── 6 · Hesap silme ─────────────────────────────────────────────────────────

test('6 · account-delete: başka işletmesi olan sahip → 409, Apple ve iptalden ÖNCE', () => {
    const guard = del.indexOf("return json({ error: 'other_orgs_owned' }, 409);");
    assert.ok(guard > 0, 'kapı yok');
    assert.match(del, /\.from\('organizations'\)\s*\.select\('id'\)\s*\.eq\('owner_id', userId\)\s*\.neq\('id', orgId\)/);
    assert.ok(guard > del.indexOf("if (role !== 'owner')"), 'kapı yetkiden önce');
    assert.ok(guard < del.indexOf('const appleStop = await appleStep();'), 'kapı Apple adımından sonra');
    assert.ok(guard < del.indexOf('cancelSubscription(admin, orgId)'), 'kapı iptalden sonra');
    assert.ok(guard < del.indexOf("from('organizations').delete()"), 'kapı silmeden sonra');
});

// ── 7 · Küçükler ────────────────────────────────────────────────────────────

test('7a · visit.start "gelmedi" damgasını temizliyor', () => {
    assert.match(block('visit.start'), /patch\.arrived_at = new Date\(\)\.toISOString\(\);\s*patch\.no_show_at = null;/);
});

test('7b/7c · visit.collect: staff_id işin personeli; yazma kilitli RPC üstünden', () => {
    const b = block('visit.collect');
    assert.match(b, /p_staff: res!\.staff_id \?\? null/);
    assert.doesNotMatch(b.replace(/else if \(missingRpc\(rpcErr\)\) \{[\s\S]*?\} else \{/, ''), /from\('payments'\)\.insert/);
    // Yarışta arada yazılan kısmi ödeme "zaten alındı" sayılmıyor.
    assert.match(b, /if \(\(Number\(out\.paid\) \|\| 0\) \+ 0\.005 < amount\) \{\s*return json\(\{ error: 'collect_in_kasa', reason: 'partial' \}, 409\);/);
    assert.match(m142, /FROM public\.reservations\s+WHERE id = p_reservation AND organization_id = p_org\s+FOR UPDATE;/);
    assert.match(m142, /AND voided_at IS NULL/);
});

test('7d · visit.wait ve visit.formula biten işe yazmıyor', () => {
    assert.match(block('visit.wait'), /\.eq\('organization_id', me\.organization_id\)\s*\.neq\('status', 'completed'\)/);
    const f = block('visit.formula');
    assert.match(f, /\.update\(\{ formula \}\)\s*\.eq\('id', res!\.id\)\s*\.eq\('organization_id', me\.organization_id\)\s*\.neq\('status', 'completed'\)/);
    assert.match(f, /if \(!updated\) return json\(\{ error: 'formula_locked' \}, 409\);/);
});

test('7e · EXECUTE: purge yalnız service_role; RLS fonksiyonları authenticated\'ta kaldı', () => {
    assert.match(m142, /REVOKE ALL ON FUNCTION public\.purge_expired_device_codes\(\) FROM PUBLIC, anon, authenticated;/);
    assert.match(m142, /REVOKE ALL ON FUNCTION public\.has_timeflow_access\(uuid\) FROM PUBLIC, anon;/);
    assert.match(m142, /REVOKE ALL ON FUNCTION public\.org_module_enabled\(uuid, text\) FROM PUBLIC, anon;/);
    assert.doesNotMatch(m142, /has_timeflow_access\(uuid\) FROM PUBLIC, anon, authenticated/);
    // Telefon 1.0.1 bunu doğrudan çağırıyor — authenticated'tan alınırsa kırılır.
    assert.match(code('mobile/src/api/auth.ts'), /supabase\.rpc\('has_timeflow_access', \{ p_org: orgId \}\)/);
});

test('yeni RPC\'ler istemciye kapalı, yalnız service_role', () => {
    for (const sig of [
        'staff_pin_reserve(uuid, integer, integer)',
        'staff_pair_reserve(text, integer, integer, integer)',
        'staff_pair_refund(text)',
        'staff_collect_payment(uuid, uuid, uuid, text, numeric, text, uuid)',
    ]) {
        const esc = sig.replace(/[()]/g, '\\$&');
        assert.match(m142, new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC, anon, authenticated;`), sig);
        assert.match(m142, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc} TO service_role;`), sig);
    }
    assert.match(m142, /SECURITY DEFINER\s+SET search_path = public, pg_temp/);
});

// ── PGlite ──────────────────────────────────────────────────────────────────

const STUB = `
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    -- Supabase varsayılanı: yeni fonksiyon ve tablolar istemci rollerine açık.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE TABLE auth.users (
        instance_id uuid, id uuid PRIMARY KEY, aud text, role text, email text, encrypted_password text,
        email_confirmed_at timestamptz, raw_app_meta_data jsonb NOT NULL DEFAULT '{}',
        raw_user_meta_data jsonb NOT NULL DEFAULT '{}', created_at timestamptz, updated_at timestamptz,
        confirmation_token text, email_change text, email_change_token_new text, recovery_token text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
        SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $f$;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

    CREATE TABLE organizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text UNIQUE,
        owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        solo boolean NOT NULL DEFAULT false, modules jsonb, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE organization_members (
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        role text NOT NULL DEFAULT 'member', created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (org_id, user_id));
    CREATE FUNCTION auth_user_org_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public AS $f$ SELECT org_id FROM organization_members WHERE user_id = auth.uid() $f$;
    CREATE TABLE settings (user_id uuid UNIQUE, organization_id uuid, business_name text);
    CREATE TABLE app_secrets (key text PRIMARY KEY, value text);
    CREATE TABLE staff (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name text, role text, is_active boolean NOT NULL DEFAULT true, pin text,
        session_epoch integer NOT NULL DEFAULT 1, pin_attempts integer NOT NULL DEFAULT 0,
        pin_locked_until timestamptz, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE reservations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id uuid, customer_name text, customer_phone text, date date, start_time time, end_time time,
        service text, status text, staff_id uuid REFERENCES staff(id), is_paid boolean DEFAULT false);
    CREATE TABLE payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id uuid, reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
        type text NOT NULL DEFAULT 'service', description text,
        amount numeric(10,2) NOT NULL CHECK (amount >= 0),
        method text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','card','transfer','other')),
        paid_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
        staff_id uuid REFERENCES staff(id) ON DELETE SET NULL, voided_at timestamptz);
    CREATE TABLE push_subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        staff_id uuid REFERENCES staff(id) ON DELETE CASCADE,
        role text NOT NULL DEFAULT 'staff', endpoint text NOT NULL UNIQUE,
        p256dh text, auth text, kind text NOT NULL DEFAULT 'web');
    CREATE TABLE staff_pair_attempts (
        ip text PRIMARY KEY, failures integer NOT NULL DEFAULT 0,
        locked_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE staff_pair_attempts ENABLE ROW LEVEL SECURITY;
    CREATE TABLE staff_device_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now());
    CREATE FUNCTION public.purge_expired_device_codes() RETURNS integer LANGUAGE sql SECURITY DEFINER
        SET search_path = public AS $f$ SELECT 0 $f$;
`;

const fresh = async () => {
    const { PGlite } = await import(pathToFileURL(join(PGLITE_DIR, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
    const db = new PGlite();
    await db.exec(STUB);
    // Üretimdeki gerçek fonksiyonlar.
    await db.exec(read('supabase/086_entitlement.sql'));
    await db.exec(read('supabase/123_abonelik_yerel_kaynak.sql'));
    await db.exec(read('supabase/121_sosyal_giris.sql'));
    await db.exec('CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();');
    await db.exec(read('supabase/124_telefon_denemesi.sql'));
    const m053 = read('supabase/053_module_rls.sql');
    await db.exec(m053.slice(0, m053.indexOf('-- Masa modülü')));
    // 003'ün iki tablo politikaları — 142'nin daralttığı hâl.
    const m003 = read('supabase/003_multi_tenant_orgs.sql');
    await db.exec(m003.slice(m003.indexOf('-- 4) RLS'), m003.indexOf('-- 5) Her mevcut user')));
    return db;
};

const regression = read(REG);
/** Yapı bölümü (0) sökülmüş regresyon: davranış kontrolleri tek başına düşmeli. */
const behaviourOnly = `BEGIN;\n${regression.slice(regression.indexOf('-- ── Fikstürler'))}`;

const runOk = async (db, text = regression) => {
    const out = await db.exec(text);
    const flat = JSON.stringify(out.map((r) => r.rows));
    assert.match(flat, /sunucu yetki \(142\) regression: ok/);
};

test('142 PGlite: temiz zincir + iki kez göç + regresyon geçiyor', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    const db = await fresh();
    // Göç öncesi kusur gerçekten var: sahip kendi işletmesine yabancı ekleyebiliyor.
    await db.exec(`
        INSERT INTO auth.users (id, email) VALUES ('99999999-0000-4000-8000-000000000001', 'once@test'),
                                                  ('99999999-0000-4000-8000-000000000002', 'yabanci@test');
        SELECT set_config('request.jwt.claims', '{"sub":"99999999-0000-4000-8000-000000000001"}', false);
        SET ROLE authenticated;
        INSERT INTO organization_members (org_id, user_id, role)
        SELECT id, '99999999-0000-4000-8000-000000000002', 'admin' FROM organizations
         WHERE owner_id = '99999999-0000-4000-8000-000000000001';
        RESET ROLE;
        DELETE FROM auth.users WHERE id IN ('99999999-0000-4000-8000-000000000001', '99999999-0000-4000-8000-000000000002');
    `);
    await db.exec(read(MIG));
    await db.exec(read(MIG)); // yeniden çalıştırılabilir
    await runOk(db);
    await runOk(db); // regresyon geri sarıyor: ikinci koşu da temiz
});

const sokum = [
    ['eski FOR ALL üye politikası geri gelirse', `
        CREATE POLICY "org_members_owner_manage" ON public.organization_members FOR ALL TO authenticated
            USING (org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()))
            WITH CHECK (org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));`,
     /5: sahip kendi işletmesine başka kullanıcı ekleyebildi/],
    ['eski FOR ALL işletme politikası geri gelirse', `
        CREATE POLICY "orgs_owner_modify" ON public.organizations FOR ALL TO authenticated
            USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());`,
     /5: doğrudan işletme açılabildi/],
    ['üyelikte UPDATE açılırsa', `
        CREATE POLICY "x" ON public.organization_members FOR UPDATE TO authenticated
            USING (org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));`,
     /5: üyelik başka kullanıcıya çevrildi/],
    ['tetikleyici yoksa', 'DROP TRIGGER trg_142_staff_deactivate_push ON public.staff;',
     /4: pasif personelin aboneliği kaldı/],
    ['tahsilatta var olan kontrolü yoksa', `
        CREATE OR REPLACE FUNCTION public.staff_collect_payment(p_org uuid, p_reservation uuid, p_customer uuid,
            p_description text, p_amount numeric, p_method text, p_staff uuid) RETURNS jsonb LANGUAGE plpgsql AS $f$
        DECLARE v jsonb; BEGIN
            IF NOT EXISTS (SELECT 1 FROM reservations WHERE id = p_reservation AND organization_id = p_org) THEN
                RETURN jsonb_build_object('status', 'not_found'); END IF;
            INSERT INTO payments (organization_id, customer_id, reservation_id, type, description, amount, method, staff_id)
            VALUES (p_org, p_customer, p_reservation, 'service', p_description, p_amount, p_method, p_staff)
            RETURNING jsonb_build_object('id', id) INTO v;
            RETURN jsonb_build_object('status', 'inserted', 'payment', v); END $f$;`,
     /3: ikinci çağrı var olanı dönmedi/],
    ['geri alınmış tahsilat sayılırsa', `
        CREATE OR REPLACE FUNCTION public.staff_collect_payment(p_org uuid, p_reservation uuid, p_customer uuid,
            p_description text, p_amount numeric, p_method text, p_staff uuid) RETURNS jsonb LANGUAGE plpgsql AS $f$
        DECLARE v jsonb; BEGIN
            PERFORM 1 FROM reservations WHERE id = p_reservation AND organization_id = p_org FOR UPDATE;
            IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
            SELECT jsonb_build_object('id', id) INTO v FROM payments WHERE reservation_id = p_reservation LIMIT 1;
            IF v IS NOT NULL THEN RETURN jsonb_build_object('status', 'exists', 'payment', v, 'paid', 100); END IF;
            INSERT INTO payments (organization_id, customer_id, reservation_id, type, description, amount, method, staff_id)
            VALUES (p_org, p_customer, p_reservation, 'service', p_description, p_amount, p_method, p_staff)
            RETURNING jsonb_build_object('id', id) INTO v;
            RETURN jsonb_build_object('status', 'inserted', 'payment', v); END $f$;`,
     /3: geri alınmış kayıt yeni tahsilatı engelledi/],
    ['PIN eşikte kilitlemezse', `
        CREATE OR REPLACE FUNCTION public.staff_pin_reserve(p_staff uuid, p_max integer, p_lock_minutes integer)
        RETURNS TABLE (reserved boolean, attempts integer, locked_until timestamptz) LANGUAGE sql AS $f$
            UPDATE staff SET pin_attempts = pin_attempts + 1 WHERE id = p_staff
            RETURNING true, pin_attempts, NULL::timestamptz $f$;`,
     /1: 5\. ayırma kilidi basmadı/],
    ['IP\'siz istek sınırsız kalırsa', `
        CREATE OR REPLACE FUNCTION public.staff_pair_reserve(p_ip text, p_max integer, p_lock_minutes integer, p_global_max integer)
        RETURNS TABLE (locked boolean, minutes integer) LANGUAGE plpgsql AS $f$
        BEGIN
            IF coalesce(p_ip, '') = '' THEN RETURN QUERY SELECT false, 0; RETURN; END IF;
            INSERT INTO staff_pair_attempts (ip, failures) VALUES (p_ip, 1)
                ON CONFLICT (ip) DO UPDATE SET failures = staff_pair_attempts.failures + 1;
            RETURN QUERY SELECT (SELECT failures > p_max FROM staff_pair_attempts WHERE ip = p_ip), 15;
        END $f$;`,
     /2: IP'siz istekler sınırsız/],
];

for (const [name, mutation, expected] of sokum) {
    test(`142 PGlite söküm: ${name} → regresyon düşer`, { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
        const db = await fresh();
        await db.exec(read(MIG));
        await db.exec(mutation);
        await assert.rejects(db.exec(behaviourOnly), expected);
    });
}

test('142 PGlite söküm: yapı bölümü izin gevşemesini yakalıyor', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    for (const [mutation, expected] of [
        ['GRANT EXECUTE ON FUNCTION public.staff_pin_reserve(uuid, integer, integer) TO authenticated;', /istemci rolüne açık/],
        ['GRANT EXECUTE ON FUNCTION public.has_timeflow_access(uuid) TO anon;', /anon'a açık/],
        ['REVOKE EXECUTE ON FUNCTION public.org_module_enabled(uuid, text) FROM authenticated;', /authenticated'a kapandı/],
        ['GRANT EXECUTE ON FUNCTION public.purge_expired_device_codes() TO anon;', /istemci rolüne açık/],
    ]) {
        const db = await fresh();
        await db.exec(read(MIG));
        await db.exec(mutation);
        await assert.rejects(db.exec(regression), expected);
    }
});
