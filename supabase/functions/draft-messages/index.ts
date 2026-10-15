import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAccess } from '../_shared/entitlement.ts';
import { requireUserOrg } from '../_shared/auth.ts';
import { NAME_RULE, NAME_TOKEN, fillName, firstNameOf } from './aiName.ts';

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
 *
 * Groq'a giden: gün sayısı + son hizmet + işletme adı. Müşterinin ADI DA
 * GİTMEZ (D5, 2026-10-16): istemde `{AD}` yer tutucusu var, gerçek ön ad
 * dönen taslağa burada konuyor (`aiName.ts`). Yer tutucu tutmayan taslak
 * kullanılmıyor, şablona düşülüyor. Telefon ve soyad zaten gitmiyordu.
 */
Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { customers, intent, context } = await req.json();
        if (!Array.isArray(customers) || customers.length === 0) {
            return json({ error: 'customers gerekli' }, 400);
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        // Org, çağıranın ÜYELİĞİNDEN çözülür. Önceden gövdeden alınıyordu ve
        // kimlik kontrolü yoktu: org id'yi bilen biri o işletmenin müşteri
        // adlarını içeren taslakları alabiliyor, Groq faturasını da şişirebiliyordu.
        const auth = await requireUserOrg(supabase, req, corsHeaders);
        if (auth instanceof Response) return auth;
        const organization_id = auth.orgId;
        // Abonelik kapısı: taslak üretimi model çağırıyor, faturası bize.
        const access = await checkAccess(supabase, organization_id);
        if (!access.ok) return deny(403, 'Aboneliğiniz aktif değil', corsHeaders);
        const { data: settings } = await supabase
            .from('settings')
            .select('business_name')
            .eq('organization_id', organization_id)
            .limit(1)
            .maybeSingle();
        const businessName = settings?.business_name || 'İşletmemiz';

        const groqKey = await getGroqKey(supabase);
        if (!groqKey) return json({ error: 'GROQ_API_KEY tanımlı değil' }, 500);

        // Groq'a giden veri: gün + hizmet. Ad YOK — herkes için aynı yer tutucu.
        const safeList = customers.slice(0, 20).map((c: any, i: number) => ({
            ref: i,
            ad: NAME_TOKEN,
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
            `${NAME_RULE} Mesaja ${NAME_TOKEN} ile başla. 1 emoji kullanabilirsin. ` +
            'Spam gibi durmasın, içten olsun. ' +
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

        // ref → orijinal müşteri id eşle; ad yer tutucuya burada konuyor.
        // Yer tutucusu tutmayan (adı uydurulmuş ya da hiç yazılmamış) taslak
        // yerine şablon — her müşteri için bir taslak dönüyor.
        const byRef = new Map<number, string>();
        for (const d of aiDrafts) {
            const ref = Number(d?.ref);
            if (Number.isInteger(ref) && !byRef.has(ref)) byRef.set(ref, String(d?.message ?? ''));
        }
        const drafts = customers.slice(0, 20).map((original: any, ref: number) => ({
            id: original.id,
            message: fillName(byRef.get(ref), original.name)
                ?? fallbackDraft(intent, firstNameOf(original.name), businessName, context),
        }));

        return json({ drafts }, 200);

    } catch (err) {
        console.error('draft-messages error:', err);
        return json({ error: 'Sunucu hatası', detail: String(err) }, 500);
    }
});

/**
 * Şablon taslak — model cevap vermediğinde ya da yer tutucu tutmadığında.
 * Kişi taslağı göndermeden önce okuyup düzenliyor (AiMessageModal).
 */
function fallbackDraft(intent: unknown, name: string, businessName: string, context: unknown): string {
    const hello = name ? `Merhaba ${name} 👋` : 'Merhaba 👋';
    if (intent === 'campaign') {
        const when = typeof context === 'string' && context.trim() ? context.trim() : 'bu hafta';
        return `${hello} ${businessName} olarak ${when} sizi ağırlamak isteriz. Uygun bir saat için bu mesaja yanıt vermeniz yeterli.`;
    }
    return `${hello} ${businessName} olarak sizi özledik! Size uygun bir güne randevu ayarlamak isterseniz bu mesaja yanıt vermeniz yeterli. 😊`;
}

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
