\set ON_ERROR_STOP on

-- ============================================================
-- 112_bekleme_damgasi.sql + 113_ekibe_gecis.sql için işlem içi regresyon testi
-- ============================================================
-- Göçler uygulandıktan SONRA çalıştırılır; her fikstür sonda geri sarılır:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/tek_v4_regression.sql
--
-- KURU KOŞU — göçleri uygulamadan, aynı işlemin içinde dene ve hepsini geri
-- sar. Göçlerin kendi BEGIN/COMMIT'i ve bu dosyanın BEGIN'i sökülüp tek
-- işleme diziliyor; sondaki ROLLBACK göçleri de geri alıyor:
--   { echo 'BEGIN;';
--     sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' supabase/112_bekleme_damgasi.sql;
--     sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' supabase/113_ekibe_gecis.sql;
--     sed -e '/^BEGIN;$/d' supabase/tests/tek_v4_regression.sql; } | psql … -f -
--
-- Kanıtlanan sözler:
--   112 · 1. Bekleme ya TAM (bitiş + süre) ya hiç; süre 1–240 dakika.
--   113 · 2. Ad zorunlu ve 80 harfi aşamaz; ad sorunu hiçbir şey yazdırmaz.
--         3. Tek kişilik işletme ilk çalışanı ekler ve AYNI işlemde ekip
--            düzenine geçer; çalışan doğru org'da, aktif, mesleğin rolüyle
--            (asistan hekimden önce) ve salonda kullanılmayan ilk renkle.
--         4. Kapı yalnız tek kişilik işletmenin: ikinci kez geçilmez, ekip
--            düzenindeki salon kullanamaz, başka org'a dokunamaz.
--         5. Org'u olmayan oturum reddedilir; anon çağıramaz.
--
-- Kullanıcı değiştirme: `request.jwt.claims` + `SET LOCAL ROLE authenticated`
-- — PostgREST'in her istekte yaptığının aynısı. Kullanıcı adına yapılan
-- denetimler DO bloklarında; geçici şemadaki yardımcı yalnız süper
-- kullanıcıyken çağrılıyor.
-- ============================================================

BEGIN;

-- ── 0) Yapı ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF (
        SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'reservations'
           AND ((column_name = 'wait_ends_at' AND data_type = 'timestamp with time zone')
             OR (column_name = 'wait_minutes' AND data_type = 'smallint'))
    ) <> 2 THEN
        RAISE EXCEPTION '112: bekleme sütunları eksik ya da tipleri yanlış';
    END IF;

    IF to_regprocedure('public.start_team(text,text)') IS NULL THEN
        RAISE EXCEPTION '113: start_team yok';
    END IF;

    -- INVOKER: RLS aynen geçerli; fonksiyon yeni bir yetki açmıyor.
    IF (SELECT prosecdef FROM pg_catalog.pg_proc
         WHERE oid = 'public.start_team(text,text)'::regprocedure) THEN
        RAISE EXCEPTION '113: start_team SECURITY DEFINER olmamalı';
    END IF;

    IF has_function_privilege('anon', 'public.start_team(text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION '113: anon start_team çağırabiliyor (094''ün dersi)';
    END IF;

    IF NOT has_function_privilege('authenticated', 'public.start_team(text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION '113: authenticated start_team çağıramıyor';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(
    expected_message TEXT,
    statement_sql TEXT,
    expected_state TEXT DEFAULT 'P0001'
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    got_message TEXT;
    got_state TEXT;
BEGIN
    BEGIN
        EXECUTE statement_sql;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS
            got_message = MESSAGE_TEXT,
            got_state = RETURNED_SQLSTATE;

        IF got_message IS DISTINCT FROM expected_message
           OR got_state IS DISTINCT FROM expected_state THEN
            RAISE EXCEPTION 'expected [%] %, got [%] % for: %',
                expected_state, expected_message, got_state, got_message, statement_sql;
        END IF;
        RETURN;
    END;

    RAISE EXCEPTION 'expected [%] %, but statement succeeded: %',
        expected_state, expected_message, statement_sql;
END;
$$;

-- ── Fikstürler (süper kullanıcı) ────────────────────────────────────────────
-- handle_new_user her auth fikstürü için bir org ve üyelik açar.
--   U1 · tek kişilik, sahibin satırı turuncu   → ekibe geçecek
--   U2 · ekip düzeninde                        → kapıyı kullanamaz
--   U3 · tek kişilik                           → hekim rolü
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
)
VALUES
    (
        '00000000-0000-0000-0000-000000000000',
        '11300000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated', 'tek-one@timeflow.test', '', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
        '', '', '', ''
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        '11300000-0000-4000-8000-000000000002',
        'authenticated', 'authenticated', 'tek-two@timeflow.test', '', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
        '', '', '', ''
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        '11300000-0000-4000-8000-000000000003',
        'authenticated', 'authenticated', 'tek-three@timeflow.test', '', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
        '', '', '', ''
    );

-- Org kimlikleri süper kullanıcıyken saklanıyor: kullanıcı adına yapılan
-- denetimlerde başka org'un satırı RLS yüzünden görünmez ve alt sorgu NULL
-- dönerdi — denetim bir şey kanıtlamadan geçerdi.
SELECT set_config('tek113.o1', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '11300000-0000-4000-8000-000000000001'), true);
SELECT set_config('tek113.o2', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '11300000-0000-4000-8000-000000000002'), true);
SELECT set_config('tek113.o3', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '11300000-0000-4000-8000-000000000003'), true);

