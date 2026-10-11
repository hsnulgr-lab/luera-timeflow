-- ============================================================
-- TimeFlow Migration 113: Ekibe geçiş (v4 · P2)
-- ============================================================
-- Tek kişilik işletme ilk çalışanını TELEFONDAN ekliyor ve uygulama ekip
-- düzenine geçiyor. Kullanıcı kararı (2026-10-11): kapı (P2) yapılsın, çünkü
-- İşletme'deki "Ekip ekle" satırı ve kayıttaki "Sonradan İşletme'den
-- değiştirebilirsiniz" cümlesi ancak onunla doğru oluyor.
--
-- ── Neden TEK işlem ─────────────────────────────────────────────────────────
-- İki yazma var — personel satırı ve mod bayrağı — ve biri düşerse:
--   • satır yazılıp bayrak kalırsa: tek kişilik kabuk TAM OLARAK bir aktif
--     personel bekliyor (`staff-api · solo.session`); ikinci personelle
--     sahibin kendi kumandası açılmaz.
--   • bayrak düşüp satır yazılmazsa: ekip düzenine geçilmiş ama ekip yok, ve
--     telefondan personel eklemenin başka yolu henüz yok.
--
-- ── Yetki ───────────────────────────────────────────────────────────────────
-- SECURITY INVOKER (varsayılan): RLS aynen geçerli. Personeli
-- `staff_org_access`, bayrağı `orgs_owner_modify` yazıyor; abonelik kapısı
-- (087) personel eklemeyi de kapsıyor. Fonksiyon yeni bir yetki AÇMIYOR, iki
-- yazmayı tek işleme topluyor — 108'in `set_business_mode` deseni.
--
-- Mod KENDİLİĞİNDEN değişmez (v4 karar 2): yalnız bu düğmeyle. Ekip
-- ekleyince veri taşınmaz; sahip de ekip listesinde görünür (karar 3).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.start_team(
    p_name      TEXT,
    p_specialty TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_org_id    UUID;
    v_solo      BOOLEAN;
    v_name      TEXT := btrim(COALESCE(p_name, ''));
    v_specialty TEXT := NULLIF(btrim(COALESCE(p_specialty, '')), '');
    v_role      TEXT;
    v_color     TEXT;
    v_staff     UUID;
BEGIN
    -- Yalnız SAHİBİ olunan org (108 ile aynı kural). FOR UPDATE: iki dokunuş
    -- aynı anda gelirse ikincisi birincinin bayrağını görür ve iki çalışan
    -- açılmaz.
    SELECT id, solo INTO v_org_id, v_solo
      FROM organizations
     WHERE owner_id = auth.uid()
     ORDER BY created_at
     LIMIT 1
       FOR UPDATE;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'org_not_found';
    END IF;
    IF v_name = '' THEN
        RAISE EXCEPTION 'name_required';
    END IF;
    IF length(v_name) > 80 THEN
        RAISE EXCEPTION 'name_too_long';
    END IF;
    -- Bu kapı yalnız tek kişilik işletmenin. Ekip düzenindeki salon personeli
    -- Personel sayfasından ekliyor; ikinci kez "geçmek" diye bir şey yok.
    IF v_solo IS NOT TRUE THEN
        RAISE EXCEPTION 'already_team';
    END IF;

    -- Rol meslekten — 058'in var olan satırlara uyguladığı kuralın AYNISI.
    -- Diş kliniğinde "Diş hekimi" yazılan kişi hekim olmalı: tedavi planının
    -- hekim atfı (061) rolü soruyor.
    v_role := CASE
        WHEN lower(coalesce(v_specialty, '')) LIKE ANY (ARRAY['%asistan%', '%assistant%', '%yardımcı%', '%yardimci%']) THEN 'assistant'
        WHEN lower(coalesce(v_specialty, '')) LIKE ANY (ARRAY['%hekim%', '%doktor%', '%doctor%', '%dentist%', '%diş%', '%dis%']) THEN 'doctor'
        WHEN lower(coalesce(v_specialty, '')) LIKE ANY (ARRAY['%kasa%', '%kasiyer%', '%cashier%', '%vezne%', '%tahsilat%']) THEN 'cashier'
        ELSE 'staff'
    END;

    -- Renk masaüstünün paletinden, salonda KULLANILMAYAN ilki: ekip takviminde
    -- iki sütun aynı renkte olursa kimin randevusu olduğu okunmaz.
    SELECT palette.color INTO v_color
      FROM unnest(ARRAY['#FF5A1F', '#E8973C', '#C95A3C', '#CB5E84',
                        '#8E70B2', '#3F9D9A', '#5E9C6C', '#5B7CC2'])
           WITH ORDINALITY AS palette(color, position)
     WHERE palette.color NOT IN (
         SELECT member.color FROM staff AS member
          WHERE member.organization_id = v_org_id AND member.color IS NOT NULL
     )
     ORDER BY palette.position
     LIMIT 1;

    INSERT INTO staff (organization_id, name, specialty, role, color)
    VALUES (v_org_id, v_name, v_specialty, v_role, COALESCE(v_color, '#5B7CC2'))
    RETURNING id INTO v_staff;

    UPDATE organizations SET solo = false WHERE id = v_org_id;

    RETURN v_staff;
END;
$$;

-- `from public` TEK BAŞINA YETMİYOR (094'ün dersi): Supabase yeni fonksiyona
-- anon, authenticated ve service_role için AÇIK izin veriyor.
REVOKE ALL ON FUNCTION public.start_team(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_team(TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── Doğrulama ───────────────────────────────────────────────────────────────
--   select proname, prosecdef, proacl from pg_proc where proname = 'start_team';
--   → prosecdef = f (INVOKER); proacl'de anon YOK
--
-- ── Geri alma ───────────────────────────────────────────────────────────────
--   drop function public.start_team(text, text);
-- Ekibe geçmiş bir salonu tek kişiliğe döndürmek ayrı bir karar (karar 2:
-- "önerilir, zorlanmaz"); bu göç onu yapmıyor.
