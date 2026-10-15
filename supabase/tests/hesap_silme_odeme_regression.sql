-- ============================================================
-- 119 · TAHSİLATI OLAN İŞLETME SİLİNEBİLİYOR — kuru koşu kontrolü
-- ============================================================
-- Kullanım (üretimde, GERİ SARILIR):
--   psql -v org=<tahsilatı olan bir deneme işletmesinin id'si> …
--   BEGIN; 119 (BEGIN/COMMIT'siz); bu dosya; ROLLBACK;
--
-- İki yönü birden soruyor:
--   1. Tek bir tahsilat silinince iz HÂLÂ yazılıyor (102'nin amacı).
--   2. İşletmenin kendisi silinince silme DÜŞMÜYOR; tahsilatlar ve izleri
--      işletmeyle gidiyor (hesap silme, Apple 5.1.1(v)).
-- Önkoşul tutmazsa (tahsilat yok) test bir şey kanıtlamaz — durur.
select set_config('test.org', :'org', true);

DO $$
DECLARE
    v_org uuid := current_setting('test.org')::uuid;
    v_paid int;
    n int;
BEGIN
    SELECT count(*) INTO v_paid FROM public.payments WHERE organization_id = v_org;
    IF v_paid < 2 THEN
        RAISE EXCEPTION 'ÖNKOŞUL: işletmede en az iki tahsilat olmalı (% var) — test bir şey kanıtlamaz', v_paid;
    END IF;

    -- 1 · Tek silme iz bırakıyor.
    DELETE FROM public.payments
     WHERE id = (SELECT id FROM public.payments WHERE organization_id = v_org ORDER BY paid_at LIMIT 1);
    SELECT count(*) INTO n FROM public.payment_void_log WHERE organization_id = v_org;
    IF n < 1 THEN RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: tek tahsilat silindi ama iz yazılmadı'; END IF;

    -- 2 · İşletmenin kendisi silinebiliyor (hesap silmenin yaptığı şey).
    DELETE FROM public.organizations WHERE id = v_org;
    SELECT count(*) INTO n FROM public.organizations WHERE id = v_org;
    IF n <> 0 THEN RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: işletme silinmedi'; END IF;
    SELECT count(*) INTO n FROM public.payments WHERE organization_id = v_org;
    IF n <> 0 THEN RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: % tahsilat kaldı', n; END IF;
    SELECT count(*) INTO n FROM public.payment_void_log WHERE organization_id = v_org;
    IF n <> 0 THEN RAISE EXCEPTION 'KURU KOŞU DÜŞTÜ: % iz satırı kaldı', n; END IF;

    RAISE NOTICE 'KURU KOŞU GEÇTİ: % tahsilatlı işletme silindi; tek silmede iz yazıldı; izler işletmeyle gitti (ROLLBACK ile geri sarılacak).', v_paid;
END $$;
