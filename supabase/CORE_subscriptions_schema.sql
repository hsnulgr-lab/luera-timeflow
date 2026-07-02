-- ============================================================
-- LUERA CORE tarafı — abonelik şeması SÖZLEŞMESİ + billing_events
-- ============================================================
-- ⚠️  Bu dosya TimeFlow'a DEĞİL, LUERA Core Supabase'ine
--     (core.lueratech.com) uygulanır.
--
-- DURUM (2026-07-02, canlı Core'dan doğrulandı):
--   public.subscriptions ZATEN VAR ve aşağıdaki gerçek şemaya sahip —
--   bu tabloya DOKUNMAYIN, TimeFlow ona uyum sağlar:
--
--     organization_id UUID NOT NULL → organizations(id)  (FK, CASCADE)
--     module_name     TEXT NOT NULL → module_registry(module_name)
--     status          TEXT: 'trial'|'active'|'past_due'|'cancelled'|'expired'
--                     CHECK: (status='cancelled') = (cancelled_at IS NOT NULL)
--     plan_tier       TEXT: 'free'|'starter'|'growth'|'enterprise'|'custom'
--     provider        TEXT        (TimeFlow: 'dodo')
--     provider_ref    TEXT        (TimeFlow: Dodo subscription id)
--     metadata        JSONB       (TimeFlow: plan, cycle, cancel_at_period_end,
--                                  cancelled_at, dodo_customer_id, customer_email)
--     expires_at, trial_ends_at, cancelled_at, usage_limits, created/updated_at
--     UNIQUE (organization_id, module_name) WHERE status IN ('trial','active','past_due')
--
--   RPC public.has_active_subscription(p_org_id UUID, p_module_name TEXT)
--   ZATEN VAR: status IN ('trial','active') AND expires_at/trial_ends_at kontrolü.
--
-- TimeFlow plan eşlemesi (plan_tier CHECK'i nedeniyle):
--   baslangic → starter, pro → growth, isletme → enterprise
--   (orijinal plan adı metadata.plan'da saklanır)
--
-- İptal semantiği: Dodo subscription.cancelled geldiğinde status 'active'
-- KALIR (RPC dönem sonuna dek true dönsün diye); metadata.cancel_at_period_end
-- = true yazılır. cancelled_at kolonu KULLANILMAZ (status tutarlılık CHECK'i
-- yüzünden) — iptal zamanı metadata.cancelled_at'te tutulur. Süre dolunca
-- expires_at kontrolü erişimi kendiliğinden keser.
--
-- Aşağıdaki bölüm Core'a UYGULANACAK tek yeniliktir: billing_events.
-- ============================================================

-- Ödeme/fatura geçmişi — TimeFlow BillingTab "Faturalar" tablosunu besler,
-- dodo_webhook_id ile webhook idempotency sağlar.
-- organization_id bilinçli olarak FK'sız: webhook org'u çözemese de event kaydedilir.
CREATE TABLE IF NOT EXISTS public.billing_events (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID,
    module_name      TEXT NOT NULL DEFAULT 'timeflow',
    dodo_payment_id  TEXT,
    dodo_webhook_id  TEXT,                           -- Standard Webhooks webhook-id header'ı
    event_type       TEXT NOT NULL DEFAULT 'unknown',
    amount           NUMERIC(12,2),                  -- TL (kuruştan /100 çevrilmiş)
    currency         TEXT,                           -- 'TRY'
    invoice_url      TEXT,
    occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    raw              JSONB
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_events_payment
    ON public.billing_events (dodo_payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_events_webhook
    ON public.billing_events (dodo_webhook_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_org_occurred
    ON public.billing_events (organization_id, occurred_at DESC);

-- Yalnızca service-role erişir: RLS açık, policy YOK.
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
