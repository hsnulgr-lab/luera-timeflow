-- ============================================================
-- TimeFlow Migration 044: Masa oturma zaman damgası (seated_at)
-- ============================================================
-- Bir masa "oturtulduğunda" (status → seated) zamanı kaydedilir ki salon
-- görünümünde "bu masa kaç dakikadır dolu" hesaplanabilsin (⏱ oturma süresi,
-- garson devir hızı, uzun oturan masa uyarısı). setStatus:
--   • → seated : seated_at = now() (yalnızca boşsa)
--   • → reserved (geri al) : seated_at = null
-- table_reservations zaten realtime publication'da (041) + replica identity full;
-- seated_at değişimi tüm cihazlara anlık akar (ana bilgisayar ↔ garson).
-- Kolon opsiyonel/nullable — mevcut kayıtlar ve akışlar bozulmaz (⏱ gizlenir).
-- ============================================================

ALTER TABLE public.table_reservations
    ADD COLUMN IF NOT EXISTS seated_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
