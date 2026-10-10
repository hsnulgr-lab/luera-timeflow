-- ============================================================
-- TimeFlow Migration 111: Kasa'da DÜZELTME ve GERİ ALMA izi (v4 · C2/C3)
-- ============================================================
-- Telefondaki Kasa 2026-09-16'dan beri SALT OKUNUR ve sebebi tasarım değildi:
-- `payments` tablosunda iz diye bir şey yoktu (`022_payments.sql`: ne `status`
-- ne `voided_at`). Masaüstü tahsilatı SİLEREK geri alıyor. Telefonda "İptal
-- et" basılınca yalnız cihazda bir işaret kalıyordu; sayfa yenilenince
-- tahsilat geri geliyor ve toplam hiç düşmemiş oluyordu. Ekran yalan
-- söylüyordu, o yüzden düğme kapatıldı.
--
-- Bu göç o izi açıyor. Düzelt / Geri al yalnız TEK KİŞİLİK modda açılacak
-- (v4 karar 4); ekip modunda telefonun Kasa'sı salt okunur kalıyor.
--
-- Idempotent — defalarca çalıştırılabilir. `-U supabase_admin` ile uygulanır:
-- aşağıdaki SECURITY DEFINER fonksiyonlar sahiplerinin yetkisiyle çalışıyor
-- ve tabloların sahibi o.
--
-- ── Neden SİLMİYORUZ ────────────────────────────────────────────────────────
-- Bir tahsilatın tutarı sessizce değişirse kasadaki farkın ne zaman doğduğu
-- bir daha bulunamaz. Para kaydı silinmez: iptal damgalanır, düzeltme
-- yanına YENİ bir satır olarak yazılır ve yeni satır eskisini işaret eder.
-- Ekranın kendi cümlesi de bunu söylüyor: "Eski kayıt silinmez."
--
-- ── Neden NEGATİF satır değil ───────────────────────────────────────────────
-- Muhasebede ters kayıt negatif tutarla yazılır. Burada yazılamıyor:
-- `payments.amount` kısıtı `CHECK (amount >= 0)` ve onu gevşetmek, bugün
-- negatif tutar beklemeyen masaüstü raporlarının hepsini riske atardı.
-- Onun yerine iz damgayla taşınıyor.
--
-- ── Damgalı satır NEREDE görünmez ───────────────────────────────────────────
-- Damgalı satır tabloda kalıyor; o yüzden onu okuyan HER YER "bu artık para
-- değil" demeyi bilmeli. Süzgeci her istemciye ayrı yazmak (masaüstü,
-- telefon, mağazadaki eski uygulama sürümleri) aynı kuralı üç yerde tutmak,
-- birini unutmak da düzeltilen tahsilatı İKİ KEZ saymak demekti.
--
-- Süzgeç o yüzden VERİTABANINDA: `authenticated` için dört KISITLAYICI
-- (restrictive) politika. Var olan `payments_org_access` olduğu gibi duruyor;
-- kısıtlayıcı politika izin vermiyor, onunla VE'lenip daraltıyor:
--   • okuma: damgalı satır uygulamalara hiç gelmiyor. Masaüstünün ve
--     telefonun bugünkü sorguları koda dokunmadan doğru topluyor.
--   • yazma: istemci damga basamıyor, damgalı satırı değiştiremiyor ve
--     silemiyor, sahte bir düzeltme satırı (`corrected_from`) ekleyemiyor.
-- Damgayı basmanın TEK yolu aşağıdaki iki fonksiyon.
--
-- RLS'i ATLAYAN okuyucular ayrıca süzülüyor:
--   • 061'in üç tetikleyici fonksiyonu (SECURITY DEFINER) — aşağıda yeniden
--     kuruluyor; gövdeleri 061'in AYNISI, yalnız `-- 111` işaretli satırlar ekli.
--   • service_role ile okuyan edge function'lar: `staff-api · visit.collect`
--     ve `whatsapp-booking · my_balance` — kendi kodlarında süzüyorlar.
--
-- Bilinen sınır: açık duran bir masaüstü sekmesi damga olayını canlı
-- güncellemeyle almıyor (gizlenen satırın değişikliği abonelere gitmiyor);
-- sayfa yenilenince doğru. Düzeltme yalnız tek kişilik modda yapılıyor ve o
-- modun masaüstü yok.
--
-- ── Neden FONKSİYON ve neden SECURITY DEFINER ───────────────────────────────
-- Düzeltme üç yazmadır: eskiyi damgala, yeniyi yaz, (geri almada) randevunun
-- `is_paid` bayrağını düşür. supabase-js bunları tek işlemde yapamaz; arada
-- düşen bir istek kasada parası olmayan bir adisyon ya da iki canlı tahsilat
-- bırakırdı. Fonksiyon üçünü tek işlemde topluyor.
--
-- DEFINER olmak ZORUNLU: kısıtlayıcı politika istemcinin damga basmasını
-- yasaklıyor; üstelik damgalanan satır çağırana görünmez olduğu için Postgres
-- güncellemeyi "yeni satır politikayı ihlal ediyor" diye reddederdi. Yetki o
-- yüzden gövdede: satır `auth_user_org_ids()` ile aranıyor (başka org'un
-- kaydı "bulunamadı" — varlığı bile sızmıyor) ve abonelik kapısı
-- (`has_timeflow_access`, 087) elle soruluyor, çünkü DEFINER RLS'teki o
-- kapıyı da atlıyor.
--
-- ── Uygulama sırası ─────────────────────────────────────────────────────────
-- 1. Bu göç.  2. `staff-api` ve `whatsapp-booking` deploy'u.
-- Ters sırada `visit.collect` var olmayan `voided_at` sütununu sorar ve HER
-- tahsilat `lookup_failed` ile düşer.
-- ============================================================

