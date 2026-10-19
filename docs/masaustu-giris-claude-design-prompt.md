# MASAÜSTÜ GİRİŞ · timeflow.lueratech.com/login — yeniden — Claude Design promptu

**Yazıldı:** 2026-10-18. Telefonun girişi v3 "Işık alanı" ile yenilendi ve v4'te
Apple/Google ekleniyor (`docs/giris-v4-claude-design-prompt.md`). Masaüstü
girişi bunların gerisinde kaldı ve **zorunlu olarak** yenileniyor: Apple ya da
Google ile hesap açan salon sahibinin şifresi yok — masaüstüne de aynı yolla
girebilmeli. Hedef: **daha premium, telefonla aynı aileden** bir masaüstü
girişi.

**Effort: High.**

---

## Ekler — yalnız bunlar

1. `01 bugunku-masaustu-giris.png` — bugünkü giriş sayfası (1440 geniş).
2. `02 Luera Mobil - Giris v3 Isik Alani.html` — telefonun giriş dili. Işık
   alanı, cam plaka, renk kütleleri, "eylem opak" kuralı buradan. Masaüstü bu
   ailenin üyesi olacak.
3. `03 Luera Auth Screens (yalniz bilesen dili).html` — eski bir UI kiti.
   **Yalnız bileşen dili için** (alan, sağlayıcı düğmesi, kod kutusu ölçüleri).
   İçeriği ÜRÜNÜMÜZ DEĞİL — aşağıdaki "Kitten alma" listesine bak.
4. `04 kod-epostasi-gizli.png` — kişinin aldığı kod e-postası (rakamlar
   gizli). Kod kutusu ekranla aynı aileden olsun.

Durumlar.html ve Hareket Sözleşmesi bu işin eki DEĞİL.

---

## Çıktı kuralı

- **Tek HTML dosyası:** `Luera Masaustu - Giris v2 Isik Alani.html`. Kareler
  aşağıdaki sırayla, her karenin başında kodu (M1, M2 …).
- **Ana kare 1440 × 900.** Ayrıca: 1280 × 800 (dizüstü), 1024 × 768 (tablet
  yatay), **390 × 844** (telefon tarayıcısı — salon sahibi linke telefondan da
  tıklıyor).
- **Tema:** koyu ve açık; tek düğmeyle değişsin, kareyi iki kez çizme. M1 ve
  M4'ü iki temada göster (Apple/Google düğmeleri temaya göre değişiyor).
- **Açıklama kısa:** karar başına tek cümle gerekçe; hareket için tek satır
  (özellik · ms · eğri).
- Web'de çalışacak: **yalnız CSS + az JS.** WebGL, canvas, video, ağır
  kütüphane yok. Işık alanı CSS radyal gradyan + `filter: blur` +
  `backdrop-filter` ile.

---

## Bugünkü sayfa — sorunlar (ekran görüntüsünden ve koddan)

1. **"Hesabın yok mu? Kayıt ol" iki kez** — sağ üstte ve düğmenin altında.
2. **İki ayrı telif satırı** — sol altta "© 2026 LUERA · TİMEFLOW · V2", formun
   altında "© 2026 Luera · Tüm hakları saklıdır".
3. **Hitap karışık:** "Tekrar hoş geldin", "Hesabın yok mu?" (sen) ama sol
   metin "ekibinin … — **siz** müşterilere odaklanın" (aynı cümlede sen ve
   siz). Telefon uygulaması baştan sona **siz** diyor; masaüstü de **siz**.
4. **Sol görsel ürünle ilgisiz:** ızgara + hedef çizimi soyut, telefonun ışık
   alanıyla akrabalığı yok. Ortada büyük ölü boşluk.
5. **Marka iki farklı:** masaüstünde "luera." (noktalı), telefonun
   karşılamasında "luera" + turuncu "timeflow" etiketi. Telefondaki biçim esas.
6. Yer tutucu "sen@luera.ai" — ürünün dili değil (telefonda
   "ornek@salonunuz.com").
7. **"Unuttum?" çalışmıyor** — masaüstünde şifre sıfırlama akışı yok.
8. **Apple ve Google yok.**
9. Kayıt aynı sayfada bir mod (ad · e-posta · şifre); telefonun kayıt adımları
   (işletme adı · sektör) masaüstünde yok.

---

## Akış (telefonla AYNI mantık)

```
/login  "Hesabınıza girin"
   [Apple ile Giriş Yap] [Google ile giriş yap]  — ya da —  e-posta · şifre · Giriş yap
   Şifremi unuttum   ·   "Hesabınız yok mu? Yeni işletme oluşturun"  (TEK yerde)
     Apple/Google → işletmesi VAR → içeri (bugünkü açılış animasyonu)
     Apple/Google → işletmesi YOK → M3 köprü
/login?mode=signup  "Hesabınızı açalım"
   [Apple ile Kaydol] [Google ile kaydol]  — ya da —  e-posta · şifre · Devam
     e-posta → M5 kod → M6 İşletmeniz (ad + sektör) → içeri
     Apple/Google → yeni → M6 (kod yok)   ·   işletmesi zaten VAR → içeri + M11
   /fiyatlar'dan plan seçilerek gelindiyse: kayıt bitince doğrudan ödeme
   sayfasına (bugünkü davranış) — formun üstünde küçük bir şerit: "Pro · yıllık
   seçildi".
Şifremi unuttum → M8 e-posta → M9 kod → M10 yeni şifre → içeri
```

