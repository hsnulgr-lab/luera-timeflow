-- ============================================================
-- TimeFlow Migration 132: Sıradaki randevu daveti zamanlayıcıda
-- ============================================================
-- Davet (settings.rebook_enabled, 030) masaüstünde tahsilat tamamlandığı AN
-- tarayıcıdan gidiyordu. Hesap kasada, müşteri karşıdayken kapatıldığı için
-- "bir sonraki randevunuzu ayırtmak ister misiniz?" daha salondan çıkmadan
-- telefonuna düşüyordu (kullanıcı, 2026-10-29). Kasada randevusunu almış
-- olana da gidiyordu; telefondan kapatılan seansta hiç gitmiyordu.
--
-- scheduler_v2 açık işletmede randevu İLK KEZ kapanınca (tamamlandı + ödendi;
-- ikisi farklı ekranlardan, farklı sırayla gelebilir) 1,5 saat sonrasına
-- `rebook` işi yazılır. wa-scheduler gönderirken yeniden bakar: hâlâ kapalı
-- mı, ileri randevusu var mı, memnuniyet sorusuna 3 ve altı mı verdi, ayar
-- açık mı. Bayrak kapalı işletmede istemcideki eski gönderim sürer.
--
-- Yalnız wa_plan_jobs() yenilenir; tetikleyicinin kendisi aynı (131).

BEGIN;

ALTER TABLE public.wa_jobs DROP CONSTRAINT IF EXISTS wa_jobs_kind_check;
ALTER TABLE public.wa_jobs ADD CONSTRAINT wa_jobs_kind_check
    CHECK (kind IN ('reminder_24h', 'reminder_2h', 'nudge', 'satisfaction', 'slot_offer', 'rebook'));

CREATE OR REPLACE FUNCTION public.wa_plan_jobs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_on    BOOLEAN;
    v_moved BOOLEAN;
BEGIN
    SELECT COALESCE((features->>'scheduler_v2')::boolean, false) INTO v_on
      FROM org_whatsapp WHERE organization_id = NEW.organization_id;
    IF NOT COALESCE(v_on, false) THEN RETURN NEW; END IF;

    -- Kapanış ödemeyle de gelebilir (durum zaten 'completed'); aşağıdaki
    -- "plan değişmedi" çıkışından ÖNCE bakılır.
    IF NEW.status = 'completed' AND COALESCE(NEW.is_paid, false)
       AND NOT COALESCE(NEW.rebook_sent, false)
       AND (TG_OP = 'INSERT' OR NOT (OLD.status = 'completed' AND COALESCE(OLD.is_paid, false))) THEN
        BEGIN
            INSERT INTO wa_jobs (organization_id, reservation_id, kind, due_at, stamp)
            VALUES (NEW.organization_id, NEW.id, 'rebook', now() + interval '90 minutes',
                    NEW.date::text || ' ' || to_char(NEW.start_time, 'HH24:MI'))
            ON CONFLICT (reservation_id, kind) WHERE status = 'pending' DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'wa_plan_jobs rebook: %', SQLERRM;
        END;
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.date           IS NOT DISTINCT FROM NEW.date
       AND OLD.start_time     IS NOT DISTINCT FROM NEW.start_time
       AND OLD.end_time       IS NOT DISTINCT FROM NEW.end_time
       AND OLD.status         IS NOT DISTINCT FROM NEW.status
       AND OLD.customer_phone IS NOT DISTINCT FROM NEW.customer_phone THEN
        RETURN NEW; -- not, ödeme, hatırlatma bayrağı… planı değiştirmez
    END IF;

    BEGIN
        v_moved := TG_OP = 'UPDATE'
            AND (OLD.date IS DISTINCT FROM NEW.date OR OLD.start_time IS DISTINCT FROM NEW.start_time);

        -- Eski plan bayadı; yenisi aşağıda yazılır.
        UPDATE wa_jobs SET status = 'cancelled', note = 'yeniden planlandı', updated_at = now()
         WHERE reservation_id = NEW.id AND status = 'pending'
           AND kind IN ('reminder_24h', 'reminder_2h', 'nudge', 'satisfaction');

        IF NEW.status = 'cancelled' THEN
            -- İleri bir saat boşaldı: bekleme listesine sırayla teklif.
            IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'cancelled'
               AND (NEW.date + NEW.start_time) AT TIME ZONE 'Europe/Istanbul' > now() + interval '2 hours' THEN
                INSERT INTO wa_jobs (organization_id, reservation_id, kind, due_at, stamp)
                VALUES (NEW.organization_id, NEW.id, 'slot_offer', now(),
                        NEW.date::text || ' ' || to_char(NEW.start_time, 'HH24:MI'))
                ON CONFLICT (reservation_id, kind) WHERE status = 'pending' DO NOTHING;
            END IF;
            RETURN NEW;
        END IF;

        PERFORM wa_plan_reservation(NEW, v_moved);
    EXCEPTION WHEN OTHERS THEN
        -- Hatırlatma planı randevuyu asla engellememeli.
        RAISE WARNING 'wa_plan_jobs: %', SQLERRM;
    END;
    RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.wa_plan_jobs() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
