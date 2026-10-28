import Anthropic from 'npm:@anthropic-ai/sdk@0.137.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { deny, identify } from '../_shared/auth.ts';
import { findCustomerByPhone, getSecret, sendWA, type Admin, type OrgWa } from '../_shared/wa.ts';
import { greetingName } from '../_shared/booking/identity.ts';
import { foldTr } from '../_shared/booking/dates.ts';
import { detectConfirm, detectIntent } from '../_shared/booking/intent.ts';
import * as M from '../_shared/booking/messages.ts';
import { formatDateTr, type WorkingHour } from '../_shared/booking/slots.ts';
import { firstNameOf, notifyOwner } from '../_shared/notify.ts';
import { buildProfile, fnv1a } from '../_shared/agent/profile.ts';
import {
    agentFallback, buildTurnContext, consentAsk, consentDeclined, consentRepeat, consentThanks,
    CONSENT_VERSION, introMessage, istanbulClock, RULES,
} from '../_shared/agent/prompt.ts';
import { TOOLS } from '../_shared/agent/tools.ts';
import {
    costUsd, needsNewEpisode, sanitizeForWhatsApp, shortRef, supportsMidSystem,
    type AgentConfig, type UsageTotals,
} from '../_shared/agent/guard.ts';
import { loadUpcoming, openProposal, runTool, type TurnCtx } from './handlers.ts';

// ============================================================
// wa-agent — WhatsApp Sekreter v2 · P2: Claude ajanı
// ------------------------------------------------------------
// whatsapp-booking ajan açık işletmenin mesajını wa_inbox'a yazar; 130'un
// tetikleyicisi bu fonksiyonu { organization_id, phone } ile uyandırır.
// Gövdesiz çağrı (VPS cron'u, dakikada bir) süpürmedir: takılı kalmış kuyruğu
// yeniden uyandırır ve saklama sürelerini uygular.
//
// Bir tur:
//   1. Konuşmayı kirala — aynı müşteri için ikinci çağrı çekilir.
//   2. ~2,5 sn bekle, birikmiş mesajları TEK tur say ("merhaba" + "yarın
//      randevu alabilir miyim" iki ayrı cevap almasın).
//   3. Sahip devraldıysa sus; ilk temasta tek cümlelik tanıtım (işletme
//      açtıysa önce yapay zekâ onayı).
//   4. Claude: sabit kurallar + işletme profili (önbellekli) + geçmiş + tur
//      bağlamı → araçlar → cevap. En çok 6 çağrı, ~40 sn.
//   5. Cevabı sendWA ile yolla, geçmişi olduğu gibi sakla, maliyeti yaz.
//
// Randevuyu model yazmaz: araçlar öneri açar, müşteri sonraki mesajında
// onaylarsa kod uygular ve onay mesajını şablondan yollar (handlers.ts).
// ============================================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LEASE_SEC = 90;
const DEBOUNCE_MS = 2500;
/** Bu süreden sonra yeni tur başlatılmaz; kalan mesaj için kendini yeniden uyandırır. */
const NEW_TURN_WINDOW_MS = 12_000;
/** Model döngüsünün toplam süresi. Çalışan 60 sn'de kesiliyor (self-hosted). */
const RUN_BUDGET_MS = 40_000;
const MAX_CALLS = 6;
const MAX_TOKENS = 4096;
// Sonnet 5.5: Opus'a yakın kalite, yarı fiyat (2026-10-29 kararı: maliyet).
// İşletme bazında agent_config.model, genelde WA_MODEL_CUSTOMER ile değişir.
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const DEFAULT_EFFORT = 'low';
/** Ham konuşma ve gelen kutusu bu kadar gün sonra boşaltılır (KVKK). */
const RETENTION_DAYS = 30;
/** Onayı reddeden müşteriye bu süre içinde yeniden sorulmaz. */
const CONSENT_RETRY_MS = 24 * 3600_000;

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface InboxRow {
    id: number;
    kind: 'text' | 'audio' | 'media';
    body: string | null;
    media: Record<string, unknown> | null;
    push_name: string | null;
    remote_jid: string | null;
    provider_msg_id: string | null;
    received_at: string;
}

