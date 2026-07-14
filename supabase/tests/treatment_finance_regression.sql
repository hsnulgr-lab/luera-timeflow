\set ON_ERROR_STOP on

-- Transactional regression test for 061_treatment_finance_integrity.sql.
-- Run against a disposable/local database after all migrations:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/treatment_finance_regression.sql
-- Every fixture is rolled back at the end.

BEGIN;

DO $$
DECLARE
    required_function TEXT;
BEGIN
    FOREACH required_function IN ARRAY ARRAY[
        'public.enforce_treatment_plan_integrity()',
        'public.enforce_treatment_installment_integrity()',
        'public.enforce_treatment_payment_integrity()'
    ] LOOP
        IF to_regprocedure(required_function) IS NULL THEN
            RAISE EXCEPTION '061 migration is missing function %', required_function;
        END IF;
    END LOOP;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger
        WHERE tgname = 'trg_061_treatment_plan_integrity'
          AND tgrelid = 'public.treatment_plans'::regclass
          AND NOT tgisinternal
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger
        WHERE tgname = 'trg_061_treatment_installment_write_integrity'
          AND tgrelid = 'public.treatment_installments'::regclass
          AND NOT tgisinternal
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger
        WHERE tgname = 'trg_061_treatment_payment_integrity'
          AND tgrelid = 'public.payments'::regclass
          AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION '061 migration triggers are incomplete';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger
        WHERE tgname = 'trg_validate_installment_payment'
          AND tgrelid = 'public.payments'::regclass
          AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION '059 payment trigger was not superseded; lock order is unsafe';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM pg_catalog.pg_proc
        WHERE oid IN (
            'public.enforce_treatment_plan_integrity()'::regprocedure,
            'public.enforce_treatment_installment_integrity()'::regprocedure,
            'public.enforce_treatment_payment_integrity()'::regprocedure
        )
          AND prosecdef
          AND proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']
    ) <> 3 THEN
        RAISE EXCEPTION '061 trigger functions must be SECURITY DEFINER with a fixed search_path';
    END IF;

    -- ADD COLUMN IF NOT EXISTS can skip inline REFERENCES. A valid or NOT
    -- VALID single-column FK is acceptable: NOT VALID still guards new rows.
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_row
        JOIN pg_catalog.pg_attribute AS attribute_row
          ON attribute_row.attrelid = constraint_row.conrelid
         AND attribute_row.attnum = constraint_row.conkey[1]
        WHERE constraint_row.contype = 'f'
          AND constraint_row.conrelid = 'public.treatment_plans'::regclass
          AND constraint_row.confrelid = 'public.reservations'::regclass
          AND cardinality(constraint_row.conkey) = 1
          AND attribute_row.attname = 'reservation_id'
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_row
        JOIN pg_catalog.pg_attribute AS attribute_row
          ON attribute_row.attrelid = constraint_row.conrelid
         AND attribute_row.attnum = constraint_row.conkey[1]
        WHERE constraint_row.contype = 'f'
          AND constraint_row.conrelid = 'public.payments'::regclass
          AND constraint_row.confrelid = 'public.treatment_installments'::regclass
          AND cardinality(constraint_row.conkey) = 1
          AND attribute_row.attname = 'installment_id'
    ) THEN
        RAISE EXCEPTION '061 FK repair is incomplete';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(
    expected_message TEXT,
    statement_sql TEXT,
    expected_state TEXT DEFAULT '23514'
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

CREATE OR REPLACE FUNCTION pg_temp.assert_numeric(
    actual NUMERIC,
    expected NUMERIC,
    assertion_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    IF actual IS DISTINCT FROM expected THEN
        RAISE EXCEPTION '%: expected %, got %', assertion_name, expected, actual;
    END IF;
END;
$$;

-- handle_new_user creates one organization and membership per auth fixture.
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
)
VALUES
    (
        '00000000-0000-0000-0000-000000000000',
        '61000000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated', 'finance-one@timeflow.test', '', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
        '', '', '', ''
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        '61000000-0000-4000-8000-000000000002',
        'authenticated', 'authenticated', 'finance-two@timeflow.test', '', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
        '', '', '', ''
    );

INSERT INTO public.customers (id, user_id, organization_id, name, phone)
VALUES
    (
        '61000000-0000-4000-8000-000000000101',
        '61000000-0000-4000-8000-000000000001',
        (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
        'Patient One', '05000000001'
    ),
    (
        '61000000-0000-4000-8000-000000000102',
        '61000000-0000-4000-8000-000000000001',
        (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
        'Patient Three', '05000000003'
    ),
    (
        '61000000-0000-4000-8000-000000000103',
        '61000000-0000-4000-8000-000000000002',
        (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000002'),
        'Patient Two', '05000000002'
    );

INSERT INTO public.staff (id, organization_id, name, color, role)
VALUES
    (
        '61000000-0000-4000-8000-000000000201',
        (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
        'Doctor One', '#111111', 'doctor'
    ),
    (
        '61000000-0000-4000-8000-000000000202',
        (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
        'Doctor Three', '#222222', 'doctor'
    ),
    (
        '61000000-0000-4000-8000-000000000203',
        (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
        'Cashier One', '#333333', 'cashier'
    ),
    (
        '61000000-0000-4000-8000-000000000204',
        (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000002'),
        'Doctor Two', '#444444', 'doctor'
    );

INSERT INTO public.reservations (
    id, user_id, organization_id, customer_id, customer_name, customer_phone,
    date, start_time, end_time, service, status, staff_id
)
VALUES
    (
        '61000000-0000-4000-8000-000000000301',
        '61000000-0000-4000-8000-000000000001',
        (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
        '61000000-0000-4000-8000-000000000101', 'Patient One', '05000000001',
        '2026-08-01', '09:00', '09:30', 'Muayene', 'completed',
        '61000000-0000-4000-8000-000000000201'
    ),
    (
        '61000000-0000-4000-8000-000000000302',
        '61000000-0000-4000-8000-000000000001',
        (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
        '61000000-0000-4000-8000-000000000101', 'Patient One', '05000000001',
        '2026-08-01', '10:00', '10:30', 'Kontrol', 'completed',
        '61000000-0000-4000-8000-000000000202'
    ),
    (
        '61000000-0000-4000-8000-000000000303',
        '61000000-0000-4000-8000-000000000002',
        (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000002'),
        '61000000-0000-4000-8000-000000000103', 'Patient Two', '05000000002',
        '2026-08-01', '09:00', '09:30', 'Muayene', 'completed',
        '61000000-0000-4000-8000-000000000204'
    ),
    (
        '61000000-0000-4000-8000-000000000304',
        '61000000-0000-4000-8000-000000000001',
        (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
        '61000000-0000-4000-8000-000000000101', 'Patient One', '05000000001',
        '2026-08-01', '11:00', '11:30', 'Tahsilat', 'completed',
        '61000000-0000-4000-8000-000000000203'
    );

-- Plan tenant/customer/staff/reservation bindings and doctor-only attribution.
SELECT pg_temp.assert_raises(
    'treatment_plan_customer_scope_mismatch',
    $sql$
        INSERT INTO public.treatment_plans
            (id, organization_id, customer_id, title, total_amount)
        VALUES (
            '61000000-0000-4000-8000-000000000410',
            (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
            '61000000-0000-4000-8000-000000000103', 'Wrong tenant customer', 100
        )
    $sql$
);

SELECT pg_temp.assert_raises(
    'treatment_plan_staff_scope_or_role_mismatch',
    $sql$
        INSERT INTO public.treatment_plans
            (id, organization_id, customer_id, title, total_amount, staff_id)
        VALUES (
            '61000000-0000-4000-8000-000000000411',
            (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
            '61000000-0000-4000-8000-000000000101', 'Cashier cannot own plan', 100,
            '61000000-0000-4000-8000-000000000203'
        )
    $sql$
);

SELECT pg_temp.assert_raises(
    'treatment_plan_reservation_scope_mismatch',
    $sql$
        INSERT INTO public.treatment_plans
            (id, organization_id, customer_id, title, total_amount, reservation_id)
        VALUES (
            '61000000-0000-4000-8000-000000000412',
            (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
            '61000000-0000-4000-8000-000000000101', 'Wrong tenant reservation', 100,
            '61000000-0000-4000-8000-000000000303'
        )
    $sql$
);

SELECT pg_temp.assert_raises(
    'treatment_plan_staff_reservation_mismatch',
    $sql$
        INSERT INTO public.treatment_plans
            (id, organization_id, customer_id, title, total_amount, staff_id, reservation_id)
        VALUES (
            '61000000-0000-4000-8000-000000000413',
            (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
            '61000000-0000-4000-8000-000000000101', 'Wrong reservation doctor', 100,
            '61000000-0000-4000-8000-000000000201',
            '61000000-0000-4000-8000-000000000302'
        )
    $sql$
);

SELECT pg_temp.assert_raises(
    'treatment_plan_reservation_staff_role_mismatch',
    $sql$
        INSERT INTO public.treatment_plans
            (id, organization_id, customer_id, title, total_amount, reservation_id)
        VALUES (
            '61000000-0000-4000-8000-000000000414',
            (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
            '61000000-0000-4000-8000-000000000101', 'Cashier reservation cannot source plan', 100,
            '61000000-0000-4000-8000-000000000304'
        )
    $sql$
);

INSERT INTO public.treatment_plans (
    id, organization_id, customer_id, title, total_amount, staff_id, reservation_id
)
VALUES (
    '61000000-0000-4000-8000-000000000401',
    (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
    '61000000-0000-4000-8000-000000000101', 'Implant plan', 300,
    '61000000-0000-4000-8000-000000000201',
    '61000000-0000-4000-8000-000000000301'
);

-- Payments.staff_id may be a cashier; general payment references still cannot
-- cross tenant/customer/reservation boundaries.
INSERT INTO public.payments (
    id, organization_id, customer_id, staff_id, type, amount, method, description
)
VALUES (
    '61000000-0000-4000-8000-000000000620',
    (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
    '61000000-0000-4000-8000-000000000101',
    '61000000-0000-4000-8000-000000000203', 'other', 10, 'cash', 'Valid cashier payment'
);

SELECT pg_temp.assert_raises(
    'payment_scope_mismatch',
    $sql$
        UPDATE public.payments
        SET customer_id = '61000000-0000-4000-8000-000000000103'
        WHERE id = '61000000-0000-4000-8000-000000000620'
    $sql$
);

SELECT pg_temp.assert_raises(
    'payment_scope_mismatch',
    $sql$
        INSERT INTO public.payments
            (id, organization_id, reservation_id, type, amount, method)
        VALUES (
            '61000000-0000-4000-8000-000000000621',
            (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
            '61000000-0000-4000-8000-000000000303', 'service', 10, 'cash'
        )
    $sql$
);

-- A legacy/initial unscheduled payment is allowed before a schedule exists.
INSERT INTO public.payments (
    id, organization_id, customer_id, reservation_id, staff_id,
    treatment_plan_id, type, amount, method, description
)
VALUES (
    '61000000-0000-4000-8000-000000000601',
    (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
    '61000000-0000-4000-8000-000000000101',
    '61000000-0000-4000-8000-000000000301',
    '61000000-0000-4000-8000-000000000203',
    '61000000-0000-4000-8000-000000000401',
    'service', 60, 'card', 'Deposit'
);

SELECT pg_temp.assert_raises(
    'treatment_schedule_exceeds_plan_balance',
    $sql$
        INSERT INTO public.treatment_installments
            (id, organization_id, customer_id, treatment_plan_id, sequence_no, due_date, amount)
        VALUES (
            '61000000-0000-4000-8000-000000000510',
            (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
            '61000000-0000-4000-8000-000000000101',
            '61000000-0000-4000-8000-000000000401', 1, '2026-08-10', 241
        )
    $sql$
);

INSERT INTO public.treatment_installments (
    id, organization_id, customer_id, treatment_plan_id, sequence_no, due_date, amount
)
VALUES
    (
        '61000000-0000-4000-8000-000000000501',
        (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
        '61000000-0000-4000-8000-000000000101',
        '61000000-0000-4000-8000-000000000401', 1, '2026-08-10', 80
    ),
    (
        '61000000-0000-4000-8000-000000000502',
        (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
        '61000000-0000-4000-8000-000000000101',
        '61000000-0000-4000-8000-000000000401', 2, '2026-09-10', 80
    ),
    (
        '61000000-0000-4000-8000-000000000503',
        (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
        '61000000-0000-4000-8000-000000000101',
        '61000000-0000-4000-8000-000000000401', 3, '2026-10-10', 80
    );

SELECT pg_temp.assert_raises(
    'installment_plan_scope_mismatch',
    $sql$
        UPDATE public.treatment_installments
        SET customer_id = '61000000-0000-4000-8000-000000000102'
        WHERE id = '61000000-0000-4000-8000-000000000503'
    $sql$
);

SELECT pg_temp.assert_raises(
    'plan_payment_requires_installment',
    $sql$
        INSERT INTO public.payments
            (id, organization_id, customer_id, treatment_plan_id, type, amount, method)
        VALUES (
            '61000000-0000-4000-8000-000000000602',
            (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
            '61000000-0000-4000-8000-000000000101',
            '61000000-0000-4000-8000-000000000401', 'service', 10, 'cash'
        )
    $sql$
);

SELECT pg_temp.assert_raises(
    'plan_payment_amount_must_be_positive',
    $sql$
        INSERT INTO public.payments
            (id, organization_id, customer_id, treatment_plan_id, installment_id, type, amount, method)
        VALUES (
            '61000000-0000-4000-8000-000000000603',
            (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
            '61000000-0000-4000-8000-000000000101',
            '61000000-0000-4000-8000-000000000401',
            '61000000-0000-4000-8000-000000000501', 'service', 0, 'cash'
        )
    $sql$
);

INSERT INTO public.payments (
    id, organization_id, customer_id, treatment_plan_id, installment_id,
    type, amount, method, description
)
VALUES (
    '61000000-0000-4000-8000-000000000604',
    (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
    '61000000-0000-4000-8000-000000000101',
    '61000000-0000-4000-8000-000000000401',
    '61000000-0000-4000-8000-000000000501',
    'service', 30, 'cash', 'First installment partial payment'
);

SELECT pg_temp.assert_raises(
    'installment_payment_exceeds_balance',
    $sql$
        INSERT INTO public.payments
            (id, organization_id, customer_id, treatment_plan_id, installment_id, type, amount, method)
        VALUES (
            '61000000-0000-4000-8000-000000000605',
            (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
            '61000000-0000-4000-8000-000000000101',
            '61000000-0000-4000-8000-000000000401',
            '61000000-0000-4000-8000-000000000501', 'service', 51, 'cash'
        )
    $sql$
);

SELECT pg_temp.assert_raises(
    'installment_amount_below_paid',
    $sql$
        UPDATE public.treatment_installments
        SET amount = 29
        WHERE id = '61000000-0000-4000-8000-000000000501'
    $sql$
);

-- UPDATE self exclusion: replacing 80 with 79 must not count the old 80 too.
UPDATE public.treatment_installments
SET amount = 79
WHERE id = '61000000-0000-4000-8000-000000000501';

SELECT pg_temp.assert_numeric(
    (SELECT amount FROM public.treatment_installments WHERE id = '61000000-0000-4000-8000-000000000501'),
    79,
    'installment UPDATE must exclude itself from schedule sum'
);

UPDATE public.treatment_installments
SET amount = 80
WHERE id = '61000000-0000-4000-8000-000000000501';

SELECT pg_temp.assert_raises(
    'installment_with_payments_cannot_be_deleted',
    $sql$
        DELETE FROM public.treatment_installments
        WHERE id = '61000000-0000-4000-8000-000000000501'
    $sql$
);

SELECT pg_temp.assert_raises(
    'treatment_plan_total_below_paid',
    $sql$
        UPDATE public.treatment_plans
        SET total_amount = 89
        WHERE id = '61000000-0000-4000-8000-000000000401'
    $sql$
);

SELECT pg_temp.assert_raises(
    'treatment_plan_total_below_schedule',
    $sql$
        UPDATE public.treatment_plans
        SET total_amount = 299
        WHERE id = '61000000-0000-4000-8000-000000000401'
    $sql$
);

SELECT pg_temp.assert_raises(
    'treatment_plan_scope_change_with_linked_rows',
    $sql$
        UPDATE public.treatment_plans
        SET customer_id = '61000000-0000-4000-8000-000000000102', reservation_id = NULL
        WHERE id = '61000000-0000-4000-8000-000000000401'
    $sql$
);

-- Independent no-schedule plan tests the plan-total guard and payment UPDATE
-- self exclusion without the per-installment ceiling masking it.
INSERT INTO public.treatment_plans (
    id, organization_id, customer_id, title, total_amount, staff_id
)
VALUES (
    '61000000-0000-4000-8000-000000000402',
    (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
    '61000000-0000-4000-8000-000000000102', 'Simple plan', 100,
    '61000000-0000-4000-8000-000000000202'
);

INSERT INTO public.payments (
    id, organization_id, customer_id, treatment_plan_id, type, amount, method
)
VALUES (
    '61000000-0000-4000-8000-000000000610',
    (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
    '61000000-0000-4000-8000-000000000102',
    '61000000-0000-4000-8000-000000000402', 'service', 90, 'cash'
);

SELECT pg_temp.assert_raises(
    'plan_payment_exceeds_balance',
    $sql$
        INSERT INTO public.payments
            (id, organization_id, customer_id, treatment_plan_id, type, amount, method)
        VALUES (
            '61000000-0000-4000-8000-000000000611',
            (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
            '61000000-0000-4000-8000-000000000102',
            '61000000-0000-4000-8000-000000000402', 'service', 11, 'cash'
        )
    $sql$
);

UPDATE public.payments
SET amount = 100
WHERE id = '61000000-0000-4000-8000-000000000610';

SELECT pg_temp.assert_numeric(
    (SELECT amount FROM public.payments WHERE id = '61000000-0000-4000-8000-000000000610'),
    100,
    'payment UPDATE must exclude itself from plan sum'
);

SELECT pg_temp.assert_raises(
    'plan_payment_exceeds_balance',
    $sql$
        UPDATE public.payments
        SET amount = 101
        WHERE id = '61000000-0000-4000-8000-000000000610'
    $sql$
);

-- Deleting a complete plan must preserve historical payment rows while both
-- SET NULL FK cascades clear their treatment references without a false guard.
INSERT INTO public.treatment_plans (
    id, organization_id, customer_id, title, total_amount, staff_id
)
VALUES (
    '61000000-0000-4000-8000-000000000403',
    (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
    '61000000-0000-4000-8000-000000000102', 'Cascade plan', 50,
    '61000000-0000-4000-8000-000000000202'
);

INSERT INTO public.treatment_installments (
    id, organization_id, customer_id, treatment_plan_id, sequence_no, due_date, amount
)
VALUES (
    '61000000-0000-4000-8000-000000000520',
    (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
    '61000000-0000-4000-8000-000000000102',
    '61000000-0000-4000-8000-000000000403', 1, '2026-08-20', 50
);

INSERT INTO public.payments (
    id, organization_id, customer_id, treatment_plan_id, installment_id,
    type, amount, method
)
VALUES (
    '61000000-0000-4000-8000-000000000612',
    (SELECT id FROM public.organizations WHERE owner_id = '61000000-0000-4000-8000-000000000001'),
    '61000000-0000-4000-8000-000000000102',
    '61000000-0000-4000-8000-000000000403',
    '61000000-0000-4000-8000-000000000520',
    'service', 10, 'cash'
);

DELETE FROM public.treatment_plans
WHERE id = '61000000-0000-4000-8000-000000000403';

DO $$
DECLARE
    remaining_plan UUID;
    remaining_installment UUID;
BEGIN
    SELECT treatment_plan_id, installment_id
      INTO remaining_plan, remaining_installment
      FROM public.payments
     WHERE id = '61000000-0000-4000-8000-000000000612';

    IF remaining_plan IS NOT NULL OR remaining_installment IS NOT NULL THEN
        RAISE EXCEPTION 'plan DELETE did not clear payment treatment references';
    END IF;
END;
$$;

SELECT 'treatment finance regression: ok' AS result;

ROLLBACK;
