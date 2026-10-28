-- ============================================================
-- TimeFlow Migration 129: Randevu kaynağına 'whatsapp'
-- ============================================================
-- WhatsApp Sekreter v2 · P0 (plan: ~/.claude/plans/velvet-zooming-token.md).
-- Bot şimdiye kadar randevuyu 'booking' diye yazıyordu: takvimde "Online
-- booking" görünüyor, raporda halka açık sayfayla karışıyordu. 015'in CHECK'i
-- yalnız manual/booking/leadflow kabul ediyor.
--
-- Push etkisi yok: notify_push_on_reservation (118) "kaynak 'manual' değilse
-- müdüre haber" diyor; 'whatsapp' de müşteri kaynaklı sayılır.
--
-- ⚠️ SIRA: önce bu göç, SONRA whatsapp-booking deploy'u. Ters sırada bot
-- 'whatsapp' yazmaya çalışır, CHECK reddeder, randevu hiç oluşmaz.
-- Idempotent.
-- ============================================================

BEGIN;

DO $$
DECLARE
    c TEXT;
BEGIN
    -- 015'te sütunla birlikte isimsiz açıldı; adı sürümden sürüme değişebilir,
    -- tanımıyla bulunur.
    FOR c IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'public.reservations'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%source%'
    LOOP
        EXECUTE format('ALTER TABLE public.reservations DROP CONSTRAINT %I', c);
    END LOOP;
END $$;

ALTER TABLE public.reservations
    ADD CONSTRAINT reservations_source_check
    CHECK (source IN ('manual', 'booking', 'leadflow', 'whatsapp'));

NOTIFY pgrst, 'reload schema';

COMMIT;
