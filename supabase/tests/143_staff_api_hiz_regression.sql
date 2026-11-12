-- ============================================================
-- 143_staff_api_hiz.sql için işlem içi regresyon testi
-- ============================================================
-- Göç uygulandıktan SONRA çalıştırılır; her fikstür sonda geri sarılır:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/143_staff_api_hiz_regression.sql
--
-- KURU KOŞU — göçü uygulamadan, aynı işlemin içinde dene ve hepsini geri sar:
--   { echo 'BEGIN;';
--     sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' -e '/^NOTIFY /d' supabase/143_staff_api_hiz.sql;
--     sed -e '/^BEGIN;$/d' supabase/tests/143_staff_api_hiz_regression.sql; } | psql … -f -
--
-- Kanıtlanan sözler:
--   0. Yapı: staff_customer_book yalnız service_role'e açık, search_path sabit.
--   1. Defter: müşteri başına son ziyaret (iptal ve pencere dışı sayılmıyor),
--      formül var mı (JSON null / pencere dışı / iptal sayılmıyor), telefonun
--      son dört hanesi, başka işletmenin müşterisi yok, ada göre sıra,
--      sayfa (limit/offset) ve sayfasız TAM liste.
--   2. Zil: rezervasyon güncellemesinin gövdesi `t` (1.0.1'in okuduğu) +
--      id/staff_id/date taşıyor; personel değişince prev_staff_id. (Yalnız
--      realtime.messages varsa.)
-- ============================================================

BEGIN;

-- ── 0) Yapı ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
    fn TEXT := 'public.staff_customer_book(uuid,date,integer,integer)';
BEGIN
    IF to_regprocedure(fn) IS NULL THEN
        RAISE EXCEPTION '0: % yok', fn;
    END IF;
    IF has_function_privilege('anon', fn, 'EXECUTE')
       OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
        RAISE EXCEPTION '0: % istemci rolüne açık', fn;
    END IF;
    IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
        RAISE EXCEPTION '0: % service_role''e kapalı', fn;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = to_regprocedure(fn)
          AND array_to_string(proconfig, ',') LIKE 'search_path=%'
    ) THEN
        RAISE EXCEPTION '0: % search_path sabit değil', fn;
    END IF;
END $$;

-- ── Fikstürler (süper kullanıcı) ────────────────────────────────────────────
-- Üretimde handle_new_user her kullanıcıya bir işletme açar; o tetikleyicinin
-- olmadığı yerde (PGlite taslağı) işletme burada açılır.
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
)
SELECT
    '00000000-0000-0000-0000-000000000000', fixture.id,
    'authenticated', 'authenticated', fixture.email, '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', ''
FROM (VALUES
    ('14300000-0000-4000-8000-000000000001'::UUID, 'hiz-143-1@timeflow.test'),
    ('14300000-0000-4000-8000-000000000002'::UUID, 'hiz-143-2@timeflow.test')
) AS fixture(id, email);

INSERT INTO public.organizations (name, owner_id)
SELECT 'r143', u.id
FROM (VALUES ('14300000-0000-4000-8000-000000000001'::UUID), ('14300000-0000-4000-8000-000000000002'::UUID)) AS u(id)
WHERE NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.owner_id = u.id);

SELECT set_config('t143.o1', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '14300000-0000-4000-8000-000000000001' ORDER BY created_at LIMIT 1), true);
SELECT set_config('t143.o2', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '14300000-0000-4000-8000-000000000002' ORDER BY created_at LIMIT 1), true);

INSERT INTO public.staff (id, organization_id, name, is_active)
VALUES
    ('14300000-0000-4000-8000-000000000201', current_setting('t143.o1')::UUID, 'Elif Kaya', true),
    ('14300000-0000-4000-8000-000000000202', current_setting('t143.o1')::UUID, 'Mert', true);

