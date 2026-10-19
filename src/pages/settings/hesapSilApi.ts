/**
 * Masaüstü hesap silme — `account-delete` edge function'ı (telefondaki
 * `mobile/src/api/accountDeletion.ts`'in eşi).
 *
 * İstemci yıkımın kapsamına KARAR VERMEZ; sunucu sahip sayısına bakıp ya
 * yalnız kişiyi ya işletmeyi siler. Buradaki sayılar yalnız ekran içindir ve
 * sayılmadan liste çizilmez ("tüm verileriniz" gibi belirsiz cümle yok).
 *
 * "Silindi" yalnız sunucu gerçekten sildiğinde yazılır. Cevap gelmezse sonuç
 * UYDURULMAZ ('unknown'): giriş denemesi gerçeği söyler.
 */
import { supabase } from '@/lib/supabase';
import { isTimeout, withTimeout } from './useTaslak';

export interface DeletionFacts {
    role: string | null;
    soleOwner: boolean;
    canDelete: boolean;
    appointments: number;
    customers: number;
    services: number;
    staff: number;
}

export async function fetchDeletionFacts(orgId: string, userId: string): Promise<DeletionFacts> {
    const count = (table: string) => supabase.from(table).select('id', { count: 'exact', head: true }).eq('organization_id', orgId);
    const [members, appointments, customers, services, staff] = await Promise.all([
        supabase.from('organization_members').select('user_id, role').eq('org_id', orgId),
        count('reservations'),
        count('customers'),
        count('services'),
        supabase.from('staff').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_active', true),
    ]);
    for (const r of [members, appointments, customers, services, staff]) if (r.error) throw r.error;
    const rows = (members.data ?? []) as { user_id: string; role: string | null }[];
    const role = rows.find((r) => r.user_id === userId)?.role ?? null;
    const owners = rows.filter((r) => r.role === 'owner').length;
    return {
        role,
        soleOwner: role === 'owner' && owners <= 1,
        canDelete: role === 'owner',
        appointments: appointments.count ?? 0,
        customers: customers.count ?? 0,
        services: services.count ?? 0,
        staff: staff.count ?? 0,
    };
}

export type DeleteFailure =
    | 'offline' | 'no-session' | 'forbidden' | 'subscription'
    | 'apple_mismatch' | 'apple_code_invalid' | 'server' | 'unknown';

export interface AppleProof { code: string; redirectUri: string }

export async function deleteAccount(orgId: string | null, apple?: AppleProof | null): Promise<{ ok: true } | { ok: false; reason: DeleteFailure }> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' };
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return { ok: false, reason: 'no-session' };

    const body: Record<string, unknown> = {};
    if (orgId) body.orgId = orgId;
    if (apple) { body.appleCode = apple.code; body.appleClient = 'web'; body.appleRedirectUri = apple.redirectUri; }

    const out = await withTimeout(
        supabase.functions.invoke('account-delete', { body }).catch((cause: unknown) => ({ data: null, error: cause })),
        30_000,
    );
    if (isTimeout(out)) return { ok: false, reason: 'unknown' };
    const { data, error } = out as { data: unknown; error: unknown };

    // 4xx/5xx gövdesi `error.context`te — okunmazsa her ret "sunucu hatası"
    // görünür ve ekran yanlış sebep yazar (telefonda yaşandı).
    let res = data as { deleted?: boolean; error?: string } | null;
    if (error) {
        const ctx = (error as { context?: Response }).context;
        try { res = (await ctx?.clone().json()) ?? null; } catch { res = null; }
        if (!res) return { ok: false, reason: ctx ? 'server' : 'unknown' };
    }
    if (!res?.deleted) {
        if (res?.error === 'forbidden_role') return { ok: false, reason: 'forbidden' };
        if (res?.error === 'subscription_cancel_failed') return { ok: false, reason: 'subscription' };
        if (res?.error === 'apple_mismatch') return { ok: false, reason: 'apple_mismatch' };
        if (res?.error === 'apple_code_invalid') return { ok: false, reason: 'apple_code_invalid' };
        return { ok: false, reason: 'server' };
    }
    return { ok: true };
}
