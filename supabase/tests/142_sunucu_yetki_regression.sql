-- ============================================================
-- 142_sunucu_yetki_butunluk.sql için işlem içi regresyon testi
-- ============================================================
-- Göç uygulandıktan SONRA çalıştırılır; her fikstür sonda geri sarılır:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/142_sunucu_yetki_regression.sql
--
-- KURU KOŞU — göçü uygulamadan, aynı işlemin içinde dene ve hepsini geri sar
-- (göçün kendi BEGIN/COMMIT'i ve bu dosyanın BEGIN'i sökülüyor):
--   { echo 'BEGIN;';
--     sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' supabase/142_sunucu_yetki_butunluk.sql;
--     sed -e '/^BEGIN;$/d' supabase/tests/142_sunucu_yetki_regression.sql; } | psql … -f -
--
-- Kanıtlanan sözler:
--   0. Yapı: yeni RPC'leri yalnız service_role çağırabiliyor; purge yalnız
--      service_role; has_timeflow_access / org_module_enabled authenticated'ta
--      kaldı, anon'da yok; iki tabloda INSERT (ya da ALL) politikası yok.
--   1. PIN: 5. ayırma kilidi basıyor, 6. ayrılamıyor; süresi dolmuş kilit
--      sayacı baştan başlatıyor.
--   2. Eşleştirme: IP başına 20. ayırma kilitliyor; IP'siz istekler TEK
--      kovada; genel tavan farklı IP'leri de durduruyor; doğru kod hakkı
--      geri veriyor.
--   3. Tahsilat: ikinci çağrı yeni kayıt YAZMIYOR; geri alınmış kayıt
--      sayılmıyor; kısmi ödemenin toplamı dönüyor; staff_id yazılıyor;
--      başka işletmenin rezervasyonu bulunmuyor.
--   4. Pasife alınan personelin push abonelikleri siliniyor, ötekininki kalıyor.
--   5. Sahip kendi işletmesine üye EKLEYEMİYOR, üyeliği başka kullanıcıya
--      ÇEVİREMİYOR, doğrudan işletme AÇAMIYOR; işletme adını değiştirebiliyor.
-- ============================================================

BEGIN;

-- ── 0) Yapı ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
    fn TEXT;
BEGIN
    FOREACH fn IN ARRAY ARRAY[
        'public.staff_pin_reserve(uuid,integer,integer)',
        'public.staff_pair_reserve(text,integer,integer,integer)',
        'public.staff_pair_refund(text)',
        'public.staff_collect_payment(uuid,uuid,uuid,text,numeric,text,uuid)',
        'public.purge_expired_device_codes()'
    ] LOOP
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
    END LOOP;

    FOREACH fn IN ARRAY ARRAY[
        'public.has_timeflow_access(uuid)',
        'public.org_module_enabled(uuid,text)'
    ] LOOP
        IF has_function_privilege('anon', fn, 'EXECUTE') THEN
            RAISE EXCEPTION '0: % anon''a açık', fn;
        END IF;
        -- RLS politikaları (053/087/088) ve telefon bunu authenticated adına çağırıyor.
        IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
            RAISE EXCEPTION '0: % authenticated''a kapandı — RLS bozulur', fn;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_policies
         WHERE schemaname = 'public'
           AND tablename IN ('organizations', 'organization_members')
           AND cmd IN ('INSERT', 'ALL')
    ) THEN
        RAISE EXCEPTION '0: organizations/organization_members üzerinde INSERT ya da ALL politikası kaldı';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger
         WHERE tgrelid = 'public.staff'::regclass
           AND tgname = 'trg_142_staff_deactivate_push'
           AND tgenabled <> 'D'
    ) THEN
        RAISE EXCEPTION '0: pasif personel tetikleyicisi yok ya da kapalı';
    END IF;
END;
$$;

-- ── Fikstürler (süper kullanıcı) ────────────────────────────────────────────
-- handle_new_user her auth fikstürü için bir işletme ve sahip üyeliği açar.
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
    ('14200000-0000-4000-8000-000000000001'::UUID, 'sunucu-142-1@timeflow.test'),
    ('14200000-0000-4000-8000-000000000002'::UUID, 'sunucu-142-2@timeflow.test')
) AS fixture(id, email);

