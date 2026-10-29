// Yedek kulübesi: Claude cevap veremezse (kredi bitti, kesinti, aşırı yoğun,
// zaman aşımı) tur OpenRouter'daki bedava modelle sürer, o da düşerse Groq'la.
// Kullanıcı isteği (2026-10-29): "Claude limitim biterse ya da kapanırsa
// yedekteki model işi devralsın, onda da sıkıntı olursa Groq alsın."
//
// Yedekler OpenAI'nin chat/completions biçimini konuşur, Claude kendi
// biçimini. Geçmiş HER ZAMAN Claude biçiminde saklanır: yedeğin cevabı Claude
// bloklarına çevrilip eklenir. Claude geri döndüğünde konuşmayı kaldığı yerden
// okur, müşteri derdini baştan anlatmaz. Tur ortasında da devralınır: Claude
// saatleri bulduktan sonra düşerse yedek aynı noktadan sürdürür.
//
// Randevu kuralları modelden bağımsız: araçlar öneri açar, onay mesajı
// şablondur (handlers.ts) — yedek model de olmayan randevuya "alındı" diyemez.
//
// Saf çeviriler + tek fetch çağrısı; tests/wa-agent-fallback.test.mjs import eder.

import type { ToolDef } from './tools.ts';

export type ProviderKind = 'claude' | 'openrouter' | 'groq';

export interface Provider {
    kind: ProviderKind;
    model: string;
    apiKey: string;
    /** Geçmişten en çok bu kadar mesaj gider (Groq'un dakikalık token sınırı). */
    maxHistory?: number;
}

export interface Block {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
    tool_use_id?: string;
    content?: unknown;
}

export interface Msg {
    role: string;
    content: string | Block[];
}

export interface ModelReply {
    content: Block[];
    stop_reason: string;
    usage: { input: number; output: number };
}

const ENDPOINTS: Record<Exclude<ProviderKind, 'claude'>, string> = {
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    groq: 'https://api.groq.com/openai/v1/chat/completions',
};

/** OpenRouter'ın bedava modelleri içinde Türkçesi en güvenilir olanı (2026-10-29). */
export const DEFAULT_FALLBACK_MODEL = 'google/gemma-4-31b-it:free';
/** Groq'un bedava katmanında araç çağırabilen en büyük model. */
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';
/**
 * Groq'un bedava katmanı dakikada 8 bin token: kurallar + araçlar ~3 bin,
 * iki çağrılık tur sığsın diye geçmiş kısa tutulur.
 */
export const GROQ_MAX_HISTORY = 8;
/** WhatsApp cevabı kısa; yedeklerde çıktı tavanı düşük (token sınırları). */
export const FALLBACK_MAX_TOKENS = 1024;

export class ProviderError extends Error {
    code: string;
    constructor(code: string, detail = '') {
        super(detail ? `${code}: ${detail}` : code);
        this.code = code;
    }
}

/** Sıra sabit: Claude → OpenRouter → Groq. Anahtarı olmayan sağlayıcı atlanır. */
export function buildChain(o: {
    claudeModel: string;
    claudeKey: string | null;
    openrouterKey: string | null;
    openrouterModel?: string | null;
    groqKey: string | null;
    groqModel?: string | null;
}): Provider[] {
    const chain: Provider[] = [];
    if (o.claudeKey) chain.push({ kind: 'claude', model: o.claudeModel, apiKey: o.claudeKey });
    if (o.openrouterKey) {
        chain.push({ kind: 'openrouter', model: o.openrouterModel || DEFAULT_FALLBACK_MODEL, apiKey: o.openrouterKey });
    }
    if (o.groqKey) {
        chain.push({ kind: 'groq', model: o.groqModel || DEFAULT_GROQ_MODEL, apiKey: o.groqKey, maxHistory: GROQ_MAX_HISTORY });
    }
    return chain;
}

export function toOpenAITools(tools: ToolDef[]) {
    return tools.map((t) => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));
}

function textOf(content: string | Block[]): string {
    if (typeof content === 'string') return content;
    return content.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('\n').trim();
}

interface OAToolCall {
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
}

export interface OAMessage {
    role: string;
    content?: string | null;
    tool_calls?: OAToolCall[];
    tool_call_id?: string;
}

interface OAChoice {
    message?: { content?: unknown; tool_calls?: unknown };
}

/**
 * Claude geçmişi → OpenAI mesajları. Turun bağlamı (konuşma ortası `system`)
 * yedeklerde baştaki sistem mesajına eklenir: açık modellerin bir kısmı
 * konuşmanın ortasında sistem mesajı kabul etmiyor. Yalnız SON bağlam gider;
 * öncekiler bayat (saat, yaklaşan randevu değişti). Düşünce blokları atılır.
 */
