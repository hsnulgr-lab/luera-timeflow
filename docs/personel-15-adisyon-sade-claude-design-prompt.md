# PERSONEL 15 · İş sürerken adisyon — Claude Design promptu

Kullanıcının telefon notu: adisyon ekranı **"çok karmaşık, okunmuyor."**
Kendisine sorulunca dört derdin dördünü de işaretledi:

1. **Çok fazla bölüm** var.
2. **Yazılar soluk ve küçük.**
3. **Tutar anlaşılmıyor.**
4. **Kalem eklemek zor.** Asıl dert iki yerde: *"eklendi mi anlamıyorum"* ve
   *"adedi değiştirmek / kaldırmak zor"*.

Bu tur **yalnız iş sürerken** (kumanda · işlemde evresi) adisyonun
yeniden tasarımıdır. Kapanış ekranının düzeni (kadran, tahsilat güvertesi,
kasaya gönder) **değişmiyor**. Ama kalem satırı iki yerde aynı bileşen,
o yüzden **yeni satır kapanışta da kullanılacak** (bkz. K-kare).

**Ekler — yalnız bunlar (başka dosya ekleme):**
1. `Luera Mobil - Kumanda.html` — kumandanın onaylı tasarımı. Jetonlar,
   kadran, plaka, şerit, alt sayfa ve "Bitir" bu dosyadan geliyor.
2. `Luera Mobil - Tek Kisilik v4.html` + `tek4-kit.js` + `tek4-ekranlar.js` +
   `tek4-belge.js` — **dördü birlikte** (HTML ötekileri yüklüyor). Bakılacak
   kareler: **K2** (işlemde) ve **K3** (kapanış · tahsilat).
3. **Ekran görüntüleri (canlı telefon):**
   - kumanda, iş sürerken: sayaç, plan çubuğu, adisyon şeridi
   - "+" ile açılan **Adisyon** sayfası, 3–4 kalem ve randevu hizmetiyle
   - aynı sayfa, **tutar açıkken** (göze dokunulmuş, fitil akıyor)
   - bir satır **açıkken** (− adet + · Kaldır)
   - silme penceresi ("Geri al" sayacı)
   - kapanış ekranı (kalem listesi kadranın altında)

**Effort: High.**

---

## Çıktı kuralı — önce bunu oku

- **Tek HTML dosyası:** `Personel 15 - Adisyon Sade.html`. Tur yarıda
  kesilirse "devam" dendiğinde kaldığın kareden sürdür.
- **İKİ YOL çiz, yan yana:** kullanıcı karşılaştırıp seçecek (aşağıda
  **Yol A** ve **Yol B**). Sonda tek bir karşılaştırma tablosu ve **senin**
  önerin, tek paragraf gerekçeyle.
- **Tema: tek bir koyu/açık düğmesi.** Aynı kareyi iki temada ayrı çizme.
- **Telefon ölçüsü: kareler 393 × 852.** A1 ve B1 ayrıca **375 × 667**'de
  çizilir (küçük ekranda neyin sığdığı asıl soru).
- **Prototip dokunulabilsin:** kalem ekleme, adet değiştirme, kaldırma ve
  tutarı gösterme tıklanınca çalışsın. Bu turun dertlerinin ikisi
  *"anlamıyorum"* — durağan kare bunu kanıtlayamaz.
- **Açıklama kısa:** her karar için tek cümle gerekçe, her hareket için tek
  satır zaman çizelgesi (özellik · ms · eğri).

## Ortak kısıtlar

- **Okunurluk bu turun ölçütü.** Okunacak hiçbir yazı **13 pt'nin altında**
  olmaz. Kalem adı, adet, tutar ve toplam **asla** en soluk metin rengiyle
  (`tx3`, %34–36 opaklık) çizilmez. Okunan her yazı zeminine karşı
  **en az 4.5:1** kontrast taşır, iki temada da. Bugünkü 10.5–11.5 pt'lik
  büyük harfli soluk başlıklar bu turda ya büyüyor ya kalkıyor.
