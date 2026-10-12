\set ON_ERROR_STOP on

-- ============================================================
-- 114_tek_personel_sunucu.sql için işlem içi regresyon testi
-- ============================================================
-- Göç uygulandıktan SONRA çalıştırılır; her fikstür sonda geri sarılır:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/tek_personel_regression.sql
--
-- KURU KOŞU — göçü uygulamadan, aynı işlemin içinde dene ve hepsini geri
-- sar. Göçün kendi BEGIN/COMMIT'i ve bu dosyanın BEGIN'i sökülüp tek işleme
-- diziliyor; sondaki ROLLBACK göçü de (doldurma dahil) geri alıyor:
--   { echo 'BEGIN;';
--     sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' supabase/114_tek_personel_sunucu.sql;
--     sed -e '/^BEGIN;$/d' supabase/tests/tek_personel_regression.sql; } | psql … -f -
--
-- Kanıtlanan sözler:
--   1. Yapı: fonksiyon SECURITY DEFINER ve kimse doğrudan çağıramıyor;
--      tetikleyici YALNIZ BEFORE INSERT; bildirim tetikleyicisi açık kaldı.
--   2. Tek kişilik org'da personelsiz yeni randevuya TEK aktif personel
--      yazılıyor — sahibin kendi oturumuyla (RLS altında) da.
--   3. Açıkça verilen personel değişmiyor (pasif bile olsa).
--   4. Ekip düzeninde, iki aktif personelde ve hiç aktif personel yokken
--      boş kalıyor: sunucu tahmin etmiyor.
--   5. SIRA: doldurulan personel çakışma kontrolüne (060) giriyor — sahibin
--      randevusunun üstüne binen personelsiz randevu reddediliyor (23P01).
--   6. UPDATE doldurmuyor: sahibin randevusuyla çakışan eski personelsiz
--      bir randevunun durumu yine değişebiliyor.
-- ============================================================

BEGIN;

-- ── 0) Yapı ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_type SMALLINT;
BEGIN
    IF to_regprocedure('public.assign_solo_staff()') IS NULL THEN
        RAISE EXCEPTION '114: assign_solo_staff yok';
    END IF;

    -- Randevuyu kimin yazdığından bağımsız çalışmalı (halka açık randevu,
    -- staff-api, masaüstü) — 060 gibi.
    IF NOT (SELECT prosecdef FROM pg_catalog.pg_proc
             WHERE oid = 'public.assign_solo_staff()'::regprocedure) THEN
        RAISE EXCEPTION '114: assign_solo_staff SECURITY DEFINER olmalı';
    END IF;

    IF has_function_privilege('anon', 'public.assign_solo_staff()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.assign_solo_staff()', 'EXECUTE') THEN
        RAISE EXCEPTION '114: tetikleyici fonksiyonu doğrudan çağrılabiliyor (094''ün dersi)';
    END IF;

    SELECT tgtype INTO v_type
      FROM pg_catalog.pg_trigger
     WHERE tgrelid = 'public.reservations'::regclass
       AND tgname = 'trg_reservations_assign_solo_staff'
       AND tgenabled <> 'D';
    IF v_type IS NULL THEN
        RAISE EXCEPTION '114: tetikleyici yok ya da kapalı';
    END IF;
    -- tgtype bitleri: 1 satır · 2 BEFORE · 4 INSERT · 8 DELETE · 16 UPDATE
    IF v_type & 1 = 0 OR v_type & 2 = 0 OR v_type & 4 = 0 OR v_type & 8 <> 0 OR v_type & 16 <> 0 THEN
        RAISE EXCEPTION '114: tetikleyici yalnız BEFORE INSERT satır tetikleyicisi olmalı (tgtype %)', v_type;
    END IF;

    -- Doldurma bildirim tetikleyicisini kapatıp geri açıyor; açık kalmalı.
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger
         WHERE tgrelid = 'public.reservations'::regclass
           AND tgname = 'trg_push_on_reservation'
           AND tgenabled = 'D'
    ) THEN
        RAISE EXCEPTION '114: bildirim tetikleyicisi kapalı kaldı';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(
    expected_message TEXT,
    statement_sql TEXT,
    expected_state TEXT
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
--   U1 · tek kişilik · bir aktif + bir pasif personel   → doldurulur
--   U2 · ekip düzeni · bir personel                     → dokunulmaz
--   U3 · tek kişilik · İKİ aktif personel               → tahmin edilmez
--   U4 · tek kişilik · yalnız pasif personel            → doldurulmaz
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
    ('11400000-0000-4000-8000-000000000001'::UUID, 'tek-personel-1@timeflow.test'),
    ('11400000-0000-4000-8000-000000000002'::UUID, 'tek-personel-2@timeflow.test'),
    ('11400000-0000-4000-8000-000000000003'::UUID, 'tek-personel-3@timeflow.test'),
    ('11400000-0000-4000-8000-000000000004'::UUID, 'tek-personel-4@timeflow.test')
) AS fixture(id, email);