-- 108'in "Yalnız ben"i: bayrak + sahibin satırı.
UPDATE public.organizations SET solo = true
 WHERE id IN (current_setting('tek113.o1')::UUID, current_setting('tek113.o3')::UUID);

INSERT INTO public.staff (id, organization_id, name, color)
VALUES
    ('11300000-0000-4000-8000-000000000201', current_setting('tek113.o1')::UUID, 'Derya Güzellik', '#FF5A1F'),
    ('11300000-0000-4000-8000-000000000203', current_setting('tek113.o3')::UUID, 'Tek Klinik', '#8B5CF6'),
    ('11300000-0000-4000-8000-000000000202', current_setting('tek113.o2')::UUID, 'Ekip Bir', '#5B7CC2');

INSERT INTO public.customers (id, user_id, organization_id, name, phone)
VALUES (
    '11300000-0000-4000-8000-000000000101',
    '11300000-0000-4000-8000-000000000001',
    current_setting('tek113.o1')::UUID,
    'Bekleme Bir', '05000001131'
);

INSERT INTO public.reservations (
    id, user_id, organization_id, customer_id, customer_name, customer_phone,
    date, start_time, end_time, service, status, staff_id
)
VALUES (
    '11300000-0000-4000-8000-000000000301',
    '11300000-0000-4000-8000-000000000001',
    current_setting('tek113.o1')::UUID,
    '11300000-0000-4000-8000-000000000101', 'Bekleme Bir', '05000001131',
    '2026-10-09', '13:00', '14:00', 'Boya', 'confirmed',
    '11300000-0000-4000-8000-000000000201'
);

-- ── 1) 112 · beklemenin şekli ───────────────────────────────────────────────
UPDATE public.reservations
   SET wait_ends_at = now() + interval '20 minutes', wait_minutes = 20
 WHERE id = '11300000-0000-4000-8000-000000000301';
UPDATE public.reservations
   SET wait_ends_at = now() + interval '240 minutes', wait_minutes = 240
 WHERE id = '11300000-0000-4000-8000-000000000301';
UPDATE public.reservations
   SET wait_ends_at = NULL, wait_minutes = NULL
 WHERE id = '11300000-0000-4000-8000-000000000301';

