-- 033_service_flow.sql — Personel Hizmet Detayı 4-adımlı akış
-- Akış: Başladı (arrived_at) → canlı adisyon (adisyon_items) → Bitti (service_ended_at)
--       → Kasaya Gönder (tahsilat → status=completed).
-- arrived_at (032) "Başladı" damgası olarak yeniden kullanılır; yeni status enum yok.
alter table reservations add column if not exists service_ended_at timestamptz;
alter table reservations add column if not exists adisyon_items jsonb not null default '[]'::jsonb;
