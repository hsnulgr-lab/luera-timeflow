-- ============================================================
-- TimeFlow Migration 014: Tekrar Eden Randevular
-- ============================================================
-- Düzenli müşteriler için haftalık/aylık tekrar kuralı.
-- generate-recurring edge function (n8n cron) bu alanlara bakıp
-- bir sonraki tekrarı üretir. recurrence_parent_id zincirin
-- köküne işaret eder (idempotent üretim için).
-- ============================================================

ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS recurrence_rule      TEXT CHECK (recurrence_rule IN ('weekly','monthly')),
    ADD COLUMN IF NOT EXISTS recurrence_until     DATE,
    ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_recurrence
    ON public.reservations(recurrence_rule)
    WHERE recurrence_rule IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_recurrence_parent
    ON public.reservations(recurrence_parent_id)
    WHERE recurrence_parent_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
