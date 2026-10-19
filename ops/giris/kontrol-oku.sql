-- ============================================================
-- Giriş · Apple/Google öncesi SALT OKUNUR kontrol (devir 11 · §A)
-- ============================================================
-- Hiçbir şey yazmaz: READ ONLY işlem + sonda ROLLBACK.
-- E-postalar maskeli (ilk 2 harf + alan adı) — çıktı sohbete
-- yapıştırılabilsin.
--
-- Kullanım (kullanıcı, ~ içinde):
--   ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres \
--     supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 -f -' < ~/Projects/luera-timeflow/ops/giris/kontrol-oku.sql
-- ============================================================

BEGIN TRANSACTION READ ONLY;

\echo '── 1 · Canlı handle_new_user tanımı (repo 006 ile karşılaştırılacak)'
SELECT pg_get_functiondef('public.handle_new_user'::regproc);

\echo '── 2 · auth.users üzerindeki tetikleyiciler'
SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS def
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal;

\echo '── 3 · create_own_business / prune fonksiyonu zaten var mı (olmamalı)'
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('create_own_business', 'prune_orphan_social_users', 'provision_owner_org');

\echo '── 4 · Giriş yöntemlerine göre kullanıcı sayısı'
SELECT i.provider, count(DISTINCT i.user_id) AS kullanici
FROM auth.identities i
GROUP BY i.provider
ORDER BY 2 DESC;

\echo '── 5 · Hesap listesi (karar 11) — en yeni üstte'
SELECT
    left(split_part(u.email, '@', 1), 2) || '***@' || split_part(u.email, '@', 2) AS eposta,
    u.created_at::date                                  AS acildi,
    u.last_sign_in_at::date                             AS son_giris,
    (u.email_confirmed_at IS NOT NULL)                  AS onayli,
    u.raw_app_meta_data -> 'providers'                  AS yontem,
    (SELECT count(*) FROM public.organization_members m WHERE m.user_id = u.id) AS isletme,
    (SELECT count(*) FROM public.customers c
       WHERE c.organization_id IN (SELECT m.org_id FROM public.organization_members m WHERE m.user_id = u.id)) AS musteri,
    (SELECT count(*) FROM public.reservations r
       WHERE r.organization_id IN (SELECT m.org_id FROM public.organization_members m WHERE m.user_id = u.id)) AS randevu
FROM auth.users u
ORDER BY u.created_at DESC;

\echo '── 6 · Aynı e-postayla birden çok hesap (olmamalı)'
SELECT left(split_part(lower(email), '@', 1), 2) || '***@' || split_part(lower(email), '@', 2) AS eposta, count(*)
FROM auth.users
GROUP BY lower(email)
HAVING count(*) > 1;

ROLLBACK;
