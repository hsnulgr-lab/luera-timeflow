-- ============================================================
-- TimeFlow Migration 061: Tedavi finansı veri bütünlüğü
-- ============================================================
-- 057/059 tedavi planı atfını ve taksit satırlarını ekledi. Bu migration:
--   * plan / hasta / hekim / kaynak randevu tenant bağlarını doğrular,
--   * plan ve taksit tahsilatlarını plan satırı kilidiyle atomik sınırlar,
--   * mevcut tahsilat varken vade tutarının küçültülmesini engeller,
--   * taksitli planda vadesiz tahsilata izin vermez,
--   * ADD COLUMN IF NOT EXISTS nedeniyle atlanmış olabilecek FK'leri onarır.
--
-- Mevcut kirli satırlar migration'ı düşürmesin diye onarım FK'leri NOT VALID
-- eklenir. Yalnız orphan içermeyen FK'ler aşağıda otomatik VALIDATE edilir;
-- diğerleri yeni yazımları hemen korur ve eski satırlar temizlendikten sonra
-- ayrı bir bakım işleminde doğrulanabilir.
-- ============================================================

BEGIN;

-- Migration tekrar çalıştırılırsa önceki 061 trigger'ları backfill'i legacy
-- kirli satırlar yüzünden engellemesin. Transaction dışından guardsız bir an
-- görünmez; trigger'lar aşağıda aynı transaction içinde yeniden kurulur.
DROP TRIGGER IF EXISTS trg_061_treatment_plan_integrity ON public.treatment_plans;
DROP TRIGGER IF EXISTS trg_061_treatment_installment_write_integrity ON public.treatment_installments;
DROP TRIGGER IF EXISTS trg_061_treatment_installment_delete_integrity ON public.treatment_installments;
DROP TRIGGER IF EXISTS trg_061_treatment_payment_integrity ON public.payments;

-- 058 öncesinden kalan veya sonradan doğrudan SQL ile yazılmış plan sahibi
-- aynı tenant'ta bir doctor değilse bu atıf güvenilir değildir. Önce NULL'a
-- çek; aşağıdaki deterministik kaynak seçimi uygun bir hekim bulabiliyorsa
-- yeniden doldurur, bulamıyorsa plan sahipsiz ama tutarlı kalır.
UPDATE public.treatment_plans AS plan
SET staff_id = NULL
WHERE plan.staff_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.staff AS doctor
      WHERE doctor.id = plan.staff_id
        AND doctor.organization_id = plan.organization_id
        AND doctor.role = 'doctor'
  );

-- Kaynak randevu başka tenant/hastaya aitse veya planın mevcut hekimiyle
-- çelişiyorsa güvenilir kaynak değildir. NULL'la; aşağıdaki ödeme kaynağı
-- yalnız tam scope eşleşen bir randevuyu geri doldurabilir.
UPDATE public.treatment_plans AS plan
SET reservation_id = NULL
WHERE plan.reservation_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.reservations AS reservation
      WHERE reservation.id = plan.reservation_id
        AND reservation.organization_id = plan.organization_id
        AND reservation.customer_id = plan.customer_id
        AND (
            plan.staff_id IS NULL
            OR reservation.staff_id IS NULL
            OR reservation.staff_id = plan.staff_id
        )
        AND (
            reservation.staff_id IS NULL
            OR EXISTS (
                SELECT 1
                FROM public.staff AS reservation_doctor
                WHERE reservation_doctor.id = reservation.staff_id
                  AND reservation_doctor.organization_id = plan.organization_id
                  AND reservation_doctor.role = 'doctor'
            )
        )
  );

-- 057'de tek DISTINCT ON kaynağı hem staff_id hem reservation_id seçiyordu.
-- İlk kaynakta alanlardan biri NULL ise daha sonraki dolu kaynak gözden
-- kaçabiliyordu. Her alanı ayrı, tenant/hasta eşleşmesi doğrulanmış kaynaktan
-- tamamla. Dolu bir legacy atıf asla sessizce değiştirilmez.
WITH reservation_candidates AS (
    SELECT DISTINCT ON (payment.treatment_plan_id)
        payment.treatment_plan_id,
        payment.reservation_id
    FROM public.payments AS payment
    JOIN public.treatment_plans AS plan
      ON plan.id = payment.treatment_plan_id
     AND plan.organization_id = payment.organization_id
     AND plan.customer_id = payment.customer_id
    JOIN public.reservations AS reservation
      ON reservation.id = payment.reservation_id
     AND reservation.organization_id = plan.organization_id
     AND reservation.customer_id = plan.customer_id
    WHERE payment.reservation_id IS NOT NULL
      AND (
          plan.staff_id IS NULL
          OR reservation.staff_id IS NULL
          OR reservation.staff_id = plan.staff_id
      )
      AND (
          reservation.staff_id IS NULL
          OR EXISTS (
              SELECT 1
              FROM public.staff AS reservation_doctor
              WHERE reservation_doctor.id = reservation.staff_id
                AND reservation_doctor.organization_id = plan.organization_id
                AND reservation_doctor.role = 'doctor'
          )
      )
    ORDER BY payment.treatment_plan_id, payment.paid_at, payment.created_at, payment.id
)
UPDATE public.treatment_plans AS plan
SET reservation_id = source.reservation_id
FROM reservation_candidates AS source
WHERE plan.id = source.treatment_plan_id
  AND plan.reservation_id IS NULL;