BEGIN;

-- ── 1) İz alanları ──────────────────────────────────────────────────────────
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS voided_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS voided_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS void_reason    TEXT,
    ADD COLUMN IF NOT EXISTS corrected_from UUID REFERENCES public.payments(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.payments.voided_at IS
    'Dolu = kayıt artık geçerli değil; toplamlara GİRMEZ ve uygulamalara görünmez (111). Satır silinmez.';
COMMENT ON COLUMN public.payments.void_reason IS
    'correction = düzeltildi (yerine yenisi yazıldı) · revert = geri alındı '
    '(adisyon yeniden açıldı). İkisi Kasa''da farklı okunuyor.';
COMMENT ON COLUMN public.payments.corrected_from IS
    'Bu satır bir DÜZELTME ise: damgalanan eski kaydın kimliği. Kasa''daki '
    '"düzeltildi 15:40 · önce ₺1.200" izi buradan kuruluyor.';

-- İki değer, çünkü Kasa ikisini farklı anlatıyor: düzeltilen kaydın yerine
-- yenisi var, geri alınanın yerinde açık bir adisyon var.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_void_reason_check;
ALTER TABLE public.payments
    ADD CONSTRAINT payments_void_reason_check
    CHECK (void_reason IS NULL OR void_reason IN ('correction', 'revert'));

-- Damga ve sebep BİRLİKTE var olur. Sebepsiz bir iptal, altı ay sonra
-- kimsenin açıklayamayacağı bir eksik para demekti.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_void_shape;
ALTER TABLE public.payments
    ADD CONSTRAINT payments_void_shape
    CHECK ((voided_at IS NULL) = (void_reason IS NULL));

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_not_self_corrected;
ALTER TABLE public.payments
    ADD CONSTRAINT payments_not_self_corrected
    CHECK (corrected_from IS DISTINCT FROM id);

-- Silinen bir tahsilatın FK'si bu sütunu tarıyor (ON DELETE SET NULL);
-- indeks olmasa masaüstünün her silmesi tabloyu baştan sona okurdu.
CREATE INDEX IF NOT EXISTS idx_payments_corrected_from
    ON public.payments(corrected_from)
    WHERE corrected_from IS NOT NULL;

-- Kasa'nın iz okuması (`voided_payments`) yalnız damgalı satırlara bakıyor.
CREATE INDEX IF NOT EXISTS idx_payments_voided
    ON public.payments(organization_id, paid_at)
    WHERE voided_at IS NOT NULL;

-- ── 2) Damgalı satır uygulamalara görünmez ──────────────────────────────────
--
-- Politikalar `authenticated` için. service_role ve tablo sahibi RLS'ten
-- geçmiyor: edge function'lar kendi süzgeçlerini taşıyor, aşağıdaki
-- fonksiyonlar da sahibin yetkisiyle çalışıyor.
DROP POLICY IF EXISTS payments_live_select ON public.payments;
CREATE POLICY payments_live_select ON public.payments
    AS RESTRICTIVE FOR SELECT TO authenticated
    USING (voided_at IS NULL);

DROP POLICY IF EXISTS payments_live_insert ON public.payments;
CREATE POLICY payments_live_insert ON public.payments
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (
        voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL
        AND corrected_from IS NULL
    );

DROP POLICY IF EXISTS payments_live_update ON public.payments;
CREATE POLICY payments_live_update ON public.payments
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (voided_at IS NULL)
    WITH CHECK (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL);

DROP POLICY IF EXISTS payments_live_delete ON public.payments;
CREATE POLICY payments_live_delete ON public.payments
    AS RESTRICTIVE FOR DELETE TO authenticated
    USING (voided_at IS NULL);

-- ── 3) 061'in tavanları damgalı satırı saymıyor ─────────────────────────────
--
-- 061'in üç tetikleyici fonksiyonu SECURITY DEFINER; RLS onları etkilemiyor ve
-- damgalı satırı görüyorlar. Süzgeç olmasa:
--   • tek ödemeyle kapanmış ₺10.000'lık bir planın ödemesini ₺9.000'a
--     düzeltmek "10.000 + 9.000 > 10.000" diye reddedilirdi;
--   • geri alınmış bir ödeme, vadeyi silinemez ve planı küçültülemez yapardı.
--
-- Gövdeler 061'den KELİMESİ KELİMESİNE alındı; eklenen her satır `-- 111` ile
-- işaretli. `tests/tek-kasa-izi.test.mjs` işaretli satırları söküp kalanın
-- 061 ile birebir aynı olduğunu doğruluyor — kopya sessizce ayrışamaz.
--
-- Bilerek SÜZÜLMEYENLER: kapsam (org / müşteri / plan) denetimleri. Damgalı
-- satır da o plana ve müşteriye bağlı; bağı koparan bir taşıma onu da
-- yalanlardı.

CREATE OR REPLACE FUNCTION public.enforce_treatment_plan_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    reservation_customer UUID;
    reservation_staff UUID;
    paid_total NUMERIC;
    scheduled_total NUMERIC;
    unscheduled_paid NUMERIC;
