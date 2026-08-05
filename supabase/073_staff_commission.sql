-- ============================================================
-- TimeFlow Migration 073: Personel prim oranı
-- ============================================================
-- Kuaför/berber/güzellik salonlarında personel cironun bir yüzdesini
-- prim olarak alır (%30–50 tipiktir) ve bu her ay elle hesaplanıyordu.
-- Oran personelin kendi kaydında durur; prim tutarı türetilir —
-- payments.staff_id (bkz. 027) üzerinden okunur, ayrıca yazılmaz.
--
-- 0 = prim yok (varsayılan). Mevcut kayıtlar davranış değiştirmez.
-- ============================================================

ALTER TABLE public.staff
    ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
    ALTER TABLE public.staff
        ADD CONSTRAINT staff_commission_rate_range
        CHECK (commission_rate >= 0 AND commission_rate <= 100);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
