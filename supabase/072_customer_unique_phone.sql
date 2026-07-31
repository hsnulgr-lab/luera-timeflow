-- ============================================================
-- TimeFlow Migration 072: (organization_id, phone) müşteri tekilliği
-- ============================================================
-- Amaç: public-booking'deki eşzamanlı iki isteğin aynı telefona iki müşteri
-- kaydı açması (bakiye/paket hakkının iki kayda bölünmesi) DB seviyesinde
-- imkânsız olsun.
--
-- TASARIM NOTU — neden "birleştirme" YAPMIYORUZ:
-- Bu migration'ın ilk taslağı duplicate kayıtların alt satırlarını (randevu,
-- ödeme, plan) tek kayda taşımaya çalışıyordu. Canlıda 061'in bütünlük
-- trigger'ı bunu haklı olarak reddetti: bir planın hastası, o plana ait ödeme
-- varken değiştirilemez. Kural doğru — parası hareket etmiş bir finansal
-- geçmişi başka bir hastaya taşımak sessiz veri bozulmasıdır.
--
-- Bu yüzden burada YALNIZCA provably güvenli olan yapılır:
--   * Hiçbir alt kaydı olmayan (hiçbir tablodan referans almayan) duplicate
--     pasife çekilir — taşınacak veri olmadığı için trigger'lara dokunulmaz.
--   * Alt kaydı olan duplicate'e DOKUNULMAZ. Aynı telefonda birden fazla
--     veri taşıyan kayıt varsa migration hata verir ve tamamı geri alınır;
--     bu bir insan kararıdır, script kararı değil.
-- ============================================================

BEGIN;

-- ── 0) Bilinçli veri kararı (2026-07-31) ────────────────────────────────────
-- 05426026048 numarasını iki kayıt paylaşıyordu: 'nisanurözer' ve
-- 'ZTEST Winback Aday'. İkisi de aynı kişi DEĞİL, ikisi de deneme verisi.
-- İşletme sahibinin kararıyla ikisi de pasife çekiliyor — birleştirilmiyor,
-- silinmiyor; finansal geçmişleri olduğu gibi duruyor.
UPDATE public.customers
SET is_active = false
WHERE id IN (
    '3fbbf8a0-2d3b-42e5-92bf-0aa4fefdb25a',  -- nisanurözer (test)
    'c5272ae0-9ca4-4348-9387-e704f7e40131'   -- ZTEST Winback Aday (test)
)
AND is_active;

-- ── 1) Hangi müşteriler herhangi bir tablodan referans alıyor? ──────────────
-- Elle tablo listesi tutmuyoruz: customers'a FK veren her tablo katalogdan
-- bulunur, böylece yeni modül eklendiğinde burası kendiliğinden kapsar.
CREATE TEMP TABLE referenced_customers (id UUID PRIMARY KEY) ON COMMIT DROP;

DO $$
DECLARE fk RECORD;
BEGIN
    FOR fk IN
        SELECT c.conrelid::regclass AS tbl, a.attname AS col
        FROM pg_constraint AS c
        JOIN pg_attribute  AS a
          ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.confrelid = 'public.customers'::regclass
          AND c.contype = 'f'
    LOOP
        EXECUTE format(
            'INSERT INTO referenced_customers (id)
             SELECT DISTINCT %I FROM %s WHERE %I IS NOT NULL
             ON CONFLICT DO NOTHING',
            fk.col, fk.tbl, fk.col
        );
    END LOOP;
END $$;

-- ── 2) Duplicate grupları ve her üyenin "veri taşıyor mu" durumu ────────────
CREATE TEMP TABLE dup_members ON COMMIT DROP AS
SELECT
    c.id,
    c.organization_id,
    c.phone,
    c.created_at,
    (r.id IS NOT NULL) AS has_data
FROM public.customers AS c
LEFT JOIN referenced_customers AS r ON r.id = c.id
WHERE c.is_active
  AND c.phone <> ''
  AND EXISTS (
      SELECT 1
      FROM public.customers AS peer
      WHERE peer.organization_id = c.organization_id
        AND peer.phone = c.phone
        AND peer.is_active
        AND peer.id <> c.id
  );

-- ── 3) Otomatik çözülemeyen gruplar → dur ───────────────────────────────────
-- Aynı telefonda veri taşıyan BİRDEN FAZLA kayıt varsa hangisinin doğru
-- olduğuna script karar veremez. Hata mesajı ilgili telefonları listeler.
DO $$
DECLARE blocked TEXT;
BEGIN
    -- Alt sorgu şart: GROUP BY'lı bir SELECT ... INTO yalnız ilk grubu alır,
    -- engellenen telefonların tamamı raporlanmazdı.
    SELECT string_agg(g.phone, ', ')
      INTO blocked
      FROM (
          SELECT phone
          FROM dup_members
          WHERE has_data
          GROUP BY organization_id, phone
          HAVING count(*) > 1
      ) AS g;

    IF blocked IS NOT NULL THEN
        RAISE EXCEPTION 'customer_merge_needs_human_decision'
            USING DETAIL = format(
                'Şu telefonlarda veri taşıyan birden fazla aktif kayıt var: %s. '
                'Hangisinin kalacağına elle karar verilmeli; migration hiçbir '
                'finansal kaydı taşımaz.', blocked
            );
    END IF;
END $$;

-- ── 4) Güvenli temizlik: veri taşımayan duplicate'leri pasife çek ───────────
-- Grubunda veri taşıyan bir kayıt varsa o kalır; yoksa en eski kayıt kalır.
UPDATE public.customers AS c
SET is_active = false
FROM dup_members AS m
WHERE c.id = m.id
  AND NOT m.has_data
  AND EXISTS (
      SELECT 1
      FROM dup_members AS keeper
      WHERE keeper.organization_id = m.organization_id
        AND keeper.phone = m.phone
        AND keeper.id <> m.id
        AND (
            keeper.has_data
            OR (keeper.created_at, keeper.id) < (m.created_at, m.id)
        )
  );

-- ── 5) Tekillik artık kurulabilir ───────────────────────────────────────────
-- Yalnız aktif ve telefonu dolu kayıtlar: pasife çekilmiş geçmiş kayıtlar ile
-- telefonsuz (walk-in) kayıtlar indeksi bloklamaz.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_org_phone_active
    ON public.customers (organization_id, phone)
    WHERE is_active AND phone <> '';

COMMIT;

NOTIFY pgrst, 'reload schema';
