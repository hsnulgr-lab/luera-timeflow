-- ============================================================
-- TimeFlow Migration 043: Masa adisyonu (restoran POS)
-- ============================================================
-- Masaya kalemli adisyon: garson menüden ürün ekler (adet ile), toplam birikir,
-- "Hesabı Kapat" ile Kasa'ya (payments) yazılır. Randevu adisyonundan (reservations
-- .adisyon_items) BAĞIMSIZ — kendi MasaAdisyonItem tipi (adet dahil).
--   • table_reservations.adisyon_items : [{ id, name, price, qty, kind }]
--   • products.category                : menü gruplaması (Yemek/İçecek/Tatlı…)
-- table_reservations zaten realtime publication'da (041) + replica identity full;
-- adisyon_items değişimi tüm cihazlara anlık akar (ana bilgisayar ↔ garson).
-- Kolonlar opsiyonel/DEFAULT'lu — mevcut kayıtlar ve akışlar bozulmaz.
-- ============================================================

ALTER TABLE public.table_reservations
    ADD COLUMN IF NOT EXISTS adisyon_items JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS category TEXT;

NOTIFY pgrst, 'reload schema';
