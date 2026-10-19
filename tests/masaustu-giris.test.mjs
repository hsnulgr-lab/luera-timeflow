import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    classifyAuthError, passwordOk, emailLooksValid, cleanCode, formatCountdown, ssoFailedText, METIN,
} from '../src/pages/login/girisKurallari.ts';

/**
 * MASAÜSTÜ GİRİŞ — "Işık alanı" (tasarım: Luera Masaustu - Giris v2.1) · 2026-10-19
 *
 * Kilitlenenler:
 *   1. Sunucu hataları doğru banda düşüyor — örnekler sunucunun GERÇEK
 *      cevapları (2026-10-19, canlı giriş servisi).
 *   2. Hiçbir metin bir e-postanın kayıtlı olup olmadığını söylemiyor.
 *   3. Kararlar: masaüstünde kayıt hesapla biter → Kurulum; adım çubuğu yok;
 *      gizlilik satırı "kabul ettirmiyor"; Apple/Google sunucu hazır olmadan
 *      görünmüyor.
 *   4. Tasarımın ölçüleri.
 */

const oku = (p) => readFileSync(new URL(p, new URL('../', import.meta.url)), 'utf8');
const kod = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const page = kod(oku('src/pages/LoginPage.tsx'));
const parts = kod(oku('src/pages/login/parcalar.tsx'));
const social = kod(oku('src/pages/login/sosyalGiris.ts'));
const css = oku('src/pages/login/giris.css');

// ── 1 · Hata sınıflaması ────────────────────────────────────────────────────

test('yanlış kod ile süresi dolmuş kod tek sınıf (sunucu ikisine aynı cevabı veriyor)', () => {
    // Canlıdan: verifyOtp(recovery, yanlış kod) →
    assert.equal(classifyAuthError({ code: 'otp_expired', status: 403, name: 'AuthApiError', message: 'Token has expired or is invalid' }), 'otp_invalid');
    assert.equal(classifyAuthError({ message: 'Token has expired or is invalid' }), 'otp_invalid');
});