interface ConversationRow {
    id: string;
    customer_id: string | null;
    model: string | null;
    prefix_hash: string | null;
    messages_json: string;
    state: Record<string, unknown> | null;
    last_message_at: string | null;
    turns: number;
    paused_until: string | null;
    ai_consent_at: string | null;
}

type OrgWaRow = OrgWa & { agent_config: AgentConfig | null };

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const caller = await identify(admin, req);
    if (caller.kind !== 'cron' && caller.kind !== 'service') {
        return deny(401, 'Bu uç yalnız sistem tarafından çağrılabilir', corsHeaders);
    }

    const started = Date.now();
    const body = await req.json().catch(() => ({}));
    try {
        if (body?.organization_id && body?.phone) {
            return json(await drain(admin, String(body.organization_id), String(body.phone), started));
        }
        return json(await sweep(admin));
    } catch (e) {
        // Ayrıntı yalnız loga.
        console.error('wa-agent error:', e);
        return json({ error: 'server_error' }, 500);
    }
});

// ── Kuyruk ──────────────────────────────────────────────────────────────────

async function loadPending(admin: Admin, orgId: string, phone: string): Promise<InboxRow[]> {
    const { data } = await admin.from('wa_inbox')
        .select('id, kind, body, media, push_name, remote_jid, provider_msg_id, received_at')
        .eq('organization_id', orgId).eq('phone', phone).is('processed_at', null)
        .order('received_at', { ascending: true }).limit(20);
    return (data ?? []) as InboxRow[];
}

async function drain(admin: Admin, orgId: string, phone: string, started: number) {
    const { data: token } = await admin.rpc('wa_claim_conversation', {
        p_org: orgId, p_phone: phone, p_lease_sec: LEASE_SEC,
    });
    if (!token) return { busy: true };

    let turns = 0;
    try {
        while (Date.now() - started < NEW_TURN_WINDOW_MS && turns < 3) {
            const pending = await loadPending(admin, orgId, phone);
            if (pending.length === 0) break;
            const newest = Math.max(...pending.map((r) => Date.parse(r.received_at)));
            const wait = DEBOUNCE_MS - (Date.now() - newest);
            if (wait > 0) await sleep(wait);
            await processBatch(admin, orgId, phone, await loadPending(admin, orgId, phone));
            turns++;
        }
    } finally {
        await admin.from('wa_conversations')
            .update({ lease_until: null, lease_token: null })
            .eq('organization_id', orgId).eq('phone', phone).eq('lease_token', token);
    }

    // Tur sürerken yazılan mesaj kirayı dolu bulup çekilmişti: kendini uyandır.
    if ((await loadPending(admin, orgId, phone)).length > 0) {
        await admin.rpc('wa_agent_kick', { p_org: orgId, p_phone: phone });
    }
    return { turns };
}

/** Gövdesiz çağrı: takılı kuyruğu uyandırır, süresi dolanları temizler. */
async function sweep(admin: Admin) {
    const now = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString();
    const cutoff = iso(now - RETENTION_DAYS * 86_400_000);

    await admin.from('wa_pending_actions').update({ status: 'expired' })
        .eq('status', 'open').lt('expires_at', iso(now));
    // Ham konuşma boşaltılır, satır kalır (onay kaydı, susturma, maliyet bağı).
    await admin.from('wa_conversations')
        .update({ messages_json: '[]', state: {}, prefix_hash: null })
        .lt('last_message_at', cutoff).neq('messages_json', '[]');
    await admin.from('wa_inbox').delete().lt('received_at', cutoff);

    const { data } = await admin.from('wa_inbox')
        .select('organization_id, phone')
        .is('processed_at', null).lt('received_at', iso(now - 20_000))
        .order('received_at', { ascending: true }).limit(50);
    const seen = new Set<string>();
    for (const r of (data ?? []) as { organization_id: string; phone: string }[]) {
        const k = `${r.organization_id}|${r.phone}`;
        if (seen.has(k)) continue;
        seen.add(k);
        await admin.rpc('wa_agent_kick', { p_org: r.organization_id, p_phone: r.phone });
    }
    return { kicked: seen.size };
}

