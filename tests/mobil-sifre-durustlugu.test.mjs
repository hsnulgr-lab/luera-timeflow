import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    EMAIL_RECOVERY_READY, passwordChange, passwordChangeProblem, recoveryUnavailable,
} from '../mobile/src/lib/authCopy.ts';

/**
 * ŞİFRE YOLLARI DÜRÜST · 2026-09-25 · App Store 2.1
 *
 * Sunucuda SMTP yok. İki yol e-postaya dayanıyordu ve ikisi de yalan
 * söylüyordu:
 *
 *   • "Şifremi unuttum" → form → "Bağlantıyı gönderdik". Hiçbir e-posta
 *     gitmiyordu; kişi gelen kutusunu bekliyor, bir daha giremiyordu.
 *   • Profil › Hesap › "Şifreyi değiştir" (müdür) → AYNI kurtarma ekranı.
 *     Hakemi hesap silme için tam bu ekrana yönlendiriyoruz.
 *
 * Şimdi: giriş yapmış müdür şifresini telefondan, E-POSTASIZ değiştiriyor
 * (önce şu anki şifre soruluyor). Şifresini unutan kişi durumu ve iki gerçek
 * yolu görüyor. SMTP gelince `EMAIL_RECOVERY_READY` açılır ve eski form geri
 * gelir — ama ANCAK bir e-posta gerçekten ulaştıktan sonra.
 */

const oku = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const kod = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const recover = kod(oku('mobile/app/(auth)/manager/recover.tsx'));
const account = kod(oku('mobile/app/(staff-flow)/account.tsx'));
const sifre = kod(oku('mobile/app/(manager-flow)/profil/sifre.tsx'));
const auth = kod(oku('mobile/src/api/auth.ts'));
const stub = kod(oku('mobile/src/api/authStub.ts'));

test('e-posta sıfırlaması KAPALI — SMTP yokken "gönderdik" denmiyor', () => {
    assert.equal(EMAIL_RECOVERY_READY, false,
        'Sıfırlama açıldı. Bunu ancak sunucuda SMTP kurulup bir sıfırlama '
        + 'e-postası GERÇEKTEN ulaştıktan sonra yap; sonra bu testi güncelle.');
    // Dürüst hâl, formdan ve "gönderdik" ekranından ÖNCE dönüyor.
    const kapi = recover.indexOf('if (!EMAIL_RECOVERY_READY)');
    assert.ok(kapi > 0, 'Kurtarma ekranında e-posta kapısı yok.');
    // SON eşleşme: ilki `back` içindeki geri dönüş, ikincisi çizim bloğu.
    assert.ok(kapi < recover.lastIndexOf("if (phase === 'sent')"),
        'Kapı "gönderdik" ekranından sonra kalmış — yalan yine görünür.');
    assert.match(recover.slice(kapi),
        /title=\{recoveryUnavailable\.title\}\s*body=\{recoveryUnavailable\.body\}/);
    // Posta uygulaması yoksa açılamaz; hata yutulur, adres metinde yazılı.
    assert.match(recover, /Linking\.openURL\(recoveryUnavailable\.mailto\)\.catch\(\(\) => undefined\)/);
});

test('dürüst hâl gerçek yollar veriyor, satın almaya çağırmıyor', () => {
    assert.match(recoveryUnavailable.body, /henüz açık değil/);
    assert.match(recoveryUnavailable.body, /Bilgisayarda girişiniz açıksa/);
    // Adres metinde de yazılı: posta uygulaması açılamazsa kişi yine görür.
    assert.match(recoveryUnavailable.body, /info@lueratech\.com/);
    assert.match(recoveryUnavailable.mailto, /^mailto:info@lueratech\.com\?subject=/);
    assert.doesNotMatch(recoveryUnavailable.body, /satın|abonelik|ücret|fiyat|öde/i);
});

test('müdürün "Şifreyi değiştir"i kurtarma ekranına DEĞİL, gerçek ekrana gidiyor', () => {
    assert.match(account, /router\.push\('\/\(manager-flow\)\/profil\/sifre'\)/);
    assert.doesNotMatch(account, /'\/\(auth\)\/manager\/recover'/,
        'Müdür yine e-posta bağlantısına gönderiliyor — SMTP yokken hiçbir şey gitmez.');
    // Personelin yolu değişmedi (099).
    assert.match(account, /router\.push\('\/\(staff-flow\)\/sifre'\)/);
});

test('şifre değişimi önce ŞU ANKİ şifreyi sunucuya soruyor', () => {
    const fn = auth.slice(auth.indexOf('async function changeManagerPassword'),
        auth.indexOf('async function accountRequestDeletion'));
    const sor = fn.indexOf('supabase.auth.signInWithPassword({ email: stored.profile.email, password: current })');
    const yaz = fn.indexOf('supabase.auth.updateUser({ password: next })');
    assert.ok(sor > 0 && yaz > sor,
        'Mevcut şifre sorulmadan yazılıyor: açık kalmış telefonu alan müdürü dışarıda bırakabilir.');
    // Hatalar ayrı taşınıyor; başarı yalnız hatasız güncellemede.
    assert.match(fn, /if \(!error\) return done\(\{ changed: true \}\);/);
    assert.match(fn, /if \(error\.code === 'same_password'\) return fail\('same_password'\);/);
    assert.match(fn, /if \(error\.code === 'weak_password'\) return fail\('weak_password'\);/);
    assert.match(fn, /isAuthRetryableFetchError\(error\)\) return fail\('offline'\)/);
    assert.equal((fn.match(/return done\(/g) || []).length, 1, 'Başarı birden çok yerden dönüyor.');
    // İki kip aynı sözleşmeyi taşıyor.
    assert.match(auth, /changePassword: changeManagerPassword,/);
    assert.match(stub, /changePassword: changeManagerPassword,/);
});

test('şifre ekranı içeride: ışık alanı yok, iki alan, kayıttaki kural', () => {
    assert.match(sifre, /<AuthPage\s*field=\{false\}/);
    assert.match(sifre, /label=\{passwordChange\.current\}/);
    assert.match(sifre, /label=\{passwordChange\.next\}/);
    assert.match(sifre, /const rule = passwordRuleState\(next\);/);
    assert.match(sifre, /authApi\.account\.changePassword\(current, next\)/);
    // Başarı ancak sunucu "tamam" deyince.
    assert.match(sifre, /if \(result\.ok\) \{\s*feedback\.success\(\);\s*setDone\(true\);/);
    assert.equal(passwordChange.done, 'Şifreniz değişti.');
});

test('her hata cümlesi ne olduğunu söylüyor, hiçbiri başarı gibi okunmuyor', () => {
    for (const code of ['invalid_credentials', 'offline', 'no_session', 'bilinmeyen']) {
        assert.match(passwordChangeProblem(code), /değişmedi/, code);
    }
    assert.match(passwordChangeProblem('same_password'), /eskisiyle aynı/);
    assert.match(passwordChangeProblem('weak_password'), /En az 8 karakter/);
    assert.match(passwordChangeProblem('locked'), /Biraz bekleyip/);
});
