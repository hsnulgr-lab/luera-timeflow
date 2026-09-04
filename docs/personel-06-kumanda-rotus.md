# Personel 06 · İşlem kumandası — rötuş turu

**Effort: High.** Bu bir **düzeltme turu**, yeniden tasarım değil.

Personel 05 çıktısı **onaylandı**. Kadran fikri, evrelere göre değişen içerik,
bekleme kurulunca ekranın kendini yeniden dizmesi, adın küçülmesi, sıcak
radyal ışık, para maskesi — hepsi doğru ve **korunuyor**.

Sıfırdan çizme. Kendi çıktının üstünde çalış.

---

## 0 · Dokunulmaz

- **Kadran yuvası** — ekranın ortasında tek yer, üç evrede aynı konumda
- **Bekleme halkası** — 238 pt, kurulunca geçen süre 26 pt'ye iner
- **Plaka** — ad 20 pt, hizmet 13 pt, üç araç düğmesi 48 pt
- **Kaydırma çubuğu** — jest, ölçü, eşik, dört an
- **Uzun bas** — jest, 900 ms, dolan yay
- **Para maskesi** — noktalar, dokununca 6 sn açılma
- **Sıcak radyal ışık** ve hâlle renk değiştirmesi
- **Renk paleti**

---

## 1 · Cam güverte B evresinde tamamen kalkıyor

Bugün `BİTİR` dairesi, kaydırma çubuğuyla **aynı cam kabuğun** içinde
duruyor. Çubuk tam genişlikteyken kabuk ona bir kulvar veriyor ve doğru; ama
çubuk 104 pt'lik bir daireye dönüşünce kabuk tam genişlikte kalıyor —
369 pt'lik bir panelin ortasında 104 pt'lik bir düğme, iki yanında sebepsiz
boşluk.

**Karar: B evresinde güverte hiç çizilmiyor.** Düğme zeminin üstünde yalnız
duruyor — iPhone'un konuşma ekranındaki END gibi.

İki şey çözülecek:

**`basılı tut` etiketi nereye gidiyor?** Bugün güvertenin içinde yaşıyor.
Kabuk kalkınca yeni bir yuva gerekiyor — ya da etiket hiç olmayıp bilgiyi
dairenin kendisi taşıyor.

**Kavram tutarlılığı.** Güverte A'da (çubuk) ve C'de (kasaya gönder) var,
B'de yok. Bu tutarsız görünmemeli. İki yol var, **kararı sen ver ve
gerekçelendir**:

- Güverte kavramı tamamen kalkar; her evrenin eylemi kendi başına durur
- Güverte kalır ama B'nin istisna olduğunu **kendisi anlatır** — örneğin
  kabuk daireye kadar büzülür ve dairenin çevresinde ince bir cam halka kalır

---

## 2 · A evresinde kadran değişiyor

Bugün kadranda `10:00 · PLANLANAN BAŞLANGIÇ` yazıyor — 96 punto. Ama personel
randevunun saatini zaten biliyor; bu haber değil.

**Kadranın kahramanı artık bekleme ya da gecikme:**

| Durum | Kadran |
|---|---|
| Müşteri kapıda | `10 dk` · **BEKLİYOR** |
| Saat geçti, müşteri yok | `14 dk` · **GECİKME** |
| İkisi de yok | ? |

Üçüncü satırın cevabı sende: müşteri henüz gelmemiş ve saati de geçmemişse
kadranda ne var? Planlanan saat mi geri geliyor, kadran boş mu kalıyor, başka
bir şey mi?

**Planlanan saat plakaya iniyor.** Bilgi kaybolmuyor, ağırlığı düşüyor.

**Bir uyarı:** üstteki durum satırı bugün `KAPIDA · 10 DK BEKLİYOR` diyor.
Kadran da aynı sayıyı söylerse ekranda **aynı bilgi iki kez** olur. Durum
satırı buna göre sadeleşmeli.

---

## 3 · Adisyon şeridi ne eklendiğini söylesin

Bugün şerit `ADİSYON · 4 kalem` diyor. Kalemleri görmek için alt sayfa açmak
gerekiyor.

