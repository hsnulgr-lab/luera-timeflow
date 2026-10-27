-- 128 · doğrulama — göçten sonra çalışır. KALICI HİÇBİR ŞEY YAZMAZ, sır basmaz.

\echo '── 1 · Üç politika has_setup_access ile, okuma koşulu kapısız (3 satır, f beklenir)'
SELECT tablename,
       (with_check LIKE '%has_setup_access%') AS kurulum_kapisi,
       (qual LIKE '%access%')                 AS okuma_kapali
FROM pg_policies
WHERE schemaname = 'public' AND policyname IN ('staff_org_access', 'resources_org_access', 'services_org_access')
ORDER BY tablename;

\echo '── 2 · Öbür tablolar hâlâ has_timeflow_access (reservations, customers, payments → t)'
SELECT tablename, (with_check LIKE '%has_timeflow_access%') AS abonelik_kapisi
FROM pg_policies
WHERE schemaname = 'public' AND policyname IN ('reservations_org_access', 'customers_org_access', 'payments_org_access')
ORDER BY tablename;

\echo '── 3 · Kurulum yazabilen ama ürünü kullanamayan işletmeler (= satırsız web kayıtları)'
SELECT o.id, o.created_at::date AS acilis, o.name
FROM organizations o
WHERE public.has_setup_access(o.id) AND NOT public.has_timeflow_access(o.id)
ORDER BY o.created_at DESC;
