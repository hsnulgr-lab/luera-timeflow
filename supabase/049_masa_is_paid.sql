-- ============================================================
-- TimeFlow Migration 049: Masa ödeme durumu (is_paid)
-- ============================================================
-- Hizmet (randevu) akışındaki isPaid deseniyle aynı: garson adisyonu
-- "Kasaya Gönder" dediğinde masa status → completed olur ama ödeme henüz
-- ALINMAMIŞ (is_paid = false) — masa dashboard'da serbest görünür, Kasa/
-- yönetici daha sonra bu masayı "ödenmedi" olarak görüp asıl tahsilatı
-- (MasaPage completeTable / MobileAdisyonSheet) kaydettiğinde is_paid = true
-- olur. Kasa/yönetici doğrudan (garson adımı olmadan) kapattığında da her
-- zaman is_paid = true yazılır — o an gerçek tahsilat/ikram kaydı alınmıştır.
-- Kolon opsiyonel/nullable-değil ama DEFAULT true — mevcut "completed"
-- kayıtlar (bu migration öncesi hep ödeme ile kapanmıştı) geriye dönük
-- doğru sınıflanır; yalnızca yeni "garson gönderdi" kayıtları false olur.
-- ============================================================

ALTER TABLE public.table_reservations
    ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
