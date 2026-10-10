-- ============================================================
-- TimeFlow Migration 109: (GEÇERSİZ GEREKÇE — bkz. 110)
-- ============================================================
-- ⚠️  BU GÖÇ ÜRETİMDE ÇALIŞTI (2026-10-10) ve zararsız oldu, ama YAZILIŞ
--     SEBEBİ YANLIŞTI. Dosya olduğu gibi duruyor: üretimde koşan SQL bu ve
--     tarihi değiştirmek, veritabanıyla depo arasındaki tek doğru kaydı
--     bozardı.
--
-- ── Ne iddia etmişti ──────────────────────────────────────────────────────
-- "`staff_auth_log.event` kısıtı altı olayı kabul etmiyor, o insertler
-- sessizce düşüyor." Bu DOĞRU DEĞİLDİ: 091 ve 099 kısıtı zaten
-- genişletmişti ve altısı da listedeydi.
--
-- ── Hata nasıl oldu ───────────────────────────────────────────────────────
-- Kısıtı değiştiren göçler aranırken çıktı kesildi ve yalnız 082 ile 090
-- görüldü; 091 ile 099 hiç okunmadı. Yani "eksik" sanılan şey eksik değildi.
--
-- ── Sonucu ────────────────────────────────────────────────────────────────
-- Eklediği altı değer zaten vardı → etkisiz. Düşürdüğü tek değer
-- `pair_locked` ise koda hiç yazılmıyor (yalnız istemciye dönen bir hata
-- kodu) → kayıp yok. 110 onu geri koyuyor.
--
-- Doğru ders: kısıtı değiştiren bütün göçleri BULMADAN önceki listeyi tam
-- sayma.
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
        -- 109 · cihaz eşleme ve şifre (kod baştan beri yazıyordu)
        'pair_code_created',
        'paired',
        'failed_pair',
        'pin_set',
        'pin_reset',
        'pin_changed'
    ));

NOTIFY pgrst, 'reload schema';

COMMIT;
