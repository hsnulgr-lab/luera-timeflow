-- ============================================================
-- TimeFlow Migration 141: Tek kişilik bayrağı kadroyla tutarlı kalır
-- ============================================================
-- 2026-11-10 · Test Salon 2: `organizations.solo = true` ama 4 aktif
-- personel. Telefon tek kişilik kabuğu açtı, `staff-api · solo.session`
-- `not_solo` dedi (bayrak + EN ÇOK BİR aktif personel ister), Gün'den açılan
-- randevu kartı "Randevuyu okuyamadık" gösterdi.
--
-- Bu hâle iki kapı açılıyordu:
--   1. `set_business_mode(true)` (108) personeli olan org'da da bayrağı
--      KOŞULSUZ açıyor — masaüstü kurulumdaki "Yalnız ben", telefondaki mod
--      sorusu. Test Salon 2'nin personeli Haziran–Temmuz'dan; bayrak sonradan
--      bu yolla açılmış.
--   2. Masaüstü tek kişilik org'a personel ekleyebiliyor; bayrak kalıyor.
--      Paket sınırı (`useStaffLimit`) yalnız Tek kişilik pakette soruyor;
--      Ekip/İşletme paketinde ekleme doğrudan geçiyor.
--
-- ── Kullanıcı kararı (2026-11-10) ───────────────────────────────────────────
-- "Hangi paket varsa ona göre şekillensin": Tek kişilik paketteki salon
-- ikinci kişiyi ekleyemez (masaüstünde `useStaffLimit` zaten Ekip'e
-- yükseltmeyi soruyor — değişmedi); Ekip paketindeyse ya da yükseltmeyi
-- onaylarsa ekleme salonu EKİBE ÇEVİRİR. Paket konuşması masaüstünde kalıyor
-- (telefonda Apple 3.1.1); sunucunun işi yalnız bayrağı kadroyla tutarlı
-- tutmak.
--
-- 113'ün "Mod KENDİLİĞİNDEN değişmez" cümlesi telefonun kendi akışı içindi
-- (orada ikinci kişi yalnız "Ekip ekle"yle giriyor). Masaüstünden ikinci
-- aktif kişiyi eklemek de aynı kararın kendisi: ekip kurmak.
--
-- ── ÜÇ PARÇA ────────────────────────────────────────────────────────────────
--   1. Tetikleyici: tek kişilik org'da aktif personel BİRİ AŞINCA bayrak
--      kapanır — `start_team`in (113) yaptığının aynısı, her yazma yolu için
--      (Uzmanlar, kurulum sihirbazı, içe aktarma, pasiften geri alma).
--      Sahibin satırı dokunulmaz kalır, veri taşınmaz (113 karar 3).
--   2. `set_business_mode(true)` birden fazla aktif personeli olan org'da
--      `team_not_empty` der — `end_team`in (115) aynı hayırı. Kimin pasife
--      alınacağını sunucu seçmez.
--   3. Tek seferlik düzeltme: bugün bayrağı açık ve birden fazla aktif
--      personeli olan org'lar ekip düzenine alınır; NOTICE ile listelenir.
--
-- Telefon tarafı ayrıca kendini koruyor (`soloInPractice`,
-- `confirmSoloMode`): bu göç çalışmadan da Test Salon 2 ekip kabuğunda açılır.
--
-- Idempotent — defalarca çalıştırılabilir.
-- ============================================================

BEGIN;

-- 1) Tetikleyici fonksiyonu
--
-- SECURITY DEFINER: personeli org sahibi DEĞİL bir yönetici üye de ekleyebilir
-- (`staff_org_access`); bayrağı yazan `orgs_owner_modify` yalnız sahibe açık.
-- Fonksiyon yalnız yazılan satırın KENDİ org'unun bayrağını kapatıyor —
-- personel satırının yazılıp yazılamayacağına yine RLS karar verdi.
CREATE OR REPLACE FUNCTION public.solo_to_team_on_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_active INT;
BEGIN
    IF NEW.organization_id IS NULL OR NOT NEW.is_active THEN
        RETURN NULL;
    END IF;

    -- Kilit: aynı org'a eş zamanlı iki ekleme ikisi de "tek" görmesin.
    -- `start_team` (113) aynı satırı zaten aynı işlemde kilitliyor; sorun değil.
    PERFORM 1
       FROM organizations
      WHERE id = NEW.organization_id
        AND solo
        FOR UPDATE;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- "Biri aştı mı" sorusunun cevabı için iki satır yeter.
    SELECT count(*) INTO v_active
      FROM (
          SELECT 1 FROM staff
           WHERE organization_id = NEW.organization_id
             AND is_active
           LIMIT 2
      ) AS crew;

    IF v_active > 1 THEN
        UPDATE organizations SET solo = false WHERE id = NEW.organization_id;
    END IF;

    RETURN NULL;
