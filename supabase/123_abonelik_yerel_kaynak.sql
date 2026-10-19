-- ============================================================
-- TimeFlow Migration 123: Abonelik gerçeği TimeFlow'da, Core kopya
-- ============================================================
-- 2026-10-19 · kullanıcı kararı (devir 10 §10).
--
-- ── Ne oldu ─────────────────────────────────────────────────────────────────
-- dodo-webhook her olayda ÖNCE LUERA Core'a (ayrı Supabase, VPS 2) yazıyor,
-- yerel aynayı (`org_entitlement`) ancak Core'da abonelik bulursa
-- güncelliyordu. Eylül'de Core günlerce "no available server" verdi →
-- webhook günlerce 500 döndü → Dodo ucu KENDİLİĞİNDEN devre dışı bıraktı ve
-- 25 Ağustos'tan 19 Ekim'e kadar TEK bir abonelik olayı gelmedi. Kapı açık
-- olsaydı her ödeyen salon yenileme gününde kilitlenirdi.
--
-- Hesap silme, iptal ve abonelik ekranı da Core'a soruyordu: Core düşünce
-- hesap silinemiyordu (Apple 5.1.1(v)).
--
-- ── Yeni düzen ──────────────────────────────────────────────────────────────
-- • Aynaya Dodo abonelik/müşteri kimliği ve iptal bayrağı yazılır → iptal,
--   silme, portal ve abonelik ekranı Core'a HİÇ gitmez.
-- • `dodo_events`: Dodo olaylarının yerel defteri. Tekrar denetimi (aynı
--   webhook-id) ve fatura geçmişi buradan; Core'a aktarım durumu da burada
--   (`core_synced_at`) — Core düşerse olay kaybolmaz, sonra aktarılır.
-- • `has_timeflow_access` `computeAccess` (TS) ile birebir aynı karar.
--
-- Core'daki `subscriptions` / `billing_events` artık AŞAĞI AKIŞ KOPYASI:
-- doğruyu söyler ama geç kalabilir; hiçbir erişim kararı ona bakmaz.
-- ============================================================

BEGIN;

-- ── 1 · Aynaya Dodo kimlikleri ─────────────────────────────────────────────
ALTER TABLE public.org_entitlement
    ADD COLUMN IF NOT EXISTS dodo_subscription_id TEXT,
    ADD COLUMN IF NOT EXISTS dodo_customer_id     TEXT,
    -- "Dönem sonunda iptal" — erişimi KESMEZ (expires_at keser), yalnız ekran
    -- "Sonraki tahsilat" yerine "Erişim bitiyor" yazsın diye.
    ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cancelled_at         TIMESTAMPTZ,
    -- Uygulanan son Dodo olayının zamanı (yükteki `timestamp`). Dodo olayları
    -- sırasız teslim edebiliyor; daha eskisi gelirse ayna geri sarılmaz.
    ADD COLUMN IF NOT EXISTS dodo_event_at        TIMESTAMPTZ;

-- Bir Dodo aboneliği tek işletmeye aittir; ödeme olayı işletmeyi bu kimlikle
-- bulur (ödeme yükünde işletme kimliği olmayabilir).
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_entitlement_dodo_sub
    ON public.org_entitlement (dodo_subscription_id)
    WHERE dodo_subscription_id IS NOT NULL;

COMMENT ON TABLE public.org_entitlement IS
    'Abonelik gerçeği (123''ten beri). Tek yazar dodo-webhook; Core bunun kopyası.';

-- ── 2 · Yerel olay defteri ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dodo_events (
    -- Dodo'nun `webhook-id` başlığı: aynı olay yeniden gelirse tanınır.
    webhook_id      TEXT PRIMARY KEY,
    event_type      TEXT NOT NULL,
    -- Yükteki `timestamp` (olayın Dodo'daki anı), teslim anı değil.
    event_at        TIMESTAMPTZ,
    -- Bilerek FK YOK: işletme silinse de Luera'nın kendi ödeme kaydı durur
    -- (Core billing_events ile aynı gerekçe). Satırlar salonun verisi değil.
    organization_id UUID,
    subscription_id TEXT,
    payment_id      TEXT,
    amount          NUMERIC(12, 2),
    currency        TEXT,
    invoice_url     TEXT,
    raw             JSONB NOT NULL,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Ayna işlendiyse dolu. Boşsa önceki deneme yarıda kaldı → yeniden işlenir.
    processed_at    TIMESTAMPTZ,
    -- 'applied' | 'stale' | 'other_subscription' | 'org_gone' | 'no_org' | 'recorded'
    outcome         TEXT,
    -- Core'a aktarım: boşsa sonraki webhook'ta yeniden denenir.
    core_synced_at  TIMESTAMPTZ,
    core_attempts   INT NOT NULL DEFAULT 0,
    core_error      TEXT
);

COMMENT ON TABLE public.dodo_events IS
    'Dodo olaylarının yerel defteri (123). Tekrar denetimi + fatura geçmişi + Core aktarım kuyruğu. Yalnız service-role.';

-- Fatura geçmişi (billing-status) — işletmenin başarılı ödemeleri.
CREATE INDEX IF NOT EXISTS idx_dodo_events_org
    ON public.dodo_events (organization_id, event_type, received_at DESC);

-- Core'a aktarılmamışlar — webhook her çağrıda en eskiden birkaçını dener.
CREATE INDEX IF NOT EXISTS idx_dodo_events_core_pending
    ON public.dodo_events (received_at)
    WHERE core_synced_at IS NULL;

-- Politika YOK ve istemci rollerinin hiçbir izni yok: içinde müşterinin
-- e-postası ve ödeme ayrıntısı var; okuyan tek taraf service-role.
ALTER TABLE public.dodo_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dodo_events FROM PUBLIC;
REVOKE ALL ON public.dodo_events FROM anon;
REVOKE ALL ON public.dodo_events FROM authenticated;

-- ── 3 · SQL kapısı = computeAccess ─────────────────────────────────────────
-- 086'daki sürüm ek sürede `expires_at > now()` da istiyordu; TS istemiyor.
-- Ödeme alınamadığında dönem zaten bitmiştir: `on_hold` geç gelirse SQL
-- yazmayı kesiyor, ekran "ek süre" diyor, WhatsApp/hatırlatma (TS kapısı)
-- çalışmaya devam ediyordu. Doğru olan TS: ek süre `grace_until` ile ölçülür.
--
--   trial / active → expires_at yoksa süresiz, varsa expires_at > now()
--   grace          → grace_until > now() (yoksa kapalı — sonsuz ek süre yok)
--   none / locked / satır yok → kapalı
CREATE OR REPLACE FUNCTION public.has_timeflow_access(p_org UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN COALESCE(
            (SELECT value FROM app_secrets WHERE key = 'ENTITLEMENT_ENFORCE'),
            'false'
        ) <> 'true'
        THEN true
        ELSE COALESCE((
            SELECT CASE
                WHEN e.state = 'grace'
                    THEN e.grace_until IS NOT NULL AND e.grace_until > now()
                WHEN e.state IN ('trial', 'active')
                    THEN e.expires_at IS NULL OR e.expires_at > now()
                ELSE false
            END
            FROM org_entitlement e
            WHERE e.organization_id = p_org
        ), false)
    END
$$;

COMMENT ON FUNCTION public.has_timeflow_access(UUID) IS
    'Bu org şu an TimeFlow yazabilir mi? computeAccess (_shared/entitlement.ts) ile aynı karar (123). ENTITLEMENT_ENFORCE kapalıyken hep true.';

NOTIFY pgrst, 'reload schema';

COMMIT;
