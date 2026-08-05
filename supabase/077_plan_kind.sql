-- 077 — Plan türü ayracı: klinik tedavi planı mı, ticari paket mi?
--
-- `treatment_plans` iki farklı işi taşıyor:
--   • klinik plan (diş, sağlık, fizyoterapi) — "kanal tedavisi, 3 seans"
--   • ticari paket (güzellik, kuaför, estetik) — "10 seans lazer, ₺8.000"
-- Tablo aynı olduğu için doğru; ama okuyan yüzeyler ayrı. Güzellik dashboard'ının
-- fırsat kuyruğu org'un TÜM planlarını çekiyordu ve orada implant/kanal satırları
-- görünüyordu.
--
-- `session_count > 1` fiilî ayraç olarak kullanılamaz: klinik planların çoğu da
-- çok seanslı (4 seanslık kanal tedavisi gerçek bir kayıt). Bu yüzden gerçek bir
-- damga gerekiyor.
--
-- Damgayı UYGULAMA DEĞİL TRIGGER basar: plan yazan birden fazla yol var
-- (useTreatmentPlans, useOrgPackages, ileride edge function) ve hepsinin sektörü
-- bilmesi gerekmez. Kaynak tek: settings.sector.

alter table public.treatment_plans
    add column if not exists plan_kind text;

do $$
begin
    alter table public.treatment_plans
        add constraint treatment_plans_plan_kind_check
        check (plan_kind is null or plan_kind in ('tedavi', 'paket'));
exception
    when duplicate_object then null;
end
$$;

comment on column public.treatment_plans.plan_kind is
    'tedavi = klinik tedavi planı (diş/sağlık/fizyo), paket = ticari seans paketi (güzellik/kuaför/estetik). Trigger settings.sector''den doldurur; kaynak: src/lib/sectorProfiles.ts planKindForSector';

-- ── Geçmiş kayıtlar ─────────────────────────────────────────────────────────
-- Plan oluşturulduğu andaki sektör saklanmadığı için org'un BUGÜNKÜ sektörüne
-- bakılır. Sektörü hiç değişmemiş org'larda bu doğru sonucu verir; sektörü
-- sonradan çevrilmiş demo org'unda vermez — o org zaten sıfırdan kurulacak.
update public.treatment_plans tp
   set plan_kind = case
        when s.sector in ('dis', 'saglik', 'fizyoterapi') then 'tedavi'
        else 'paket'
    end
  from public.settings s
 where s.organization_id = tp.organization_id
   and tp.plan_kind is null;

-- Ayarı olmayan org kalırsa (settings satırı yoksa) ticari paket sayılır.
update public.treatment_plans
   set plan_kind = 'paket'
 where plan_kind is null;

create index if not exists idx_treatment_plans_kind
    on public.treatment_plans(organization_id, plan_kind);

-- ── Yeni kayıtlar ───────────────────────────────────────────────────────────
create or replace function public.set_treatment_plan_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_sector text;
begin
    -- Uygulama açıkça yazdıysa dokunma: paket satışı sektörden bağımsız olarak
    -- kendi türünü bilir (bkz. useOrgPackages.addPackage).
    if new.plan_kind is not null then
        return new;
    end if;

    select s.sector into v_sector
      from public.settings s
     where s.organization_id = new.organization_id
     limit 1;

    new.plan_kind := case
        when v_sector in ('dis', 'saglik', 'fizyoterapi') then 'tedavi'
        else 'paket'
    end;
    return new;
end;
$$;

drop trigger if exists trg_077_plan_kind on public.treatment_plans;
create trigger trg_077_plan_kind
    before insert on public.treatment_plans
    for each row
    execute function public.set_treatment_plan_kind();

notify pgrst, 'reload schema';
