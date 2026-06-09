import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TZ_OFFSET_MIN = 3 * 60; // Türkiye UTC+3
const DAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { organization_id, refresh } = await req.json();
        if (!organization_id) {
            return json({ error: 'organization_id gerekli' }, 400);
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const nowTR = new Date(Date.now() + TZ_OFFSET_MIN * 60_000);
        const todayStr = nowTR.toISOString().slice(0, 10);

        // ── 1) Bugünün içgörüsü zaten üretildiyse cache'ten dön ──────────────
        if (!refresh) {
            const { data: cached } = await supabase
                .from('daily_insights')
                .select('insight')
                .eq('organization_id', organization_id)
                .eq('date', todayStr)
                .maybeSingle();

            if (cached?.insight) {
                return json({ insight: cached.insight, cached: true }, 200);
            }
        }

        // ── 2) Anonim istatistikleri topla (müşteri PII'si Groq'a GİTMEZ) ───
        // Son 30 günün rezervasyonları
        const since = new Date(nowTR.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
        const { data: rows } = await supabase
            .from('reservations')
            .select('date, start_time, status')
            .eq('organization_id', organization_id)
            .gte('date', since);

        const reservations = rows ?? [];

        // Yeterli veri yoksa Groq'u hiç çağırma — sabit karşılama mesajı
        if (reservations.length < 3) {
            const intro = 'Sistemi kullanmaya yeni başladın. Birkaç randevu girince burada işletmene özel akıllı öneriler göreceksin. 💡';
            await cache(supabase, organization_id, todayStr, intro);
            return json({ insight: intro, cached: false }, 200);
        }

        // Gün dağılımı (0=Pazar)
        const dayCount = new Array(7).fill(0);
        const hourCount: Record<number, number> = {};
        let cancelled = 0;
        let thisWeek = 0, lastWeek = 0;

        const weekAgo   = new Date(nowTR.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
        const twoWeekAgo = new Date(nowTR.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);

        for (const r of reservations) {
            const d = new Date(r.date + 'T12:00:00');
            dayCount[d.getDay()]++;
            if (r.start_time) {
                const h = parseInt(r.start_time.split(':')[0]);
                hourCount[h] = (hourCount[h] || 0) + 1;
            }
            if (r.status === 'cancelled') cancelled++;
            if (r.date >= weekAgo) thisWeek++;
            else if (r.date >= twoWeekAgo) lastWeek++;
        }

        const busiestDay = DAYS_TR[dayCount.indexOf(Math.max(...dayCount))];
        const quietestDay = DAYS_TR[dayCount.indexOf(Math.min(...dayCount.filter(() => true)))];
        const busiestHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0]?.[0];
        const cancelRate = Math.round((cancelled / reservations.length) * 100);
        const trend = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : 0;

        const stats = {
            toplam_randevu_30gun: reservations.length,
            en_yogun_gun: busiestDay,
            en_sakin_gun: quietestDay,
            en_yogun_saat: busiestHour ? `${busiestHour}:00` : 'belirsiz',
            iptal_orani_yuzde: cancelRate,
            bu_hafta: thisWeek,
            gecen_hafta: lastWeek,
            haftalik_degisim_yuzde: trend,
        };

        // ── 3) Groq'tan içgörü iste ─────────────────────────────────────────
        const groqKey = await getGroqKey(supabase);
        if (!groqKey) return json({ error: 'GROQ_API_KEY tanımlı değil' }, 500);

        const systemPrompt =
            'Sen bir güzellik salonu / randevu işletmesi danışmanısın. ' +
            'Sana işletmenin son 30 günlük randevu istatistiklerini vereceğim. ' +
            'Bu verilere bakarak işletme sahibine TEK bir kısa, samimi ve uygulanabilir öneri ver. ' +
            'Kurallar: En fazla 2 cümle. Türkçe. Rakamları yorumla, ezbere tavsiye verme. ' +
            'Sıcak ve teşvik edici bir ton kullan. Bir emoji kullanabilirsin. ' +
            'Sadece öneriyi yaz, "İşte öneriniz" gibi giriş cümlesi kullanma.';

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                temperature: 0.7,
                max_tokens: 150,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `İşletme istatistikleri:\n${JSON.stringify(stats, null, 2)}` },
                ],
            }),
        });

        if (!groqRes.ok) {
            const detail = await groqRes.text().catch(() => '');
            console.error('Groq error:', groqRes.status, detail);
            // Groq başarısızsa kuralla bir fallback üret
            const fallback = buildFallback(stats);
            await cache(supabase, organization_id, todayStr, fallback);
            return json({ insight: fallback, cached: false, fallback: true }, 200);
        }

        const groqData = await groqRes.json();
        const insight = (groqData.choices?.[0]?.message?.content ?? '').trim() || buildFallback(stats);

        // ── 4) Cache'le ve dön ──────────────────────────────────────────────
        await cache(supabase, organization_id, todayStr, insight);
        return json({ insight, cached: false }, 200);

    } catch (err) {
        console.error('Insight error:', err);
        return json({ error: 'Sunucu hatası', detail: String(err) }, 500);
    }
});

// ── Yardımcılar ──────────────────────────────────────────────────────────────

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

async function cache(supabase: any, orgId: string, date: string, insight: string) {
    await supabase
        .from('daily_insights')
        .upsert({ organization_id: orgId, date, insight }, { onConflict: 'organization_id,date' });
}

function buildFallback(s: any): string {
    if (s.iptal_orani_yuzde >= 20) {
        return `İptal oranın %${s.iptal_orani_yuzde} — biraz yüksek. Randevu hatırlatmalarını öne çekmeyi deneyebilirsin. 📲`;
    }
    if (s.haftalik_degisim_yuzde >= 15) {
        return `Bu hafta randevuların %${s.haftalik_degisim_yuzde} arttı, harika gidiyorsun! ${s.en_yogun_gun} günlerine ekstra hazırlık yap. 🚀`;
    }
    return `${s.en_sakin_gun} günlerin daha sakin geçiyor. O güne özel küçük bir kampanya ile boş saatleri doldurabilirsin. 💡`;
}
