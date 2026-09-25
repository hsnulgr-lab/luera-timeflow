# Mobil Uygulama İkonu · App Store — Claude Design promptu

**Ekler:**
1. `Luera Landing.html` — **noktanın anlamı burada.** Marka sayfası noktayı
   "canlı durum göstergesi" olarak tanımlıyor; üç hâli ve küresel degrade
   işlemi bu dosyada.
2. `Luera Icon Final.html` + `design_handoff_luera_icon/README.md` — **bugünkü
   ikon tasarımı.** Kopyalanacak değil, **aşılacak** referans.
3. `Luera Logo System.html` · `Luera Lockup Finalists.html` — marka işaretinin
   sistemi ve denenmiş kilitlenmeler.
4. `Luera LeadFlow Animation (standalone).html` — turuncu hap kilitlenmesi
   (ürün adının taşındığı biçim).
5. `Luera Mobil - Kumanda.html` — uygulamanın dili; mobil jetonların kaynağı.

**Effort: High.**

---

## 0 · Bu tur neden var

App Store yüklemesi ikon olmadan yapılamıyor. Depoda duran `icon.png`
gönderilemez: açık mavi zeminde genel bir ok, üstünde **tasarım kılavuz
çizgileri** — daireler, kesikli eksenler, merkez artısı. Expo şablonundan
kalmış, değiştirilmesi unutulmuş.

Markanın **tasarlanmış bir ikonu zaten var** ("l" harfi + turuncu daire) ama
bu tur onu **tekrar etmek için değil, geçmek için** açılıyor. Elde olanı
bilerek, daha iyisini arıyoruz.

---

## 1 · İstenen: 20 ikon, ikiye bölünmüş

| Küme | Adet | Ne |
|---|---|---|
| **G** — Gelişmiş | 10 | Bizim mevcut tasarım dilimizin **ileri** hâli |
| **Y** — Yeni | 10 | Tamamen yeni fikir |

**Yirmisi de ayrı ayrı gösterilecek.** "Şu ikisi aslında aynı" denecek iki
öneri varsa biri elenir, yerine başkası gelir.

Her ikonun altında **iki cümle gerekçe**: ne anlatıyor ve neden bu biçim.

---

## 2 · Markanın bugünkü gerçeği

Aşağıdakiler koddan ve marka dosyalarından alındı — öneri değil, **mevcut
durum**. "Gelişmiş" küme bunların üstüne kurulacak.

### Kelime markası

Küçük harf **`luera`**, ardından **turuncu nokta**. Nokta harflerin tabanına
oturur, kelimenin parçasıdır.

| | |
|---|---|
| Yazı tipi | Hanken Grotesk |
| Ağırlık | 900 |
| Harf aralığı | `-0.05em` |
| Satır yüksekliği | `0.82` |
| Nokta çapı | `0.22em` |

### Nokta bir süs değil — canlı durum göstergesi

Landing sayfasının kendi cümlesi: *"The dot tells you what's happening. Not
just a brand mark — a live status indicator."* Üç hâli var:

| Hâl | Hareket |
|---|---|
| `idle` | Yavaş nefes; opaklık 0.7↔1, ölçek 1.05, 2.4s |
| `active` | Ölçek 1.18 nabız, 1s, `0 0 32px` turuncu hâle |
| `processing` | 360° dönüş + **`border-radius` %50 → %30'a morf**, 1.5s |

Son satır önemli: **nokta işlerken kareleşiyor.** Uygulama ikonu da yuvarlak
köşeli bir kare. Bu köprü markanın kendi içinde zaten var, icat değil.

### Noktanın zengin hâli

```css
background: radial-gradient(circle at 34% 30%,
            #ffb27a 0%, #ff7a33 30%, #ff5a1f 58%, #e8430f 100%);
box-shadow: 0 0 0.5em rgba(255,90,31,.55), 0 0 1.3em rgba(255,90,31,.28);
```

Sola yukarı kaçık ışık kaynağı olan bir **küre**, çift katmanlı hâle ile.

### Ürün kilitlenmesi

`luera` + **turuncu hap** içinde ürün adı (`leadflow`, `timeflow`), hapın
içindeki yazı koyu. Hap tam yuvarlak uçlu.

### Palet

| Rol | Açık | Koyu |
|---|---|---|
| Zemin | `#F3ECE0` | `#120E08` |
| Yüzey | `#FAF7F3` | `#1C1710` |
| Metin | `#0E0E0E` | `#F3EDE3` |
| **Turuncu** | `#FF5A1F` | `#FF5A1F` |
| Turuncu (ikincil) | `#E8430F` | `#FF7A45` |

Koyu tema **saf siyah değil, sıcak** (`#120E08`). Markanın karakteri bu.

### Mevcut ikon — aşılacak olan

Hanken Grotesk 900 **"l"** + sağ alt köşesinde turuncu daire; ikisi birlikte
gizli bir **"i"** okutuyor. Geometrisi: font = tuval × 0.594, daire yarıçapı =
font × 0.150, boşluk × 0.030.

Fikir iyi. **Bu turun işi onu tekrarlamak değil, daha iyisini bulmak.**

---

## 3 · Küme G — gelişmiş 10

Mevcut dilin içinden çıkacaklar. Yön olarak (bağlayıcı değil, başlangıç):

