-- ============================================================
-- TimeFlow Migration 046: yalnızca personel push
-- ============================================================
-- Karar: yöneticiye/masaüstüne OS push GÖNDERİLMEZ. Bildirim yalnızca personele,
-- kendi cihazındaki staff_id aboneliğine gider (kişisel + realtime).
--   • Adisyon kasaya düşünce masaüstü, uygulama-içi realtime ile haberdar olur
--     (usePendingBillsAlert toast + sidebar badge) — burada push yok.
-- notify_push_on_reservation'dan yönetici-hedefli olaylar (1: yeni pending,
-- 4: adisyon kasada) çıkarılır; personel-hedefli olaylar (2,3,5,6) korunur.
-- Ayrıca eski yönetici abonelikleri temizlenir.
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

    -- (Yönetici olayları 1 ve 4 bilinçli olarak KALDIRILDI — yöneticiye push yok.)

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

-- Eski yönetici abonelikleri kalmasın (artık yöneticiye push yok)
DELETE FROM public.push_subscriptions WHERE role = 'manager';

NOTIFY pgrst, 'reload schema';
