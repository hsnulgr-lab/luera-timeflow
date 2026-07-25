-- 064: Plan başına çoklu seans (kanal tedavisi 1/3 gibi)
-- treatment_plans'a seans sayacı ekler. Eski satırlar 1 seanslık kabul edilir;
-- sessions_done, plan tamamlandığında session_count'a eşitlenir (UI yönetir).

alter table treatment_plans
    add column if not exists session_count integer not null default 1,
    add column if not exists sessions_done integer not null default 0;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'treatment_plans_sessions_valid'
    ) then
        alter table treatment_plans
            add constraint treatment_plans_sessions_valid
            check (session_count between 1 and 50 and sessions_done between 0 and session_count);
    end if;
end $$;
