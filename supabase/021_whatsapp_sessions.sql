-- ============================================================
-- TimeFlow Migration 021: WhatsApp AI Randevu — Konuşma Durumu
-- ============================================================
-- Gelen WhatsApp mesajlarıyla çok turlu randevu konuşması.
-- Her (org, telefon) için toplanan bilgi (hizmet/tarih/saat)
-- burada tutulur. Sadece service_role (edge function) erişir.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    phone           TEXT        NOT NULL,
    data            JSONB       NOT NULL DEFAULT '{}',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_wa_sessions_updated ON public.whatsapp_sessions(updated_at);

-- RLS açık + policy YOK → sadece service_role (app_secrets ile aynı desen)
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
