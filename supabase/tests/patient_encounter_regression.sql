\set ON_ERROR_STOP on

-- Transactional regression test for 062_patient_encounters.sql.
-- Run after migrations 001-062 against a disposable database:
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
--     -f supabase/tests/patient_encounter_regression.sql

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.patient_encounters') IS NULL
       OR to_regclass('public.patient_encounter_events') IS NULL
       OR to_regclass('public.clinical_procedures') IS NULL
       OR to_regclass('public.clinical_procedure_events') IS NULL THEN
        RAISE EXCEPTION '062 migration tables are incomplete';
    END IF;

    IF to_regprocedure('public.ensure_patient_encounter(uuid,uuid,text)') IS NULL
       OR to_regprocedure('public.prepare_patient_encounter()') IS NULL
       OR to_regprocedure('public.prepare_clinical_procedure()') IS NULL
       OR to_regprocedure('public.project_dental_record_to_clinical_procedure()') IS NULL
       OR to_regprocedure('public.normalize_clinical_tooth_number(smallint)') IS NULL
       OR to_regprocedure('public.normalize_clinical_tooth_surfaces(text[])') IS NULL THEN
        RAISE EXCEPTION '062 migration functions are incomplete';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.patient_encounters'::regclass
          AND conname = 'patient_encounters_org_reservation_unique'
          AND contype = 'u'
    ) THEN
        RAISE EXCEPTION 'encounter tenant/reservation uniqueness is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger
        WHERE tgrelid = 'public.patient_encounter_events'::regclass
          AND tgname = 'trg_062_patient_encounter_events_append_only'
          AND NOT tgisinternal
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger
        WHERE tgrelid = 'public.clinical_procedure_events'::regclass
          AND tgname = 'trg_062_clinical_procedure_events_append_only'
          AND NOT tgisinternal
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger
        WHERE tgrelid = 'public.dental_records'::regclass
          AND tgname = 'trg_062_project_dental_record'
          AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'append-only audit triggers are incomplete';
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

-- handle_new_user creates organization, membership and settings fixtures.
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
)
VALUES
    (
        '00000000-0000-0000-0000-000000000000',
        '62000000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated', 'encounter-one@timeflow.test', '', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        now(), now(), '', '', '', ''
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        '62000000-0000-4000-8000-000000000002',
        'authenticated', 'authenticated', 'encounter-two@timeflow.test', '', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        now(), now(), '', '', '', ''
    );

INSERT INTO public.customers (id, user_id, organization_id, name, phone)
VALUES
    (
        '62000000-0000-4000-8000-000000000101',
        '62000000-0000-4000-8000-000000000001',
        (SELECT id FROM public.organizations WHERE owner_id = '62000000-0000-4000-8000-000000000001'),
        'Encounter Patient', '05000000621'
    ),
    (
        '62000000-0000-4000-8000-000000000103',
        '62000000-0000-4000-8000-000000000001',
        (SELECT id FROM public.organizations WHERE owner_id = '62000000-0000-4000-8000-000000000001'),
        'Same Tenant Patient', '05000000623'
    ),
    (
        '62000000-0000-4000-8000-000000000102',
        '62000000-0000-4000-8000-000000000002',
        (SELECT id FROM public.organizations WHERE owner_id = '62000000-0000-4000-8000-000000000002'),
        'Other Tenant Patient', '05000000622'
    );

INSERT INTO public.staff (id, organization_id, name, color, role)
VALUES
    (
        '62000000-0000-4000-8000-000000000201',
        (SELECT id FROM public.organizations WHERE owner_id = '62000000-0000-4000-8000-000000000001'),
        'Doctor One', '#111111', 'doctor'
    ),
    (
        '62000000-0000-4000-8000-000000000202',
        (SELECT id FROM public.organizations WHERE owner_id = '62000000-0000-4000-8000-000000000001'),
        'Doctor Two', '#222222', 'doctor'
    ),
    (
        '62000000-0000-4000-8000-000000000203',
        (SELECT id FROM public.organizations WHERE owner_id = '62000000-0000-4000-8000-000000000002'),
        'Other Doctor', '#333333', 'doctor'
    );