export function toOpenAIMessages(system: string, history: Msg[], maxHistory?: number): OAMessage[] {
    let context = '';
    const convo: OAMessage[] = [];
    for (const m of history) {
        if (m.role === 'system') { context = textOf(m.content); continue; }
        const blocks: Block[] = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
        if (m.role === 'assistant') {
            const text = textOf(blocks);
            const calls = blocks.filter((b) => b.type === 'tool_use').map((b) => ({
                id: String(b.id), type: 'function', function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) },
            }));
            if (!text && calls.length === 0) continue; // yalnız düşünce bloğu
            convo.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
            continue;
        }
        for (const r of blocks.filter((b) => b.type === 'tool_result')) {
            convo.push({
                role: 'tool', tool_call_id: String(r.tool_use_id),
                content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content ?? ''),
            });
        }
        const text = textOf(blocks);
        if (text) convo.push({ role: 'user', content: text });
    }
    const kept = maxHistory ? trimHistory(convo, maxHistory) : convo;
    return [{ role: 'system', content: context ? `${system}\n\n${context}` : system }, ...kept];
}

/**
 * Son `max` mesaj — ama bir müşteri mesajından başlayarak: yarım kalmış bir
 * araç sonucuyla (sahipsiz `tool`) başlayan geçmiş istek hatası verir.
 */
export function trimHistory(convo: OAMessage[], max: number): OAMessage[] {
    if (convo.length <= max) return convo;
    let i = convo.length - max;
    while (i < convo.length && convo[i].role !== 'user') i++;
    if (i >= convo.length) i = Math.max(0, convo.map((m) => m.role).lastIndexOf('user'));
    return convo.slice(i);
}

/**
 * OpenAI cevabı → Claude blokları. Araç kimlikleri yeniden üretilir: bazı
 * sağlayıcılar her turda "call_0" diyor, Claude'un geçmişinde kimlik tekil ve
 * yalnız harf/rakam/_/- olmalı. Kimliği araç sonucuna biz yazdığımız için
 * yenisi tutarlı kalır.
 */
export function fromOpenAIChoice(choice: OAChoice | undefined, idPrefix: string): { content: Block[]; stop_reason: string } {
    const msg = choice?.message ?? {};
    const content: Block[] = [];
    const text = typeof msg.content === 'string' ? msg.content.trim() : '';
    if (text) content.push({ type: 'text', text });
    const calls: OAToolCall[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    calls.forEach((c, i) => {
        let input: unknown = {};
        try { input = JSON.parse(c.function?.arguments || '{}') ?? {}; } catch { input = {}; }
        content.push({ type: 'tool_use', id: `${idPrefix}_${i}`, name: String(c.function?.name ?? ''), input });
    });
    return { content, stop_reason: calls.length ? 'tool_use' : 'end_turn' };
}

export async function callOpenAICompat(
    p: Provider,
    req: { system: string; history: Msg[]; tools: ToolDef[] },
    timeoutMs: number,
    fetchImpl: typeof fetch = fetch,
): Promise<ModelReply> {
    if (p.kind === 'claude') throw new ProviderError('claude_not_openai');
    const body = {
        model: p.model,
        messages: toOpenAIMessages(req.system, req.history, p.maxHistory),
        tools: toOpenAITools(req.tools),
        tool_choice: 'auto',
        max_tokens: FALLBACK_MAX_TOKENS,
        temperature: 0.3,
        // gpt-oss düşünerek cevap veriyor; düşük tutulmazsa dakikalık token sınırı dolar.
        ...(/gpt-oss/.test(p.model) ? { reasoning_effort: 'low' } : {}),
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchImpl(ENDPOINTS[p.kind], {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${p.apiKey}`,
                ...(p.kind === 'openrouter' ? { 'HTTP-Referer': 'https://timeflow.lueratech.com', 'X-Title': 'Luera TimeFlow' } : {}),
            },
            body: JSON.stringify(body),
            signal: ctrl.signal,
        });
        if (!res.ok) throw new ProviderError(`${p.kind}_${res.status}`, (await res.text().catch(() => '')).slice(0, 300));
        const data = await res.json();
        // OpenRouter sağlayıcı hatasını bazen 200 içinde döndürüyor.
        if (data?.error) throw new ProviderError(`${p.kind}_error`, JSON.stringify(data.error).slice(0, 300));
        const out = fromOpenAIChoice(data?.choices?.[0], `toolu_${p.kind}_${Date.now().toString(36)}`);
        if (out.content.length === 0) throw new ProviderError(`${p.kind}_empty`);
        return { ...out, usage: { input: Number(data?.usage?.prompt_tokens) || 0, output: Number(data?.usage?.completion_tokens) || 0 } };
    } catch (e) {
        if (e instanceof ProviderError) throw e;
        if ((e as Error)?.name === 'AbortError') throw new ProviderError(`${p.kind}_timeout`);
        throw new ProviderError(`${p.kind}_network`, String((e as Error)?.message ?? e).slice(0, 200));
    } finally {
        clearTimeout(timer);
    }
}
