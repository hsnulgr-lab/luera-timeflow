/**
 * WhatsApp Sekreter v2 · yedek kulübesi (fallback.ts).
 *
 * Claude düşerse tur OpenRouter'daki bedava modelle, o da düşerse Groq'la
 * sürer. Geçmiş Claude biçiminde saklanır; burada iki yönlü çeviri, sıra,
 * hata kodları ve wa-agent'taki bağlantı sınanır. Ağ yok: fetch sahte.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    buildChain, callOpenAICompat, DEFAULT_FALLBACK_MODEL, DEFAULT_GROQ_MODEL, fromOpenAIChoice,
    GROQ_MAX_HISTORY, ProviderError, toOpenAIMessages, toOpenAITools, trimHistory,
} from '../supabase/functions/_shared/agent/fallback.ts';
import { TOOLS } from '../supabase/functions/_shared/agent/tools.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ── Sıra ────────────────────────────────────────────────────────────────────

test('sıra Claude → OpenRouter → Groq; anahtarı olmayan atlanır', () => {
    const all = buildChain({ claudeModel: 'claude-sonnet-5-5', claudeKey: 'a', openrouterKey: 'o', groqKey: 'g' });
    assert.deepEqual(all.map((p) => [p.kind, p.model]), [
        ['claude', 'claude-sonnet-5-5'], ['openrouter', DEFAULT_FALLBACK_MODEL], ['groq', DEFAULT_GROQ_MODEL],
    ]);
    assert.equal(all[2].maxHistory, GROQ_MAX_HISTORY);
    assert.equal(all[1].maxHistory, undefined);
    const noClaude = buildChain({ claudeModel: 'x', claudeKey: null, openrouterKey: 'o', openrouterModel: 'm/free', groqKey: null });
    assert.deepEqual(noClaude.map((p) => [p.kind, p.model]), [['openrouter', 'm/free']]);
    assert.deepEqual(buildChain({ claudeModel: 'x', claudeKey: null, openrouterKey: null, groqKey: null }), []);
});

// ── Claude geçmişi → OpenAI ─────────────────────────────────────────────────

const HISTORY = [
    { role: 'user', content: [{ type: 'text', text: 'Merhaba, yarın ağda var mı?' }] },
    { role: 'system', content: 'BAĞLAM eski · saat 10:00' },
    { role: 'assistant', content: [
        { type: 'thinking', thinking: 'gizli' },
        { type: 'tool_use', id: 'toolu_1', name: 'find_slots', input: { service_ref: 'h1', date: '2026-10-30', part_of_day: null, staff_ref: null } },
    ] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"ok":true}' }] },
    { role: 'assistant', content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'Yarın 10:00 ve 14:30 boş.' }] },
    { role: 'user', content: [{ type: 'text', text: '14:30 olsun' }] },
    { role: 'system', content: 'BAĞLAM yeni · saat 10:05' },
];

test('çeviri: düşünce atılır, araç çağrısı ve sonucu eşlenir, yalnız SON bağlam sistem mesajına', () => {
    const out = toOpenAIMessages('KURALLAR', HISTORY);
    assert.equal(out[0].role, 'system');
    assert.equal(out[0].content, 'KURALLAR\n\nBAĞLAM yeni · saat 10:05');
    assert.equal(out.filter((m) => m.role === 'system').length, 1, 'konuşma ortasında sistem mesajı kalmamalı');
    assert.deepEqual(out.slice(1).map((m) => m.role), ['user', 'assistant', 'tool', 'assistant', 'user']);
    const call = out[2];
    assert.equal(call.content, null);
    assert.equal(call.tool_calls[0].id, 'toolu_1');
    assert.equal(call.tool_calls[0].function.name, 'find_slots');
    assert.deepEqual(JSON.parse(call.tool_calls[0].function.arguments).date, '2026-10-30');
    assert.equal(out[3].tool_call_id, 'toolu_1');
    assert.equal(out[4].content, 'Yarın 10:00 ve 14:30 boş.');
    assert.doesNotMatch(JSON.stringify(out), /gizli/);
});

test('Groq için kısaltma müşteri mesajından başlar; sahipsiz araç sonucu kalmaz', () => {
    const convo = toOpenAIMessages('K', HISTORY).slice(1);
    const cut = trimHistory(convo, 3);
    assert.equal(cut[0].role, 'user');
    assert.ok(!cut.some((m, i) => m.role === 'tool' && !(cut[i - 1]?.tool_calls)), 'araç sonucu çağrısız kaldı');
    assert.equal(trimHistory(convo, 50).length, convo.length);
    // Hiç sığmıyorsa son müşteri mesajı ve sonrası.
    const tail = trimHistory([{ role: 'user', content: 'a' }, { role: 'assistant', content: null, tool_calls: [{}] }, { role: 'tool' }], 1);
    assert.equal(tail[0].role, 'user');
});

test('araç tanımları OpenAI biçiminde, şema aynen', () => {
    const t = toOpenAITools(TOOLS);
    assert.equal(t.length, TOOLS.length);
    assert.equal(t[0].type, 'function');
    assert.equal(t[0].function.name, TOOLS[0].name);
    assert.deepEqual(t[0].function.parameters, TOOLS[0].input_schema);
});

// ── OpenAI cevabı → Claude blokları ─────────────────────────────────────────

test('cevap Claude bloklarına döner: kimlik yeniden üretilir, bozuk argüman boş nesne', () => {
    const r = fromOpenAIChoice({ message: { content: ' Bakıyorum ', tool_calls: [
        { id: 'call 0', function: { name: 'find_slots', arguments: '{"service_ref":"h1"}' } },
        { id: 'call_0', function: { name: 'my_appointments', arguments: '{bozuk' } },
    ] } }, 'toolu_openrouter_x');
    assert.equal(r.stop_reason, 'tool_use');
    assert.deepEqual(r.content.map((b) => b.type), ['text', 'tool_use', 'tool_use']);
    assert.equal(r.content[0].text, 'Bakıyorum');
    assert.equal(r.content[1].id, 'toolu_openrouter_x_0');
    assert.equal(r.content[2].id, 'toolu_openrouter_x_1');
    assert.match(r.content[1].id, /^[a-zA-Z0-9_-]+$/);
    assert.deepEqual(r.content[2].input, {});
    assert.equal(fromOpenAIChoice({ message: { content: 'Tamam' } }, 'p').stop_reason, 'end_turn');
});

test('gidiş-dönüş: yedeğin araç çağrısı geçmişe yazılır, sonraki çağrıda aynı kimlikle eşlenir', () => {
    const r = fromOpenAIChoice({ message: { content: null, tool_calls: [{ id: 'c', function: { name: 'find_slots', arguments: '{}' } }] } }, 'toolu_groq_k');
    const hist = [
        { role: 'user', content: [{ type: 'text', text: 'saat?' }] },
        { role: 'assistant', content: r.content },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: r.content[0].id, content: '{}' }] },
    ];
    const out = toOpenAIMessages('K', hist);
    assert.equal(out[2].tool_calls[0].id, out[3].tool_call_id);
});

// ── İstek ve hata kodları ───────────────────────────────────────────────────

const fakeFetch = (status, body, seen) => async (url, init) => {
    seen?.push({ url, init, body: JSON.parse(init.body) });
    return {
        ok: status >= 200 && status < 300, status,
        json: async () => body, text: async () => JSON.stringify(body),
    };
};
const OR = { kind: 'openrouter', model: DEFAULT_FALLBACK_MODEL, apiKey: 'k' };
const GQ = { kind: 'groq', model: DEFAULT_GROQ_MODEL, apiKey: 'g', maxHistory: GROQ_MAX_HISTORY };
const REQ = { system: 'K', history: HISTORY, tools: TOOLS };

test('istek: doğru uç, araçlar, düşük çıktı tavanı; gpt-oss düşük düşünür; OpenRouter başlıkları', async () => {
    const seen = [];
    const ok = { choices: [{ message: { content: 'Tamam' } }], usage: { prompt_tokens: 900, completion_tokens: 12 } };
    const r = await callOpenAICompat(OR, REQ, 5000, fakeFetch(200, ok, seen));
    assert.equal(r.content[0].text, 'Tamam');
    assert.deepEqual(r.usage, { input: 900, output: 12 });
    assert.equal(seen[0].url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(seen[0].init.headers.Authorization, 'Bearer k');
    assert.equal(seen[0].init.headers['X-Title'], 'Luera TimeFlow');
    assert.equal(seen[0].body.tools.length, TOOLS.length);
    assert.equal(seen[0].body.max_tokens, 1024);
    assert.equal(seen[0].body.reasoning_effort, undefined);
    await callOpenAICompat(GQ, REQ, 5000, fakeFetch(200, ok, seen));
    assert.equal(seen[1].url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(seen[1].body.reasoning_effort, 'low');
    assert.equal(seen[1].init.headers['X-Title'], undefined);
});

test('hata kodları: sınır, 200 içinde hata, boş cevap, zaman aşımı, ağ', async () => {
    const code = async (p, f) => { try { await callOpenAICompat(p, REQ, 5000, f); return 'yok'; } catch (e) { return e instanceof ProviderError ? e.code : 'başka'; } };
    assert.equal(await code(OR, fakeFetch(429, { error: 'rate' })), 'openrouter_429');
    assert.equal(await code(OR, fakeFetch(200, { error: { code: 502, message: 'upstream' } })), 'openrouter_error');
    assert.equal(await code(GQ, fakeFetch(200, { choices: [{ message: { content: '' } }] })), 'groq_empty');
    assert.equal(await code(GQ, async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; }), 'groq_timeout');
    assert.equal(await code(GQ, async () => { throw new TypeError('fetch failed'); }), 'groq_network');
});

// ── wa-agent'a bağlantı ─────────────────────────────────────────────────────

test('wa-agent: düşen sağlayıcıda sıradakine geçer, reddi devretmez, asıl modeli saklar', () => {
    const src = read('supabase/functions/wa-agent/index.ts');
    assert.match(src, /const chain = buildChain\(\{ claudeModel: model, claudeKey, openrouterKey, openrouterModel, groqKey, groqModel \}\);/);
    assert.match(src, /if \(slot \+ 1 < chain\.length\) \{ slot\+\+; continue; \}/);
    assert.match(src, /new Anthropic\(\{ apiKey: claudeKey, maxRetries: 0 \}\)/);
    assert.match(src, /timeout: Math\.min\(remaining, CLAUDE_CALL_MS\)/);
    // Ret yedeğe gitmez; döngüden çıkar.
    assert.match(src, /if \(resp\.stop_reason === 'refusal'\) \{ error = 'refusal'; break; \}/);
    // Konuşmaya asıl model yazılır (yoksa Claude dönünce geçmiş sıfırlanır), çalışmaya cevabı veren.
    assert.match(src, /\/\/ değişti" sayılıp geçmiş sıfırlanırdı\.\n\s+model,/);
    assert.match(src, /model: answeredBy\?\.model \?\? model,/);
    assert.match(src, /const apiFailed = !answeredBy && /);
    assert.match(src, /`yedek: \$\{failures\.join\(' > '\)\}`/);
    assert.doesNotMatch(src, /getSecret\(admin, 'ANTHROPIC_API_KEY'\);\n\s+if \(!apiKey\)/, 'Claude anahtarı yokken yedeğe geçilmeli');
});