INSERT INTO public.reservations (
    id, user_id, organization_id, customer_id, customer_name, customer_phone,
    date, start_time, end_time, service, status, staff_id
)
VALUES
    (
        '62000000-0000-4000-8000-000000000301',
        '62000000-0000-4000-8000-000000000001',
        (SELECT id FROM public.organizations WHERE owner_id = '62000000-0000-4000-8000-000000000001'),
        '62000000-0000-4000-8000-000000000101',
        'Encounter Patient', '05000000621', '2026-09-01', '09:00', '09:30',
        'Muayene', 'confirmed', '62000000-0000-4000-8000-000000000201'
    ),
    (
        '62000000-0000-4000-8000-000000000302',
        '62000000-0000-4000-8000-000000000002',
        (SELECT id FROM public.organizations WHERE owner_id = '62000000-0000-4000-8000-000000000002'),
        '62000000-0000-4000-8000-000000000102',
        'Other Tenant Patient', '05000000622', '2026-09-01', '09:00', '09:30',
        'Muayene', 'confirmed', '62000000-0000-4000-8000-000000000203'
    );

-- RPC is idempotent and derives patient/doctor from the reservation.
SELECT public.ensure_patient_encounter(
    (SELECT id FROM public.organizations WHERE owner_id = '62000000-0000-4000-8000-000000000001'),
    '62000000-0000-4000-8000-000000000301',
    'examination'
);
SELECT public.ensure_patient_encounter(
    (SELECT id FROM public.organizations WHERE owner_id = '62000000-0000-4000-8000-000000000001'),
    '62000000-0000-4000-8000-000000000301',
    'control'
);

DO $$
DECLARE
    encounter_count INTEGER;
    encounter_staff UUID;
    encounter_customer UUID;
BEGIN
    SELECT COUNT(*)
      INTO encounter_count
      FROM public.patient_encounters
     WHERE reservation_id = '62000000-0000-4000-8000-000000000301';
    SELECT attending_staff_id, customer_id
      INTO encounter_staff, encounter_customer
      FROM public.patient_encounters
     WHERE reservation_id = '62000000-0000-4000-8000-000000000301';
    IF encounter_count <> 1
       OR encounter_staff <> '62000000-0000-4000-8000-000000000201'
       OR encounter_customer <> '62000000-0000-4000-8000-000000000101' THEN
        RAISE EXCEPTION 'ensure RPC did not preserve canonical reservation scope';
    END IF;
END;
$$;

SELECT pg_temp.assert_raises(
    'encounter_reservation_scope_mismatch',
    $sql$
        INSERT INTO public.patient_encounters (
            organization_id, customer_id, reservation_id, attending_staff_id
        ) VALUES (
            (SELECT id FROM public.organizations WHERE owner_id = '62000000-0000-4000-8000-000000000001'),
            '62000000-0000-4000-8000-000000000102',
            '62000000-0000-4000-8000-000000000301',
            '62000000-0000-4000-8000-000000000201'
        )
    $sql$
);

-- Encounter bağlantısı değişmese bile planın tenant/hasta/randevu kimliği başka
-- bağlama taşınamaz. 061'in reservation kontrolünü bilinçli olarak NULL'layıp
-- 062 encounter guard'ını doğrudan sınarız.
INSERT INTO public.treatment_plans (
    id, organization_id, customer_id, title, total_amount,
    staff_id, reservation_id, encounter_id
)
SELECT
    '62000000-0000-4000-8000-000000000401',
    encounter.organization_id,
    encounter.customer_id,
    'Encounter scoped plan',
    1000,
    encounter.attending_staff_id,
    encounter.reservation_id,
    encounter.id
FROM public.patient_encounters AS encounter
WHERE encounter.reservation_id = '62000000-0000-4000-8000-000000000301';

SELECT pg_temp.assert_raises(
    'treatment_plan_encounter_scope_mismatch',
    $sql$
        UPDATE public.treatment_plans
        SET customer_id = '62000000-0000-4000-8000-000000000103',
            reservation_id = NULL
        WHERE id = '62000000-0000-4000-8000-000000000401'
    $sql$
);

-- Klinik başlamadan yapılan takvim hekim değişikliği serbesttir; bir sonraki
-- encounter yazımı canonical reservation hekimini güvenli kilit sırasında alır.
UPDATE public.reservations
SET staff_id = '62000000-0000-4000-8000-000000000202'
WHERE id = '62000000-0000-4000-8000-000000000301';

UPDATE public.patient_encounters
SET reason_for_visit = reason_for_visit
WHERE reservation_id = '62000000-0000-4000-8000-000000000301';

