# GİRİŞ v4 · Apple ve Google ile giriş — v3 "Işık alanı" ÜZERİNE — Claude Design promptu

**Yazıldı:** 2026-10-18. Önceki brief (`docs/giris-claude-design-prompt.md`)
bunun yerine geçti; v3 "Işık alanı" uygulamada çalışıyor ve bu brief onun
üstüne yalnız EKLER ve DEĞİŞİKLİKLER ister. v3'ün malzemesi (ışık alanı, cam
plaka, koreografi, tipografi, ölçüler) aynen kalır.

İş: işletme sahibinin girişine ve kaydına **Apple ile** ve **Google ile**
eklemek; e-postayla kayıtta ve şifre sıfırlamada **6 haneli e-posta kodu**
ekranlarını çizmek; yanlış kapıdan gelen kişi için bir **köprü ekranı**
çizmek. Personel girişi DEĞİŞMEZ.

**Effort: High.**

---

## Ekler — yalnız bunlar (başka dosya ekleme)

1. `Luera Mobil - Giris v3 Isik Alani.html` — dilin kaynağı. Bütün kararları
   (alan, cam, koreografi, "eylem opak", "bilgi taşıyan renk camdan geçmez")
   oradan al.
2. **Telefondan bugünkü hâl — bu sırayla, numaralı** (v3 uygulandıktan sonra,
   bizim değişikliklerimizle):
   1. Karşılama — marka "luera" + turuncu "timeflow" etiketi (v3'teki "luera."
      yerine bu kullanılıyor, KORU)
   2. "Hesabınıza girin"
   3. "Hesabınızı açalım" — adım 1/3, klavye açık
   4. "İşletmeniz" — adım 2/3, boş (işletme adı + "Ne iş yapıyorsunuz?")
   5. "İşletmeniz" — ad yazılmış, sektör seçili
   6. "{İşletme adı}" — adım 2/3'ün sektör hâli, altta "Devam"
   7. "Bu işletmede işi kim yapıyor?" — Yalnız ben / Ekibim var
3. **Kod e-postasının ekran görüntüsü** (telefondaki Gmail, rakamlar
   kapatılmış) — kişinin uygulamaya dönmeden önce gördüğü son şey.

Durumlar.html ve Hareket Sözleşmesi bu işin eki DEĞİL.

---

## Çıktı kuralı — önce bunu oku

- **Tek HTML dosyası:** `Luera Mobil - Giris v4 Apple Google.html`. Kareler
  aşağıdaki sırayla, her karenin başında kodu (A, B1, K2 …).
- **Tema: tek bir koyu/açık düğmesi** (v3 gibi). Aynı kareyi iki temada ayrı
  çizme — ama Apple ve Google düğmelerinin iki temadaki hâli farklı olduğu
  için B1 ve K1'i iki temada göster.
- **Telefon ölçüsü: 393 × 852.** Klavye açıkken birincil düğmenin göründüğünü
  **375 × 667**'de de göster (B2, K1-klavye, K2, S2).
- **Açıklama kısa:** her karar için tek cümle gerekçe; hareket için tek satır
  (özellik · ms · eğri).
- v3'teki gibi her hareketin yanına bedel etiketi: **A bugün yazılabilir** ·
  **B Skia ister** · **C mümkün değil**. Bu brief'te B ve C kabul edilmez.

---

## Bugünkü akış (uygulamada çalışan — değiştirme, üstüne ekle)

```
Karşılama
├─ İşletmemi yönetiyorum  → Hesabınıza girin (e-posta · şifre · Gir · Şifremi unuttum)
│                            → tek işletme: Face ID teklifi → içeri
│                            → birden çok: "Hangi işletme?" → içeri
├─ Burada çalışıyorum     → eşleştirme kodu → siz kimsiniz → PIN   (DEĞİŞMEZ)
└─ Yeni işletme oluştur   → 1/3 Hesabınızı açalım (e-posta · şifre · kural · Gizlilik · Devam)
                           → 2/3 İşletmeniz (ad + sektör → "{İşletme}" sektör hâli → Devam)
                           → "Bu işletmede işi kim yapıyor?" (Yalnız ben / Ekibim var)
                           → "{İşletme} hazır" → içeri
```

Kayıtta ad-soyad SORULMUYOR (bilerek) — Apple'dan ad gelmese de ek soru yok.

