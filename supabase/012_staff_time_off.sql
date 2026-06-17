-- ============================================================
-- TimeFlow Migration 012: Personel İzin / Tatil Günleri
-- ============================================================
-- Booking müsaitlik motorunun temeli. Personelin çalışma
-- saatleri (staff.working_hours) zaten var; bu tablo belirli
-- TARİHLERDE personelin müsait olmadığını (izin/tatil) tutar.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.staff_time_off (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id        UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    date            DATE        NOT NULL,
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (staff_id, date)
);

CREATE INDEX IF NOT EXISTS idx_staff_time_off_staff ON public.staff_time_off(staff_id, date);
CREATE INDEX IF NOT EXISTS idx_staff_time_off_org   ON public.staff_time_off(organization_id, date);

-- RLS — organizasyon bazlı erişim (008_staff deseni)
ALTER TABLE public.staff_time_off ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_time_off_org_access" ON public.staff_time_off;
CREATE POLICY "staff_time_off_org_access" ON public.staff_time_off
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

NOTIFY pgrst, 'reload schema';