BEGIN
    -- staff/reservation ON DELETE SET NULL aksiyonu, parent satır silindikten
    -- sonra nested UPDATE üretir. Yalnız FK'nin tek alanlı NULL'lamasını geç;
    -- doğrudan UPDATE ve başka alanları da değiştiren nested işlemler normal
    -- doğrulamadan kaçamaz.
    IF TG_OP = 'UPDATE' THEN
        IF pg_catalog.pg_trigger_depth() > 1
           AND OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id
           AND OLD.customer_id IS NOT DISTINCT FROM NEW.customer_id
           AND OLD.total_amount IS NOT DISTINCT FROM NEW.total_amount
           AND (
               (
                   OLD.staff_id IS NOT NULL
                   AND NEW.staff_id IS NULL
                   AND OLD.reservation_id IS NOT DISTINCT FROM NEW.reservation_id
                   AND NOT EXISTS (
                       SELECT 1 FROM public.staff AS deleted_staff
                       WHERE deleted_staff.id = OLD.staff_id
                   )
               )
               OR (
                   OLD.reservation_id IS NOT NULL
                   AND NEW.reservation_id IS NULL
                   AND OLD.staff_id IS NOT DISTINCT FROM NEW.staff_id
                   AND NOT EXISTS (
                       SELECT 1 FROM public.reservations AS deleted_reservation
                       WHERE deleted_reservation.id = OLD.reservation_id
                   )
               )
           ) THEN
            RETURN NEW;
        END IF;
    END IF;

    PERFORM 1
    FROM public.customers AS customer
    WHERE customer.id = NEW.customer_id
      AND customer.organization_id = NEW.organization_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'treatment_plan_customer_scope_mismatch',
            DETAIL = pg_catalog.jsonb_build_object(
                'organization_id', NEW.organization_id,
                'customer_id', NEW.customer_id
            )::TEXT;
    END IF;

    IF NEW.staff_id IS NOT NULL THEN
        PERFORM 1
        FROM public.staff AS doctor
        WHERE doctor.id = NEW.staff_id
          AND doctor.organization_id = NEW.organization_id
          AND doctor.role = 'doctor'
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'treatment_plan_staff_scope_or_role_mismatch',
                DETAIL = pg_catalog.jsonb_build_object(
                    'organization_id', NEW.organization_id,
                    'staff_id', NEW.staff_id,
                    'required_role', 'doctor'
                )::TEXT;
        END IF;
    END IF;

    IF NEW.reservation_id IS NOT NULL THEN
        SELECT reservation.customer_id, reservation.staff_id
          INTO reservation_customer, reservation_staff
          FROM public.reservations AS reservation
         WHERE reservation.id = NEW.reservation_id
           AND reservation.organization_id = NEW.organization_id
         FOR SHARE;

        IF NOT FOUND OR reservation_customer IS DISTINCT FROM NEW.customer_id THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'treatment_plan_reservation_scope_mismatch',
                DETAIL = pg_catalog.jsonb_build_object(
                    'organization_id', NEW.organization_id,
                    'customer_id', NEW.customer_id,
                    'reservation_id', NEW.reservation_id
                )::TEXT;
        END IF;

        IF reservation_staff IS NOT NULL AND NOT EXISTS (
            SELECT 1
            FROM public.staff AS reservation_doctor
            WHERE reservation_doctor.id = reservation_staff
              AND reservation_doctor.organization_id = NEW.organization_id
              AND reservation_doctor.role = 'doctor'
        ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'treatment_plan_reservation_staff_role_mismatch',
                DETAIL = pg_catalog.jsonb_build_object(
                    'reservation_id', NEW.reservation_id,
                    'reservation_staff_id', reservation_staff,
                    'required_role', 'doctor'
                )::TEXT;
        END IF;

        IF NEW.staff_id IS NOT NULL
           AND reservation_staff IS NOT NULL
           AND reservation_staff IS DISTINCT FROM NEW.staff_id THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'treatment_plan_staff_reservation_mismatch',
                DETAIL = pg_catalog.jsonb_build_object(
                    'staff_id', NEW.staff_id,
                    'reservation_staff_id', reservation_staff,
                    'reservation_id', NEW.reservation_id
                )::TEXT;
        END IF;
    END IF;

    -- INSERT sırasında plana bağlı child satır bulunamaz. UPDATE satırı zaten
    -- executor tarafından kilitlidir; ödeme/taksit trigger'ları da aynı planı
    -- FOR UPDATE aldığı için toplamlar yarış koşuluna kapalıdır.
    IF TG_OP = 'UPDATE' THEN
        IF (
            OLD.organization_id IS DISTINCT FROM NEW.organization_id
            OR OLD.customer_id IS DISTINCT FROM NEW.customer_id
        ) AND (
            EXISTS (
                SELECT 1 FROM public.payments AS payment
                WHERE payment.treatment_plan_id = NEW.id
            )
            OR EXISTS (
                SELECT 1 FROM public.treatment_installments AS installment
                WHERE installment.treatment_plan_id = NEW.id
            )
            OR EXISTS (
                SELECT 1 FROM public.dental_records AS dental
                WHERE dental.treatment_plan_id = NEW.id
            )
        ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'treatment_plan_scope_change_with_linked_rows',
                DETAIL = pg_catalog.jsonb_build_object(
                    'plan_id', NEW.id,
                    'old_organization_id', OLD.organization_id,
                    'organization_id', NEW.organization_id,
                    'old_customer_id', OLD.customer_id,
                    'customer_id', NEW.customer_id
                )::TEXT;
        END IF;

        SELECT COALESCE(SUM(payment.amount), 0)
          INTO paid_total
          FROM public.payments AS payment
         WHERE payment.treatment_plan_id = NEW.id
           AND payment.voided_at IS NULL;  -- 111: damgalı kayıt para değil

        IF paid_total > NEW.total_amount THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'treatment_plan_total_below_paid',
                DETAIL = pg_catalog.jsonb_build_object(
                    'plan_id', NEW.id,
                    'total_amount', NEW.total_amount,
                    'paid_total', paid_total
                )::TEXT;
        END IF;

        SELECT COALESCE(SUM(installment.amount), 0)
          INTO scheduled_total
          FROM public.treatment_installments AS installment
         WHERE installment.treatment_plan_id = NEW.id;

        SELECT COALESCE(SUM(payment.amount), 0)
          INTO unscheduled_paid
          FROM public.payments AS payment
         WHERE payment.treatment_plan_id = NEW.id
           AND payment.installment_id IS NULL
           AND payment.voided_at IS NULL;  -- 111

        IF scheduled_total + unscheduled_paid > NEW.total_amount THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'treatment_plan_total_below_schedule',
                DETAIL = pg_catalog.jsonb_build_object(
                    'plan_id', NEW.id,
                    'total_amount', NEW.total_amount,
                    'scheduled_total', scheduled_total,
                    'unscheduled_paid', unscheduled_paid
                )::TEXT;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_treatment_installment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    plan_id UUID;
    plan_ids UUID[];
    locked_plan_id UUID;
    plan_org UUID;
    plan_customer UUID;
    plan_total NUMERIC(10,2);
    schedule_total NUMERIC;
    unscheduled_paid NUMERIC;
    installment_paid NUMERIC;
BEGIN
    -- Plan silinirken FK cascade'i child vadeleri siler. İç FK trigger'ının
    -- başlattığı bu DELETE'i serbest bırak; normal doğrudan DELETE aşağıda
    -- ödemeli vadenin silinmesini reddeder.
    IF TG_OP = 'DELETE' THEN
        IF pg_catalog.pg_trigger_depth() > 1
           AND NOT EXISTS (
               SELECT 1 FROM public.treatment_plans AS deleted_plan
               WHERE deleted_plan.id = OLD.treatment_plan_id
           ) THEN
            RETURN OLD;
        END IF;
        plan_ids := ARRAY[OLD.treatment_plan_id]::UUID[];
    ELSIF TG_OP = 'UPDATE' THEN
        plan_ids := ARRAY[OLD.treatment_plan_id, NEW.treatment_plan_id]::UUID[];
    ELSE
        plan_ids := ARRAY[NEW.treatment_plan_id]::UUID[];
    END IF;

    -- UPDATE ile iki plan arasında taşıma yapılırken her iki planı UUID
    -- sırasıyla kilitle. Böylece ters yönlü eş zamanlı taşıma deadlock üretmez.
    FOR locked_plan_id IN
        SELECT DISTINCT candidate.plan_id
        FROM unnest(plan_ids) AS candidate(plan_id)
        WHERE candidate.plan_id IS NOT NULL
        ORDER BY candidate.plan_id
    LOOP
        PERFORM 1
        FROM public.treatment_plans AS locked_plan
        WHERE locked_plan.id = locked_plan_id
        FOR UPDATE;
    END LOOP;

    IF TG_OP = 'DELETE' THEN
        IF EXISTS (
            SELECT 1
            FROM public.payments AS payment
            WHERE payment.installment_id = OLD.id
              AND payment.voided_at IS NULL  -- 111: geri alınmış ödeme vadeyi kilitlemez
        ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'installment_with_payments_cannot_be_deleted',
                DETAIL = pg_catalog.jsonb_build_object(
                    'installment_id', OLD.id,
                    'treatment_plan_id', OLD.treatment_plan_id
                )::TEXT;
        END IF;
        RETURN OLD;
    END IF;

    plan_id := NEW.treatment_plan_id;
    SELECT plan.organization_id, plan.customer_id, plan.total_amount
      INTO plan_org, plan_customer, plan_total
      FROM public.treatment_plans AS plan
     WHERE plan.id = plan_id;

    IF NOT FOUND
       OR plan_org IS DISTINCT FROM NEW.organization_id
       OR plan_customer IS DISTINCT FROM NEW.customer_id THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'installment_plan_scope_mismatch',
            DETAIL = pg_catalog.jsonb_build_object(
                'installment_id', NEW.id,
                'treatment_plan_id', plan_id,
                'organization_id', NEW.organization_id,
                'customer_id', NEW.customer_id
            )::TEXT;
    END IF;

    PERFORM 1
    FROM public.customers AS customer
    WHERE customer.id = NEW.customer_id
      AND customer.organization_id = NEW.organization_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'installment_customer_scope_mismatch' USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(SUM(payment.amount), 0)
      INTO installment_paid
      FROM public.payments AS payment
     WHERE payment.installment_id = NEW.id
       AND payment.voided_at IS NULL;  -- 111

    IF EXISTS (
        SELECT 1
        FROM public.payments AS payment
        WHERE payment.installment_id = NEW.id
          AND (
              payment.treatment_plan_id IS DISTINCT FROM NEW.treatment_plan_id
              OR payment.organization_id IS DISTINCT FROM NEW.organization_id
              OR payment.customer_id IS DISTINCT FROM NEW.customer_id
          )
    ) THEN
        RAISE EXCEPTION 'installment_payment_scope_mismatch' USING ERRCODE = '23514';
    END IF;

    IF installment_paid > NEW.amount THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'installment_amount_below_paid',
            DETAIL = pg_catalog.jsonb_build_object(
                'installment_id', NEW.id,
                'amount', NEW.amount,
                'paid_total', installment_paid
            )::TEXT;
    END IF;

    SELECT COALESCE(SUM(installment.amount), 0) + NEW.amount
      INTO schedule_total
      FROM public.treatment_installments AS installment
     WHERE installment.treatment_plan_id = NEW.treatment_plan_id
       AND installment.id IS DISTINCT FROM NEW.id;

    SELECT COALESCE(SUM(payment.amount), 0)
      INTO unscheduled_paid
      FROM public.payments AS payment
     WHERE payment.treatment_plan_id = NEW.treatment_plan_id
       AND payment.installment_id IS NULL
       AND payment.voided_at IS NULL;  -- 111

    IF schedule_total + unscheduled_paid > plan_total THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'treatment_schedule_exceeds_plan_balance',
            DETAIL = pg_catalog.jsonb_build_object(
                'plan_id', NEW.treatment_plan_id,
                'plan_total', plan_total,
                'schedule_total', schedule_total,
                'unscheduled_paid', unscheduled_paid
            )::TEXT;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_treatment_payment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    plan_ids UUID[];
    locked_plan_id UUID;
    plan_org UUID;
    plan_customer UUID;
    plan_total NUMERIC(10,2);
    reservation_customer UUID;
    installment_plan UUID;
    installment_org UUID;
    installment_customer UUID;
    installment_amount NUMERIC(10,2);
    already_paid NUMERIC;
BEGIN
    -- ON DELETE SET NULL FK aksiyonları nested trigger olarak çalışır. Plan
    -- veya vade silinirken iki ayrı FK'nin NULL güncellemeleri geçici olarak
    -- farklı sırada görülebilir; yalnız bu dar cascade durumunu serbest bırak.
    IF TG_OP = 'UPDATE' THEN
        IF pg_catalog.pg_trigger_depth() > 1 THEN
            IF OLD.treatment_plan_id IS NOT NULL
               AND NEW.treatment_plan_id IS NULL
               AND OLD.installment_id IS NOT DISTINCT FROM NEW.installment_id
               AND OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id
               AND OLD.customer_id IS NOT DISTINCT FROM NEW.customer_id
               AND OLD.reservation_id IS NOT DISTINCT FROM NEW.reservation_id
               AND OLD.product_id IS NOT DISTINCT FROM NEW.product_id
               AND OLD.staff_id IS NOT DISTINCT FROM NEW.staff_id
               AND OLD.amount IS NOT DISTINCT FROM NEW.amount
               AND NOT EXISTS (
                   SELECT 1 FROM public.treatment_plans AS deleted_plan
                   WHERE deleted_plan.id = OLD.treatment_plan_id
               ) THEN
                RETURN NEW;
            END IF;

            IF OLD.installment_id IS NOT NULL
               AND NEW.installment_id IS NULL
               AND OLD.treatment_plan_id IS NOT DISTINCT FROM NEW.treatment_plan_id
               AND OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id
               AND OLD.customer_id IS NOT DISTINCT FROM NEW.customer_id
               AND OLD.reservation_id IS NOT DISTINCT FROM NEW.reservation_id
               AND OLD.product_id IS NOT DISTINCT FROM NEW.product_id
               AND OLD.staff_id IS NOT DISTINCT FROM NEW.staff_id
               AND OLD.amount IS NOT DISTINCT FROM NEW.amount
               AND NOT EXISTS (
                   SELECT 1 FROM public.treatment_installments AS deleted_installment
                   WHERE deleted_installment.id = OLD.installment_id
               ) THEN
                RETURN NEW;
            END IF;
        END IF;
        plan_ids := ARRAY[OLD.treatment_plan_id, NEW.treatment_plan_id]::UUID[];
    ELSE
        plan_ids := ARRAY[NEW.treatment_plan_id]::UUID[];
    END IF;

    -- UPDATE A planından B planına taşınabiliyorsa ikisini de aynı sırada
    -- kilitle. Bu plan-row lock aynı plana paralel ödemeleri atomik serileştirir.
    FOR locked_plan_id IN
        SELECT DISTINCT candidate.plan_id
        FROM unnest(plan_ids) AS candidate(plan_id)
        WHERE candidate.plan_id IS NOT NULL
        ORDER BY candidate.plan_id
    LOOP
        PERFORM 1
        FROM public.treatment_plans AS locked_plan
        WHERE locked_plan.id = locked_plan_id
        FOR UPDATE;
    END LOOP;

    -- Planlı veya plansız bütün tahsilatlarda doğrudan tenant çapraz bağlarını
    -- engelle. Payments.staff_id kasa/personel atfı olabileceği için doctor
    -- rolü şartı burada özellikle uygulanmaz.
    IF NEW.customer_id IS NOT NULL THEN
        PERFORM 1
        FROM public.customers AS customer
        WHERE customer.id = NEW.customer_id
          AND customer.organization_id = NEW.organization_id
        FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'payment_scope_mismatch' USING
                ERRCODE = '23514',
                DETAIL = pg_catalog.jsonb_build_object('relation', 'customer', 'id', NEW.customer_id)::TEXT;
        END IF;
    END IF;

    IF NEW.staff_id IS NOT NULL THEN
        PERFORM 1
        FROM public.staff AS payment_staff
        WHERE payment_staff.id = NEW.staff_id
          AND payment_staff.organization_id = NEW.organization_id
        FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'payment_scope_mismatch' USING
                ERRCODE = '23514',
                DETAIL = pg_catalog.jsonb_build_object('relation', 'staff', 'id', NEW.staff_id)::TEXT;
        END IF;
    END IF;

    IF NEW.reservation_id IS NOT NULL THEN
        SELECT reservation.customer_id
          INTO reservation_customer
          FROM public.reservations AS reservation
         WHERE reservation.id = NEW.reservation_id
           AND reservation.organization_id = NEW.organization_id
         FOR SHARE;
        IF NOT FOUND
           OR (NEW.customer_id IS NOT NULL AND reservation_customer IS DISTINCT FROM NEW.customer_id) THEN
            RAISE EXCEPTION 'payment_scope_mismatch' USING
                ERRCODE = '23514',
                DETAIL = pg_catalog.jsonb_build_object('relation', 'reservation', 'id', NEW.reservation_id)::TEXT;
        END IF;
    END IF;

    IF NEW.product_id IS NOT NULL THEN
        PERFORM 1
        FROM public.products AS product
        WHERE product.id = NEW.product_id
          AND product.organization_id = NEW.organization_id
        FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'payment_scope_mismatch' USING
                ERRCODE = '23514',
                DETAIL = pg_catalog.jsonb_build_object('relation', 'product', 'id', NEW.product_id)::TEXT;
        END IF;
    END IF;

    -- 111 · DAMGALI SATIR PARA DEĞİL, aşağıdaki plan ve vade tavanlarına
    -- 111   girmiyor. Damgalı satırı yalnız bir FK zinciri günceller (silinen
    -- 111   personel ya da ürün → SET NULL); onu tavana sokmak o silmeyi
    -- 111   "plan bakiyesi aşıldı" diye düşürürdü. Kapsam denetimleri yukarıda.
    IF NEW.voided_at IS NOT NULL THEN  -- 111
        RETURN NEW;  -- 111
    END IF;  -- 111

    IF NEW.installment_id IS NOT NULL AND NEW.treatment_plan_id IS NULL THEN
        RAISE EXCEPTION 'installment_payment_scope_mismatch' USING ERRCODE = '23514';
    END IF;

    IF NEW.treatment_plan_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.amount <= 0 THEN
        RAISE EXCEPTION 'plan_payment_amount_must_be_positive' USING ERRCODE = '23514';
    END IF;

    SELECT plan.organization_id, plan.customer_id, plan.total_amount
      INTO plan_org, plan_customer, plan_total
      FROM public.treatment_plans AS plan
     WHERE plan.id = NEW.treatment_plan_id;

    IF NOT FOUND
       OR plan_org IS DISTINCT FROM NEW.organization_id
       OR plan_customer IS DISTINCT FROM NEW.customer_id THEN
        RAISE EXCEPTION 'payment_scope_mismatch' USING
            ERRCODE = '23514',
            DETAIL = pg_catalog.jsonb_build_object(
                'relation', 'treatment_plan',
                'id', NEW.treatment_plan_id
            )::TEXT;
    END IF;

    IF NEW.installment_id IS NULL AND EXISTS (
        SELECT 1
        FROM public.treatment_installments AS installment
        WHERE installment.treatment_plan_id = NEW.treatment_plan_id
    ) THEN
        RAISE EXCEPTION 'plan_payment_requires_installment' USING ERRCODE = '23514';
    END IF;

    SELECT installment.treatment_plan_id,
           installment.organization_id,
           installment.customer_id,
           installment.amount
      INTO installment_plan, installment_org, installment_customer, installment_amount
      FROM public.treatment_installments AS installment
     WHERE installment.id = NEW.installment_id;

    IF NEW.installment_id IS NOT NULL THEN
        IF NOT FOUND
           OR installment_plan IS DISTINCT FROM NEW.treatment_plan_id
           OR installment_org IS DISTINCT FROM NEW.organization_id
           OR installment_customer IS DISTINCT FROM NEW.customer_id THEN
            RAISE EXCEPTION 'installment_payment_scope_mismatch' USING ERRCODE = '23514';
        END IF;

        SELECT COALESCE(SUM(payment.amount), 0)
          INTO already_paid
          FROM public.payments AS payment
         WHERE payment.installment_id = NEW.installment_id
           AND payment.id IS DISTINCT FROM NEW.id
           AND payment.voided_at IS NULL;  -- 111

        IF already_paid + NEW.amount > installment_amount THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'installment_payment_exceeds_balance',
                DETAIL = pg_catalog.jsonb_build_object(
                    'installment_id', NEW.installment_id,
                    'installment_amount', installment_amount,
                    'already_paid', already_paid,
                    'requested_amount', NEW.amount
                )::TEXT;
        END IF;
    END IF;

    SELECT COALESCE(SUM(payment.amount), 0)
      INTO already_paid
      FROM public.payments AS payment
     WHERE payment.treatment_plan_id = NEW.treatment_plan_id
       AND payment.id IS DISTINCT FROM NEW.id
       AND payment.voided_at IS NULL;  -- 111

    IF already_paid + NEW.amount > plan_total THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'plan_payment_exceeds_balance',
            DETAIL = pg_catalog.jsonb_build_object(
                'plan_id', NEW.treatment_plan_id,
                'plan_total', plan_total,
                'already_paid', already_paid,
                'requested_amount', NEW.amount
            )::TEXT;
    END IF;

    RETURN NEW;
END;
$function$;

-- ── 4) Düzelt ───────────────────────────────────────────────────────────────
--
-- Eskiyi damgalar, yenisini yazar, yeni kaydın kimliğini döner.
--
-- `paid_at` KORUNUYOR: tahsilat 13:05'te alındı ve düzeltme bunu değiştirmez.
-- Liste yerinde kalır, saat 13:05 kalır. Düzeltmenin KENDİ saati yeni satırın
-- `created_at`inde duruyor ve iz oradan okunuyor. Tersini yapmak, geçmiş bir
-- günün tahsilatını düzeltince parayı bugüne taşımak olurdu.
--
-- YENİ SATIR ESKİSİNİN TAM KOPYASI. Sütunlar tek tek yazılmıyor: ilk taslak
-- elle bir liste yazıyordu ve `installment_id`yi (059) unutmuştu — taksitli
-- bir planın ödemesini düzeltmek 061'in `plan_payment_requires_installment`
-- hatasına çarpardı. Kopya artık satırın kendisinden (`to_jsonb`) alınıyor;
-- yarın eklenecek bir sütun da kendiliğinden taşınıyor. Üzerine yazılan
-- alanlar yalnız düzeltmeyi tanımlayanlar: kimlik, tutar, yöntem, kaydın
-- yazıldığı an ve yazan, iz.
CREATE OR REPLACE FUNCTION public.correct_payment(
    p_payment UUID,
    p_amount  NUMERIC,
    p_method  TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    v_old    public.payments%ROWTYPE;
    v_amount NUMERIC;
    v_new    UUID;
BEGIN
    -- FOR UPDATE: iki telefon aynı anda düzeltmeye kalkarsa ikincisi
    -- birincinin damgasını görür ve `already_voided` alır.
    SELECT payment.* INTO v_old
      FROM public.payments AS payment
     WHERE payment.id = p_payment
       AND payment.organization_id IN (SELECT public.auth_user_org_ids())
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF public.has_timeflow_access(v_old.organization_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'subscription_inactive' USING ERRCODE = '42501';
    END IF;
    IF v_old.voided_at IS NOT NULL THEN
        RAISE EXCEPTION 'already_voided' USING ERRCODE = 'P0001';
    END IF;

    -- Kuruş, sütunun kendi ölçeğinde. 1200.004 "değişti" sayılıp 1200.00
    -- yazılsaydı hiçbir şeyi değiştirmeyen bir düzeltme kayda geçerdi.
    v_amount := round(p_amount, 2);
    IF v_amount IS NULL OR v_amount <= 0 THEN
        -- Sıfır lira bir tahsilat değil. Yapılacak şey düzeltme değil GERİ ALMA.
        RAISE EXCEPTION 'zero_amount' USING ERRCODE = 'P0001';
    END IF;
    -- Seçicide üç yöntem var. Masaüstünün yazdığı `other` olduğu gibi
    -- KALABİLİR (yalnız tutar düzeltiliyorsa), ama ona geçilemez.
    IF p_method IS NULL
       OR (p_method NOT IN ('cash', 'card', 'transfer') AND p_method IS DISTINCT FROM v_old.method) THEN
        RAISE EXCEPTION 'bad_method' USING ERRCODE = 'P0001';
    END IF;
    IF v_amount = v_old.amount AND p_method = v_old.method THEN
        -- Düzeltme olmayan bir düzeltme: kasaya iki satır ekleyip hiçbir
        -- şeyi değiştirmezdi.
        RAISE EXCEPTION 'no_change' USING ERRCODE = 'P0001';
    END IF;

    -- ÖNCE DAMGA: 061'in tavanı yeni satırı sayarken eskisini artık saymıyor.
    -- Ters sırada, tam ödenmiş bir planın ödemesini KÜÇÜLTMEK bile "plan
    -- bakiyesi aşıldı" diye reddedilirdi.
    UPDATE public.payments
       SET voided_at   = now(),
           voided_by   = auth.uid(),
           void_reason = 'correction'
     WHERE id = v_old.id;

    INSERT INTO public.payments
    SELECT copy.*
      FROM jsonb_populate_record(
               NULL::public.payments,
               to_jsonb(v_old) || jsonb_build_object(
                   'id',             gen_random_uuid(),
                   'amount',         v_amount,
                   'method',         p_method,
                   'created_at',     now(),
                   'created_by',     auth.uid(),
                   'voided_at',      NULL,
                   'voided_by',      NULL,
                   'void_reason',    NULL,
                   'corrected_from', v_old.id
               )
           ) AS copy
    RETURNING id INTO v_new;

    RETURN v_new;
END;
$function$;

-- ── 5) Geri al ──────────────────────────────────────────────────────────────
--
-- Tahsilatı damgalar ve adisyonu YENİDEN AÇAR. Ekranın sözü bu:
-- "Adisyon yeniden açılır" — Gün'de G4 kartına döner.
CREATE OR REPLACE FUNCTION public.revert_payment(p_payment UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    v_old public.payments%ROWTYPE;
BEGIN
    SELECT payment.* INTO v_old
      FROM public.payments AS payment
     WHERE payment.id = p_payment
       AND payment.organization_id IN (SELECT public.auth_user_org_ids())
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF public.has_timeflow_access(v_old.organization_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'subscription_inactive' USING ERRCODE = '42501';
    END IF;
    IF v_old.voided_at IS NOT NULL THEN
        RAISE EXCEPTION 'already_voided' USING ERRCODE = 'P0001';
    END IF;

    -- RANDEVU KİLİTLENİYOR. Bölünmüş bir adisyonun iki parçası aynı anda geri
    -- alınırsa ikisi de ötekini "hâlâ canlı" görüp bayrağı düşürmezdi ve
    -- parasız bir "ödendi" kalırdı. Kilitle ikincisi birincinin damgasını
    -- görerek karar veriyor.
    IF v_old.reservation_id IS NOT NULL THEN
        PERFORM 1
          FROM public.reservations AS reservation
         WHERE reservation.id = v_old.reservation_id
           FOR UPDATE;
    END IF;

    UPDATE public.payments
       SET voided_at   = now(),
           voided_by   = auth.uid(),
           void_reason = 'revert'
     WHERE id = v_old.id;

    /*
     * `is_paid` YALNIZ başka canlı tahsilat kalmadıysa düşüyor.
     *
     * Bir adisyon bölünerek ödenebiliyor (yarısı nakit, yarısı kart). Birini
     * geri alıp bayrağı düşürmek, hâlâ parası olan bir randevuyu kasada
     * "ödenmedi" göstermek olurdu.
     */
    IF v_old.reservation_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM public.payments AS payment
         WHERE payment.reservation_id = v_old.reservation_id
           AND payment.voided_at IS NULL
    ) THEN
        UPDATE public.reservations
           SET is_paid = false
         WHERE id = v_old.reservation_id;
    END IF;
END;
$function$;

-- ── 6) İzi oku ──────────────────────────────────────────────────────────────
--
-- Damgalı satırlar uygulamalara görünmüyor (2. bölüm); Kasa'nın izi —
-- "düzeltildi 15:40 · önce ₺1.200", "geri alındı 15:40" — onları ancak
-- buradan okuyabiliyor. Dönem `paid_at` ile seçiliyor, iki uç dahil: Kasa'nın
-- kendi sorgusuyla AYNI pencere. Satır, tahsilatın alındığı günde durur.
CREATE OR REPLACE FUNCTION public.voided_payments(
    p_org  UUID,
    p_from TIMESTAMPTZ,
    p_to   TIMESTAMPTZ
)
RETURNS SETOF public.payments
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
    SELECT payment.*
      FROM public.payments AS payment
     WHERE payment.organization_id = p_org
       AND p_org IN (SELECT public.auth_user_org_ids())
       AND payment.voided_at IS NOT NULL
       AND payment.paid_at >= p_from
       AND payment.paid_at <= p_to
     ORDER BY payment.paid_at, payment.id;
$function$;

-- ── 7) Yetki ────────────────────────────────────────────────────────────────
--
-- `from public` TEK BAŞINA YETMİYOR (094'ün dersi): Supabase'in varsayılan
-- ayrıcalıkları yeni fonksiyona anon, authenticated ve service_role için
-- AÇIK izin veriyor. Hepsi sökülüyor, yalnız `authenticated` geri alıyor.
-- Gövdeler `auth_user_org_ids()` ile zaten kapalı; bu ikinci kilit.
REVOKE ALL ON FUNCTION public.correct_payment(UUID, NUMERIC, TEXT)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.correct_payment(UUID, NUMERIC, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.revert_payment(UUID)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revert_payment(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.voided_payments(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voided_payments(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── Doğrulama (uygulamadan sonra) ───────────────────────────────────────────
-- Davranış: supabase/tests/kasa_duzeltme_regression.sql (işlem içinde koşar,
-- sonunda her şeyi geri sarar). Hızlı bakış:
--
--   select policyname, permissive, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'payments' order by policyname;
--   → payments_org_access PERMISSIVE ALL + dört payments_live_* RESTRICTIVE
--
--   select proname, prosecdef, proacl from pg_proc
--    where proname in ('correct_payment', 'revert_payment', 'voided_payments');
--   → üçü de prosecdef = t; proacl'de anon YOK
--
-- ── Geri alma ───────────────────────────────────────────────────────────────
-- Hiçbir telefon Düzelt / Geri al kullanmadıysa sütunlar boş ve politikalar
-- hiçbir satırı gizlemiyor: göç zararsız biçimde yerinde kalabilir. Gerekirse:
--   drop policy payments_live_select on public.payments;  (…_insert, _update, _delete)
--   drop function public.correct_payment(uuid, numeric, text);
--   drop function public.revert_payment(uuid);
--   drop function public.voided_payments(uuid, timestamptz, timestamptz);
--   061'in üç fonksiyon bloğu 061 dosyasından yeniden çalıştırılır.
-- Damga basılmışsa politikaları düşürmek damgalı satırları yeniden GÖRÜNÜR
-- yapar ve toplamlar ikiye katlanır — önce `voided_at` dolu satırlara bakın.
