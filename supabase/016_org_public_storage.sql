-- ============================================================
-- TimeFlow Migration 016: Booking Profil Görselleri (Storage)
-- ============================================================
-- İşletme logo / kapak / galeri fotoğrafları için public-read
-- bir storage bucket. Yükleme yalnızca giriş yapmış kullanıcılar;
-- okuma herkese açık (booking sayfası login'siz görüntülenir).
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'org-public',
    'org-public',
    true,
    5242880,  -- 5 MB
    ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE
    SET public = true,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Herkese açık okuma (booking sayfası login'siz)
DROP POLICY IF EXISTS "org_public_read" ON storage.objects;
CREATE POLICY "org_public_read" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'org-public');

-- Giriş yapmış kullanıcı yazma/güncelleme/silme
DROP POLICY IF EXISTS "org_public_auth_insert" ON storage.objects;
CREATE POLICY "org_public_auth_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'org-public');

DROP POLICY IF EXISTS "org_public_auth_update" ON storage.objects;
CREATE POLICY "org_public_auth_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'org-public');

DROP POLICY IF EXISTS "org_public_auth_delete" ON storage.objects;
CREATE POLICY "org_public_auth_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'org-public');
