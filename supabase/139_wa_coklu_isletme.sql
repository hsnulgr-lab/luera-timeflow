-- ============================================================
-- TimeFlow Migration 139: WhatsApp çoklu işletme hazırlığı (Faz 1)
-- ============================================================
-- 2026-11-08 denetimi: izolasyon sağlam, ama ikinci işletme açılmadan önce
-- kapanması gereken dört konu var. Bu göç onların veritabanı tarafı:
--
-- 1. wa_contacts: "Kimlere cevap versin" (agent_config.answer_mode). Hat
--    işletme sahibinin kişisel WhatsApp'ıysa bot arkadaşa ve aileye de cevap
--    veriyordu (06.11'de bizim hatta yaşandı). Her numara için bir kez karar
--    verilir ve saklanır:
--      known = true  → daha önce bu hatta yazışılmış, müşteri değil (kişisel)
--      known = false → bu hatta ilk kez yazan yeni numara
--    Karar kaynağı (source):
--      owner_typed   → sahip telefondan bu numaraya elle yazdı
--      prior_chat    → Evolution'daki geçmişte bottan önceki mesaj var
--      first_contact → geçmişte önceki mesaj yok (yeni numara)
--    Müşteri kaydı her zaman önce gelir; bu tablo yalnız müşteri OLMAYAN
--    numaralar için okunur.
--
-- 2. wa_opt_out_phones: "DUR" numaraya bağlı. Eskiden yalnız kayıtlı müşteride
--    işaretleniyordu; tanınmayan numaranın DUR'u kayboluyordu ve aynı numaranın
--    ikinci müşteri kaydı kampanya almaya devam ediyordu.
--
-- 3. Yeni işletmenin varsayılanı: hattı bağlar bağlamaz eski müşterilere
--    "sizi özledik" gitmesin. Kampanyalar (winback, recall, renewal, review)
--    kapalı başlar, sahip Ayarlar'dan bilerek açar. Yeni işletme baştan yeni
--    zamanlayıcıyla (scheduler_v2, 131) başlar. MEVCUT SATIRLARA DOKUNULMAZ.
--
-- 4. webhook_secret işletme üyelerine okunmaz: tablo düzeyindeki SELECT izni
--    kolon listesine çevrilir. Realtime kolon iznine uyuyor (realtime.apply_rls
--    has_column_privilege kullanıyor, 2026-11-08 canlıda doğrulandı).
--    Sunucu (service_role) etkilenmez.
--
-- Hepsi tekrar çalıştırılabilir.

BEGIN;

-- ── 1. Numara kararları ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_contacts (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    phone           TEXT NOT NULL,
    known           BOOLEAN NOT NULL,
    source          TEXT NOT NULL CHECK (source IN ('owner_typed', 'prior_chat', 'first_contact')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, phone)
);

ALTER TABLE public.wa_contacts ENABLE ROW LEVEL SECURITY;
-- Politika yok → yalnız service_role (whatsapp-booking).
REVOKE ALL ON public.wa_contacts FROM anon, authenticated;
GRANT ALL ON public.wa_contacts TO service_role;

COMMENT ON TABLE public.wa_contacts IS
    '139 · Müşteri olmayan numara için tek seferlik karar: known=true daha önce yazışılmış (kişisel), false yeni numara. agent_config.answer_mode okur.';

-- ── 2. Numaraya bağlı DUR ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_opt_out_phones (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    phone           TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, phone)
);

ALTER TABLE public.wa_opt_out_phones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wa_opt_out_phones FROM anon, authenticated;
GRANT ALL ON public.wa_opt_out_phones TO service_role;

COMMENT ON TABLE public.wa_opt_out_phones IS
    '139 · "DUR" diyen numara (müşteri kaydı olsun olmasın). sendWA otomatik mesajı bu numaraya göndermez; BAŞLAT siler.';

-- ── 3. Yeni işletmenin varsayılanı ──────────────────────────────────────────
-- Yalnız YENİ satırlar (070'in tetikleyicisi organization_id + status yazar,
-- features bu varsayılanı alır). Mevcut 15 satır olduğu gibi kalır.
ALTER TABLE public.org_whatsapp
    ALTER COLUMN features SET DEFAULT
    '{"confirmation": true, "review": false, "winback": false, "recall": false, "renewal": false, "assistant": false, "scheduler_v2": true}'::jsonb;

-- ── 4. webhook_secret yalnız sunucuya ───────────────────────────────────────
-- Satır politikası (org_whatsapp_read) aynen kalır; yalnız hangi kolonların
-- okunabildiği daralır. İstemciler zaten kolon adıyla okuyor (useWhatsApp,
-- useReservations, mobil managerSource) — hiçbiri webhook_secret istemiyor.
REVOKE SELECT ON public.org_whatsapp FROM anon, authenticated;
GRANT SELECT (
    organization_id, instance, status, connected_at, last_seen_at, last_error,
    features, created_at, updated_at, agent_config, schedule_config, knowledge
) ON public.org_whatsapp TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
