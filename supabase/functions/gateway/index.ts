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

        // ── API key doğrulama ──────────────────────────────────────────────────
        // Authorization header, x-timeflow-key header veya body.api_key'den al
        const authHeader = req.headers.get('authorization') || req.headers.get('x-timeflow-key') || '';
        const rawKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

        // Connection string formatı: "api_key|user_id" — sadece api_key kısmını al
        const apiKeyRaw = rawKey || body.api_key || '';
        const apiKey = apiKeyRaw.includes('|') ? apiKeyRaw.split('|')[0] : apiKeyRaw;

        let resolvedUserId: string | null = null;
        let resolvedOrgId: string | null = null;

        if (apiKey) {
            // API key ile user_id çöz
            const { data: conn } = await supabase
                .from('integration_connections')
                .select('user_id, organization_id')
                .eq('api_key', apiKey)
                .eq('active', true)
                .maybeSingle();

            if (conn?.user_id) {
                resolvedUserId = conn.user_id;
                resolvedOrgId = conn.organization_id ?? null;

                // org_id yoksa (eski kayıt) organization_members'dan çöz
                if (!resolvedOrgId) {
                    const { data: member } = await supabase
                        .from('organization_members')
                        .select('org_id')
                        .eq('user_id', resolvedUserId)
                        .limit(1)
                        .maybeSingle();
                    resolvedOrgId = member?.org_id ?? null;
                }

                // Son kullanım zamanını güncelle
                await supabase
                    .from('integration_connections')
                    .update({ last_used_at: new Date().toISOString() })
                    .eq('api_key', apiKey);
            }
        }

        const { event_type, payload } = body;
        const data_source = payload || body;

        const {
            customer_name, customer_phone, date,
            start_time, end_time, service,
        } = data_source;

        // user_id: API key'den çözüldüyse onu kullan, yoksa body'den al
        const user_id = resolvedUserId || data_source.user_id;

        // org_id: API key'den çözüldüyse onu kullan, yoksa body'den al
        // Connection string'den user_id parse edildiyse onu da dene
        let organization_id = resolvedOrgId || data_source.organization_id || null;

        // Hâlâ org_id yoksa body'deki user_id üzerinden çöz
        if (!organization_id && user_id) {
            const { data: member } = await supabase
                .from('organization_members')
                .select('org_id')
                .eq('user_id', user_id)
                .limit(1)
                .maybeSingle();
            organization_id = member?.org_id ?? null;
        }

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

        if (!organization_id) {
            return new Response(
                JSON.stringify({ error: 'Organizasyon bulunamadı', hint: 'API key geçerli bir organizasyona bağlı değil' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ── Subscription gate (LUERA Core) ────────────────────────────────────
        // Core'a "bu tenant TimeFlow abonesi mi?" diye sorar.
        // Varsayılan SHADOW mod: sadece loglar, isteği geçirir (pilot için güvenli).
        // CORE_SUBSCRIPTION_ENFORCE=true olunca abonesi olmayan 403 alır.
        const subGate = await checkSubscription(supabase, organization_id);
        if (!subGate.ok) {
            return new Response(
                JSON.stringify(subGate.body),
                { status: subGate.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ── Çakışma kontrolü (organization_id bazlı) ──────────────────────────
        const { data: conflicts } = await supabase
            .from('reservations')
            .select('id, customer_name, start_time, end_time')
            .eq('organization_id', organization_id)
            .eq('date', date)
            .neq('status', 'cancelled');

        const newStart = timeToMinutes(start_time);
        const newEnd   = timeToMinutes(end_time);

        const conflict = (conflicts || []).find((r: any) => {
            if (!r.start_time || !r.end_time) return false;
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

        // ── Müşteri upsert (telefona göre) ───────────────────────────────────
        let customer_id: string | null = data_source.customer_id || null;

        if (!customer_id) {
            // Aynı telefon + org'da müşteri var mı?
            const { data: existingCustomer } = await supabase
                .from('customers')
                .select('id')
                .eq('organization_id', organization_id)
                .eq('phone', customer_phone)
                .eq('is_active', true)
                .maybeSingle();

            if (existingCustomer?.id) {
                customer_id = existingCustomer.id;
                // İsim veya e-posta değiştiyse güncelle
                await supabase
                    .from('customers')
                    .update({ name: customer_name, email: data_source.customer_email || null })
                    .eq('id', customer_id);
            } else {
                // Yeni müşteri oluştur
                const { data: newCustomer } = await supabase
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
                customer_id = newCustomer?.id ?? null;
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

// ── LUERA Core subscription doğrulaması ──────────────────────────────────────
// Core'daki has_active_subscription(p_org_id, p_module) RPC'sini çağırır.
//
// Modlar (CORE_SUBSCRIPTION_ENFORCE env'i ile):
//   - unset/false (varsayılan, SHADOW): sonucu loglar, isteği HER ZAMAN geçirir.
//   - true (ENFORCE): abone değilse 403, Core erişilemezse 503 döner.
//
// Core env'leri (Coolify): CORE_SUPABASE_URL, CORE_SERVICE_KEY
// Bunlar tanımlı değilse gate atlanır (kademeli kurulum — bkz. Omurga Uyum notu).
type SubGate = { ok: true } | { ok: false; status: number; body: unknown };

// Sır okuma: önce env, yoksa app_secrets tablosu (self-hosted'da env
// compose'a gömülü olduğundan repo deseni app_secrets — bkz. remind/insight)
async function getSecret(supabase: any, key: string): Promise<string | null> {
    const env = Deno.env.get(key);
    if (env) return env;
    const { data } = await supabase.from('app_secrets').select('value').eq('key', key).maybeSingle();
    return data?.value ?? null;
}

async function checkSubscription(supabase: any, orgId: string): Promise<SubGate> {
    const enforce  = (await getSecret(supabase, 'CORE_SUBSCRIPTION_ENFORCE')) === 'true';
    const coreUrl  = await getSecret(supabase, 'CORE_SUPABASE_URL');
    const coreKey  = await getSecret(supabase, 'CORE_SERVICE_KEY');
    const MODULE   = 'timeflow';

    // Core bağlı değil → gate'i atla (henüz entegre değil)
    if (!coreUrl || !coreKey) {
        if (enforce) {
            console.error('Subscription ENFORCE açık ama CORE_SUPABASE_URL/CORE_SERVICE_KEY tanımsız');
            return { ok: false, status: 503, body: { error: 'SUB_CHECK_FAILED', hint: 'Core yapılandırması eksik' } };
        }
        return { ok: true };
    }

    try {
        const core = createClient(coreUrl, coreKey);
        // Core'daki gerçek imza: has_active_subscription(p_org_id, p_module_name)
        const { data, error } = await core.rpc('has_active_subscription', {
            p_org_id: orgId,
            p_module_name: MODULE,
        });

        if (error) {
            console.error('Core subscription RPC hatası:', error.message);
            // ENFORCE'ta Core hatası isteği bloklar (503 — 403'ten ayrı, fark edilsin)
            return enforce
                ? { ok: false, status: 503, body: { error: 'SUB_CHECK_FAILED', detail: error.message } }
                : { ok: true };
        }

        const active = data === true;
        if (!active) {
            console.log(`Subscription: org=${orgId} module=${MODULE} → PASİF (enforce=${enforce})`);
            return enforce
                ? { ok: false, status: 403, body: { error: 'SUB_NONE', hint: 'Bu organizasyonun aktif TimeFlow aboneliği yok' } }
                : { ok: true }; // SHADOW: logla ama geçir
        }

        return { ok: true };
    } catch (err) {
        console.error('Core subscription bağlantı hatası:', err);
        return enforce
            ? { ok: false, status: 503, body: { error: 'SUB_CHECK_FAILED', detail: String(err) } }
            : { ok: true };
    }
}
