-- ============================================================
-- TimeFlow Migration 042: Masa modülü sistem entegrasyonu
-- ============================================================
-- Masa modülü şimdiye dek izole bir adaydı. Bu migration üç bağı kurar:
--   1) customer_id : masa rezervasyonu müşteri kartına bağlanır (LTV/geçmiş)
--   2) staff_id    : masaya garson ataması (opsiyonel)
--   3) push trigger: yeni masa rezervasyonu → müdüre; garson ataması → o
--      personele push (038_push_reservation_trigger ile aynı desen/altyapı)
-- Kasa bağı şema gerektirmez: tahsilat mevcut payments tablosuna yazılır.
-- ============================================================

ALTER TABLE public.table_reservations
    ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS staff_id    UUID REFERENCES staff(id)     ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_table_res_customer ON public.table_reservations(customer_id);

-- ── Push trigger ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_push_on_table_reservation()
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

    -- 1) Yeni masa rezervasyonu (walk-in hariç: reserved) → müdür
    IF TG_OP = 'INSERT' AND NEW.status = 'reserved' THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('role', 'manager'),
                'payload', jsonb_build_object(
                    'title', 'Yeni masa rezervasyonu',
                    'body',  COALESCE(NEW.customer_name, 'Misafir') || ' · ' || NEW.party_size || ' kişi' ||
                             CASE WHEN v_when <> '' THEN ' · ' || v_when ELSE '' END,
                    'url',   '/masa',
                    'tag',   'table-res-' || NEW.id::text
                )
            )
        );
    END IF;

    -- 2) Garson ataması → o personel
    IF NEW.staff_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR OLD.staff_id IS DISTINCT FROM NEW.staff_id) THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('staffId', NEW.staff_id),
                'payload', jsonb_build_object(
                    'title', 'Masana rezervasyon atandı',
                    'body',  COALESCE(NEW.customer_name, 'Misafir') || ' · ' || NEW.party_size || ' kişi' ||
                             CASE WHEN v_when <> '' THEN ' · ' || v_when ELSE '' END,
                    'url',   '/masa',
                    'tag',   'table-assign-' || NEW.id::text
                )
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_on_table_reservation ON public.table_reservations;
CREATE TRIGGER trg_push_on_table_reservation
    AFTER INSERT OR UPDATE ON public.table_reservations
    FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_table_reservation();

NOTIFY pgrst, 'reload schema';
