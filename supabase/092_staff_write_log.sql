-- ============================================================
-- TimeFlow Migration 092: Personel yazma kütüğü + iyimser kilit
-- ============================================================
-- Mobil uygulama veritabanına bağlanmadan ÖNCE gereken iki güvence.
--
-- 1) staff_write_log — idempotens kapısı.
--    `mobile/src/api/staff.ts` her yazma isteğine bir `idempotencyKey`
--    koyuyor ve çevrimdışı kuyruk aynı anahtarla TEKRAR gönderiyor. Sunucu
--    bugüne kadar bu alanı hiç okumadı: kuyruk devreye girdiği an aynı iş
--    iki kez uygulanırdı. Kütük, uygulanan her yazmanın YANITINI saklıyor;
--    aynı anahtar ikinci kez gelirse iş tekrar çalışmıyor, kayıtlı yanıt
--    aynen dönüyor.
--
-- 2) reservations.updated_at tetikleyicisi — iyimser kilidin dayanağı.
--    Kolon 2024'ten beri var ama HİÇBİR tetikleyici onu sürmüyor; yalnız
--    masaüstü elle yazıyor (useReservations.ts), staff-api hiç yazmıyor.
--    Bu hâliyle sürüm karşılaştırması için güvenilmez: telefon yazınca damga
--    değişmediği için masaüstünün elindeki değer "hâlâ güncel" görünür ve
--    masaüstü telefonun kalemini sessizce ezer. Tetikleyici, damgayı kimin
--    yazdığından bağımsız hâle getiriyor.
-- ============================================================

-- ── 1 · Yazma kütüğü ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.staff_write_log (
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    idempotency_key  TEXT NOT NULL,
    staff_id         UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    action           TEXT NOT NULL,
    status           INTEGER NOT NULL,
    response         JSONB NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, idempotency_key)
);

-- Anahtar ORGANİZASYONLA BİRLİKTE birincil anahtar: yalnız anahtar olsaydı,
-- bir org'un anahtarını tahmin eden başka bir org kayıtlı yanıtı okuyabilirdi.
-- Kütük yanıt gövdesi saklıyor; o gövde müşteri adı ve fiyat taşıyor.
COMMENT ON TABLE public.staff_write_log IS
    'staff-api yazma uçlarının idempotens kütüğü. Aynı (org, idempotency_key) ikinci kez gelirse iş tekrar çalışmaz, saklanan yanıt döner. Kaynak: mobile/src/api/staff.ts write()/flushQueue().';

CREATE INDEX IF NOT EXISTS idx_staff_write_log_created
    ON public.staff_write_log (created_at);

-- Kütük sonsuza kadar büyümemeli. Kuyruğun anlamlı ömrü günler mertebesinde
-- (telefon çevrimdışı kalabildiği en uzun süre); 30 gün fazlasıyla yeterli.
-- Temizlik n8n'den ya da elden çağrılır — pg_cron bu kurulumda yok.
CREATE OR REPLACE FUNCTION public.prune_staff_write_log(p_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM public.staff_write_log
    WHERE created_at < now() - make_interval(days => GREATEST(p_days, 1));
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

-- Kütüğe YALNIZ service_role erişir (staff-api). Politika tanımlanmıyor:
-- RLS açık + politika yok = anon ve authenticated için tam kapalı.
ALTER TABLE public.staff_write_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staff_write_log FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.prune_staff_write_log(INTEGER) FROM anon, authenticated;

-- ── 2 · reservations.updated_at tetikleyicisi ───────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_reservation_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- clock_timestamp(), now() DEĞİL: now() işlem başlangıcını verir ve aynı
    -- işlemdeki iki güncelleme aynı damgayı alır. İyimser kilit için her
    -- yazmanın kendi anı gerekiyor.
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservations_touch_updated_at ON public.reservations;
CREATE TRIGGER trg_reservations_touch_updated_at
    BEFORE UPDATE ON public.reservations
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_reservation_updated_at();

COMMENT ON COLUMN public.reservations.updated_at IS
    'Her UPDATE''te tetikleyici tarafından sürülür (092). staff-api visit.items iyimser kilidi bu damgayı sürüm belirteci olarak kullanır.';

-- ── 3 · Tarih sınırlı sorguların indeksleri ─────────────────────────────────
--
-- staff-api'nin org + tarih ile daralan üç sorgusu var (agenda, catalog
-- geçmişi, müşteri defteri) ve bugüne kadar yalnız idx_reservations_org
-- vardı: org'un TÜM randevuları taranıp tarih sonradan eleniyordu. Tarih
-- sınırı eklemek, indeks olmadan tek başına yetmez.
CREATE INDEX IF NOT EXISTS idx_reservations_org_date
    ON public.reservations (organization_id, date);

-- Müşteri kartının geçmişi: org + müşteri + tarih (son ona bakıyor).
-- Aynı üçlüyü taşıyan iki indeks zaten var ama ikisi de KISMİ ve başka bir
-- soruyu cevaplıyor: 085 yalnız yanıt bekleyen satırları, 090 yalnız formülü
-- olanları taşıyor. Kart geçmişi ikisini de filtrelemiyor.
CREATE INDEX IF NOT EXISTS idx_reservations_org_customer_date
    ON public.reservations (organization_id, customer_id, date DESC)
    WHERE customer_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
