

-- ==========================================
-- FILE: migration.sql
-- ==========================================

-- ============================================
-- LUERA TimeFlow — Supabase Migration
-- ============================================

-- 1. Customers Table
CREATE TABLE IF NOT EXISTS customers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Services Table
CREATE TABLE IF NOT EXISTS services (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 30,
    color TEXT NOT NULL DEFAULT '#CCFF00',
    price NUMERIC(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Reservations Table
CREATE TABLE IF NOT EXISTS reservations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    service TEXT NOT NULL,
    service_color TEXT DEFAULT '#CCFF00',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Settings Table (one row per user)
CREATE TABLE IF NOT EXISTS settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    business_name TEXT NOT NULL DEFAULT 'Luera TimeFlow',
    slot_duration INTEGER NOT NULL DEFAULT 30,
    working_hours JSONB NOT NULL DEFAULT '[
        {"day":0,"dayName":"Pazar","start":"09:00","end":"18:00","isOff":true},
        {"day":1,"dayName":"Pazartesi","start":"09:00","end":"18:00","isOff":false},
        {"day":2,"dayName":"Salı","start":"09:00","end":"18:00","isOff":false},
        {"day":3,"dayName":"Çarşamba","start":"09:00","end":"18:00","isOff":false},
        {"day":4,"dayName":"Perşembe","start":"09:00","end":"18:00","isOff":false},
        {"day":5,"dayName":"Cuma","start":"09:00","end":"18:00","isOff":false},
        {"day":6,"dayName":"Cumartesi","start":"10:00","end":"15:00","isOff":false}
    ]'::jsonb,
    webhook_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_reservations_user_date ON reservations(user_id, date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_services_user ON services(user_id);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Customers: users can only manage their own customers
CREATE POLICY "Users can view own customers" ON customers
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own customers" ON customers
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own customers" ON customers
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own customers" ON customers
    FOR DELETE USING (auth.uid() = user_id);

-- Reservations: users can only manage their own reservations
CREATE POLICY "Users can view own reservations" ON reservations
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reservations" ON reservations
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reservations" ON reservations
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reservations" ON reservations
    FOR DELETE USING (auth.uid() = user_id);

-- Services: users can only manage their own services
CREATE POLICY "Users can view own services" ON services
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own services" ON services
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own services" ON services
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own services" ON services
    FOR DELETE USING (auth.uid() = user_id);

-- Settings: users can only manage their own settings
CREATE POLICY "Users can view own settings" ON settings
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON settings
    FOR UPDATE USING (auth.uid() = user_id);


-- ==========================================
-- FILE: 002_integration_connections.sql
-- ==========================================

-- Migration 002: Modüller arası entegrasyon key yönetimi
--
-- integration_connections: TimeFlow'un diğer modüller için ürettiği keyler
-- settings tablosuna sütun ekleme: diğer modüllerin keyleri

CREATE TABLE IF NOT EXISTS integration_connections (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    module      TEXT        NOT NULL CHECK (module IN ('leadflow', 'callflow')),
    api_key     TEXT        NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    active      BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_integration_connections_user_module
    ON integration_connections(user_id, module, active);

ALTER TABLE settings
    ADD COLUMN IF NOT EXISTS leadflow_api_key TEXT,
    ADD COLUMN IF NOT EXISTS callflow_api_key TEXT;

-- RLS
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own integration keys" ON integration_connections
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ==========================================
-- FILE: 003_multi_tenant_orgs.sql
-- ==========================================

-- ============================================================
-- TimeFlow Migration 003: Organizations + Members
-- ============================================================
-- Amaç:
--   - Mevcut user_id-based izolasyondan organizations + organization_members
--     modeline geçiş. Her mevcut kullanıcı için 1 default "kişisel
--     organizasyon" oluştur, verileri o org'a backfill et.
--   - RLS politikaları: artık organization_id IN (auth_user_org_ids())
--
-- Etkilenen tablolar:
--   customers, services, reservations, settings, integration_connections
-- ============================================================

BEGIN;

-- 1) Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE,
    owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id);

-- 2) Organization Members
CREATE TABLE IF NOT EXISTS organization_members (
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'member'
                  CHECK (role IN ('owner','admin','member')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);

-- 3) Helper fonksiyon — auth kullanıcısının üyesi olduğu org id'leri
CREATE OR REPLACE FUNCTION auth_user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT org_id FROM organization_members WHERE user_id = auth.uid()
$$;

