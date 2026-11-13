-- ============================================================
-- TimeFlow Migration 144: "Müşteri bekliyor" Live Activity (1.0.3)
-- ============================================================
-- Kullanıcı kararı (2026-11-12): resepsiyon bir randevuya "Geldi" dediği
-- anda o işin personelinin iPhone'unda kilit ekranı + Dinamik Ada'da
-- "Ayşe bekliyor · 4:12" açılsın; personel işi başlatınca, randevu iptal
-- olunca, "Gelmedi" denince kapansın. Uygulama kapalıyken de açılması için
-- sunucu Apple'a doğrudan iter (APNs push-to-start, iOS 17.2+). Plan:
-- docs/dinamik-ada-musteri-bekliyor-plan.md.
--
-- ── Üç parça ────────────────────────────────────────────────────────────────
--   1. `live_activity_tokens` — telefonların Apple jetonları:
--        start  · cihaz başına bir (push-to-start); sunucu bununla BAŞLATIR
--        update · çalışan etkinlik başına bir; sunucu bununla BİTİRİR
--      RLS açık, politika YOK: yalnız staff-api / send-live-activity
--      (service_role) dokunuyor. 117'nin `staff_devices` deseni.
--   2. `notify_push_on_reservation` (118'in birebiri + iki değişiklik):
--        3) "Müşterin geldi" — personelin başlatma jetonu varsa istek
--           `send-live-activity`e; o, etkinliği açamadığı cihaza AYNI
--           bildirimi `send-push`ten gönderiyor. Jeton yoksa bugünkü yol.
--        8) YENİ — bekleyen müşterinin işi başladı / iptal / gelmedi / geri
--           alındı / başkasına ya da başka güne geçti → "bitir".
--      Geri kalan altı olay BİREBİR 118.
--   3. Temizlik: personel pasife alınınca (142'nin deseni) jetonları siliniyor;
--      silinen randevunun etkinliği bitiriliyor. Org / personel silinince
--      satırlar FK ile gidiyor (hesap silme dahil). Telefon koparma (117),
--      çıkış ve işletme değişimi staff-api'den (`staff.devices.cut`,
--      `la.unregister`) siliyor.
--
-- ── Geriye uyum (mağazadaki 1.0.1 / 1.0.2) ─────────────────────────────────
-- Eski uygulama jeton YAZMAZ → tabloda satırı yok → "Müşterin geldi"
-- bugünkü gövdeyle bugünkü uca gidiyor. Bu göç tek başına uygulansa da
-- (fonksiyonlar yüklenmeden) hiçbir telefonun davranışı değişmez: jeton
-- yalnız yeni staff-api'yle yazılabiliyor.
--
-- ── Sıra ────────────────────────────────────────────────────────────────────
--   1) bu göç  2) send-live-activity + send-push + staff-api yüklemesi
--   3) APNs anahtarı app_secrets'e (yoksa her şey bildirime düşer)
--   4) 1.0.3 geliştirme derlemesi.
-- send-live-activity yüklenmeden 1.0.3 telefonu jeton kaydederse "Geldi"
-- bildirimi kaybolur — o yüzden fonksiyonlar telefondan ÖNCE.
--
-- Test: supabase/tests/144_musteri_bekliyor_regression.sql (işlem içi) +
-- tests/musteri-bekliyor.test.mjs (PGlite). Yeniden çalıştırılabilir.
-- ============================================================

BEGIN;

-- ── 1 · Jeton tablosu ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.live_activity_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    staff_id        UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    -- Telefonun kurulum kimliği (`pushDevice.ts`, push_subscriptions.device_id
    -- ile AYNI). Etkinlik açılan cihaza bildirim gitmesin diye eşleşme bununla.
    device_id       TEXT NOT NULL CHECK (length(device_id) BETWEEN 8 AND 100),
    kind            TEXT NOT NULL CHECK (kind IN ('start', 'update')),
    -- Yalnız `update`: etkinliğin randevusu. FK YOK, bilerek: randevu
    -- silinince "bitir" itmesi bu satırı okuyarak gidiyor (cascade önce
    -- silerdi). Bitirme gönderilince satırı gönderici siliyor.
    reservation_id  UUID,
    -- Yalnız `update`: ActivityKit'in etkinlik kimliği.
    activity_id     TEXT CHECK (activity_id IS NULL OR length(activity_id) BETWEEN 1 AND 100),
    -- APNs jetonu, onaltılı (expo-widgets `%02x` ile yazıyor).
    token           TEXT NOT NULL CHECK (length(token) <= 512 AND token ~ '^[0-9a-f]{32,}$'),
    -- Derlemenin imzalandığı ortam: geliştirme → sandbox, TestFlight/mağaza →
    -- production. Yanlış sunucuya giden her istek 400 BadDeviceToken.
    environment     TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT live_activity_tokens_shape CHECK (
        (kind = 'start'  AND reservation_id IS NULL     AND activity_id IS NULL)
     OR (kind = 'update' AND reservation_id IS NOT NULL AND activity_id IS NOT NULL)
    )
);