// ── Bir tur ─────────────────────────────────────────────────────────────────

async function processBatch(admin: Admin, orgId: string, phone: string, rows: InboxRow[]): Promise<void> {
    if (rows.length === 0) return;
    const runId = crypto.randomUUID();
    const t0 = Date.now();
    const nowIso = () => new Date().toISOString();
    const markProcessed = () => admin.from('wa_inbox')
        .update({ processed_at: nowIso(), run_id: runId, media: null })
        .in('id', rows.map((r) => r.id));

    const { data: orgWaRow } = await admin.from('org_whatsapp')
        .select('organization_id, instance, status, webhook_secret, features, agent_config')
        .eq('organization_id', orgId).maybeSingle();
    const orgWa = orgWaRow as OrgWaRow | null;
    if (!orgWa?.instance || orgWa.status !== 'connected') { await markProcessed(); return; }
    const cfg: AgentConfig = orgWa.agent_config ?? {};

    const { data: convRow } = await admin.from('wa_conversations')
        .select('id, customer_id, model, prefix_hash, messages_json, state, last_message_at, turns, paused_until, ai_consent_at')
        .eq('organization_id', orgId).eq('phone', phone).single();
    const conv = convRow as ConversationRow;
    // Sahip telefondan bu müşteriye yazdı: devraldı, bot karışmaz.
    if (conv.paused_until && Date.parse(conv.paused_until) > Date.now()) { await markProcessed(); return; }

    const [{ data: settings }, { data: org }, { data: services }, { data: staffRows }] = await Promise.all([
        admin.from('settings')
            .select('business_name, working_hours, slot_duration, comms, webhook_url')
            .eq('organization_id', orgId).limit(1).maybeSingle(),
        admin.from('organizations')
            .select('name, owner_id, booking_auto_confirm, address, public_phone, maps_url')
            .eq('id', orgId).maybeSingle(),
        admin.from('services')
            .select('id, name, duration, price, color')
            .eq('organization_id', orgId).order('created_at'),
        admin.from('staff')
            .select('id, name, specialty, working_hours')
            .eq('organization_id', orgId).eq('is_active', true).order('created_at'),
    ]);
    const comms = M.resolveComms(settings?.comms);
    const businessName: string = settings?.business_name || org?.name || 'İşletme';
    const businessPhone: string | null = org?.public_phone || null;

    const known = await findCustomerByPhone(admin, orgId, phone);
    const pushName = rows.map((r) => r.push_name).filter((n): n is string => Boolean(n)).pop() ?? null;
    // Şablonlarda yalnız kayıttaki ad: WhatsApp adı takma ad ya da emoji olabilir.
    const msgCtx: M.Ctx = { comms, businessName, firstName: greetingName(known?.name) };
    // Yeni müşteri tur içinde kaydedilirse sonraki mesajlar da ona bağlanır.
    let logCustomerId: string | null = known?.id ?? null;
    const send = (text: string) => sendWA(admin, {
        org: orgWa, phone, text, kind: 'booking', customerId: logCustomerId, ignoreOptOut: true,
    });

    // Müşterinin bu turdaki sözü: metin, sesli mesaj dökümü ya da medya işareti.
    const parts: string[] = [];
    for (const r of rows) {
        if (r.kind === 'text' && r.body) parts.push(r.body);
        else if (r.kind === 'audio') {
            const t = await transcribe(admin, orgWa, r);
            parts.push(t ? `[sesli mesaj] ${t}` : '[sesli mesaj anlaşılamadı]');
        } else parts.push(r.body || '[görsel]');
    }
    let customerText = parts.join('\n').trim();
    const state: Record<string, unknown> = { ...(conv.state ?? {}) };

    // ── İlk temas: yapay zekâ onayı — yalnız işletme açtıysa ────────────────
    // Varsayılan kapalı (2026-10-29): ilk mesaj tek cümlelik tanıtımdır.
    let firstContact = false;
    if (cfg.consent === true && !conv.ai_consent_at) {
        const saveState = (s: Record<string, unknown>) =>
            admin.from('wa_conversations').update({ state: s, updated_at: nowIso() }).eq('id', conv.id);
        if (!state.consent_asked) {
            const declinedAt = typeof state.consent_declined_at === 'string' ? Date.parse(state.consent_declined_at) : NaN;
            if (!Number.isNaN(declinedAt) && Date.now() - declinedAt < CONSENT_RETRY_MS) { await markProcessed(); return; }
            await send(consentAsk({ businessName, firstName: msgCtx.firstName ?? null }));
            await saveState({ ...state, consent_asked: true, consent_pending: customerText.slice(0, 1000) });
            await markProcessed();
            return;
        }
        const answer = detectConfirm(customerText);
        if (answer === 'no') {
            await send(consentDeclined({ phone: businessPhone }));
            notifyOwner(admin, orgId, {
                title: 'Müşteri sizinle görüşmek istiyor',
                body: `${firstNameOf(known?.name ?? pushName)}: dijital asistanla devam etmek istemedi`,
                url: '/mesajlar',
                tag: `handoff-${phone}`,
            });
            await saveState({ ...state, consent_asked: false, consent_pending: null, consent_declined_at: nowIso() });
            await markProcessed();
            return;
        }
        if (answer !== 'yes') {
            await send(consentRepeat());
            const pending = [state.consent_pending, customerText].filter(Boolean).join('\n').slice(-1000);
            await saveState({ ...state, consent_pending: pending });
            await markProcessed();
            return;
        }
        // Onay geldi: asıl istek, onaydan önce yazılan mesajdır.
        const pending = typeof state.consent_pending === 'string' ? state.consent_pending.trim() : '';
        delete state.consent_asked;
        delete state.consent_pending;
        state.introduced_at = nowIso(); // onay mesajı tanıtımı da yaptı
        await admin.from('wa_conversations').update({
            ai_consent_at: nowIso(), consent_version: CONSENT_VERSION, state, updated_at: nowIso(),
        }).eq('id', conv.id);
        // "Evet, yarın randevu alabilir miyim" — onayla birlikte yeni istek
        // geldiyse o da bu turun parçası; kuru "Evet" ise yalnız bekleyen söz.
        const withRequest = customerText.split(/\s+/).filter(Boolean).length > 3;
        // Yalnız selam verilmişti: tanıtım yapıldı, model çağrılmaz.
        const lines = pending.split('\n').map((l) => l.trim()).filter(Boolean);
        if (!withRequest && lines.every((l) => detectIntent(l) === 'greeting')) {
            await send(consentThanks({ firstName: msgCtx.firstName ?? null }));
            await markProcessed();
            return;
        }
        customerText = withRequest ? [pending, customerText].filter(Boolean).join('\n') : pending;
    } else if (!state.introduced_at) {
        // Asistanla ilk konuşma: kuru selama tek cümlelik tanıtım (model yok);
        // bir istekle geldiyse model cevaba kısa bir tanıtımla başlar.
        state.introduced_at = nowIso();
        const lines = customerText.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.every((l) => detectIntent(l) === 'greeting')) {
            const clockNow = istanbulClock(Date.now());
            const next = known ? (await loadUpcoming(admin, orgId, known.id, clockNow))[0] : undefined;
            await send(introMessage({
                businessName,
                firstName: msgCtx.firstName ?? null,
                known: Boolean(known),
                clock: clockNow,
                upcoming: next ? { date: next.date, time: String(next.start_time).slice(0, 5) } : null,
                salam: lines.some((l) => /selamu?n?\s*aleyk/.test(foldTr(l))),
            }));
            await admin.from('wa_conversations').update({ state, updated_at: nowIso() }).eq('id', conv.id);
            await markProcessed();
            return;
        }
        firstContact = true;
    }

    const apiKey = await getSecret(admin, 'ANTHROPIC_API_KEY');
    if (!apiKey) {
        console.error('wa-agent: ANTHROPIC_API_KEY tanımlı değil');
        await send(agentFallback());
        await markProcessed();
        return;
    }
    const model = cfg.model || (await getSecret(admin, 'WA_MODEL_CUSTOMER')) || DEFAULT_MODEL;
    const effort = cfg.effort || (await getSecret(admin, 'WA_EFFORT_CUSTOMER')) || DEFAULT_EFFORT;

    // ── İstem ───────────────────────────────────────────────────────────────
    const orgHours: WorkingHour[] = settings?.working_hours || [];
    const profile = buildProfile({
        businessName, comms,
        address: org?.address ?? null,
        mapsUrl: org?.maps_url ?? null,
        phone: businessPhone,
        hours: orgHours,
        services: (services ?? []).map((s: { id: string; name: string; duration: number; price: number | null; color: string | null }) => ({
            id: s.id, name: s.name, duration: Number(s.duration) || 30, price: s.price ?? null, color: s.color ?? null,
        })),
        staff: (staffRows ?? []).map((s: { id: string; name: string; specialty: string | null }) => ({
            id: s.id, name: s.name, specialty: s.specialty ?? null,
        })),
        autoConfirm: Boolean(org?.booking_auto_confirm),
    });
    // Kurallar ya da araçlar bir deploy'la değişirse de yeni bölüm açılır.
    const prefixHash = fnv1a(`${RULES}\u0000${profile.hash}\u0000${JSON.stringify(TOOLS)}`);

    let history: unknown[] = [];
    try { history = JSON.parse(conv.messages_json || '[]'); } catch { history = []; }
    const fresh = needsNewEpisode({
        lastMessageAt: conv.last_message_at, model: conv.model,
        prefixHash: conv.prefix_hash, messageCount: history.length,
    }, Date.now(), model, prefixHash);
    if (fresh) history = [];

    const clock = istanbulClock(Date.now());
    const staffName = new Map<string, string>((staffRows ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
    const upcoming = known ? await loadUpcoming(admin, orgId, known.id, clock) : [];
    const contextText = buildTurnContext({
        clock,
        customer: { known: Boolean(known), name: known?.name ?? null, pushName },
        upcoming: upcoming.map((r) => ({
            ref: shortRef('r', r.id),
            service: r.service,
            dateLabel: formatDateTr(r.date),
            time: String(r.start_time).slice(0, 5),
            staff: r.staff_id ? staffName.get(r.staff_id) ?? null : null,
            pending: r.status === 'pending',
            awaitingReminderReply: Boolean(r.reminder_24h_sent) && !r.customer_confirm,
        })),
        openProposal: await openProposal(admin, conv.id),
        firstContact,
    });

    // Bağlam operatör kanalından gider (`role: system`): müşteri metnine
    // gömülseydi müşteri onu taklit edebilirdi. Desteklemeyen modelde ayrı blok.
    const turn: unknown[] = supportsMidSystem(model)
        ? [
            { role: 'user', content: [{ type: 'text', text: customerText }] },
            { role: 'system', content: contextText },
        ]
        : [{ role: 'user', content: [{ type: 'text', text: customerText }, { type: 'text', text: contextText }] }];
    const messages: unknown[] = [...history, ...turn];

    const ctx: TurnCtx = {
        admin, orgWa, orgId, phone,
        conversationId: conv.id,
        runId,
        profile,
        orgHours,
        slotDuration: Number(settings?.slot_duration) || 30,
        staff: (staffRows ?? []).map((s: { id: string; working_hours: WorkingHour[] | null }) => ({
            id: s.id, workingHours: s.working_hours ?? null,
        })),
        staffName,
        ownerId: org?.owner_id ?? null,
        autoConfirm: Boolean(org?.booking_auto_confirm),
        businessPhone,
        webhookUrl: settings?.webhook_url ?? null,
        clock,
        customer: known ? { id: known.id, name: known.name } : null,
        pushName,
        lastCustomerText: customerText,
        msgCtx,
        toolsUsed: [],
        sentTemplate: false,
    };

    markReadAndType(admin, orgWa, rows, phone);

    // ── Model döngüsü ───────────────────────────────────────────────────────
    const client = new Anthropic({ apiKey, maxRetries: 1 });
    const system = [
        { type: 'text', text: RULES },
        { type: 'text', text: profile.text, cache_control: { type: 'ephemeral' } },
    ];
    const usage: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    let calls = 0;
    let finalText = '';
    let stopReason: string | null = null;
    let error: string | null = null;
    const deadline = t0 + RUN_BUDGET_MS;

    try {
        while (calls < MAX_CALLS) {
            const remaining = deadline - Date.now();
            if (remaining < 4000) { error = 'deadline'; break; }
            const resp = await client.beta.messages.create({
                model,
                max_tokens: MAX_TOKENS,
                betas: ['thinking-binding-controls-2026-08-01'],
                // Geçmiş bayt bayt korunuyor; yine de önek bir gün kayarsa istek
                // 400 olmasın, eski düşünce blokları düşürülsün.
                thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
                output_config: { effort },
                cache_control: { type: 'ephemeral' },
                system,
                tools: TOOLS,
                messages,
            } as never, { timeout: remaining }) as unknown as AgentResponse;
            calls++;
            usage.input += resp.usage?.input_tokens ?? 0;
            usage.output += resp.usage?.output_tokens ?? 0;
            usage.cacheRead += resp.usage?.cache_read_input_tokens ?? 0;
            usage.cacheWrite += resp.usage?.cache_creation_input_tokens ?? 0;
            stopReason = resp.stop_reason;
            messages.push({ role: 'assistant', content: resp.content });

            if (resp.stop_reason === 'tool_use') {
                const results: unknown[] = [];
                for (const block of resp.content) {
                    if (block.type !== 'tool_use') continue;
                    let out: unknown;
                    try {
                        out = await runTool(ctx, String(block.name), (block.input ?? {}) as Record<string, unknown>);
                    } catch (e) {
                        console.error('wa-agent tool error', block.name, e);
                        out = { ok: false, reason: 'tool_failed' };
                    }
                    results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
                }
                messages.push({ role: 'user', content: results });
                continue;
            }
            if (resp.stop_reason === 'pause_turn') continue;
            if (resp.stop_reason === 'refusal') { error = 'refusal'; break; }
            finalText = resp.content
                .filter((b) => b.type === 'text')
                .map((b) => String(b.text ?? ''))
                .join('\n').trim();
            break;
        }
        if (calls >= MAX_CALLS && !finalText && !error) error = 'max_calls';
    } catch (e) {
        const status = e instanceof Anthropic.APIError ? (e as { status?: number }).status : undefined;
        error = e instanceof Anthropic.APIError ? `api_${status ?? 'error'}` : 'exception';
        console.error('wa-agent model error', e);
    }

    // ── Cevap ───────────────────────────────────────────────────────────────
    logCustomerId = ctx.customer?.id ?? logCustomerId;
    const text = sanitizeForWhatsApp(finalText);
    if (text) {
        await send(text);
    } else if (!ctx.sentTemplate) {
        // Müşteri sessizlikle karşılaşmasın. Reddedilen istekte salona devredilir.
        const fallback = error === 'refusal' ? M.handoff(msgCtx, businessPhone) : agentFallback();
        await send(fallback);
        messages.push({ role: 'assistant', content: [{ type: 'text', text: fallback }] });
        if (error === 'refusal') {
            notifyOwner(admin, orgId, {
                title: 'Müşteri sizinle görüşmek istiyor',
                body: `${firstNameOf(known?.name ?? pushName)}: asistan bu isteği yanıtlayamadı`,
                url: '/mesajlar',
                tag: `handoff-${phone}`,
            });
        }
    }

    // ── Kayıt ───────────────────────────────────────────────────────────────
    // İstek reddedildiyse (4xx) geçmiş sıfırlanır: bozuk bir geçmişi her turda
    // yeniden göndermek aynı hatayı sonsuza kadar tekrarlatır. Zaman aşımı ve
    // 5xx geçicidir; geçmiş korunur, müşteri derdini baştan anlatmaz.
    const apiFailed = Boolean(error && /^api_4\d\d$/.test(error));
    const at = nowIso();
    await admin.from('wa_conversations').update({
        customer_id: ctx.customer?.id ?? conv.customer_id,
        model,
        prefix_hash: apiFailed ? null : prefixHash,
        messages_json: apiFailed ? '[]' : JSON.stringify(messages),
        state,
        last_message_at: at,
        turns: (conv.turns ?? 0) + 1,
        updated_at: at,
        ...(fresh ? { episode_started_at: at } : {}),
    }).eq('id', conv.id);
    await markProcessed();

    await admin.from('wa_agent_runs').insert({
        organization_id: orgId,
        conversation_id: conv.id,
        model,
        calls,
        input_tokens: usage.input,
        output_tokens: usage.output,
        cache_read_tokens: usage.cacheRead,
        cache_write_tokens: usage.cacheWrite,
        cost_usd: costUsd(model, usage),
        tools: ctx.toolsUsed,
        stop_reason: stopReason,
        duration_ms: Date.now() - t0,
        error,
    });
}

interface AgentBlock {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
}

interface AgentResponse {
    content: AgentBlock[];
    stop_reason: string;
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
    };
}