-- 4) RLS — organizations ve organization_members
ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orgs_member_select" ON organizations;
CREATE POLICY "orgs_member_select" ON organizations
    FOR SELECT TO authenticated
    USING (id IN (SELECT auth_user_org_ids()));

DROP POLICY IF EXISTS "orgs_owner_modify" ON organizations;
CREATE POLICY "orgs_owner_modify" ON organizations
    FOR ALL TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "org_members_self_select" ON organization_members;
CREATE POLICY "org_members_self_select" ON organization_members
    FOR SELECT TO authenticated
    USING (org_id IN (SELECT auth_user_org_ids()));

DROP POLICY IF EXISTS "org_members_owner_manage" ON organization_members;
CREATE POLICY "org_members_owner_manage" ON organization_members
    FOR ALL TO authenticated
    USING (org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()))
    WITH CHECK (org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));

-- 5) Her mevcut user için default org oluştur (idempotent)
INSERT INTO organizations (name, owner_id)
SELECT
    COALESCE(u.email, 'Workspace') AS name,
    u.id AS owner_id
FROM auth.users u
WHERE NOT EXISTS (
    SELECT 1 FROM organizations o WHERE o.owner_id = u.id
);

-- 6) Owner'ları organization_members'a ekle (idempotent)
INSERT INTO organization_members (org_id, user_id, role)
SELECT o.id, o.owner_id, 'owner'
FROM organizations o
ON CONFLICT (org_id, user_id) DO NOTHING;

-- 7) İlgili tablolara organization_id ekle (NULLABLE — backfill için)
ALTER TABLE customers               ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE services                ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE reservations            ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE settings                ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE integration_connections ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- 8) Backfill
WITH user_default_org AS (
    SELECT owner_id AS user_id, id AS org_id
    FROM organizations
    WHERE id IN (
        SELECT DISTINCT ON (owner_id) id
        FROM organizations
        ORDER BY owner_id, created_at ASC
    )
)
UPDATE customers c SET organization_id = u.org_id
FROM user_default_org u
WHERE c.user_id = u.user_id AND c.organization_id IS NULL;

WITH user_default_org AS (
    SELECT owner_id AS user_id, id AS org_id FROM organizations WHERE id IN (SELECT DISTINCT ON (owner_id) id FROM organizations ORDER BY owner_id, created_at ASC)
)
UPDATE services s SET organization_id = u.org_id FROM user_default_org u WHERE s.user_id = u.user_id AND s.organization_id IS NULL;

WITH user_default_org AS (
    SELECT owner_id AS user_id, id AS org_id FROM organizations WHERE id IN (SELECT DISTINCT ON (owner_id) id FROM organizations ORDER BY owner_id, created_at ASC)
)
UPDATE reservations r SET organization_id = u.org_id FROM user_default_org u WHERE r.user_id = u.user_id AND r.organization_id IS NULL;

WITH user_default_org AS (
    SELECT owner_id AS user_id, id AS org_id FROM organizations WHERE id IN (SELECT DISTINCT ON (owner_id) id FROM organizations ORDER BY owner_id, created_at ASC)
)
UPDATE settings set_t SET organization_id = u.org_id FROM user_default_org u WHERE set_t.user_id = u.user_id AND set_t.organization_id IS NULL;

WITH user_default_org AS (
    SELECT owner_id AS user_id, id AS org_id FROM organizations WHERE id IN (SELECT DISTINCT ON (owner_id) id FROM organizations ORDER BY owner_id, created_at ASC)
)
UPDATE integration_connections i SET organization_id = u.org_id FROM user_default_org u WHERE i.user_id = u.user_id AND i.organization_id IS NULL;

