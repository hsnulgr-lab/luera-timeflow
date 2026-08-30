# Personel 01 · Bugün — yüzey turu (3. tur)

**Bu tur DAR.** Yerleşim, durumlar, boşluklar, katlanmış "BİTTİ" satırı, gün
şeridi ve şimdi çizgisi **doğru ve dokunulmayacak.** Tek konu: **kartın
yüzeyi** ve **süren işlemin ışığı**.

**Effort: High.**

---

## 0 · İkinci turda doğru çıkanlar — koru

| | |
|---|---|
| `KAPIDA · 6 dk bekliyor` | "Müşterim geldi mi" sorusu ekranda cevaplanıyor |
| `BİTTİ · 2 iş · 1 sa 45 dk · ikisi kasada` | Katlanmış satır tam istendiği gibi |
| `2 SA BOŞ` · `1 SA 40 DK BOŞ` | Boşluklar anlatılıyor |
| `SÜRÜYOR` + `66:12` | Süren işlem ve geçen süre |
| Başlık cümlesi `2 iş bitti, 4 kaldı` | Vardiya saatleri yerine GERÇEKTEN sahip olduğumuz veri — doğru karar |
| Gün şeridi, ay değişimi, yoğunluk işaretleri | Değişmiyor |

---

## 1 · Sorun: kartlar cam değil, düz kutu oldu

İkinci turda satırlar karta dönüştü ama **kart olmalarının görsel bir sebebi
yok**: zeminden bir tık açık, kenarlıksız, düz gri dikdörtgenler. Bu, birinci
turdaki kenardan kenara satırlardan **geriye** gidiş — o satırlar en azından
dürüsttü.

Referans kartı (ekte, yakın plan) yan yana koyunca fark dört katmanda:

### Katman 1 · Dolgu DÜZ DEĞİL — dikey gradyanlı
Referansta yüzey üstte açık, aşağı doğru koyulaşıyor. Tek düz dolgu bu etkiyi
veremiyor; yüzey ölü kalıyor.

### Katman 2 · Kenarlık ASİMETRİK
Üst ve sol kenarda ince, parlak bir saç teli var; sağa ve aşağı doğru sönüyor.
**Işık yukarıdan gelir** — camı cam yapan şey birinci derecede bu, ve ikinci
turun çıktısında kenarlık HİÇ YOK.

### Katman 3 · İçeride DAHA AÇIK bir çip
Referansta sağdaki simge kendi yuvarlak karesinde duruyor ve o kare karttan
belirgin şekilde açık. Üç kademeli derinlik doğuyor: **zemin < kart < çip.**
İkinci turun rozetleri kartın üstünde yüzen daireler — entegre değiller,
o yüzden derinlik yok.

### Katman 4 · Nefes
Referansta metin bloğunun içinde ciddi dolgu var. İkinci turda sıkışmış.

**Senden istenen bu dört katmanı tek tek kurmak ve DEĞERLERİYLE vermek.**

---

## 2 · Zemin — yeni ve önemli

Referans kartın camlığının büyük kısmı **arkasındaki sıcak, bulanık zeminden**
geliyor; kenarlarda o rengin karttan sızdığı görülüyor. Bizim liste düz siyahın
üstünde, o yüzden dolgu ve kenarlık **tek başına** her şeyi taşımak zorunda
kalıyor — ikinci turun başarısız olmasının asıl sebebi bu.

**Oysa o sıcaklık ekranda ZATEN VAR:** başlık ve gün şeridi sıcak kahve
gradyanında duruyor, sonra listede birden bitiyor ve nötr siyaha düşüyor.

**Öneri: o sıcaklık listenin arkasına da çok hafif insin.** Blur yok, maliyet
yok — yalnız kartların üstünde oturduğu bir zemin. O zaman kartlar referanstaki
gibi *"bir şeyin üstünde duran cam"* olur; bugünkü gibi *"siyahta yüzen gri
kutu"* değil.

Bu, "gerçek blur kullanılmayacak" kararıyla **çelişmiyor** — ikisi ayrı şeyler.
Blur yok, zemin var.

Karar senin: zemin gelsin mi, ne kadar, nereye kadar iniyor, kaydırırken sabit
mi duruyor? Gelmesin diyorsan dört katmanın tek başına nasıl yeteceğini göster.

---

## 3 · Işık bir LEKE oldu — düzelt

İkinci turda süren işlemin kartındaki ışık, **sağ alt köşeye sıkışmış yoğun bir
kahverengi blob** olarak çıktı. İki şey ters gitti:

- **Yeri**: bir köşede duruyor. Referansta ışık **kenarı kucaklıyor** — geniş,
  yumuşak, yüzeye yayılmış. Gezinen bir ışık gibi değil, sızmış bir leke gibi
  duruyor. Köşe yarıçapından da taşıyor görünüyor.
- **Rengi**: turuncu değil **kahverengi**. Zeminle karışıp doygunluğunu
  kaybetmiş. Referanstaki renkler koyu yüzeyin üstünde *parlıyordu*; bu sönüyor.

**Işık geniş ve yumuşak olmalı, yoğun ve küçük değil.** Kartın önemli bir
kısmını kaplayan, kenara yakın duran, ağır ağır gezinen bir aydınlanma. Ve
**turuncu kalmalı** — kahveye düşerse "bu işlem sürüyor" demeyi bırakır, kirli
bir yüzey demeye başlar.

Kart `overflow: hidden` alıyor: ışık köşelerden taşmaz.

---

## 4 · Rozetler okunmuyor — çizim hatası

