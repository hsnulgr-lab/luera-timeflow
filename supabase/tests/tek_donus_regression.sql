\set ON_ERROR_STOP on

-- ============================================================
-- 115_tek_sahip_adi_ve_donus.sql için işlem içi regresyon testi
-- ============================================================
-- Göç uygulandıktan SONRA çalıştırılır; her fikstür sonda geri sarılır:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/tek_donus_regression.sql
--
-- KURU KOŞU — göçü uygulamadan, aynı işlemin içinde dene ve hepsini geri
-- sar (114 ile aynı tarif):
--   { echo 'BEGIN;';
--     sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' supabase/115_tek_sahip_adi_ve_donus.sql;
--     sed -e '/^BEGIN;$/d' supabase/tests/tek_donus_regression.sql; } | psql … -f -
--
-- Kanıtlanan sözler:
--   1. Yapı: start_team yalnız üç parametreli sürümüyle var; ikisi de
--      INVOKER, anon çağıramıyor, authenticated çağırabiliyor.
--   2. Ekibe geçerken sahibin adı sahibin satırına yazılıyor; uzun ad hiçbir
--      şey yazdırmıyor; eski istemci (ad yok) satırı değiştirmiyor.
--   3. Dönüş: ekipte iki aktif varken reddediliyor; tek kişilikte "zaten".
--   4. Dönüş: ileri randevu kalan kişiye geçiyor; kalan kişininkiyle
--      çakışan personelsiz kalıyor; geçmiş, iptal ve tamamlanan dokunulmuyor.
--   5. Hiç aktif personel yokken satır açılıyor (ad verilmezse "Ben").
--   6. Dönüşten sonra 114 yeni personelsiz randevuyu kalan kişiye yazıyor.
-- ============================================================

BEGIN;

-- ── 1) Yapı ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regprocedure('public.start_team(text,text,text)') IS NULL THEN
        RAISE EXCEPTION '115: start_team(text,text,text) yok';
    END IF;
    IF to_regprocedure('public.start_team(text,text)') IS NOT NULL THEN
        RAISE EXCEPTION '115: eski start_team(text,text) duruyor — PostgREST iki adayı ayırt edemez';
    END IF;
    IF to_regprocedure('public.end_team(text)') IS NULL THEN
        RAISE EXCEPTION '115: end_team(text) yok';
    END IF;
    IF (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.start_team(text,text,text)'::regprocedure)
       OR (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.end_team(text)'::regprocedure) THEN
        RAISE EXCEPTION '115: fonksiyonlar SECURITY DEFINER olmamalı (RLS geçerli kalmalı)';
    END IF;
    IF has_function_privilege('anon', 'public.start_team(text,text,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.end_team(text)', 'EXECUTE') THEN
        RAISE EXCEPTION '115: anon çağırabiliyor (094''ün dersi)';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.start_team(text,text,text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.end_team(text)', 'EXECUTE') THEN
        RAISE EXCEPTION '115: authenticated çağıramıyor';
    END IF;
END;
$$;

-- ── Fikstürler (süper kullanıcı) ────────────────────────────────────────────
-- handle_new_user her auth fikstürü için bir org ve üyelik açar.
--   U1 · tek kişilik · sahibin satırı salonun adında → ekibe geçer, sonra döner
--   U2 · tek kişilik · eski istemci gibi (sahip adı yok)
--   U3 · ekip · hiç personel yok                    → dönüşte satır açılır
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
    ('11500000-0000-4000-8000-000000000001'::UUID, 'tek-donus-1@timeflow.test'),
    ('11500000-0000-4000-8000-000000000002'::UUID, 'tek-donus-2@timeflow.test'),
    ('11500000-0000-4000-8000-000000000003'::UUID, 'tek-donus-3@timeflow.test')
) AS fixture(id, email);

SELECT set_config('tek115.o1', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '11500000-0000-4000-8000-000000000001'), true);
SELECT set_config('tek115.o2', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '11500000-0000-4000-8000-000000000002'), true);
SELECT set_config('tek115.o3', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '11500000-0000-4000-8000-000000000003'), true);
-- Tarihler BUGÜNE göre: dönüş "bugünden itibaren" diyor.
SELECT set_config('tek115.today', ((now() AT TIME ZONE 'Europe/Istanbul')::DATE)::TEXT, true);

UPDATE public.organizations SET solo = true
 WHERE id IN (current_setting('tek115.o1')::UUID, current_setting('tek115.o2')::UUID);
UPDATE public.organizations SET solo = false
 WHERE id = current_setting('tek115.o3')::UUID;

INSERT INTO public.staff (id, organization_id, name, is_active, created_at)
VALUES
    ('11500000-0000-4000-8000-000000000201', current_setting('tek115.o1')::UUID, 'Derya Güzellik', true, now() - interval '2 days'),
    ('11500000-0000-4000-8000-000000000202', current_setting('tek115.o2')::UUID, 'Studio Ayla',    true, now() - interval '2 days');

-- Ret denetimleri DO bloğunda: `pg_temp` yardımcıları `SET ROLE
-- authenticated` altında çağrılamıyor (devir §16 dersi).

