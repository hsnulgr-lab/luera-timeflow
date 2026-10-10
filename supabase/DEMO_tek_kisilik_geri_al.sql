-- ============================================================
-- DEMO · TEK KİŞİLİK — GERİ ALMA
-- ============================================================
-- `DEMO_tek_kisilik.sql`in yazdığı her satırı siler, başka hiçbir şeye
-- dokunmaz. Senin elle kurduğun randevular ve gerçek müşterilerin yerinde
-- kalır: silme iki işarete bağlı ve ikisi de yalnız o dosyanın ürettiği
-- satırlarda var —
--
--   reservations.custom_fields @> '{"demo_tek": true}'
--   customers.custom_fields    @> '{"demo_tek": true}'
--
-- İşaret `source`ta DEĞİL: o kolonun CHECK'i yalnız manual/booking/leadflow
-- kabul ediyor (015). `notes`ta da değil: o alan kullanıcıya görünüyor.
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
    -- ⬇️ Tohumu hangi org'a attıysan onun kimliği. Boş bırakılırsa tek solo
    --    org aranır; birden çoksa komut durur ve adayları listeler.
    --    `DEMO_tek_kisilik.sql`deki `v_hedef_org` ile AYNI değer olmalı.
    v_hedef_org UUID := '8418f10d-8182-4224-b334-c9acc775acee';

    v_org   UUID;
    v_name  TEXT;
    v_liste TEXT;
    v_count INT;
    v_r     INT;
    v_c     INT;
    v_p     INT;
BEGIN
    SELECT count(*) INTO v_count FROM organizations WHERE solo IS TRUE;
    IF v_count = 0 THEN
        RAISE EXCEPTION 'DURDURULDU: solo = true olan org yok.';
    END IF;

    IF v_hedef_org IS NULL AND v_count > 1 THEN
        -- Yalnız DEMO SATIRI OLAN org'lar işaretleniyor: silinecek bir şeyi
        -- olmayan org'u seçmek boşuna, ve yanlış org'a dokunmanın önüne geçer.
        SELECT string_agg(
                   format(E'\n    %s   %s   %s demo randevu',
                          o.id,
                          rpad(coalesce(nullif(btrim(o.name), ''), '(adsız)'), 24),
                          (SELECT count(*) FROM reservations r
                            WHERE r.organization_id = o.id
                              AND r.custom_fields @> '{"demo_tek": true}'::jsonb)),
                   '' ORDER BY o.created_at)
          INTO v_liste
          FROM organizations o
         WHERE o.solo IS TRUE;

        RAISE EXCEPTION
            E'DURDURULDU: solo = true olan % org var.\n\nADAYLAR:%\n\nSilinecek olanın kimliğini v_hedef_org satırına yaz.\n',
            v_count, v_liste;
    END IF;

    SELECT id, name INTO v_org, v_name
      FROM organizations
     WHERE solo IS TRUE AND (v_hedef_org IS NULL OR id = v_hedef_org);

    IF v_org IS NULL THEN
        RAISE EXCEPTION 'DURDURULDU: % kimlikli bir SOLO org yok.', v_hedef_org;
    END IF;
    RAISE NOTICE 'HEDEF ORG: %  (%)', coalesce(v_name, '(adsız)'), v_org;

    -- Sıra FK'lere göre: tahsilat → randevu → müşteri.
    DELETE FROM payments
     WHERE organization_id = v_org
       AND reservation_id IN (SELECT id FROM reservations
                               WHERE organization_id = v_org
                                 AND custom_fields @> '{"demo_tek": true}'::jsonb);
    GET DIAGNOSTICS v_p = ROW_COUNT;

    DELETE FROM reservations WHERE organization_id = v_org
                               AND custom_fields @> '{"demo_tek": true}'::jsonb;
    GET DIAGNOSTICS v_r = ROW_COUNT;

    DELETE FROM customers WHERE organization_id = v_org
                            AND custom_fields @> '{"demo_tek": true}'::jsonb;
    GET DIAGNOSTICS v_c = ROW_COUNT;

    RAISE NOTICE 'Silindi — % tahsilat, % randevu, % müşteri.', v_p, v_r, v_c;
    RAISE NOTICE 'Çalışma saatleri ve hizmetler DOKUNULMADAN bırakıldı (sebebi dosyanın başında).';
END $$;