## Yeni akış

```
Karşılama
├─ İşletmemi yönetiyorum  → Hesabınıza girin
│     [Apple ile Giriş Yap] [Google ile giriş yap]  — ya da —  e-posta · şifre · Gir
│     Şifremi unuttum · "Hesabınız yok mu? Yeni işletme oluşturun"
│       Apple/Google → işletmesi VAR → bugünkü yol (Face ID / Hangi işletme)
│       Apple/Google → işletmesi YOK → B5 köprü ekranı
│
├─ Yeni işletme oluştur   → 1/3 Hesabınızı açalım
│     [Apple ile Kaydol] [Google ile kaydol]  — ya da —  e-posta · şifre · Devam
│     "Zaten hesabınız var mı? Giriş yapın"
│       Apple/Google → yeni → 2/3 İşletmeniz (kod adımı YOK, e-posta zaten doğrulanmış)
│       Apple/Google → işletmesi zaten VAR → içeri + K4 bildirimi
│       e-posta → K2 kod (adım 1'in ikinci hâli) → 2/3 → 3/3
│
└─ Burada çalışıyorum     → DEĞİŞMEZ
```

**Neden iki farklı yazı ("Giriş Yap" / "Kaydol"):** hedef kitle 40–55 yaş;
"şu an ne yapıyorum" sorusu net olsun. Ama arkada ikisi de AYNI işlem — kişi
yanlış kapıdan girerse takılmaz (B5 ve K4).

---

## Kısıtlar

### Marka ve malzeme (v3'ten — değişmez)
- Işık alanı, cam plaka, koreografi, yazı tipi (Hanken Grotesk), ölçüler v3'teki
  gibi. Karşılamada marka: **"luera" + turuncu "timeflow" etiketi** (bugünkü).
- **Turuncu `#FF5A1F` yalnız birincil eylem** (Gir · Devam · Doğrula · Kod
  gönder · Şifreyi kaydet). Kırmızı `#E07272`/`#C94040` hata · amber
  `#D9A43B`/`#B87A00` uyarı · yeşil `#5FBF64`/`#2D8F32` olumlu. Yeni renk yok.
- **Eylem opak, cam değil.** Bu kural Apple ve Google düğmelerini de kapsar.
- Bugünkü ölçüler: giriş alanı 60 pt (küçük ekranda 56), karşılama kapısı 86
  (78), ikincil eylem 52, kapı yarıçapı 22 (20). Dokunma hedefi ≥ 44 pt.

### Apple düğmesi — Apple'ın kuralı (pazarlık yok)
- **Sistemin kendi düğmesi** çizilecek (`AppleAuthenticationButton`). Yazıyı ve
  logoyu iOS koyar, dile göre kendisi çevirir; yazı tipi değiştirilemez.
