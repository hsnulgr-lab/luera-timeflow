-- 065: Diş kontrol (recall) hatırlatma takibi
-- customers.recall_date için WhatsApp hatırlatması `remind` cron'undan gider.
-- recall_reminded_for, hangi kontrol tarihi için hatırlatıldığını tutar; böylece
-- aynı kontrol için tekrar mesaj atılmaz. Hekim yeni kontrol tarihi yazınca
-- (recall_date değişince) alan NULL'a düşer → yeni kontrol için tekrar gönderilir.

alter table customers
    add column if not exists recall_reminded_for date;

create or replace function reset_recall_reminded() returns trigger as $$
begin
    if new.recall_date is distinct from old.recall_date then
        new.recall_reminded_for := null;
    end if;
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_065_reset_recall_reminded on customers;
create trigger trg_065_reset_recall_reminded
    before update of recall_date on customers
    for each row execute function reset_recall_reminded();

-- Cron'un taradığı kısmi indeks: yalnız kontrolü olan hastalar
create index if not exists idx_customers_recall_pending
    on customers (organization_id, recall_date)
    where recall_date is not null;

notify pgrst, 'reload schema';
