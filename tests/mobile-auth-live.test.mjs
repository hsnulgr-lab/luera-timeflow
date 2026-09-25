import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Faz 3 — gerçek kimlik katmanı.
//
// Bu dosyanın koruduğu şey: personel telefonunda Supabase oturumu OLMAMASI.
// RLS org seviyesinde çalıştığı için personel telefonuna Supabase oturumu
// koymak, arayüz "kendi randevuların" gösterse bile salonun tüm verisini o
// telefona açardı. Ayrım kaybolursa 082'nin çözdüğü sorun geri gelir.

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');

const live = read('src/api/auth.ts');
const session = read('src/api/session.ts');
const stub = read('src/api/authStub.ts');
const staffClient = read('src/api/staff.ts');
const packageJson = read('package.json');

// ── İki ayrı kimlik ─────────────────────────────────────────────────────────

test('personel yolunda Supabase oturumu yoktur', () => {
    // Dosyada iki "Oturum" başlığı var ("Oturum saklama" personelden ÖNCE);
    // sınır olarak sonrakini kullan, yoksa dilim ters döner.
    const staffPart = live.slice(live.indexOf('// ── Personel'), live.indexOf('// ── Oturum ─'));
    assert.doesNotMatch(staffPart, /supabase\.auth/);
    // Personel yalnız cihaz ve personel token'ıyla konuşur.
    assert.match(staffPart, /tokens\.setDevice|tokens\.device\(\)/);
});

test('müdür yolunda staff-api token bulunmaz', () => {
    const managerPart = live.slice(live.indexOf('// ── Müdür'), live.indexOf('// ── Personel'));
    assert.match(managerPart, /supabase\.auth\.signInWithPassword/);
    assert.doesNotMatch(managerPart, /tokens\.setStaff|tokens\.setDevice/);
});

// ── Token saklama ───────────────────────────────────────────────────────────

