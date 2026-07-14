-- 051: Genel kaynak yönetimi — randevu yalnız personele değil, fiziksel kaynağa
-- da bağlanabilir (koltuk/oda/diş ünitesi/kabin/prova odası/salon alanı…).
-- Restoran masaları (tables) bilinçli olarak AYRI kalır — canlı ve özelleşmiş akış.
-- capacity > 1 → aynı slota birden çok randevu (gym grup dersi); kontrol uygulamada.

CREATE TABLE IF NOT EXISTS resources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type            TEXT NOT NULL DEFAULT 'Oda',   -- sektör profili resourceTypes'tan
    name            TEXT NOT NULL,
    capacity        INT  NOT NULL DEFAULT 1,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort            INT  NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resources_org ON resources(organization_id);

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "resources_org_access" ON resources;
CREATE POLICY "resources_org_access" ON resources
    FOR ALL USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

-- Randevu → kaynak bağı (opsiyonel; null = kaynaksız, mevcut davranış)
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES resources(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_resource ON reservations(resource_id);

-- Realtime (diğer tablolarla aynı desen)
ALTER PUBLICATION supabase_realtime ADD TABLE resources;
