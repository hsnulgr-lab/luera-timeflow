\set ON_ERROR_STOP on

-- ============================================================
-- 116_tek_kendine_bildirim_yok.sql için işlem içi regresyon testi
-- ============================================================
-- Göç uygulandıktan SONRA çalıştırılır; her fikstür ve kuyruğa düşen her
-- istek sonda geri sarılır (pg_net kuyruğu işlenmemiş satırları görmez):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/tek_bildirim_regression.sql
--
-- KURU KOŞU — göçü uygulamadan, aynı işlemin içinde dene ve hepsini geri sar:
--   { echo 'BEGIN;';
--     sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' supabase/116_tek_kendine_bildirim_yok.sql;
--     sed -e '/^BEGIN;$/d' supabase/tests/tek_bildirim_regression.sql; } | psql … -f -
--
-- Bildirim tetikleyicisi isteği `net.http_post` ile KUYRUĞA yazıyor; test o
-- kuyruğa bakıyor (`net.http_request_queue`). Hiçbir şey gönderilmiyor.
--
-- Kanıtlanan sözler:
--   1. Yapı: fonksiyon SECURITY DEFINER, tetikleyici açık.
--   2. Tek kişilikte adisyon kasaya gidince müdüre "Adisyon kasada" YOK —
--      staff-api yolu (oturumsuz) dahil.
--   3. Ekip düzeninde aynı olay müdüre gidiyor (değişmedi).
--   4. Tek kişilikte sahip KENDİ iptal edince müdüre bildirim YOK.
--   5. Tek kişilikte oturumsuz iptal (müşteri: WhatsApp, halka açık sayfa)
--      müdüre gidiyor.
--   6. Ekip düzeninde sahibin kendi iptali müdüre gidiyor (değişmedi).
--   7. "Yeni randevu" değişmedi: müşteri aldıysa gidiyor, sahip yazdıysa yok.
--   8. Personel olayları değişmedi: atama personele gidiyor.
-- ============================================================

BEGIN;

-- ── 0) Yapı ve önkoşul ─────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT (SELECT prosecdef FROM pg_catalog.pg_proc
             WHERE oid = 'public.notify_push_on_reservation()'::regprocedure) THEN
        RAISE EXCEPTION '116: notify_push_on_reservation SECURITY DEFINER olmalı';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger
         WHERE tgrelid = 'public.reservations'::regclass
           AND tgname = 'trg_push_on_reservation'
           AND tgenabled <> 'D'
    ) THEN
        RAISE EXCEPTION '116: bildirim tetikleyicisi yok ya da kapalı';
    END IF;
    IF position('NOT v_solo' IN pg_get_functiondef('public.notify_push_on_reservation()'::regprocedure)) = 0 THEN
        RAISE EXCEPTION '116: göç uygulanmamış (adisyon olayında tek kişilik koşulu yok)';
    END IF;
    -- Sırlar yoksa tetikleyici hiçbir şey kuyruğa yazmaz ve test boşa geçerdi.
    IF NOT EXISTS (SELECT 1 FROM public.app_secrets WHERE key = 'FUNCTIONS_BASE_URL')
       OR NOT EXISTS (SELECT 1 FROM public.app_secrets WHERE key = 'PUSH_TRIGGER_SECRET') THEN
        RAISE EXCEPTION '116: app_secrets eksik — bildirim kuyruğu görünmez, test anlamsız';
    END IF;
END;
$$;

-- Bir org'un kuyruğa düşen istekleri; `pref` personel olaylarında yok ('').
CREATE OR REPLACE FUNCTION pg_temp.pushes(p_org UUID, p_pref TEXT)
RETURNS INTEGER
LANGUAGE sql
AS $$
    SELECT count(*)::INTEGER
      FROM net.http_request_queue q
     WHERE convert_from(q.body, 'UTF8')::jsonb ->> 'organization_id' = p_org::TEXT
       AND COALESCE(convert_from(q.body, 'UTF8')::jsonb ->> 'pref', '') = p_pref
