-- ============================================================
-- TimeFlow Migration 024: Restoran Masaları
-- ============================================================
-- Masa modülü (restoran/kafe) — randevu sisteminden tamamen ayrı.
--   tables : işletmenin fiziksel masaları (kapasite ile)
-- RLS: organization_id IN (auth_user_org_ids()) — diğer tablolarla aynı desen.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tables (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    capacity        INTEGER     NOT NULL DEFAULT 2 CHECK (capacity > 0),
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tables_org ON public.tables(organization_id, is_active);

ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tables_org_access" ON public.tables;
CREATE POLICY "tables_org_access" ON public.tables
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

NOTIFY pgrst, 'reload schema';
