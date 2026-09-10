# Giriş v3 · Uygulamanın ilk beş saniyesi — Claude Design promptu

**Ekler:**
1. 3 ekran görüntüsü (mevcut hâl — dönüş girişi · karşılama · müdür girişi)
2. `threadsdownloader.com_6ea213.mp4` — **hareket referansı** (26,8 sn)
3. `Desktop/luera giris referans/` — videodan çıkarılmış 7 kare
4. `docs/design-reference/Luera Mobil - Giris.html` — akışın tamamı (**yapı doğru, değişmiyor**)
5. `docs/design-reference/Luera Mobil - Hareket Sözleşmesi.html` — **bu turda
   GEÇERSİZ**; yalnız eğri ve süre duyarlılığını göstermek için ekli (bkz. §3)
6. `docs/giris-v2-claude-design-prompt.md` — **bu turun selefi; teşhis bölümü hâlâ geçerli**

**Effort: High.**

---

## 0 · Bu neden üçüncü tur

v1 uygulandı ve çalışıyor. v2 brief'i yazıldı, bir çıktı alındı, **beğenilmedi.**
v2'nin kendi hatası dosyada yazılı: *"«premium» deniyor ama Luera'nın
premium'unun neye benzediği hiç tarif edilmiyor. Tasarım da güvenli olana
kaçıyor."*

Bu tur o boşluğu dolduruyor. İki şey değişti:

**a) Yön seçildi.** v2 üç yön önermiş, karar verilmemişti. Karar: **"Işık ve
malzeme"** ile **"tipografi kahraman"**ın birleşimi. Ekranın ortası soyut ve
canlı bir ışık alanı; markanın kendisi o alanın üstünde duran tek ağır nesne.
Ürünün parçalarını (randevu kartı, personel halkası) karşılama ekranına koymak
**reddedildi** — kullanıcı henüz içeri girmedi, ona işini göstermek erken.

**b) Hareket sözleşmesi KALKTI.** v2 yalnız `opacity`/`translate`/`scale`'e
izin veriyordu. Bu turda `reanimated`'in tamamı serbest — renk, bulanıklık,
yay, layout, SVG içi değerler. Kullanıcının bu turdaki tek net emri buydu:
*"hareket sözleşmesine uysun istemiyorum, daha iyi animasyonlar istiyorum."*
Bkz. §3.

---

## 1 · Neyi çözüyoruz

Bir salon sahibi ya da kuaför uygulamayı ilk kez açtığında, ürün hakkındaki
kararını **ilk beş saniyede** veriyor. Bugün o beş saniyede gördüğü şey:
markanın üstte durduğu, ortası 600 pt boş, altında iki gri dikdörtgen olan
dürüst ama sessiz bir ekran.

İstenen: **o ilk beş saniyenin büyülemesi.** Kullanıcı "bu ciddi bir yazılım"
hissini menüleri gezerek değil, o ekranı görerek edinmeli.

Ama bir tuzak var ve tasarımın onu bilerek geçmesi lazım:

> **Büyü, girişi geciktiremez.** Bir açılış animasyonunun bitmesini bekleyen
> ekran ikinci günde sinir bozucu, üçüncü günde işkencedir. Sihir, ekran ZATEN
> KULLANILABİLİRKEN arka planda sürmeli. Kullanıcı animasyonun ortasında
> düğmeye basabilmeli ve hiçbir şey kaçırmamalı.

---

## 2 · Hareket referansı — videoda ne var

Ekteki video bir gradyan koleksiyonu tanıtımı. Bizim için önemli olan üç şey:

1. **Ekranı baştan başa kaplayan organik renk alanları.** Kenarı yok, kutusu
   yok, kartı yok. Alan ekranın kendisi.
2. **Yavaşlık.** 26 saniyede belki altı hâl değişiyor. Hiçbir şey acele
   etmiyor; hareket fark ediliyor ama dikkat çalmıyor.
3. **Alan morfa uğramış gibi görünüyor**, oysa olan şey renkli kütlelerin
   kayması, büyümesi ve üst üste binmesi. Bizde bunun üstüne **renk de
   animasyonlanabiliyor** (bkz. §3) — yani referanstan daha ileri
   gidebiliriz.

