// Giriş servisinin (GoTrue) Türkçe e-posta şablonlarını üretir:
//   node scripts/eposta-sablonlari.mjs   → public/eposta/*.html
//
// Dört şablon tek kalıptan çıkar; bir şeyi değiştirmek için BURAYI düzenle,
// sonra betiği çalıştır. Servis dosyaları timeflow.lueratech.com/eposta/…
// adresinden okur (Coolify → MAILER_TEMPLATES_*), yani yayına çıkması için
// masaüstü deploy'u gerekir.
//
// Kurallar (tests/eposta-sablonlari.test.mjs kilitler):
//  - YALNIZ KOD, bağlantı yok: servisin dış adresi (API_EXTERNAL_URL) iç ağ
//    adresi; doğrulama bağlantısı kimsenin tarayıcısında açılmaz.
//  - Servis BÜTÜN dosyayı Go şablonu olarak işler: yoruma da şablon ifadesi
//    yazma.
//  - Tek görsel kendi alan adımızdaki logo; betik, yazı tipi, izleme yok.
//    Resim engellenince (Outlook varsayılanı) yerine biçimli alt metin çıkar;
//    eski 44 px'lik ikon kutusunda alt metin taşıyordu (2026-10-21).
//  - Gmail e-posta adreslerini ve alan adlarını kendiliğinden mavi bağlantıya
//    çeviriyor; görünen her adres kendi biçimimizle <a> içinde.
import { writeFileSync } from 'node:fs';

// Tam marka (luera + "timeflow" hapı) — üretimi: node scripts/eposta-logo.mjs
const LOGO = 'https://timeflow.lueratech.com/eposta/logo-timeflow.png';
const RENK = {
    zemin: '#F3EDE3', kart: '#FFFFFF', cizgi: '#ECE4D6', murekkep: '#0E0E0E',
    metin: '#4F4840', soluk: '#8C8478', turuncu: '#FF5A1F', krem: '#F3EDE3',
};
const YAZI = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SF Mono',ui-monospace,Menlo,Consolas,'Courier New',monospace";

const adres = (href, metin, renk = RENK.murekkep) =>
    `<a href="${href}" style="color:${renk};text-decoration:none;font-weight:600;">${metin}</a>`;

