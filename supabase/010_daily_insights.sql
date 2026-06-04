-- Migration 010: AI Günlük İçgörü cache tablosu
-- Her organizasyon için günde bir kez Groq'tan içgörü üretilir ve burada saklanır.
-- Aynı gün tekrar istenirse cache'ten döner (Groq limitini ve maliyeti korur).

CREATE TABLE IF NOT EXISTS public.daily_insights (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    date            DATE        NOT NULL,
    insight         TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_insights_org_date
    ON public.daily_insights(organization_id, date);

-- RLS: kullanıcılar sadece kendi org'unun içgörüsünü okur
ALTER TABLE public.daily_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_insights_org_read" ON public.daily_insights;
CREATE POLICY "daily_insights_org_read" ON public.daily_insights
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()));

NOTIFY pgrst, 'reload schema';
