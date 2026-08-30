# Personel 01 · Bugün — düzeltme turu (2. tur)

Mevcut dosya: birinci turun çıktısı.
**Sıfırdan çizme.** Yerleşim, gün şeridi, şimdi çizgisi, boşluk göstergesi ve
satır anatomisi DOĞRU. Değişecek olan üç şey var ve biri ekranın işini
değiştiriyor.

**Effort: High.**

---

## 0 · Doğru olanlar — hiçbirine dokunma

Birinci tur şunları çözdü ve korunuyor:

| | |
|---|---|
| Gün başlığı | `Paz.` + turuncu nokta + sönük `30` — müdürle birebir aynı bileşen |
| Gün şeridi | 7 gün, altında yoğunluk işaretleri, ay değişimi (`EYL`) |
| Seçili gün ve bugün | İki AYRI işaret, karışmıyor |
| Şimdi çizgisi | Turuncu saat hapı + saç teli |
| Boşluk | `2 SA BOŞ` + kesik çizgi |
| Uyarı rozeti | Amber daire, içerik dokununca |
| İlk ziyaret | Yeşil, uyarı değil — iyi haber olarak duruyor |
| Satır içeriği | saat · ad · hizmet · süre |

---

## 1 · EKRANIN İŞİ DEĞİŞTİ — önce bunu oku

Kullanıcı kararı: **Bugün ekranı artık hiçbir şey BAŞLATMIYOR.**

Karta dokunmak **randevu detayını** açar; "İşleme başla" orada yaşar. O ekran
bir sonraki turun konusu.

Sonuçları:

- Alttaki `Merve'yi başlat · 09:30` çubuğu **kalkıyor** (§2C).
- Ekranda **hiçbir birincil eylem yok**. Bu bir eksiklik değil, bir karar:
  gün görünümü **günü gösterir**, randevu ekranı **iş yapar**.
- Randevunun hâlleri hâlâ gerekli — ama **eylem olarak değil, DURUM olarak**.
  Kart "başlat" demiyor; "bu geldi", "bu sürüyor", "bu bitti" diyor.
- Ekranın tamamı tek bir jestle kullanılıyor: **kaydır ve dokun.**

---

## 2 · Üç değişiklik

### A · Randevular KART olacak — "cam" ama **gerçek blur YOK**

Bugün satırlar kenardan kenara, aralarında saç teli. Bunlar **karta** dönecek:
yuvarlatılmış köşe, kendi yüzeyi, aralarında boşluk.

**Ama gerçek `blur` KULLANILMAYACAK — karar verildi.** Gerekçe ölçülebilir:

Referanstaki kartlar cam gibi duruyor çünkü **arkalarında renkli, bulanık bir
fotoğraf var**. Luera'nın zemini düz tek renk. Düz bir zeminin üstünde gerçek
bulanıklık ile saydam bir dolgu **birebir aynı görünür** — bulanıklaştıracak
bir şey yok. Yani gerçek cam bu ekranda görsel olarak hiçbir şey kazandırmıyor,
buna karşılık üç bedel getiriyor: iOS 26 altında sessizce düz bir `View`'a
düşüyor, "Saydamlığı azalt" açıkken kapanıyor, ve 6+ bulanık yüzey kaydırmada
takılma üretiyor.

**Senden istenen: camın GÖRÜNÜŞÜNÜ katmanla kurmak.** Düz zeminde "buzlu cam"
hissini veren şeyleri tek tek ver, iki temada da **kesin değerlerle**:

- Yüzey dolgusu — sayfadan ne kadar açık? (rgba)
- Kenarlık — saç teli mi, ve **üst kenar alt kenardan parlak mı**? (ışık
  yukarıdan gelir; camı cam yapan şeylerin birincisi bu)
- İç parıltı — üst kenarın hemen altında ince bir aydınlanma var mı?
- Köşe yarıçapı, kartlar arası boşluk, iç dolgu
- Kartın kendi gölgesi var mı? (**gölge animasyonlanamaz** — statik olmalı)
- **Açık temada** aynı hissi ne veriyor? Koyuda "daha açık" olan yüzey, açıkta
  "daha koyu" mu yoksa "daha beyaz" mı?

Bunlar tasarımın gerçek işi: cam olmayan bir şeyi cam gibi göstermek, ve bunu
iki temada da tutturmak.

### B · Süren işlemin kartında **dönen turuncu parıltı**

Referans video kare kare çözüldü (ekteki dört görüntü). **Parıltı kartın
ETRAFINDA dönen bir halka DEĞİL** — bu ayrım önemli:

Renk, yüzeyin **İÇİNDE** yaşıyor. Koyu saydam bir hapın içinde, kenara yakın
duran yumuşak bir aydınlanma var ve yavaşça geziniyor: bir karede magenta-mavi
sağ kenarda, ötekinde yeşil-turkuaz sol alta kaymış. İçerik (yazı, nokta) bu
ışığın üstünde duruyor ve ondan etkilenmiyor.

Yani aranan şey **iç aurora**: kartın yuvarlak köşeleriyle kırpılan, içerikten
geride duran, ağır ağır gezinen bir ışık lekesi.

**Bizde yalnız TURUNCU.** Turuncu bu üründe zaman ve eylem rengi; parıltının
söylediği şey "şu an bu oluyor" ve o tam olarak zaman.

**Yalnız ŞU AN SÜREN işlemin kartında** — karar verildi. Sıradaki randevu
parlamaz. Sonucu önemli: **işlem yokken ekranda hiçbir parıltı olmaz.** Sabah
ekranı sakin açılır, parıltı bir olay olduğunda belirir ve bir tane olur.

Tasarlanacaklar:
- Işık lekesi ne kadar büyük, ne kadar yumuşak, kartın ne kadarını kaplıyor?
- **Kaç leke var?** Referansta en az iki ayrı renk odağı görünüyor (biri
  yeşil, biri magenta-mavi) ve ikisi birlikte geziniyor. Bizde tek turuncu
  odak mı, yoksa iki farklı tonda iki odak mı?
- Leke kenara ne kadar yakın duruyor — merkeze hiç geliyor mu?
- Kartın kenarlığı bu ışıktan etkileniyor mu, yoksa üstünde sabit mi duruyor?
- İçerik (saat, ad, hizmet) ışığın üstünde ve ondan **etkilenmiyor** —
  okunurluk her karede korunmalı. En parlak anda kontrast kaç?
- **Dönüş süresi kaç saniye?** DİKKAT — hareket sözleşmesinde yedi süre var ve
  belgenin kendi cümlesi şöyle: *"Bunların dışında sayı yok — yeni bir süre
  gerekiyorsa sözleşme değişir."* Sürekli dönüş bu yedisinin hiçbiri değil.
  **Yeni süreyi öner ve gerekçelendir**; sözleşmeye eklenecek.
- Açık temada parıltı ne oluyor? (Beyaz zeminde turuncu parıltı koyudakinden
  çok daha baskın görünür.)

**Teknik kısıt — uygulanabilirliği belirliyor:** ışık lekesi **önceden
çizilmiş** bir katman olacak (gradyan), kartın içine konacak ve yalnız
`transform` ile gezdirilecek — `rotate` ya da `translate`, ikisi de yasal.
Renk, gölge ve gradyan durağı animasyonlanamaz. Kart `overflow: hidden`
alabilir çünkü dışarı taşan bir şey yok; bu, dışarıdaki bir halkaya göre hem
daha ucuz hem daha güvenli.

Sözleşmenin `LINEAR` eğrisi zaten *"karartma, parıltı, renk"* için ayrılmış —
bu hareket oraya ait.

**`reduceMotion` açıkken dönüş durur ama PARILTI DURMAZ.** "Bu işlem sürüyor"
bir bilgidir; hareket kapalıyken sabit bir turuncu halka olarak kalır. Sabit
hâli de çiz.

### C · Alttaki başlat çubuğu **kalkıyor**

`Merve'yi başlat · 09:30` çubuğu tamamen gidiyor (§1).

Sorulacak şey: o çubuğun kapladığı yer **boş mu kalıyor**, yoksa liste aşağı mı
uzuyor? Sekme çubuğunun hemen üstünde bir nefes payı kalmalı mı?

---

## 3 · Veri boşlukları — bunlara tasarım yapma, ya da işaretle

Birinci turda çizilen üç şeyin **arkasında veri yok**. Karar bekliyorlar:

| Tasarımdaki şey | Durum |
|---|---|
| `vardiya 09:00 – 19:00` | Çalışma saatleri personele HİÇ gönderilmiyor; kodda 09:00–19:00 sabit bir varsayılan. Bugün çizilirse her salonda aynı yazar. |
| Yeşil ✓ (gelecek randevuda) | Ne demek? "Müşteri geleceğini bildirdi" ise o alan (`customer_confirm`) da uca eklenmeli. |
| Amber `!2` | İki *ne*? Sayım neyden türüyor? |
| "Müşteri geldi" hâli | `customer_arrived_at` uca eklenmeli — vardiyanın en kritik anı bu. |

