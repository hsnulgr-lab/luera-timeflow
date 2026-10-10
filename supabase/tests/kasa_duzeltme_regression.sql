\set ON_ERROR_STOP on

-- ============================================================
-- 111_kasa_duzeltme_izi.sql için işlem içi regresyon testi
-- ============================================================
-- Göç uygulandıktan SONRA çalıştırılır; her fikstür sonda geri sarılır:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/kasa_duzeltme_regression.sql
--
-- KURU KOŞU — göçü uygulamadan, aynı işlemin içinde dene ve hepsini geri sar.
-- Göçün kendi BEGIN/COMMIT'i ve bu dosyanın BEGIN'i sökülüp tek işleme
-- diziliyor; sondaki ROLLBACK göçü de geri alıyor:
--   { echo 'BEGIN;'; sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' supabase/111_kasa_duzeltme_izi.sql;
--     sed -e '/^BEGIN;$/d' supabase/tests/kasa_duzeltme_regression.sql; } | psql … -f -
--
-- Kanıtlanan sözler:
--   1. Düzeltme eskiyi damgalar, yenisini eskisinin TAM KOPYASI olarak yazar
--      (taksit bağı dahil); saat (`paid_at`) yerinde kalır.
--   2. Damgalı satır uygulamaya görünmez; iz yalnız `voided_payments`tan okunur.
--   3. 061'in tavanları damgalı satırı saymaz; canlı satırda tavan hâlâ kapalı
--      ve düşen bir düzeltme yarım iş bırakmaz.
--   4. Geri alma adisyonu açar; bölünmüş adisyonda son parça gidene kadar açmaz.
--   5. İstemci damga basamaz, sahte düzeltme ekleyemez, damgalı satırı
--      silemez — ama bugünkü yazma yolları (ekle / sil) çalışmaya devam eder.
--   6. Başka org göremez ve dokunamaz; anon hiçbirini çağıramaz.
--
-- Kullanıcı değiştirme: `request.jwt.claims` + `SET LOCAL ROLE authenticated`
-- — PostgREST'in her istekte yaptığının aynısı. Kullanıcı adına yapılan
-- denetimler DO bloklarında; geçici şemadaki yardımcılar yalnız süper
-- kullanıcıyken çağrılıyor.
-- ============================================================

BEGIN;

-- ── 0) Yapı ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regprocedure('public.correct_payment(uuid,numeric,text)') IS NULL
       OR to_regprocedure('public.revert_payment(uuid)') IS NULL
       OR to_regprocedure('public.voided_payments(uuid,timestamptz,timestamptz)') IS NULL THEN
        RAISE EXCEPTION '111: fonksiyonlar eksik';
    END IF;

    IF (
        SELECT count(*) FROM pg_catalog.pg_policies
         WHERE schemaname = 'public' AND tablename = 'payments'
           AND policyname IN ('payments_live_select', 'payments_live_insert',
                              'payments_live_update', 'payments_live_delete')
           AND permissive = 'RESTRICTIVE'
    ) <> 4 THEN
        RAISE EXCEPTION '111: dört kısıtlayıcı politika bekleniyordu';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policies
         WHERE schemaname = 'public' AND tablename = 'payments'
           AND policyname = 'payments_org_access' AND permissive = 'PERMISSIVE'
    ) THEN
        RAISE EXCEPTION '111: payments_org_access yerinde değil — kısıtlayıcı politika tek başına HİÇBİR satırı açmaz';
    END IF;

    IF (
        SELECT count(*) FROM pg_catalog.pg_proc
         WHERE oid IN (
             'public.correct_payment(uuid,numeric,text)'::regprocedure,
             'public.revert_payment(uuid)'::regprocedure,
             'public.voided_payments(uuid,timestamptz,timestamptz)'::regprocedure
         )
           AND prosecdef
           AND proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']
    ) <> 3 THEN
        RAISE EXCEPTION '111: fonksiyonlar SECURITY DEFINER ve sabit search_path olmalı';
    END IF;

    IF has_function_privilege('anon', 'public.correct_payment(uuid,numeric,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.revert_payment(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.voided_payments(uuid,timestamptz,timestamptz)', 'EXECUTE') THEN
        RAISE EXCEPTION '111: anon fonksiyonları çağırabiliyor (094''ün dersi)';
    END IF;

    IF NOT has_function_privilege('authenticated', 'public.correct_payment(uuid,numeric,text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.revert_payment(uuid)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.voided_payments(uuid,timestamptz,timestamptz)', 'EXECUTE') THEN
        RAISE EXCEPTION '111: authenticated fonksiyonları çağıramıyor';
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
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
)
VALUES
    (
        '00000000-0000-0000-0000-000000000000',
        '11100000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated', 'kasa-one@timeflow.test', '', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
        '', '', '', ''
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        '11100000-0000-4000-8000-000000000002',
        'authenticated', 'authenticated', 'kasa-two@timeflow.test', '', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
        '', '', '', ''
    );

