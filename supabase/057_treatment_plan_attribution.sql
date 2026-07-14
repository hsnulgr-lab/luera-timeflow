-- ============================================================
-- TimeFlow Migration 057: Tedavi planı sorumlusu ve kaynak randevu
-- ============================================================
-- Planı ve plana bağlı taksitleri sorumlu hekime/randevuya bağlar.
-- created_by klinik personeli değil, işlemi yapan Supabase kullanıcısıdır;
-- staff_id ise ciro ve klinik sorumluluk için kullanılır.
-- ============================================================

ALTER TABLE public.treatment_plans
    ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL;

-- Kolon daha önce elle eklenmiş olsa bile yeni satırlarda oturum kullanıcısını
-- otomatik kaydet. Uygulama da alanı açıkça yollar; default API/SQL eklemelerini kapsar.
ALTER TABLE public.treatment_plans ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.payments ALTER COLUMN created_by SET DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_treatment_plans_reservation
    ON public.treatment_plans(reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_treatment_plans_staff
    ON public.treatment_plans(staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_treatment_plans_created_by
    ON public.treatment_plans(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_created_by
    ON public.payments(created_by) WHERE created_by IS NOT NULL;

-- Eski planlarda diş kaydına hekim yazılmışsa bunu plana taşı.
WITH dental_source AS (
    SELECT DISTINCT ON (treatment_plan_id)
        treatment_plan_id,
        staff_id
    FROM public.dental_records
    WHERE treatment_plan_id IS NOT NULL AND staff_id IS NOT NULL
    ORDER BY treatment_plan_id, created_at ASC
)
UPDATE public.treatment_plans AS plan
SET staff_id = source.staff_id
FROM dental_source AS source
WHERE plan.id = source.treatment_plan_id
  AND plan.staff_id IS NULL;

-- Daha önce tahsilata yazılmış güvenilir bağları plana geri taşı.
WITH payment_source AS (
    SELECT DISTINCT ON (treatment_plan_id)
        treatment_plan_id,
        staff_id,
        reservation_id
    FROM public.payments
    WHERE treatment_plan_id IS NOT NULL
      AND (staff_id IS NOT NULL OR reservation_id IS NOT NULL)
    ORDER BY treatment_plan_id, paid_at ASC, created_at ASC
)
UPDATE public.treatment_plans AS plan
SET staff_id = COALESCE(plan.staff_id, source.staff_id),
    reservation_id = COALESCE(plan.reservation_id, source.reservation_id)
FROM payment_source AS source
WHERE plan.id = source.treatment_plan_id
  AND (plan.staff_id IS NULL OR plan.reservation_id IS NULL);

-- Planın sorumlusu/kaynak randevusu biliniyorsa eski taksitlerdeki boşlukları
-- doldur. Var olan tahsilat atıfları kesinlikle değiştirilmez.
UPDATE public.payments AS payment
SET staff_id = COALESCE(payment.staff_id, plan.staff_id),
    reservation_id = COALESCE(payment.reservation_id, plan.reservation_id)
FROM public.treatment_plans AS plan
WHERE payment.treatment_plan_id = plan.id
  AND (payment.staff_id IS NULL OR payment.reservation_id IS NULL)
  AND (plan.staff_id IS NOT NULL OR plan.reservation_id IS NOT NULL);

NOTIFY pgrst, 'reload schema';
