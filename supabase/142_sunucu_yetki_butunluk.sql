-- ============================================================
-- TimeFlow Migration 142: Sunucu yetki ve bütünlük (Paket B · 2026-11-12)
-- ============================================================
-- Denetimin sunucu tarafı. Tek dosya, yeniden çalıştırılabilir. Edge
-- fonksiyonlarından (staff-api, send-push, account-delete) ÖNCE uygulanır;
-- staff-api yeni RPC'ler yoksa eski yola düşer (bkz. "Sıra" en altta).
--
-- ── 1 · PIN denemesi ÖNCE sayılır, SONRA karşılaştırılır ───────────────────
-- staff-api sayacı okuyup karşılaştırıyor, sonra koşulsuz geri yazıyordu:
-- 50 eşzamanlı tahmin 1 deneme sayılıyordu. Ayrıca sayaç yanlış tahminden
-- SONRA artınca, kilit basılırken uçuştaki öteki tahminler zaten
-- karşılaştırılmış oluyordu. `staff_pin_reserve` hakkı karşılaştırmadan önce
-- atomik olarak ayırır; eşiğe ulaşan ayırma kilidi AYNI güncellemede basar.
-- Böylece kilit süresi başına en çok `p_max` tahmin değerlendirilir.
--
-- ── 2 · Eşleştirme kodu: IP + ortak tavan, atomik ──────────────────────────
-- `staff_pair_reserve` deneme hakkını kod aranmadan önce ayırır: IP başına
-- sayaç (IP yoksa TEK ortak '__no_ip__' kovası) + bütün sunucu için dakikalık
-- genel tavan ('__global__' satırı). Doğru kod tahmin değildir:
-- `staff_pair_refund` hakkı geri verir.
--
-- ── 3 · Personel tahsilatı rezervasyon satırı kilitlenerek ─────────────────
-- `staff_collect_payment`: rezervasyonu `FOR UPDATE` kilitler, geri
-- alınmamış (voided_at IS NULL) tahsilat varsa onu döner, yoksa yazar.
-- Yalnız staff-api `visit.collect` çağırıyor; masaüstünün kısmi ödeme ve
-- 111 geri alma akışı bu fonksiyona hiç uğramıyor.
--
-- ── 4 · Pasif personel bildirim almaz ──────────────────────────────────────
-- `is_active` false olunca o personelin push_subscriptions satırları silinir
-- (082 tetikleyicisi oturumu düşürüyordu ama abonelik kalıyordu). Bugün
-- pasif olanların kalan abonelikleri de bir kez temizlenir.
--
-- ── 5 · organizations / organization_members'a doğrudan INSERT kapalı ──────
-- 003'ün `FOR ALL` politikaları sahibin kendi işletmesine HERHANGİ bir
-- user_id eklemesine ve doğrudan `organizations` INSERT'e (124 deneme
-- tetikleyicisi her insert'te 7 gün veriyor; `create_own_business`'ın tek
-- işletme kapısı atlanıyordu) izin veriyordu. Tarama (2026-11-12): src/,
-- mobile/, supabase/functions/ bu iki tabloya istemci rolüyle hiç INSERT/
-- UPSERT/UPDATE etmiyor; ekleme yalnız SECURITY DEFINER yollarından
-- (handle_new_user, create_own_business) geçiyor. Üyelikte UPDATE de
-- verilmiyor: `user_id`'yi değiştiren bir UPDATE, INSERT'in kendisidir.
--
-- ── 6 · Gereksiz EXECUTE izinleri ──────────────────────────────────────────
--   purge_expired_device_codes(): çağıran yok → yalnız service_role.
--   has_timeflow_access(uuid), org_module_enabled(uuid, text): RLS
--   politikalarında (053, 087, 088) ve telefonda (`rpc('has_timeflow_access')`)
--   authenticated adına çağrılıyor — authenticated'tan geri ALINMAZ, yalnız
--   public/anon'dan alınır.
-- ============================================================

BEGIN;

