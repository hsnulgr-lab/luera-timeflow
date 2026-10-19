-- ============================================================
-- 121 · Apple/Google ile giriş — kuru koşu kontrolü (canlıda GERİ SARILIR)
-- ============================================================
-- Kullanım (üretimde, hiçbir iz bırakmaz):
--   { echo 'BEGIN;'; sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' supabase/121_sosyal_giris.sql;
--     cat supabase/tests/sosyal_giris_regression.sql; echo 'ROLLBACK;'; } | psql … -f -
--
-- Sorduğu:
--   1. Google / Apple ile açılan hesaba işletme AÇILMIYOR (ne org, ne üye, ne settings).
--   2. E-postayla kayıt ESKİSİ GİBİ işletme açıyor (üretimdeki kayıt akışı).
--   3. create_own_business: işletmeyi açar; iki kez çağrılınca İKİNCİYİ açmaz.
--   4. prune: yalnız 24 saattir işletmesiz Apple/Google hesabını siler —
--      işletmeli olanı, taze olanı ve e-posta hesabını silmez; kimlik
--      kayıtları kullanıcıyla gider.
--   5. Yetki: anon create_own_business'ı, authenticated prune'u çağıramaz;
--      authenticated create_own_business'ı çağırabilir.
-- Fikstür e-postaları `@example.invalid` — gerçek bir adrese değmez.
-- ============================================================

DO $$
DECLARE
    g   uuid := gen_random_uuid();   -- Google, işletme açacak
    a   uuid := gen_random_uuid();   -- Apple, köprüde bıraktı (eski, işletmesiz)
    f   uuid := gen_random_uuid();   -- Apple, taze (< 24 sa), işletmesiz
    e   uuid := gen_random_uuid();   -- e-posta ile kayıt
    org1 uuid;
    org2 uuid;
    n   int;
BEGIN
    INSERT INTO auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES
        (g, 'kuru-g-' || g || '@example.invalid', 'authenticated', 'authenticated', '{"provider":"google","providers":["google"]}', '{}', now(), now()),
        (a, 'kuru-a-' || a || '@example.invalid', 'authenticated', 'authenticated', '{"provider":"apple","providers":["apple"]}',   '{}', now(), now()),
        (f, 'kuru-f-' || f || '@example.invalid', 'authenticated', 'authenticated', '{"provider":"apple","providers":["apple"]}',   '{}', now(), now()),
        (e, 'kuru-e-' || e || '@example.invalid', 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}',   '{}', now(), now());

    -- 1 · Apple/Google → işletme yok
    SELECT count(*) INTO n FROM public.organizations WHERE owner_id IN (g, a, f);
    IF n <> 0 THEN RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: Apple/Google hesabına işletme açıldı (%)', n; END IF;
    SELECT count(*) INTO n FROM public.organization_members WHERE user_id IN (g, a, f);
    IF n <> 0 THEN RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: Apple/Google hesabı bir işletmeye üye yapıldı'; END IF;
    SELECT count(*) INTO n FROM public.settings WHERE user_id IN (g, a, f);
    IF n <> 0 THEN RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: Apple/Google hesabına settings satırı açıldı'; END IF;

    -- 2 · E-posta → akış değişmedi
    SELECT count(*) INTO n FROM public.organizations WHERE owner_id = e;
    IF n <> 1 THEN RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: e-postayla kayıt işletme açmadı (%)', n; END IF;
    SELECT count(*) INTO n FROM public.organization_members WHERE user_id = e AND role = 'owner';
    IF n <> 1 THEN RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: e-posta hesabı işletmesine sahip olarak eklenmedi'; END IF;
    SELECT count(*) INTO n FROM public.settings WHERE user_id = e AND organization_id IS NOT NULL;
    IF n <> 1 THEN RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: e-posta hesabının settings satırı yok ya da işletmesiz'; END IF;

    -- 3 · create_own_business — Google hesabı adına
    PERFORM set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
    org1 := public.create_own_business();
    org2 := public.create_own_business();
    IF org1 IS NULL OR org1 IS DISTINCT FROM org2 THEN
        RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: ikinci çağrı başka bir işletme döndürdü (% / %)', org1, org2;
    END IF;
    SELECT count(*) INTO n FROM public.organizations WHERE owner_id = g;
    IF n <> 1 THEN RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: create_own_business % işletme açtı', n; END IF;
    SELECT count(*) INTO n FROM public.organization_members WHERE user_id = g AND org_id = org1 AND role = 'owner';
    IF n <> 1 THEN RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: kişi kendi işletmesine sahip olarak eklenmedi'; END IF;
    SELECT count(*) INTO n FROM public.settings WHERE user_id = g AND organization_id = org1;
    IF n <> 1 THEN RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: yeni işletmenin settings satırı yok'; END IF;
    -- E-posta hesabı adına: zaten işletmesi var → yenisi açılmaz.
    PERFORM set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
    org2 := public.create_own_business();
    SELECT count(*) INTO n FROM public.organizations WHERE owner_id = e;
    IF n <> 1 OR org2 IS NULL THEN RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: işletmesi olan kişiye ikinci işletme açıldı'; END IF;
    PERFORM set_config('request.jwt.claims', '', true);

    -- 4 · Temizlik
    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
    VALUES ('kuru-' || a, a, json_build_object('sub', 'kuru-' || a)::jsonb, 'apple', now(), now());
    UPDATE auth.users SET created_at = now() - interval '25 hours' WHERE id IN (g, a, e);
    PERFORM public.prune_orphan_social_users();
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = a) THEN
        RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: 24 saattir işletmesiz Apple hesabı silinmedi';
    END IF;
    IF EXISTS (SELECT 1 FROM auth.identities WHERE user_id = a) THEN
        RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: silinen hesabın kimlik kaydı kaldı';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = g) THEN
        RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: işletmesi olan Google hesabı silindi';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = f) THEN
        RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: 24 saati dolmamış hesap silindi';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = e) THEN
        RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: e-posta hesabı silindi';
    END IF;

    RAISE NOTICE 'KURU KOŞU 1–4 GEÇTİ';
END $$;

-- 5 · Yetki — kullanıcı adına ret, DO bloğunda yakalanır.
SET LOCAL ROLE anon;
DO $$
BEGIN
    PERFORM public.create_own_business();
    RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: anon create_own_business çağırabildi';
EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'permission denied%' THEN RAISE; END IF;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
    PERFORM public.prune_orphan_social_users();
    RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: authenticated prune_orphan_social_users çağırabildi';
EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'permission denied%' THEN RAISE; END IF;
END $$;
-- Oturumsuz çağrı: yetki var ama kimlik yok → 'not_authenticated'.
DO $$
BEGIN
    PERFORM public.create_own_business();
    RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: kimliksiz create_own_business işletme açtı';
EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'not_authenticated' THEN RAISE; END IF;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'KURU KOŞU GEÇTİ (121) — hepsi geri sarılacak'; END $$;
