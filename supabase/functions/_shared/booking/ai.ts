// Serbest metinden yapı çıkarma — İKİ sağlayıcı, biri yedek.
//
// Model burada YALNIZ çevirmen: cümleyi anlar, JSON döner. Karar vermez, mesaj
// yazmaz, hesap yapmaz. Randevuyu kod oluşturur.
//
// Neden iki sağlayıcı: tek sağlayıcı düştüğünde bot dilsizleşiyordu — aiExtract
// hata durumunda hep null dönüyor ve akış sonsuza kadar "hangi gün?" diye
// soruyordu. Artık üç katman var: kural tabanlı çözücü (dates.ts) → birincil
// model → yedek model.
//
// Hangisinin birincil olduğu app_secrets'taki WA_AI_PRIMARY ile değişir
// (groq | gemini). Ölçüm yapıp karar verince deploy gerekmez, ayar yeter.

import { getSecret, type Admin } from '../wa.ts';

export interface Extraction {
    service: string | null;
    date: string | null;
    time: string | null;
    confirm: 'yes' | 'no' | null;
    intent: 'book' | 'cancel' | 'greeting' | 'other';
}

export const EMPTY_EXTRACTION: Extraction = {
    service: null, date: null, time: null, confirm: null, intent: 'other',
};

export interface ExtractContext {
    services: { name: string }[];
    today: string;
    todayName: string;
    /** Şimdiye kadar toplanan bilgi — modelin tekrar sormasını engeller. */
    state: Record<string, unknown>;
    message: string;
    /** Kural tabanlı çözücünün zaten bulduğu alanlar; model bunları arayacak. */
    known?: { date?: string | null; time?: string | null };
}

function buildPrompt(ctx: ExtractContext): string {
    const svcList = ctx.services.map((s) => s.name).join(', ');
    const already = [
        ctx.known?.date ? `Tarih zaten çözüldü: ${ctx.known.date}` : null,
        ctx.known?.time ? `Saat zaten çözüldü: ${ctx.known.time}` : null,
    ].filter(Boolean).join('\n');
    return (
        `Sen bir randevu asistanısın. Kullanıcının Türkçe mesajından bilgi ÇIKAR (karar verme).\n` +
        `Bugün: ${ctx.today} (${ctx.todayName}). Mevcut hizmetler: ${svcList}.\n` +
        `Şimdiye kadar toplanan: ${JSON.stringify(ctx.state || {})}.\n` +
        (already ? `${already}\n` : '') +
        `SADECE şu JSON formatında yanıt ver: {"service": <hizmet adı tam olarak listeden ya da null>, ` +
        `"date": <YYYY-MM-DD ya da null>, "time": <HH:MM ya da null>, ` +
        `"confirm": <"yes"|"no"|null>, "intent": <"book"|"cancel"|"greeting"|"other">}\n` +
        `Kurallar: "yarın", "salı", "bu cumartesi" gibi ifadeleri bugüne göre gerçek tarihe çevir. ` +
        `"3 buçuk"=15:30, "sabah 10"=10:00. Bilgi yoksa null. ` +
        `Onay (evet/olur/tamam)=yes, ret (hayır/yok)=no. ` +
        `service'i yalnızca listedeki adlardan biriyle eşleştir.`
    );
}

/** Modelin döndürdüğü gövdeyi güvenli biçimde Extraction'a çevirir. */
function coerce(raw: string | null): Extraction | null {
    if (!raw) return null;
    try {
        const p = JSON.parse(raw);
        const intent = ['book', 'cancel', 'greeting', 'other'].includes(p?.intent) ? p.intent : 'other';
        const confirm = p?.confirm === 'yes' || p?.confirm === 'no' ? p.confirm : null;
        return {
            service: typeof p?.service === 'string' ? p.service : null,
            date: typeof p?.date === 'string' ? p.date : null,
            time: typeof p?.time === 'string' ? p.time : null,
            confirm,
            intent,
        };
    } catch {
        return null;
    }
}

async function askGroq(key: string, prompt: string, message: string): Promise<Extraction | null> {
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile', temperature: 0.2, max_tokens: 300,
                response_format: { type: 'json_object' },
                messages: [{ role: 'system', content: prompt }, { role: 'user', content: message }],
            }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return coerce(data?.choices?.[0]?.message?.content ?? null);
    } catch {
        return null;
    }
}

async function askGemini(key: string, prompt: string, message: string): Promise<Extraction | null> {
    try {
        const res = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: prompt }] },
                    contents: [{ parts: [{ text: message }] }],
                    generationConfig: {
                        responseMimeType: 'application/json',
                        temperature: 0.2, maxOutputTokens: 300,
                        thinkingConfig: { thinkingBudget: 0 },
                    },
                }),
            },
        );
        if (!res.ok) return null;
        const data = await res.json();
        return coerce(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null);
    } catch {
        return null;
    }
}

/**
 * Birincil sağlayıcıyı dener, boş dönerse yedeğe geçer. İkisi de yoksa null —
 * çağıran o zaman yalnız kural tabanlı çözümle devam eder (bot susmaz).
 */
export async function extractWithAi(admin: Admin, ctx: ExtractContext): Promise<Extraction | null> {
    const prompt = buildPrompt(ctx);
    const primary = ((await getSecret(admin, 'WA_AI_PRIMARY')) || 'groq').toLowerCase();

    const [groqKey, geminiKey] = await Promise.all([
        getSecret(admin, 'GROQ_API_KEY'),
        getSecret(admin, 'GEMINI_API_KEY'),
    ]);

    const providers: { name: string; run: () => Promise<Extraction | null> }[] = [];
    const push = (name: string) => {
        if (name === 'groq' && groqKey) providers.push({ name, run: () => askGroq(groqKey, prompt, ctx.message) });
        if (name === 'gemini' && geminiKey) providers.push({ name, run: () => askGemini(geminiKey, prompt, ctx.message) });
    };
    push(primary);
    push(primary === 'groq' ? 'gemini' : 'groq');

    for (const p of providers) {
        const out = await p.run();
        if (out) return out;
    }
    return null;
}
