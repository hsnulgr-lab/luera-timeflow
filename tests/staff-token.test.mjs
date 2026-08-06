import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    mintStaffToken, verifyStaffToken, hashPin, safeEqual,
    STAFF_TOKEN_TTL_SEC, PIN_MAX_ATTEMPTS, PIN_LOCK_MINUTES,
} from '../supabase/functions/_shared/staffToken.ts';

// Personel oturum token'ı (082). Bu dosya, personel kimliğinin İSTEMCİDEN
// SUNUCUYA taşınmasının kilididir. Bugünkü hâlde PIN hash'i cihaza iniyor ve
// karşılaştırma tarayıcıda yapılıyor (StaffLogin: `h === selected.pin`).

const SECRET = 'a'.repeat(64);
const claims = { sub: 'staff-1', org: 'org-1', role: 'staff', epoch: 3 };

test('imzalanan token aynı sırla doğrulanır', async () => {
    const token = await mintStaffToken(claims, SECRET);
    const result = await verifyStaffToken(token, SECRET);
    assert.equal(result.ok, true);
    assert.equal(result.claims.sub, 'staff-1');
    assert.equal(result.claims.org, 'org-1');
    assert.equal(result.claims.epoch, 3);
});

test('başka sırla imzalanmış token reddedilir', async () => {
    const token = await mintStaffToken(claims, SECRET);
    const result = await verifyStaffToken(token, 'b'.repeat(64));
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'bad_signature');
});

test('gövdesi kurcalanmış token reddedilir — başka personele dönüşemez', async () => {
    // Saldırganın en doğal denemesi: sub'ı değiştirip başkasının ajandasını okumak.
    const token = await mintStaffToken(claims, SECRET);
    const [head, , sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: 'staff-2', iat: 0, exp: 9e9 }))
        .toString('base64url');
    const result = await verifyStaffToken(`${head}.${forged}.${sig}`, SECRET);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'bad_signature');
});

test('alg=none saldırısı geçmez', async () => {
    // JWT'nin en bilinen açığı: başlıkta alg'ı none yapıp imzayı boşaltmak.
    const head = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ ...claims, iat: 0, exp: 9e9 })).toString('base64url');
    const result = await verifyStaffToken(`${head}.${body}.`, SECRET);
    assert.equal(result.ok, false);
});

test('süresi dolmuş token reddedilir', async () => {
    const past = Math.floor(Date.now() / 1000) - STAFF_TOKEN_TTL_SEC - 10;
    const token = await mintStaffToken(claims, SECRET, past);
    const result = await verifyStaffToken(token, SECRET);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'expired');
});

test('bozuk biçim çökmeye değil redde yol açar', async () => {
    for (const bad of ['', 'abc', 'a.b', 'a.b.c.d', 'x.y.z']) {
        const result = await verifyStaffToken(bad, SECRET);
        assert.equal(result.ok, false, bad);
    }
});

test('token bir vardiya sürer — çalınan cihazda pencere dar', () => {
    assert.equal(STAFF_TOKEN_TTL_SEC, 12 * 60 * 60);
});

test('epoch doğrulaması BİLEREK token içinde yapılmaz', async () => {
    // İptal, DB'deki güncel epoch ile karşılaştırılarak çalışır; token kendi
    // kendini geçerli ilan edemez.
    const token = await mintStaffToken({ ...claims, epoch: 99 }, SECRET);
    const result = await verifyStaffToken(token, SECRET);
    assert.equal(result.ok, true);
    assert.equal(result.claims.epoch, 99);
});

test('PIN hash istemcideki lib/pin.ts ile aynı', async () => {
    // İki taraf ayrışırsa hiç kimse giriş yapamaz; ikisi de düz SHA-256(trim).
    const h = await hashPin(' 1234 ');
    assert.equal(h, await hashPin('1234'));
    assert.equal(h.length, 64);
    assert.match(h, /^[0-9a-f]+$/);
    const clientPin = readFileSync(new URL('../src/lib/pin.ts', import.meta.url), 'utf8');
    assert.match(clientPin, /digest\('SHA-256', data\)/);
    assert.match(clientPin, /pin\.trim\(\)/);
});

test('sabit süreli karşılaştırma doğru sonucu verir', () => {
    assert.equal(safeEqual('abc', 'abc'), true);
    assert.equal(safeEqual('abc', 'abd'), false);
    assert.equal(safeEqual('abc', 'ab'), false);
    assert.equal(safeEqual('', ''), true);
});

