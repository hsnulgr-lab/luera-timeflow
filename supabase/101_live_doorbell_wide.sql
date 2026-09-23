-- ============================================================
-- TimeFlow Migration 101: zil BÜTÜN salon tablolarında
-- ============================================================
-- 100'de zil yalnız `reservations` ve `payments` üzerindeydi. Telefon geri
-- kalan her şeyi 25 saniyelik yoklamayla öğreniyordu: masaüstünde bir müşteriye
-- hamilelik bayrağı eklenince telefondaki açık kart bunu hemen göstermiyordu.
-- Kullanıcı kararı (2026-09-20): uygulama AÇIKKEN her şey anında.
--
-- Değişen tek şey tetikleyici SAYISI. `ring_org()` (100) aynen kullanılıyor:
--   • Kanaldan VERİ GEÇMEZ — gövde yalnız `{t: <tablo>}`.
--   • Zil hatası YUTULUR — zil çalmadı diye yazma düşmez.
--   • İzin kontrolü yerinde: telefon haberi duyup veriyi kendi yolundan çeker
--     (müdür RLS ile doğrudan, personel `staff-api` ile).
--
-- `organization_id` kolonu olmayan tabloya tetik KONULMAZ; `ring_org` org'u o
-- kolondan okuyor ve org'u bilinmeyen satırda sessizce çıkıyor.
--
-- Uygulama sırası: 100'den SONRA. Edge function deploy'u GEREKMEZ.
-- Geri alma: aşağıdaki `drop trigger` satırları.
-- ============================================================

begin;

do $$
declare
    t text;
    tables text[] := array[
        'customers',            -- ad, telefon, notlar, risk bayrakları (custom_fields)
        'services',             -- katalog: ad, süre, fiyat, etiketler
        'staff',                -- kadro, roller, şifre sıfırlama
        'staff_time_off',       -- izinler — personel gününü değiştirir
        'settings',             -- çalışma saatleri, risk kuralları, sektör
        'treatment_plans',      -- paketler (tür `paket`) ve tedavi planları
        'package_templates',    -- paket şablonları — satış ekranının listesi
        'customer_packages',    -- eski ticari hak (fizyoterapi)
        'products'              -- kumandanın ürün/malzeme kataloğu
    ];
begin
    foreach t in array tables loop
        -- Tablo ya da org kolonu yoksa atla: bu dosya iki kez çalıştırılabilir
        -- ve eksik modüllü kurulumda patlamaz.
        if not exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = t and column_name = 'organization_id'
        ) then
            raise notice 'atlandı (organization_id yok): %', t;
            continue;
        end if;

        execute format('drop trigger if exists ring_on_%1$s on public.%1$I', t);
        execute format(
            'create trigger ring_on_%1$s after insert or update or delete on public.%1$I '
            'for each row execute function public.ring_org()', t);
        raise notice 'zil takıldı: %', t;
    end loop;
end
$$;

commit;

-- ── Doğrulama ───────────────────────────────────────────────────────────────
-- Zili olan tablolar (reservations + payments 100'den, kalanlar buradan):
--
--   select c.relname
--     from pg_trigger t join pg_class c on c.oid = t.tgrelid
--    where t.tgname like 'ring_on_%' and not t.tgisinternal
--    order by 1;
--
-- Beklenen: customer_packages, customers, package_templates, payments,
-- products, reservations, services, settings, staff, staff_time_off,
-- treatment_plans.
