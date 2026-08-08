-- ============================================================
-- TimeFlow Migration 087: Abonelik kapısını RLS'e bağla
-- ============================================================
-- ⚠️  BUNU 086'DAN HEMEN SONRA UYGULAMAYIN.
--
-- Sıra şu ve bu sıra önemli:
--   1. 086 uygulanır (tablo + has_timeflow_access, ENFORCE kapalı).
--   2. MEVCUT org'lara org_entitlement satırı yazılır (aşağıdaki not).
--   3. Bu migration uygulanır.
--   4. En son ENTITLEMENT_ENFORCE = 'true' yapılır.
-- Adım 2 atlanırsa kapı açıldığı an ÖDEYEN müşteriler de dahil herkes
-- kilitlenir. Planın en kolay unutulan adımı budur.
--
-- NE YAPAR: yazma politikalarının WITH CHECK'ine erişim koşulu eklenir.
--   • SELECT'e DOKUNULMAZ — veri okunabilir ve dışa aktarılabilir kalır.
--     Müşterinin verisini rehin almak marka zararıdır; kilit, ürünü
--     KULLANMAYI durdurur, veriyi değil.
--   • INSERT ve UPDATE kapanır: yeni randevu, yeni müşteri, yeni tahsilat yok.
--   • DELETE bilinçli olarak açık kalır (WITH CHECK DELETE'e uygulanmaz):
--     kullanıcının kendi verisini silmesini engellemenin bir savunması yok.
--
-- NEDEN RLS: istemcideki yönlendirme ve edge fonksiyonlarındaki kapı
-- atlatılabilir — anon anahtar tarayıcıda, PostgREST herkese açık. Gerçek
-- kapı veritabanında olmalı.
--
-- SERVICE-ROLE ETKİLENMEZ (RLS'i atlar). Bu yüzden cron ve webhook uçlarına
-- kapı AYRICA elle takıldı (remind, generate-recurring, public-booking...).
-- ============================================================

DO $$
DECLARE
    t TEXT;
    -- Yazması para eden / ürünü kullanmak sayılan tablolar. settings ve
    -- org_whatsapp bilinçli olarak YOK: kilitli kullanıcı işletme adını ya da
    -- WhatsApp bağlantısını düzeltebilmeli, aksi hâlde ödeme sonrası dönüşte
    -- yarım kalmış bir kuruluma mahkûm olur.
    tables TEXT[] := ARRAY[
        'reservations', 'customers', 'payments', 'treatment_plans',
        'services', 'staff', 'resources', 'expenses'
    ];
    pol TEXT;
BEGIN
    FOREACH t IN ARRAY tables LOOP
        -- 080 (expenses) gibi henüz uygulanmamış migration'lar olabilir.
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

        -- USING aynı kalır (okuma ve satır seçimi bozulmaz), yalnız WITH CHECK
        -- sıkılaşır. Politikayı silip yeniden yaratmak yerine ALTER: bir hata
        -- hâlinde tablo bir an için politikasız (yani tamamen kapalı) kalmaz.
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

-- ── Geri alma ────────────────────────────────────────────────────────────────
-- Bir şey ters giderse ENTITLEMENT_ENFORCE'u 'false' yapmak YETER:
-- has_timeflow_access() o zaman herkese true döner ve bu politikalar etkisiz
-- kalır. Migration'ı geri almak gerekmez.
--
--   update app_secrets set value = 'false' where key = 'ENTITLEMENT_ENFORCE';
