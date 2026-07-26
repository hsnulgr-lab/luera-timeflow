-- Migration 071: Google değerlendirme mesajı + indirim kodlu winback
-- ---------------------------------------------------------------------------
-- İki yeni otomasyon:
--
-- 1) Tahsilat tamamlandıktan ~3 saat sonra müşteriye Google değerlendirme
--    daveti. İşletmenin puanı büyümenin en ucuz kaldıracı ama kimse elle
--    istemiyor. Gönderim remind cron'una takılır (ayrı zamanlayıcı yok).
--
-- 2) "Sizi özledik" mesajına indirim teklifi. İşletme oranı bir kez belirler,
--    her müşteriye ÖZEL bir kod üretilir ve Kasa'da tanınır. Kod olmadan
--    "kim döndü" ölçülemiyordu; indirim veriliyor ama karşılığı bilinmiyordu.
-- ---------------------------------------------------------------------------

-- ── 1. Google değerlendirme linki ───────────────────────────────────────────
-- maps_url (013) yol tarifi için; değerlendirme linki AYRI bir URL
-- (…/review?placeid=… ya da g.page/r/…/review) ve doğrudan yorum formunu açar.
alter table public.organizations
    add column if not exists google_review_url text;

-- Aynı randevu için ikinci kez davet gitmesin. rebook_sent (067) ile aynı desen.
alter table public.reservations
    add column if not exists review_sent boolean not null default false;

-- Davet, tahsilat saatinden sayılır. payments.paid_at üzerinden de bulunabilirdi
-- ama randevu başına birden fazla ödeme olabiliyor (kapora, bölünmüş tahsilat);
-- "hesap ne zaman kapandı" bilgisi randevuda net durmalı.
alter table public.reservations
    add column if not exists paid_at timestamptz;

-- paid_at'i uygulamaya bırakmıyoruz: hesap üç ayrı yerden kapanabiliyor
-- (Kasa sayfası, güzellik kasası, mobil kasa) ve biri unutulursa değerlendirme
-- daveti sessizce gitmez. is_paid true'ya döndüğü an tetikleyici damgalar.
create or replace function public.stamp_reservation_paid_at()
returns trigger
language plpgsql
as $$
begin
    if new.is_paid is true and (old.is_paid is distinct from true) and new.paid_at is null then
        new.paid_at := now();
    end if;
    -- Hesap yeniden açılırsa (iade/düzeltme) damga da düşer ki davet gitmesin.
    if new.is_paid is not true then
        new.paid_at := null;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_reservations_paid_at on public.reservations;
create trigger trg_reservations_paid_at
    before update on public.reservations
    for each row
    execute function public.stamp_reservation_paid_at();

create index if not exists idx_reservations_review_pending
    on public.reservations(organization_id, paid_at)
    where review_sent = false and paid_at is not null;

-- ── 2. Winback indirim ayarları ─────────────────────────────────────────────
-- settings kullanıcı başına tek satır ama bu alanlar işletme geneli; org'daki
-- her üye aynı değeri görsün diye organizations'a yazılır (settings'e değil).
alter table public.organizations
    add column if not exists winback_discount_percent integer not null default 0
        check (winback_discount_percent between 0 and 100),
    -- Kod kaç gün geçerli. 0 = süresiz.
    add column if not exists winback_discount_days integer not null default 30
        check (winback_discount_days >= 0);

-- ── 3. İndirim kodları ──────────────────────────────────────────────────────
create table if not exists public.discount_codes (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    customer_id     uuid references public.customers(id) on delete cascade,
    -- İnsan okuyup telefonda söyleyebilsin diye kısa ve büyük harf.
    -- Org içinde tekil; iki org aynı kodu kullanabilir.
    code            text not null,
    percent         integer not null check (percent between 1 and 100),
    -- Hangi otomasyon ürettiyse: bugün yalnız 'winback', ileride kampanya olur.
    source          text not null default 'winback',
    expires_at      timestamptz,
    redeemed_at     timestamptz,
    -- Hangi tahsilatta kullanıldı — "indirim ne getirdi" raporu için.
    redeemed_payment_id uuid references public.payments(id) on delete set null,
    created_at      timestamptz not null default now(),
    unique (organization_id, code)
);

create index if not exists idx_discount_codes_lookup
    on public.discount_codes(organization_id, code);
create index if not exists idx_discount_codes_customer
    on public.discount_codes(organization_id, customer_id)
    where redeemed_at is null;

alter table public.discount_codes enable row level security;

-- Okuma org üyelerine açık: Kasa kodu doğrulayabilmeli.
create policy discount_codes_read on public.discount_codes
    for select
    using (organization_id in (select auth_user_org_ids()));

-- Kullanıldı işaretini Kasa (giriş yapmış kullanıcı) atar; üretimi ise cron
-- yaptığı için insert yalnız service_role'da kalır.
create policy discount_codes_redeem on public.discount_codes
    for update
    using (organization_id in (select auth_user_org_ids()))
    with check (organization_id in (select auth_user_org_ids()));

-- ── 4. features'a review anahtarı ───────────────────────────────────────────
-- Mevcut satırlarda eksik kalırsa featureOn() varsayılanı true döner; yine de
-- Ayarlar'daki toggle'ın ilk açılışta doğru görünmesi için yazıyoruz.
update public.org_whatsapp
   set features = features || '{"review":true,"confirmation":true}'::jsonb
 where not (features ? 'review') or not (features ? 'confirmation');

alter table public.org_whatsapp
    alter column features set default
    '{"winback":true,"renewal":true,"recall":true,"assistant":false,"review":true,"confirmation":true}'::jsonb;
