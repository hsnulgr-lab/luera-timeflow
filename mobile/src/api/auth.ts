import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../lib/supabase';
import {
    ApiError, api as staffCalls, auth as staffApi, tokens,
} from './staff';
import { forgetIntent } from '../lib/pushIntent.ts';
import { forgetDeviceId } from '../lib/pushDevice.ts';
import { unregisterManagerPush, unregisterPush } from '../lib/push.ts';
import type {
    AuthAccountBusinessSwitch, AuthAccountDeletionConfirmation, AuthAccountDeletionRequest,
    AuthAccountExit, AuthAccountOverview, AuthBusiness, AuthFailure, AuthLoginMethod, AuthLoginProvider,
    AuthProfile, AuthResult, AuthSession, CodeSent, LaunchState, LockedDoor, SignupAccountResult,
    SignupDraft, SignupSector, SocialBridge, SocialProvider, SocialSignIn, StaffEntry, StaffRosterMember,
    TeamEndResult,
} from './authStub';
import { appleAvailable, appleCredential, googleCredential } from '../lib/socialAuth';
import { dropLoginNotice } from '../lib/loginNotice';
import { isValidEmail, passwordRuleState } from '../lib/authValidation.ts';
import { pinProblem } from '../lib/pinRules.ts';
import { staffRoleLabel } from '../lib/staffRoleLabel.ts';
import { deleteAccount } from './accountDeletion';
import {
    businessesOf, type OrgRow, type SettingsSectorRow,
} from '../lib/accountMap.ts';

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
 * Abonelik akışı burada yok ve mobilde OLMAYACAK: uygulamada fiyat, plan ya
 * da satın alma çağrısı geçmiyor (App Store 3.1.3(f) — ücretli web aracının
 * ücretsiz refakatçisi). O parça `authStub` üzerinde duruyor.
 */

const fail = (error: AuthFailure['error'], extra: Partial<AuthFailure> = {}): AuthFailure =>
    ({ ok: false, error, ...extra });
const done = <T>(data: T): AuthResult<T> => ({ ok: true, data });

/** "Yeniden gönder"in kapalı kaldığı süre — giriş servisinin e-posta sınırı (60 sn). */
const RESEND_MS = 60_000;

/**
 * Kilidin BİTİŞ ANI.
 *
 * Sunucu aynı şeyi iki ağızdan söylüyor: PIN kilidinde mutlak an (`until`),
 * eşleştirme kilidinde kalan süre (`minutes`). Ekranların ikisini de bilmesi
 * gerekmiyor — sınırda tek biçime, bitiş anına indirgeniyor.
 *
 * Hiçbiri gelmediyse alan BOŞ bırakılıyor, uydurulmuyor: ekran o zaman sayaç
 * çizmeyip yalnız "kilitlendi" der. Yanlış bir geri sayım, hiç sayaç
 * olmamasından kötüdür — biter ve kilit bitmez.
 */
function lockDeadline(e: ApiError): Partial<AuthFailure> {
    const until = e.until ? Date.parse(e.until) : Number.NaN;
    if (Number.isFinite(until)) return { lockedUntil: until };
    const minutes = e.minutes;
    if (minutes !== null && minutes > 0) return { lockedUntil: Date.now() + minutes * 60_000 };
    return {};
}

