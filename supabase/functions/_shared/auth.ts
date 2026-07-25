// Edge function kimlik doğrulaması — TEK KAYNAK.
//
// Neden var: self-hosted kurulumda yönlendiricide VERIFY_JWT=false, yani
// Supabase katmanı hiçbir fonksiyonu korumuyor. Her fonksiyon kendi kontrolünü
// yapmak ZORUNDA. Bu yapılmadığı için remind, notify-waitlist, draft-messages ve
// insight'a kimlik bilgisi olmadan istek atılabiliyordu: org id'yi bilen biri
// başka bir işletmenin müşteri adlarını okuyabiliyor, mesaj attırabiliyordu.
//
// Üç çağıran tipi var:
//   user    → tarayıcıdaki oturum (JWT). Org'u KENDİMİZ çözeriz, gövdeye güvenmeyiz.
//   service → başka bir edge function (service_role anahtarı ile dahili çağrı).
//   cron    → dış zamanlayıcı; app_secrets'taki CRON_TRIGGER_SECRET'ı taşır.
//
// Anon anahtar KİMLİK DEĞİLDİR: tarayıcı bundle'ında herkese açık durur, bu
// yüzden 'none' sayılır.

import { getSecret } from './wa.ts';

// deno-lint-ignore no-explicit-any
type Admin = any;

export type Caller =
    | { kind: 'user'; userId: string; orgId: string }
    | { kind: 'service' }
    | { kind: 'cron' }
    | { kind: 'none' };

function bearer(req: Request): string {
    return (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

/** Çağıranın kim olduğunu belirler. Gövdedeki hiçbir alana güvenmez. */
export async function identify(admin: Admin, req: Request): Promise<Caller> {
    const cronHeader = req.headers.get('x-cron-secret');
    if (cronHeader) {
        const expected = await getSecret(admin, 'CRON_TRIGGER_SECRET');
        if (expected && cronHeader === expected) return { kind: 'cron' };
    }

    const token = bearer(req);
    if (!token) return { kind: 'none' };

    if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return { kind: 'service' };

    // Anon anahtar da bir JWT'dir ama kullanıcı taşımaz → getUser hata döner.
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return { kind: 'none' };

    const { data: member } = await admin
        .from('organization_members')
        .select('org_id')
        .eq('user_id', data.user.id)
        .limit(1)
        .maybeSingle();
    if (!member?.org_id) return { kind: 'none' };

    return { kind: 'user', userId: data.user.id, orgId: member.org_id };
}

export function deny(status: 401 | 403, msg: string, cors: Record<string, string>): Response {
    return new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
    });
}

/**
 * Kullanıcı oturumu şart olan uçlar için. Org'u çağıranın üyeliğinden döner —
 * istemcinin gönderdiği organization_id KULLANILMAZ (başka org'un verisi
 * istenebiliyordu).
 */
export async function requireUserOrg(
    admin: Admin, req: Request, cors: Record<string, string>,
): Promise<{ orgId: string } | Response> {
    const caller = await identify(admin, req);
    if (caller.kind !== 'user') {
        return deny(401, 'Bu işlem için oturum açmanız gerekiyor', cors);
    }
    return { orgId: caller.orgId };
}
