-- ============================================================
-- TimeFlow Migration 075: stock_movements şemasını uzlaştır
-- ============================================================
-- 074'ün erken bir sürümü uygulanmış olabilir; o sürümde defter farklı
-- kolon adları taşıyordu ve PostgREST "Could not find the 'type' column of
-- 'stock_movements'" hatası veriyordu.
--
-- Bu script tabloyu 074'ün nihai şekline getirir:
--   • Tablo yoksa oluşturur.
--   • Varsa eksik kolonları ekler, eski adları yeni adlara taşır.
--   • VERİ SİLMEZ. Uyuşmayan bir eski kolon bulunur ve içinde satır varsa
--     durur ve uyarır — elle karar vermeniz gerekir.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stock_movements (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    product_id      UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE
    row_count BIGINT;
    has_col   BOOLEAN;
BEGIN
    EXECUTE 'SELECT count(*) FROM public.stock_movements' INTO row_count;

    -- ── type: eski sürümde movement_type / kind adıyla olabilir ──
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'type')
      INTO has_col;
    IF NOT has_col THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'movement_type') THEN
            ALTER TABLE public.stock_movements RENAME COLUMN movement_type TO type;
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'kind') THEN
            ALTER TABLE public.stock_movements RENAME COLUMN kind TO type;
        ELSE
            ALTER TABLE public.stock_movements ADD COLUMN type TEXT NOT NULL DEFAULT 'in';
        END IF;
    END IF;

    -- ── delta: eski sürümde quantity / qty / amount olabilir ──
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'delta')
      INTO has_col;
    IF NOT has_col THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'quantity') THEN
            ALTER TABLE public.stock_movements RENAME COLUMN quantity TO delta;
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'qty') THEN
            ALTER TABLE public.stock_movements RENAME COLUMN qty TO delta;
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'amount') THEN
            ALTER TABLE public.stock_movements RENAME COLUMN amount TO delta;
        ELSE
            ALTER TABLE public.stock_movements ADD COLUMN delta NUMERIC(12,2) NOT NULL DEFAULT 0;
        END IF;
    END IF;

    IF row_count > 0 THEN
        RAISE NOTICE 'stock_movements içinde % satır var — kolon adları taşındı, değerlerin işareti (giriş +, çıkış −) elle doğrulanmalı.', row_count;
    END IF;
END $$;

-- ── Kalan kolonlar ──
ALTER TABLE public.stock_movements
    ADD COLUMN IF NOT EXISTS note           TEXT,
    ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS payment_id     UUID REFERENCES payments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.stock_movements ALTER COLUMN type  DROP DEFAULT;
ALTER TABLE public.stock_movements ALTER COLUMN delta DROP DEFAULT;

-- Tip kısıtı: eski sürümün kısıtı farklı değerlere izin veriyor olabilir.
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;
ALTER TABLE public.stock_movements
    ADD CONSTRAINT stock_movements_type_check
    CHECK (type IN ('in', 'sale', 'usage', 'waste', 'count'));

CREATE INDEX IF NOT EXISTS idx_stock_moves_org     ON public.stock_movements(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_moves_product ON public.stock_movements(product_id, created_at DESC);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_movements_org_access" ON public.stock_movements;
CREATE POLICY "stock_movements_org_access" ON public.stock_movements
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

-- ── products depo alanları (074 kısmen uygulanmış olabilir) ──
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS kind         TEXT          NOT NULL DEFAULT 'retail',
    ADD COLUMN IF NOT EXISTS unit         TEXT          NOT NULL DEFAULT 'adet',
    ADD COLUMN IF NOT EXISTS cost         NUMERIC(10,4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS threshold    NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS par_level    NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tracks_stock BOOLEAN       NOT NULL DEFAULT true;

-- Kolon daha önce farklı bir varsayılanla (false) eklenmiş olabilir: bütün
-- ürünler "Takip kapalı" görünüyordu. Özellik hiç kullanılmadığı için burada
-- bilinçli bir tercih yok — varsayılan düzeltilir ve mevcut satırlar açılır.
ALTER TABLE public.products ALTER COLUMN tracks_stock SET DEFAULT true;
UPDATE public.products SET tracks_stock = true WHERE tracks_stock IS DISTINCT FROM true;

ALTER TABLE public.products ALTER COLUMN kind SET DEFAULT 'retail';
ALTER TABLE public.products ALTER COLUMN unit SET DEFAULT 'adet';
UPDATE public.products SET kind = 'retail' WHERE kind IS NULL OR kind = '';
UPDATE public.products SET unit = 'adet' WHERE unit IS NULL OR unit = '';

NOTIFY pgrst, 'reload schema';
