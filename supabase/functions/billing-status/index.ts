import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Faturalandırma durumu — BillingTab'in veri kaynağı.
 *
 * Abonelik verisi LUERA Core'da yaşar; client Core'a doğrudan erişemez.
 * Bu fonksiyon JWT ile kullanıcıyı doğrular, org'u server-side çözer ve
 * Core'daki subscriptions + billing_events kayıtlarını proxy'ler.
 *
 * Dönüş: { subscription: {...} | null, invoices: [...] }
 * Core yapılandırılmamışsa hata DEĞİL boş durum döner (UI "abonelik yok" gösterir).
 */

const MODULE_NAME = 'timeflow';

// Core plan_tier → TimeFlow plan adı (metadata.plan yoksa yedek eşleme)
const PLAN_FROM_TIER: Record<string, string> = { starter: 'baslangic', growth: 'pro', enterprise: 'isletme' };

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // 1) Kullanıcıyı JWT'den doğrula
        const authHeader = req.headers.get('Authorization') || '';
        const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (!jwt) return json({ error: 'unauthorized' }, 401);

        const admin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
        if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

        // 2) Org'u server-side çöz
        const { data: member } = await admin
            .from('organization_members')
            .select('org_id')
            .eq('user_id', userData.user.id)
            .limit(1)
            .maybeSingle();
        const orgId = member?.org_id;
        if (!orgId) return json({ error: 'no_org' }, 403);

        // 3) Core'dan abonelik + fatura geçmişi (sırlar: env → app_secrets)
        const coreUrl = await getSecret(admin, 'CORE_SUPABASE_URL');
        const coreKey = await getSecret(admin, 'CORE_SERVICE_KEY');
        if (!coreUrl || !coreKey) {
            return json({ subscription: null, invoices: [] }, 200);
        }
        const core = createClient(coreUrl, coreKey);

        const [{ data: subs }, { data: events }] = await Promise.all([
            core.from('subscriptions')
                .select('plan_tier, status, expires_at, trial_ends_at, metadata')
                .eq('organization_id', orgId)
                .eq('module_name', MODULE_NAME)
                .in('status', ['trial', 'active', 'past_due'])
                .order('created_at', { ascending: false })
                .limit(1),
            core.from('billing_events')
                .select('event_type, amount, currency, invoice_url, occurred_at')
                .eq('organization_id', orgId)
                .eq('module_name', MODULE_NAME)
                .eq('event_type', 'payment.succeeded')
                .order('occurred_at', { ascending: false })
                .limit(12),
        ]);

        // Core şemasını UI sözleşmesine çevir (bkz. src/hooks/useBilling.ts)
        const row = subs?.[0] ?? null;
        const md = (row?.metadata ?? {}) as Record<string, unknown>;
        const subscription = row ? {
            plan: (md.plan as string) || PLAN_FROM_TIER[row.plan_tier] || 'pro',
            billing_period: (md.cycle as string) || 'monthly',
            // Core 'past_due' → UI 'on_hold' (ÖDEME BEKLENİYOR rozeti); 'trial' aktif sayılır
            status: row.status === 'past_due' ? 'on_hold' : 'active',
            cancel_at_period_end: md.cancel_at_period_end === true,
            expires_at: row.status === 'trial' ? (row.trial_ends_at ?? row.expires_at) : row.expires_at,
            cancelled_at: (md.cancelled_at as string) ?? null,
        } : null;

        const invoices = (events ?? []).map((e: any) => ({
            date: e.occurred_at,
            amount: e.amount,
            currency: e.currency || 'TRY',
            invoiceUrl: e.invoice_url || null,
        }));

        return json({ subscription, invoices }, 200);
    } catch (err) {
        console.error('billing-status error:', err);
        return json({ error: 'Sunucu hatası', detail: String(err) }, 500);
    }
});

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

// Sır okuma: önce env, yoksa app_secrets tablosu (repo deseni)
async function getSecret(supabase: any, key: string): Promise<string | null> {
    const env = Deno.env.get(key);
    if (env) return env;
    const { data } = await supabase.from('app_secrets').select('value').eq('key', key).maybeSingle();
    return data?.value ?? null;
}
