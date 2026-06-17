-- ============================================================
-- TimeFlow Migration 019: İşletme Sektörü (AI hatırlatma için)
-- ============================================================
-- AI sektörel hatırlatma, mesajı sektöre göre kişiselleştirir:
--   fizyoterapi → "ağrı nasıl, devam ediyor mu"
--   guzellik    → "bakım zamanı"
--   danismanlik → seans öncesi hazırlık
-- ============================================================

ALTER TABLE public.settings
    ADD COLUMN IF NOT EXISTS sector TEXT NOT NULL DEFAULT 'genel';

NOTIFY pgrst, 'reload schema';
