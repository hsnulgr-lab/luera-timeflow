# Müdür 29 · Sıradaki randevu kartı v2 — Claude Design promptu

Ekler: akış ekranı görüntüsü (mevcut hâl) ·
`docs/design-reference/Luera Mobil - Mudur 20 Bekleme Kartlari.html` ·
`docs/design-reference/Luera Mobil - Mudur 21 Tahsilat ve Gelmedi Kartlari.html`
(kart ailesinin dili — **korunacak**) ·
`docs/design-reference/Luera Mobil - Hareket Sözleşmesi.html`.

---

**Müdür 29 · Sıradaki randevu kartına tek soruyu ekle: "bu müşteri gelecek mi?"**

Luera TimeFlow'un müdür akış ekranındaki **sıradaki randevu kartını** genişlet.
Kart bugün çalışıyor, ölçüleri oturmuş ve güzel. **Yeniden tasarlanmasını
istemiyorum ve büyümesini de istemiyorum.** Eksik olan tek bir bilgi katmanı
var; iş, o katmanı **kartı şişirmeden** yerleştirmek.

---

## 1 · Araştırma — bu kart neden yetersiz

### 1.1 Sektörün sayıları

- Salonlarda ortalama **gelmeme oranı %25**'e kadar çıkıyor; sağlıklı hedef
  **%6'nın altı**.
- İyi zamanlanmış, net yazılmış hatırlatma gelmemeyi **%11,1'den %8,4'e**
  düşürüyor (PLOS ONE). Cochrane derlemesi SMS hatırlatmanın katılımı **%14**
  artırdığını buluyor.
- **Asıl fark cevap istemekte:** "onayla ya da iptal et" diyen iki yönlü
  hatırlatmaya geçen sekiz kişilik bir salon, haftada 15–20 olan kaybını
  **üçe** indirmiş.
- Sektörün beş çekirdek KPI'sı: gelmeme oranı, yeniden randevu oranı, ziyaret
  başına ortalama harcama, personel doluluk (%75–85), 12 aylık müşteri
  tutma.

Buradaki tek cümlelik sonuç: **salonun en pahalı sorunu "boş kalan ama dolu
görünen slot".** Ve bu kart tam olarak o slotu gösteren karttır.

### 1.2 Bizde zaten var olan ama ekrana çıkmayan cevap

Uygulama randevudan 24 saat önce WhatsApp'tan hatırlatma gönderiyor ve
müşterinin **Evet/Hayır cevabı veritabanına yazılıyor**
(`reservations.customer_confirm`, `customer_confirm_at`). Bot "hayır"
cevabında randevuyu iptal edip yeri bekleme listesine açıyor.

**Ama mobil bu kolonu hiç okumuyor.** Müdür, 24 saat önce "geleceğim" demiş
müşteriyle hiç cevap vermemiş müşteriyi ekranda **ayırt edemiyor** — ikisi de
aynı kartta, aynı sakinlikte duruyor. Ürün cevabı topluyor ve çöpe atıyor.

### 1.3 Salonda gerçekten sorulan altı soru

Kart bugün dördünü cevaplıyor (kim · ne · kiminle · kaç dakika kaldı).
Cevaplamadıkları:

| Soru | Bugün | Neden önemli |
|---|---|---|
| **Gelecek mi?** | yok | Veri hazır (§1.2). En yüksek getirili eksik. |
| **Daha önce yakmış mıydı?** | yok | Geçmiş gelmeme sayısı türetilebilir. Riskli müşteriye randevudan önce dokunmak, boş koltuğu önlemenin tek yolu. |
| **İlk ziyaret mi?** | yok | İlk gelen farklı yönetilir: form, alerji sorusu, tanıştırma, daha uzun süre. |
| **Personel hazır mı?** | yalnız A2'de | 6 dakika sonra girecek müşteriyi karşılayacak kişi hâlâ meşgulse randevu zaten gecikecek. Sade kartta bu yok. |

---

## 2 · Kartın bugünkü anatomisi — ölçüler bağlayıcı

İki hâl var ve hangisinin çizileceğine **veri** karar veriyor: müşterinin
notu / paketi / bakiyesi varsa A2, yoksa A1.

### A1 · sade kart

```
11:30   ● SIRADAKİ RANDEVU                              ⋮
        ED  Elif Demir
        Keratin bakımı · 45 dk · Selin ile
        ┌──────────────────────────────────────────────┐
        │  GİRMESİNE                        ┌────────┐ │
        │  6 dk                             │ Geldi  │ │
        │  11:30 · 45 dk                    └────────┘ │
        │                                     Gelmedi  │
        └──────────────────────────────────────────────┘
```

Ters (krem) panel: `padding 14 · radius 18 · gap 12`. Etiket 11.5 · geri
sayım rakamı **40** · alt satır 11.5. "Geldi" hapı 44 yüksek · "Gelmedi" 44.
Gecikince panelin soluna 4 pt çizgi girer ve dolgu 10'a düşer — **toplam
sabit kalır, metin kaymaz.**

