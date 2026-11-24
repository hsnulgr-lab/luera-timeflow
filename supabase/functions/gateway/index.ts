import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAccess } from '../_shared/entitlement.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-timeflow-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function isReservationConflict(error: { code?: string; message?: string } | null | undefined): boolean {
    const message = (error?.message || '').toLowerCase();
    return error?.code === '23P01'
        || message.includes('reservation_staff_conflict')
        || message.includes('reservation_resource_conflict');
}

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

// ── Kimlik (denetim 2026-11-24 · B2) ─────────────────────────────────────────
//
// Eskiden API anahtarı İSTEĞE BAĞLIYDI: anahtar yoksa ya da yanlışsa işletme
// ve kullanıcı GÖVDEDEN okunuyordu. Kayıt herkese açık, işletme kimliği de
// herkese açık logo adresinde yazdığı için internetteki herkes başka bir
// salona randevu yazabiliyor, müşterisinin adını değiştirebiliyor ve çakışma
// cevabından müşteri adlarını okuyabiliyordu.
//
// Kural artık: geçerli ve etkin bir `integration_connections.api_key` ŞART.
// İşletme ve kullanıcı YALNIZ o satırdan gelir; gövdedeki `user_id` ve
// `organization_id` hiçbir koşulda okunmaz.

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

/** "Bearer x", "x" ya da bağlantı dizesi "x|user_id" → yalnız anahtar. */
export function extractApiKey(header: string | null, bodyKey: unknown): string {
    const h = String(header || '').trim();
    const raw = (h.toLowerCase().startsWith('bearer ') ? h.slice(7) : h).trim()
        || (typeof bodyKey === 'string' ? bodyKey.trim() : '');
    return raw.split('|')[0].trim();
}

/** Yalnız bu iki durum dışarıdan yazılabilir; gerisi (completed, no_show…) salonun işi. */
export function safeStatus(v: unknown): 'pending' | 'confirmed' {
    return v === 'confirmed' ? 'confirmed' : 'pending';
}

