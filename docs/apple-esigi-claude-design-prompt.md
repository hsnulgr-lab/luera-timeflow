# Apple Eşiği · Açılış, hesap silme, kapalı kapılar — Claude Design promptu

**Ekler:**
1. `Luera Mobil - Giris v3 Isik Alani.html` — **görsel dilin kaynağı** (ışık alanı,
   buzlu cam, `luera timeflow` hapı). Bu turun ekranlarının çoğu bu dilde.
2. `docs/design-reference/Luera Mobil - Mudur 27 Profil.html` — uygulama içi opak
   dil. Hesap silme bu dilde.
3. `docs/design-reference/Luera Mobil - Durumlar.html` — durum/hata dili.
4. **Ekran görüntüleri (telefondan, bugünkü hâl):** müdürün Hesap ekranı ·
   personelin Profil ekranı. Diğerlerinin görüntüsü YOK ve bu bir eksiklik değil:
   üçü (splash, 404, açılış) **hiç tasarlanmadı**, ikisi (hesap silme, erişim
   kapalı) mevcut bileşenlerle tasarım turu görmeden yazıldı. §4'te hâl hâl
   tarif edildiler — **sıfırdan çiz.**

**Effort: High.**

---

## 0 · Bu tur neden var

Uygulama **App Store'a gönderilecek.** Apple'ın incelemecisi uygulamayı gerçek bir
hesapla açacak, hesap silmeyi **deneyecek** ve gördüğü her ekranın tamamlanmış
olmasını bekleyecek (Yönerge 2.1 · App Completeness).

Bu turun ekranları, ürünün **günlük kullanımda görünmeyen** ama incelemecinin
mutlaka göreceği kenarları:

- Uygulamanın **ilk karesi** — bugün sistemin varsayılan boş ekranı. Splash hiç
  yapılandırılmadı.
- **Hesap silme** — Apple'ın açıkça test ettiği ekran (Yönerge 5.1.1(v)), tasarım
  turu görmeden yazıldı.
- **Erişim kapalı** — abonelik bitince çıkan ekran; müdür ve personel için ayrı.
- **Bulunamayan sayfa** — bugün expo-router'ın çıplak İngilizce "Unmatched Route"
  ekranı çıkıyor.

**Bu turun DIŞINDA bırakılanlar, bilerek:** gizlilik politikası ve destek
sayfaları (masaüstü ürününün sitesinde yaşayacak, orası başka bir görsel dil —
ve iş tasarımdan çok metin), mağaza ekran görüntüleri (başka bir zanaat, ve
gerçek değerleri ancak uygulamanın son hâli elimizdeyken ortaya çıkıyor).

Bunlar "kenar" oldukları için bugüne kadar sıra gelmedi. Ama bir ürünün
olgunluğu tam olarak buralardan okunuyor: her şey yolundayken herkes iyi
görünür.

**Bu bir akış değişikliği turu değil.** Kararlar verildi (§1). Tasarımın işi
onları **sakin, dürüst ve tamamlanmış** hissettiren ekranlara çevirmek.

---

## 1 · Verilmiş kararlar — değişmez

1. **Uygulamada fiyat, plan, "yükselt", "abone ol" YOK.** Hiçbir ekranda, hiçbir
   metinde. App Store 3.1.3(f): mobil, ücretli web aracının **ücretsiz
   refakatçisi**. "Erişim kapalı" ekranı bile ödeme çağrısı yapmaz — yalnız
   durumu söyler ve müdüre bilgisayarı işaret eder.
2. **Hesap silme uygulamadan yapılabilir** ve gerçekten siler. "Siteye gidin"
   kabul edilmiyor.
3. **Personel hesabını silemez.** Silme yalnız işletme sahibinin hakkı; personel
   ekranında bunun yerine "işletme sahibiyle konuşun" der.
