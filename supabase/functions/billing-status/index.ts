import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { computeAccess, shownEnd, type EntitlementRow } from '../_shared/entitlement.ts';
import { resolveOrg } from '../_shared/org.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Faturalandırma durumu — Ayarlar › Abonelik ve faturalar'ın veri kaynağı.
 *
 * 123'ten beri abonelik gerçeği TimeFlow'da: durum aynadan
 * (`org_entitlement`), fatura geçmişi yerel olay defterinden (`dodo_events`).
 * LUERA Core'a GİDİLMEZ. Eskiden gidiliyordu ve Core'un hatası "abonelik
 * yok" (200) diye dönüyordu → ödeyen salona "satın al" gösteriliyordu.
 * Artık okunamayan şey 500 döner; ekran "okunamadı — yenileyin" çizer.
 *
 * Dönüş: { subscription: {...} | null, invoices: [...] } (bkz. src/hooks/useBilling.ts)
 */

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

        // 2) İşletme: istemcinin seçtiği, sunucuda doğrulanmış
        const body = await req.json().catch(() => ({}));
        const resolved = await resolveOrg(admin, userData.user.id, typeof body?.orgId === 'string' ? body.orgId : null);
        if ('error' in resolved) return json({ error: resolved.error }, resolved.status);
        const { orgId } = resolved;

        // 3) Ayna + fatura geçmişi
        const [{ data: row, error: rowErr }, { data: events, error: evErr }] = await Promise.all([
            admin.from('org_entitlement')
                .select('state, plan, cycle, trial_ends_at, expires_at, grace_until, cancel_at_period_end, cancelled_at, last_event, dodo_subscription_id, scheduled_plan, scheduled_cycle, scheduled_at')
                .eq('organization_id', orgId)
                .maybeSingle(),
            admin.from('dodo_events')
                .select('event_at, received_at, amount, currency, invoice_url')
                .eq('organization_id', orgId)
                .eq('event_type', 'payment.succeeded')
                .order('received_at', { ascending: false })
                .limit(12),
        ]);
        if (rowErr || evErr) {
            console.error('billing-status: okunamadı', rowErr ?? evErr);
            return json({ error: 'read_failed' }, 500);
        }

        // Ayna şemasını UI sözleşmesine çevir. Süresi zamanla dolmuş bir
        // "active" satır `expired` döner: ekran "Sonraki tahsilat" yerine plan
        // kartlarını çizer.
        let subscription = null;
        if (row && row.state !== 'none') {
            const access = computeAccess(row as EntitlementRow);
            const status = !access.ok ? 'expired'
                : access.effective === 'grace' ? 'on_hold'
                : 'active';
            subscription = {
                // Hediye üyelik (ops/abonelik/hediye.sql) ya da demo salon:
                // Dodo'da karşılığı yok — ekran tahsilat/kart/iptal çizmez.
                comp: row.last_event === 'comp_manual' || row.last_event === 'demo_manual',
                plan: row.plan || 'pro',
                billing_period: row.cycle || 'monthly',
                status,
                cancel_at_period_end: row.cancel_at_period_end === true,
                // Dodo'nun gerçek günü (tolerans hariç) — Dodo'nun e-postası ve
                // ödeme sayfası ne diyorsa ekran da onu demeli.
                expires_at: shownEnd(row as EntitlementRow) ?? row.expires_at,
                cancelled_at: row.cancelled_at ?? null,
                // Dönem sonuna planlanmış paket (göç 126): "29 Ekim'den
                // itibaren Tek kişilik · ₺799" ve o günün tahsilat tutarı.
                scheduled: row.scheduled_plan
                    ? { plan: row.scheduled_plan, cycle: row.scheduled_cycle || 'monthly', at: row.scheduled_at ?? null }
                    : null,
            };
        }

        // ₺0'lık "ödeme": denemenin başında Dodo kartı doğrular — fatura değil.
        const invoices = (events ?? []).filter((e: { amount: number | null }) => e.amount === null || Number(e.amount) > 0).map((e: { event_at: string | null; received_at: string; amount: number | null; currency: string | null; invoice_url: string | null }) => ({
            date: e.event_at ?? e.received_at,
            amount: e.amount === null ? null : Number(e.amount),
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