WITH staff_candidates AS (
    SELECT candidate.treatment_plan_id, candidate.staff_id,
           candidate.source_priority, candidate.source_at, candidate.source_id
    FROM (
        SELECT plan.id AS treatment_plan_id,
               reservation.staff_id,
               0 AS source_priority,
               reservation.created_at AS source_at,
               reservation.id AS source_id
        FROM public.treatment_plans AS plan
        JOIN public.reservations AS reservation
          ON reservation.id = plan.reservation_id
         AND reservation.organization_id = plan.organization_id
         AND reservation.customer_id = plan.customer_id
        WHERE reservation.staff_id IS NOT NULL

        UNION ALL

        SELECT dental.treatment_plan_id,
               dental.staff_id,
               1 AS source_priority,
               dental.created_at AS source_at,
               dental.id AS source_id
        FROM public.dental_records AS dental
        JOIN public.treatment_plans AS plan
          ON plan.id = dental.treatment_plan_id
         AND plan.organization_id = dental.organization_id
         AND plan.customer_id = dental.customer_id
        WHERE dental.staff_id IS NOT NULL

        UNION ALL

        SELECT payment.treatment_plan_id,
               payment.staff_id,
               2 AS source_priority,
               COALESCE(payment.paid_at, payment.created_at) AS source_at,
               payment.id AS source_id
        FROM public.payments AS payment
        JOIN public.treatment_plans AS plan
          ON plan.id = payment.treatment_plan_id
         AND plan.organization_id = payment.organization_id
         AND plan.customer_id = payment.customer_id
        WHERE payment.staff_id IS NOT NULL
    ) AS candidate
    JOIN public.treatment_plans AS scoped_plan
      ON scoped_plan.id = candidate.treatment_plan_id
    LEFT JOIN public.reservations AS linked_reservation
      ON linked_reservation.id = scoped_plan.reservation_id
     AND linked_reservation.organization_id = scoped_plan.organization_id
     AND linked_reservation.customer_id = scoped_plan.customer_id
    JOIN public.staff AS doctor
      ON doctor.id = candidate.staff_id
     AND doctor.organization_id = scoped_plan.organization_id
     AND doctor.role = 'doctor'
    WHERE linked_reservation.staff_id IS NULL
       OR linked_reservation.staff_id = candidate.staff_id
),
first_staff AS (
    SELECT DISTINCT ON (treatment_plan_id)
        treatment_plan_id,
        staff_id
    FROM staff_candidates
    ORDER BY treatment_plan_id, source_priority, source_at, source_id
)
UPDATE public.treatment_plans AS plan
SET staff_id = source.staff_id
FROM first_staff AS source
WHERE plan.id = source.treatment_plan_id
  AND plan.staff_id IS NULL;

-- IF NOT EXISTS ile kolon önceden var olduğunda inline REFERENCES oluşturulmaz.
-- Tek kolonlu, doğru parent tabloyu hedefleyen FK yoksa güvenli bir NOT VALID
-- FK ekle. NOT VALID de yeni INSERT/UPDATE işlemlerini anında denetler.
DO $migration$
DECLARE
    source_attnum SMALLINT;
