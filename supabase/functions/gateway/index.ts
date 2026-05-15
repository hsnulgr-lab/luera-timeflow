import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(req.url);

    // Route: POST /functions/v1/gateway/inbound
    if (req.method === 'POST' && url.pathname.endsWith('/inbound')) {
        return handleInbound(req);
    }

    return new Response(
        JSON.stringify({ error: 'Not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
});

async function handleInbound(req: Request): Promise<Response> {
    try {
        const body = await req.json();

        // Zorunlu alanlar
        const { customer_name, customer_phone, date, start_time, end_time, service, user_id } = body;

        if (!customer_name || !customer_phone || !date || !start_time || !end_time || !service || !user_id) {
            return new Response(
                JSON.stringify({
                    error: 'Eksik alan',
                    required: ['customer_name', 'customer_phone', 'date', 'start_time', 'end_time', 'service', 'user_id'],
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Çakışma kontrolü
        const { data: conflicts } = await supabase
            .from('reservations')
            .select('id, customer_name, start_time, end_time')
            .eq('user_id', user_id)
            .eq('date', date)
            .neq('status', 'cancelled');

        const newStart = timeToMinutes(start_time);
        const newEnd = timeToMinutes(end_time);

        const conflict = (conflicts || []).find((r: any) => {
            const rStart = timeToMinutes(r.start_time.slice(0, 5));
            const rEnd = timeToMinutes(r.end_time.slice(0, 5));
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
                customer_email: body.customer_email || null,
                customer_id: body.customer_id || null,
                date,
                start_time,
                end_time,
                service,
                service_color: body.service_color || '#CCFF00',
                status: body.status || 'pending',
                notes: body.notes || '',
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
            JSON.stringify({ success: true, reservation: data }),
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
