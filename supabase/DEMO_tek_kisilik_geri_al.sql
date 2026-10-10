-- ============================================================
-- DEMO · TEK KİŞİLİK — GERİ ALMA
-- ============================================================
-- `DEMO_tek_kisilik.sql`in yazdığı her satırı siler, başka hiçbir şeye
-- dokunmaz. Senin elle kurduğun randevular ve gerçek müşterilerin yerinde
-- kalır: silme iki işarete bağlı ve ikisi de yalnız o dosyanın ürettiği
-- satırlarda var —
--
--   reservations.source = 'demo-tek'
--   customers.notes     = 'demo-tek'
--
-- ── DOKUNULMAYAN İKİSİ ─────────────────────────────────────────────────────
-- • Çalışma saatleri: tohum pazarı kapalı, kalanını 09:00–19:00 yapmıştı.
--   Geri yazılmıyor çünkü ÖNCEKİ hâlini bilmiyoruz — yanlış bir saati geri
--   koymak, demo verisi bırakmaktan kötü. İşletme → Çalışma saatlerinden
--   kendin düzeltirsin.
-- • Hizmetler: tohum yalnız EKSİK olanları eklemişti ve hangisini kendi
--   eklediğini ayırt edemiyoruz. Silmek senin fiyat listeni götürebilirdi.
-- ============================================================

DO $$
DECLARE
    v_org   UUID;
    v_name  TEXT;
    v_count INT;
    v_r     INT;
    v_c     INT;
    v_p     INT;
BEGIN
    SELECT count(*) INTO v_count FROM organizations WHERE solo IS TRUE;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'DURDURULDU: solo = true olan org sayısı % (1 bekleniyordu).', v_count;
    END IF;
    SELECT id, name INTO v_org, v_name FROM organizations WHERE solo IS TRUE;
    RAISE NOTICE 'HEDEF ORG: %  (%)', coalesce(v_name, '(adsız)'), v_org;

    -- Sıra FK'lere göre: tahsilat → randevu → müşteri.
    DELETE FROM payments
     WHERE organization_id = v_org
       AND reservation_id IN (SELECT id FROM reservations
                               WHERE organization_id = v_org AND source = 'demo-tek');
    GET DIAGNOSTICS v_p = ROW_COUNT;

    DELETE FROM reservations WHERE organization_id = v_org AND source = 'demo-tek';
    GET DIAGNOSTICS v_r = ROW_COUNT;

    DELETE FROM customers WHERE organization_id = v_org AND notes = 'demo-tek';
    GET DIAGNOSTICS v_c = ROW_COUNT;

    RAISE NOTICE 'Silindi — % tahsilat, % randevu, % müşteri.', v_p, v_r, v_c;
    RAISE NOTICE 'Çalışma saatleri ve hizmetler DOKUNULMADAN bırakıldı (sebebi dosyanın başında).';
END $$;
