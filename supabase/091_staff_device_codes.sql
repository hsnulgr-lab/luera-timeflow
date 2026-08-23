-- 091 — Cihaz eşleştirme kodu: personel kendi telefonunu bağlayabilsin
--
-- Bugünkü durum ve neden değişiyor:
--   `device.pair` YALNIZ org sahibinin Supabase oturumuyla çalışıyor ve rolü
--   `member` olanı açıkça reddediyor ("cihaz eşleme yıkıcı bir yetkidir").
--   Bu, salonun ortak tableti için doğru bir kurgu: sahibi bir kez kurar.
--
--   Ama ürün kararı değişti — her personel KENDİ telefonunu bağlıyor. Sahibin
--   beş personelin telefonunda tek tek oturum açması hem pratik değil hem de
--   sahibin şifresini beş kişinin yanında girmesi demek. Mobil tasarım da bunu
--   varsayıyor: "Bilgisayardaki Luera ekranında görünen altı haneli kodu yazın."
--
--   Bu migration o kodu gerçek yapıyor. `device.pair` KALDIRILMIYOR; ortak
--   tablet yolu çalışmaya devam eder.
--
-- Güvenlik duruşu:
--   * Kod veritabanında AÇIK TUTULMAZ. PIN'de olduğu gibi SHA-256 saklanır;
--     veritabanını okuyabilen biri bekleyen kodları kullanamasın.
--   * Kod TEK KULLANIMLIK ve kısa ömürlü (10 dakika). Ele geçse bile pencere
--     dar; süresi dolan kod ayrı bir hata döndürür, çünkü kullanıcı için
--     "yanlış yazdım" ile "yeniden istemem gerek" farklı iki iştir.
--   * Kaba kuvvet IP başına sınırlanır. Altı hane = bir milyon kombinasyon;
--     sınırsız deneme, aynı anda açık duran her kodu tehdit ederdi.

-- ── Eşleştirme kodları ──────────────────────────────────────────────────────
create table if not exists public.staff_device_codes (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,

    -- Doluysa kod O personele aittir ve telefon doğrudan ona bağlanır; personel
    -- listeden kendini seçmez ve salonun kadro listesi kişisel telefona hiç
    -- inmez. Boşsa kod yalnız işletmeyi tanıtır (ortak tablet yolu).
    -- Nullable olması bilinçli: iki akış da tek tabloyla, yeni migration
    -- gerekmeden desteklenir.
    staff_id uuid references public.staff(id) on delete cascade,

    -- Kodun kendisi DEĞİL, SHA-256'sı. Arama da hash üzerinden yapılır.
    code_hash text not null,

    expires_at timestamptz not null,
    used_at timestamptz,
    used_ip text,

    -- Kodu üreten org sahibi. "Bu telefonu kim yetkilendirdi" sorusunun cevabı.
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);

comment on table public.staff_device_codes is
    'Personelin kendi telefonunu işletmeye bağlaması için tek kullanımlık, kısa ömürlü kod.';
comment on column public.staff_device_codes.staff_id is
    'Dolu: kod bu personele ait, "kendini seç" adımı atlanır. Boş: yalnız işletmeye bağlar.';
comment on column public.staff_device_codes.code_hash is
    'SHA-256. Kod açık saklanmaz; bekleyen kodlar veritabanından okunamasın.';

create index if not exists idx_091_device_codes_org
    on public.staff_device_codes (organization_id, created_at desc);

-- Kullanılmamış kodun hash'i hem aramanın sıcak yolu hem de çakışma kısıtı:
-- aynı anda aynı hash iki kez açık duramaz. Kullanılmış kodlar kısıttan çıkar,
-- hash yeniden kullanılabilir hâle gelir.
create unique index if not exists uq_091_device_codes_active
    on public.staff_device_codes (code_hash)
    where used_at is null;

alter table public.staff_device_codes enable row level security;

-- Okuma org üyelerine: sahibi ürettiği kodun durumunu görebilmeli. Kodun
-- KENDİSİ burada yok (yalnız hash), o yüzden okuma zararsız.
drop policy if exists staff_device_codes_select on public.staff_device_codes;
create policy staff_device_codes_select on public.staff_device_codes
    for select
    using (organization_id in (select auth_user_org_ids()));

-- Yazma YOK: kod üretimi ve tüketimi yalnız service_role ile (staff-api).
-- İstemci kendine kod yazabilseydi, eşleştirme kapısının anlamı kalmazdı.

-- ── Kaba kuvvet sayacı ──────────────────────────────────────────────────────
-- Eşleştirme denemesi, PIN denemesinden farklı bir şeydir: PIN'de kimin
-- denendiği bellidir (staff satırında sayaç tutulur), burada henüz kimlik YOK.
-- Bu yüzden sayaç IP'de tutulur.
create table if not exists public.staff_pair_attempts (
    ip text primary key,
    failures integer not null default 0,
    locked_until timestamptz,
    updated_at timestamptz not null default now()
);

comment on table public.staff_pair_attempts is
    'Eşleştirme kodu deneme sayacı. Kimlik henüz yokken tek ayırt edici IP.';

alter table public.staff_pair_attempts enable row level security;
-- Politika yok: yalnız service_role erişir. Denetim izi staff_auth_log'da.

-- ── Denetim olayları ────────────────────────────────────────────────────────
-- 082'deki append-only log genişletiliyor. Eşleştirme, girişle aynı ağırlıkta
-- bir olaydır: "bu telefon ne zaman, kim tarafından bağlandı" sorusunun tek
-- cevabı burası olacak.
--
-- DİKKAT: bu kısıt bir LİSTEDİR, ekleme yapılamaz — her migration tamamını
-- yeniden yazar. 090'ın eklediği ziyaret olayları burada da sayılmak ZORUNDA;
-- yoksa 091'den sonra staff-api'nin visit.start/finish kayıtları reddedilir ve
-- denetim izi sessizce kopar. Yeni olay ekleyen her migration bu listenin
-- tamamını taşımalı.
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
        'pair_code_created', 'paired', 'failed_pair', 'pair_locked'
    ));

-- ── Eskimiş kod temizliği ───────────────────────────────────────────────────
-- Kullanılmış ve süresi dolmuş kodlar denetim için bir süre durur, sonra gider.
-- Silinen satır bilgi kaybı değil: kalıcı iz staff_auth_log'da.
create or replace function public.purge_expired_device_codes()
returns integer
language sql
security definer
set search_path = public
as $$
    with gone as (
        delete from public.staff_device_codes
        where created_at < now() - interval '30 days'
        returning 1
    )
    select count(*)::integer from gone;
$$;

comment on function public.purge_expired_device_codes is
    'Otuz günden eski eşleştirme kodlarını siler. Kalıcı iz staff_auth_log''da kalır.';

-- PostgREST şema önbelleğini tazele (090 ile aynı desen).
NOTIFY pgrst, 'reload schema';