BEGIN
    SELECT attnum::SMALLINT INTO source_attnum
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.treatment_plans'::regclass
      AND attname = 'reservation_id'
      AND NOT attisdropped;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE contype = 'f'
          AND conrelid = 'public.treatment_plans'::regclass
          AND confrelid = 'public.reservations'::regclass
          AND cardinality(conkey) = 1
          AND conkey[1] = source_attnum
    ) THEN
        ALTER TABLE public.treatment_plans
            ADD CONSTRAINT fk_061_treatment_plans_reservation
            FOREIGN KEY (reservation_id) REFERENCES public.reservations(id)
            ON DELETE SET NULL NOT VALID;
    END IF;

    SELECT attnum::SMALLINT INTO source_attnum
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.treatment_plans'::regclass
      AND attname = 'created_by'
      AND NOT attisdropped;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE contype = 'f'
          AND conrelid = 'public.treatment_plans'::regclass
          AND confrelid = 'auth.users'::regclass
          AND cardinality(conkey) = 1
          AND conkey[1] = source_attnum
    ) THEN
        ALTER TABLE public.treatment_plans
            ADD CONSTRAINT fk_061_treatment_plans_created_by
            FOREIGN KEY (created_by) REFERENCES auth.users(id)
            ON DELETE SET NULL NOT VALID;
    END IF;

    SELECT attnum::SMALLINT INTO source_attnum
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.payments'::regclass
      AND attname = 'created_by'
      AND NOT attisdropped;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE contype = 'f'
          AND conrelid = 'public.payments'::regclass
          AND confrelid = 'auth.users'::regclass
          AND cardinality(conkey) = 1
          AND conkey[1] = source_attnum
    ) THEN
        ALTER TABLE public.payments
            ADD CONSTRAINT fk_061_payments_created_by
            FOREIGN KEY (created_by) REFERENCES auth.users(id)
            ON DELETE SET NULL NOT VALID;
    END IF;

    SELECT attnum::SMALLINT INTO source_attnum
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.payments'::regclass
      AND attname = 'installment_id'
      AND NOT attisdropped;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE contype = 'f'
          AND conrelid = 'public.payments'::regclass
          AND confrelid = 'public.treatment_installments'::regclass
          AND cardinality(conkey) = 1
          AND conkey[1] = source_attnum
    ) THEN
        ALTER TABLE public.payments
            ADD CONSTRAINT fk_061_payments_installment
            FOREIGN KEY (installment_id) REFERENCES public.treatment_installments(id)
            ON DELETE SET NULL NOT VALID;
    END IF;
END;
$migration$;

CREATE INDEX IF NOT EXISTS idx_payments_plan_installment
    ON public.payments(treatment_plan_id, installment_id)
    WHERE treatment_plan_id IS NOT NULL;

-- Plan satırı bütün finans hareketlerinin ortak serialization noktasıdır.
-- SECURITY DEFINER, doğrulamanın çağıranın RLS görünürlüğüne göre eksik satır
-- görmesini engeller. Bütün nesneler ayrıca schema-qualified kullanılır.
CREATE OR REPLACE FUNCTION public.enforce_treatment_plan_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    reservation_customer UUID;
    reservation_staff UUID;
    paid_total NUMERIC;
    scheduled_total NUMERIC;
    unscheduled_paid NUMERIC;
