# Giriş ekranı yeniden — araştırma ve plan (2026-10-13)

Kullanıcı: "Şifre sıfırlamayı profesyonel bir şekilde araştıralım; giriş
ekranını adam akıllı yapalım: Apple ile kaydol, Google ile kaydol, şifre
sıfırlama olan profesyonel, kolay bir giriş."

Kapsam yalnız **işletme sahibinin** girişi (müdür / tek kişilik). Personelin
girişi (ekip kodu + kendi şifresi, 099) bu işin dışında ve değişmiyor.

---

## 1 · Bugün

| | Durum |
|---|---|
| Giriş | E-posta + şifre (`(auth)/manager/sign-in.tsx`), Face ID ile hızlı giriş var |
| Kayıt | E-posta + şifre; **otomatik onay açık** (`ENABLE_EMAIL_AUTOCONFIRM=true`) — e-posta doğrulanmıyor |
| Şifre sıfırlama | **YOK.** Sunucuda e-posta gönderimi (SMTP) kurulu değil; ekran "info@lueratech.com'a yazın" diyor (`authCopy.recoveryUnavailable`) |
| Oturum açıkken şifre | `profil/sifre` ile değiştirilebiliyor |
| Altyapı | Kendi sunucumuzdaki Supabase (GoTrue). Ayarlar ortam değişkeniyle (Coolify) |

## 2 · Önerilen akış

**Karşılama → "İşletmemi yönetiyorum"** açılınca tek ekran:

1. **Apple ile devam et** (siyah, Apple'ın kendi düğmesi)
2. **Google ile devam et**
3. ayraç "ya da"
4. **E-posta** alanı + **Şifre** alanı + **Giriş yap** · altında **Şifremi unuttum**
5. en altta "Hesabınız yok mu? **Kaydolun**" — Apple/Google ile ilk giriş zaten
   hesap açıyor; "kaydol" yalnız e-postayla açmak isteyen için.

**Şifremi unuttum — bağlantı değil KOD:**
e-posta → "6 haneli kodu gönderdik" → kodu yaz (tek kutu, telefonun "e-postadan
kodu doldur" önerisi) → yeni şifre (iki kez değil, bir kez + göster/gizle) →
içeride. Bağlantılı akış derin bağlantı (universal link) ister ve e-postayı
bilgisayarda açan kişiyi telefona geri getiremez; kod her iki yerde çalışır.
Hesabın varlığı yine sızdırılmaz: olmayan e-postaya da "gönderdik" denir.

**Yeni hesapta e-posta doğrulaması:** kayıt → "6 haneli kod" → içeride. Apple ve
Google ile açılan hesapta e-posta zaten doğrulanmış gelir.

## 3 · Teknik plan

### 3.1 E-posta gönderimi (SMTP) — ÖNKOŞUL, iki sebeple
1. Şifre sıfırlama ve doğrulama kodu bununla gider.
2. **Güvenlik:** Supabase aynı doğrulanmış e-postaya sahip Google/Apple girişini
   var olan hesaba **otomatik bağlıyor**. Otomatik onay açıkken biri başkasının
   e-postasıyla şifreli hesap açabilir; sahibi sonra Google'la girince o hesaba
   düşer (hesabı önceden kaçırma). Sosyal giriş açılmadan ÖNCE doğrulama açılmalı.

Yapılacaklar:
- Sağlayıcı seçimi (bkz. §5) ve `lueratech.com` için DNS: SPF, DKIM, DMARC.
- Gönderici: `no-reply@lueratech.com` (ya da `giris@`). Yanıtlar `info@`a.
- GoTrue: `GOTRUE_SMTP_HOST/PORT/USER/PASS`, `GOTRUE_SMTP_ADMIN_EMAIL`,
  `GOTRUE_SMTP_SENDER_NAME="Luera TimeFlow"`, `GOTRUE_MAILER_AUTOCONFIRM=false`,
  Türkçe şablonlar (kurtarma ve doğrulama, `{{ .Token }}` 6 hane).
- İstemci: `resetPasswordForEmail` → `verifyOtp({ type: 'recovery' })` →
  `updateUser({ password })`. Expo Go'da denenebilir (derin bağlantı yok).

### 3.2 Apple ile giriş
- Paket: `expo-apple-authentication` → `supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce })`.
- Apple Developer: App ID'ye **Sign in with Apple** yeteneği → **yeni mağaza
  derlemesi** gerekir (native yetenek). Expo Go'da denenebilir; o zaman belgenin
  alıcısı `host.exp.Exponent` olur ve geliştirme süresince sunucunun kabul
  listesine eklenir.
- GoTrue: `GOTRUE_EXTERNAL_APPLE_ENABLED=true`, istemci kimlikleri
  `ai.luera.timeflow` (+ web için Services ID, geliştirmede `host.exp.Exponent`).
- **Hesap silmede Apple belgesini iptal** (Apple TN3194, `/auth/revoke`):
  girişte gelen `authorizationCode` sunucuda yenileme belgesine çevrilip
  saklanır ya da silme anında Apple onayı yeniden istenir. İptal için `.p8`
  anahtarıyla imzalı istemci sırrı → `account-delete` fonksiyonuna eklenir.
- **"E-postamı gizle"**: kişi `…@privaterelay.appleid.com` adresiyle gelir. Bu
  adrese kod gidebilmesi için gönderici alan adı Apple Developer → *Sign in with
  Apple for Email Communication*'a kaydedilir (SPF şart). Kaydedilmezse şifre
  kodu hiç ulaşmaz.
- Ad-soyad yalnız İLK girişte gelir; o an yazılmazsa bir daha alınamaz.

### 3.3 Google ile giriş
İki yol:
| | Tarayıcı akışı (`signInWithOAuth` + `expo-web-browser`) | Native (`@react-native-google-signin`) |
|---|---|---|
| Görünüm | Sistem tarayıcı sayfası açılır | Google'ın kendi hesap seçicisi, daha akıcı |
| Ek native modül | Yok | Var → yeni derleme |
| Expo Go | Yönlendirme Expo Go'da güvenilir değil (Expo belgesi) | Çalışmaz |
| Sunucu | Web istemci kimliği + sır | iOS + web istemci kimliği; iOS'ta nonce ayarı |

**Öneri: native.** İki yol da gerçek testte geliştirme derlemesi (EAS, Xcode'suz)
ya da TestFlight ister — Expo Go kuralının bu iş için esnemesi gerekiyor.
Google Cloud: OAuth izin ekranı (uygulama adı, logo, gizlilik adresi), iOS ve web
istemci kimlikleri. GoTrue: `GOTRUE_EXTERNAL_GOOGLE_*`.

### 3.4 Masaüstü
Aynı hesaplar masaüstünde de girebilmeli: Apple için Services ID + dönüş
adresi, Google için web istemcisi. Masaüstü ayrı bir tur.

## 4 · Kurallar (doğrulandı)
- **Apple 4.8:** Google gibi bir sosyal giriş varsa, adı ve e-postayla sınırlı,
  e-postayı gizlemeye izin veren eşdeğer bir seçenek de olmalı → Apple ile giriş.
- **Apple 5.1.1(v):** hesap açılan uygulamada hesap silme uygulama içinde (var).
- **Apple düğmesi:** Apple'ın tasarım kuralları — diğer giriş düğmelerinden
  küçük olamaz, aşağıda saklanamaz.
- **KVKK / gizlilik metni:** e-posta sağlayıcısı, Apple ve Google yeni alıcılar;
  gizlilik metnine girer (yurt dışı aktarım kararıyla birlikte, §40).

## 5 · Karar bekleyenler
1. **E-posta sağlayıcısı** — hesabı siz açarsınız:
   - Amazon SES (Frankfurt bölgesi; en ucuz, kurulumu biraz uzun)
   - Resend (en kolay kurulum; ücretsiz kotası bu iş için yeter)
   - Brevo (AB merkezli)
2. **Google'ın yolu** (öneri: native) ve testin geliştirme derlemesiyle yapılması.
3. **Apple Developer** tarafı: yetenek, `.p8` anahtarı, e-posta alan adı kaydı.
4. **Tasarım:** Claude Design brief'i hazır — `docs/giris-claude-design-prompt.md`.

## 6 · Sıra
1. SMTP + DNS + Türkçe şablonlar → şifre sıfırlama (kod) ve e-posta doğrulaması
   (Expo Go'da denenir)
2. Tasarım (Claude Design) → ekranlar birebir
3. Apple ile giriş (+ hesap silmede iptal)
4. Google ile giriş
5. Mağaza derlemesi (üretim paketi testi zorunlu) + masaüstü turu

## Kaynaklar
- Apple App Review Guidelines 4.8, 5.1.1 — developer.apple.com/app-store/review/guidelines
- Apple TN3194 (hesap silme ve belge iptali), Private Email Relay yapılandırması
- Supabase: Login with Apple, Native mobile deep linking, Email templates (`{{ .Token }}`)
- Expo: Authentication guide (Expo Go'da OAuth yönlendirmesi)
