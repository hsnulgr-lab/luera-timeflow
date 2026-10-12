-- ============================================================
-- DEMO · TEK KİŞİLİK TEST GÜNÜ — "şimdi"ye göre kurulan deneme günü
-- ============================================================
-- ⚠️  BU BİR MIGRATION DEĞİLDİR. Numaralı dosyalarla (NNN_*.sql) karıştırma.
--
-- `DEMO_tek_kisilik.sql`in saatleri SABİT (10:30, 14:00 …): akşam
-- çalıştırılınca bütün gün geçmişte kalıyor ve randevular "gelmedi"
-- görünüyor. Bu dosya günü ÇALIŞTIRILDIĞI ANA göre kuruyor; hangi saatte
-- çalıştırılırsa çalıştırılsın Gün ekranının bütün hâlleri sırayla
-- denenebilir (plan: docs/devir/08-TEK-KISILIK-DEVIR.md §22).
--
-- ── Hedef: TEK hesap ──────────────────────────────────────────────────────
-- Sahibi `hsnulgr@gmail.com` olan, `solo = true` org. Bulunamazsa ya da
-- birden fazlaysa DURUR ve adayları yazar. Başka hiçbir org'a dokunmaz.
--
-- ── Ne siler ──────────────────────────────────────────────────────────────
-- YALNIZ bu org'da, YALNIZ tohum işaretli satırlar: bu dosyanın
-- (`demo_tek_test`) ve eski tek kişilik tohumunun (`demo_tek`) randevuları,
-- tahsilatları ve müşterileri. Elle kurduğun randevulara DOKUNMAZ.
--
-- ── Ne yazar (T = şimdi, 5 dakikaya yuvarlanmış) ──────────────────────────
--   T−4 sa   Lazer Epilasyon    bitti · kartla tahsil edildi
--   T−3 sa   Kaş Tasarımı       bitti · NAKİT tahsil edildi  → Kasa: Düzelt / Geri al
--   T−2 sa20 Cilt Bakımı        bitti · TAHSİL EDİLMEDİ + ek kalem → Gün: ADİSYON AÇIK
--   T−1 sa   Ağda               gelmedi (müşteri hiç gelmedi)
--   T+20 dk  Manikür & Pedikür  SIRADAKİ → Başlat · bekleme · Bitir · Tahsil et
--   T+1 sa40 Kaş Tasarımı       KAYITSIZ müşteri (kayıt yok, numara yok)
--   T+2 sa20 Aromaterapi Masajı numaralı → randevu kartında "Mesajla hatırlat"
--   T+3 sa20 Kaş Tasarımı       İPTAL
--   dün      iki tahsil edilmiş randevu (geçmiş + Kasa "Bu hafta")
--   yarın    üç randevu (hatırlat: "yarın 10:00")     · öbür gün bir randevu
--   3 gün sonra BOŞ (B1) · ilk pazar KAPALI (B2)
-- Gece yarısını aşan ya da sabah 00:00'dan önceye düşen bugün satırı
-- ATLANIR ve sayısı yazılır.
--
-- ── 114'ü de sınıyor ──────────────────────────────────────────────────────
-- Randevular personel BOŞ yazılıyor: personeli sunucu (114) yazmalı. Sonda
-- boş kalan sayılıyor; 0 değilse NOTICE uyarır.
--
-- ── Çalışma saatleri ──────────────────────────────────────────────────────
-- Pazartesi–Cumartesi 08:00–23:55, PAZAR KAPALI. Akşam denemesinde gün
-- "kapandı" görünmesin diye geniş. Geri almak: settings.working_hours'u
-- İşletme → Çalışma saatleri'nden düzelt.
-- ============================================================

DO $$
DECLARE
    c_email    CONSTANT TEXT := 'hsnulgr@gmail.com';

    v_org      UUID;
    v_user     UUID;
    v_name     TEXT;
    v_count    INT;
    v_liste    TEXT;
    v_staff    UUID;

    v_local    TIMESTAMP := (now() AT TIME ZONE 'Europe/Istanbul');
    v_today    DATE      := (now() AT TIME ZONE 'Europe/Istanbul')::date;
    -- 5 dakikaya aşağı yuvarlanmış "şimdi"
    v_t        TIMESTAMP;

    v_slot     RECORD;
    v_day      DATE;
    v_start    TIMESTAMP;
    v_end      TIMESTAMP;
    v_cid      UUID;
    v_cphone   TEXT;
    v_push     "char";
    v_res      UUID;
    v_price    NUMERIC;
    v_color    TEXT;
    v_dk       INT;

    v_yazildi  INT := 0;
    v_atlandi  INT := 0;
    v_cakisti  INT := 0;
    v_bos      INT;