**Bu turda:** bu dört öğeyi çizmeye devam et ama **her birini işaretle** —
"bu alan sunucudan gelmiyor" diye. Uydurma veriyle tasarım yapmak, sonra
uydurma veriyle kod yazmaya dönüşüyor.

---

## 4 · Değişmeyen kısıtlar

Birinci turdakilerin hepsi geçerli. Bu turda öne çıkanlar:

- **Yalnız `opacity`, `translateX/Y`, `scale`** — hepsi native sürücüde.
  **Renk, gölge, köşe yarıçapı ve yükseklik animasyonlanamaz.** Parıltının
  dönüşü bu yüzden `rotate`, gradyan kayması değil.
- `LayoutAnimation` yasak · `reanimated` ve `gesture-handler` yok.
- **Gerçek blur bu ekranda kullanılmıyor** (§2A).
- **Dokunma hedefi:** kartın tamamı dokunulabilir ve 44 pt taban değil, çok
  üstünde. Eller ıslak/boyalı/eldivenli.
- **Ekran müşterinin gözü önünde:** uyarıların içeriği kartta açık yazmaz.
- **Turuncu yalnız zaman ve eylem.** Parıltı bu yüzden turuncu; durum rengi
  olarak kullanılamaz.
- **Kurallar veriden türer, moddan değil.** Eşik yok; tek meşru kırılma sıfır.
- **Ölü kontrol yok.** Ekranda eylem kalmadığı için bu turda özellikle önemli:
  dokunulup hiçbir şey açmayan bir kart olamaz.

---

## 5 · Cevaplamanı istediğim sorular

1. Düz zeminde camı cam yapan **tam olarak nedir** — dolgu mu, üst kenarın
   parlaklığı mı, iç parıltı mı? Hangisi olmazsa etki çöker?
2. Parıltının **dönüş süresi** kaç, ve neden o?
3. Işık kartın kenarlığını **değiştiriyor mu**, yoksa altında mı kalıyor?
4. Kart hâlleri (geldi · sürüyor · bitti · iptal) **yüzeyle mi** ayrışıyor,
   yoksa yalnız içerikle mi? Yüzeyle ayrışıyorsa dört ayrı cam değeri gerekir.
5. Başlat çubuğunun yeri boş mu kalıyor?
6. Kart yapısı `2 SA BOŞ` göstergesini ve şimdi çizgisini nasıl etkiliyor —
   onlar kart mı, kartlar arası mı?
7. 375 × 667'de kartlar ne kadar sıkışıyor?

Sözleşme dışına çıkan hareket önerirsen bedelini etiketle:
**A** bugün yazılabilir · **B** kütüphane ister · **C** mümkün değil.

---

## 6 · Çıktı

**Koyu ve açık temada**, her ölçü, renk ve süre yazılı:

1. **Sabah 09:00** — hiçbir işlem sürmüyor, **hiçbir parıltı yok**, 6 kart
2. **Öğlen 12:36** — bir işlem sürüyor (**parıltılı kart**), bir müşteri geldi,
   ikisi bitmiş ← **ana kare**
3. **Akşam 18:20** — hepsi bitmiş, gün sonu
4. Işığın **dört ayrı karesi** — gezinmenin dörtte birlik anları
5. Parıltının `reduceMotion` hâli (sabit halka)
6. Kartın hâlleri tek tek: bekliyor · geldi · sürüyor · bitti · kasaya gitti ·
   iptal
7. Cam katmanlarının **patlatılmış çizimi**: dolgu · kenarlık · iç parıltı ·
   gölge — her biri ayrı ayrı ve rgba değerleriyle
8. 375 × 667 sıkışması

Her karar için **bir cümlelik gerekçe**.

---

## 7 · Kutuya yazılacak cümle

> İkinci tur, düzeltme. Yerleşim doğru — sıfırdan çizme. Üç değişiklik:
> (1) satırlar **kart** olacak ve cam gibi duracak ama **gerçek blur
> kullanılmayacak**, çünkü zemin düz ve bulanıklaştıracak bir şey yok — camın
> görünüşünü katmanla kur, iki temada rgba değerleriyle ver. (2) **Yalnız şu an
> süren** işlemin kartının etrafında dönen turuncu bir parıltı; önceden çizilmiş
> katman + `rotate`, çünkü renk ve gölge animasyonlanamıyor; dönüş süresini
> öner ve gerekçelendir (sözleşmede yedi süre var, bu onların dışında).
> (3) Alttaki "başlat" çubuğu **kalkıyor** — bu ekran artık hiçbir şey
> başlatmıyor, karta dokunmak randevu detayını açacak. Ekranda birincil eylem
> yok ve bu bir karar.