Videodaki renk skalası çok geniş (turuncu-yeşil, pastel sis, kırmızı-turkuaz,
derin mavi, siyah üzerine turuncu ufuk). **Biz o kadar geniş gitmeyeceğiz** —
bkz. §6 renk kuralı.

---

## 3 · TEKNİK ZARF — tasarlamadan önce oku

**Bu turda hareket sözleşmesi KALKTI.** Önceki briefler (`Hareket
Sözleşmesi.html`, `giris-v2`) yalnız `opacity`/`translate`/`scale`'e izin
veriyordu. O kural teknik bir zorunluluk değil, **eski bir API'nin sınırıydı**:
`react-native-reanimated` 4.5.1 projede kurulu ve bugün yalnız tek bir dosyada
kullanılıyor. Giriş ekranlarında **tamamı serbest.**

### Serbest olanlar — hepsi Expo Go'da çalışır

| Ne | Nasıl |
|---|---|
| **Renk animasyonu** | `interpolateColor`, UI iş parçacığında |
| **Bulanıklığın kendisi** | `useAnimatedProps` ile `BlurView.intensity` |
| **Yay fiziği** | `withSpring`, kütle/sönüm/sertlik ayarlanabilir |
| **Kesintiye uğratılabilir hareket** | Kullanıcı ortada dokunursa animasyon oradan devam eder |
| **Sıralı zaman çizelgeleri** | `withSequence`, `withDelay`, `withRepeat` |
| **Gerçek layout geçişleri** | `entering` / `exiting` / `layout` — native, `LayoutAnimation` değil |
| **SVG'nin İÇİNDEKİ değerler** | Gradyan durakları, `d` yolu, `r`, `offset` — animasyonlanabilir |
| **Jest ve kaydırma güdümlü** | `gesture-handler` + `useAnimatedScrollHandler` |
| **Yükseklik, genişlik, yarıçap** | Artık animasyonlanabilir |

Yani: **kütlelerin rengi değişebilir, camın buzu kalınlaşıp incelebilir,
marka yaylanarak yerine oturabilir, gradyanın durakları kayabilir.** v2'nin
"iki katman üst üste koy, çapraz solsun" numarasına artık gerek yok — ama
istersen o da serbest.

### Hâlâ mümkün olmayanlar

Bunlar `Skia` gerektirir, Skia da **Expo Go'da çalışmaz** ve kullanıcı bu
turda dev build'e geçmeme kararı verdi:

- Gerçek mesh gradyan (dörtgen köşe interpolasyonu)
- Shader, gürültü (noise), doku üretimi
- Parçacık sistemi
- Path morph (bir şeklin başka bir şekle akması)
- Blur'ün shader olarak yazılması, ışık kırılması, cam refraksiyonu

**Bunları önerme.** Önerirsen ekran bugünkü hâlinde kalır.

### Referanstaki etki bu araçlarla nasıl üretilir

Mesh gradyan yok, ama videodaki görüntünün kaynağı zaten mesh interpolasyonu
değil — **hareket eden renkli kütleler.** Karşılığı:

1. **4–6 büyük renkli kütle.** Her biri `LinearGradient` dolu, çok büyük
   `borderRadius`'lu, döndürülmüş bir yüzey; ya da SVG radyal gradyan.
   Ekrandan taşacak kadar büyük (200–400 pt), yarı saydam.
2. **Her kütle bağımsız yaşar** — konum, ölçek, dönüş, saydamlık **ve renk**.
   Farklı süreler (18–40 sn), farklı yönler, sonsuz döngü. Süreler ortak
   bölene düşmesin ki desen tekrarlamasın.
3. **Üstlerine yüksek yoğunluklu `BlurView`.** Kenarlar kaybolur, alan
   sürekli ve organik olur. Yoğunluk da animasyonlanabilir — alan bir "nefes"
   alabilir.
4. **Metin ve düğmeler bulanıklığın üstünde**, net.

### Bir dürüstlük notu

`reanimated` bu projede **kanıtlanmadı** — kurulu, ama 34 ekrandan yalnız
birinde kullanılıyor. Tasarım geldiğinde ilk iş, en riskli tekniği (muhtemelen
animasyonlu `BlurView.intensity`) telefonda tek başına denemek olacak.
Çalışmazsa tasarımın o parçası için bir yedek gerekir — **her hareketin
"bu olmazsa ne olur" hâlini de yaz.**

