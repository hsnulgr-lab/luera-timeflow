import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * AI Müşteri Geri-Kazanım mesaj taslakları.
 * Girdi: { organization_id, intent, customers: [{ id, name, days, service }] }
 * Çıktı: { drafts: [{ id, message }] }
 * Tüm müşteriler TEK Groq çağrısında işlenir (rate limit dostu).
 * Sadece ön ad + son hizmet Groq'a gider; telefon/soyad GİTMEZ.
 */
Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { organization_id, customers, intent, context } = await req.json();
        if (!organization_id || !Array.isArray(customers) || customers.length === 0) {
            return json({ error: 'organization_id ve customers gerekli' }, 400);
        }

        // İşletme adını DB'den al (frontend'e güvenmeden)
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        const { data: settings } = await supabase
            .from('settings')
            .select('business_name')
            .eq('organization_id', organization_id)
            .maybeSingle();
        const businessName = settings?.business_name || 'İşletmemiz';

        const groqKey = await getGroqKey(supabase);
        if (!groqKey) return json({ error: 'GROQ_API_KEY tanımlı değil' }, 500);

        // Groq'a giden veri: sadece ön ad + gün + hizmet
        const safeList = customers.slice(0, 20).map((c: any, i: number) => ({
            ref: i,
            ad: (c.name || '').split(' ')[0],
            kac_gundur_yok: c.days ?? null,
            son_hizmet: c.service ?? null,
        }));

        const intentText = intent === 'campaign'
            ? `sakin geçen ${context || 'bir gününü'} doldurmak için müşteriyi o güne randevuya davet eden, içten ve cazip bir mesaj`
            : 'uzun süredir gelmeyen müşteriyi nazikçe geri kazanmak için bir "seni özledik" mesajı';

        const systemPrompt =
            `Sen ${businessName} adlı güzellik/randevu işletmesinin sahibisin. ` +
            `Her müşteri için ${intentText} yaz. ` +
            'Kurallar: Türkçe, samimi, kısa (en fazla 2-3 cümle), WhatsApp için uygun. ' +
            'Müşterinin adıyla başla. 1 emoji kullanabilirsin. Spam gibi durmasın, içten olsun. ' +
            'Aşırı indirim vaadi verme; sıcak bir davet tonu yeterli. ' +
            'YANIT FORMATI: Sadece JSON. {"drafts":[{"ref":0,"message":"..."}]} biçiminde, her müşteri için bir kayıt.';

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                temperature: 0.8,
                max_tokens: 1500,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Müşteriler:\n${JSON.stringify(safeList, null, 2)}` },
                ],
            }),
        });

        if (!groqRes.ok) {
            const detail = await groqRes.text().catch(() => '');
            console.error('Groq error:', groqRes.status, detail);
            return json({ error: 'AI mesaj üretemedi', detail }, 502);
        }

        const groqData = await groqRes.json();
        const content = groqData.choices?.[0]?.message?.content ?? '{}';
        let parsed: any = {};
        try { parsed = JSON.parse(content); } catch { parsed = {}; }
        const aiDrafts: any[] = parsed.drafts ?? [];

        // ref → orijinal müşteri id eşle
        const drafts = aiDrafts
            .map((d: any) => {
                const original = customers[d.ref];
                if (!original) return null;
                return { id: original.id, message: String(d.message || '').trim() };
            })
            .filter(Boolean);

        return json({ drafts }, 200);

    } catch (err) {
        console.error('draft-messages error:', err);
        return json({ error: 'Sunucu hatası', detail: String(err) }, 500);
    }
});

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

// GROQ key'i önce env'den, yoksa app_secrets tablosundan al
async function getGroqKey(supabase: any): Promise<string | null> {
    const env = Deno.env.get('GROQ_API_KEY');
    if (env) return env;
    const { data } = await supabase
        .from('app_secrets')
        .select('value')
        .eq('key', 'GROQ_API_KEY')
        .maybeSingle();
    return data?.value ?? null;
}
