import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * MASAÜSTÜ KAYIT — "GİRİŞ YAPABİLİRSİNİZ" YALANI · 2026-09-25
 *
 * Demo hesabı açarken bulundu: masaüstü kayıt ekranı hesap açıldığında
 * KOŞULSUZ olarak "Hesabınız oluşturuldu! Giriş yapabilirsiniz." diyordu.
 * E-posta doğrulaması açıkken bu YANLIŞTI — GoTrue kullanıcıyı açıyor ama
 * oturum vermiyor, yani kişi giremiyor.
 *
 * Sebebi tek satırdı: `const { error } = await supabase.auth.signUp(...)`
 * — `data` tamamen atılıyordu, dolayısıyla `data.session` hiç sorulmuyordu.
 *
 * Mobil aynı ayrımı BAŞTAN doğru yapıyor (`email_confirmation_required`).
 * Bu dosya masaüstünün ondan geri kaymasını engelliyor.
 *
 * Kilitlenen ilke: EKRAN OLMAMIŞ BİR ŞEYİ OLMUŞ GİBİ GÖSTERMEZ.
 */

const oku = (p) => readFileSync(new URL(p, new URL('../', import.meta.url)), 'utf8');
/** Yorumlar iddiayı yanlışlıkla karşılamasın. */
const kod = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ctx   = kod(oku('src/contexts/AuthContext.tsx'));
const login = kod(oku('src/pages/LoginPage.tsx'));

test('signUp yanıtının data alanı okunuyor — atılmıyor', () => {
    assert.match(ctx, /const\s*\{\s*data\s*,\s*error\s*\}\s*=\s*await\s+supabase\.auth\.signUp/,
        'AuthContext.signup yine yalnız `error` alıyor; oturum gelip gelmediği bilinemez.');
});

test('oturum yoksa bu bilgi çağırana taşınıyor', () => {
    assert.match(ctx, /needsConfirmation:\s*!data\.session/,
        '`data.session` kontrolü kayboldu — doğrulama bekleyen kayıt başarı sayılır.');
    assert.match(ctx, /needsConfirmation\?:\s*boolean/,
        'Sözleşme tipinde needsConfirmation yok; çağıran bu ayrımı göremez.');
});

test('"Giriş yapabilirsiniz" KOŞULSUZ gösterilmiyor', () => {
    const i = login.indexOf('Giriş yapabilirsiniz');
    assert.notEqual(i, -1, 'Başarı metni tamamen kayboldu — bu test artık yanlış yeri koruyor.');
    // Metin, needsConfirmation dalının OLMADIĞI kolda kalmalı.
    assert.match(login, /if\s*\(\s*result\.needsConfirmation\s*\)/,
        'Kayıt sonucunda needsConfirmation dalı yok; her kayıt "girebilirsin" diyor.');
});

test('doğrulama bekleyen kayıt için ayrı bir metin var', () => {
    assert.match(login, /doğrulama bağlantısı gönderdik/,
        'Doğrulama bekleyen kayıt için kullanıcıya söylenecek bir şey yok.');
});

test('bekleyen kayıt YEŞİL başarı kutusunda gösterilmiyor', () => {
    // Yeşil = bitti demek. Burada kullanıcının yapacağı bir iş kaldı.
    assert.match(login, /pendingMsg/,
        'Ayrı bir bekleme durumu yok; metin başarı kutusuna düşüyor olabilir.');
    const yesil = login.indexOf('122,211,160');
    const bekleyen = login.indexOf('pendingMsg &&');
    assert.ok(yesil !== -1 && bekleyen !== -1 && bekleyen > yesil,
        'Bekleyen kayıt kutusu bulunamadı ya da başarı kutusuyla aynı stili paylaşıyor.');
});