### Performans bütçesi — cevaplamanı istediğim bir soru

Bulanıklık Android'de pahalıdır ve hedef kitlemizin telefonu yeni olmayabilir.
Sürekli hareket eden 6 kütle + tam ekran blur + renk interpolasyonu, üç
yaşındaki bir Android'de kare düşürür.

Seçenekler:
- Android'de daha az kütle, daha düşük blur, daha yavaş hareket
- Android'de hareket yalnız **açılışta** (5 sn) çalışır, sonra donar
- Android'de statik bir gradyan, hareket yalnız iOS

**Kararı sen ver ve gerekçelendir.** "Her yerde aynı" cevabı kabul değil.

## 4 · Kapsam — dört ekran

| # | Ekran | Kaç kez görülür | Ağırlık |
|---|---|---|---|
| **A** | **Karşılama** — "İşletmemi yönetiyorum / Burada çalışıyorum" | Ömürde **bir kez** | Gösterinin tamamı burada |
| **B** | **Müdür girişi** — e-posta + şifre | Nadiren (ilk kurulum, oturum düşünce) | Sakin, ama A'nın devamı |
| **C** | **Personel girişi** — eşleştirme kodu → kim → PIN | Nadiren | Aynı |
| **D** | **Dönüş girişi** — Face ID ile geri gelen kullanıcı | **Günde onlarca kez** | **Neredeyse hareketsiz** |

**A ile D aynı ağırlıkta olamaz** — v2 bunu doğru kurmuştu, aynen geçerli.
A bir kapı ve bir karşılamadır, orada gösterişe yer var. D bir kilit
ekranıdır; her gün otuz kez izlenecek bir animasyon üçüncü günde nefret
uyandırır. **İkisine aynı gösteriyi koymak en kolay ve en yanlış cevaptır.**

Işık alanı dördünde de var — ama D'de **çok daha sakin**: daha az kütle, daha
yavaş, daha düşük doygunluk. Marka sürekliliği hareketten değil malzemeden
geliyor.

---

## 5 · Buzlu cam — kapsamlı bir istisna

v2'de yazan kural: *"Cam yalnız kabukta kullanılır; içerik yüzeyleri opak ve
sıcaktır."* Sebebi geçerli: bulanık zeminde metin kontrastı düşer.

**Bu turda giriş ekranları için istisna açılıyor** ve sebebi şu: giriş
ekranlarında *içerik* yok. Okunacak bir randevu listesi, bir tutar, bir isim
yok — iki düğme, bir marka, bir cümle var. Cam burada okunabilirliği tehdit
etmiyor.

İstenen: **düğmeler ve kartlar ışık alanının üstünde buzlu cam plakalar gibi
dursun.** Arkasındaki renk alanı camdan geçsin, bulanık ve soluk. Kullanıcı
düğmeye baktığında arkasındaki hareketi *hissetsin* ama okuyamasın.

Cevaplamanı istediklerim:
- **Cam ne kadar kalın?** Blur yoğunluğu, saydamlık, kenarlık, iç parıltı —
  hepsinin sayısı yazılı olsun.
- **Açık temada cam nasıl duruyor?** Koyu temada kolay; açık temada beyaz
  üstüne beyaz cam kaybolur. İki temanın çözümü aynı olmayabilir.
- **Camın kenarı var mı?** 44 pt'lik bir düğmenin dokunulabilir olduğu, camın
  kendisinden anlaşılmalı.
- **Metin kontrastı:** camın arkasındaki alan bir an turuncuya döndüğünde
  üstündeki beyaz metin okunur kalıyor mu? Bunun garantisi ne?

---

## 6 · Renk — tek kural

**Turuncu `#FF5A1F` bizim.** Markanın noktası, zamanın rengi, eylemin rengi.
Işık alanında turuncu **olmalı** ve baskın olmalı.

**Geri kalanında serbestsin.** Mor, teal, derin mavi, sıcak kahve, hatta
pembe — ışık alanının bileşenlerinde istediğin rengi kullan, istediğin kadar
katman ekle. Referans videodaki cesaret bizde de olabilir.

**Ama iki kısıt:**
1. **Işık alanının renkleri anlam taşımaz.** Alan bir durum göstergesi değil,
   bir malzemedir. Bu yüzden orada kırmızı ya da yeşil kullanmak serbesttir —
   ürünün geri kalanında olduğu gibi "risk" veya "olumlu" demez.
