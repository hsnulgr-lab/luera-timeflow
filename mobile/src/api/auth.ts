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
    AuthAccountExit, AuthAccountOverview, AuthBusiness, AuthFailure, AuthProfile, AuthResult,
    AuthSession, LaunchState, LockedDoor, SignupDraft, SignupSector, StaffEntry, StaffRosterMember,
} from './authStub';
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
        .select('id, name, address, owner_id')
        .order('name')
        .returns<OrgRow[]>();
    if (error) return fail('offline');
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

async function recoverManagerPassword(email: string): Promise<AuthResult<{
    sent: true; email: string; resendAvailableAt: number;
}>> {
    // Hesabın varlığı SIZDIRILMAZ: var olmayan e-posta da aynı cevabı alır.
    await supabase.auth.resetPasswordForEmail(email.trim()).catch(() => undefined);
    return done({ sent: true, email: email.trim(), resendAvailableAt: Date.now() + 60_000 });
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
    const list = await managerBusinesses();
    if (!list.ok) {
        return done({
            session: sessionOf(stored.profile, stored.biometricEnabled),
            businesses: [stored.profile.business],
        });
    }
    const fresh = list.data.find((business) => business.id === stored.profile.business.id);
    const profile = fresh ? { ...stored.profile, business: fresh } : stored.profile;
    if (fresh) await saveProfile(profile, stored.biometricEnabled);
    return done({ session: sessionOf(profile, stored.biometricEnabled), businesses: list.data });
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

async function createSignupAccount(email: string, password: string): Promise<AuthResult<{ email: string }>> {
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
        const message = error.message ?? '';
        if (/already|registered|exists/i.test(message)) return fail('email_in_use');
        if (/password/i.test(message)) return fail('incomplete_signup');
        if (/rate|too many/i.test(message)) return fail('locked');
        return fail('offline');
    }
    /*
     * OTURUM GELMEDİYSE e-posta doğrulaması açık demektir: kullanıcı var ama
     * içeri giremiyor, dolayısıyla salonun adını da yazamayız. "Kaydın
     * tamamlandı" demek yalan olurdu — akış burada DURUR ve ekran kişiye
     * postasına bakmasını söyler.
     *
     * GoTrue bu kipte, zaten kayıtlı bir e-postayı da aynı biçimde
     * cevaplıyor (hesap sızdırmamak için). İkisini ayırt edemediğimiz için
     * metin ikisini de kapsıyor.
     */
    if (!data.session) return fail('email_confirmation_required');
    await writeSignupDraft({ email: normalized });
    return done({ email: normalized });
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
    const session = await selectManagerBusiness(org.id);
    if (session.ok) await clearSignupDraft();
    return session;
}

async function signupDraft(): Promise<AuthResult<SignupDraft>> {
    const draft = await readSignupDraft();
    return draft?.email ? done(draft) : fail('incomplete_signup');
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
    },
    manager: {
        start: managerStart,
        businesses: managerBusinesses,
        selectBusiness: selectManagerBusiness,
        recover: recoverManagerPassword,
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
        requestDeletion: accountRequestDeletion,
        confirmDeletion: accountConfirmDeletion,
    },
} as const;