-- ── 1) Defter ───────────────────────────────────────────────────────────────
DO $$
DECLARE
    u_a uuid := '14300000-0000-4000-8000-000000000001';
    u_b uuid := '14300000-0000-4000-8000-000000000002';
    o_a uuid := current_setting('t143.o1')::uuid;
    o_b uuid := current_setting('t143.o2')::uuid;
    s_1 uuid := '14300000-0000-4000-8000-000000000201';
    s_2 uuid := '14300000-0000-4000-8000-000000000202';
    c_ayse uuid := gen_random_uuid();
    c_bora uuid := gen_random_uuid();
    c_cem uuid := gen_random_uuid();
    c_deniz uuid := gen_random_uuid();
    c_yabanci uuid := gen_random_uuid();
    v_from date := current_date - 730;
    r record;
    n int;
BEGIN
    INSERT INTO public.customers (id, user_id, organization_id, name, phone) VALUES
        (c_ayse,    u_a, o_a, 'Ayşe',  '+90 (532) 111-22-33'),
        (c_bora,    u_a, o_a, 'Bora',  '12'),
        (c_cem,     u_a, o_a, 'Cem',   '0555 000 0000'),
        (c_deniz,   u_a, o_a, 'Deniz', '0555 000 9999'),
        (c_yabanci, u_b, o_b, 'Ayşe B', '0555 111 1111');

    INSERT INTO public.reservations (user_id, organization_id, customer_id, customer_name, customer_phone, date, start_time, end_time, service, status, staff_id, formula) VALUES
        -- Ayşe: en yeni ziyaret İPTAL (sayılmaz); geçerli son = dün 14:00 (aynı gün 10:00'dan sonra); formül eski bir ziyarette.
        (u_a, o_a, c_ayse, 'Ayşe', '1', current_date,     '09:00', '10:00', 'İptal',   'cancelled', s_2, NULL),
        (u_a, o_a, c_ayse, 'Ayşe', '1', current_date - 1, '10:00', '11:00', 'Fön',     'completed', s_2, NULL),
        (u_a, o_a, c_ayse, 'Ayşe', '1', current_date - 1, '14:00', '15:00', 'Kesim',   'completed', s_1, NULL),
        (u_a, o_a, c_ayse, 'Ayşe', '1', current_date - 40,'10:00', '11:00', 'Boya',    'completed', s_1, '{"ratio":"1:1"}'),
        -- Cem: tek ziyareti pencere DIŞINDA (formüllü) → son geliş yok, formül yok.
        (u_a, o_a, c_cem,  'Cem',  '1', current_date - 800,'10:00','11:00', 'Boya',    'completed', s_1, '{"ratio":"1:2"}'),
        -- Deniz: formül JSON null (JS'te yanlış) ve iptal ziyarette dolu formül → formül YOK.
        (u_a, o_a, c_deniz,'Deniz','1', current_date - 3, '10:00', '11:00', 'Kesim',   'confirmed', NULL, 'null'::jsonb),
        (u_a, o_a, c_deniz,'Deniz','1', current_date - 2, '10:00', '11:00', 'Boya',    'cancelled', s_1, '{"ratio":"1:1"}'),
        -- Başka işletme: görünmemeli.
        (u_b, o_b, c_yabanci,'Ayşe B','1', current_date, '10:00', '11:00', 'Kesim', 'completed', NULL, '{"ratio":"1:1"}');

    SELECT count(*) INTO n FROM public.staff_customer_book(o_a, v_from);
    IF n <> 4 THEN RAISE EXCEPTION '1: tam liste 4 olmalı, % geldi', n; END IF;

    SELECT * INTO r FROM public.staff_customer_book(o_a, v_from) WHERE id = c_ayse;
    IF r.last_date IS DISTINCT FROM current_date - 1 OR r.last_service <> 'Kesim' OR r.last_staff_id IS DISTINCT FROM s_1 THEN
        RAISE EXCEPTION '1: Ayşe son geliş yanlış: % % %', r.last_date, r.last_service, r.last_staff_id;
    END IF;
    IF r.has_formula IS NOT TRUE THEN RAISE EXCEPTION '1: Ayşe formülü görünmüyor'; END IF;
    IF r.phone_tail <> '2233' THEN RAISE EXCEPTION '1: Ayşe telefon sonu %', r.phone_tail; END IF;

    SELECT * INTO r FROM public.staff_customer_book(o_a, v_from) WHERE id = c_bora;
    IF r.last_date IS NOT NULL OR r.last_service IS NOT NULL OR r.has_formula THEN
        RAISE EXCEPTION '1: Bora ziyaretsiz olmalı';
    END IF;
    IF r.phone_tail <> '12' THEN RAISE EXCEPTION '1: kısa telefon sonu %', r.phone_tail; END IF;

    SELECT * INTO r FROM public.staff_customer_book(o_a, v_from) WHERE id = c_cem;
    IF r.last_date IS NOT NULL OR r.has_formula THEN
        RAISE EXCEPTION '1: Cem pencere dışı sayıldı (% %)', r.last_date, r.has_formula;
    END IF;

    SELECT * INTO r FROM public.staff_customer_book(o_a, v_from) WHERE id = c_deniz;
    IF r.has_formula THEN RAISE EXCEPTION '1: Deniz JSON null / iptal formülü sayıldı'; END IF;
    IF r.last_date IS DISTINCT FROM current_date - 3 OR r.last_staff_id IS NOT NULL THEN
        RAISE EXCEPTION '1: Deniz son geliş yanlış (%)', r.last_date;
    END IF;

    IF EXISTS (SELECT 1 FROM public.staff_customer_book(o_a, v_from) WHERE id = c_yabanci) THEN
        RAISE EXCEPTION '1: başka işletmenin müşterisi göründü';
    END IF;

    -- Sıra ada göre; sayfa.
    IF (SELECT array_agg(name) FROM public.staff_customer_book(o_a, v_from)) <> ARRAY['Ayşe','Bora','Cem','Deniz'] THEN
        RAISE EXCEPTION '1: sıra ada göre değil: %', (SELECT array_agg(name) FROM public.staff_customer_book(o_a, v_from));
    END IF;
    IF (SELECT array_agg(name) FROM public.staff_customer_book(o_a, v_from, 2, 1)) <> ARRAY['Bora','Cem'] THEN
        RAISE EXCEPTION '1: sayfa (2, 1) yanlış';
    END IF;
    IF (SELECT count(*) FROM public.staff_customer_book(o_a, v_from, 2, 4)) <> 0 THEN
        RAISE EXCEPTION '1: son sayfanın ötesi boş olmalı';
    END IF;
END $$;

-- ── 2) Zil gövdesi ──────────────────────────────────────────────────────────
DO $$
DECLARE
    u uuid := '14300000-0000-4000-8000-000000000001';
    o uuid := current_setting('t143.o1')::uuid;
    s_1 uuid := '14300000-0000-4000-8000-000000000201';
    s_2 uuid := '14300000-0000-4000-8000-000000000202';
    rid uuid;
    body jsonb;
BEGIN
    IF to_regclass('realtime.messages') IS NULL THEN
        RAISE NOTICE '2: realtime.messages yok — zil bölümü atlandı';
        RETURN;
    END IF;
    INSERT INTO public.reservations (user_id, organization_id, customer_name, customer_phone, date, start_time, end_time, service, status, staff_id)
        VALUES (u, o, 'Zil', '1', current_date, '10:00', '11:00', 'Kesim', 'confirmed', s_1)
        RETURNING id INTO rid;

    UPDATE public.reservations SET staff_id = s_2 WHERE id = rid;

    SELECT m.payload INTO body FROM realtime.messages m
    WHERE m.topic = 'org:' || o::text
    ORDER BY m.inserted_at DESC, m.payload ->> 'op' DESC
    LIMIT 1;
    IF body IS NULL THEN RAISE EXCEPTION '2: zil çalmadı'; END IF;
    IF body ->> 't' IS DISTINCT FROM 'reservations' THEN RAISE EXCEPTION '2: t alanı bozuldu: %', body; END IF;
    IF body ->> 'id' IS DISTINCT FROM rid::text
       OR body ->> 'staff_id' IS DISTINCT FROM s_2::text
       OR body ->> 'prev_staff_id' IS DISTINCT FROM s_1::text
       OR body ->> 'date' IS DISTINCT FROM current_date::text
       OR body ->> 'op' IS DISTINCT FROM 'update' THEN
        RAISE EXCEPTION '2: gövde eksik: %', body;
    END IF;
    IF body ? 'customer_name' OR body ? 'customer_phone' THEN
        RAISE EXCEPTION '2: gövde veri taşıyor: %', body;
    END IF;
END $$;

ROLLBACK;
