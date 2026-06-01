-- Migration 009: Müşteri soft delete
-- Müşteri silinince is_active = false yapılır, veri korunur.

ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_customers_active ON public.customers(organization_id, is_active);

NOTIFY pgrst, 'reload schema';
