-- 067: Güzellik büyüme otomasyonu
-- 0) customers.last_visit — uygulama bu kolonu zaten okuyor (useCustomers) ama
--    kolon DB'de hiç yoktu; burada eklenir, geçmiş tamamlanan randevulardan
--    doldurulur ve trigger'la güncel tutulur.
-- 1) services.recall_days — hizmet bazlı dönüş periyodu (manikür 21, lazer 45…).
--    Seans tamamlanınca customers.recall_date = seans tarihi + recall_days yazılır
--    (uygulama yönetir); remind cron'u mevcut recall akışıyla hatırlatır (065).
-- 2) customers.winback_sent_at — "sizi özledik" mesajı takibi; 60+ gün gelmeyene
--    cron'dan bir kez gönderilir, 90 gün geçmeden tekrarlanmaz.
-- 3) treatment_plans.renewal_offered_at — biten pakete yenileme teklifi takibi;
--    paket başına bir kez gönderilir.

alter table customers
    add column if not exists last_visit date,
    add column if not exists winback_sent_at timestamptz;

alter table services
    add column if not exists recall_days integer;

alter table treatment_plans
    add column if not exists renewal_offered_at timestamptz;

-- Geçmişi doldur: müşterinin son tamamlanan randevu tarihi
update customers c
set last_visit = sub.max_date
from (
    select customer_id, max(date) as max_date
    from reservations
    where status = 'completed' and customer_id is not null
    group by customer_id
) sub
where sub.customer_id = c.id
  and (c.last_visit is null or c.last_visit < sub.max_date);

-- Trigger: randevu 'completed' olunca müşterinin last_visit'i ileri atılır
create or replace function public.tg_update_customer_last_visit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if new.status = 'completed' and new.customer_id is not null then
        update customers
        set last_visit = greatest(coalesce(last_visit, new.date), new.date)
        where id = new.customer_id;
    end if;
    return new;
end $$;

drop trigger if exists trg_customer_last_visit on reservations;
create trigger trg_customer_last_visit
    after insert or update of status on reservations
    for each row execute function public.tg_update_customer_last_visit();

-- Cron taramaları için: son ziyareti eski, mesajı gönderilmemiş müşteriler
create index if not exists idx_customers_winback
    on public.customers(organization_id, last_visit)
    where last_visit is not null;
