-- ============================================================
-- DEMO TOHUMU · PERSONEL KİMLİĞİ SABİT (2026-10-15) — kuru koşu kontrolü
-- ============================================================
-- Kullanım (üretimde, GERİ SARILIR — hiçbir şey kalıcı yazılmaz):
--   BEGIN;
--   CREATE TEMP TABLE _once AS <koşudan önceki demo personeli>;
--   supabase/DEMO_salon.sql   (bir kez)
--   supabase/DEMO_salon.sql   (iki kez — cron'un ardışık koşuları)
--   bu dosya
--   ROLLBACK;
--
-- Neden: eski tohum her koşuda `DELETE FROM staff` yapıp üç personeli YENİ
-- kimlikle kuruyordu. Telefon oturumu, şifre ve cihaz bağı o kimliğe bağlı;
-- 13:00 koşusu açık bir personel oturumunu düşürdü. Bu kontrol, iki koşudan
-- sonra kimliklerin AYNI kaldığını ve randevuların onlara bağlandığını söylüyor.
DO $$
DECLARE
    n INT;
BEGIN
    SELECT count(*) INTO n
      FROM staff s JOIN organizations o ON o.id = s.organization_id
     WHERE o.slug = 'demo-luera';
    IF n <> 3 THEN RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: demo personel sayısı % (3 olmalı)', n; END IF;

    SELECT count(*) INTO n
      FROM _once b JOIN staff s ON s.id = b.id
     WHERE b.name IN ('Elif Demir', 'Selin Kaya', 'Derya Toprak');
    IF n <> 3 THEN RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: kimlikler korunmadı (% / 3 aynı)', n; END IF;

    SELECT count(*) INTO n
      FROM reservations r JOIN organizations o ON o.id = r.organization_id
     WHERE o.slug = 'demo-luera'
       AND r.staff_id IS NOT NULL
       AND r.staff_id NOT IN (SELECT id FROM _once);
    IF n <> 0 THEN RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: % randevu tanınmayan personele bağlı', n; END IF;

    SELECT count(*) INTO n
      FROM reservations r JOIN organizations o ON o.id = r.organization_id
     WHERE o.slug = 'demo-luera';
    IF n = 0 THEN RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: tohum randevu kurmadı'; END IF;

    RAISE NOTICE 'KURU KOŞU GEÇTİ: 3 personel, kimlikler iki koşu boyunca sabit, % randevu onlara bağlı (ROLLBACK ile geri sarılacak).', n;
END $$;