SELECT set_config('t142.o1', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '14200000-0000-4000-8000-000000000001'), true);
SELECT set_config('t142.o2', (SELECT id::TEXT FROM public.organizations WHERE owner_id = '14200000-0000-4000-8000-000000000002'), true);

INSERT INTO public.staff (id, organization_id, name, is_active)
VALUES
    ('14200000-0000-4000-8000-000000000201', current_setting('t142.o1')::UUID, 'Bir', true),
    ('14200000-0000-4000-8000-000000000202', current_setting('t142.o1')::UUID, 'İki', true);

-- ── 1) PIN ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
    s UUID := '14200000-0000-4000-8000-000000000201';
    r RECORD;
    i INT;
BEGIN
    FOR i IN 1..4 LOOP
        SELECT * INTO r FROM public.staff_pin_reserve(s, 5, 15);
        IF NOT r.reserved OR r.attempts <> i OR r.locked_until IS NOT NULL THEN
            RAISE EXCEPTION '1: % . ayırma beklenmedik: %', i, r;
        END IF;
    END LOOP;

    SELECT * INTO r FROM public.staff_pin_reserve(s, 5, 15);
    IF NOT r.reserved OR r.attempts <> 5 OR r.locked_until IS NULL THEN
        RAISE EXCEPTION '1: 5. ayırma kilidi basmadı: %', r;
    END IF;
    IF (SELECT pin_attempts FROM public.staff WHERE id = s) <> 0
       OR (SELECT pin_locked_until FROM public.staff WHERE id = s) IS NULL THEN
        RAISE EXCEPTION '1: kilit satıra yazılmadı';
    END IF;

    SELECT * INTO r FROM public.staff_pin_reserve(s, 5, 15);
    IF r.reserved OR r.locked_until IS NULL THEN
        RAISE EXCEPTION '1: kilitliyken hak ayrıldı: %', r;
    END IF;

    -- Süresi dolmuş kilit: sayaç baştan.
    UPDATE public.staff SET pin_locked_until = now() - interval '1 second' WHERE id = s;
    SELECT * INTO r FROM public.staff_pin_reserve(s, 5, 15);
    IF NOT r.reserved OR r.attempts <> 1 OR r.locked_until IS NOT NULL THEN
        RAISE EXCEPTION '1: süresi dolmuş kilitten sonra baştan başlamadı: %', r;
    END IF;
    IF (SELECT pin_locked_until FROM public.staff WHERE id = s) IS NOT NULL THEN
        RAISE EXCEPTION '1: süresi dolmuş kilit temizlenmedi';
    END IF;
END;
$$;

-- ── 2) Eşleştirme ───────────────────────────────────────────────────────────
DELETE FROM public.staff_pair_attempts;

DO $$
DECLARE
    r RECORD;
    i INT;
BEGIN
    -- IP başına 20 (genel tavan bu bölümde etkisiz: 1000).
    FOR i IN 1..19 LOOP
        SELECT * INTO r FROM public.staff_pair_reserve('203.0.113.7', 20, 15, 1000);
        IF r.locked THEN RAISE EXCEPTION '2: % . denemede erken kilit', i; END IF;
    END LOOP;
    SELECT * INTO r FROM public.staff_pair_reserve('203.0.113.7', 20, 15, 1000);
    IF r.locked THEN RAISE EXCEPTION '2: 20. deneme kendisi reddedildi'; END IF;
    SELECT * INTO r FROM public.staff_pair_reserve('203.0.113.7', 20, 15, 1000);
    IF NOT r.locked OR r.minutes < 1 OR r.minutes > 15 THEN
        RAISE EXCEPTION '2: 21. deneme kilitli değil: %', r;
    END IF;
    -- Başka IP etkilenmiyor.
    SELECT * INTO r FROM public.staff_pair_reserve('198.51.100.9', 20, 15, 1000);
    IF r.locked THEN RAISE EXCEPTION '2: kilit başka IP''ye taştı'; END IF;

    -- IP'siz istekler TEK kovada ('' ve NULL aynı).
    FOR i IN 1..10 LOOP
        PERFORM public.staff_pair_reserve('', 20, 15, 1000);
        PERFORM public.staff_pair_reserve(NULL, 20, 15, 1000);
    END LOOP;
    SELECT * INTO r FROM public.staff_pair_reserve(NULL, 20, 15, 1000);
    IF NOT r.locked THEN RAISE EXCEPTION '2: IP''siz istekler sınırsız'; END IF;

    -- Doğru kod hakkı geri veriyor.
    PERFORM public.staff_pair_reserve('192.0.2.1', 20, 15, 1000);
    PERFORM public.staff_pair_reserve('192.0.2.1', 20, 15, 1000);
    PERFORM public.staff_pair_refund('192.0.2.1');
    IF (SELECT failures FROM public.staff_pair_attempts WHERE ip = '192.0.2.1') <> 1 THEN
        RAISE EXCEPTION '2: geri verme sayacı düşürmedi';
    END IF;