4. **İki görsel dil var ve bilinçli:** giriş akışı ışık alanı + cam ("henüz
   içeride değilsin"), uygulama içi opak sıcak yüzeyler ("içeridesin"). Bu turun
   ekranları ikisine de düşüyor — hangisinin nerede olduğunu §4 söylüyor.
5. **Marka hapı** (`luera timeflow`) karşılamada ve eşleştirmede tam hâliyle;
   içeride kısa `luera.`. Splash kapıda olduğu için **tam hâl.**

---

## 2 · Bu turun ekranları

```
UYGULAMA AÇILIYOR
  Splash (sistem) ──► Açılış kararı ──┬─► Karşılama       (oturum yok)
                                      ├─► Şifre ekranı    (telefon bağlı)
                                      ├─► Uygulama        (oturum var)
                                      └─► Erişim kapalı   (abonelik bitmiş)
                        │
                        └─ okunamadı ─► "Tekrar dene"

HESABI SİL   Profil ─ Hesap ─ Hesabımı sil ─► sonuçlar ─► onay ─► şifre ─► silindi

BULUNAMADI   Geçersiz derin bağlantı ─► 404
```

---

## 3 · Bugün kodda ne var

| Ekran | Durum |
|---|---|
| **Splash** | Yapılandırılmamış. `assets/splash-icon.png` (1024×1024) duruyor, kullanılmıyor |
| **Açılış** (`app/index.tsx`) | Karar verilene kadar **boş zemin**; okunamazsa "Tekrar dene" ekranı |
| **Hesap silme** (`profil/hesap-sil.tsx`) | Yazılı ve **canlı çalışıyor**: sonuç listesi, "Önce kayıtlarınızı indirin", SÜRE notu, onay kutusu, şifreyle doğrulama. Tasarım turu görmedi |
| **Erişim kapalı** (`(auth)/locked.tsx`) | İki varyant: müdür (ne yapacağını söyler) · personel (işletme sahibini arar). Tasarım turu görmedi |
| **404** | **Yok** |

---

## 4 · Ekran ekran — ne çizilecek

### A · Splash → açılış (tek an olarak)

Bu **iki ekran değil, bir geçiş.** Sistem splash'ı donuk bir görüntü; ardından
uygulama kendi kararını verirken bir an daha geçiyor. İkisi arasında kopukluk
olursa kullanıcı "bir şey oldu mu" diye düşünüyor.

Çizilecek: splash karesi (marka), karar anı, ve oraya varılan dört yol.

**Üç kural — bu ekranın çerçevesi:**

**① Splash karesi ORTAK PAYDA olmalı, "ilk ekran" değil.**
Apple'ın yönergesi açılış ekranının bir marka gösterisi olmamasını, uygulamanın
ilk ekranına benzemesini söylüyor — açılış "bekleme" değil "anında" hissetsin
diye. Ama bizde **ilk ekran kim olduğuna göre değişiyor**: karşılama · şifre ·
uygulamanın içi · erişim kapalı. Sistem ekranı bunu bilemez, çünkü henüz
hiçbir kod çalışmadı. O yüzden splash karesi dördünün de **ortak paydası**
olacak: zemin ve en fazla markanın kendisi. Belirli bir ekranı taklit eden bir
splash, üç kullanıcıdan ikisinde yanlış vaat olur.

**② YAPAY GECİKME YOK.**
Karar anı çoğu zaman 200–400 ms. Üstüne 1,5 saniyelik bir marka animasyonu
koymak, kullanıcıya hiçbir şey vermeden bekleme eklemek olur — hem de günde on
kez açtığı bir uygulamada. Markalı açılış animasyonu modası uygulamaları kendi
elleriyle yavaşlatıyor; buna katılmıyoruz.

Marka anı **geçişin kendisi** olsun: statik kare ile karşılamanın ışık alanı
aynı zemini ve aynı marka konumunu paylaşsın, kod yüklenince marka yerinde
dururken alan aydınlansın. Hareket var, bekleme yok. Karar hızlıysa kullanıcı
onu neredeyse hiç görmüyor — **istenen de bu.**

**③ İki tema TEKNİK bir gereklilik, tercih değil.**
Uygulama `userInterfaceStyle: automatic`: telefon koyu temadaysa koyu açılıyor.
Açılış karesinin koyu ve açık iki hâli olmak zorunda, yoksa koyu temadaki
kullanıcı beyaz bir flaşla karşılaşır.

**Cevaplanacak:**
- **Eşik kaç ms?** 400 ms'lik bir yükleme göstergesi çakma gibi görünür;
  3 sn'lik boş ekran arıza gibi. Eşikten önce ne görünüyor, sonra ne beliriyor?
- **Okunamadı hâli:** bugün ayrı bir "Tekrar dene" ekranı. Sessizce karşılamaya
  düşmek YANLIŞ olurdu — geçici bir okuma hatası yüzünden geçerli oturumu olan
  kişiyi yeniden giriş yapmaya zorlardı.

### B · Hesabı sil — Apple'ın deneyeceği ekran

Sıra bugün şöyle: **sonuçlar → "önce kayıtlarınızı indirin" → SÜRE → onay kutusu
→ şifre → silindi.**

Hâller:
1. **Sahip** — silme mümkün. Ekranda ne kaybedileceği tek tek yazılı (randevular,
   müşteriler, hizmetler, personel adları — sayılar gerçek, uydurulmuyor).
2. **Sahip değil** — "Bu işletmenin başka bir sahibi var" / personel.
   **Bu bir ret değil, bir yol tarifi:** kime söyleyeceği yazılı.
3. **Şifre yanlış** — silme olmadı, ekran bunu söylüyor.
4. **Silindi** — nereye düşüyor, ne kadar duruyor.

Tasarımın asıl sorusu: **bu ekran korkutmadan ciddi olmalı.** Kırmızı bir duvar
kurup kullanıcıyı vazgeçirmeye çalışmak da, sıradan bir ayar satırı gibi
göstermek de yanlış. Geri dönüşü olmayan bir işi, elini tutmadan, dürüstçe
anlatmak.

**Dikkat:** "Önce kayıtlarınızı indirin" satırı bugün **çalışmıyor** — dışa
aktarma yolu yok. Ya gerçekten bir yol gösterecek (masaüstü) ya da satır
kalkacak. **Kararını sen ver ve gerekçelendir.**

### C · Erişim kapalı

İki varyant, iki farklı sorumluluk:

- **Müdür:** ödeyebilir. Ama **uygulamada ödeme yok** — metin durumu söyler ve
  bilgisayarı işaret eder. Fiyat, plan, "yükselt" geçmez.
- **Personel:** ödeyemez. Ona "yetkiniz yok" DENMEZ; sebep yazılır ve
  yapabileceği tek somut şey verilir (işletme sahibini ara).

Bu ekran bir hata ekranı değil — **kapalı bir kapı.** Fark tasarımda görünmeli:
hata "bir şey ters gitti" der, kapalı kapı "burası şu an kapalı, sebebi bu"
der.

### D · Bulunamadı (404)

Geçersiz bir derin bağlantı geldiğinde. Kişi bir yere gitmek istedi ve orası yok.

- Tek çıkış yolu olmalı: nereye? (Müdürse akışa, personelse Bugün'e, oturum
  yoksa karşılamaya.)
- **Suçlayıcı olmayacak** ve teknik terim geçmeyecek ("route", "404", "hata kodu").

---

## 5 · Değişmez kısıtlar

- **SPLASH ANİMASYONLU OLAMAZ.** iOS'ta sistem açılış ekranı, uygulamanın kodu
  daha çalışmadan çiziliyor: tek bir **statik görüntü** ve arka plan rengi.
  Hareket ancak kod yüklendikten sonra, bizim ilk ekranımızda başlayabilir.
  Splash karesi **durağan** çizilecek; tasarlanacak hareket, o durağan kareden
  uygulamanın ilk karesine geçiştir. Splash'ın kendisine hareket veren bir
  öneri **uygulanamaz** (bkz. §4·A'daki üç kural).
- **Dokunma hedefi ≥ 44 pt.** Hedef kitle 40–55 yaş.
- **Hiçbir şey yalan söylemez.** Çalışmayan düğme, sahte onay, olmayan bir yolu
  gösteren metin yok. ("Kayıtlarınızı indirin" maddesi tam olarak bu yüzden
  soru işareti.)
- **Abonelik / plan / fiyat hiçbir ekranda geçmez** (App Store 3.1.3(f)).
- **`reduceMotion`:** hareket durur, bilgi durmaz. **Bu hâli çiz.**
- **375 × 667** — hesap silme ekranı bu genişlikte de sığmalı.
- **Renk envanteri:** turuncu `#FF5A1F` yalnız zaman ve eylem · kırmızı
  `#E07272`/`#C94040` risk · amber `#D9A43B`/`#B87A00` uyarı · yeşil
  `#5FBF64`/`#2D8F32` olumlu. Koyu `bg #120E08` · `surf #1C1710` · `card #241E16`
  · `tx #F3EDE3`. Açık `bg #F3ECE0` · `surf #FAF7F3` · `card #FFFDFB` · `tx #0E0E0E`.
- **Yazı:** Hanken Grotesk 400–900. Rakamlar tabular.
- **İki tema da çizilir.**
- Hareket için bedel etiketi: **A** reanimated ile bugün yazılır · **B** Skia
  ister (bu turda uygulanamaz — A karşılığını da çiz) · **C** mümkün değil.

---

## 6 · Cevaplamanı istediğim sorular

1. **Splash ile uygulamanın ilk karesi arasındaki geçiş** nasıl kopuksuz olur —
   ortak olan ne?
2. **Karar anı** için eşik kaç ms? Eşikten önce ne görünüyor, sonra ne beliriyor?
3. Hesap silme **korkutmadan nasıl ciddi olur** — kırmızının payı ne kadar?
4. **"Önce kayıtlarınızı indirin"** kalsın mı? Kalacaksa nereyi gösteriyor?
5. **"Erişim kapalı"** bir hata ekranından nasıl ayrışır — tek bir görsel
   işaretle söylenebilir mi?
6. **404**'te çıkış tek mi olmalı, iki mi (geri + ana ekran)?
7. Splash'ta marka hapı **tam hâl mi** (`luera timeflow`) yoksa kısa mı?
8. Splash statik olmak zorunda: **durağan bir kareyle** karşılamanın ışık alanı
   arasındaki kopukluk nasıl kapanır?

---

## 7 · Çıktı

**Koyu ve açık temada**, her ölçü ve süre yazılı:

1. **A1 Splash → açılış geçişi** — splash karesi (koyu + açık, durağan) ·
   karar anı · eşik öncesi ve sonrası · okunamadı hâli · statik kareden ışık
   alanına geçişin kare kare hâli ← **ana kare**
2. **B1 Hesabı sil** — sahip · sahip değil · şifre yanlış · silindi ← **ana kare**
3. **C1 Erişim kapalı** — müdür · personel
4. **D1 Bulunamadı**
5. **`reduceMotion`** (A1 + B1) · **375 × 667** (B1)

Her karar için **bir cümlelik gerekçe.**

---

## Kutuya yazılacak cümle

> Luera TimeFlow App Store'a gönderiliyor. Günlük kullanımda görünmeyen ama
> Apple incelemecisinin mutlaka göreceği dört kenarı tasarla: **splash → açılış
> geçişi** (bugün sistemin boş ekranı; splash iOS'ta STATİK olmak zorunda,
> hareket ancak sonrasında başlar), **hesap silme** (Apple açıkça test ediyor,
> tasarım turu görmedi), **"Erişim kapalı"** (müdür ve personel için ayrı;
> uygulamada fiyat/plan/ödeme YOK — App Store 3.1.3(f)) ve **404**. En önemli
> iki kare: **açılış geçişi** ve **hesap silme** — ilki ürünün ilk izlenimi,
> ikincisi geri dönüşü olmayan bir işi korkutmadan dürüstçe anlatmak zorunda.
> Koyu + açık tema, 375×667, reduceMotion.

**Effort: High.**
