-- ============================================================
-- TimeFlow Migration 107: MÜDÜRÜN "YENİ RANDEVU" BİLDİRİMİ DOĞRU ŞEYE BAKSIN
-- ============================================================
-- 106'daki koşul `NEW.status = 'pending'` idi ve TERS ÇALIŞIYORDU.
--
-- Sebep: `organizations.booking_auto_confirm` salonların ÇOĞUNDA AÇIK
-- (kullanıcı 2026-09-24: "genelde ne olursa olsun her randevu onaylı olur").
-- Açıkken web ve WhatsApp rezervasyonları doğrudan `confirmed` yazılıyor,
-- yani `pending` hiç oluşmuyor. Sonuç:
--
--   • Müşteri web'den randevu aldı   → confirmed → müdüre bildirim YOK
--   • Müşteri WhatsApp'tan aldı      → confirmed → müdüre bildirim YOK
--   • Müdür panelden kendi yazdı     → 'pending' (CalendarPage sabit) → BİLDİRİM
--
-- Yani bildirimin ötediği TEK durum, müdürün kendi az önce yazdığı randevuydu.
-- Telefonda 2026-09-24'te doğrulandı: anahtar açıktı, hiçbir şey gelmedi.
--
-- ── Doğru ayrım `status` değil `source` ─────────────────────────────────────
-- `015_reservation_source.sql` bu ayrımı zaten kuruyor:
--   manual   → panelden işletme oluşturdu   (müdür KENDİ yazdı, susmalı)
--   booking  → /book/{slug} veya WhatsApp AI (MÜŞTERİ aldı, haber vermeli)
--   leadflow → dış senkronizasyon            (müdür yazmadı, haber vermeli)
--
-- `status` "onay bekliyor mu" sorusunu yanıtlıyor; bizim sorduğumuz soru
-- "bunu müşteri mi yaptı" idi. Otomatik onay açıkken bu ikisi ayrışıyor.
--
-- Başlık duruma göre: `pending` ise "Onay bekleyen randevu", değilse
-- "Yeni randevu". Onay akışını kullanan salonlar eski metni görmeye devam
-- ediyor; kullanmayanlar artık doğru cümleyi görüyor.
--
-- Etiket `pending-` → `booked-` oldu: artık olay "onay bekliyor" değil
-- "randevu alındı". `reservationIdOf()` ilk tireden sonrasını okuyor,
-- telefon tarafı etkilenmiyor.
--
-- ── Kapsam ──────────────────────────────────────────────────────────────────
-- YALNIZ müdür olayı 1 değişti. Personel olaylarının dördü, müdürün iptal ve
-- adisyon olayları 106'daki hâliyle aynı — fonksiyon bütün olarak
-- değiştirildiği için hepsi burada yeniden yazılı.
--
-- Uygulama: 106'dan SONRA. Edge function deploy'u GEREKMİYOR, telefonda
-- yeniden derleme GEREKMİYOR.
-- Geri alma: `106_mudur_push_geri.sql`'i yeniden çalıştırmak.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_push_on_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url    TEXT;
    v_secret TEXT;
    v_when   TEXT;
    v_who    TEXT;
    v_hdrs   JSONB;