Arkada Apple/Google'da "Giriş Yap" ile "Kaydol" AYNI işlem; yanlış kapıdan
gelen takılmaz (M3, M11).

---

## Kısıtlar

### Marka ve malzeme
- **Telefonun ailesi:** ışık alanı (beş kütle: kor `#FF5A1F`, mürekkep
  `#2A40A8`, erik `#963478`, teal `#14968C`, sis `#FFD6AA`), üstünde bulanıklık
  ve perde; içerik **cam plakada**. Masaüstünde alan geniş ekranda nefes
  alabilir — ama **form plakasının arkası her zaman sakin** (kontrast
  garantisi v3'teki perde ve dolgu kuralıyla).
- Marka: **"luera" + turuncu "timeflow" etiketi** (telefonun karşılamasındaki).
- Yazı tipi Hanken Grotesk. Renk envanteri dışına çıkma: turuncu yalnız
  **birincil eylem** (Giriş yap · Devam · Doğrula · Kod gönder · Şifreyi
  kaydet); kırmızı `#E07272`/`#C94040` hata; amber `#D9A43B`/`#B87A00` uyarı;
  yeşil `#5FBF64`/`#2D8F32` olumlu.
- **Eylem opak, cam değil;** bilgi taşıyan renk (hata kırmızısı) camdan
  geçmez — v3'ün kuralları.

### Apple ve Google düğmeleri (web)
- **Apple:** Apple'ın web düğme kuralı — siyah ya da beyaz, Apple logosu,
  "Apple ile Giriş Yap" / "Apple ile Kaydol"; Google düğmesinden küçük
  olamaz, altına saklanamaz.
- **Google:** standart çok renkli "G"; açık temada zemin `#FFFFFF`, kenar
  `#747775`, yazı `#1F1F1F` · koyu temada zemin `#131314`, kenar `#8E918F`, yazı
  `#E3E3E3`. "Google ile giriş yap" / "Google ile kaydol".
- İkisi aynı boyda, Apple üstte (ya da yan yana — gerekçesini yaz).
- Tıklayınca açılan Apple/Google penceresi kapatılırsa **sessiz**.

### Metin
- **Siz** dili, kısa, sakin. Hedef kitle 40–55 yaş salon sahibi.
- **Uydurma yok:** "14 gün ücretsiz", "kart gerekmez", "12K+ ekip",
  "saniyeler içinde", "%100 güvenli" yok. Olmayan sayfa yok (Kullanım
  Koşulları sayfası YOK — yalnız Gizlilik Politikası).
- **Hesabın varlığı sızdırılmaz:** şifre sıfırlamada her e-postaya "kodu
  gönderdik"; kayıtta zaten kayıtlı e-posta da kod ekranına gider.
- Sol taraftaki vaat cümlesi telefonla aynı aileden: "Salonunuzun
  randevuları, kasası ve ekibi tek yerde." (daha iyisini önerebilirsin —
  iddia içermeden).

