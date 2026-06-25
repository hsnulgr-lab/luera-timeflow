-- 030_rebook.sql — Sıradaki Randevu Otomasyonu
-- Randevu 'completed' olunca müşteriye WhatsApp ile tekrar-randevu daveti.
-- Gönderim client tarafında tamamlanma anında yapılır; rebook_sent ile idempotent.

alter table settings     add column if not exists rebook_enabled boolean default false;
alter table settings     add column if not exists rebook_note    text    default '';  -- teşvik satırı (ör. "%10 erken rezervasyon indirimi")
alter table reservations add column if not exists rebook_sent    boolean default false;
