-- ============================================================
-- 144_musteri_bekliyor_live_activity.sql için işlem içi regresyon testi
-- ============================================================
-- Göç uygulandıktan SONRA çalıştırılır; her fikstür ve kuyruğa düşen her
-- istek sonda geri sarılır (pg_net kuyruğu işlenmemiş satırları görmez):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/144_musteri_bekliyor_regression.sql
--
-- KURU KOŞU — göçü uygulamadan, aynı işlemin içinde dene ve hepsini geri sar:
--   { echo 'BEGIN;';
--     sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' supabase/144_musteri_bekliyor_live_activity.sql;
--     sed -e '/^BEGIN;$/d' supabase/tests/144_musteri_bekliyor_regression.sql; } | psql … -f -
--
-- Kanıtlanan sözler:
--   0. Yapı: tablo RLS'li, politikası yok, istemci rollerine kapalı; tetikleyici
--      118'in adreslerini ve 116'nın tek kişilik koşulunu koruyor.
--   1. Başlatma jetonu YOKSA "Müşterin geldi" bugünkü gövdeyle send-push'a
--      gidiyor; send-live-activity'ye hiçbir şey gitmiyor (geriye uyum).
--   2. Jeton VARSA istek send-live-activity'ye gidiyor; `fallback` 1'deki
--      gövdenin BİREBİRİ; aynı olay için send-push'a doğrudan istek yok.
--   3. Tek kişilikte jeton olsa da bugünkü yol.
--   4. Bitir: işe başlandı / iptal / gelmedi / geliş geri alındı / başkasına /
--      başka güne / silindi → etkinlik jetonu varsa "end". Jeton yoksa istek yok.
--   5. Pasife alınan personelin jetonları siliniyor, ötekininki kalıyor.
--   6. Biçim: bozuk jeton, randevulu başlatma jetonu, randevusuz etkinlik
--      jetonu ve bilinmeyen ortam reddediliyor.
-- ============================================================

BEGIN;

-- ── 0) Yapı ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_def TEXT := pg_get_functiondef('public.notify_push_on_reservation()'::regprocedure);
BEGIN
    IF to_regclass('public.live_activity_tokens') IS NULL THEN
        RAISE EXCEPTION '0: live_activity_tokens yok — göç uygulanmamış';
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.live_activity_tokens'::regclass) THEN
        RAISE EXCEPTION '0: live_activity_tokens RLS kapalı';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'live_activity_tokens') THEN
        RAISE EXCEPTION '0: live_activity_tokens politikası var — yalnız service_role dokunmalı';
    END IF;
    IF has_table_privilege('authenticated', 'public.live_activity_tokens', 'SELECT')
       OR has_table_privilege('anon', 'public.live_activity_tokens', 'SELECT')
       OR has_table_privilege('authenticated', 'public.live_activity_tokens', 'INSERT') THEN
        RAISE EXCEPTION '0: live_activity_tokens istemci rolüne açık';
    END IF;
    IF position('send-live-activity' IN v_def) = 0 THEN
        RAISE EXCEPTION '0: tetikleyici send-live-activity''yi bilmiyor';
    END IF;
    IF position('/personel?date=' IN v_def) = 0 OR position('/calendar?date=' IN v_def) = 0 THEN
        RAISE EXCEPTION '0: 118''in adresleri kayboldu';
    END IF;
    IF position('NOT v_solo' IN v_def) = 0 THEN
        RAISE EXCEPTION '0: 116''nın tek kişilik koşulu kayboldu';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.app_secrets WHERE key = 'FUNCTIONS_BASE_URL')
       OR NOT EXISTS (SELECT 1 FROM public.app_secrets WHERE key = 'PUSH_TRIGGER_SECRET') THEN
        RAISE EXCEPTION '0: app_secrets eksik — kuyruk görünmez, test anlamsız';
    END IF;
END;
$$;

-- Kuyruktaki istekler — uca ve randevuya göre.
CREATE OR REPLACE FUNCTION pg_temp.q144(p_fn TEXT, p_res TEXT)
RETURNS SETOF JSONB
LANGUAGE sql
AS $$
    SELECT convert_from(q.body, 'UTF8')::jsonb
      FROM net.http_request_queue q
     WHERE q.url LIKE '%/' || p_fn
       AND (
            convert_from(q.body, 'UTF8')::jsonb ->> 'reservation_id' = p_res
         OR convert_from(q.body, 'UTF8')::jsonb -> 'payload' ->> 'tag' = 'arrived-' || p_res
       )
     ORDER BY q.id
$$;

