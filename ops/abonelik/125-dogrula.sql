-- 125 · doğrulama — göçten sonra ya da kuru koşunun içinde çalışır.
-- KALICI HİÇBİR ŞEY YAZMAZ: §4'teki ayırma denemesi bir alt işlemde yapılır
-- ve aynı blokta geri alınır. Sır ve e-posta adresi basmaz.

\echo '── 1 · Defter tablosu ve tekillik (1 satır, abonelik_eposta_tek)'
SELECT conname
FROM pg_constraint
WHERE conrelid = 'public.abonelik_eposta'::regclass AND contype = 'u';

\echo '── 2 · RLS açık (t beklenir)'
SELECT relrowsecurity AS rls
FROM pg_class
WHERE oid = 'public.abonelik_eposta'::regclass;

\echo '── 3 · Fonksiyon TEK imza: abonelik_eposta_ayir(uuid,text,text,uuid)'
SELECT p.oid::regprocedure AS imza
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'abonelik_eposta_ayir';

\echo '── 4 · Yetkiler (istemci f f f f · service_role t t beklenir)'
SELECT has_table_privilege('authenticated', 'public.abonelik_eposta', 'SELECT')                                AS istemci_okur,
       has_table_privilege('anon', 'public.abonelik_eposta', 'SELECT')                                         AS anon_okur,
       has_function_privilege('authenticated', 'public.abonelik_eposta_ayir(uuid,text,text,uuid)', 'EXECUTE')  AS istemci_ayirir,
       has_function_privilege('anon', 'public.abonelik_eposta_ayir(uuid,text,text,uuid)', 'EXECUTE')           AS anon_ayirir,
       has_function_privilege('service_role', 'public.abonelik_eposta_ayir(uuid,text,text,uuid)', 'EXECUTE')   AS servis_ayirir,
       has_table_privilege('service_role', 'public.abonelik_eposta', 'INSERT')                                 AS servis_yazar;

\echo '── 5 · Ayırma (geri alınır): ilk → satır · ikinci → boş · hata → yeniden (deneme 2)'
DO $$
DECLARE
    v_org  uuid;
    v_ilk  int := -1;
    v_iki  int := -1;
    v_uc   smallint := -1;
BEGIN
    SELECT id INTO v_org FROM organizations ORDER BY created_at LIMIT 1;
    BEGIN
        SELECT count(*) INTO v_ilk FROM abonelik_eposta_ayir(v_org, 'son', '125-dogrula', NULL);
        SELECT count(*) INTO v_iki FROM abonelik_eposta_ayir(v_org, 'son', '125-dogrula', NULL);
        UPDATE abonelik_eposta SET durum = 'hata' WHERE organization_id = v_org AND donem = '125-dogrula';
        SELECT deneme INTO v_uc FROM abonelik_eposta_ayir(v_org, 'son', '125-dogrula', NULL);
        RAISE EXCEPTION 'GERI_AL';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'GERI_AL' THEN RAISE; END IF;
    END;
    RAISE NOTICE 'ilk ayırma: % satır (1) · ikinci: % (0) · hatadan sonra deneme: % (2) — GERİ ALINDI', v_ilk, v_iki, v_uc;
END $$;

\echo '── 6 · Defterde kalan deneme satırı yok (0 beklenir)'
SELECT count(*) AS kalan FROM abonelik_eposta WHERE donem = '125-dogrula';

\echo '── 7 · Anahtarlar (yalnız var mı; değer basılmaz)'
SELECT key,
       CASE WHEN key IN ('ABONELIK_EPOSTA', 'ENTITLEMENT_ENFORCE') THEN value ELSE length(value)::text || ' karakter' END AS deger
FROM app_secrets
WHERE key IN ('ABONELIK_EPOSTA', 'ENTITLEMENT_ENFORCE', 'RESEND_API_KEY', 'CRON_TRIGGER_SECRET')
ORDER BY key;
