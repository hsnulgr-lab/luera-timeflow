-- Migration 002: Modüller arası entegrasyon key yönetimi
--
-- integration_connections: TimeFlow'un diğer modüller için ürettiği keyler
-- settings tablosuna sütun ekleme: diğer modüllerin keyleri

CREATE TABLE IF NOT EXISTS integration_connections (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    module      TEXT        NOT NULL CHECK (module IN ('leadflow', 'callflow')),
    api_key     TEXT        NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    active      BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_integration_connections_user_module
    ON integration_connections(user_id, module, active);

ALTER TABLE settings
    ADD COLUMN IF NOT EXISTS leadflow_api_key TEXT,
    ADD COLUMN IF NOT EXISTS callflow_api_key TEXT;

-- RLS
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own integration keys" ON integration_connections
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
