-- ============================================================
-- PERSONEL TELEFONU EŞLEŞTİRME KODU — geliştirme/test aracı
-- ============================================================
-- Supabase SQL Editor'de TAMAMINI çalıştırın. Son sonuç tek satırdır:
--   kod      → telefondaki "Eşleştirme kodu" ekranına yazılacak 6 hane
--   personel → kodun bağlı olduğu kişi (kod girilince doğrudan PIN ekranı)
--   pin_var  → false ise giriş YAPILAMAZ: masaüstü Personel sayfasından PIN verin
--   gecerli  → kodun son kullanma anı (60 dk, tek kullanımlık)
--
-- Yalnız İKİ yerdeki personel adını ve gerekirse kodu değiştirin.
-- Kodun kendisi saklanmaz, SHA-256'sı saklanır (staff-api · hashPin ile aynı).
-- ============================================================

-- 1 · Temizlik: yanlış deneme kilidi + aynı kodun ve aynı personelin açık
--     eski kodları KAPANIR (silinmez, "kullanıldı" işaretlenir). Açık bir
--     eski "123456" kaldıkça yenisi eklenemez: kullanılmamış kodlar tekil.
delete from public.staff_pair_attempts;

update public.staff_device_codes d
set used_at = now()
where d.used_at is null
  and (
      d.code_hash = encode(sha256(convert_to('123456', 'UTF8')), 'hex')      -- ← kod
      or d.staff_id in (
          select s.id from public.staff s
          where s.organization_id = '108fa88a-02c3-48c8-96a3-41d0753585e3'
            and lower(s.name) = lower('Kemal')                               -- ← personel
      )
  );

-- 2 · Yeni kod.
insert into public.staff_device_codes (organization_id, staff_id, code_hash, expires_at, created_by)
select o.id, s.id, encode(sha256(convert_to('123456', 'UTF8')), 'hex'), now() + interval '60 minutes', o.owner_id  -- ← kod
from public.organizations o
join public.staff s on s.organization_id = o.id
    and lower(s.name) = lower('Kemal')                                       -- ← personel
    and s.is_active
where o.id = '108fa88a-02c3-48c8-96a3-41d0753585e3';

-- 3 · Sonuç.
select
    '123456'                              as kod,       -- ← kod
    s.name                                as personel,
    (coalesce(s.pin, '') <> '')           as pin_var,
    d.expires_at                          as gecerli
from public.staff_device_codes d
join public.staff s on s.id = d.staff_id
where d.used_at is null
  and d.expires_at > now()
  and d.code_hash = encode(sha256(convert_to('123456', 'UTF8')), 'hex');     -- ← kod

-- Sonuç BOŞSA: ad yanlış yazıldı ya da personel pasif. Adları görmek için:
-- select name, is_active, (coalesce(pin, '') <> '') as pin_var from public.staff
-- where organization_id = '108fa88a-02c3-48c8-96a3-41d0753585e3' order by name;
