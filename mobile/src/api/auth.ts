import * as LocalAuthentication from 'expo-local-authentication';

import { supabase, supabaseConfigured } from '../lib/supabase';
import {
    ApiError, auth as staffApi, tokens,
} from './staff';
import type {
    AuthBusiness, AuthFailure, AuthProfile, AuthResult, AuthSession,
    LaunchState, StaffRosterMember,
} from './authStub';

/**
 * Gerçek kimlik katmanı — `authStub`'ın yerini alır.
 *
 * Yüzey BİREBİR aynı tutuldu: ekranlar değişmesin, geçiş tek satırlık bir
 * import değişikliği olsun. Stub'ın var olma sebebi buydu.
 *
 * ── İki ayrı kimlik, bilerek ─────────────────────────────────────────────────
 * MÜDÜR   → Supabase oturumu (masaüstündeki hesabın aynısı). Org seviyesinde
 *           erişimi zaten var; RLS onu tanıyor.
 * PERSONEL → Supabase kimliği YOK. Cihaz token'ı + personel token'ı; veriye
 *           yalnız `staff-api` üzerinden, daraltılmış hâlde erişir.
 *
 * Bu ayrım güvenliğin temeli. Personel telefonuna Supabase oturumu koymak,
 * RLS org seviyesinde olduğu için salonun TÜM verisini o telefona açardı —
 * arayüz "kendi randevuların" gösterse bile.
 *
 * ── Bu dosyada OLMAYANLAR ────────────────────────────────────────────────────
 * Yeni işletme kaydı ve hesap silme burada yok: ikisinin de sunucu tarafı
 * yazılmadı (mobilden org açacak uç yok, hesap silecek uç yok). O akışlar
 * `authStub` üzerinde kalmaya devam ediyor ve gerçek değildir.
 */

const fail = (error: AuthFailure['error'], extra: Partial<AuthFailure> = {}): AuthFailure =>
    ({ ok: false, error, ...extra });
const done = <T>(data: T): AuthResult<T> => ({ ok: true, data });

/** Ağ hatası mı, sunucunun konuştuğu bir hata mı? İkisi farklı ekranlar açar. */
function mapError(e: unknown): AuthFailure {
    if (!(e instanceof ApiError)) return fail('offline');
    switch (e.code) {
        case 'expired_pair_code': return fail('expired_pair_code');
        case 'invalid_pair_code': return fail('invalid_pair_code');
        case 'subscription_inactive': return fail('subscription_inactive');
        case 'device_token_required':
        case 'invalid_token': return fail('not_paired');
        case 'staff_not_found': return fail('staff_not_found');
        case 'locked':
        case 'pair_locked': return fail('locked');
        case 'invalid_credentials': return fail('invalid_pin');
        default: return fail('invalid_credentials');
    }
}

const initials = (name: string) => name
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('tr-TR') ?? '')
    .join('');

// ── Oturum saklama ──────────────────────────────────────────────────────────
// Personel profili token'ın yanında tutulur: `me` her açılışta çağrılırsa
// bodrum katındaki personel açılış ekranında bekler.

const K_PROFILE = 'tf.auth.profile';

async function saveProfile(profile: AuthProfile, biometricEnabled: boolean): Promise<void> {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem(K_PROFILE, JSON.stringify({ profile, biometricEnabled }));
}