Ama personelin ikinci büyük korkusu **kalem eklemeyi unutmak**, ve bunu
kontrol etmenin tek yolu listeye bakmak. "Boyayı ekledim mi?" sorusu bir
sayfa açtırmamalı.

Şerit **son eklenen kalemi** göstersin. Ölçü ve biçim sende; şeridin yüksekliği
artmamalı.

---

## 4 · "Ayrıca sürüyor" şeridi fazla sessiz

Bugün 12 punto, en sönük mürekkep. Ama anlamı şu: **başka bir müşterinin
boyası işliyor.**

Zeynep'in bekleme süresi, personel Ayşe'nin ekranına bakarken dolarsa hiçbir
şey olmuyor. Uygulamada **bildirim ve ses yok** — ekran tek güvence, ve o
ekran şu an bu bilgiyi fısıldıyor.

Şerit öteki işlemin **kalan süresini** taşısın ve süre azaldıkça sesini
yükseltsin. Son beş dakikada ne oluyor?

Sınır: bu şerit bu ekranın kahramanı olamaz. Personel burada Ayşe'yle
ilgileniyor.

---

## 5 · Cihazda doğrulanacak iki şey

Bunlar hata değil, **şüphe**. İkisini de çiz, yanına kendi değerlendirmeni yaz.

**İki büyük turuncu.** B evresinde `74:56` sayacı ve `BİTİR` düğmesi; ikisi de
doygun turuncu, ikisi de ekranın en parlak ögesi. Palete uygunlar (turuncu =
zaman **ve** eylem) ama 80 cm'den yarışıyorlar. Güverte kalkınca düğme daha da
yalnız kalacağı için denge değişecek — yeni hâliyle göster.

**Kuyruk hâlinin noktalı alt çizgisi.** 96 puntoluk sayının altındaki noktalı
çizgi zarif bir fikir — kuyruk hâli sayının kendisine yazılı. Ama o ölçekte
render hatası gibi okunabilir. Alternatifin varsa yanına koy.

---

## 6 · Çıktı

Az kare, derinlemesine. Yalnız değişenler.

1. **B evresi** — güverte kalkmış hâliyle, bekleme YOKken ve VARken
2. **Çubuk → düğme dönüşümü** — güverte de kalkarken; dönüşümün üç anı
3. **A evresi** — kadranda bekleme · kadranda gecikme · üçüncü durum
4. **Adisyon şeridi** — son kalem görünürken, üç farklı kalem cinsiyle
5. **"Ayrıca sürüyor" şeridi** — normal · son beş dakika
6. **İki turuncu** ve **kuyruk çizgisi** — kendi değerlendirmenle

Her değişiklik için bir cümlelik gerekçe.

---

## 7 · Kutuya yazılacak cümle

> Personel 05 çıktısının **rötuş turu** — sıfırdan çizme, kendi tasarımının
> üstünde çalış. Dört değişiklik: (1) B evresinde `BİTİR`in etrafındaki cam
> güverte **tamamen kalkıyor**, düğme zeminin üstünde yalnız duruyor;
> `basılı tut` etiketine yeni bir yuva ve güverte kavramına tutarlılık gerek.
> (2) A evresinde kadran artık planlanan saati değil **bekleme ya da
> gecikmeyi** gösteriyor; planlanan saat plakaya iniyor, üstteki durum satırı
> aynı sayıyı tekrar etmeyecek şekilde sadeleşiyor. (3) Adisyon şeridi kalem
> sayısının yanında **son eklenen kalemi** yazıyor. (4) "Ayrıca sürüyor"
> şeridi öteki işlemin **kalan süresini** taşıyor ve süre azaldıkça sesini
> yükseltiyor. Ayrıca iki şeyi cihaz gözüyle değerlendir: B evresindeki iki
> büyük turuncunun yarışması, ve kuyruk hâlinin noktalı alt çizgisi. Kadran
> fikri, halka, plaka, jestler, para maskesi ve palet **dokunulmaz**.

---

## 8 · Ekler

1. Cihazdan alınmış "Bugün" ekranı — bu ekranın açıldığı yer
2. iPhone konuşma ekranı END düğmesi — güverte kalktıktan sonraki ağırlık
   referansı

Onaylanan tasarım sohbette duruyor; ek olarak yeniden verilmesi gerekmiyor.
