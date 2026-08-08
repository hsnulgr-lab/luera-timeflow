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
import { coerceTopic, TOPICS, type Topic } from './inquiry.ts';

export interface Extraction {
    service: string | null;
    date: string | null;
    time: string | null;
    confirm: 'yes' | 'no' | null;
    intent: 'book' | 'cancel' | 'reschedule' | 'greeting' | 'other';
    /**
     * Bilgi sorusunun konusu (Dalga 2). Model burada YALNIZ bir enum döner —
     * cevabı kod yazar, sayıları veritabanı verir. Listede olmayan her değer
     * null'a düşürülür (bkz. coerceTopic).
     */
    topic: Topic | null;
}

export const EMPTY_EXTRACTION: Extraction = {
    service: null, date: null, time: null, confirm: null, intent: 'other', topic: null,
};

/** Konuşmanın önceki turu. */
export interface Turn {
    role: 'user' | 'assistant';
    text: string;
}

export interface ExtractContext {
    services: { name: string }[];
    today: string;
    todayName: string;
    /** Şimdiye kadar toplanan bilgi — modelin tekrar sormasını engeller. */
    state: Record<string, unknown>;
    message: string;
    /** Kural tabanlı çözücünün zaten bulduğu alanlar; model bunları arayacak. */
    known?: { date?: string | null; time?: string | null };
    /**
     * Önceki turlar (eski → yeni), şu anki mesaj HARİÇ.
     *
     * Bu eksikti ve botun "hafızası yok" görünmesinin sebebi buydu: modele her
     * seferinde YALNIZ son mesaj gidiyordu. state alanı topladığımız veriyi
     * (hizmet/tarih/saat) taşıyor ama konuşmanın kendisini taşımıyor — "peki ya
     * bir sonraki hafta?" gibi bir cümlenin neye atıf yaptığı state'te yazmaz.
     */
    history?: Turn[];
    /**
     * Modele düşünme payı (Gemini). 0 = kapalı. Düşünen jetonlar çıktı
     * bütçesinden yendiği için maxOutputTokens bununla birlikte büyür.
     */
    thinkingBudget?: number;
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
        `"confirm": <"yes"|"no"|null>, "intent": <"book"|"cancel"|"reschedule"|"greeting"|"other">, ` +
        `"topic": <${TOPICS.map((t) => `"${t}"`).join('|')}|null>}\n` +
        `Kurallar: "yarın", "salı", "bu cumartesi" gibi ifadeleri bugüne göre gerçek tarihe çevir. ` +
        `"3 buçuk"=15:30, "sabah 10"=10:00. Bilgi yoksa null. ` +
        `Onay (evet/olur/tamam)=yes, ret (hayır/yok)=no. ` +
        `intent: randevu almak=book, mevcut randevuyu iptal etmek=cancel, ` +
        `mevcut randevuyu başka güne taşımak=reschedule.\n` +
        `topic: kullanıcı randevu almaya değil BİLGİ ALMAYA çalışıyorsa doldur. ` +
        `my_appointment=kendi randevusunu soruyor, my_package=kalan seansını soruyor, ` +
        `my_balance=borcunu soruyor, hours=çalışma saatleri, price=fiyat, ` +
        `location=adres/yol tarifi, human=insanla görüşmek istiyor. Aksi halde null.\n` +
        `TUTAR, TARİH, SAAT VE SEANS SAYISI UYDURMA — topic'i adlandır, cevabı sistem yazacak. ` +
        `service'i yalnızca listedeki adlardan biriyle eşleştir.\n` +
        `Önceki mesajlar konuşma geçmişi olarak verilir; "peki ya sonraki hafta", ` +
        `"o zaman olmaz" gibi cümleleri o bağlama göre yorumla. Yalnız SON kullanıcı ` +
        `mesajı için JSON üret.`
    );
}

/** Modelin döndürdüğü gövdeyi güvenli biçimde Extraction'a çevirir. */
function coerce(raw: string | null): Extraction | null {
    if (!raw) return null;
    try {
        const p = JSON.parse(raw);
        const intent = ['book', 'cancel', 'reschedule', 'greeting', 'other'].includes(p?.intent)
            ? p.intent : 'other';
        const confirm = p?.confirm === 'yes' || p?.confirm === 'no' ? p.confirm : null;
        return {
            service: typeof p?.service === 'string' ? p.service : null,
            date: typeof p?.date === 'string' ? p.date : null,
            time: typeof p?.time === 'string' ? p.time : null,
            confirm,
            intent,
            // Serbest metin kabul edilmez: listede olmayan her şey null.
            topic: coerceTopic(p?.topic),
        };
    } catch {
        return null;
    }
}

/** Geçmiş turlar + son mesaj; ikisi de aynı sırayla iki sağlayıcıya gider. */
function turns(ctx: ExtractContext): Turn[] {
    return [...(ctx.history ?? []), { role: 'user' as const, text: ctx.message }];
}

async function askGroq(key: string, prompt: string, ctx: ExtractContext): Promise<Extraction | null> {
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile', temperature: 0.2, max_tokens: 300,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: prompt },
                    ...turns(ctx).map((t) => ({ role: t.role === 'user' ? 'user' : 'assistant', content: t.text })),
                ],
            }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return coerce(data?.choices?.[0]?.message?.content ?? null);
    } catch {
        return null;
    }
}

async function askGemini(key: string, prompt: string, ctx: ExtractContext): Promise<Extraction | null> {
    // Düşünen jetonlar maxOutputTokens'tan DÜŞÜLÜR. Bütçeyi açıp tavanı
    // büyütmezsek model düşünürken kotayı bitirir ve gövde boş döner —
    // sessiz bir "model çalışmıyor" arızası.
    const think = Math.max(0, ctx.thinkingBudget ?? 0);
    try {
        const res = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: prompt }] },
                    contents: turns(ctx).map((t) => ({
                        role: t.role === 'user' ? 'user' : 'model',
                        parts: [{ text: t.text }],
                    })),
                    generationConfig: {
                        responseMimeType: 'application/json',
                        temperature: 0.2, maxOutputTokens: 300 + think,
                        thinkingConfig: { thinkingBudget: think },
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

    const [groqKey, geminiKey, thinkRaw] = await Promise.all([
        getSecret(admin, 'GROQ_API_KEY'),
        getSecret(admin, 'GEMINI_API_KEY'),
        getSecret(admin, 'WA_AI_THINKING'),
    ]);
    // Düşünme payı ayarla değişir, deploy gerekmez. '0' yazmak kapatır.
    // Varsayılan 512: dolaylı cümlelerde ("geçen seferki gibi olsun ama
    // sabah") gözle görülür fark yapıyor, gecikmeyi ise saniyenin altında
    // artırıyor. Yalnız Gemini'yi etkiler — Groq'un llama'sı düşünmüyor.
    const parsed = Number(thinkRaw);
    const withThink: ExtractContext = {
        ...ctx,
        thinkingBudget: thinkRaw !== null && Number.isFinite(parsed) ? Math.max(0, parsed) : 512,
    };

    const providers: { name: string; run: () => Promise<Extraction | null> }[] = [];
    const push = (name: string) => {
        if (name === 'groq' && groqKey) providers.push({ name, run: () => askGroq(groqKey, prompt, withThink) });
        if (name === 'gemini' && geminiKey) providers.push({ name, run: () => askGemini(geminiKey, prompt, withThink) });
    };
    push(primary);
    push(primary === 'groq' ? 'gemini' : 'groq');

    for (const p of providers) {
        const out = await p.run();
        if (out) return out;
    }
    return null;
}