DO $$
BEGIN
    IF (SELECT attending_staff_id
        FROM public.patient_encounters
        WHERE reservation_id = '62000000-0000-4000-8000-000000000301')
       IS DISTINCT FROM '62000000-0000-4000-8000-000000000202'::UUID THEN
        RAISE EXCEPTION 'pre-start doctor reassignment was not synchronized';
    END IF;
END;
$$;

-- Muayene update'i append-only bir audit olayı üretir.
UPDATE public.patient_encounters
SET status = 'in_progress',
    chief_complaint = 'Ağrı',
    diagnosis = '16 numaralı dişte çürük',
    clinical_notes = 'Radyografi önerildi'
WHERE reservation_id = '62000000-0000-4000-8000-000000000301';

-- Klinik başladıktan sonra normal takvim güncellemesi hekim atfını değiştiremez.
SELECT pg_temp.assert_raises(
    'encounter_reservation_staff_locked',
    $sql$
        UPDATE public.reservations
        SET staff_id = '62000000-0000-4000-8000-000000000201'
        WHERE id = '62000000-0000-4000-8000-000000000301'
    $sql$
);

-- DentalChart'ın append-only satırı aynı transaction içinde clinical procedure'a
-- idempotent olarak yansır.
INSERT INTO public.dental_records (
    id, organization_id, customer_id, encounter_id, reservation_id,
    tooth_number, status, surfaces, record_type, note, staff_id
)
SELECT
    '62000000-0000-4000-8000-000000000501',
    encounter.organization_id,
    encounter.customer_id,
    encounter.id,
    encounter.reservation_id,
    16, 'curuk', ARRAY['O','D'], 'existing', 'Derin dentin çürüğü',
    encounter.attending_staff_id
FROM public.patient_encounters AS encounter
WHERE encounter.reservation_id = '62000000-0000-4000-8000-000000000301';

-- Legacy dental şemasının kabul ettiği fakat FDI/MODBL için geçersiz değerler
-- projeksiyonu düşürmez; temizlenir ve metadata'da orijinali korunur.
INSERT INTO public.dental_records (
    id, organization_id, customer_id, encounter_id, reservation_id,
    tooth_number, status, surfaces, record_type, note, staff_id
)
SELECT
    '62000000-0000-4000-8000-000000000502',
    encounter.organization_id,
    encounter.customer_id,
    encounter.id,
    encounter.reservation_id,
    19, 'dolgu', ARRAY['X','M'], 'existing', 'Legacy yüzey',
    encounter.attending_staff_id
FROM public.patient_encounters AS encounter
WHERE encounter.reservation_id = '62000000-0000-4000-8000-000000000301';

DO $$
DECLARE
    projected_count INTEGER;
    normalized_tooth SMALLINT;
    normalized_surfaces TEXT[];
    source_tooth TEXT;
    source_surfaces JSONB;
BEGIN
    SELECT COUNT(*) INTO projected_count
    FROM public.clinical_procedures
    WHERE source_dental_record_id IN (
        '62000000-0000-4000-8000-000000000501',
        '62000000-0000-4000-8000-000000000502'
    );

    SELECT tooth_number, surfaces, metadata->>'source_tooth_number', metadata->'source_surfaces'
      INTO normalized_tooth, normalized_surfaces, source_tooth, source_surfaces
      FROM public.clinical_procedures
     WHERE source_dental_record_id = '62000000-0000-4000-8000-000000000502';

    IF projected_count <> 2
       OR normalized_tooth IS NOT NULL
       OR normalized_surfaces IS DISTINCT FROM ARRAY['M']::TEXT[]
       OR source_tooth IS DISTINCT FROM '19'
       OR source_surfaces IS DISTINCT FROM '["X", "M"]'::JSONB THEN
        RAISE EXCEPTION 'dental projection normalization failed: count %, tooth %, surfaces %, source %, source surfaces %',
            projected_count, normalized_tooth, normalized_surfaces, source_tooth, source_surfaces;
    END IF;
END;
$$;

UPDATE public.clinical_procedures
SET clinical_note = 'Derin dentin çürüğü'
WHERE procedure_code = 'dental:curuk'
  AND customer_id = '62000000-0000-4000-8000-000000000101';

DO $$
DECLARE
    encounter_events INTEGER;
    procedure_events INTEGER;