-- ── Fikstürler: ekip düzeninde ve tek kişilik iki org ──────────────────────
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
)
VALUES
    ('00000000-0000-0000-0000-000000000000', '14400000-0000-4000-8000-000000000001',
     'authenticated', 'authenticated', 'musteri-bekliyor-144@timeflow.test', '', now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', '14400000-0000-4000-8000-000000000002',
     'authenticated', 'authenticated', 'musteri-bekliyor-144-tek@timeflow.test', '', now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

SELECT set_config('t144.o', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '14400000-0000-4000-8000-000000000001' LIMIT 1), true);
SELECT set_config('t144.s', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '14400000-0000-4000-8000-000000000002' LIMIT 1), true);
UPDATE public.organizations SET solo = false WHERE id = current_setting('t144.o')::UUID;
UPDATE public.organizations SET solo = true  WHERE id = current_setting('t144.s')::UUID;

INSERT INTO public.staff (id, organization_id, name, is_active) VALUES
    ('14400000-0000-4000-8000-000000000201', current_setting('t144.o')::UUID, 'Jetonsuz', true),
    ('14400000-0000-4000-8000-000000000202', current_setting('t144.o')::UUID, 'Jetonlu', true),
    ('14400000-0000-4000-8000-000000000203', current_setting('t144.s')::UUID, 'Tek Sahip', true);

-- 202'nin telefonu etkinliğe kayıtlı; 203 de (tek kişilik — yine de açılmamalı).
INSERT INTO public.live_activity_tokens (organization_id, staff_id, device_id, kind, token, environment) VALUES
    (current_setting('t144.o')::UUID, '14400000-0000-4000-8000-000000000202', 'cihaz-144-jetonlu', 'start',
     repeat('ab', 40), 'sandbox'),
    (current_setting('t144.s')::UUID, '14400000-0000-4000-8000-000000000203', 'cihaz-144-tekkisi', 'start',
     repeat('cd', 40), 'production');

-- Randevular: her senaryoya ayrı satır, çakışmasın diye ayrı saatler.
INSERT INTO public.reservations (
    id, user_id, organization_id, customer_name, customer_phone, date, start_time, end_time,
    service, status, staff_id, source
)
SELECT ('14400000-0000-4000-8000-0000000003' || lpad(n::TEXT, 2, '0'))::UUID,
       '14400000-0000-4000-8000-000000000001', current_setting('t144.o')::UUID,
       'Ayşe Yılmaz', '0500000144' || n::TEXT, '2026-11-20',
       make_time(8 + n / 2, (n % 2) * 30, 0), make_time(8 + n / 2, (n % 2) * 30 + 29, 0),
       'Kesim', 'confirmed',
       CASE WHEN n = 1 THEN '14400000-0000-4000-8000-000000000201'::UUID
            ELSE '14400000-0000-4000-8000-000000000202'::UUID END,
       'manual'
  FROM generate_series(1, 10) AS n;

INSERT INTO public.reservations (
    id, user_id, organization_id, customer_name, customer_phone, date, start_time, end_time,
    service, status, staff_id, source
)
VALUES ('14400000-0000-4000-8000-000000000399', '14400000-0000-4000-8000-000000000002', current_setting('t144.s')::UUID,
        'Tuğçe Erden', '05000001449', '2026-11-20', '10:00', '10:45', 'Kalıcı Makyaj', 'confirmed',
        '14400000-0000-4000-8000-000000000203', 'manual');

-- 1) Jetonsuz personel → bugünkü bildirim, AYNEN.
UPDATE public.reservations SET customer_arrived_at = now()
 WHERE id = '14400000-0000-4000-8000-000000000301';

DO $$
DECLARE
    v_push JSONB;
BEGIN
    SELECT x INTO v_push FROM pg_temp.q144('send-push', '14400000-0000-4000-8000-000000000301') x;
    IF v_push IS NULL THEN
        RAISE EXCEPTION '1: jetonsuz personele "Müşterin geldi" gitmedi';
    END IF;
    IF v_push -> 'payload' ->> 'title' <> 'Müşterin geldi 👋'
       OR v_push -> 'payload' ->> 'body' <> 'Ayşe · Kesim · 08:30'
       OR v_push -> 'payload' ->> 'url' <> '/personel?date=2026-11-20'
       OR v_push -> 'target' ->> 'staffId' <> '14400000-0000-4000-8000-000000000201' THEN
        RAISE EXCEPTION '1: bildirimin gövdesi değişti: %', v_push;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_temp.q144('send-live-activity', '14400000-0000-4000-8000-000000000301')) THEN
        RAISE EXCEPTION '1: jetonsuz personel için send-live-activity çağrıldı';
    END IF;
END;
$$;

-- 2) Jetonlu personel → send-live-activity, yedek gövde birebir.
UPDATE public.reservations SET customer_arrived_at = now()
 WHERE id = '14400000-0000-4000-8000-000000000302';

DO $$
DECLARE
    v_la JSONB;
