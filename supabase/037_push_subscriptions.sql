-- ============================================================
-- TimeFlow Migration 037: Web Push abonelikleri
-- ============================================================
-- Mobil kumanda bildirimleri için cihaz push abonelikleri.
-- Cihaz org oturumunda (yönetici auth) olduğundan RLS org bazlı;
-- kime ait olduğu staff_id (personel modu) veya role='manager' ile ayrılır.
-- VAPID anahtarları app_secrets'ta (deploy'da ayrıca yazılır, git'e girmez).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    staff_id        UUID        REFERENCES staff(id) ON DELETE CASCADE,   -- personel modu cihazı; NULL = yönetici
    role            TEXT        NOT NULL DEFAULT 'staff' CHECK (role IN ('staff','manager')),
    endpoint        TEXT        NOT NULL UNIQUE,       -- push servis endpoint'i (cihaz kimliği)
    p256dh          TEXT        NOT NULL,              -- şifreleme public key'i
    auth            TEXT        NOT NULL,              -- şifreleme auth secret'ı
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_org        ON public.push_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_org_staff  ON public.push_subscriptions(organization_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_org_role   ON public.push_subscriptions(organization_id, role);

-- RLS — organizasyon bazlı (diğer tablolarla aynı desen)
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions_org_access" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_org_access" ON public.push_subscriptions
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

NOTIFY pgrst, 'reload schema';