-- Org kimlikleri süper kullanıcıyken saklanıyor (kullanıcı adına yapılan
-- denetimde başka org RLS yüzünden görünmez).
SELECT set_config('tek114.o1', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '11400000-0000-4000-8000-000000000001'), true);
SELECT set_config('tek114.o2', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '11400000-0000-4000-8000-000000000002'), true);
SELECT set_config('tek114.o3', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '11400000-0000-4000-8000-000000000003'), true);
SELECT set_config('tek114.o4', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '11400000-0000-4000-8000-000000000004'), true);

UPDATE public.organizations SET solo = true
 WHERE id IN (
     current_setting('tek114.o1')::UUID,
     current_setting('tek114.o3')::UUID,
     current_setting('tek114.o4')::UUID
 );

INSERT INTO public.staff (id, organization_id, name, is_active, created_at)
VALUES
    ('11400000-0000-4000-8000-000000000201', current_setting('tek114.o1')::UUID, 'Derya Güzellik', true,  now() - interval '2 days'),
    ('11400000-0000-4000-8000-000000000211', current_setting('tek114.o1')::UUID, 'Eski Kayıt',     false, now() - interval '3 days'),
    ('11400000-0000-4000-8000-000000000202', current_setting('tek114.o2')::UUID, 'Ekip Bir',       true,  now()),
    ('11400000-0000-4000-8000-000000000203', current_setting('tek114.o3')::UUID, 'Bir',            true,  now() - interval '1 day'),
    ('11400000-0000-4000-8000-000000000213', current_setting('tek114.o3')::UUID, 'İki',            true,  now()),
    ('11400000-0000-4000-8000-000000000214', current_setting('tek114.o4')::UUID, 'Pasif',          false, now());

-- Sahibin randevusu: 10:00–11:00.
INSERT INTO public.reservations (
    id, user_id, organization_id, customer_name, customer_phone, date, start_time, end_time, service, status, staff_id
)
VALUES (
    '11400000-0000-4000-8000-000000000301', '11400000-0000-4000-8000-000000000001',
    current_setting('tek114.o1')::UUID, 'Sabah Bir', '05000001140', '2026-10-20', '10:00', '11:00', 'Kesim', 'confirmed',
    '11400000-0000-4000-8000-000000000201'
);

-- ── 2) Tek kişilik: personelsiz yeni randevuya tek aktif personel ──────────
INSERT INTO public.reservations (id, user_id, organization_id, customer_name, customer_phone, date, start_time, end_time, service, status)
VALUES ('11400000-0000-4000-8000-000000000302', '11400000-0000-4000-8000-000000000001',
        current_setting('tek114.o1')::UUID, 'Öğle Bir', '05000001140', '2026-10-20', '12:00', '13:00', 'Fön', 'confirmed');

DO $$
BEGIN
    IF (SELECT staff_id FROM public.reservations WHERE id = '11400000-0000-4000-8000-000000000302')
       IS DISTINCT FROM '11400000-0000-4000-8000-000000000201'::UUID THEN
        RAISE EXCEPTION '2: tek kişilik randevuya sahibin personeli yazılmadı (pasif kayıt atlanmalı)';
    END IF;
END;
$$;

-- Sahibin kendi oturumuyla — uygulamanın yazdığı yol.
SELECT set_config('request.jwt.claims', '{"sub":"11400000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

INSERT INTO public.reservations (id, user_id, organization_id, customer_name, customer_phone, date, start_time, end_time, service, status)
VALUES ('11400000-0000-4000-8000-000000000303', '11400000-0000-4000-8000-000000000001',
        current_setting('tek114.o1')::UUID, 'Öğleden Sonra', '05000001140', '2026-10-20', '14:00', '15:00', 'Boya', 'confirmed');

DO $$
BEGIN
    IF (SELECT staff_id FROM public.reservations WHERE id = '11400000-0000-4000-8000-000000000303')
       IS DISTINCT FROM '11400000-0000-4000-8000-000000000201'::UUID THEN
        RAISE EXCEPTION '2: sahibin oturumuyla yazılan randevuya personel yazılmadı';
    END IF;
END;
$$;

RESET ROLE;

-- ── 3) Açıkça verilen personel değişmiyor ───────────────────────────────────
INSERT INTO public.reservations (id, user_id, organization_id, customer_name, customer_phone, date, start_time, end_time, service, status, staff_id)
VALUES ('11400000-0000-4000-8000-000000000304', '11400000-0000-4000-8000-000000000001',
        current_setting('tek114.o1')::UUID, 'Akşam Bir', '05000001140', '2026-10-20', '16:00', '17:00', 'Kaş', 'confirmed',
        '11400000-0000-4000-8000-000000000211');

