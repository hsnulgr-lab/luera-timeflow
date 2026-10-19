-- ============================================================
-- TimeFlow Migration 121: Apple / Google ile giriş — sunucu ayağı
-- ============================================================
-- Kararlar: docs/giris-kararlar.md (1–3). Devir: docs/devir/11-GIRIS-APPLE-GOOGLE.md
-- Idempotent — defalarca çalıştırılabilir.
--
-- ── Ne değişiyor ────────────────────────────────────────────────────────────
-- 1. `handle_new_user`: Apple/Google ile AÇILAN yeni hesaba işletme
--    kendiliğinden AÇILMAZ. Girişten yanlış kapıdan gelen kişiye sessizce boş
--    salon açılmasın; istemci "Bu hesapla bir işletme bulamadık" köprüsünü
--    gösterir ve sorar (karar 3).
--    E-postayla kayıt akışı HARFİ HARFİNE aynı: gövde, canlıdaki tanımdan
--    (2026-10-19, `pg_get_functiondef`) kopyalandı — repodaki 006 değil.
--    Bu tetikleyici ÜRETİMDEKİ kayıt akışı (bkz. 108'in notu): tek eklenen
--    şey baştaki erken dönüş.
--
-- 2. `create_own_business()`: kişinin kendi işletmesini açar. Köprüdeki
--    "Yeni işletme oluştur" ve Apple/Google ile kayıt bunu çağırır (istemci:
--    `supabase.rpc('create_own_business')` — ad sabit). Zaten işletmesi
--    varsa YENİSİNİ AÇMAZ, onu döndürür (çift tıklama, yeniden deneme).
--
-- 3. `prune_orphan_social_users()`: Apple/Google ile açılıp 24 saattir
--    hiçbir işletmeye bağlanmamış hesapları siler. Köprüde uygulama
--    kapatılırsa arkada kalan boş hesap (karar 3). Günlük VPS cron'u çağırır;
--    istemciye KAPALI.
--
-- ── Neden provider alanı ────────────────────────────────────────────────────
-- GoTrue yeni kullanıcıyı eklerken `raw_app_meta_data.provider`'ı INSERT'ten
-- ÖNCE yazıyor ('email' | 'apple' | 'google'). Var olan bir e-posta hesabına
-- Apple/Google BAĞLANIRSA yeni kullanıcı eklenmez — tetikleyici hiç çalışmaz.
--
-- ── Yetki ───────────────────────────────────────────────────────────────────
-- 094'ten beri yeni fonksiyonlar varsayılan olarak anon'a da açılıyor: her
-- fonksiyonun EXECUTE'u burada AÇIKÇA düzenleniyor.
-- ============================================================

BEGIN;

-- 1) Kayıt tetikleyicisi — Apple/Google'a işletme açma.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    new_org_id UUID;
    display_name TEXT;
BEGIN
    -- 121: Apple/Google ile açılan hesaba işletme ancak kişi "Yeni işletme
    -- oluştur" deyince açılır (create_own_business). Bkz. dosya başı.
    IF COALESCE(NEW.raw_app_meta_data->>'provider', 'email') IN ('apple', 'google') THEN
        RETURN NEW;
    END IF;

    display_name := COALESCE(NEW.raw_user_meta_data->>'name', NEW.email);

    IF NOT EXISTS (SELECT 1 FROM organizations WHERE owner_id = NEW.id) THEN
        INSERT INTO organizations (name, owner_id)
        VALUES (COALESCE(display_name, 'Workspace'), NEW.id)
        RETURNING id INTO new_org_id;
        INSERT INTO organization_members (org_id, user_id, role)
        VALUES (new_org_id, NEW.id, 'owner')
        ON CONFLICT DO NOTHING;
    END IF;
    -- Settings kaydı default olarak açılsın
    INSERT INTO settings (user_id, organization_id, business_name)
    VALUES (NEW.id, new_org_id, COALESCE(display_name, 'Luera TimeFlow'))
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$function$;

-- 2) Kişinin kendi işletmesini aç.
CREATE OR REPLACE FUNCTION public.create_own_business()
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

COMMENT ON FUNCTION public.create_own_business() IS
    '121 · Kişinin kendi işletmesini açar; varsa onu döndürür. Apple/Google köprüsü ve kaydı çağırır.';

REVOKE ALL ON FUNCTION public.create_own_business() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_own_business() FROM anon;
GRANT EXECUTE ON FUNCTION public.create_own_business() TO authenticated;

-- 3) İşletmesiz Apple/Google hesaplarını temizle (24 saat).
CREATE OR REPLACE FUNCTION public.prune_orphan_social_users()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    n integer;
BEGIN
    WITH gone AS (
        DELETE FROM auth.users u
        WHERE u.created_at < now() - interval '24 hours'
          AND COALESCE(u.raw_app_meta_data->>'provider', 'email') IN ('apple', 'google')
          AND NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id = u.id)
          AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.owner_id = u.id)
        RETURNING 1
    )
    SELECT count(*) INTO n FROM gone;
    RETURN n;
END;
$function$;

COMMENT ON FUNCTION public.prune_orphan_social_users() IS
    '121 · 24 saattir işletmesiz kalan Apple/Google hesaplarını siler. Yalnız VPS cron; istemciye kapalı.';

REVOKE ALL ON FUNCTION public.prune_orphan_social_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_orphan_social_users() FROM anon;
REVOKE ALL ON FUNCTION public.prune_orphan_social_users() FROM authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