COMMENT ON TABLE public.live_activity_tokens IS
    '144 · "Müşteri bekliyor" Live Activity jetonları. Yalnız service_role (staff-api, send-live-activity).';

-- Cihaz başına bir başlatma jetonu; etkinlik başına bir güncelleme jetonu.
CREATE UNIQUE INDEX IF NOT EXISTS uq_144_la_start
    ON public.live_activity_tokens (organization_id, device_id)
    WHERE kind = 'start';
CREATE UNIQUE INDEX IF NOT EXISTS uq_144_la_update
    ON public.live_activity_tokens (organization_id, device_id, activity_id)
    WHERE kind = 'update';
-- Tetikleyicinin iki sorusu: "bu personelin başlatma jetonu var mı",
-- "bu randevunun etkinliği var mı".
CREATE INDEX IF NOT EXISTS idx_144_la_staff
    ON public.live_activity_tokens (organization_id, staff_id)
    WHERE kind = 'start';
CREATE INDEX IF NOT EXISTS idx_144_la_reservation
    ON public.live_activity_tokens (organization_id, reservation_id)
    WHERE kind = 'update';

ALTER TABLE public.live_activity_tokens ENABLE ROW LEVEL SECURITY;
-- Politika yok. 096'nın dersi: `from public` yetmez, roller tek tek.
REVOKE ALL ON public.live_activity_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_activity_tokens TO service_role;

-- ── 2 · Pasif personelin jetonları (142'nin deseni) ─────────────────────────
CREATE OR REPLACE FUNCTION public.drop_live_activity_on_staff_deactivate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    DELETE FROM public.live_activity_tokens WHERE staff_id = NEW.id;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.drop_live_activity_on_staff_deactivate() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_144_staff_deactivate_la ON public.staff;
CREATE TRIGGER trg_144_staff_deactivate_la
    AFTER UPDATE OF is_active ON public.staff
    FOR EACH ROW
    WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active AND NEW.is_active = false)
    EXECUTE FUNCTION public.drop_live_activity_on_staff_deactivate();

-- ── 3 · "Geldi" tetikleyicisi: 118 + başlat + bitir ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_push_on_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url    TEXT;
    v_secret TEXT;
    v_when   TEXT;
    v_who    TEXT;
    v_hdrs   JSONB;
    v_solo   BOOLEAN;
    v_owner  UUID;
    v_self   BOOLEAN;
    v_arrived JSONB;
