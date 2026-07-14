-- ============================================================
-- TimeFlow Migration 054: Diş şeması (dental chart)
-- ============================================================
-- Diş hekimi sektörüne özel: hasta başına 32 diş (FDI numaralandırma:
-- 11-18 sağ üst, 21-28 sol üst, 31-38 sol alt, 41-48 sağ alt). Her diş
-- için append-only log tutulur — bir dişin güncel durumu, o diş için en
-- son eklenen kayıttır; geçmiş (tedavi ilerlemesi) hiç silinmez.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dental_records (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id     UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    tooth_number    SMALLINT    NOT NULL CHECK (tooth_number BETWEEN 11 AND 48),
    status          TEXT        NOT NULL,
    note            TEXT,
    staff_id        UUID        REFERENCES staff(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dental_records_customer ON public.dental_records(customer_id, tooth_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dental_records_org ON public.dental_records(organization_id);

ALTER TABLE public.dental_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dental_records_org_access" ON public.dental_records;
CREATE POLICY "dental_records_org_access" ON public.dental_records
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

NOTIFY pgrst, 'reload schema';
