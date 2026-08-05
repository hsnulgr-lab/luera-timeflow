-- 080 — Gider defteri
--
-- Bugüne kadar sistem yalnız PARANIN GELDİĞİNİ biliyor (payments, 022). Kira,
-- maaş, malzeme alımı, elektrik, muhasebeci — hiçbiri kayıtlı değil. Sonuç:
-- Analiz sayfası "kâr" diye bir şey söyleyemiyor, yalnız ciro sayıyor. Salon
-- sahibinin ilk sorduğu soru ("bu ay kazandım mı?") cevapsız kalıyor.
--
-- ── Tekrarlı gider neden ayrı bir satır DEĞİL ───────────────────────────────
-- Kira ve maaş her ay aynı. Bunun için her ay satır ÜRETMEK (cron) cazip ama
-- yanlış: üretim kaçarsa ay eksik görünür, iki kez üretilirse kâr yanlış çıkar
-- ve geçmişi düzeltmek elle temizlik ister. Bunun yerine tekrarlı gider TEK
-- satırdır; rapor onu aylara YAYAR (bkz. src/lib/expenses.ts expandExpenses).
-- Böylece "kirayı 18.000'e çıkardık" demek tek bir tarih alanını değiştirmek
-- olur, geçmiş de kendiliğinden doğru kalır.

create table if not exists public.expenses (
    id              uuid          primary key default gen_random_uuid(),
    organization_id uuid          not null references public.organizations(id) on delete cascade,

    -- Kategoriler sabit: serbest metin olsaydı "Kira"/"kira"/"KİRA" üç ayrı
    -- kalem olur ve kategori bazlı rapor anlamını yitirirdi.
    category        text          not null default 'diger'
                      check (category in ('kira', 'personel', 'malzeme', 'fatura',
                                          'vergi', 'pazarlama', 'bakim', 'diger')),
    description     text,
    amount          numeric(10,2) not null check (amount > 0),
    method          text          not null default 'cash'
                      check (method in ('cash', 'card', 'transfer', 'other')),

    -- Giderin ait olduğu gün. Tekrarlı giderde: ilk geçerli olduğu ay.
    spent_on        date          not null default current_date,

    -- Tekrarlı gider (kira, maaş, abonelik). null = tek seferlik.
    recurrence      text          check (recurrence is null or recurrence in ('monthly')),
    -- Tekrarın bittiği ay; null = hâlâ sürüyor. Kirayı bırakınca burası dolar,
    -- geçmiş aylar bozulmadan kalır.
    ended_on        date,

    -- Kime/neye: personel gideri hangi çalışan, malzeme hangi tedarikçi.
    -- Tedarikçi şimdilik serbest metin — cari hesap ayrı bir iş.
    staff_id        uuid          references public.staff(id) on delete set null,
    supplier        text,

    created_by      uuid          references auth.users(id) on delete set null,
    created_at      timestamptz   not null default now(),

    -- Tekrar bitişi başlangıçtan önce olamaz
    constraint expenses_period_check check (ended_on is null or ended_on >= spent_on)
);

create index if not exists idx_expenses_org on public.expenses(organization_id, spent_on desc);
-- Rapor tekrarlı giderleri ayrıca tarar (tarih aralığı dışında da geçerli olabilirler)
create index if not exists idx_expenses_recurring on public.expenses(organization_id)
    where recurrence is not null;

alter table public.expenses enable row level security;

drop policy if exists "expenses_org_access" on public.expenses;
create policy "expenses_org_access" on public.expenses
    for all to authenticated
    using (organization_id in (select auth_user_org_ids()))
    with check (organization_id in (select auth_user_org_ids()));

comment on table public.expenses is
    'Gider defteri. Tekrarlı gider TEK satırdır, rapor aylara yayar (src/lib/expenses.ts).';

notify pgrst, 'reload schema';
