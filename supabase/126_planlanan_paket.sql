-- ============================================================
-- TimeFlow Migration 126: Dönem sonuna planlanan paket değişikliği
-- ============================================================
-- Plan değiştirmede (dodo-checkout · action 'change', 2026-10-22) düşürme
-- Dodo'da bir sonraki fatura gününe zamanlanır (`scheduled_change`). Ayna
-- bunu tutmazsa ekran o güne kadar YANLIŞ söyler: Test A'da Ekip → Tek
-- kişilik planlandıktan sonra Ayarlar "Deneme bitiyor 29 Ekim · ₺1.299"
-- yazıyordu; o gün ₺799 çekilecek.
--
-- Yazanlar: dodo-checkout (değişiklik anında, vazgeçince temizler) ve
-- dodo-webhook (Dodo'nun anlık görüntüsündeki `scheduled_change`'ten —
-- yürürlüğe girince Dodo alanı boşaltır, ayna da temizlenir). Okuyan:
-- billing-status → Ayarlar › Abonelik.
--
-- ⚠️ SIRA: bu göç dodo-webhook'un YENİ sürümünden ÖNCE uygulanır. Yeni
-- webhook bu sütunları yazar; sütun yoksa ayna yazılamaz, Dodo uca 500
-- görür ve tekrar tekrar dener (Eylül'de uç bu yüzden kapanmıştı).
--
-- Idempotent. Yeni sütunlar tablonun mevcut RLS ve izinlerini devralır.
-- ============================================================

BEGIN;

ALTER TABLE public.org_entitlement
    ADD COLUMN IF NOT EXISTS scheduled_plan  TEXT,
    ADD COLUMN IF NOT EXISTS scheduled_cycle TEXT,
    ADD COLUMN IF NOT EXISTS scheduled_at    TIMESTAMPTZ;

COMMENT ON COLUMN public.org_entitlement.scheduled_plan IS
    'Dodo''da bir sonraki fatura gününe planlanmış paket (düşürme); yoksa NULL.';
COMMENT ON COLUMN public.org_entitlement.scheduled_at IS
    'Planlanan paketin yürürlüğe gireceği an (Dodo scheduled_change.effective_at).';

NOTIFY pgrst, 'reload schema';

COMMIT;
