-- 078 — Paket hakkını atomik düşür
--
-- Pakete bağlı bir seans tamamlanınca `treatment_plans.sessions_done` bir artar.
-- Bu, uygulamada oku-değiştir-yaz olarak yapılıyordu: plan okunur, +1 hesaplanır,
-- geri yazılır. Aradaki boşlukta ikinci bir tamamlama araya girerse (uzman
-- tablette, kasa masaüstünde) iki güncelleme de aynı `sessions_done` değerini
-- okur ve hak BİR kez düşer — müşteri bir seans bedava kullanmış olur. Ters yönü
-- de mümkün: aynı randevu iki kez tamamlanırsa iki kez düşer.
--
-- Çifte sayımı bugün randevudaki `custom_fields.paket_sayildi` bayrağı önlüyor
-- ama o bayrak plan güncellemesinden SONRA ayrı bir istekle yazılıyor: arada
-- hata olursa hak düşmüş, bayrak yazılmamış olur.
--
-- Bu fonksiyon üçünü tek transaction'da yapar (satır kilidiyle):
--   1) randevuyu kilitle, daha önce sayılmış mı bak
--   2) planı kilitle, hakkı düşür, dolduysa planı kapat
--   3) randevuya bayrağı yaz + hak defterine (069) 'use' kaydı düş
--
-- Defterdeki 'use' türü 069'da tanımlıydı ama hiçbir yer yazmıyordu; paket
-- tüketimi böylece denetlenebilir hale gelir.

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
    v_res   record;
    v_plan  record;
    v_cf    jsonb;
    v_total integer;
    v_prev  integer;
    v_done  integer;
begin
    -- Randevu önce kilitlenir: aynı randevunun eşzamanlı iki tamamlaması
    -- burada sıraya girer, ikincisi bayrağı görüp no-op döner.
    select id, organization_id, custom_fields
      into v_res
      from public.reservations
     where id = p_reservation_id
       for update;

    if not found then
        raise exception 'reservation_not_found' using errcode = 'P0002';
    end if;

    if v_res.organization_id not in (select public.auth_user_org_ids()) then
        raise exception 'forbidden' using errcode = '42501';
    end if;

    v_cf := coalesce(v_res.custom_fields, '{}'::jsonb);

    select id, customer_id, session_count, sessions_done
      into v_plan
      from public.treatment_plans
     where id = p_plan_id
       and organization_id = v_res.organization_id
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
        (v_res.organization_id, p_plan_id, v_plan.customer_id, 'used', 'use',
         v_prev, v_done, v_done - v_prev, 'Seans tamamlandı');

    return jsonb_build_object('counted', true, 'done', v_done, 'total', v_total,
                              'completed', v_done >= v_total);
end;
$$;

revoke all on function public.consume_plan_session(uuid, uuid) from public;
grant execute on function public.consume_plan_session(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
