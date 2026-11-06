-- ============================================================
-- TimeFlow Migration 136: Gizli kimlik (LID) ↔ telefon eşlemesi
-- ============================================================
-- WhatsApp göndereni numara yerine gizli bir kimlikle (…@lid) yollayabiliyor.
-- Evolution numarayı ancak eşlemeyi biliyorsa ekliyor (remoteJidAlt); hat
-- yeniden bağlanınca bu bilgi düştü ve müşteri mesajları "numara yok" diye
-- sessizce kayboldu (2026-10-30). Numara gelmezse whatsapp-booking Evolution'ın
-- numara ön belleğine sorar (chat/whatsappNumbers); bulduğunu buraya yazar,
-- sonraki mesajlarda Evolution'a gitmeden okur. Müşteriye bir şey sorulmaz.
--
-- Yalnız service_role okur/yazar.
--
-- Canlıda tablo 2026-10-30'da taslağın eski hâliyle açılmıştı (müşteriye numara
-- soran yol: pending_phone, code, code_expires_at, attempts; phone NULL olabilir).
-- O yol bırakıldı; IF NOT EXISTS yüzünden bu dosya canlıda tabloyu değiştirmez,
-- yalnız izinleri yeniden yazar. Kod yalnız lid + phone okur/yazar.

BEGIN;

CREATE TABLE IF NOT EXISTS public.wa_lid_map (
    organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    lid             TEXT        NOT NULL,
    phone           TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, lid)
);

ALTER TABLE public.wa_lid_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wa_lid_map FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.wa_lid_map TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
