-- ============================================================
-- TimeFlow Migration 074: Stok (depo) takibi
-- ============================================================
-- Salon deposu iki tür mal tutar:
--   • satılık (retail)     : müşteriye satılan ürün — şampuan, maşa…
--   • sarf   (consumable)  : işlemde tüketilen malzeme — boya, oksidan…
--
-- TEK KAYNAK: miktar hiçbir yerde saklanmaz. Ürünün stoğu, o ürüne ait
-- stock_movements satırlarının delta toplamıdır. Denormalize bir "quantity"
-- kolonu bilerek YOKTUR — kasa satışı, fire ve sayım aynı defterden geçer.
-- Sayım (count) da bir hareketle yazılır: delta = sayılan − mevcut.
--
-- Bu migration idempotenttir; daha önce kısmen uygulandıysa güvenle
-- yeniden çalıştırılabilir.
-- ============================================================

-- ── Ürün kataloğuna depo alanları ───────────────────────────
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS kind         TEXT          NOT NULL DEFAULT 'retail',
    ADD COLUMN IF NOT EXISTS unit         TEXT          NOT NULL DEFAULT 'adet',
    ADD COLUMN IF NOT EXISTS cost         NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (cost >= 0),
    ADD COLUMN IF NOT EXISTS threshold    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (threshold >= 0),
    ADD COLUMN IF NOT EXISTS par_level    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (par_level >= 0),
    ADD COLUMN IF NOT EXISTS tracks_stock BOOLEAN       NOT NULL DEFAULT true;

DO $$
BEGIN
    ALTER TABLE public.products
        ADD CONSTRAINT products_kind_check CHECK (kind IN ('retail', 'consumable'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ── Stok hareketleri (tek defter) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    product_id      UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    -- in: giriş · sale: kasa satışı · usage: işlemde tüketim
    -- waste: fire · count: sayım düzeltmesi
    type            TEXT          NOT NULL CHECK (type IN ('in', 'sale', 'usage', 'waste', 'count')),
    delta           NUMERIC(12,2) NOT NULL,   -- giriş +, çıkış −
    note            TEXT,
    reservation_id  UUID          REFERENCES reservations(id) ON DELETE SET NULL,
    payment_id      UUID          REFERENCES payments(id) ON DELETE SET NULL,
    created_by      UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_moves_org     ON public.stock_movements(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_moves_product ON public.stock_movements(product_id, created_at DESC);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_movements_org_access" ON public.stock_movements;
CREATE POLICY "stock_movements_org_access" ON public.stock_movements
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

NOTIFY pgrst, 'reload schema';
