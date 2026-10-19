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

// ── 2026-10-19 · yeni giriş sayfası (Işık alanı) ──────────────────────────
// Kayıt artık AuthContext.signup'ı değil, supabase'i doğrudan çağırıyor ve
// doğrulama bekleyen kayıt bir metin kutusu değil, KOD EKRANI açıyor. İlke
// aynı: oturum gelmeden kimse "içeri" alınmaz, başarı söylenmez.

test('kayıtta içeri yalnız OTURUM varsa giriliyor', () => {
    assert.match(login, /const\s*\{\s*data\s*,\s*error\s*\}\s*=\s*await\s+supabase\.auth\.signUp/,
        'Kayıt yanıtının data alanı okunmuyor; oturum gelip gelmediği bilinemez.');
    assert.match(login, /if\s*\(\s*!error\s*&&\s*data\.session\s*\)\s*\{\s*enter\('signup'\)/,
        'Kayıt oturum sorulmadan "içeri" sayılıyor.');
});

test('oturum gelmeyen kayıt kod ekranına gidiyor — başarı söylenmiyor', () => {
    assert.match(login, /if\s*\(\s*!error\s*\)\s*\{\s*openCode\(address,\s*'code'\)/,
        'Oturumsuz başarılı kayıt kod ekranına gitmiyor.');
    assert.doesNotMatch(login, /Giriş yapabilirsiniz|Hesabınız oluşturuldu/,
        'Ekran yine olmamış bir girişi olmuş gibi söylüyor.');
});

test('kod ekranı kişiye ne yapacağını söylüyor', () => {
    assert.match(login, /6 haneli kod gönderdik/,
        'Doğrulama bekleyen kişiye kodun nereye gittiği söylenmiyor.');
});