-- ── 2) Ekibe geçerken sahibin adı ───────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"11500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
BEGIN
    PERFORM public.start_team('Elif Demir', NULL, repeat('a', 81));
    RAISE EXCEPTION 'ret bekleniyordu (owner_name_too_long)';
EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'P0001' OR SQLERRM <> 'owner_name_too_long' THEN RAISE; END IF;
END;
$$;

DO $$
DECLARE
    v_staff UUID;
BEGIN
    -- Uzun ad HİÇBİR ŞEY yazdırmadı.
    IF (SELECT solo FROM public.organizations WHERE id = current_setting('tek115.o1')::UUID) IS NOT TRUE
       OR (SELECT count(*) FROM public.staff WHERE organization_id = current_setting('tek115.o1')::UUID) <> 1
       OR (SELECT name FROM public.staff WHERE id = '11500000-0000-4000-8000-000000000201') <> 'Derya Güzellik' THEN
        RAISE EXCEPTION '2: reddedilen sahip adı bir şey yazdırdı';
    END IF;

    v_staff := public.start_team('Elif Demir', 'Kuaför', '  Derya Toprak  ');

    IF (SELECT name FROM public.staff WHERE id = '11500000-0000-4000-8000-000000000201') <> 'Derya Toprak' THEN
        RAISE EXCEPTION '2: sahibin adı yazılmadı (kırpılmış olmalı)';
    END IF;
    IF (SELECT name FROM public.staff WHERE id = v_staff) <> 'Elif Demir' THEN
        RAISE EXCEPTION '2: çalışanın adı sahibin adıyla karıştı';
    END IF;
    IF (SELECT solo FROM public.organizations WHERE id = current_setting('tek115.o1')::UUID) IS NOT FALSE THEN
        RAISE EXCEPTION '2: ekip düzenine geçilmedi';
    END IF;
    PERFORM set_config('tek115.elif', v_staff::TEXT, true);
END;
$$;

RESET ROLE;

-- Eski istemci: üçüncü parametre yok → sahibin satırı aynen kalıyor.
SELECT set_config('request.jwt.claims', '{"sub":"11500000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.start_team('Can Yılmaz', NULL);
DO $$
BEGIN
    IF (SELECT name FROM public.staff WHERE id = '11500000-0000-4000-8000-000000000202') <> 'Studio Ayla' THEN
        RAISE EXCEPTION '2: ad verilmeden sahibin satırı değişti';
    END IF;
END;
$$;
RESET ROLE;

-- ── 3) Dönüşün retleri ──────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"11500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
-- Elif hâlâ aktif: kimin pasife alınacağını sunucu seçmiyor.
DO $$
BEGIN
    PERFORM public.end_team();
    RAISE EXCEPTION 'ret bekleniyordu (team_not_empty)';
EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'P0001' OR SQLERRM <> 'team_not_empty' THEN RAISE; END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
    IF (SELECT solo FROM public.organizations WHERE id = current_setting('tek115.o1')::UUID) IS NOT FALSE THEN
        RAISE EXCEPTION '3: reddedilen dönüş bayrağı değiştirdi';
    END IF;
END;
$$;

-- ── 4) Dönüş: ileri randevular ──────────────────────────────────────────────
-- Elif ayrıldı (masaüstünde pasife alındı). Fikstür randevuları:
--   O1  sahip · +7 gün 12:00–13:00
--   E1  Elif  · +7 gün 10:00–11:00  confirmed  → sahibe geçer
--   E2  Elif  · +7 gün 12:30–13:30  confirmed  → sahibinkiyle çakışıyor → personelsiz
--   E3  Elif  · −7 gün 10:00–11:00  confirmed  → geçmiş, dokunulmaz
--   E4  Elif  · +7 gün 15:00–16:00  cancelled  → dokunulmaz
--   E5  Elif  · +7 gün 17:00–18:00  completed  → dokunulmaz
UPDATE public.staff SET is_active = false WHERE id = current_setting('tek115.elif')::UUID;

INSERT INTO public.reservations (id, user_id, organization_id, customer_name, customer_phone, date, start_time, end_time, service, status, staff_id)
SELECT v.id, '11500000-0000-4000-8000-000000000001', current_setting('tek115.o1')::UUID, v.who, '05000001150',
       current_setting('tek115.today')::DATE + v.day, v.s, v.e, 'Kesim', v.st, v.staff
  FROM (VALUES
      ('11500000-0000-4000-8000-000000000300'::UUID, 'Sahibin',  7, '12:00'::TIME, '13:00'::TIME, 'confirmed', '11500000-0000-4000-8000-000000000201'::UUID),
      ('11500000-0000-4000-8000-000000000301'::UUID, 'Geçen',    7, '10:00'::TIME, '11:00'::TIME, 'confirmed', current_setting('tek115.elif')::UUID),
      ('11500000-0000-4000-8000-000000000302'::UUID, 'Çakışan',  7, '12:30'::TIME, '13:30'::TIME, 'confirmed', current_setting('tek115.elif')::UUID),
      ('11500000-0000-4000-8000-000000000303'::UUID, 'Geçmiş',  -7, '10:00'::TIME, '11:00'::TIME, 'confirmed', current_setting('tek115.elif')::UUID),
      ('11500000-0000-4000-8000-000000000304'::UUID, 'İptal',    7, '15:00'::TIME, '16:00'::TIME, 'cancelled', current_setting('tek115.elif')::UUID),
      ('11500000-0000-4000-8000-000000000305'::UUID, 'Bitmiş',   7, '17:00'::TIME, '18:00'::TIME, 'completed', current_setting('tek115.elif')::UUID)
  ) AS v(id, who, day, s, e, st, staff);