-- ── 1 · PIN ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.staff_pin_reserve(
    p_staff uuid,
    p_max integer,
    p_lock_minutes integer
)
RETURNS TABLE (reserved boolean, attempts integer, locked_until timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_n integer;
    v_until timestamptz;
BEGIN
    -- FOR UPDATE: eşzamanlı ikinci istek burada bekler ve satırın YENİ
    -- hâlini görür (kilit basıldıysa WHERE onu dışarıda bırakır).
    SELECT CASE WHEN s.pin_locked_until IS NOT NULL THEN 0  -- süresi dolmuş kilit: baştan
                ELSE coalesce(s.pin_attempts, 0) END + 1
      INTO v_n
      FROM public.staff s
     WHERE s.id = p_staff
       AND (s.pin_locked_until IS NULL OR s.pin_locked_until <= now())
       FOR UPDATE;

    IF v_n IS NULL THEN
        SELECT s.pin_locked_until INTO v_until FROM public.staff s WHERE s.id = p_staff;
        RETURN QUERY SELECT false, NULL::integer, v_until;
        RETURN;
    END IF;

    v_until := CASE WHEN v_n >= p_max
                    THEN now() + make_interval(mins => p_lock_minutes)
                    ELSE NULL END;
    UPDATE public.staff
       SET pin_attempts = CASE WHEN v_until IS NULL THEN v_n ELSE 0 END,
           pin_locked_until = v_until
     WHERE id = p_staff;

    RETURN QUERY SELECT true, v_n, v_until;
END;
$$;

COMMENT ON FUNCTION public.staff_pin_reserve(uuid, integer, integer) IS
    '142 · PIN deneme hakkını karşılaştırmadan ÖNCE atomik ayırır; eşikte kilidi aynı güncellemede basar. Yalnız staff-api (service_role).';

REVOKE ALL ON FUNCTION public.staff_pin_reserve(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_pin_reserve(uuid, integer, integer) TO service_role;

-- ── 2 · Eşleştirme kodu ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.staff_pair_reserve(
    p_ip text,
    p_max integer,
    p_lock_minutes integer,
    p_global_max integer
)
RETURNS TABLE (locked boolean, minutes integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_key text := coalesce(nullif(btrim(p_ip), ''), '__no_ip__');
    g public.staff_pair_attempts%ROWTYPE;
    r public.staff_pair_attempts%ROWTYPE;
    v_n integer;
BEGIN
    -- Kilit sırası hep aynı (önce genel, sonra IP): kilitlenme (deadlock) yok.
    INSERT INTO public.staff_pair_attempts (ip, failures, locked_until, updated_at)
    VALUES ('__global__', 0, NULL, now())
    ON CONFLICT (ip) DO NOTHING;
    SELECT * INTO g FROM public.staff_pair_attempts WHERE ip = '__global__' FOR UPDATE;

    IF g.locked_until IS NOT NULL AND g.locked_until > now() THEN
        RETURN QUERY SELECT true, greatest(1, ceil(extract(epoch FROM g.locked_until - now()) / 60)::integer);
        RETURN;
    END IF;

    INSERT INTO public.staff_pair_attempts (ip, failures, locked_until, updated_at)
    VALUES (v_key, 0, NULL, now())
    ON CONFLICT (ip) DO NOTHING;
    SELECT * INTO r FROM public.staff_pair_attempts WHERE ip = v_key FOR UPDATE;

    IF r.locked_until IS NOT NULL AND r.locked_until > now() THEN
        RETURN QUERY SELECT true, greatest(1, ceil(extract(epoch FROM r.locked_until - now()) / 60)::integer);
        RETURN;
    END IF;

    -- IP sayacı (süresi dolmuş kilit baştan başlar).
    v_n := CASE WHEN r.locked_until IS NOT NULL THEN 0 ELSE r.failures END + 1;
    UPDATE public.staff_pair_attempts
       SET failures = CASE WHEN v_n >= p_max THEN 0 ELSE v_n END,
           locked_until = CASE WHEN v_n >= p_max
                               THEN now() + make_interval(mins => p_lock_minutes) ELSE NULL END,
           updated_at = now()
     WHERE ip = v_key;

    -- Genel dakikalık tavan: `updated_at` pencerenin başı.
    v_n := CASE WHEN g.updated_at < now() - interval '1 minute' OR g.locked_until IS NOT NULL
                THEN 0 ELSE g.failures END + 1;
    UPDATE public.staff_pair_attempts
       SET failures = CASE WHEN v_n >= p_global_max THEN 0 ELSE v_n END,
           locked_until = CASE WHEN v_n >= p_global_max THEN now() + interval '1 minute' ELSE NULL END,
           updated_at = CASE WHEN v_n = 1 OR v_n >= p_global_max THEN now() ELSE g.updated_at END
     WHERE ip = '__global__';

    RETURN QUERY SELECT false, 0;
END;
$$;

COMMENT ON FUNCTION public.staff_pair_reserve(text, integer, integer, integer) IS
    '142 · Eşleştirme kodu deneme hakkını kod aranmadan ÖNCE ayırır: IP başına (IP yoksa ortak kova) + dakikalık genel tavan.';

-- Doğru (kapanmış ya da süresi dolmuş da olsa VAR olan) kod tahmin değildir.
CREATE OR REPLACE FUNCTION public.staff_pair_refund(p_ip text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    UPDATE public.staff_pair_attempts
       SET failures = greatest(0, failures - 1)
     WHERE ip IN (coalesce(nullif(btrim(p_ip), ''), '__no_ip__'), '__global__')
       AND (locked_until IS NULL OR locked_until <= now());
$$;

REVOKE ALL ON FUNCTION public.staff_pair_reserve(text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staff_pair_refund(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_pair_reserve(text, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staff_pair_refund(text) TO service_role;

-- ── 3 · Personel tahsilatı ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.staff_collect_payment(
    p_org uuid,
    p_reservation uuid,
    p_customer uuid,
    p_description text,
    p_amount numeric,
    p_method text,
    p_staff uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_found boolean;
    v_pay jsonb;
BEGIN
    SELECT true INTO v_found
      FROM public.reservations
     WHERE id = p_reservation AND organization_id = p_org
       FOR UPDATE;
    IF v_found IS NULL THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    -- Kilit altında yeniden bak: eşzamanlı ikinci istek ilkinin kaydını görür.
    SELECT jsonb_build_object('id', id, 'amount', amount, 'method', method, 'paid_at', paid_at)
      INTO v_pay
      FROM public.payments
     WHERE organization_id = p_org
       AND reservation_id = p_reservation
       AND voided_at IS NULL
     ORDER BY paid_at
     LIMIT 1;
    IF v_pay IS NOT NULL THEN
        -- `paid`: geri alınmamış tahsilatların toplamı. Kısmi ödeme (kapora)
        -- "zaten alındı" değildir; kararı çağıran tutarla karşılaştırıp verir.
        RETURN jsonb_build_object(
            'status', 'exists',
            'payment', v_pay,
            'paid', (SELECT coalesce(sum(amount), 0) FROM public.payments
                      WHERE organization_id = p_org AND reservation_id = p_reservation
                        AND voided_at IS NULL));
    END IF;

    INSERT INTO public.payments
        (organization_id, customer_id, reservation_id, type, description, amount, method, staff_id)
    VALUES
        (p_org, p_customer, p_reservation, 'service', p_description, p_amount, p_method, p_staff)
    RETURNING jsonb_build_object('id', id, 'amount', amount, 'method', method, 'paid_at', paid_at)
      INTO v_pay;

    RETURN jsonb_build_object('status', 'inserted', 'payment', v_pay);
END;
$$;

COMMENT ON FUNCTION public.staff_collect_payment(uuid, uuid, uuid, text, numeric, text, uuid) IS
    '142 · staff-api visit.collect: rezervasyonu kilitleyip geri alınmamış tahsilat yoksa yazar; varsa onu döner.';

REVOKE ALL ON FUNCTION public.staff_collect_payment(uuid, uuid, uuid, text, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_collect_payment(uuid, uuid, uuid, text, numeric, text, uuid) TO service_role;

-- ── 4 · Pasif personelin abonelikleri ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.drop_push_on_staff_deactivate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    DELETE FROM public.push_subscriptions WHERE staff_id = NEW.id;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.drop_push_on_staff_deactivate() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_142_staff_deactivate_push ON public.staff;
CREATE TRIGGER trg_142_staff_deactivate_push
    AFTER UPDATE OF is_active ON public.staff
    FOR EACH ROW
    WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active AND NEW.is_active = false)
    EXECUTE FUNCTION public.drop_push_on_staff_deactivate();

-- Bir kez: bugün pasif olanların kalan abonelikleri.
DELETE FROM public.push_subscriptions ps
 USING public.staff s
 WHERE ps.staff_id = s.id
   AND s.is_active = false;

-- ── 5 · Politikalar: INSERT dışarıda ────────────────────────────────────────
DROP POLICY IF EXISTS "orgs_owner_modify" ON public.organizations;
DROP POLICY IF EXISTS "orgs_owner_update" ON public.organizations;
DROP POLICY IF EXISTS "orgs_owner_delete" ON public.organizations;
CREATE POLICY "orgs_owner_update" ON public.organizations
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());
CREATE POLICY "orgs_owner_delete" ON public.organizations
    FOR DELETE TO authenticated
    USING (owner_id = auth.uid());
-- SELECT: 003'ün `orgs_member_select`i (sahip de üye) — değişmedi.

DROP POLICY IF EXISTS "org_members_owner_manage" ON public.organization_members;
DROP POLICY IF EXISTS "org_members_owner_delete" ON public.organization_members;
CREATE POLICY "org_members_owner_delete" ON public.organization_members
    FOR DELETE TO authenticated
    USING (org_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()));
-- SELECT: 003'ün `org_members_self_select`i — değişmedi.

-- ── 6 · EXECUTE izinleri ────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regprocedure('public.purge_expired_device_codes()') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION public.purge_expired_device_codes() FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.purge_expired_device_codes() TO service_role;
    END IF;
    IF to_regprocedure('public.has_timeflow_access(uuid)') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION public.has_timeflow_access(uuid) FROM PUBLIC, anon;
        GRANT EXECUTE ON FUNCTION public.has_timeflow_access(uuid) TO authenticated, service_role;
    END IF;
    IF to_regprocedure('public.org_module_enabled(uuid, text)') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION public.org_module_enabled(uuid, text) FROM PUBLIC, anon;
        GRANT EXECUTE ON FUNCTION public.org_module_enabled(uuid, text) TO authenticated, service_role;
    END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Sıra ve geri alma ───────────────────────────────────────────────────────
-- Sıra: ÖNCE bu göç, SONRA staff-api / send-push / account-delete.
-- (staff-api göçten önce yüklenirse RPC'ler yok diye eski yola düşer; yine
-- de sıra bu.)
--
-- Geri alma (gerekirse, tek tek):
--   DROP TRIGGER IF EXISTS trg_142_staff_deactivate_push ON public.staff;
--   DROP POLICY "orgs_owner_update" ON public.organizations;
--   DROP POLICY "orgs_owner_delete" ON public.organizations;
--   CREATE POLICY "orgs_owner_modify" ON public.organizations FOR ALL TO authenticated
--       USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
--   DROP POLICY "org_members_owner_delete" ON public.organization_members;
--   CREATE POLICY "org_members_owner_manage" ON public.organization_members FOR ALL TO authenticated
--       USING (org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()))
--       WITH CHECK (org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
--   GRANT EXECUTE ON FUNCTION public.has_timeflow_access(uuid) TO anon;
--   GRANT EXECUTE ON FUNCTION public.org_module_enabled(uuid, text) TO anon;
-- RPC'ler (staff_pin_reserve, staff_pair_reserve, staff_pair_refund,
-- staff_collect_payment) yerinde kalabilir; eski staff-api onları çağırmaz.
-- Silinen push abonelikleri geri gelmez: personel yeniden aktif olup
-- telefonda oturum açınca uygulama yeniden kaydeder.
