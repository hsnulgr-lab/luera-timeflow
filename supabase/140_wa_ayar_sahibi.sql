-- ============================================================
-- TimeFlow Migration 140: WhatsApp çoklu işletme hazırlığı (Faz 2)
-- ============================================================
-- 1. İki tetikleyici işletmenin ayarını `limit 1` ile SIRASIZ okuyordu:
--    kontrendikasyon kuralı (076 guard_reservation_eligibility) ve paket/tedavi
--    türü (077 set_treatment_plan_kind). settings kullanıcı başına bir satır;
--    ikinci bir giriş eklenince rastgele satır (örneğin sektörü 'genel' olan
--    üyenin satırı) seçilebiliyordu. Artık sahibin satırı, yoksa en eskisi —
--    sunucudaki _shared/org.ts ownerSettings ile aynı kural. Gövdelerin geri
--    kalanı 076/077 ile birebir aynı (canlıdaki 076 dosyayla aynı; 077'de
--    canlıda yalnız iki yorum satırı eksikti, 2026-11-08 doğrulandı).
--
-- 2. org_whatsapp.campaign_run_at: remind işletmeleri tek çalışmada sırayla
--    geziyordu ve zaman sınırı yoktu; çok işletmede listenin sonu hiç sıra
--    almıyordu. Artık "en uzun süredir işlenmeyen önce" ve 40 sn bütçe. Kolon
--    istemciye açılmaz (139'un kolon izni listesinde yok).
--
-- Tekrar çalıştırılabilir.

BEGIN;

create or replace function public.guard_reservation_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_rules      jsonb;
    v_fields     jsonb;
    v_tags       text[];
    v_rule       jsonb;
    v_flag_value jsonb;
    v_blocks     text[];
    v_pattern    text;
    v_name       text;
begin
    if new.customer_id is null or new.service is null then
        return new;
    end if;

    -- Doluluk/uygunluk alanları değişmediyse eski kayıtları yeniden denetleme:
    -- geçmişteki bir randevuya not eklemek, bugünün kuralıyla reddedilmemeli.
    if tg_op = 'UPDATE'
       and new.service is not distinct from old.service
       and new.customer_id is not distinct from old.customer_id then
        return new;
    end if;

    -- 140: sahibin satırı, yoksa en eskisi (settings kullanıcı başına).
    select s.risk_rules into v_rules
      from public.settings s
      left join public.organizations o on o.id = s.organization_id
     where s.organization_id = new.organization_id
     order by (s.user_id = o.owner_id) desc nulls last, s.created_at asc
     limit 1;

    if v_rules is null or jsonb_typeof(v_rules) <> 'array' then
        return new;
    end if;

    select c.custom_fields into v_fields
      from public.customers c
     where c.id = new.customer_id
       and c.organization_id = new.organization_id;

    if v_fields is null then
        return new;
    end if;

    select coalesce(sv.tags, '{}') into v_tags
      from public.services sv
     where sv.organization_id = new.organization_id
       and lower(sv.name) = lower(new.service)
     limit 1;

    v_name := lower(new.service);

    for v_rule in select * from jsonb_array_elements(v_rules)
    loop
        v_flag_value := v_fields -> (v_rule ->> 'key');

        -- Bayrak aktif mi? true ya da boş olmayan metin.
        continue when v_flag_value is null
                   or v_flag_value = 'false'::jsonb
                   or v_flag_value = 'null'::jsonb
                   or (jsonb_typeof(v_flag_value) = 'string' and btrim(v_flag_value #>> '{}') = '');

        select coalesce(array_agg(value::text), '{}')
          into v_blocks
          from jsonb_array_elements_text(coalesce(v_rule -> 'blocks', '[]'::jsonb)) as value;

        if array_length(v_tags, 1) is not null and v_tags && v_blocks then
            raise exception using
                errcode = '23514',
                message = 'reservation_eligibility_blocked',
                detail  = jsonb_build_object(
                    'reason', v_rule ->> 'label',
                    'note', v_rule ->> 'note',
                    'service', new.service
                )::text;
        end if;

        -- Etiketsiz (eski) hizmetler için ad eşleşmesi. Desen ASCII yazılır;
        -- Türkçe İ/I sorunları için ad burada da katlanır (bkz. serviceEligibility.foldTr).
        v_pattern := v_rule ->> 'legacyNamePattern';
        if (array_length(v_tags, 1) is null or v_tags = '{}') and v_pattern is not null then
            if translate(v_name, 'İIıöüçşğ', 'iiioucsg') ~ v_pattern then
                raise exception using
                    errcode = '23514',
                    message = 'reservation_eligibility_blocked',
                    detail  = jsonb_build_object(
                        'reason', v_rule ->> 'label',
                        'note', v_rule ->> 'note',
                        'service', new.service
                    )::text;
            end if;
        end if;
    end loop;

    return new;
end;
$$;

create or replace function public.set_treatment_plan_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_sector text;
begin
    -- Uygulama açıkça yazdıysa dokunma: paket satışı sektörden bağımsız olarak
    -- kendi türünü bilir (bkz. useOrgPackages.addPackage).
    if new.plan_kind is not null then
        return new;
    end if;

    -- 140: sahibin satırı, yoksa en eskisi (settings kullanıcı başına).
    select s.sector into v_sector
      from public.settings s
      left join public.organizations o on o.id = s.organization_id
     where s.organization_id = new.organization_id
     order by (s.user_id = o.owner_id) desc nulls last, s.created_at asc
     limit 1;

    new.plan_kind := case
        when v_sector in ('dis', 'saglik', 'fizyoterapi') then 'tedavi'
        else 'paket'
    end;
    return new;
end;
$$;

ALTER TABLE public.org_whatsapp
    ADD COLUMN IF NOT EXISTS campaign_run_at TIMESTAMPTZ;

COMMENT ON COLUMN public.org_whatsapp.campaign_run_at IS
    '140 · remind bu işletmenin kampanya/hatırlatma turunu en son ne zaman bitirdi; sıra en eskiden başlar.';

NOTIFY pgrst, 'reload schema';

COMMIT;
