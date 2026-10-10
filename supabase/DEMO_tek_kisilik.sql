-- ============================================================
-- DEMO · TEK KİŞİLİK İŞLETME — üçüncü kabuğun (app/tek/) test zemini
-- ============================================================
-- ⚠️  BU BİR MIGRATION DEĞİLDİR. Numaralı dosyalarla (NNN_*.sql) karıştırma.
--     `DEMO_salon.sql`in kardeşi: sözleşme/araç dosyası, kurulum sırasının
--     parçası değil.
--
-- Ne yapar: `solo = true` işaretli org'un bugününü ve çevresindeki birkaç
-- günü v4 tasarımındaki Derya Toprak gününe benzetir — Gün ekranının kart
-- listesi, şimdi hapı, hâl kartı, Takvim'in tek sütunu ve Kasa dolu görünür.
--
-- ── ÜÇ KAPI ────────────────────────────────────────────────────────────────
-- Üretim veritabanında çalışıyor. Gerçek bir salonun verisine dokunmasının
-- bedeli geri alınamaz, o yüzden hiçbiri geçilmeden tek satır yazılmıyor:
--   1. Hedef org BELLİ olmalı — ya `solo = true` olan tek bir org vardır, ya
--      da aşağıdaki `v_hedef_org`a hangisi olduğunu yazarsın
--   2. Hedef org GERÇEKTEN solo olmalı (elle yazılan kimlik de denetlenir)
--   3. Hedef org'un adı, kimliği ve sahibinin e-postası EKRANA YAZILIR —
--      yanlış org'a düşerse çıktıdan görürsün
--
-- Birden çok solo org varsa komut DURUYOR ve adayları kimlikleriyle
-- listeliyor; listeden kopyaladığını `v_hedef_org`a yazıp tekrar çalıştır.
-- Org'un `solo` bayrağını kapatmak da bir çözüm ama BEDELİ VAR: o hesap bir
-- dahaki açılışında müdür kabuğuna düşer. Tohum için veri değiştirmeye gerek
-- yok.
--
-- Silme HER ZAMAN `organization_id = <solo org>` ile sınırlı ve yalnız bu
-- dosyanın yazdığı satırları kaldırıyor: randevuda `source = 'demo-tek'`,
-- müşteride `notes = 'demo-tek'`. Senin elle kurduğun randevulara
-- DOKUNMUYOR. Geri alma: `DEMO_tek_kisilik_geri_al.sql`.
--
-- ── DURUMLAR UYDURULMUYOR, SAATTEN TÜRÜYOR ─────────────────────────────────
-- `DEMO_salon.sql`de iki kip var (mesai içi / dışı) çünkü orada seanslar
-- "şu an"a göre yerleşiyor. Burada saatler SABİT (v4'teki gibi 10:30, 12:00,
-- 14:00 …) ve durum o saatin şu ana göre nerede olduğundan çıkıyor:
--
--   bitişi geçmiş  → completed + tahsil edildi + damgalar
--   içindeyiz      → arrived_at yazılı, service_ended_at yok → kart SÜRÜYOR
--   henüz gelmemiş → confirmed, hiç damga yok
--
-- Böylece dosya günün HER SAATİNDE tutarlı: gece 03:00'te çalıştırırsan
-- günün hepsi "bitmiş" görünür ve bu doğrudur; 15:00'te çalıştırırsan ikisi
-- bitmiş, biri sürüyor, ikisi sıradadır. Hiçbir an "başlamadan bitmiş" bir
-- randevu üretmiyor.
--
-- ── ERİŞİLEMEYEN İKİ DURUM ─────────────────────────────────────────────────
-- • "onay bekliyor" (amber): `APPROVAL_FLOW_ENABLED = false` — onay akışı
--   rafta, `pending` randevu telefonda onaylı gibi yaşıyor. Tohum pending
--   satır YAZMIYOR; yazsa ekranda sıradan bir randevu olarak görünür ve
--   test ettiğini sanırsın.
-- • "adisyon açık" (amber): randevu satırında ödeme alanı yok, kart yalnız
--   `service_ended_at`e bakıp "tamamlandı" diyor. Tahsilat Faz 3.
-- ============================================================

