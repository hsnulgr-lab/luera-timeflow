-- ============================================================
-- TimeFlow Migration 097: Başka güne taşınan randevunun damgaları temizlenir
-- ============================================================
-- 2026-09-16'da müdürün telefonundaki akışta bulundu. Bugünün iki
-- randevusu şunu gösteriyordu:
--   • "SÜRÜYOR 1143:40:31 · 45 dk işlem · 68575 dk aştı"
--   • "UZUN BEKLİYOR 1481 sa 58 dk · irem 88918 dakikadır bekliyor"
-- Randevuların tarihi BUGÜN, ama "işlem başladı" damgası 30 Temmuz'dan,
-- "geldi" damgası 16 Temmuz'dan.
--
-- ── Neden oluyor ────────────────────────────────────────────────────────────
-- Ne masaüstü ne mobil, randevu başka güne TAŞINDIĞINDA şu üç damgayı
-- temizliyor:
--   customer_arrived_at (043 · müşteri salona geldi — müdür basar)
--   arrived_at          (032 · işlem başladı — personel basar)
--   service_ended_at    (033 · işlem bitti)
-- Başlamış ya da "geldi" işaretlenmiş bir randevu başka güne alınınca eski
-- günün damgası yeni güne taşınıyor. O gün ne gelen var ne başlayan; ama
-- her ekran randevuyu "haftalardır sürüyor" diye okuyor — masaüstü de
-- "Hizmette" diyor.
--
-- Kural tek yerde, veritabanında: masaüstü, müdür telefonu ve staff-api
-- aynı anda düzeliyor; üç istemciye ayrı ayrı yazılmıyor.
--
-- ── Ne DEĞİŞMİYOR ───────────────────────────────────────────────────────────
-- • Aynı gün içinde SAAT değişirse damgalar KALIR. Süren bir işlemin saatini
--   düzelten müdür işlemi durdurmamalı.
-- • Tamamlanmış (`completed`) ve iptal edilmiş randevuya dokunulmuyor:
--   onların damgaları geçmişin kaydı.
-- • Bildirim üretmez: 046'nın bildirimleri damga BOŞTAN DOLUYA geçince
--   çalışıyor; bu kural doludan boşa çeviriyor. Tarih değişikliği bildirimi
--   (046 · 4) zaten vardı ve aynen çalışıyor.
-- • İyimser kilit (092) etkilenmiyor: 092'nin tetikleyicisi `updated_at`i
--   yine sürüyor.
--
-- ── Mobil tarafta ───────────────────────────────────────────────────────────
-- Telefon bu migration'dan ÖNCE yazılmış satırları da doğru okuyor
-- (`mobile/src/lib/dayStamp.ts`): randevunun gününün iki yanında 12 saatten
-- uzaktaki damga o günün olayı sayılmıyor. Bölüm 2'deki temizlik aynı
-- ölçüyü kullanıyor, böylece iki kural birbirini tutuyor.
-- ============================================================

-- ============================================================
-- ÖNCE BAKIN — migration'dan ÖNCE çalıştırın, hiçbir şey değiştirmez.
-- Bölüm 2'nin temizleyeceği satırları listeler.
-- ============================================================
--
-- select r.id, r.organization_id, r.date, r.start_time, r.status,
--        r.customer_name, r.customer_arrived_at, r.arrived_at, r.service_ended_at
-- from public.reservations r
-- where r.status in ('pending', 'confirmed')
--   and (
--     r.customer_arrived_at not between (r.date::timestamp at time zone 'Europe/Istanbul') - interval '12 hours'
--                                   and (r.date::timestamp at time zone 'Europe/Istanbul') + interval '36 hours'
--     or r.arrived_at not between (r.date::timestamp at time zone 'Europe/Istanbul') - interval '12 hours'
--                          and (r.date::timestamp at time zone 'Europe/Istanbul') + interval '36 hours'
--     or r.service_ended_at not between (r.date::timestamp at time zone 'Europe/Istanbul') - interval '12 hours'
--                                and (r.date::timestamp at time zone 'Europe/Istanbul') + interval '36 hours'
--   )
-- order by r.date desc;

begin;

-- ── 1 · Kural: tarih değişince damgalar temizlenir ─────────────────────────

create or replace function public.clear_stamps_on_reschedule()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if new.date is distinct from old.date
       and new.status in ('pending', 'confirmed') then
        new.customer_arrived_at := null;
        new.arrived_at := null;
        new.service_ended_at := null;
    end if;
    return new;
end;
$$;

