-- ============================================================
-- TimeFlow Migration 056: Diş modülü — yüzey işaretleme + plan senkronu + recall
-- ============================================================
-- 1) dental_records.surfaces: MODBL yüzey işaretleme (M=Mesial, O=Oklüzal,
--    D=Distal, B=Bukkal, L=Lingual). Boş dizi = tüm diş (kron/implant/çekildi
--    gibi dişin tamamını ilgilendiren durumlar).
-- 2) dental_records.record_type: 'existing' (mevcut durum) | 'planned'
--    (planlanan işlem). Planlanan kayıt treatment_plan_id ile tedavi planına
--    bağlanır; plan tamamlanınca şemaya 'existing' kaydı düşülür (append-only).
-- 3) customers.recall_date: bir sonraki kontrol çağrısı tarihi (recall).
-- ============================================================

ALTER TABLE public.dental_records
    ADD COLUMN IF NOT EXISTS surfaces TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS record_type TEXT NOT NULL DEFAULT 'existing'
        CHECK (record_type IN ('existing', 'planned')),
    ADD COLUMN IF NOT EXISTS treatment_plan_id UUID
        REFERENCES public.treatment_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dental_records_plan
    ON public.dental_records(treatment_plan_id) WHERE treatment_plan_id IS NOT NULL;

ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS recall_date DATE;

CREATE INDEX IF NOT EXISTS idx_customers_recall
    ON public.customers(organization_id, recall_date) WHERE recall_date IS NOT NULL;

NOTIFY pgrst, 'reload schema';