- **G1** — "l" + nokta, optik olarak yeniden dengelenmiş; mevcut oranların
  daha iyisi var mı
- **G2** — nokta tek başına ikonun tamamı; küresel degrade hâliyle
- **G3** — nokta + hâle, hâle yapının kendisi olacak şekilde
- **G4** — `processing` morfunun dondurulmuş ânı: dairenin kareleştiği yer
- **G5** — kelime markasının kare alana sıkıştırılmış hâli
- **G6** — turuncu hap kilitlenmesinden türeyen ikon
- **G7** — negatif "l": harf turuncunun içinden oyulmuş, zemin-şekil tersine
- **G8** — nokta bir günün üzerinde: zamanın işareti olarak konumlanmış
- **G9** — çoğalan nokta: randevuların ritmi, sırası
- **G10** — serbest gelişme; yukarıdakilerin hiçbiri ama yine bizim dilimizden

## 4 · Küme Y — yeni 10

Marka işaretine bağlı olmayan, **sıfırdan** fikirler. Tek şart: **zamanı ve
akışı** anlatsınlar, mesleği değil.

Çeşitlilik zorunlu:

- En az **3'ü tamamen geometrik/soyut**
- En az **2'si tek düz renkle** çalışsın — degrade olmadan ayakta kalsın
- En az **1'i cesur olsun**; güvenli olmayan, tartışılacak bir öneri istiyoruz
- Kalanı serbest

---

## 5 · Yasaklar — hepsi için

- **Sektöre özgü nesne YOK.** TimeFlow yedi sektöre hizmet ediyor: güzellik,
  kuaför, diş, klinik, fizyoterapi, dövme, restoran. **Makas, tarak, diş,
  şırınga, çatal** müşterilerin çoğunu dışarıda bırakır.
- **Takvim klişesi YOK:** ızgaralı yaprak, üstünde rakam olan kare.
- **Saat kadranı YOK.** Zaman anlatılacak ama akrep-yelkovanla değil.
- **Baş harf kombinasyonu YOK** ("LT", "TF").
- Ekran görüntüsü, arayüz parçası, cihaz çerçevesi, Apple donanımı.
- "Beta", "Yeni", "v1" rozeti.
- Fotogerçekçi gölge, degrade bombardımanı, stok ikon biçimi.
- **Kılavuz çizgisi, ızgara, merkez işareti** — bugünkü dosyanın hatası.

---

## 6 · Teknik şartname

### iOS ana ikon

- **1024 × 1024**, **alfa kanalı YOK**, sRGB.
- **KARE. Köşe yuvarlatma YOK, gölge YOK.** Görsel kenarlara kadar dolu.

> ⚠️ Mevcut teslim dosyası burada hatalı: 1024'lük master'a `border-radius:
> 234px` öneriyor ama aynı dosyada "alpha kanalı yok" diyor. **İkisi bir arada
> olamaz** — yuvarlatılmış köşe ya saydamlık ister (Apple reddeder) ya zeminle
> dolar (maske iki kez uygulanır, köşelerde koyu artık kalır). Maskeyi Apple
> uyguluyor. Aynı dosya favicon için bu mantığı zaten doğru kuruyor.

### iOS 18 varyantları — destekleniyor

Kurulu Expo sürümü `ios.icon`'u nesne olarak alıyor (`@expo/config-types` ile
doğrulandı): `{ light, dark, tinted }`.

- **light** — ana ikon
- **dark** — koyu ana ekran; zemin `#120E08` ailesinden
- **tinted** — sistem tek renge indirir, **gri tonda çizilir**. Turuncuya
  güvenilemez; renk kalkınca dağılan konsept elenir.

### Android

| Dosya | Şart |
|---|---|
| `android-icon-foreground.png` | 512×512, **saydamlık VAR**; içerik merkezdeki **%66 güvenli alanda** — Android daire, kare, damla şekillerine kırpıyor |
| `android-icon-background.png` | 512×512, düz ya da sade |
| `android-icon-monochrome.png` | Tek renk + saydam; Android 13+ tema ikonu |

`app.json`'daki `backgroundColor: "#E6F4FE"` (şablon mavisi) marka rengine
çekilecek — hangi değer olacağını bu tur söylesin.

---

## 7 · Her ikon şu dört sınavla birlikte gösterilecek

1024'te güzel görünüp telefonda dağılan ikon işe yaramaz. **Yirmisi için de:**

1. **1024 × 1024** — tam boy
2. **60 × 60** — gerçek ana ekran boyutu, **açık ve koyu** zeminde
3. **Daire maskesi** — Android kırpmasında ayakta mı
4. **Gri ton** — renk kaldırılınca okunuyor mu

---

## 8 · Teslim

Tek HTML. Yirmi ikon, iki küme hâlinde ayrılmış, her biri §7'deki dört
sınavla ve iki cümlelik gerekçesiyle.

Sonunda **üç finalist** ve gerekçeli bir öneri: hangisi ve neden. Finalistler
farklı kümelerden olabilir.

Üretim dosyaları (iOS 1024 + üç varyant, Android üçlü) seçim yapıldıktan sonra
ayrıca istenecek. Bu turda **tasarım kararı** veriliyor.