### A2 · bağlamlı kart

Krem kart `padding 12 · radius 22 · gap 12`. Avatar 44 · ad 19 · detay 12.5 ·
sağ sütunda geri sayım 22. Altında sabit sırayla bağlam satırları:
**bakiye → not → paket** (etiket 11.5, metin 14). En altta gerekiyorsa
çakışma satırı: `Selin şu an işlemde · 08 dk` (amber, 12.5, 7 pt nokta).

### Sert sınır

Kart ailesinin kuralı: **kart 100 pt'yi geçmez** (ölçülen: C1 = 92, diğerleri
= 96). A2 bağlam satırlarıyla büyüyebiliyor ama **her satır bir bedel** ve
akış ekranında bu kartın altında sekiz kart daha var.

**Bu tasarımın ana kısıtı budur: eklenen bilgi kartı büyütmemeli.** Yeni bir
satır ekleyeceksen, hangi satırın yerine geçtiğini ya da hangi koşulda
çizilmediğini söyle.

---

## 3 · Tasarlanacak

### A · Güven satırı — üç hâl, tek satır

Kartın cevaplamadığı ana soruyu cevaplayan **tek satır**. Yalnız söyleyecek
bir şey varken çizilir.

1. **Geleceğini bildirdi** — müşteri hatırlatmaya "Evet" yazdı. İyi haber;
   müdürün yapacağı bir şey **yok**. Bu yüzden **en sessiz hâl** olmalı — bir
   rozet, bir işaret, belki yalnız ismin yanında küçük bir im. Kutlama değil,
   içi rahatlatan bir detay.
2. **Cevap yok** — hatırlatma gitti, cevap gelmedi. Nötr. Ama anlamı **zamanla
   değişiyor**: 20 saat kala cevapsızlık normal, 2 saat kala bir karardır.
   **Bu, cevaplamanı istediğim en önemli sorulardan biri: biçim zamanla
   değişmeli mi?**
3. **Riskli** — geçmişte gelmemiş müşteri. Cümle: `Son 5 randevunun 2'sine
   gelmedi`. Yanında **tek** eylem: **Hatırlat** (WhatsApp).

**Hatırlatma hiç gitmediyse** (numara yok, hatırlatma kapalı) satır **hiç
çizilmez**. Bu üründe bilinmeyen ile olumsuz aynı şey değildir — "bilinmiyor"
diye bir rozet konmaz.

Üç hâlin **görsel ağırlık sırası** şart: müdür günde otuz kart görüyor.
"Riskli" bile bir uyarı bombardımanı olmamalı, yoksa hepsi görünmez olur.

### B · İlk ziyaret

Çok küçük bir işaret. **Uyarı gibi görünmemeli** — ilk ziyaret iyi bir
haberdir, risk değil. Rozet mi, ismin yanında bir im mi, avatarın kenarlığı
mı? Öner ve gerekçelendir.

### C · A1'de personel hazırlığı

A2'de `Selin şu an işlemde · 08 dk` satırı var ve doğru. A1'de yok — oysa
asıl kritik soru orada. Kartı büyütmeden nasıl girer? (Alt satır zaten
`Keratin bakımı · 45 dk · Selin ile` diyor; belki cevap orada.)

### D · Hareket — SÖZLEŞMEDEN BAĞIMSIZ tasarla

Bu bölüm bu turda özel. Projenin bir hareket sözleşmesi var ama o sözleşme
bir KUMANDA için yazıldı (belgenin başlığı "Personel mobil") ve müdür modu
için hiç yeniden türetilmedi. Süre tavanı 320 ms, sheet için 260; sözlükte
"biri gider, biri gelir" dışında bir şey yok.

**Bu kart için o sözleşmeyi unutmanı istiyorum.** Kısıt olmasaydı bu kartın
hareketini nasıl tasarlardın — onu tasarla. Sürekliliği, jesti, fizik
tabanlı geçişleri, paylaşılan ögeyi kullanmakta serbestsin. Süre tavanı yok.

Kural tek: **hareket DEĞİŞİMDE olur, boşta olmaz.** Bu kart günde otuz kez
görülüyor; sürekli dönen, nabız atan, parlayan hiçbir şey üçüncü günü
çıkaramaz. Kalite nefes alan bir ekranda değil, **yerine oturan** ekranda.

Tasarlamanı istediğim beş an:

1. **Kart sıradaki olduğunda.** Bir önceki randevu kapanır, bu kart listenin
   başına geçer. Bugün sessizce beliriyor.
2. **Geri sayım rakamı değiştiğinde.** `7 dk` → `6 dk`, dakikada bir, saatte
   otuz kez. **En zor an bu:** görülmeli ama rahatsız etmemeli. Son beş
   dakikada davranış değişmeli mi?
