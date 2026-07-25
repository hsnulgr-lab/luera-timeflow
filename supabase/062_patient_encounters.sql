-- ============================================================
-- TimeFlow Migration 062: Hasta ziyareti ve klinik işlem omurgası
-- ============================================================
-- Amaç:
--   * Bir dental randevuyu tenant içinde tek bir hasta ziyaretine bağlamak.
--   * Muayene notlarını ve klinik işlemleri randevu / hasta / hekim /
--     tedavi planı / diş şeması zincirinde tutmak.
--   * Güncel satırlar değişebilse de her değişikliği silinemez, append-only
--     olay tablolarında saklamak.
--   * 054-061 ile oluşmuş dental kayıtları geriye uyumlu biçimde yeni
--     omurgaya bağlamak; eski ekranların çalışmasını değiştirmemek.
--
-- patient_encounters bir randevunun klinik ziyaret kaydıdır. Aynı
-- (organization_id, reservation_id) ikilisi yalnız bir kez bulunabilir.
-- Randevusuz/acil ziyaretler için reservation_id NULL kalabilir.
-- ============================================================

BEGIN;

-- ── Hasta ziyareti ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.patient_encounters (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_id          UUID        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    reservation_id       UUID        REFERENCES public.reservations(id) ON DELETE SET NULL,
    attending_staff_id   UUID        REFERENCES public.staff(id) ON DELETE SET NULL,
    visit_type           TEXT        NOT NULL DEFAULT 'examination'
        CHECK (visit_type IN ('examination', 'treatment', 'control', 'emergency', 'consultation', 'other')),
    status               TEXT        NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'checked_in', 'in_progress', 'completed', 'cancelled')),
    reason_for_visit     TEXT,
    chief_complaint      TEXT,
    diagnosis            TEXT,
    clinical_notes       TEXT,
    checked_in_at        TIMESTAMPTZ,
    started_at           TIMESTAMPTZ,
    completed_at         TIMESTAMPTZ,
    cancelled_at         TIMESTAMPTZ,
    created_by           UUID        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by           UUID        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata             JSONB       NOT NULL DEFAULT '{}'::JSONB
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT patient_encounters_org_reservation_unique
        UNIQUE (organization_id, reservation_id),
    CONSTRAINT patient_encounters_time_order_check CHECK (
        (started_at IS NULL OR checked_in_at IS NULL OR started_at >= checked_in_at)
        AND (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
    )
);

CREATE INDEX IF NOT EXISTS idx_patient_encounters_customer_created
    ON public.patient_encounters(organization_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_encounters_status
    ON public.patient_encounters(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_encounters_staff
    ON public.patient_encounters(organization_id, attending_staff_id, created_at DESC)
    WHERE attending_staff_id IS NOT NULL;

-- Değişiklik günlüğü yalnız trigger tarafından yazılır. actor kimliklerinde
-- bilerek FK yoktur: kullanıcı/personel sonradan silinse de audit atfı ve isim
-- snapshot'ı değişmeden kalmalıdır.
CREATE TABLE IF NOT EXISTS public.patient_encounter_events (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    encounter_id         UUID        NOT NULL REFERENCES public.patient_encounters(id) ON DELETE CASCADE,
    customer_id          UUID        NOT NULL,
    event_type           TEXT        NOT NULL CHECK (event_type IN ('created', 'updated')),
    previous_status      TEXT,
    status               TEXT        NOT NULL,
    actor_user_id        UUID,
    actor_staff_id       UUID,
    actor_staff_name     TEXT,
    event_data           JSONB       NOT NULL CHECK (jsonb_typeof(event_data) = 'object'),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_encounter_events_encounter
    ON public.patient_encounter_events(encounter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_encounter_events_customer
    ON public.patient_encounter_events(organization_id, customer_id, created_at DESC);

ALTER TABLE public.patient_encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_encounter_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patient_encounters_select" ON public.patient_encounters;
CREATE POLICY "patient_encounters_select" ON public.patient_encounters
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public.auth_user_org_ids()));

DROP POLICY IF EXISTS "patient_encounters_insert" ON public.patient_encounters;
CREATE POLICY "patient_encounters_insert" ON public.patient_encounters
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT public.auth_user_org_ids()));

DROP POLICY IF EXISTS "patient_encounters_update" ON public.patient_encounters;
CREATE POLICY "patient_encounters_update" ON public.patient_encounters
    FOR UPDATE TO authenticated
    USING (organization_id IN (SELECT public.auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT public.auth_user_org_ids()));

-- Audit satırlarına istemciden INSERT/UPDATE/DELETE politikası verilmez.
DROP POLICY IF EXISTS "patient_encounter_events_select" ON public.patient_encounter_events;
CREATE POLICY "patient_encounter_events_select" ON public.patient_encounter_events
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public.auth_user_org_ids()));

CREATE OR REPLACE FUNCTION public.prepare_patient_encounter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    reservation_org      UUID;
    reservation_customer UUID;
    reservation_staff    UUID;
    reservation_staff_role TEXT;
    attending_staff_was_deleted BOOLEAN := FALSE;
    deleted_attending_staff_id UUID;
