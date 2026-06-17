-- ============================================================
-- TimeFlow Migration 017: Müşteri Paket Takibi
-- ============================================================
-- Müşterinin satın aldığı seans paketi (örn. "10 Seans Lazer").
-- Randevu 'completed' olduğunda en eski aktif paketten otomatik
-- 1 seans düşülür (Planla yapışkanlık özelliği).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.customer_packages (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id     UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    total_sessions  INT         NOT NULL CHECK (total_sessions > 0),
    used_sessions   INT         NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_packages_customer ON public.customer_packages(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_packages_org      ON public.customer_packages(organization_id);

-- RLS — organizasyon bazlı
ALTER TABLE public.customer_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_packages_org_access" ON public.customer_packages;
CREATE POLICY "customer_packages_org_access" ON public.customer_packages
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

-- ── Otomatik düşüm: randevu 'completed' olunca ──────────────
CREATE OR REPLACE FUNCTION public.decrement_package_on_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'completed'
       AND OLD.status IS DISTINCT FROM 'completed'
       AND NEW.customer_id IS NOT NULL THEN
        UPDATE public.customer_packages
           SET used_sessions = used_sessions + 1, updated_at = now()
         WHERE id = (
             SELECT id FROM public.customer_packages
              WHERE customer_id = NEW.customer_id
                AND used_sessions < total_sessions
              ORDER BY created_at
              LIMIT 1
         );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decrement_package ON public.reservations;
CREATE TRIGGER trg_decrement_package
    AFTER UPDATE OF status ON public.reservations
    FOR EACH ROW
    EXECUTE FUNCTION public.decrement_package_on_complete();

NOTIFY pgrst, 'reload schema';
