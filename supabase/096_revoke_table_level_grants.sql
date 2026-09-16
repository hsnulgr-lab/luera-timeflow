-- ============================================================
-- TimeFlow Migration 096: RLS'in kapsamadığı tablo izinlerini sök
-- ============================================================
-- 2026-09-14'te 095 doğrulanırken bulundu: Supabase'in varsayılan
-- ayrıcalıkları (`alter default privileges ... grant all on tables`)
-- yüzünden `anon` ve `authenticated` rolleri `public` şemasındaki BÜTÜN
-- tablolarda TRUNCATE, REFERENCES ve TRIGGER iznine sahip — `app_secrets`,
-- `reservations`, `customers`, `payments` dâhil.
--
-- ── Neden önemli ────────────────────────────────────────────────────────────
-- Satır güvenliği (RLS) YALNIZ SELECT / INSERT / UPDATE / DELETE'e uygulanır.
-- Bu üçü tablo seviyesi işlemlerdir ve policy'den GEÇMEZ:
--   • TRUNCATE   — tablonun tamamını, bütün salonların satırlarıyla boşaltır.
--   • TRIGGER    — tabloya tetikleyici bağlama izni.
--   • REFERENCES — tabloya yabancı anahtar kurma izni (satır varlığını
--                  RLS'i atlayarak yoklamanın bir yolu).
-- Çok kiracılı izolasyon turunda (2026-06-19) kanıtlanan ayrım bunları hiç
-- kapsamıyordu.
--
-- ── Bugün neden ulaşılabilir değil, yine de neden şimdi ─────────────────────
-- PostgREST TRUNCATE diye bir uç sunmuyor ve `anon` doğrudan giriş yapılan
-- bir rol değil. Gerçek vektörler: `security invoker` yazılmış ve bu
-- işlemleri çalıştıran bir RPC, ya da `authenticator` kimliğinin ele
-- geçmesi. İkisi de "bir gün" meselesi; iznin kendisinin var olması gerekmiyor.
--
-- Müdür mobil bağlantısı (0–9) bitene kadar BİLEREK bekletildi: şema geneli
-- bir ayrıcalık değişikliğini ekran bağlama turunun ortasında yapmak, arıza
-- çıkarsa hangi işin kırdığını bulmayı zorlaştırırdı.
--
-- ── Ne DEĞİŞMİYOR ───────────────────────────────────────────────────────────
-- • SELECT / INSERT / UPDATE / DELETE — dokunulmuyor; RLS policy'leri aynen.
-- • `service_role` — dokunulmuyor (edge fonksiyonları, cron, n8n).
-- • Tablo sahibi (`postgres`) — dokunulmuyor; migration'lar aynen çalışır.
-- Kod taraması: masaüstü, mobil, edge fonksiyonları ve migration'larda
-- TRUNCATE / CREATE TRIGGER / REFERENCES'i istemci rolüyle çalıştıran hiçbir
-- yol yok.
-- ============================================================

begin;

-- ── 1 · Mevcut tablolar (görünümler dâhil) ─────────────────────────────────
--
-- Roller TEK TEK adlandırılıyor. `from public` YETMEZ: Supabase izni `anon`
-- ve `authenticated`a AYRICA veriyor ve PUBLIC sözde-rolünden sökmek onlara
-- dokunmuyor — 094'te çekirdek fonksiyon tam olarak böyle `anon`a açık
-- kalmıştı.
revoke truncate, references, trigger
    on all tables in schema public
    from anon, authenticated;

-- ── 2 · Bundan sonra açılacak tablolar ─────────────────────────────────────
--
-- Varsayılan ayrıcalık TABLOYU AÇAN role bağlıdır. Migration'lar SQL
-- editöründe `postgres` olarak çalışıyor; bu satır olmadan 097'de açılan ilk
-- tablo aynı üç izinle doğardı ve borç sessizce geri gelirdi.
alter default privileges for role postgres in schema public
    revoke truncate, references, trigger on tables
    from anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- DOĞRULAMA — migration'dan SONRA çalıştırın. İkisi de 0 satır dönmeli.
-- ============================================================
--
-- (a) İstemci rollerinde kalan tablo seviyesi izin:
--
-- select table_name, grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and grantee in ('anon', 'authenticated')
--   and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
-- order by 1, 2, 3;
--
-- (b) `postgres`in varsayılan ayrıcalıklarında kalan üç izin
--     (`D` = TRUNCATE, `x` = REFERENCES, `t` = TRIGGER):
--
-- select pg_get_userbyid(d.defaclrole) as sahip, a.grantee::regrole as rol, a.privilege_type
-- from pg_default_acl d
-- cross join lateral aclexplode(d.defaclacl) a
-- join pg_namespace n on n.oid = d.defaclnamespace
-- where n.nspname = 'public'
--   and d.defaclobjtype = 'r'
--   and pg_get_userbyid(d.defaclrole) = 'postgres'
--   and a.grantee::regrole::text in ('anon', 'authenticated')
--   and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER');
--
-- (c) Uygulamanın hâlâ okuyup yazabildiğinin kanıtı — 4 satır, hepsi `true`:
--
-- select privilege_type, has_table_privilege('authenticated', 'public.reservations', privilege_type) as var
-- from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as privilege_type;
--
-- ── Geri alma (gerekirse) ──────────────────────────────────────────────────
-- grant truncate, references, trigger on all tables in schema public to anon, authenticated;
-- alter default privileges for role postgres in schema public
--     grant truncate, references, trigger on tables to anon, authenticated;
