-- ============================================================
-- TimeFlow Migration 006: handle_new_user trigger güvenli kurulum
-- ============================================================
-- Bu migration idempotent'tir — defalarca çalıştırılabilir.
-- Amaç:
--   1. handle_new_user fonksiyonu + trigger'ı güncelle/oluştur
--   2. Mevcut kullanıcıların org kaydı yoksa oluştur (backfill)
--   3. settings.organization_id boş olan kayıtları düzelt
-- ============================================================

BEGIN;

-- 1) handle_new_user fonksiyonunu güncelle
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_org_id UUID;
    display_name TEXT;
BEGIN
    display_name := COALESCE(NEW.raw_user_meta_data->>'name', NEW.email);

    -- Org yoksa oluştur
    IF NOT EXISTS (SELECT 1 FROM organizations WHERE owner_id = NEW.id) THEN
        INSERT INTO organizations (name, owner_id)
        VALUES (COALESCE(display_name, 'Workspace'), NEW.id)
        RETURNING id INTO new_org_id;

        INSERT INTO organization_members (org_id, user_id, role)
        VALUES (new_org_id, NEW.id, 'owner')
        ON CONFLICT DO NOTHING;
    ELSE
        SELECT id INTO new_org_id FROM organizations WHERE owner_id = NEW.id LIMIT 1;
    END IF;

    -- Settings kaydı default olarak oluştur
    INSERT INTO settings (user_id, organization_id, business_name)
    VALUES (NEW.id, new_org_id, COALESCE(display_name, 'Luera TimeFlow'))
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

-- 2) Trigger'ı yeniden oluştur
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 3) Backfill: org'u olan ama organization_members'ta kaydı olmayan kullanıcılar
INSERT INTO organization_members (org_id, user_id, role)
SELECT o.id, o.owner_id, 'owner'
FROM organizations o
WHERE NOT EXISTS (
    SELECT 1 FROM organization_members m
    WHERE m.org_id = o.id AND m.user_id = o.owner_id
)
ON CONFLICT (org_id, user_id) DO NOTHING;

-- 4) Backfill: settings.organization_id boş olan kayıtları doldur
WITH user_org AS (
    SELECT owner_id AS user_id, id AS org_id
    FROM organizations
    WHERE id IN (
        SELECT DISTINCT ON (owner_id) id
        FROM organizations
        ORDER BY owner_id, created_at ASC
    )
)
UPDATE settings s
SET organization_id = u.org_id
FROM user_org u
WHERE s.user_id = u.user_id
  AND s.organization_id IS NULL;

-- 5) Schema cache'i yenile
NOTIFY pgrst, 'reload schema';

COMMIT;
