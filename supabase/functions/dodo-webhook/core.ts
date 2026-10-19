// LUERA Core'a aşağı akış kopyası (karar 2026-10-19 · devir 10 §10).
//
// Core artık hiçbir erişim kararının kaynağı DEĞİL; burası yalnız onu güncel
// tutar. Kurallar:
//
//   • ASLA FIRLATMAZ, ASLA 500 DÖNDÜRTMEZ. Eylül'de Core düşünce webhook
//     günlerce 500 döndü ve Dodo ucu kapattı. Core'un hatası Dodo'ya
//     ulaşmamalı.
//   • SÜRE SINIRLI. Dodo 30 sn bekliyor; Core'a ayrılan toplam süre 8 sn.
//     VPS 2 tamamen kapalıyken bağlantı zaman aşımı yanıtı geciktirmesin.
//   • SIRADAN BAĞIMSIZ. Olay yeniden OYNATILMAZ; aynanın ŞU ANKİ hâli Core'a
//     basılır. Geç aktarılan eski bir olay Core'u geriye sarmaz.
//   • KAYBOLMAZ. Aktarılamayan olay `dodo_events.core_synced_at` boş kalır;
//     sonraki her webhook en eskiden başlayıp yeniden dener.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { coreStatus } from './durum.ts';

const MODULE_NAME = 'timeflow';
const BUDGET_MS = 8_000;
const BACKLOG = 10;
/** Core `organizations.owner_user_id` — Core'da FK yok (Pilot Test deseni). */
const PLACEHOLDER_OWNER = '00000000-0000-0000-0000-000000000001';
/** TimeFlow planı → Core plan_tier (CHECK: free|starter|growth|enterprise|custom). */
const TIER_MAP: Record<string, string> = { baslangic: 'starter', pro: 'growth', isletme: 'enterprise' };

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

interface EventRow {
    webhook_id: string;
    event_type: string;
    organization_id: string | null;
    payment_id: string | null;
    amount: number | null;
    currency: string | null;
    invoice_url: string | null;
    received_at: string;
    // deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw: any;
}

/**
 * İşlenmiş ama Core'a geçmemiş olayları aktarır — `first` önce, sonra en
 * eskiler. Core yapılandırılmamışsa hiçbir şey yapmaz (olaylar bekler).
 */
export async function syncPendingToCore(admin: Db, coreUrl: string | null, coreKey: string | null, first?: string): Promise<void> {
    if (!coreUrl || !coreKey) return;
    try {
        const deadline = AbortSignal.timeout(BUDGET_MS);
        const core = createClient(coreUrl, coreKey, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: deadline }) },
        });

        const cols = 'webhook_id, event_type, organization_id, payment_id, amount, currency, invoice_url, received_at, raw';
        const { data: pending, error } = await admin.from('dodo_events')
            .select(cols)
            .is('core_synced_at', null)
            .not('processed_at', 'is', null)
            .order('received_at', { ascending: true })
            .limit(BACKLOG);
        if (error) { console.error('core sync: kuyruk okunamadı', error); return; }

        const rows = (pending ?? []) as EventRow[];
        rows.sort((a, b) => Number(b.webhook_id === first) - Number(a.webhook_id === first));

        for (const row of rows) {
            if (deadline.aborted) break;
            try {
                await syncOne(admin, core, row);
                await admin.from('dodo_events')
                    .update({ core_synced_at: new Date().toISOString(), core_error: null })
                    .eq('webhook_id', row.webhook_id);
            } catch (e) {
                const msg = String((e as { message?: string })?.message ?? e).slice(0, 300);
                console.error('core sync', row.webhook_id, msg);
                const { data: cur } = await admin.from('dodo_events')
                    .select('core_attempts').eq('webhook_id', row.webhook_id).maybeSingle();
                await admin.from('dodo_events')
                    .update({ core_attempts: (cur?.core_attempts ?? 0) + 1, core_error: msg })
                    .eq('webhook_id', row.webhook_id);
                // Core'a ulaşılamıyorsa kalanları denemek yalnız süre yakar.
                break;
            }
        }
    } catch (e) {
        console.error('core sync: beklenmeyen', e);
    }
}

