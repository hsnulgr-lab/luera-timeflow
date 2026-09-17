// Müdür · Profil → Personel (099) — sunucu çağrıları.
//
// Üçü de `staff-api`nin SAHİP uçları: Supabase oturumu + üye olmayan rol.
// Personelin şifre hash'i telefona hiç inmiyor; yalnız "var mı".

import { supabase } from './supabase';
import { OrgError, resolveOrg } from './managerSource';
import type { TeamCode, TeamMember } from './teamAccessView.ts';

export type TeamFailure = 'owner_required' | 'offline' | 'failed';

async function call(action: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const choice = await resolveOrg();
    if (!choice.ok) throw new OrgError(choice.reason);
    const { data, error } = await supabase.functions.invoke('staff-api', {
        body: { action, orgId: choice.id, ...extra },
    });
    if (!error) return (data ?? {}) as Record<string, unknown>;
    // 4xx/5xx gövdesi `context`te — sebebi okunmadan "başarısız" denmiyor.
    const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
    const body = context?.json ? await context.json().catch(() => null) : null;
    const code = (body as { error?: string } | null)?.error;
    throw new Error(code === 'owner_required' ? 'owner_required' : context ? 'failed' : 'offline');
}

function failureOf(cause: unknown): TeamFailure {
    const message = cause instanceof Error ? cause.message : '';
    return message === 'owner_required' || message === 'offline' ? message : 'failed';
}

/**
 * Ekibin giriş durumu. Okunamazsa FIRLATIR — okuma kancası hâli çiziyor.
 * İşletme sahibi olmayan kullanıcıda `'owner_required'` DÖNER: bu bir okuma
 * hatası değil, ekranın söylemesi gereken bir olgu.
 */
export async function fetchTeamStatus(): Promise<TeamMember[] | 'owner_required'> {
    let data: Record<string, unknown>;
    try {
        data = await call('team.status');
    } catch (cause) {
        if (cause instanceof Error && cause.message === 'owner_required') return 'owner_required';
        throw cause;
    }
    const rows = Array.isArray(data.staff) ? data.staff as Record<string, unknown>[] : [];
    return rows.map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ''),
        role: typeof row.role === 'string' ? row.role : null,
        hasPin: row.hasPin === true,
        lastLoginAt: typeof row.lastLoginAt === 'string' ? row.lastLoginAt : null,
        pinSetAt: typeof row.pinSetAt === 'string' ? row.pinSetAt : null,
        lockedUntil: typeof row.lockedUntil === 'string' ? row.lockedUntil : null,
    }));
}

/**
 * EKİP KODU — tek kod, 15 dakika, bütün ekip (müdür kararı). Yenisi eskisini
 * kapatır. Kod yalnız bu cevapta açık; ekrandan kaybolursa yenisi üretilir.
 */
export async function createTeamCode(): Promise<{ ok: true; code: TeamCode } | { ok: false; reason: TeamFailure }> {
    try {
        const data = await call('device.code.create');
        const code = String(data.code ?? '');
        const expiresAt = Date.parse(String(data.expiresAt ?? ''));
        if (!/^\d{6}$/.test(code) || !Number.isFinite(expiresAt)) return { ok: false, reason: 'failed' };
        return { ok: true, code: { code, expiresAt } };
    } catch (cause) {
        if (cause instanceof OrgError) throw cause;
        return { ok: false, reason: failureOf(cause) };
    }
}

/** Şifreyi sıfırla → personelin açık oturumları düşer, yenisini kendisi belirler. */
export async function resetStaffPin(staffId: string): Promise<{ ok: true } | { ok: false; reason: TeamFailure }> {
    try {
        await call('staff.pin.reset', { staffId });
        return { ok: true };
    } catch (cause) {
        if (cause instanceof OrgError) throw cause;
        return { ok: false, reason: failureOf(cause) };
    }
}

// ── Açık kod — ekranlar arası ───────────────────────────────────────────────
//
// Kod yalnız üretildiği cevapta açık geçiyor ve sunucuda okunamıyor. Profil'in
// "Personel · Kod açık · 14:32" satırı kodun SÜRESİNİ bilmek için bu hafızaya
// bakıyor — kodun kendisini değil. Uygulama kapanınca unutulur; doğrusu bu.

let activeCode: TeamCode | null = null;

export function rememberTeamCode(code: TeamCode | null): void {
    activeCode = code;
}

/** Hâlâ geçerli açık kodun bitiş anı; yoksa null. */
export function activeTeamCodeExpiry(nowMs: number): number | null {
    return activeCode && activeCode.expiresAt > nowMs ? activeCode.expiresAt : null;
}

export function activeTeamCode(nowMs: number): TeamCode | null {
    return activeCode && activeCode.expiresAt > nowMs ? activeCode : null;
}
