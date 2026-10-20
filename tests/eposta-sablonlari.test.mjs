import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Giriş servisinin (GoTrue) Türkçe e-posta şablonları (2026-10-18, Resend).
// ÜRETİCİ: scripts/eposta-sablonlari.mjs. Servis dosyayı
// timeflow.lueratech.com/eposta/… adresinden okur ve BÜTÜN dosyayı Go şablonu
// olarak işler. Kurallar:
//  - yalnız KOD: servisin dış adresi iç ağ adresi (http://supabase-kong:8000),
//    doğrulama bağlantısı kimsenin tarayıcısında açılmaz;
//  - tek görsel kendi alan adımızdaki logo; betik, yazı tipi, izleme yok;
//  - görünen adresler kendi biçimimizle (Gmail'in mavi bağlantısı yerine).

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SABLONLAR = {
    'sifre-kodu.html': 'Şifre sıfırlama kodunuz',
    'dogrulama-kodu.html': 'E-posta adresinizi doğrulayın',
    'giris-kodu.html': 'Giriş kodunuz',
    'eposta-degisikligi.html': 'E-posta değişikliğini onaylayın',
};

for (const [ad, baslik] of Object.entries(SABLONLAR)) {
    test(`${ad}: Türkçe, yalnız kod, dış kaynak yok`, () => {
        const html = read(`../public/eposta/${ad}`);
        assert.match(html, /<html lang="tr">/);
        assert.match(html, /<meta charset="utf-8">/);
        assert.equal((html.match(/\{\{ \.Token \}\}/g) || []).length, 1, 'kod tam bir kez');
        assert.ok(html.includes(baslik));
        assert.doesNotMatch(html, /ConfirmationURL \}\}|TokenHash|\.SiteURL|\.RedirectTo/, 'bağlantı yok');
        assert.doesNotMatch(html, /<script|<link|@import|url\(/i, 'dış kaynak yok');
        const img = [...html.matchAll(/<img\b[^>]*>/g)];
        assert.equal(img.length, 1, 'tek görsel: logo');
        // Tam marka (luera + "timeflow" hapı, 2026-10-21) — scripts/eposta-logo.mjs.
        assert.match(img[0][0], /src="https:\/\/timeflow\.lueratech\.com\/eposta\/logo-timeflow\.png"/);
        // Resim engellenince biçimli alt metin: eski 44 px ikonda taşıyordu.
        assert.match(img[0][0], /width="146" height="30" alt="Luera TimeFlow"/);
        assert.match(img[0][0], /font-size:16px;line-height:30px;font-weight:700;color:#0E0E0E;/);
        const adresler = [...html.matchAll(/https?:\/\/[^"'\s<]+/g)].map((m) => m[0]);
        assert.deepEqual(adresler, ['https://timeflow.lueratech.com/eposta/logo-timeflow.png'], 'başka adres yok');
        for (const a of html.matchAll(/<a\b[^>]*>/g)) {
            assert.match(a[0], /href="mailto:/, 'yalnız mailto bağlantısı');
            assert.match(a[0], /text-decoration:none/);
        }
        assert.match(html, /ÜRETİLDİ: scripts\/eposta-sablonlari\.mjs/);
        // Yalnız GoTrue'nun tanıdığı değişkenler.
        for (const m of html.matchAll(/\{\{\s*\.(\w+)\s*\}\}/g)) {
            assert.ok(['Token', 'Email', 'NewEmail'].includes(m[1]), `bilinmeyen değişken: ${m[1]}`);
        }
        assert.match(html, /kimseyle paylaşmayın/);
        assert.match(html, /info@lueratech\.com/);
    });
}

test('logo dosyası var ve küçük', () => {
    const png = readFileSync(new URL('../public/eposta/logo.png', import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.ok(png.length < 40_000, `${png.length} bayt`);
});

test('şablonlar uygulamanın önbelleğine girmez', () => {
    assert.match(read('../vite.config.ts'), /globIgnores: \['eposta\/\*\*'\]/);
});
