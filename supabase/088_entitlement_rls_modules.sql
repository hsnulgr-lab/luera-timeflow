-- ============================================================
-- TimeFlow Migration 088: Abonelik kapısı — sektör modülü tabloları
-- ============================================================
-- 087 çekirdek tabloları kapattı (randevu, müşteri, tahsilat, hizmet,
-- personel, kaynak, tedavi planı). Canlıda politikalar denetlenince görüldü ki
-- SEKTÖR MODÜLLERİNİN tabloları açık kalmış: kilitli bir işletme hâlâ diş
-- kaydı girebiliyor, paket satabiliyor, sıra ve masa açabiliyor, stok
-- hareketi yazabiliyordu.
--
-- Bu, "abonelik bitince sistem durur" vaadinin yarısının tutmaması demekti —
-- üstelik en çok veri üreten ekranlar (diş şeması, paketler) o listede.
--
-- 087 ile AYNI kural: yalnız WITH CHECK sıkışır, SELECT'e dokunulmaz.
-- 087'yi düzenleyip yeniden çalıştırmak yerine ayrı migration: uygulanmış bir
-- migration'ı değiştirmek, kimin neyi çalıştırdığını izlenemez hâle getirir.
-- ============================================================

DO $$
DECLARE
    t TEXT;
    -- Sektöre bürünen modüllerin tabloları. Hepsi "ürünü kullanmak" sayılır.
    --
    -- MUAF KALANLAR ve nedenleri:
    --   settings, org_whatsapp    → ödeme sonrası dönen kullanıcı yarım
    --                               kurulumla baş başa kalmasın (087 notu)
    --   push_subscriptions        → bildirim yolu kapanırsa "ödeme alınamadı"
    --                               uyarısı da gitmez
    --   org_entitlement           → zaten yalnız service-role yazıyor
    --   integration_connections   → API anahtarı yönetimi; kilitliyken zaten
    --                               gateway 403 dönüyor, çift kilit gerekmez
    tables TEXT[] := ARRAY[
        'customer_packages', 'dental_records', 'periodontal_charts',
        'treatment_installments', 'queue_entries', 'table_reservations',
        'tables', 'products', 'stock_movements', 'staff_time_off', 'waitlist'
    ];
    pol TEXT;
BEGIN
    FOREACH t IN ARRAY tables LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            RAISE NOTICE '% tablosu yok, atlandı', t;
            CONTINUE;
        END IF;

        pol := t || '_org_access';
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t AND policyname = pol
        ) THEN
            RAISE NOTICE '%.% politikası yok, atlandı', t, pol;
            CONTINUE;
        END IF;

        EXECUTE format(
            'ALTER POLICY %I ON public.%I
                 USING (organization_id IN (SELECT auth_user_org_ids()))
                 WITH CHECK (
                     organization_id IN (SELECT auth_user_org_ids())
                     AND public.has_timeflow_access(organization_id)
                 )', pol, t);
        RAISE NOTICE '% → abonelik kapısı takıldı', t;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Denetim sorgusu — kapının nereye takıldığını tek bakışta görmek için:
--
--   select tablename,
--          (with_check like '%has_timeflow_access%') as yazma_kapali,
--          (qual       like '%has_timeflow_access%') as okuma_kapali
--   from pg_policies
--   where schemaname = 'public' and policyname like '%_org_access'
--   order by yazma_kapali desc, tablename;
--
-- okuma_kapali sütunu HER SATIRDA false olmalı. Bir gün true görünürse
-- müşterinin verisi rehin alınmış demektir.
