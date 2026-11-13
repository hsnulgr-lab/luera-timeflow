/**
 * "Müşteri bekliyor" Live Activity · göç 144 (2026-11-13).
 *
 * Göçün DAVRANIŞI gerçek Postgres'te (PGlite) sınanıyor: Supabase'in ilgili
 * kısmının taslağı (pg_net kuyruğu dahil) + 118 + 120 + 144 (iki kez:
 * yeniden çalıştırılabilir) + `supabase/tests/144_musteri_bekliyor_regression.sql`.
 * Korumalar tek tek sökülünce regresyon düşmeli. PGLITE_DIR verilmezse
 * PGlite testleri atlanır:
 *   PGLITE_DIR=<pglite kurulu dizin> node --test tests/musteri-bekliyor-144.test.mjs
 * Üretimde son söz kuru koşu (regresyon dosyasının başındaki tarif).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const PGLITE_DIR = process.env.PGLITE_DIR;
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sqlCode = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();

const MIG = 'supabase/144_musteri_bekliyor_live_activity.sql';
const REG = 'supabase/tests/144_musteri_bekliyor_regression.sql';
const m144 = read(MIG);
const m118 = read('supabase/118_personel_bildirim_gunu.sql');

const fnOf = (src) => {
    const start = src.indexOf('CREATE OR REPLACE FUNCTION public.notify_push_on_reservation()');
    return src.slice(start, src.indexOf('$$;', start) + 3);
};
/** Bir olay bloğu: başlık yorumundan bir sonraki numaralı başlığa kadar. */
const eventOf = (fn, n) => {
    const start = fn.indexOf(`    -- ${n})`);
    assert.ok(start > 0, `${n}) yok`);
    const next = fn.slice(start + 8).search(/\n {4}-- \d\)/);
    return fn.slice(start, next > 0 ? start + 8 + next : fn.indexOf('RETURN NEW;', start));
};

test('144 tek işlemde, şemayı tazeliyor, sıra notu var', () => {
    assert.match(m144, /^BEGIN;$/m);
    assert.match(m144, /^COMMIT;$/m);
    assert.match(m144, /NOTIFY pgrst, 'reload schema';/);
    assert.match(m144, /send-live-activity yüklenmeden 1\.0\.3 telefonu jeton kaydederse/);
});

test('118\'in öteki altı olayı BİREBİR — yalnız 3 değişti, 8 eklendi', () => {
    const before = fnOf(m118);
    const after = fnOf(m144);
    for (const n of [1, 4, 7, 2, 5, 6]) {
        assert.equal(sqlCode(eventOf(after, n)), sqlCode(eventOf(before, n)), `${n}) değişmiş`);
    }
    assert.match(sqlCode(eventOf(after, 8)), /'event', 'end'/);
});

test('3) jetonsuz yol 118\'in gövdesini AYNEN gönderiyor', () => {
    const old3 = sqlCode(eventOf(fnOf(m118), 3));
    const new3 = sqlCode(eventOf(fnOf(m144), 3));
    // 118'in gövdesi `v_arrived`a taşındı; içerik aynı.
    const body = old3.slice(old3.indexOf("jsonb_build_object( 'organization_id'"), old3.lastIndexOf(' );'));
    assert.ok(body.length > 100);
    assert.ok(new3.includes(`v_arrived := ${body};`), 'gövde değişmiş');
    assert.match(new3, /ELSE PERFORM net\.http_post\( url := v_url \|\| '\/send-push', headers := v_hdrs, body := v_arrived \);/);
    // Etkinlik yolu yalnız ekip düzeninde ve başlatma jetonu varken.
    assert.match(new3, /IF NOT v_solo AND EXISTS \( SELECT 1 FROM public\.live_activity_tokens t WHERE t\.organization_id = NEW\.organization_id AND t\.staff_id = NEW\.staff_id AND t\.kind = 'start' \) THEN/);
    assert.match(new3, /'fallback', v_arrived/);
});

