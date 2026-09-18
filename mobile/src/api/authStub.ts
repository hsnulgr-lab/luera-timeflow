// GEÇİCİ. Sunucu bağlandığında bu dosya SİLİNECEK ve çağrılar
// src/api/staff.ts içindeki auth.roster / auth.start ile
// Supabase oturumuna bağlanacak. Ekranların hiçbiri kimlik
// doğrulaması yapmaz; yalnız buradan cevap bekler.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';

import { isValidEmail, normalizeEmail, passwordRuleState } from '../lib/authValidation';
import { pinProblem } from '../lib/pinRules';

export type AuthActor = 'manager' | 'staff';

export interface AuthBusiness {
    id: string;
    name: string;
    location: string;
    initials: string;
    staffCount: number;
    subscriptionStatus: 'active' | 'expired';
    sector?: string;
}

export interface AuthProfile {
    id: string;
    actor: AuthActor;
    initials: string;
    name: string;
    title?: string;
    email?: string;
    business: AuthBusiness;
}

export interface AuthSession {
    token: string;
    actor: AuthActor;
    profile: AuthProfile;
    biometricEnabled: boolean;
}

/**
 * Apple Eşiği · C — kapalı kapının bilgisi.
 *
 * Yalnız DURUM ve AD: plan, tutar, ödeme yok (App Store 3.1.3(f)). `until`
 * sunucu biliyorsa dolu; süresiz ya da satırı olmayan işletmede `null` ve
 * ekran tarih YAZMIYOR. `open` "Durumu yenile"nin cevabı.
 */
export interface LockedDoor {
    actor: AuthActor;
    businessName: string;
    until: string | null;
    open: boolean;
}

export interface AuthAccountOverview {
    session: AuthSession;
    businesses: AuthBusiness[];
}

export type AuthAccountExitTarget = 'welcome';

export interface AuthAccountExit {
    target: AuthAccountExitTarget;
}

export interface AuthAccountBusinessSwitch {
    businesses: AuthBusiness[];
}

export interface AuthAccountDeletionRequest {
    reauthRequired: true;
}

export interface AuthAccountDeletionConfirmation {
    target: 'welcome';
}

export interface StaffRosterMember {
    id: string;
    initials: string;
    name: string;
    role: string;
    /**
     * Şifresi var mı (099). `false` ise giriş yerine şifre BELİRLEME açılır.
     * Yoksa (eski kayıt) `true` sayılır.
     */
    hasPin?: boolean;
}

/** "Burada çalışıyorum" kapısı nereye açılıyor (099). */
export type StaffEntry = 'pin' | 'who' | 'pair';

export type LaunchState =
    | { target: 'welcome' }
    | { target: 'staffRoster' }
    /** Telefon bağlı ve kim olduğu biliniyor: yalnız şifre (099). */
    | { target: 'staffPin' }
    /**
     * Müdürün Supabase oturumu cihazda DURUYOR ama profil kaydı yok — salon
     * ekranı oturumdan profili yeniden kurar, şifre sorulmaz.
     */
    | { target: 'managerBusiness' }
    | { target: 'resume'; session: AuthSession };

export type AuthErrorCode =
    | 'offline'
    | 'biometric_unavailable'
    | 'email_in_use'
    | 'incomplete_signup'
    /**
     * Kullanıcı açıldı ama oturum gelmedi: sunucu e-posta doğrulaması
     * istiyor. Kişi postasındaki bağlantıya dokunmadan içeri giremez.
     */
    | 'email_confirmation_required'
    | 'invalid_business'
    | 'invalid_credentials'
    | 'expired_pair_code'
    | 'invalid_pair_code'
    | 'invalid_pin'
    | 'locked'
    | 'no_session'
    | 'not_paired'
    | 'staff_not_found'
    | 'subscription_inactive'
    // 099 · ekip kodu ve personelin kendi şifresi
    /** Kod doğru yazıldı ama kapanmış (kullanıldı ya da yenisi üretildi). */
    | 'used_pair_code'
    /** Bu personelin şifresi yok — şifre belirleme ekranı açılır. */
    | 'pin_not_set'
    /** Şifre belirlenirken başkası (başka telefon) önce davrandı. */
    | 'pin_already_set'
    /** 0000, 1234 gibi herkesin ilk denediği şifre. */
    | 'weak_pin'
    /** Yeni şifre eskisiyle aynı. */
    | 'same_pin';