BEGIN
    SELECT x INTO v_la FROM pg_temp.q144('send-live-activity', '14400000-0000-4000-8000-000000000302') x;
    IF v_la IS NULL OR v_la ->> 'event' <> 'start' THEN
        RAISE EXCEPTION '2: başlatma isteği yok: %', v_la;
    END IF;
    IF v_la ->> 'staff_id' <> '14400000-0000-4000-8000-000000000202'
       OR v_la ->> 'customer' <> 'Ayşe'
       OR v_la ->> 'service' <> 'Kesim'
       OR v_la ->> 'time' <> '09:00'
       OR v_la ->> 'date' <> '2026-11-20'
       OR v_la ->> 'arrived_at' IS NULL THEN
        RAISE EXCEPTION '2: başlatma gövdesi eksik: %', v_la;
    END IF;
    IF v_la -> 'fallback' <> jsonb_build_object(
        'organization_id', current_setting('t144.o')::UUID,
        'target',  jsonb_build_object('staffId', '14400000-0000-4000-8000-000000000202'),
        'payload', jsonb_build_object(
            'title', 'Müşterin geldi 👋',
            'body',  'Ayşe · Kesim · 09:00',
            'url',   '/personel?date=2026-11-20',
            'tag',   'arrived-14400000-0000-4000-8000-000000000302'
        )
    ) THEN
        RAISE EXCEPTION '2: yedek bildirim bugünkünden farklı: %', v_la -> 'fallback';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_temp.q144('send-push', '14400000-0000-4000-8000-000000000302')) THEN
        RAISE EXCEPTION '2: etkinlik yolunda send-push''a doğrudan da gitti (telefon iki kez çalar)';
    END IF;
END;
$$;

-- 3) Tek kişilik → jeton olsa da bugünkü yol.
UPDATE public.reservations SET customer_arrived_at = now()
 WHERE id = '14400000-0000-4000-8000-000000000399';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_temp.q144('send-live-activity', '14400000-0000-4000-8000-000000000399')) THEN
        RAISE EXCEPTION '3: tek kişilikte etkinlik başlatılmaya çalışıldı';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_temp.q144('send-push', '14400000-0000-4000-8000-000000000399')) THEN
        RAISE EXCEPTION '3: tek kişilikte bugünkü bildirim kayboldu';
    END IF;
END;
$$;

-- 4) Bitir. 303..309 geldi; etkinlik jetonu yalnız 303..308'de.
UPDATE public.reservations SET customer_arrived_at = now() - interval '5 minutes'
 WHERE id BETWEEN '14400000-0000-4000-8000-000000000303' AND '14400000-0000-4000-8000-000000000309';

INSERT INTO public.live_activity_tokens (organization_id, staff_id, device_id, kind, reservation_id, activity_id, token, environment)
SELECT current_setting('t144.o')::UUID, '14400000-0000-4000-8000-000000000202', 'cihaz-144-jetonlu', 'update',
       ('14400000-0000-4000-8000-0000000003' || lpad(n::TEXT, 2, '0'))::UUID, 'etkinlik-' || n::TEXT,
       repeat(to_hex(n), 64), 'sandbox'
  FROM generate_series(3, 8) AS n;

UPDATE public.reservations SET arrived_at = now()            WHERE id = '14400000-0000-4000-8000-000000000303';
UPDATE public.reservations SET status = 'cancelled'          WHERE id = '14400000-0000-4000-8000-000000000304';
UPDATE public.reservations SET no_show_at = now()            WHERE id = '14400000-0000-4000-8000-000000000305';
UPDATE public.reservations SET customer_arrived_at = NULL    WHERE id = '14400000-0000-4000-8000-000000000306';
UPDATE public.reservations SET staff_id = '14400000-0000-4000-8000-000000000201'
                                                             WHERE id = '14400000-0000-4000-8000-000000000307';
UPDATE public.reservations SET date = '2026-11-21'           WHERE id = '14400000-0000-4000-8000-000000000308';
-- Jetonsuz randevunun işi başladı: sunucunun yapacağı bir şey yok.
UPDATE public.reservations SET arrived_at = now()            WHERE id = '14400000-0000-4000-8000-000000000309';
-- İlgisiz değişiklik (not): bitir YOK.
UPDATE public.reservations SET notes = 'kahve'               WHERE id = '14400000-0000-4000-8000-000000000302';

DO $$
DECLARE
    n INT;
    v_res TEXT;