INSERT INTO public.customers (id, user_id, organization_id, name, phone)
VALUES (
    '11100000-0000-4000-8000-000000000101',
    '11100000-0000-4000-8000-000000000001',
    (SELECT id FROM public.organizations WHERE owner_id = '11100000-0000-4000-8000-000000000001'),
    'Kasa Bir', '05000001101'
);

INSERT INTO public.staff (id, organization_id, name, color, role)
VALUES (
    '11100000-0000-4000-8000-000000000201',
    (SELECT id FROM public.organizations WHERE owner_id = '11100000-0000-4000-8000-000000000001'),
    'Kasa Uzman', '#111111', 'doctor'
);

INSERT INTO public.reservations (
    id, user_id, organization_id, customer_id, customer_name, customer_phone,
    date, start_time, end_time, service, status, staff_id, is_paid
)
VALUES
    (
        '11100000-0000-4000-8000-000000000301',
        '11100000-0000-4000-8000-000000000001',
        (SELECT id FROM public.organizations WHERE owner_id = '11100000-0000-4000-8000-000000000001'),
        '11100000-0000-4000-8000-000000000101', 'Kasa Bir', '05000001101',
        '2026-10-09', '13:00', '14:00', 'Cilt Bakımı', 'completed',
        '11100000-0000-4000-8000-000000000201', true
    ),
    (
        '11100000-0000-4000-8000-000000000302',
        '11100000-0000-4000-8000-000000000001',
        (SELECT id FROM public.organizations WHERE owner_id = '11100000-0000-4000-8000-000000000001'),
        '11100000-0000-4000-8000-000000000101', 'Kasa Bir', '05000001101',
        '2026-10-09', '15:00', '16:00', 'Kalıcı Makyaj', 'completed',
        '11100000-0000-4000-8000-000000000201', true
    );

INSERT INTO public.treatment_plans (id, organization_id, customer_id, title, total_amount)
VALUES (
    '11100000-0000-4000-8000-000000000401',
    (SELECT id FROM public.organizations WHERE owner_id = '11100000-0000-4000-8000-000000000001'),
    '11100000-0000-4000-8000-000000000101', 'Kasa planı', 1000
);

-- İkinci plan: tek vadesi var, ödemesi geri alınacak ve vade silinecek.
-- Üçüncü plan: vadesiz; ödemesi düzeltilecek, sonra vade eklenecek.
INSERT INTO public.treatment_plans (id, organization_id, customer_id, title, total_amount)
VALUES
    (
        '11100000-0000-4000-8000-000000000402',
        (SELECT id FROM public.organizations WHERE owner_id = '11100000-0000-4000-8000-000000000001'),
        '11100000-0000-4000-8000-000000000101', 'Silinecek vade', 500
    ),
    (
        '11100000-0000-4000-8000-000000000403',
        (SELECT id FROM public.organizations WHERE owner_id = '11100000-0000-4000-8000-000000000001'),
        '11100000-0000-4000-8000-000000000101', 'Vadesiz plan', 1000
    );

INSERT INTO public.treatment_installments
    (id, organization_id, customer_id, treatment_plan_id, sequence_no, due_date, amount)