export interface AuthFailure {
    ok: false;
    error: AuthErrorCode;
    remainingAttempts?: number;
    lockedUntil?: number;
}

export type AuthResult<T> = { ok: true; data: T } | AuthFailure;

interface DemoManager extends Omit<AuthProfile, 'actor' | 'business'> {
    password: string;
    businessIds: string[];
}

interface StoredManager extends DemoManager {
    businesses: AuthBusiness[];
}

interface DemoStaff extends StaffRosterMember {
    pin: string;
}

interface PairedDevice {
    token: string;
    businessId: string;
}

interface PendingManager {
    managerId: string;
}

interface PendingStaff {
    businessId: string;
    staffId: string;
}

interface PendingSignup {
    email?: string;
    password?: string;
    businessName?: string;
    sector?: string;
}

interface PendingAccountDeletion {
    managerId: string;
    requestedAt: number;
}

export interface SignupDraft {
    email?: string;
    businessName?: string;
    sector?: string;
}

export interface SignupSector {
    id: string;
    label: string;
}

interface AttemptState {
    failures: number;
    lockedUntil?: number;
}

const storageKeys = {
    session: 'tf.auth.stub.session',
    pairedDevice: 'tf.auth.stub.device',
    pendingManager: 'tf.auth.stub.manager',
    pendingStaff: 'tf.auth.stub.staff',
    pendingSignup: 'tf.auth.stub.signup',
    pendingAccountDeletion: 'tf.auth.stub.account-deletion',
    createdManager: 'tf.auth.stub.created-manager',
    managerAttempts: 'tf.auth.stub.manager-attempts',
    staffAttempts: 'tf.auth.stub.staff-attempts',
} as const;

const MANAGER_MAX_ATTEMPTS = 4;
const STAFF_MAX_ATTEMPTS = 3;
const LOCK_MS = 15 * 60 * 1000;
const MANAGER_RESEND_DELAY_MS = 60 * 1000;
const DEMO_PAIR_CODE = '123456';
const DEMO_EXPIRED_CODE = '000000';
const DEMO_LOCKED_CODE = '999999';
const DEMO_OWNER_PHONE = '+905321110402';

const businesses: AuthBusiness[] = [
    {
        id: 'studio-ayla-kadikoy',
        name: 'Studio Ayla',
        location: 'Kadıköy',
        initials: 'SA',
        staffCount: 6,
        subscriptionStatus: 'active',
    },
    {
        id: 'ayla-beauty-bebek',
        name: 'Ayla Beauty Bebek',
        location: 'Bebek',
        initials: 'AB',
        staffCount: 3,
        subscriptionStatus: 'active',
    },
    {
        id: 'ayla-klinik-nisantasi',
        name: 'Ayla Klinik',
        location: 'Nişantaşı',
        initials: 'AK',
        staffCount: 4,
        subscriptionStatus: 'expired',
    },
];

const managers: DemoManager[] = [
    {
        id: 'ayla-demir',
        initials: 'AD',
        name: 'Ayla Demir',
        email: 'ayla@studioayla.com',
        password: 'Luera2026',
        businessIds: businesses.map((business) => business.id),
    },
];

const staffByBusiness: Record<string, DemoStaff[]> = {
    'studio-ayla-kadikoy': [
        { id: 'merve', initials: 'MK', name: 'Merve Kaya', role: 'Kuaför', pin: '1234' },
        { id: 'selin', initials: 'SB', name: 'Selin Boz', role: 'Estetisyen', pin: '1234' },
        { id: 'emre', initials: 'EY', name: 'Emre Yıldız', role: 'Berber', pin: '1234' },
        { id: 'hande', initials: 'HA', name: 'Hande Arslan', role: 'Manikürist', pin: '1234' },
    ],
    'ayla-klinik-nisantasi': [
        { id: 'derya', initials: 'DK', name: 'Derya Kılıç', role: 'Hemşire', pin: '1234' },
    ],
};

const demoDevice: PairedDevice = {
    token: 'stub-device-token',
    businessId: 'studio-ayla-kadikoy',
};

