-- ============================================================
-- TimeFlow Migration 100: CANLI ZİL — "salonda bir şey değişti"
-- ============================================================
-- 2026-09-18. 099'dan SONRA çalıştırın. Ardından staff-api deploy edilmeli
-- (kod `realtime.token` ucunu açıyor; önce deploy edilirse uç 503 döner ve
-- telefon yoklamaya devam eder — hiçbir şey bozulmaz).
--
-- ── Neden ───────────────────────────────────────────────────────────────────
-- Telefon ekranları YOKLAYARAK öğreniyordu: açıkken 25 saniyede bir sunucuya
-- "ne var ne yok" diye soruyorlardı. Masaüstünden bir randevu oluşturulduğunda
-- telefona düşmesi en kötü 25 saniye sürüyordu. Aralığı kısaltmak yanlış
-- kaldıraç: 5 saniyeye inmek günde on salonda 430 bin isteğe çıkıyor, VPS
-- zaten bellek sınırında ve telefonun pili telsizi sürekli uyandırmaktan
-- eriyor.
--
-- ── Zil ─────────────────────────────────────────────────────────────────────
-- Kanaldan geçen tek şey "değişti" kelimesi. VERİ GEÇMİYOR. Telefon zili
-- duyunca veriyi HER ZAMANKİ yoldan çekiyor: müdür doğrudan Supabase'den
-- (RLS), personel `staff-api`'den (personel token'ı). Yani izin kontrolü hiç
-- yer değiştirmiyor — zili duyan biri hiçbir şey öğrenmiyor.
--
-- ── İki dinleyici, iki kimlik ───────────────────────────────────────────────
-- MÜDÜR    Supabase oturumu var; üyeliğinden doğrulanıyor.
-- PERSONEL Supabase oturumu YOK ve olmayacak (RLS org seviyesinde: oturum
--          koymak salonun tüm verisini o telefona açardı). Onun için
--          `staff-api` dar kapsamlı, kısa ömürlü bir jeton üretiyor:
--          rolü `staff_rt` ve o rolün HİÇBİR tabloda yetkisi yok. Jeton
--          PostgREST'e götürülse bile okuyabileceği tek şey yok.
--
-- ── Değişenler ──────────────────────────────────────────────────────────────
--   rol  staff_rt                       yalnız zil dinler, tablo okumaz
--   realtime.messages üzerinde 2 policy müdür (üyelik) + personel (org talebi)
--   public.ring_org()                   tetikleyici işlevi
--   reservations / payments             satır değişince zil çalar
-- ============================================================

begin;

-- ── 1 · Zil rolü ────────────────────────────────────────────────────────────
--
-- YETKİSİZ olması işin tamamı. `authenticated` kullanılamazdı: aynı sırla
-- imzalanmış bir jeton PostgREST'e de geçerli gelir ve RLS org seviyesinde
-- olduğu için salonun bütün verisini açardı. Bu rol yalnız zil duyar.

do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'staff_rt') then
        create role staff_rt nologin noinherit;
    end if;
end
$$;

-- PostgREST rol değiştirebilsin diye DEĞİL — Realtime'ın bağlandığı kullanıcı
-- `set local role staff_rt` yapabilsin diye. `authenticator`a da veriliyor ki
-- jeton yanlışlıkla PostgREST'e gitse "rol yok" hatası yerine YETKİSİZ bir
-- oturum açılsın: sonuç aynı (hiçbir şey okuyamaz), hata mesajı dürüst olur.
do $$
begin
    if exists (select 1 from pg_roles where rolname = 'authenticator') then
        execute 'grant staff_rt to authenticator';
    end if;
    if exists (select 1 from pg_roles where rolname = 'supabase_realtime_admin') then
        execute 'grant staff_rt to supabase_realtime_admin';
    end if;
end
$$;

-- Zili duymak için gereken EN AZ yetki. `public` şemasına hiçbir şey
-- verilmiyor; verilmediği için de yanlışlıkla bir şey okunamıyor.
grant usage on schema realtime to staff_rt;
grant select on realtime.messages to staff_rt;

-- ── 2 · Kim hangi zili duyabilir ────────────────────────────────────────────
--
-- Konu adı `org:<uuid>`. İki ayrı kural, çünkü iki ayrı kimlik var.

alter table realtime.messages enable row level security;

drop policy if exists "mudur kendi salonunun zilini duyar" on realtime.messages;
create policy "mudur kendi salonunun zilini duyar"
    on realtime.messages
    for select
    to authenticated
    using (
        exists (
            select 1
            from public.organization_members m
            where m.user_id = auth.uid()
              and realtime.topic() = 'org:' || m.org_id::text
        )
    );

-- Personelin jetonu `org` talebini taşıyor ve onu `staff-api` yazıyor —
-- telefon kendi org'unu seçemiyor. Jeton kısa ömürlü; süresi dolunca
-- `staff-api`den yenisi alınıyor.
drop policy if exists "personel kendi salonunun zilini duyar" on realtime.messages;
create policy "personel kendi salonunun zilini duyar"
    on realtime.messages
    for select
    to staff_rt
    using (realtime.topic() = 'org:' || coalesce(auth.jwt() ->> 'org', ''));

-- ── 3 · Zili çalan ──────────────────────────────────────────────────────────
--
-- Gövde BİLEREK ZAYIF: yalnız hangi tablonun değiştiği. Randevunun kendisini
-- göndermek, kanalı bir veri yoluna çevirir ve izin kontrolünü oraya taşırdı.
-- Telefon "değişti"yi duyup veriyi kendi yolundan çekiyor.

create or replace function public.ring_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org uuid;
begin
    v_org := coalesce(
        (case when tg_op = 'DELETE' then old.organization_id else new.organization_id end),
        null
    );
    if v_org is null then
        return coalesce(new, old);
    end if;

    -- `realtime.send` hata fırlatırsa RANDEVU YAZILMASIN diye değil: zil
    -- çalmadı diye bir randevunun kaydedilmemesi kabul edilemez. Bu yüzden
    -- hata yutuluyor ve yoklama emniyet ağı devreye giriyor.
    begin
        perform realtime.send(
            jsonb_build_object('t', tg_table_name),
            'changed',
            'org:' || v_org::text,
            true
        );
    exception when others then
        null;
    end;

    return coalesce(new, old);
end;
$$;

drop trigger if exists ring_on_reservations on public.reservations;
create trigger ring_on_reservations
    after insert or update or delete on public.reservations
    for each row execute function public.ring_org();

drop trigger if exists ring_on_payments on public.payments;
create trigger ring_on_payments
    after insert or update or delete on public.payments
    for each row execute function public.ring_org();

commit;

-- ── Doğrulama ───────────────────────────────────────────────────────────────
-- 1) Rol yetkisiz mi (public şemasında hiçbir şey görmemeli):
--    select count(*) from information_schema.role_table_grants
--     where grantee = 'staff_rt' and table_schema = 'public';      -- 0 olmalı
--
-- 2) Politikalar yerinde mi:
--    select policyname, roles from pg_policies
--     where schemaname = 'realtime' and tablename = 'messages';    -- 2 satır
--
-- 3) Zil çalıyor mu (bir randevunun saatini değiştirip geri alın):
--    select topic, event, inserted_at from realtime.messages
--     order by inserted_at desc limit 5;
