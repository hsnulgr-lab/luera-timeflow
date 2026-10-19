-- 123 · doğrulama — SALT OKUNUR (göçten sonra ya da kuru koşunun içinde).
-- Hiçbir satır yazmaz, sır basmaz.

\echo '── 1 · Aynanın yeni kolonları (5 beklenir)'
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'org_entitlement'
  AND column_name IN ('dodo_subscription_id', 'dodo_customer_id', 'cancel_at_period_end', 'cancelled_at', 'dodo_event_at')
ORDER BY column_name;

\echo '── 2 · Olay defteri var, istemci rollerine KAPALI (0 satır beklenir)'
SELECT to_regclass('public.dodo_events') AS defter;
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'dodo_events'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC');

\echo '── 3 · Kapı yeni biçimde (t beklenir)'
SELECT pg_get_functiondef('public.has_timeflow_access(uuid)'::regprocedure)
       LIKE '%WHEN e.state = ''grace''%' AS kapi_123;

\echo '── 4 · ENFORCE kapalıyken kimse kilitli değil (kilitli = 0 beklenir)'
SELECT COALESCE((SELECT value FROM app_secrets WHERE key = 'ENTITLEMENT_ENFORCE'), '(yok)') AS enforce,
       count(*) FILTER (WHERE NOT public.has_timeflow_access(o.id)) AS kilitli,
       count(*) AS isletme
FROM organizations o;

\echo '── 5 · Ayna (Dodo kimliği ilk abonelik olayında dolar)'
SELECT left(organization_id::text, 8) AS org, state, plan, cycle,
       to_char(expires_at, 'YYYY-MM-DD') AS bitis,
       dodo_subscription_id IS NOT NULL AS dodo_kimligi,
       cancel_at_period_end AS iptal_bekliyor, last_event
FROM org_entitlement
ORDER BY updated_at DESC;
