-- ============================================================
-- TimeFlow Migration 039: Yaklaşan randevu push bayrağı
-- ============================================================
-- remind fonksiyonu, randevuya ~15 dk kala atanmış personele bir kez push
-- gönderir; tekrar göndermemek için bu bayrağı işaretler.
-- (WhatsApp reminder_24h_sent / reminder_2h_sent desenine paralel.)
-- ============================================================

ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS reminder_push_sent BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
