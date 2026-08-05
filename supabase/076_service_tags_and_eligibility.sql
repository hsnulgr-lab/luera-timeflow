-- 076 — Hizmet etiketleri, kontrendikasyon guard'ı ve legacy paket trigger'ının kaldırılması
--
-- Üç iş bir arada, çünkü üçü de aynı hikâyenin parçası: "bu müşteriye bu işlem
-- uygulanabilir mi?" sorusunun tek ve güvenilir bir cevabı olması.
--
-- 1) services.tags        — hizmetin NE olduğunu söyleyen etiketler (lazer, medikal…)
-- 2) settings.risk_rules  — sektörün kontrendikasyon kuralları (kaynak:
--                           src/lib/sectorProfiles.ts riskFlags; uygulama
--                           doldurur, tıpkı 066'daki comms gibi)
-- 3) reservations guard   — UI atlansa bile uygunsuz kayıt DB'ye giremez
--
-- Ayrıca 017'deki trg_decrement_package düşürülür: tamamlanan HER randevuda,
-- hizmet ya da plan eşleşmesi aramadan en eski aktif customer_packages
-- satırından hak düşüyordu. Güzellik/kuaför paket motoru treatment_plans
-- üzerinde çalışıyor; ikisi bir arada aynı tamamlamayı iki deftere yazma
-- riski taşıyor.

-- ── 1) Hizmet etiketleri ────────────────────────────────────────────────────
alter table public.services
    add column if not exists tags text[] not null default '{}';

comment on column public.services.tags is
    'Uygunluk etiketleri (lazer, medikal, bakim…). Kontrendikasyon eşleşmesi bunlarla yapılır; kaynak: src/types Service.tags';

-- ── 2) Sektörün kontrendikasyon kuralları ───────────────────────────────────
alter table public.settings
    add column if not exists risk_rules jsonb;

comment on column public.settings.risk_rules is
    'Sektörün kontrendikasyon kuralları: [{key,label,blocks[],note,legacyNamePattern}]. Kaynak: src/lib/sectorProfiles.ts riskFlags — uygulama doldurur (bkz. syncSectorRules).';

-- ── 3) Legacy paket trigger'ı ───────────────────────────────────────────────
drop trigger if exists trg_decrement_package on public.reservations;
drop function if exists public.decrement_package_on_complete();

-- ── 4) Uygunluk guard'ı ─────────────────────────────────────────────────────
-- UI'daki kontrol (lib/serviceEligibility) kullanıcı deneyimi içindir; bu
-- trigger doğruluğu garanti eder. Kural verisi yoksa (risk_rules NULL) guard
-- sessizce geçer — kuralı olmayan sektörlerde hiçbir maliyeti yoktur.
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

    select s.risk_rules into v_rules
      from public.settings s
     where s.organization_id = new.organization_id
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

-- Dosya 073 iken uygulanmış olabilir (aynı numarada ikinci bir migration
-- bulunduğu için 076'ya taşındı); eski adlı trigger da düşürülür ki kayıt
-- çiftlenmesin.
drop trigger if exists trg_073_guard_eligibility on public.reservations;
drop trigger if exists trg_076_guard_eligibility on public.reservations;
create trigger trg_076_guard_eligibility
    before insert or update of service, customer_id on public.reservations
    for each row
    execute function public.guard_reservation_eligibility();

notify pgrst, 'reload schema';
