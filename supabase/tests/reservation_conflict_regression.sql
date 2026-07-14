\set ON_ERROR_STOP on

-- Transactional regression test for 060_reservation_conflict_guard.sql.
-- Run against a disposable/local database after all migrations:
--   DATABASE_URL=postgresql://... npm run test:conflicts:db
-- Every fixture, including the auth user, is rolled back at the end.

BEGIN;

DO $$
BEGIN
    IF to_regprocedure('public.enforce_reservation_conflicts()') IS NULL THEN
        RAISE EXCEPTION '060 migration is missing: enforce_reservation_conflicts() was not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_reservations_conflict_guard'
          AND tgrelid = 'public.reservations'::regclass
          AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION '060 migration is missing: trg_reservations_conflict_guard was not found';
    END IF;
END;
$$;

-- Supabase's handle_new_user trigger creates the organization, membership and
-- settings row used by the fixture. This script must run as the database owner.
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    '60000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'conflict-regression@timeflow.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', ''
);

INSERT INTO public.staff (id, organization_id, name, color)
VALUES
    ('60000000-0000-4000-8000-000000000101', (SELECT id FROM organizations WHERE owner_id = '60000000-0000-4000-8000-000000000001'), 'Doctor A', '#111111'),
    ('60000000-0000-4000-8000-000000000102', (SELECT id FROM organizations WHERE owner_id = '60000000-0000-4000-8000-000000000001'), 'Doctor B', '#222222'),
    ('60000000-0000-4000-8000-000000000103', (SELECT id FROM organizations WHERE owner_id = '60000000-0000-4000-8000-000000000001'), 'Doctor C', '#333333');

INSERT INTO public.customers (id, user_id, organization_id, name, phone)
VALUES (
    '60000000-0000-4000-8000-000000000150',
    '60000000-0000-4000-8000-000000000001',
    (SELECT id FROM organizations WHERE owner_id = '60000000-0000-4000-8000-000000000001'),
    'Linked Patient', '05000000150'
);

INSERT INTO public.resources (id, organization_id, type, name, capacity)
VALUES (
    '60000000-0000-4000-8000-000000000201',
    (SELECT id FROM organizations WHERE owner_id = '60000000-0000-4000-8000-000000000001'),
    'Ünite', 'Capacity Two', 2
);