VALUES
    (
        '11100000-0000-4000-8000-000000000501',
        (SELECT id FROM public.organizations WHERE owner_id = '11100000-0000-4000-8000-000000000001'),
        '11100000-0000-4000-8000-000000000101',
        '11100000-0000-4000-8000-000000000401', 1, '2026-10-09', 1000
    ),
    (
        '11100000-0000-4000-8000-000000000502',
        (SELECT id FROM public.organizations WHERE owner_id = '11100000-0000-4000-8000-000000000001'),
        '11100000-0000-4000-8000-000000000101',
        '11100000-0000-4000-8000-000000000402', 1, '2026-10-09', 500
    );

-- P1 randevulu tahsilat · P2 taksitli plan ödemesi (planı tam kapatıyor) ·
-- Q1/Q2 bölünmüş adisyon · P3 randevusuz ürün satışı · P4 masaüstünün `other`ı ·
-- P5 ikinci planın tek vadesi · P6 vadesiz planın tam ödemesi.
INSERT INTO public.payments (
    id, organization_id, customer_id, reservation_id, treatment_plan_id, installment_id,
    type, description, amount, method, paid_at
)
VALUES
    (
        '11100000-0000-4000-8000-000000000601',
        (SELECT id FROM public.organizations WHERE owner_id = '11100000-0000-4000-8000-000000000001'),
        '11100000-0000-4000-8000-000000000101', '11100000-0000-4000-8000-000000000301', NULL, NULL,
        'service', 'Cilt Bakımı', 1200, 'card', '2026-10-09 13:05:00+03'
    ),
    (
        '11100000-0000-4000-8000-000000000602',
        (SELECT id FROM public.organizations WHERE owner_id = '11100000-0000-4000-8000-000000000001'),
        '11100000-0000-4000-8000-000000000101', NULL,
        '11100000-0000-4000-8000-000000000401', '11100000-0000-4000-8000-000000000501',
        'service', 'Kasa planı 1/1', 1000, 'cash', '2026-10-09 12:00:00+03'
    ),
    (
        '11100000-0000-4000-8000-000000000603',
        (SELECT id FROM public.organizations WHERE owner_id = '11100000-0000-4000-8000-000000000001'),
        '11100000-0000-4000-8000-000000000101', '11100000-0000-4000-8000-000000000302', NULL, NULL,
        'service', 'Kalıcı Makyaj', 500, 'cash', '2026-10-09 16:00:00+03'
    ),
    (
        '11100000-0000-4000-8000-000000000604',
        (SELECT id FROM public.organizations WHERE owner_id = '11100000-0000-4000-8000-000000000001'),
        '11100000-0000-4000-8000-000000000101', '11100000-0000-4000-8000-000000000302', NULL, NULL,
        'service', 'Kalıcı Makyaj', 500, 'card', '2026-10-09 16:01:00+03'
    ),
    (
        '11100000-0000-4000-8000-000000000605',
        (SELECT id FROM public.organizations WHERE owner_id = '11100000-0000-4000-8000-000000000001'),
        NULL, NULL, NULL, NULL,
        'product', 'Krem', 300, 'cash', '2026-10-09 17:00:00+03'
    ),
    (
        '11100000-0000-4000-8000-000000000606',
        (SELECT id FROM public.organizations WHERE owner_id = '11100000-0000-4000-8000-000000000001'),
        '11100000-0000-4000-8000-000000000101', NULL, NULL, NULL,
        'other', 'Eski kayıt', 600, 'other', '2026-10-09 17:30:00+03'
    ),
    (
        '11100000-0000-4000-8000-000000000607',
        (SELECT id FROM public.organizations WHERE owner_id = '11100000-0000-4000-8000-000000000001'),
        '11100000-0000-4000-8000-000000000101', NULL,
        '11100000-0000-4000-8000-000000000402', '11100000-0000-4000-8000-000000000502',
        'service', 'Silinecek vade 1/1', 500, 'cash', '2026-10-09 11:00:00+03'
    ),
    (
        '11100000-0000-4000-8000-000000000608',
        (SELECT id FROM public.organizations WHERE owner_id = '11100000-0000-4000-8000-000000000001'),
        '11100000-0000-4000-8000-000000000101', NULL,
        '11100000-0000-4000-8000-000000000403', NULL,
        'service', 'Vadesiz plan', 1000, 'cash', '2026-10-09 10:00:00+03'
    );

