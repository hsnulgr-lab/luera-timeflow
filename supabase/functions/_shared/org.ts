// Kullanıcı → org çözümü, belirsizliğe yer bırakmadan.
//
// Eski desen `organization_members … limit(1)` idi: kullanıcı iki org'a üye
// olduğu anda hangi org'a işlem yapılacağı RASTGELE seçiliyordu. Şube/çoklu
// org senaryosunda bu, yanlış tenant'ın WhatsApp'ını koparmak demek. Kural:
//   - Tek üyelik → o org (istemci orgId göndermek zorunda değil, geri uyumlu).
//   - Çoklu üyelik → istemci orgId göndermek ZORUNDA; üyelik server-side doğrulanır.
//   - İstemcinin gönderdiği orgId hiçbir zaman doğrulamasız kullanılmaz.

import type { Admin } from './wa.ts';

export type OrgRole = 'owner' | 'admin' | 'member';

export interface ResolvedOrg { orgId: string; role: OrgRole }
export interface ResolveError { error: string; status: number }

export async function resolveOrg(
    admin: Admin,
    userId: string,
    requestedOrgId?: string | null,
): Promise<ResolvedOrg | ResolveError> {
    const { data: memberships, error } = await admin
        .from('organization_members')
        .select('org_id, role')
        .eq('user_id', userId);
    if (error) {
        console.error('resolveOrg membership query error', error);
        return { error: 'org_lookup_failed', status: 500 };
    }
    if (!memberships?.length) return { error: 'no_org', status: 403 };

    if (requestedOrgId) {
        const m = memberships.find((m: { org_id: string }) => m.org_id === requestedOrgId);
        if (!m) return { error: 'forbidden_org', status: 403 };
        return { orgId: m.org_id, role: (m.role ?? 'member') as OrgRole };
    }

    if (memberships.length > 1) return { error: 'org_id_required', status: 400 };
    return { orgId: memberships[0].org_id, role: (memberships[0].role ?? 'member') as OrgRole };
}