test('jeton tablosu: RLS açık, politika yok, istemci rollerine kapalı; temizlik tetikleyicileri', () => {
    const c = sqlCode(m144);
    assert.match(c, /ALTER TABLE public\.live_activity_tokens ENABLE ROW LEVEL SECURITY;/);
    assert.match(c, /REVOKE ALL ON public\.live_activity_tokens FROM PUBLIC, anon, authenticated;/);
    assert.doesNotMatch(c, /CREATE POLICY/);
    assert.match(c, /organization_id UUID NOT NULL REFERENCES public\.organizations\(id\) ON DELETE CASCADE/);
    assert.match(c, /staff_id UUID NOT NULL REFERENCES public\.staff\(id\) ON DELETE CASCADE/);
    assert.match(c, /CREATE TRIGGER trg_144_staff_deactivate_la AFTER UPDATE OF is_active ON public\.staff/);
    assert.match(c, /CREATE TRIGGER trg_144_la_end_on_delete AFTER DELETE ON public\.reservations/);
    assert.match(c, /environment TEXT NOT NULL CHECK \(environment IN \('sandbox', 'production'\)\)/);
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
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
        SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $f$;

    -- pg_net'in taslağı: istek kuyruğa yazılıyor, gönderilmiyor.
    CREATE SCHEMA net;
    CREATE TABLE net.http_request_queue (
        id bigserial PRIMARY KEY, method text NOT NULL DEFAULT 'POST', url text NOT NULL,
        headers jsonb, body bytea, timeout_milliseconds integer NOT NULL DEFAULT 5000);
    CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb,
                                  headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000)
    RETURNS bigint LANGUAGE sql AS $f$
        INSERT INTO net.http_request_queue (url, headers, body, timeout_milliseconds)
        VALUES (url, headers, convert_to(body::text, 'UTF8'), timeout_milliseconds) RETURNING id $f$;

    CREATE TABLE organizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
        owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        solo boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
    -- handle_new_user'ın özü: her yeni kullanıcıya bir işletme.
    CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
        SET search_path = public AS $f$
        BEGIN INSERT INTO organizations (name, owner_id) VALUES (coalesce(NEW.email, 'x'), NEW.id); RETURN NEW; END $f$;
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

    CREATE TABLE app_secrets (key text PRIMARY KEY, value text);
    INSERT INTO app_secrets VALUES ('FUNCTIONS_BASE_URL', 'https://test.invalid/functions/v1'),
                                   ('PUSH_TRIGGER_SECRET', 'gizli');
    CREATE TABLE staff (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name text, role text, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE reservations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_name text, customer_phone text, date date, start_time time, end_time time,
        service text, status text, staff_id uuid REFERENCES staff(id), source text DEFAULT 'manual',
        notes text, customer_arrived_at timestamptz, arrived_at timestamptz, service_ended_at timestamptz,
        no_show_at timestamptz, is_paid boolean DEFAULT false);
`;

const fresh = async () => {
    const { PGlite } = await import(pathToFileURL(join(PGLITE_DIR, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
    const db = new PGlite();
    await db.exec(STUB);
    await db.exec(read('supabase/118_personel_bildirim_gunu.sql'));
    await db.exec(read('supabase/120_tohum_sessiz.sql'));
    return db;
};

const regression = read(REG);
const runOk = async (db, text = regression) => {
    const out = await db.exec(text);
    assert.match(JSON.stringify(out.map((r) => r.rows)), /musteri bekliyor \(144\) regression: ok/);
};

test('144 PGlite: temiz zincir + iki kez göç + regresyon geçiyor', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    const db = await fresh();
    await db.exec(m144);
    await db.exec(m144);
    await runOk(db);
    // Regresyon kendi işini geri sardı: kuyruk ve tablo boş.
    const left = await db.query('SELECT (SELECT count(*) FROM net.http_request_queue) AS q, (SELECT count(*) FROM live_activity_tokens) AS t');
    assert.deepEqual(left.rows[0], { q: 0, t: 0 });
});

test('144 PGlite: 118\'de (göç yok) regresyon düşüyor', { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
    const db = await fresh();
    await assert.rejects(db.exec(regression), /live_activity_tokens yok/);
});

/** Göçten bir koruma sökülünce regresyon düşmeli. */
const sabotage = [
    ['tek kişilik koşulu', (s) => s.replace('IF NOT v_solo AND EXISTS (', 'IF EXISTS ('), /3: tek kişilikte/],
    ['etkinlik yolunda send-push da', (s) => s.replace(
        "                    'fallback',        v_arrived\n                )\n            );\n",
        "                    'fallback',        v_arrived\n                )\n            );\n            PERFORM net.http_post(url := v_url || '/send-push', headers := v_hdrs, body := v_arrived);\n",
    ), /2: etkinlik yolunda send-push/],
    ['gelmedi bitirmiyor', (s) => s.replace('OR (OLD.no_show_at IS NULL AND NEW.no_show_at IS NOT NULL)', ''), /4: .*305/],
    ['silme tetikleyicisi yok', (s) => s.replace(/CREATE TRIGGER trg_144_la_end_on_delete[\s\S]*?EXECUTE FUNCTION public\.live_activity_end_on_delete\(\);/, ''), /4b: /],
    ['pasif personel', (s) => s.replace('DELETE FROM public.live_activity_tokens WHERE staff_id = NEW.id;', 'NULL;'), /5: /],
    ['politika açıldı', (s) => s.replace(
        'REVOKE ALL ON public.live_activity_tokens FROM PUBLIC, anon, authenticated;',
        'GRANT SELECT ON public.live_activity_tokens TO authenticated;',
    ), /0: .*istemci/],
];
for (const [name, edit, expected] of sabotage) {
    test(`144 PGlite söküm: ${name} → regresyon düşer`, { skip: !PGLITE_DIR && 'PGLITE_DIR yok' }, async () => {
        const broken = edit(m144);
        assert.notEqual(broken, m144, 'söküm uygulanamadı');
        const db = await fresh();
        await db.exec(broken);
        await assert.rejects(db.exec(regression), expected);
    });
}