END;
$$;

DELETE FROM public.staff_pair_attempts;

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Genel tavan 3: farklı IP'lerden 3 deneme geçer, 4. durur.
    PERFORM public.staff_pair_reserve('203.0.113.1', 20, 15, 3);
    PERFORM public.staff_pair_reserve('203.0.113.2', 20, 15, 3);
    SELECT * INTO r FROM public.staff_pair_reserve('203.0.113.3', 20, 15, 3);
    IF r.locked THEN RAISE EXCEPTION '2: genel tavana ulaşan deneme reddedildi'; END IF;
    SELECT * INTO r FROM public.staff_pair_reserve('203.0.113.4', 20, 15, 3);
    IF NOT r.locked OR r.minutes <> 1 THEN
        RAISE EXCEPTION '2: genel tavan IP değiştireni durdurmadı: %', r;
    END IF;

    -- Pencere geçince açılıyor.
    UPDATE public.staff_pair_attempts
       SET locked_until = now() - interval '1 second', updated_at = now() - interval '2 minutes'
     WHERE ip = '__global__';
    SELECT * INTO r FROM public.staff_pair_reserve('203.0.113.5', 20, 15, 3);
    IF r.locked THEN RAISE EXCEPTION '2: genel kilit süresi dolunca açılmadı'; END IF;
END;
$$;

DELETE FROM public.staff_pair_attempts;

-- ── 3) Tahsilat ─────────────────────────────────────────────────────────────
INSERT INTO public.reservations (
    id, user_id, organization_id, customer_name, customer_phone, date, start_time, end_time, service, status, staff_id
)
VALUES
    ('14200000-0000-4000-8000-000000000301', '14200000-0000-4000-8000-000000000001',
     current_setting('t142.o1')::UUID, 'Tahsil Bir', '05000001420', '2026-11-12', '10:00', '11:00', 'Kesim', 'confirmed',
     '14200000-0000-4000-8000-000000000201'),
    ('14200000-0000-4000-8000-000000000302', '14200000-0000-4000-8000-000000000001',
     current_setting('t142.o1')::UUID, 'Kapora', '05000001421', '2026-11-12', '12:00', '13:00', 'Boya', 'confirmed',
     '14200000-0000-4000-8000-000000000202');

DO $$
DECLARE
    o UUID := current_setting('t142.o1')::UUID;
    res UUID := '14200000-0000-4000-8000-000000000301';
    a JSONB;
    b JSONB;
    n INT;
