-- 032_arrived.sql — Randevu yaşam döngüsü: "Müşteri Geldi" adımı
-- Yeni status enum DEĞİL (mevcut 4 durum korunur). confirmed + arrived_at dolu = "hizmette".
alter table reservations add column if not exists arrived_at timestamptz;