BEGIN
    IF TG_OP = 'UPDATE'
       AND pg_catalog.pg_trigger_depth() > 1
       AND NOT EXISTS (
           SELECT 1 FROM public.organizations AS deleted_organization
           WHERE deleted_organization.id = OLD.organization_id
       ) THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- staff.attending_staff_id FK'sinin ON DELETE SET NULL aksiyonunu,
        -- reservations.staff_id FK'sinin hangi sırada çalıştığından bağımsız
        -- olarak tanı. Aksi halde aşağıdaki canonical reservation eşlemesi
        -- silinmekte olan hekimi encounter'a geri yazıp personel silmeyi
        -- engelleyebilir.
        attending_staff_was_deleted := OLD.attending_staff_id IS NOT NULL
            AND NEW.attending_staff_id IS NULL
            AND pg_catalog.pg_trigger_depth() > 1
            AND NOT EXISTS (
                SELECT 1 FROM public.staff AS deleted_staff
                WHERE deleted_staff.id = OLD.attending_staff_id
            );
        IF attending_staff_was_deleted THEN
            deleted_attending_staff_id := OLD.attending_staff_id;
        END IF;

        IF OLD.organization_id IS DISTINCT FROM NEW.organization_id
           OR OLD.customer_id IS DISTINCT FROM NEW.customer_id
           OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'encounter_identity_is_immutable';
        END IF;

        -- Randevu silinirken FK'nin yaptığı tek alanlı SET NULL işlemine izin
        -- ver; normal istemci encounter kimliğini başka randevuya taşıyamaz.
        IF OLD.reservation_id IS NOT NULL
           AND OLD.reservation_id IS DISTINCT FROM NEW.reservation_id
           AND NOT (
               NEW.reservation_id IS NULL
               AND pg_catalog.pg_trigger_depth() > 1
               AND NOT EXISTS (
                   SELECT 1 FROM public.reservations AS deleted_reservation
                   WHERE deleted_reservation.id = OLD.reservation_id
               )
           ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'encounter_reservation_is_immutable';
        END IF;

        -- auth.users ON DELETE SET NULL haricinde creator değiştirilemez.
        IF OLD.created_by IS DISTINCT FROM NEW.created_by
           AND NOT (
               OLD.created_by IS NOT NULL
               AND NEW.created_by IS NULL
               AND pg_catalog.pg_trigger_depth() > 1
               AND NOT EXISTS (
                   SELECT 1 FROM auth.users AS deleted_user
                   WHERE deleted_user.id = OLD.created_by
               )
           ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'encounter_created_by_is_immutable';
        END IF;

        NEW.updated_at := now();
        IF auth.uid() IS NOT NULL THEN
            NEW.updated_by := auth.uid();
        END IF;
    ELSE
        IF auth.uid() IS NOT NULL THEN
            NEW.created_by := auth.uid();
            NEW.updated_by := auth.uid();
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
            MESSAGE = 'encounter_customer_scope_mismatch';
    END IF;

    IF NEW.reservation_id IS NOT NULL THEN
        SELECT reservation.organization_id,
               reservation.customer_id,
               reservation.staff_id,
               doctor.role
          INTO reservation_org,
               reservation_customer,
               reservation_staff,
               reservation_staff_role
          FROM public.reservations AS reservation
          LEFT JOIN public.staff AS doctor
            ON doctor.id = reservation.staff_id
           AND doctor.organization_id = reservation.organization_id
         WHERE reservation.id = NEW.reservation_id
         FOR SHARE OF reservation;

        IF NOT FOUND
           OR reservation_org IS DISTINCT FROM NEW.organization_id
           OR reservation_customer IS NULL
           OR reservation_customer IS DISTINCT FROM NEW.customer_id THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'encounter_reservation_scope_mismatch';
        END IF;

        IF reservation_staff IS NOT NULL
           AND reservation_staff_role IS DISTINCT FROM 'doctor'
           AND NOT (
               attending_staff_was_deleted
               AND reservation_staff IS NOT DISTINCT FROM deleted_attending_staff_id
           ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'encounter_reservation_staff_role_mismatch',
                DETAIL = pg_catalog.jsonb_build_object(
                    'reservation_id', NEW.reservation_id,
                    'staff_id', reservation_staff,
                    'required_role', 'doctor'
                )::TEXT;
        END IF;

        IF TG_OP = 'INSERT' THEN
            -- Randevulu ziyarette hekim bağının tek kaynağı reservation.staff_id.
            -- Atanmamış randevuya istemciden hekim enjekte edilmesine izin verme.
            IF NEW.attending_staff_id IS NOT NULL
               AND NEW.attending_staff_id IS DISTINCT FROM reservation_staff THEN
                RAISE EXCEPTION USING
                    ERRCODE = '23514',
                    MESSAGE = 'encounter_staff_reservation_mismatch';
            END IF;
            NEW.attending_staff_id := reservation_staff;
        ELSIF attending_staff_was_deleted THEN
            -- Parent staff satırı silinirken FK'nin NULL değerini koru.
            NEW.attending_staff_id := NULL;
        ELSIF NEW.attending_staff_id IS DISTINCT FROM reservation_staff THEN
            -- Başlamamış ziyarette takvimde yapılan normal hekim değişikliğini
            -- güvenle encounter'a taşı. Klinik başladıktan sonra atıf sabittir.
            IF OLD.started_at IS NULL
               AND OLD.status IN ('scheduled', 'checked_in') THEN
                NEW.attending_staff_id := reservation_staff;
            ELSE
                RAISE EXCEPTION USING
                    ERRCODE = '23514',
                    MESSAGE = 'encounter_staff_reservation_mismatch';
            END IF;
        END IF;
    END IF;

    IF NEW.attending_staff_id IS NOT NULL THEN
        PERFORM 1
        FROM public.staff AS doctor
        WHERE doctor.id = NEW.attending_staff_id
          AND doctor.organization_id = NEW.organization_id
          AND doctor.role = 'doctor'
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'encounter_staff_scope_or_role_mismatch';
        END IF;
    END IF;

    IF NEW.status = 'checked_in' AND NEW.checked_in_at IS NULL THEN
        NEW.checked_in_at := now();
    ELSIF NEW.status = 'in_progress' AND NEW.started_at IS NULL THEN
        NEW.started_at := now();
    ELSIF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
        NEW.completed_at := now();
    ELSIF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
        NEW.cancelled_at := now();
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_patient_encounter_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    actor_name TEXT;
BEGIN
    -- Organizasyonun tamamı cascade ile silinirken yeni audit olayı üretme;
    -- event tablosunun parent FK'si artık yoktur ve mevcut olaylar da aynı
    -- tenant silme işlemi içinde kaldırılacaktır.
    IF NOT EXISTS (
        SELECT 1 FROM public.organizations AS organization
        WHERE organization.id = NEW.organization_id
    ) THEN
        RETURN NULL;
    END IF;

    IF NEW.attending_staff_id IS NOT NULL THEN
        SELECT staff.name INTO actor_name
        FROM public.staff AS staff
        WHERE staff.id = NEW.attending_staff_id;
    END IF;

    INSERT INTO public.patient_encounter_events (
        organization_id, encounter_id, customer_id, event_type,
        previous_status, status, actor_user_id, actor_staff_id,
        actor_staff_name, event_data
    ) VALUES (
        NEW.organization_id,
        NEW.id,
        NEW.customer_id,
        CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
        NEW.status,
        auth.uid(),
        NEW.attending_staff_id,
        actor_name,
        CASE
            WHEN TG_OP = 'INSERT' THEN pg_catalog.jsonb_build_object('new', to_jsonb(NEW))
            ELSE pg_catalog.jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
        END
    );
    RETURN NULL;
END;
$function$;

-- Klinik kayıtları normal satır silme ile yok edilemez; durum cancelled olarak
-- işaretlenir. Organizasyonun tamamı hukuki/veri-saklama politikası gereği
-- siliniyorsa FK cascade'e izin verilir.
CREATE OR REPLACE FUNCTION public.prevent_clinical_history_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
    IF pg_catalog.pg_trigger_depth() > 1
       AND NOT EXISTS (
           SELECT 1 FROM public.organizations AS organization
           WHERE organization.id = OLD.organization_id
       ) THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'clinical_history_is_append_only',
        HINT = 'Set the clinical record status to cancelled instead of deleting it.';
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_clinical_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
    IF TG_OP = 'DELETE'
       AND pg_catalog.pg_trigger_depth() > 1
       AND NOT EXISTS (
           SELECT 1 FROM public.organizations AS organization
           WHERE organization.id = OLD.organization_id
       ) THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'clinical_event_is_append_only';
END;
$function$;

DROP TRIGGER IF EXISTS trg_062_prepare_patient_encounter ON public.patient_encounters;
CREATE TRIGGER trg_062_prepare_patient_encounter
    BEFORE INSERT OR UPDATE ON public.patient_encounters
    FOR EACH ROW EXECUTE FUNCTION public.prepare_patient_encounter();

DROP TRIGGER IF EXISTS trg_062_audit_patient_encounter ON public.patient_encounters;
CREATE TRIGGER trg_062_audit_patient_encounter
    AFTER INSERT OR UPDATE ON public.patient_encounters
    FOR EACH ROW EXECUTE FUNCTION public.audit_patient_encounter_change();

DROP TRIGGER IF EXISTS trg_062_prevent_patient_encounter_delete ON public.patient_encounters;
CREATE TRIGGER trg_062_prevent_patient_encounter_delete
    BEFORE DELETE ON public.patient_encounters
    FOR EACH ROW EXECUTE FUNCTION public.prevent_clinical_history_delete();

DROP TRIGGER IF EXISTS trg_062_patient_encounter_events_append_only ON public.patient_encounter_events;
CREATE TRIGGER trg_062_patient_encounter_events_append_only
    BEFORE UPDATE OR DELETE ON public.patient_encounter_events
    FOR EACH ROW EXECUTE FUNCTION public.prevent_clinical_event_mutation();

-- Klinik başladıktan sonra normal bir reservation UPDATE'i ile sorumlu hekim
-- değiştirilemez; ancak staff parent satırının gerçek ON DELETE SET NULL
-- aksiyonu geçmişi bozmadan ilerleyebilir. Başlamamış encounter ise bir sonraki
-- klinik yazımında prepare_patient_encounter tarafından canonical randevu
-- hekimine çekilir. Reservation AFTER trigger'ından encounter UPDATE etmek,
-- eşzamanlı muayene kaydıyla reservation→encounter / encounter→reservation
-- kilit sırası tersliği ve deadlock oluşturabileceği için bilerek yapılmaz.
CREATE OR REPLACE FUNCTION public.guard_reservation_encounter_staff_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    staff_was_deleted BOOLEAN;
BEGIN
    IF OLD.staff_id IS NOT DISTINCT FROM NEW.staff_id THEN
        RETURN NEW;
    END IF;

    staff_was_deleted := OLD.staff_id IS NOT NULL
        AND NEW.staff_id IS NULL
        AND pg_catalog.pg_trigger_depth() > 1
        AND NOT EXISTS (
            SELECT 1 FROM public.staff AS deleted_staff
            WHERE deleted_staff.id = OLD.staff_id
        );

    IF NOT staff_was_deleted
       AND EXISTS (
           SELECT 1
           FROM public.patient_encounters AS encounter
           WHERE encounter.organization_id = OLD.organization_id
             AND encounter.reservation_id = OLD.id
             AND (
                 encounter.started_at IS NOT NULL
                 OR encounter.status IN ('in_progress', 'completed')
             )
       ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'encounter_reservation_staff_locked';
    END IF;

    -- Başlamamış encounter başka bir aktif doktora taşınabilir; klinik bağlamı
    -- bulunan randevuya asistan/kasa veya başka tenant personeli atanamaz.
    IF NEW.staff_id IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM public.patient_encounters AS encounter
           WHERE encounter.organization_id = OLD.organization_id
             AND encounter.reservation_id = OLD.id
       ) THEN
        PERFORM 1
        FROM public.staff AS doctor
        WHERE doctor.id = NEW.staff_id
          AND doctor.organization_id = NEW.organization_id
          AND doctor.role = 'doctor'
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'encounter_reservation_staff_role_mismatch';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_062_guard_reservation_encounter_staff ON public.reservations;
CREATE TRIGGER trg_062_guard_reservation_encounter_staff
    BEFORE UPDATE OF staff_id ON public.reservations
    FOR EACH ROW EXECUTE FUNCTION public.guard_reservation_encounter_staff_change();

-- Route ve hook aynı randevuyu eş zamanlı açsa bile tek ziyaret oluşturulur.
-- Customer/hekim doğrudan randevudan alınır; istemci bu bağlamı değiştiremez.
CREATE OR REPLACE FUNCTION public.ensure_patient_encounter(
    p_organization_id UUID,
    p_reservation_id UUID,
    p_visit_type TEXT DEFAULT NULL
)
RETURNS public.patient_encounters
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    source_reservation public.reservations%ROWTYPE;
    encounter public.patient_encounters%ROWTYPE;
    resolved_visit_type TEXT;
    resolved_status TEXT;
BEGIN
    SELECT reservation.*
      INTO source_reservation
      FROM public.reservations AS reservation
     WHERE reservation.id = p_reservation_id
       AND reservation.organization_id = p_organization_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'encounter_reservation_not_found';
    END IF;
    IF source_reservation.customer_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'encounter_reservation_patient_required';
    END IF;

    resolved_visit_type := COALESCE(
        p_visit_type,
        CASE
            WHEN lower(source_reservation.service) LIKE '%kontrol%' THEN 'control'
            WHEN lower(source_reservation.service) LIKE '%acil%' THEN 'emergency'
            WHEN lower(source_reservation.service) LIKE '%konsült%' THEN 'consultation'
            WHEN lower(source_reservation.service) LIKE '%muayene%' THEN 'examination'
            ELSE 'treatment'
        END
    );

    resolved_status := CASE
        WHEN source_reservation.status = 'cancelled' THEN 'cancelled'
        WHEN source_reservation.status = 'completed'
          OR source_reservation.service_ended_at IS NOT NULL THEN 'completed'
        WHEN source_reservation.arrived_at IS NOT NULL THEN 'in_progress'
        WHEN source_reservation.customer_arrived_at IS NOT NULL THEN 'checked_in'
        ELSE 'scheduled'
    END;

    INSERT INTO public.patient_encounters (
        organization_id, customer_id, reservation_id, attending_staff_id,
        visit_type, status, reason_for_visit, checked_in_at, started_at,
        completed_at, cancelled_at, created_by, updated_by
    ) VALUES (
        source_reservation.organization_id,
        source_reservation.customer_id,
        source_reservation.id,
        source_reservation.staff_id,
        resolved_visit_type,
        resolved_status,
        source_reservation.service,
        CASE
            WHEN source_reservation.arrived_at IS NULL
              OR source_reservation.customer_arrived_at IS NULL
              OR source_reservation.customer_arrived_at <= source_reservation.arrived_at
            THEN source_reservation.customer_arrived_at
            ELSE NULL
        END,
        CASE
            WHEN resolved_status = 'completed'
             AND source_reservation.arrived_at IS NOT NULL
             AND COALESCE(source_reservation.service_ended_at, source_reservation.updated_at) < source_reservation.arrived_at
            THEN NULL
            ELSE source_reservation.arrived_at
        END,
        CASE
            WHEN resolved_status = 'completed'
            THEN COALESCE(source_reservation.service_ended_at, source_reservation.updated_at)
            ELSE NULL
        END,
        CASE WHEN source_reservation.status = 'cancelled' THEN now() ELSE NULL END,
        auth.uid(),
        auth.uid()
    )
    ON CONFLICT (organization_id, reservation_id) DO NOTHING
    RETURNING * INTO encounter;

    IF encounter.id IS NULL THEN
        SELECT existing.* INTO encounter
        FROM public.patient_encounters AS existing
        WHERE existing.organization_id = p_organization_id
          AND existing.reservation_id = p_reservation_id;
    END IF;

    IF encounter.id IS NULL
       OR encounter.customer_id IS DISTINCT FROM source_reservation.customer_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'encounter_existing_scope_mismatch';
    END IF;

    RETURN encounter;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_patient_encounter(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_patient_encounter(UUID, UUID, TEXT) TO authenticated;

-- Başlamış/tamamlanmış eski dental randevuları ziyaret olarak geri doldur.
-- Gelecekteki sıradan randevular route açıldığında ensure RPC ile oluşur;
-- böylece takvimde hekim değişikliği gibi normal planlama işlemleri kısıtlanmaz.
INSERT INTO public.patient_encounters (
    organization_id, customer_id, reservation_id, attending_staff_id,
    visit_type, status, reason_for_visit, checked_in_at, started_at,
    completed_at, cancelled_at, created_by, updated_by, created_at, updated_at,
    metadata
)
SELECT
    reservation.organization_id,
    reservation.customer_id,
    reservation.id,
    CASE WHEN doctor.role = 'doctor' THEN reservation.staff_id ELSE NULL END,
    CASE
        WHEN lower(reservation.service) LIKE '%kontrol%' THEN 'control'
        WHEN lower(reservation.service) LIKE '%acil%' THEN 'emergency'
        WHEN lower(reservation.service) LIKE '%konsült%' THEN 'consultation'
        WHEN lower(reservation.service) LIKE '%muayene%' THEN 'examination'
        ELSE 'treatment'
    END,
    CASE
        WHEN reservation.status = 'cancelled' THEN 'cancelled'
        WHEN reservation.status = 'completed' OR reservation.service_ended_at IS NOT NULL THEN 'completed'
        WHEN reservation.arrived_at IS NOT NULL THEN 'in_progress'
        WHEN reservation.customer_arrived_at IS NOT NULL THEN 'checked_in'
        ELSE 'scheduled'
    END,
    reservation.service,
    CASE
        WHEN reservation.arrived_at IS NULL
          OR reservation.customer_arrived_at IS NULL
          OR reservation.customer_arrived_at <= reservation.arrived_at
        THEN reservation.customer_arrived_at
        ELSE NULL
    END,
    CASE
        WHEN (reservation.status = 'completed' OR reservation.service_ended_at IS NOT NULL)
         AND reservation.arrived_at IS NOT NULL
         AND COALESCE(reservation.service_ended_at, reservation.updated_at, reservation.created_at) < reservation.arrived_at
        THEN NULL
        ELSE reservation.arrived_at
    END,
    CASE
        WHEN reservation.status = 'completed' OR reservation.service_ended_at IS NOT NULL
        THEN COALESCE(reservation.service_ended_at, reservation.updated_at, reservation.created_at)
        ELSE NULL
    END,
    CASE WHEN reservation.status = 'cancelled' THEN reservation.updated_at ELSE NULL END,
    NULL,
    NULL,
    reservation.created_at,
    COALESCE(reservation.updated_at, reservation.created_at),
    pg_catalog.jsonb_build_object('legacy_backfill', TRUE, 'source', 'reservations')
FROM public.reservations AS reservation
LEFT JOIN public.staff AS doctor
  ON doctor.id = reservation.staff_id
 AND doctor.organization_id = reservation.organization_id
WHERE reservation.customer_id IS NOT NULL
  AND (
      reservation.customer_arrived_at IS NOT NULL
      OR reservation.arrived_at IS NOT NULL
      OR reservation.service_ended_at IS NOT NULL
      OR reservation.status IN ('completed', 'cancelled')
      OR EXISTS (
          SELECT 1 FROM public.treatment_plans AS plan
          WHERE plan.reservation_id = reservation.id
            AND plan.organization_id = reservation.organization_id
            AND plan.customer_id = reservation.customer_id
      )
  )
  AND EXISTS (
      SELECT 1 FROM public.settings AS setting
      WHERE setting.organization_id = reservation.organization_id
        AND setting.sector = 'dis'
  )
  -- Kirli legacy atamada encounter guard migration'ı düşürmesin; böyle bir
  -- randevu route açıldığında açık rol hatasıyla düzeltilir.
  AND (reservation.staff_id IS NULL OR doctor.role = 'doctor')
ON CONFLICT (organization_id, reservation_id) DO NOTHING;

-- ── Mevcut plan ve diş kayıtlarını ziyaret bağlamına taşı ───────────────────

ALTER TABLE public.treatment_plans
    ADD COLUMN IF NOT EXISTS encounter_id UUID
        REFERENCES public.patient_encounters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_treatment_plans_encounter
    ON public.treatment_plans(encounter_id) WHERE encounter_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_treatment_plan_encounter_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    encounter_org UUID;
    encounter_customer UUID;
    encounter_reservation UUID;
BEGIN
    IF NEW.encounter_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT encounter.organization_id, encounter.customer_id, encounter.reservation_id
      INTO encounter_org, encounter_customer, encounter_reservation
      FROM public.patient_encounters AS encounter
     WHERE encounter.id = NEW.encounter_id
     FOR SHARE;

    IF NOT FOUND
       OR encounter_org IS DISTINCT FROM NEW.organization_id
       OR encounter_customer IS DISTINCT FROM NEW.customer_id
       OR (
           NEW.reservation_id IS NOT NULL
           AND encounter_reservation IS NOT NULL
           AND encounter_reservation IS DISTINCT FROM NEW.reservation_id
       ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'treatment_plan_encounter_scope_mismatch';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_062_treatment_plan_encounter_scope ON public.treatment_plans;
CREATE TRIGGER trg_062_treatment_plan_encounter_scope
    BEFORE INSERT OR UPDATE OF encounter_id, organization_id, customer_id, reservation_id
    ON public.treatment_plans
    FOR EACH ROW EXECUTE FUNCTION public.enforce_treatment_plan_encounter_scope();

UPDATE public.treatment_plans AS plan
SET encounter_id = encounter.id
FROM public.patient_encounters AS encounter
WHERE plan.encounter_id IS NULL
  AND plan.reservation_id IS NOT NULL
  AND encounter.organization_id = plan.organization_id
  AND encounter.customer_id = plan.customer_id
  AND encounter.reservation_id = plan.reservation_id;

ALTER TABLE public.dental_records
    ADD COLUMN IF NOT EXISTS encounter_id UUID
        REFERENCES public.patient_encounters(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reservation_id UUID
        REFERENCES public.reservations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_by UUID DEFAULT auth.uid()
        REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.dental_records ALTER COLUMN created_by SET DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_dental_records_encounter
    ON public.dental_records(encounter_id, created_at) WHERE encounter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dental_records_reservation
    ON public.dental_records(reservation_id, created_at) WHERE reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dental_records_created_by
    ON public.dental_records(created_by) WHERE created_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_dental_encounter_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    encounter_org UUID;
    encounter_customer UUID;
    encounter_reservation UUID;
    reservation_org UUID;
    reservation_customer UUID;
    resolved_encounter_id UUID;
    plan_org UUID;
    plan_customer UUID;
    validate_staff BOOLEAN;
    reservation_was_deleted BOOLEAN := FALSE;
BEGIN
    IF TG_OP = 'UPDATE'
       AND pg_catalog.pg_trigger_depth() > 1
       AND NOT EXISTS (
           SELECT 1 FROM public.organizations AS deleted_organization
           WHERE deleted_organization.id = OLD.organization_id
       ) THEN
        RETURN NEW;
    END IF;

    validate_staff := TG_OP = 'INSERT';
    IF TG_OP = 'UPDATE' THEN
        validate_staff := OLD.staff_id IS DISTINCT FROM NEW.staff_id;
        reservation_was_deleted := OLD.reservation_id IS NOT NULL
            AND NEW.reservation_id IS NULL
            AND pg_catalog.pg_trigger_depth() > 1
            AND NOT EXISTS (
                SELECT 1 FROM public.reservations AS deleted_reservation
                WHERE deleted_reservation.id = OLD.reservation_id
            );
    END IF;

    IF TG_OP = 'UPDATE'
       AND (OLD.organization_id IS DISTINCT FROM NEW.organization_id
            OR OLD.customer_id IS DISTINCT FROM NEW.customer_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'dental_record_identity_is_immutable';
    END IF;

    IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL THEN
        NEW.created_by := auth.uid();
    ELSIF TG_OP = 'UPDATE' AND OLD.created_by IS DISTINCT FROM NEW.created_by THEN
        IF NOT (
            OLD.created_by IS NOT NULL
            AND NEW.created_by IS NULL
            AND pg_catalog.pg_trigger_depth() > 1
            AND NOT EXISTS (
                SELECT 1 FROM auth.users AS deleted_user
                WHERE deleted_user.id = OLD.created_by
            )
        ) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'dental_record_created_by_is_immutable';
        END IF;
    END IF;

    PERFORM 1
    FROM public.customers AS customer
    WHERE customer.id = NEW.customer_id
      AND customer.organization_id = NEW.organization_id
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'dental_record_customer_scope_mismatch';
    END IF;

    -- Eski dental loglarda rol sınıflandırması güvenilmez olabilir. Link
    -- backfill'i bu satırları bozmaz; fakat bundan sonraki yeni/değişen hekim
    -- atıfları yalnız aynı tenant'taki doctor rolünü kabul eder.
    IF NEW.staff_id IS NOT NULL AND validate_staff THEN
        PERFORM 1
        FROM public.staff AS doctor
        WHERE doctor.id = NEW.staff_id
          AND doctor.organization_id = NEW.organization_id
          AND doctor.role = 'doctor'
        FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'dental_record_staff_scope_or_role_mismatch';
        END IF;
    END IF;

    IF NEW.treatment_plan_id IS NOT NULL THEN
        SELECT plan.organization_id, plan.customer_id
          INTO plan_org, plan_customer
          FROM public.treatment_plans AS plan
         WHERE plan.id = NEW.treatment_plan_id
         FOR SHARE;
        IF NOT FOUND
           OR plan_org IS DISTINCT FROM NEW.organization_id
           OR plan_customer IS DISTINCT FROM NEW.customer_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'dental_record_plan_scope_mismatch';
        END IF;
    END IF;

    -- Yalnız bir bağ verilmişse güvenilir diğer bağı otomatik tamamla.
    IF NEW.encounter_id IS NOT NULL THEN
        SELECT encounter.organization_id, encounter.customer_id, encounter.reservation_id
          INTO encounter_org, encounter_customer, encounter_reservation
          FROM public.patient_encounters AS encounter
         WHERE encounter.id = NEW.encounter_id
         FOR SHARE;

        IF NOT FOUND
           OR encounter_org IS DISTINCT FROM NEW.organization_id
           OR encounter_customer IS DISTINCT FROM NEW.customer_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'dental_record_encounter_scope_mismatch';
        END IF;

        IF NEW.reservation_id IS NULL AND NOT reservation_was_deleted THEN
            NEW.reservation_id := encounter_reservation;
        ELSIF NOT reservation_was_deleted
              AND encounter_reservation IS NOT NULL
              AND NEW.reservation_id IS DISTINCT FROM encounter_reservation THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'dental_record_encounter_reservation_mismatch';
        END IF;
    ELSIF NEW.reservation_id IS NOT NULL THEN
        SELECT encounter.id
          INTO resolved_encounter_id
          FROM public.patient_encounters AS encounter
         WHERE encounter.organization_id = NEW.organization_id
           AND encounter.customer_id = NEW.customer_id
           AND encounter.reservation_id = NEW.reservation_id;
        NEW.encounter_id := resolved_encounter_id;
    END IF;

    IF NEW.reservation_id IS NOT NULL THEN
        SELECT reservation.organization_id, reservation.customer_id
          INTO reservation_org, reservation_customer
          FROM public.reservations AS reservation
         WHERE reservation.id = NEW.reservation_id
         FOR SHARE;

        IF NOT FOUND
           OR reservation_org IS DISTINCT FROM NEW.organization_id
           OR reservation_customer IS DISTINCT FROM NEW.customer_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'dental_record_reservation_scope_mismatch';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_062_dental_encounter_scope ON public.dental_records;
CREATE TRIGGER trg_062_dental_encounter_scope
    BEFORE INSERT OR UPDATE OF organization_id, customer_id, staff_id,
        treatment_plan_id, encounter_id, reservation_id, created_by
    ON public.dental_records
    FOR EACH ROW EXECUTE FUNCTION public.enforce_dental_encounter_scope();

-- 054'ten beri uygulama dental_records'a yalnız INSERT yaparak geçmiş tutar.
-- Bu sözleşmeyi veritabanında da koru; düzeltme yeni bir log satırı olmalıdır.
DROP TRIGGER IF EXISTS trg_062_prevent_dental_record_delete ON public.dental_records;
CREATE TRIGGER trg_062_prevent_dental_record_delete
    BEFORE DELETE ON public.dental_records
    FOR EACH ROW EXECUTE FUNCTION public.prevent_clinical_history_delete();

-- Planın güvenilir kaynak randevu/ziyaret bağını eski dental loglara taşı.
UPDATE public.dental_records AS dental
SET reservation_id = COALESCE(dental.reservation_id, plan.reservation_id),
    encounter_id = COALESCE(dental.encounter_id, plan.encounter_id)
FROM public.treatment_plans AS plan
WHERE dental.treatment_plan_id = plan.id
  AND dental.organization_id = plan.organization_id
  AND dental.customer_id = plan.customer_id
  AND (dental.reservation_id IS NULL OR dental.encounter_id IS NULL);

-- ── Klinik işlemler ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.clinical_procedures (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_id              UUID        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    encounter_id             UUID        REFERENCES public.patient_encounters(id) ON DELETE CASCADE,
    reservation_id           UUID        REFERENCES public.reservations(id) ON DELETE SET NULL,
    treatment_plan_id        UUID        REFERENCES public.treatment_plans(id) ON DELETE SET NULL,
    source_dental_record_id  UUID        UNIQUE REFERENCES public.dental_records(id) ON DELETE SET NULL,
    category                 TEXT        NOT NULL
        CHECK (category IN ('finding', 'existing', 'treatment')),
    status                   TEXT        NOT NULL
        CHECK (status IN ('recorded', 'planned', 'in_progress', 'completed', 'cancelled')),
    procedure_code           TEXT,
    title                    TEXT        NOT NULL CHECK (length(btrim(title)) > 0),
    tooth_number             SMALLINT CHECK (
        tooth_number IS NULL OR tooth_number BETWEEN 11 AND 18
        OR tooth_number BETWEEN 21 AND 28
        OR tooth_number BETWEEN 31 AND 38
        OR tooth_number BETWEEN 41 AND 48
    ),
    surfaces                 TEXT[]      NOT NULL DEFAULT '{}',
    clinical_note            TEXT,
    performed_by_staff_id    UUID        REFERENCES public.staff(id) ON DELETE SET NULL,
    performed_at             TIMESTAMPTZ,
    created_by               UUID        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by               UUID        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata                 JSONB       NOT NULL DEFAULT '{}'::JSONB
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT clinical_procedures_surfaces_check
        CHECK (surfaces <@ ARRAY['M','O','D','B','L']::TEXT[]),
    CONSTRAINT clinical_procedures_category_status_check CHECK (
        (category IN ('finding', 'existing') AND status IN ('recorded', 'cancelled'))
        OR (category = 'treatment' AND status IN ('planned', 'in_progress', 'completed', 'cancelled'))
    ),
    CONSTRAINT clinical_procedures_anchor_check CHECK (
        encounter_id IS NOT NULL
        OR reservation_id IS NOT NULL
        OR treatment_plan_id IS NOT NULL
        OR source_dental_record_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_clinical_procedures_customer
    ON public.clinical_procedures(organization_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_procedures_encounter
    ON public.clinical_procedures(encounter_id, created_at) WHERE encounter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clinical_procedures_plan
    ON public.clinical_procedures(treatment_plan_id, created_at) WHERE treatment_plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clinical_procedures_reservation
    ON public.clinical_procedures(reservation_id, created_at) WHERE reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clinical_procedures_tooth
    ON public.clinical_procedures(customer_id, tooth_number, created_at DESC)
    WHERE tooth_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clinical_procedures_open
    ON public.clinical_procedures(organization_id, status, created_at DESC)
    WHERE status IN ('planned', 'in_progress');

CREATE TABLE IF NOT EXISTS public.clinical_procedure_events (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    procedure_id         UUID        NOT NULL REFERENCES public.clinical_procedures(id) ON DELETE CASCADE,
    customer_id          UUID        NOT NULL,
    encounter_id         UUID,
    event_type           TEXT        NOT NULL CHECK (event_type IN ('created', 'updated')),
    previous_status      TEXT,
    status               TEXT        NOT NULL,
    actor_user_id        UUID,
    actor_staff_id       UUID,
    actor_staff_name     TEXT,
    event_data           JSONB       NOT NULL CHECK (jsonb_typeof(event_data) = 'object'),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinical_procedure_events_procedure
    ON public.clinical_procedure_events(procedure_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_procedure_events_customer
    ON public.clinical_procedure_events(organization_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_procedure_events_encounter
    ON public.clinical_procedure_events(encounter_id, created_at DESC)
    WHERE encounter_id IS NOT NULL;

ALTER TABLE public.clinical_procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_procedure_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinical_procedures_select" ON public.clinical_procedures;
CREATE POLICY "clinical_procedures_select" ON public.clinical_procedures
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public.auth_user_org_ids()));

DROP POLICY IF EXISTS "clinical_procedures_insert" ON public.clinical_procedures;
CREATE POLICY "clinical_procedures_insert" ON public.clinical_procedures
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT public.auth_user_org_ids()));

DROP POLICY IF EXISTS "clinical_procedures_update" ON public.clinical_procedures;
CREATE POLICY "clinical_procedures_update" ON public.clinical_procedures
    FOR UPDATE TO authenticated
    USING (organization_id IN (SELECT public.auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT public.auth_user_org_ids()));

DROP POLICY IF EXISTS "clinical_procedure_events_select" ON public.clinical_procedure_events;
CREATE POLICY "clinical_procedure_events_select" ON public.clinical_procedure_events
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public.auth_user_org_ids()));

CREATE OR REPLACE FUNCTION public.prepare_clinical_procedure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    encounter_org UUID;
    encounter_customer UUID;
    encounter_reservation UUID;
    encounter_staff UUID;
    reservation_org UUID;
    reservation_customer UUID;
    reservation_staff UUID;
    plan_org UUID;
    plan_customer UUID;
    dental_org UUID;
    dental_customer UUID;
    resolved_encounter_id UUID;
    reservation_was_deleted BOOLEAN := FALSE;
    performed_staff_was_deleted BOOLEAN := FALSE;
BEGIN
    IF TG_OP = 'UPDATE'
       AND pg_catalog.pg_trigger_depth() > 1
       AND NOT EXISTS (
           SELECT 1 FROM public.organizations AS deleted_organization
           WHERE deleted_organization.id = OLD.organization_id
       ) THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        reservation_was_deleted := OLD.reservation_id IS NOT NULL
            AND NEW.reservation_id IS NULL
            AND pg_catalog.pg_trigger_depth() > 1
            AND NOT EXISTS (
                SELECT 1 FROM public.reservations AS deleted_reservation
                WHERE deleted_reservation.id = OLD.reservation_id
            );
        performed_staff_was_deleted := OLD.performed_by_staff_id IS NOT NULL
            AND NEW.performed_by_staff_id IS NULL
            AND pg_catalog.pg_trigger_depth() > 1
            AND NOT EXISTS (
                SELECT 1 FROM public.staff AS deleted_staff
                WHERE deleted_staff.id = OLD.performed_by_staff_id
            );
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.organization_id IS DISTINCT FROM NEW.organization_id
           OR OLD.customer_id IS DISTINCT FROM NEW.customer_id
           OR OLD.created_at IS DISTINCT FROM NEW.created_at
           OR (
               OLD.source_dental_record_id IS DISTINCT FROM NEW.source_dental_record_id
               AND NOT (
                   OLD.source_dental_record_id IS NOT NULL
                   AND NEW.source_dental_record_id IS NULL
                   AND pg_catalog.pg_trigger_depth() > 1
                   AND NOT EXISTS (
                       SELECT 1 FROM public.organizations AS deleted_organization
                       WHERE deleted_organization.id = OLD.organization_id
                   )
               )
           ) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'clinical_procedure_identity_is_immutable';
        END IF;
        IF OLD.created_by IS DISTINCT FROM NEW.created_by
           AND NOT (
               OLD.created_by IS NOT NULL
               AND NEW.created_by IS NULL
               AND pg_catalog.pg_trigger_depth() > 1
               AND NOT EXISTS (
                   SELECT 1 FROM auth.users AS deleted_user
                   WHERE deleted_user.id = OLD.created_by
               )
           ) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'clinical_procedure_created_by_is_immutable';
        END IF;
        NEW.updated_at := now();
        IF auth.uid() IS NOT NULL THEN NEW.updated_by := auth.uid(); END IF;
    ELSE
        IF auth.uid() IS NOT NULL THEN
            NEW.created_by := auth.uid();
            NEW.updated_by := auth.uid();
        END IF;
    END IF;

    PERFORM 1
    FROM public.customers AS customer
    WHERE customer.id = NEW.customer_id
      AND customer.organization_id = NEW.organization_id
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'clinical_procedure_customer_scope_mismatch';
    END IF;

    IF NEW.encounter_id IS NOT NULL THEN
        SELECT encounter.organization_id, encounter.customer_id,
               encounter.reservation_id, encounter.attending_staff_id
          INTO encounter_org, encounter_customer, encounter_reservation, encounter_staff
          FROM public.patient_encounters AS encounter
         WHERE encounter.id = NEW.encounter_id
         FOR SHARE;
        IF NOT FOUND
           OR encounter_org IS DISTINCT FROM NEW.organization_id
           OR encounter_customer IS DISTINCT FROM NEW.customer_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'clinical_procedure_encounter_scope_mismatch';
        END IF;
        IF NEW.reservation_id IS NULL AND NOT reservation_was_deleted THEN
            NEW.reservation_id := encounter_reservation;
        END IF;
        IF NEW.performed_by_staff_id IS NULL AND NOT performed_staff_was_deleted THEN
            NEW.performed_by_staff_id := encounter_staff;
        END IF;
    ELSIF NEW.reservation_id IS NOT NULL THEN
        SELECT encounter.id, encounter.attending_staff_id
          INTO resolved_encounter_id, encounter_staff
          FROM public.patient_encounters AS encounter
         WHERE encounter.organization_id = NEW.organization_id
           AND encounter.customer_id = NEW.customer_id
           AND encounter.reservation_id = NEW.reservation_id;
        NEW.encounter_id := resolved_encounter_id;
        IF NEW.performed_by_staff_id IS NULL AND NOT performed_staff_was_deleted THEN
            NEW.performed_by_staff_id := encounter_staff;
        END IF;
    END IF;

    IF NEW.reservation_id IS NOT NULL THEN
        SELECT reservation.organization_id, reservation.customer_id, reservation.staff_id
          INTO reservation_org, reservation_customer, reservation_staff
          FROM public.reservations AS reservation
         WHERE reservation.id = NEW.reservation_id
         FOR SHARE;
        IF NOT FOUND
           OR reservation_org IS DISTINCT FROM NEW.organization_id
           OR reservation_customer IS DISTINCT FROM NEW.customer_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'clinical_procedure_reservation_scope_mismatch';
        END IF;
        IF encounter_reservation IS NOT NULL
           AND encounter_reservation IS DISTINCT FROM NEW.reservation_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'clinical_procedure_encounter_reservation_mismatch';
        END IF;
        IF NEW.performed_by_staff_id IS NOT NULL
           AND reservation_staff IS NOT NULL
           AND NEW.performed_by_staff_id IS DISTINCT FROM reservation_staff THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'clinical_procedure_staff_reservation_mismatch';
        END IF;
    END IF;

    IF NEW.treatment_plan_id IS NOT NULL THEN
        SELECT plan.organization_id, plan.customer_id
          INTO plan_org, plan_customer
          FROM public.treatment_plans AS plan
         WHERE plan.id = NEW.treatment_plan_id
         FOR SHARE;
        IF NOT FOUND
           OR plan_org IS DISTINCT FROM NEW.organization_id
           OR plan_customer IS DISTINCT FROM NEW.customer_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'clinical_procedure_plan_scope_mismatch';
        END IF;
    END IF;

    IF NEW.source_dental_record_id IS NOT NULL THEN
        SELECT dental.organization_id, dental.customer_id
          INTO dental_org, dental_customer
          FROM public.dental_records AS dental
         WHERE dental.id = NEW.source_dental_record_id
         FOR SHARE;
        IF NOT FOUND
           OR dental_org IS DISTINCT FROM NEW.organization_id
           OR dental_customer IS DISTINCT FROM NEW.customer_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'clinical_procedure_dental_scope_mismatch';
        END IF;
    END IF;

    IF NEW.performed_by_staff_id IS NOT NULL THEN
        PERFORM 1
        FROM public.staff AS doctor
        WHERE doctor.id = NEW.performed_by_staff_id
          AND doctor.organization_id = NEW.organization_id
          AND doctor.role = 'doctor'
        FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'clinical_procedure_staff_scope_or_role_mismatch';
        END IF;
    END IF;

    IF NEW.status = 'completed' AND NEW.performed_at IS NULL THEN
        NEW.performed_at := now();
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_clinical_procedure_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    actor_name TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.organizations AS organization
        WHERE organization.id = NEW.organization_id
    ) THEN
        RETURN NULL;
    END IF;

    IF NEW.performed_by_staff_id IS NOT NULL THEN
        SELECT staff.name INTO actor_name
        FROM public.staff AS staff
        WHERE staff.id = NEW.performed_by_staff_id;
    END IF;

    INSERT INTO public.clinical_procedure_events (
        organization_id, procedure_id, customer_id, encounter_id,
        event_type, previous_status, status, actor_user_id, actor_staff_id,
        actor_staff_name, event_data
    ) VALUES (
        NEW.organization_id,
        NEW.id,
        NEW.customer_id,
        NEW.encounter_id,
        CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
        NEW.status,
        auth.uid(),
        NEW.performed_by_staff_id,
        actor_name,
        CASE
            WHEN TG_OP = 'INSERT' THEN pg_catalog.jsonb_build_object('new', to_jsonb(NEW))
            ELSE pg_catalog.jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
        END
    );
    RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_062_prepare_clinical_procedure ON public.clinical_procedures;
CREATE TRIGGER trg_062_prepare_clinical_procedure
    BEFORE INSERT OR UPDATE ON public.clinical_procedures
    FOR EACH ROW EXECUTE FUNCTION public.prepare_clinical_procedure();

DROP TRIGGER IF EXISTS trg_062_audit_clinical_procedure ON public.clinical_procedures;
CREATE TRIGGER trg_062_audit_clinical_procedure
    AFTER INSERT OR UPDATE ON public.clinical_procedures
    FOR EACH ROW EXECUTE FUNCTION public.audit_clinical_procedure_change();

DROP TRIGGER IF EXISTS trg_062_prevent_clinical_procedure_delete ON public.clinical_procedures;
CREATE TRIGGER trg_062_prevent_clinical_procedure_delete
    BEFORE DELETE ON public.clinical_procedures
    FOR EACH ROW EXECUTE FUNCTION public.prevent_clinical_history_delete();

DROP TRIGGER IF EXISTS trg_062_clinical_procedure_events_append_only ON public.clinical_procedure_events;
CREATE TRIGGER trg_062_clinical_procedure_events_append_only
    BEFORE UPDATE OR DELETE ON public.clinical_procedure_events
    FOR EACH ROW EXECUTE FUNCTION public.prevent_clinical_event_mutation();

-- 054 legacy şeması diş numarasını yalnız 11..48 aralığıyla, yüzeyleri ise
-- serbest TEXT[] olarak tutuyordu. Klinik projeksiyon daha sıkı olduğu için hem
-- migration backfill'i hem yeni dental insert trigger'ı aynı normalizasyonu
-- kullanır; orijinal değerler procedure metadata'sında ayrıca saklanır.
CREATE OR REPLACE FUNCTION public.normalize_clinical_tooth_number(p_tooth_number SMALLINT)
RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
AS $function$
    SELECT CASE
        WHEN p_tooth_number BETWEEN 11 AND 18
          OR p_tooth_number BETWEEN 21 AND 28
          OR p_tooth_number BETWEEN 31 AND 38
          OR p_tooth_number BETWEEN 41 AND 48
        THEN p_tooth_number
        ELSE NULL
    END
$function$;

CREATE OR REPLACE FUNCTION public.normalize_clinical_tooth_surfaces(p_surfaces TEXT[])
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
AS $function$
    SELECT ARRAY(
        SELECT input.surface
        FROM pg_catalog.unnest(COALESCE(p_surfaces, '{}'::TEXT[]))
             WITH ORDINALITY AS input(surface, position)
        WHERE input.surface = ANY (ARRAY['M','O','D','B','L']::TEXT[])
        ORDER BY input.position
    )
$function$;

-- DentalChart halen append-only dental_records defterine yazar. Her yeni logu
-- aynı transaction içinde clinical_procedures omurgasına idempotent yansıt;
-- source_dental_record_id UNIQUE olduğu için retry/çift trigger kopya üretmez.
CREATE OR REPLACE FUNCTION public.project_dental_record_to_clinical_procedure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
    INSERT INTO public.clinical_procedures (
        organization_id, customer_id, encounter_id, reservation_id,
        treatment_plan_id, source_dental_record_id, category, status,
        procedure_code, title, tooth_number, surfaces, clinical_note,
        performed_by_staff_id, performed_at, created_by, updated_by,
        created_at, updated_at, metadata
    ) VALUES (
        NEW.organization_id,
        NEW.customer_id,
        NEW.encounter_id,
        NEW.reservation_id,
        NEW.treatment_plan_id,
        NEW.id,
        CASE
            WHEN NEW.record_type = 'planned' THEN 'treatment'
            WHEN NEW.status = 'curuk' THEN 'finding'
            ELSE 'existing'
        END,
        CASE WHEN NEW.record_type = 'planned' THEN 'planned' ELSE 'recorded' END,
        'dental:' || COALESCE(NULLIF(btrim(NEW.status), ''), 'unknown'),
        COALESCE(
            NULLIF(btrim(CASE NEW.status
                WHEN 'saglam' THEN 'Sağlam diş'
                WHEN 'curuk' THEN 'Çürük'
                WHEN 'dolgu' THEN 'Dolgu'
                WHEN 'kanal' THEN 'Kanal tedavisi'
                WHEN 'kron' THEN 'Kron'
                WHEN 'implant' THEN 'İmplant'
                WHEN 'cekildi' THEN 'Çekilmiş diş'
                ELSE NEW.status
            END), ''),
            'Dental kayıt'
        ),
        public.normalize_clinical_tooth_number(NEW.tooth_number),
        public.normalize_clinical_tooth_surfaces(NEW.surfaces),
        NEW.note,
        NEW.staff_id,
        CASE WHEN NEW.record_type = 'existing' THEN NEW.created_at ELSE NULL END,
        NEW.created_by,
        NEW.created_by,
        NEW.created_at,
        NEW.created_at,
        pg_catalog.jsonb_build_object(
            'projected', TRUE,
            'source', 'dental_records',
            'dental_record_type', NEW.record_type,
            'source_tooth_number', NEW.tooth_number,
            'source_surfaces', to_jsonb(COALESCE(NEW.surfaces, '{}'::TEXT[]))
        )
    )
    ON CONFLICT (source_dental_record_id) DO NOTHING;

    RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_062_project_dental_record ON public.dental_records;
CREATE TRIGGER trg_062_project_dental_record
    AFTER INSERT ON public.dental_records
    FOR EACH ROW EXECUTE FUNCTION public.project_dental_record_to_clinical_procedure();

-- 054-056 dental loglarını klinik işlem projeksiyonuna dönüştür. Legacy
-- belirsizliğini gizlemeyiz: çürük bir bulgu, diğer existing durumlar mevcut
-- tedavi/durum, planned kayıtlar ise planlı tedavi olarak sınıflandırılır.
INSERT INTO public.clinical_procedures (
    organization_id, customer_id, encounter_id, reservation_id,
    treatment_plan_id, source_dental_record_id, category, status,
    procedure_code, title, tooth_number, surfaces, clinical_note,
    performed_by_staff_id, performed_at, created_by, updated_by,
    created_at, updated_at, metadata
)
SELECT
    dental.organization_id,
    dental.customer_id,
    dental.encounter_id,
    dental.reservation_id,
    dental.treatment_plan_id,
    dental.id,
    CASE
        WHEN dental.record_type = 'planned' THEN 'treatment'
        WHEN dental.status = 'curuk' THEN 'finding'
        ELSE 'existing'
    END,
    CASE WHEN dental.record_type = 'planned' THEN 'planned' ELSE 'recorded' END,
    'dental:' || COALESCE(NULLIF(btrim(dental.status), ''), 'unknown'),
    COALESCE(
        NULLIF(btrim(CASE dental.status
            WHEN 'saglam' THEN 'Sağlam diş'
            WHEN 'curuk' THEN 'Çürük'
            WHEN 'dolgu' THEN 'Dolgu'
            WHEN 'kanal' THEN 'Kanal tedavisi'
            WHEN 'kron' THEN 'Kron'
            WHEN 'implant' THEN 'İmplant'
            WHEN 'cekildi' THEN 'Çekilmiş diş'
            ELSE dental.status
        END), ''),
        'Dental kayıt'
    ),
    public.normalize_clinical_tooth_number(dental.tooth_number),
    public.normalize_clinical_tooth_surfaces(dental.surfaces),
    dental.note,
    CASE
        WHEN source_encounter.attending_staff_id IS NOT NULL
            THEN source_encounter.attending_staff_id
        WHEN reservation_doctor.id IS NOT NULL
            THEN source_reservation.staff_id
        WHEN dental.reservation_id IS NULL AND dental_doctor.id IS NOT NULL
            THEN dental.staff_id
        ELSE NULL
    END,
    CASE WHEN dental.record_type = 'existing' THEN dental.created_at ELSE NULL END,
    dental.created_by,
    dental.created_by,
    dental.created_at,
    dental.created_at,
    pg_catalog.jsonb_build_object(
        'legacy_backfill', TRUE,
        'source', 'dental_records',
        'dental_record_type', dental.record_type,
        'source_tooth_number', dental.tooth_number,
        'source_surfaces', to_jsonb(COALESCE(dental.surfaces, '{}'::TEXT[]))
    )
FROM public.dental_records AS dental
LEFT JOIN public.patient_encounters AS source_encounter
  ON source_encounter.id = dental.encounter_id
 AND source_encounter.organization_id = dental.organization_id
 AND source_encounter.customer_id = dental.customer_id
LEFT JOIN public.reservations AS source_reservation
  ON source_reservation.id = dental.reservation_id
 AND source_reservation.organization_id = dental.organization_id
 AND source_reservation.customer_id = dental.customer_id
LEFT JOIN public.staff AS reservation_doctor
  ON reservation_doctor.id = source_reservation.staff_id
 AND reservation_doctor.organization_id = dental.organization_id
 AND reservation_doctor.role = 'doctor'
LEFT JOIN public.staff AS dental_doctor
  ON dental_doctor.id = dental.staff_id
 AND dental_doctor.organization_id = dental.organization_id
 AND dental_doctor.role = 'doctor'
ON CONFLICT (source_dental_record_id) DO NOTHING;

REVOKE ALL ON FUNCTION public.prepare_patient_encounter() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_patient_encounter_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_clinical_history_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_clinical_event_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_reservation_encounter_staff_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_treatment_plan_encounter_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_dental_encounter_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_clinical_procedure() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_clinical_procedure_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_clinical_tooth_number(SMALLINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_clinical_tooth_surfaces(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_dental_record_to_clinical_procedure() FROM PUBLIC;

COMMIT;

-- PostgREST yeni tabloları, kolonları ve RPC'yi aynı deployment sonunda görsün.
NOTIFY pgrst, 'reload schema';
