-- ============================================================
-- TimeFlow Migration 055: Tedavi planı + taksit takibi
-- ============================================================
-- Diş hekimi sektörü: çok seanslı tedavilerin (örn. kanal tedavisi = 3 seans)
-- toplam ücreti tek planda tutulur. Taksitler AYRI bir finansal defter
-- OLMADAN, mevcut `payments` tablosuna treatment_plan_id ile bağlanır — kasa/
-- gelir raporları tek kaynaktan (payments) beslenmeye devam eder.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.treatment_plans (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id     UUID          NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    title           TEXT          NOT NULL,
    total_amount    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    status          TEXT          NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
    staff_id        UUID          REFERENCES staff(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treatment_plans_customer ON public.treatment_plans(customer_id);
CREATE INDEX IF NOT EXISTS idx_treatment_plans_org      ON public.treatment_plans(organization_id);

ALTER TABLE public.treatment_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "treatment_plans_org_access" ON public.treatment_plans;
CREATE POLICY "treatment_plans_org_access" ON public.treatment_plans
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

-- Ödemeler bir tedavi planına bağlanabilsin (taksit takibi)
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS treatment_plan_id UUID REFERENCES treatment_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_treatment_plan ON public.payments(treatment_plan_id);

NOTIFY pgrst, 'reload schema';