-- Tetikleyici fonksiyonu doğrudan çağrılacak bir şey değil. 094'ün dersi:
-- `from public` YETMEZ, Supabase `anon` ve `authenticated`a ayrıca veriyor.
revoke all on function public.clear_stamps_on_reschedule() from public, anon, authenticated;

-- `update of date`: yalnız tarih sütunu yazıldığında çalışır. Değer aynıysa
-- fonksiyonun içindeki `is distinct from` hiçbir şeye dokunmaz.
drop trigger if exists trg_reservations_clear_stamps_on_reschedule on public.reservations;
create trigger trg_reservations_clear_stamps_on_reschedule
    before update of date on public.reservations
    for each row
    execute function public.clear_stamps_on_reschedule();

-- ── 2 · Bu kuraldan ÖNCE bozulmuş satırlar ─────────────────────────────────
--
-- Damga randevunun gününe (Türkiye saatiyle) 12 saatten uzaksa o güne ait
-- değil. Yalnız o damga temizleniyor; günüyle tutarlı olan dokunulmadan
-- kalıyor.
update public.reservations r
set
    customer_arrived_at = case
        when r.customer_arrived_at not between (r.date::timestamp at time zone 'Europe/Istanbul') - interval '12 hours'
                                       and (r.date::timestamp at time zone 'Europe/Istanbul') + interval '36 hours'
        then null else r.customer_arrived_at end,
    arrived_at = case
        when r.arrived_at not between (r.date::timestamp at time zone 'Europe/Istanbul') - interval '12 hours'
                              and (r.date::timestamp at time zone 'Europe/Istanbul') + interval '36 hours'
        then null else r.arrived_at end,
    service_ended_at = case
        when r.service_ended_at not between (r.date::timestamp at time zone 'Europe/Istanbul') - interval '12 hours'
                                    and (r.date::timestamp at time zone 'Europe/Istanbul') + interval '36 hours'
        then null else r.service_ended_at end
where r.status in ('pending', 'confirmed')
  and (
    r.customer_arrived_at not between (r.date::timestamp at time zone 'Europe/Istanbul') - interval '12 hours'
                                  and (r.date::timestamp at time zone 'Europe/Istanbul') + interval '36 hours'
    or r.arrived_at not between (r.date::timestamp at time zone 'Europe/Istanbul') - interval '12 hours'
                         and (r.date::timestamp at time zone 'Europe/Istanbul') + interval '36 hours'
    or r.service_ended_at not between (r.date::timestamp at time zone 'Europe/Istanbul') - interval '12 hours'
                               and (r.date::timestamp at time zone 'Europe/Istanbul') + interval '36 hours'
  );

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- DOĞRULAMA — migration'dan SONRA çalıştırın.
-- ============================================================
--
-- (a) Günüyle tutarsız damga kaldı mı — 0 dönmeli:
--
-- select count(*) as kalan_bozuk
-- from public.reservations r
-- where r.status in ('pending', 'confirmed')
--   and (
--     r.customer_arrived_at not between (r.date::timestamp at time zone 'Europe/Istanbul') - interval '12 hours'
--                                   and (r.date::timestamp at time zone 'Europe/Istanbul') + interval '36 hours'
--     or r.arrived_at not between (r.date::timestamp at time zone 'Europe/Istanbul') - interval '12 hours'
--                          and (r.date::timestamp at time zone 'Europe/Istanbul') + interval '36 hours'
--     or r.service_ended_at not between (r.date::timestamp at time zone 'Europe/Istanbul') - interval '12 hours'
--                                and (r.date::timestamp at time zone 'Europe/Istanbul') + interval '36 hours'
--   );
--
-- (b) Tetikleyici kurulu mu — 1 satır:
--
-- select tgname from pg_trigger
-- where tgrelid = 'public.reservations'::regclass
--   and tgname = 'trg_reservations_clear_stamps_on_reschedule';
--
-- (c) İstemci rolleri fonksiyonu çağıramıyor — ikisi de false:
--
-- select has_function_privilege('anon', 'public.clear_stamps_on_reschedule()', 'execute') as anon,
--        has_function_privilege('authenticated', 'public.clear_stamps_on_reschedule()', 'execute') as authenticated;
--
-- ── Geri alma (gerekirse) ──────────────────────────────────────────────────
-- drop trigger if exists trg_reservations_clear_stamps_on_reschedule on public.reservations;
-- drop function if exists public.clear_stamps_on_reschedule();
-- (Bölüm 2'nin temizlediği damgalar geri gelmez — önce yukarıdaki listeyi
--  kaydedin.)
