> **YERİNE GEÇTİ (2026-10-18):** v3 "Işık alanı" uygulandı; Apple/Google turu için
> güncel brief `docs/giris-v4-claude-design-prompt.md`. Bu dosya tarihçe.

# GİRİŞ · İşletme sahibinin girişi, kaydı ve şifre sıfırlama — Claude Design promptu

Luera TimeFlow'un işletme sahibi girişini baştan çiz: **Apple ile devam et**,
**Google ile devam et**, **e-posta ve şifre**, **şifremi unuttum (e-postaya
gelen 6 haneli kodla)** ve **yeni hesapta e-posta doğrulaması**. Hedef:
profesyonel, sakin, tek elle ve ilk seferde anlaşılır bir giriş.

**Ekler — yalnız bunlar (başka dosya ekleme):**
1. **Ekran görüntüleri (telefondan, bugünkü kodla):** Karşılama ekranı,
   "Hesabınıza girin" ekranı, "Şifremi unuttum" ekranı, kayıt ekranının ilk
   adımı ("Hesabınızı açalım"). Bunlar bugünkü dil; aynı aileden olmalı ama
   kopyası değil.
2. `Luera Landing.html` — Luera'nın marka dili.
3. **Kod e-postasının ekran görüntüsü** (telefondaki Gmail, kod rakamları
   kapatılmış) — kişinin uygulamaya geçmeden önce gördüğü son şey; kod kutusu
   ekranla aynı aileden olsun.

## Güncel durum (2026-10-18) — bunları sabit kabul et

- **Kod e-postası CANLI.** Gönderen "Luera TimeFlow" `no-reply@lueratech.com`;
  konular "Şifre sıfırlama kodunuz" / "E-posta doğrulama kodunuz". Kod 6
  hane, e-postada bağlantı YOK — kişi kodu uygulamaya yazar (ya da iOS
  "e-postadan doldur" önerisiyle). Ekrandaki cümle göndereni adıyla anabilir:
  "Luera TimeFlow'dan gelen e-postadaki 6 haneli kodu girin."
- **Yeniden gönderme en erken 60 sn sonra** (sunucu sınırı) — G5/G7'deki geri
  sayım 60'tan başlar.
- **Apple ve Google YALNIZ işletme sahibinin iki ekranında** (karar
  2026-10-15): G2 "Hesabınıza girin" (Karşılama → İşletmemi yönetiyorum) ve G4
  "Hesabınızı açalım" — bu kayıt ekranı **Tek kişilik** ve **Yeni işletme
  oluştur** yollarının ORTAK ilk adımı (bugünkü `signup/account`). Personel
  girişi (ekip kodu + şifre) değişmez.
- Masaüstü ayrı bir tur; bu brief yalnız telefon.

**Effort: High.**

---

## Çıktı kuralı — önce bunu oku

- **Tek HTML dosyası:** `G-giris.html`. Kareler aşağıdaki sırayla.
- **Tema: tek bir koyu/açık düğmesi.** Aynı kareyi iki temada ayrı çizme.
- **Telefon ölçüsü: kareler 393 × 852.** 375 × 667'de klavye açıkken birincil
  düğme görünmüyorsa o kareyi 375 × 667'de de çiz.
- **Açıklama kısa:** her karar için tek cümle gerekçe, her hareket için tek
  satır (özellik · ms · eğri).

## Kısıtlar

- **Renk envanteri — yeni renk icat etme:** turuncu `#FF5A1F` yalnız **zaman ve
  eylem** · kırmızı `#E07272`/`#C94040` hata · amber `#D9A43B`/`#B87A00` uyarı ·
  yeşil `#5FBF64`/`#2D8F32` olumlu. Zemin, yüzey ve yazı tonları ekteki
  ekranlardan.
- **Yazı tipi:** Hanken Grotesk. Büyük harf metin katmanında yazılır.
- **Dokunma hedefi ≥ 44 pt.** Hedef kitle 40–55 yaş, salon sahibi, ayakta.
- **Apple düğmesi Apple'ın kuralıyla:** "Apple ile devam et", siyah (koyu temada
  beyaz), Apple logosu, köşe yarıçapı diğer düğmelerle aynı; **diğer giriş
  düğmelerinden küçük olamaz ve onların altına saklanamaz.** Google düğmesi
  Google'ın kuralıyla: beyaz zemin, çok renkli "G", "Google ile devam et".
