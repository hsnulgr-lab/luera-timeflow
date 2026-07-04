-- ============================================================
-- TimeFlow Migration 045: iptal / erteleme → personele push
-- ============================================================
-- Köprünün son eksiği: müdür, personele atanmış bir randevuyu iptal ederse
-- veya saatini/tarihini değiştirirse personel gelmeyecek/kayan müşteriyi
-- bekler. 044'teki fonksiyona 5. ve 6. olaylar eklenir (CREATE OR REPLACE).
--   5) status → cancelled (atanmış randevu)         → o personel
--   6) date/start_time değişti (atanmış, aktif)      → o personel
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
    v_hdrs   JSONB;
BEGIN
    SELECT value INTO v_url    FROM app_secrets WHERE key = 'FUNCTIONS_BASE_URL';
    SELECT value INTO v_secret FROM app_secrets WHERE key = 'PUSH_TRIGGER_SECRET';
    IF v_url IS NULL OR v_secret IS NULL THEN
        RETURN NEW;
    END IF;

    v_hdrs := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret);
    v_when := COALESCE(to_char(NEW.start_time, 'HH24:MI'), '');

    -- 1) Yeni pending randevu → müdür
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('role', 'manager'),
                'payload', jsonb_build_object(
                    'title', 'Onay bekleyen randevu',
                    'body',  COALESCE(NEW.customer_name, 'Müşteri') || ' · ' || COALESCE(NEW.service, '') ||
                             CASE WHEN v_when <> '' THEN ' · ' || v_when ELSE '' END,
                    'url',   '/calendar',
                    'tag',   'pending-' || NEW.id::text
                )
            )
        );
    END IF;

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
                    'body',  COALESCE(NEW.customer_name, 'Müşteri') || ' · ' || COALESCE(NEW.service, '') ||
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
                    'body',  COALESCE(NEW.customer_name, 'Müşteri') || ' · ' || COALESCE(NEW.service, '') ||
                             CASE WHEN v_when <> '' THEN ' · ' || v_when ELSE '' END,
                    'url',   '/personel',
                    'tag',   'arrived-' || NEW.id::text
                )
            )
        );
    END IF;

    -- 4) Adisyon kasaya gönderildi (service_ended_at ilk kez doldu, tahsil edilmemiş) → müdür
    IF TG_OP = 'UPDATE'
       AND OLD.service_ended_at IS NULL AND NEW.service_ended_at IS NOT NULL
       AND COALESCE(NEW.is_paid, false) = false THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('role', 'manager'),
                'payload', jsonb_build_object(
                    'title', 'Adisyon kasada 💰',
                    'body',  COALESCE(NEW.customer_name, 'Müşteri') || ' · ' || COALESCE(NEW.service, '') ||
                             ' · tahsil bekliyor',
                    'url',   '/kasa',
                    'tag',   'kasa-' || NEW.id::text
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
                    'body',  COALESCE(NEW.customer_name, 'Müşteri') || ' · ' || COALESCE(NEW.service, '') ||
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
                    'body',  COALESCE(NEW.customer_name, 'Müşteri') || ' · ' || COALESCE(NEW.service, '') ||
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
