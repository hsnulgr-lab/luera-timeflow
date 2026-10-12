-- ============================================================
-- TimeFlow Migration 114: Tek kişilikte randevunun personelini SUNUCU yazar
-- ============================================================
-- v4 karar 3: "006 sahip için bir personel satırı açar; sunucu her randevuya
-- o staff_id'yi kendisi yazar, istemci göndermez. Takvim, çakışma kontrolü
-- ve raporlar staff_id üzerinden."
--
-- Bugün personeli boş bir randevu tek kişilik Takvim'de HİÇBİR sütuna
-- düşmüyor (istemci `columnize` boş satırı süzüyor) ve çakışma kontrolü
-- (060) onu sahibin randevularıyla değil, ortak "atanmamış" havuzla
-- karşılaştırıyor. Uygulama personeli kendisi gönderiyor; başka bir yazma
-- yolu (içe aktarma, API, eski kayıtlar) boş bırakırsa sahibin günü delinir.
--
-- İKİ PARÇA:
--
--   1. Tetikleyici — YENİ randevu (INSERT). Tek kişilik org'da staff_id
--      boşsa TEK aktif personel yazılır. Birden fazla aktif personel varsa
--      DOKUNULMAZ: "hangisi" sorusunun cevabı yok ve sunucu tahmin etmez —
--      `staff-api` `solo.session` ile aynı kural. Hiç aktif personel yoksa
--      da boş kalır.
--
--      SIRA: Postgres aynı olayın BEFORE tetikleyicilerini ADA GÖRE sıralar.
--      `trg_reservations_assign_solo_staff`, `trg_reservations_conflict_guard`
--      tan önce gelir; çakışma kontrolü doldurulmuş personeli görür ve
--      sahibin üstüne binen randevuyu reddeder. Ad değişirse bu söz bozulur
--      (regresyon testi bunu kolluyor).
--
--      UPDATE'TE ÇALIŞMIYOR — bilerek. 060 personeli değişen her güncellemede
--      yeniden tarıyor; eski personelsiz bir randevuyu "tamamlandı" yapmak,
--      doldurulan personel yüzünden çakışma hatasına düşmemeli.
--
--   2. Tek seferlik doldurma — var olan personelsiz randevular, aynı kuralla.
--      Satır satır: çakışan (23P01, 060) ya da kilitli (23514 — örn. 062'nin
--      başlamış muayenesi) satır ATLANIR ve sayılır, gerisi yazılır. Sonuç
--      NOTICE olarak basılır.
--
--      Bu sırada bildirim tetikleyicisi (`trg_push_on_reservation`) KAPALI:
--      personel boştan doluya geçince personele "Yeni randevun var" gidiyor
--      (046/107 · "Personele atama"); doldurma her eski randevu için bildirim
--      yağdırırdı. Kapatma işlem içinde ve kilitli — eş zamanlı yazmalar
--      işlem bitene kadar bekler, hiçbiri bildirimsiz geçmez. Tetikleyici
--      göçten önce zaten kapalıysa kapalı kalır.
--
-- Yetki: tetikleyici fonksiyonu SECURITY DEFINER (060 gibi). Randevuyu
-- kimin yazdığından bağımsız çalışmalı — halka açık randevu, staff-api,
-- masaüstü. Fonksiyon yalnız yazılan satırın KENDİ org'unun bayrağını ve
-- personelini okuyor; satırın yazılıp yazılamayacağına yine RLS karar
-- veriyor (WITH CHECK tetikleyiciden SONRA, son satır üstünde bakılır).
--
-- Idempotent — defalarca çalıştırılabilir; ikinci koşuda doldurulacak satır
-- kalmaz.
-- ============================================================

BEGIN;