-- 9) NOT NULL kısıtı uygula
-- Test DB'si boş olabileceği veya test data olabileceği için hata fırlatmayı kaldırıyoruz, direkt NOT NULL yapmaya çalışalım.
-- Eğre data bozuksa NOT NULL patlar ve işlem rollback olur.
ALTER TABLE customers               ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE services                ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE reservations            ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE settings                ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE integration_connections ALTER COLUMN organization_id SET NOT NULL;

-- 10) Indexler
CREATE INDEX IF NOT EXISTS idx_customers_org     ON customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_services_org      ON services(organization_id);
CREATE INDEX IF NOT EXISTS idx_reservations_org  ON reservations(organization_id);
CREATE INDEX IF NOT EXISTS idx_settings_org      ON settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_integration_conn_org ON integration_connections(organization_id);

-- 11) RLS Policy'leri user_id'den organization_id'ye geçir
-- Customers
DROP POLICY IF EXISTS "Users can view own customers" ON customers;
DROP POLICY IF EXISTS "Users can insert own customers" ON customers;
DROP POLICY IF EXISTS "Users can update own customers" ON customers;
DROP POLICY IF EXISTS "Users can delete own customers" ON customers;

CREATE POLICY "customers_org_access" ON customers
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

-- Services
DROP POLICY IF EXISTS "Users can view own services" ON services;
DROP POLICY IF EXISTS "Users can insert own services" ON services;
DROP POLICY IF EXISTS "Users can update own services" ON services;
DROP POLICY IF EXISTS "Users can delete own services" ON services;

CREATE POLICY "services_org_access" ON services
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

-- Reservations
DROP POLICY IF EXISTS "Users can view own reservations" ON reservations;
DROP POLICY IF EXISTS "Users can insert own reservations" ON reservations;
DROP POLICY IF EXISTS "Users can update own reservations" ON reservations;
DROP POLICY IF EXISTS "Users can delete own reservations" ON reservations;

CREATE POLICY "reservations_org_access" ON reservations
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

-- Settings
DROP POLICY IF EXISTS "Users can view own settings" ON settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON settings;
DROP POLICY IF EXISTS "Users can update own settings" ON settings;

CREATE POLICY "settings_org_access" ON settings
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

-- Integration Connections
DROP POLICY IF EXISTS "Users manage own integration keys" ON integration_connections;

CREATE POLICY "integration_connections_org_access" ON integration_connections
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

-- 12) handle_new_user trigger
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
    
    IF NOT EXISTS (SELECT 1 FROM organizations WHERE owner_id = NEW.id) THEN
        INSERT INTO organizations (name, owner_id)
        VALUES (COALESCE(display_name, 'Workspace'), NEW.id)
        RETURNING id INTO new_org_id;

        INSERT INTO organization_members (org_id, user_id, role)
        VALUES (new_org_id, NEW.id, 'owner')
        ON CONFLICT DO NOTHING;
    END IF;

    -- Settings kaydı default olarak açılsın
    INSERT INTO settings (user_id, organization_id, business_name)
    VALUES (NEW.id, new_org_id, COALESCE(display_name, 'Luera TimeFlow'))
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ==========================================
-- FILE: 004_add_reminder_flags.sql
-- ==========================================

-- Migration 004: Add reminder tracking flags to reservations
-- Bu sütunlar n8n'in aynı müşteriye 2 kez mesaj atmasını engeller.

ALTER TABLE public.reservations 
ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reminder_2h_sent BOOLEAN DEFAULT false;


-- ==========================================
-- FILE: 005_n8n_performance_index.sql
-- ==========================================

-- Migration 005: Add Partial Index for n8n cron polling performance
-- n8n her 5-10 dakikada bir "yaklaşan randevu var mı?" diye sorduğunda
-- veritabanı tüm tabloyu taramasın diye sadece "henüz mesaj gitmemiş" ve "iptal edilmemiş"
-- randevuları önbellekleyen performans dizini.

CREATE INDEX IF NOT EXISTS idx_reservations_pending_reminders 
ON public.reservations (date, start_time) 
WHERE (reminder_24h_sent = false OR reminder_2h_sent = false) AND status != 'cancelled';
