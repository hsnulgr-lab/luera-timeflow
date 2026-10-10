-- ============================================================
-- TimeFlow Migration 110: Denetim kaydına TAHSİLAT olayı
-- ============================================================
-- Idempotent. Tek bir CHECK kısıtını genişletiyor; veri taşımıyor.
--
-- İki iş yapıyor:
--
--   1. `visit.collect` ekleniyor. 108'in tahsilat ucu bu tabloya yazıyor.
--      Olay adı `visit.finish` + detay "collect" olarak da yazılabilirdi ama
--      denetim kaydını okunmaz yapardı: İŞİ BİTİRMEK ile PARA ALMAK ayrı iki
--      olay ve biri ötekinin yerine geçemez.
--
--   2. `pair_locked` GERİ KONUYOR — 109 onu düşürmüştü.
--
-- ── 109'un gerekçesi YANLIŞTI (düzeltme, 2026-10-11) ───────────────────────
-- 109 "altı olay sessizce düşüyor" diyerek yazıldı. Yanlıştı: 091 ve 099 bu
-- kısıtı zaten genişletmişti ve altısı da listedeydi. Hata, kısıtı ararken
-- yalnız 082 ile 090'a bakılması — arama çıktısı kesilmişti ve 091/099
-- görülmedi.
--
-- 109 üretimde çalıştı ve zararsız oldu: eklediği altı değer zaten vardı,
-- düşürdüğü tek değer `pair_locked` ise koda hiç yazılmıyor (yalnızca
-- istemciye dönen bir HATA KODU, `json({ error: 'pair_locked' }, 429)`).
-- Yine de kısıt, hiçbir göçün sessizce daraltmaması gereken bir yer: değer
-- geri konuyor.
--
-- Ders, 109'un yazdığı ders değil: KISITI DEĞİŞTİREN BÜTÜN GÖÇLER
-- bulunmadan önceki listeyi "tam" sanma. `grep -rl` ile dosyaları say,
-- çıktıyı kesme.
-- ============================================================

BEGIN;

ALTER TABLE public.staff_auth_log
    DROP CONSTRAINT IF EXISTS staff_auth_log_event_check;

ALTER TABLE public.staff_auth_log
    ADD CONSTRAINT staff_auth_log_event_check
    CHECK (event IN (
        -- 082 · giriş
        'login',
        'failed_pin',
        'locked',
        'revoked',
        -- 090 · ziyaret
        'visit.forbidden',
        'visit.start',
        'visit.finish',
        -- 091 · cihaz eşleme
        'pair_code_created',
        'paired',
        'failed_pair',
        -- `pair_locked` bugün hiçbir yerden YAZILMIYOR (yalnız istemciye
        -- dönen bir hata kodu). Listede duruyor çünkü 091 koymuş ve bir
        -- göçün kullanılmayan bir değeri düşürmesi için sebep yok.
        'pair_locked',
        -- 099 · şifre
        'pin_set',
        'pin_reset',
        'pin_changed',
        -- 110 · tahsilat (detay: cash | card | transfer)
        'visit.collect'
    ));

NOTIFY pgrst, 'reload schema';

COMMIT;