BEGIN
    -- staff/reservation ON DELETE SET NULL aksiyonu, parent satır silindikten
    -- sonra nested UPDATE üretir. Yalnız FK'nin tek alanlı NULL'lamasını geç;
    -- doğrudan UPDATE ve başka alanları da değiştiren nested işlemler normal
    -- doğrulamadan kaçamaz.
    IF TG_OP = 'UPDATE' THEN
        IF pg_catalog.pg_trigger_depth() > 1
           AND OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id
           AND OLD.customer_id IS NOT DISTINCT FROM NEW.customer_id
           AND OLD.total_amount IS NOT DISTINCT FROM NEW.total_amount
           AND (
               (
                   OLD.staff_id IS NOT NULL
                   AND NEW.staff_id IS NULL
                   AND OLD.reservation_id IS NOT DISTINCT FROM NEW.reservation_id
                   AND NOT EXISTS (
                       SELECT 1 FROM public.staff AS deleted_staff
                       WHERE deleted_staff.id = OLD.staff_id
                   )
               )
               OR (
                   OLD.reservation_id IS NOT NULL
                   AND NEW.reservation_id IS NULL
                   AND OLD.staff_id IS NOT DISTINCT FROM NEW.staff_id
                   AND NOT EXISTS (
                       SELECT 1 FROM public.reservations AS deleted_reservation
                       WHERE deleted_reservation.id = OLD.reservation_id
                   )
               )
           ) THEN
            RETURN NEW;
        END IF;
    END IF;

    PERFORM 1
    FROM public.customers AS customer
    WHERE customer.id = NEW.customer_id
      AND customer.organization_id = NEW.organization_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'treatment_plan_customer_scope_mismatch',
            DETAIL = pg_catalog.jsonb_build_object(
                'organization_id', NEW.organization_id,
                'customer_id', NEW.customer_id
            )::TEXT;
    END IF;

    IF NEW.staff_id IS NOT NULL THEN
        PERFORM 1
        FROM public.staff AS doctor
        WHERE doctor.id = NEW.staff_id
          AND doctor.organization_id = NEW.organization_id
          AND doctor.role = 'doctor'
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'treatment_plan_staff_scope_or_role_mismatch',
                DETAIL = pg_catalog.jsonb_build_object(
                    'organization_id', NEW.organization_id,
                    'staff_id', NEW.staff_id,
                    'required_role', 'doctor'
                )::TEXT;
        END IF;
    END IF;

    IF NEW.reservation_id IS NOT NULL THEN
        SELECT reservation.customer_id, reservation.staff_id
          INTO reservation_customer, reservation_staff
          FROM public.reservations AS reservation
         WHERE reservation.id = NEW.reservation_id
           AND reservation.organization_id = NEW.organization_id
         FOR SHARE;

        IF NOT FOUND OR reservation_customer IS DISTINCT FROM NEW.customer_id THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'treatment_plan_reservation_scope_mismatch',
                DETAIL = pg_catalog.jsonb_build_object(
                    'organization_id', NEW.organization_id,
                    'customer_id', NEW.customer_id,
                    'reservation_id', NEW.reservation_id
                )::TEXT;
        END IF;

        IF reservation_staff IS NOT NULL AND NOT EXISTS (
            SELECT 1
            FROM public.staff AS reservation_doctor
            WHERE reservation_doctor.id = reservation_staff
              AND reservation_doctor.organization_id = NEW.organization_id
              AND reservation_doctor.role = 'doctor'
        ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'treatment_plan_reservation_staff_role_mismatch',
                DETAIL = pg_catalog.jsonb_build_object(
                    'reservation_id', NEW.reservation_id,
                    'reservation_staff_id', reservation_staff,
                    'required_role', 'doctor'
                )::TEXT;
        END IF;

        IF NEW.staff_id IS NOT NULL
           AND reservation_staff IS NOT NULL
           AND reservation_staff IS DISTINCT FROM NEW.staff_id THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'treatment_plan_staff_reservation_mismatch',
                DETAIL = pg_catalog.jsonb_build_object(
                    'staff_id', NEW.staff_id,
                    'reservation_staff_id', reservation_staff,
                    'reservation_id', NEW.reservation_id
                )::TEXT;
        END IF;
    END IF;

    -- INSERT sırasında plana bağlı child satır bulunamaz. UPDATE satırı zaten
    -- executor tarafından kilitlidir; ödeme/taksit trigger'ları da aynı planı
    -- FOR UPDATE aldığı için toplamlar yarış koşuluna kapalıdır.
    IF TG_OP = 'UPDATE' THEN
        IF (
            OLD.organization_id IS DISTINCT FROM NEW.organization_id
            OR OLD.customer_id IS DISTINCT FROM NEW.customer_id
        ) AND (
            EXISTS (
                SELECT 1 FROM public.payments AS payment
                WHERE payment.treatment_plan_id = NEW.id
            )
            OR EXISTS (
                SELECT 1 FROM public.treatment_installments AS installment
                WHERE installment.treatment_plan_id = NEW.id
            )
            OR EXISTS (
                SELECT 1 FROM public.dental_records AS dental
                WHERE dental.treatment_plan_id = NEW.id
            )
        ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'treatment_plan_scope_change_with_linked_rows',
                DETAIL = pg_catalog.jsonb_build_object(
                    'plan_id', NEW.id,
                    'old_organization_id', OLD.organization_id,
                    'organization_id', NEW.organization_id,
                    'old_customer_id', OLD.customer_id,
                    'customer_id', NEW.customer_id
                )::TEXT;
        END IF;

        SELECT COALESCE(SUM(payment.amount), 0)
          INTO paid_total
          FROM public.payments AS payment
         WHERE payment.treatment_plan_id = NEW.id;

        IF paid_total > NEW.total_amount THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'treatment_plan_total_below_paid',
                DETAIL = pg_catalog.jsonb_build_object(
                    'plan_id', NEW.id,
                    'total_amount', NEW.total_amount,
                    'paid_total', paid_total
                )::TEXT;
        END IF;

        SELECT COALESCE(SUM(installment.amount), 0)
          INTO scheduled_total
          FROM public.treatment_installments AS installment
         WHERE installment.treatment_plan_id = NEW.id;

        SELECT COALESCE(SUM(payment.amount), 0)
          INTO unscheduled_paid
          FROM public.payments AS payment
         WHERE payment.treatment_plan_id = NEW.id
           AND payment.installment_id IS NULL;

        IF scheduled_total + unscheduled_paid > NEW.total_amount THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'treatment_plan_total_below_schedule',
                DETAIL = pg_catalog.jsonb_build_object(
                    'plan_id', NEW.id,
                    'total_amount', NEW.total_amount,
                    'scheduled_total', scheduled_total,
                    'unscheduled_paid', unscheduled_paid
                )::TEXT;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_treatment_installment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    plan_id UUID;
    plan_ids UUID[];
    locked_plan_id UUID;
    plan_org UUID;
    plan_customer UUID;
    plan_total NUMERIC(10,2);
    schedule_total NUMERIC;
    unscheduled_paid NUMERIC;
    installment_paid NUMERIC;
BEGIN
    -- Plan silinirken FK cascade'i child vadeleri siler. İç FK trigger'ının
    -- başlattığı bu DELETE'i serbest bırak; normal doğrudan DELETE aşağıda
    -- ödemeli vadenin silinmesini reddeder.
    IF TG_OP = 'DELETE' THEN
        IF pg_catalog.pg_trigger_depth() > 1
           AND NOT EXISTS (
               SELECT 1 FROM public.treatment_plans AS deleted_plan
               WHERE deleted_plan.id = OLD.treatment_plan_id
           ) THEN
            RETURN OLD;
        END IF;
        plan_ids := ARRAY[OLD.treatment_plan_id]::UUID[];
    ELSIF TG_OP = 'UPDATE' THEN
        plan_ids := ARRAY[OLD.treatment_plan_id, NEW.treatment_plan_id]::UUID[];
    ELSE
        plan_ids := ARRAY[NEW.treatment_plan_id]::UUID[];
    END IF;

    -- UPDATE ile iki plan arasında taşıma yapılırken her iki planı UUID
    -- sırasıyla kilitle. Böylece ters yönlü eş zamanlı taşıma deadlock üretmez.
    FOR locked_plan_id IN
        SELECT DISTINCT candidate.plan_id
        FROM unnest(plan_ids) AS candidate(plan_id)
        WHERE candidate.plan_id IS NOT NULL
        ORDER BY candidate.plan_id
    LOOP
        PERFORM 1
        FROM public.treatment_plans AS locked_plan
        WHERE locked_plan.id = locked_plan_id
        FOR UPDATE;
    END LOOP;

    IF TG_OP = 'DELETE' THEN
        IF EXISTS (
            SELECT 1
            FROM public.payments AS payment
            WHERE payment.installment_id = OLD.id
        ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'installment_with_payments_cannot_be_deleted',
                DETAIL = pg_catalog.jsonb_build_object(
                    'installment_id', OLD.id,
                    'treatment_plan_id', OLD.treatment_plan_id
                )::TEXT;
        END IF;
        RETURN OLD;
    END IF;

    plan_id := NEW.treatment_plan_id;
    SELECT plan.organization_id, plan.customer_id, plan.total_amount
      INTO plan_org, plan_customer, plan_total
      FROM public.treatment_plans AS plan
     WHERE plan.id = plan_id;

    IF NOT FOUND
       OR plan_org IS DISTINCT FROM NEW.organization_id
       OR plan_customer IS DISTINCT FROM NEW.customer_id THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'installment_plan_scope_mismatch',
            DETAIL = pg_catalog.jsonb_build_object(
                'installment_id', NEW.id,
                'treatment_plan_id', plan_id,
                'organization_id', NEW.organization_id,
                'customer_id', NEW.customer_id
            )::TEXT;
    END IF;

    PERFORM 1
    FROM public.customers AS customer
    WHERE customer.id = NEW.customer_id
      AND customer.organization_id = NEW.organization_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'installment_customer_scope_mismatch' USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(SUM(payment.amount), 0)
      INTO installment_paid
      FROM public.payments AS payment
     WHERE payment.installment_id = NEW.id;

    IF EXISTS (
        SELECT 1
        FROM public.payments AS payment
        WHERE payment.installment_id = NEW.id
          AND (
              payment.treatment_plan_id IS DISTINCT FROM NEW.treatment_plan_id
              OR payment.organization_id IS DISTINCT FROM NEW.organization_id
              OR payment.customer_id IS DISTINCT FROM NEW.customer_id
          )
    ) THEN
        RAISE EXCEPTION 'installment_payment_scope_mismatch' USING ERRCODE = '23514';
    END IF;

    IF installment_paid > NEW.amount THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'installment_amount_below_paid',
            DETAIL = pg_catalog.jsonb_build_object(
                'installment_id', NEW.id,
                'amount', NEW.amount,
                'paid_total', installment_paid
            )::TEXT;
    END IF;

    SELECT COALESCE(SUM(installment.amount), 0) + NEW.amount
      INTO schedule_total
      FROM public.treatment_installments AS installment
     WHERE installment.treatment_plan_id = NEW.treatment_plan_id
       AND installment.id IS DISTINCT FROM NEW.id;

    SELECT COALESCE(SUM(payment.amount), 0)
      INTO unscheduled_paid
      FROM public.payments AS payment
     WHERE payment.treatment_plan_id = NEW.treatment_plan_id
       AND payment.installment_id IS NULL;

    IF schedule_total + unscheduled_paid > plan_total THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'treatment_schedule_exceeds_plan_balance',
            DETAIL = pg_catalog.jsonb_build_object(
                'plan_id', NEW.treatment_plan_id,
                'plan_total', plan_total,
                'schedule_total', schedule_total,
                'unscheduled_paid', unscheduled_paid
            )::TEXT;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_treatment_payment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    plan_ids UUID[];
    locked_plan_id UUID;
    plan_org UUID;
    plan_customer UUID;
    plan_total NUMERIC(10,2);
    reservation_customer UUID;
    installment_plan UUID;
    installment_org UUID;
    installment_customer UUID;
    installment_amount NUMERIC(10,2);
    already_paid NUMERIC;
BEGIN
    -- ON DELETE SET NULL FK aksiyonları nested trigger olarak çalışır. Plan
    -- veya vade silinirken iki ayrı FK'nin NULL güncellemeleri geçici olarak
    -- farklı sırada görülebilir; yalnız bu dar cascade durumunu serbest bırak.
    IF TG_OP = 'UPDATE' THEN
        IF pg_catalog.pg_trigger_depth() > 1 THEN
            IF OLD.treatment_plan_id IS NOT NULL
               AND NEW.treatment_plan_id IS NULL
               AND OLD.installment_id IS NOT DISTINCT FROM NEW.installment_id
               AND OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id
               AND OLD.customer_id IS NOT DISTINCT FROM NEW.customer_id
               AND OLD.reservation_id IS NOT DISTINCT FROM NEW.reservation_id
               AND OLD.product_id IS NOT DISTINCT FROM NEW.product_id
               AND OLD.staff_id IS NOT DISTINCT FROM NEW.staff_id
               AND OLD.amount IS NOT DISTINCT FROM NEW.amount
               AND NOT EXISTS (
                   SELECT 1 FROM public.treatment_plans AS deleted_plan
                   WHERE deleted_plan.id = OLD.treatment_plan_id
               ) THEN
                RETURN NEW;
            END IF;

            IF OLD.installment_id IS NOT NULL
               AND NEW.installment_id IS NULL
               AND OLD.treatment_plan_id IS NOT DISTINCT FROM NEW.treatment_plan_id
               AND OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id
               AND OLD.customer_id IS NOT DISTINCT FROM NEW.customer_id
               AND OLD.reservation_id IS NOT DISTINCT FROM NEW.reservation_id
               AND OLD.product_id IS NOT DISTINCT FROM NEW.product_id
               AND OLD.staff_id IS NOT DISTINCT FROM NEW.staff_id
               AND OLD.amount IS NOT DISTINCT FROM NEW.amount
               AND NOT EXISTS (
                   SELECT 1 FROM public.treatment_installments AS deleted_installment
                   WHERE deleted_installment.id = OLD.installment_id
               ) THEN
                RETURN NEW;
            END IF;
        END IF;
        plan_ids := ARRAY[OLD.treatment_plan_id, NEW.treatment_plan_id]::UUID[];
    ELSE
        plan_ids := ARRAY[NEW.treatment_plan_id]::UUID[];
    END IF;

    -- UPDATE A planından B planına taşınabiliyorsa ikisini de aynı sırada
    -- kilitle. Bu plan-row lock aynı plana paralel ödemeleri atomik serileştirir.
    FOR locked_plan_id IN
        SELECT DISTINCT candidate.plan_id
        FROM unnest(plan_ids) AS candidate(plan_id)
        WHERE candidate.plan_id IS NOT NULL
        ORDER BY candidate.plan_id
    LOOP
        PERFORM 1
        FROM public.treatment_plans AS locked_plan
        WHERE locked_plan.id = locked_plan_id
        FOR UPDATE;
    END LOOP;

    -- Planlı veya plansız bütün tahsilatlarda doğrudan tenant çapraz bağlarını
    -- engelle. Payments.staff_id kasa/personel atfı olabileceği için doctor
    -- rolü şartı burada özellikle uygulanmaz.
    IF NEW.customer_id IS NOT NULL THEN
        PERFORM 1
        FROM public.customers AS customer
        WHERE customer.id = NEW.customer_id
          AND customer.organization_id = NEW.organization_id
        FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'payment_scope_mismatch' USING
                ERRCODE = '23514',
                DETAIL = pg_catalog.jsonb_build_object('relation', 'customer', 'id', NEW.customer_id)::TEXT;
        END IF;
    END IF;

    IF NEW.staff_id IS NOT NULL THEN
        PERFORM 1
        FROM public.staff AS payment_staff
        WHERE payment_staff.id = NEW.staff_id
          AND payment_staff.organization_id = NEW.organization_id
        FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'payment_scope_mismatch' USING
                ERRCODE = '23514',
                DETAIL = pg_catalog.jsonb_build_object('relation', 'staff', 'id', NEW.staff_id)::TEXT;
        END IF;
    END IF;

    IF NEW.reservation_id IS NOT NULL THEN
        SELECT reservation.customer_id
          INTO reservation_customer
          FROM public.reservations AS reservation
         WHERE reservation.id = NEW.reservation_id
           AND reservation.organization_id = NEW.organization_id
         FOR SHARE;
        IF NOT FOUND
           OR (NEW.customer_id IS NOT NULL AND reservation_customer IS DISTINCT FROM NEW.customer_id) THEN
            RAISE EXCEPTION 'payment_scope_mismatch' USING
                ERRCODE = '23514',
                DETAIL = pg_catalog.jsonb_build_object('relation', 'reservation', 'id', NEW.reservation_id)::TEXT;
        END IF;
    END IF;

    IF NEW.product_id IS NOT NULL THEN
        PERFORM 1
        FROM public.products AS product
        WHERE product.id = NEW.product_id
          AND product.organization_id = NEW.organization_id
        FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'payment_scope_mismatch' USING
                ERRCODE = '23514',
                DETAIL = pg_catalog.jsonb_build_object('relation', 'product', 'id', NEW.product_id)::TEXT;
        END IF;
    END IF;

    IF NEW.installment_id IS NOT NULL AND NEW.treatment_plan_id IS NULL THEN
        RAISE EXCEPTION 'installment_payment_scope_mismatch' USING ERRCODE = '23514';
    END IF;

    IF NEW.treatment_plan_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.amount <= 0 THEN
        RAISE EXCEPTION 'plan_payment_amount_must_be_positive' USING ERRCODE = '23514';
    END IF;

    SELECT plan.organization_id, plan.customer_id, plan.total_amount
      INTO plan_org, plan_customer, plan_total
      FROM public.treatment_plans AS plan
     WHERE plan.id = NEW.treatment_plan_id;

    IF NOT FOUND
       OR plan_org IS DISTINCT FROM NEW.organization_id
       OR plan_customer IS DISTINCT FROM NEW.customer_id THEN
        RAISE EXCEPTION 'payment_scope_mismatch' USING
            ERRCODE = '23514',
            DETAIL = pg_catalog.jsonb_build_object(
                'relation', 'treatment_plan',
                'id', NEW.treatment_plan_id
            )::TEXT;
    END IF;

    IF NEW.installment_id IS NULL AND EXISTS (
        SELECT 1
        FROM public.treatment_installments AS installment
        WHERE installment.treatment_plan_id = NEW.treatment_plan_id
    ) THEN
        RAISE EXCEPTION 'plan_payment_requires_installment' USING ERRCODE = '23514';
    END IF;

    SELECT installment.treatment_plan_id,
           installment.organization_id,
           installment.customer_id,
           installment.amount
      INTO installment_plan, installment_org, installment_customer, installment_amount
      FROM public.treatment_installments AS installment
     WHERE installment.id = NEW.installment_id;

    IF NEW.installment_id IS NOT NULL THEN
        IF NOT FOUND
           OR installment_plan IS DISTINCT FROM NEW.treatment_plan_id
           OR installment_org IS DISTINCT FROM NEW.organization_id
           OR installment_customer IS DISTINCT FROM NEW.customer_id THEN
            RAISE EXCEPTION 'installment_payment_scope_mismatch' USING ERRCODE = '23514';
        END IF;

        SELECT COALESCE(SUM(payment.amount), 0)
          INTO already_paid
          FROM public.payments AS payment
         WHERE payment.installment_id = NEW.installment_id
           AND payment.id IS DISTINCT FROM NEW.id;

        IF already_paid + NEW.amount > installment_amount THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'installment_payment_exceeds_balance',
                DETAIL = pg_catalog.jsonb_build_object(
                    'installment_id', NEW.installment_id,
                    'installment_amount', installment_amount,
                    'already_paid', already_paid,
                    'requested_amount', NEW.amount
                )::TEXT;
        END IF;
    END IF;

    SELECT COALESCE(SUM(payment.amount), 0)
      INTO already_paid
      FROM public.payments AS payment
     WHERE payment.treatment_plan_id = NEW.treatment_plan_id
       AND payment.id IS DISTINCT FROM NEW.id;

    IF already_paid + NEW.amount > plan_total THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'plan_payment_exceeds_balance',
            DETAIL = pg_catalog.jsonb_build_object(
                'plan_id', NEW.treatment_plan_id,
                'plan_total', plan_total,
                'already_paid', already_paid,
                'requested_amount', NEW.amount
            )::TEXT;
    END IF;

    RETURN NEW;
END;
$function$;

-- 059'un ödeme trigger'ı installment satırını FOR UPDATE kilitliyordu. Yeni
-- guard önce planı kilitlediği için ikisini birlikte bırakmak, eş zamanlı bir
-- installment UPDATE'inde plan -> installment / installment -> plan deadlock
-- üretebilirdi. Yeni tek guard hem plan hem taksit limitini plan kilidi altında
-- doğruladığından eski trigger güvenle supersede edilir.
DROP TRIGGER IF EXISTS trg_validate_installment_payment ON public.payments;
DROP TRIGGER IF EXISTS trg_validate_treatment_installment_scope ON public.treatment_installments;

DROP TRIGGER IF EXISTS trg_061_treatment_plan_integrity ON public.treatment_plans;
CREATE TRIGGER trg_061_treatment_plan_integrity
    BEFORE INSERT OR UPDATE OF organization_id, customer_id, total_amount, staff_id, reservation_id
    ON public.treatment_plans
    FOR EACH ROW EXECUTE FUNCTION public.enforce_treatment_plan_integrity();

DROP TRIGGER IF EXISTS trg_061_treatment_installment_write_integrity ON public.treatment_installments;
CREATE TRIGGER trg_061_treatment_installment_write_integrity
    BEFORE INSERT OR UPDATE OF organization_id, customer_id, treatment_plan_id, amount
    ON public.treatment_installments
    FOR EACH ROW EXECUTE FUNCTION public.enforce_treatment_installment_integrity();

DROP TRIGGER IF EXISTS trg_061_treatment_installment_delete_integrity ON public.treatment_installments;
CREATE TRIGGER trg_061_treatment_installment_delete_integrity
    BEFORE DELETE ON public.treatment_installments
    FOR EACH ROW EXECUTE FUNCTION public.enforce_treatment_installment_integrity();

DROP TRIGGER IF EXISTS trg_061_treatment_payment_integrity ON public.payments;
CREATE TRIGGER trg_061_treatment_payment_integrity
    BEFORE INSERT OR UPDATE OF organization_id, customer_id, reservation_id,
        product_id, staff_id, treatment_plan_id, installment_id, amount
    ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.enforce_treatment_payment_integrity();

REVOKE ALL ON FUNCTION public.enforce_treatment_plan_integrity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_treatment_installment_integrity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_treatment_payment_integrity() FROM PUBLIC;

-- Uygun olan onarım FK'lerini doğrula; orphan bulunan kolonları NOT VALID
-- bırak. Böylece migration kirli legacy veride atomik olarak geri dönmez.
DO $validation$
DECLARE
    constraint_name TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.treatment_plans AS plan
        WHERE plan.reservation_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.reservations AS reservation
              WHERE reservation.id = plan.reservation_id
          )
    ) THEN
        FOR constraint_name IN
            SELECT conname
            FROM pg_catalog.pg_constraint
            WHERE contype = 'f'
              AND conrelid = 'public.treatment_plans'::regclass
              AND confrelid = 'public.reservations'::regclass
              AND NOT convalidated
              AND cardinality(conkey) = 1
              AND conkey[1] = (
                  SELECT attnum FROM pg_catalog.pg_attribute
                  WHERE attrelid = 'public.treatment_plans'::regclass
                    AND attname = 'reservation_id'
              )
        LOOP
            EXECUTE pg_catalog.format(
                'ALTER TABLE public.treatment_plans VALIDATE CONSTRAINT %I',
                constraint_name
            );
        END LOOP;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.treatment_plans AS plan
        WHERE plan.created_by IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM auth.users AS app_user WHERE app_user.id = plan.created_by)
    ) THEN
        FOR constraint_name IN
            SELECT conname
            FROM pg_catalog.pg_constraint
            WHERE contype = 'f'
              AND conrelid = 'public.treatment_plans'::regclass
              AND confrelid = 'auth.users'::regclass
              AND NOT convalidated
              AND cardinality(conkey) = 1
              AND conkey[1] = (
                  SELECT attnum FROM pg_catalog.pg_attribute
                  WHERE attrelid = 'public.treatment_plans'::regclass
                    AND attname = 'created_by'
              )
        LOOP
            EXECUTE pg_catalog.format(
                'ALTER TABLE public.treatment_plans VALIDATE CONSTRAINT %I',
                constraint_name
            );
        END LOOP;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.payments AS payment
        WHERE payment.created_by IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM auth.users AS app_user WHERE app_user.id = payment.created_by)
    ) THEN
        FOR constraint_name IN
            SELECT conname
            FROM pg_catalog.pg_constraint
            WHERE contype = 'f'
              AND conrelid = 'public.payments'::regclass
              AND confrelid = 'auth.users'::regclass
              AND NOT convalidated
              AND cardinality(conkey) = 1
              AND conkey[1] = (
                  SELECT attnum FROM pg_catalog.pg_attribute
                  WHERE attrelid = 'public.payments'::regclass
                    AND attname = 'created_by'
              )
        LOOP
            EXECUTE pg_catalog.format(
                'ALTER TABLE public.payments VALIDATE CONSTRAINT %I',
                constraint_name
            );
        END LOOP;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.payments AS payment
        WHERE payment.installment_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.treatment_installments AS installment
              WHERE installment.id = payment.installment_id
          )
    ) THEN
        FOR constraint_name IN
            SELECT conname
            FROM pg_catalog.pg_constraint
            WHERE contype = 'f'
              AND conrelid = 'public.payments'::regclass
              AND confrelid = 'public.treatment_installments'::regclass
              AND NOT convalidated
              AND cardinality(conkey) = 1
              AND conkey[1] = (
                  SELECT attnum FROM pg_catalog.pg_attribute
                  WHERE attrelid = 'public.payments'::regclass
                    AND attname = 'installment_id'
              )
        LOOP
            EXECUTE pg_catalog.format(
                'ALTER TABLE public.payments VALIDATE CONSTRAINT %I',
                constraint_name
            );
        END LOOP;
    END IF;
END;
$validation$;

COMMIT;

NOTIFY pgrst, 'reload schema';
