-- ============================================================
-- TimeFlow Migration 031: Sırasız Bekleme (Queue / Walk-in)
-- ============================================================
-- Kuaför/berber için randevusuz canlı sıra. Müşteri gelir, sıraya yazılır,
-- pozisyon/ETA bilgisi WhatsApp ile gönderilir, hazır olunca çağrılır.
-- RLS: organization_id IN (auth_user_org_ids()) — diğer tablolarla aynı desen.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.queue_entries (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_name   TEXT        NOT NULL,
    customer_phone  TEXT,
    service         TEXT,
    staff_id        UUID        REFERENCES staff(id) ON DELETE SET NULL,
    status          TEXT        NOT NULL DEFAULT 'waiting',  -- waiting | called | served | left
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    called_at       TIMESTAMPTZ,
    notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_queue_org_status ON public.queue_entries(organization_id, status, joined_at);

ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "queue_org_access" ON public.queue_entries;
CREATE POLICY "queue_org_access" ON public.queue_entries
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

NOTIFY pgrst, 'reload schema';