/** Ağ hatası mı, sunucunun konuştuğu bir hata mı? İkisi farklı ekranlar açar. */
function mapError(e: unknown): AuthFailure {
    if (!(e instanceof ApiError)) return fail('offline');
    switch (e.code) {
        case 'expired_pair_code': return fail('expired_pair_code');
        case 'invalid_pair_code': return fail('invalid_pair_code');
        case 'used_pair_code': return fail('used_pair_code');
        case 'pin_not_set': return fail('pin_not_set');
        case 'pin_already_set': return fail('pin_already_set');
        case 'weak_pin': return fail('weak_pin');
        case 'same_pin': return fail('same_pin');
        // Oturum başka yerden düştü (şifre sıfırlandı, personel pasif).
        case 'revoked': return fail('no_session');
        case 'subscription_inactive': return fail('subscription_inactive');
        case 'device_token_required':
        case 'invalid_token': return fail('not_paired');
        case 'staff_not_found': return fail('staff_not_found');
        // Kilit SÜRESİYLE birlikte taşınıyor. Süre atıldığında ekranlar
        // kilitli hâli sıradan bir başarısızlıktan ayıramıyordu: eşleştirme
        // "bu kod eşleşmedi" diyordu (kod doğruyken), PIN ekranı ise geri
        // sayımı hiç çizemiyordu çünkü `lockedUntil` her zaman boştu.
        case 'locked':
        case 'pair_locked': return fail('locked', lockDeadline(e));
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
    await AsyncStorage.setItem(K_PROFILE, JSON.stringify({ profile, biometricEnabled }));
}

async function readProfile(): Promise<{ profile: AuthProfile; biometricEnabled: boolean } | null> {
    try {
        const raw = await AsyncStorage.getItem(K_PROFILE);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

async function clearProfile(): Promise<void> {
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

/**
 * Müdürün salonları — ad, KONUM (adresten), aktif personel SAYISI, sektör.
 *
 * Önce `slug` konum diye yazılıyordu ve personel sayısı her salonda 0'dı:
 * salon seçme ekranı "studio-ayla-kadikoy · 0 personel" diyordu. Üç sorgu
 * RLS'in açtığı org'larla sınırlı; biri okunamazsa liste UYDURULMUYOR.
 */
async function managerBusinesses(): Promise<AuthResult<AuthBusiness[]>> {
    const { data, error } = await supabase
        .from('organizations')
        .select('id, name, address, owner_id, solo')
        .order('name')
        .returns<OrgRow[]>();
    if (error) {
        /*
         * SEBEP KONSOLA DÜŞÜYOR — bu yol müdür girişinin ANA yolu.
         *
         * Her hata burada `offline`a çevriliyor ve ekran "bağlantı yok"
         * diyor. Ağ gerçekten yoksa doğru; ama şema eksikse (örneğin 108
         * göçü çalıştırılmadan bu sürüm açılırsa) `solo` kolonu bulunamaz,
         * PostgREST 400 döner ve kullanıcı ONLINE olduğu hâlde "bağlantı
         * yok" görür. Sebep hiçbir yere yazılmazsa `--no-dev` ile elle
         * kazılana kadar bulunamaz — 2026-09-25'te tam bu olmuştu
         * (bkz. `app/index.tsx`).
         */
        console.error('[giriş] salon listesi okunamadı:', error.message);
        return fail('offline');
    }
    const orgs = data ?? [];
    const ids = orgs.map((org) => org.id);
    if (ids.length === 0) return done([]);
    const [staff, settings] = await Promise.all([
        supabase.from('staff').select('organization_id')
            .in('organization_id', ids).eq('is_active', true)
            .returns<{ organization_id: string }[]>(),
        supabase.from('settings').select('organization_id, user_id, sector, created_at, business_name')
            .in('organization_id', ids)
            .returns<SettingsSectorRow[]>(),
    ]);
    if (staff.error || settings.error) return fail('offline');
    return done(businessesOf(orgs, staff.data ?? [], settings.data ?? []));
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

/**
 * B1'de yazılan e-posta — S1'e ("Yeni şifre belirleyin") hazır gelsin diye.
 *
 * Yalnız bellekte: şifre hiç tutulmuyor, e-posta da diske yazılmıyor. Giriş
 * formu soğuk açılışta BOŞ (v4 · B1). Bu alan canlıda yoktu ve form stub'ın
 * demo hesabıyla dolu açılıyordu — canlı kipte `prefill` stub'a düşüyordu.
 */
let typedEmail = '';

async function managerPrefill(): Promise<{ email: string; password: string }> {
    return { email: typedEmail, password: '' };
}

function rememberTypedEmail(email: string): void {
    typedEmail = email.trim();
}

/**
 * S1 · "Kod gönder" — şifre yenileme artık BAĞLANTI DEĞİL KOD (v4).
 *
 * E-posta 2026-10-18'den beri gidiyor (Resend) ve şablon yalnız 6 haneli kod
 * taşıyor: giriş servisinin iç adresi dışarıdan açılamadığı için bağlantılı
 * e-posta kırık olurdu (bkz. scripts/eposta-sablonlari.mjs).
 *
 * Hesabın varlığı SIZDIRILMAZ: var olmayan e-posta da, sınır aşımı da aynı
 * "gönderdik" cevabını alır. Yalnız ağ yoksa ekran bunu söyler.
 */
async function recoverManagerPassword(email: string): Promise<AuthResult<{
    sent: true; email: string; resendAvailableAt: number;
}>> {
    if (!supabaseConfigured) return fail('offline');
    const normalized = email.trim().toLocaleLowerCase('tr-TR');
    const { error } = await supabase.auth.resetPasswordForEmail(normalized);
    if (error && isAuthRetryableFetchError(error)) return fail('offline');
    typedEmail = normalized;
    return done({ sent: true, email: normalized, resendAvailableAt: Date.now() + RESEND_MS });
}

/** Kod adımının sunucu hatası → ekranın hâli. Yanlış ile süresi dolmuş AYRILMIYOR. */
function codeFailure(error: { message?: string; status?: number; code?: string } | null): AuthFailure {
    if (error && isAuthRetryableFetchError(error)) return fail('offline');
    if (error && (error.status === 429 || /rate|too many/i.test(error.message ?? '')
        || (error.code ?? '').startsWith('over_'))) return fail('locked');
    return fail('invalid_code');
}

/** S2 — kod tutarsa oturum açılır; şifre S3'te yazılır. */
async function verifyRecoveryCode(email: string, code: string): Promise<AuthResult<{ verified: true }>> {
    if (!supabaseConfigured) return fail('offline');
    const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLocaleLowerCase('tr-TR'), token: code, type: 'recovery',
    });
    if (error || !data.session) return codeFailure(error);
    return done({ verified: true });
}

/** Şifre yazma hatası → kod. `same_password`/`weak_password` ayrı taşınıyor. */
function passwordWriteFailure(error: { code?: string; message?: string }): AuthFailure {
    if (isAuthRetryableFetchError(error)) return fail('offline');
    if (error.code === 'same_password') return fail('same_password');
    if (error.code === 'weak_password') return fail('weak_password');
    return fail('no_session');
}

/**
 * S3 — yeni şifre. Yeniden giriş İSTENMİYOR: S2'de açılan oturumla yazılır ve
 * kişi normal girişin yolundan içeri girer (karar 5: tek işletme → Face ID
 * teklifi, çok → "Hangi işletme?"). Apple/Google hesabının hiç şifresi
 * olmayabilir; bu yol ona da İLK şifreyi verir (`password_set`, bkz. P1).
 */
async function setRecoveredPassword(password: string): Promise<AuthResult<{ businesses: AuthBusiness[] }>> {
    if (!passwordRuleState(password).valid) return fail('weak_password');
    const { error } = await supabase.auth.updateUser({ password, data: { password_set: true } });
    if (error) return passwordWriteFailure(error);
    const list = await managerBusinesses();
    if (!list.ok) return list;
    return done({ businesses: list.data });
}

// ── Giriş v4 · Apple ve Google ──────────────────────────────────────────────
/*
 * Telefonun kendi penceresi → kimlik belgesi → `signInWithIdToken`
 * (`src/lib/socialAuth.ts`). Sunucu tarafı göç 121'de: Apple/Google ile AÇILAN
 * yeni hesaba işletme kendiliğinden açılmaz; ekran sorar (B5 köprüsü) ya da
 * kayıttan gelindiyse `create_own_business` açar.
 *
 * Var olan bir e-posta hesabına Google/Apple aynı (doğrulanmış) adresle
 * gelirse giriş servisi ikisini BİRLEŞTİRİR: kişi kendi işletmelerine düşer.
 */

/** Hesabın sağlayıcıları — ilk açılan önce. */
function providersOf(user: { app_metadata?: Record<string, unknown> }): AuthLoginProvider[] {
    const meta = user.app_metadata ?? {};
    const raw = Array.isArray(meta.providers) ? meta.providers : [meta.provider];
    const known = raw.filter((p): p is AuthLoginProvider => p === 'email' || p === 'apple' || p === 'google');
    return known.length ? Array.from(new Set(known)) : ['email'];
}

function loginMethodOf(user: {
    app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown>;
}): AuthLoginMethod {
    const providers = providersOf(user);
    return {
        providers,
        hasPassword: providers.includes('email') || user.user_metadata?.password_set === true,
    };
}

async function socialAvailable(): Promise<{ apple: boolean; google: boolean }> {
    return { apple: await appleAvailable(), google: true };
}

/**
 * `onCredential` — sağlayıcının penceresi kapandı, sunucuya gidiliyor. Ekran
 * bekleme satırını ANCAK o an gösterir (B4): pencere açıkken ekranımız
 * görünmüyor.
 */
async function socialStart(
    provider: SocialProvider,
    onCredential?: () => void,
): Promise<AuthResult<SocialSignIn>> {
    if (!supabaseConfigured) return fail('offline');
    const credential = provider === 'apple' ? await appleCredential() : await googleCredential();
    if (!credential.ok) return fail(credential.reason === 'cancelled' ? 'cancelled' : 'provider_failed');
    onCredential?.();

    const { data, error } = await supabase.auth.signInWithIdToken({
        provider,
        token: credential.idToken,
        ...(credential.nonce ? { nonce: credential.nonce } : {}),
    });
    if (error || !data.user) {
        if (error && isAuthRetryableFetchError(error)) return fail('offline');
        console.error(`[giriş] ${provider} belgesi giriş servisinde reddedildi:`, error?.message);
        return fail('provider_failed');
    }
    // Apple adı YALNIZ ilk girişte verir. Saklanmazsa profil adı e-postanın
    // başından türer — Apple'ın gizli adresinde "k7x2p9mq4z" olurdu.
    if (credential.fullName && !data.user.user_metadata?.full_name) {
        await supabase.auth.updateUser({ data: { full_name: credential.fullName } }).catch(() => undefined);
    }
    const list = await managerBusinesses();
    if (!list.ok) return list;
    return done({ provider, email: data.user.email ?? '', businesses: list.data });
}

/** B5 — hangi hesapla gelindi. Oturum yoksa köprünün de anlamı yok. */
async function socialBridge(): Promise<AuthResult<SocialBridge>> {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return fail('no_session');
    const provider = providersOf(user).find((p): p is SocialProvider => p === 'apple' || p === 'google');
    if (!provider) return fail('no_session');
    return done({ provider, email: user.email ?? '' });
}

/**
 * Köprüde "Yeni işletme oluştur" ve Apple/Google ile kayıt (K3 akışı).
 *
 * Sunucu fonksiyonu zaten işletmesi olana YENİSİNİ AÇMAZ (çift dokunuş,
 * yeniden deneme). Sonra kayıt taslağı yazılır: 2/3 İşletmeniz ekranı
 * taslağa bakarak açılıyor. Kod adımı YOK — hesap Apple/Google'da doğrulandı.
 */
async function socialCreateBusiness(): Promise<AuthResult<{ email: string }>> {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return fail('no_session');
    const { error } = await supabase.rpc('create_own_business');
    if (error) {
        console.error('[giriş] create_own_business:', error.message);
        return fail('offline');
    }
    const email = user.email ?? '';
    const provider = providersOf(user).find((p): p is SocialProvider => p === 'apple' || p === 'google');
    const intent = (await readSignupDraft())?.solo;
    await writeSignupDraft({
        email,
        ...(provider ? { provider } : {}),
        ...(intent === undefined ? {} : { solo: intent }),
    });
    return done({ email });
}

/**
 * B5 · "E-postayla giriş yap" — arkadaki boş hesap kişiye anlatılmadan
 * bırakılır. Oturum kapanır; işletmesiz hesabı 24 saat sonra sunucu siler
 * (`prune_orphan_social_users`, karar 3).
 */
async function socialLeave(): Promise<void> {
    await supabase.auth.signOut().catch(() => undefined);
    await clearProfile();
    dropLoginNotice();
}

// ── Personel ────────────────────────────────────────────────────────────────

let pendingStaffId: string | null = null;

async function pairStaffDevice(code: string): Promise<AuthResult<{ business: AuthBusiness; staffId: string | null }>> {
    try {
        const data = await staffApi.redeem(code);
        await tokens.setDevice(String(data.deviceToken));
        // Yeni bağlantı: önceki kişinin kaydı bu telefonda kalmasın.
        await clearPending();
        // Kod bir personele bağlıysa "kendini seç" adımı düşer.
        pendingStaffId = data.staffId ? String(data.staffId) : null;
        return done({
            business: businessFrom({ id: String(data.orgId), name: '', slug: null }),
            staffId: pendingStaffId,
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
        /*
         * BÜTÜN aktif personel (099). Eskiden şifresi olmayan süzülüyordu ve
         * o kişi listede hiç görünmüyordu — giremiyor, sebebini de bilemiyordu.
         * Şimdi seçince şifresini kendisi belirliyor.
         */
        const sector = typeof data.business?.sector === 'string' ? data.business.sector : null;
        const staff: StaffRosterMember[] = (data.staff ?? [])
            .map((row: { id: string; name: string; role: string | null; hasPin?: boolean }) => ({
                id: row.id,
                initials: initials(row.name),
                name: row.name,
                // Anahtar ("doctor") değil, sektörün adı ("Kuaför").
                role: staffRoleLabel(row.role, sector),
                hasPin: row.hasPin !== false,
            }));
        // İşletme adı (099): "Siz kimsiniz? · Studio Ayla". Eski sunucu
        // dönmüyorsa boş kalır, uydurulmaz.
        const businessName = typeof data.business?.name === 'string' ? data.business.name : '';
        return done({
            business: businessFrom({ id: '', name: businessName, slug: null }),
            staff,
        });
    } catch (e) {
        return mapError(e);
    }
}

/** Sunucunun giriş cevabı → oturum. `session.start`, `pin.setup`, `pin.change` aynı. */
async function finishStaffLogin(data: {
    token: unknown; staff: { id: unknown; name: unknown; role?: string | null };
}): Promise<AuthSession> {
    await tokens.setStaff(String(data.token));
    const previous = await readProfile();
    const pending = await readPending();
    const profile: AuthProfile = {
        id: String(data.staff.id),
        actor: 'staff',
        initials: initials(String(data.staff.name)),
        name: String(data.staff.name),
        // Rol adı listeden (sektörlü) — sunucunun ham anahtarı değil.
        title: pending?.role || staffRoleLabel(data.staff.role, null),
        business: businessFrom({ id: '', name: pending?.businessName ?? '', slug: null }),
    };
    await saveProfile(profile, previous?.biometricEnabled ?? false);
    return sessionOf(profile, previous?.biometricEnabled ?? false);
}

/** Kalan hak sunucudan geliyorsa hataya taşınır. */
function withRemaining(e: unknown, mapped: AuthFailure): AuthFailure {
    if (e instanceof ApiError && e.remaining !== null) {
        return { ...mapped, remainingAttempts: e.remaining };
    }
    return mapped;
}

async function startStaffSession(pin: string): Promise<AuthResult<AuthSession>> {
    const device = await tokens.device();
    if (!device) return fail('not_paired');
    const staffId = await resolvePendingStaffId();
    if (!staffId) return fail('staff_not_found');
    try {
        const data = await staffApi.start(device, staffId, pin);
        return done(await finishStaffLogin(data));
    } catch (e) {
        const mapped = mapError(e);
        // Şifre sıfırlandıysa bekleyen kaydın bilgisi de düzelsin: ekran
        // şifre BELİRLEME hâline geçecek.
        if (mapped.error === 'pin_not_set') await markPendingPin(false);
        return withRemaining(e, mapped);
    }
}

/**
 * İlk şifre (099) — şifresi olmayan personel kendisi belirler ve girer.
 *
 * Kural telefonda da kontrol ediliyor (kullanıcı ağ beklemesin) ama karar
 * sunucunun: `pinRules.ts` iki tarafta aynı.
 */
async function setupStaffPin(pin: string): Promise<AuthResult<AuthSession>> {
    const problem = pinProblem(pin);
    if (problem) return fail(problem === 'weak' ? 'weak_pin' : 'invalid_pin');
    const device = await tokens.device();
    if (!device) return fail('not_paired');
    const staffId = await resolvePendingStaffId();
    if (!staffId) return fail('staff_not_found');
    try {
        const data = await staffApi.pinSetup(device, staffId, pin);
        await markPendingPin(true);
        return done(await finishStaffLogin(data));
    } catch (e) {
        const mapped = mapError(e);
        if (mapped.error === 'pin_already_set') await markPendingPin(true);
        return mapped;
    }
}

/** Personel kendi şifresini değiştirir (099). Oturum yeni token'la sürer. */
async function changeStaffPin(currentPin: string, nextPin: string): Promise<AuthResult<AuthSession>> {
    const problem = pinProblem(nextPin);
    if (problem) return fail(problem === 'weak' ? 'weak_pin' : 'invalid_pin');
    if (currentPin === nextPin) return fail('same_pin');
    try {
        const data = await staffCalls.pinChange(currentPin, nextPin);
        return done(await finishStaffLogin(data));
    } catch (e) {
        const mapped = mapError(e);
        return withRemaining(e, mapped.error === 'invalid_credentials' ? { ...mapped, error: 'invalid_pin' } : mapped);
    }
}

/**
 * "Burada çalışıyorum" kapısı nereye açılıyor (099).
 *
 * Eskiden HER ZAMAN kod ekranına gidiyordu — telefon bağlı olsa bile. Personel
 * çıkış yapıp geri geldiğinde yeniden kod istenmesinin sebebi buydu.
 */
async function staffEntry(): Promise<StaffEntry> {
    if (!(await tokens.device())) return 'pair';
    return (await readPending()) ? 'pin' : 'who';
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
    if (await tokens.device()) {
        // Telefon bağlı ve kim olduğu biliniyor → yalnız şifre (099, müdür kararı).
        return (await readPending()) ? { target: 'staffPin' } : { target: 'staffRoster' };
    }
    /*
     * MÜDÜRÜN OTURUMU DURUYOR AMA PROFİL KAYDI YOK.
     *
     * Profil tek yuvada tutuluyor (`tf.auth.profile`): aynı telefonda personel
     * girişi yapılınca müdürünkinin üzerine yazılıyor, personel çıkış yapınca
     * da yuva siliniyor. Supabase oturumu ise yerinde duruyor — ama açılış
     * yalnız yuvaya baktığı için müdür her seferinde e-posta ve şifre yazmak
     * zorunda kalıyordu.
     *
     * Salon ekranı profili oturumdan yeniden kuruyor (tek salonsa kendiliğinden
     * seçip geçiyor). Oturum gerçekten ölmüşse o ekran girişe yönlendirir —
     * yani burada "giriş var" diye bir varsayımda BULUNULMUYOR.
     */
    if (supabaseConfigured && (await supabase.auth.getSession()).data.session) {
        return { target: 'managerBusiness' };
    }
    return { target: 'welcome' };
}

/**
 * Seçilen personel — PIN ekranı kimin PIN'ini istediğini buradan biliyor.
 *
 * CANLI SÜRÜMÜ YOKTU ve istek stub'a düşüyordu: stub `pairedDevice` diye bir
 * JSON arıyor, canlıda ise cihaz token'ı Keychain'de duruyor. Sonuç
 * `not_paired` ve `who.tsx` sessizce hiçbir şey yapmıyordu — personel ada
 * dokunuyor, ekran duruyordu.
 *
 * İşletme bilgisi TAŞINMIYOR: sunucunun `roster` ucu onu dönmüyor ve
 * olmayan bir adı uydurmaktansa hiç söylememek doğru.
 */
const K_PENDING = 'tf.auth.pending-staff';

/**
 * Bu telefonun personeli — ÇIKIŞTA SİLİNMİYOR (099).
 *
 * Kişisel telefonda "kim olduğumu" her vardiyada yeniden söylemek anlamsız:
 * çıkış yapan personel geri geldiğinde doğrudan kendi şifre ekranına düşüyor.
 * Başka biriyse şifre ekranındaki "Ben değilim" listeye götürüyor.
 */
type PendingMember = StaffRosterMember & { businessName?: string };

async function writePending(member: PendingMember): Promise<void> {
    await AsyncStorage.setItem(K_PENDING, JSON.stringify(member));
}

async function readPending(): Promise<PendingMember | null> {
    try {
        const raw = await AsyncStorage.getItem(K_PENDING);
        return raw ? JSON.parse(raw) as PendingMember : null;
    } catch {
        return null;
    }
}

/** Şifre belirlendi/sıfırlandı — bekleyen kaydın `hasPin`i ekranı yönetiyor. */
async function markPendingPin(hasPin: boolean): Promise<void> {
    const pending = await readPending();
    if (pending) await writePending({ ...pending, hasPin });
}

async function clearPending(): Promise<void> {
    await AsyncStorage.removeItem(K_PENDING);
    pendingStaffId = null;
}

async function selectStaffMember(staffId: string): Promise<AuthResult<StaffRosterMember>> {
    const list = await staffRoster();
    if (!list.ok) return list;
    const member = list.data.staff.find((candidate) => candidate.id === staffId);
    if (!member) return fail('staff_not_found');
    // HER İKİSİ de yazılıyor. `pendingStaffId` bir MODÜL DEĞİŞKENİ ve
    // uygulama yeniden yüklenince kayboluyor; `startStaffSession` onu
    // okuduğu için yalnız diske yazmak yetmiyordu — PIN her seferinde
    // `staff_not_found` alıyor ve ekran kadroya geri dönüyordu.
    pendingStaffId = staffId;
    await writePending({ ...member, businessName: list.data.business.name });
    return done(member);
}

/**
 * Seçili personelin kimliği — önce bellekten, yoksa diskten.
 *
 * Bellek yeniden yüklemede sıfırlanıyor ama seçim DURUYOR: kullanıcı
 * açısından "kim olduğumu zaten söyledim" hâli uygulamanın yeniden
 * yüklenmesiyle kaybolmamalı.
 */
async function resolvePendingStaffId(): Promise<string | null> {
    if (pendingStaffId) return pendingStaffId;
    const stored = await readPending();
    if (stored) pendingStaffId = stored.id;
    return pendingStaffId;
}

async function pendingStaffMember(): Promise<AuthResult<{
    business: AuthBusiness; member: StaffRosterMember;
}>> {
    if (!(await tokens.device())) return fail('not_paired');
    const member = await readPending();
    if (!member) return fail('staff_not_found');
    // PIN ekranı açılırken de bellek tazeleniyor: yeniden yüklemeden sonra
    // ilk çağrılan yer burası.
    pendingStaffId = member.id;
    return done({ business: businessFrom({ id: '', name: member.businessName ?? '', slug: null }), member });
}

async function resumeSession(): Promise<AuthResult<AuthSession>> {
    const stored = await readProfile();
    if (!stored) return fail('no_session');
    return done(sessionOf(stored.profile, stored.biometricEnabled));
}

async function signOut(): Promise<AuthResult<{ target: 'welcome' }>> {
    const stored = await readProfile();
    /*
     * BİLDİRİM ABONELİĞİ ÖNCE KOPARILIYOR (103) — token silinmeden.
     *
     * Sıra şart: `api.pushUnregister` personel token'ını istiyor. Sonraya
     * bırakılsaydı çağrı kimliksiz kalır ve bekleyen işe düşerdi.
     *
     * ORTAK TELEFONUN kuralı bu: satır kalırsa ayrılan personelin bildirimleri
     * yeni personelin elinde çalmaya devam eder. Başarısız olursa iş bekliyor
     * ve cihaz token'ıyla tekrar deneniyor.
     */
    if (stored?.profile.actor === 'staff') await unregisterPush().catch(() => undefined);
    else if (stored?.profile.actor === 'manager') await unregisterManagerPush().catch(() => undefined);
    forgetIntent();
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

// ── Hesap ───────────────────────────────────────────────────────────────────
//
// CANLI SÜRÜMÜ YOKTU (`STUB_PARTS` içindeydi): canlı kipte "Hesap" satırı
// stub'a gidiyor, stub başka bir depolama anahtarında oturum arıyor, bulamayıp
// müdürü KARŞILAMA EKRANINA atıyordu. Hesap silme ekranı da aynı yoldan
// açıldığı için oraya hiç ulaşılamıyordu — App Store 5.1.1(v)'nin istediği
// ekran.

/**
 * Hesabın özeti. İşletme bilgisi SUNUCUDAN tazeleniyor ve cihazdaki profile
 * yazılıyor: salon masaüstünde yeniden adlandırıldıysa telefon eski adı
 * söylemesin. Tazeleme okunamazsa cihazdaki bilgiyle devam ediliyor — sinyal
 * boşluğu müdürü hesabından atmasın.
 */
async function accountOverview(): Promise<AuthResult<AuthAccountOverview>> {
    const stored = await readProfile();
    if (!stored) return fail('no_session');
    if (stored.profile.actor !== 'manager') {
        return done({
            session: sessionOf(stored.profile, stored.biometricEnabled),
            businesses: [stored.profile.business],
        });
    }
    // Giriş v4 · P1 — giriş yöntemi ve şifre var mı. Okunamazsa satır çizilmez.
    const [list, userResult] = await Promise.all([managerBusinesses(), supabase.auth.getUser()]);
    const login = userResult.data?.user ? loginMethodOf(userResult.data.user) : undefined;
    if (!list.ok) {
        return done({
            session: sessionOf(stored.profile, stored.biometricEnabled),
            businesses: [stored.profile.business],
            login,
        });
    }
    const fresh = list.data.find((business) => business.id === stored.profile.business.id);
    const profile = fresh ? { ...stored.profile, business: fresh } : stored.profile;
    if (fresh) await saveProfile(profile, stored.biometricEnabled);
    return done({ session: sessionOf(profile, stored.biometricEnabled), businesses: list.data, login });
}

async function accountBusinessSwitch(): Promise<AuthResult<AuthAccountBusinessSwitch>> {
    const stored = await readProfile();
    if (!stored || stored.profile.actor !== 'manager') return fail('no_session');
    const list = await managerBusinesses();
    if (!list.ok) return list;
    if (list.data.length === 0) return fail('invalid_business');
    return done({ businesses: list.data });
}

/**
 * Oturumu kapat. Personelde bu TELEFONU İŞLETMEDEN ÇIKARMAK demek (hesap
 * ekranının kendi cümlesi: "yeniden bağlamak için yeni kod gerekir") — stub'ın
 * davranışıyla aynı.
 */
async function accountSignOut(): Promise<AuthResult<AuthAccountExit>> {
    const stored = await readProfile();
    if (!stored) return fail('no_session');
    if (stored.profile.actor === 'staff') {
        // ÇIKIŞ EŞLEŞMEYİ SİLMEZ (099, müdür kararı). Eskiden bu satır telefonu
        // işletmeden çıkarıyordu: her çıkıştan sonra müdürden yeni kod.
        await tokens.clearStaff();
        await clearProfile();
        return done({ target: 'welcome' });
    }
    return signOut();
}

/**
 * Giriş yapmış müdürün şifresi — E-POSTASIZ (2026-09-25).
 *
 * "Şifreyi değiştir" satırı kurtarma ekranına gidiyordu: e-postaya bağlantı.
 * Sunucuda SMTP yok, bağlantı hiç gitmiyordu ama ekran "gönderdik" diyordu.
 * Oturumu açık kişinin kimliği zaten biliniyor; e-postaya gerek yok.
 *
 * ÖNCE mevcut şifre sunucuya soruluyor: açık bırakılmış bir telefonu eline
 * alan başkası şifreyi değiştirip müdürü dışarıda bırakamasın (personelin
 * `pin.change`iyle aynı ilke). Sonra `updateUser`.
 *
 * Kural istemcide de denetleniyor ama son söz sunucunun: `weak_password` ve
 * `same_password` ayrı ayrı taşınıyor, ekran ne olduğunu söyleyebilsin.
 */
async function changeManagerPassword(current: string, next: string): Promise<AuthResult<{ changed: true }>> {
    const stored = await readProfile();
    if (!stored || stored.profile.actor !== 'manager' || !stored.profile.email) return fail('no_session');
    if (!passwordRuleState(next).valid) return fail('weak_password');
    if (current === next) return fail('same_password');

    const check = await supabase.auth.signInWithPassword({ email: stored.profile.email, password: current });
    if (check.error) {
        if (isAuthRetryableFetchError(check.error)) return fail('offline');
        return fail(/rate|too many/i.test(check.error.message) ? 'locked' : 'invalid_credentials');
    }

    const { error } = await supabase.auth.updateUser({ password: next });
    if (!error) return done({ changed: true });
    if (isAuthRetryableFetchError(error)) return fail('offline');
    if (error.code === 'same_password') return fail('same_password');
    if (error.code === 'weak_password') return fail('weak_password');
    // `reauthentication_needed` ve ötesi: sunucu değişikliği yapmadı. Ekran
    // bunu "değişmedi" diye söylüyor; başarı UYDURULMUYOR.
    return fail('no_session');
}

/**
 * P1 · "Şifre belirle" — Apple/Google ile açılmış, ŞİFRESİ OLMAYAN hesap.
 *
 * Sorulacak bir "şu anki şifre" yok; oturumun kendisi kanıt. Şifresi olan
 * hesapta bu yol KAPALI: oradaki kapı `changeManagerPassword` ve önce şu anki
 * şifreyi soruyor — açık kalmış telefonu alan başkası müdürü dışarıda
 * bırakamasın. `password_set` bayrağı bir sonraki açılışta satırı
 * "Şifreyi değiştir"e çeviriyor (giriş servisi şifrenin varlığını söylemiyor).
 */
async function setAccountPassword(next: string): Promise<AuthResult<{ changed: true }>> {
    const stored = await readProfile();
    if (!stored || stored.profile.actor !== 'manager') return fail('no_session');
    if (!passwordRuleState(next).valid) return fail('weak_password');
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return fail('no_session');
    if (loginMethodOf(userData.user).hasPassword) return fail('no_session');
    const { error } = await supabase.auth.updateUser({ password: next, data: { password_set: true } });
    if (error) return passwordWriteFailure(error);
    return done({ changed: true });
}

async function accountRequestDeletion(): Promise<AuthResult<AuthAccountDeletionRequest>> {
    const stored = await readProfile();
    if (!stored || stored.profile.actor !== 'manager') return fail('no_session');
    return done({ reauthRequired: true });
}

/**
 * Şifreyle yeniden doğrulayıp GERÇEKTEN siler. Şifre sunucuya soruluyor,
 * cihazda karşılaştırılmıyor; silme `account-delete`in kararı.
 */
async function accountConfirmDeletion(password: string): Promise<AuthResult<AuthAccountDeletionConfirmation>> {
    const stored = await readProfile();
    if (!stored || stored.profile.actor !== 'manager' || !stored.profile.email) return fail('no_session');
    const { error } = await supabase.auth.signInWithPassword({ email: stored.profile.email, password });
    if (error) return fail('invalid_credentials');
    const result = await deleteAccount(stored.profile.business.id);
    if (!result.ok) return fail(result.reason === 'no-session' ? 'no_session' : 'offline');
    await clearProfile();
    return done({ target: 'welcome' });
}

// ── Kayıt · yeni salon ──────────────────────────────────────────────────────
/*
 * KAYIT ARTIK GERÇEK. Bu akış bugüne kadar `authStub` üzerindeydi: telefondan
 * "kaydol" diyen kişi bütün ekranları geziyor, sonunda "hazır" yazısını
 * görüyor ve HİÇBİR ŞEY oluşmuyordu. App Store Yönerge 2.1'in de doğrudan
 * konusu (kaydolunamayan uygulama "tamamlanmamış" sayılıyor).
 *
 * Sunucuda yeni bir uç YAZILMADI, çünkü gerek yok: masaüstü de aynı yoldan
 * geçiyor. `supabase.auth.signUp` bir kullanıcı açıyor, veritabanındaki
 * `handle_new_user` tetikleyicisi (migration 006) org + üyelik + ayar
 * satırını kendisi kuruyor. Mobilin fazladan yaptığı tek şey, salonun ADINI
 * ve SEKTÖRÜNÜ sormak — tetikleyici adı e-postadan türetiyor.
 *
 * Hesap İLK ADIMDA açılıyor (müdür kararı): "bu e-posta zaten kullanılıyor"
 * uyarısı ancak böyle DOĞRU olabiliyor. Bedeli, kişi işletme adını yazmadan
 * çıkarsa adı e-posta olan yarım bir salonun kalması; o da masaüstünden
 * düzeltilebilir bir şey.
 */

/**
 * Sektör anahtarları MASAÜSTÜNÜN anahtarlarıdır (`src/lib/sectorProfiles.ts`).
 *
 * Mobil bir süre kendi adlarını yazıyordu — `klinik`, `dovme`, `diger`.
 * Masaüstü bunları tanımıyor ve `genel` panele düşürüyor: telefondan kaydolan
 * bir kliniğin bilgisayarda yanlış ekranı görmesi demekti. Etiketler
 * kullanıcının dilinde, anahtarlar sistemin dilinde.
 */
/*
 * DİŞ ve KLİNİK telefondan kaydolmada SUNULMUYOR (2026-09-25).
 *
 * App Store 5.1.1(ix): sağlık gibi düzenlenmiş alanlarda hizmet veren
 * uygulamalar şirket hesabından gönderilmeli; Luera'nın geliştirici hesabı
 * BİREYSEL. Mobil sürüm salon/güzellik odaklı yayımlanıyor. Klinikler
 * web'den kaydoluyor ve telefona MEVCUT hesaplarıyla giriyor — onlar için
 * hiçbir şey kapanmadı, yalnız bu listeden iki seçenek çıktı. Şirket hesabı
 * açılınca iki satır geri gelir (`sectorProfiles.ts` onları hâlâ tanıyor).
 */
const SIGNUP_SECTORS: SignupSector[] = [
    { id: 'kuafor', label: 'Kuaför' },
    { id: 'guzellik', label: 'Güzellik' },
    { id: 'tattoo', label: 'Dövme' },
    { id: 'restoran', label: 'Restoran' },
    { id: 'genel', label: 'Diğer' },
];

const K_SIGNUP = 'tf.auth.signup-draft';

/**
 * Taslak CİHAZDA tutuluyor, şifre TUTULMUYOR.
 *
 * Sunucudan okunamazdı: tetikleyici salona e-postadan bir ad veriyor, yani
 * "adı var" ile "kullanıcı adını yazdı" sunucuda ayırt edilemiyor. Ekran da
 * bu ayrıma göre hangi adımda duracağına karar veriyor.
 */
async function readSignupDraft(): Promise<SignupDraft | null> {
    try {
        const raw = await AsyncStorage.getItem(K_SIGNUP);
        return raw ? JSON.parse(raw) as SignupDraft : null;
    } catch {
        return null;
    }
}

async function writeSignupDraft(next: SignupDraft): Promise<void> {
    await AsyncStorage.setItem(K_SIGNUP, JSON.stringify(next));
}

async function clearSignupDraft(): Promise<void> {
    await AsyncStorage.removeItem(K_SIGNUP);
}

/** Kaydolan kişinin kendi salonu — tetikleyici `owner_id` ile açıyor. */
async function ownedOrg(): Promise<{ id: string; name: string } | null> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return null;
    const { data } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('owner_id', userData.user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
    return data ? { id: String(data.id), name: String(data.name ?? '') } : null;
}

async function createSignupAccount(email: string, password: string): Promise<AuthResult<SignupAccountResult>> {
    if (!supabaseConfigured) return fail('offline');
    const normalized = email.trim().toLocaleLowerCase('tr-TR');
    if (!isValidEmail(normalized) || !passwordRuleState(password).valid) {
        return fail('incomplete_signup');
    }
    const { data, error } = await supabase.auth.signUp({
        email: normalized,
        password,
        // Tetikleyici salonun ilk adını buradan alıyor; kişi bir sonraki
        // adımda kendi adını yazınca üzerine yazılır.
        options: { data: { name: normalized.split('@')[0] } },
    });
    if (error) {
        if (isAuthRetryableFetchError(error)) return fail('offline');
        const message = error.message ?? '';
        // Otomatik onay AÇIKKEN kayıtlı e-posta açıkça reddediliyor.
        if (error.code === 'user_already_exists' || /already|registered|exists/i.test(message)) {
            return existingOrCode(normalized, password);
        }
        if (error.code === 'weak_password' || /password/i.test(message)) return fail('incomplete_signup');
        if (/rate|too many/i.test(message) || (error.code ?? '').startsWith('over_')) return fail('locked');
        return fail('offline');
    }
    /*
     * OTURUM GELMEDİYSE e-posta doğrulaması açık demektir: hesap var ama
     * içeri girilemiyor. Akış K2'de, e-postadaki 6 haneli kodla sürer
     * (v4 · karar 5). Eskiden burada "bağlantı gönderdik" deyip duruyordu.
     *
     * Giriş servisi bu kipte KAYITLI bir e-postayı da aynı biçimde cevaplıyor
     * (hesap sızdırmamak için), yalnız `identities` boş geliyor. O durumda
     * karar 2: şifre tutuyorsa içeri, tutmuyorsa yine kod ekranı.
     */
    if (!data.session) {
        if ((data.user?.identities ?? []).length === 0) return existingOrCode(normalized, password);
        await writeCodeDraft(normalized);
        return done({ email: normalized, next: 'code' });
    }
    /*
     * KARŞILAMADAKİ KAPININ NİYETİ KORUNUYOR (108). Taslak burada sıfırdan
     * yazılıyordu ve "Solo" kapısının yazdığı `solo` siliniyordu: kayıt
     * sonunda mod yeniden soruluyordu — verilmiş bir cevabı duymamak.
     */
    const intent = (await readSignupDraft())?.solo;
    await writeSignupDraft(intent === undefined ? { email: normalized } : { email: normalized, solo: intent });
    return done({ email: normalized, next: 'business' });
}

/**
 * Karar 2 — kayıtta zaten kayıtlı bir e-posta. Ekran hesabın varlığını HİÇ
 * söylemez: şifre tutarsa kişi kendi hesabına girer (içeride not), tutmazsa
 * kod ekranı açılır ve oraya kod GİTMEZ. Kod ekranının "Kod gelmediyse bu
 * adresle zaten hesabınız olabilir" satırı bu yüzden her zaman orada.
 */
async function existingOrCode(email: string, password: string): Promise<AuthResult<SignupAccountResult>> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
        const list = await managerBusinesses();
        if (!list.ok) return list;
        return done({ email, next: 'existing', businesses: list.data });
    }
    if (error && isAuthRetryableFetchError(error)) return fail('offline');
    await writeCodeDraft(email);
    return done({ email, next: 'code' });
}

/** K2'ye giderken taslak: e-posta + kodun gönderildiği an (şifre YOK). */
async function writeCodeDraft(email: string): Promise<void> {
    const intent = (await readSignupDraft())?.solo;
    await writeSignupDraft({ email, codeSentAt: Date.now(), ...(intent === undefined ? {} : { solo: intent }) });
}

/**
 * K2 — e-postadaki kod. Tutarsa oturum açılır ve kayıt 2/3'ten sürer:
 * tetikleyici işletmeyi hesap AÇILIRKEN kurmuştu (doğrulamadan önce).
 */
async function verifySignupCode(code: string): Promise<AuthResult<{ email: string }>> {
    const draft = await readSignupDraft();
    if (!draft?.email) return fail('incomplete_signup');
    const { data, error } = await supabase.auth.verifyOtp({ email: draft.email, token: code, type: 'signup' });
    if (error || !data.session) return codeFailure(error);
    // Kod adımı bitti; taslakta kodun anı kalmasın (yeniden açılışta K2 gelmesin).
    await writeSignupDraft({ ...draft, codeSentAt: undefined });
    return done({ email: draft.email });
}

/** K2 · "Yeniden gönder". Sınır aşımında da ekran "gönderdik" der — sayaç yeniden başlar. */
async function resendSignupCode(): Promise<AuthResult<CodeSent>> {
    const draft = await readSignupDraft();
    if (!draft?.email) return fail('incomplete_signup');
    const { error } = await supabase.auth.resend({ type: 'signup', email: draft.email });
    if (error && isAuthRetryableFetchError(error)) return fail('offline');
    const sentAt = Date.now();
    await writeSignupDraft({ ...draft, codeSentAt: sentAt });
    return done({ email: draft.email, sentAt, resendAvailableAt: sentAt + RESEND_MS });
}

async function saveSignupBusiness(businessName: string): Promise<AuthResult<{ businessName: string }>> {
    const name = businessName.trim();
    if (!name) return fail('incomplete_signup');
    const org = await ownedOrg();
    if (!org) return fail('no_session');
    const { error } = await supabase.from('organizations').update({ name }).eq('id', org.id);
    if (error) return fail('offline');
    // Ayar satırındaki ad masaüstünün başlıklarında görünüyor; ikisi ayrışırsa
    // aynı salon iki farklı adla anılır.
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
        await supabase.from('settings').update({ business_name: name })
            .eq('user_id', userData.user.id).eq('organization_id', org.id);
    }
    const draft = await readSignupDraft();
    await writeSignupDraft({ ...draft, businessName: name });
    return done({ businessName: name });
}

async function selectSignupSector(sector: string): Promise<AuthResult<{ sector: string }>> {
    const chosen = SIGNUP_SECTORS.find((candidate) => candidate.id === sector);
    if (!chosen) return fail('incomplete_signup');
    const org = await ownedOrg();
    const { data: userData } = await supabase.auth.getUser();
    if (!org || !userData?.user) return fail('no_session');
    const { error } = await supabase.from('settings').update({ sector: chosen.id })
        .eq('user_id', userData.user.id).eq('organization_id', org.id);
    if (error) return fail('offline');
    const draft = await readSignupDraft();
    await writeSignupDraft({ ...draft, sector: chosen.id });
    return done({ sector: chosen.id });
}

/**
 * Kurulumun sonu — oturumu profile çevirir.
 *
 * Girişteki salon seçimiyle AYNI yoldan geçiyor: salonun konumu, personel
 * sayısı ve sektörü orada sunucudan okunuyor. Kayıt akışı kendi profilini
 * uydursaydı, ilk açılışta gördüğü salon ikinci açılışta değişirdi.
 */
async function completeSignup(): Promise<AuthResult<AuthSession>> {
    const org = await ownedOrg();
    if (!org) return fail('no_session');
    /*
     * Taslak burada SİLİNMİYOR (108): içinde karşılamadaki kapının niyeti
     * (`solo`) var ve onu okuyan adım — mod sorusu — bundan SONRA geliyor.
     * Silme modun yazıldığı yere taşındı (`setBusinessMode`); kaydın gerçek
     * sonu orası.
     */
    return selectManagerBusiness(org.id);
}

/**
 * İŞLETMENİN MODU — tek kişilik mi, ekibi mi var (108).
 *
 * Kaydın son adımında soruluyor ve cevap SUNUCUYA yazılıyor; kabuğu seçen
 * bilgi bu ve telefonun hafızasında tutulsaydı başka telefonda kaybolurdu.
 *
 * ── Neden tek çağrı ─────────────────────────────────────────────────────────
 * "Yalnız ben" iki şey gerektiriyor: bayrağı yazmak ve sahibe bir personel
 * satırı açmak (salonda hiç personel yoksa). İkisi ayrı yazma olsaydı
 * ikincisi düştüğünde kullanıcı tek kişilik moda geçmiş ama RANDEVU
 * KURAMAZ hâlde kalırdı — randevu bir personele bağlanmak zorunda
 * (`createFlow.ts`). Sunucu fonksiyonu ikisini tek işlemde yapıyor.
 *
 * ── Dönüşte profil YENİDEN okunuyor ────────────────────────────────────────
 * `selectManagerBusiness` org satırını `solo` ile yeniden okuyup saklı
 * profili güncelliyor. Bu şart: `enterShell` kabuğu profildeki bayrağa göre
 * seçiyor ve bayat bir profil kullanıcıyı yanlış kabuğa sokardı.
 */
async function setBusinessMode(solo: boolean): Promise<AuthResult<AuthSession>> {
    const org = await ownedOrg();
    if (!org) return fail('no_session');
    /*
     * Personel satırının adı salonun adı oluyor. Kayıt akışı KİŞİNİN adını
     * hiç sormuyor (yalnız e-posta, şifre, işletme adı) ve uydurmak doğru
     * değil. Tek modda bu ad hiçbir yerde görünmüyor; göründüğü tek an
     * ekibe geçiş (113) ve v4'ün P2 ekranı onu SORMUYOR — ekip takviminde
     * sahibin sütunu salonun adını taşır. Açık konu (devir notunda).
     */
    const stored = await readProfile();
    const name = stored?.profile.business.name ?? org.name;
    const { error } = await supabase.rpc('set_business_mode', { p_solo: solo, p_name: name });
    if (error) return fail('offline');
    const session = await selectManagerBusiness(org.id);
    // Kaydın gerçek sonu: taslak, niyetiyle birlikte ancak şimdi siliniyor.
    if (session.ok) await clearSignupDraft();
    return session;
}

/** `start_team`in kendi hayırları — `raise exception` metni (P0001). */
const TEAM_REFUSALS = ['owner_name_too_long', 'name_required', 'name_too_long', 'already_team'] as const;

/**
 * EKİBE GEÇİŞ (113 · v4 P2) — ilk çalışanı ekler, işletmeyi ekip düzenine alır.
 *
 * Tek kişilik işletmenin "Ekip ekle" kapısı. Personel satırı ile mod bayrağı
 * sunucuda TEK işlemde yazılıyor: biri düşüp öteki kalsaydı kullanıcı ya
 * ekipsiz bir ekip düzeninde ya da iki personelli bir tek kişilik kabukta
 * kalırdı (gerekçesi 113'te).
 *
 * ── "ZATEN EKİP" HER ZAMAN BİR HATA DEĞİL ──────────────────────────────────
 * Zayıf sinyalde ilk istek sunucuya ulaşıp işi yapıyor ama cevabı telefona
 * dönmüyor; kişi yeniden dokununca sunucu `already_team` diyor. Çalışan o
 * durumda GERÇEKTEN eklendi ve "eklenemedi" demek yalan olurdu. Aynı adla
 * bir çalışan kadroda duruyorsa iş gitmiş sayılıyor — `sendVisitToCash`in
 * `already_finished` kuralının aynısı.
 *
 * ── Dönüşte profil YENİDEN okunuyor ────────────────────────────────────────
 * `setBusinessMode` ile aynı gerekçe: kabuğu profildeki bayrak seçiyor.
 * Gerçek bir `already_team`de de okunuyor — saklı profil bayat demek ve bir
 * sonraki açılış doğru kabuğa gitmeli.
 *
 * Kumandanın tek kişilik jetonu düşürülüyor: sunucu onu artık yenilemez
 * (`solo.session` → `not_solo`) ve ardında bırakılan bir taşıyıcı belge
 * kimsenin işine yaramaz.
 */
async function startTeam(name: string, specialty: string, ownerName: string): Promise<AuthResult<AuthSession>> {
    const cleanName = name.trim();
    if (!cleanName) return fail('name_required');
    // Sahibin adı (115): ekip takviminde sahibin sütunu salonun adıyla
    // görünüyordu. Kullanıcı kararı — sorulur ve boş geçilemez.
    const cleanOwner = ownerName.trim();
    if (!cleanOwner) return fail('owner_name_required');
    const org = await ownedOrg();
    if (!org) return fail('no_session');

    const { error } = await supabase.rpc('start_team', {
        p_name: cleanName,
        p_specialty: specialty.trim() || null,
        p_owner_name: cleanOwner,
    });
    if (error) {
        const message = error.message ?? '';
        const refusal = TEAM_REFUSALS.find((code) => message.includes(code));
        const landed = refusal === 'already_team' && (await teamMemberExists(org.id, cleanName));
        if (!landed) {
            if (refusal === 'already_team') await selectManagerBusiness(org.id);
            if (refusal) return fail(refusal);
            if (message.includes('org_not_found')) return fail('no_session');
            // Personel tablosunun yazma kapısı aboneliğe bağlı (087).
            if (error.code === '42501') return fail('subscription_inactive');
            return fail('offline');
        }
    }

    await tokens.clearStaff();
    return selectManagerBusiness(org.id);
}

/** `end_team`in kendi hayırları (115). */
const SOLO_REFUSALS = ['team_not_empty', 'name_too_long'] as const;

/**
 * TEK KİŞİLİĞE DÖNÜŞ (115) — ekipte sahipten başka aktif kimse kalmayınca.
 *
 * Kapının öbür yönü: kayıttaki "Sonradan İşletme’den değiştirebilirsiniz"
 * cümlesi yalnız tek kişilik → ekip yönünde doğruydu. Sunucu tek işlemde
 * bayrağı çeviriyor ve ayrılan çalışanların ileri randevularını kalan kişiye
 * geçiriyor (gerekçesi 115'te).
 *
 * `p_name` yalnız hiç aktif personel yokken kullanılıyor — 108'in kuralı:
 * açılacak satır salonun adını taşıyor.
 *
 * ── "ZATEN TEK KİŞİLİK" HATA DEĞİL ─────────────────────────────────────────
 * `startTeam`in `already_team`i gibi: zayıf sinyalde ilk istek işi yapıp
 * cevabını kaybetmiş olabilir. İstenen hâl zaten bu; profil yeniden okunup
 * başarı dönüyor, sayılar bilinmiyor (`counts: null`).
 */
async function endTeam(): Promise<AuthResult<TeamEndResult>> {
    const org = await ownedOrg();
    if (!org) return fail('no_session');
    const stored = await readProfile();
    const name = stored?.profile.business.name ?? org.name;

    const { data, error } = await supabase.rpc('end_team', { p_name: name });
    let counts: TeamEndResult['counts'] = null;
    if (error) {
        const message = error.message ?? '';
        if (!message.includes('already_solo')) {
            const refusal = SOLO_REFUSALS.find((code) => message.includes(code));
            if (refusal) return fail(refusal);
            if (message.includes('org_not_found')) return fail('no_session');
            // Personel ve randevu yazma kapısı aboneliğe bağlı (087).
            if (error.code === '42501') return fail('subscription_inactive');
            return fail('offline');
        }
    } else {
        const row = (data ?? {}) as Record<string, unknown>;
        const count = (key: string) => (typeof row[key] === 'number' ? row[key] as number : 0);
        counts = { moved: count('moved'), unassigned: count('unassigned'), kept: count('kept') };
    }

    const session = await selectManagerBusiness(org.id);
    if (!session.ok) return session;
    return done({ session: session.data, counts });
}

/** Bu adla aktif bir çalışan var mı. Okunamazsa `false` — emin olmadan "eklendi" denmez. */
async function teamMemberExists(orgId: string, name: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('staff')
        .select('id')
        .eq('organization_id', orgId)
        .eq('name', name)
        .eq('is_active', true)
        .limit(1);
    return !error && (data?.length ?? 0) > 0;
}

/**
 * Karşılamadaki kapının niyetini taslağa yazar (108).
 *
 * Kaydın HENÜZ BAŞI: hesap yok, oturum yok, sunucuya yazacak bir şey de yok.
 * Niyet cihazda duruyor ve `set_business_mode` ancak kaydın sonunda, gerçek
 * bir oturumla çağrılıyor.
 */
async function markSignupIntent(solo: boolean): Promise<void> {
    const draft = await readSignupDraft();
    await writeSignupDraft({ ...(draft ?? {}), solo });
}

async function signupDraft(): Promise<AuthResult<SignupDraft>> {
    const draft = await readSignupDraft();
    // Apple'ın e-postası boş gelebilir; Apple/Google kaydı sağlayıcısıyla da sayılır.
    return draft?.email || draft?.provider ? done(draft) : fail('incomplete_signup');
}

async function availableSignupSectors(): Promise<SignupSector[]> {
    return SIGNUP_SECTORS.map((sector) => ({ ...sector }));
}

// ── Kapalı kapı (Apple Eşiği · C) ───────────────────────────────────────────

/**
 * Kapalı kapı ekranının bilgisi — CANLI.
 *
 * Önceden stub'dan okunuyordu: canlıda stub'ın oturumu olmadığı için ekran
 * açılır açılmaz karşılamaya atıyordu. Abonelik kontrolü açıldığı gün personel
 * kapıya düşecek ve kapıyı hiç görmeyecekti.
 *
 * Personel: `staff-api · access` (kapıdan önce, token'la). Müdür: kendi
 * oturumuyla `org_entitlement` satırı (RLS üyeye açık) ve kararın tek kaynağı
 * `has_timeflow_access`. Hiçbiri yoksa kapının kime ait olduğu bilinmiyor —
 * ekran karşılamaya döner.
 */
async function lockedDoor(): Promise<AuthResult<LockedDoor>> {
    const staffToken = (await tokens.staff()) ?? (await tokens.device());
    const stored = await readProfile();
    if (staffToken && stored?.profile.actor !== 'manager') {
        try {
            const data = await staffApi.access(staffToken);
            return done({
                actor: 'staff',
                businessName: String(data.businessName ?? stored?.profile.business.name ?? ''),
                until: typeof data.until === 'string' ? data.until : null,
                open: data.ok === true,
            });
        } catch (e) {
            return mapError(e);
        }
    }

    if (!supabaseConfigured) return fail('no_session');
    const { data: auth } = await supabase.auth.getSession();
    const orgId = stored?.profile.actor === 'manager' ? stored.profile.business.id : null;
    if (!auth.session || !orgId) return fail('no_session');

    const [row, gate] = await Promise.all([
        supabase.from('org_entitlement')
            .select('state, expires_at, grace_until')
            .eq('organization_id', orgId)
            .maybeSingle(),
        supabase.rpc('has_timeflow_access', { p_org: orgId }),
    ]);
    // Karar okunamadıysa kapıyı AÇIK sanmıyoruz ama tarih de uydurmuyoruz.
    if (gate.error) return fail('offline');
    const entitlement = row.data as { state?: string; expires_at?: string | null; grace_until?: string | null } | null;
    const until = entitlement
        ? (entitlement.state === 'grace' ? entitlement.grace_until : entitlement.expires_at) ?? null
        : null;
    return done({
        actor: 'manager',
        businessName: stored?.profile.business.name ?? '',
        until: gate.data === true ? null : until,
        open: gate.data === true,
    });
}

export const auth = {
    getLaunchState,
    signup: {
        draft: signupDraft,
        sectors: availableSignupSectors,
        account: createSignupAccount,
        business: saveSignupBusiness,
        sector: selectSignupSector,
        complete: completeSignup,
        mode: setBusinessMode,
        intent: markSignupIntent,
        verify: verifySignupCode,
        resend: resendSignupCode,
    },
    social: {
        available: socialAvailable,
        start: socialStart,
        bridge: socialBridge,
        createBusiness: socialCreateBusiness,
        leave: socialLeave,
    },
    team: {
        start: startTeam,
        end: endTeam,
    },
    manager: {
        prefill: managerPrefill,
        remember: rememberTypedEmail,
        start: managerStart,
        businesses: managerBusinesses,
        selectBusiness: selectManagerBusiness,
        recover: recoverManagerPassword,
        verifyRecovery: verifyRecoveryCode,
        setPassword: setRecoveredPassword,
    },
    staff: {
        pair: pairStaffDevice,
        roster: staffRoster,
        select: selectStaffMember,
        pending: pendingStaffMember,
        start: startStaffSession,
        /** Telefonu işletmeden çıkarır; yeniden bağlamak için yeni kod gerekir. */
        setupPin: setupStaffPin,
        changePin: changeStaffPin,
        entry: staffEntry,
        unlinkDevice: async () => {
            // Cihaz koparılıyor: bildirim aboneliği de gitmeli, yoksa bu telefon
            // artık salonun olmadığı hâlde bildirim almaya devam eder.
            await unregisterPush().catch(() => undefined);
            forgetIntent();
            await forgetDeviceId();
            await tokens.clearDevice();
            await tokens.clearStaff();
            await clearProfile();
            await clearPending();
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
    subscription: { locked: lockedDoor },
    account: {
        get: accountOverview,
        prepareBusinessSwitch: accountBusinessSwitch,
        setBiometric,
        signOut: accountSignOut,
        changePassword: changeManagerPassword,
        setPassword: setAccountPassword,
        requestDeletion: accountRequestDeletion,
        confirmDeletion: accountConfirmDeletion,
    },
} as const;
