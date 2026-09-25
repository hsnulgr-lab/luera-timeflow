-- ============================================================
-- DEMO GÜZELLİK SALONU — App Store hakem hesabı + TestSprite'ın güvenli zemini
-- ============================================================
-- ⚠️  BU BİR MIGRATION DEĞİLDİR. Numaralı dosyalarla (NNN_*.sql) karıştırma:
--     temiz bir kurulumda çalışmaz, çünkü önce GERÇEK KAYIT AKIŞINDAN geçmiş
--     bir demo hesabı olmalı. `CORE_*.sql` gibi sözleşme/araç dosyasıdır.
--
-- ── Neden elle auth.users'a satır atmıyoruz ────────────────────────────────
-- `organizations.owner_id` → `auth.users(id)`. Şifre karması, `auth.identities`
-- satırı ve doğrulama durumu elle yazıldığında sessizce bozuk bir hesap çıkar;
-- üstelik 006'daki `handle_new_user` tetikleyicisi org + üyelik + `settings`
-- satırını zaten kendisi kuruyor. Bu yüzden demo hesabı UYGULAMANIN KENDİ
-- KAYIT EKRANINDAN açılır, bu dosya yalnızca İÇİNİ doldurur.
--
-- ── Bu dosya üretim veritabanında çalışıyor ───────────────────────────────
-- Gerçek salonun verisine dokunmasının bedeli geri alınamaz. Bu yüzden ÜÇ
-- KAPI var ve üçü de geçilmeden tek satır yazılmıyor:
--   1. E-posta tam olarak BİR kullanıcıya çözülmeli
--   2. O kullanıcının sahibi olduğu tam olarak BİR org bulunmalı
--   3. O org ya BOŞ olmalı (yeni kayıt) ya da slug'ı zaten 'demo-luera' olmalı
--      → İçinde randevu olan, demo olmayan bir org görürse KOMUT DURUR.
--
-- Tekrar çalıştırılabilir: demo org'un verisini siler, yeniden kurar. Silme
-- her zaman `organization_id = <demo org>` ile sınırlı — genel DELETE yok.
--
-- ── Tarihler GÖRELİ ────────────────────────────────────────────────────────
-- Sabit tarih yazılırsa demo birkaç hafta sonra "geçmiş" görünür ve ekran
-- görüntüleri çürür. Hepsi bugüne göre hesaplanıyor. Gün sınırı İstanbul
-- saatiyle alınıyor: sunucu UTC ile çalışıyor, `current_date` gece yarısından
-- sonra Türkiye'de hâlâ "dün"ü gösterirdi.
-- ============================================================

DO $$
DECLARE
    -- ⬇️ KAYIT EKRANINDAN AÇTIĞIN DEMO HESABIN E-POSTASI
    v_email    TEXT := 'demo@lueratech.com';

    v_user     UUID;
    v_org      UUID;
    v_slug     TEXT;
    v_count    INT;
    v_today    DATE := (now() AT TIME ZONE 'Europe/Istanbul')::date;
    -- Bugünün seansları SAATE göre konumlanıyor.
    --
    -- İKİ KİP VAR ve bu bilerek böyle. Çapayı mesai içine kıstırmak tek başına
    -- YETMİYOR: gece 02:00'de çalıştırıldığında seanslar 09:20'ye yazılıyor ama
    -- "geldi/başladı/bitti" damgaları `now()`a bağlı olduğu için 01:30'u
    -- gösteriyordu — yani randevu BAŞLAMADAN ÖNCE bitmiş görünüyordu.
    -- Ekran yalan söylemez kuralı demo verisi için de geçerli.
    --
    --   MESAİ İÇİNDE (10:30–17:00) → çapa = şu an; aşamalar gerçekten yaşanır
    --   MESAİ DIŞINDA              → çapa = 11:00; HİÇBİR aşama damgası yazılmaz,
    --                                altı seans da "yaklaşan" olarak durur
    v_saat     TIME := (now() AT TIME ZONE 'Europe/Istanbul')::time;
    v_canli    BOOLEAN := v_saat BETWEEN TIME '10:30' AND TIME '17:00';
    v_anchor   TIME := CASE WHEN v_canli THEN v_saat ELSE TIME '11:00' END;

    v_s1 UUID; v_s2 UUID; v_s3 UUID;   -- personel
    v_c  UUID;                          -- müşteri (döngüde)