İkinci turun çıktısında sağdaki daireler bozuk: üst üste binmiş glifler
(`|2 O` gibi), yeşil onayın DIŞINDA başıboş bir nokta, içi boş bir halka.
Bunlar tasarım kararı değil, render bozukluğu — birinci turdaki temiz rozet
bu tura gelirken kırılmış.

**Tek daire, tek glif, dışarıda başıboş hiçbir şey yok.** Ve §1'in üçüncü
katmanı gereği rozet artık kartın üstünde yüzen bir daire değil, kartın içine
oturan **daha açık bir çip** olmalı.

---

## 5 · Bu turun ZORUNLU çıktısı: patlatılmış çizim

İkinci turda §2A bunu istedi ve gelmedi; tek düz dolguyla geçildi. Bu sefer
**birincil çıktı bu:**

Kartın her katmanı **ayrı ayrı** çizilecek ve **rgba değeriyle** verilecek —
**koyu ve açık temada ayrı ayrı**:

1. Zemin (varsa) — rengi, opaklığı, nereden nereye
2. Kart dolgusu — gradyanın üst ve alt durağı
3. Kenarlık — üst kenarın rengi, alt kenarın rengi, kalınlığı
4. İç aydınlanma (varsa) — nerede, ne kadar
5. Çip — dolgusu, kartla arasındaki fark
6. Gölge (varsa) — **statik olmalı, animasyonlanamaz**
7. Işık katmanı — gradyanın durakları, boyutu, kartın yüzdesi kaçı

Üstüne: bu katmanlar **üst üste bindiğinde** ortaya çıkan kartın çizimi.

---

## 6 · Değişmeyen kısıtlar

- Yalnız `opacity`, `translateX/Y`, `scale` — hepsi native sürücüde.
  **Renk, gölge, köşe yarıçapı ve yükseklik animasyonlanamaz.**
- Gerçek `blur` yok · `LayoutAnimation` yok · `reanimated`/`gesture-handler` yok
- Işık yalnız **şu an SÜREN** işlemde. İşlem yoksa hiçbir parıltı yok.
- `reduceMotion`: gezinme durur, **ışık durmaz** (sabit hâlini de çiz)
- Kartın tamamı dokunulabilir; 44 pt taban değil, çok üstünde
- Turuncu yalnız zaman ve eylem
- Ekranda **birincil eylem yok** — karta dokunmak randevu detayını açar
- Ölü kontrol yok

---

## 7 · Cevaplamanı istediğim sorular

1. Düz zeminde camı cam yapan **tam olarak hangi katman**? Biri olmazsa etki
   çöker — hangisi?
2. Zemin gelsin mi? Gelmezse dört katman tek başına nasıl yetiyor?
3. Kartın hâlleri (bekliyor · kapıda · sürüyor · bitti · iptal) **yüzeyle mi**
   ayrışıyor yoksa yalnız içerikle mi? Yüzeyle ise **kaç ayrı cam değeri**
   gerekiyor?
4. Açık temada aynı his neyle kuruluyor? Koyuda "daha açık" olan yüzey, açıkta
   "daha koyu" mu yoksa "daha beyaz" mı?
5. Işığın gezinme süresi kaç saniye ve neden? (Sözleşmede yedi süre var,
   bu onların dışında — öner ve gerekçelendir.)
6. En parlak anda kartın içindeki yazının kontrastı kaç?
7. Kartlar arası boşluk kaç, kartın iç dolgusu kaç, köşe yarıçapı kaç?
8. 375 × 667'de bu katmanların hangisi ilk feda edilir?

---

## 8 · Çıktı

**Koyu ve açık temada:**

1. **Patlatılmış çizim** (§5) — bu turun birincil çıktısı
2. Öğlen 12:36 ana karesi — bir işlem sürüyor, biri kapıda, ikisi bitmiş
3. Sabah 09:00 — hiçbir işlem sürmüyor, **hiçbir ışık yok**
4. Kartın hâlleri tek tek: bekliyor · kapıda · sürüyor · bitti · kasaya gitti ·
   iptal
5. Işığın dört ayrı karesi — gezinmenin dörtte birlik anları
6. Işığın `reduceMotion` hâli
7. Rozet/çipin tek başına çizimi, ızgarasıyla
8. 375 × 667 sıkışması

Her karar için **bir cümlelik gerekçe**.

---

## 9 · Kutuya yazılacak cümle

> Üçüncü tur, DAR: yalnız kartın yüzeyi ve süren işlemin ışığı. Yerleşim,
> durumlar, boşluklar, katlanmış BİTTİ satırı ve gün şeridi DOĞRU, dokunma.
> Kartlar cam olmadı — düz gri kutu oldular. Referans kartın camlığı dört
> katmandan geliyor ve dördü de eksik: (1) dolgu dikey gradyanlı, düz değil,
> (2) kenarlık asimetrik — üst ve sol parlak, aşağı doğru sönüyor, ışık
> yukarıdan gelir, (3) içerideki simge karttan DAHA AÇIK bir çipte, üç kademeli
> derinlik doğuyor, (4) metin bloğunda ciddi nefes var. Ayrıca referansın
> camlığı arkasındaki sıcak zeminden besleniyor; bizim ekranda o sıcaklık
> başlıkta zaten var ama listede bitiyor — listenin arkasına da hafifçe
> indirmeyi değerlendir (blur yok, sadece zemin). Süren işlemin ışığı köşeye
> sıkışmış kahverengi bir lekeye dönüştü; geniş, yumuşak ve TURUNCU olmalı.
> Rozetler bozuk çizilmiş (üst üste glifler, başıboş nokta) — temiz çiz.
> **Bu turun zorunlu çıktısı: kartın her katmanının ayrı ayrı, iki temada rgba
> değerleriyle patlatılmış çizimi.** İkinci turda istendi ve gelmedi.
