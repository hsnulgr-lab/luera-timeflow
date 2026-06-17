-- ============================================================
-- TimeFlow Migration 020: Bekleme Listesi (Boşluk Doldurma)
-- ============================================================
-- Dolu olduğu için randevu alamayan müşteriler buraya eklenir.
-- Bir randevu iptal olunca eşleşen bekleyenlere otomatik
-- "slot açıldı" WhatsApp mesajı + booking linki gider.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.waitlist (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_name   TEXT        NOT NULL,
    customer_phone  TEXT        NOT NULL,
    service_id      UUID        REFERENCES services(id) ON DELETE SET NULL,
    preferred_date  DATE,
    notes           TEXT,
    status          TEXT        NOT NULL DEFAULT 'waiting'
                      CHECK (status IN ('waiting','notified','fulfilled','cancelled')),
    notified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_org    ON public.waitlist(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_waitlist_date   ON public.waitlist(organization_id, preferred_date);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "waitlist_org_access" ON public.waitlist;
CREATE POLICY "waitlist_org_access" ON public.waitlist
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

NOTIFY pgrst, 'reload schema';
