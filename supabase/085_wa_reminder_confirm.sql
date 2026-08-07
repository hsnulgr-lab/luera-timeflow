-- ============================================================
-- TimeFlow Migration 085: 24 saat hatırlatmasına müşteri yanıtı
-- ============================================================
-- Dalga 3. Bugüne kadar 24 saatlik hatırlatma tek yönlüydü: mesaj gidiyor,
-- müşteri "gelemeyeceğim" yazsa bile bot bunu randevuyla ilişkilendiremiyordu
-- (kayıtlı randevu ile konuşma arasında hiçbir bağ yoktu). Sonuç, salonun en
-- pahalı sorunu: boş kalan ama dolu görünen slot.
--
-- Artık hatırlatmaya "Evet/Hayır" cevabı randevuya yazılır:
--   yes → müşteri geleceğini bildirdi (operasyon ekranında güven verir)
--   no  → randevu iptal edilir ve yer serbest bırakılır (notify-waitlist)
--
-- Ayrı bir tablo AÇILMADI: yanıt randevunun bir niteliğidir, ilişkisi değil.
-- ============================================================

ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS customer_confirm    TEXT,
    ADD COLUMN IF NOT EXISTS customer_confirm_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'reservations_customer_confirm_check'
    ) THEN
        ALTER TABLE public.reservations
            ADD CONSTRAINT reservations_customer_confirm_check
            CHECK (customer_confirm IS NULL OR customer_confirm IN ('yes', 'no'));
    END IF;
END $$;

-- Bot, gelen "evet"in HANGİ randevuya ait olduğunu bulmak için "yarın, bu
-- müşteri, hatırlatma gitmiş, henüz yanıtlanmamış" sorgusunu atar. Kısmi
-- indeks yalnız yanıt bekleyen satırları taşır — tablonun tamamı büyürken
-- indeks küçük kalır.
CREATE INDEX IF NOT EXISTS idx_reservations_awaiting_confirm
    ON public.reservations (organization_id, customer_id, date)
    WHERE customer_confirm IS NULL AND reminder_24h_sent = true;

NOTIFY pgrst, 'reload schema';
