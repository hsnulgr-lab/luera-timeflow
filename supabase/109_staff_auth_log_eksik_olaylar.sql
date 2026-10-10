-- ============================================================
-- TimeFlow Migration 109: Denetim kaydındaki ALTI SESSİZ KAYIP
-- ============================================================
-- Idempotent. Yalnız bir CHECK kısıtını genişletiyor; veri taşımıyor.
--
-- ── Bulgu ───────────────────────────────────────────────────────────────────
-- `staff_auth_log.event` kısıtı 082'de dört değerle başladı, 090 ziyaret
-- olaylarını ekleyip yediye çıkardı. Ama `staff-api` o tarihten beri ALTI
-- olay daha yazıyor ve hiçbiri listede yok:
--
--   failed_pair · paired · pair_code_created · pin_set · pin_reset · pin_changed
--
-- Bu insertler HATA VERMİYOR, sessizce düşüyor. Sebebi supabase-js:
-- `admin.from(...).insert(...)` fırlatmaz, `{ data, error }` döner ve
-- `staff-api`deki `audit()` yardımcısı dönen değere bakmıyor. 090'ın kendi
-- yorumu bunu zaten söylemişti — "kısıt genişletilmezse bu insertler sessizce
-- başarısız olur" — ama yalnız o turun olayları eklendi.
--
-- ── Neden önemli ────────────────────────────────────────────────────────────
-- Kayıp olanlar tam da GÜVENLİKLE İLGİLİ olanlar: cihaz eşleştirme kodu
-- üretildi mi, kim eşleşti, başarısız eşleşme denemesi oldu mu, şifre kim
-- tarafından sıfırlandı. Yani tablonun var oluş sebebi. Giriş ve ziyaret
-- olayları yazılıyor, kapı olayları yazılmıyordu.
--
-- Geçmiş kayıtlar GERİ GELMİYOR; bu göç yalnız bundan sonrasını yazdırıyor.
--
-- ── Neden listeye `solo` eklenmedi ──────────────────────────────────────────
-- 108'in `solo.session` ucu da bu tabloya yazıyor ama olay adı olarak
-- `'login'` kullanıyor: olan şey zaten bir giriş, ayrımı `detail = 'solo'`
-- taşıyor. Her uca yeni bir olay adı uydurmak bu kısıtı sürekli peşinden
-- koşulan bir yere çevirirdi.
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