/*
 * Anahtarlar MASAÜSTÜNÜN anahtarları (`src/lib/sectorProfiles.ts`). Burada bir
 * süre `klinik`, `dovme`, `diger` yazıyordu; masaüstü bunları tanımıyor ve
 * `genel` panele düşürüyor. Etiket kullanıcının dilinde, anahtar sistemin.
 */
const signupSectors: SignupSector[] = [
    { id: 'kuafor', label: 'Kuaför' },
    { id: 'guzellik', label: 'Güzellik' },
    { id: 'dis', label: 'Diş' },
    { id: 'saglik', label: 'Klinik' },
    { id: 'tattoo', label: 'Dövme' },
    { id: 'restoran', label: 'Restoran' },
    { id: 'genel', label: 'Diğer' },
];

const success = <T>(data: T): AuthResult<T> => ({ ok: true, data });
const failure = (
    error: AuthErrorCode,
    details: Pick<AuthFailure, 'remainingAttempts' | 'lockedUntil'> = {},
): AuthFailure => ({ ok: false, error, ...details });

async function readJson<T>(key: string): Promise<T | null> {
    try {
        const stored = await AsyncStorage.getItem(key);
        return stored ? JSON.parse(stored) as T : null;
    } catch {
        return null;
    }
}

async function writeJson(key: string, value: unknown): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
}

const businessById = (id: string) => businesses.find((business) => business.id === id);

async function storedManager(): Promise<StoredManager | null> {
    return readJson<StoredManager>(storageKeys.createdManager);
}

async function managerById(id: string): Promise<DemoManager | StoredManager | undefined> {
    const builtIn = managers.find((candidate) => candidate.id === id);
    if (builtIn) return builtIn;
    const created = await storedManager();
    return created?.id === id ? created : undefined;
}

function managerBusinessChoices(manager: DemoManager | StoredManager): AuthBusiness[] {
    if ('businesses' in manager) return manager.businesses.map((business) => ({ ...business }));
    return manager.businessIds
        .map((id) => businessById(id))
        .filter((business): business is AuthBusiness => Boolean(business));
}

function publicRoster(member: DemoStaff): StaffRosterMember {
    return {
        id: member.id,
        initials: member.initials,
        name: member.name,
        role: member.role,
    };
}

function sessionToken(actor: AuthActor, identityId: string): string {
    return `stub-${actor}-session-${identityId}`;
}

async function saveSession(profile: AuthProfile): Promise<AuthSession> {
    const session: AuthSession = {
        token: sessionToken(profile.actor, profile.id),
        actor: profile.actor,
        profile,
        biometricEnabled: false,
    };
    await writeJson(storageKeys.session, session);
    return session;
}

async function readSession(): Promise<AuthSession | null> {
    const session = await readJson<AuthSession>(storageKeys.session);
    if (!session?.token || !session.profile) return null;
    return session.actor ? session : { ...session, actor: session.profile.actor };
}

async function failedAttempt(key: string, maxAttempts: number): Promise<AuthFailure> {
    const now = Date.now();
    const current = await readJson<AttemptState>(key) ?? { failures: 0 };

    if (current.lockedUntil && current.lockedUntil > now) {
        return failure('locked', { remainingAttempts: 0, lockedUntil: current.lockedUntil });
    }

    const failures = (current.lockedUntil ? 0 : current.failures) + 1;
    const remainingAttempts = Math.max(0, maxAttempts - failures);
    const lockedUntil = remainingAttempts === 0 ? now + LOCK_MS : undefined;
    await writeJson(key, { failures, lockedUntil } satisfies AttemptState);

    return failure(lockedUntil ? 'locked' : 'invalid_credentials', {
        remainingAttempts,
        lockedUntil,
    });
}

async function clearAttempts(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
}

/**
 * Kimlik sunucudan doğrulanır; bağlantı yoksa DENENMEZ.
 *
 * Bu tek kontrol, sunucuya gidecek her çağrının önünde durur. Yanlış PIN
 * sayacının çevrimdışıyken artmaması da buna bağlı: `failedAttempt` çağrılmadan
 * önce dönülüyor, yoksa metroda uygulamayı açan personel kendini kilitlerdi.
 *
 * `isInternetReachable === null` çevrimdışı SAYILMAZ — bilinmezliği arıza gibi
 * göstermek, sorunsuz çalışan bir salonda girişi kilitlemek olurdu. Aynı kural
 * `src/lib/connectivity.ts` içindeki bant için de geçerli.
 */
