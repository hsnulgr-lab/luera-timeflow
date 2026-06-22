-- ============================================================
-- TimeFlow Migration 026: Personel PIN (çoklu çalışan girişi)
-- ============================================================
-- Personel kendi PIN'i ile "Personel Modu"na girer (cihaz-içi/kiosk).
-- PIN düz metin DEĞİL — istemci SHA-256 hash'ini yazar (hafif gizleme).
-- Gerçek izolasyon değil; org RLS'i staff tablosunu zaten korur.
-- ============================================================

ALTER TABLE public.staff
    ADD COLUMN IF NOT EXISTS pin TEXT;

NOTIFY pgrst, 'reload schema';
