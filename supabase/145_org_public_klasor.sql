-- ============================================================
-- TimeFlow Migration 145: Görsel deposunda klasör = işletme
-- ============================================================
-- Denetim 2026-11-24 · B4.
--
-- 016 `org-public` deposunu kurarken yazma/güncelleme/silme politikalarına
-- yalnız `bucket_id = 'org-public'` yazmıştı. Yani giriş yapmış HERHANGİ bir
-- kullanıcı (kayıt herkese açık) başka bir salonun logosunu, kapağını ya da
-- galeri fotoğrafını silebiliyor veya üzerine yazabiliyordu. Yol zaten
-- `<orgId>/logo-….jpg` biçiminde (src/hooks/useOrgProfile.ts) ve herkese açık
-- randevu sayfasında görünüyor.
--
-- Kural artık: yolun İLK klasörü, kullanıcının üyesi olduğu bir işletmenin
-- kimliği olmalı. Okuma herkese açık kalıyor (randevu sayfası girişsiz).
--
-- Karşılaştırma METİN üzerinden: klasör adı uuid değilse (eski ya da elle
-- konmuş bir dosya) dönüştürme hatası politikayı patlatmasın, yalnız eşleşmesin.
--
-- UPDATE'te hem USING hem WITH CHECK: dosyayı başka işletmenin klasörüne
-- TAŞIMAK da engellensin. `upload(..., { upsert: true })` INSERT + UPDATE
-- kullanır; ikisi de kendi klasöründe serbest.
--
-- Yeniden çalıştırılabilir (DROP IF EXISTS + CREATE). Geri alma: dosyanın
-- sonundaki not.
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS "org_public_auth_insert" ON storage.objects;
CREATE POLICY "org_public_auth_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'org-public'
        AND (storage.foldername(name))[1] IN (SELECT o::text FROM public.auth_user_org_ids() AS o)
    );

DROP POLICY IF EXISTS "org_public_auth_update" ON storage.objects;
CREATE POLICY "org_public_auth_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'org-public'
        AND (storage.foldername(name))[1] IN (SELECT o::text FROM public.auth_user_org_ids() AS o)
    )
    WITH CHECK (
        bucket_id = 'org-public'
        AND (storage.foldername(name))[1] IN (SELECT o::text FROM public.auth_user_org_ids() AS o)
    );

DROP POLICY IF EXISTS "org_public_auth_delete" ON storage.objects;
CREATE POLICY "org_public_auth_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'org-public'
        AND (storage.foldername(name))[1] IN (SELECT o::text FROM public.auth_user_org_ids() AS o)
    );

-- Okuma politikası (org_public_read) DEĞİŞMEDİ: herkese açık, kasıtlı.

COMMIT;

-- ── DOĞRULAMA (salt okunur) ─────────────────────────────────
--   SELECT policyname, cmd, qual, with_check FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'org_public%';
-- Beklenen: insert/update/delete satırlarında `foldername` ve `auth_user_org_ids` geçer.
--
-- ── GERİ ALMA (016'nın hâli) ────────────────────────────────
--   Üç politikayı yalnız `bucket_id = 'org-public'` koşuluyla yeniden kurmak:
--   016_org_public_storage.sql satır 27-42.
