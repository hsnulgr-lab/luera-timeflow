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

test('sunucu tarafı olmayan akışlar açıkça stub kalır', () => {
    // Kayıt ve hesap silme: mobilden org açacak uç yok, hesap silecek uç yok.
    assert.match(session, /STUB_PARTS = \['signup', 'account', 'subscription'\]/);
    assert.doesNotMatch(live, /signup|createSignupAccount/);
    assert.doesNotMatch(live, /confirmDeletion|requestDeletion/);
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
