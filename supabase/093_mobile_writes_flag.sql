-- ============================================================
-- TimeFlow Migration 093: Mobil yazmalarının acil durum vanası
-- ============================================================
-- `D1`den ÖNCE. Mobil ilk kez gerçek veriye yazmaya başlarken elimizdeki tek
-- geri dönüş yolu bu: tek bir UPDATE ile bütün yazma uçları kapanır.
--
-- Sonradan koymanın anlamı yok — vanaya ihtiyaç duyulduğu an, deploy
-- bekleyecek an değildir.
--
-- ── Varsayılan AÇIK, ve bu bilinçli ────────────────────────────────────────
-- Satır yoksa ya da değeri 'off' değilse yazmalar çalışır. Ters kurgu
-- (yoksa kapalı) daha "güvenli" görünür ama anahtar adında bir yazım hatası
-- ya da unutulmuş bir satır bütün salonu durdururdu. Vananın işi olağan
-- durumu değiştirmek değil, olağandışı durumda müdahale edebilmek.
--
-- ── Kapatmak İŞİ SİLMİYOR ──────────────────────────────────────────────────
-- Uç 503 dönüyor; istemcinin kader ayrımı (`mobile/src/lib/retry.ts`) 5xx'i
-- GEÇİCİ sayıyor, yani adisyon telefonun kuyruğunda bekliyor ve vana
-- açıldığında kendiliğinden gidiyor. Kaybolan bir şey yok — duran bir şey var.
-- Tekrar açıldığında biriken işler idempotens kütüğüne (092) çarptığı için
-- çift kayıt da oluşmuyor.
-- ============================================================

INSERT INTO public.app_secrets (key, value)
VALUES ('MOBILE_WRITES_ENABLED', 'on')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.app_secrets IS
    'Edge function sırları ve bayrakları. MOBILE_WRITES_ENABLED=''off'' mobil yazma uçlarını (visit.*) 503 ile kapatır; okuma uçları etkilenmez.';

-- Kapatmak için:
--   UPDATE public.app_secrets SET value = 'off', updated_at = now()
--    WHERE key = 'MOBILE_WRITES_ENABLED';
-- Açmak için aynı satıra 'on'.

NOTIFY pgrst, 'reload schema';
