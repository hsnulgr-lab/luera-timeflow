-- ============================================================
-- TimeFlow Migration 130: WhatsApp Sekreter v2 · P2 — Claude ajanı
-- ============================================================
-- Plan: ~/.claude/plans/velvet-zooming-token.md (P2 · müşteri ajanı).
--
-- Eski bot (whatsapp-booking) webhook isteğinin İÇİNDE cevap yazıyordu. Ajan
-- bir dil modeliyle birkaç tur konuşuyor (10–40 sn); bu süre webhook'u
-- bekletemez, art arda gelen iki mesaj da iki ayrı cevaba bölünmemeli.
-- Akış bu yüzden ikiye ayrılıyor:
--
--   whatsapp-booking  → mesajı wa_inbox'a yazar, hemen 200 döner
--   wa_inbox tetikleyicisi → pg_net ile wa-agent'ı uyandırır
--   wa-agent          → konuşmayı kilitler (kira), ~2,5 sn bekleyip birikmiş
--                       mesajları TEK tur olarak işler, cevabı sendWA ile yollar
--
-- Ajan yalnız org_whatsapp.features.agent_v2 = true olan işletmede çalışır;
-- diğerlerinde eski bot aynen devam eder. agent_config.test_numbers doluysa
-- yalnız o numaralar ajana gider (test kipi).
--
-- Kişisel veri: ham konuşma (messages_json) 30 günde boşaltılır (wa-agent
-- süpürmesi çağırır), wa_message_log okunur kayıt olarak kalır (084 kuralı).
-- Tablolara yalnız service_role erişir: RLS açık, politika yok. /whatsapp
-- ekranı geldiğinde org üyelerine okuma politikası ayrı göçle açılır.
--
-- ⚠️ SIRA: önce bu göç, SONRA wa-agent + whatsapp-booking deploy'u.
-- Idempotent.
-- ============================================================

BEGIN;

-- ── Ajan ayarları ───────────────────────────────────────────────────────────
ALTER TABLE public.org_whatsapp
    ADD COLUMN IF NOT EXISTS agent_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.org_whatsapp.agent_config IS
    'Claude ajanı ayarları (130). test_numbers: yalnız bu numaralar ajana gider; '
    'others: "old" (diğerlerine eski bot) | "silent" (diğerlerine cevap yok); '
    'monthly_budget_usd: aylık tavan, dolunca eski bota düşülür; model: rota '
    'modeli (boşsa WA_MODEL_CUSTOMER); consent: true ise ilk temasta yapay zekâ onayı sorulur '
    '(varsayılan kapalı).';

-- ── Gelen kutusu ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_inbox (
    id              BIGSERIAL PRIMARY KEY,
    organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    phone           TEXT        NOT NULL,
    remote_jid      TEXT,
    provider_msg_id TEXT,
    kind            TEXT        NOT NULL CHECK (kind IN ('text', 'audio', 'media')),
    body            TEXT,
    -- Sesli mesajın indirme anahtarları (Evolution mesaj nesnesi). Metin değil,
    -- işlendikten sonra boşaltılır.
    media           JSONB,
    push_name       TEXT,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at    TIMESTAMPTZ,
    run_id          UUID
);

CREATE INDEX IF NOT EXISTS idx_wa_inbox_pending
    ON public.wa_inbox (organization_id, phone, received_at)
    WHERE processed_at IS NULL;

-- ── Konuşmalar ──────────────────────────────────────────────────────────────
-- messages_json BİLEREK TEXT: model geçmişi bayt bayt aynı geri gönderilmeli
-- (düşünce blokları önceki konuşmaya bağlı). JSONB anahtar sırasını değiştirir.
CREATE TABLE IF NOT EXISTS public.wa_conversations (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    phone              TEXT        NOT NULL,
    customer_id        UUID        REFERENCES public.customers(id) ON DELETE SET NULL,
    role               TEXT        NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'owner')),
    model              TEXT,
    prefix_hash        TEXT,
    messages_json      TEXT        NOT NULL DEFAULT '[]',
    state              JSONB       NOT NULL DEFAULT '{}'::jsonb,
    episode_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at    TIMESTAMPTZ,
    turns              INTEGER     NOT NULL DEFAULT 0,
    -- İşletme sahibi bu müşteriye telefondan elle yazdıysa bot bu ana kadar susar.
    paused_until       TIMESTAMPTZ,
    ai_consent_at      TIMESTAMPTZ,
    consent_version    TEXT,
    lease_until        TIMESTAMPTZ,
    lease_token        UUID,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, phone)
);

-- ── Bekleyen öneriler ───────────────────────────────────────────────────────
-- Ajan randevuya doğrudan dokunmaz: önce öneri yazar, müşteri BİR SONRAKİ
-- mesajında onaylarsa uygular. run_id, önerinin hangi turda yazıldığını tutar;
-- aynı turda uygulanamaz.
CREATE TABLE IF NOT EXISTS public.wa_pending_actions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    conversation_id UUID        NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
    kind            TEXT        NOT NULL CHECK (kind IN ('book', 'reschedule', 'cancel')),
    payload         JSONB       NOT NULL,
    run_id          UUID        NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'committed', 'superseded', 'expired', 'failed')),
    result          JSONB,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    committed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wa_pending_open
    ON public.wa_pending_actions (conversation_id)
    WHERE status = 'open';