SELECT set_config('request.jwt.claims', '{"sub":"11500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.end_team();
    IF v_result->>'staff_id' <> '11500000-0000-4000-8000-000000000201'
       OR (v_result->>'moved')::INT <> 1
       OR (v_result->>'unassigned')::INT <> 1
       OR (v_result->>'kept')::INT <> 0 THEN
        RAISE EXCEPTION '4: dönüşün sonucu yanlış: %', v_result;
    END IF;
END;
$$;

RESET ROLE;

DO $$
DECLARE
    v_elif UUID := current_setting('tek115.elif')::UUID;
    v_owner UUID := '11500000-0000-4000-8000-000000000201';
BEGIN
    IF (SELECT solo FROM public.organizations WHERE id = current_setting('tek115.o1')::UUID) IS NOT TRUE THEN
        RAISE EXCEPTION '4: tek kişiliğe dönülmedi';
    END IF;
    IF (SELECT count(*) FROM public.staff WHERE organization_id = current_setting('tek115.o1')::UUID AND is_active) <> 1 THEN
        RAISE EXCEPTION '4: aktif personel sayısı değişti';
    END IF;
    IF (SELECT staff_id FROM public.reservations WHERE id = '11500000-0000-4000-8000-000000000301') IS DISTINCT FROM v_owner THEN
        RAISE EXCEPTION '4: ileri randevu kalan kişiye geçmedi';
    END IF;
    IF (SELECT staff_id FROM public.reservations WHERE id = '11500000-0000-4000-8000-000000000302') IS NOT NULL THEN
        RAISE EXCEPTION '4: çakışan randevu personelsiz bırakılmadı';
    END IF;
    IF (SELECT count(*) FROM public.reservations
         WHERE id IN ('11500000-0000-4000-8000-000000000303',
                      '11500000-0000-4000-8000-000000000304',
                      '11500000-0000-4000-8000-000000000305')
           AND staff_id = v_elif) <> 3 THEN
        RAISE EXCEPTION '4: geçmiş, iptal ya da tamamlanan randevunun personeli değişti';
    END IF;
END;
$$;

-- Tek kişilikte artık "zaten tek kişilik".
SELECT set_config('request.jwt.claims', '{"sub":"11500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
    PERFORM public.end_team();
    RAISE EXCEPTION 'ret bekleniyordu (already_solo)';
EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'P0001' OR SQLERRM <> 'already_solo' THEN RAISE; END IF;
END;
$$;

-- ── 6) Dönüşten sonra 114 kalan kişiyi yazıyor ──────────────────────────────
INSERT INTO public.reservations (id, user_id, organization_id, customer_name, customer_phone, date, start_time, end_time, service, status)
VALUES ('11500000-0000-4000-8000-000000000306', '11500000-0000-4000-8000-000000000001',
        current_setting('tek115.o1')::UUID, 'Yeni', '05000001150',
        current_setting('tek115.today')::DATE + 8, '10:00', '11:00', 'Fön', 'confirmed');
RESET ROLE;

DO $$
BEGIN
    IF (SELECT staff_id FROM public.reservations WHERE id = '11500000-0000-4000-8000-000000000306')
       IS DISTINCT FROM '11500000-0000-4000-8000-000000000201'::UUID THEN
        RAISE EXCEPTION '6: dönüşten sonra yeni randevuya kalan kişi yazılmadı (114)';
    END IF;
END;
$$;

-- ── 5) Hiç aktif personel yokken ────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"11500000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
BEGIN
    PERFORM public.end_team(repeat('a', 81));
    RAISE EXCEPTION 'ret bekleniyordu (name_too_long)';
EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'P0001' OR SQLERRM <> 'name_too_long' THEN RAISE; END IF;
END;
$$;

DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.end_team(NULL);
    IF (SELECT name FROM public.staff WHERE id = (v_result->>'staff_id')::UUID) <> 'Ben' THEN
        RAISE EXCEPTION '5: ad verilmeyince "Ben" açılmadı';
    END IF;
    IF (SELECT solo FROM public.organizations WHERE id = current_setting('tek115.o3')::UUID) IS NOT TRUE THEN
        RAISE EXCEPTION '5: personelsiz ekip tek kişiliğe dönmedi';
    END IF;
END;
$$;

RESET ROLE;

SELECT 'tek dönüş (115) regression: ok' AS result;

ROLLBACK;
