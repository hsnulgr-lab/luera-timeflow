-- ============================================================
-- TimeFlow Migration 112: Beklemenin DAMGASI (v4 · G3)
-- ============================================================
-- Kumandadaki "Bekleme kur" bugüne kadar YALNIZ telefonda yaşıyordu: bir
-- ekran durumu, cihazın saati ve kumanda kapanınca kaybolan bir sayaç. Gün
-- ekranı onu hiç bilmiyordu; tasarımın G3 kartı ("BEKLEMEDE · 13 dk")
-- çizilemiyordu ve kumandaya geri dönen kişi beklemesini kaybolmuş buluyordu.
--
-- İki sütun:
--   wait_ends_at — beklemenin bittiği an. SUNUCU yazar (`şimdi + dakika`),
--                  telefonun saati değil (v4 · "Damgalar server_now()").
--   wait_minutes — kurulan süre; kumandadaki halkanın doluluğu bundan.
--
-- Bekleme bir SAYAÇ, para değil: denetim kaydına girmiyor. Bitmiş bir iş
-- beklemede olamaz; `staff-api · visit.finish` ikisini de temizliyor.
--
-- Bildirim tetikleyicileri (038 → 107) yalnız belirli geçişlerde çalışıyor
-- (bitiş, iptal, atama, geliş, saat değişimi); bekleme onlardan biri değil.
--
-- Idempotent. SIRA: önce bu göç, sonra `staff-api`. Ters sırada ajanda okuması
-- var olmayan sütunu sorar ve kumanda açılmaz.
-- ============================================================

BEGIN;

ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS wait_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS wait_minutes SMALLINT;

COMMENT ON COLUMN public.reservations.wait_ends_at IS
    'Süren işin beklemesinin bittiği an (sunucu saati). NULL = bekleme yok (112).';
COMMENT ON COLUMN public.reservations.wait_minutes IS
    'Kurulan bekleme süresi, dakika. wait_ends_at ile BİRLİKTE var olur (112).';

-- İkisi birlikte var olur; yarım bir bekleme (bitişi olup süresi olmayan)
-- ekranda ya halkasız ya bitişsiz çizilirdi. Süre kumandanın seçeneklerini
-- (20–60 dk) rahatça kapsayan bir aralıkta.
ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_wait_shape;
ALTER TABLE public.reservations
    ADD CONSTRAINT reservations_wait_shape
    CHECK (
        (wait_ends_at IS NULL) = (wait_minutes IS NULL)
        AND (wait_minutes IS NULL OR wait_minutes BETWEEN 1 AND 240)
    );

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── Doğrulama ───────────────────────────────────────────────────────────────
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'reservations'
--      and column_name in ('wait_ends_at', 'wait_minutes');   → iki satır
--
-- ── Geri alma ───────────────────────────────────────────────────────────────
-- staff-api'nin bu sütunları SORAN sürümü önce geri alınmalı; sonra:
--   alter table public.reservations drop constraint reservations_wait_shape,
--     drop column wait_ends_at, drop column wait_minutes;
