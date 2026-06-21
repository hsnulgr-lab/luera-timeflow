-- ============================================================
-- TimeFlow Migration 025: Masa Rezervasyonları
-- ============================================================
-- Rezervasyon kişiye değil MASAYA bağlı. Walk-in (randevusuz) desteklenir.
-- Oturma süresi tahmini olabilir (end_time NULL olabilir).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.table_reservations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    table_id        UUID        NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    customer_name   TEXT        NOT NULL DEFAULT 'Misafir',
    customer_phone  TEXT,
    party_size      INTEGER     NOT NULL DEFAULT 2 CHECK (party_size > 0),
    date            DATE        NOT NULL,
    start_time      TIME        NOT NULL,
    end_time        TIME,
    status          TEXT        NOT NULL DEFAULT 'reserved'
                      CHECK (status IN ('reserved','seated','completed','cancelled')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_table_res_org_date ON public.table_reservations(organization_id, date);
CREATE INDEX IF NOT EXISTS idx_table_res_table ON public.table_reservations(table_id, date);

ALTER TABLE public.table_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "table_res_org_access" ON public.table_reservations;
CREATE POLICY "table_res_org_access" ON public.table_reservations
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

NOTIFY pgrst, 'reload schema';