BEGIN
    FOR n IN 3..8 LOOP
        v_res := '14400000-0000-4000-8000-0000000003' || lpad(n::TEXT, 2, '0');
        IF (SELECT count(*) FROM pg_temp.q144('send-live-activity', v_res) x WHERE x ->> 'event' = 'end') <> 1 THEN
            RAISE EXCEPTION '4: % için tek bir "end" bekleniyordu', v_res;
        END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_temp.q144('send-live-activity', '14400000-0000-4000-8000-000000000309') x
                WHERE x ->> 'event' = 'end') THEN
        RAISE EXCEPTION '4: etkinlik jetonu olmayan randevu için istek atıldı';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_temp.q144('send-live-activity', '14400000-0000-4000-8000-000000000302') x
                WHERE x ->> 'event' = 'end') THEN
        RAISE EXCEPTION '4: ilgisiz değişiklik etkinliği bitirdi';
    END IF;
END;
$$;

-- 4b) Silinen bekleyen randevu → end.
INSERT INTO public.live_activity_tokens (organization_id, staff_id, device_id, kind, reservation_id, activity_id, token, environment)
VALUES (current_setting('t144.o')::UUID, '14400000-0000-4000-8000-000000000202', 'cihaz-144-jetonlu', 'update',
        '14400000-0000-4000-8000-000000000302', 'etkinlik-2', repeat('2f', 40), 'sandbox');
DELETE FROM public.reservations WHERE id = '14400000-0000-4000-8000-000000000302';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_temp.q144('send-live-activity', '14400000-0000-4000-8000-000000000302') x
                    WHERE x ->> 'event' = 'end') THEN
        RAISE EXCEPTION '4b: silinen bekleyen randevunun etkinliği bitirilmedi';
    END IF;
END;
$$;

-- 5) Pasife alınan personel.
INSERT INTO public.live_activity_tokens (organization_id, staff_id, device_id, kind, token, environment)
VALUES (current_setting('t144.o')::UUID, '14400000-0000-4000-8000-000000000201', 'cihaz-144-jetonsuz', 'start',
        repeat('ef', 40), 'production');
UPDATE public.staff SET is_active = false WHERE id = '14400000-0000-4000-8000-000000000202';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.live_activity_tokens WHERE staff_id = '14400000-0000-4000-8000-000000000202') THEN
        RAISE EXCEPTION '5: pasife alınan personelin jetonları duruyor';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.live_activity_tokens WHERE staff_id = '14400000-0000-4000-8000-000000000201') THEN
        RAISE EXCEPTION '5: ötekinin jetonu da silindi';
    END IF;
END;
$$;

-- 6) Biçim.
DO $$
DECLARE
    v_ok BOOLEAN;
BEGIN
    BEGIN
        INSERT INTO public.live_activity_tokens (organization_id, staff_id, device_id, kind, token, environment)
        VALUES (current_setting('t144.o')::UUID, '14400000-0000-4000-8000-000000000201', 'cihaz-144-bozuk1', 'start', 'XYZ-değil-hex', 'sandbox');
        v_ok := true;
    EXCEPTION WHEN check_violation THEN v_ok := false;
    END;
    IF v_ok THEN RAISE EXCEPTION '6: bozuk jeton kabul edildi'; END IF;

    BEGIN
        INSERT INTO public.live_activity_tokens (organization_id, staff_id, device_id, kind, reservation_id, token, environment)
        VALUES (current_setting('t144.o')::UUID, '14400000-0000-4000-8000-000000000201', 'cihaz-144-bozuk2', 'start',
                '14400000-0000-4000-8000-000000000301', repeat('aa', 40), 'sandbox');
        v_ok := true;
    EXCEPTION WHEN check_violation THEN v_ok := false;
    END;
    IF v_ok THEN RAISE EXCEPTION '6: randevulu başlatma jetonu kabul edildi'; END IF;

    BEGIN
        INSERT INTO public.live_activity_tokens (organization_id, staff_id, device_id, kind, activity_id, token, environment)
        VALUES (current_setting('t144.o')::UUID, '14400000-0000-4000-8000-000000000201', 'cihaz-144-bozuk3', 'update',
                'etkinlik-x', repeat('aa', 40), 'sandbox');
        v_ok := true;
    EXCEPTION WHEN check_violation THEN v_ok := false;
    END;
    IF v_ok THEN RAISE EXCEPTION '6: randevusuz etkinlik jetonu kabul edildi'; END IF;

    BEGIN
        INSERT INTO public.live_activity_tokens (organization_id, staff_id, device_id, kind, token, environment)
        VALUES (current_setting('t144.o')::UUID, '14400000-0000-4000-8000-000000000201', 'cihaz-144-bozuk4', 'start',
                repeat('aa', 40), 'canli');
        v_ok := true;
    EXCEPTION WHEN check_violation THEN v_ok := false;
    END;
    IF v_ok THEN RAISE EXCEPTION '6: bilinmeyen ortam kabul edildi'; END IF;
END;
$$;

SELECT 'musteri bekliyor (144) regression: ok' AS result;

ROLLBACK;