// ── Evolution yardımcıları ──────────────────────────────────────────────────

/**
 * Mavi tik + "yazıyor…". Müşteri 10–30 sn boş ekrana bakmasın. İkisi de en iyi
 * çaba: başarısız olursa tur etkilenmez, beklenmez.
 */
function markReadAndType(admin: Admin, orgWa: OrgWa, rows: InboxRow[], phone: string): void {
    (async () => {
        const url = await getSecret(admin, 'EVOLUTION_API_URL');
        const key = await getSecret(admin, 'EVOLUTION_API_KEY');
        if (!url || !key || !orgWa.instance) return;
        const headers = { 'Content-Type': 'application/json', apikey: key };
        const read = rows
            .filter((r) => r.provider_msg_id && r.remote_jid)
            .map((r) => ({ remoteJid: r.remote_jid, fromMe: false, id: r.provider_msg_id }));
        if (read.length > 0) {
            await fetch(`${url}/chat/markMessageAsRead/${orgWa.instance}`, {
                method: 'POST', headers, body: JSON.stringify({ readMessages: read }),
            }).catch(() => {});
        }
        await fetch(`${url}/chat/sendPresence/${orgWa.instance}`, {
            method: 'POST', headers, body: JSON.stringify({ number: phone, presence: 'composing', delay: 15000 }),
        }).catch(() => {});
    })().catch(() => {});
}