- **Hareket:** ekran ileri 240 · geri 200 · durum 140 ms · yay sönüm 20,
  sertlik 320–340. Yalnız opacity / translate / scale (reanimated). Yok:
  gesture-handler, Skia, Lottie. `reduceMotion`'da hareket durur, bilgi durmaz.
- **Uydurma yok:** olmayan özellik, sayı, iddia çizilmez. "Saniyeler içinde",
  "%100 güvenli" gibi cümleler yok.
- **Hesabın varlığı sızdırılmaz:** "Bu e-postayla hesap yok" denmez; şifre
  sıfırlamada her e-postaya "kodu gönderdik" denir.

---

## Kareler

### G1 · Karşılama (bugünkü ekranın yerine)
İki yol kalıyor: **"İşletmemi yönetiyorum"** ve **"Burada çalışıyorum"**
(personel — ekip koduyla giriş; bu iş dokunulmuyor, yalnız yeri). Tek kişilik
işletme kurma yolu da karşılamada kalır.

### G2 · Giriş — tek ekran
Yukarıdan aşağı: başlık ("Hesabınıza girin" ya da daha iyisi), **Apple ile devam
et**, **Google ile devam et**, "ya da" ayracı, **E-posta**, **Şifre**
(göster/gizle), **Giriş yap**, **Şifremi unuttum**; en altta "Hesabınız yok mu?
**Kaydolun**". Apple/Google ile ilk giriş hesabı zaten açar — bunu tek satırla
söyle. Face ID ile hızlı giriş açıksa bu ekranın nasıl değiştiğini ayrı bir
karede göster (bugün var).

### G3 · Giriş — hata hâlleri
- Yanlış e-posta ya da şifre (hangisi olduğu söylenmez).
- Çok deneme → kısa kilit, geri sayımla.
- İnternet yok.
- Apple/Google penceresini kişi kapattı (sessiz; hata değil).

### G4 · Kayıt — "Hesabınızı açalım" (Tek kişilik ve Yeni işletme ORTAK)
Ad soyad, e-posta, şifre (kuralı yazılı: en az 8 karakter, içinde bir rakam — bugünkü kural), gizlilik politikası
bağlantısı (kullanım koşulları sayfası YOK — çizme), **Hesap oluştur**. Apple/Google düğmeleri burada da üstte.

### G5 · E-posta doğrulama kodu
"{e-posta} adresine 6 haneli kod gönderdik." Tek kod kutusu (6 hane, iOS'un
"e-postadan kodu doldur" önerisine uygun), **Doğrula**, "Kod gelmedi mi?
Yeniden gönder · 00:59" geri sayımıyla, "E-postayı değiştir". Yanlış kod ve
süresi dolmuş kod hâlleri.

### G6 · Şifremi unuttum — e-posta
Tek alan, **Kod gönder**. Altında: "Hesabınız varsa kodu birkaç dakika içinde
alırsınız."

### G7 · Şifremi unuttum — kod
G5'in aynı dili. Yanlış kod / süresi doldu / yeniden gönder.

### G8 · Yeni şifre
Tek alan + göster/gizle, kuralı yazılı, **Şifreyi kaydet**. Kaydedince doğrudan
içeri (yeniden giriş istemeden) — geçişi göster.

### G9 · Apple "E-postamı gizle" ile gelen kişi
İlk girişte ad gelmediyse tek soruluk ara ekran: "Size nasıl hitap edelim?"
(işletme adı kayıt akışının sonraki adımında zaten soruluyor — bugünkü
`signup/business` adımı).

---

## Çizmeyeceklerin
- Personel girişi (ekip kodu, şifre) — bu turda yok.
- Abonelik / ödeme ekranı — telefonda satış ekranı yok (App Store 3.1.3).
- Telefon numarasıyla giriş, sihirli bağlantı — bu turda yok.
