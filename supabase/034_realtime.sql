-- 034_realtime.sql — Canlı (realtime) güncellemeler
-- SORUN: reservations tablosu `supabase_realtime` publication'ında değildi.
-- Abonelik SUBSCRIBED oluyor ama hiç postgres_changes olayı gelmiyordu; bu yüzden
-- yeni/değişen randevu ancak uygulama yeniden açılıp veri yeniden çekilince görünüyordu.
-- Tabloları publication'a ekleyince desktop + mobil, tüm cihazlar sayfa yenilemeden
-- canlı güncellenir. (queue_entries de aynı abonelik desenini kullanıyor.)

-- Publication yoksa oluştur (Supabase'de varsayılan olarak vardır; güvenlik için)
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- DELETE/UPDATE olaylarında eski satırın alanları (organization_id filtresi) gelsin
alter table reservations replica identity full;
alter table queue_entries replica identity full;

-- Tabloları realtime publication'a ekle (zaten ekliyse tekrar ekleme)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservations'
  ) then
    alter publication supabase_realtime add table reservations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'queue_entries'
  ) then
    alter publication supabase_realtime add table queue_entries;
  end if;
end $$;
