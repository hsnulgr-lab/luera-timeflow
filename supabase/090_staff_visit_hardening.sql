-- ============================================================
-- TimeFlow Migration 090: Personel ziyaret bütünlüğü
-- ============================================================
-- 1. Aynı randevu/ürün sarfının kötü bağlantıda iki kez yazılmasını engeller.
-- 2. staff-api'nin ziyaret denetim olaylarını mevcut append-only loga ekler.
--
-- Stok defteri muhasebe kaydıdır. Eski tekrarları otomatik silmek veya
-- birleştirmek veri yorumu olur; migration bunun yerine açıkça durur ve insan
-- kararı ister. Düzeltmede delta toplamı mutlaka korunmalıdır.
-- ============================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.stock_movements
        WHERE type = 'usage'
          AND reservation_id IS NOT NULL
        GROUP BY reservation_id, product_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'stock_usage_duplicate_needs_human_decision'
            USING HINT = 'Aynı reservation_id/product_id için birden çok usage satırı var. Delta toplamını koruyarak elle uzlaştırın ve migrationı yeniden çalıştırın.';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_usage_reservation_product
    ON public.stock_movements (reservation_id, product_id)
    WHERE type = 'usage';

-- 082 yalnız giriş olaylarıyla başlamıştı. staff-api ziyaret olaylarını da bu
-- tabloya yazıyor; kısıt genişletilmezse bu insertler sessizce başarısız olur.
ALTER TABLE public.staff_auth_log
    DROP CONSTRAINT IF EXISTS staff_auth_log_event_check;

ALTER TABLE public.staff_auth_log
    ADD CONSTRAINT staff_auth_log_event_check
    CHECK (event IN (
        'login',
        'failed_pin',
        'locked',
        'revoked',
        'visit.forbidden',
        'visit.start',
        'visit.finish'
    ));

NOTIFY pgrst, 'reload schema';
