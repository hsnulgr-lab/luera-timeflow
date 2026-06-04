-- Migration 011: Sunucu tarafı sırlar (API key'ler)
-- Edge Function'lar bu tablodan okur. RLS açık + politika YOK →
-- sadece service_role erişebilir (authenticated/anon hiçbir şey göremez).

CREATE TABLE IF NOT EXISTS public.app_secrets (
    key        TEXT        PRIMARY KEY,
    value      TEXT        NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
-- Bilinçli olarak hiç policy eklenmedi: RLS açıkken policy yoksa
-- authenticated/anon erişemez, sadece service_role (RLS bypass) okur/yazar.

NOTIFY pgrst, 'reload schema';