BEGIN
    SELECT value INTO v_url    FROM app_secrets WHERE key = 'FUNCTIONS_BASE_URL';
    SELECT value INTO v_secret FROM app_secrets WHERE key = 'PUSH_TRIGGER_SECRET';
    IF v_url IS NULL OR v_secret IS NULL THEN
        RETURN NEW;
    END IF;

    v_hdrs := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret);
    v_when := COALESCE(to_char(NEW.start_time, 'HH24:MI'), '');

    -- İlk ad (104). Kilit ekranı salonda herkese açık.
    v_who := COALESCE(NULLIF(split_part(COALESCE(NEW.customer_name, ''), ' ', 1), ''), 'Müşteri');

    -- 116 · Tek kişilik işletme (108) ve değişikliği SAHİBİN KENDİSİ mi yaptı.
    -- `auth.uid()` uygulamanın kendi oturumuyla yazılanda dolu; staff-api,
    -- WhatsApp asistanı ve halka açık randevu sayfası servis anahtarıyla ya
    -- da anonim yazıyor — orada NULL. NULL "sahip değil" sayılıyor
    -- (COALESCE): müşterinin yaptığı bir şey hiçbir zaman susturulmuyor.
    SELECT COALESCE(o.solo, false), o.owner_id
      INTO v_solo, v_owner
      FROM organizations o
     WHERE o.id = NEW.organization_id;
    v_solo := COALESCE(v_solo, false);
    v_self := v_solo AND COALESCE(auth.uid() = v_owner, false);

    -- ── MÜDÜR OLAYLARI (106) ────────────────────────────────────────────────

    -- 1) MÜŞTERİ randevu aldı → müdür   (107: koşul `status`ten `source`a geçti)
    IF TG_OP = 'INSERT' AND COALESCE(NEW.source, 'manual') <> 'manual' THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('role', 'manager'),
                'pref',    'booked',
                'payload', jsonb_build_object(
                    'title', CASE WHEN NEW.status = 'pending'
                                  THEN 'Onay bekleyen randevu'
                                  ELSE 'Yeni randevu' END,
                    'body',  v_who || ' · ' || COALESCE(NEW.service, '') ||
                             CASE WHEN v_when <> '' THEN ' · ' || v_when ELSE '' END,
                    'url',   '/calendar',
                    'tag',   'booked-' || NEW.id::text
                )
            )
        );
    END IF;

    -- 4) Adisyon kasaya gönderildi, tahsil edilmemiş → müdür
    --
    -- 116 · TEK KİŞİLİKTE YOK. Orada müdür, adisyonu kasaya gönderen ve
    -- parayı alan AYNI kişi: bildirim kendi az önce yaptığı işi ona
    -- anlatıyordu — üstelik "tahsil bekliyor" diye, parayı saniyeler sonra
    -- kendisi almışken (2026-10-13, telefon). Gönderim staff-api'den servis
    -- anahtarıyla geldiği için "kim yaptı" burada okunamıyor; ayrım işletme
    -- düzeninden. Açık kalan adisyonu Gün'deki G4 kartı hatırlatıyor.
    IF TG_OP = 'UPDATE' AND NOT v_solo
       AND OLD.service_ended_at IS NULL AND NEW.service_ended_at IS NOT NULL
       AND COALESCE(NEW.is_paid, false) = false THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('role', 'manager'),
                'pref',    'cash',
                'payload', jsonb_build_object(
                    'title', 'Adisyon kasada 💰',
                    'body',  v_who || ' · ' || COALESCE(NEW.service, '') ||
                             ' · tahsil bekliyor',
                    'url',   '/kasa',
                    'tag',   'kasa-' || NEW.id::text
                )
            )
        );
    END IF;

    -- 7) Randevu iptal edildi → MÜDÜR (personelinki ayrıca, aşağıda 5'te)
    --
    -- İptal müdürü ilgilendiriyor çünkü boşalan saat onun kararı: yerine
    -- birini almak, bekleme listesine bakmak ya da hiçbir şey yapmamak.
    --
    -- 116 · Tek kişilikte sahip KENDİ iptal ettiyse susuyor (107'nin "müdür
    -- yazdıysa susar" kuralının iptal karşılığı). Müşteri iptal ettiyse
    -- (WhatsApp, halka açık sayfa) haber veriyor. Ekip düzeni değişmiyor:
    -- orada masaüstünü başkası da kullanıyor olabilir.
    IF TG_OP = 'UPDATE' AND NOT v_self
       AND OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled' THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('role', 'manager'),
                'pref',    'cancelled',
                'payload', jsonb_build_object(
                    'title', 'Randevu iptal edildi',
                    'body',  v_who || ' · ' || COALESCE(NEW.service, '') ||
                             CASE WHEN v_when <> '' THEN ' · ' || v_when ELSE '' END,
                    'url',   '/calendar',
                    'tag',   'iptal-mudur-' || NEW.id::text
                )
            )
        );
    END IF;

    -- ── PERSONEL OLAYLARI — 046'dan beri aynı, `pref` TAŞIMIYOR ─────────────

    -- 2) Personele atama → o personel
    IF NEW.staff_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR OLD.staff_id IS DISTINCT FROM NEW.staff_id) THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('staffId', NEW.staff_id),
                'payload', jsonb_build_object(
                    'title', 'Yeni randevun var',
                    'body',  v_who || ' · ' || COALESCE(NEW.service, '') ||
                             CASE WHEN v_when <> '' THEN ' · ' || v_when ELSE '' END,
                    'url',   '/calendar?date=' || NEW.date::text,
                    'tag',   'assign-' || NEW.id::text
                )
            )
        );
    END IF;

    -- 3) Müşteri geldi → atanmış personel
    --
    -- 144 · Personelin bir telefonu "Müşteri bekliyor" etkinliğine kayıtlıysa
    -- (başlatma jetonu var) istek `send-live-activity`e gidiyor. O, etkinliği
    -- başlatamadığı HER cihaza bu bildirimin BİREBİRİNİ (`fallback`) yine
    -- `send-push`ten gönderiyor; etkinlik açılan cihaza ayrıca bildirim
    -- gitmiyor (Apple başlatma itmesinde uyarıyı zorunlu tutuyor, ikisi
    -- birden telefonu iki kez çaldırırdı). Jetonu olmayan personel — eski
    -- uygulama, Android, iOS 17.2 altı — bugünkü yoldan, değişmeden.
    -- Tek kişilikte etkinlik yok (resepsiyon ile personel aynı kişi).
    IF TG_OP = 'UPDATE' AND NEW.staff_id IS NOT NULL
       AND OLD.customer_arrived_at IS NULL AND NEW.customer_arrived_at IS NOT NULL THEN
        v_arrived := jsonb_build_object(
            'organization_id', NEW.organization_id,
            'target',  jsonb_build_object('staffId', NEW.staff_id),
            'payload', jsonb_build_object(
                'title', 'Müşterin geldi 👋',
                'body',  v_who || ' · ' || COALESCE(NEW.service, '') ||
                         CASE WHEN v_when <> '' THEN ' · ' || v_when ELSE '' END,
                'url',   '/personel?date=' || NEW.date::text,
                'tag',   'arrived-' || NEW.id::text
            )
        );
        IF NOT v_solo AND EXISTS (
            SELECT 1 FROM public.live_activity_tokens t
             WHERE t.organization_id = NEW.organization_id
               AND t.staff_id = NEW.staff_id
               AND t.kind = 'start'
        ) THEN
            PERFORM net.http_post(
                url     := v_url || '/send-live-activity',
                headers := v_hdrs,
                body    := jsonb_build_object(
                    'event',           'start',
                    'organization_id', NEW.organization_id,
                    'staff_id',        NEW.staff_id,
                    'reservation_id',  NEW.id,
                    'date',            NEW.date::text,
                    'customer',        v_who,
                    'service',         COALESCE(NEW.service, ''),
                    'time',            v_when,
                    'arrived_at',      NEW.customer_arrived_at,
                    'fallback',        v_arrived
                )
            );
        ELSE
            PERFORM net.http_post(
                url     := v_url || '/send-push',
                headers := v_hdrs,
                body    := v_arrived
            );
        END IF;
    END IF;

    -- 8) 144 · Bekleyen müşterinin etkinliği BİTER → o randevunun etkinlikleri
    --
    -- İş başladı (ya da başlamadan bitti), iptal, "Gelmedi", geliş geri
    -- alındı, randevu başka kişiye ya da güne geçti. Yalnız o randevuya bağlı
    -- bir etkinlik jetonu varsa istek atılıyor — yoksa sunucunun yapacağı bir
    -- şey yok, telefon öne gelince kendisi kapatıyor (yerel mutabakat).
    -- Silinen randevu ayrı tetikleyicide (`live_activity_end_on_delete`).
    IF TG_OP = 'UPDATE' AND OLD.customer_arrived_at IS NOT NULL
       AND (
            (OLD.arrived_at IS NULL AND NEW.arrived_at IS NOT NULL)
         OR (OLD.service_ended_at IS NULL AND NEW.service_ended_at IS NOT NULL)
         OR (OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled')
         OR (OLD.no_show_at IS NULL AND NEW.no_show_at IS NOT NULL)
         OR NEW.customer_arrived_at IS NULL
         OR OLD.staff_id IS DISTINCT FROM NEW.staff_id
         OR OLD.date IS DISTINCT FROM NEW.date
       )
       AND EXISTS (
            SELECT 1 FROM public.live_activity_tokens t
             WHERE t.organization_id = NEW.organization_id
               AND t.reservation_id = NEW.id
               AND t.kind = 'update'
       ) THEN
        PERFORM net.http_post(
            url     := v_url || '/send-live-activity',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'event',           'end',
                'organization_id', NEW.organization_id,
                'reservation_id',  NEW.id
            )
        );
    END IF;

    -- 5) Atanmış randevu iptal edildi → o personel
    IF TG_OP = 'UPDATE' AND NEW.staff_id IS NOT NULL
       AND OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled' THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('staffId', NEW.staff_id),
                'payload', jsonb_build_object(
                    'title', 'Randevu iptal edildi',
                    'body',  v_who || ' · ' || COALESCE(NEW.service, '') ||
                             CASE WHEN v_when <> '' THEN ' · ' || v_when ELSE '' END,
                    'url',   '/personel?date=' || NEW.date::text,
                    'tag',   'cancel-' || NEW.id::text
                )
            )
        );
    END IF;

    -- 6) Atanmış aktif randevu ertelendi → o personel
    IF TG_OP = 'UPDATE' AND NEW.staff_id IS NOT NULL
       AND NEW.status <> 'cancelled'
       AND (OLD.date IS DISTINCT FROM NEW.date OR OLD.start_time IS DISTINCT FROM NEW.start_time) THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('staffId', NEW.staff_id),
                'payload', jsonb_build_object(
                    'title', 'Randevu saati değişti',
                    'body',  v_who || ' · ' || COALESCE(NEW.service, '') ||
                             ' · yeni: ' || COALESCE(to_char(NEW.date, 'DD.MM'), '') ||
                             CASE WHEN v_when <> '' THEN ' ' || v_when ELSE '' END,
                    'url',   '/personel?date=' || NEW.date::text,
                    'tag',   'moved-' || NEW.id::text
                )
            )
        );
    END IF;

    RETURN NEW;