async function readProfile(): Promise<{ profile: AuthProfile; biometricEnabled: boolean } | null> {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    try {
        const raw = await AsyncStorage.getItem(K_PROFILE);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

async function clearProfile(): Promise<void> {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    await AsyncStorage.removeItem(K_PROFILE);
}

function businessFrom(row: { id: string; name: string; slug?: string | null }): AuthBusiness {
    return {
        id: row.id,
        name: row.name,
        location: row.slug ?? '',
        initials: initials(row.name),
        staffCount: 0,
        subscriptionStatus: 'active',
    };
}

// ── Müdür ───────────────────────────────────────────────────────────────────

async function managerBusinesses(): Promise<AuthResult<AuthBusiness[]>> {
    const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug')
        .order('name');
    if (error) return fail('offline');
    return done((data ?? []).map(businessFrom));
}

async function managerStart(email: string, password: string): Promise<AuthResult<{
    managerId: string;
    businesses: AuthBusiness[];
}>> {
    if (!supabaseConfigured) return fail('offline');
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
    });
    if (error || !data.user) {
        // Supabase kilit/oran sınırını ayırt et: kullanıcıya "yanlış şifre"
        // demek, kilitliyken yanlış bilgi olurdu.
        const locked = /rate|too many/i.test(error?.message ?? '');
        return fail(locked ? 'locked' : 'invalid_credentials');
    }
    const list = await managerBusinesses();
    if (!list.ok) return list;
    return done({ managerId: data.user.id, businesses: list.data });
}

async function selectManagerBusiness(businessId: string): Promise<AuthResult<AuthSession>> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return fail('no_session');

    const list = await managerBusinesses();
    if (!list.ok) return list;
    const business = list.data.find((candidate) => candidate.id === businessId);
    if (!business) return fail('invalid_business');

    const name = (userData.user.user_metadata?.full_name as string | undefined)
        ?? userData.user.email?.split('@')[0]
        ?? 'Yönetici';
    const profile: AuthProfile = {
        id: userData.user.id,
        actor: 'manager',
        initials: initials(name),
        name,
        email: userData.user.email ?? undefined,
        business,
    };
    const previous = await readProfile();
    await saveProfile(profile, previous?.biometricEnabled ?? false);
    return done(sessionOf(profile, previous?.biometricEnabled ?? false));
}

async function recoverManagerPassword(email: string): Promise<AuthResult<{
    sent: true; email: string; resendAvailableAt: number;
}>> {
    // Hesabın varlığı SIZDIRILMAZ: var olmayan e-posta da aynı cevabı alır.
    await supabase.auth.resetPasswordForEmail(email.trim()).catch(() => undefined);
    return done({ sent: true, email: email.trim(), resendAvailableAt: Date.now() + 60_000 });
}

// ── Personel ────────────────────────────────────────────────────────────────

let pendingStaffId: string | null = null;

async function pairStaffDevice(code: string): Promise<AuthResult<{ business: AuthBusiness }>> {
    try {
        const data = await staffApi.redeem(code);
        await tokens.setDevice(String(data.deviceToken));
        // Kod bir personele bağlıysa "kendini seç" adımı düşer.
        pendingStaffId = data.staffId ? String(data.staffId) : null;
        return done({
            business: businessFrom({ id: String(data.orgId), name: '', slug: null }),
        });
    } catch (e) {
        return mapError(e);
    }
}

async function staffRoster(): Promise<AuthResult<{
    business: AuthBusiness; staff: StaffRosterMember[];
}>> {
    const device = await tokens.device();
    if (!device) return fail('not_paired');
    try {
        const data = await staffApi.roster(device);
        const staff: StaffRosterMember[] = (data.staff ?? [])
            .filter((row: { hasPin?: boolean }) => row.hasPin !== false)
            .map((row: { id: string; name: string; role: string | null }) => ({
                id: row.id,
                initials: initials(row.name),
                name: row.name,
                role: row.role ?? '',
            }));
        return done({
            business: businessFrom({ id: '', name: '', slug: null }),
            staff,
        });
    } catch (e) {
        return mapError(e);
    }
}