3. **Güven satırı canlı geldiğinde.** Müşteri "geleceğim" yazdı, kart ekranda
   duruyor.
4. **Gecikmeye düştüğünde.** Panelin soluna çizgi girer, etiket `girmesine` →
   `gecikti` olur. Alarm mı, sakin dönüşüm mü?
5. **"Geldi"ye basıldığında.** Kart bekleme kartına DÖNÜŞÜR — bu ailenin
   kuralı: *"üç hâl aynı karttır, aralarındaki geçiş takas değil dönüşümdür."*
   Sözleşme bu kuralı koyuyor ama aracını vermiyor; sen ver.

#### Her hareketin yanına BEDELİNİ yaz

Serbestlik karşılıksız değil. Uygulama tarafında bugün elimizde olan:
React Native'in kendi `Animated`'i ve `PanResponder`. Bu ikisiyle **yalnız**
`opacity`, `translateX/Y` ve `scale` native sürücüde animasyonlanabilir;
yükseklik, renk, yarıçap, gölge ve blur animasyonlanamaz.
`react-native-reanimated` ve `react-native-gesture-handler` **kurulu değil**.

Bu yüzden tarif ettiğin her hareketi üç kutudan birine koy:

- **A · Bugün yazılabilir** — yalnız opacity/translate/scale, native sürücü.
- **B · Kütüphane ister** — hangi kütüphane, ne için. (Ör. kesintilenebilir
  yay, parmağı takip eden geçiş, paylaşılan öge.)
- **C · Platform işi** — yalnız native tarafta ya da hiç mümkün değil.

Bu etiketleme bir sansür değil, **fiyat etiketi**: A'ları hemen kurarız,
B'lerin bedelini görüp karar veririz, C'leri bilerek bırakırız. Etiketsiz bir
hareket listesi işe yaramaz — beğenip kuramadığımız bir tasarım olur.

Her hareket için ayrıca: süre, eğri, gecikme, ve **`reduceMotion` karşılığı**
(hareket yok, sonuç anında — bu pazarlığa kapalı, erişilebilirlik).

---

## 4 · Değişmeyecekler

- **Kartın iskeleti, ölçüleri ve iki düğmesi.** v2 ekleme yapar, kurgu
  değiştirmez.
- **Geri sayım bloğu** (`GİRMESİNE · 6 dk · 11:30 · 45 dk`) olduğu gibi kalır.
- **Bağlam satırlarının sırası**: bakiye → not → paket. Kart her müşteride
  aynı yerde okunur.
- **Renk envanteri:** turuncu `#FF5A1F` yalnız **ZAMAN** ve **EYLEM** — asla
  durum. Kırmızı `#E07272`/`#C94040` risk. Amber `#D9A43B`/`#B87A00` uyarı.
  Yeşil `#5FBF64`/`#2D8F32` olumlu. **Renk tek başına anlam taşımaz; kelime
  her zaman yazılı.**
- **Palet:** koyu `bg #120E08` · `surf #1C1710` · `card #241E16` ·
  `tx #F3EDE3`. Açık `bg #F3ECE0` · `surf #FAF7F3` · `card #FFFDFB` ·
  `tx #0E0E0E`. Krem kart iki temada da krem: sayfanın tersi düzlemdir.
- **`reduceMotion` açıkken hareket yok, sonuç anında.** Hareketin tek
  pazarlıksız kuralı bu — erişilebilirlik, tercih değil.
  (Hareketin geri kalanı bu turda SERBEST; bkz. §3.D. Ama her hareketin
  yanında bedeli yazılı olacak: bugün yazılabilir mi, kütüphane mi ister,
  yoksa hiç mümkün değil mi.)
- **Dokunma hedefi 44 pt'nin altına inmez.** Hedef kitle 40–55 yaş, ayakta,
  tek elle, salonun gürültüsünde.
- **Sahte veri yok, ölü kontrol yok, sahte onay yok.**

---

## 5 · Cevaplamanı istediğim beş soru

1. Üç güven hâlinin **görsel ağırlık sırası** ne, ve "riskli" nasıl fark
   edilir ama bağırmaz?
2. Cevapsızlık randevu yaklaştıkça **biçim değiştirmeli mi**?
3. Kart ekranda dururken canlı bir onay cevabı gelirse satır **nasıl
   beliriyor**? (Yalnız opacity/translate/scale.)
4. Eklenen satırlar kartı **kaç pt büyütüyor** ve bu bedel neyle ödeniyor?
5. Geri sayım rakamının dakikalık değişimi **nasıl görünür ama rahatsız
   etmez**? (Saatte otuz kez oluyor.)

## 6 · Çıktı

A1 ve A2, her biri üç güven hâli × koyu/açık tema. Artı ilk ziyaret işareti,
artı A1'in personel satırı. Her ölçü yazılı. Her hareket için süre, eğri,
gecikme ve `reduceMotion` hâli. Ve her karar için **bir cümlelik gerekçe**.
