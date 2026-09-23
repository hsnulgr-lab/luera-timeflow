-- ============================================================
-- TimeFlow Migration 102: Silinen tahsilat bir DAMGA bırakır — payment_void_log
-- ============================================================
-- 2026-09-22, mobil Kasa borcu kazılırken bulundu. Masaüstünün
-- `usePayments.ts · removePayment/removeByReservation(s)` yolu bir tahsilatı
-- SESSİZCE siliyordu — DELETE dışında hiçbir iz kalmıyordu. Mobil Kasa'nın
-- "Düzelt" ekranı da tasarım gereği sil+yeniden-yaz olacağı için aynı deliğe
-- düşecekti. Kullanıcı kararı (2026-09-22): mobil Kasa ŞİMDİLİK salt okunur
-- kalıyor (2026-09-16 kararı korunuyor), yalnız denetim kaydı ekleniyor —
-- mobile yazma ucu AÇILMIYOR.
--
-- ── Neden trigger, neden uygulama kodu değil ─────────────────────────────────
-- İz TABLODA tutulursa masaüstü, ileride açılacak mobil yazma ve her neyse
-- gelecekteki üçüncü bir yol aynı korumadan geçer — üç istemciye üç kez aynı
-- "sil, sonra logla" mantığı yazılmaz (tek kaynak ilkesi). Uygulama kodu
-- (`usePayments.ts`) BİLEREK değiştirilmedi: `.delete()` çağrısı aynen duruyor,
-- iz DB'de kendiliğinden oluşuyor.
--
-- ── Ne DEĞİŞMİYOR ───────────────────────────────────────────────────────────
-- • Silme davranışı aynı kalıyor — hâlâ "sil, ihtiyaç olursa yeniden ekle".
--   Bu migration bir GERİ ALMA mekanizması değil, yalnız İZ bırakıyor.
-- • Mobilde hiçbir yeni yazma ucu açılmıyor. Kasa salt okunur kararı geçerli.
-- • Sebep/gerekçe (`reason`) YOK — hiçbir istemci bunu göndermiyor. Kolon
--   ileride bir "neden sildin" sorusu eklenirse ayrı migration'la gelir.
-- ============================================================

begin;

create table if not exists public.payment_void_log (
    id                uuid primary key default gen_random_uuid(),
    organization_id   uuid not null references public.organizations(id) on delete cascade,
    payment_id        uuid not null,
    payment_snapshot  jsonb not null,
    voided_by         uuid,
    voided_at         timestamptz not null default now()
);

comment on table public.payment_void_log is
    'Silinen payments satırının anlık görüntüsü (102). Trigger tarafından yazılır, istemci INSERT edemez.';
comment on column public.payment_void_log.payment_snapshot is
    'Silinmeden hemen önceki payments satırının tamamı (to_jsonb(old)).';
comment on column public.payment_void_log.voided_by is
    'auth.uid() — masaüstü/müdür oturumu varsa dolar. staff-api gibi service-role çağrılarında NULL kalır.';

create index if not exists idx_payment_void_log_org_time
    on public.payment_void_log(organization_id, voided_at desc);

alter table public.payment_void_log enable row level security;

drop policy if exists "org üyesi kendi salonunun iptal kaydını okur" on public.payment_void_log;
create policy "org üyesi kendi salonunun iptal kaydını okur"
    on public.payment_void_log
    for select
    to authenticated
    using (organization_id in (select auth_user_org_ids()));

-- ── Trigger: her payments DELETE'i kendiliğinden loglanır ───────────────────
--
-- AFTER DELETE + aynı transaction: log satırı yazılamazsa DELETE de geri
-- alınır. "Tahsilat sessizce silindi ama izi tutulamadı" durumu istemiyoruz —
-- ikisi birden olur ya da hiçbiri olmaz.

create or replace function public.log_payment_void()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.payment_void_log (organization_id, payment_id, payment_snapshot, voided_by)
    values (old.organization_id, old.id, to_jsonb(old), auth.uid());
    return old;
end;
$$;

-- 097'nin dersi: `from public` YETMEZ, Supabase anon/authenticated'a ayrıca
-- EXECUTE veriyor olabilir. Fonksiyon yalnız trigger'dan çağrılacak.
revoke all on function public.log_payment_void() from public, anon, authenticated;

-- İstemci payment_void_log'a doğrudan yazamaz — yalnız trigger (security
-- definer) yazar. Tabloya hiçbir INSERT/UPDATE/DELETE grant'i verilmiyor.

drop trigger if exists trg_payments_void_log on public.payments;
create trigger trg_payments_void_log
    after delete on public.payments
    for each row execute function public.log_payment_void();

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- DOĞRULAMA — migration'dan SONRA çalıştırın.
-- ============================================================
--
-- (a) Tablo ve trigger kurulu mu — 1 satır:
--
-- select tgname from pg_trigger
-- where tgrelid = 'public.payments'::regclass and tgname = 'trg_payments_void_log';
--
-- (b) İstemci rolleri fonksiyonu çağıramıyor — ikisi de false:
--
-- select has_function_privilege('anon', 'public.log_payment_void()', 'execute') as anon,
--        has_function_privilege('authenticated', 'public.log_payment_void()', 'execute') as authenticated;
--
-- (c) İstemci tabloya yazamıyor — üçü de false:
--
-- select has_table_privilege('authenticated', 'public.payment_void_log', 'insert') as ins,
--        has_table_privilege('authenticated', 'public.payment_void_log', 'update') as upd,
--        has_table_privilege('authenticated', 'public.payment_void_log', 'delete') as del;
--
-- (d) Uçtan uca — test org'da bir test tahsilatı ekleyip silin, sonra:
--
-- select payment_id, voided_by, voided_at, payment_snapshot->>'amount' as tutar
-- from public.payment_void_log
-- order by voided_at desc limit 1;
--
-- ── Geri alma ──────────────────────────────────────────────────────────────
-- drop trigger if exists trg_payments_void_log on public.payments;
-- drop function if exists public.log_payment_void();
-- drop table if exists public.payment_void_log;
-- (Tablo silinirse o ana kadar biriken iz kalıcı olarak kaybolur.)