BEGIN
    SELECT value INTO v_url    FROM app_secrets WHERE key = 'FUNCTIONS_BASE_URL';
    SELECT value INTO v_secret FROM app_secrets WHERE key = 'PUSH_TRIGGER_SECRET';
    IF v_url IS NULL OR v_secret IS NULL THEN
        RETURN NEW;
    END IF;

    v_hdrs := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret);
    v_when := COALESCE(to_char(NEW.start_time, 'HH24:MI'), '');

    -- İlk ad (104). Kilit ekranı salonda herkese açık.
    v_who := COALESCE(NULLIF(split_part(COALESCE(NEW.customer_name, ''), ' ', 1), ''), 'Müşteri');

    -- ── MÜDÜR OLAYLARI (106) ────────────────────────────────────────────────

    -- 1) MÜŞTERİ randevu aldı → müdür   (107: koşul `status`ten `source`a geçti)
    IF TG_OP = 'INSERT' AND COALESCE(NEW.source, 'manual') <> 'manual' THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('role', 'manager'),
                'pref',    'booked',
                'payload', jsonb_build_object(
                    'title', CASE WHEN NEW.status = 'pending'
                                  THEN 'Onay bekleyen randevu'
                                  ELSE 'Yeni randevu' END,
                    'body',  v_who || ' · ' || COALESCE(NEW.service, '') ||
                             CASE WHEN v_when <> '' THEN ' · ' || v_when ELSE '' END,
                    'url',   '/calendar',
                    'tag',   'booked-' || NEW.id::text
                )
            )
        );
    END IF;

    -- 4) Adisyon kasaya gönderildi, tahsil edilmemiş → müdür
    IF TG_OP = 'UPDATE'
       AND OLD.service_ended_at IS NULL AND NEW.service_ended_at IS NOT NULL
       AND COALESCE(NEW.is_paid, false) = false THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('role', 'manager'),
                'pref',    'cash',
                'payload', jsonb_build_object(
                    'title', 'Adisyon kasada 💰',
                    'body',  v_who || ' · ' || COALESCE(NEW.service, '') ||
                             ' · tahsil bekliyor',
                    'url',   '/kasa',
                    'tag',   'kasa-' || NEW.id::text
                )
            )
        );
    END IF;

    -- 7) Randevu iptal edildi → MÜDÜR (personelinki ayrıca, aşağıda 5'te)
    --
    -- İptal müdürü ilgilendiriyor çünkü boşalan saat onun kararı: yerine
    -- birini almak, bekleme listesine bakmak ya da hiçbir şey yapmamak.
    IF TG_OP = 'UPDATE'
       AND OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled' THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('role', 'manager'),
                'pref',    'cancelled',
                'payload', jsonb_build_object(
                    'title', 'Randevu iptal edildi',
                    'body',  v_who || ' · ' || COALESCE(NEW.service, '') ||
                             CASE WHEN v_when <> '' THEN ' · ' || v_when ELSE '' END,
                    'url',   '/calendar',
                    'tag',   'iptal-mudur-' || NEW.id::text
                )
            )
        );
    END IF;

    -- ── PERSONEL OLAYLARI — 046'dan beri aynı, `pref` TAŞIMIYOR ─────────────

    -- 2) Personele atama → o personel
    IF NEW.staff_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR OLD.staff_id IS DISTINCT FROM NEW.staff_id) THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('staffId', NEW.staff_id),
                'payload', jsonb_build_object(
                    'title', 'Yeni randevun var',
                    'body',  v_who || ' · ' || COALESCE(NEW.service, '') ||
                             CASE WHEN v_when <> '' THEN ' · ' || v_when ELSE '' END,
                    'url',   '/calendar',
                    'tag',   'assign-' || NEW.id::text
                )
            )
        );
    END IF;

    -- 3) Müşteri geldi → atanmış personel
    IF TG_OP = 'UPDATE' AND NEW.staff_id IS NOT NULL
       AND OLD.customer_arrived_at IS NULL AND NEW.customer_arrived_at IS NOT NULL THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('staffId', NEW.staff_id),
                'payload', jsonb_build_object(
                    'title', 'Müşterin geldi 👋',
                    'body',  v_who || ' · ' || COALESCE(NEW.service, '') ||
                             CASE WHEN v_when <> '' THEN ' · ' || v_when ELSE '' END,
                    'url',   '/personel',
                    'tag',   'arrived-' || NEW.id::text
                )
            )
        );
    END IF;

    -- 5) Atanmış randevu iptal edildi → o personel
    IF TG_OP = 'UPDATE' AND NEW.staff_id IS NOT NULL
       AND OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled' THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('staffId', NEW.staff_id),
                'payload', jsonb_build_object(
                    'title', 'Randevu iptal edildi',
                    'body',  v_who || ' · ' || COALESCE(NEW.service, '') ||
                             CASE WHEN v_when <> '' THEN ' · ' || v_when ELSE '' END,
                    'url',   '/personel',
                    'tag',   'cancel-' || NEW.id::text
                )
            )
        );
    END IF;

    -- 6) Atanmış aktif randevu ertelendi → o personel
    IF TG_OP = 'UPDATE' AND NEW.staff_id IS NOT NULL
       AND NEW.status <> 'cancelled'
       AND (OLD.date IS DISTINCT FROM NEW.date OR OLD.start_time IS DISTINCT FROM NEW.start_time) THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('staffId', NEW.staff_id),
                'payload', jsonb_build_object(
                    'title', 'Randevu saati değişti',
                    'body',  v_who || ' · ' || COALESCE(NEW.service, '') ||
                             ' · yeni: ' || COALESCE(to_char(NEW.date, 'DD.MM'), '') ||
                             CASE WHEN v_when <> '' THEN ' ' || v_when ELSE '' END,
                    'url',   '/personel',
                    'tag',   'moved-' || NEW.id::text
                )
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