-- Birinci org'un kimliği SÜPER KULLANICIYKEN alınıyor. İkinci kullanıcı onu
-- bir alt sorguyla arasaydı RLS org'u ondan gizler, alt sorgu NULL döner ve
-- "başka org okuyamıyor" denetimi yetki yüzünden değil boşluk yüzünden geçerdi.
SELECT set_config('kasa111.o1',
                  (SELECT id FROM public.organizations
                    WHERE owner_id = '11100000-0000-4000-8000-000000000001')::TEXT, true);

-- ── 1) Düzelt — birinci kullanıcı ───────────────────────────────────────────
SELECT set_config('request.jwt.claims',
                  '{"sub":"11100000-0000-4000-8000-000000000001","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', '11100000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
    v_new UUID;
    v_row public.payments%ROWTYPE;
BEGIN
    v_new := public.correct_payment('11100000-0000-4000-8000-000000000601', 1000, 'card');

    IF EXISTS (SELECT 1 FROM public.payments WHERE id = '11100000-0000-4000-8000-000000000601') THEN
        RAISE EXCEPTION 'damgalı eski kayıt uygulamaya görünüyor';
    END IF;

    SELECT * INTO v_row FROM public.payments WHERE id = v_new;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'düzeltme kaydı uygulamaya görünmüyor';
    END IF;
    IF v_row.amount <> 1000
       OR v_row.method <> 'card'
       OR v_row.corrected_from IS DISTINCT FROM '11100000-0000-4000-8000-000000000601'
       OR v_row.reservation_id IS DISTINCT FROM '11100000-0000-4000-8000-000000000301'
       OR v_row.customer_id IS DISTINCT FROM '11100000-0000-4000-8000-000000000101'
       OR v_row.description IS DISTINCT FROM 'Cilt Bakımı'
       OR v_row.type IS DISTINCT FROM 'service'
       OR v_row.paid_at <> '2026-10-09 13:05:00+03'
       OR v_row.created_by IS DISTINCT FROM '11100000-0000-4000-8000-000000000001'
       OR v_row.voided_at IS NOT NULL THEN
        RAISE EXCEPTION 'düzeltme kaydı eskisinin kopyası değil: %', row_to_json(v_row);
    END IF;

    PERFORM set_config('kasa111.n1', v_new::TEXT, true);
END;
$$;

-- İz yalnız buradan okunuyor; başka org'un izi değil, bu org'un dönemi.
DO $$
DECLARE
    v_count INT;
    v_reason TEXT;
BEGIN
    SELECT count(*), max(void_reason) INTO v_count, v_reason
      FROM public.voided_payments(
          current_setting('kasa111.o1')::UUID,
          '2026-10-09 00:00:00+03', '2026-10-09 23:59:59+03'
      );
    IF v_count <> 1 OR v_reason IS DISTINCT FROM 'correction' THEN
        RAISE EXCEPTION 'iz okunamıyor: % satır, sebep %', v_count, v_reason;
    END IF;

    SELECT count(*) INTO v_count
      FROM public.voided_payments(
          current_setting('kasa111.o1')::UUID,
          '2026-10-10 00:00:00+03', '2026-10-10 23:59:59+03'
      );
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'iz tahsilatın gününden kaydı: ertesi gün % satır', v_count;
    END IF;
END;
$$;

-- Reddedilen düzeltmeler: her biri kendi cümlesiyle.
DO $$
DECLARE
    v_n1 UUID := current_setting('kasa111.n1')::UUID;
    v_case RECORD;
BEGIN
    FOR v_case IN
        SELECT * FROM (VALUES
            ('11100000-0000-4000-8000-000000000601'::UUID, 900::NUMERIC, 'card', 'already_voided'),
            (v_n1, 1000::NUMERIC, 'card', 'no_change'),
            (v_n1, 1000.004::NUMERIC, 'card', 'no_change'),
            (v_n1, 0::NUMERIC, 'card', 'zero_amount'),
            (v_n1, 900::NUMERIC, 'other', 'bad_method'),
            ('11100000-0000-4000-8000-000000000999'::UUID, 900::NUMERIC, 'card', 'payment_not_found')
        ) AS c(payment_id, amount, method, expected)
    LOOP
        BEGIN
            PERFORM public.correct_payment(v_case.payment_id, v_case.amount, v_case.method);
            RAISE EXCEPTION 'beklenen ret gelmedi: %', v_case.expected;
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM IS DISTINCT FROM v_case.expected THEN
                RAISE;
            END IF;
        END;
    END LOOP;
END;
$$;

-- Taksitli plan: düzeltme vadeye BAĞLI kalıyor ve 061'in tavanı damgalı
-- satırı saymıyor (tam ödenmiş planın ödemesi küçültülebiliyor).
DO $$
DECLARE
    v_new UUID;
    v_row public.payments%ROWTYPE;
BEGIN
    v_new := public.correct_payment('11100000-0000-4000-8000-000000000602', 900, 'card');

    SELECT * INTO v_row FROM public.payments WHERE id = v_new;
    IF v_row.installment_id IS DISTINCT FROM '11100000-0000-4000-8000-000000000501'
       OR v_row.treatment_plan_id IS DISTINCT FROM '11100000-0000-4000-8000-000000000401'
       OR v_row.amount <> 900
       OR v_row.method <> 'card' THEN
        RAISE EXCEPTION 'plan ödemesinin düzeltmesi vadesinden koptu: %', row_to_json(v_row);
    END IF;

    PERFORM set_config('kasa111.n2', v_new::TEXT, true);

    -- Canlı satırda tavan hâlâ kapalı ve düşen düzeltme YARIM İŞ BIRAKMIYOR:
    -- damga da yeni satır da geri sarılıyor, ödeme canlı kalıyor.
    BEGIN
        PERFORM public.correct_payment(v_new, 1100, 'card');
        RAISE EXCEPTION 'tavanı aşan düzeltme geçti';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM IS DISTINCT FROM 'installment_payment_exceeds_balance' THEN
            RAISE;
        END IF;
    END;

    IF NOT EXISTS (SELECT 1 FROM public.payments WHERE id = v_new AND amount = 900) THEN
        RAISE EXCEPTION 'reddedilen düzeltme ödemeyi damgalı bıraktı';
    END IF;
END;
$$;

-- Vadesiz plan: plan tavanı da damgalı satırı saymıyor.
DO $$
DECLARE
    v_new UUID;
BEGIN
    v_new := public.correct_payment('11100000-0000-4000-8000-000000000608', 600, 'cash');
    IF NOT EXISTS (
        SELECT 1 FROM public.payments
         WHERE id = v_new AND amount = 600 AND installment_id IS NULL
           AND treatment_plan_id = '11100000-0000-4000-8000-000000000403'
    ) THEN
        RAISE EXCEPTION 'vadesiz plan ödemesinin düzeltmesi planından koptu';
    END IF;
END;
$$;

-- Masaüstünün `other`ı olduğu gibi kalabiliyor (yalnız tutar düzeltiliyor).
DO $$
DECLARE
    v_new UUID;
BEGIN
    v_new := public.correct_payment('11100000-0000-4000-8000-000000000606', 500, 'other');
    IF NOT EXISTS (SELECT 1 FROM public.payments WHERE id = v_new AND method = 'other' AND amount = 500) THEN
        RAISE EXCEPTION '`other` yöntemli tahsilatın tutarı düzeltilemedi';
    END IF;
END;
$$;

-- ── 2) Geri al ──────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_paid BOOLEAN;
BEGIN
    -- R1'in tek canlı tahsilatı düzeltme kaydı (N1): gidince adisyon açılır.
    PERFORM public.revert_payment(current_setting('kasa111.n1')::UUID);
    SELECT is_paid INTO v_paid FROM public.reservations WHERE id = '11100000-0000-4000-8000-000000000301';
    IF v_paid IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'geri alma adisyonu açmadı';
    END IF;

    -- Bölünmüş adisyon: ilk parça gidince hâlâ parası var.
    PERFORM public.revert_payment('11100000-0000-4000-8000-000000000603');
    SELECT is_paid INTO v_paid FROM public.reservations WHERE id = '11100000-0000-4000-8000-000000000302';
    IF v_paid IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'bölünmüş adisyonun yarısı geri alınınca adisyon açıldı';
    END IF;

    PERFORM public.revert_payment('11100000-0000-4000-8000-000000000604');
    SELECT is_paid INTO v_paid FROM public.reservations WHERE id = '11100000-0000-4000-8000-000000000302';
    IF v_paid IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'son parça da geri alındı ama adisyon kapalı kaldı';
    END IF;

    -- Randevusuz satış: açılacak adisyon yok, yalnız damga.
    PERFORM public.revert_payment('11100000-0000-4000-8000-000000000605');

    -- İkinci planın tek ödemesi: vade artık ödemesiz (5. bölümde silinecek).
    PERFORM public.revert_payment('11100000-0000-4000-8000-000000000607');

    BEGIN
        PERFORM public.revert_payment('11100000-0000-4000-8000-000000000603');
        RAISE EXCEPTION 'iki kez geri alma geçti';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM IS DISTINCT FROM 'already_voided' THEN
            RAISE;
        END IF;
    END;
