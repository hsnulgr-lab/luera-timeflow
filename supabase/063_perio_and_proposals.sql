-- ============================================================
-- TimeFlow Migration 063: Periodontal cep haritası + teklif durumu
-- ============================================================
-- İki bağımsız diş kliniği eklentisi:
--   1) treatment_plans.status → 'proposed' değeri: hastaya sunulmuş ama
--      henüz onaylanmamış teklif. Onaylanınca 'active' olur; 'proposed'
--      planlar bakiyeye/tahsilata dahil edilmez (uygulama katmanı süzer).
--   2) periodontal_charts: diş başına 6 nokta cep derinliği + BOP + sallanma.
--      Diş başına en güncel ölçüm tutulur (upsert; benzersiz kısıt).
-- ============================================================

-- 1) Teklif durumu ------------------------------------------------------------
ALTER TABLE public.treatment_plans DROP CONSTRAINT IF EXISTS treatment_plans_status_check;
ALTER TABLE public.treatment_plans
    ADD CONSTRAINT treatment_plans_status_check
    CHECK (status IN ('proposed','active','completed','cancelled'));

-- 2) Periodontal cep haritası -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.periodontal_charts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id     UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    tooth_number    SMALLINT    NOT NULL CHECK (tooth_number BETWEEN 11 AND 48),
    -- 6 nokta sırası: DB, B, MB, DL, L, ML (bukkal 3 + lingual 3)
    pocket_depth    SMALLINT[]  NOT NULL DEFAULT '{}',   -- mm, NULL = ölçülmedi
    recession       SMALLINT[]  NOT NULL DEFAULT '{}',   -- mm
    bleeding        BOOLEAN[]   NOT NULL DEFAULT '{}',    -- sondalamada kanama (BOP)
    mobility        SMALLINT    CHECK (mobility IS NULL OR mobility BETWEEN 0 AND 3),
    note            TEXT,
    measured_by     UUID        REFERENCES staff(id) ON DELETE SET NULL,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, customer_id, tooth_number)
);

CREATE INDEX IF NOT EXISTS idx_perio_customer ON public.periodontal_charts(customer_id, tooth_number);
CREATE INDEX IF NOT EXISTS idx_perio_org ON public.periodontal_charts(organization_id);

ALTER TABLE public.periodontal_charts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "periodontal_charts_org_access" ON public.periodontal_charts;
CREATE POLICY "periodontal_charts_org_access" ON public.periodontal_charts
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

-- updated_at otomatik tazeleme
CREATE OR REPLACE FUNCTION public.touch_periodontal_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_perio_touch ON public.periodontal_charts;
CREATE TRIGGER trg_perio_touch
    BEFORE UPDATE ON public.periodontal_charts
    FOR EACH ROW EXECUTE FUNCTION public.touch_periodontal_updated_at();

NOTIFY pgrst, 'reload schema';