function sablon({ ne, degisken, baslik, onizleme, giris, yoksay }) {
    return `<!doctype html>
<!--
  Luera TimeFlow · e-posta şablonu: ${ne}
  ÜRETİLDİ: scripts/eposta-sablonlari.mjs — elle düzenleme, betiği çalıştır.
  Giriş servisi bu dosyayı adresinden okur: Coolify → ${degisken}
  Yalnız kod, bağlantı yok; yoruma şablon ifadesi yazma (servis işler).
-->
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${baslik}</title>
</head>
<body style="margin:0;padding:0;background:${RENK.zemin};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${onizleme}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${RENK.zemin};">
  <tr>
    <td align="center" style="padding:40px 16px 32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:${RENK.kart};border:1px solid ${RENK.cizgi};border-radius:20px;">
        <tr>
          <td style="padding:32px 32px 0 32px;"><img src="${LOGO}" width="146" height="30" alt="Luera TimeFlow" style="display:block;width:146px;height:30px;border:0;font-family:${YAZI};font-size:16px;line-height:30px;font-weight:700;color:${RENK.murekkep};"></td>
        </tr>
        <tr>
          <td style="padding:28px 32px 0 32px;font-family:${YAZI};">
            <h1 style="margin:0 0 10px 0;font-size:26px;line-height:32px;font-weight:700;letter-spacing:-0.4px;color:${RENK.murekkep};">${baslik}</h1>
            <p style="margin:0;font-size:15px;line-height:24px;color:${RENK.metin};">${giris}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${RENK.murekkep};border-radius:14px;">
              <tr>
                <td align="center" style="padding:20px 0 20px 12px;font-family:${MONO};font-size:34px;line-height:40px;font-weight:700;letter-spacing:12px;color:${RENK.krem};">{{ .Token }}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 0 32px;"><div style="height:1px;line-height:1px;font-size:1px;background:${RENK.cizgi};">&nbsp;</div></td>
        </tr>
        <tr>
          <td style="padding:20px 32px 32px 32px;font-family:${YAZI};">
            <p style="margin:0 0 8px 0;font-size:13px;line-height:20px;color:${RENK.soluk};">Bu kodu kimseyle paylaşmayın. Luera ekibi sizden hiçbir zaman kod istemez.</p>
            <p style="margin:0;font-size:13px;line-height:20px;color:${RENK.soluk};">${yoksay}</p>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
        <tr>
          <td align="center" style="padding:20px 24px 0 24px;font-family:${YAZI};font-size:12px;line-height:19px;color:${RENK.soluk};">
            Bu adres yanıt almaz. Sorularınız için ${adres('mailto:info@lueratech.com', 'info@lueratech.com', RENK.turuncu)}<br>
            Luera TimeFlow · Randevu takip ve gün yönetimi
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;
}

const SABLONLAR = [
    {
        dosya: 'sifre-kodu.html', ne: 'şifre sıfırlama', degisken: 'MAILER_TEMPLATES_RECOVERY',
        baslik: 'Şifre sıfırlama kodunuz',
        onizleme: 'Şifrenizi yenilemek için 6 haneli kodunuz.',
        giris: 'Hesabınız için şifre sıfırlama istendi. Uygulamada aşağıdaki kodu girin, ardından yeni şifrenizi belirleyin.',
        yoksay: 'Bu isteği siz yapmadıysanız e-postayı yok sayabilirsiniz; şifreniz değişmez.',
    },
    {
        dosya: 'dogrulama-kodu.html', ne: 'e-posta doğrulama (kayıt)', degisken: 'MAILER_TEMPLATES_CONFIRMATION',
        baslik: 'E-posta adresinizi doğrulayın',
        onizleme: 'Hesabınızı açmayı tamamlamak için 6 haneli kodunuz.',
        giris: "Luera TimeFlow'a hoş geldiniz. Hesabınızı açmayı tamamlamak için uygulamada aşağıdaki kodu girin.",
        yoksay: 'Hesap açmadıysanız bu e-postayı yok sayabilirsiniz; adresiniz kullanılmaz.',
    },
    {
        dosya: 'giris-kodu.html', ne: 'kodla giriş', degisken: 'MAILER_TEMPLATES_MAGIC_LINK',
        baslik: 'Giriş kodunuz',
        onizleme: 'Giriş yapmak için 6 haneli kodunuz.',
        giris: "Luera TimeFlow'a girmek için uygulamada aşağıdaki kodu girin.",
        yoksay: 'Giriş yapmaya çalışmadıysanız bu e-postayı yok sayabilirsiniz; hesabınıza kimse girmedi.',
    },
    {
        dosya: 'eposta-degisikligi.html', ne: 'e-posta değişikliği', degisken: 'MAILER_TEMPLATES_EMAIL_CHANGE',
        baslik: 'E-posta değişikliğini onaylayın',
        onizleme: 'E-posta değişikliğini onaylamak için 6 haneli kodunuz.',
        giris: `Hesabınızın e-posta adresi ${adres('mailto:{{ .NewEmail }}', '{{ .NewEmail }}')} olarak değiştirilecek. Onaylamak için uygulamada aşağıdaki kodu girin.`,
        yoksay: 'Bu değişikliği siz istemediyseniz e-postayı yok sayın ve şifrenizi değiştirin.',
    },
];

for (const s of SABLONLAR) {
    writeFileSync(new URL(`../public/eposta/${s.dosya}`, import.meta.url), sablon(s));
}
console.log(`${SABLONLAR.length} şablon yazıldı → public/eposta/`);
