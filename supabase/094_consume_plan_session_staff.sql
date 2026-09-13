-- 094 — Paket hakkı TELEFONDAN da düşsün
--
-- 078 hakkı atomik düşüren fonksiyonu yazdı ve masaüstü onu çağırıyor. Mobil
-- `visit.finish` ise ÇAĞIRMIYORDU: personel işlemi telefondan bitirdiğinde
-- randevu `completed` oluyor, stok düşüyor, adisyon kasaya gidiyor — ama
-- müşterinin paket hakkı HİÇ AZALMIYORDU. 10 seanslık paket sınırsız
-- kullanılabiliyordu.
--
-- Faz 4'e kadar bu uykudaydı: telefon hiçbir şey yazmıyordu. `visit.finish`
-- üretime yazmaya başlayınca uyandı.
--
-- ── Neden yeni bir fonksiyon gerekti ─────────────────────────────────────────
-- 078 org kontrolünü `auth_user_org_ids()` ile yapıyor, o da `auth.uid()`e
-- dayanıyor. `staff-api` SERVİS ANAHTARIYLA çalışıyor ve personel cihazında
-- Supabase oturumu YOK — `auth.uid()` null, küme boş, fonksiyon `forbidden`
-- fırlatırdı.
--
-- Çözüm gövdeyi KOPYALAMAK DEĞİL: mantık tek bir çekirdeğe indi, iki ince
-- sarmalayıcı yalnız "bu çağıran bu org'a dokunabilir mi" sorusunu kendi
-- yöntemiyle cevaplıyor. Kopyalansaydı ikisi bir gün ayrışırdı ve ayrışan şey
-- para olurdu.
--
--   consume_plan_session_core       hiçbir yetki kontrolü yok, kimseye GRANT yok
--   consume_plan_session            authenticated → üyelik kontrolü (078'in yüzü)
--   consume_plan_session_for_staff  service_role  → org'u çağıran bildirir

-- ── Çekirdek ────────────────────────────────────────────────────────────────
--
-- Yetki kontrolü YOK ve bu bilinçli: çağıran onu zaten yapmış olmak zorunda.
-- Hiçbir role GRANT verilmiyor, yani dışarıdan çağrılamaz.
create or replace function public.consume_plan_session_core(
    p_plan_id        uuid,
    p_reservation_id uuid,
    p_org_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_res   record;
    v_plan  record;
    v_cf    jsonb;
    v_total integer;
    v_prev  integer;
    v_done  integer;
begin
    -- Randevu önce kilitlenir: aynı randevunun eşzamanlı iki tamamlaması
    -- burada sıraya girer, ikincisi bayrağı görüp no-op döner. Telefon ve
    -- masaüstü artık gerçekten aynı anda bitirebiliyor.
    select id, organization_id, custom_fields
      into v_res
      from public.reservations
     where id = p_reservation_id
       for update;

    if not found then
        raise exception 'reservation_not_found' using errcode = 'P0002';
    end if;

    -- Org EŞLEŞMEK zorunda. Sarmalayıcı hangi org'a yetkili olduğunu bildirdi;
    -- burada o iddia randevunun kendisine karşı doğrulanıyor.
    if v_res.organization_id <> p_org_id then
        raise exception 'forbidden' using errcode = '42501';
    end if;

    v_cf := coalesce(v_res.custom_fields, '{}'::jsonb);

    select id, customer_id, session_count, sessions_done
      into v_plan
      from public.treatment_plans
     where id = p_plan_id
       and organization_id = p_org_id
       for update;

    if not found then
        raise exception 'plan_not_found' using errcode = 'P0002';
    end if;

    v_total := greatest(1, coalesce(v_plan.session_count, 1));
    v_prev  := greatest(0, coalesce(v_plan.sessions_done, 0));

    -- Zaten sayılmış: hiçbir şeyi değiştirme, mevcut durumu bildir.
    if coalesce(v_cf ->> 'paket_sayildi', 'false') = 'true' then
        return jsonb_build_object('counted', false, 'reason', 'already_counted',
                                  'done', v_prev, 'total', v_total);
    end if;

    v_done := least(v_total, v_prev + 1);

    -- Hakkı bitmiş plan: bayrağı yine de bas ki her açılışta yeniden denenmesin.
    if v_done = v_prev then
        update public.reservations
           set custom_fields = v_cf || jsonb_build_object('paket_sayildi', true)
         where id = p_reservation_id;
        return jsonb_build_object('counted', false, 'reason', 'plan_exhausted',
                                  'done', v_prev, 'total', v_total);
    end if;

    update public.treatment_plans
       set sessions_done = v_done,
           status = case when v_done >= v_total then 'completed' else status end
     where id = p_plan_id;

    update public.reservations
       set custom_fields = v_cf || jsonb_build_object('paket_sayildi', true)
     where id = p_reservation_id;

    insert into public.package_rights_ledger
        (organization_id, plan_id, customer_id, field, kind,
         prev_value, new_value, delta, reason)
    values
        (p_org_id, p_plan_id, v_plan.customer_id, 'used', 'use',
         v_prev, v_done, v_done - v_prev, 'Seans tamamlandı');

    return jsonb_build_object('counted', true, 'done', v_done, 'total', v_total,
                              'completed', v_done >= v_total);
end;
$$;

revoke all on function public.consume_plan_session_core(uuid, uuid, uuid) from public;

-- ── Masaüstü yüzü ───────────────────────────────────────────────────────────
--
-- 078'in imzası ve davranışı DEĞİŞMİYOR: masaüstü aynı çağrıyı yapmaya devam
-- ediyor. Değişen tek şey gövdenin artık çekirdeğe devredilmesi.
create or replace function public.consume_plan_session(
    p_plan_id        uuid,
    p_reservation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org uuid;
begin
    select organization_id into v_org
      from public.reservations
     where id = p_reservation_id;

    if v_org is null then
        raise exception 'reservation_not_found' using errcode = 'P0002';
    end if;

    -- Üyelik kontrolü BURADA: oturumlu kullanıcı yalnız kendi org'una dokunur.
    if v_org not in (select public.auth_user_org_ids()) then
        raise exception 'forbidden' using errcode = '42501';
    end if;

    return public.consume_plan_session_core(p_plan_id, p_reservation_id, v_org);
end;
$$;

revoke all on function public.consume_plan_session(uuid, uuid) from public;
grant execute on function public.consume_plan_session(uuid, uuid) to authenticated;

-- ── Personel (staff-api) yüzü ───────────────────────────────────────────────
--
-- Org'u ÇAĞIRAN bildiriyor, çünkü personel cihazında Supabase oturumu yok.
-- Bu güvenli, çünkü:
--   • yalnız `service_role`a GRANT verildi — anahtar yalnız edge function'da
--   • `staff-api` org'u personel TOKEN'ından okuyor, istek gövdesinden değil
--   • çekirdek iddiayı randevunun kendisine karşı doğruluyor
create or replace function public.consume_plan_session_for_staff(
    p_plan_id        uuid,
    p_reservation_id uuid,
    p_org_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_org_id is null then
        raise exception 'forbidden' using errcode = '42501';
    end if;
    return public.consume_plan_session_core(p_plan_id, p_reservation_id, p_org_id);
end;
$$;

revoke all on function public.consume_plan_session_for_staff(uuid, uuid, uuid) from public;
grant execute on function public.consume_plan_session_for_staff(uuid, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
