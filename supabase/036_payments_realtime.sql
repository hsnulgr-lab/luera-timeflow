-- 036_payments_realtime.sql — payments tablosunu canlı (realtime) yap
-- 034_realtime.sql ile reservations + queue_entries publication'a eklenmişti;
-- payments aynı desende eksikti. Kasa/tahsilat ekranları (KasaPage, MobileKasa,
-- AdisyonModal vb.) her biri kendi usePayments() çağrısıyla ayrı state tutuyor —
-- bu migration olmadan postgres_changes hiç event almıyor, ekranlar sayfa
-- yenilenene kadar eski kalıyordu.

-- DELETE/UPDATE olaylarında eski satırın tüm alanları (organization_id filtresi için) gelsin
alter table payments replica identity full;

-- Tabloyu realtime publication'a ekle (zaten ekliyse tekrar ekleme)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payments'
  ) then
    alter publication supabase_realtime add table payments;
  end if;
end $$;