test('giriş hataları', () => {
    assert.equal(classifyAuthError({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' }), 'invalid_credentials');
    assert.equal(classifyAuthError({ message: 'Invalid login credentials' }), 'invalid_credentials');
    assert.equal(classifyAuthError({ code: 'email_not_confirmed', status: 400 }), 'not_confirmed');
});

test('kayıtlı e-posta, sınırlar, şifre', () => {
    assert.equal(classifyAuthError({ code: 'user_already_exists', status: 422 }), 'exists');
    assert.equal(classifyAuthError({ message: 'User already registered' }), 'exists');
    assert.equal(classifyAuthError({ code: 'over_request_rate_limit', status: 429 }), 'rate_limited');
    assert.equal(classifyAuthError({ status: 429, message: 'x' }), 'rate_limited');
    assert.equal(classifyAuthError({ code: 'over_email_send_rate_limit', status: 429 }), 'email_rate_limited',
        'e-posta bekleme süresi istek sınırından ÖNCE tanınmalı (ikisi de 429)');
    assert.equal(classifyAuthError({ code: 'weak_password' }), 'weak_password');
    assert.equal(classifyAuthError({ code: 'same_password' }), 'same_password');
    assert.equal(classifyAuthError({ code: 'email_address_invalid' }), 'invalid_email');
});

test('ağ hatası "internet yok" sayılıyor', () => {
    assert.equal(classifyAuthError({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }), 'offline');
    assert.equal(classifyAuthError({ message: 'Load failed' }), 'offline');
    assert.equal(classifyAuthError(null), 'unknown');
    assert.equal(classifyAuthError({ code: 'unexpected_failure', status: 500 }), 'unknown');
});

// ── Kurallar ────────────────────────────────────────────────────────────────

test('şifre kuralı telefondakiyle aynı: en az 8, bir rakam', () => {
    assert.equal(passwordOk('salon2026'), true);
    assert.equal(passwordOk('salon26'), false, '7 karakter');
    assert.equal(passwordOk('salonsalon'), false, 'rakam yok');
    assert.equal(METIN.passwordRule, 'En az 8 karakter olsun, içinde bir rakam bulunsun.');
    assert.match(parts, /En az 8 karakter olsun, içinde bir rakam bulunsun\./);
});

test('e-posta ve kod biçimi', () => {
    assert.equal(emailLooksValid('ayla@studioayla.com'), true);
    assert.equal(emailLooksValid(' ayla@studioayla.com '), true);
    assert.equal(emailLooksValid('ayla@studioayla'), false);
    assert.equal(cleanCode('123 456'), '123456', 'boşluklu yapıştırma');
    assert.equal(cleanCode('12-34-56-78'), '123456', 'en çok 6 hane');
    assert.equal(cleanCode('a1b2'), '12');
    assert.equal(formatCountdown(59), '· 0:59');
    assert.equal(formatCountdown(0), '· 0:00');
});

// ── 2 · Sızdırmama ──────────────────────────────────────────────────────────

test('hiçbir metin hesabın var olup olmadığını söylemiyor', () => {
    const all = [...Object.values(METIN), ssoFailedText('apple', 'login'), ssoFailedText('google', 'signup')].join(' | ');
    assert.doesNotMatch(all, /kayıtlı değil|hesap bulunamadı|böyle bir hesap|bu e-posta kullanılıyor|zaten kayıtlı/i);
    assert.equal(METIN.wrongCredentials, 'E-posta veya şifre hatalı.', 'hangisinin yanlış olduğu söylenmez');
    // Şifre yenileme: her e-postaya aynı cevap (kod ekranı) — e-posta başına
    // bekleme süresi de ekrana yansımıyor.
    assert.match(page, /failure && failure !== 'email_rate_limited'/);
    assert.match(page, /Hesabınız varsa kodu birkaç dakika içinde alırsınız\./);
});

test('kayıtta kayıtlı e-posta: şifre uyarsa içeri + not, uymazsa kod ekranı', () => {
    assert.match(page, /identities\?\.length \?\? 0\) === 0/, 'otomatik onay kapalıyken gelen sahte kullanıcı tanınmıyor');
    assert.match(page, /if \(!again\.error\) \{ enter\('existing'\); return; \}/);
    assert.match(page, /Kod gelmediyse bu adresle zaten hesabınız olabilir/);
    assert.equal(METIN.existingAccount, 'Bu e-postayla zaten hesabınız var — giriş yaptınız.');
});

// ── 3 · Kararlar ────────────────────────────────────────────────────────────

test('masaüstünde kayıt hesapla biter, Kurulum sihirbazı açılır (karar 1)', () => {
    assert.match(page, /kind === 'signup' \? '\/kurulum' : '\/'/);
    assert.doesNotMatch(page, /Adım \d \/ 3|İşletmeniz|kim yapıyor/, 'M6/M7 ve adım çubuğu masaüstünde yok');
});

test('plan seçilip gelindiyse önce abonelik sayfası', () => {
    assert.match(page, /\/abonelik\?plan=\$\{plan\.id\}&cycle=\$\{cycle\}/);
    assert.match(page, /planById\(params\.get\('plan'\)\)/, 'geçersiz plan adı ödeme sayfasına taşınmasın');
});

test('gizlilik satırı kabul ettirmiyor, bilgi veriyor (karar 6)', () => {
    assert.match(page, /Bilgileriniz <PrivacyLink \/>'na göre işlenir\./);
    assert.doesNotMatch(page, /kabul edersiniz/);
});

test('Apple/Google açık; acil kapatma tek ayar (2026-10-19)', () => {
    // Sunucu tarafı açıldı; kullanıcı kararı: herkese, tam işlevsel.
    assert.match(social, /SOCIAL_ENABLED = import\.meta\.env\.VITE_SOCIAL_LOGIN !== '0'/);
    assert.match(social, /'ai\.luera\.timeflow\.web'/, 'Apple web kimliği (gizli değil) varsayılan');
    assert.match(page, /\{SOCIAL_ENABLED && \(/);
    // Apple: nonce'un özeti Apple'a, kendisi giriş servisine.
    assert.match(social, /nonce: await sha256Hex\(nonce\)/);
    assert.match(social, /signInWithIdToken\(\{ provider: 'apple', token, nonce \}\)/);
});

test('eski sayfanın kalıntıları yok', () => {
    assert.doesNotMatch(page, /sen@luera\.ai|Unuttum\?|Tekrar hoş geldin|Kayıt ol/);
});

test('tarayıcı doldurma öznitelikleri', () => {
    assert.match(page, /autoComplete="current-password"/);
    assert.match(page, /autoComplete="new-password"/);
    assert.match(page, /autoComplete="username"/, 'yeni şifre doğru hesaba kaydedilsin');
    assert.match(parts, /autoComplete="one-time-code"/);
    assert.match(parts, /autoComplete="email"/);
    assert.match(page, /type: screen\.name === 'code' \? 'signup' : 'recovery'/);
});

// ── 4 · Tasarım ölçüleri ────────────────────────────────────────────────────

test('blok, sahne ve plaka tasarımın değerleri', () => {
    assert.match(css, /width: min\(1240px, calc\(100% - 112px\)\)/);
    assert.match(css, /padding-top: max\(88px, calc\(50vh - 320px\)\)/);
    assert.match(css, /grid-template-columns: minmax\(0, 1fr\) 460px;\s*column-gap: 96px/);
    assert.match(css, /grid-template-columns: minmax\(0, 1fr\) 440px; column-gap: 72px; padding-top: max\(80px, calc\(50vh - 300px\)\)/);
    assert.match(css, /\.lg-pr \{\s*height: 640px/);
    assert.match(css, /\.lg-promise \{ font-size: 60px; font-weight: 800/);
    assert.match(css, /border-radius: 28px;/);
    assert.match(css, /\.lg-btn \{\s*width: 100%;\s*height: 54px/);
});

test('kod kutusu iki temada da siyah, hareket azaltılınca alan durur', () => {
    assert.match(css, /\[data-theme="dark"\][\s\S]*--obg: #0C0A07/);
    assert.match(css, /\[data-theme="light"\][\s\S]*--obg: #0E0E0E/);
    assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation-play-state: paused !important/);
});

test('odak halkası alanın içinde ikinci bir çerçeve çıkarmıyor (2026-10-19)', () => {
    // `.lg :focus-visible` (0,2,0) içteki <input>'un `outline: 0`'ını (0,1,1)
    // ezer: yuvarlak halkanın içinde köşeli turuncu bir kutu daha çıkar.
    const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(plain, /:where\(\.lg\) :focus-visible \{ outline: 2px solid var\(--or\)/);
    assert.doesNotMatch(plain, /(^|\n)\.lg :focus-visible/);
    assert.match(plain, /\.lg-inp input \{[^}]*outline: 0/);
    assert.match(plain, /\.lg-otp input \{[^}]*outline: 0/);
});

test('sınıflar önekli — uygulamanın .btn/.plate stilleriyle çakışmıyor', () => {
    const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{[^}]*\}/g, '').match(/\.[a-z][\w-]*/g) ?? [];
    const bare = selectors.filter((s) => !s.startsWith('.lg'));
    assert.deepEqual([...new Set(bare)], [], `öneksiz sınıf: ${[...new Set(bare)].join(', ')}`);
});
