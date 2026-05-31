-- Migration 007: WhatsApp instance bilgisini settings tablosuna ekle
-- Her organizasyon kendi Evolution API instance adını burada saklar.

ALTER TABLE public.settings
    ADD COLUMN IF NOT EXISTS whatsapp_instance TEXT;

NOTIFY pgrst, 'reload schema';