test('deneme limiti var ve kilit kalıcı değil', () => {
    // 4 haneli PIN = 10.000 kombinasyon; limitsiz deneme onu anlamsız kılar.
    // Kalıcı kilit ise salonu işlemez hâle getirir.
    assert.equal(PIN_MAX_ATTEMPTS, 5);
    assert.ok(PIN_LOCK_MINUTES > 0 && PIN_LOCK_MINUTES <= 60);
});

// ── Migration sözleşmesi ────────────────────────────────────────────────────
const migration = readFileSync(new URL('../supabase/082_staff_auth.sql', import.meta.url), 'utf8');

test('pasifleştirme ve PIN değişimi oturumu KENDİLİĞİNDEN düşürür', () => {
    // Elle epoch artırmayı beklemek, işten çıkanın erişiminin açık kalması demek.
    assert.match(migration, /new\.session_epoch := coalesce\(old\.session_epoch, 1\) \+ 1/);
    assert.match(migration, /new\.is_active = false/);
    assert.match(migration, /old\.pin is distinct from new\.pin/);
    assert.match(migration, /old\.role is distinct from new\.role/);
    assert.match(migration, /before update on public\.staff/);
});

test('denetim izi append-only — istemci kendi kaydını uyduramaz', () => {
    assert.match(migration, /create table if not exists public\.staff_auth_log/);
    assert.match(migration, /for select/);
    assert.doesNotMatch(migration, /for insert\s+with check[\s\S]{0,200}staff_auth_log/);
    assert.match(migration, /enable row level security/);
});

test('token sırrı varsayılana düşmez, migration üretir', () => {
    assert.match(migration, /STAFF_TOKEN_SECRET/);
    assert.match(migration, /gen_random_bytes\(32\)/);
});

test('pin sütununun gizlenmesi bilinçli olarak 083e bırakıldı', () => {
    // 082 additive; revoke'u istemci değişmeden uygulamak personel girişini kırar.
    assert.doesNotMatch(migration, /revoke select[\s\S]{0,60}staff/i);
    assert.match(migration, /083/);
});

// ── staff-api sözleşmesi ────────────────────────────────────────────────────
const api = readFileSync(new URL('../supabase/functions/staff-api/index.ts', import.meta.url), 'utf8');

test('PIN doğrulama SUNUCUDA yapılır ve hash asla dönmez', () => {
    // Bugünkü açık: StaffLogin hash'i indirip tarayıcıda karşılaştırıyor.
    assert.match(api, /safeEqual\(await hashPin\(pin\), member\.pin\)/);
    assert.match(api, /hasPin: Boolean\(s\.pin\)/);
    // roster yanıtında ham pin alanı geçmemeli
    const roster = api.slice(api.indexOf("action === 'roster'"), api.indexOf("action === 'session.start'"));
    assert.doesNotMatch(roster, /pin: s\.pin/);
});

test('var olmayan personel ile yanlış PIN aynı cevabı verir', () => {
    // Aksi hâlde uç, salonda kimlerin çalıştığını sızdıran bir sorguya dönüşür.
    assert.match(api, /if \(!member \|\| !member\.is_active \|\| !member\.pin\)[\s\S]{0,80}invalid_credentials/);
});

test('deneme limiti ve kilit sunucuda uygulanır', () => {
    assert.match(api, /attempts >= PIN_MAX_ATTEMPTS/);
    assert.match(api, /pin_locked_until/);
    assert.match(api, /lockedUntil > new Date\(\)[\s\S]{0,160}429/);
});

test('yetki her istekte DB’den tazelenir — eski token yeni yetkiyi taşımaz', () => {
    assert.match(api, /if \(!me \|\| !me\.is_active\) return json\(\{ error: 'revoked' \}, 401\)/);
    assert.match(api, /\(me\.session_epoch \?\? 1\) !== claims\.epoch/);
});

test('cihaz token’ı veri okuyamaz, personel token’ı PIN deneyemez', () => {
    assert.match(api, /if \(isDevice\) return json\(\{ error: 'staff_token_required' \}, 403\)/);
    assert.match(api, /if \(!isDevice\) return json\(\{ error: 'device_token_required' \}, 403\)/);
});

test('cihaz eşleme org sahibinin kararı', () => {
    assert.match(api, /resolved\.role === 'member'[\s\S]{0,60}owner_required/);
    assert.match(api, /admin\.auth\.getUser\(jwt\)/);
});

test('sır yoksa kimlik üretilmez — zayıf varsayılana düşülmez', () => {
    assert.match(api, /if \(!secret\)[\s\S]{0,160}not_configured/);
});

test('her giriş ve her başarısız deneme denetim izine yazılır', () => {
    assert.match(api, /audit\(claims\.org, member\.id, 'login'\)/);
    assert.match(api, /lock \? 'locked' : 'failed_pin'/);
});