-- Yarım bekleme: bitiş var, süre yok (ve tersi).
SELECT pg_temp.assert_raises(
    'new row for relation "reservations" violates check constraint "reservations_wait_shape"',
    $sql$ UPDATE public.reservations SET wait_ends_at = now() WHERE id = '11300000-0000-4000-8000-000000000301' $sql$,
    '23514'
);
SELECT pg_temp.assert_raises(
    'new row for relation "reservations" violates check constraint "reservations_wait_shape"',
    $sql$ UPDATE public.reservations SET wait_minutes = 20 WHERE id = '11300000-0000-4000-8000-000000000301' $sql$,
    '23514'
);
-- Süre aralığın dışında.
SELECT pg_temp.assert_raises(
    'new row for relation "reservations" violates check constraint "reservations_wait_shape"',
    $sql$ UPDATE public.reservations SET wait_ends_at = now(), wait_minutes = 0 WHERE id = '11300000-0000-4000-8000-000000000301' $sql$,
    '23514'
);
SELECT pg_temp.assert_raises(
    'new row for relation "reservations" violates check constraint "reservations_wait_shape"',
    $sql$ UPDATE public.reservations SET wait_ends_at = now(), wait_minutes = 241 WHERE id = '11300000-0000-4000-8000-000000000301' $sql$,
    '23514'
);

-- ── 2) 113 · U1 — ad kuralları, sonra ekibe geçiş ───────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"11300000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
BEGIN
    PERFORM public.start_team('   ', 'Kuaför');
    RAISE EXCEPTION 'ret bekleniyordu (name_required)';
EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'P0001' OR SQLERRM <> 'name_required' THEN RAISE; END IF;
END;
$$;
DO $$
BEGIN
    PERFORM public.start_team(NULL, NULL);
    RAISE EXCEPTION 'ret bekleniyordu (name_required)';
EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'P0001' OR SQLERRM <> 'name_required' THEN RAISE; END IF;
END;
$$;
DO $$
BEGIN
    PERFORM public.start_team(repeat('a', 81), NULL);
    RAISE EXCEPTION 'ret bekleniyordu (name_too_long)';
EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'P0001' OR SQLERRM <> 'name_too_long' THEN RAISE; END IF;
END;
$$;

DO $$
DECLARE
    v_staff UUID;
    v_row RECORD;
