-- ============================================================
-- TimeFlow Migration 128: Kurulum kapının dışında — veritabanında da
-- ============================================================
-- Kurallar: docs/abonelik-kurallari.md §3 ("Bu adımdan önce sistem
-- kilitlemez: kurulum sayfası kapının dışındadır"). Idempotent.
--
-- ── Neden ───────────────────────────────────────────────────────────────────
-- Masaüstünden (`kaynak = 'web'`) kaydolan işletmeye abonelik satırı
-- yazılmaz (124); deneme kurulumun SONUNDA Dodo'da kartla başlar. Ama 087
-- personel, yer ve hizmet yazmayı `has_timeflow_access`'e bağladı ve satırı
-- olmayan işletme orada false döner. Kapı açıldığından (2026-10-23) beri
-- panelden kaydolan herkes Kurulum'un ilk ekranında "Kaydedilemedi"ye
-- düşüyordu: `set_business_mode` sahibin personel satırını açamıyor, yerler
-- ve (K2'de) hizmetler yazılamıyor. Siteden gelen etkilenmedi; o önce öder.
--
-- ── Kural ───────────────────────────────────────────────────────────────────
-- Kurulumun yazdığı üç tablo (staff, resources, services) için:
--     erişimi var  VEYA  hiç abonelik satırı yok (= henüz hiç denemedi).
-- Satırı olan her işletme eskisi gibi: süresi biten, iptal eden, kartsız
-- denemesi biten kilitli kalır. Randevu, müşteri, tahsilat ve modül
-- tabloları HİÇ değişmez; satırsız işletme ürünü yine KULLANAMAZ, yalnız
-- kurar. Yani bedavaya açılan bir kullanım yok.
--
-- SELECT'e yine dokunulmaz; USING 087 ile aynı.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.has_setup_access(p_org UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.has_timeflow_access(p_org)
        OR NOT EXISTS (SELECT 1 FROM org_entitlement e WHERE e.organization_id = p_org)
$$;
COMMENT ON FUNCTION public.has_setup_access(UUID) IS
    '128 · Kurulum tabloları (staff, resources, services) yazılabilir mi? Erişim VEYA hiç abonelik satırı yok (web kaydı, deneme henüz başlamadı).';
REVOKE ALL ON FUNCTION public.has_setup_access(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_setup_access(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_setup_access(UUID) TO authenticated;

DO $$
DECLARE
    t TEXT;
    pol TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['staff', 'resources', 'services'] LOOP
        pol := t || '_org_access';
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t AND policyname = pol
        ) THEN
            RAISE EXCEPTION '%.% politikası yok — 087 uygulanmamış mı?', t, pol;
        END IF;
        EXECUTE format(
            'ALTER POLICY %I ON public.%I
                 USING (organization_id IN (SELECT auth_user_org_ids()))
                 WITH CHECK (
                     organization_id IN (SELECT auth_user_org_ids())
                     AND public.has_setup_access(organization_id)
                 )', pol, t);
        RAISE NOTICE '% → kurulum kapısı (has_setup_access)', t;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── Geri alma ────────────────────────────────────────────────────────────────
-- 087'nin politikasına dönmek için aynı ALTER'ı `has_timeflow_access` ile
-- çalıştırın (staff, resources, services).
