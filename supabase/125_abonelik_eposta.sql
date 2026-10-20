-- ============================================================
-- TimeFlow Migration 125: Abonelik e-postalarının gönderim defteri
-- ============================================================
-- Kurallar: docs/abonelik-kurallari.md §2 (Faz 2.5). Idempotent.
--
-- ── Neden ───────────────────────────────────────────────────────────────────
-- Telefon uygulaması ödemeden söz edemez (App Store 3.1.1 / 3.1.3); deneme ve
-- ödeme iletişimi yalnız e-postayla yapılır. `abonelik-eposta` fonksiyonu
-- 15 dakikada bir tarar — aynı e-postanın İKİNCİ kez gitmemesi bu defterle
-- sağlanır: (işletme, tür, dönem) üçlüsü tektir.
--
--   tür    hosgeldin · uc_gun · bitti · son · odeme
--   dönem  hangi deneme / ek süre: denemenin bitiş anı ya da ek sürenin
--          bitiş anı (hoş geldiniz için deneme türü). Deneme uzarsa ya da
--          yeni bir ek süre açılırsa dönem değişir, e-posta yeniden hak edilir.
--
-- ── Ayırma (abonelik_eposta_ayir) ───────────────────────────────────────────
-- Önce satır yazılır, SONRA gönderilir: iki tarama aynı anda koşsa da yalnız
-- biri satırı alır. Gönderilemeyen (hata) ve yarıda kalan (30 dk'dan eski
-- "gönderiliyor") satır yeniden alınabilir; toplam 3 deneme, sonra durur.
--
-- Defterde e-posta ADRESİ tutulmaz — alıcı her gönderimde işletme sahibinden
-- (organizations.owner_id → auth.users.email) okunur; burada yalnız kimliği.
-- İstemci rollerine KAPALI (dodo_events ile aynı): yalnız service-role.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.abonelik_eposta (
    id              BIGSERIAL PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    tur             TEXT NOT NULL
                    CHECK (tur IN ('hosgeldin', 'uc_gun', 'bitti', 'son', 'odeme')),
    donem           TEXT NOT NULL,
    -- Gönderildiği an işletmenin sahibi (adres değil, kimlik).
    user_id         UUID,
    durum           TEXT NOT NULL DEFAULT 'gonderiliyor'
                    CHECK (durum IN ('gonderiliyor', 'gonderildi', 'hata')),
    deneme          SMALLINT NOT NULL DEFAULT 1,
    -- Resend'in e-posta kimliği — teslim sorusu gelirse panelde aranır.
    resend_id       TEXT,
    hata            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT abonelik_eposta_tek UNIQUE (organization_id, tur, donem)
);

COMMENT ON TABLE public.abonelik_eposta IS
    'Abonelik e-postalarının gönderim defteri (125): aynı (işletme, tür, dönem) bir kez. Yalnız service-role. docs/abonelik-kurallari.md §2';

ALTER TABLE public.abonelik_eposta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.abonelik_eposta FROM PUBLIC;
REVOKE ALL ON public.abonelik_eposta FROM anon;
REVOKE ALL ON public.abonelik_eposta FROM authenticated;
REVOKE ALL ON SEQUENCE public.abonelik_eposta_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.abonelik_eposta_id_seq FROM anon;
REVOKE ALL ON SEQUENCE public.abonelik_eposta_id_seq FROM authenticated;
-- Yazan tek rol: abonelik-eposta (service_role). Varsayılan yetkiye
-- bırakılmaz — ayırma fonksiyonu SECURITY INVOKER, satırı onun adına yazar.
GRANT SELECT, INSERT, UPDATE ON public.abonelik_eposta TO service_role;
GRANT USAGE ON SEQUENCE public.abonelik_eposta_id_seq TO service_role;

-- Gönderimi ayırır: satır yoksa yazar; varsa yalnız yeniden denenebilirse
-- (hata ya da yarıda kalmış, 3 denemeden az) alır. Ayrılan satırı döner;
-- boş dönüş = "zaten gönderildi ya da başka tarama gönderiyor".
CREATE OR REPLACE FUNCTION public.abonelik_eposta_ayir(p_org UUID, p_tur TEXT, p_donem TEXT, p_user UUID)
RETURNS SETOF public.abonelik_eposta
LANGUAGE sql
SET search_path = public
AS $$
    INSERT INTO abonelik_eposta AS e (organization_id, tur, donem, user_id)
    VALUES (p_org, p_tur, p_donem, p_user)
    ON CONFLICT ON CONSTRAINT abonelik_eposta_tek DO UPDATE
        SET durum = 'gonderiliyor',
            deneme = e.deneme + 1,
            user_id = EXCLUDED.user_id,
            updated_at = now()
        WHERE e.deneme < 3
          AND (e.durum = 'hata'
               OR (e.durum = 'gonderiliyor' AND e.updated_at < now() - interval '30 minutes'))
    RETURNING e.*
$$;

COMMENT ON FUNCTION public.abonelik_eposta_ayir(UUID, TEXT, TEXT, UUID) IS
    '125 · Abonelik e-postasını göndermeden ÖNCE ayırır; boş dönüş = gönderme. Yalnız service-role.';

-- Supabase varsayılanı fonksiyonları anon/authenticated'a açar (096 dersi).
REVOKE ALL ON FUNCTION public.abonelik_eposta_ayir(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.abonelik_eposta_ayir(UUID, TEXT, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.abonelik_eposta_ayir(UUID, TEXT, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.abonelik_eposta_ayir(UUID, TEXT, TEXT, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
