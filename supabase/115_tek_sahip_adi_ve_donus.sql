-- ============================================================
-- TimeFlow Migration 115: Sahibin adı + ekipten tek kişiliğe dönüş
-- ============================================================
-- İki kullanıcı kararı (2026-10-12), ikisi de 113'ün açık bıraktığı uçlar:
--
-- 1) EKİBE GEÇERKEN SAHİBİN ADI SORULUR.
--    108 kayıtta kişinin adını sormuyor; tek kişilikte sahibin personel
--    satırı salonun adını taşıyor ve bu modda hiçbir yerde görünmüyor.
--    Ekibe geçince görünür oluyordu: ekip takviminde sahibin sütunu
--    "Derya Güzellik" yazıyordu. `start_team` artık sahibin adını da alıyor
--    ve AYNI İŞLEMDE sahibin satırına yazıyor.
--
-- 2) EKİPTEN TEK KİŞİLİĞE DÖNÜŞ KAPISI (`end_team`).
--    Kayıttaki "Sonradan İşletme’den değiştirebilirsiniz" cümlesi yalnız
--    tek kişilik → ekip yönünde doğruydu. Kapı YALNIZ ekipte sahipten başka
--    aktif kimse kalmayınca açılıyor: tek kişilik kabuk TAM OLARAK bir aktif
--    personel bekliyor (`staff-api · solo.session`, 114'ün kuralı) ve kimin
--    pasife alınacağını telefon seçmiyor — personel çıkarmak masaüstü işi.
--
-- ── Dönüşte ileri randevular ────────────────────────────────────────────────
-- Ayrılan çalışanın İLERİ randevuları ona bağlı kalırsa tek kişilikte HİÇBİR
-- ekranda görünmez: Gün yalnız kalan kişinin ve personelsiz satırları
-- alıyor, Takvim yalnız aktif personelin sütununu çiziyor. Tek kişilikte
-- salonun her randevusu o kişinin işi; o yüzden bugünden itibaren
-- tamamlanmamış ve iptal edilmemiş randevular kalan kişiye geçiyor.
--   • Kalan kişinin bir randevusuyla ÇAKIŞAN (060, 23P01) satır personelsiz
--     bırakılıyor: Gün personelsiz satırı yine gösteriyor ve çakışma orada
--     görünüyor. Uydurma bir çözüm yok.
--   • Başlamış muayenenin kilidi (062, 23514) satırı olduğu gibi bırakıyor.
--   • Başka hata işlemi düşürür — dönüş ya tamamen olur ya hiç.
-- Geçmiş randevular dokunulmadan kalıyor: kimin yaptığı bir kayıt.
--
-- ── Bildirimler ─────────────────────────────────────────────────────────────
-- Kalan kişiye geçen her satır 107'nin "Yeni randevun var" dalını tetikliyor;
-- hedef kalan kişinin PERSONEL cihazı. Sahip müdür olarak abone (`role:
-- manager`, `staff_id` yok) ve tek kişilikte personel girişi yapmıyor, yani
-- pratikte gönderilecek cihaz yok. 114'teki gibi tetikleyiciyi kapatmak
-- burada YAPILAMAZ: ALTER TABLE tablo sahibini ister ve kullanıcının çağırdığı
-- bir fonksiyonda bütün salonların tablosunu kilitlerdi.
--
-- ── Yetki ───────────────────────────────────────────────────────────────────
-- İkisi de SECURITY INVOKER (113 ile aynı): RLS aynen geçerli, abonelik
-- kapısı (087) personel ve randevu yazmayı kapsıyor. Fonksiyonlar yeni bir
-- yetki AÇMIYOR, yazmaları tek işleme topluyor.
--
-- ── Uygulama sırası ─────────────────────────────────────────────────────────
-- Bu göç, telefonda yeni Ekip ekle / dönüş ekranlarından ÖNCE çalışmalı.
-- Eski istemci `start_team(p_name, p_specialty)` diye çağırıyor; üçüncü
-- parametrenin varsayılanı olduğu için o çağrı aynen çalışmaya devam ediyor.
-- ============================================================

BEGIN;

-- ── 1) start_team · sahibin adı ─────────────────────────────────────────────
-- İmza değişiyor (üçüncü parametre); eski iki parametreli sürüm kalırsa
-- PostgREST iki adayı ayırt edemez.
DROP FUNCTION IF EXISTS public.start_team(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.start_team(
    p_name       TEXT,
    p_specialty  TEXT DEFAULT NULL,
    p_owner_name TEXT DEFAULT NULL
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
    v_owner     TEXT := NULLIF(btrim(COALESCE(p_owner_name, '')), '');
    v_crew      UUID[];
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
    IF v_owner IS NOT NULL AND length(v_owner) > 80 THEN
        RAISE EXCEPTION 'owner_name_too_long';
    END IF;
    -- Bu kapı yalnız tek kişilik işletmenin. Ekip düzenindeki salon personeli
    -- Personel sayfasından ekliyor; ikinci kez "geçmek" diye bir şey yok.
    IF v_solo IS NOT TRUE THEN
        RAISE EXCEPTION 'already_team';
    END IF;

    -- SAHİBİN ADI — yeni çalışan eklenmeden ÖNCE: o an aktif tek satır
    -- sahibin kendisi (114'ün kuralı). Tek değilse tahmin yok, ad yazılmıyor.
    IF v_owner IS NOT NULL THEN
        SELECT array_agg(crew.id) INTO v_crew
          FROM (
              SELECT id FROM staff
               WHERE organization_id = v_org_id
                 AND is_active
               ORDER BY created_at, id
               LIMIT 2
          ) AS crew;
        IF cardinality(v_crew) = 1 THEN
            UPDATE staff SET name = v_owner, updated_at = now() WHERE id = v_crew[1];
        END IF;
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
REVOKE ALL ON FUNCTION public.start_team(TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_team(TEXT, TEXT, TEXT) TO authenticated;

-- ── 2) end_team · ekipten tek kişiliğe ──────────────────────────────────────
-- `p_name`: hiç aktif personel yoksa (ekip olarak kaydolup kimseyi
-- eklememiş salon) açılacak satırın adı — 108'in `set_business_mode`
-- kuralı. Bir aktif personel varsa ad DEĞİŞMİYOR: tek kişilikte görünmüyor.
--
-- Dönüş: { staff_id, moved, unassigned, kept } — kalan kişi ve ileri
-- randevuların ne olduğu. Ekran "N randevu size geçti" diyebilsin.
CREATE OR REPLACE FUNCTION public.end_team(
    p_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_org_id     UUID;
    v_solo       BOOLEAN;
    v_crew       UUID[];
    v_me         UUID;
    v_today      DATE := (now() AT TIME ZONE 'Europe/Istanbul')::DATE;
    v_row        RECORD;
    v_moved      INT := 0;
    v_unassigned INT := 0;
    v_kept       INT := 0;
BEGIN
    SELECT id, solo INTO v_org_id, v_solo
      FROM organizations
     WHERE owner_id = auth.uid()
     ORDER BY created_at
     LIMIT 1
       FOR UPDATE;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'org_not_found';
    END IF;
    IF v_solo IS TRUE THEN
        RAISE EXCEPTION 'already_solo';
    END IF;

    SELECT array_agg(crew.id) INTO v_crew
      FROM (
          SELECT id FROM staff
           WHERE organization_id = v_org_id
             AND is_active
           ORDER BY created_at, id
           LIMIT 2
      ) AS crew;

    -- Kimin pasife alınacağını sunucu seçmiyor.
    IF cardinality(v_crew) > 1 THEN
        RAISE EXCEPTION 'team_not_empty';
    END IF;

    IF cardinality(v_crew) = 1 THEN
        v_me := v_crew[1];
    ELSE
        IF p_name IS NOT NULL AND length(btrim(p_name)) > 80 THEN
            RAISE EXCEPTION 'name_too_long';
        END IF;
        INSERT INTO staff (organization_id, name)
        VALUES (v_org_id, COALESCE(NULLIF(btrim(p_name), ''), 'Ben'))
        RETURNING id INTO v_me;
    END IF;

    -- İleri randevular kalan kişiye (gerekçe başlıkta). Saat sırasıyla: önce
    -- gelen kalan kişiye geçer, onunla çakışan sonraki personelsiz kalır.
    FOR v_row IN
        SELECT r.id
          FROM reservations AS r
         WHERE r.organization_id = v_org_id
           AND r.date >= v_today
           AND r.status NOT IN ('cancelled', 'completed')
           AND r.service_ended_at IS NULL
           AND r.staff_id IS NOT NULL
           AND r.staff_id <> v_me
         ORDER BY r.date, r.start_time, r.id
           FOR UPDATE
    LOOP
        BEGIN
            UPDATE reservations SET staff_id = v_me WHERE id = v_row.id;
            v_moved := v_moved + 1;
        EXCEPTION
            WHEN exclusion_violation THEN
                BEGIN
                    UPDATE reservations SET staff_id = NULL WHERE id = v_row.id;
                    v_unassigned := v_unassigned + 1;
                EXCEPTION WHEN check_violation THEN
                    v_kept := v_kept + 1;
                END;
            WHEN check_violation THEN
                v_kept := v_kept + 1;
        END;
    END LOOP;

    UPDATE organizations SET solo = true WHERE id = v_org_id;

    RETURN jsonb_build_object(
        'staff_id',   v_me,
        'moved',      v_moved,
        'unassigned', v_unassigned,
        'kept',       v_kept
    );
END;
$$;

REVOKE ALL ON FUNCTION public.end_team(TEXT)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.end_team(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── Doğrulama ───────────────────────────────────────────────────────────────
--   select oid::regprocedure, prosecdef, proacl from pg_proc
--    where proname in ('start_team', 'end_team');
--   → start_team(text,text,text) ve end_team(text); prosecdef = f;
--     proacl'de yalnız authenticated (ve sahip)
--   Regresyon: supabase/tests/tek_donus_regression.sql
--
-- ── Geri alma ───────────────────────────────────────────────────────────────
--   drop function public.end_team(text);
--   drop function public.start_team(text, text, text);
--   ve 113_ekibe_gecis.sql'in start_team bloğunu yeniden çalıştırmak.
