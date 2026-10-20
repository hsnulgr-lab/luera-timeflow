-- ============================================================
-- TimeFlow Migration 124: Telefondan açılan işletmeye kartsız 7 gün deneme
-- ============================================================
-- Kurallar: docs/abonelik-kurallari.md (2026-10-20). Idempotent.
--
-- ── Neden ───────────────────────────────────────────────────────────────────
-- Kayıt yolları (e-posta: `handle_new_user` tetikleyicisi · Apple/Google:
-- `create_own_business`) işletme açıyor ama abonelik satırı YAZMIYOR. Kapı
-- (ENTITLEMENT_ENFORCE) açıldığı gün telefondan kaydolan herkes ilk dakikadan
-- kapalı kapıya düşerdi — telefonda ödeme gösterilemez (App Store 3.1.1), yani
-- önünde hiçbir yol olmazdı. Devir 10 §7 madde 6.
--
-- ── Kural ───────────────────────────────────────────────────────────────────
-- Masaüstü kayıt `kaynak = 'web'` etiketi gönderir; deneme orada kurulumun
-- sonunda Dodo'da KARTLA başlar (bu göç masaüstüne satır yazmaz). Etiketsiz
-- açılan her işletme telefondandır ve açıldığı an KARTSIZ 7 gün alır.
-- Yayındaki telefon sürümü (1.0.1) değişmeden bu kurala uyar: hiç etiket
-- göndermiyor.
--
-- Etiket nereden okunur:
--   • Apple/Google → `create_own_business(p_kaynak)` işlem-yerel bir ayar
--     yazar (`app.kayit_kaynagi`), aynı işlemdeki tetikleyici onu okur.
--   • E-posta → `supabase.auth.signUp({ options: { data: { kaynak } } })`
--     → `auth.users.raw_user_meta_data->>'kaynak'`.
--
-- ── Neden işletme tablosunda bir tetikleyici ────────────────────────────────
-- `handle_new_user` ÜRETİMDEKİ kayıt akışıdır (121'in notu); gövdesine
-- dokunmamak için kural ayrı bir AFTER INSERT tetikleyicisinde. İki kayıt yolu
-- da `organizations`a satır ekliyor, ikisini birden kapsıyor.
--
-- Satır zaten varsa (demo tohumu, elle yazılmış) DOKUNULMAZ: ON CONFLICT DO
-- NOTHING. Demo tohumu sonra kendi satırını "active, süresiz" diye ezer.
--
-- Bu satır kapı KAPALIYKEN hiçbir şeyi kilitlemez (has_timeflow_access ve
-- checkAccess bayrak kapalıyken herkese true). Kapı açılmadan önce
-- `ops/abonelik/acilis-deneme.sql` kartsız denemesi bitmiş işletmelere açılış
-- gününden başlayan yeni 7 gün verir.
--
-- ⚠️ CANLIYA ÇIKIŞ: Faz 2.4 (kartsız denemedeki salonun abonelik ekranı ve
-- paket alabilmesi) ile BİRLİKTE — yoksa telefondan açılan salon web'de
-- Dodo'suz bir aboneliğin düğmelerini görür.
-- ============================================================

BEGIN;

-- 1) Kural — işletme açılınca, etiket 'web' değilse kartsız 7 gün.
CREATE OR REPLACE FUNCTION public.grant_phone_trial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_kaynak text := NULLIF(current_setting('app.kayit_kaynagi', true), '');
BEGIN
    IF v_kaynak IS NULL AND NEW.owner_id IS NOT NULL THEN
        SELECT NULLIF(u.raw_user_meta_data->>'kaynak', '') INTO v_kaynak
        FROM auth.users u
        WHERE u.id = NEW.owner_id;
    END IF;

    IF v_kaynak = 'web' THEN
        RETURN NEW;
    END IF;

    INSERT INTO org_entitlement (organization_id, state, plan, trial_ends_at, expires_at, last_event, updated_at)
    VALUES (NEW.id, 'trial', 'pro', now() + interval '7 days', now() + interval '7 days', 'trial_phone', now())
    ON CONFLICT (organization_id) DO NOTHING;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.grant_phone_trial() IS
    '124 · Etiketsiz (telefondan) açılan işletmeye kartsız 7 gün deneme; masaüstü (kaynak=web) hariç. docs/abonelik-kurallari.md';

-- Yalnız tetikleyici çağırır; istemciye kapalı.
REVOKE ALL ON FUNCTION public.grant_phone_trial() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_phone_trial() FROM anon;
REVOKE ALL ON FUNCTION public.grant_phone_trial() FROM authenticated;

DROP TRIGGER IF EXISTS organizations_phone_trial ON public.organizations;
CREATE TRIGGER organizations_phone_trial
    AFTER INSERT ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.grant_phone_trial();

-- 2) create_own_business — kaynak etiketi. Gövde 121 ile AYNI; eklenen tek
--    şey etiketin işlem-yerel ayara yazılması.
--
--    Eski imza (parametresiz) SİLİNİR: iki imza yan yana kalsaydı PostgREST
--    parametresiz `rpc('create_own_business')` çağrısında hangisini seçeceğini
--    bilemez, yayındaki telefon kaydı bozulurdu. Tek imza + varsayılan NULL:
--    parametresiz çağrı (telefon 1.0.1) aynen çalışır.
DROP FUNCTION IF EXISTS public.create_own_business();

CREATE OR REPLACE FUNCTION public.create_own_business(p_kaynak text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user  uuid := auth.uid();
    v_org   uuid;
    v_name  text;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;

    -- Aynı kişi için iki eşzamanlı çağrı iki işletme açmasın.
    PERFORM pg_advisory_xact_lock(hashtext('create_own_business:' || v_user::text));

    SELECT m.org_id INTO v_org
    FROM organization_members m
    WHERE m.user_id = v_user
    LIMIT 1;
    IF v_org IS NOT NULL THEN
        RETURN v_org;
    END IF;

    -- 124: tanınan tek etiket 'web'; başka her değer etiketsiz sayılır.
    PERFORM set_config('app.kayit_kaynagi', CASE WHEN p_kaynak = 'web' THEN 'web' ELSE '' END, true);

    -- Ad: e-postayla kayıttaki gibi (tetikleyiciyle aynı kural); kişi asıl
    -- adı Kurulum'da (masaüstü) ya da İşletmeniz adımında (telefon) yazar.
    SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'name', ''), u.email)
    INTO v_name
    FROM auth.users u
    WHERE u.id = v_user;

    INSERT INTO organizations (name, owner_id)
    VALUES (COALESCE(v_name, 'Workspace'), v_user)
    RETURNING id INTO v_org;
    INSERT INTO organization_members (org_id, user_id, role)
    VALUES (v_org, v_user, 'owner')
    ON CONFLICT DO NOTHING;
    INSERT INTO settings (user_id, organization_id, business_name)
    VALUES (v_user, v_org, COALESCE(v_name, 'Luera TimeFlow'))
    ON CONFLICT DO NOTHING;
    RETURN v_org;
END;
$function$;

COMMENT ON FUNCTION public.create_own_business(text) IS
    '121 · Kişinin kendi işletmesini açar; varsa onu döndürür. 124 · p_kaynak=''web'' masaüstü; parametresiz = telefon (kartsız deneme).';

REVOKE ALL ON FUNCTION public.create_own_business(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_own_business(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_own_business(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