BEGIN
    SELECT COUNT(*) INTO encounter_events
    FROM public.patient_encounter_events
    WHERE encounter_id = (
        SELECT id FROM public.patient_encounters
        WHERE reservation_id = '62000000-0000-4000-8000-000000000301'
    );
    SELECT COUNT(*) INTO procedure_events
    FROM public.clinical_procedure_events
    WHERE procedure_id = (
        SELECT id FROM public.clinical_procedures
        WHERE procedure_code = 'dental:curuk'
          AND customer_id = '62000000-0000-4000-8000-000000000101'
    );
    IF encounter_events <> 3 OR procedure_events <> 2 THEN
        RAISE EXCEPTION 'audit history is incomplete: encounter %, procedure %',
            encounter_events, procedure_events;
    END IF;
END;
$$;

SELECT pg_temp.assert_raises(
    'clinical_event_is_append_only',
    $sql$
        UPDATE public.clinical_procedure_events
        SET event_data = '{}'::jsonb
        WHERE procedure_id = (
            SELECT id FROM public.clinical_procedures
            WHERE procedure_code = 'dental:curuk'
              AND customer_id = '62000000-0000-4000-8000-000000000101'
        )
    $sql$
);

SELECT pg_temp.assert_raises(
    'clinical_history_is_append_only',
    $sql$
        DELETE FROM public.clinical_procedures
        WHERE procedure_code = 'dental:curuk'
          AND customer_id = '62000000-0000-4000-8000-000000000101'
    $sql$
);

-- A procedure cannot cross tenant/customer boundaries even with guessed UUIDs.
SELECT pg_temp.assert_raises(
    'clinical_procedure_encounter_scope_mismatch',
    $sql$
        INSERT INTO public.clinical_procedures (
            organization_id, customer_id, encounter_id,
            category, status, title
        ) VALUES (
            (SELECT id FROM public.organizations WHERE owner_id = '62000000-0000-4000-8000-000000000002'),
            '62000000-0000-4000-8000-000000000102',
            (SELECT id FROM public.patient_encounters
             WHERE reservation_id = '62000000-0000-4000-8000-000000000301'),
            'finding', 'recorded', 'Wrong tenant finding'
        )
    $sql$
);

-- Parent staff silinmesi gerçek FK SET NULL akışıdır; başlamış ziyareti yeniden
-- atamaz ve reservation/encounter/dental/procedure zincirini kilitlemez.
DELETE FROM public.staff
WHERE id = '62000000-0000-4000-8000-000000000202';

DO $$
BEGIN
    IF (SELECT staff_id FROM public.reservations
        WHERE id = '62000000-0000-4000-8000-000000000301') IS NOT NULL
       OR (SELECT attending_staff_id FROM public.patient_encounters
           WHERE id = (SELECT encounter_id FROM public.dental_records
                       WHERE id = '62000000-0000-4000-8000-000000000501')) IS NOT NULL
       OR (SELECT staff_id FROM public.dental_records
           WHERE id = '62000000-0000-4000-8000-000000000501') IS NOT NULL
       OR (SELECT performed_by_staff_id FROM public.clinical_procedures
           WHERE source_dental_record_id = '62000000-0000-4000-8000-000000000501') IS NOT NULL THEN
        RAISE EXCEPTION 'staff delete did not preserve FK SET NULL semantics';
    END IF;
END;
$$;

-- Reservation silme sırasındaki FK trigger sırası değişse de encounter ve iki
-- klinik defter ana kaydı koruyup yalnız reservation bağını NULL'lar.
DELETE FROM public.reservations
WHERE id = '62000000-0000-4000-8000-000000000301';

DO $$
BEGIN
    IF (SELECT reservation_id FROM public.patient_encounters
        WHERE id = (SELECT encounter_id FROM public.dental_records
                    WHERE id = '62000000-0000-4000-8000-000000000501')) IS NOT NULL
       OR (SELECT reservation_id FROM public.dental_records
           WHERE id = '62000000-0000-4000-8000-000000000501') IS NOT NULL
       OR (SELECT reservation_id FROM public.clinical_procedures
           WHERE source_dental_record_id = '62000000-0000-4000-8000-000000000501') IS NOT NULL
       OR (SELECT reservation_id FROM public.treatment_plans
           WHERE id = '62000000-0000-4000-8000-000000000401') IS NOT NULL THEN
        RAISE EXCEPTION 'reservation delete did not preserve clinical history';
    END IF;
END;
$$;

ROLLBACK;
