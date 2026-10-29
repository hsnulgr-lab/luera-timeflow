-- ============================================================
-- TimeFlow Migration 131: WhatsApp Sekreter v2 · P1 — zamanlayıcı
-- ============================================================
-- Plan: ~/.claude/plans/velvet-zooming-token.md (P1).
--
-- Bugün hatırlatmaları `remind` 30 dakikada bir tarıyor: 24 saat hatırlatması
-- "yarın randevusu olan herkese, 09–21 arasında ilk turda" gidiyor (randevu
-- 18:00'deyse 09:00'da, 24 değil 33 saat önce), 2 saat hatırlatması 90–150
-- dakikalık bir pencereye düşüyor. Cevap gelmeyene dürtme, boşalan saati
-- bekleme listesine sırayla teklif, ziyaret sonrası memnuniyet yok.
--
-- Bu göçle her randevu yazıldığında İŞLERİ planlanır (wa_jobs):
--   reminder_24h  başlangıçtan 24 saat önce, 09–21'e çekilerek
--   reminder_2h   başlangıçtan 2 saat önce (3 saatten yakın alındıysa yok)
--   satisfaction  bitişten 30 dk sonra (21'den sonraysa ertesi gün 10:00)
--   slot_offer    iptal edilen ileri randevu → bekleme listesine sırayla teklif
--   nudge         24 saat hatırlatmasına 4 saatte cevap yoksa (wa-scheduler açar)
-- wa-scheduler dakikada bir zamanı gelenleri alır, randevuyu yeniden okur
-- (bayatsa göndermez), şablonla yollar.
--
-- Yalnız org_whatsapp.features.scheduler_v2 = true olan işletmede çalışır;
-- diğerlerinde remind eskisi gibi sürer. Açarken wa_backfill_jobs(org) ileri
-- randevuları planlar.
--
-- Tetikleyici randevu yazımını ASLA engellemez: hata yutulur, uyarı düşülür.
--
-- ⚠️ SIRA: önce bu göç, SONRA fonksiyon deploy'u. Idempotent.
-- ============================================================

BEGIN;

-- ── Ayarlar ─────────────────────────────────────────────────────────────────
ALTER TABLE public.org_whatsapp
    ADD COLUMN IF NOT EXISTS schedule_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.org_whatsapp.schedule_config IS
    'Zamanlayıcı ayarları (131). review_policy: "all" (varsayılan; Google kuralı '
    'seçici yorum istemeyi yasaklar) | "happy" (yalnız 4–5 puan verene link).';

-- ── İşler ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_jobs (
    id              BIGSERIAL   PRIMARY KEY,
    organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    reservation_id  UUID        REFERENCES public.reservations(id) ON DELETE CASCADE,
    kind            TEXT        NOT NULL
                    CHECK (kind IN ('reminder_24h', 'reminder_2h', 'nudge', 'satisfaction', 'slot_offer')),
    due_at          TIMESTAMPTZ NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sending', 'sent', 'skipped', 'cancelled', 'failed')),
    -- Planlandığı andaki randevu ("tarih saat"); gönderirken eşleşmezse iş bayattır.
    stamp           TEXT,
    note            TEXT,
    attempts        INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at         TIMESTAMPTZ
);

-- Aynı randevunun aynı türden tek bekleyen işi olur.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_jobs_pending
    ON public.wa_jobs (reservation_id, kind)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_wa_jobs_due
    ON public.wa_jobs (due_at)
    WHERE status IN ('pending', 'sending');

-- ── Memnuniyet ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_feedback (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    reservation_id   UUID        NOT NULL UNIQUE REFERENCES public.reservations(id) ON DELETE CASCADE,
    customer_id      UUID        REFERENCES public.customers(id) ON DELETE SET NULL,
    phone            TEXT        NOT NULL,
    status           TEXT        NOT NULL DEFAULT 'asked' CHECK (status IN ('asked', 'answered', 'expired')),
    rating           SMALLINT    CHECK (rating BETWEEN 1 AND 5),
    comment          TEXT,
    review_link_sent BOOLEAN     NOT NULL DEFAULT false,
    owner_notified   BOOLEAN     NOT NULL DEFAULT false,
    asked_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    answered_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wa_feedback_open
    ON public.wa_feedback (organization_id, phone, asked_at DESC)
    WHERE status = 'asked';

-- ── Bekleme listesi teklifleri ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_waitlist_offers (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    freed_reservation_id UUID        NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
    waitlist_id          UUID        NOT NULL REFERENCES public.waitlist(id) ON DELETE CASCADE,
    phone                TEXT        NOT NULL,
    -- Teklif edilen saat: date, start_time, end_time, service, color, staff_id, resource_id
    slot                 JSONB       NOT NULL,
    status               TEXT        NOT NULL DEFAULT 'sent'
                         CHECK (status IN ('sent', 'accepted', 'declined', 'expired', 'taken')),
    reservation_id       UUID        REFERENCES public.reservations(id) ON DELETE SET NULL,
    sent_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at           TIMESTAMPTZ NOT NULL,
    answered_at          TIMESTAMPTZ,
    -- Aynı kişiye aynı boşluk iki kez teklif edilmez.
    UNIQUE (freed_reservation_id, waitlist_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_offers_open
    ON public.wa_waitlist_offers (organization_id, phone, sent_at DESC)
    WHERE status = 'sent';

ALTER TABLE public.wa_jobs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_feedback        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_waitlist_offers ENABLE ROW LEVEL SECURITY;

-- Memnuniyet sonuçları işletmenin ekranında listelenecek: üyeler okuyabilir.
DROP POLICY IF EXISTS wa_feedback_org_read ON public.wa_feedback;
CREATE POLICY wa_feedback_org_read ON public.wa_feedback
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()));

-- ── Planlayıcı ──────────────────────────────────────────────────────────────
-- Saatler İstanbul takvimiyle hesaplanır; sunucu UTC'de çalışır.
CREATE OR REPLACE FUNCTION public.wa_plan_reservation(r public.reservations, p_moved BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_start TIMESTAMPTZ;
    v_end   TIMESTAMPTZ;
    v_local TIMESTAMP;
    v_due   TIMESTAMPTZ;
    v_stamp TEXT;
BEGIN
    IF r.date IS NULL OR r.start_time IS NULL THEN RETURN; END IF;
    IF COALESCE(r.customer_phone, '') = '' THEN RETURN; END IF;

    v_start := (r.date + r.start_time) AT TIME ZONE 'Europe/Istanbul';
    v_end   := (r.date + COALESCE(r.end_time, r.start_time)) AT TIME ZONE 'Europe/Istanbul';
    v_stamp := r.date::text || ' ' || to_char(r.start_time, 'HH24:MI');

    IF r.status IN ('pending', 'confirmed') AND v_start > now() THEN
        -- 24 saat: 09–21 dışına düşerse içine çekilir (gece yarısı mesaj yok).
        IF p_moved OR NOT COALESCE(r.reminder_24h_sent, false) THEN
            v_local := (v_start - interval '24 hours') AT TIME ZONE 'Europe/Istanbul';
            IF v_local::time < time '09:00' THEN
                v_local := date_trunc('day', v_local) + interval '9 hours';
            ELSIF v_local::time >= time '21:00' THEN
                v_local := date_trunc('day', v_local) + interval '20 hours 45 minutes';
            END IF;
            v_due := v_local AT TIME ZONE 'Europe/Istanbul';
            -- Randevu 24 saatten yakın alındı: en az 6 saat varsa şimdi gönder.
            IF v_due < now() THEN
                v_due := CASE WHEN v_start - now() >= interval '6 hours' THEN now() END;
            END IF;
            IF v_due IS NOT NULL AND v_due <= v_start - interval '3 hours' THEN
                INSERT INTO wa_jobs (organization_id, reservation_id, kind, due_at, stamp)
                VALUES (r.organization_id, r.id, 'reminder_24h', v_due, v_stamp)
                ON CONFLICT (reservation_id, kind) WHERE status = 'pending' DO NOTHING;
            END IF;
        END IF;

        -- 2 saat: randevuya 3 saatten az kala alındıysa anlamı yok.
        IF (p_moved OR NOT COALESCE(r.reminder_2h_sent, false))
           AND v_start - now() >= interval '3 hours' THEN
            INSERT INTO wa_jobs (organization_id, reservation_id, kind, due_at, stamp)
            VALUES (r.organization_id, r.id, 'reminder_2h', v_start - interval '2 hours', v_stamp)
            ON CONFLICT (reservation_id, kind) WHERE status = 'pending' DO NOTHING;
        END IF;
    END IF;

    -- Memnuniyet: onay bekleyen ya da iptal randevuya sorulmaz; eski yorum
    -- daveti gittiyse ya da daha önce sorulduysa tekrar sorulmaz.
    IF r.status IN ('confirmed', 'completed')
       AND NOT COALESCE(r.review_sent, false)
       AND NOT EXISTS (SELECT 1 FROM wa_feedback f WHERE f.reservation_id = r.id) THEN
        v_local := (v_end + interval '30 minutes') AT TIME ZONE 'Europe/Istanbul';
        IF v_local::time < time '09:00' THEN
            v_local := date_trunc('day', v_local) + interval '10 hours';
        ELSIF v_local::time >= time '21:00' THEN
            v_local := date_trunc('day', v_local) + interval '1 day 10 hours';
        END IF;
        v_due := v_local AT TIME ZONE 'Europe/Istanbul';
        IF v_due > now() - interval '2 hours' THEN
            INSERT INTO wa_jobs (organization_id, reservation_id, kind, due_at, stamp)
            VALUES (r.organization_id, r.id, 'satisfaction', v_due, v_stamp)
            ON CONFLICT (reservation_id, kind) WHERE status = 'pending' DO NOTHING;
        END IF;
    END IF;
END $$;

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

DROP TRIGGER IF EXISTS wa_plan_jobs ON public.reservations;
CREATE TRIGGER wa_plan_jobs
    AFTER INSERT OR UPDATE ON public.reservations
    FOR EACH ROW EXECUTE FUNCTION public.wa_plan_jobs();

-- ── Açılış: ileri randevuları planla ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_backfill_jobs(p_org UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r public.reservations;
    n INTEGER := 0;
BEGIN
    FOR r IN
        SELECT * FROM reservations
         WHERE organization_id = p_org AND status <> 'cancelled'
           AND date >= (now() AT TIME ZONE 'Europe/Istanbul')::date - 1
    LOOP
        PERFORM wa_plan_reservation(r, false);
        n := n + 1;
    END LOOP;
    RETURN n;
END $$;

-- ── Gönderici kuyruğu ───────────────────────────────────────────────────────
-- Zamanı gelen işleri tek seferde "gönderiliyor"a çeker; iki çağrı aynı işi
-- alamaz. 5 dakikadır "gönderiliyor"da takılan (çöken çağrı) yeniden alınır.
CREATE OR REPLACE FUNCTION public.wa_claim_jobs(p_limit INTEGER DEFAULT 50)
RETURNS SETOF public.wa_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE wa_jobs
       SET status = 'sending', attempts = attempts + 1, updated_at = now()
     WHERE id IN (
        SELECT id FROM wa_jobs
         WHERE (status = 'pending' AND due_at <= now())
            OR (status = 'sending' AND updated_at < now() - interval '5 minutes' AND attempts < 3)
         ORDER BY due_at
         LIMIT p_limit
         FOR UPDATE SKIP LOCKED
     )
    RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.wa_plan_reservation(public.reservations, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_plan_jobs()                                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_backfill_jobs(UUID)                             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_claim_jobs(INTEGER)                             FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_backfill_jobs(UUID)  TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_claim_jobs(INTEGER)  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
