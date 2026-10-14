\set ON_ERROR_STOP on

-- ============================================================
-- 118_personel_bildirim_gunu.sql için işlem içi regresyon testi
-- ============================================================
-- Göç uygulandıktan SONRA çalıştırılır; her fikstür ve kuyruğa düşen her
-- istek sonda geri sarılır (pg_net kuyruğu işlenmemiş satırları görmez):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/personel_bildirim_gunu_regression.sql
--
-- KURU KOŞU — göçü uygulamadan, aynı işlemin içinde dene ve hepsini geri sar:
--   { echo 'BEGIN;';
--     sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' supabase/118_personel_bildirim_gunu.sql;
--     sed -e '/^BEGIN;$/d' supabase/tests/personel_bildirim_gunu_regression.sql; } | psql … -f -
--
-- Kanıtlanan sözler:
--   1. Yeni randevun var     → '/calendar?date=<randevunun günü>'
--   2. Müşterin geldi        → '/personel?date=<gün>'
--   3. Randevu saati değişti → '/personel?date=<YENİ gün>'
--   4. Randevu iptal edildi  → '/personel?date=<gün>'
--   5. Müdür olayları değişmedi ("Yeni randevu" hâlâ '/calendar', `pref` duruyor)
--   6. 116'nın tek kişilik koşulu yerinde (adisyon olayında `NOT v_solo`)
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF position('/calendar?date=' IN pg_get_functiondef('public.notify_push_on_reservation()'::regprocedure)) = 0 THEN
        RAISE EXCEPTION '118: göç uygulanmamış (personel adresinde gün yok)';
    END IF;
    IF position('NOT v_solo' IN pg_get_functiondef('public.notify_push_on_reservation()'::regprocedure)) = 0 THEN
        RAISE EXCEPTION '6: 116 koşulu kayboldu (adisyon olayında tek kişilik)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.app_secrets WHERE key = 'FUNCTIONS_BASE_URL')
       OR NOT EXISTS (SELECT 1 FROM public.app_secrets WHERE key = 'PUSH_TRIGGER_SECRET') THEN
        RAISE EXCEPTION '118: app_secrets eksik — bildirim kuyruğu görünmez, test anlamsız';
    END IF;
END;
$$;

-- Bir personelin kuyruğa düşen bildiriminin adresi (başlığa göre, en yenisi).
CREATE OR REPLACE FUNCTION pg_temp.staff_url(p_staff TEXT, p_title TEXT)
RETURNS TEXT
LANGUAGE sql
AS $$
    SELECT convert_from(q.body, 'UTF8')::jsonb -> 'payload' ->> 'url'
      FROM net.http_request_queue q
     WHERE convert_from(q.body, 'UTF8')::jsonb -> 'target' ->> 'staffId' = p_staff
       AND convert_from(q.body, 'UTF8')::jsonb -> 'payload' ->> 'title' = p_title
     ORDER BY q.id DESC
     LIMIT 1
$$;

-- ── Fikstür: ekip düzeninde bir org (handle_new_user açar) ─────────────────
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
)
VALUES (
    '00000000-0000-0000-0000-000000000000', '11800000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'personel-gunu-118@timeflow.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', ''
);

SELECT set_config('t118.o', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '11800000-0000-4000-8000-000000000001'), true);

INSERT INTO public.staff (id, organization_id, name, is_active)
VALUES ('11800000-0000-4000-8000-000000000201', current_setting('t118.o')::UUID, 'Ekip Bir', true);

-- 1) Atama: personelli yeni randevu (müşteri aldı → müdüre de "Yeni randevu").
INSERT INTO public.reservations (
    id, user_id, organization_id, customer_name, customer_phone, date, start_time, end_time,
    service, status, staff_id, source
)
VALUES ('11800000-0000-4000-8000-000000000301', '11800000-0000-4000-8000-000000000001', current_setting('t118.o')::UUID,
        'Tuğçe Erden', '05000001180', '2026-11-03', '10:00', '11:00', 'Kalıcı Makyaj', 'confirmed',
        '11800000-0000-4000-8000-000000000201', 'booking');

-- 2) Müşteri geldi.
UPDATE public.reservations SET customer_arrived_at = now()
 WHERE id = '11800000-0000-4000-8000-000000000301';

-- 3) Ertelendi — yeni gün.
UPDATE public.reservations SET date = '2026-11-05', customer_arrived_at = NULL
 WHERE id = '11800000-0000-4000-8000-000000000301';

-- 4) İptal.
UPDATE public.reservations SET status = 'cancelled'
 WHERE id = '11800000-0000-4000-8000-000000000301';

DO $$
DECLARE
    s TEXT := '11800000-0000-4000-8000-000000000201';
BEGIN
    IF pg_temp.staff_url(s, 'Yeni randevun var') IS DISTINCT FROM '/calendar?date=2026-11-03' THEN
        RAISE EXCEPTION '1: atama adresi %', pg_temp.staff_url(s, 'Yeni randevun var');
    END IF;
    IF pg_temp.staff_url(s, 'Müşterin geldi 👋') IS DISTINCT FROM '/personel?date=2026-11-03' THEN
        RAISE EXCEPTION '2: geldi adresi %', pg_temp.staff_url(s, 'Müşterin geldi 👋');
    END IF;
    IF pg_temp.staff_url(s, 'Randevu saati değişti') IS DISTINCT FROM '/personel?date=2026-11-05' THEN
        RAISE EXCEPTION '3: erteleme adresi yeni günü taşımıyor: %', pg_temp.staff_url(s, 'Randevu saati değişti');
    END IF;
    IF pg_temp.staff_url(s, 'Randevu iptal edildi') IS DISTINCT FROM '/personel?date=2026-11-05' THEN
        RAISE EXCEPTION '4: iptal adresi %', pg_temp.staff_url(s, 'Randevu iptal edildi');
    END IF;
    -- 5) Müdürün "Yeni randevu"su değişmedi.
    IF NOT EXISTS (
        SELECT 1 FROM net.http_request_queue q
         WHERE convert_from(q.body, 'UTF8')::jsonb ->> 'organization_id' = current_setting('t118.o')
           AND convert_from(q.body, 'UTF8')::jsonb ->> 'pref' = 'booked'
           AND convert_from(q.body, 'UTF8')::jsonb -> 'payload' ->> 'url' = '/calendar'
    ) THEN
        RAISE EXCEPTION '5: müdürün "Yeni randevu" olayı değişmiş';
    END IF;
END;
$$;

SELECT 'personel bildirim günü (118) regression: ok' AS result;

ROLLBACK;
