-- ============================================================
-- TimeFlow Migration 058: Personel rolleri
-- ============================================================
-- Bu rol, PIN ile açılan cihaz-içi Personel Modu'nun uygulama davranışını
-- belirler. PIN oturumu gerçek bir Supabase Auth kullanıcısı olmadığı için bu
-- kolon tek başına veri tabanı yetkilendirmesi/RLS izolasyonu sağlamaz.
-- ============================================================

ALTER TABLE public.staff
    ADD COLUMN IF NOT EXISTS role TEXT;

-- Mevcut kayıtları, serbest metin uzmanlık alanından olabildiğince güvenli
-- şekilde sınıflandır. Asistan kontrolü hekimden önce yapılır; böylece
-- "diş hekimi asistanı" yanlışlıkla hekim olmaz.
UPDATE public.staff
SET role = CASE
    WHEN lower(coalesce(specialty, '')) LIKE ANY (ARRAY['%asistan%', '%assistant%', '%yardımcı%', '%yardimci%']) THEN 'assistant'
    WHEN lower(coalesce(specialty, '')) LIKE ANY (ARRAY['%hekim%', '%doktor%', '%doctor%', '%dentist%', '%diş%', '%dis%']) THEN 'doctor'
    WHEN lower(coalesce(specialty, '')) LIKE ANY (ARRAY['%kasa%', '%kasiyer%', '%cashier%', '%vezne%', '%tahsilat%']) THEN 'cashier'
    ELSE 'staff'
END
WHERE role IS NULL OR role NOT IN ('doctor', 'assistant', 'cashier', 'staff');

ALTER TABLE public.staff
    ALTER COLUMN role SET DEFAULT 'staff',
    ALTER COLUMN role SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'staff_role_check'
          AND conrelid = 'public.staff'::regclass
    ) THEN
        ALTER TABLE public.staff
            ADD CONSTRAINT staff_role_check
            CHECK (role IN ('doctor', 'assistant', 'cashier', 'staff'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_staff_org_role
    ON public.staff(organization_id, role)
    WHERE is_active = true;

NOTIFY pgrst, 'reload schema';
