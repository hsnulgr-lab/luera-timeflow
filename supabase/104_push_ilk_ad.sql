-- ============================================================
-- TimeFlow Migration 104: bildirimde YALNIZ İLK AD
-- ============================================================
-- Bugün bildirim gövdesi müşterinin TAM ADINI yazıyor
-- (`COALESCE(NEW.customer_name, 'Müşteri')`). Bu karar web push döneminde
-- verildi: bildirim kullanıcının kendi bilgisayarının ekranında açılıyordu.
--
-- Telefonda durum başka. Salonda telefon çoğu zaman tezgâhın üstünde duruyor
-- ve kilit ekranı orada duran HERKESE açık. "Ayşe Yılmaz · 14:30" yazan bir
-- bildirim, o salondaki başka müşterilere bir randevunun sahibini söylüyor.
-- KVKK'da veri sorumlusu salonun kendisi; bu risk ona ait ve gereksiz.
--
-- Kullanıcı kararı (2026-09-23): yalnız ilk ad. "Ayşe · Saç kesimi · 14:30".
-- Kim olduğunu görmek isteyen uygulamayı açar — bir dokunuş uzakta.
--
-- Kural TEK YERDE: bu fonksiyon hem Expo hem web kanalını besliyor, yani
-- masaüstü PWA bildirimleri de aynı kurala uyuyor. İki kanala iki ayrı gizlilik
-- kuralı yazmak, birinin bir gün unutulması demekti.
--
-- 046'nın kararı (yöneticiye push YOK) burada AYNEN korunuyor — bu dosya
-- yalnız metni değiştiriyor, olay listesine dokunmuyor.
--
-- Uygulama sırası: 103'ten sonra. Edge function deploy'u GEREKMEZ
-- (`remind`'ın kendi metni ayrıca düzeltildi — onun için deploy gerekiyor).
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

    -- İlk ad. Boş ya da tek boşluktan ibaret bir addan 'Müşteri'ye düşüyoruz:
    -- kilit ekranında " · Saç kesimi · 14:30" diye başlayan bir satır, adı
    -- gizlemek değil, veriyi kaybetmiş gibi görünmek olurdu.
    v_who := COALESCE(NULLIF(split_part(COALESCE(NEW.customer_name, ''), ' ', 1), ''), 'Müşteri');

    -- (Yönetici olayları 1 ve 4 — 046'da bilinçli olarak KALDIRILDI.)

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

    -- 3) Müşteri geldi (customer_arrived_at ilk kez dolduruldu) → atanmış personel
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

    -- 6) Atanmış aktif randevu ertelendi (tarih veya başlangıç saati değişti) → o personel
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

-- ── Doğrulama ───────────────────────────────────────────────────────────────
-- Fonksiyonun içinde tam ad kalmamalı:
--
--   select count(*) from pg_proc
--    where proname = 'notify_push_on_reservation'
--      and prosrc like '%NEW.customer_name, ''Müşteri''%';
--   -- beklenen: 0
--
--   select count(*) from pg_proc
--    where proname = 'notify_push_on_reservation' and prosrc like '%split_part%';
--   -- beklenen: 1