async function offline(): Promise<boolean> {
    try {
        const state = await Network.getNetworkStateAsync();
        return state.isConnected === false || state.isInternetReachable === false;
    } catch {
        return false;
    }
}

export async function getLaunchState(): Promise<LaunchState> {
    const session = await readSession();
    if (session) return { target: 'resume', session };
    const device = await readJson<PairedDevice>(storageKeys.pairedDevice);
    return device ? { target: 'staffRoster' } : { target: 'welcome' };
}

async function managerStart(email: string, password: string): Promise<AuthResult<{
    managerId: string;
    businesses: AuthBusiness[];
}>> {
    if (await offline()) return failure('offline');
    const normalizedEmail = normalizeEmail(email);
    const created = await storedManager();
    const manager = managers.find((candidate) => candidate.email === normalizedEmail)
        ?? (created?.email === normalizedEmail ? created : undefined);
    const attemptKey = `${storageKeys.managerAttempts}:${normalizedEmail || 'empty'}`;
    const attempts = await readJson<AttemptState>(attemptKey);

    if (attempts?.lockedUntil && attempts.lockedUntil > Date.now()) {
        return failure('locked', { remainingAttempts: 0, lockedUntil: attempts.lockedUntil });
    }
    if (!manager || manager.password !== password) {
        return failedAttempt(attemptKey, MANAGER_MAX_ATTEMPTS);
    }

    await clearAttempts(attemptKey);
    await writeJson(storageKeys.pendingManager, { managerId: manager.id } satisfies PendingManager);
    return success({
        managerId: manager.id,
        businesses: managerBusinessChoices(manager),
    });
}

async function managerPrefill(): Promise<{ email: string; password: string }> {
    const session = await readSession();
    const created = await storedManager();
    const manager = session?.actor === 'manager' && created?.id === session.profile.id
        ? created
        : managers[0];
    return {
        email: manager?.email ?? '',
        password: manager?.password ?? '',
    };
}

async function managerBusinesses(): Promise<AuthResult<AuthBusiness[]>> {
    const pending = await readJson<PendingManager>(storageKeys.pendingManager);
    const manager = pending ? await managerById(pending.managerId) : undefined;
    if (!manager) return failure('no_session');

    return success(managerBusinessChoices(manager));
}

async function selectManagerBusiness(businessId: string): Promise<AuthResult<AuthSession>> {
    const pending = await readJson<PendingManager>(storageKeys.pendingManager);
    const manager = pending ? await managerById(pending.managerId) : undefined;
    if (!manager) return failure('no_session');
    const business = managerBusinessChoices(manager)
        .find((candidate) => candidate.id === businessId);
    if (!business || !manager.businessIds.includes(business.id)) return failure('invalid_business');

    const session = await saveSession({
        id: manager.id,
        actor: 'manager',
        initials: manager.initials,
        name: manager.name,
        email: manager.email,
        business,
    });
    await AsyncStorage.removeItem(storageKeys.pendingManager);
    // Kimlik doğruydu, oturum açıldı; kapıyı indiren abonelik. Sunucu da böyle
    // davranıyor: session.start başarılı, sonraki her çağrı 403.
    if (business.subscriptionStatus === 'expired') return failure('subscription_inactive');
    return success(session);
}

async function recoverManagerPassword(email: string): Promise<AuthResult<{
    sent: true;
    email: string;
    resendAvailableAt: number;
}>> {
    if (await offline()) return failure('offline');
    // Hesabın varlığını sızdırmamak için stub da her e-postaya aynı cevabı verir.
    return success({
        sent: true,
        email: normalizeEmail(email),
        resendAvailableAt: Date.now() + MANAGER_RESEND_DELAY_MS,
    });
}

/**
 * Kodu üreten kişi. Süresi dolan kodda personelin arayacağı tek kişi odur;
 * uygulamadan kod istenemez, `device.code.create` yalnız sahibin oturumuyla
 * çalışır.
 */
