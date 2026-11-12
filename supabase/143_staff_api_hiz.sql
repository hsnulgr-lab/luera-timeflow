-- ============================================================
-- 143 · staff-api hızı (Hız 3 · 2026-11-12)
-- ============================================================
-- Yeniden çalıştırılabilir. Önce bu göç, SONRA staff-api yüklenir (staff-api
-- göçten önce yüklenirse `customers` eski yola düşer — kırılmaz).
--
-- 1) staff_customer_book — personelin müşteri defteri listesi.
--    Önceden staff-api org'un 24 aylık BÜTÜN rezervasyonlarını (her birinin
--    `formula` JSON'u dahil) fonksiyona taşıyıp "son geliş"i JavaScript'te
--    buluyordu. Şimdi müşteri başına TEK satır dönüyor: son ziyaret (tarih,
--    hizmet, personel), formül var mı (boolean) ve telefonun son dört hanesi
--    (numaranın kendisi veritabanından çıkmıyor).
--
--    İndeks EKLENMEDİ — gerekenler zaten var:
--      idx_reservations_org_customer_date (092) (organization_id, customer_id, date DESC)
--          WHERE customer_id IS NOT NULL      → müşteri başına son ziyaret
--      reservations_customer_formula_idx  (090) aynı üçlü WHERE formula IS NOT NULL
--                                             → "formülü var mı"
--
--    SECURITY INVOKER (varsayılan): çağıran service_role zaten RLS'i aşıyor;
--    izin bir gün yanlışlıkla açılsa bile fonksiyon RLS'in arkasında kalır.
--    Yalnız service_role çalıştırabilir.
--
-- 2) ring_org — zilin gövdesine kimlik EKLENDİ (alan çıkarılmadı).
--    1.0.1 gövdeden yalnız `t`yi okuyor (mobile/src/lib/liveSignal.ts ·
--    tableOf); yeni alanlar onu etkilemiyor. İleride telefon "bu değişiklik
--    benim günümü ilgilendiriyor mu?" sorusunu sormadan yeniden çekmesin diye:
--      hepsinde     : op ('insert'|'update'|'delete'), id
--      reservations : staff_id, date; UPDATE'te değiştiyse prev_staff_id, prev_date
--    Veri yolu DEĞİL: ad, telefon, tutar, not yok — personel takvimden zaten
--    görebildiği kimlikleri görür. Hata yine yutuluyor: zil çalmadı diye
--    randevu kaydı düşmez.
-- ============================================================

BEGIN;

-- ── 1 · Müşteri defteri ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.staff_customer_book(
    p_org uuid,
    p_from date,
    p_limit integer DEFAULT NULL,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    name text,
    phone_tail text,
    last_date date,
    last_service text,
    last_staff_id uuid,
    has_formula boolean
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT
        c.id,
        c.name::text,
        -- JS'teki `replace(/\D/g, '').slice(-4)` ile aynı: yalnız ASCII rakam.
        right(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'), 4),
        l.date,
        l.service::text,
        l.staff_id,
        -- Eski kural: pencere içindeki iptal olmayan HERHANGİ bir ziyarette
        -- dolu formül. "Dolu" = JavaScript'te doğru sayılan değer.
        EXISTS (
            SELECT 1
            FROM public.reservations f
            WHERE f.organization_id = p_org
              AND f.customer_id = c.id
              AND f.formula IS NOT NULL
              AND f.status <> 'cancelled'
              AND f.date >= p_from
              AND f.formula NOT IN ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb)
        )
    FROM public.customers c
    LEFT JOIN LATERAL (
        SELECT r.date, r.service, r.staff_id
        FROM public.reservations r
        WHERE r.organization_id = p_org
          AND r.customer_id = c.id
          AND r.status <> 'cancelled'
          AND r.date >= p_from
        ORDER BY r.date DESC, r.start_time DESC NULLS LAST, r.id
        LIMIT 1
    ) l ON true
    WHERE c.organization_id = p_org
    ORDER BY c.name, c.id
    LIMIT p_limit
    OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

COMMENT ON FUNCTION public.staff_customer_book(uuid, date, integer, integer) IS
    'staff-api customers: müşteri başına son ziyaret + formül var mı + telefonun son 4 hanesi (143). Yalnız service_role.';

REVOKE ALL ON FUNCTION public.staff_customer_book(uuid, date, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_customer_book(uuid, date, integer, integer) TO service_role;

-- ── 2 · Zil gövdesi ────────────────────────────────────────────────────────
-- Tetikleyiciler (100 · 101) aynı fonksiyonu çağırıyor; onlara dokunulmuyor.
CREATE OR REPLACE FUNCTION public.ring_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org uuid;
    v_row jsonb;
    v_old jsonb;
    v_body jsonb;
BEGIN
    v_org := coalesce(
        (CASE WHEN tg_op = 'DELETE' THEN old.organization_id ELSE new.organization_id END),
        null
    );
    IF v_org IS NULL THEN
        RETURN coalesce(new, old);
    END IF;

    -- Gövdeyi kurmak da yayın da aynı korumanın içinde: hiçbiri randevunun
    -- yazılmasını engelleyemez.
    BEGIN
        v_row := CASE WHEN tg_op = 'DELETE' THEN to_jsonb(old) ELSE to_jsonb(new) END;
        v_body := jsonb_build_object('t', tg_table_name, 'op', lower(tg_op));
        IF v_row ? 'id' THEN
            v_body := v_body || jsonb_build_object('id', v_row -> 'id');
        END IF;
        IF tg_table_name = 'reservations' THEN
            v_body := v_body || jsonb_build_object(
                'staff_id', v_row -> 'staff_id',
                'date', v_row -> 'date'
            );
            IF tg_op = 'UPDATE' THEN
                v_old := to_jsonb(old);
                IF (v_old -> 'staff_id') IS DISTINCT FROM (v_row -> 'staff_id') THEN
                    v_body := v_body || jsonb_build_object('prev_staff_id', v_old -> 'staff_id');
                END IF;
                IF (v_old -> 'date') IS DISTINCT FROM (v_row -> 'date') THEN
                    v_body := v_body || jsonb_build_object('prev_date', v_old -> 'date');
                END IF;
            END IF;
        END IF;

        PERFORM realtime.send(
            v_body,
            'changed',
            'org:' || v_org::text,
            true
        );
    EXCEPTION WHEN others THEN
        NULL;
    END;

    RETURN coalesce(new, old);
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Geri alma ───────────────────────────────────────────────────────────────
-- staff-api'nin eski sürümü bu fonksiyonu çağırmıyor; geri almak gerekirse:
--   DROP FUNCTION IF EXISTS public.staff_customer_book(uuid, date, integer, integer);
--   ve 100_live_doorbell.sql'deki ring_org() gövdesini yeniden çalıştırın
--   (yalnız `jsonb_build_object('t', tg_table_name)`).
-- Yeni staff-api fonksiyon yoksa eski yola düştüğü için sıra önemsiz.
