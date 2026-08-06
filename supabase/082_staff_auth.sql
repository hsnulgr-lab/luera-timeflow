-- 082 — Personel kimliği: sunucu tarafı PIN doğrulama, oturum iptali, deneme limiti
--
-- Bugünkü durum ve neden değişiyor:
--   1. PIN hash'i istemciye iniyor (staff.pin, StaffLogin `select('*')` ile alıyor)
--      ve karşılaştırma TARAYICIDA yapılıyor. 4 haneli PIN'in SHA-256'sı
--      çevrimdışı milisaniyede kırılır; hash'i görmek ağ sekmesini açmaya bakar.
--   2. Deneme limiti yok — 10.000 kombinasyon serbestçe denenebilir.
--   3. Personel cihazı org SAHİBİNİN Supabase oturumuyla bağlanıyor; arayüz
--      "kendi randevuların" gösterse de sunucu hiçbir şey daraltmıyor.
--   4. İşten çıkan personelin erişimi kesilemiyor.
--
-- Bu migration ADDITIVE'dir: mevcut akış çalışmaya devam eder. `staff.pin`
-- sütununun istemciden gizlenmesi bilinçli olarak 083'e bırakıldı — o değişiklik
-- StaffLogin'in staff-api'ye geçmesiyle AYNI ANDA uygulanmalı, yoksa personel
-- girişi kırılır.

-- ── Oturum kuşağı ───────────────────────────────────────────────────────────
-- Token'ın içinde taşınır. Sayı artınca o personelin daha önce dağıtılmış TÜM
-- token'ları geçersiz olur. "İşten çıkanın erişimi kesilsin" bununla çalışır;
-- token listesi tutmaya gerek kalmaz.
alter table public.staff
    add column if not exists session_epoch integer not null default 1,
    add column if not exists pin_attempts integer not null default 0,
    add column if not exists pin_locked_until timestamptz,
    add column if not exists last_login_at timestamptz;

comment on column public.staff.session_epoch is
    'Token kuşağı. Artırıldığında personelin tüm oturumları düşer (pasifleştirme, PIN değişimi).';
comment on column public.staff.pin_locked_until is
    'Bu ana kadar PIN denemesi reddedilir. Deneme limiti aşılınca yazılır.';

-- ── Oturumu kendiliğinden düşüren tetikleyici ───────────────────────────────
-- Pasifleştirme ve PIN değişimi UNUTULABİLİR işlerdir; kuşağı elle artırmayı
-- beklemek yerine veritabanı garanti etsin.
create or replace function public.bump_staff_session_epoch()
returns trigger
language plpgsql
as $$
begin
    if (old.is_active is distinct from new.is_active and new.is_active = false)
       or (old.pin is distinct from new.pin)
       or (old.role is distinct from new.role)
    then
        new.session_epoch := coalesce(old.session_epoch, 1) + 1;
        -- Rol değişince eski token eski yetkiyi taşımaya devam etmesin.
        new.pin_attempts := 0;
        new.pin_locked_until := null;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_082_staff_epoch on public.staff;
create trigger trg_082_staff_epoch
    before update on public.staff
    for each row
    execute function public.bump_staff_session_epoch();

-- ── Denetim izi ─────────────────────────────────────────────────────────────
-- Append-only. "Kim ne zaman girdi, kim başarısız oldu" sorusunun tek cevabı.
-- İade/iptal denetimi (2.1d) de bu tabloya yaslanacak.
create table if not exists public.staff_auth_log (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    staff_id uuid references public.staff(id) on delete set null,
    event text not null check (event in ('login', 'failed_pin', 'locked', 'revoked')),
    ip text,
    user_agent text,
    created_at timestamptz not null default now()
);

create index if not exists idx_staff_auth_log_org
    on public.staff_auth_log (organization_id, created_at desc);

alter table public.staff_auth_log enable row level security;

-- Yalnız OKUMA ve yalnız org üyelerine: kayıt yalnızca service_role ile
-- (staff-api) yazılır, istemci kendi denetim izini uyduramamalı.
drop policy if exists staff_auth_log_select on public.staff_auth_log;
create policy staff_auth_log_select on public.staff_auth_log
    for select
    using (organization_id in (select auth_user_org_ids()));

-- ── Token imza anahtarı ─────────────────────────────────────────────────────
-- app_secrets deseninde (bkz. _shared/wa.ts getSecret). Yoksa staff-api
-- kimlik üretmeyi reddeder — sessizce zayıf bir varsayılana düşmez.
insert into public.app_secrets (key, value)
select 'STAFF_TOKEN_SECRET', encode(gen_random_bytes(32), 'hex')
where not exists (select 1 from public.app_secrets where key = 'STAFF_TOKEN_SECRET');
