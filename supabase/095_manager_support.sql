-- ============================================================
-- TimeFlow Migration 095: Müdürün mobil okuması için iki dayanak
-- ============================================================
-- Müdür mobilde veriye `staff-api` üzerinden DEĞİL, doğrudan Supabase
-- oturumuyla erişiyor — masaüstündeki hesabın aynısıyla, aynı RLS altında.
-- Bu doğru olan, ama bir yan etkisi var: araya giren bir edge fonksiyonu
-- olmadığı için sunucunun BİLDİĞİ iki şey istemciye ulaşmıyor.
--   1) sunucunun saati
--   2) mobil yazmalarını durdurma vanası
-- Bu migration ikisini de ekliyor. Mevcut hiçbir davranış değişmiyor.
-- ============================================================

-- ── 1 · Sunucu saati ────────────────────────────────────────────────────────
--
-- Akış ekranının iki alanı (`etaMinutes`, `waitMinutes`) kodun kendi yorumunda
-- şöyle yazılı: "sunucu her yenilemede kendi saatinden hesaplayıp gönderecek;
-- telefonun saati yanlışsa randevu yanlış gecikmez."
--
-- Personel tarafında bunu `staff-api` yapıyor. Müdür tarafında araya giren
-- kimse yok — telefon doğrudan Postgres'e bakıyor. Yanlış ayarlı bir telefon
-- müşteriyi kırk dakika bekletmiş gibi gösterip müdürü boşuna personelin
-- üstüne yollardı.
--
-- İstemci bunu okuma başına BİR KEZ çağırıp sapmayı çıkarıyor, bütün
-- dakikalar o düzeltilmiş saatten türüyor. Her randevu için ayrı çağrı YOK.

create or replace function public.server_now()
returns timestamptz
language sql
stable
security invoker
set search_path = public
as $$
    select now()
$$;

comment on function public.server_now() is
    'Sunucunun saati. Mobil müdür, cihaz saatinin sapmasını bununla düzeltir '
    '(bekleme ve gecikme dakikaları telefonun saatinden türetilmez).';

-- Ayrıcalıklar TEK TEK sökülüyor.
--
-- `revoke ... from public` YETMİYOR: Supabase'in varsayılan ayrıcalıkları
-- `anon`, `authenticated` ve `service_role`a AYRICA veriyor ve onlar
-- PUBLIC sözde-rolü kalkınca da yerinde duruyor. 094'te bu tam olarak böyle
-- kaçmıştı — çekirdek fonksiyon `anon`a açık kalmıştı.
revoke all on function public.server_now() from public, anon, authenticated, service_role;
grant execute on function public.server_now() to authenticated;

-- ── 2 · Müdür yazmalarının vanası ───────────────────────────────────────────
--
-- 093'teki `MOBILE_WRITES_ENABLED` yalnız `staff-api`'nin `visit.*` uçlarını
-- kapatıyor. Müdürün yazmaları o uçtan GEÇMİYOR, doğrudan Postgres'e gidiyor:
-- vana onları hiç görmüyor. Üstelik `app_secrets`'a bilerek hiç policy
-- konmadı, yani müdür telefonu o bayrağı okuyamaz bile.
--
-- ── Neden masaüstünde böyle bir vana yok da burada var ──────────────────────
-- Müdürün yazması masaüstünün yazmasıyla mimari olarak aynı şey. Fark
-- DÜZELTME HIZINDA: masaüstü bozulursa dakikalar içinde yeniden yayınlanır,
-- mobil bozulursa App Store incelemesi beklenir. Vana, o bekleme süresinde
-- elimizdeki tek şey.
--
-- ── Neden `app_secrets`'a bir satır değil, ayrı tablo ───────────────────────
-- `app_secrets` SIRLARI tutuyor (webhook anahtarları, servis adresleri) ve
-- istemciye kapalı olması bilinçli. Oraya okunabilir bir policy koymak, bir
-- bayrak uğruna bütün sırları `authenticated`a açardı.

create table if not exists public.app_flags (
    key        text        primary key,
    value      text        not null,
    updated_at timestamptz not null default now()
);

alter table public.app_flags enable row level security;

-- OKUMA herkese (giriş yapmışa) açık; YAZMA hiç kimseye.
-- Policy yalnız SELECT için: RLS açıkken policy'si olmayan işlem kapalıdır,
-- yani INSERT/UPDATE/DELETE yalnız `service_role` (RLS'i atlar) ya da elle
-- SQL ile yapılabilir. Bayrağı kazara uygulamanın kendisi çeviremez.
drop policy if exists "app_flags_read" on public.app_flags;
create policy "app_flags_read" on public.app_flags
    for select to authenticated
    using (true);

-- ── Tablo ayrıcalıkları ─────────────────────────────────────────────────────
--
-- Supabase yeni tablolara `anon` ve `authenticated` için TAM DML veriyor
-- (`alter default privileges ... grant all on tables`). RLS bunların çoğunu
-- kapatıyor: policy'si olmayan işlem reddedilir.
--
-- AMA `TRUNCATE` KAPANMIYOR. PostgreSQL'de satır güvenliği
-- SELECT/INSERT/UPDATE/DELETE'e uygulanır; TRUNCATE tablo seviyesi bir
-- işlemdir ve policy'den geçmez. İzni olan rol, RLS ne derse desin tabloyu
-- boşaltabilir — ve boşalan bayrak "satır yok" demek, yani vana kendiliğinden
-- AÇIK konuma düşer.
--
-- Bugün PostgREST TRUNCATE diye bir uç sunmuyor, yani ulaşılabilir değil.
-- Yine de sökülüyor: vananın tek işi acil durumda orada olmak.
revoke insert, update, delete, truncate, references, trigger
    on public.app_flags from anon, authenticated;

-- Varsayılan AÇIK, ve bu bilinçli — 093'teki gerekçenin aynısı.
-- Satır yoksa ya da değeri 'off' değilse yazmalar çalışır. Ters kurgu
-- ("yoksa kapalı") daha güvenli görünür ama anahtar adında bir yazım hatası
-- ya da unutulmuş bir satır bütün salonu durdururdu. Vananın işi olağan
-- durumu değiştirmek değil, olağandışı durumda müdahale edebilmek.
insert into public.app_flags (key, value)
values ('MANAGER_WRITES_ENABLED', 'on')
on conflict (key) do nothing;

comment on table public.app_flags is
    'İstemcinin OKUYABİLDİĞİ bayraklar. Sır TUTMAZ — sırlar app_secrets''ta '
    've orası istemciye kapalı. MANAGER_WRITES_ENABLED=''off'' mobil müdürün '
    'yazma yollarını kapatır; okuma etkilenmez.';

-- Kapatmak için:
--   UPDATE public.app_flags SET value = 'off', updated_at = now()
--    WHERE key = 'MANAGER_WRITES_ENABLED';
-- Açmak için aynı satıra 'on'.

notify pgrst, 'reload schema';
