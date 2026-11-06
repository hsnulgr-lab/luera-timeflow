-- ============================================================================
-- 138 · Hizmet açıklaması + hazırlık notu (services.description, prep_note)
-- ----------------------------------------------------------------------------
-- NEDEN (kullanıcı isteği 2026-11-07, WhatsApp asistanı C adımı): müşteri
-- "lazer epilasyon nasıl yapılıyor, öncesinde ne yapmalıyım?" diye sorunca
-- asistanın elinde yalnız ad, süre ve fiyat vardı; ya "ekibe sorup döneyim"
-- diyor ya da uyduruyordu.
--
--   description · hizmetin ne olduğu, kısaca (asistan sorulursa anlatır)
--   prep_note   · müşterinin gelmeden önce yapması gereken
--                 ("24 saat önce tıraş olun, güneşe çıkmayın"); onay mesajına
--                 ve 24 saat hatırlatmasına eklenir
--
-- Uzunluk sınırı veritabanında: istem ve WhatsApp mesajı şişmesin.
-- Güvenli: yalnız yeni boş kolonlar; mevcut satırlara dokunmaz.
-- SIRA: bu göç, wa-agent / remind / wa-scheduler / public-booking /
-- whatsapp-booking yüklemesinden ÖNCE çalışmalı (fonksiyonlar kolonları seçiyor).
-- Masaüstü kolon yoksa notsuz kaydeder (useReservations).
-- ============================================================================

BEGIN;

ALTER TABLE public.services
    ADD COLUMN IF NOT EXISTS description text,
    ADD COLUMN IF NOT EXISTS prep_note   text;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_description_len') THEN
        ALTER TABLE public.services
            ADD CONSTRAINT services_description_len CHECK (description IS NULL OR char_length(description) <= 400);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_prep_note_len') THEN
        ALTER TABLE public.services
            ADD CONSTRAINT services_prep_note_len CHECK (prep_note IS NULL OR char_length(prep_note) <= 300);
    END IF;
END $$;

COMMENT ON COLUMN public.services.description IS
    '138 · Hizmetin kısa açıklaması; WhatsApp asistanı sorulursa anlatır.';
COMMENT ON COLUMN public.services.prep_note IS
    '138 · Müşterinin gelmeden önce yapması gereken; onay mesajı + 24 saat hatırlatmasına eklenir.';

NOTIFY pgrst, 'reload schema';

COMMIT;