END;
$$;
-- ── 4 · Silinen randevunun etkinliği ────────────────────────────────────────
-- Bildirim tetikleyicisi yalnız INSERT/UPDATE'te çalışıyor; silinen bekleyen
-- randevunun etkinliği kilit ekranında asılı kalmasın. Yalnız etkinlik
-- jetonu varsa istek atılıyor.
CREATE OR REPLACE FUNCTION public.live_activity_end_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url    TEXT;
    v_secret TEXT;
BEGIN
    IF OLD.customer_arrived_at IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.live_activity_tokens t
         WHERE t.organization_id = OLD.organization_id
           AND t.reservation_id = OLD.id
           AND t.kind = 'update'
    ) THEN
        RETURN OLD;
    END IF;
    SELECT value INTO v_url    FROM app_secrets WHERE key = 'FUNCTIONS_BASE_URL';
    SELECT value INTO v_secret FROM app_secrets WHERE key = 'PUSH_TRIGGER_SECRET';
    IF v_url IS NULL OR v_secret IS NULL THEN
        RETURN OLD;
    END IF;
    PERFORM net.http_post(
        url     := v_url || '/send-live-activity',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        body    := jsonb_build_object(
            'event',           'end',
            'organization_id', OLD.organization_id,
            'reservation_id',  OLD.id
        )
    );
    RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.live_activity_end_on_delete() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_144_la_end_on_delete ON public.reservations;
CREATE TRIGGER trg_144_la_end_on_delete
    AFTER DELETE ON public.reservations
    FOR EACH ROW
    WHEN (OLD.customer_arrived_at IS NOT NULL)
    EXECUTE FUNCTION public.live_activity_end_on_delete();

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── Doğrulama (canlıda, göçten sonra) ──────────────────────────────────────
--   select relrowsecurity from pg_class where oid = 'public.live_activity_tokens'::regclass;  → t
--   select count(*) from pg_policies where tablename = 'live_activity_tokens';                → 0
--   select has_table_privilege('authenticated', 'public.live_activity_tokens', 'select');     → f
--   select position('send-live-activity' in pg_get_functiondef('public.notify_push_on_reservation()'::regprocedure)) > 0; → t
--
-- ── Geri alma ───────────────────────────────────────────────────────────────
--   \i supabase/118_personel_bildirim_gunu.sql      (tetikleyici 118'e döner)
--   DROP TRIGGER IF EXISTS trg_144_la_end_on_delete ON public.reservations;
--   DROP TRIGGER IF EXISTS trg_144_staff_deactivate_la ON public.staff;
--   DROP TABLE IF EXISTS public.live_activity_tokens;
-- ============================================================