- **Renk envanteri — yeni renk icat etme** (`mobile/src/theme/tokens.ts`):
  - turuncu `#FF5A1F` yalnız **zaman ve eylem** için
  - kırmızı `#E07272` / `#C94040` risk ve silme
  - amber `#D9A43B` / `#B87A00` bekleme ve uyarı
  - yeşil `#5FBF64` / `#2D8F32` olumlu ("eklendi")
  - zeminler: koyu `#120E08 · #1C1710 · #252015 · #241E16`, açık
    `#F3ECE0 · #FAF7F3 · #F0E9DF · #FFFDFB`
- **Yazı tipi:** Hanken Grotesk. Büyük harf metin katmanında yazılır
  (`textTransform` Türkçe İ'yi bozuyor). Rakamlar tabular.
- **Dokunma hedefi ≥ 44 pt.** Liste satırı 62–64 pt. Hedef kitle 40–55 yaş;
  personel ayakta, tek elle, çoğu zaman eldivenli ya da boyalı parmakla
  dokunuyor ve müşteri koltukta oturuyor.
- **Araç:** jestler `PanResponder` ile yazılıyor. **react-native-gesture-handler
  YOK** ve kurulmayacak. **Kaydırarak silme yok**, çünkü alt sayfanın
  aşağı çekme jestiyle çakışıyor ve eldivenli elle yanlış satırı silmenin en
  kısa yolu oluyor. **Uzun basma mümkün** (`Pressable.onLongPress`). Hareket RN
  `Animated` ile yalnız **opacity / translateX/Y / scale** kullanır;
  yükseklik animasyonu yok. `expo-haptics` kurulu (hafif tık, uyarı tıkı).
  Skia, Lottie ve `LayoutAnimation` **yok**.
- **Bedel etiketi:** her hareketin ve kontrolün yanına bir harf yaz:
  - **A** bugün yazılır
  - **B** gesture-handler ya da Skia ister; uygulanamaz, A karşılığını da çiz
  - **C** mümkün değil
- **`reduceMotion`:** hareket durur ama **bilgi durmaz**. Örneğin fitil
  yerine kalan saniye yazılır.
- **Uydurma veri yok:** olmayan özellik, sayı ya da iddia çizilmez. Aşağıdaki
  "Veri" bölümünde olmayan bir alan ekrana konmaz.

---

## Kullanıcının bu tur için kararları (soru-cevapla alındı)

| Konu | Karar |
|---|---|
| Tutar gizleme | **Gizli kalır, ama anlaşılır olur.** Neyin gizli olduğu, nasıl açılacağı ve ne kadar açık kalacağı ekrandan okunmalı |
| Açık kalma süresi | **6 sn sonra kendiliğinden kapanır** (bugünkü kural). Ekranı müşteri görüyor, personel kapatmayı unutabilir |
| Toplam neyi söyler | **Müşterinin ödeyeceği tamamı:** randevu hizmeti + ücretli kalemler (fiyat × adet). Bugün yalnız sonradan eklenenleri sayıyor; bu tur bunu düzeltir |
| Ekranın ağırlığı | **İki yol çiz** (Yol A · Yol B), kullanıcı seçecek |
| Kapsam | **İki kabukta da aynı ekran:** ekipli işletmenin personeli ve tek kişilik işletmenin sahibi |
| Mutlaka kalacaklar | **Formül satırı**, **randevu hizmetleri**, **malzeme grupları** (EK HİZMET · ÜRÜN · MALZEME + "depodan düşer") |
| Kalkabilir / birleşebilir | Sık kullanılan 6 kutu, "Katalogda ara" alanının yeri, "KALEMLER · n satır" başlığı, randevu grubunun altındaki açıklama cümlesi, sayfa başlığı ve "Bitti". Hepsi **senin kararın**, gerekçesiyle |
| Adet ve kaldırma | **Senin önerin.** Bugün satıra dokununca satır yerinde açılıyor (− adet + · Kaldır). Kullanıcı bunu zor buluyor |
| Kapanış | Yeni **satır** kapanışta da kullanılır. Kapanışın düzeni değişmez |

---

## Bugün ekranda ne var (sadeleştirilecek envanter)

**Kumanda · işlemde** (yukarıdan aşağı, sayfa KAYDIRILMIYOR):
1. "‹ Bugün" (ya da "‹ Gün"): ekrandaki tek gezinme
2. Plaka: ● SÜRÜYOR · müşterinin adı (20 pt) · hizmet · "14:02 başlangıç ·
   120 dk plan" · sağda üç 48 pt düğme (ara · not · müşteri kartı)
3. Kadran: **96 pt geçen süre** · GEÇEN SÜRE · plan çubuğu · "Bekleme kur".
   Bekleme kuruluysa süre 26 pt'ye iner, yerine geri sayan halka gelir
4. **Adisyon şeridi:** "ADİSYON · 3 KALEM" · "son Keratin bakım" · toplam
   `•••` + göz · turuncu **+** (52 pt). Malzeme varsa altında formül satırı
5. **BİTİR**: basılı tutarak

**"+" → "Adisyon" alt sayfası** (ekranın üstünde plakanın dört satırı açık
kalıyor; personel kimi işlediğini kaybetmiyor):
1. Başlık "Adisyon" · "3 kalem"
2. "Katalogda ara": dokununca sayfa **arama yüzüne** dönüyor (alan en üstte,
   altında sonuçlar, altında klavye)
3. SIK KULLANILANLAR · SAÇ BOYAMA İŞİNDE: 2 × 3 kutu (68 pt). Dokununca kutu 0,9 sn
   yeşil "Eklendi" ya da "×2 oldu" yazıp sönüyor
4. KALEMLER · 3 satır
5. RANDEVU: randevunun kendi hizmetleri, sağında "RANDEVUDA", altında
   "Bu hizmetler kasaya randevuyla birlikte gidiyor; yeniden eklemeyin."
6. EK HİZMET · ÜRÜN · MALZEME başlıkları ve satırlar. Satırda ad, tür, ×adet
   ve tutar (`•••`) var. Malzemenin fiyatı yok, yerinde "DEPODAN DÜŞER"
   yazıyor
7. Malzeme başlığının yerinde formül satırı
8. "Malzeme kalemleri işlem bitince depodan düşer."
9. "Bitti"

Dertlerin buradaki karşılığı:

| Dert | Sebep |
|---|---|
| Çok fazla bölüm | Bir sayfada yukarıdaki dokuz katman var ve dördü büyük harfli soluk başlık |
| Soluk / küçük | Başlıklar 10.5–11.5 pt, `tx3` (%36). Tür adları 11.5 pt soluk |
| Tutar anlaşılmıyor | Toplam ve satır tutarları üç nokta. Toplam randevu hizmetini içermiyor. Malzemenin "depodan düşer"i bir fiyat sütununda duruyor |
| Eklendi mi anlamıyorum | Onay 0,9 sn yanıp sönüyor. Eklenen satır ızgaranın altında, çoğu zaman ekran dışında kalıyor. İkinci dokunuş yeni satır değil ×2 yapıyor ve bu yalnız o 0,9 sn'de söyleniyor |
| Adet / kaldırma zor | Kontrol gizli: önce satıra dokunmak gerekiyor. Dokunulabilir olduğu satırdan okunmuyor |

---

## Değişmeyen kurallar (davranış — tasarım bunları taşımalı)

- **Aynı kalem ikinci kez eklenince yeni satır açılmaz, adet artar.** İki
  ayrı "Boya 7.3" satırı altı ay sonra okuyana hata gibi görünür. Yeni
  tasarım bu artışı **açıkça** göstermeli ("×2 oldu").
- **Adet 1–20.** 1'in altı yok; kaldırmak ayrı bir eylem.
- **Silme geri alınabilir: 6 sn pencere, satırın KENDİ YERİNDE.** Liste
  zıplamaz, geri alınan satır aynı yere döner. Malzeme silinirken yazılmış
  formül varsa pencere bunu söyler ("formülün malzeme yarısı değişir").
- **Randevudaki hizmet ek hizmet olarak eklenirken tek soru sorulur**
  (engel değil; iki kez tahsil edileceği söylenir).
- **Malzeme fiyatsız ve toplama girmez.** Bu bir stok kaydıdır, para değil.
  Tasarım onu tutar sütunundan çıkarabilir, yeter ki "depodan düşer" anlamı
  kalsın.
- **Formül satırı malzeme varsa görünür.** Üç hâli var: yazılmadı (amber) ·
  yarım · yazıldı. Dokununca formül alt sayfası açılır (o sayfa bu turun
  konusu değil).
- **Arama yüzü bu turda değişmiyor.** Kod sütunu, ters vurgu ve "bu
  müşteride" işareti Personel 13'ün kararı. Yalnız aramaya giden **kapının**
  yeni sayfadaki yerini çiz.
- **Kalemler 0,7 sn'de sunucuya yazılıyor** (2026-10-14). Kaydet düğmesi
  yok, olmayacak.
- **Ekran yalan söylemez.** "Eklendi" gerçekten listeye girmiş bir satırı
  anlatır.

## Veri — ekrana konabilecek her şey

| Alan | Kaynak | Not |
|---|---|---|
| Kalem adı, türü (ek hizmet / ürün / malzeme), adet, birim fiyat | adisyon satırı | malzemede fiyat yok |
| Randevu hizmet(ler)inin adı ve fiyatı | randevu + katalog | toplam artık bunu içeriyor |
| Toplam | randevu hizmeti + Σ(fiyat × adet) | malzeme hariç |
| Sık kullanılan 6 kalem ve kaynağı | son 60 günün adisyonları: personelin kendisi ("Saç boyama işinde"), yoksa salon ("salonda · Saç boyama işinde") | yeni salonda boş |
| Formülün hâli ve özeti | formül kaydı | malzeme yoksa yok |
| Geçen süre, plan, bekleme | kumanda | değişmiyor |

**Yok (çizme):** indirim, KDV satırı, kalem fotoğrafı, stok adedi, kalemi
kimin eklediği, kategori ağacı.

---

# İŞ · Kareler

Örnek veri iki yolda aynı (K2 ile uyumlu):
- Müşteri **Tuğçe Erden**, randevu hizmeti **Saç boyama · ₺1.800**,
  "14:02 başlangıç · 120 dk plan", geçen süre **74:12**
- Ek hizmet **Keratin bakım · ₺450**, ek hizmet **Fön · ₺150**
- Ürün **Şampuan 250 ml · ₺320**
- Malzeme **Boya 7.3 ×2** ve **Oksidan %6 ×1**
- **Toplam ₺2.720**

## Yol A · Süre büyük kalır, adisyon sayfası sadeleşir

Kumandanın düzeni (kadran ekranın en büyük şeyi) korunur. Adisyon yine
alt sayfada açılır, ama yukarıdaki dertlerin hepsi o sayfada çözülür.

- **A1 · Kumanda işlemde.** Yeni şerit: toplam gizli, ama **ne olduğu
  yazılı** ("toplam", "ödenecek" ya da senin bulduğun kelime) ve nasıl
  açılacağı okunuyor. 393 × 852 + 375 × 667.
- **A2 · Adisyon sayfası, tutar gizli.** Randevu hizmeti + 3 kalem + 2
  malzeme + formül satırı. Sadeleşmiş bölüm sayısını kare altında yaz
  ("dokuz → n").
- **A3 · Aynı sayfa, tutar açık.** 6 sn fitili ya da kalan saniye.
  Toplamın kırılımı okunuyor mu?
- **A4 · Kalem eklendi.** Hem yeni satır hem **adet artışı** (×2 oldu).
  Personel **gözünü çekmeden** anlamalı. Ekleme kontrolünün yanında mı,
  listede mi, ikisinde de mi? Senin kararın, gerekçesiyle.
- **A5 · Adet değiştir ve kaldır.** Önerdiğin yol. Ardından silme penceresi
  (Geri al · 6 sn), satırın kendi yerinde.
- **A6 · Henüz kalem yok.** Yalnız randevu hizmeti var. Toplam yine
  ₺1.800 (gizli).

## Yol B · Adisyon ana ekrana gelir, süre küçülür

Kalemler kumandada doğrudan görünür; alt sayfa yalnız eklemek için açılır
(ya da hiç açılmaz, sen karar ver). Süre küçülür ama **kaybolmaz**: plan
çubuğu, "Bekleme kur" ve bekleme halkası bir yere sığmalı.

- **B1 · Kumanda işlemde, kalemler ana ekranda, tutar gizli.**
  393 × 852 + 375 × 667.
- **B2 · Aynı, tutar açık.**
- **B3 · Bekleme kuruluyken.** Geri sayan halka bugün kadranın yerini
  alıyor. B'de nereye gidiyor? Aciliyet beklemede, geçen sürede değil.
- **B4 · Kalabalık adisyon:** 8 kalem + 3 malzeme. Kumandanın kuralı
  **"sayfa kaydırılmaz"** (personel ekrana 30–40 kez bakıyor, her bakışta
  "neredeydim" sorusu olmamalı). Liste sığmayınca ne oluyor? Kendi içinde mi
  kayıyor, katlanıyor mu, son n kalem mi görünüyor? "BİTİR" ve "+" her
  durumda yerinde kalmalı.
- **B5 · Kalem eklendi + adet + kaldır**, A4/A5'in B karşılığı.

## Ortak kareler (iki yolda aynı)

- **S · Satırın anatomisi** (yakın plan, 2× büyütülmüş). Yan yana dört
  satır: ek hizmet, ürün ×2, malzeme (fiyatsız), randevu hizmeti. Her biri
  gizli ve açık hâlde. Satırın dokunulabilir olduğu **satırdan** okunmalı.
- **K · Kapanış ekranında yeni satır.** v4 K3'ün düzeni aynen kalır, yalnız
  kalem listesi yeni satırla çizilir. Kapanışta toplam kadranda yazıyor;
  satırların tutarı ile kadranın toplamı **aynı maskeyi** paylaşır (biri
  açık, öteki kapalı kalamaz).

---

## Karşılaştırma tablosu (sonda)

| | Yol A | Yol B |
|---|---|---|
| Bir bakışta toplam okunuyor mu | | |
| Kalem eklemek kaç dokunuş (sık kullanılan / arama) | | |
| "Eklendi mi" sorusu nasıl cevaplanıyor | | |
| Süre ve bekleme ne kadar görünür kalıyor | | |
| 375 × 667'de ne feda edildi | | |
| Kapanışla süreklilik | | |
| Bedel (A/B/C) | | |

Sonra **önerin**, tek paragraf. Kullanıcının dört derdini tek tek anarak.

## Yapma

- Kumandaya yeni bölge, yeni sekme ya da kategori ağacı ekleme. Ekran
  büyüklüğü katalog büyüklüğüne göre **değişmez**: 40 kalemli salonda da
  400 kalemli salonda da aynı ekran.
- Modal onay ekleme. Ekran müşterinin gözü önünde; modal bir onay
  müşteriye "bir şey ters gitti" der.
- Kapanış ekranının düzenine, tahsilat güvertesine, "Adisyonu kasaya
  gönder"e dokunma.
- `Luera Mobil - Durumlar.html` ya da `Hareket Sözleşmesi` iste ya da onlara
  dayan. Bu turun ekinde değiller.