$$;

-- ── Fikstürler (süper kullanıcı) ────────────────────────────────────────────
-- handle_new_user her auth fikstürü için bir org ve üyelik açar.
--   U1 · tek kişilik   U2 · ekip düzeni
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
    ('11600000-0000-4000-8000-000000000001'::UUID, 'tek-bildirim-1@timeflow.test'),
    ('11600000-0000-4000-8000-000000000002'::UUID, 'tek-bildirim-2@timeflow.test')
) AS fixture(id, email);

SELECT set_config('tek116.o1', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '11600000-0000-4000-8000-000000000001'), true);
SELECT set_config('tek116.o2', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '11600000-0000-4000-8000-000000000002'), true);

UPDATE public.organizations SET solo = true WHERE id = current_setting('tek116.o1')::UUID;

INSERT INTO public.staff (id, organization_id, name, is_active)
VALUES
    ('11600000-0000-4000-8000-000000000201', current_setting('tek116.o1')::UUID, 'Derya Güzellik', true),
    ('11600000-0000-4000-8000-000000000202', current_setting('tek116.o2')::UUID, 'Ekip Bir',       true);

-- Sahibin panelden yazdığı randevular (`source = 'manual'`).
INSERT INTO public.reservations (
    id, user_id, organization_id, customer_name, customer_phone, date, start_time, end_time,
    service, status, staff_id, source
)
VALUES
    ('11600000-0000-4000-8000-000000000301', '11600000-0000-4000-8000-000000000001', current_setting('tek116.o1')::UUID,
     'Tuğçe Erden', '05000001160', '2026-10-22', '10:00', '11:00', 'Kalıcı Makyaj', 'confirmed',
     '11600000-0000-4000-8000-000000000201', 'manual'),
    ('11600000-0000-4000-8000-000000000302', '11600000-0000-4000-8000-000000000001', current_setting('tek116.o1')::UUID,
     'Elif Demir', '05000001160', '2026-10-22', '12:00', '13:00', 'Cilt Bakımı', 'confirmed',
     '11600000-0000-4000-8000-000000000201', 'manual'),
    ('11600000-0000-4000-8000-000000000303', '11600000-0000-4000-8000-000000000001', current_setting('tek116.o1')::UUID,
     'Yasemin Kurt', '05000001160', '2026-10-22', '14:00', '15:00', 'Ağda', 'confirmed',
     '11600000-0000-4000-8000-000000000201', 'manual'),
    ('11600000-0000-4000-8000-000000000311', '11600000-0000-4000-8000-000000000002', current_setting('tek116.o2')::UUID,
     'Gizem Ünal', '05000001160', '2026-10-22', '10:00', '11:00', 'Kesim', 'confirmed',
     '11600000-0000-4000-8000-000000000202', 'manual'),
    ('11600000-0000-4000-8000-000000000312', '11600000-0000-4000-8000-000000000002', current_setting('tek116.o2')::UUID,
     'Pınar Aksoy', '05000001160', '2026-10-22', '12:00', '13:00', 'Fön', 'confirmed',
     '11600000-0000-4000-8000-000000000202', 'manual');

-- ── 7) "Yeni randevu": sahip yazdıysa YOK, müşteri aldıysa VAR ─────────────
DO $$
BEGIN
    IF pg_temp.pushes(current_setting('tek116.o1')::UUID, 'booked') <> 0 THEN
        RAISE EXCEPTION '7: sahibin yazdığı randevu müdüre bildirildi';
    END IF;
END;
$$;

INSERT INTO public.reservations (
    id, user_id, organization_id, customer_name, customer_phone, date, start_time, end_time,
    service, status, staff_id, source
)
VALUES ('11600000-0000-4000-8000-000000000304', '11600000-0000-4000-8000-000000000001', current_setting('tek116.o1')::UUID,
        'Vildan Koç', '05000001160', '2026-10-22', '16:00', '17:00', 'Kaş Tasarımı', 'confirmed',
        '11600000-0000-4000-8000-000000000201', 'booking');