BEGIN
    -- Ad sorunu HİÇBİR ŞEY yazdırmadı: işletme hâlâ tek kişilik, tek satır.
    IF (SELECT solo FROM public.organizations WHERE id = current_setting('tek113.o1')::UUID) IS NOT TRUE
       OR (SELECT count(*) FROM public.staff WHERE organization_id = current_setting('tek113.o1')::UUID) <> 1 THEN
        RAISE EXCEPTION 'reddedilen ad bir şey yazdırdı';
    END IF;

    v_staff := public.start_team('  Elif Demir  ', 'Diş hekimi asistanı');

    SELECT name, specialty, role, color, is_active, organization_id
      INTO v_row
      FROM public.staff WHERE id = v_staff;

    IF v_row.organization_id IS DISTINCT FROM current_setting('tek113.o1')::UUID THEN
        RAISE EXCEPTION 'çalışan yanlış org''a yazıldı';
    END IF;
    IF v_row.name IS DISTINCT FROM 'Elif Demir' THEN
        RAISE EXCEPTION 'ad kırpılmadı: [%]', v_row.name;
    END IF;
    IF v_row.specialty IS DISTINCT FROM 'Diş hekimi asistanı' THEN
        RAISE EXCEPTION 'meslek yazılmadı: [%]', v_row.specialty;
    END IF;
    -- 058'in kuralı: asistan hekimden ÖNCE soruluyor.
    IF v_row.role IS DISTINCT FROM 'assistant' THEN
        RAISE EXCEPTION 'rol yanlış: % (asistan bekleniyordu)', v_row.role;
    END IF;
    -- Sahibin rengi (#FF5A1F) kullanımda: paletin bir sonrakisi.
    IF v_row.color IS DISTINCT FROM '#E8973C' THEN
        RAISE EXCEPTION 'renk yanlış: % (#E8973C bekleniyordu)', v_row.color;
    END IF;
    IF v_row.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'çalışan pasif açıldı';
    END IF;

    -- Bayrak AYNI işlemde düştü.
    IF (SELECT solo FROM public.organizations WHERE id = current_setting('tek113.o1')::UUID) IS NOT FALSE THEN
        RAISE EXCEPTION 'işletme ekip düzenine geçmedi';
    END IF;
    IF (SELECT count(*) FROM public.staff WHERE organization_id = current_setting('tek113.o1')::UUID) <> 2 THEN
        RAISE EXCEPTION 'kadroda iki kişi bekleniyordu';
    END IF;
END;
$$;

-- İkinci kez geçilmez — ve ikinci dokunuş ikinci çalışan açmaz.
DO $$
BEGIN
    PERFORM public.start_team('Elif Demir', NULL);
    RAISE EXCEPTION 'ret bekleniyordu (already_team)';
EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'P0001' OR SQLERRM <> 'already_team' THEN RAISE; END IF;
END;
$$;

RESET ROLE;

-- ── 3) 113 · U2 — ekip düzenindeki salon kapıyı kullanamaz ──────────────────
SELECT set_config('request.jwt.claims', '{"sub":"11300000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
BEGIN
    PERFORM public.start_team('Sızan Kişi', NULL);
    RAISE EXCEPTION 'ret bekleniyordu (already_team)';
EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'P0001' OR SQLERRM <> 'already_team' THEN RAISE; END IF;
END;
$$;

RESET ROLE;

-- U2 hiçbir org'a satır ekleyemedi; U3'ün tek kişilik org'u yerinde.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.staff WHERE name = 'Sızan Kişi') THEN
        RAISE EXCEPTION 'reddedilen çağrı bir çalışan yazdı';
    END IF;
    IF (SELECT solo FROM public.organizations WHERE id = current_setting('tek113.o3')::UUID) IS NOT TRUE THEN
        RAISE EXCEPTION 'başka bir org''un bayrağı değişti';
    END IF;
END;
$$;

-- ── 4) 113 · U3 — meslekten rol ve renk ─────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"11300000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
    v_staff UUID;
BEGIN
    v_staff := public.start_team('Hekim Bir', 'Diş hekimi');
    IF (SELECT role FROM public.staff WHERE id = v_staff) IS DISTINCT FROM 'doctor' THEN
        RAISE EXCEPTION 'hekim rolü verilmedi';
    END IF;
    -- Sahibin rengi paletin dışında (#8B5CF6): paletin ilki.
    IF (SELECT color FROM public.staff WHERE id = v_staff) IS DISTINCT FROM '#FF5A1F' THEN
        RAISE EXCEPTION 'paletin ilk rengi bekleniyordu';
    END IF;
    -- Boş meslek NULL yazılıyor, boş metin değil.
    IF (SELECT specialty FROM public.staff WHERE id = v_staff) IS DISTINCT FROM 'Diş hekimi' THEN
        RAISE EXCEPTION 'meslek yazılmadı';
    END IF;
END;
$$;

RESET ROLE;

-- ── 5) 113 · org'u olmayan oturum ve anon ───────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"11300000-0000-4000-8000-000000000099","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
BEGIN
    PERFORM public.start_team('Kimse', NULL);
    RAISE EXCEPTION 'ret bekleniyordu (org_not_found)';
EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'P0001' OR SQLERRM <> 'org_not_found' THEN RAISE; END IF;
END;
$$;

RESET ROLE;

SET LOCAL ROLE anon;

DO $$
BEGIN
    PERFORM public.start_team('Anon', NULL);
    RAISE EXCEPTION 'ret bekleniyordu (permission denied for function start_team)';
EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '42501' OR SQLERRM <> 'permission denied for function start_team' THEN RAISE; END IF;
END;
$$;

RESET ROLE;

SELECT 'tek v4 (112 + 113) regression: ok' AS result;

ROLLBACK;