async function pairOwnerContact(): Promise<{ name: string; title: string; phone: string }> {
    const created = await storedManager();
    const owner = created ?? managers[0];
    return { name: owner.name, title: 'İşletme sahibi', phone: DEMO_OWNER_PHONE };
}

async function pairStaffDevice(code: string): Promise<AuthResult<{ business: AuthBusiness; staffId: string | null }>> {
    if (await offline()) return failure('offline');
    const digits = code.replace(/\D/g, '');
    // Süresi dolmuş kod, yanlış koddan AYRI bir hâldir: çözümü kullanıcıda değil,
    // işletme sahibinde. Aynı hatayı vermek onu aynı kodu tekrar yazmaya iterdi.
    if (digits === DEMO_EXPIRED_CODE) return failure('expired_pair_code');
    if (digits !== DEMO_PAIR_CODE && digits !== DEMO_LOCKED_CODE) return failure('invalid_pair_code');
    const device = digits === DEMO_LOCKED_CODE
        ? { token: 'stub-device-token-locked', businessId: 'ayla-klinik-nisantasi' }
        : demoDevice;
    const business = businessById(device.businessId);
    if (!business) return failure('invalid_business');

    await writeJson(storageKeys.pairedDevice, device);
    await AsyncStorage.removeItem(storageKeys.pendingStaff);
    // Demo kodu işletmeye bağlıdır, personele değil: liste adımı çalışır.
    return success({ business, staffId: null });
}

async function staffRoster(): Promise<AuthResult<{
    business: AuthBusiness;
    staff: StaffRosterMember[];
}>> {
    const device = await readJson<PairedDevice>(storageKeys.pairedDevice);
    const business = device ? businessById(device.businessId) : undefined;
    if (!device || !business) return failure('not_paired');

    return success({
        business,
        staff: (staffByBusiness[business.id] ?? []).map(publicRoster),
    });
}

async function selectStaff(staffId: string): Promise<AuthResult<StaffRosterMember>> {
    const device = await readJson<PairedDevice>(storageKeys.pairedDevice);
    const business = device ? businessById(device.businessId) : undefined;
    if (!device || !business) return failure('not_paired');

    const member = (staffByBusiness[business.id] ?? []).find((candidate) => candidate.id === staffId);
    if (!member) return failure('staff_not_found');

    await writeJson(storageKeys.pendingStaff, {
        businessId: business.id,
        staffId: member.id,
    } satisfies PendingStaff);
    return success(publicRoster(member));
}

async function pendingStaff(): Promise<AuthResult<{
    business: AuthBusiness;
    member: StaffRosterMember;
}>> {
    const pending = await readJson<PendingStaff>(storageKeys.pendingStaff);
    const device = await readJson<PairedDevice>(storageKeys.pairedDevice);
    const business = device ? businessById(device.businessId) : undefined;
    if (!device || !business) return failure('not_paired');
    if (!pending || pending.businessId !== business.id) return failure('staff_not_found');

    const member = (staffByBusiness[business.id] ?? [])
        .find((candidate) => candidate.id === pending.staffId);
    if (!member) return failure('staff_not_found');
    return success({ business, member: publicRoster(member) });
}

async function startStaffSession(pin: string): Promise<AuthResult<AuthSession>> {
    if (await offline()) return failure('offline');
    const selected = await pendingStaff();
    if (!selected.ok) return selected;
    const { business } = selected.data;
    const member = (staffByBusiness[business.id] ?? [])
        .find((candidate) => candidate.id === selected.data.member.id);
    if (!member) return failure('staff_not_found');

    const attemptKey = `${storageKeys.staffAttempts}:${business.id}:${member.id}`;
    const attempts = await readJson<AttemptState>(attemptKey);
    if (attempts?.lockedUntil && attempts.lockedUntil > Date.now()) {
        return failure('locked', { remainingAttempts: 0, lockedUntil: attempts.lockedUntil });
    }
    if (member.pin !== pin) {
        const failed = await failedAttempt(attemptKey, STAFF_MAX_ATTEMPTS);
        return failed.error === 'invalid_credentials'
            ? { ...failed, error: 'invalid_pin' }
            : failed;
    }

    await clearAttempts(attemptKey);
    const session = await saveSession({
        id: member.id,
        actor: 'staff',
        initials: member.initials,
        name: member.name,
        title: member.role,
        business,
    });
    await AsyncStorage.removeItem(storageKeys.pendingStaff);
    if (business.subscriptionStatus === 'expired') return failure('subscription_inactive');
    return success(session);
}