-- ── Çalışma kaydı (maliyet) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_agent_runs (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    conversation_id    UUID        REFERENCES public.wa_conversations(id) ON DELETE SET NULL,
    model              TEXT,
    calls              INTEGER     NOT NULL DEFAULT 0,
    input_tokens       INTEGER     NOT NULL DEFAULT 0,
    output_tokens      INTEGER     NOT NULL DEFAULT 0,
    cache_read_tokens  INTEGER     NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER     NOT NULL DEFAULT 0,
    cost_usd           NUMERIC(10, 5) NOT NULL DEFAULT 0,
    tools              TEXT[]      NOT NULL DEFAULT '{}',
    stop_reason        TEXT,
    duration_ms        INTEGER,
    error              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_agent_runs_org_time
    ON public.wa_agent_runs (organization_id, created_at DESC);

ALTER TABLE public.wa_inbox           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_conversations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_agent_runs      ENABLE ROW LEVEL SECURITY;

-- ── Konuşma kirası ──────────────────────────────────────────────────────────
-- Aynı müşterinin iki mesajı iki wa-agent çağrısı uyandırır; yalnız biri
-- konuşmayı alır, diğeri çekilir (alan, yeni mesajı kendi turunda okur).
-- Kira süresi dolmuşsa (çöken çağrı) yeniden alınabilir.
CREATE OR REPLACE FUNCTION public.wa_claim_conversation(
    p_org UUID, p_phone TEXT, p_lease_sec INTEGER DEFAULT 90
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_token UUID := gen_random_uuid();
BEGIN
    INSERT INTO wa_conversations (organization_id, phone)
    VALUES (p_org, p_phone)
    ON CONFLICT (organization_id, phone) DO NOTHING;

    UPDATE wa_conversations
       SET lease_until = now() + make_interval(secs => p_lease_sec),
           lease_token = v_token
     WHERE organization_id = p_org AND phone = p_phone
       AND (lease_until IS NULL OR lease_until < now());

    IF FOUND THEN RETURN v_token; END IF;
    RETURN NULL;
END $$;

-- ── Aylık harcama ───────────────────────────────────────────────────────────
-- whatsapp-booking yönlendirmeden önce bakar: tavan dolduysa eski bota düşer.
CREATE OR REPLACE FUNCTION public.wa_agent_spend(p_org UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(SUM(cost_usd), 0)
      FROM wa_agent_runs
     WHERE organization_id = p_org
       AND created_at >= date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul')
                         AT TIME ZONE 'Europe/Istanbul';
$$;

REVOKE ALL ON FUNCTION public.wa_claim_conversation(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_agent_spend(UUID)                     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_claim_conversation(UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_agent_spend(UUID)                     TO service_role;

-- ── Uyandırma ───────────────────────────────────────────────────────────────
-- 118'in deseni: adres ve sır app_secrets'tan. Sır yoksa sessizce geçilir —
-- wa-agent'ın dakikalık süpürmesi kuyruğu yine boşaltır.
-- Zaman aşımı 55 sn: ajan turu ~45 sn'ye kadar sürebiliyor, pg_net'in 5 sn
-- varsayılanı bağlantıyı erken keserdi.
--
-- Ayrı fonksiyon çünkü wa-agent de çağırıyor: ajan cevap yazarken gelen mesaj
-- kirayı dolu bulup çekilir; tur bitince ajan kendini bununla yeniden uyandırır.
-- pg_net istekleri kuyruğa alıp arka planda yolladığı için çağıran beklemez.
CREATE OR REPLACE FUNCTION public.wa_agent_kick(p_org UUID, p_phone TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url    TEXT;
    v_secret TEXT;
BEGIN
    SELECT value INTO v_url    FROM app_secrets WHERE key = 'FUNCTIONS_BASE_URL';
    SELECT value INTO v_secret FROM app_secrets WHERE key = 'CRON_TRIGGER_SECRET';
    IF v_url IS NULL OR v_secret IS NULL THEN
        RETURN;
    END IF;

    PERFORM net.http_post(
        url     := v_url || '/wa-agent',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
        body    := jsonb_build_object('organization_id', p_org, 'phone', p_phone),
        timeout_milliseconds := 55000
    );
END $$;

CREATE OR REPLACE FUNCTION public.wa_inbox_wake()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM wa_agent_kick(NEW.organization_id, NEW.phone);
    RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.wa_agent_kick(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_inbox_wake()           FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_agent_kick(UUID, TEXT) TO service_role;

DROP TRIGGER IF EXISTS wa_inbox_wake ON public.wa_inbox;
CREATE TRIGGER wa_inbox_wake
    AFTER INSERT ON public.wa_inbox
    FOR EACH ROW EXECUTE FUNCTION public.wa_inbox_wake();

NOTIFY pgrst, 'reload schema';

COMMIT;
