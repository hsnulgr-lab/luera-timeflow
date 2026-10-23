-- ============================================================
-- TimeFlow Migration 127: Ödeme önce, hesap sonra (talep kaydı)
-- ============================================================
-- Kullanıcı kararı 2026-10-23: lueratech.com'da "Planı seç" kayıt ekranına
-- değil DOĞRUDAN Dodo'ya açılır; ödeme/deneme bitince hesap Dodo'ya yazılan
-- e-postayla kendiliğinden açılır ve kişi şifresiz panele girer.
--
-- Ödeme anında işletme YOK: abonelik ona bağlanamaz. Bu tablo aradaki köprü:
--
--   1. dodo-satin-al `start`: talep satırı + tarayıcıya giden gizli jeton
--      (yalnız SHA-256'sı burada). Dodo oturumunun metadata'sında
--      `claim_id` = satır kimliği.
--   2. dodo-webhook: `claim_id`li ama işletmesiz abonelik olayı → talebi
--      bağlar (_shared/odemeTalebi.ts): e-posta yeniyse hesap + işletme
--      açılır (handle_new_user), varsa o kişinin TEK işletmesine eklenir;
--      Dodo aboneliğine `organization_id` yazılır, sonraki olaylar
--      doğrudan eşleşir.
--   3. dodo-satin-al `claim`: dönüş sayfası jetonla gelir. Hesabı BU talep
--      açtıysa tek kullanımlık giriş jetonu döner (sihirli bağlantıyla aynı
--      yol, /baglanti); hesap zaten varsa giriş istenir.
--
-- Yazan/okuyan YALNIZ service_role (edge fonksiyonları). RLS açık, politika
-- yok: istemci bu tabloyu hiç göremez.
--
-- Idempotent.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.checkout_claims (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Tarayıcıdaki gizli jetonun SHA-256'sı (hex). Jetonun kendisi saklanmaz.
    token_hash           TEXT NOT NULL UNIQUE,
    plan                 TEXT NOT NULL CHECK (plan IN ('baslangic', 'pro', 'isletme')),
    cycle                TEXT NOT NULL CHECK (cycle IN ('monthly', 'yearly')),
    -- Hız sınırı için istemci adresinin tuzlu özeti; adresin kendisi değil.
    ip_hash              TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Jetonun ömrü: dönüş sayfası bundan sonra giriş vermez.
    expires_at           TIMESTAMPTZ NOT NULL DEFAULT now() + interval '2 days',
    dodo_subscription_id TEXT UNIQUE,
    email                TEXT,
    organization_id      UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    user_id              UUID,
    -- Hesabı bu talep mi açtı: şifresiz giriş YALNIZ o zaman verilir.
    user_created         BOOLEAN NOT NULL DEFAULT false,
    attached_at          TIMESTAMPTZ,
    -- Giriş jetonu verildi mi (tek kullanımlık).
    login_issued_at      TIMESTAMPTZ,
    -- Son karar: attached | needs_login | ...
    outcome              TEXT
);

CREATE INDEX IF NOT EXISTS checkout_claims_ip_recent
    ON public.checkout_claims (ip_hash, created_at);

ALTER TABLE public.checkout_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_claims FROM anon, authenticated;
GRANT ALL ON public.checkout_claims TO service_role;

COMMENT ON TABLE public.checkout_claims IS
    'Ödeme önce akışı (göç 127): hesapsız Dodo ödemesini sonradan açılan '
    'hesaba bağlayan talep. Yalnız service_role.';

-- E-postanın kullanıcısı (büyük/küçük harf duyarsız). Auth şeması PostgREST'e
-- açık değil; yalnız service_role çağırır.
CREATE OR REPLACE FUNCTION public.checkout_claim_user(p_email TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT u.id FROM auth.users u
    WHERE lower(u.email) = lower(trim(p_email))
    ORDER BY u.created_at
    LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.checkout_claim_user(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_claim_user(TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