/**
 * Stub'da her demo personelin şifresi var: ilk şifre akışı canlıda gerçek.
 * Burada yalnız kural ve giriş çalışıyor — tasarım turu için yeterli.
 */
async function setupStaffPin(pin: string): Promise<AuthResult<AuthSession>> {
    const problem = pinProblem(pin);
    if (problem) return failure(problem === 'weak' ? 'weak_pin' : 'invalid_pin');
    return failure('pin_already_set');
}

async function changeStaffPin(currentPin: string, nextPin: string): Promise<AuthResult<AuthSession>> {
    if (await offline()) return failure('offline');
    const problem = pinProblem(nextPin);
    if (problem) return failure(problem === 'weak' ? 'weak_pin' : 'invalid_pin');
    if (currentPin === nextPin) return failure('same_pin');
    const session = await readSession();
    if (!session || session.actor !== 'staff') return failure('no_session');
    const member = (staffByBusiness[session.profile.business.id] ?? [])
        .find((candidate) => candidate.id === session.profile.id);
    if (!member || member.pin !== currentPin) return failure('invalid_pin');
    return success(session);
}

async function staffEntry(): Promise<StaffEntry> {
    const device = await readJson<PairedDevice>(storageKeys.pairedDevice);
    if (!device) return 'pair';
    return (await readJson<PendingStaff>(storageKeys.pendingStaff)) ? 'pin' : 'who';
}

async function setBiometric(enabled: boolean): Promise<AuthResult<AuthSession>> {
    const session = await readSession();
    if (!session) return failure('no_session');

    const next = { ...session, biometricEnabled: enabled };
    await writeJson(storageKeys.session, next);
    return success(next);
}

async function authenticateBiometric(): Promise<AuthResult<AuthSession>> {
    const session = await readSession();
    if (!session) return failure('no_session');
    return session.biometricEnabled ? success(session) : failure('biometric_unavailable');
}

async function resumeSession(): Promise<AuthResult<AuthSession>> {
    const session = await readSession();
    if (!session) return failure('no_session');
    // Abonelik oturum açıldıktan SONRA da bitebilir; dönüş girişinde tekrar
    // bakılır. Sunucudaki checkAccess her istekte çalıştığı için aynısı.
    const business = businessById(session.profile.business.id) ?? session.profile.business;
    if (business.subscriptionStatus === 'expired') return failure('subscription_inactive');
    return success(session);
}

/** Giriş 15d/15e için kimlik: oturum açıldı ama kapı inik. */
async function lockedSubscription(): Promise<AuthResult<LockedDoor>> {
    const session = await readSession();
    if (!session) return failure('no_session');
    return success({
        actor: session.actor,
        businessName: session.profile.business.name,
        until: null,
        open: session.profile.business.subscriptionStatus !== 'expired',
    });
}

async function prepareResumeFallback(): Promise<AuthResult<{ actor: AuthActor }>> {
    const session = await readSession();
    if (!session) return failure('no_session');

    if (session.actor === 'staff') {
        const device = await readJson<PairedDevice>(storageKeys.pairedDevice);
        if (!device || device.businessId !== session.profile.business.id) {
            return failure('not_paired');
        }
        const member = (staffByBusiness[device.businessId] ?? [])
            .find((candidate) => candidate.id === session.profile.id);
        if (!member) return failure('staff_not_found');
        await writeJson(storageKeys.pendingStaff, {
            businessId: device.businessId,
            staffId: member.id,
        } satisfies PendingStaff);
    }

    return success({ actor: session.actor });
}

async function accountOverview(): Promise<AuthResult<AuthAccountOverview>> {
    const session = await readSession();
    if (!session) return failure('no_session');

    const manager = session.actor === 'manager'
        ? await managerById(session.profile.id)
        : undefined;
    const associatedBusinesses = manager
        ? managerBusinessChoices(manager)
        : [session.profile.business];
    const businessesForAccount = associatedBusinesses.some(
        (business) => business.id === session.profile.business.id,
    )
        ? associatedBusinesses
        : [session.profile.business, ...associatedBusinesses];

    return success({
        session,
        businesses: businessesForAccount.map((business) => ({ ...business })),
    });
}

