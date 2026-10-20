-- 124 · doğrulama — göçten sonra ya da kuru koşunun içinde çalışır.
-- KALICI HİÇBİR ŞEY YAZMAZ: §4'teki deneme işletmeleri bir alt işlemde
-- açılır ve aynı blokta geri alınır. Sır basmaz.

\echo '── 1 · Tetikleyici takılı (organizations_phone_trial, O = etkin)'
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.organizations'::regclass AND tgname = 'organizations_phone_trial';

\echo '── 2 · create_own_business TEK imza: create_own_business(text)'
SELECT p.oid::regprocedure AS imza
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'create_own_business';

\echo '── 3 · Yetkiler (t, f, f beklenir)'
SELECT has_function_privilege('authenticated', 'public.create_own_business(text)', 'EXECUTE') AS kayit_acik,
       has_function_privilege('anon', 'public.create_own_business(text)', 'EXECUTE')          AS anon_yetkisi,
       has_function_privilege('authenticated', 'public.grant_phone_trial()', 'EXECUTE')      AS tetik_istemciye;

\echo '── 4 · Deneme (geri alınır): telefon → trial_phone 7 gün · web → satır yok'
DO $$
DECLARE
    v_owner uuid;
    v_tel   text := '(yok)';
    v_web   bigint := -1;
    v_gun   numeric;
BEGIN
    SELECT id INTO v_owner FROM auth.users
    WHERE COALESCE(raw_user_meta_data->>'kaynak', '') <> 'web'
    ORDER BY created_at LIMIT 1;
    BEGIN
        DECLARE o1 uuid; o2 uuid;
        BEGIN
            INSERT INTO organizations (name, owner_id) VALUES ('124-dogrula-telefon', v_owner) RETURNING id INTO o1;
            SELECT state || ' / ' || last_event, round(extract(epoch FROM expires_at - now()) / 86400, 2)
              INTO v_tel, v_gun FROM org_entitlement WHERE organization_id = o1;
            PERFORM set_config('app.kayit_kaynagi', 'web', true);
            INSERT INTO organizations (name, owner_id) VALUES ('124-dogrula-web', v_owner) RETURNING id INTO o2;
            SELECT count(*) INTO v_web FROM org_entitlement WHERE organization_id = o2;
            RAISE EXCEPTION 'GERI_AL';
        END;
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'GERI_AL' THEN RAISE; END IF;
    END;
    RAISE NOTICE 'telefon: % (% gün) · web satırı: % — ikisi de GERİ ALINDI', v_tel, v_gun, v_web;
END $$;

\echo '── 5 · Var olan işletmelere dokunulmadı (trial_phone = 0 beklenir; tetikleyici yalnız YENİ işletmede)'
SELECT COALESCE(last_event, '(boş)') AS son_olay, state, count(*) AS satir
FROM org_entitlement
GROUP BY 1, 2
ORDER BY 1, 2;
