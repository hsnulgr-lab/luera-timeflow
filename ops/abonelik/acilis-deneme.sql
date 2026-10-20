-- Açılış günü denemesi — ENTITLEMENT_ENFORCE açılmadan HEMEN ÖNCE çalışır.
-- Kurallar: docs/abonelik-kurallari.md §4 (Faz 5).
--
-- Kapı açıldığı an abonelik satırı OLMAYAN işletmeler (124'ten önce açılmış,
-- telefon ya da masaüstü) ve kartsız denemesi çoktan bitmiş telefon
-- işletmeleri (kapı kapalıyken süre işledi ama kimse kilitlenmedi) ilk
-- dakikadan kapalı kapıya düşerdi. Hepsine AÇILIŞ GÜNÜNDEN başlayan kartsız 7
-- gün verilir; e-postalar (Faz 2.5) bu 7 günü sayar.
--
-- DOKUNULMAYANLAR: Dodo aboneliği olan her satır (deneme dahil), demo
-- (`demo_manual`), hediye (`comp_manual` / `comp_revoked`), ek süre ve kilit.
-- Süresi bitmiş Dodo aboneliği olan iç hesaplar burada AYIKLANMAZ — açılış
-- sırasının ikinci adımı (hediye ver ya da sil).
--
-- KURU KOŞU (varsayılan, hiçbir şey yazmaz):
--   cat ops/abonelik/acilis-deneme.sql | ssh -i ~/.ssh/luera_vps root@76.13.4.164 \
--     'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -'
-- UYGULA: aynı komut, psql'e `-v uygula=1` eklenerek. İki kez çalışması
-- zararsızdır: süre yine açılıştan 7 gün olur, 14 olmaz.

\echo '── Açılış denemesi alacak işletmeler (şimdiki satır → sonrası: kartsız 7 gün)'
-- >>> liste
SELECT o.name                                   AS isletme,
       u.email                                  AS sahip,
       COALESCE(e.state, '(satır yok)')         AS simdi,
       e.last_event                             AS son_olay,
       e.expires_at                             AS simdiki_bitis,
       GREATEST(e.expires_at, now() + interval '7 days') AS yeni_bitis
FROM organizations o
LEFT JOIN org_entitlement e ON e.organization_id = o.id
LEFT JOIN auth.users u ON u.id = o.owner_id
WHERE e.organization_id IS NULL
   OR (e.dodo_subscription_id IS NULL
       AND (e.state = 'none'
            OR (e.state = 'trial' AND e.last_event IN ('trial_phone', 'trial_opening'))))
ORDER BY o.name;
-- <<< liste

\if :{?uygula}
-- >>> uygula
INSERT INTO org_entitlement (organization_id, state, plan, trial_ends_at, expires_at, last_event, updated_at)
SELECT o.id, 'trial', 'pro', now() + interval '7 days', now() + interval '7 days', 'trial_opening', now()
FROM organizations o
LEFT JOIN org_entitlement e ON e.organization_id = o.id
WHERE e.organization_id IS NULL
   OR (e.dodo_subscription_id IS NULL
       AND (e.state = 'none'
            OR (e.state = 'trial' AND e.last_event IN ('trial_phone', 'trial_opening'))))
ON CONFLICT (organization_id) DO UPDATE SET
    state         = 'trial',
    plan          = COALESCE(org_entitlement.plan, 'pro'),
    trial_ends_at = GREATEST(org_entitlement.expires_at, EXCLUDED.expires_at),
    expires_at    = GREATEST(org_entitlement.expires_at, EXCLUDED.expires_at),
    grace_until   = NULL,
    last_event    = 'trial_opening',
    updated_at    = now();
-- <<< uygula
\echo 'UYGULANDI — yukarıdaki işletmeler açılıştan itibaren 7 gün kartsız denemede.'
\else
\echo 'KURU KOŞU — hiçbir şey yazılmadı. Uygulamak için psql''e -v uygula=1 ekleyin.'
\endif
