-- ============================================================
-- TimeFlow Migration 119: Hesap silme, tahsilatı olan işletmede DÜŞMÜYOR
-- ============================================================
-- 2026-10-16, 1.0.1 telefon turunda bulundu (P1, hakemin yolu): tek kişilik
-- deneme hesabı üç iş tahsil etti, sonra "Hesabımı sil" → "Silme
-- tamamlanamadı". Sunucu kaydı:
--
--   org delete failed · 23503 · insert or update on table "payment_void_log"
--   violates foreign key constraint "payment_void_log_organization_id_fkey"
--
-- Sebep 102'nin tetikleyicisi: `payments` AFTER DELETE her silinen tahsilatın
-- izini `payment_void_log`a yazıyor. İşletme silinince tahsilatlar ZİNCİRLEME
-- (on delete cascade) siliniyor ve tetikleyici, o anda artık var olmayan
-- işletmeye iz yazmaya çalışıyor; yabancı anahtar ekleme işlemini reddediyor
-- ve BÜTÜN silme geri sarılıyor.
--
-- 102'den (2026-09-22) beri tahsilatı olan hiçbir işletme silinemiyordu. 1.0
-- incelemesinde görünmedi: hakem tahsilatsız taze bir hesap sildi. 1.0.1'de
-- tek kişilik modda tahsilat ana akışın parçası — hakem yolunun tam ortası.
-- Apple 5.1.1(v).
--
-- ── Düzeltme ────────────────────────────────────────────────────────────────
-- İşletmesi artık yoksa iz YAZILMAZ: işletmenin kendisi siliniyor ve o
-- işletmenin izleri de zaten onunla gidiyor (`payment_void_log` · on delete
-- cascade). Tek tek silinen tahsilatın izi eskisi gibi yazılıyor — 102'nin
-- amacı (sessiz silme yok) bozulmuyor.
--
-- Tablo, politika ve yetkiler değişmiyor; yalnız fonksiyonun gövdesi.
-- ============================================================

begin;

create or replace function public.log_payment_void()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- İşletmenin KENDİSİ siliniyor (hesap silme): iz yazılacak yer yok ve
    -- o işletmenin izleri de zincirleme gidiyor. Yazmaya kalkmak bütün
    -- silmeyi geri sarıyordu (119).
    if not exists (select 1 from public.organizations where id = old.organization_id) then
        return old;
    end if;

    insert into public.payment_void_log (organization_id, payment_id, payment_snapshot, voided_by)
    values (old.organization_id, old.id, to_jsonb(old), auth.uid());
    return old;
end;
$$;

-- 097'nin dersi: `create or replace` yetkileri koruyor ama varsayılan
-- ayrıcalıklar yeniden çalışmış olabilir — kapı yeniden kapatılıyor.
revoke all on function public.log_payment_void() from public, anon, authenticated;

commit;

-- ============================================================
-- DOĞRULAMA — `supabase/tests/hesap_silme_odeme_regression.sql` (kuru koşu,
-- ROLLBACK). Uçtan uca: tahsilatı olan bir deneme hesabını uygulamadan silin
-- → "Hesabınız silindi".
--
-- ── Geri alma ──────────────────────────────────────────────────────────────
-- 102'deki fonksiyon gövdesini yeniden kurmak (koşulsuz insert). Bu, tahsilatı
-- olan işletmelerin silinememesini geri getirir.
-- ============================================================
