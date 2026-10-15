-- ============================================================
-- TimeFlow Migration 120: Demo tohumu bildirim GÖNDERMİYOR
-- ============================================================
-- 2026-10-16 00:10, 1.0.1 telefon turunda: demo personele (Derya Toprak)
-- bağlı telefona aynı anda yedi "Yeni randevun var" düştü. Demo tohumu
-- (`supabase/DEMO_salon.sql`, VPS cron 11:00 / 13:00 / 15:00 / 00:10) her
-- koşuda randevuları yeniden yazıyor ve personeli atanmış her yeni randevu
-- `trg_push_on_reservation` (038 → 116/118) ile personele bildirim tetikliyor.
--
-- Eskiden görünmüyordu: tohum personeli de silip yeniden kuruyordu, bildirim
-- abonelikleri her koşuda gidiyordu. 2026-10-15'ten beri personel korunuyor
-- (oturum düşmesin diye) — abonelik de korunuyor. Hakem demo personeli
-- telefona bağlarsa günde dört kez bildirim seliyle karşılaşırdı.
--
-- ── Düzeltme ────────────────────────────────────────────────────────────────
-- Tetikleyici aynen yeniden kuruluyor, yalnız bir WHEN koşuluyla: işlemde
-- `luera.tohum = 'sessiz'` varsa çalışmıyor. Tohum bu işareti işleminin
-- başında koyuyor (`set_config(..., true)` — yalnız o işlem; bitince düşüyor).
-- Hiçbir uygulama yolu bu işareti koymuyor: normal yazmaların davranışı aynı.
--
-- Fonksiyonun gövdesine (118'deki hâli) DOKUNULMUYOR.
-- ============================================================

begin;

drop trigger if exists trg_push_on_reservation on public.reservations;
create trigger trg_push_on_reservation
    after insert or update on public.reservations
    for each row
    when (coalesce(current_setting('luera.tohum', true), '') <> 'sessiz')
    execute function public.notify_push_on_reservation();

commit;

-- ============================================================
-- DOĞRULAMA — `supabase/tests/tohum_sessiz_regression.sql` (kuru koşu,
-- ROLLBACK): tohum koşarken bildirim kuyruğa girmiyor, işaretsiz bir
-- değişiklik giriyor.
--
-- ── Geri alma ──────────────────────────────────────────────────────────────
-- drop trigger if exists trg_push_on_reservation on public.reservations;
-- create trigger trg_push_on_reservation after insert or update on public.reservations
--     for each row execute function public.notify_push_on_reservation();
-- ============================================================
