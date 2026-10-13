-- ============================================================
-- TimeFlow Migration 117: Kayıp personel telefonunun bağını koparmak
-- ============================================================
-- 2026-10-13, kullanıcı kararı: "bağlantıyı koparma yetkisi işletme
-- sahibinde olsun". Ardından staff-api deploy edilmeli. Sıra ÖNEMLİ: önce
-- göç, sonra deploy — yeni kod `staff_devices`e yazıyor, tablo yoksa yeni
-- telefon bağlanamaz (`device_unavailable`). Eski kod bu göçle çalışmaya
-- devam eder: tabloya hiç bakmaz.
--
-- ── Açık ────────────────────────────────────────────────────────────────────
-- Telefonun işletmeye bağı (099 · ekip kodu) 90 günlük bir CİHAZ belgesi ve
-- sunucuda hiçbir yere yazılmıyordu. Şifre sıfırlamak kişinin oturumunu
-- düşürüyor ama telefon bağlı kalıyordu; 099'da "şifresi yoksa kendisi
-- belirler" — yani kayıp telefonu bulan kişi, sahip şifreyi sıfırladıktan
-- sonra YENİ ŞİFRE belirleyip içeri girebiliyordu. Sahibin doğal tepkisi
-- (şifreyi sıfırla) açığı büyütüyordu.
--
-- ── Çözüm ───────────────────────────────────────────────────────────────────
--   1. `staff_devices` — bağlanan her telefon bir satır; belgede kimliği
--      (`did`) taşınıyor. Her istekte satıra bakılıyor; `revoked_at` doluysa
--      belge ölü.
--   2. `staff.devices_cut_at` — sahip "bağlantıyı kopar" dediği an. Bu andan
--      ÖNCE basılmış hiçbir cihaz belgesiyle o kişi giremez ve şifre
--      belirleyemez. Kimliksiz eski belgeleri (bu göçten önce bağlanan
--      telefonlar) de kapsıyor; ortak tablet de bu kurala takılır ve yeni
--      kodla bağlanır.
--   3. Denetim olayı `devices_cut`.
--
-- Kişinin ŞİFRESİ DEĞİŞMİYOR: yeni telefonunu Telefon bağla ile bağlayıp
-- aynı şifreyle girer. Oturumu `session_epoch` artırılarak düşürülüyor.
-- Bildirim aboneliği staff-api'de siliniyor (kayıp telefon kilit ekranında
-- müşteri adı göstermesin).
--
-- RLS: `staff_devices`e yalnız staff-api (service_role) dokunuyor; politika
-- YOK, istemci rolleri satır göremez ve yazamaz.
-- ============================================================

BEGIN;

-- ── 1 · Bağlı telefonlar ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.staff_devices (
    -- Cihaz belgesindeki `did`. Sunucu basıyor (crypto.randomUUID), telefon
    -- seçemiyor.
    id              UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- team: ekip kodu (099) · single: kişiye özel kod (091) · owner: sahibin
    -- kendi oturumuyla eşleme (`device.pair`, ortak tablet).
    paired_via      TEXT NOT NULL CHECK (paired_via IN ('team', 'single', 'owner')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Bu telefondan en son kim girdi. "Elif'in telefonu" sorusunun cevabı:
    -- kişisel telefonda hep aynı kişi.
    last_staff_id   UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    last_login_at   TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    revoked_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.staff_devices IS
    'İşletmeye bağlanan personel telefonları (117). Cihaz belgesinin `did`i; revoked_at doluysa belge ölü.';
COMMENT ON COLUMN public.staff_devices.last_staff_id IS
    'Bu telefondan en son giren personel. Bağlantıyı kopar bu sütunla telefonu buluyor.';

CREATE INDEX IF NOT EXISTS idx_117_staff_devices_owner
    ON public.staff_devices (organization_id, last_staff_id)
    WHERE revoked_at IS NULL;

ALTER TABLE public.staff_devices ENABLE ROW LEVEL SECURITY;
-- Politika yok. 096'nın dersi: `from public` yetmez, roller tek tek.
REVOKE ALL ON public.staff_devices FROM PUBLIC, anon, authenticated;

-- ── 2 · Kişinin eski telefonları ────────────────────────────────────────────

ALTER TABLE public.staff
    ADD COLUMN IF NOT EXISTS devices_cut_at TIMESTAMPTZ;

COMMENT ON COLUMN public.staff.devices_cut_at IS
    'Sahip bağlantıyı kopardığı an (117). Bundan önce basılmış cihaz belgesiyle bu kişi giremez.';

-- ── 3 · Denetim olayı ───────────────────────────────────────────────────────
-- Kısıt bir LİSTE: 110'un tamamı + `devices_cut`. Kısıtı değiştiren bütün
-- göçler sayıldı (090, 091, 099, 109, 110); en günceli 110.

ALTER TABLE public.staff_auth_log
    DROP CONSTRAINT IF EXISTS staff_auth_log_event_check;

ALTER TABLE public.staff_auth_log
    ADD CONSTRAINT staff_auth_log_event_check
    CHECK (event IN (
        -- 082 · giriş
        'login',
        'failed_pin',
        'locked',
        'revoked',
        -- 090 · ziyaret
        'visit.forbidden',
        'visit.start',
        'visit.finish',
        -- 091 · cihaz eşleme
        'pair_code_created',
        'paired',
        'failed_pair',
        'pair_locked',
        -- 099 · şifre
        'pin_set',
        'pin_reset',
        'pin_changed',
        -- 110 · tahsilat
        'visit.collect',
        -- 117 · bağlantıyı kopar (detay: koparılan telefon sayısı)
        'devices_cut'
    ));

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── Doğrulama ───────────────────────────────────────────────────────────────
--   select relrowsecurity from pg_class where oid = 'public.staff_devices'::regclass;  → t
--   select count(*) from pg_policies where tablename = 'staff_devices';              → 0
--   select has_table_privilege('authenticated', 'public.staff_devices', 'select');   → f
--
-- ── Geri alma ───────────────────────────────────────────────────────────────
-- Yeni staff-api deploy edildiyse ÖNCE eski staff-api geri yüklenmeli (yeni
-- kod tabloya yazıyor). Sonra:
--   drop table public.staff_devices;
--   alter table public.staff drop column devices_cut_at;
--   (kısıt: 110 dosyasındaki blok yeniden çalıştırılır)
