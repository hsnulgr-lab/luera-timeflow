import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAccess } from '../_shared/entitlement.ts';
import { requireUserOrg } from '../_shared/auth.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TZ_OFFSET_MIN = 3 * 60; // Türkiye UTC+3
const DAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const DEFAULT_ARRIVAL_TOLERANCE_MIN = 120;
const DEFAULT_OPEN_DAY_INDEXES = [1, 2, 3, 4, 5, 6];
const SECTOR_LABELS: Record<string, string> = {
    genel: 'randevulu hizmet işletmesi',
    guzellik: 'güzellik salonu',
    kuafor: 'kuaför salonu',
    berber: 'berber salonu',
    estetik: 'estetik kliniği',
    dis: 'ağız ve diş sağlığı kliniği',
    saglik: 'sağlık kliniği',
    fizyoterapi: 'fizyoterapi merkezi',
    tattoo: 'dövme ve piercing stüdyosu',
    avukat: 'avukatlık bürosu',
    danismanlik: 'danışmanlık işletmesi',
    gym: 'spor salonu',
    gelinlikci: 'gelinlik ve prova işletmesi',
    restoran: 'restoran',
};

interface InsightStats {
    toplam_randevu_30gun: number;
    en_yogun_gun: string;
    en_sakin_gun: string;
    en_yogun_saat: string;
    iptal_orani_yuzde: number;
    gelmedi_orani_yuzde: number;
    bu_hafta: number;
    gecen_hafta: number;
    haftalik_degisim_yuzde: number;
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { refresh } = await req.json();

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        // Org, çağıranın ÜYELİĞİNDEN çözülür. Önceden gövdedeki organization_id
        // doğrudan kullanılıyordu ve hiçbir kimlik kontrolü yoktu: org id'yi
        // bilen biri başka işletmenin iş istatistiklerini okuyabiliyordu.
        const auth = await requireUserOrg(supabase, req, corsHeaders);
        if (auth instanceof Response) return auth;
        const organization_id = auth.orgId;
        // Abonelik kapısı: içgörü her turda model çağırıyor — abonesiz org
        // bizim Groq/Gemini faturamızı şişirmemeli.
        const access = await checkAccess(supabase, organization_id);
        if (!access.ok) return deny(403, 'Aboneliğiniz aktif değil', corsHeaders);

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
        // Bugün dahil son 30 takvim günü. Üst sınır özellikle konur: gelecekteki
        // randevular geçmiş performans/trend hesabına karışmamalı.
        const since = new Date(nowTR.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
        const [reservationResult, settingsResult] = await Promise.all([
            supabase
                .from('reservations')
                .select('date, start_time, status, arrived_at, customer_arrived_at')
                .eq('organization_id', organization_id)
                .gte('date', since)
                .lte('date', todayStr),
            supabase
                .from('settings')
                .select('sector, working_hours')
                .eq('organization_id', organization_id)
                .order('created_at', { ascending: true })
                .limit(1),
        ]);

        if (reservationResult.error) throw reservationResult.error;

        const reservations = reservationResult.data ?? [];
        const orgSettings = settingsResult.data?.[0];
        const sector = typeof orgSettings?.sector === 'string' ? orgSettings.sector : 'genel';
        const sectorLabel = SECTOR_LABELS[sector] || sector;
        const workingHours = Array.isArray(orgSettings?.working_hours) ? orgSettings.working_hours : [];
        const hasWorkingHourConfig = workingHours.some((row: unknown) => {
            if (!row || typeof row !== 'object') return false;
            const day = Number((row as Record<string, unknown>).day);
            return Number.isInteger(day) && day >= 0 && day <= 6;
        });
        const openDayIndexes = hasWorkingHourConfig
            ? workingHours
                .filter((row: unknown) => {
                    if (!row || typeof row !== 'object') return false;
                    const item = row as Record<string, unknown>;
                    const day = Number(item.day);
                    return Number.isInteger(day) && day >= 0 && day <= 6 && item.isOff !== true;
                })
                .map((row: unknown) => Number((row as Record<string, unknown>).day))
            : DEFAULT_OPEN_DAY_INDEXES;

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
        let noShow = 0;
        let thisWeek = 0, lastWeek = 0;

        // İki eşit, yedişer günlük pencere: bugün..6 gün önce ve 7..13 gün önce.
        const thisWeekStart = new Date(nowTR.getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
        const lastWeekStart = new Date(nowTR.getTime() - 13 * 86_400_000).toISOString().slice(0, 10);
        const lastWeekEnd = new Date(nowTR.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);

        for (const r of reservations) {
            const status = String(r.status || '').toLocaleLowerCase('tr');
            if (status === 'cancelled') {
                cancelled++;
                continue;
            }
            if (isNoShow(r, Date.now())) {
                noShow++;
                continue;
            }

            // İptal ve gelmeyen kayıtlar talep/yoğunluk değildir; gün, saat ve
            // haftalık trend dağılımına dahil edilmez.
            const d = new Date(r.date + 'T12:00:00');
            dayCount[d.getDay()]++;
            if (r.start_time) {
                const h = parseInt(r.start_time.split(':')[0]);
                if (Number.isFinite(h)) hourCount[h] = (hourCount[h] || 0) + 1;
            }
            if (r.date >= thisWeekStart && r.date <= todayStr) thisWeek++;
            else if (r.date >= lastWeekStart && r.date <= lastWeekEnd) lastWeek++;
        }

        const distributedCount = dayCount.reduce((sum, count) => sum + count, 0);
        const busiestDay = distributedCount > 0
            ? DAYS_TR[dayCount.indexOf(Math.max(...dayCount))]
            : 'belirsiz';
        // Kapalı gün doğal olarak sıfır görünür ama satış fırsatı değildir. "En
        // sakin gün" yalnız işletmenin gerçekten açık olduğu günlerden seçilir.
        const quietestDayIndex = openDayIndexes.length > 0
            ? openDayIndexes.reduce((best, day) => dayCount[day] < dayCount[best] ? day : best, openDayIndexes[0])
            : -1;
        const quietestDay = quietestDayIndex >= 0 ? DAYS_TR[quietestDayIndex] : 'belirsiz';
        const busiestHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0]?.[0];
        const cancelRate = Math.round((cancelled / reservations.length) * 100);
        const noShowRate = Math.round((noShow / reservations.length) * 100);
        const trend = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : 0;

        const stats = {
            toplam_randevu_30gun: reservations.length,
            en_yogun_gun: busiestDay,
            en_sakin_gun: quietestDay,
            en_yogun_saat: busiestHour ? `${busiestHour}:00` : 'belirsiz',
            iptal_orani_yuzde: cancelRate,
            gelmedi_orani_yuzde: noShowRate,
            bu_hafta: thisWeek,
            gecen_hafta: lastWeek,
            haftalik_degisim_yuzde: trend,
        };

        // ── 3) Groq'tan içgörü iste ─────────────────────────────────────────
        const groqKey = await getGroqKey(supabase);
        if (!groqKey) return json({ error: 'GROQ_API_KEY tanımlı değil' }, 500);

        const systemPrompt =
            `Sen ${sectorLabel} sektöründe uzman bir işletme danışmanısın. ` +
            'Sana işletmenin son 30 günlük randevu istatistiklerini vereceğim. ' +
            'Bu verilere bakarak işletme sahibine TEK bir kısa, samimi ve uygulanabilir öneri ver. ' +
            `Öneriyi özellikle ${sectorLabel} operasyonlarına ve müşteri akışına uygun kur; başka sektörlere ait kavramlar kullanma. ` +
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
async function getGroqKey(supabase: ReturnType<typeof createClient>): Promise<string | null> {
    const env = Deno.env.get('GROQ_API_KEY');
    if (env) return env;
    const { data } = await supabase
        .from('app_secrets')
        .select('value')
        .eq('key', 'GROQ_API_KEY')
        .maybeSingle();
    return data?.value ?? null;
}

async function cache(supabase: ReturnType<typeof createClient>, orgId: string, date: string, insight: string) {
    await supabase
        .from('daily_insights')
        .upsert({ organization_id: orgId, date, insight }, { onConflict: 'organization_id,date' });
}

function buildFallback(s: InsightStats): string {
    if (s.iptal_orani_yuzde >= 20) {
        return `İptal oranın %${s.iptal_orani_yuzde} — biraz yüksek. Randevu hatırlatmalarını öne çekmeyi deneyebilirsin. 📲`;
    }
    if (s.gelmedi_orani_yuzde >= 15) {
        return `Randevuya gelmeme oranın %${s.gelmedi_orani_yuzde}. Bir gün önce kısa bir teyit mesajı göndererek bu kaybı azaltabilirsin. 📲`;
    }
    if (s.haftalik_degisim_yuzde >= 15) {
        return `Bu hafta randevuların %${s.haftalik_degisim_yuzde} arttı, harika gidiyorsun! ${s.en_yogun_gun} günlerine ekstra hazırlık yap. 🚀`;
    }
    if (s.en_sakin_gun === 'belirsiz') {
        return 'Randevu akışın için henüz güvenilir bir açık gün karşılaştırması oluşmadı. Birkaç işlem daha tamamlandığında daha net bir fırsat önerebilirim. 💡';
    }
    return `${s.en_sakin_gun} günlerin daha sakin geçiyor. O güne özel küçük bir kampanya ile boş saatleri doldurabilirsin. 💡`;
}

function isNoShow(
    reservation: {
        date?: string | null;
        start_time?: string | null;
        status?: string | null;
        arrived_at?: string | null;
        customer_arrived_at?: string | null;
    },
    nowMs: number,
): boolean {
    const status = String(reservation.status || '').toLocaleLowerCase('tr');
    if (status === 'missed' || status === 'no_show' || status === 'no-show' || status === 'gelmedi') return true;
    // Uygulamadaki appointmentFlow ile aynı kural: pending/completed kayıtlar
    // türetilmiş "gelmedi" olmaz; yalnız onaylı ve hiç gelmemiş kayıt süre aşınca olur.
    if (status !== 'confirmed' || reservation.arrived_at || reservation.customer_arrived_at) return false;
    if (!reservation.date || !reservation.start_time) return false;
    const time = reservation.start_time.slice(0, 8);
    const startMs = new Date(`${reservation.date}T${time}+03:00`).getTime();
    return Number.isFinite(startMs) && nowMs > startMs + DEFAULT_ARRIVAL_TOLERANCE_MIN * 60_000;
}