- Tür: B1'de **Giriş Yap** ("Apple ile Giriş Yap"), K1'de **Kaydol** ("Apple
  ile Kaydol").
- Stil: **koyu temada BEYAZ**, açık temada **SİYAH** düğme. Köşe yarıçapı ve
  yükseklik bizim düğmelerimizle aynı.
- **Google düğmesinden küçük olamaz, onun altına saklanamaz.** Öneri: Apple
  üstte, Google altında, ikisi aynı boyda.

### Google düğmesi — Google'ın kuralı
- Standart çok renkli **"G" logosu** değiştirilmez, tek renge çevrilmez.
- Renkler Google'ın verdiği değerler: **açık tema** zemin `#FFFFFF`, kenar
  `#747775`, yazı `#1F1F1F` · **koyu tema** zemin `#131314`, kenar `#8E918F`,
  yazı `#E3E3E3`.
- Yazı: B1'de **"Google ile giriş yap"**, K1'de **"Google ile kaydol"**
  (Apple'ın yazı biçimiyle aynı aile olsun).
- Opak — camın üstünde durur, cam değildir.

### Davranış
- **Hesabın varlığı sızdırılmaz:** şifre sıfırlamada her e-postaya "kodu
  gönderdik"; kayıtta "bu e-posta kullanılıyor" yerine K2'ye gidilir.
- **Apple/Google penceresini kişi kapatırsa sessiz:** hata bandı yok, ekran
  olduğu gibi kalır.
- **Uydurma yok:** "saniyeler içinde", "%100 güvenli" gibi cümleler, olmayan
  özellik ya da sayı yok.
- Bilgisayar: kişi masaüstüne de **aynı yolla** girer (Apple/Google
  masaüstüne de geliyor) — metinler bunu söyleyebilir.

### Hareket
- v3'ün sözleşmesi: ileri 240 · geri 200 · durum 140 ms · yay sönüm 20,
  sertlik 320–340. Yalnız opacity / translate / scale (reanimated). Yok:
  gesture-handler, Skia, Lottie. `reduceMotion`'da hareket durur, bilgi
  durmaz.
- Apple/Google düğmeleri karşılamadaki kapılarla aynı doğuş ritmine katılır
  (80 ms arayla). Yeni bir gösteri hareketi İSTEMİYORUZ.

---

## Kareler

### A · Karşılama — yalnız bir satır değişir
"İşletmemi yönetiyorum" kapısının alt satırı: **"E-posta ve şifrenizle girin"**
→ **"Apple, Google ya da e-postayla girin"**. Başka hiçbir şey değişmez
(marka, vaat cümlesi, iki kapı, "Sonradan değiştirebilirsiniz.", "Yeni
işletme oluştur").

### B1 · Hesabınıza girin — boş (koyu + açık)
Yukarıdan aşağı: geri · başlık "Hesabınıza girin" · alt satır (öneri:
"Apple, Google ya da e-postanızla girin.") · **[Apple ile Giriş Yap]** ·
**[Google ile giriş yap]** · "ya da" ayracı · E-posta · Şifre (göster/gizle) ·
**Gir** (turuncu, ikisi dolana kadar pasif) · "Şifremi unuttum" · en altta
"Hesabınız yok mu? **Yeni işletme oluşturun**".
Ayraç ve iki düğmenin dikey ritmini çöz: form aşağı itildiğinde 852'de
"Şifremi unuttum" görünür kalmalı.

### B2 · Hesabınıza girin — yazarken (393 ve 375 × 667)
Klavye açık. Apple/Google düğmeleri yukarı kayıp ekrandan çıkabilir; **e-posta,
şifre ve Gir görünür kalmalı.** v3'teki "alan durmaz, geriye çekilir" kuralı.

### B3 · Hesabınıza girin — hata
Bugünkü hâl (opak kırmızı bant, kalan deneme sayısı yalnız sunucu söylerse).
Değişiklik yok; yeni düzende nasıl durduğunu göster.

### B4 · Apple/Google sürerken ve sonrası
- Basıldı → düğmede bekleme (Apple düğmesi değişemez; bekleme düğmenin yanında
  ya da ekran üstünde, sakin).
- Sağlayıcı penceresi kapandı → sessiz, ekran eski hâline döner.
- İnternet yok → bugünkü "çevrimdışı" ekranı.
- Sağlayıcı hatası → opak bant: "Apple ile giriş şu an yapılamadı. E-postanızla
  deneyebilirsiniz."

### B5 · Köprü — "Bu hesapla işletme bulamadık" (YENİ, EN ÖNEMLİ KARE)
Kişi **giriş** ekranından Apple/Google ile geldi ama bu hesapla açılmış bir
işletme yok. Sessizce boş işletme açmıyoruz; soruyoruz.
- Başlık önerisi: "Bu hesapla bir işletme bulamadık"
- Gövde: "{Apple/Google} hesabınızla henüz işletme açılmamış. Daha önce
  e-postayla kaydolduysanız e-postanızla girin."
- **[Yeni işletme oluştur]** (birincil, turuncu) → K akışının 2/3 adımına
  (hesap zaten açık, kod yok)
- **[E-postayla giriş yap]** (ikincil) → B1'e döner; arkada yanlışlıkla açılan
  boş hesap silinir (kişiye anlatma gereği yok)
- Küçük not (yalnız Apple'dan gelince): "Apple'da 'E-postamı gizle'yi
  seçtiyseniz Apple bize farklı bir adres verir; eski hesabınız bu yüzden
  bulunamamış olabilir."

### K1 · Hesabınızı açalım — adım 1/3 (koyu + açık)
Bugünkü ekranın üstüne: geri · adım çubuğu (1/3) · başlık · alt satır
(öneri: "Apple, Google ya da e-postayla açın. Bilgisayardan da aynı yolla
girersiniz.") · **[Apple ile Kaydol]** · **[Google ile kaydol]** · "ya da" ·
E-posta · Şifre · kural ("En az 8 karakter olsun, içinde bir rakam
bulunsun.") · Gizlilik Politikası satırı · **Devam** · en altta "Zaten
hesabınız var mı? **Giriş yapın**".
Klavye açık hâlini 375 × 667'de de göster (bugünkü ekran görüntüsündeki gibi).

### K2 · E-posta kodu — adım 1'in ikinci hâli (çubuk 1/3'te kalır)
- Başlık önerisi: "E-postanızı doğrulayın"
- Gövde: "**{e-posta}** adresine 6 haneli kod gönderdik. Luera TimeFlow'dan
  gelen e-postadaki kodu girin."
- **Tek kod alanı, 6 kutu görünümü** — v3'teki personel kod kutularının dili
  (cam kutu, dolan kutunun kenarı turuncu). AMA klavye **sistemin sayı
  klavyesi**, bizim tuş takımımız DEĞİL: iOS'un "Mail'den: 123456" önerisi
  yalnız sistem klavyesinde çıkıyor. Öneri şeridini çiz.
- 6. hane dolunca kendiliğinden doğrular (ayrı "Doğrula" düğmesi gerekiyorsa
  gerekçesini yaz).
- "Kod gelmedi mi? **Yeniden gönder** · 0:59" (60 sn geri sayım — sunucu
  sınırı) · "E-postayı değiştir".
- Hâller: yanlış kod (kutular kırmızı kenar, opak bant, sarsıntı YOK) · süresi
  doldu ("Yeni kod gönderin") · çok deneme (kısa kilit, geri sayım).

### K3 · Adım 2/3 ve sonrası — değişmez
"İşletmeniz" (ad + sektör), "Bu işletmede işi kim yapıyor?" ve "{İşletme}
hazır" bugünkü gibi. Yalnız Apple/Google ile gelende K2 atlandığını akış
şemasında göster; yeni kare gerekmez.
**Tek tutarsızlık:** "Bu işletmede işi kim yapıyor?" ekranında marka "luera."
(noktalı), karşılamada "luera" + "timeflow" etiketi. Karşılamadaki biçime
birleştir (gerekçen varsa tek cümleyle yaz).

### K4 · "Zaten işletmeniz var" bildirimi
Kişi **kayıt** ekranından Apple/Google'a bastı ama bu hesabın işletmesi var →
doğrudan içeri. İçeride üstte, karşılamadaki "hesap silindi" plakasıyla aynı
dilde (cam plaka, 6 sn, dokununca kapanır) kısa bir not: "Bu hesapla zaten
işletmeniz var — giriş yaptınız."

### S1 · Şifrenizi yenileyelim — e-posta
Bugünkü ekran BAĞLANTI diyor; KOD olacak. Tek alan, **Kod gönder**. Altında:
"Hesabınız varsa kodu birkaç dakika içinde alırsınız." Apple/Google ile açılmış
hesabın da şifresi olmayabilir — metin "şifrenizi unuttuysanız" değil,
"yeni şifre belirleyin" diline yakın olsun.

### S2 · Şifrenizi yenileyelim — kod
K2'nin aynı dili ve hâlleri.

### S3 · Yeni şifre
Tek alan + göster/gizle, kuralı yazılı, **Şifreyi kaydet**. Kaydedince
doğrudan içeri (yeniden giriş istemeden) — geçişi göster.

### P1 · Profil › Hesap — küçük ek
- "Giriş yöntemi" satırı: **Apple** / **Google** / **E-posta** (simgesiyle).
- "Şifre değiştir" yalnız şifresi olan hesapta; Apple/Google hesabında
  "Şifre belirle" (isteğe bağlı — bilgisayardan e-postayla da girmek için).
- Hesap silme onayında Apple hesabı için tek satır: "Apple ile girişiniz de
  kaldırılır."

---

## Çizmeyeceklerin
- Personel girişi (kod · siz kimsiniz · PIN) ve dönüş girişi (Face ID kilidi)
  — değişmez.
- Telefon numarasıyla giriş, sihirli bağlantı, "Facebook ile" vb. — yok.
- Abonelik / ödeme ekranı — telefonda satış yok (App Store 3.1.1).
- Masaüstü giriş ekranı — ayrı tur.