async function prepareAccountBusinessSwitch(): Promise<AuthResult<AuthAccountBusinessSwitch>> {
    const session = await readSession();
    if (!session || session.actor !== 'manager') return failure('no_session');

    const manager = await managerById(session.profile.id);
    if (!manager) return failure('no_session');
    const managerBusinessesForSwitch = managerBusinessChoices(manager);
    if (managerBusinessesForSwitch.length === 0) return failure('invalid_business');

    await writeJson(storageKeys.pendingManager, {
        managerId: manager.id,
    } satisfies PendingManager);
    return success({
        businesses: managerBusinessesForSwitch,
    });
}

async function accountSignOut(): Promise<AuthResult<AuthAccountExit>> {
    const session = await readSession();
    if (!session) return failure('no_session');

    if (session.actor === 'staff') {
        // Çıkış eşleşmeyi SİLMEZ (099): canlıyla aynı kural.
        await AsyncStorage.removeItem(storageKeys.session);
        return success({ target: 'welcome' });
    }

    // Müdür çıkışından sonra eski bir personel eşleşmesi açılış kararını
    // roster'a çevirmemeli; bu telefon karşılama ekranına dönmelidir.
    await AsyncStorage.multiRemove([
        storageKeys.session,
        storageKeys.pairedDevice,
        storageKeys.pendingManager,
        storageKeys.pendingStaff,
    ]);
    return success({ target: 'welcome' });
}

async function requestAccountDeletion(): Promise<AuthResult<AuthAccountDeletionRequest>> {
    const session = await readSession();
    if (!session || session.actor !== 'manager') return failure('no_session');

    // Gerçek silme bu UI turunun dışında. Bu çağrı yalnız aynı oturumdaki
    // müdürden şifreyle yeniden doğrulama gerektiğini bildirir; e-posta ya da
    // başka bir kimlik değeri dışarı verilmez.
    return success({ reauthRequired: true });
}

async function confirmAccountDeletion(
    password: string,
): Promise<AuthResult<AuthAccountDeletionConfirmation>> {
    const session = await readSession();
    if (!session || session.actor !== 'manager') return failure('no_session');

    const manager = await managerById(session.profile.id);
    if (!manager || manager.password !== password) return failure('invalid_credentials');

    const requestedAt = Date.now();
    await writeJson(storageKeys.pendingAccountDeletion, {
        managerId: manager.id,
        requestedAt,
    } satisfies PendingAccountDeletion);

    // Yalnız yerel oturum kapanır; createdManager ve işletme verileri özellikle
    // korunur. Sunucu geldiğinde bu kayıt gerçek silme talebine dönüşecektir.
    await AsyncStorage.multiRemove([
        storageKeys.session,
        storageKeys.pairedDevice,
        storageKeys.pendingManager,
        storageKeys.pendingStaff,
    ]);
    return success({
        target: 'welcome',
    });
}

async function signOut(): Promise<void> {
    await AsyncStorage.multiRemove([storageKeys.session, storageKeys.pendingManager]);
}

async function unlinkStaffDevice(): Promise<void> {
    await AsyncStorage.multiRemove([
        storageKeys.session,
        storageKeys.pairedDevice,
        storageKeys.pendingManager,
        storageKeys.pendingStaff,
    ]);
}

async function createSignupAccount(email: string, _password: string): Promise<AuthResult<{ email: string }>> {
    if (await offline()) return failure('offline');
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail) || !passwordRuleState(_password).valid) {
        return failure('incomplete_signup');
    }
    const created = await storedManager();
    if (managers.some((manager) => manager.email === normalizedEmail)
        || created?.email === normalizedEmail) return failure('email_in_use');

    const next: PendingSignup = { email: normalizedEmail, password: _password };
    await writeJson(storageKeys.pendingSignup, next);
    return success({ email: normalizedEmail });
}

async function saveSignupBusiness(businessName: string): Promise<AuthResult<{ businessName: string }>> {
    const pending = await readJson<PendingSignup>(storageKeys.pendingSignup);
    const normalizedName = businessName.trim();
    if (!pending?.email || !pending.password || !normalizedName) {
        return failure('incomplete_signup');
    }

    const next: PendingSignup = {
        email: pending.email,
        password: pending.password,
        businessName: normalizedName,
    };
    await writeJson(storageKeys.pendingSignup, next);
    return success({ businessName: normalizedName });
}