async function handleInbound(req: Request): Promise<Response> {
    try {
        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object') return json({ error: 'Geçersiz gövde' }, 400);

        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        const apiKey = extractApiKey(
            req.headers.get('authorization') || req.headers.get('x-timeflow-key'),
            body.api_key,
        );
        if (!apiKey) return json({ error: 'API anahtarı gerekli' }, 401);

        const { data: conn } = await supabase
            .from('integration_connections')
            .select('user_id, organization_id')
            .eq('api_key', apiKey)
            .eq('active', true)
            .maybeSingle();
        if (!conn?.user_id) return json({ error: 'Geçersiz API anahtarı' }, 401);

        const user_id: string = conn.user_id;
        let organization_id: string | null = conn.organization_id ?? null;

        // Eski kayıt (organization_id boş): yalnız TEK üyelik varsa o işletme.
        // Sırasız `limit(1)` iki işletmeli kullanıcıda rastgele seçiyordu.
        if (!organization_id) {
            const { data: members } = await supabase
                .from('organization_members')
                .select('org_id')
                .eq('user_id', user_id)
                .limit(2);
            organization_id = members?.length === 1 ? members[0].org_id : null;
        }
        if (!organization_id) {
            return json({ error: 'Organizasyon bulunamadı', hint: 'API anahtarı tek bir işletmeye bağlı değil' }, 400);
        }

        await supabase
            .from('integration_connections')
            .update({ last_used_at: new Date().toISOString() })
            .eq('api_key', apiKey);

        const { event_type, payload } = body;

        // Bağlantı testi (src/services/integrationApi.ts · testConnection).
        if (event_type === 'ping') return json({ ok: true, event_type }, 200);

        const data_source = (payload && typeof payload === 'object') ? payload : body;
        const { customer_name, customer_phone, date, start_time, end_time, service } = data_source;

        if (!customer_name || !customer_phone || !date || !start_time || !end_time || !service) {
            return json({
                error: 'Eksik alan',
                required: ['customer_name', 'customer_phone', 'date', 'start_time', 'end_time', 'service'],
            }, 400);
        }

        // ── Abonelik kapısı ───────────────────────────────────────────────────
        // Ürünün geri kalanıyla AYNI kapı (_shared/entitlement).
        const access = await checkAccess(supabase, organization_id);
        if (!access.ok) {
            return json({ error: 'SUB_NONE', state: access.effective, hint: 'Bu organizasyonun aktif TimeFlow aboneliği yok' }, 403);
        }

        // Personel bu işletmenin mi? Değilse randevu yabancı bir kimliğe bağlanırdı.
        let staff_id: string | null = data_source.staff_id || null;
        if (staff_id) {
            const { data: st } = await supabase
                .from('staff').select('id')
                .eq('id', staff_id).eq('organization_id', organization_id)
                .maybeSingle();
            if (!st?.id) return json({ error: 'Personel bulunamadı' }, 400);
            staff_id = st.id;
        }

        // ── Çakışma kontrolü ──────────────────────────────────────────────────
        let conflictQuery = supabase
            .from('reservations')
            .select('start_time, end_time')
            .eq('organization_id', organization_id)
            .eq('date', date)
            .neq('status', 'cancelled');
        conflictQuery = staff_id
            ? conflictQuery.eq('staff_id', staff_id)
            : conflictQuery.is('staff_id', null);
        const { data: conflicts } = await conflictQuery;

        const newStart = timeToMinutes(start_time);
        const newEnd   = timeToMinutes(end_time);

        // deno-lint-ignore no-explicit-any
        const conflict = (conflicts || []).find((r: any) => {
            if (!r.start_time || !r.end_time) return false;
            const rStart = timeToMinutes(r.start_time.slice(0, 5));
            const rEnd   = timeToMinutes(r.end_time.slice(0, 5));
            return newStart < rEnd && rStart < newEnd;
        });

        if (conflict) {
            // Yalnız saat: dolu saatin KİMDE olduğu dışarıya söylenmez.
            return json({
                error: 'Çakışma var',
                conflict: { start_time: String(conflict.start_time).slice(0, 5), end_time: String(conflict.end_time).slice(0, 5) },
            }, 409);
        }

        // ── Müşteri ───────────────────────────────────────────────────────────
        // Gelen kimlik bu işletmenin değilse yok sayılır, telefondan bulunur.
        // Var olan müşterinin adı/e-postası GÜNCELLENMEZ: dış kaynak salonun
        // elle düzelttiği kaydın üzerine yazmamalı.
        let customer_id: string | null = null;
        if (data_source.customer_id) {
            const { data: c } = await supabase
                .from('customers').select('id')
                .eq('id', data_source.customer_id).eq('organization_id', organization_id)
                .maybeSingle();
            customer_id = c?.id ?? null;
        }

        if (!customer_id) {
            const { data: existing, error: customerLookupError } = await supabase
                .from('customers')
                .select('id')
                .eq('organization_id', organization_id)
                .eq('phone', customer_phone)
                .eq('is_active', true)
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (customerLookupError) {
                console.error('Customer lookup error:', customerLookupError);
                return json({ error: 'Müşteri kaydı doğrulanamadı' }, 500);
            }

            if (existing?.id) {
                customer_id = existing.id;
            } else {
                const { data: newCustomer, error: customerCreateError } = await supabase
                    .from('customers')
                    .insert({
                        user_id,
                        organization_id,
                        name:  customer_name,
                        phone: customer_phone,
                        email: data_source.customer_email || null,
                    })
                    .select('id')
                    .single();

                if (customerCreateError || !newCustomer?.id) {
                    console.error('Customer create error:', customerCreateError);
                    return json({ error: 'Müşteri kaydı oluşturulamadı' }, 500);
                }
                customer_id = newCustomer.id;
            }
        }

        // ── Rezervasyon oluştur ───────────────────────────────────────────────
        const { data, error } = await supabase
            .from('reservations')
            .insert({
                user_id,
                organization_id,
                customer_name,
                customer_phone,
                customer_email:  data_source.customer_email  || null,
                customer_id,
                date,
                start_time,
                end_time,
                service,
                service_color:   data_source.service_color   || '#CCFF00',
                status:          safeStatus(data_source.status),
                notes:           data_source.notes           || '',
                staff_id,
            })
            .select()
            .single();

        if (error) {
            console.error('Insert error:', error);
            const clash = isReservationConflict(error);
            return json({
                error: clash ? 'Seçilen saat az önce doldu. Lütfen başka bir saat seçin.' : 'Rezervasyon oluşturulamadı',
            }, clash ? 409 : 500);
        }

        return json({ success: true, event_type, organization_id, reservation: data }, 201);
    } catch (err) {
        console.error('Gateway error:', err);
        return json({ error: 'Sunucu hatası' }, 500);
    }
}

function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}
