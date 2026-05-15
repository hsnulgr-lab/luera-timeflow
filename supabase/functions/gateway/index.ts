import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-timeflow-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return new Response(
            JSON.stringify({ error: 'Method Not Allowed', allowed: ['POST'] }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Allow': 'POST, OPTIONS' } }
        );
    }

    return handleInbound(req);
});

async function handleInbound(req: Request): Promise<Response> {
    try {
        const body = await req.json();

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // API key doğrulama — Authorization header veya body.api_key'den al
        const authHeader = req.headers.get('authorization') || req.headers.get('x-timeflow-key') || '';
        const rawKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
        const apiKey = rawKey || body.api_key || '';

        let resolvedUserId: string | null = null;

        if (apiKey) {
            const { data: conn } = await supabase
                .from('integration_connections')
                .select('user_id')
                .eq('api_key', apiKey)
                .eq('active', true)
                .maybeSingle();

            if (conn?.user_id) {
                resolvedUserId = conn.user_id;
                // Son kullanım zamanını güncelle
                await supabase
                    .from('integration_connections')
                    .update({ last_used_at: new Date().toISOString() })
                    .eq('api_key', apiKey);
            }
        }

        const { event_type, organization_id, payload } = body;
        const data_source = payload || body;

        const {
            customer_name, customer_phone, date,
            start_time, end_time, service,
        } = data_source;

        // user_id: API key'den çözüldüyse onu kullan, yoksa body'den al
        const user_id = resolvedUserId || data_source.user_id;

        if (!customer_name || !customer_phone || !date || !start_time || !end_time || !service || !user_id) {
            return new Response(
                JSON.stringify({
                    error: 'Eksik alan',
                    required: ['customer_name', 'customer_phone', 'date', 'start_time', 'end_time', 'service'],
                    hint: apiKey ? 'API key geçerli, user_id otomatik çözüldü' : 'API key yoksa user_id gerekli',
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Çakışma kontrolü
        const { data: conflicts } = await supabase
            .from('reservations')
            .select('id, customer_name, start_time, end_time')
            .eq('user_id', user_id)
            .eq('date', date)
            .neq('status', 'cancelled');

        const newStart = timeToMinutes(start_time);
        const newEnd   = timeToMinutes(end_time);

        const conflict = (conflicts || []).find((r: any) => {
            const rStart = timeToMinutes(r.start_time.slice(0, 5));
            const rEnd   = timeToMinutes(r.end_time.slice(0, 5));
            return newStart < rEnd && rStart < newEnd;
        });

        if (conflict) {
            return new Response(
                JSON.stringify({ error: 'Çakışma var', conflict }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Rezervasyon oluştur
        const { data, error } = await supabase
            .from('reservations')
            .insert({
                user_id,
                customer_name,
                customer_phone,
                customer_email:  data_source.customer_email  || null,
                customer_id:     data_source.customer_id     || null,
                date,
                start_time,
                end_time,
                service,
                service_color:   data_source.service_color   || '#CCFF00',
                status:          data_source.status          || 'pending',
                notes:           data_source.notes           || '',
            })
            .select()
            .single();

        if (error) {
            console.error('Insert error:', error);
            return new Response(
                JSON.stringify({ error: 'Rezervasyon oluşturulamadı', detail: error.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ success: true, event_type, organization_id, reservation: data }),
            { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error('Gateway error:', err);
        return new Response(
            JSON.stringify({ error: 'Sunucu hatası' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
}

function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}
