-- ============================================================
-- TimeFlow Migration 048: Masa bölgesi + bekleme listesi kişi sayısı
-- ============================================================
-- Masa Yönetimi tasarımı (design handoff) masaları bölgelere göre grupluyor
-- (Salon/Teras/Bar) ve restoranın bekleme listesini gösteriyor. Bekleme
-- listesi için ayrı bir tablo açmak yerine mevcut Sıra modülünü
-- (queue_entries — kuaför/berber walk-in kuyruğu) restoranlarda da
-- kullanıyoruz; sadece "kaç kişi bekliyor" bilgisi eksikti.
-- Her iki kolon da opsiyonel/varsayılanlı — mevcut kayıtlar bozulmaz.
-- ============================================================

ALTER TABLE public.tables
    ADD COLUMN IF NOT EXISTS zone TEXT NOT NULL DEFAULT 'Salon';

ALTER TABLE public.queue_entries
    ADD COLUMN IF NOT EXISTS party_size INT NOT NULL DEFAULT 2;

NOTIFY pgrst, 'reload schema';