END;
$$;

-- ── 3) İstemci damgaya dokunamıyor; bugünkü yazma yolları açık ──────────────
DO $$
DECLARE
    v_org UUID := current_setting('kasa111.o1')::UUID;
    v_n2 UUID := current_setting('kasa111.n2')::UUID;
    v_id UUID;
    v_rows INT;
BEGIN
    BEGIN
        UPDATE public.payments
           SET voided_at = now(), void_reason = 'revert'
         WHERE id = v_n2;
        RAISE EXCEPTION 'istemci damga bastı';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.payments (organization_id, type, amount, method, corrected_from)
        VALUES (v_org, 'other', 1, 'cash', v_n2);
        RAISE EXCEPTION 'istemci sahte düzeltme satırı ekledi';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    -- Damgalı satır görünmüyor, o yüzden silinemiyor da: iz kalıyor.
    DELETE FROM public.payments WHERE id = '11100000-0000-4000-8000-000000000601';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN
        RAISE EXCEPTION 'istemci damgalı satırı sildi';
    END IF;

    -- Masaüstünün bugünkü yolu: ekle, sonra sil. İkisi de çalışmalı.
    INSERT INTO public.payments (organization_id, customer_id, type, amount, method)
    VALUES (v_org, '11100000-0000-4000-8000-000000000101', 'other', 50, 'cash')
    RETURNING id INTO v_id;
    DELETE FROM public.payments WHERE id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
        RAISE EXCEPTION 'canlı tahsilatın eklenip silinmesi bozuldu';
    END IF;
