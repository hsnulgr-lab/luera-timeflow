-- 035_reservation_group.sql — Çoklu hizmet/personel: gruplu randevular
-- Bir müşteri tek ziyarette birden çok hizmet alabilir (furkan saç + Nisa pedikür).
-- Her hizmet kendi reservation satırı olarak kalır (personel paneli/takvim/çakışma
-- aynen çalışır); aynı booking'in satırları group_id ile birbirine bağlanır.
-- Kasa bu gruba göre tek birleşik adisyonda toplar. Tekli randevuda group_id boş.
alter table reservations add column if not exists group_id uuid;
create index if not exists idx_reservations_group_id on reservations(group_id) where group_id is not null;
