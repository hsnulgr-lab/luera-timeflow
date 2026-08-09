-- ============================================================
-- TimeFlow Migration 089: Personel kendi cirosunu görsün mü?
-- ============================================================
-- Mobil kumandanın "Performansım" ekranı için. Sabit bir özellik DEĞİL,
-- işletme ayarı — ve bu bilinçli:
--
-- Bazı salon sahipleri personeller arası kıyas istemiyor. "Ayşe bu ay 40 bin
-- yaptı" bilgisi ekipte huzursuzluk yaratabiliyor ve bunu bilen tek kişi
-- işletme sahibi. Ürünün bu tercihi ondan alması gerekir.
--
-- VARSAYILAN KAPALI. Açık varsayılan, hiç sorulmadan alınmış bir karardır;
-- kapalı varsayılan yalnızca bir eksikliktir. İşletme isterse açar.
--
-- Kapalıyken staff-api `performance` ucu 403 döner ve mobil o sekmeyi HİÇ
-- göstermez — gri/kilitli değil, yok. "Yetkiniz yok" diyen bir sekme,
-- personele patronunun ondan bir şey sakladığını söyler.
-- ============================================================

ALTER TABLE public.settings
    ADD COLUMN IF NOT EXISTS staff_can_see_revenue BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.settings.staff_can_see_revenue IS
    'Personel mobil kumandada kendi cirosunu görebilir mi? Varsayılan kapalı.';

NOTIFY pgrst, 'reload schema';