2. **Işık alanının DIŞINDA renk envanteri aynen geçerli:** turuncu yalnız zaman
   ve eylem, kırmızı `#E07272`/`#C94040` risk, amber `#D9A43B`/`#B87A00` uyarı,
   yeşil `#5FBF64`/`#2D8F32` olumlu. Bir hata mesajı ışık alanından renk almaz.

**Temel palet:** koyu `bg #120E08` · `surf #1C1710` · `card #241E16` ·
`tx #F3EDE3`. Açık `bg #F3ECE0` · `surf #FAF7F3` · `card #FFFDFB` ·
`tx #0E0E0E`. **Her iki tema da çizilecek.**

**Yazı ailesi:** Hanken Grotesk (400–900).

---

## 7 · Ekran ekran

### A · Karşılama — turun kahramanı

Taşıması zorunlu (kelimeler değişebilir):

- **Marka**: `luera` + turuncu nokta. Nokta markanın parçası, süs değil.
  İstenirse `luera timeflow` da olabilir — hangisinin daha iyi durduğunu **sen
  söyle ve gerekçelendir.**
- **Tek cümlelik vaat** — bugün "Salonunuzun randevuları, kasası ve ekibi tek
  yerde."
- **İki kapı**: "İşletmemi yönetiyorum · E-posta ve şifrenizle girin" /
  "Burada çalışıyorum · İşletmeden aldığınız kodla girin"
- **"Sonradan değiştirebilirsiniz."** — bu cümle kalmalı; seçimin geri
  dönülemez olmadığını söyleyen tek şey o.
- **"Yeni işletme oluştur"** en altta, sessiz.

**Turun asıl sorusu — ilk beş saniyenin koreografisi:**

Ekran açıldığı andan itibaren saniye saniye ne oluyor? Marka nasıl geliyor?
Işık alanı zaten orada mı, yoksa o da mı doğuyor? İki kapı ne zaman
beliriyor? Kullanıcı 0,8. saniyede düğmeye basarsa ne oluyor?

**Her adımın süresi, gecikmesi ve eğrisi yazılı olsun.** Ve toplam süre şunu
sağlasın: **ekran 1 saniyede kullanılabilir, 5 saniyede tamamlanmış.**

**İkinci soru — iki kapı nasıl ayrışıyor?** Aynı görünmemeliler; ama "müdür
kapısı parlak, personel kapısı sönük" de olmaz. Personel bu ürünün ikinci
sınıf kullanıcısı değil — kumandası ürünün en özenli parçası.

### B · Müdür girişi · C · Personel girişi

Sakin. Işık alanı devam ediyor ama **arkaya çekilmiş** — burada iş var, form
doldurulacak.

- **Klavye açıldığında ne oluyor?** Işık alanı durur mu, devam eder mi? Cam
  plaka klavyeyle birlikte yükselirken arkasındaki hareket dikkat dağıtır mı?
- **Hata hâli:** "E-posta veya şifre hatalı". Kırmızı kullanılabilir ama ışık
  alanından bağımsız olmalı.
- Personel tarafında akış üç adım: **kod → kim olduğunu seç → PIN**. Üçünün
  arasındaki geçiş nasıl?

### D · Dönüş girişi — günde otuz kez

Taşıması zorunlu: marka (küçük, üstte) · baş harfler + ad soyad +
`Studio Ayla · Kadıköy` · Face ID daveti · "PIN ile gir" / "Şifreyle gir" ·
"Bu telefon benim değil" (en altta, sessiz).

- **Bekleme hâli:** ekran Face ID'yi beklerken nasıl duruyor? Sürekli dönen
  bir animasyon olamaz. Ama tamamen ölü de olmamalı — bir nabız, bir hazır
  olma hâli.
- **Tanınma anı:** doğrulama başarılı olduğunda ekran nasıl teslim oluyor? Bu
  ürünün tek "kutlama" anı burası olabilir — ama **200 ms'yi geçmemeli.**
- **Başarısızlık:** Face ID tanımadı. İlk başarısızlık nasıl görünüyor?

---

## 8 · Değişmez kısıtlar

- **Dokunma hedefi 44 pt'nin altına inmez.** Hedef kitle 40–55 yaş, çoğu
  zaman ayakta ve tek elle.