END;
$$;

-- ── 4) Başka org ve anon ────────────────────────────────────────────────────
RESET ROLE;
SELECT set_config('request.jwt.claims',
                  '{"sub":"11100000-0000-4000-8000-000000000002","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', '11100000-0000-4000-8000-000000000002', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
    v_count INT;
BEGIN
    BEGIN
        PERFORM public.correct_payment(current_setting('kasa111.n2')::UUID, 800, 'card');
        RAISE EXCEPTION 'başka org düzeltme yaptı';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM IS DISTINCT FROM 'payment_not_found' THEN
            RAISE;
        END IF;
    END;

    BEGIN
        PERFORM public.revert_payment(current_setting('kasa111.n2')::UUID);
        RAISE EXCEPTION 'başka org geri alma yaptı';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM IS DISTINCT FROM 'payment_not_found' THEN
            RAISE;
        END IF;
    END;

    SELECT count(*) INTO v_count
      FROM public.voided_payments(
          current_setting('kasa111.o1')::UUID,
          '2026-10-01 00:00:00+03', '2026-10-31 23:59:59+03'
      );
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'başka org % damgalı satır okudu', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM public.payments
     WHERE organization_id = current_setting('kasa111.o1')::UUID;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'başka org % tahsilat okudu', v_count;
    END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE anon;

DO $$
BEGIN
    BEGIN
        PERFORM public.correct_payment(current_setting('kasa111.n2')::UUID, 800, 'card');
        RAISE EXCEPTION 'anon düzeltme fonksiyonunu çağırabildi';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
END;
$$;

-- ── 5) Damganın kendisi ve 061 (süper kullanıcı) ────────────────────────────
RESET ROLE;

DO $$
DECLARE
    v_bad INT;
