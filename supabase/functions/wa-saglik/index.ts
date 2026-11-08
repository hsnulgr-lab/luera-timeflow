import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSecret } from '../_shared/wa.ts';
import { agentDownError } from '../_shared/agent/guard.ts';

/**
 * WhatsApp tarafının sağlığı — dış izleme için (ops/izleme, 2026-11-08).
 *
 * Neden: Anthropic kredisi bittiğinde ya da WhatsApp sunucusu (Evolution,
 * VPS 2) düştüğünde bütün işletmelerde bot sessizce eski bota ya da dolgu
 * cevaba düşüyordu; kimse uyarılmıyordu. Dış izleme yalnız herkese açık
 * adresleri yoklayabiliyor; bu uç ona iki evet/hayır verir.
 *
 * Yalnız toplam durum döner: işletme, numara, mesaj YOK. İstek anon anahtarı
 * taşır (izleme zaten onu kullanıyor); ortamda anon anahtar yoksa açık kalır.
 */
const corsHeaders = { 'Content-Type': 'application/json' };

Deno.serve(async (req: Request) => {
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (anon && req.headers.get('apikey') !== anon) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    }
    try {
        const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        // 1) WhatsApp sunucusu: kök adres cevap veriyor mu? (null = ayarlı değil)
        let evolution: boolean | null = null;
        const url = await getSecret(admin, 'EVOLUTION_API_URL');
        if (url) {
            try {
                const r = await fetch(url.replace(/\/$/, '') + '/', { signal: AbortSignal.timeout(8000) });
                evolution = r.status < 500;
            } catch {
                evolution = false;
            }
        }

        // 2) Asistan: son tur Claude'a ulaşamadıysa (kredi, yetki, aşırı yük).
        // Son 3 saatte hiç tur yoksa bilinmiyor değil, sağlıklı sayılır.
        const since = new Date(Date.now() - 3 * 3600_000).toISOString();
        const { data: last } = await admin.from('wa_agent_runs').select('error, created_at')
            .gte('created_at', since).order('created_at', { ascending: false }).limit(1).maybeSingle();
        const agentError = agentDownError(last?.error ?? null);

        return new Response(JSON.stringify({ ok: true, evolution, agent_error: agentError }), { status: 200, headers: corsHeaders });
    } catch (e) {
        console.error('wa-saglik', e);
        return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: corsHeaders });
    }
});
