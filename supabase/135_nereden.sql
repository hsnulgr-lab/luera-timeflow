-- ============================================================
-- TimeFlow Migration 135: Müşteri nereden geldi? (Kaynak Defteri, Aşama 1)
-- ============================================================
-- reservations.source randevunun KANALIDIR (panel / online sayfa / WhatsApp)
-- ve abuse sayacı ile 107/116/118 push tetikleyicileri ona bağlı — ona
-- dokunulmaz. Müşterinin NEREDEN geldiği (Instagram, Google, tavsiye…) ayrı
-- iki sütunda tutulur:
--   customers.origin     → ilk temas; yalnız müşteri satırı AÇILIRKEN yazılır
--                          (tetikleyici yok: eski müşteri sonradan işaretlenmez)
--   reservations.origin  → o ziyaretin izi (BrandFlow kampanya ölçümü için)
--   *.origin_meta        → temizlenmiş ham iz (utm_*, tıklama kimlikleri,
--                          yönlendiren alan adı, reklam mı) — anonim uç yazdığı
--                          için boyutu burada da sınırlı.
-- Anahtar listesi src/lib/nereden.ts ve
-- supabase/functions/_shared/booking/nereden.ts ile AYNI (tests/nereden.test.mjs).
--
-- ⚠️ SIRA: önce bu göç, SONRA public-booking yüklemesi ve masaüstü Deploy'u.
-- Ters sırada izli online randevu ve çip seçilen randevu "column origin"
-- hatasıyla hiç oluşmaz.
-- Idempotent. Geri doldurma yok: eski müşteriler boş kalır.
-- ============================================================

BEGIN;

ALTER TABLE public.customers    ADD COLUMN IF NOT EXISTS origin TEXT;
ALTER TABLE public.customers    ADD COLUMN IF NOT EXISTS origin_meta JSONB;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS origin TEXT;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS origin_meta JSONB;

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_origin_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_origin_check
    CHECK (origin IS NULL OR origin IN (
        'instagram', 'facebook', 'tiktok', 'google', 'google_maps',
        'web_sitesi', 'tavsiye', 'yoldan', 'diger'));

ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_origin_check;
ALTER TABLE public.reservations ADD CONSTRAINT reservations_origin_check
    CHECK (origin IS NULL OR origin IN (
        'instagram', 'facebook', 'tiktok', 'google', 'google_maps',
        'web_sitesi', 'tavsiye', 'yoldan', 'diger'));

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_origin_meta_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_origin_meta_check
    CHECK (origin_meta IS NULL OR (
        jsonb_typeof(origin_meta) = 'object' AND pg_column_size(origin_meta) <= 2048));

ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_origin_meta_check;
ALTER TABLE public.reservations ADD CONSTRAINT reservations_origin_meta_check
    CHECK (origin_meta IS NULL OR (
        jsonb_typeof(origin_meta) = 'object' AND pg_column_size(origin_meta) <= 2048));

-- Analiz › "Müşteriler nereden geliyor?" dönemde açılan müşterileri sayar.
CREATE INDEX IF NOT EXISTS idx_customers_org_created
    ON public.customers(organization_id, created_at);

NOTIFY pgrst, 'reload schema';

COMMIT;
