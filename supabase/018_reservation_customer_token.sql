-- ============================================================
-- TimeFlow Migration 018: Self-servis Randevu Yönetim Token'ı
-- ============================================================
-- Müşteri, WhatsApp'tan gelen linkle randevusunu login'siz iptal
-- edebilir veya yeniden planlayabilir. Her randevuya tahmin
-- edilemez bir token verilir; manage endpoint bu token ile
-- yetki yerine kapsam sağlar.
-- ============================================================

ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS customer_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_customer_token
    ON public.reservations(customer_token);

NOTIFY pgrst, 'reload schema';
