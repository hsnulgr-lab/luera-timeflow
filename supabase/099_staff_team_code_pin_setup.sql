-- ============================================================
-- TimeFlow Migration 099: Ekip kodu + personelin kendi şifresi
-- ============================================================
-- 2026-09-17, müdür kararları. 098'den SONRA çalıştırın. Ardından staff-api
-- deploy edilmeli (kod bu kolonları okuyor; önce deploy edilirse ekip kodu
-- üretimi "code_unavailable" döner, eski akış çalışmaya devam eder).
--
-- ── Neden ───────────────────────────────────────────────────────────────────
-- Personel telefondan GİREMİYORDU. Sebepler:
--   • Kod tek kişilik ve tek kullanımlıktı: beş personel = beş ayrı kod.
--   • PIN'i yalnız işletme sahibi masaüstünden verebiliyordu; PIN'i olmayan
--     personel listede hiç görünmüyordu (fatma, HASAN, NUR NİSA, sinan).
--   • Başarısız denemelerin SEBEBİ hiçbir yere yazılmıyordu.
--
-- ── Yeni akış ───────────────────────────────────────────────────────────────
--   1. Müdür (masaüstü ya da müdür telefonu) TEK bir ekip kodu üretir:
--      6 hane, 15 dakika, o süre içinde bütün ekip aynı kodu yazar.
--   2. Personel kodu yazar → "Siz kimsiniz?" listesinden kendini seçer.
--   3. Şifresi yoksa KENDİSİ belirler; varsa girer.
--   4. Çıkış yapınca telefon bağlı kalır; sonraki girişte yalnız şifre.
--   5. Şifreyi unutan personelin şifresini müdür sıfırlar; personel yenisini
--      bir sonraki girişte kendisi belirler.
--
-- ── Değişenler ──────────────────────────────────────────────────────────────
--   staff_device_codes.multi_use   ekip kodu (çok kullanımlık) mı
--   staff_device_codes.use_count   kaç telefon bu kodla bağlandı
--   staff_device_codes.last_used_at
--   staff_auth_log.detail          başarısızlığın SEBEBİ (kod sızdırmaz)
--   staff_auth_log olayları        + pin_set, pin_changed, pin_reset
-- RLS değişmiyor: iki tabloya da yalnız staff-api (service_role) yazıyor.
-- ============================================================

begin;

-- ── 1 · Ekip kodu ───────────────────────────────────────────────────────────

alter table public.staff_device_codes
    add column if not exists multi_use boolean not null default false,
    add column if not exists use_count integer not null default 0,
    add column if not exists last_used_at timestamptz;

comment on column public.staff_device_codes.multi_use is
    'true: ekip kodu (099) — süresi içinde birden çok telefon bağlanır, used_at yalnız iptalde dolar. false: tek kullanımlık (091).';
comment on column public.staff_device_codes.use_count is
    'Bu kodla bağlanan telefon sayısı.';

-- Kullanılmamış kodlar hash üzerinde TEKİL (091). Süresi dolmuş ama
-- kullanılmamış satırlar da kısıtın içinde kalıyor; staff-api yeni kod
-- üretmeden önce onları kapatıyor. Bugün birikmiş olanları burada kapat.
update public.staff_device_codes
set used_at = expires_at
where used_at is null
  and expires_at <= now();

-- ── 2 · Denetim izi: sebep ve yeni olaylar ─────────────────────────────────

alter table public.staff_auth_log
    add column if not exists detail text;

comment on column public.staff_auth_log.detail is
    'Olayın sebebi — ör. failed_pair: not_found | expired | used | subscription. Kod ya da PIN ASLA yazılmaz.';

-- DİKKAT (091'in notu): bu kısıt bir LİSTEDİR, her migration tamamını taşır.
alter table public.staff_auth_log
    drop constraint if exists staff_auth_log_event_check;

alter table public.staff_auth_log
    add constraint staff_auth_log_event_check
    check (event in (
        -- 082 · giriş
        'login', 'failed_pin', 'locked', 'revoked',
        -- 090 · ziyaret
        'visit.forbidden', 'visit.start', 'visit.finish',
        -- 091 · cihaz eşleştirme
        'pair_code_created', 'paired', 'failed_pair', 'pair_locked',
        -- 099 · personelin kendi şifresi
        'pin_set', 'pin_changed', 'pin_reset'
    ));

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- DOĞRULAMA — migration'dan SONRA.
-- ============================================================
--
-- (a) Yeni kolonlar — 4 satır:
--
-- select table_name, column_name from information_schema.columns
-- where table_schema = 'public'
--   and ((table_name = 'staff_device_codes' and column_name in ('multi_use', 'use_count', 'last_used_at'))
--     or (table_name = 'staff_auth_log' and column_name = 'detail'))
-- order by 1, 2;
--
-- (b) Yeni olaylar kabul ediliyor — true:
--
-- select pg_get_constraintdef(oid) like '%pin_set%' as tamam
-- from pg_constraint where conname = 'staff_auth_log_event_check';
--
-- (c) Açık kalmış süresi dolmuş kod yok — 0:
--
-- select count(*) from public.staff_device_codes where used_at is null and expires_at <= now();
--
-- ── Geri alma ──────────────────────────────────────────────────────────────
-- Kolonlar eklemedir, eski staff-api onları görmezden geçer. Kısıtı 091'in
-- listesine döndürmek için 091'in son bölümünü yeniden çalıştırın (önce
-- pin_set/pin_changed/pin_reset satırlarını silin).