-- 1) Tetikleyici fonksiyonu
CREATE OR REPLACE FUNCTION public.assign_solo_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_crew UUID[];
BEGIN
    -- `WHEN` koşulu zaten süzüyor; fonksiyon başka yere bağlanırsa da güvende.
    IF NEW.staff_id IS NOT NULL OR NEW.organization_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM organizations
         WHERE id = NEW.organization_id
           AND solo
    ) THEN
        RETURN NEW;
    END IF;

    -- "Tek mi" sorusunun cevabı için iki satır yeter.
    SELECT array_agg(crew.id ORDER BY crew.created_at, crew.id)
      INTO v_crew
      FROM (
          SELECT id, created_at
            FROM staff
           WHERE organization_id = NEW.organization_id
             AND is_active
           ORDER BY created_at, id
           LIMIT 2
      ) AS crew;

    IF cardinality(v_crew) = 1 THEN
        NEW.staff_id := v_crew[1];
    END IF;

    RETURN NEW;
END;
$$;

-- Tetikleyici fonksiyonu doğrudan çağrılacak bir şey değil. 094'ün dersi:
-- `from public` YETMEZ, Supabase `anon` ve `authenticated`a ayrıca veriyor.
REVOKE ALL ON FUNCTION public.assign_solo_staff() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_reservations_assign_solo_staff ON public.reservations;
CREATE TRIGGER trg_reservations_assign_solo_staff
    BEFORE INSERT ON public.reservations
    FOR EACH ROW
    WHEN (NEW.staff_id IS NULL)
    EXECUTE FUNCTION public.assign_solo_staff();

-- 2) Var olan personelsiz randevular — tek seferlik doldurma
DO $$
DECLARE
    v_push_state "char";
    v_row RECORD;
    v_filled INTEGER := 0;
    v_skipped INTEGER := 0;
BEGIN
    -- Tetikleyici bulunduğu hâle geri bırakılıyor: 'O' açık, 'A' her zaman
    -- açık, 'D' kapalı, 'R' yalnız eşlemede; yoksa NULL. Yalnız şu an
    -- ateşlenebilen ('O', 'A') kapatılıyor.
    SELECT tgenabled
      INTO v_push_state
      FROM pg_trigger
     WHERE tgrelid = 'public.reservations'::regclass
       AND tgname = 'trg_push_on_reservation'
       AND NOT tgisinternal;

    IF v_push_state IN ('O', 'A') THEN
        EXECUTE 'ALTER TABLE public.reservations DISABLE TRIGGER trg_push_on_reservation';
    END IF;

    FOR v_row IN
        SELECT r.id, crew.staff_id
          FROM public.reservations AS r
          JOIN (
              SELECT s.organization_id, (array_agg(s.id))[1] AS staff_id
                FROM public.staff AS s
                JOIN public.organizations AS o
                  ON o.id = s.organization_id
                 AND o.solo
               WHERE s.is_active
               GROUP BY s.organization_id
              HAVING count(*) = 1
          ) AS crew
            ON crew.organization_id = r.organization_id
         WHERE r.staff_id IS NULL
         ORDER BY r.organization_id, r.date, r.start_time, r.id
    LOOP
        BEGIN
            UPDATE public.reservations
               SET staff_id = v_row.staff_id
             WHERE id = v_row.id
               AND staff_id IS NULL;
            v_filled := v_filled + 1;
        EXCEPTION
            -- 060: sahibin aynı saatteki randevusuyla çakışıyor.
            -- 062: başlamış muayenenin personeli kilitli.
            -- İkisinde de satır OLDUĞU GİBİ kalıyor; doldurma bir düzeltme,
            -- kimsenin gününü bozmamalı.
            WHEN exclusion_violation OR check_violation THEN
                v_skipped := v_skipped + 1;
        END;
    END LOOP;

    IF v_push_state = 'O' THEN
        EXECUTE 'ALTER TABLE public.reservations ENABLE TRIGGER trg_push_on_reservation';
    ELSIF v_push_state = 'A' THEN
        EXECUTE 'ALTER TABLE public.reservations ENABLE ALWAYS TRIGGER trg_push_on_reservation';
    END IF;

    RAISE NOTICE '114: % randevuya personel yazıldı; % randevu (çakışma ya da kilit) boş bırakıldı',
        v_filled, v_skipped;
END;
$$;

COMMIT;
