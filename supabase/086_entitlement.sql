-- ============================================================
-- TimeFlow Migration 086: Abonelik kapısı (entitlement)
-- ============================================================
-- TimeFlow bugüne kadar parasız bir ürün gibi davrandı: /login'de "Kayıt Ol"
-- açık, handle_new_user trigger'ı org yaratıyor ve kullanıcı sınırsız, süresiz,
-- ücretsiz tam sisteme düşüyordu. Abonelik kontrolü tek bir yerde (gateway)
-- vardı, o da SHADOW modda yalnız logluyordu.
--
-- NEDEN AYNA TABLO: abonelik verisinin kaynağı LUERA Core (AYRI bir Supabase
-- projesi). TimeFlow'un Postgres'i oraya bakamaz — RLS politikaları abonelik
-- soramaz, her edge fonksiyonu proje-arası tur atmak zorunda kalır ve Core
-- düşerse ürün de düşer. Bu tablo Core'un yetkilendirmeye BAKAN yüzünün yerel
-- kopyasıdır; faturalama gerçeği Core'da kalır, buraya dodo-webhook yazar.
--
-- ZAMAN TABANLI: erişim kararı expires_at/grace_until ile verilir. Webhook hiç
-- gelmese bile süre dolunca kapı kendiliğinden kapanır — "webhook kaçtı, müşteri
-- bedavaya kullanmaya devam etti" diye bir hâl yok.
--
-- KİLİT NE DEMEK: yalnız YAZMA kapanır (Faz 3, ayrı migration). Veri okunabilir
-- kalır. Müşterinin verisini rehin almak marka zararıdır; ama para harcatan
-- her şey (WhatsApp botu, hatırlatma cron'u, online booking) anında durur.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.org_entitlement (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- none  : hiç abonelik yok (yeni kayıt, henüz ödeme adımına gelmemiş)
    -- trial : ücretsiz deneme sürüyor
    -- active: ödemesi yapılmış abonelik
    -- grace : ödeme alınamadı, ek süre işliyor
    -- locked: erişim yok
    state           TEXT NOT NULL DEFAULT 'none'
                    CHECK (state IN ('none', 'trial', 'active', 'grace', 'locked')),
    plan            TEXT,
    cycle           TEXT,
    trial_ends_at   TIMESTAMPTZ,
    -- Erişimin bittiği an. Dodo'nun next_billing_date'i + tolerans.
    expires_at      TIMESTAMPTZ,
    -- Ödeme alınamadığında: bu ana kadar erişim sürer (on_hold + 2 gün).
    grace_until     TIMESTAMPTZ,
    -- Son işlenen Dodo event tipi — destek konuşmalarında ilk bakılacak yer.
    last_event      TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.org_entitlement IS
    'Core.subscriptions aynası. Kaynak Core; buraya yalnız dodo-webhook yazar.';

-- Süresi geçmişleri toplu tarayan işler için (durum tazeleme, "deneme bitiyor"
-- hatırlatması). Tam tarama yapılmasın.
CREATE INDEX IF NOT EXISTS idx_org_entitlement_expiry
    ON public.org_entitlement (expires_at)
    WHERE state IN ('trial', 'active', 'grace');

ALTER TABLE public.org_entitlement ENABLE ROW LEVEL SECURITY;

-- Org üyeleri KENDİ satırını okur (şerit ve duvar bunu okuyor).
-- Yazma politikası bilinçli olarak YOK: service-role RLS'i atlar, yani tek
-- yazar dodo-webhook'tur. Kullanıcının kendi aboneliğini "active" yapabilmesi
-- açık bir güvenlik açığı olurdu.
DROP POLICY IF EXISTS org_entitlement_read ON public.org_entitlement;
CREATE POLICY org_entitlement_read ON public.org_entitlement
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT auth_user_org_ids()));

-- ── Erişim kararı ────────────────────────────────────────────────────────────
-- TEK karar noktası: RLS politikaları, edge fonksiyonları ve istemci aynı
-- cevabı okur. Üç yerde üç ayrı hesap, üç farklı davranış demektir.
--
-- ENTITLEMENT_ENFORCE bayrağı gateway'deki CORE_SUBSCRIPTION_ENFORCE desenini
-- tekrar eder: varsayılan KAPALI (herkese true), böylece migration uygulanır
-- uygulanmaz kimse kilitlenmez. Açmadan ÖNCE mevcut org'lara satır yazılmalı.
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
            SELECT
                e.state IN ('trial', 'active', 'grace')
                AND (e.expires_at  IS NULL OR e.expires_at  > now())
                AND (e.state <> 'grace' OR (e.grace_until IS NOT NULL AND e.grace_until > now()))
            FROM org_entitlement e
            WHERE e.organization_id = p_org
        ), false)
    END
$$;

COMMENT ON FUNCTION public.has_timeflow_access(UUID) IS
    'Bu org şu an TimeFlow yazabilir mi? ENTITLEMENT_ENFORCE kapalıyken hep true.';

NOTIFY pgrst, 'reload schema';