async function selectSignupSector(sector: string): Promise<AuthResult<{ sector: string }>> {
    const pending = await readJson<PendingSignup>(storageKeys.pendingSignup);
    if (!pending?.email || !pending.businessName) return failure('incomplete_signup');

    const selected = signupSectors.find((candidate) => candidate.id === sector);
    if (!selected) return failure('incomplete_signup');
    const next = { ...pending, sector: selected.id };
    await writeJson(storageKeys.pendingSignup, next);
    return success({ sector });
}

function initialsFor(label: string): string {
    return label
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toLocaleUpperCase('tr-TR') ?? '')
        .join('');
}

async function completeSignup(): Promise<AuthResult<AuthSession>> {
    const pending = await readJson<PendingSignup>(storageKeys.pendingSignup);
    if (!pending?.email || !pending.password || !pending.businessName || !pending.sector) {
        return failure('incomplete_signup');
    }

    const business: AuthBusiness = {
        id: `stub-signup-${pending.businessName.toLocaleLowerCase('tr-TR').replace(/\s+/g, '-')}`,
        name: pending.businessName,
        location: 'Konum eklenmedi',
        initials: initialsFor(pending.businessName),
        staffCount: 1,
        subscriptionStatus: 'active',
        sector: pending.sector,
    };
    const ownerName = pending.email.split('@')[0] || pending.businessName;
    const session = await saveSession({
        id: 'stub-signup-manager',
        actor: 'manager',
        initials: initialsFor(ownerName),
        name: ownerName,
        email: pending.email,
        business,
    });
    await writeJson(storageKeys.createdManager, {
        id: 'stub-signup-manager',
        initials: initialsFor(ownerName),
        name: ownerName,
        email: pending.email,
        password: pending.password,
        businessIds: [business.id],
        businesses: [business],
    } satisfies StoredManager);
    await AsyncStorage.removeItem(storageKeys.pendingSignup);
    return success(session);
}

async function signupDraft(): Promise<AuthResult<SignupDraft>> {
    const pending = await readJson<PendingSignup>(storageKeys.pendingSignup);
    return pending ? success({
        email: pending.email,
        businessName: pending.businessName,
        sector: pending.sector,
    }) : failure('incomplete_signup');
}

async function availableSignupSectors(): Promise<SignupSector[]> {
    return signupSectors.map((sector) => ({ ...sector }));
}

/**
 * Ekranların kullanacağı tek geçici kimlik yüzeyi. Bu nesnenin dışındaki UI
 * dosyaları demo PIN, e-posta, personel ya da işletme verisi taşımaz.
 */
export const authStub = {
    getLaunchState,
    manager: {
        prefill: managerPrefill,
        start: managerStart,
        businesses: managerBusinesses,
        selectBusiness: selectManagerBusiness,
        recover: recoverManagerPassword,
    },
    staff: {
        pair: pairStaffDevice,
        owner: pairOwnerContact,
        roster: staffRoster,
        select: selectStaff,
        pending: pendingStaff,
        start: startStaffSession,
        setupPin: setupStaffPin,
        changePin: changeStaffPin,
        entry: staffEntry,
        unlinkDevice: unlinkStaffDevice,
    },
    biometric: {
        enable: () => setBiometric(true),
        skip: () => setBiometric(false),
        authenticate: authenticateBiometric,
    },
    subscription: {
        locked: lockedSubscription,
    },
    resume: {
        get: resumeSession,
        prepareFallback: prepareResumeFallback,
        signOut,
    },
    account: {
        get: accountOverview,
        prepareBusinessSwitch: prepareAccountBusinessSwitch,
        setBiometric,
        signOut: accountSignOut,
        requestDeletion: requestAccountDeletion,
        confirmDeletion: confirmAccountDeletion,
    },
    signup: {
        draft: signupDraft,
        sectors: availableSignupSectors,
        account: createSignupAccount,
        business: saveSignupBusiness,
        sector: selectSignupSector,
        complete: completeSignup,
    },
} as const;