CREATE OR REPLACE FUNCTION pg_temp.assert_insert_conflict(
    p_expected_message TEXT,
    p_id UUID,
    p_staff_id UUID,
    p_resource_id UUID,
    p_date DATE,
    p_start TIME,
    p_end TIME,
    p_end_date DATE DEFAULT NULL,
    p_status TEXT DEFAULT 'confirmed'
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    got_message TEXT;
    got_detail TEXT;
BEGIN
    BEGIN
        INSERT INTO public.reservations (
            id, user_id, organization_id, customer_name, customer_phone,
            date, start_time, end_time, end_date, service, status, staff_id, resource_id
        )
        VALUES (
            p_id,
            '60000000-0000-4000-8000-000000000001',
            (SELECT id FROM organizations WHERE owner_id = '60000000-0000-4000-8000-000000000001'),
            'Conflict Fixture', '05000000000',
            p_date, p_start, p_end, p_end_date, 'Muayene', p_status, p_staff_id, p_resource_id
        );
    EXCEPTION
        WHEN SQLSTATE '23P01' THEN
            GET STACKED DIAGNOSTICS
                got_message = MESSAGE_TEXT,
                got_detail = PG_EXCEPTION_DETAIL;

            IF got_message IS DISTINCT FROM p_expected_message THEN
                RAISE EXCEPTION 'expected conflict message %, got %', p_expected_message, got_message;
            END IF;
            IF COALESCE(got_detail, '') = '' THEN
                RAISE EXCEPTION 'expected JSON conflict detail, got an empty DETAIL';
            END IF;
            PERFORM got_detail::jsonb;
            RETURN;
    END;

    RAISE EXCEPTION 'expected SQLSTATE 23P01 / %, but INSERT succeeded', p_expected_message;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_update_conflict(
    p_expected_message TEXT,
    p_id UUID,
    p_start TIME,
    p_end TIME
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    got_message TEXT;
    got_detail TEXT;
BEGIN
    BEGIN
        UPDATE public.reservations
        SET start_time = p_start, end_time = p_end
        WHERE id = p_id;
    EXCEPTION
        WHEN SQLSTATE '23P01' THEN
            GET STACKED DIAGNOSTICS
                got_message = MESSAGE_TEXT,
                got_detail = PG_EXCEPTION_DETAIL;

            IF got_message IS DISTINCT FROM p_expected_message THEN
                RAISE EXCEPTION 'expected conflict message %, got %', p_expected_message, got_message;
            END IF;
            IF COALESCE(got_detail, '') = '' THEN
                RAISE EXCEPTION 'expected JSON conflict detail, got an empty DETAIL';
            END IF;
            PERFORM got_detail::jsonb;
            RETURN;
    END;

    RAISE EXCEPTION 'expected SQLSTATE 23P01 / %, but UPDATE succeeded', p_expected_message;
END;
$$;

-- Same-doctor baseline. Updating its range must exclude the row itself.
INSERT INTO public.reservations (
    id, user_id, organization_id, customer_name, customer_phone,
    date, start_time, end_time, service, status, staff_id
)
VALUES (
    '60000000-0000-4000-8000-000000000301',
    '60000000-0000-4000-8000-000000000001',
    (SELECT id FROM organizations WHERE owner_id = '60000000-0000-4000-8000-000000000001'),
    'Baseline', '05000000001', '2026-07-14', '09:00', '10:00',
    'Muayene', 'confirmed', '60000000-0000-4000-8000-000000000101'
);

UPDATE public.reservations
SET start_time = '09:05', end_time = '09:55'
WHERE id = '60000000-0000-4000-8000-000000000301';

-- Legacy/manual overlaps can exist before migration 060. Linking one of those
-- rows to its patient changes identity, not occupancy, and must remain possible.
ALTER TABLE public.reservations DISABLE TRIGGER trg_reservations_conflict_guard;
INSERT INTO public.reservations (
    id, user_id, organization_id, customer_name, customer_phone,
    date, start_time, end_time, service, status, staff_id
)
VALUES (
    '60000000-0000-4000-8000-000000000350',
    '60000000-0000-4000-8000-000000000001',
    (SELECT id FROM organizations WHERE owner_id = '60000000-0000-4000-8000-000000000001'),
    'Legacy overlap', '05000000350', '2026-07-14', '09:15', '09:45',
    'Muayene', 'confirmed', '60000000-0000-4000-8000-000000000101'
);
ALTER TABLE public.reservations ENABLE TRIGGER trg_reservations_conflict_guard;

UPDATE public.reservations
SET customer_id = '60000000-0000-4000-8000-000000000150'
WHERE id = '60000000-0000-4000-8000-000000000350';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.reservations
        WHERE id = '60000000-0000-4000-8000-000000000350'
          AND customer_id = '60000000-0000-4000-8000-000000000150'
    ) THEN
        RAISE EXCEPTION 'customer-only UPDATE did not link the legacy reservation';
    END IF;
END;
$$;

-- [start,end): exact endpoint adjacency is valid.
INSERT INTO public.reservations (
    id, user_id, organization_id, customer_name, customer_phone,
    date, start_time, end_time, service, status, staff_id
)
VALUES (
    '60000000-0000-4000-8000-000000000302',
    '60000000-0000-4000-8000-000000000001',
    (SELECT id FROM organizations WHERE owner_id = '60000000-0000-4000-8000-000000000001'),
    'Adjacent', '05000000002', '2026-07-14', '09:55', '10:30',
    'Kontrol', 'confirmed', '60000000-0000-4000-8000-000000000101'
);

-- A different doctor can work in parallel when no physical resource is shared.
INSERT INTO public.reservations (
    id, user_id, organization_id, customer_name, customer_phone,
    date, start_time, end_time, service, status, staff_id
)
VALUES (
    '60000000-0000-4000-8000-000000000303',
    '60000000-0000-4000-8000-000000000001',
    (SELECT id FROM organizations WHERE owner_id = '60000000-0000-4000-8000-000000000001'),
    'Parallel', '05000000003', '2026-07-14', '09:30', '10:00',
    'Muayene', 'confirmed', '60000000-0000-4000-8000-000000000102'
);

SELECT pg_temp.assert_insert_conflict(
    'reservation_staff_conflict',
    '60000000-0000-4000-8000-000000000304',
    '60000000-0000-4000-8000-000000000101', NULL,
    '2026-07-14', '09:30', '10:00'
);

SELECT pg_temp.assert_update_conflict(
    'reservation_staff_conflict',
    '60000000-0000-4000-8000-000000000302',
    '09:30', '10:30'
);

-- NULL staff is a separate, shared unassigned lane.
INSERT INTO public.reservations (
    id, user_id, organization_id, customer_name, customer_phone,
    date, start_time, end_time, service, status, staff_id
)
VALUES
    ('60000000-0000-4000-8000-000000000310', '60000000-0000-4000-8000-000000000001', (SELECT id FROM organizations WHERE owner_id = '60000000-0000-4000-8000-000000000001'), 'Unassigned', '05000000010', '2026-07-14', '11:00', '12:00', 'Muayene', 'confirmed', NULL),
    ('60000000-0000-4000-8000-000000000311', '60000000-0000-4000-8000-000000000001', (SELECT id FROM organizations WHERE owner_id = '60000000-0000-4000-8000-000000000001'), 'Assigned overlap', '05000000011', '2026-07-14', '11:15', '11:45', 'Muayene', 'confirmed', '60000000-0000-4000-8000-000000000101');

SELECT pg_temp.assert_insert_conflict(
    'reservation_staff_conflict',
    '60000000-0000-4000-8000-000000000312',
    NULL, NULL, '2026-07-14', '11:30', '12:30'
);

-- Cancelled rows do not occupy capacity or a doctor's lane.
INSERT INTO public.reservations (
    id, user_id, organization_id, customer_name, customer_phone,
    date, start_time, end_time, service, status, staff_id
)
VALUES
    ('60000000-0000-4000-8000-000000000320', '60000000-0000-4000-8000-000000000001', (SELECT id FROM organizations WHERE owner_id = '60000000-0000-4000-8000-000000000001'), 'Cancelled', '05000000020', '2026-07-14', '13:00', '14:00', 'Muayene', 'cancelled', '60000000-0000-4000-8000-000000000101'),
    ('60000000-0000-4000-8000-000000000321', '60000000-0000-4000-8000-000000000001', (SELECT id FROM organizations WHERE owner_id = '60000000-0000-4000-8000-000000000001'), 'Replacement', '05000000021', '2026-07-14', '13:30', '14:00', 'Muayene', 'confirmed', '60000000-0000-4000-8000-000000000101');

-- Resource capacity is shared across doctors: two fit, the third is rejected.
INSERT INTO public.reservations (
    id, user_id, organization_id, customer_name, customer_phone,
    date, start_time, end_time, service, status, staff_id, resource_id
)
VALUES
    ('60000000-0000-4000-8000-000000000330', '60000000-0000-4000-8000-000000000001', (SELECT id FROM organizations WHERE owner_id = '60000000-0000-4000-8000-000000000001'), 'Chair A', '05000000030', '2026-07-14', '14:30', '15:30', 'Muayene', 'confirmed', '60000000-0000-4000-8000-000000000101', '60000000-0000-4000-8000-000000000201'),
    ('60000000-0000-4000-8000-000000000331', '60000000-0000-4000-8000-000000000001', (SELECT id FROM organizations WHERE owner_id = '60000000-0000-4000-8000-000000000001'), 'Chair B', '05000000031', '2026-07-14', '14:30', '15:30', 'Muayene', 'confirmed', '60000000-0000-4000-8000-000000000102', '60000000-0000-4000-8000-000000000201');

SELECT pg_temp.assert_insert_conflict(
    'reservation_resource_conflict',
    '60000000-0000-4000-8000-000000000332',
    '60000000-0000-4000-8000-000000000103',
    '60000000-0000-4000-8000-000000000201',
    '2026-07-14', '14:45', '15:00'
);

-- end_date makes the range span midnight; the next day's overlap is rejected,
-- while an appointment starting exactly at the end remains valid.
INSERT INTO public.reservations (
    id, user_id, organization_id, customer_name, customer_phone,
    date, start_time, end_time, end_date, service, status, staff_id
)
VALUES (
    '60000000-0000-4000-8000-000000000340',
    '60000000-0000-4000-8000-000000000001',
    (SELECT id FROM organizations WHERE owner_id = '60000000-0000-4000-8000-000000000001'),
    'Overnight', '05000000040', '2026-07-20', '23:00', '01:00', '2026-07-21',
    'Nöbet', 'confirmed', '60000000-0000-4000-8000-000000000101'
);

SELECT pg_temp.assert_insert_conflict(
    'reservation_staff_conflict',
    '60000000-0000-4000-8000-000000000341',
    '60000000-0000-4000-8000-000000000101', NULL,
    '2026-07-21', '00:30', '01:30'
);

INSERT INTO public.reservations (
    id, user_id, organization_id, customer_name, customer_phone,
    date, start_time, end_time, service, status, staff_id
)
VALUES (
    '60000000-0000-4000-8000-000000000342',
    '60000000-0000-4000-8000-000000000001',
    (SELECT id FROM organizations WHERE owner_id = '60000000-0000-4000-8000-000000000001'),
    'After overnight', '05000000042', '2026-07-21', '01:00', '01:30',
    'Kontrol', 'confirmed', '60000000-0000-4000-8000-000000000101'
);

SELECT 'reservation conflict regression: ok' AS result;

ROLLBACK;
