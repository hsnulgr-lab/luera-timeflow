-- ============================================================
-- TimeFlow Migration 116: Tek kişilikte kendine bildirim yok
-- ============================================================
-- Telefonda (2026-10-13): tek kişilik işletmede tahsilat bitince kilit
-- ekranına "Adisyon kasada 💰 · Tuğçe · Kalıcı Makyaj · tahsil bekliyor"
-- düştü. İki kez yanlış:
--
--   • Kime: müdür, adisyonu kasaya gönderen ve parayı alan AYNI kişi. Kendi
--     az önce yaptığı işi bildirimle duyuyor.
--   • Ne: "tahsil bekliyor" — oysa kumandada gönderim ve tahsilat art arda
--     yapılıyor; bildirim telefona ulaştığında para çoktan alınmış.
--
-- 106'nın müdür olayları ekip düzeni için yazılmıştı: personel bitirir,
-- müdür kasada haber alır. Tek kişilik işletme (108) sonradan geldi ve bu
-- fonksiyona hiç dokunulmadı.
--
-- ── Değişen yalnız iki koşul ────────────────────────────────────────────────
--   4) Adisyon kasada → müdür        tek kişilikte HİÇ gönderilmiyor
--   7) Randevu iptal edildi → müdür   tek kişilikte SAHİP KENDİSİ iptal
--                                     ettiyse gönderilmiyor; müşteri iptal
--                                     ettiyse (WhatsApp, halka açık sayfa)
--                                     yine gidiyor
--
-- "Kim yaptı" `auth.uid()`dan: uygulamanın kendi oturumuyla yazılanda dolu,
-- staff-api / asistan / halka açık sayfa servis anahtarıyla ya da anonim
-- yazıyor ve orada NULL. NULL "sahip değil" sayılıyor — müşterinin yaptığı
-- bir şey hiçbir koşulda susturulmuyor. Adisyon kasaya staff-api'den
-- gittiği için (4) kişiye değil işletme düzenine bakıyor.
--
-- Ekip düzeninin davranışı SIFIR değişiyor; personel olaylarının dördü ve
-- müdürün "yeni randevu" olayı 107'deki hâliyle aynı — fonksiyon bütün
-- olarak değiştirildiği için hepsi burada yeniden yazılı.
--
-- Uygulama: 107 ve 108'den SONRA. Edge function deploy'u GEREKMİYOR,
-- telefonda yeniden derleme GEREKMİYOR.
-- Test: supabase/tests/tek_bildirim_regression.sql (işlem içi, geri sarılır).
-- Geri alma: `107_mudur_yeni_randevu.sql`'i yeniden çalıştırmak.
-- ============================================================

BEGIN;

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
                    'url',   '/calendar',
                    'tag',   'assign-' || NEW.id::text
                )
            )
        );
    END IF;

    -- 3) Müşteri geldi → atanmış personel
    IF TG_OP = 'UPDATE' AND NEW.staff_id IS NOT NULL
       AND OLD.customer_arrived_at IS NULL AND NEW.customer_arrived_at IS NOT NULL THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('staffId', NEW.staff_id),
                'payload', jsonb_build_object(
                    'title', 'Müşterin geldi 👋',
                    'body',  v_who || ' · ' || COALESCE(NEW.service, '') ||
                             CASE WHEN v_when <> '' THEN ' · ' || v_when ELSE '' END,
                    'url',   '/personel',
                    'tag',   'arrived-' || NEW.id::text
                )
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
                    'url',   '/personel',
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
                    'url',   '/personel',
                    'tag',   'moved-' || NEW.id::text
                )
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
