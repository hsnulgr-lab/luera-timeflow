-- ============================================================
-- LUERA CORE tarafı — has_active_subscription RPC (SÖZLEŞME)
-- ============================================================
-- ⚠️  Bu dosya TimeFlow'a DEĞİL, LUERA Core Supabase'ine aittir.
--
-- DURUM (2026-07-02, canlı Core'dan doğrulandı): Bu RPC Core'da
-- ZATEN MEVCUT ve aşağıdaki gövdeye sahip — yeniden uygulamak
-- gerekmez, dosya yalnızca sözleşme referansıdır.
--
-- DİKKAT: İkinci parametrenin adı p_module_name'dir (p_module DEĞİL).
-- TimeFlow gateway'i RPC'yi { p_org_id, p_module_name } ile çağırır
-- (supabase/functions/gateway/index.ts → checkSubscription).
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_active_subscription(
    p_org_id UUID,
    p_module_name TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.subscriptions
        WHERE organization_id = p_org_id
          AND module_name     = p_module_name
          AND status IN ('trial', 'active')
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (trial_ends_at IS NULL OR status <> 'trial' OR trial_ends_at > NOW())
    );
$$;
