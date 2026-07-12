-- 047_organizations_realtime.sql — organizations.modules'ü canlı (realtime) yap
-- ModulesProvider sadece mount anında bir kere fetch ediyordu; modüller Ayarlar'dan
-- (bu sekmede ya da başka bir cihaz/sekmede) değiştirildiğinde açık sekmeler bunu
-- hiç öğrenmiyordu — bir sonraki reload'a kadar. O reload'da da SWR cache önce eski
-- (artık yanlış) değeri anında gösterip taze fetch gelince "zıplıyordu" (ör. Analiz
-- nav öğesi belirip 1sn sonra kayboluyordu). 036/040/041 ile payments/waitlist/masa
-- realtime'a alınmıştı; organizations aynı desende eksikti. Bu migration +
-- ModulesProvider'daki realtime abonelik ile modül değişiklikleri artık reload
-- gerekmeden anlık yayılır; SWR staleness penceresi tamamen kapanır.

-- UPDATE olaylarında tüm alanlar (organization filtresi/id için) gelsin
alter table organizations replica identity full;

-- Tabloyu realtime publication'a ekle (zaten ekliyse tekrar ekleme)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'organizations'
  ) then
    alter publication supabase_realtime add table organizations;
  end if;
end $$;

notify pgrst, 'reload schema';
