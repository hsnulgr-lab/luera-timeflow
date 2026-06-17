import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================
// generate-recurring — Tekrar eden randevu üretici (n8n cron)
// ------------------------------------------------------------
// Her gece çalışır. recurrence_rule dolu her "kök" randevu için
// (recurrence_parent_id IS NULL) zincirin eksik gelecek
// tekrarlarını, rolling 8-periyot penceresi içinde üretir.
// Çocuk kayıtlar recurrence_rule = null taşır → tekrar işlenmez.
// ============================================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const TZ_OFFSET_MIN = 3 * 60;

function addDays(d: string, n: number): string {
    const dt = new Date(d + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
}
function addMonths(d: string, n: number): string {
    const dt = new Date(d + 'T00:00:00Z'); dt.setUTCMonth(dt.getUTCMonth() + n);
    return dt.toISOString().slice(0, 10);
}
function next(d: string, rule: 'weekly' | 'monthly'): string {
    return rule === 'weekly' ? addDays(d, 7) : addMonths(d, 1);
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const todayTR = new Date(Date.now() + TZ_OFFSET_MIN * 60_000).toISOString().slice(0, 10);

        // Tüm tekrar kökleri
        const { data: roots } = await supabase
            .from('reservations')
            .select('*')
            .not('recurrence_rule', 'is', null)
            .is('recurrence_parent_id', null);

        let created = 0;
        const details: string[] = [];

        for (const root of roots ?? []) {
            const rule = root.recurrence_rule as 'weekly' | 'monthly';

            // Zincirdeki tüm occurrence tarihleri (kök + çocuklar)
            const { data: children } = await supabase
                .from('reservations')
                .select('id, date, start_time, end_time, staff_id')
                .or(`id.eq.${root.id},recurrence_parent_id.eq.${root.id}`);

            const chain = children ?? [{ id: root.id, date: root.date, start_time: root.start_time, end_time: root.end_time, staff_id: root.staff_id }];
            const existing = new Set(chain.map(c => c.date));
            const latest = chain.reduce((mx, c) => (c.date > mx ? c.date : mx), root.date);

            // Rolling pencere: bugünden 8 periyot ileri; recurrence_until ile sınırla
            const windowEnd = rule === 'weekly' ? addDays(todayTR, 7 * 8) : addMonths(todayTR, 8);
            const limit = root.recurrence_until && root.recurrence_until < windowEnd ? root.recurrence_until : windowEnd;

            // Çakışma için: aynı personelin zincir-dışı randevuları (gelecekte)
            let cursor = latest;
            let guard = 0;
            while (guard++ < 24) {
                cursor = next(cursor, rule);
                if (cursor > limit) break;
                if (existing.has(cursor)) continue;
                if (cursor < todayTR) continue;

                // Aynı personel + aynı gün + çakışan saat var mı? (zincir dışı)
                if (root.staff_id) {
                    const { data: clash } = await supabase
                        .from('reservations')
                        .select('id, start_time, end_time')
                        .eq('organization_id', root.organization_id)
                        .eq('staff_id', root.staff_id)
                        .eq('date', cursor)
                        .neq('status', 'cancelled');
                    const overlap = (clash ?? []).some(r => r.start_time < root.end_time && root.start_time < r.end_time);
                    if (overlap) { existing.add(cursor); continue; } // o tarihi atla
                }

                const { error } = await supabase.from('reservations').insert({
                    user_id: root.user_id,
                    organization_id: root.organization_id,
                    customer_id: root.customer_id,
                    customer_name: root.customer_name,
                    customer_phone: root.customer_phone,
                    customer_email: root.customer_email,
                    date: cursor,
                    start_time: root.start_time,
                    end_time: root.end_time,
                    service: root.service,
                    service_color: root.service_color,
                    status: 'confirmed',
                    notes: root.notes,
                    staff_id: root.staff_id,
                    source: root.source || 'manual',
                    recurrence_parent_id: root.id,
                });
                if (!error) { existing.add(cursor); created++; }
                else console.error('recurring insert error', error);
            }
            details.push(`${root.id}:${rule}`);
        }

        console.log(`generate-recurring: created=${created} roots=${roots?.length ?? 0}`);
        return new Response(JSON.stringify({ success: true, created, roots: roots?.length ?? 0, details }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (err) {
        console.error('generate-recurring error:', err);
        return new Response(JSON.stringify({ error: 'Sunucu hatası', detail: String(err) }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