async function syncOne(admin: Db, core: Db, ev: EventRow): Promise<void> {
    const orgId = ev.organization_id;

    if (orgId) {
        const { data: m, error: mErr } = await admin.from('org_entitlement')
            .select('state, plan, cycle, trial_ends_at, expires_at, grace_until, dodo_subscription_id, dodo_customer_id, cancel_at_period_end, cancelled_at, last_event')
            .eq('organization_id', orgId).maybeSingle();
        if (mErr) throw mErr;
        const { data: org, error: oErr } = await admin.from('organizations').select('id').eq('id', orgId).maybeSingle();
        if (oErr) throw oErr;

        if (org) {
            await ensureCoreOrg(core, orgId, ev.raw?.data);
            if (m?.dodo_subscription_id) await upsertCoreSubscription(core, orgId, m);
        } else {
            // İşletme silindi (hesap silme): Core'daki kopya da kapanır. Core
            // ayrı veritabanı; TimeFlow'daki cascade onu görmez.
            const { error } = await core.from('subscriptions')
                .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
                .eq('organization_id', orgId)
                .eq('module_name', MODULE_NAME)
                .in('status', ['trial', 'active', 'past_due']);
            if (error) throw error;
        }
    }

    // Fatura geçmişi kopyası. Aynı olay iki kez aktarılırsa UNIQUE yakalar.
    const { error } = await core.from('billing_events').insert({
        organization_id: orgId,
        module_name: MODULE_NAME,
        dodo_webhook_id: ev.webhook_id,
        dodo_payment_id: ev.event_type.startsWith('payment.') ? ev.payment_id : null,
        event_type: ev.event_type,
        amount: ev.amount,
        currency: ev.currency,
        invoice_url: ev.invoice_url,
        occurred_at: ev.received_at,
        raw: ev.raw,
    });
    if (error && error.code !== '23505') throw error;
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertCoreSubscription(core: Db, orgId: string, m: any): Promise<void> {
    const status = coreStatus(m.state, m.last_event);
    if (!status) return;
    const now = new Date().toISOString();
    const fields = {
        status,
        plan_tier: TIER_MAP[m.plan] ?? 'growth',
        provider: 'dodo',
        provider_ref: m.dodo_subscription_id,
        expires_at: m.expires_at,
        trial_ends_at: status === 'trial' ? (m.trial_ends_at ?? m.expires_at) : null,
        // Core CHECK: (status='cancelled') = (cancelled_at IS NOT NULL)
        cancelled_at: status === 'cancelled' ? (m.cancelled_at ?? now) : null,
        metadata: {
            plan: m.plan, cycle: m.cycle,
            cancel_at_period_end: m.cancel_at_period_end === true,
            cancelled_at: m.cancelled_at,
            grace_until: m.grace_until,
            dodo_customer_id: m.dodo_customer_id,
            source: 'timeflow',
        },
    };

    // Önce Dodo kimliğiyle, yoksa işletmenin açık kaydıyla (kısmi UNIQUE
    // index ON CONFLICT'e uymuyor → seç-sonra-yaz; tek yazar burası).
    let id: string | null = null;
    const { data: byRef, error: e1 } = await core.from('subscriptions').select('id')
        .eq('provider', 'dodo').eq('provider_ref', m.dodo_subscription_id).maybeSingle();
    if (e1) throw e1;
    id = byRef?.id ?? null;
    if (!id) {
        const { data: open, error: e2 } = await core.from('subscriptions').select('id')
            .eq('organization_id', orgId).eq('module_name', MODULE_NAME)
            .in('status', ['trial', 'active', 'past_due']).maybeSingle();
        if (e2) throw e2;
        id = open?.id ?? null;
    }
    const { error } = id
        ? await core.from('subscriptions').update(fields).eq('id', id)
        : await core.from('subscriptions').insert({ organization_id: orgId, module_name: MODULE_NAME, ...fields });
    if (error) throw error;
}

/** TimeFlow işletmesini Core `organizations`'a aynalar (FK gereksinimi). */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureCoreOrg(core: Db, orgId: string, data: any): Promise<void> {
    const { data: existing, error: e1 } = await core.from('organizations').select('id').eq('id', orgId).maybeSingle();
    if (e1) throw e1;
    if (existing) return;

    const rawName = String(data?.metadata?.org_name || data?.customer?.name || 'TimeFlow İşletmesi').trim();
    const name = rawName.length >= 2 ? rawName.slice(0, 120) : 'TimeFlow İşletmesi';
    const { error } = await core.from('organizations').insert({
        id: orgId,
        name,
        slug: `tf-${orgId.replace(/-/g, '').slice(0, 12)}`,
        owner_user_id: PLACEHOLDER_OWNER,
        metadata: { source: 'timeflow', mirrored_by: 'dodo-webhook' },
    });
    // Yarışta başka bir aktarım eklemiş olabilir → UNIQUE ihlali sorun değil.
    if (error && error.code !== '23505') throw error;
}
