-- 069_package_rights_and_templates.sql
-- Paketler'i "full aktif" yapan iki tablo:
--   1) package_rights_ledger — hak hareketleri için SİLİNMEYEN (append-only) defter.
--      Düzeltme yap akışı buraya yazar: önceki değer, yeni değer, sebep, kullanıcı,
--      zaman. Geçmiş sekmesi bu kayıtları da gösterir. Denklem korunur:
--      toplam hak = kullanılan + rezerve + kullanılabilir.
--   2) package_templates — satış şablonları ("Paket tanımları"). Satış drawer'ı
--      bunlardan çalışır; şablonda seans sayısı sabittir, satışta artırılamaz.

-- ── 1) Hak defteri ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.package_rights_ledger (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan_id         UUID          NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
    customer_id     UUID          REFERENCES customers(id) ON DELETE SET NULL,
    -- hangi alan düzeltildi: 'total' (toplam hak) veya 'used' (kullanılan)
    field           TEXT          NOT NULL CHECK (field IN ('total','used')),
    kind            TEXT          NOT NULL DEFAULT 'correction'
                        CHECK (kind IN ('correction','define','use','reserve','release','cancel')),
    prev_value      INTEGER       NOT NULL,
    new_value       INTEGER       NOT NULL,
    delta           INTEGER       NOT NULL,
    reason          TEXT          NOT NULL,
    actor_id        UUID          DEFAULT auth.uid(),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    -- Tek düzeltmede en fazla 3 hak (prompt kuralı)
    CONSTRAINT rights_ledger_delta_bounded CHECK (abs(delta) BETWEEN 1 AND 3)
);
CREATE INDEX IF NOT EXISTS idx_rights_ledger_plan ON public.package_rights_ledger(plan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rights_ledger_org ON public.package_rights_ledger(organization_id);

ALTER TABLE public.package_rights_ledger ENABLE ROW LEVEL SECURITY;
-- Defter salt-eklenir: SELECT + INSERT var; UPDATE/DELETE politikası YOK (geçmiş silinmez)
CREATE POLICY "rights_ledger_select" ON public.package_rights_ledger
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public.auth_user_org_ids()));
CREATE POLICY "rights_ledger_insert" ON public.package_rights_ledger
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT public.auth_user_org_ids()));

-- ── 2) Paket şablonları ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.package_templates (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT          NOT NULL,
    session_count   INTEGER       NOT NULL DEFAULT 1 CHECK (session_count BETWEEN 1 AND 50),
    price           NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    color           TEXT,
    validity_months INTEGER       CHECK (validity_months IS NULL OR validity_months BETWEEN 1 AND 60),
    is_active       BOOLEAN       NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_package_templates_org ON public.package_templates(organization_id) WHERE is_active;

ALTER TABLE public.package_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "package_templates_select" ON public.package_templates
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public.auth_user_org_ids()));
CREATE POLICY "package_templates_insert" ON public.package_templates
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT public.auth_user_org_ids()));
CREATE POLICY "package_templates_update" ON public.package_templates
    FOR UPDATE TO authenticated
    USING (organization_id IN (SELECT public.auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT public.auth_user_org_ids()));
CREATE POLICY "package_templates_delete" ON public.package_templates
    FOR DELETE TO authenticated
    USING (organization_id IN (SELECT public.auth_user_org_ids()));

-- Realtime (çok cihaz): şablon değişince satış drawer'ı güncel kalsın
ALTER TABLE public.package_templates REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='package_templates') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.package_templates;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='package_rights_ledger') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.package_rights_ledger;
  END IF;
END $$;