DO $$
DECLARE
    -- ⬇️ Birden çok solo org varsa HANGİSİ olduğunu buraya yaz.
    --    Boş bırakılırsa tek solo org aranır. Komut hata verirken adayları
    --    kimlikleriyle listeliyor; oradan kopyala.
    v_hedef_org UUID := '8418f10d-8182-4224-b334-c9acc775acee';

    v_org      UUID;
    v_liste    TEXT;
    v_user     UUID;
    v_name     TEXT;
    v_count    INT;
    v_staff    UUID;
    v_c        UUID;

    v_today    DATE        := (now() AT TIME ZONE 'Europe/Istanbul')::date;
    -- Dakikaya yuvarlanıyor: `now()::time` mikrosaniye taşıyor ve mobildeki
    -- `toMinutes` yalnız HH:MM / HH:MM:SS tanıyor (2026-09-26 dersi).
    v_now_t    TIME        := date_trunc('minute', (now() AT TIME ZONE 'Europe/Istanbul'))::time;

    v_gun      RECORD;
    v_slot     RECORD;
    v_start    TIME;
    v_end      TIME;
    v_past     BOOLEAN;
    v_running  BOOLEAN;

    v_bitti    INT;
    v_suruyor  INT;
    v_sirada   INT;
BEGIN
    -- ── KAPI 1 · hedef belli mi ─────────────────────────────────────────
    SELECT count(*) INTO v_count FROM organizations WHERE solo IS TRUE;
    IF v_count = 0 THEN
        RAISE EXCEPTION
            'DURDURULDU: solo = true olan org yok. Önce uygulamadan kayıt olup "Yalnız ben" de, ya da: UPDATE organizations SET solo = true WHERE id = ''...'';';
    END IF;

    IF v_hedef_org IS NULL AND v_count > 1 THEN
        -- Hata mesajı adayları KENDİSİ listeliyor: ayrı bir sorgu çalıştırıp
        -- kimlikleri aramak zorunda kalma, kopyalayacağın satır burada.
        SELECT string_agg(
                   format(E'\n    %s   %s   %s   %s randevu%s',
                          o.id,
                          rpad(coalesce(nullif(btrim(o.name), ''), '(adsız)'), 24),
                          rpad(coalesce(u.email, '(sahipsiz)'), 28),
                          (SELECT count(*) FROM reservations r WHERE r.organization_id = o.id),
                          CASE WHEN EXISTS (SELECT 1 FROM reservations r
                                             WHERE r.organization_id = o.id AND r.source = 'demo-tek')
                               THEN '  [bu tohum daha once buraya yazmis]' ELSE '' END),
                   '' ORDER BY o.created_at)
          INTO v_liste
          FROM organizations o
          LEFT JOIN auth.users u ON u.id = o.owner_id
         WHERE o.solo IS TRUE;

        RAISE EXCEPTION
            E'DURDURULDU: solo = true olan % org var, hangisi olduğunu bilemem.\n\nADAYLAR:%\n\nDosyanın başındaki v_hedef_org satırına yukarıdaki kimliklerden birini yaz:\n    v_hedef_org UUID := ''...'';\n',
            v_count, v_liste;
    END IF;

    -- ── KAPI 2 · hedef gerçekten solo ve sahibi var ─────────────────────
    SELECT id, owner_id, name INTO v_org, v_user, v_name
      FROM organizations
     WHERE solo IS TRUE
       AND (v_hedef_org IS NULL OR id = v_hedef_org);

    -- Elle yazılan kimlik de denetleniyor: yanlış yazılmış bir UUID gerçek
    -- bir salona düşmesin diye. Solo olmayan org buraya hiç gelmiyor.
    IF v_org IS NULL THEN
        RAISE EXCEPTION
            'DURDURULDU: % kimlikli bir SOLO org yok. Ya kimlik yanlış ya da o org solo değil; v_hedef_org''u boşalt ve adayları gör.',
            v_hedef_org;
    END IF;
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'DURDURULDU: org %''un owner_id''si boş. Bu hesap kayıt akışından geçmemiş olabilir.', v_org;
    END IF;

    -- ── KAPI 3 · hedefi göster ──────────────────────────────────────────
    RAISE NOTICE '───────────────────────────────────────────────';
    RAISE NOTICE 'HEDEF ORG : %  (%)', coalesce(v_name, '(adsız)'), v_org;
    RAISE NOTICE 'SAHİBİ    : %', (SELECT email FROM auth.users WHERE id = v_user);
    RAISE NOTICE 'SUNUCU    : % (İstanbul)', v_today || ' ' || v_now_t;
    RAISE NOTICE '───────────────────────────────────────────────';

    -- ── Personel: TEK satır ─────────────────────────────────────────────
    -- `set_business_mode` modu açarken bir tane kurmuş olmalı. Yoksa burada
    -- kuruluyor: Gün ekranı kadroyu `presence`ten okuyor ve kadro boşken
    -- `dayState` hiç oluşmuyor — ekran bomboş kalırdı.
    SELECT id INTO v_staff
      FROM staff
     WHERE organization_id = v_org AND is_active
     ORDER BY created_at
     LIMIT 1;

    IF v_staff IS NULL THEN
        INSERT INTO staff (organization_id, name, specialty, color, is_active)
        VALUES (v_org, coalesce(nullif(btrim(v_name), ''), 'Ben'), '', '#FF5A1F', true)
        RETURNING id INTO v_staff;
        RAISE NOTICE 'Personel satırı yoktu, kuruldu: %', v_staff;
    END IF;

    SELECT count(*) INTO v_count FROM staff WHERE organization_id = v_org AND is_active;
    IF v_count > 1 THEN
        RAISE NOTICE 'UYARI: org''da % aktif personel var. Tek kişilik kabuk ilkini kullanıyor; kalanlar ekranda görünmez.', v_count;
    END IF;

    -- ── Çalışma saatleri ────────────────────────────────────────────────
    -- Gün ekranının boş hâli bunu okuyup "Çalışma saatiniz 09:00 – 19:00."
    -- diyor; Takvim'in saat aralığı da buradan. PAZAR KAPALI bırakılıyor ki
    -- v4'ün B2 ekranı ("Bugün kapalısınız.") gerçekten test edilebilsin.
    UPDATE settings SET working_hours = '[
        {"day":0,"dayName":"Pazar","start":"09:00","end":"19:00","isOff":true},
        {"day":1,"dayName":"Pazartesi","start":"09:00","end":"19:00","isOff":false},
        {"day":2,"dayName":"Salı","start":"09:00","end":"19:00","isOff":false},
        {"day":3,"dayName":"Çarşamba","start":"09:00","end":"19:00","isOff":false},
        {"day":4,"dayName":"Perşembe","start":"09:00","end":"19:00","isOff":false},
        {"day":5,"dayName":"Cuma","start":"09:00","end":"19:00","isOff":false},
        {"day":6,"dayName":"Cumartesi","start":"09:00","end":"19:00","isOff":false}
    ]'::jsonb
    WHERE user_id = v_user;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 1 THEN
        RAISE NOTICE 'UYARI: settings satırı bulunamadı (% satır) — çalışma saatleri yazılamadı.', v_count;
    END IF;

    -- ── Hizmetler — YALNIZ eksik olanlar ────────────────────────────────
    -- Var olanlara dokunulmuyor: fiyatını değiştirdiysen öyle kalsın.
    INSERT INTO services (user_id, organization_id, name, duration, price, color)
    SELECT v_user, v_org, t.name, t.dk, t.fiyat, t.renk
      FROM (VALUES
            ('Cilt Bakımı',         60, 1200, '#8B5CF6'),
            ('Ağda',                45,  900, '#EC4899'),
            ('Lazer Epilasyon',     30, 1500, '#06B6D4'),
            ('Manikür & Pedikür',   60,  750, '#F59E0B'),
            ('Kaş Tasarımı',        20,  350, '#10B981'),
            ('Kalıcı Makyaj',      120, 4500, '#F43F5E'),
            ('Aromaterapi Masajı',  50, 1100, '#64748B')
           ) AS t(name, dk, fiyat, renk)
     WHERE NOT EXISTS (
            SELECT 1 FROM services s
             WHERE s.organization_id = v_org AND s.name = t.name);

    -- ── Temizlik — YALNIZ bu dosyanın yazdıkları ────────────────────────
    -- Sıra FK'lere göre: tahsilat → randevu → müşteri.
    DELETE FROM payments
     WHERE organization_id = v_org
       AND reservation_id IN (SELECT id FROM reservations
                               WHERE organization_id = v_org AND source = 'demo-tek');
    DELETE FROM reservations WHERE organization_id = v_org AND source = 'demo-tek';
    DELETE FROM customers    WHERE organization_id = v_org AND notes  = 'demo-tek';

    -- ── Müşteriler ──────────────────────────────────────────────────────
    INSERT INTO customers (user_id, organization_id, name, phone, notes)
    SELECT v_user, v_org, t.ad, t.tel, 'demo-tek'
      FROM (VALUES
            ('Sibel Karaca',  '0532 900 0001'),
            ('Pınar Aksoy',   '0532 900 0002'),
            ('Tuğçe Erden',   '0532 900 0003'),
            ('Yasemin Kurt',  '0532 900 0004'),
            ('Vildan Ay',     '0532 900 0005'),
            ('Gizem Ünal',    '0532 900 0006'),
            ('Deniz Şahin',   '0532 900 0007'),
            ('Elif Demir',    '0532 900 0008')
           ) AS t(ad, tel);

    /*
     * ── GÜNLER ──────────────────────────────────────────────────────────
     * `ofset` bugüne göre. Pazar ATLANIYOR: kapalı güne randevu yazmak
     * ekranı kendi çalışma saatleriyle çelişkiye düşürürdü.
     *
     * +3 bilerek BOŞ: v4'ün B1 ekranı ("Bugün randevunuz yok." + saat rayı)
     * ancak gerçekten boş bir günde görülebilir.
     */
    FOR v_gun IN
        SELECT * FROM (VALUES (-2), (-1), (0), (1), (2)) AS g(ofset)
    LOOP
        CONTINUE WHEN extract(dow FROM v_today + v_gun.ofset) = 0;   -- pazar

        FOR v_slot IN
            SELECT * FROM (VALUES
                -- saat,          hizmet,               müşteri,         iptal
                (TIME '09:30', 'Kaş Tasarımı',       'Gizem Ünal',   false),
                (TIME '10:30', 'Lazer Epilasyon',    'Sibel Karaca', false),
                (TIME '11:15', 'Kaş Tasarımı',       'Deniz Şahin',  true ),
                (TIME '12:00', 'Cilt Bakımı',        'Pınar Aksoy',  false),
                (TIME '14:00', 'Kalıcı Makyaj',      'Tuğçe Erden',  false),
                (TIME '16:30', 'Ağda',               'Yasemin Kurt', false),
                (TIME '17:30', 'Kaş Tasarımı',       'Vildan Ay',    false)
            ) AS s(baslangic, hizmet, musteri, iptal)
            -- Geçmiş ve gelecek günlerde liste kısa tutuluyor; BUGÜN tam
            -- dolu, çünkü test edilen ekran bugünün ekranı.
            WHERE v_gun.ofset = 0
               OR s.baslangic IN (TIME '10:30', TIME '14:00', TIME '16:30')
        LOOP
            SELECT id INTO v_c FROM customers
             WHERE organization_id = v_org AND notes = 'demo-tek' AND name = v_slot.musteri
             LIMIT 1;

            v_start := v_slot.baslangic;
            SELECT v_start + (duration * INTERVAL '1 minute') INTO v_end
              FROM services WHERE organization_id = v_org AND name = v_slot.hizmet LIMIT 1;

            /*
             * DURUM SAATTEN TÜRÜYOR.
             *
             * Geçmiş gün tamamen bitmiş, gelecek gün tamamen önümüzde;
             * BUGÜN ikiye bölünüyor ve bölen şu an. Böylece "şimdi" hapı
             * listenin tam ortasına, gerçekten olduğu yere düşüyor.
             */
            v_past    := v_gun.ofset < 0 OR (v_gun.ofset = 0 AND v_end <= v_now_t);
            v_running := v_gun.ofset = 0 AND v_start <= v_now_t AND v_now_t < v_end;

            INSERT INTO reservations (
                user_id, organization_id, customer_id, customer_name, customer_phone,
                staff_id, date, start_time, end_time, service, service_color,
                status, source, is_paid, notes,
                customer_arrived_at, arrived_at, service_ended_at
            )
            SELECT
                v_user, v_org, v_c, c.name, c.phone,
                v_staff, v_today + v_gun.ofset, v_start, v_end, s.name, s.color,
                CASE WHEN v_slot.iptal THEN 'cancelled'
                     WHEN v_past       THEN 'completed'
                     ELSE 'confirmed' END,
                'demo-tek',
                -- İptal edilen iş tahsil edilmez; para kaydı da yazılmaz.
                (v_past AND NOT v_slot.iptal),
                '',
                -- Damgalar yalnız gerçekten olmuş şeyler için.
                CASE WHEN (v_past OR v_running) AND NOT v_slot.iptal
                     THEN ((v_today + v_gun.ofset) + v_start) AT TIME ZONE 'Europe/Istanbul' END,
                CASE WHEN (v_past OR v_running) AND NOT v_slot.iptal
                     THEN ((v_today + v_gun.ofset) + v_start) AT TIME ZONE 'Europe/Istanbul' END,
                CASE WHEN v_past AND NOT v_slot.iptal
                     THEN ((v_today + v_gun.ofset) + v_end)   AT TIME ZONE 'Europe/Istanbul' END
            FROM customers c, services s
            WHERE c.id = v_c
              AND s.organization_id = v_org
              AND s.name = v_slot.hizmet;
        END LOOP;
    END LOOP;

    -- ── Tahsilat ────────────────────────────────────────────────────────
    -- `is_paid` TEK BAŞINA YETMİYOR: Kasa ciroyu `payments`tan topluyor ve
    -- satır yoksa "tahsil edildi" diyen bir gün ₺0 ciro gösterir
    -- (`DEMO_salon.sql`de iki kez öğrenilen ders).
    INSERT INTO payments (organization_id, customer_id, reservation_id,
                          type, description, amount, method, paid_at)
    SELECT v_org, r.customer_id, r.id, 'service', r.service, s.price,
           CASE WHEN (extract(day FROM r.date)::int % 3) = 0 THEN 'cash' ELSE 'card' END,
           coalesce(r.service_ended_at, (r.date + r.end_time) AT TIME ZONE 'Europe/Istanbul')
      FROM reservations r
      JOIN services s ON s.organization_id = v_org AND s.name = r.service
     WHERE r.organization_id = v_org
       AND r.source = 'demo-tek'
       AND r.is_paid;

    -- ── Özet ────────────────────────────────────────────────────────────
    SELECT count(*) INTO v_count
      FROM reservations WHERE organization_id = v_org AND source = 'demo-tek';
    RAISE NOTICE 'Tek kişilik demo hazır — % randevu.', v_count;

    SELECT
        count(*),
        count(*) FILTER (WHERE service_ended_at IS NOT NULL),
        count(*) FILTER (WHERE arrived_at IS NOT NULL AND service_ended_at IS NULL),
        count(*) FILTER (WHERE arrived_at IS NULL AND status <> 'cancelled')
      INTO v_count, v_bitti, v_suruyor, v_sirada
      FROM reservations
     WHERE organization_id = v_org AND source = 'demo-tek' AND date = v_today;

    RAISE NOTICE 'Bugün: % randevu (biten %, süren %, sıradaki %).',
        v_count, v_bitti, v_suruyor, v_sirada;
    RAISE NOTICE 'Boş gün (B1) için şeritte % gününe git.', to_char(v_today + 3, 'DD Mon');
    RAISE NOTICE 'Kapalı gün (B2) için ilk pazara git.';
    RAISE NOTICE 'Geri alma: supabase/DEMO_tek_kisilik_geri_al.sql';
END $$;
