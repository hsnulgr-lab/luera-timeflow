-- ============================================================
-- TimeFlow Migration 027: Tahsilatı personele bağla
-- ============================================================
-- "Personel kendi sattığı ürün/hizmetleri görsün" için tahsilata
-- staff_id eklenir (nullable — eski kayıtlar ve genel tahsilatlar NULL kalır).
-- ============================================================

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_staff ON public.payments(staff_id);

NOTIFY pgrst, 'reload schema';