BEGIN
    v_t := date_trunc('hour', v_local)
         + floor(extract(minute FROM v_local) / 5) * INTERVAL '5 minutes';

    -- ── KAPI · hedef org ────────────────────────────────────────────────
    SELECT count(*) INTO v_count
      FROM organizations o JOIN auth.users u ON u.id = o.owner_id
     WHERE lower(u.email) = c_email AND o.solo IS TRUE;

    IF v_count <> 1 THEN
        SELECT string_agg(format(E'\n    %s  %s  solo=%s', o.id, coalesce(o.name, '(adsız)'), o.solo), '')
          INTO v_liste
          FROM organizations o JOIN auth.users u ON u.id = o.owner_id
         WHERE lower(u.email) = c_email;
        RAISE EXCEPTION E'DURDURULDU: % hesabının TEK bir solo org''u bekleniyordu, % bulundu.\nOrg''ları:%',
            c_email, v_count, coalesce(v_liste, ' (yok)');
    END IF;

    SELECT o.id, o.owner_id, o.name INTO v_org, v_user, v_name
      FROM organizations o JOIN auth.users u ON u.id = o.owner_id
     WHERE lower(u.email) = c_email AND o.solo IS TRUE;

    -- 114 ve kumanda tek aktif personel istiyor.
    SELECT count(*) INTO v_count FROM staff WHERE organization_id = v_org AND is_active;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'DURDURULDU: org''da % aktif personel var; tek kişilik kabuk ve 114 TAM BİR tane bekliyor.', v_count;
    END IF;
    SELECT id INTO v_staff FROM staff WHERE organization_id = v_org AND is_active;

    RAISE NOTICE '───────────────────────────────────────────────';
    RAISE NOTICE 'HEDEF ORG : %  (%)', coalesce(v_name, '(adsız)'), v_org;
    RAISE NOTICE 'SAHİBİ    : %', c_email;
    RAISE NOTICE 'ŞİMDİ (T) : % (İstanbul, 5 dk''ya yuvarlandı)', to_char(v_t, 'YYYY-MM-DD HH24:MI');
    RAISE NOTICE '───────────────────────────────────────────────';

    -- ── Çalışma saatleri ────────────────────────────────────────────────
    UPDATE settings SET working_hours = '[
        {"day":0,"dayName":"Pazar","start":"08:00","end":"23:55","isOff":true},
        {"day":1,"dayName":"Pazartesi","start":"08:00","end":"23:55","isOff":false},
        {"day":2,"dayName":"Salı","start":"08:00","end":"23:55","isOff":false},
        {"day":3,"dayName":"Çarşamba","start":"08:00","end":"23:55","isOff":false},
        {"day":4,"dayName":"Perşembe","start":"08:00","end":"23:55","isOff":false},
        {"day":5,"dayName":"Cuma","start":"08:00","end":"23:55","isOff":false},
        {"day":6,"dayName":"Cumartesi","start":"08:00","end":"23:55","isOff":false}
    ]'::jsonb
    WHERE user_id = v_user;

    -- ── Hizmetler — YALNIZ eksik olanlar ────────────────────────────────
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
     WHERE NOT EXISTS (SELECT 1 FROM services s WHERE s.organization_id = v_org AND s.name = t.name);

    -- ── Bildirim tetikleyicisi KAPALI (114'teki gibi) ────────────────────
    -- Personeli sunucu yazınca her randevu için "Yeni randevun var" giderdi.
    SELECT tgenabled INTO v_push FROM pg_trigger
     WHERE tgrelid = 'public.reservations'::regclass
       AND tgname = 'trg_push_on_reservation' AND NOT tgisinternal;
    IF v_push IN ('O', 'A') THEN
        EXECUTE 'ALTER TABLE public.reservations DISABLE TRIGGER trg_push_on_reservation';
    END IF;

    -- ── Temizlik — yalnız tohum işaretli satırlar ───────────────────────
    DELETE FROM payments
     WHERE organization_id = v_org
       AND reservation_id IN (SELECT id FROM reservations
                               WHERE organization_id = v_org
                                 AND (custom_fields @> '{"demo_tek": true}'::jsonb
                                   OR custom_fields @> '{"demo_tek_test": true}'::jsonb));
    DELETE FROM reservations
     WHERE organization_id = v_org
       AND (custom_fields @> '{"demo_tek": true}'::jsonb
         OR custom_fields @> '{"demo_tek_test": true}'::jsonb);
    DELETE FROM customers
     WHERE organization_id = v_org
       AND (custom_fields @> '{"demo_tek": true}'::jsonb
         OR custom_fields @> '{"demo_tek_test": true}'::jsonb);

    -- ── Müşteriler (numaralı) ───────────────────────────────────────────
    INSERT INTO customers (user_id, organization_id, name, phone, notes, custom_fields)
    SELECT v_user, v_org, t.ad, t.tel, '', '{"demo_tek_test": true}'::jsonb
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
     * ── RANDEVULAR ──────────────────────────────────────────────────────
     * gun: 0 bugün (dk = T'ye göre dakika), ±n başka gün (saat = sabit).
     * durum: paid_card · paid_cash · open (bitti, tahsil yok) · noshow ·
     *        next · plain · cancelled
     */
    FOR v_slot IN
        SELECT * FROM (VALUES
            -- gun, dk,    saat,          hizmet,               müşteri,        durum,       kayıtsız
            (0,   -240, NULL::TIME,    'Lazer Epilasyon',    'Sibel Karaca', 'paid_card', false),
            (0,   -180, NULL,          'Kaş Tasarımı',       'Gizem Ünal',   'paid_cash', false),
            (0,   -140, NULL,          'Cilt Bakımı',        'Pınar Aksoy',  'open',      false),
            (0,    -60, NULL,          'Ağda',               'Yasemin Kurt', 'noshow',    false),
            (0,     20, NULL,          'Manikür & Pedikür',  'Elif Demir',   'next',      false),
            (0,    100, NULL,          'Kaş Tasarımı',       'Selin Uçar',   'plain',     true ),
            (0,    140, NULL,          'Aromaterapi Masajı', 'Deniz Şahin',  'plain',     false),
            (0,    200, NULL,          'Kaş Tasarımı',       'Vildan Ay',    'cancelled', false),
            (-1,  NULL, TIME '11:00',  'Cilt Bakımı',        'Tuğçe Erden',  'paid_card', false),
            (-1,  NULL, TIME '15:00',  'Ağda',               'Sibel Karaca', 'paid_cash', false),
            (1,   NULL, TIME '10:00',  'Cilt Bakımı',        'Elif Demir',   'plain',     false),
            (1,   NULL, TIME '13:00',  'Kalıcı Makyaj',      'Tuğçe Erden',  'plain',     false),
            (1,   NULL, TIME '16:00',  'Ağda',               'Yasemin Kurt', 'plain',     false),
            (2,   NULL, TIME '11:00',  'Lazer Epilasyon',    'Sibel Karaca', 'plain',     false)
        ) AS s(gun, dk, saat, hizmet, musteri, durum, kayitsiz)
    LOOP
        SELECT duration, price, color INTO v_dk, v_price, v_color
          FROM services WHERE organization_id = v_org AND name = v_slot.hizmet
         ORDER BY created_at LIMIT 1;

        IF v_slot.gun = 0 THEN
            v_start := v_t + v_slot.dk * INTERVAL '1 minute';
        ELSE
            v_day := v_today + v_slot.gun;
            -- Pazar kapalı: bir gün öteye/beriye kay.
            IF extract(dow FROM v_day) = 0 THEN
                v_day := v_day + sign(v_slot.gun)::int;
            END IF;
            v_start := v_day + v_slot.saat;
        END IF;
        v_end := v_start + v_dk * INTERVAL '1 minute';

        -- Gece yarısını aşan ya da güne sığmayan satır yazılmıyor.
        IF v_start::date <> v_end::date OR v_end::time > TIME '23:55'
           OR (v_slot.gun = 0 AND v_start::date <> v_today) THEN
            v_atlandi := v_atlandi + 1;
            CONTINUE;
        END IF;

        v_cid := NULL;
        v_cphone := '';
        IF NOT v_slot.kayitsiz THEN
            SELECT id, phone INTO v_cid, v_cphone FROM customers
             WHERE organization_id = v_org AND name = v_slot.musteri
               AND custom_fields @> '{"demo_tek_test": true}'::jsonb
             LIMIT 1;
        END IF;

        BEGIN
            INSERT INTO reservations (
                user_id, organization_id, customer_id, customer_name, customer_phone,
                staff_id, date, start_time, end_time, service, service_color,
                status, source, is_paid, notes, custom_fields, adisyon_items,
                customer_arrived_at, arrived_at, service_ended_at
            ) VALUES (
                v_user, v_org,
                v_cid,
                v_slot.musteri,
                coalesce(v_cphone, ''),
                NULL,                                   -- 114 yazmalı
                v_start::date, v_start::time, v_end::time, v_slot.hizmet, v_color,
                CASE v_slot.durum
                    WHEN 'cancelled' THEN 'cancelled'
                    WHEN 'paid_card' THEN 'completed'
                    WHEN 'paid_cash' THEN 'completed'
                    WHEN 'open'      THEN 'completed'
                    ELSE 'confirmed' END,
                'manual',
                v_slot.durum IN ('paid_card', 'paid_cash'),
                '',
                '{"demo_tek_test": true}'::jsonb,
                CASE WHEN v_slot.durum = 'open'
                     THEN '[{"name": "Peeling maskesi", "price": 350, "qty": 1}]'::jsonb
                     ELSE '[]'::jsonb END,
                CASE WHEN v_slot.durum IN ('paid_card', 'paid_cash', 'open')
                     THEN v_start AT TIME ZONE 'Europe/Istanbul' END,
                CASE WHEN v_slot.durum IN ('paid_card', 'paid_cash', 'open')
                     THEN v_start AT TIME ZONE 'Europe/Istanbul' END,
                CASE WHEN v_slot.durum IN ('paid_card', 'paid_cash', 'open')
                     THEN v_end AT TIME ZONE 'Europe/Istanbul' END
            )
            RETURNING id INTO v_res;
        EXCEPTION WHEN exclusion_violation THEN
            -- Senin elle kurduğun bir randevuyla çakıştı: o satır atlanıyor.
            v_cakisti := v_cakisti + 1;
            CONTINUE;
        END;
        v_yazildi := v_yazildi + 1;

        IF v_slot.durum IN ('paid_card', 'paid_cash') THEN
            INSERT INTO payments (organization_id, customer_id, reservation_id,
                                  type, description, amount, method, paid_at)
            VALUES (v_org, v_cid, v_res, 'service', v_slot.hizmet, v_price,
                    CASE WHEN v_slot.durum = 'paid_cash' THEN 'cash' ELSE 'card' END,
                    v_end AT TIME ZONE 'Europe/Istanbul');
        END IF;
    END LOOP;

    IF v_push = 'O' THEN
        EXECUTE 'ALTER TABLE public.reservations ENABLE TRIGGER trg_push_on_reservation';
    ELSIF v_push = 'A' THEN
        EXECUTE 'ALTER TABLE public.reservations ENABLE ALWAYS TRIGGER trg_push_on_reservation';
    END IF;

    -- ── 114 denetimi: personeli sunucu yazdı mı ─────────────────────────
    SELECT count(*) INTO v_bos FROM reservations
     WHERE organization_id = v_org
       AND custom_fields @> '{"demo_tek_test": true}'::jsonb
       AND staff_id IS NULL;

    RAISE NOTICE 'Yazılan randevu: %  ·  saatine sığmadığı için atlanan: %  ·  senin randevunla çakışan: %',
        v_yazildi, v_atlandi, v_cakisti;
    IF v_bos = 0 THEN
        RAISE NOTICE '114 ÇALIŞIYOR: randevular personelsiz yazıldı, personeli sunucu yazdı (%).', v_staff;
    ELSE
        RAISE NOTICE 'UYARI: % randevu personelsiz kaldı — 114 çalışmadı!', v_bos;
    END IF;
    RAISE NOTICE 'Boş gün (B1): %  ·  kapalı gün (B2): ilk pazar', to_char(v_today + 3, 'DD.MM');
END $$;
