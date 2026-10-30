-- ============================================================
-- TimeFlow Migration 133: Gün sonu kasa kapanışı — cash_closings
-- ============================================================
-- 2026-10-31, masaüstü Kasa tasarım turu. "Gün sonu" penceresi yalnız günün
-- toplamını gösteriyordu; kasanın sayıldığı, beklenenle farkın görüldüğü ve
-- kimin ne zaman kapattığının kaldığı bir kayıt yoktu. Kullanıcı kararı
-- (2026-10-31): "Rapor + kasayı kapat".
--
-- ── Ne tutulur ──────────────────────────────────────────────────────────────
-- Bir işletme günü (business_day) için TEK satır. Beklenen nakit istemcide
-- hesaplanır (nakit tahsilat − nakit gider) ve kapanış anındaki hâliyle
-- DONDURULUR: sonradan bir tahsilat silinse ya da eklense bile o gün
-- "kapatırken ne gördük" sorusunun cevabı değişmez. `totals` aynı anın
-- dökümüdür (yöntem toplamları, işlem/iptal/gider sayıları) — rapor yeniden
-- yazdırıldığında kapanıştaki rakamlar basılır.
--
-- ── Neden güncellenebilir, neden silinemez ─────────────────────────────────
-- Yanlış sayılan kasa yeniden sayılır: aynı gün tekrar kapatılınca satır
-- güncellenir (upsert, unique org+gün). Silme politikası BİLEREK yok —
-- kapanış kaydı bir denetim izidir; istemci onu ortadan kaldıramaz.
--
-- ── Ne DEĞİŞMİYOR ───────────────────────────────────────────────────────────
-- • payments / expenses tablolarına dokunulmuyor; kapanış onları KİLİTLEMİYOR.
--   Kapalı güne geç tahsilat girilebilir; Kasa bunu "kapanıştan sonra
--   değişti" diye gösterir (istemci karşılaştırması).
-- • Mobil uygulama bu tabloyu okumuyor/yazmıyor.
-- ============================================================

begin;

create table if not exists public.cash_closings (
    id              uuid          primary key default gen_random_uuid(),
    organization_id uuid          not null references public.organizations(id) on delete cascade,
    business_day    date          not null,

    -- Kapanış anında hesaplanan beklenen nakit (nakit giriş − nakit gider).
    expected_cash   numeric(12,2) not null,
    -- Çekmecede sayılan nakit.
    counted_cash    numeric(12,2) not null check (counted_cash >= 0),
    -- Fazla (+) / eksik (−). Türetilmiş: iki kaynak birbirinden kopamaz.
    difference      numeric(12,2) generated always as (counted_cash - expected_cash) stored,

    -- Kapanış anının dökümü: {"cash":…, "card":…, "transfer":…, "other":…,
    -- "income":…, "expense":…, "count":…, "voids":…, "expenses":…}
    totals          jsonb         not null default '{}'::jsonb,
    note            text,

    closed_by       uuid          references auth.users(id) on delete set null default auth.uid(),
    closed_at       timestamptz   not null default now(),

    constraint cash_closings_one_per_day unique (organization_id, business_day)
);

create index if not exists idx_cash_closings_org_day
    on public.cash_closings(organization_id, business_day desc);

alter table public.cash_closings enable row level security;

drop policy if exists "cash_closings_select" on public.cash_closings;
create policy "cash_closings_select" on public.cash_closings
    for select to authenticated
    using (organization_id in (select auth_user_org_ids()));

drop policy if exists "cash_closings_insert" on public.cash_closings;
create policy "cash_closings_insert" on public.cash_closings
    for insert to authenticated
    with check (organization_id in (select auth_user_org_ids()));

drop policy if exists "cash_closings_update" on public.cash_closings;
create policy "cash_closings_update" on public.cash_closings
    for update to authenticated
    using (organization_id in (select auth_user_org_ids()))
    with check (organization_id in (select auth_user_org_ids()));

-- DELETE politikası yok: kapanış kaydı silinemez (bkz. başlık).

comment on table public.cash_closings is
    'Gün sonu kasa kapanışı (133). Org+gün başına tek satır; yeniden sayımda güncellenir, silinmez.';

commit;

notify pgrst, 'reload schema';
