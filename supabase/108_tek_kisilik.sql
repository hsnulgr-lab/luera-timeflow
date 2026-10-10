-- ============================================================
-- TimeFlow Migration 108: Tek kişilik işletme modu
-- ============================================================
-- Üçüncü kabuk (`app/tek/`) için gereken EN KÜÇÜK şema değişikliği.
-- Idempotent — defalarca çalıştırılabilir.
--
-- ── Neden `handle_new_user` DEĞİŞMİYOR ──────────────────────────────────────
-- Plan önce tetikleyiciyi değiştirmeyi öngörüyordu: her kayıtta sahibe bir
-- `staff` satırı açılacaktı. Bundan VAZGEÇİLDİ, iki sebeple:
--
--   1. O tetikleyici ÜRETİMDEKİ kayıt akışı. Bozulursa yeni müşteri hiç
--      giremez ve bunu ancak biri kaydolmaya çalışınca öğreniriz. Bu modun
--      ihtiyacı için orayı riske atmak orantısız.
--   2. Kayıt anında modun ne olduğu BİLİNMİYOR — soru kaydın sonunda
--      soruluyor. Tetikleyici herkese satır açsaydı, ekibi olan salonun
--      sahibi de personel listesinde çıkardı; o kişi hiç hizmet vermiyor
--      olabilir ve satırı telefondan silemez (bugün masaüstü işi).
--
-- Onun yerine satır, kullanıcı "Yalnız ben" dediği AN açılıyor. Aşağıdaki
-- `set_business_mode` ikisini tek işlemde yapıyor: bayrak ve satır ya
-- birlikte var olur ya hiç olmaz.
--
-- ── Yetki ───────────────────────────────────────────────────────────────────
-- Fonksiyon SECURITY INVOKER (varsayılan): RLS aynen geçerli. Sahibin kendi
-- org'unu güncellemesine `orgs_owner_modify` zaten izin veriyor, personel
-- eklemesine de `staff_org_access`. Yani fonksiyon yeni bir yetki AÇMIYOR,
-- yalnız iki yazmayı tek işleme topluyor.
-- ============================================================

BEGIN;

-- 1) Mod bayrağı — org başına. `settings` OLMAZ: o tablo user_id bazlı ve
--    aynı org'un birden çok satırı olabiliyor.
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS solo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.solo IS
    'true = tek kişilik işletme; uygulama app/tek/ kabuğunu açar. Kayıt '
    'sonundaki soruyla ya da İşletme ekranından değişir.';

-- 2) Modu ayarla
--
-- `p_name`: açılacak personel satırının adı. Kayıt akışı kişinin adını HİÇ
-- SORMUYOR (yalnız e-posta, şifre, işletme adı) — uygulama işletme adını
-- gönderiyor. Tek modda bu ad hiçbir yerde görünmüyor; görünür hâle geldiği
-- tek an ekibe geçiş ve orada sorulacak (Faz 3).
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

-- EXECUTE AÇIKÇA VERİLİYOR. Bir fonksiyonu yazmak onu çağrılabilir yapmıyor;
-- bu ders 096'da öğrenildi (TRUNCATE izni), aynı tuzağa düşülmesin.
GRANT EXECUTE ON FUNCTION public.set_business_mode(BOOLEAN, TEXT) TO authenticated;

-- 3) Şema cache'i yenile — yoksa PostgREST yeni kolonu ve fonksiyonu görmez.
NOTIFY pgrst, 'reload schema';

COMMIT;
