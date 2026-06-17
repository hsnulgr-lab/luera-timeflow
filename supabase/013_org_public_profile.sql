-- ============================================================
-- TimeFlow Migration 013: İşletme Public Profil (Booking Sayfası)
-- ============================================================
-- /book/{slug} sayfasının üst kısmı (işletme mini profili) ve
-- booking davranış ayarı (otomatik onay) için organizations
-- tablosuna alanlar ekler. Mevcut org'lar için slug backfill.
-- ============================================================

ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS bio                  TEXT,
    ADD COLUMN IF NOT EXISTS logo_url             TEXT,
    ADD COLUMN IF NOT EXISTS cover_url            TEXT,
    ADD COLUMN IF NOT EXISTS gallery_urls         TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS address              TEXT,
    ADD COLUMN IF NOT EXISTS public_phone         TEXT,
    ADD COLUMN IF NOT EXISTS instagram_url        TEXT,
    ADD COLUMN IF NOT EXISTS maps_url             TEXT,
    ADD COLUMN IF NOT EXISTS booking_auto_confirm BOOLEAN NOT NULL DEFAULT false;

-- ── slug backfill ───────────────────────────────────────────
-- slug NULL/boş olan org'lara isimden benzersiz slug üret.
-- Türkçe karakter sadeleştirme + non-alnum'u '-' yap + tekrarları temizle.
DO $$
DECLARE
    rec       RECORD;
    base      TEXT;
    candidate TEXT;
    n         INT;
BEGIN
    FOR rec IN SELECT id, name FROM organizations WHERE slug IS NULL OR slug = '' LOOP
        base := lower(coalesce(rec.name, 'isletme'));
        base := translate(base, 'çğıöşüâîû', 'cgiosuaiu');
        base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
        base := trim(both '-' from base);
        IF base = '' THEN base := 'isletme'; END IF;

        candidate := base;
        n := 0;
        WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = candidate AND id <> rec.id) LOOP
            n := n + 1;
            candidate := base || '-' || n::text;
        END LOOP;

        UPDATE organizations SET slug = candidate WHERE id = rec.id;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
