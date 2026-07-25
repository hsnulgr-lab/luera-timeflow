-- Migration 070: WhatsApp altyapısı — multi-tenant, loglu, kotalı
-- ---------------------------------------------------------------------------
-- Neden: whatsapp_instance bugün settings tablosunda duruyor; settings org
-- başına DEĞİL kullanıcı başına tek satır (user_id UNIQUE). 3 üyeli bir org'da
-- 3 satır oluyor ve instance → org çözümü belirsiz kalıyor. Ayrıca instance adı
-- kullanıcıdan elle alındığı için iki işletme aynı adı yazıp aynı WhatsApp
-- hattına bağlanabiliyordu.
--
-- Bu migration bağlantıyı org başına TEK satıra taşır (org_whatsapp), instance
-- adını org id'den türetir, gelen webhook için org'a özel bir sır üretir, her
-- mesajı loglar ve müşteriye opt-out hakkı verir.
-- ---------------------------------------------------------------------------

-- ── 1. Bağlantı: org başına tek satır ───────────────────────────────────────
create table if not exists public.org_whatsapp (
    organization_id uuid primary key references public.organizations(id) on delete cascade,
    -- tf_<orgid dashsız>. NULL = hiç bağlanmamış. Ad org'dan TÜRETİLDİĞİ için
    -- bir tenant başka bir tenant'ın instance'ına yapısal olarak erişemez.
    instance        text unique,
    status          text not null default 'disconnected'
                    check (status in ('disconnected', 'connecting', 'connected')),
    -- Evolution'dan gelen webhook'u doğrulamak için; URL'de ?s=<secret> gider.
    webhook_secret  uuid not null default gen_random_uuid(),
    connected_at    timestamptz,
    last_seen_at    timestamptz,
    last_error      text,
    -- İşletmenin adına giden otomatik mesajları açıp kapatması için.
    -- assistant Faz 2'de kullanılacak (paket/seans/bakiye soruları).
    features        jsonb not null default
                    '{"winback":true,"renewal":true,"recall":true,"assistant":false}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_org_whatsapp_instance on public.org_whatsapp(instance);

alter table public.org_whatsapp enable row level security;

-- Okuma org üyelerine açık (Ayarlar durumu gösterir); YAZMA policy'si yok →
-- yalnız service_role (whatsapp-proxy) değiştirebilir. app_secrets (011) ve
-- whatsapp_sessions (021) ile aynı desen.
drop policy if exists org_whatsapp_read on public.org_whatsapp;
create policy org_whatsapp_read on public.org_whatsapp
    for select to authenticated
    using (organization_id in (select auth_user_org_ids()));

-- Var olan org'lar için boş satır (henüz bağlı değil)
insert into public.org_whatsapp (organization_id, status)
select o.id, 'disconnected'
from public.organizations o
on conflict (organization_id) do nothing;

-- Yeni org açıldığında satır otomatik gelsin
create or replace function public.create_org_whatsapp() returns trigger as $$
begin
    insert into public.org_whatsapp (organization_id, status)
    values (new.id, 'disconnected')
    on conflict (organization_id) do nothing;
    return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_070_org_whatsapp on public.organizations;
create trigger trg_070_org_whatsapp
    after insert on public.organizations
    for each row execute function public.create_org_whatsapp();

-- settings.whatsapp_instance artık okunmuyor. Kolonu şimdilik bırakıyoruz
-- (geri dönüş kolaylığı); bir sonraki migration düşürecek.
comment on column public.settings.whatsapp_instance is
    'DEPRECATED (070) — bağlantı artık org_whatsapp tablosunda. Bu kolon okunmuyor.';

-- ── 2. Mesaj kaydı: kime ne gönderildi ──────────────────────────────────────
-- Bugün sadece reminder_24h_sent gibi boolean bayraklar var; "müşteri mesaj
-- gelmedi diyor" durumunda elde kanıt yok. Kota hesabı da bu tablodan yapılır.
create table if not exists public.wa_message_log (
    id              bigserial primary key,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    direction       text not null check (direction in ('out', 'in')),
    phone           text not null,          -- normalize edilmiş (90XXXXXXXXXX)
    customer_id     uuid references public.customers(id) on delete set null,
    kind            text not null,          -- reminder_24h | recall | winback | …
    body            text,
    status          text not null check (status in ('sent', 'failed', 'skipped')),
    error           text,
    provider_msg_id text,
    created_at      timestamptz not null default now()
);

create index if not exists idx_wa_log_org_time
    on public.wa_message_log(organization_id, created_at desc);
-- Kişi başına kota sorgusu bu indeksi kullanır
create index if not exists idx_wa_log_org_phone_time
    on public.wa_message_log(organization_id, phone, created_at desc);

alter table public.wa_message_log enable row level security;

drop policy if exists wa_message_log_read on public.wa_message_log;
create policy wa_message_log_read on public.wa_message_log
    for select to authenticated
    using (organization_id in (select auth_user_org_ids()));

-- ── 3. Opt-out: "bana mesaj göndermeyin" ────────────────────────────────────
-- Ticari elektronik ileti tarafında çıkış hakkı zorunlu; bugün böyle bir yol yok.
alter table public.customers
    add column if not exists wa_opt_out    boolean not null default false,
    add column if not exists wa_opt_out_at timestamptz;

-- ── 4. Gelen mesaj idempotency'si ───────────────────────────────────────────
-- Evolution aynı messages.upsert'i tekrar POST ederse durum makinesi ikinci kez
-- çalışmasın (aynı randevu iki kez oluşabiliyordu).
create table if not exists public.wa_inbound_seen (
    provider_msg_id text primary key,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    created_at      timestamptz not null default now()
);

create index if not exists idx_wa_inbound_seen_time on public.wa_inbound_seen(created_at);

alter table public.wa_inbound_seen enable row level security;
-- Policy yok → yalnız service_role. Kullanıcının görmesi gereken bir şey değil.

-- ── 5. Realtime ─────────────────────────────────────────────────────────────
-- QR okutulduğu anda Ayarlar ekranı kendiliğinden "Bağlı"ya dönsün; bağlantı
-- düşünce uyarı bandı sayfa yenilemeden çıksın. (034/036/068 ile aynı desen.)
alter table public.org_whatsapp replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'org_whatsapp'
  ) then
    alter publication supabase_realtime add table public.org_whatsapp;
  end if;
end $$;

notify pgrst, 'reload schema';
