-- ============================================================
-- TimeFlow Migration 137: WhatsApp asistanının bilgi bankası
-- ============================================================
-- Kullanıcı kararı (2026-11-06): asistan işletme hakkında her soruyu
-- cevaplasın — ödeme yöntemleri, iptal ve gecikme kuralı, ulaşım ve
-- otopark, sık sorulanlar. İşletme Ayarlar → WhatsApp'tan doldurur; asistan
-- işletme profilinin parçası olarak okur (_shared/agent/knowledge.ts).
--
-- Biçim: {"payment": "...", "policy": "...", "location": "...",
--         "notes": "...", "faq": [{"q": "...", "a": "..."}]}
-- Sınırlar proxy'de uygulanır (knowledge.ts sanitizeKnowledge).
--
-- Yazma yolu whatsapp-proxy (service_role); org_whatsapp'ta yazma RLS'i yok
-- (070). Okuma mevcut org_whatsapp_read politikasıyla.

BEGIN;

ALTER TABLE public.org_whatsapp
    ADD COLUMN IF NOT EXISTS knowledge JSONB NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';

COMMIT;
