-- ============================================================
-- TimeFlow Migration 106: MÜDÜRE BİLDİRİM GERİ AÇILIYOR
-- ============================================================
-- `046_push_only_staff.sql` (2026) "yöneticiye/masaüstüne OS push GÖNDERİLMEZ"
-- dedi ve yönetici olaylarını bu fonksiyondan çıkardı. O karar DOĞRUYDU ve
-- bugün geçerliliğini yitirdi — gerekçesi değiştiği için:
--
--   • 046 döneminde "yönetici" demek MASAÜSTÜ TARAYICI demekti. Adisyon
--     kasaya düşünce masaüstü zaten uygulama-içi realtime ile haberdar
--     oluyordu (toast + kenar çubuğu rozeti); üstüne bir de OS bildirimi
--     göndermek aynı haberi iki kez vermekti.
--   • Artık müdürün NATIVE TELEFON UYGULAMASI var ve o uygulama kapalıyken
--     hiçbir şey duymuyor. Salonda olmayan müdür, onay bekleyen randevuyu
--     ancak uygulamayı açınca görüyor.
--
-- Kullanıcı kararı (2026-09-23): müdüre de bildirim gidecek.
--
-- ── Üç olay ─────────────────────────────────────────────────────────────────
--   booked     yeni onay bekleyen randevu  → /calendar
--   cancelled  randevu iptal edildi        → /calendar
--   cash       adisyon kasada              → /kasa
--
-- `noshow` ve `daily` YOK: sunucuda karşılıkları yok. Gelmeme telefonda
-- saatten hesaplanıyor (gönderilecek bir AN yok), gün sonu özeti dış
-- zamanlayıcı istiyor. Karşılığı olmayan anahtar çizilmiyor — telefondaki
-- liste de bu üçe indiriliyor.
--
-- ── `pref` alanı ────────────────────────────────────────────────────────────
-- Gövdeye tek yeni alan giriyor ve süzgeç `send-push` içinde uygulanıyor.
-- Burada uygulanmadı çünkü "org sahibinin ayar satırı hangisi" mantığını
-- (owner_id → settings.user_id, sahipsizse en eskiye düş) PL/pgSQL'de İKİNCİ
-- kez yazmak gerekirdi ve her yeni olay onu tekrar yazardı.
--
-- PERSONEL olayları `pref` TAŞIMIYOR → kapı onlarda hiç çalışmıyor →
-- personel kanalının davranışı SIFIR değişiyor.
--
-- 104'ün ilk-ad kuralı korunuyor: yeni olaylar da `v_who` kullanıyor.
--
-- Uygulama sırası: 105'ten SONRA. Ardından `send-push` deploy edilmeli —
-- aksi hâlde `pref` alanı okunmaz ve kapalı anahtarlar da gönderilir.
-- Geri alma: `046_push_only_staff.sql`'i yeniden çalıştırmak
-- (ama sonundaki DELETE müdür aboneliklerini siler — bkz. docs/devir/07).
-- ============================================================

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

    -- ── MÜDÜR OLAYLARI (106) ────────────────────────────────────────────────

    -- 1) Yeni onay bekleyen randevu → müdür
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
        PERFORM net.http_post(
            url     := v_url || '/send-push',
            headers := v_hdrs,
            body    := jsonb_build_object(
                'organization_id', NEW.organization_id,
                'target',  jsonb_build_object('role', 'manager'),
                'pref',    'booked',
                'payload', jsonb_build_object(
                    'title', 'Onay bekleyen randevu',
                    'body',  v_who || ' · ' || COALESCE(NEW.service, '') ||
                             CASE WHEN v_when <> '' THEN ' · ' || v_when ELSE '' END,
                    'url',   '/calendar',
                    'tag',   'pending-' || NEW.id::text
                )
            )
        );
    END IF;

    -- 4) Adisyon kasaya gönderildi, tahsil edilmemiş → müdür
    IF TG_OP = 'UPDATE'
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
    IF TG_OP = 'UPDATE'
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

-- ── Doğrulama ───────────────────────────────────────────────────────────────
-- Müdür hedefli üç çağrı var mı:
--
--   select (length(prosrc) - length(replace(prosrc, '''role'', ''manager''', ''))) / 16
--     from pg_proc where proname = 'notify_push_on_reservation';
--   -- beklenen: 3
--
-- İlk ad kuralı duruyor mu:
--   select prosrc like '%split_part%' from pg_proc
--    where proname = 'notify_push_on_reservation';
--   -- beklenen: t
--
-- NOT: müdür aboneliği yoksa `send-push` {sent:0, note:'no_subscribers'}
-- döner — hata değil. Müdürün telefonu jetonunu kaydedene kadar normal.