test('taşıyıcı token düz metin diskte durmaz', () => {
    // AsyncStorage düz metin bir dosyadır; 90 gün geçerli cihaz token'ı orada
    // durursa yedeği okuyabilen biri personel listesini ve PIN hakkını alır.
    assert.match(staffClient, /import \* as SecureStore from 'expo-secure-store'/);
    assert.match(staffClient, /SecureStore\.setItemAsync\(K_DEVICE/);
    assert.match(staffClient, /SecureStore\.setItemAsync\(K_STAFF/);
    assert.doesNotMatch(staffClient, /AsyncStorage\.setItem\(K_(DEVICE|STAFF)/);
});

test('eşleşme yedekle başka cihaza geçmez', () => {
    // Eski telefonun yedeğinden kurulan yeni telefon eşleşmeyi devralmamalı.
    assert.match(staffClient, /WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
});

test('çıkış ile telefonu çıkarma ayrı iki iştir', () => {
    // Oturumu kapatmak cihaz eşleşmesini düşürmez; aksi hâlde her vardiya
    // değişiminde yeni kod istenirdi.
    assert.match(staffClient, /clearStaff: \(\) => SecureStore\.deleteItemAsync\(K_STAFF/);
    assert.match(staffClient, /clearDevice: \(\) => SecureStore\.deleteItemAsync\(K_DEVICE/);
});

// ── Hata eşlemesi ───────────────────────────────────────────────────────────

test('ağ hatası ile sunucu hatası ayrı ekranlar açar', () => {
    // ApiError sunucunun konuştuğu demektir; onun dışındaki her şey bağlantı.
    assert.match(live, /if \(!\(e instanceof ApiError\)\) return fail\('offline'\)/);
});

test('süresi dolmuş kod sunucudan gelen ayrı kod olarak taşınır', () => {
    // Giriş 15b ve 15c bu ayrımın üstüne kurulu.
    assert.match(live, /case 'expired_pair_code': return fail\('expired_pair_code'\)/);
    assert.match(live, /case 'invalid_pair_code': return fail\('invalid_pair_code'\)/);
    assert.match(staffClient, /redeem: \(code: string\) => raw\('device\.code\.redeem'/);
});

test('abonelik kapısı sunucudan gelir', () => {
    assert.match(live, /case 'subscription_inactive': return fail\('subscription_inactive'\)/);
});

// ── Biyometri ───────────────────────────────────────────────────────────────

test('Face ID kısayoldur, kimliğin yerine geçmez', () => {
    assert.match(packageJson, /expo-local-authentication/);
    assert.match(live, /LocalAuthentication\.authenticateAsync/);
    // Cihaz şifresine düşmesin: yedek yol bizim ekranımızda (PIN / şifre).
    assert.match(live, /disableDeviceFallback: true/);
    // Donanım yoksa ya da yüz kayıtlı değilse teklif edilmez.
    assert.match(live, /hasHardwareAsync\(\)[\s\S]{0,120}isEnrolledAsync\(\)/);
});

// ── Anahtar ─────────────────────────────────────────────────────────────────

test('varsayılan stub: sunucu dağıtılmadan canlıya geçilmez', () => {
    // Anahtarı çevirmeden canlıya geçmek uygulamayı hiç açılmaz hâle getirirdi.
    assert.match(session, /LIVE_AUTH = process\.env\.EXPO_PUBLIC_AUTH_MODE === 'live'/);
    assert.match(session, /export const authApi = LIVE_AUTH/);
});

test('stub parçası KALMADI — kapalı kapı da canlı', () => {
    // Abonelik kapısının DURUMU canlı okunuyor; telefonda hâlâ fiyat, plan ya
    // da satın alma çağrısı geçmiyor (App Store 3.1.3(f)).
    assert.match(session, /STUB_PARTS = \[\] as const/);
    assert.match(session, /subscription: \{ \.\.\.authStub\.subscription, \.\.\.live\.subscription \}/);
    assert.match(session, /account: \{ \.\.\.authStub\.account, \.\.\.live\.account \}/);
    assert.match(live, /const result = await deleteAccount\(stored\.profile\.business\.id\);/);
});

test('kayıt GERÇEKTEN salon açıyor', () => {
    /*
     * Telefondan "kaydol" diyen kişi bütün ekranları geziyor, sonunda "hazır"
     * yazısını görüyor ve HİÇBİR ŞEY oluşmuyordu (App Store Yönerge 2.1).
     */
    assert.match(session, /signup: \{ \.\.\.authStub\.signup, \.\.\.live\.signup \}/);
    assert.match(live, /await supabase\.auth\.signUp\(\{/);
    // Salonun adı ve sektörü sunucuya YAZILIYOR — taslakta kalmıyor.
    assert.match(live, /from\('organizations'\)\.update\(\{ name \}\)/);
    assert.match(live, /update\(\{ sector: chosen\.id \}\)/);
    // Şifre cihazda SAKLANMIYOR: taslakta yalnız e-posta, ad ve sektör var.
    const draft = live.slice(live.indexOf('async function writeSignupDraft'), live.indexOf('async function ownedOrg'));
    assert.doesNotMatch(draft, /password/);
    // Oturum gelmediyse "hazır" denmiyor: doğrulama açık demek.
    assert.match(live, /if \(!data\.session\) return fail\('email_confirmation_required'\);/);
    // Kurulumun sonu GİRİŞLE aynı yoldan geçiyor; profil uydurulmuyor.
    assert.match(live, /const session = await selectManagerBusiness\(org\.id\);/);
});

test('sektör anahtarları masaüstünün anahtarları', () => {
    /*
     * Mobil bir süre `klinik`, `dovme`, `diger` yazıyordu. Masaüstü bunları
     * tanımıyor ve `genel` panele düşürüyor: telefondan kaydolan kliniğin
     * bilgisayarda YANLIŞ ekranı görmesi demekti.
     */
    const profiles = readFileSync(new URL('../src/lib/sectorProfiles.ts', import.meta.url), 'utf8');
    for (const key of ['kuafor', 'guzellik', 'tattoo', 'restoran', 'genel']) {
        assert.match(live, new RegExp(`id: '${key}'`), `canlı sektör eksik: ${key}`);
        assert.match(stub, new RegExp(`id: '${key}'`), `stub sektör eksik: ${key}`);
        assert.match(profiles, new RegExp(`^    ${key}: \\{`, 'm'), `masaüstü tanımıyor: ${key}`);
    }
    for (const dead of ['klinik', 'dovme', 'diger']) {
        assert.doesNotMatch(live, new RegExp(`id: '${dead}'`));
        assert.doesNotMatch(stub, new RegExp(`id: '${dead}'`));
    }
});

test('Diş ve Klinik telefondan kaydolmada SUNULMUYOR — masaüstü onları hâlâ tanıyor', () => {
    /*
     * App Store 5.1.1(ix): sağlık gibi düzenlenmiş alanlarda hizmet veren
     * uygulamalar şirket hesabından gönderilmeli; Luera'nın geliştirici
     * hesabı BİREYSEL (2026-09-25). Mobil sürüm salon odaklı yayımlanıyor.
     * Klinikler web'den kaydoluyor, telefona mevcut hesaplarıyla giriyor.
     * Şirket hesabı açılınca bu test değişir ve iki satır geri gelir.
     */
    const liste = (src, ad) => src.match(new RegExp(`const ${ad}: SignupSector\\[\\] = \\[[\\s\\S]*?\\n\\];`))?.[0] ?? '';
    const canli = liste(live, 'SIGNUP_SECTORS');
    const sahte = liste(stub, 'signupSectors');
    assert.ok(canli && sahte, 'sektör listeleri okunamadı');
    for (const key of ['dis', 'saglik']) {
        assert.doesNotMatch(canli, new RegExp(`id: '${key}'`), `mobil kayıt yine ${key} sunuyor`);
        assert.doesNotMatch(sahte, new RegExp(`id: '${key}'`), `stub kayıt yine ${key} sunuyor`);
    }
    const profiles = readFileSync(new URL('../src/lib/sectorProfiles.ts', import.meta.url), 'utf8');
    assert.match(profiles, /^    dis: \{/m, 'masaüstü Diş sektörünü kaybetti');
    assert.match(profiles, /^    saglik: \{/m, 'masaüstü Klinik sektörünü kaybetti');
    // Eski taslakta kalmış sektör seçili sayılmıyor — kaydedilemezdi.
    const business = readFileSync(new URL('../mobile/app/(auth)/signup/business.tsx', import.meta.url), 'utf8');
    assert.match(business, /const kept = sectorChoices\.some\(\(choice\) => choice\.id === draft\.sector\);/);
});

test('ekranlar kimliğe yalnız tek dikişten ulaşır', () => {
    for (const path of [
        'app/(auth)/manager/sign-in.tsx',
        'app/(auth)/staff/pair.tsx',
        'app/(auth)/staff/pin.tsx',
        'app/(auth)/resume.tsx',
        'app/index.tsx',
    ]) {
        const screen = read(path);
        assert.match(screen, /api\/session/, `${path}: session içe aktarmalı`);
        assert.doesNotMatch(screen, /api\/auth'|api\/authStub/, `${path}: dikişi atlıyor`);
        assert.doesNotMatch(screen, /\bsupabase\b/i, `${path}: doğrudan Supabase çağırıyor`);
    }
});

test('anon anahtar mobilde de gerekli ve gizli değil', () => {
    const client = read('src/lib/supabase.ts');
    assert.match(client, /EXPO_PUBLIC_SUPABASE_ANON_KEY/);
    // Personel tarafı bu istemciyi hiç kullanmaz.
    assert.match(client, /persistSession: true/);
    assert.match(client, /detectSessionInUrl: false/);
});
