-- ============================================================
-- TimeFlow Migration 038: Randevu → push bildirim trigger'ı
-- ============================================================
-- reservations tablosundaki her yazımı tek noktadan yakalar ve pg_net ile
-- send-push edge fonksiyonunu çağırır (manuel/public-booking/whatsapp/gateway
-- yollarının hepsi buradan geçer).
--
-- İki olay:
--   1) Yeni pending randevu (INSERT status=pending) → müdüre push
--   2) Personele atama (INSERT staff_id dolu VEYA UPDATE ile staff_id değişti) → o personele push
--
-- Config app_secrets'tan okunur:
--   FUNCTIONS_BASE_URL  (örn. https://supabase.timeflow.lueratech.com/functions/v1)
--   PUSH_TRIGGER_SECRET (send-push'ın beklediği x-push-secret)
-- İkisi de yoksa trigger sessizce çıkar (bildirim kapalı = akış bozulmaz).
-- pg_net.http_post asenkron: transaction'ı bloklamaz.
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

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_on_reservation ON public.reservations;
CREATE TRIGGER trg_push_on_reservation
    AFTER INSERT OR UPDATE ON public.reservations
    FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_reservation();

NOTIFY pgrst, 'reload schema';
