-- ============================================================
-- TimeFlow Migration 098: "Gelmedi" bir DAMGA olur — no_show_at
-- ============================================================
-- 2026-09-17, müdür kararı. 097'den SONRA çalıştırın.
--
-- ── Neden ───────────────────────────────────────────────────────────────────
-- Müdürün telefonundaki "Gelmedi" düğmesi yalnız telefonda bir işaretti:
--   • ekran yenilenince randevu yeniden "sıradaki" oluyordu,
--   • masaüstü aynı randevuyu "Onaylandı" göstermeye devam ediyordu,
--   • personel hiçbir şey görmüyordu.
-- "Gelmedi" bugüne kadar yalnız TÜRETİLİYORDU: randevu saati + salonun
-- toleransı (vars. 120 dk) geçip kimse gelmediyse. Bu kural aynen duruyor;
-- damga, müdürün toleransı BEKLEMEDEN verdiği kararı kalıcı kılıyor.
--
-- ── Okuma kuralı (iki uygulamada aynı) ──────────────────────────────────────
--   • arrived_at dolu            → işlemde        (damga fark etmez)
--   • customer_arrived_at dolu   → geldi          (damga fark etmez — geç
--                                                  gelen müşteri "gelmedi"
--                                                  sayılmaz)
--   • no_show_at dolu            → GELMEDİ
--   • saat + tolerans geçti      → gelmedi        (türetilen, eskisi gibi)
-- Masaüstü: `src/lib/appointmentFlow.ts · apptPhase`
-- Telefon:  `mobile/src/lib/flowBuild.ts · kindOf`
--
-- ── Yazanlar ────────────────────────────────────────────────────────────────
--   • Müdürün "Gelmedi"si         → no_show_at = şimdi
--   • "Geri al" (5 sn)            → no_show_at = null
--   • "Geç geldi"                 → customer_arrived_at = şimdi, no_show_at = null
-- RLS değişmiyor: müdürün `reservations` güncelleme yetkisi zaten var.
--
-- ── Ne DEĞİŞMİYOR ───────────────────────────────────────────────────────────
-- • Randevu iptal EDİLMİYOR, `status` aynı kalıyor. "Gelmedi" bir iptal
--   değil; müşteri gelirse "Geç geldi" ile devam ediliyor.
-- • Bildirim yok (046 bu sütuna bakmıyor).
-- ============================================================

begin;

alter table public.reservations
    add column if not exists no_show_at timestamptz;

comment on column public.reservations.no_show_at is
    'Müdür "Gelmedi" dedi (098). Dolu ve customer_arrived_at boşsa randevu gelmedi sayılır. "Geç geldi" temizler. Tarih değişince 097 tetikleyicisi temizler.';

-- 097'nin kuralı bu damgayı da kapsıyor: başka güne taşınan randevu yeni
-- günde "gelmedi" başlamamalı.
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
        new.no_show_at := null;
    end if;
    return new;
end;
$$;

revoke all on function public.clear_stamps_on_reschedule() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- DOĞRULAMA — migration'dan SONRA.
-- ============================================================
--
-- (a) Sütun var — 1 satır, timestamp with time zone:
--
-- select column_name, data_type from information_schema.columns
-- where table_schema = 'public' and table_name = 'reservations' and column_name = 'no_show_at';
--
-- (b) Uygulama rolü okuyup yazabiliyor — ikisi de true:
--
-- select has_column_privilege('authenticated', 'public.reservations', 'no_show_at', 'select') as okur,
--        has_column_privilege('authenticated', 'public.reservations', 'no_show_at', 'update') as yazar;
--
-- ── Geri alma ──────────────────────────────────────────────────────────────
-- 097'nin fonksiyonunu geri yükleyip: alter table public.reservations drop column no_show_at;
