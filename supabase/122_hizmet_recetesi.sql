-- ============================================================================
-- 122 · Hizmet reçetesi kolonu (services.recipe)
-- ----------------------------------------------------------------------------
-- NEDEN: Ayarlar → Hizmetler'de "Reçete" (bu hizmette tüketilen sarf: 60 ml
-- boya + 60 ml oksidan) 2026-08'den beri girilebiliyordu ama HİÇBİR YERE
-- YAZILMIYORDU — tabloda kolon yoktu, istemci de göndermiyordu. Girilen reçete
-- sayfa yenilenince kayboluyor, işlem kasaya gönderilince stoktan bir şey
-- düşmüyordu. (Bulundu: 2026-10-19, yeni Ayarlar tasarımı uygulanırken.)
--
-- Biçim istemcideki `ServiceRecipeLine[]` ile birebir:
--   [{"productId":"<products.id>","quantity":60}, …]
-- Ürün silinirse satır kendiliğinden düşmez; okuyan taraf (serviceRecipe.ts ·
-- recipeFor) bulunamayan ürünü atlar.
--
-- Güvenli: yalnız yeni kolon, varsayılan boş dizi. Mevcut satırlara dokunmaz.
-- Sıra: bu göç masaüstü deploy'undan ÖNCE ya da SONRA çalışabilir; istemci
-- kolon yoksa reçetesiz yazar ve "reçete kaydedilemedi" der (useReservations).
-- ============================================================================

BEGIN;

ALTER TABLE public.services
    ADD COLUMN IF NOT EXISTS recipe jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.services.recipe IS
    '122 · Hizmette tüketilen sarf: [{productId, quantity}]. Ayarlar → Hizmetler → Reçete.';

NOTIFY pgrst, 'reload schema';

COMMIT;
