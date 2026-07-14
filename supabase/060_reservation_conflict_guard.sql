-- ============================================================
-- TimeFlow Migration 060: Sunucu tarafı randevu çakışma koruması
-- ============================================================
-- UI'daki uygunluk kontrolü kullanıcıya hızlı geri bildirim verir; fakat iki
-- cihaz aynı anda kayıt yaptığında tek başına yeterli değildir. Bu trigger,
-- doğrudan API/Edge Function yazımları dahil bütün INSERT/UPDATE işlemlerinde:
--   * aynı personelin (NULL ise ortak "atanmamış" havuzun) üst üste binmesini,
--   * fiziksel kaynak kapasitesinin aşılmasını
-- veritabanında ve transaction seviyesinde engeller.
--
-- Zaman aralıkları [başlangıç, bitiş) olarak ele alınır. Yani 09:00-09:30 ile
-- 09:30-10:00 çakışmaz. end_date doluysa çok günlük aralık da hesaba katılır.
-- Migration mevcut veriyi yeniden yazmaz; guard bundan sonraki doluluk
-- değiştiren yazımları korur. Eski çakışmalar ayrıca raporlanıp temizlenebilir.
-- ============================================================

BEGIN;

-- Çakışma sorgularının önce tenant + personel/kaynak + gün üzerinden daralması
-- için kısmi indeksler. İptal edilen kayıtlar hiçbir kapasiteyi tüketmez.
CREATE INDEX IF NOT EXISTS idx_reservations_active_staff_interval
    ON public.reservations (
        organization_id,
        staff_id,
        date,
        start_time,
        end_time
    )
    WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_reservations_active_resource_interval
    ON public.reservations (
        organization_id,
        resource_id,
        date,
        start_time,
        end_time
    )
    WHERE status <> 'cancelled' AND resource_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_reservation_conflicts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old_active       BOOLEAN := FALSE;
    v_new_active       BOOLEAN := FALSE;
    v_lock_keys        TEXT[] := ARRAY[]::TEXT[];
    v_lock_key         TEXT;
    v_staff_ids        UUID[] := ARRAY[]::UUID[];
    v_staff_id         UUID;
    v_resource_ids     UUID[] := ARRAY[]::UUID[];
    v_resource_id      UUID;
    v_start_at         TIMESTAMP WITHOUT TIME ZONE;
    v_end_at           TIMESTAMP WITHOUT TIME ZONE;
    v_requested_range  TSRANGE;
    v_conflict_id      UUID;
    v_resource_capacity INTEGER;
    v_overlap_count    INTEGER;
