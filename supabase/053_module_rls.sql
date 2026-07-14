-- 053: Modül RLS'i — modül kapalıysa modüle ÖZEL tablolara erişim DB'de de kapanır.
-- Yalnız modül-özel tablolara uygulanır (tables, table_reservations, queue_entries,
-- waitlist); paylaşılan tablolara (customers, payments, reservations) DOKUNULMAZ —
-- randevu verisi kasadan/analizden okunabilmeli. organizations.modules JSONB'de
-- anahtar yoksa açık sayılır (frontend normalizeModules ile aynı fail-open davranış).

CREATE OR REPLACE FUNCTION org_module_enabled(p_org_id UUID, p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((o.modules ->> p_key)::boolean, TRUE)
    FROM organizations o
    WHERE o.id = p_org_id;
$$;

-- Masa modülü
DROP POLICY IF EXISTS "tables_org_access" ON tables;
CREATE POLICY "tables_org_access" ON tables
    FOR ALL USING (
        organization_id IN (SELECT auth_user_org_ids())
        AND org_module_enabled(organization_id, 'masa')
    )
    WITH CHECK (
        organization_id IN (SELECT auth_user_org_ids())
        AND org_module_enabled(organization_id, 'masa')
    );

DROP POLICY IF EXISTS "table_res_org_access" ON table_reservations;
CREATE POLICY "table_res_org_access" ON table_reservations
    FOR ALL USING (
        organization_id IN (SELECT auth_user_org_ids())
        AND org_module_enabled(organization_id, 'masa')
    )
    WITH CHECK (
        organization_id IN (SELECT auth_user_org_ids())
        AND org_module_enabled(organization_id, 'masa')
    );

-- Sıra modülü
DROP POLICY IF EXISTS "queue_org_access" ON queue_entries;
CREATE POLICY "queue_org_access" ON queue_entries
    FOR ALL USING (
        organization_id IN (SELECT auth_user_org_ids())
        AND org_module_enabled(organization_id, 'sira')
    )
    WITH CHECK (
        organization_id IN (SELECT auth_user_org_ids())
        AND org_module_enabled(organization_id, 'sira')
    );

-- Randevu modülü (bekleme listesi)
DROP POLICY IF EXISTS "waitlist_org_access" ON waitlist;
CREATE POLICY "waitlist_org_access" ON waitlist
    FOR ALL USING (
        organization_id IN (SELECT auth_user_org_ids())
        AND org_module_enabled(organization_id, 'randevu')
    )
    WITH CHECK (
        organization_id IN (SELECT auth_user_org_ids())
        AND org_module_enabled(organization_id, 'randevu')
    );
