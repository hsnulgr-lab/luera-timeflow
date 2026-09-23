-- ============================================================
-- TimeFlow Migration 103: push_subscriptions'a EXPO kanalı
-- ============================================================
-- Sunucudaki push altyapısı 037'den beri duruyor ama YANLIŞ KANALDA:
-- `send-push` Web Push (VAPID) kullanıyor — bu tarayıcı/PWA protokolü ve
-- native iOS/Android uygulamasında ÇALIŞMAZ. Telefon uygulaması bugün hiçbir
-- bildirim alamıyor.
--
-- Çözüm ayrı tablo DEĞİL, aynı tabloya ikinci kanal. Gerekçe "az kod" değil,
-- AZ YALAN: hedef seçimi (org + staff_id | role) ve ölü satır budama iki ayrı
-- tabloda iki kez yazılsaydı, ikisinden biri bir gün ötekinden ayrışırdı.
-- RLS politikası, üç indeks ve kolonların tamamı aynen kullanılıyor.
--
-- `endpoint` Expo için de doğru cihaz kimliği: Expo jetonu
-- (`ExponentPushToken[...]`) cihaz başına tek ve UNIQUE kısıtı zaten var.
--
-- Uygulama sırası: 102'den SONRA, `send-push` ve `staff-api` deploy'undan ÖNCE.
--   Ters sırada yapılırsa yeni fonksiyon olmayan kolonu sorar, sorgu düşer ve
--   (düzeltilene kadar) bütün bildirimler sessizce kaybolur.
-- ============================================================

begin;

alter table public.push_subscriptions
    add column if not exists kind      text not null default 'web',
    add column if not exists platform  text,        -- 'ios' | 'android', teşhis için
    add column if not exists device_id text;        -- kurulum başına UUID, aşağıda

-- Mevcut satırların hepsi 'web' — varsayılan sayesinde veri taşıma YOK.
alter table public.push_subscriptions
    drop constraint if exists push_subscriptions_kind_check;
alter table public.push_subscriptions
    add constraint push_subscriptions_kind_check check (kind in ('web', 'expo'));

-- Expo satırında şifreleme anahtarı YOK; web satırında olmak ZORUNDA.
alter table public.push_subscriptions alter column p256dh drop not null;
alter table public.push_subscriptions alter column auth   drop not null;

/*
 * NOT NULL'u düşürmek web dalının garantisini zayıflatırdı; kısıt onu `kind`a
 * bağlı olarak geri veriyor. Yarı dolmuş bir satır iki kanala da benzeyemez.
 *
 * `endpoint` biçimi burada DENETLENMİYOR: jeton biçim hatasının doğru cevabı
 * bir kısıt ihlali değil, `staff-api`'nin döndüğü açık bir 400. Ayrıca mevcut
 * satırların endpoint'leri denetlenmemiş veriler ve migration'ı onlara
 * takılmak için bir sebep yok.
 */
alter table public.push_subscriptions
    drop constraint if exists push_subscriptions_shape;
alter table public.push_subscriptions
    add constraint push_subscriptions_shape check (
        (kind = 'web'  and p256dh is not null and auth is not null)
     or (kind = 'expo' and p256dh is null     and auth is null)
    );

create index if not exists idx_push_subs_org_kind
    on public.push_subscriptions(organization_id, kind);

/*
 * `device_id` NEDEN VAR — `endpoint` zaten tekil.
 *
 * İki şeyi çözüyor, ikisi de `endpoint`in çözemediği:
 *
 *   1. JETON DÖNER. Yeniden kurulum, yedekten dönüş ya da Expo projesinin
 *      değişmesi jetonu değiştirir. `device_id` olmadan eski satır, ilk
 *      başarısız gönderime kadar durur ve o arada "abone" sayılır.
 *
 *   2. ÇIKIŞTA JETON ELDE OLMAYABİLİR. Jeton üretmek izin ister; izin OS
 *      ayarından geri alınmışsa çıkış anında jetonu üretemeyiz ve satırı
 *      silemeyiz. ORTAK TELEFONDA bunun bedeli somut: ayrılan personelin
 *      bildirimleri yeni personelin elinde çalmaya devam eder. `device_id`
 *      izinden bağımsız (SecureStore'da duruyor) ve silme onunla yapılıyor.
 */
create unique index if not exists uq_push_subs_device
    on public.push_subscriptions(organization_id, device_id)
    where kind = 'expo' and device_id is not null;

commit;

notify pgrst, 'reload schema';

-- ── Doğrulama ───────────────────────────────────────────────────────────────
-- 1) Kanal başına satır sayısı (expo 0 olmalı — henüz kimse kaydolmadı):
--
--      select kind, count(*) from public.push_subscriptions group by kind;
--
-- 2) Tetikleyicilerin sırları duruyor mu? İKİSİ DE yoksa trigger sessizce
--    çıkıyor ve hiçbir bildirim gönderilmiyor — hata da vermiyor:
--
--      select key from public.app_secrets
--       where key in ('FUNCTIONS_BASE_URL', 'PUSH_TRIGGER_SECRET');
--
-- 3) Yeni kolonlar yerinde mi:
--
--      select column_name, is_nullable from information_schema.columns
--       where table_name = 'push_subscriptions'
--         and column_name in ('kind','platform','device_id','p256dh','auth');
