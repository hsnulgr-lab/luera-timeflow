-- Hediye üyelik — ver / al / liste (2026-10-19).
--
-- Kullanım: ops/abonelik/hediye.sh (bu dosyayı psql değişkenleriyle VPS 1'e
-- gönderir). Elle: psql -v islem=ver -v email=a@b.com -v gun=90 -v plan=pro -f hediye.sql
--
-- Hediye = Dodo'ya hiç gitmeyen abonelik: aynaya (org_entitlement) "aktif,
-- bitiş şu tarih ya da süresiz" yazılır, Dodo kimliği yoktur. Webhook bu
-- satıra dokunmaz (Dodo aboneliği yok); checkout süren hediye varken yeni
-- satın almayı reddeder; süre bitince kapı kendiliğinden kapanır.
--
-- Korumalar: süren Dodo aboneliğinin ve demo salonun üstüne YAZILMAZ; "al"
-- yalnız hediyeyi geri alır. Tek DO bloğu → hata çıkarsa hiçbir şey yazılmaz.

\if :{?islem}
\else
\set islem liste
\endif
\if :{?email}
\else
\set email ''
\endif
\if :{?gun}
\else
\set gun 0
\endif
\if :{?plan}
\else
\set plan pro
\endif

SELECT set_config('hediye.islem', :'islem', false) AS i,
       set_config('hediye.email', :'email', false) AS e,
       set_config('hediye.gun', :'gun', false) AS g,
       set_config('hediye.plan', :'plan', false) AS p \gset

DO $$
DECLARE
    v_islem TEXT := current_setting('hediye.islem');
    v_email TEXT := lower(trim(current_setting('hediye.email')));
    v_gun   INT  := current_setting('hediye.gun')::int;
    v_plan  TEXT := current_setting('hediye.plan');
    v_user  UUID;
    v_org   UUID;
    v_n     INT;
    v_row   public.org_entitlement%ROWTYPE;
BEGIN
    IF v_islem = 'liste' THEN RETURN; END IF;
    IF v_islem NOT IN ('ver', 'al') THEN
        RAISE EXCEPTION 'islem ver | al | liste olmalı (gelen: %)', v_islem;
    END IF;
    IF v_email = '' THEN RAISE EXCEPTION 'e-posta gerekli'; END IF;

    SELECT count(*), min(id::text)::uuid INTO v_n, v_user
    FROM auth.users WHERE lower(email) = v_email;
    IF v_n <> 1 THEN
        RAISE EXCEPTION '% için % kullanıcı bulundu (1 olmalı)', v_email, v_n;
    END IF;

    SELECT count(*), min(org_id::text)::uuid INTO v_n, v_org
    FROM public.organization_members WHERE user_id = v_user AND role = 'owner';
    IF v_n <> 1 THEN
        RAISE EXCEPTION '% kişisinin sahibi olduğu % işletme var (1 olmalı)', v_email, v_n;
    END IF;

    SELECT * INTO v_row FROM public.org_entitlement WHERE organization_id = v_org;

    -- Demo salon (App Store hakemi) kendi tohumuyla yönetilir; dokunulmaz.
    IF v_row.last_event = 'demo_manual' THEN
        RAISE EXCEPTION 'Bu demo salon; hediye verilmez/alınmaz';
    END IF;

    IF v_islem = 'ver' THEN
        IF v_plan NOT IN ('baslangic', 'pro', 'isletme') THEN
            RAISE EXCEPTION 'plan baslangic | pro | isletme olmalı (gelen: %)', v_plan;
        END IF;
        IF v_gun < 0 OR v_gun > 3650 THEN
            RAISE EXCEPTION 'gün 0 (süresiz) ile 3650 arasında olmalı (gelen: %)', v_gun;
        END IF;
        -- Ödeyen abonenin üstüne yazılmaz: Dodo tahsilata devam eder, ayna
        -- ise hediye der — kimse fark etmeden çift durum.
        IF v_row.dodo_subscription_id IS NOT NULL
           AND v_row.state IN ('trial', 'active', 'grace')
           AND (v_row.state = 'grace' OR v_row.expires_at IS NULL OR v_row.expires_at > now()) THEN
            RAISE EXCEPTION 'Bu işletmenin süren bir Dodo aboneliği var (%); önce o iptal edilmeli',
                v_row.dodo_subscription_id;
        END IF;

        INSERT INTO public.org_entitlement
            (organization_id, state, plan, cycle, trial_ends_at, expires_at, grace_until,
             cancel_at_period_end, cancelled_at, last_event, updated_at)
        VALUES
            (v_org, 'active', v_plan, NULL, NULL,
             CASE WHEN v_gun = 0 THEN NULL ELSE now() + make_interval(days => v_gun) END,
             NULL, false, NULL, 'comp_manual', now())
        ON CONFLICT (organization_id) DO UPDATE SET
            state = 'active', plan = EXCLUDED.plan, cycle = NULL, trial_ends_at = NULL,
            expires_at = EXCLUDED.expires_at, grace_until = NULL,
            cancel_at_period_end = false, cancelled_at = NULL,
            last_event = 'comp_manual', updated_at = now();

        RAISE NOTICE 'Hediye VERİLDİ: % · işletme % · plan % · %', v_email, left(v_org::text, 8), v_plan,
            CASE WHEN v_gun = 0 THEN 'süresiz' ELSE v_gun || ' gün' END;
    ELSE
        IF v_row.organization_id IS NULL OR v_row.last_event IS DISTINCT FROM 'comp_manual' THEN
            RAISE EXCEPTION 'Bu işletmede süren hediye üyelik yok (son olay: %)',
                coalesce(v_row.last_event, 'kayıt yok');
        END IF;
        UPDATE public.org_entitlement
        SET state = 'locked', expires_at = now(), last_event = 'comp_revoked', updated_at = now()
        WHERE organization_id = v_org;
        RAISE NOTICE 'Hediye GERİ ALINDI: % · işletme %', v_email, left(v_org::text, 8);
    END IF;
END $$;

-- Hediye listesi (her çağrının sonunda)
SELECT u.email,
       left(e.organization_id::text, 8) AS isletme,
       e.plan,
       e.state AS durum,
       coalesce(to_char(e.expires_at AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD'), 'süresiz') AS bitis,
       e.last_event AS son,
       to_char(e.updated_at AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI') AS guncellendi
FROM public.org_entitlement e
LEFT JOIN public.organization_members m ON m.org_id = e.organization_id AND m.role = 'owner'
LEFT JOIN auth.users u ON u.id = m.user_id
WHERE e.last_event IN ('comp_manual', 'comp_revoked')
ORDER BY e.updated_at DESC;