BEGIN
    -- Damgalı satırlar duruyor: silinmedi, sebepleri ve yapan yazılı.
    SELECT count(*) INTO v_bad
      FROM public.payments
     WHERE id IN (
         '11100000-0000-4000-8000-000000000601', '11100000-0000-4000-8000-000000000602',
         '11100000-0000-4000-8000-000000000606'
     )
       AND (voided_at IS NULL OR void_reason <> 'correction'
            OR voided_by IS DISTINCT FROM '11100000-0000-4000-8000-000000000001');
    IF v_bad <> 0 THEN
        RAISE EXCEPTION 'düzeltilen % kaydın damgası eksik', v_bad;
    END IF;

    SELECT count(*) INTO v_bad
      FROM public.payments
     WHERE id IN (
         current_setting('kasa111.n1')::UUID,
         '11100000-0000-4000-8000-000000000603', '11100000-0000-4000-8000-000000000604',
         '11100000-0000-4000-8000-000000000605', '11100000-0000-4000-8000-000000000607'
     )
       AND (voided_at IS NULL OR void_reason <> 'revert');
    IF v_bad <> 0 THEN
        RAISE EXCEPTION 'geri alınan % kaydın damgası eksik', v_bad;
    END IF;
END;
$$;

-- 061: damgalı ₺1.000 artık sayılmıyor — vade ve plan ₺900'e inebiliyor.
-- Süzgeçsiz ikisi de "ödenenin altına inilemez" diye reddedilirdi.
UPDATE public.treatment_installments
   SET amount = 900
 WHERE id = '11100000-0000-4000-8000-000000000501';

UPDATE public.treatment_plans
   SET total_amount = 900
 WHERE id = '11100000-0000-4000-8000-000000000401';

-- 061: damgalı satıra FK zinciri dokununca (silinen personel → SET NULL ile
-- aynı yol) tavana sokulmuyor. Süzgeçsiz 900 + 1.000 > 900 diye düşerdi.
UPDATE public.payments
   SET staff_id = '11100000-0000-4000-8000-000000000201'
 WHERE id = '11100000-0000-4000-8000-000000000602';

-- 061: vadesiz planda düzeltilen ₺1.000 sayılmıyor — ₺400'lük vade eklenebiliyor
-- (400 + 600 = 1.000) ve plan toplamı yeniden yazılabiliyor.
INSERT INTO public.treatment_installments
    (id, organization_id, customer_id, treatment_plan_id, sequence_no, due_date, amount)
VALUES (
    '11100000-0000-4000-8000-000000000503',
    current_setting('kasa111.o1')::UUID,
    '11100000-0000-4000-8000-000000000101',
    '11100000-0000-4000-8000-000000000403', 1, '2026-11-09', 400
);

UPDATE public.treatment_plans
   SET total_amount = 1000
 WHERE id = '11100000-0000-4000-8000-000000000403';

-- 061: ödemesi geri alınmış vade silinebiliyor; damgalı ödeme yerinde kalıyor
-- ve vadeyle bağı FK'nin kendi yoluyla düşüyor.
DELETE FROM public.treatment_installments
 WHERE id = '11100000-0000-4000-8000-000000000502';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.payments
         WHERE id = '11100000-0000-4000-8000-000000000607'
           AND voided_at IS NOT NULL AND installment_id IS NULL
           AND treatment_plan_id = '11100000-0000-4000-8000-000000000402'
    ) THEN
        RAISE EXCEPTION 'vade silinince damgalı ödeme kayboldu ya da bozuldu';
    END IF;
END;
$$;

-- Canlı satır için tavan hâlâ kapalı (vade tavanı plandan önce soruluyor).
SELECT pg_temp.assert_raises(
    'installment_payment_exceeds_balance',
    $sql$
        INSERT INTO public.payments
            (organization_id, customer_id, treatment_plan_id, installment_id, type, amount, method)
        VALUES (
            current_setting('kasa111.o1')::UUID,
            '11100000-0000-4000-8000-000000000101',
            '11100000-0000-4000-8000-000000000401',
            '11100000-0000-4000-8000-000000000501',
            'service', 1, 'cash'
        )
    $sql$,
    '23514'
);

SELECT 'kasa düzeltme regression: ok' AS result;

ROLLBACK;