DO $$
BEGIN
    IF (SELECT staff_id FROM public.reservations WHERE id = '11400000-0000-4000-8000-000000000304')
       IS DISTINCT FROM '11400000-0000-4000-8000-000000000211'::UUID THEN
        RAISE EXCEPTION '3: açıkça verilen personel değiştirildi';
    END IF;
END;
$$;

-- ── 4) Tahmin yok: ekip, iki aktif, hiç aktif ───────────────────────────────
INSERT INTO public.reservations (id, user_id, organization_id, customer_name, customer_phone, date, start_time, end_time, service, status)
VALUES
    ('11400000-0000-4000-8000-000000000402', '11400000-0000-4000-8000-000000000002',
     current_setting('tek114.o2')::UUID, 'Ekip Müşteri', '05000001140', '2026-10-20', '10:00', '11:00', 'Kesim', 'confirmed'),
    ('11400000-0000-4000-8000-000000000403', '11400000-0000-4000-8000-000000000003',
     current_setting('tek114.o3')::UUID, 'İkili Müşteri', '05000001140', '2026-10-20', '10:00', '11:00', 'Kesim', 'confirmed'),
    ('11400000-0000-4000-8000-000000000404', '11400000-0000-4000-8000-000000000004',
     current_setting('tek114.o4')::UUID, 'Pasif Müşteri', '05000001140', '2026-10-20', '10:00', '11:00', 'Kesim', 'confirmed');

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.reservations
         WHERE id IN (
             '11400000-0000-4000-8000-000000000402',
             '11400000-0000-4000-8000-000000000403',
             '11400000-0000-4000-8000-000000000404'
         )
           AND staff_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION '4: ekipte, iki aktif personelde ya da aktif personel yokken personel tahmin edildi';
    END IF;
END;
$$;

-- ── 5) Sıra: doldurulan personel çakışma kontrolüne giriyor ────────────────
-- Personelsiz 10:30 randevusu sahibin 10:00–11:00'ının üstüne biniyor.
-- Doldurma çakışma kontrolünden SONRA çalışsaydı kontrol onu "atanmamış"
-- havuzla karşılaştırır, randevu geçer ve sahibin günü delinirdi.
SELECT pg_temp.assert_raises(
    'reservation_staff_conflict',
    format($sql$
        INSERT INTO public.reservations (user_id, organization_id, customer_name, customer_phone, date, start_time, end_time, service, status)
        VALUES ('11400000-0000-4000-8000-000000000001', %L, 'Üst Üste', '05000001140', '2026-10-20', '10:30', '11:30', 'Kesim', 'confirmed')
    $sql$, current_setting('tek114.o1')),
    '23P01'
);

-- ── 6) UPDATE doldurmuyor ───────────────────────────────────────────────────
-- Eski bir personelsiz randevu (mod açılmadan önce yazılmış): sahibin
-- 10:00–11:00'ıyla çakışıyor. Durumu değişebilmeli; UPDATE personel yazsaydı
-- 060 onu yeniden tarar ve "tamamlandı" çakışma hatasına düşerdi.
UPDATE public.organizations SET solo = false WHERE id = current_setting('tek114.o1')::UUID;

INSERT INTO public.reservations (id, user_id, organization_id, customer_name, customer_phone, date, start_time, end_time, service, status)
VALUES ('11400000-0000-4000-8000-000000000306', '11400000-0000-4000-8000-000000000001',
        current_setting('tek114.o1')::UUID, 'Eski Kayıt', '05000001146', '2026-10-20', '10:15', '10:45', 'Kesim', 'confirmed');

UPDATE public.organizations SET solo = true WHERE id = current_setting('tek114.o1')::UUID;

UPDATE public.reservations SET status = 'completed'
 WHERE id = '11400000-0000-4000-8000-000000000306';

DO $$
BEGIN
    IF (SELECT staff_id FROM public.reservations WHERE id = '11400000-0000-4000-8000-000000000306') IS NOT NULL THEN
        RAISE EXCEPTION '6: UPDATE personel yazdı';
    END IF;
    IF (SELECT status FROM public.reservations WHERE id = '11400000-0000-4000-8000-000000000306') <> 'completed' THEN
        RAISE EXCEPTION '6: durum yazılmadı';
    END IF;
END;
$$;

SELECT 'tek personel (114) regression: ok' AS result;

ROLLBACK;
