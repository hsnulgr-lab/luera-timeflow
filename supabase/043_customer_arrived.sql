-- ============================================================
-- TimeFlow Migration 043: customer_arrived_at — geliş ≠ hizmet başlangıcı
-- ============================================================
-- İstenen akış: resepsiyonda kim varsa "Müşteri Geldi"ye basar → personele
-- push gider → personel müşteriye tıklayıp hizmeti KENDİSİ başlatır.
-- Bu yüzden geliş (customer_arrived_at) ile hizmet başlangıcı (arrived_at)
-- ayrı alanlardır; push geliş anında atılır.
--
-- Not: 041/042 uygulandıysa da sorun değil — fonksiyon burada son haliyle
-- yeniden tanımlanır. 042'nin arrived_by kolonu artık kullanılmıyor (zararsız).
-- ============================================================

ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS customer_arrived_at TIMESTAMPTZ;

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
    --    Hizmeti başlatmaz; personel bildirimi görüp hizmeti kendisi başlatır.
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

    RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
