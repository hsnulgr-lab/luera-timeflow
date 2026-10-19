-- ============================================================
-- Abonelik hattı — SALT OKUNUR kontrol (TimeFlow veritabanı)
-- ============================================================
-- Hiçbir şey yazmaz. Sır DEĞERİ basmaz: yalnız anahtarın var olup olmadığı,
-- uzunluğu ve adreslerin yalnız host kısmı. Ürün haritasından yalnız anahtar
-- adları (plan_dönem), ürün kimlikleri değil.
--
-- Çalıştırma (kullanıcı):
--   ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -' < ~/Projects/luera-timeflow/ops/abonelik/kontrol-oku.sql
-- ============================================================

\echo '§1 · Abonelik sırları (değer YOK — varlık / host / uzunluk)'
SELECT key,
       CASE
         WHEN key IN ('CORE_SUPABASE_URL', 'DODO_API_BASE', 'APP_URL')
           THEN regexp_replace(value, '^(https?://[^/]+).*$', '\1')
         WHEN key IN ('ENTITLEMENT_ENFORCE', 'DODO_TRIAL_DAYS')
           THEN value
         WHEN key = 'DODO_PRODUCT_MAP'
           THEN CASE WHEN value ~ '^\s*\{'
                     THEN (SELECT string_agg(k, ', ' ORDER BY k) FROM jsonb_object_keys(value::jsonb) AS k)
                     ELSE '(JSON değil!)' END
         ELSE '(' || length(value) || ' karakter)'
       END AS gorunen
FROM app_secrets
WHERE key IN ('CORE_SUPABASE_URL', 'CORE_SERVICE_KEY', 'DODO_API_KEY', 'DODO_API_BASE',
              'DODO_WEBHOOK_SECRET', 'DODO_PRODUCT_MAP', 'DODO_TRIAL_DAYS',
              'ENTITLEMENT_ENFORCE', 'APP_URL')
ORDER BY key;

\echo '§1b · Beklenen ama OLMAYAN anahtarlar'
SELECT k AS eksik
FROM unnest(ARRAY['CORE_SUPABASE_URL', 'CORE_SERVICE_KEY', 'DODO_API_KEY', 'DODO_API_BASE',
                  'DODO_WEBHOOK_SECRET', 'DODO_PRODUCT_MAP']) AS k
WHERE NOT EXISTS (SELECT 1 FROM app_secrets s WHERE s.key = k);

\echo '§2 · Abonelik aynası — her satır (ad, durum, bitiş, son olay)'
SELECT left(o.name, 28)                                  AS isletme,
       e.state, e.plan, e.cycle,
       to_char(e.expires_at  AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI') AS bitis,
       to_char(e.grace_until AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI') AS ek_sure,
       e.last_event,
       to_char(e.updated_at  AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI') AS guncellendi,
       CASE
         WHEN e.expires_at IS NULL                       THEN 'süresiz'
         WHEN e.expires_at < now()                       THEN 'SÜRESİ GEÇMİŞ'
         WHEN e.expires_at < now() + interval '14 days'  THEN '14 gün içinde biter'
         ELSE 'ok'
       END AS durum,
       public.has_timeflow_access(e.organization_id)     AS bugun_kapi,
       -- ENFORCE açılsaydı (bayrağı yok sayan aynı ifade, 086):
       (e.state IN ('trial', 'active', 'grace')
        AND (e.expires_at IS NULL OR e.expires_at > now())
        AND (e.state <> 'grace' OR (e.grace_until IS NOT NULL AND e.grace_until > now()))) AS enforce_acilsa
FROM org_entitlement e
JOIN organizations o ON o.id = e.organization_id
ORDER BY e.expires_at NULLS LAST;

\echo '§3 · Ayna satırı OLMAYAN işletmeler (ENFORCE açılınca anında kilitlenir)'
SELECT count(*)                                                      AS toplam,
       count(*) FILTER (WHERE o.created_at > now() - interval '30 days') AS son_30_gun
FROM organizations o
WHERE NOT EXISTS (SELECT 1 FROM org_entitlement e WHERE e.organization_id = o.id);

\echo '§4 · Dodo bildirimi en son ne zaman aynaya yazdı?'
SELECT max(updated_at) FILTER (WHERE last_event LIKE 'subscription.%' OR last_event LIKE 'payment.%') AS son_dodo_yazimi,
       max(updated_at) FILTER (WHERE last_event = 'manual_mirror_repair')                          AS son_elle_onarim,
       count(*) FILTER (WHERE last_event = 'manual_mirror_repair')                                 AS elle_onarilan
FROM org_entitlement;