BEGIN
    -- ── KAPI 1 · kullanıcı ──────────────────────────────────────────────
    SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(v_email);
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'DURDURULDU: "%" ile kullanıcı yok. Önce uygulamanın KAYIT ekranından bu hesabı aç.', v_email;
    END IF;

    -- ── KAPI 2 · org ────────────────────────────────────────────────────
    SELECT count(*) INTO v_count FROM organizations WHERE owner_id = v_user;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'DURDURULDU: "%" kullanıcısının sahibi olduğu org sayısı % (1 bekleniyordu).', v_email, v_count;
    END IF;
    SELECT id, slug INTO v_org, v_slug FROM organizations WHERE owner_id = v_user;

    -- ── KAPI 3 · burası gerçek bir salon olmasın ────────────────────────
    SELECT count(*) INTO v_count FROM reservations WHERE organization_id = v_org;
    IF v_count > 0 AND coalesce(v_slug, '') <> 'demo-luera' THEN
        RAISE EXCEPTION
            'DURDURULDU: org % içinde % randevu var ve slug "%" — bu gerçek bir salon olabilir. Tek satır yazılmadı.',
            v_org, v_count, coalesce(v_slug, '(boş)');
    END IF;

    RAISE NOTICE 'Demo org: %  (kullanıcı: %)', v_org, v_email;

    -- ── Kimlik ──────────────────────────────────────────────────────────
    -- booking_auto_confirm `organizations`ta (013), `settings`te DEĞİL.
    -- Public profil alanları da dolduruluyor: /book/demo-luera ekran
    -- görüntüsünde boş bir başlık değil, gerçek bir salon görünsün.
    UPDATE organizations SET
        name                 = 'Demo Güzellik Salonu',
        slug                 = 'demo-luera',
        bio                  = 'Randevunuzu saniyeler içinde oluşturun.',
        address              = 'Kadıköy, İstanbul',
        public_phone         = '0216 000 00 00',
        booking_auto_confirm = true
    WHERE id = v_org;

    -- Demo salon HER GÜN açık. Varsayılan çalışma saatlerinde Pazar kapalı;
    -- randevular bugüne göre -6..+7 gün yayıldığı için bir kısmı Pazar'a
    -- düşüyordu ve takvimde "kapalı günde randevu" gibi görünüyordu. Ekran
    -- görüntüsünde kırık duran bir ayrıntı, bitmemiş iş demektir.
    UPDATE settings SET
        business_name = 'Demo Güzellik Salonu',
        sector        = 'guzellik',
        slot_duration = 30,
        working_hours = '[
            {"day":0,"dayName":"Pazar","start":"10:00","end":"18:00","isOff":false},
            {"day":1,"dayName":"Pazartesi","start":"09:00","end":"19:00","isOff":false},
            {"day":2,"dayName":"Salı","start":"09:00","end":"19:00","isOff":false},
            {"day":3,"dayName":"Çarşamba","start":"09:00","end":"19:00","isOff":false},
            {"day":4,"dayName":"Perşembe","start":"09:00","end":"19:00","isOff":false},
            {"day":5,"dayName":"Cuma","start":"09:00","end":"19:00","isOff":false},
            {"day":6,"dayName":"Cumartesi","start":"10:00","end":"19:00","isOff":false}
        ]'::jsonb
    WHERE user_id = v_user;

    -- Ayar satırı yoksa sessizce geçmek yanlış olur: `handle_new_user` onu
    -- kurmuş olmalıydı. Yoksa uygulama varsayılanlarla garip davranır ve
    -- bunu ancak ekranda fark ederiz.
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'DURDURULDU: % için settings satırı bulunamadı (% satır). Kayıt akışı yarım kalmış olabilir.', v_email, v_count;
    END IF;

    -- ── ABONELİK: süresiz açık ──────────────────────────────────────────
    -- Apple hakemi her güncellemede yeniden bakıyor. `expires_at = NULL`
    -- olmadan, ENTITLEMENT_ENFORCE ileride 'true' yapıldığı gün hakem kapalı
    -- kapıya çarpar ve uygulama reddedilir. `computeAccess` süre yoksa
    -- "süresiz abonelik" diyor — aradığımız tam olarak bu.
    INSERT INTO org_entitlement (organization_id, state, plan, cycle, trial_ends_at, expires_at, grace_until, last_event)
    VALUES (v_org, 'active', 'pro', 'yearly', NULL, NULL, NULL, 'demo_manual')
    ON CONFLICT (organization_id) DO UPDATE SET
        state = 'active', plan = 'pro', cycle = 'yearly',
        trial_ends_at = NULL, expires_at = NULL, grace_until = NULL,
        last_event = 'demo_manual', updated_at = now();

    -- ── Temizlik — YALNIZ demo org ──────────────────────────────────────
    -- Sıra FK'lere göre: paket hareketleri → paketler → randevular → müşteriler.
    -- Hepsi org bazlı; genel DELETE yok.
    DELETE FROM package_rights_ledger WHERE organization_id = v_org;
    DELETE FROM customer_packages     WHERE organization_id = v_org;
    DELETE FROM package_templates     WHERE organization_id = v_org;
    DELETE FROM reservations          WHERE organization_id = v_org;
    DELETE FROM customers             WHERE organization_id = v_org;
    DELETE FROM services              WHERE organization_id = v_org;
    DELETE FROM staff                 WHERE organization_id = v_org;

    -- ── Personel ────────────────────────────────────────────────────────
    INSERT INTO staff (organization_id, name, specialty, phone, color, is_active)
    VALUES (v_org, 'Elif Demir',   'Cilt Bakımı & Lazer', '0555 000 0001', '#8B5CF6', true) RETURNING id INTO v_s1;
    INSERT INTO staff (organization_id, name, specialty, phone, color, is_active)
    VALUES (v_org, 'Selin Kaya',   'Kalıcı Makyaj & Kaş', '0555 000 0002', '#06B6D4', true) RETURNING id INTO v_s2;
    INSERT INTO staff (organization_id, name, specialty, phone, color, is_active)
    VALUES (v_org, 'Derya Toprak', 'Masaj & Aromaterapi', '0555 000 0003', '#F59E0B', true) RETURNING id INTO v_s3;

    -- ── Hizmetler ───────────────────────────────────────────────────────
    INSERT INTO services (user_id, organization_id, name, duration, price, color) VALUES
        (v_user, v_org, 'Cilt Bakımı',         60,  1200, '#8B5CF6'),
        (v_user, v_org, 'Ağda',                45,   900, '#EC4899'),
        (v_user, v_org, 'Lazer Epilasyon',     30,  1500, '#06B6D4'),
        (v_user, v_org, 'Manikür & Pedikür',   60,   750, '#F59E0B'),
        (v_user, v_org, 'Kaş Tasarımı',        20,   350, '#10B981'),
        (v_user, v_org, 'Kalıcı Makyaj',      120,  4500, '#F43F5E'),
        (v_user, v_org, 'Aromaterapi Masajı',  50,  1100, '#64748B');

    -- ── Paketler ────────────────────────────────────────────────────────
    -- Kenar çubuğunda "Paketler" var; boş bir sayfa ekran görüntüsünde
    -- ürünün eksik olduğunu düşündürür. Bunlar yalnız TANIM (şablon);
    -- kimseye satılmış paket yazılmıyor — olmayan bir satışı göstermeyiz.
    INSERT INTO package_templates (organization_id, name, session_count, price, color, validity_months, is_active) VALUES
        (v_org, 'Lazer Epilasyon · 6 Seans',  6, 7500, '#06B6D4', 12, true),
        (v_org, 'Cilt Bakımı · 4 Seans',      4, 4000, '#8B5CF6',  6, true),
        (v_org, 'Aromaterapi Masajı · 10 Seans', 10, 9500, '#64748B', 12, true);

    -- ── Müşteriler + randevular ─────────────────────────────────────────
    -- Tek döngü: her müşteri için bir randevu. Gün ofseti -6..+7 arasında
    -- dolaşıyor, böylece takvim geçmişi de geleceği de dolu görünüyor.
    FOR v_i IN 0..13 LOOP
        INSERT INTO customers (user_id, organization_id, name, phone, notes)
        VALUES (
            v_user, v_org,
            (ARRAY['Ayşe Yıldız','Zeynep Arslan','Burak Koç','Deniz Şahin','Ece Polat',
                   'Fatih Öztürk','Gizem Ünal','Hakan Er','İrem Duran','Kaan Yavuz',
                   'Leyla Acar','Murat Tekin','Nazlı Güler','Onur Bilgin'])[v_i + 1],
            '0532 ' || lpad((1000000 + v_i * 37)::text, 7, '0'),
            ''
        ) RETURNING id INTO v_c;

        INSERT INTO reservations (
            user_id, organization_id, customer_id, customer_name, customer_phone,
            staff_id, date, start_time, end_time, service, service_color,
            status, source, is_paid, notes
        )
        SELECT
            v_user, v_org, v_c, c.name, c.phone,
            (ARRAY[v_s1, v_s2, v_s3])[(v_i % 3) + 1],
            v_today + CASE WHEN v_i < 7 THEN v_i - 7 ELSE v_i - 6 END,
            (TIME '09:00' + ((v_i % 8) * INTERVAL '1 hour')),
            (TIME '09:00' + ((v_i % 8) * INTERVAL '1 hour')) + (s.duration * INTERVAL '1 minute'),
            s.name, s.color,
            -- Geçmiş randevular tamamlandı ve ödendi → Kasa'da gerçek ciro
            -- görünür. Gelecekler onaylı. Biri iptal, biri onay bekliyor:
            -- ekranların boş hâllerini değil, GERÇEK hâllerini göstermek için.
            CASE
                WHEN v_i = 4  THEN 'cancelled'
                WHEN v_i = 11 THEN 'pending'
                WHEN v_i < 7  THEN 'completed'
                ELSE 'confirmed'
            END,
            'manual',
            (v_i < 7 AND v_i <> 4),
            ''
        FROM customers c, services s
        WHERE c.id = v_c
          AND s.organization_id = v_org
          AND s.name = (ARRAY['Cilt Bakımı','Ağda','Lazer Epilasyon','Manikür & Pedikür',
                              'Kaş Tasarımı','Kalıcı Makyaj','Aromaterapi Masajı'])[(v_i % 7) + 1];
    END LOOP;

    -- ── BUGÜN ──────────────────────────────────────────────────────────
    -- Dashboard'un operasyon sütunları (Bekliyor · İşlemde · Kasada) zaman
    -- damgalarından hesaplanıyor; hepsi boşken ürünün en iyi ekranı ölü
    -- görünüyor. Burada her aşamadan GERÇEK bir kayıt var — durumlar
    -- uydurulmuyor, ilgili damga yazıldığı için o sütuna düşüyorlar.
    --   customer_arrived_at → geldi, bekliyor
    --   arrived_at          → işlem başladı
    --   service_ended_at    → bitti; is_paid=false ise kasada
    FOR v_i IN 0..5 LOOP
        INSERT INTO customers (user_id, organization_id, name, phone, notes)
        VALUES (
            v_user, v_org,
            (ARRAY['Pınar Aksoy','Sibel Karaca','Tuğçe Erden','Ufuk Şen',
                   'Vildan Ay','Yasemin Kurt'])[v_i + 1],
            '0533 ' || lpad((2000000 + v_i * 53)::text, 7, '0'),
            ''
        ) RETURNING id INTO v_c;

        INSERT INTO reservations (
            user_id, organization_id, customer_id, customer_name, customer_phone,
            staff_id, date, start_time, end_time, service, service_color,
            status, source, is_paid, notes,
            customer_arrived_at, arrived_at, service_ended_at
        )
        SELECT
            v_user, v_org, v_c, c.name, c.phone,
            (ARRAY[v_s1, v_s2, v_s3])[(v_i % 3) + 1],
            v_today,
            v_anchor + ((v_i - 2) * INTERVAL '50 minutes'),
            v_anchor + ((v_i - 2) * INTERVAL '50 minutes') + (s.duration * INTERVAL '1 minute'),
            s.name, s.color,
            CASE WHEN v_canli AND v_i <= 1 THEN 'completed' ELSE 'confirmed' END,
            'manual',
            (v_canli AND v_i = 0),                       -- yalnız ilki ödendi
            '',
            CASE WHEN v_canli AND v_i <= 3 THEN now() - ((4 - v_i) * INTERVAL '35 minutes') END,
            CASE WHEN v_canli AND v_i <= 2 THEN now() - ((3 - v_i) * INTERVAL '35 minutes') END,
            CASE WHEN v_canli AND v_i <= 1 THEN now() - ((2 - v_i) * INTERVAL '30 minutes') END
        FROM customers c, services s
        WHERE c.id = v_c
          AND s.organization_id = v_org
          AND s.name = (ARRAY['Cilt Bakımı','Lazer Epilasyon','Aromaterapi Masajı',
                              'Manikür & Pedikür','Kaş Tasarımı','Ağda'])[v_i + 1];
    END LOOP;

    SELECT count(*) INTO v_count FROM reservations WHERE organization_id = v_org;
    RAISE NOTICE 'Demo salon hazır — % randevu (6''sı bugün), 3 personel, 7 hizmet, 3 paket, 20 müşteri.', v_count;
    IF v_canli THEN
        RAISE NOTICE 'CANLI KİP: bugünün seansları şu ana göre yerleşti — Bekliyor/İşlemde/Kasada dolu.';
    ELSE
        RAISE NOTICE 'SAKİN KİP: mesai dışındasın (%), aşama damgası YAZILMADI — altı seans da yaklaşan.', v_saat;
        RAISE NOTICE 'Ekran görüntüsü için 10:30-17:00 arasında YENİDEN çalıştır.';
    END IF;
    RAISE NOTICE 'Rezervasyon sayfası: https://timeflow.lueratech.com/book/demo-luera';
END $$;