END;
$$;

-- 094'ün dersi: `from public` YETMEZ, Supabase anon ve authenticated'a ayrıca veriyor.
REVOKE ALL ON FUNCTION public.solo_to_team_on_staff() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_staff_solo_to_team ON public.staff;
CREATE TRIGGER trg_staff_solo_to_team
    AFTER INSERT OR UPDATE OF is_active, organization_id ON public.staff
    FOR EACH ROW
    WHEN (NEW.is_active)
    EXECUTE FUNCTION public.solo_to_team_on_staff();

-- 2) Modu ayarla — 108'in AYNISI, tek fark `team_not_empty` kapısı.
--    İmza ve dönüş tipi değişmiyor: CREATE OR REPLACE yetkileri korur.
CREATE OR REPLACE FUNCTION public.set_business_mode(
    p_solo BOOLEAN,
    p_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
    v_staff_count INT;
    v_active INT;
BEGIN
    -- Yalnız SAHİBİ olunan org. Üyelik yetmez: modu değiştirmek sahibin işi.
    SELECT id INTO v_org_id
    FROM organizations
    WHERE owner_id = auth.uid()
    ORDER BY created_at
    LIMIT 1;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'org_not_found';
    END IF;

    -- 141: ekibi olan salon tek kişiliğe bu kapıdan geçemez. Telefondaki
    -- tek kişilik kabuk TEK aktif personel bekliyor (`solo.session`).
    IF p_solo THEN
        SELECT count(*) INTO v_active
          FROM (
              SELECT 1 FROM staff
               WHERE organization_id = v_org_id
                 AND is_active
               LIMIT 2
          ) AS crew;
        IF v_active > 1 THEN
            RAISE EXCEPTION 'team_not_empty';
        END IF;
    END IF;

    UPDATE organizations SET solo = p_solo WHERE id = v_org_id;

    -- Personel satırı YALNIZ tek moda geçerken ve YALNIZ hiç personel
    -- yokken açılıyor. Zaten personeli olan bir salon tek moda dönerse
    -- (küçülme) yeni satır eklemek mükerrer kişi üretirdi.
    IF p_solo THEN
        SELECT count(*) INTO v_staff_count FROM staff WHERE organization_id = v_org_id;
        IF v_staff_count = 0 THEN
            INSERT INTO staff (organization_id, name)
            VALUES (v_org_id, COALESCE(NULLIF(btrim(p_name), ''), 'Ben'));
        END IF;
    END IF;

    RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_business_mode(BOOLEAN, TEXT) TO authenticated;

-- 3) Tek seferlik düzeltme — bugün tutarsız olan org'lar
DO $$
DECLARE
    v_count INT;
    v_list  TEXT;
BEGIN
    WITH fixed AS (
        UPDATE organizations AS o
           SET solo = false
         WHERE o.solo
           AND (SELECT count(*) FROM staff AS s
                 WHERE s.organization_id = o.id AND s.is_active) > 1
        RETURNING o.id, o.name
    )
    SELECT count(*), string_agg(format('%s (%s)', id, coalesce(name, 'adsız')), ', ')
      INTO v_count, v_list
      FROM fixed;

    RAISE NOTICE '141: % org ekip düzenine alındı: %', v_count, coalesce(v_list, '—');
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── Doğrulama ───────────────────────────────────────────────────────────────
--   select o.id, o.name from organizations o
--    where o.solo and (select count(*) from staff s
--                       where s.organization_id = o.id and s.is_active) > 1;
--   → 0 satır
--   select tgname, tgenabled from pg_trigger where tgname = 'trg_staff_solo_to_team';
--   → 1 satır, tgenabled = 'O'
--   select proname, prosecdef, proacl from pg_proc where proname = 'solo_to_team_on_staff';
--   → prosecdef = t; proacl'de anon/authenticated YOK
--
-- ── Geri alma ───────────────────────────────────────────────────────────────
--   drop trigger if exists trg_staff_solo_to_team on public.staff;
--   drop function if exists public.solo_to_team_on_staff();
--   set_business_mode için 108'deki gövde yeniden çalıştırılır.
--   3. parçanın kapattığı bayraklar geri AÇILMAZ — açmak tutarsızlığı geri getirir.
