-- 040_waitlist_realtime.sql — waitlist tablosunu canlı (realtime) yap
-- 034_realtime.sql ile reservations + queue_entries, 036 ile payments
-- publication'a eklenmişti; waitlist aynı desende eksikti. Dolu güne müşteri
-- yazılınca müdürün açık ekranına otomatik düşmesi için bu gerekli — yoksa
-- sayfa yenilenene kadar liste eski kalıyor.

-- DELETE/UPDATE olaylarında eski satırın tüm alanları (organization_id filtresi için) gelsin
alter table waitlist replica identity full;

-- Tabloyu realtime publication'a ekle (zaten ekliyse tekrar ekleme)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'waitlist'
  ) then
    alter publication supabase_realtime add table waitlist;
  end if;
end $$;
