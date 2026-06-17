-- ============================================================
-- TimeFlow Migration 015: Randevu Kaynağı (source)
-- ============================================================
-- Randevunun nereden geldiğini işaretler:
--   manual   → panelden işletme oluşturdu
--   booking  → self-servis /book/{slug} sayfası
--   leadflow → LeadFlow senkronizasyonu
-- Booking rozeti, istatistik kaynak kırılımı ve ileride LTV için.
-- ============================================================

ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual','booking','leadflow'));

CREATE INDEX IF NOT EXISTS idx_reservations_source ON public.reservations(organization_id, source);

NOTIFY pgrst, 'reload schema';