BEGIN
    -- INSERT trigger'ında OLD, DELETE trigger'ında NEW tanımsızdır; alanlara
    -- yalnız ilgili operasyon dalında erişmek gerekir.
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_old_active := OLD.status <> 'cancelled';
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_new_active := NEW.status <> 'cancelled';
    END IF;

    -- FK yalnız satırın varlığını doğrular; tenant eşleşmesini doğrulamaz.
    -- Bunu kilitlerden önce yapmak, başka bir tenant'a ait tahmin edilmiş UUID
    -- üzerinden gereksiz parent-row kilidi alınmasını da önler.
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.customer_id IS NOT NULL AND NOT EXISTS (
            SELECT 1
            FROM public.customers AS scoped_customer
            WHERE scoped_customer.id = NEW.customer_id
              AND scoped_customer.organization_id = NEW.organization_id
        ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'reservation_customer_scope_mismatch',
                DETAIL = jsonb_build_object(
                    'organization_id', NEW.organization_id,
                    'customer_id', NEW.customer_id
                )::TEXT;
        END IF;

        IF NEW.staff_id IS NOT NULL AND NOT EXISTS (
            SELECT 1
            FROM public.staff AS scoped_staff
            WHERE scoped_staff.id = NEW.staff_id
              AND scoped_staff.organization_id = NEW.organization_id
        ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'reservation_staff_scope_mismatch',
                DETAIL = jsonb_build_object(
                    'organization_id', NEW.organization_id,
                    'staff_id', NEW.staff_id
                )::TEXT;
        END IF;

        IF NEW.resource_id IS NOT NULL AND NOT EXISTS (
            SELECT 1
            FROM public.resources AS scoped_resource
            WHERE scoped_resource.id = NEW.resource_id
              AND scoped_resource.organization_id = NEW.organization_id
        ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'reservation_resource_scope_mismatch',
                DETAIL = jsonb_build_object(
                    'organization_id', NEW.organization_id,
                    'resource_id', NEW.resource_id
                )::TEXT;
        END IF;
    END IF;

    -- Tenant bağları yukarıda her UPDATE'te doğrulandı. Doluluğu belirleyen
    -- alanlar değişmediyse mevcut kaydı tekrar çakışma taramasına sokma.
    -- customer_id özellikle doluluk alanı değildir: eski bir randevuyu hastaya
    -- bağlamak, aynı saatteki legacy çakışma yüzünden reddedilmemelidir.
    -- cancelled -> aktif geçiş ise v_old_active/v_new_active farkıyla aşağıdaki
    -- atomik kontrolden geçmeye devam eder.
    IF TG_OP = 'UPDATE'
       AND v_old_active = v_new_active
       AND OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id
       AND OLD.staff_id        IS NOT DISTINCT FROM NEW.staff_id
       AND OLD.resource_id     IS NOT DISTINCT FROM NEW.resource_id
       AND OLD.date            IS NOT DISTINCT FROM NEW.date
       AND OLD.end_date        IS NOT DISTINCT FROM NEW.end_date
       AND OLD.start_time      IS NOT DISTINCT FROM NEW.start_time
       AND OLD.end_time        IS NOT DISTINCT FROM NEW.end_time THEN
        RETURN NEW;
    END IF;

    -- İptal edilmiş bir satır eklemek doluluğu değiştirmez.
    IF TG_OP = 'INSERT' AND NOT v_new_active THEN
        RETURN NEW;
    END IF;

    -- FK parent satırlarını BEFORE trigger içinde önce kilitlemek, bir personel
    -- veya kaynak silinirken sonradan çalışan FK kontrolüyle ters sıra
    -- oluşmasını önler. Personelde KEY SHARE paralel randevuları engellemez;
    -- asıl serileştirme aşağıdaki advisory anahtarla yapılır.
    IF v_old_active THEN
        IF OLD.staff_id IS NOT NULL THEN
            v_staff_ids := array_append(v_staff_ids, OLD.staff_id);
        END IF;
    END IF;
    IF v_new_active THEN
        IF NEW.staff_id IS NOT NULL THEN
            v_staff_ids := array_append(v_staff_ids, NEW.staff_id);
        END IF;
    END IF;

    FOR v_staff_id IN
        SELECT DISTINCT staff_id
        FROM unnest(v_staff_ids) AS locked_staff(staff_id)
        ORDER BY staff_id
    LOOP
        PERFORM 1
        FROM public.staff AS locked_staff_row
        WHERE locked_staff_row.id = v_staff_id
        FOR KEY SHARE;
    END LOOP;

    -- Fiziksel kaynakların gerçek satırlarını UUID sırasıyla kilitleriz. Bu hem
    -- aynı kaynağın capacity sayımını seri hale getirir hem de eş zamanlı bir
    -- capacity güncellemesi/silme ile ters kilit sırası oluşmasını önler.
    IF v_old_active THEN
        IF OLD.resource_id IS NOT NULL THEN
            v_resource_ids := array_append(v_resource_ids, OLD.resource_id);
        END IF;
    END IF;
    IF v_new_active THEN
        IF NEW.resource_id IS NOT NULL THEN
            v_resource_ids := array_append(v_resource_ids, NEW.resource_id);
        END IF;
    END IF;

    FOR v_resource_id IN
        SELECT DISTINCT resource_id
        FROM unnest(v_resource_ids) AS locked_resources(resource_id)
        ORDER BY resource_id
    LOOP
        PERFORM 1
        FROM public.resources AS locked_resource
        WHERE locked_resource.id = v_resource_id
        FOR UPDATE;
    END LOOP;

    -- Eski ve yeni personel doluluk anahtarlarını aynı alfabetik sırayla
    -- kilitlemek, eş zamanlı taşıma/silme/ekleme işlemlerinde yarış koşulunu ve
    -- ters kilit sırasından doğan deadlock riskini önler. Advisory kilitler
    -- transaction bitince otomatik bırakılır. NULL personel de organizasyona
    -- ait tek bir "atanmamış" doluluk anahtarına sahiptir.
    IF v_old_active THEN
        v_lock_keys := array_append(
            v_lock_keys,
            format(
                'timeflow:reservation:staff:%s:%s',
                OLD.organization_id,
                COALESCE(OLD.staff_id::TEXT, 'unassigned')
            )
        );
    END IF;

    IF v_new_active THEN
        v_lock_keys := array_append(
            v_lock_keys,
            format(
                'timeflow:reservation:staff:%s:%s',
                NEW.organization_id,
                COALESCE(NEW.staff_id::TEXT, 'unassigned')
            )
        );
    END IF;

    FOR v_lock_key IN
        SELECT DISTINCT key_value
        FROM unnest(v_lock_keys) AS locks(key_value)
        ORDER BY key_value
    LOOP
        PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(v_lock_key, 0)
        );
    END LOOP;

    -- DELETE veya aktif -> cancelled geçişinde yeni bir doluluk yoktur. Eski
    -- anahtarın kilidini almak, aynı anda gelen yeni kaydın commit sonrasındaki
    -- güncel durumu görmesini sağlar.
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    IF NOT v_new_active THEN
        RETURN NEW;
    END IF;

    v_start_at := NEW.date + NEW.start_time;
    v_end_at := COALESCE(NEW.end_date, NEW.date) + NEW.end_time;

    IF v_end_at <= v_start_at THEN
        RAISE EXCEPTION USING
            ERRCODE = '22007',
            MESSAGE = 'reservation_invalid_interval',
            DETAIL = jsonb_build_object(
                'date', NEW.date,
                'end_date', NEW.end_date,
                'start_time', NEW.start_time,
                'end_time', NEW.end_time
            )::TEXT;
    END IF;

    v_requested_range := tsrange(v_start_at, v_end_at, '[)');

    -- staff/resource FK'leri tek başına tenant eşleşmesini garanti etmez.
    IF NEW.staff_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.staff AS s
        WHERE s.id = NEW.staff_id
          AND s.organization_id = NEW.organization_id
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'reservation_staff_scope_mismatch',
            DETAIL = jsonb_build_object(
                'organization_id', NEW.organization_id,
                'staff_id', NEW.staff_id
            )::TEXT;
    END IF;

    SELECT r.id
      INTO v_conflict_id
      FROM public.reservations AS r
     WHERE r.organization_id = NEW.organization_id
       AND r.id IS DISTINCT FROM NEW.id
       AND r.status <> 'cancelled'
       AND r.staff_id IS NOT DISTINCT FROM NEW.staff_id
       -- Ön filtre indeks kullanımını kolaylaştırır; CASE ise bozuk legacy
       -- aralığın tsrange oluştururken bütün sorguyu düşürmesini engeller.
       AND r.date <= COALESCE(NEW.end_date, NEW.date)
       AND COALESCE(r.end_date, r.date) >= NEW.date
       AND CASE
            WHEN COALESCE(r.end_date, r.date) + r.end_time
                   > r.date + r.start_time
            THEN tsrange(
                    r.date + r.start_time,
                    COALESCE(r.end_date, r.date) + r.end_time,
                    '[)'
                 ) && v_requested_range
            ELSE FALSE
           END
     ORDER BY r.date, r.start_time, r.id
     LIMIT 1;

    IF v_conflict_id IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '23P01',
            MESSAGE = 'reservation_staff_conflict',
            DETAIL = jsonb_build_object(
                'conflicting_reservation_id', v_conflict_id,
                'organization_id', NEW.organization_id,
                'staff_id', NEW.staff_id,
                'date', NEW.date,
                'end_date', NEW.end_date,
                'start_time', NEW.start_time,
                'end_time', NEW.end_time
            )::TEXT,
            HINT = 'Choose a different staff member or time range.';
    END IF;

    IF NEW.resource_id IS NOT NULL THEN
        SELECT GREATEST(1, res.capacity)
          INTO v_resource_capacity
          FROM public.resources AS res
         WHERE res.id = NEW.resource_id
           AND res.organization_id = NEW.organization_id;

        IF v_resource_capacity IS NULL THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'reservation_resource_scope_mismatch',
                DETAIL = jsonb_build_object(
                    'organization_id', NEW.organization_id,
                    'resource_id', NEW.resource_id
                )::TEXT;
        END IF;

        SELECT COUNT(*)::INTEGER,
               (array_agg(r.id ORDER BY r.date, r.start_time, r.id))[1]
          INTO v_overlap_count, v_conflict_id
          FROM public.reservations AS r
         WHERE r.organization_id = NEW.organization_id
           AND r.id IS DISTINCT FROM NEW.id
           AND r.status <> 'cancelled'
           AND r.resource_id = NEW.resource_id
           AND r.date <= COALESCE(NEW.end_date, NEW.date)
           AND COALESCE(r.end_date, r.date) >= NEW.date
           AND CASE
                WHEN COALESCE(r.end_date, r.date) + r.end_time
                       > r.date + r.start_time
                THEN tsrange(
                        r.date + r.start_time,
                        COALESCE(r.end_date, r.date) + r.end_time,
                        '[)'
                     ) && v_requested_range
                ELSE FALSE
               END;

        IF v_overlap_count >= v_resource_capacity THEN
            RAISE EXCEPTION USING
                ERRCODE = '23P01',
                MESSAGE = 'reservation_resource_conflict',
                DETAIL = jsonb_build_object(
                    'conflicting_reservation_id', v_conflict_id,
                    'organization_id', NEW.organization_id,
                    'resource_id', NEW.resource_id,
                    'capacity', v_resource_capacity,
                    'overlapping_reservations', v_overlap_count,
                    'date', NEW.date,
                    'end_date', NEW.end_date,
                    'start_time', NEW.start_time,
                    'end_time', NEW.end_time
                )::TEXT,
                HINT = 'Choose another resource/time or increase capacity.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservations_conflict_guard ON public.reservations;
CREATE TRIGGER trg_reservations_conflict_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.reservations
    FOR EACH ROW EXECUTE FUNCTION public.enforce_reservation_conflicts();

COMMIT;

NOTIFY pgrst, 'reload schema';
