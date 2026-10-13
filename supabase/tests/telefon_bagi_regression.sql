\set ON_ERROR_STOP on

-- ============================================================
-- 117_telefon_bagini_kopar.sql için işlem içi regresyon testi
-- ============================================================
-- Göç uygulandıktan SONRA çalıştırılır; her fikstür sonda geri sarılır:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/telefon_bagi_regression.sql
--
-- KURU KOŞU — göçü uygulamadan, aynı işlemin içinde dene ve hepsini geri sar:
--   { echo 'BEGIN;';
--     sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' supabase/117_telefon_bagini_kopar.sql;
--     sed -e '/^BEGIN;$/d' supabase/tests/telefon_bagi_regression.sql; } | psql … -f -
--
-- Kanıtlanan sözler:
--   1. `staff_devices` var; RLS açık, politika YOK; anon/authenticated
--      okuyamıyor ve yazamıyor; service_role yazabiliyor.
--   2. `staff.devices_cut_at` var.
--   3. Olay kısıtı `devices_cut`ı ve 110'un bütün değerlerini kabul ediyor;
--      uydurma değeri reddediyor.
--   4. Satır yaşam döngüsü: telefon açılır, son giren yazılır, kişinin
--      telefonları iptal edilir; kopma anı ve oturum kuşağı yazılır.
--   5. 082 tetikleyicisi doğrudan yazılan `session_epoch`u EZMİYOR.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.staff_devices') IS NULL THEN
        RAISE EXCEPTION '117: staff_devices yok — göç uygulanmamış';
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.staff_devices'::regclass) THEN
        RAISE EXCEPTION '1: staff_devices RLS kapalı';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'staff_devices') THEN
        RAISE EXCEPTION '1: staff_devices üzerinde politika var — istemciye açılmamalı';
    END IF;
    IF has_table_privilege('anon', 'public.staff_devices', 'select')
       OR has_table_privilege('authenticated', 'public.staff_devices', 'select')
       OR has_table_privilege('authenticated', 'public.staff_devices', 'insert')
       OR has_table_privilege('authenticated', 'public.staff_devices', 'update') THEN
        RAISE EXCEPTION '1: istemci rolleri staff_devices üzerinde yetki taşıyor';
    END IF;
    IF NOT has_table_privilege('service_role', 'public.staff_devices', 'insert')
       OR NOT has_table_privilege('service_role', 'public.staff_devices', 'update') THEN
        RAISE EXCEPTION '1: service_role staff_devices''e yazamıyor — staff-api telefon bağlayamaz';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'devices_cut_at'
    ) THEN
        RAISE EXCEPTION '2: staff.devices_cut_at yok';
    END IF;
END;
$$;

-- ── Fikstür: var olan bir org'un içinde, geçici bir personel ────────────────
CREATE TEMP TABLE t117 AS
SELECT (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1) AS org,
       gen_random_uuid() AS staff,
       gen_random_uuid() AS phone,
       gen_random_uuid() AS other_phone;

INSERT INTO public.staff (id, organization_id, name, is_active)
SELECT staff, org, '117 Test Personeli', true FROM t117;

DO $$
DECLARE
    v t117%ROWTYPE;
    v_event TEXT;
    v_epoch INT;
    v_rows INT;
BEGIN
    SELECT * INTO v FROM t117;

    -- 3) Olay kısıtı
    INSERT INTO public.staff_auth_log (organization_id, staff_id, event, detail)
    VALUES (v.org, v.staff, 'devices_cut', '1');
    FOREACH v_event IN ARRAY ARRAY['login','failed_pin','locked','revoked','visit.forbidden','visit.start',
        'visit.finish','pair_code_created','paired','failed_pair','pair_locked','pin_set','pin_reset',
        'pin_changed','visit.collect'] LOOP
        INSERT INTO public.staff_auth_log (organization_id, staff_id, event) VALUES (v.org, v.staff, v_event);
    END LOOP;
    BEGIN
        INSERT INTO public.staff_auth_log (organization_id, staff_id, event) VALUES (v.org, v.staff, 'uydurma');
        RAISE EXCEPTION '3: uydurma olay kabul edildi';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- 4) Yaşam döngüsü
    INSERT INTO public.staff_devices (id, organization_id, paired_via) VALUES (v.phone, v.org, 'team');
    INSERT INTO public.staff_devices (id, organization_id, paired_via) VALUES (v.other_phone, v.org, 'single');
    UPDATE public.staff_devices SET last_staff_id = v.staff, last_login_at = now() WHERE id = v.phone;

    UPDATE public.staff
       SET devices_cut_at = now(), session_epoch = session_epoch + 1
     WHERE id = v.staff
    RETURNING session_epoch INTO v_epoch;

    UPDATE public.staff_devices
       SET revoked_at = now()
     WHERE organization_id = v.org AND last_staff_id = v.staff AND revoked_at IS NULL;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
        RAISE EXCEPTION '4: kişinin telefonu iptal edilmedi (%)', v_rows;
    END IF;
    IF (SELECT revoked_at FROM public.staff_devices WHERE id = v.other_phone) IS NOT NULL THEN
        RAISE EXCEPTION '4: başkasının telefonu da iptal edildi';
    END IF;

    -- 5) 082 tetikleyicisi doğrudan yazılan kuşağı ezmiyor
    IF v_epoch <> (SELECT session_epoch FROM public.staff WHERE id = v.staff) OR v_epoch < 2 THEN
        RAISE EXCEPTION '5: session_epoch beklenen değil (%)', v_epoch;
    END IF;
    IF (SELECT devices_cut_at FROM public.staff WHERE id = v.staff) IS NULL THEN
        RAISE EXCEPTION '4: devices_cut_at yazılmadı';
    END IF;
END;
$$;

SELECT 'telefon bağı (117) regression: ok' AS result;

ROLLBACK;
