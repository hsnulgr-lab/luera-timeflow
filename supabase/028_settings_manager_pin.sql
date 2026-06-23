-- ============================================================
-- TimeFlow Migration 028: Yönetici PIN (mobil rol kapısı)
-- ============================================================
-- Mobil uygulamada varsayılan görünüm operasyoneldir (para yok).
-- "Yönetici Girişi" bu PIN ile açılır → ciro + tam erişim görünür.
-- PIN düz metin değil; istemci SHA-256 hash'ini yazar (kiosk modu).
-- ============================================================

ALTER TABLE public.settings
    ADD COLUMN IF NOT EXISTS manager_pin TEXT;

NOTIFY pgrst, 'reload schema';