- **`reduceMotion` açıkken hareket durur, BİLGİ DURMAZ.** Işık alanı donuk bir
  gradyana düşer — ama boş bir zemine değil. **Bu hâli de çiz.** Sözleşme
  kalktı ama bu kural kalktı DEĞİL: erişilebilirlik ayarı bir tercihtir.
- **Sahte hiçbir şey çizilmez.** Olmayan veri, gerçekleşmemiş onay, çalışmayan
  düğme yok.
- **Abonelik / plan / fiyat hiç geçmez** (App Store 3.1.1).
- **Krom yok:** araç çubuğu, sekme grubu, filtre satırı girmez.
- **375 × 667'de de çalışmalı.** Işık alanı küçük ekranda ezilmemeli.

**Mevcut ölçüler** (değiştirebilirsin, ama bilerek): karşılama marka 44
(küçükte 34), üstten 44/26, yanlardan 24 · seçim kutusu 86 (küçükte 78),
yarıçap 22, aralık 12 · sayfa yanı 18 · alt 30. Dönüş: avatar 76 · ad 24 ·
işletme 14.5 · Face ID halkası 118, ikon 52 · alt eylemler 52.

---

## 9 · Cevaplamanı istediğim sorular

1. **İlk beş saniyenin koreografisi nedir** — saniye saniye, süreleriyle?
2. **Ekran 1. saniyede kullanılabilir mi?** Animasyon devam ederken basılan
   düğme ne yapıyor?
3. **Işık alanı kaç kütleden oluşuyor**, hangi renkler, hangi süreler, hangi
   yönler?
4. **Android performans cevabı ne?**
5. **Cam plakanın tam tarifi:** blur yoğunluğu, saydamlık, kenarlık, iki
   temada ayrı ayrı.
6. **İki kapı nasıl ayrışıyor** — hiyerarşi kurmadan?
7. **D ekranı A'dan ne kadar sakin?** Sayıyla söyle.
8. **`luera.` mi `luera timeflow.` mi?**
9. **`reduceMotion` hâlinde ekran neye benziyor** ve hâlâ güzel mi?

Her hareket için bedelini etiketle:
**A** reanimated ile bugün yazılabilir · **B** Skia ister (**bu turda
uygulanamaz** — o hâlde A karşılığını da çiz) · **C** hiçbir şekilde mümkün
değil.

---

## 10 · Çıktı

**Koyu ve açık temada**, her ölçü ve süre yazılı:

1. **Karşılama** — tamamlanmış hâl ← **ana kare**
2. Karşılamanın açılış koreografisi: **0 sn · 0,4 sn · 1 sn · 2,5 sn · 5 sn**
   olmak üzere beş kare
3. Işık alanının dört farklı anı (aynı ekran, 10 sn arayla) — desenin
   tekrarlamadığını göstermek için
4. **Müdür girişi** — boş · yazarken (klavye açık) · hata
5. **Personel girişi** — üç adım
6. **Dönüş girişi** — bekleme · tanınma anı · başarısızlık
7. **`reduceMotion`** hâli (karşılama + dönüş)
8. **375 × 667** sıkışması
9. **Android düşük performans** hâli
10. Cam plakanın yakın çekimi, ölçüleriyle

Her karar için **bir cümlelik gerekçe** — özellikle koreografiyi, Android
cevabını ve iki kapının ayrımını çözerken.

---

## Kutuya yazılacak cümle

> Luera TimeFlow'un mobil giriş akışını yeniden tasarla: karşılama, müdür ve
> personel girişi, ve Face ID ile dönüş. Amaç, uygulamanın **ilk beş
> saniyesinin büyülemesi** — ama girişi geciktirmeden. Ekteki video hareket
> referansı: yavaşça biçim değiştiren organik renk alanları. Hareket
> serbesttir — **renk, bulanıklık, yay, layout, SVG içi değerler, hepsi
> animasyonlanabilir** (§3). Tek sınır Skia gerektirenler. Düğmeler alanın üstünde
> **buzlu cam** plakalar. Turuncu `#FF5A1F` bizim; ışık alanının geri kalan
> renklerinde serbestsin. Karşılama ömürde bir kez, dönüş girişi günde otuz
> kez görülür — **ikisi aynı ağırlıkta olamaz.**

**Effort: High.**
