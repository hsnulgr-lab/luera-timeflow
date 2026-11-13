import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { handleEnd, handleStart, type Deps, type EndBody, type StartBody } from './core.ts';

/**
 * "MÜŞTERİ BEKLİYOR" — Live Activity itmesi (göç 144 · 1.0.3).
 *
 * Yalnız veritabanı tetikleyicisi çağırıyor (pg_net). Kimlik `x-push-secret`
 * (app_secrets.PUSH_TRIGGER_SECRET) — `send-push` ile aynı kapı. JWT yok.
 *
 * Body:
 *   { event: 'start', organization_id, staff_id, reservation_id, date,
 *     customer, service, time, arrived_at, fallback }
 *   { event: 'end', organization_id, reservation_id }
 *
 * `fallback` bugünkü "Müşterin geldi" bildiriminin `send-push` gövdesi.
 * Etkinliğin açılamadığı her cihaz onu alıyor (`core.ts`, İLK KURAL).
 *
 * APNs anahtarı `app_secrets`te: APNS_KEY (.p8 metni), APNS_KEY_ID,
 * APNS_TEAM_ID. Yoksa etkinlik yok, bildirim aynen gidiyor.
 */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
});

Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const secret = async (key: string): Promise<string | null> => {
        const env = Deno.env.get(key);
        if (env) return env;
        const { data } = await admin.from('app_secrets').select('value').eq('key', key).maybeSingle();
        return (data?.value as string | undefined) ?? null;
    };

    const pushSecret = await secret('PUSH_TRIGGER_SECRET');
    if (!pushSecret || req.headers.get('x-push-secret') !== pushSecret) {
        return json({ error: 'unauthorized' }, 401);
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return json({ error: 'invalid_body' }, 400);
    }

    const deps: Deps = {
        admin,
        secret,
        fetch: (input, init) => fetch(input, init),
        now: () => Date.now(),
        forwardPush: async (pushBody) => {
            try {
                const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-push-secret': pushSecret },
                    body: JSON.stringify(pushBody),
                });
                if (!res.ok) console.error('send-push iletimi', res.status, await res.text().catch(() => ''));
            } catch (cause) {
                console.error('send-push iletilemedi', String(cause));
            }
        },
    };

    if (body.event === 'start') {
        if (!body.organization_id || !body.staff_id || !body.reservation_id || !body.fallback) {
            return json({ error: 'invalid_body' }, 400);
        }
        return json(await handleStart(deps, body as unknown as StartBody));
    }
    if (body.event === 'end') {
        if (!body.organization_id || !body.reservation_id) return json({ error: 'invalid_body' }, 400);
        try {
            return json(await handleEnd(deps, body as unknown as EndBody));
        } catch (cause) {
            console.error('send-live-activity end', String(cause));
            return json({ error: 'server_error' }, 500);
        }
    }
    return json({ error: 'invalid_event' }, 400);
});
