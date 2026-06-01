-- ============================================================
-- TimeFlow Migration 008: Personel (Staff) Yönetimi
-- ============================================================
-- Her organizasyonun birden fazla çalışanı olabilir.
-- Randevular belirli bir çalışana atanabilir.
-- Çakışma kontrolü çalışan bazında yapılır.
-- ============================================================

-- 1) Staff tablosu
CREATE TABLE IF NOT EXISTS public.staff (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    specialty       TEXT,                          -- uzmanlık alanı (Saç, Cilt, vb.)
    phone           TEXT,
    email           TEXT,
    color           TEXT        NOT NULL DEFAULT '#8B5CF6',  -- takvimde gösterim rengi
    working_hours   JSONB,                         -- NULL = işletmenin saatlerini kullan
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_org ON public.staff(organization_id);
CREATE INDEX IF NOT EXISTS idx_staff_active ON public.staff(organization_id, is_active);

-- 2) RLS
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_org_access" ON public.staff
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth_user_org_ids()));

-- 3) Rezervasyonlara staff_id ekle
ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_staff ON public.reservations(staff_id);

-- 4) Schema cache yenile
NOTIFY pgrst, 'reload schema';