DO $$
BEGIN
    IF pg_temp.pushes(current_setting('tek116.o1')::UUID, 'booked') <> 1 THEN
        RAISE EXCEPTION '7: müşterinin aldığı randevu tek kişilikte müdüre gitmedi';
    END IF;
END;
$$;

-- ── 2/3) Adisyon kasaya — staff-api yolu: oturumsuz, servis anahtarı ───────
UPDATE public.reservations
   SET arrived_at = now() - interval '1 hour', service_ended_at = now()
 WHERE id IN ('11600000-0000-4000-8000-000000000301', '11600000-0000-4000-8000-000000000311');

DO $$
BEGIN
    IF pg_temp.pushes(current_setting('tek116.o1')::UUID, 'cash') <> 0 THEN
        RAISE EXCEPTION '2: tek kişilikte "Adisyon kasada" müdüre (kendine) gönderildi';
    END IF;
    IF pg_temp.pushes(current_setting('tek116.o2')::UUID, 'cash') <> 1 THEN
        RAISE EXCEPTION '3: ekip düzeninde "Adisyon kasada" müdüre gitmedi';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM net.http_request_queue q
         WHERE convert_from(q.body, 'UTF8')::jsonb ->> 'organization_id' = current_setting('tek116.o2')
           AND convert_from(q.body, 'UTF8')::jsonb -> 'payload' ->> 'title' = 'Adisyon kasada 💰'
    ) THEN
        RAISE EXCEPTION '3: ekip düzeninin adisyon bildirimi metni değişmiş';
    END IF;
END;
$$;

-- ── 4) Tek kişilik: sahip KENDİ iptal ediyor (uygulamanın oturumu) ─────────
SELECT set_config('request.jwt.claims', '{"sub":"11600000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
UPDATE public.reservations SET status = 'cancelled' WHERE id = '11600000-0000-4000-8000-000000000302';
RESET ROLE;

DO $$
BEGIN
    IF pg_temp.pushes(current_setting('tek116.o1')::UUID, 'cancelled') <> 0 THEN
        RAISE EXCEPTION '4: tek kişilikte sahibin kendi iptali müdüre (kendine) bildirildi';
    END IF;
END;
$$;

-- ── 5) Tek kişilik: oturumsuz iptal — müşteri (WhatsApp, halka açık sayfa) ─
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.reservations SET status = 'cancelled' WHERE id = '11600000-0000-4000-8000-000000000303';

DO $$
BEGIN
    IF pg_temp.pushes(current_setting('tek116.o1')::UUID, 'cancelled') <> 1 THEN
        RAISE EXCEPTION '5: müşterinin iptali tek kişilikte müdüre gitmedi';
    END IF;
END;
$$;

-- ── 6) Ekip düzeni: sahibin kendi iptali yine gidiyor ──────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"11600000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
UPDATE public.reservations SET status = 'cancelled' WHERE id = '11600000-0000-4000-8000-000000000312';
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

DO $$
BEGIN
    IF pg_temp.pushes(current_setting('tek116.o2')::UUID, 'cancelled') <> 1 THEN
        RAISE EXCEPTION '6: ekip düzeninde iptal müdüre gitmedi (davranış değişmemeliydi)';
    END IF;
END;
$$;

-- ── 8) Personel olayları değişmedi: atama personele gidiyor ────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM net.http_request_queue q
         WHERE convert_from(q.body, 'UTF8')::jsonb ->> 'organization_id' = current_setting('tek116.o2')
           AND convert_from(q.body, 'UTF8')::jsonb -> 'target' ->> 'staffId' = '11600000-0000-4000-8000-000000000202'
           AND convert_from(q.body, 'UTF8')::jsonb -> 'payload' ->> 'title' = 'Yeni randevun var'
    ) THEN
        RAISE EXCEPTION '8: personele atama bildirimi kayboldu';
    END IF;
END;
$$;

SELECT 'tek bildirim (116) regression: ok' AS result;

ROLLBACK;
