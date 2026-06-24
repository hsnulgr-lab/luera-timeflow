-- 029_loyalty.sql — Dijital Müşteri Kartı (sadakat damgası)
-- "N ziyarette 1 ödül". Damga, randevu 'completed' olunca trigger ile artar;
-- idempotent (loyalty_counted) — mobil/masaüstü/edge fark etmez.

-- Org ayarları
alter table settings    add column if not exists loyalty_enabled   boolean default false;
alter table settings    add column if not exists loyalty_threshold int     default 10;
alter table settings    add column if not exists loyalty_reward     text    default 'Ücretsiz hizmet';

-- Müşteri damga sayacı + randevu idempotency bayrağı
alter table customers   add column if not exists loyalty_stamps  int     default 0;
alter table reservations add column if not exists loyalty_counted boolean default false;

-- Randevu 'completed' olunca müşteriye +1 damga (yalnızca bir kez)
create or replace function bump_loyalty() returns trigger
language plpgsql as $$
begin
  if new.status = 'completed'
     and (old.status is distinct from 'completed')
     and not coalesce(new.loyalty_counted, false)
     and new.customer_id is not null then
    update customers
       set loyalty_stamps = coalesce(loyalty_stamps, 0) + 1
     where id = new.customer_id;
    new.loyalty_counted := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bump_loyalty on reservations;
create trigger trg_bump_loyalty
  before update on reservations
  for each row execute function bump_loyalty();
