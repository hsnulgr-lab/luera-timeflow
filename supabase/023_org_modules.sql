-- ============================================================
-- TimeFlow Migration 023: Modül Switch Sistemi
-- ============================================================
-- İşletme sahibi sektörüne göre modülleri on/off yapar.
--   organizations.modules : JSONB — { randevu, personel, hizmet, kasa, masa, analiz }
-- Core sayfalar (Dashboard, Müşteri, Ayarlar) modüle tabi DEĞİL — her zaman açık.
-- Sektör settings.sector'da yaşar; bu migration sektöre göre varsayılanları backfill eder.
-- ============================================================

BEGIN;

-- Varsayılan: tüm modüller açık (genel işletme)
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS modules JSONB NOT NULL
    DEFAULT '{"randevu":true,"personel":true,"hizmet":true,"kasa":true,"masa":false,"analiz":true}'::jsonb;

-- Mevcut org'ları settings.sector'a göre backfill et (yalnızca henüz dokunulmamışları)
-- restoran → masa odaklı; diğer hizmet sektörleri → randevu odaklı; genel → hepsi açık
UPDATE public.organizations o
SET modules = CASE
    WHEN s.sector = 'restoran' THEN
        '{"randevu":false,"personel":false,"hizmet":false,"kasa":true,"masa":true,"analiz":true}'::jsonb
    WHEN s.sector IN ('guzellik','kuafor','fizyoterapi','saglik','danismanlik') THEN
        '{"randevu":true,"personel":true,"hizmet":true,"kasa":true,"masa":false,"analiz":true}'::jsonb
    ELSE
        '{"randevu":true,"personel":true,"hizmet":true,"kasa":true,"masa":true,"analiz":true}'::jsonb
END
FROM public.settings s
WHERE s.organization_id = o.id;

COMMIT;

NOTIFY pgrst, 'reload schema';