async function startStaffSession(pin: string): Promise<AuthResult<AuthSession>> {
    const device = await tokens.device();
    if (!device) return fail('not_paired');
    if (!pendingStaffId) return fail('staff_not_found');
    try {
        const data = await staffApi.start(device, pendingStaffId, pin);
        await tokens.setStaff(String(data.token));
        const profile: AuthProfile = {
            id: String(data.staff.id),
            actor: 'staff',
            initials: initials(String(data.staff.name)),
            name: String(data.staff.name),
            title: data.staff.role ?? undefined,
            business: businessFrom({ id: '', name: '', slug: null }),
        };
        const previous = await readProfile();
        await saveProfile(profile, previous?.biometricEnabled ?? false);
        return done(sessionOf(profile, previous?.biometricEnabled ?? false));
    } catch (e) {
        const mapped = mapError(e);
        // Sunucu kalan deneme ve kilit süresini gönderiyor; ekran onu yazıyor.
        if (e instanceof ApiError && 'remaining' in (e as object)) {
            return { ...mapped, remainingAttempts: Number((e as { remaining?: number }).remaining) };
        }
        return mapped;
    }
}

// ── Oturum ──────────────────────────────────────────────────────────────────

function sessionOf(profile: AuthProfile, biometricEnabled: boolean): AuthSession {
    return { token: 'server', actor: profile.actor, profile, biometricEnabled };
}

async function getLaunchState(): Promise<LaunchState> {
    const stored = await readProfile();
    if (stored) {
        const live = stored.profile.actor === 'staff'
            ? Boolean(await tokens.staff())
            : Boolean((await supabase.auth.getSession()).data.session);
        if (live) return { target: 'resume', session: sessionOf(stored.profile, stored.biometricEnabled) };
    }
    return (await tokens.device()) ? { target: 'staffRoster' } : { target: 'welcome' };
}

async function resumeSession(): Promise<AuthResult<AuthSession>> {
    const stored = await readProfile();
    if (!stored) return fail('no_session');
    return done(sessionOf(stored.profile, stored.biometricEnabled));
}

async function signOut(): Promise<AuthResult<{ target: 'welcome' }>> {
    const stored = await readProfile();
    if (stored?.profile.actor === 'manager') await supabase.auth.signOut().catch(() => undefined);
    else await tokens.clearStaff();
    await clearProfile();
    return done({ target: 'welcome' });
}

// ── Biyometri ───────────────────────────────────────────────────────────────
// Face ID PIN'in ya da şifrenin YERİNE GEÇMEZ, kısayoludur: yüz doğrulanınca
// cihazdaki oturum açılır, sunucudan kimlik yine sorulur.

async function biometricAvailable(): Promise<boolean> {
    const [hardware, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
    ]);
    return hardware && enrolled;
}

async function setBiometric(enabled: boolean): Promise<AuthResult<AuthSession>> {
    const stored = await readProfile();
    if (!stored) return fail('no_session');
    if (enabled && !(await biometricAvailable())) return fail('biometric_unavailable');
    await saveProfile(stored.profile, enabled);
    return done(sessionOf(stored.profile, enabled));
}

async function authenticateBiometric(): Promise<AuthResult<AuthSession>> {
    const stored = await readProfile();
    if (!stored) return fail('no_session');
    if (!(await biometricAvailable())) return fail('biometric_unavailable');

    const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Luera’ya girin',
        cancelLabel: 'Vazgeç',
        // Cihaz şifresine düşmesin: yedek yol bizim ekranımızda (PIN / şifre),
        // sistemin kilit ekranı değil.
        disableDeviceFallback: true,
    });
    if (!result.success) return fail('invalid_credentials');
    return done(sessionOf(stored.profile, stored.biometricEnabled));
}

export const auth = {
    getLaunchState,
    manager: {
        start: managerStart,
        businesses: managerBusinesses,
        selectBusiness: selectManagerBusiness,
        recover: recoverManagerPassword,
    },
    staff: {
        pair: pairStaffDevice,
        roster: staffRoster,
        start: startStaffSession,
        /** Telefonu işletmeden çıkarır; yeniden bağlamak için yeni kod gerekir. */
        unlinkDevice: async () => {
            await tokens.clearDevice();
            await tokens.clearStaff();
            await clearProfile();
            return done({ target: 'welcome' as const });
        },
    },
    biometric: {
        available: biometricAvailable,
        enable: () => setBiometric(true),
        skip: () => setBiometric(false),
        authenticate: authenticateBiometric,
    },
    resume: { get: resumeSession, signOut },
} as const;
