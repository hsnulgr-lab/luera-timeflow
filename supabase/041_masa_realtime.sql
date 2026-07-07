-- 041_masa_realtime.sql — masa modülünü canlı (realtime) yap
-- 034/036/040 ile reservations, payments, waitlist publication'a eklenmişti;
-- tables + table_reservations aynı desende eksikti. Masa Yönetimi ekranı
-- (MasaPage) her cihazda kendi fetch anında donuyordu — kasadaki ekleme
-- garsonun telefonunda görünmüyordu. Bu migration + client subscription ile
-- masa ekleme/silme ve rezervasyon/oturt/tamamla tüm cihazlarda anlık akar.

-- DELETE/UPDATE olaylarında eski satırın tüm alanları (organization_id filtresi için) gelsin
alter table tables replica identity full;
alter table table_reservations replica identity full;

-- Tabloları realtime publication'a ekle (zaten ekliyse tekrar ekleme)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tables'
  ) then
    alter publication supabase_realtime add table tables;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'table_reservations'
  ) then
    alter publication supabase_realtime add table table_reservations;
  end if;
end $$;
