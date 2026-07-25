-- 068_packages_customers_realtime.sql — treatment_plans + customers'ı canlı yap
-- 034 (reservations/queue) ve 036 (payments) aynı deseni kurmuştu. Güzellik
-- dashboard'unun fırsat şeridi (paket yenileme/planlanmamış seans) ve sadakat
-- damgası çok cihazlı çalışsın diye bu iki tablo da publication'a girmeli:
-- başka bir cihazda paket satılınca / damga verilince ekranlar sayfa
-- yenilemeden güncellensin.

-- DELETE/UPDATE olaylarında eski satırın tüm alanları (organization_id filtresi
-- için) gelsin — yoksa istemcideki org-filtreli abonelik DELETE'i alamaz.
alter table treatment_plans replica identity full;
alter table customers replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'treatment_plans'
  ) then
    alter publication supabase_realtime add table treatment_plans;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'customers'
  ) then
    alter publication supabase_realtime add table customers;
  end if;
end $$;