BEGIN
    a := public.staff_collect_payment(o, res, NULL, 'Kesim', 500, 'card', '14200000-0000-4000-8000-000000000201');
    IF a->>'status' <> 'inserted' THEN RAISE EXCEPTION '3: ilk tahsilat yazılmadı: %', a; END IF;
    IF (SELECT staff_id FROM public.payments WHERE id = (a->'payment'->>'id')::UUID)
       IS DISTINCT FROM '14200000-0000-4000-8000-000000000201'::UUID THEN
        RAISE EXCEPTION '3: tahsilata işin personeli yazılmadı';
    END IF;

    b := public.staff_collect_payment(o, res, NULL, 'Kesim', 500, 'cash', '14200000-0000-4000-8000-000000000201');
    IF b->>'status' <> 'exists' OR b->'payment'->>'id' <> a->'payment'->>'id' THEN
        RAISE EXCEPTION '3: ikinci çağrı var olanı dönmedi: %', b;
    END IF;
    SELECT count(*) INTO n FROM public.payments WHERE reservation_id = res;
    IF n <> 1 THEN RAISE EXCEPTION '3: çift tahsilat (% kayıt)', n; END IF;

    -- 111 geri alma: damgalı kayıt "zaten alındı" değildir.
    UPDATE public.payments SET voided_at = now() WHERE id = (a->'payment'->>'id')::UUID;
    b := public.staff_collect_payment(o, res, NULL, 'Kesim', 500, 'cash', '14200000-0000-4000-8000-000000000201');
    IF b->>'status' <> 'inserted' THEN RAISE EXCEPTION '3: geri alınmış kayıt yeni tahsilatı engelledi: %', b; END IF;

    -- Kısmi ödeme (masaüstü kaporası): toplam dönüyor, karar çağıranda.
    INSERT INTO public.payments (organization_id, reservation_id, type, amount, method)
    VALUES (o, '14200000-0000-4000-8000-000000000302', 'service', 100, 'cash');
    b := public.staff_collect_payment(o, '14200000-0000-4000-8000-000000000302', NULL, 'Boya', 800, 'card', NULL);
    IF b->>'status' <> 'exists' OR (b->>'paid')::NUMERIC <> 100 THEN
        RAISE EXCEPTION '3: kısmi ödemenin toplamı dönmedi: %', b;
    END IF;

    -- Başka işletmenin rezervasyonu.
    b := public.staff_collect_payment(current_setting('t142.o2')::UUID, res, NULL, 'x', 1, 'cash', NULL);
    IF b->>'status' <> 'not_found' THEN RAISE EXCEPTION '3: başka işletmenin rezervasyonu bulundu: %', b; END IF;
END;
$$;

-- ── 4) Pasif personelin abonelikleri ────────────────────────────────────────
INSERT INTO public.push_subscriptions (organization_id, staff_id, role, endpoint, p256dh, auth, kind)
VALUES
    (current_setting('t142.o1')::UUID, '14200000-0000-4000-8000-000000000201', 'staff', 'test-142-bir', 'k', 'a', 'expo'),
    (current_setting('t142.o1')::UUID, '14200000-0000-4000-8000-000000000202', 'staff', 'test-142-iki', 'k', 'a', 'expo');

UPDATE public.staff SET is_active = false WHERE id = '14200000-0000-4000-8000-000000000201';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.push_subscriptions WHERE endpoint = 'test-142-bir') THEN
        RAISE EXCEPTION '4: pasif personelin aboneliği kaldı';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions WHERE endpoint = 'test-142-iki') THEN
        RAISE EXCEPTION '4: aktif personelin aboneliği silindi';
    END IF;
END;
$$;

-- ── 5) Politikalar — sahibin kendi oturumuyla ───────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"14200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
    o1 UUID := current_setting('t142.o1')::UUID;
    n INT;
BEGIN
    BEGIN
        INSERT INTO public.organization_members (org_id, user_id, role)
        VALUES (o1, '14200000-0000-4000-8000-000000000002', 'admin');
        RAISE EXCEPTION '5: sahip kendi işletmesine başka kullanıcı ekleyebildi';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        INSERT INTO public.organizations (name, owner_id)
        VALUES ('Kaçak işletme', '14200000-0000-4000-8000-000000000001');
        RAISE EXCEPTION '5: doğrudan işletme açılabildi';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    -- Üyeliği başka kullanıcıya çevirmek = eklemek. Satır görünmez kalmalı.
    UPDATE public.organization_members
       SET user_id = '14200000-0000-4000-8000-000000000002'
     WHERE org_id = o1;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION '5: üyelik başka kullanıcıya çevrildi'; END IF;

    -- Sahip işletmesini hâlâ düzenleyebiliyor.
    UPDATE public.organizations SET name = 'Yeni ad 142' WHERE id = o1;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION '5: sahip işletme adını değiştiremedi'; END IF;

    IF public.has_timeflow_access(o1) IS NULL THEN
        RAISE EXCEPTION '5: has_timeflow_access authenticated adına çalışmadı';
    END IF;
END;
$$;

RESET ROLE;

SELECT 'sunucu yetki (142) regression: ok' AS result;

ROLLBACK;
