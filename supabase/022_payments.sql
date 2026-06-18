-- ============================================================
-- TimeFlow Migration 022: Kasa Modülü (Ödeme / Gelir)
-- ============================================================
-- F3.3 — İşletmenin tahsil ettiği parayı kayıt altına alır.
--   • payments : her tahsilat bir satır (randevu, ürün veya serbest).
--   • products : basit ürün kataloğu (ürün satışı için).
--   • reservations.is_paid : randevu "ödendi" hızlı bayrağı.
-- LTV artık tahmini hizmet fiyatı yerine GERÇEK tahsilattan hesaplanır.
-- "AI sadece ANLAR" prensibiyle uyumlu: para hareketi her zaman KOD/insan.
-- ============================================================

-- ── Ürün kataloğu ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT          NOT NULL,
    price           NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    is_active       BOOLEAN       NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_org ON public.products(organization_id, is_active);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_org_access" ON public.products;
CREATE POLICY "products_org_access" ON public.products
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

-- ── Tahsilatlar ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id     UUID          REFERENCES customers(id) ON DELETE SET NULL,
    reservation_id  UUID          REFERENCES reservations(id) ON DELETE SET NULL,
    product_id      UUID          REFERENCES products(id) ON DELETE SET NULL,
    type            TEXT          NOT NULL DEFAULT 'service'
                      CHECK (type IN ('service','product','other')),
    description     TEXT,
    amount          NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    method          TEXT          NOT NULL DEFAULT 'cash'
                      CHECK (method IN ('cash','card','transfer','other')),
    paid_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_org      ON public.payments(organization_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_reserv   ON public.payments(reservation_id);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_org_access" ON public.payments;
CREATE POLICY "payments_org_access" ON public.payments
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

-- ── Randevu "ödendi" bayrağı ────────────────────────────────
ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
