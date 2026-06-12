-- ============================================================
-- LUERA CORE tarafı — has_active_subscription RPC
-- ============================================================
-- ⚠️  Bu dosya TimeFlow'a DEĞİL, LUERA Core Supabase'ine
--     (core.lueratech.com) uygulanır. Burada yalnızca SÖZLEŞME
--     olarak tutuluyor; TimeFlow gateway Edge Function'ı bu
--     imzayı çağırıyor (supabase/functions/gateway/index.ts → checkSubscription).
--
-- Çağrı imzası (TimeFlow gateway'in beklediği):
--   has_active_subscription(p_org_id UUID, p_module TEXT) RETURNS BOOLEAN
--
-- Dönüş: organizasyonun verilen modüle AKTİF aboneliği varsa true.
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_active_subscription(
    p_org_id UUID,
    p_module TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM subscriptions s
        WHERE s.organization_id = p_org_id
          AND s.module          = p_module
          AND s.status          = 'active'
          AND (s.expires_at IS NULL OR s.expires_at > now())
    );
$$;

-- NOT: subscriptions tablosunun gerçek kolon adları Core şemasına göre
-- ayarlanmalı (module / module_key, status / state, expires_at / valid_until).
-- Yukarıdaki imza TimeFlow'un beklediği p_org_id + p_module + boolean dönüşüdür;
-- gövdeyi Core şemasına uydur.

NOTIFY pgrst, 'reload schema';