/**
 * Sesli mesaj → metin. Ses Evolution'dan (mesajın kendi anahtarlarıyla)
 * indirilir, Groq Whisper'a gider. Başarısızsa null: ajan müşteriden yazmasını
 * rica eder.
 */
async function transcribe(admin: Admin, orgWa: OrgWa, row: InboxRow): Promise<string | null> {
    try {
        const [url, key, groq] = await Promise.all([
            getSecret(admin, 'EVOLUTION_API_URL'),
            getSecret(admin, 'EVOLUTION_API_KEY'),
            getSecret(admin, 'GROQ_API_KEY'),
        ]);
        if (!url || !key || !groq || !row.media || !orgWa.instance) return null;

        const res = await fetch(`${url}/chat/getBase64FromMediaMessage/${orgWa.instance}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: key },
            body: JSON.stringify({ message: row.media, convertToMp4: false }),
            signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) return null;
        const media = await res.json();
        if (typeof media?.base64 !== 'string') return null;
        const bytes = Uint8Array.from(atob(media.base64), (c) => c.charCodeAt(0));
        if (bytes.length > 10 * 1024 * 1024) return null;

        const form = new FormData();
        form.append('file', new Blob([bytes], { type: media.mimetype || 'audio/ogg' }), 'sesli.ogg');
        form.append('model', 'whisper-large-v3-turbo');
        form.append('language', 'tr');
        form.append('response_format', 'json');
        const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${groq}` },
            body: form,
            signal: AbortSignal.timeout(12_000),
        });
        if (!r.ok) return null;
        const t = (await r.json())?.text;
        return typeof t === 'string' && t.trim() ? t.trim().slice(0, 1500) : null;
    } catch {
        return null;
    }
}