### Erişilebilirlik ve web
- Klavyeyle tam gezinme, görünür odak halkası (turuncu, 2 px, ofsetli).
- Kontrast WCAG AA: form metni ≥ 4.5:1 — ışık alanı hangi renge dönerse
  dönsün (v3'teki dolgu hesabı gibi kanıtla).
- `prefers-reduced-motion`: alan durur (elle seçilmiş bir karede), bilgi
  durmaz.
- Tarayıcının şifre yöneticisi ve "kodu doldur" önerisi çalışmalı:
  `autocomplete="email" / "current-password" / "new-password" /
  "one-time-code"`. Kod alanı tek `<input>`, 6 kutu GÖRÜNÜMÜ.

### Hareket
- Ana hareket ışık alanı (yavaş, kendi kendine). Form plakası açılışta
  bir kez belirir (opacity + 12–20 px yükselme, 240 ms). Mod değişimi
  (giriş ↔ kayıt) aynı plakanın içinde, kayma yok — çapraz solma 200 ms.
- Düğme üzerine gelme: yalnız ton; zıplama, gölge patlaması yok.

---

## Kareler

### M1 · Hesabınıza girin — 1440 × 900 (koyu + açık)
Sol: marka, vaat cümlesi, ışık alanı (sayfanın tamamında; sol tarafta
canlı). Sağ: cam plaka — başlık "Hesabınıza girin", alt satır (öneri:
"Apple, Google ya da e-postanızla girin."), **[Apple ile Giriş Yap]**,
**[Google ile giriş yap]**, "ya da", E-posta, Şifre (göster/gizle, üstünde
"Şifremi unuttum"), **Giriş yap**, altında TEK "Hesabınız yok mu? Yeni
işletme oluşturun". Telif satırı TEK, sayfanın en altında, sessiz.
Ölü boşluk bırakma: alan ile plaka arasındaki dengeyi kur.

### M2 · Giriş — hâller
Alanlar dolu/odaklı · yanlış e-posta ya da şifre (hangisi olduğu söylenmez;
kalan deneme yalnız sunucu söylerse) · kısa kilit (geri sayım) · internet yok
· Apple/Google sürerken (bekleme) · Apple/Google hatası ("… şu an
yapılamadı. E-postanızla deneyebilirsiniz.").

### M3 · Köprü — "Bu hesapla bir işletme bulamadık"
Giriş ekranından Apple/Google ile gelen, işletmesi olmayan kişi.
**[Yeni işletme oluştur]** (birincil) → M6 · **[E-postayla giriş yap]**
(ikincil) → M1 (arkada yanlışlıkla açılan boş hesap silinir). Apple'dan
gelende küçük not: "Apple'da 'E-postamı gizle'yi seçtiyseniz Apple bize
farklı bir adres verir; eski hesabınız bu yüzden bulunamamış olabilir."

### M4 · Hesabınızı açalım (koyu + açık)
**[Apple ile Kaydol]** · **[Google ile kaydol]** · "ya da" · E-posta · Şifre
(kural yazılı: "En az 8 karakter olsun, içinde bir rakam bulunsun.") ·
Gizlilik Politikası satırı · **Devam** · "Zaten hesabınız var mı? Giriş
yapın". Adım göstergesi telefondaki gibi (1/2 ya da 1/3 — sen karar ver,
gerekçesini yaz). Bugünkü "Ad" alanı kalkıyor (telefonda da sorulmuyor).
/fiyatlar'dan gelindiyse plan şeridi.

### M5 · E-posta kodu
"**{e-posta}** adresine 6 haneli kod gönderdik. Luera TimeFlow'dan gelen
e-postadaki kodu girin." Tek alan, 6 kutu görünümü, 6. hanede kendiliğinden
doğrular. "Kod gelmedi mi? **Yeniden gönder** · 0:59" (60 sn — sunucu sınırı) ·
"E-postayı değiştir". Hâller: yanlış kod (kırmızı kenar, opak bant, sarsıntı
yok) · süresi doldu · çok deneme.

### M6 · İşletmeniz
Telefondaki adımın masaüstü hâli: İşletme adı ("Adı müşterilere gönderilen
hatırlatmalarda görünür.") + "Ne iş yapıyorsunuz?" (Kuaför · Güzellik ·
Dövme · Restoran · Diğer) + **Devam**. Geniş ekranda sektörler iki sütun
olabilir.

### M7 · Bu işletmede işi kim yapıyor?
Telefondaki soru: **Yalnız ben** / **Ekibim var** — "Uygulama cevabınıza
göre açılır. Sonradan İşletme'den değiştirebilirsiniz."

### M8 · Şifrenizi yenileyelim — e-posta
Tek alan, **Kod gönder**. "Hesabınız varsa kodu birkaç dakika içinde
alırsınız." (Apple/Google hesabının da şifresi olmayabilir — dil "yeni şifre
belirleyin"e yakın.)

### M9 · Şifrenizi yenileyelim — kod
M5'in aynı dili ve hâlleri.

### M10 · Yeni şifre
Tek alan + göster/gizle, kural yazılı, **Şifreyi kaydet** → doğrudan içeri.

### M11 · "Zaten işletmeniz var" bildirimi
Kayıttan Apple/Google ile gelen ama işletmesi olan kişi doğrudan içeri;
uygulamanın üstünde 6 sn'lik sakin bir not: "Bu hesapla zaten işletmeniz
var — giriş yaptınız."

### M12 · Dar ekranlar
M1'in 1024 × 768 ve **390 × 844** hâli: alan arkaya geçer, plaka tek sütun,
Apple/Google ve form ekrana sığar; klavye açıkken "Giriş yap" görünür.

---

## Kitten alma (03 numaralı ek) — bunlar ÜRÜNÜMÜZ DEĞİL
İngilizce metinler · "Free 14-day trial, no card required" (gerçek model
farklı) · "Already trusted by 12K+ teams" · reCAPTCHA · Terms sayfası ·
magic link · authenticator/2FA/güvenlik anahtarı/SMS · "Keep me signed in"
kutusu · şifre gücü çubuğu (bizde tek kural cümlesi var) · ad-soyad alanları.
Kitten alınacak olan yalnız bileşen ölçüleri ve hâlleri (alan, odak,
sağlayıcı düğmesi, kod kutusu, zamanlayıcı satırı).

## Çizmeyeceklerin
- Personel girişi (masaüstünde yok).
- Fiyatlandırma ve ödeme sayfası (ayrı tasarım var: "Luera Fiyatlandırma").
- Uygulamanın içi, giriş sonrası açılış animasyonu (bugünkü kalır).
