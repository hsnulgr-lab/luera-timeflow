-- ============================================================
-- 120 · DEMO TOHUMU SESSİZ — kuru koşu kontrolü (GERİ SARILIR)
-- ============================================================
-- Kullanım (üretimde):
--   BEGIN;
--   120 (BEGIN/COMMIT'siz);
--   supabase/tests/tohum_sessiz_once.sql   (tohumdan önceki sayım)
--   supabase/DEMO_salon.sql;
--   bu dosya;
--   ROLLBACK;
--
-- Sorulan: tohum koşarken bildirim isteği KUYRUĞA GİRMEDİ; işaret kalkınca
-- aynı tetikleyici yine çalışıyor (kontrol — tetikleyici ölmedi). Sayım
-- YALNIZ demo salonun istekleri: başka salonun o anki bildirimi testi
-- yanıltmasın.
DO $$
DECLARE
    v_org uuid;
    v_res uuid;
    v_to  uuid;
    n0 bigint;
    n1 bigint;
    n2 bigint;
BEGIN
    SELECT id INTO v_org FROM organizations WHERE slug = 'demo-luera';
    SELECT n INTO n0 FROM _q0;
    SELECT count(*) INTO n1 FROM net.http_request_queue q
     WHERE position(v_org::text in convert_from(q.body, 'UTF8')) > 0;
    IF n1 <> n0 THEN
        RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: tohum % bildirim isteği kuyruğa soktu', n1 - n0;
    END IF;

    -- Kontrol: işaret kalkınca personel değişikliği bildirim doğuruyor.
    PERFORM set_config('luera.tohum', '', true);
    SELECT r.id INTO v_res FROM reservations r
     WHERE r.organization_id = v_org AND r.staff_id IS NOT NULL AND r.status <> 'cancelled'
     LIMIT 1;
    SELECT s.id INTO v_to FROM staff s, reservations r
     WHERE r.id = v_res AND s.organization_id = v_org AND s.id <> r.staff_id
     LIMIT 1;
    UPDATE reservations SET staff_id = v_to WHERE id = v_res;
    SELECT count(*) INTO n2 FROM net.http_request_queue q
     WHERE position(v_org::text in convert_from(q.body, 'UTF8')) > 0;
    IF n2 <= n1 THEN
        RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: işaretsiz değişiklik bildirim doğurmadı — tetikleyici çalışmıyor';
    END IF;

    RAISE NOTICE 'KURU KOŞU GEÇTİ: tohum 0 bildirim kuyruğa soktu; işaretsiz değişiklik % istek doğurdu (ROLLBACK ile geri sarılacak).', n2 - n1;
END $$;
