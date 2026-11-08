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

// ── İşletmenin ayar satırı ──────────────────────────────────────────────────
//
// settings KULLANICI başına bir satır (user_id UNIQUE), işletme başına değil.
// Bir işletmeye ikinci bir giriş eklenince iki satır olur ve eski okuyucular
// bozuluyordu: `.maybeSingle()` iki satırda null döner (online randevu boş saat
// göstermez), `.limit(1)` sırasız rastgele satır döner (bot yanlış adla
// konuşur). Doğru satır işletme SAHİBİNİNKİ; yoksa işletmenin en eski satırı —
// yanlış olabilir ama kararlı. Sahip filtresi işletmeyle birlikte uygulanır:
// iki işletmesi olan bir sahipte öbür işletmenin adı gitmesin (2026-11-08).

/**
 * İşletmenin ayar satırı. ownerId verilmezse organizations.owner_id okunur;
 * zaten okunmuşsa (null dahil) verilerek bir sorgu kazanılır.
 */
// deno-lint-ignore no-explicit-any
export async function ownerSettings<T = Record<string, any>>(
    admin: Admin, orgId: string, cols: string, ownerId?: string | null,
): Promise<T | null> {
    let owner = ownerId;
    if (owner === undefined) {
        const { data: org } = await admin.from('organizations').select('owner_id').eq('id', orgId).maybeSingle();
        owner = org?.owner_id ?? null;
    }
    if (owner) {
        const { data } = await admin.from('settings').select(cols)
            .eq('organization_id', orgId).eq('user_id', owner).maybeSingle();
        if (data) return data as T;
    }
    const { data } = await admin.from('settings').select(cols)
        .eq('organization_id', orgId).order('created_at', { ascending: true }).limit(1).maybeSingle();
    return (data ?? null) as T | null;
}

/**
 * Toplu okuma için (remind): her işletme için sahibin satırı, yoksa en eskisi.
 * Satırlarda organization_id, user_id ve created_at olmalı. Saf fonksiyon.
 */
export function pickOwnerRows<R extends { organization_id: string; user_id?: string | null; created_at?: string | null }>(
    rows: R[], ownerByOrg: Map<string, string | null>,
): Map<string, R> {
    const out = new Map<string, R>();
    const rank = (r: R) => (r.user_id && ownerByOrg.get(r.organization_id) === r.user_id ? 0 : 1);
    const time = (r: R) => (r.created_at ? Date.parse(r.created_at) : Number.MAX_SAFE_INTEGER);
    for (const r of rows) {
        const cur = out.get(r.organization_id);
        if (!cur || rank(r) < rank(cur) || (rank(r) === rank(cur) && time(r) < time(cur))) out.set(r.organization_id, r);
    }
    return out;
}
