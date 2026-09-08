# Personel 13 · Adisyonun kalemleri

**Effort: High.**

> Bu turun **tek** başlığı var: yüzlerce kalemlik bir katalog, altı düğmelik
> bir yüzeyin sadeliğini bozmadan nasıl erişilebilir olur — ve yanlış kalem
> nasıl seçilmez?
>
> "Formül ne zaman yazılıyor" sorusu bu turun konusu **değil**; kendi turu
> var (Personel 14) ve bu turdan SONRA çalışacak. Tek istenen §4.7'deki kısıt:
> bu yüzeye sonradan formülün kapısı gelecek, yeri dolmasın.

---

## 1 · Turun asıl gerilimi

Gerçek bir salonun kataloğu **yüzlerce kalem.** Boyalar, oksidanlar,
şampuanlar, bakım ürünleri, ek hizmetler. Ekranda bugün **altı tanesi** sabit
duruyor ve arama alanı çalışmıyor.

Ama çözüm bir **katalog modülü** değil. Bu ekran bir kumanda: az düğme, büyük
düğme, tek yol, en fazla iki seviye derinlik. Kategori ağacı, sekme grubu,
filtre çubuğu, "tümünü gör" sayfası — hepsi bu yüzeyi öldürür. Personel
işlemin ortasında, elleri boyalı, müşteri koltukta; katalog gezmiyor, **bildiği
şeyi yazıyor.**

İki kısıt aynı anda geçerli ve biri ötekine feda edilemez:

**Küçük kalacak.** Ekran büyüdüğü an kumanda olmaktan çıkıyor. Yüzeyin
büyüklüğü kataloğun büyüklüğüne göre **DEĞİŞMEZ** — 40 kalemli salonda da 400
kalemli salonda da aynı ekran. Tasarım döndüğünde ilk bakacağım ölçüt bu.

**Doğru olacak.** Sebebi aşağıda.

---

## 2 · Neden doğruluk bu ekranda kritik

Adisyondaki malzeme kalemleri **formülün malzeme yarısını** oluşturuyor.
Formül altı ay sonra okunuyor ve o gün "bu saça ne yapmıştım" sorusunun tek
cevabı o.

Buradaki bir hata sessizce üç yere birden gidiyor:

| Yanlış kalem | Sonucu |
|---|---|
| Müşterinin ödeyeceği tutar | yanlış para |
| Depodan düşen malzeme | yanlış stok |
| **Formülün malzeme yarısı** | **altı ay sonra yanlış formül** |

İlk ikisi aynı gün fark edilir. **Üçüncüsü hiç fark edilmez** — ve tam olarak
kaydın var olma sebebini yok eder.

### Somut tehlike: adlar birbirine benziyor

Boya kodları neredeyse aynı dizeler: `7.3` · `7.31` · `7.34` · `8.3` · `6.3`.
Bir rakam fark. Arama kutusuna `7.3` yazınca ekrana **beş yakın satır**
düşüyor ve yanlışını seçmek hiçbir uyarı üretmiyor.

Renkte bu, altı ay sonra saçın yanlış çıkması demek.

> **Tasarımın cevaplaması gereken:** benzer adlar arasından doğrusunun
> seçildiği nasıl **görünür** olur? Kod mu öne çıkar, son kullanım mı, o
> müşteride daha önce kullanılan mı?

---

## 3 · Bugün ekranda ne var, ne yok

### 3.1 · Arama alanı ÇALIŞMIYOR

"Katalogda ara" bir metin alanı değil: içinde `Text` olan bir `View`.
Dokunulamıyor, klavye açılmıyor.

Ölü bir düğmeden kötü, çünkü **bir giriş alanı gibi çizilmiş.** Personel
dokunuyor, hiçbir şey olmuyor, telefonun donduğunu sanıyor.

Altında altı kalemlik "Sık kullanılanlar" var ve gerçek bir salonun kataloğu
altı kalem değil. Yani arama bir süs değil, **ekranın yarısı.**

### 3.2 · Miktar yok

Her dokunuş `×1` yeni bir satır açıyor. Aynı boyayı iki kez eklemek **iki ayrı
satır** üretiyor, `×2` bir satır değil. Veri modeli miktarı zaten taşıyor
(`qty`) — ekran kendi verisinin söylediğini yazamıyor.

Boyada bu ölçünün kendisi: "iki tüp" ile "bir tüp" farklı formül.

### 3.3 · Kalem silinemiyor, düzeltilemiyor

Adisyon satırlarında **tek bir dokunulur öge yok.** Yanlışlıkla eklenen kalem
orada kalıyor; miktar değişmiyor, fiyat düzeltilmiyor, satır kaldırılmıyor.

Personel yanlış tutarı müşteriye okuyup **müdürü çağırmak zorunda.** Kumandanın
bütün felsefesi "hata yapma ihtimalini ortadan kaldırmak"tı; burası tam tersini
yapıyor.

> **Sunucu tarafı engel DEĞİL.** `visit.items` ucu listenin TAMAMINI alıyor
> (`visitItems(reservationId, items)`), yani silme ve düzeltme bugün de
> yazılabilir. Katalog ucu (`api.catalog()`) da yazılı — hiçbir ekran
> kullanmıyor. Eksik olan **yalnız arayüz.**

---

## 4 · Verilen kararlar — bunları tartışma

1. **Kalem eklemek alt sayfada.** Kumandanın arkası (sayaç, plaka, süre)
   görünmeye devam etmeli; işlemin ortasındaki personel bağlamı kaybetmiyor.
2. **Üç tür var ve karışmıyor:** `EK HİZMET` · `ÜRÜN` · `MALZEME`.
   Malzemenin fiyatı yok — depodan düşüyor, müşteriye yazılmıyor.
3. **Tutar maskeli.** Ekran müşterinin gözü önünde; para üç noktayla duruyor
   ve dokununca 6 saniye açılıyor.
4. **Adisyon kasaya gidince KİLİTLENİYOR.** Kilit veriden türüyor
   (`is_paid` / `status`). Kilitliyken düzenleme kontrolleri kısılmıyor —
   **çizilmiyor.**
5. **Krom yok:** araç çubuğu, filtre satırı, sekme grubu girmez.
6. **Dokunma hedefi 44 pt taban; kutular 68 pt.** Eldiven payı.
7. **Bu yüzeye sonradan FORMÜLÜN KAPISI gelecek.** İşlem sürerken formül
   bugün açılamıyor ve bu ayrı bir turun konusu (Personel 14). Senden istenen
   onu tasarlamak değil — **yerini doldurmamak.** Adisyon şeridini ve satır
   bölgesini son santimine kadar kullanan bir çözüm, bir sonraki turu
   çıkmaza sokar. Nereye ekleneceğini düşünmen gerekmiyor; yalnız hiç boşluk
   bırakmayan bir yerleşim önerme.

---

## 5 · Tasarlanacaklar

### A · Yüzeyin ölçeğe direnmesi  ← turun asıl çıktısı

400 kalemlik katalog, 6 kalemlik ekranın sadeliğini nasıl bozmuyor?

**Sıklık** en güçlü aday: personel gerçekte 8–12 kalem kullanıyor, kalanı ayda
bir. Ama sıklık neye göre — bu personele göre mi, bu hizmete göre mi
(saç boyamada boya, manikürde oje), bu müşteriye göre mi?

> Bunun için veri **var**: geçmiş adisyonlar. Uydurulacak bir şey yok.

Sık kullanılanlar kaç tane olmalı — bugün altı. Liste **kişiye göre değişince**
personel ezberini kaybeder mi? (Konumun sabitliği, hızın kendisidir.) Yeni
başlayan personelde sıklık verisi **yok** — o hâl ne gösteriyor?

### B · Arama — ekranın ikinci yarısı

Klavye burada **açılmak zorunda**, ama sözleşme "klavye bu kullanıcı için
düşmanca" diyor. İkisi nasıl uzlaşıyor?

Kaç harfte sonuç geliyor? Boya kodu yazmak (`7.3`) ile ad yazmak (`şampuan`)
aynı kutuda mı? Sonuç satırı neyi gösteriyor — **ad yetmiyor**, çünkü §2'deki
tehlike tam olarak adların benzemesi.

Klavye açıkken alt sayfa ne yapıyor? *(Personel 12'de serbest not bu sorunu
ayrı bir yüzle çözdü: klavye gövdenin üstüne değil YERİNE geliyor ve o adımda
başka düğme çizilmiyor. Aynı kalıp burada da geçerli mi?)*

Arama sonuç bulamazsa ne diyor — ve personel katalogda **olmayan** bir şey
kullandıysa ne yapıyor? (Salon her ay yeni ürün alıyor; katalog müdürün
işi ve gecikebiliyor.)

### C · Doğru kalemi seçtiğinin görünmesi

§2'nin cevabı. Seçimden **sonra** ne görünüyor ki personel yanlışını fark
etsin? Bugün tek işaret şeritteki "son ..." satırı ve 700 ms'lik "Eklendi".

Renk kodu, son kullanım tarihi, "bu müşteride daha önce" işareti — hangisi
ayırt ettiriyor, hangisi gürültü?

**Dikkat:** ekran müşterinin gözü önünde. "Bu müşteride daha önce kullanıldı"
bilgisi müşteriye bir şey söylüyor mu?

### D · Miktar

Aynı kalemi ikinci kez eklemek `×2` mi yapmalı, ikinci satır mı açmalı?
Miktar ekleme anında mı seçiliyor, sonradan satırda mı düzeltiliyor?

Boyada miktar gerçek bir ölçü, fönde nadir. Aynı kontrol her türe uyuyor mu,
yoksa miktar yalnız malzemenin işi mi?

### E · Satırın silinmesi ve düzeltilmesi

Seçenekler ve bedelleri:

- **Kaydırarak sil** — hızlı; ama `gesture-handler` YOK, `PanResponder` ile
  yazılır ve alt sayfanın kendi çekme jestiyle çakışabilir
- **Satırda `···` menü** — açık; her satıra bir düğme ekliyor
- **Satıra dokun → düzenleme yüzü** — tek yol; iki seviye
- **Toplu "düzenle" kipi** — kip bu üründe şüpheli

**Kararı sen ver ve gerekçelendir.** Eller boyalı, müşteri karşıda: **yanlış
satırı silmek, yanlış satırı eklemekten kötü.**

Silme geri alınabilir mi? Personel 11'de kasaya göndermenin altı saniyelik bir
penceresi var — aynı dil burada da geçerli mi, yoksa bir adisyon kalemi o
kadar ucuz mu?

**Malzeme silmek formülü de etkiliyor** (§2). Formül zaten yazılmışsa silinen
malzeme ne oluyor — ekran bunu söylemeli mi?

### F · Fiyat

Ürün ve ek hizmetin fiyatı katalogdan geliyor; salonlar iskonto yapıyor.
Fiyat bu ekranda değişebilmeli mi, yoksa bu müdürün işi mi? Değişebilirse
klavye gerekiyor ve para müşterinin gözü önünde yazılıyor — maskeyle nasıl
uzlaşıyor?

### G · Depodan düşen malzeme

"Malzeme kalemleri işlem bitince depodan düşer" yazıyor. Silinen malzeme
depoya geri mi dönüyor, ekran bunu söylemeli mi?

**Uyarı:** stok seviyesi verisi YOK. "3 tüp kaldı" gibi bir şey çizme.

### H · Boş ve kilitli hâller

Hiç kalem yokken şerit ne diyor? ("son eklenen kalem" satırının söyleyeceği
bir şey yok — tek meşru kırılma **sıfır**.) Kilitli adisyonda bu yüzey ne
gösteriyor?

### I · Hareket

Kalem eklendiğinde şeritteki sayı ve "son" satırı değişiyor. Silme nasıl
görünüyor? **Yükseklik animasyonlanmıyor.**

---

## 6 · Kapalı veri listesi

```
AdisyonItem = {
  id        : satır kimliği
  name      : katalogdan gelen ad
  price     : tutar (malzemede 0)
  kind      : 'product' | 'material' | 'extra'
  productId : ürün kimliği (varsa)
  serviceId : hizmet kimliği (varsa)
  qty       : adet
}
```

Kullanılabilecek diğer kaynaklar: **geçmiş adisyonlar** (sıklık buradan
türer), **bu müşterinin geçmişi**, **randevunun hizmeti**.

**Olmayan:** stok seviyesi, fotoğraf, barkod, tedarikçi, maliyet, renk
paleti.

---

## 7 · Değişmeyecek kısıtlar

- **Yalnız `opacity` · `translateX/Y` · `scale`.** Yükseklik, genişlik, renk,
  yarıçap, gölge animasyonlanmıyor. *(`reanimated` kurulu ama yazılmış
  ekranlar taşınmıyor; kumanda yazılmış bir ekran.)*
- **`react-native-gesture-handler` YOK ve kurulmayacak.** Jestler
  `PanResponder` ile. `LayoutAnimation` yasak.
- **Dokunma hedefi 44 pt'nin altına inmez**; kutular 68 pt.
- **Turuncu `#FF5A1F` yalnız ZAMAN ve EYLEM.** Durum rengi değil.
  Risk `#E07272`/`#C94040` · amber `#D9A43B`/`#B87A00` ·
  yeşil `#5FBF64`/`#2D8F32`.
- **Para maskeli.**
- **`reduceMotion` açıkken hareket durur, BİLGİ DURMAZ.**
- **Kurallar VERİDEN türer, moddan değil.** "Şu kadar kalem varsa şu düzen"
  gibi bir eşik yok. Tek meşru kırılma **sıfır**.
- **Ölü kontrol yok, sahte onay yok** — bu turun var olma sebebi tam olarak
  bu kuralın iki yerde çiğnenmiş olması.

Sözleşme dışına çıkan bir hareket önerirsen bedelini etiketle:
**A** bugün yazılabilir · **B** kütüphane ister · **C** mümkün değil.

---

## 8 · Cevaplamanı istediğim sorular

1. **400 kalemlik katalog, 6 düğmelik yüzeyi nasıl bozmuyor?**
2. Benzer adlar (`7.3` · `7.31` · `8.3`) arasından **doğrusunun** seçildiği
   nasıl görünür oluyor?
3. Sık kullanılanlar neye göre sıralanıyor — ve sıra değişince personel
   ezberini kaybeder mi? Yeni personelde ne oluyor?
4. Arama klavyesi ile "klavye düşmanca" kuralı nasıl uzlaşıyor?
5. Satır nasıl siliniyor, yanlış silme nasıl engelleniyor, geri alınabilir mi?
6. Miktar ekleme anında mı, satırda mı? Aynı kalemin ikincisi `×2` mi?
7. Fiyat personelin işi mi, müdürün mü?
8. **Kaç dokunuşta bir kalem ekleniyor?** Bugün iki (aç · dokun). Artıyor mu?
9. Bütün bunlar **375 × 667**'de ne oluyor?

---

## 9 · Çıktı

**Koyu ve açık temada**, her ölçü ve süre yazılı:

1. **Ana kare** — kalem ekleme, sık kullanılanlar, arama kapalı
2. Arama **açık**, klavye ekranda, sonuçlar süzülmüş
3. **Benzer adlar** arasından seçim — `7.3` yazılmış hâli
4. Arama sonuç bulamadı
5. Adisyon şeridi ve satırların **düzenlenebilir** hâli
6. Bir satırın **silinme** anı
7. Silme geri alınabiliyorsa o hâl
8. **Miktar** değiştirme
9. Fiyat düzenleme (çözümünde varsa)
10. **Boş adisyon**
11. **Kilitli adisyon**
12. `reduceMotion`
13. **375 × 667** sıkışması

Her karar için **bir cümlelik gerekçe**.

---

## 10 · Ekler ve kutuya yazılacaklar

**Ekler:**
1. `Luera Mobil - Personel 06 Islem Kumandasi.html` — **değiştirilen ekran**
2. `Luera Mobil - Personel 12 Ziyaretin Formulu.html` — formül bu kaleme bağlı;
   ayrıca klavye adımının kalıbı orada
3. `Luera Mobil - Personel 11 Kasaya Gonderme.html` — geri alma penceresinin dili
4. `docs/design-reference/Luera Mobil - Hareket Sözleşmesi.html`
5. `docs/design-reference/Luera Mobil - Durumlar.html`
6. Cihazdan alınmış bugünkü "Kalem ekle" görüntüsü

**Kutuya yazılacak cümle:**

> Adisyona kalem eklemeyi ele alıyoruz. Gerçek bir salonun kataloğu yüzlerce
> kalem; ekranda bugün altı tanesi sabit duruyor ve arama alanı bir metin
> alanı bile değil — hiçbir şey yapmıyor. Ama çözüm bir katalog modülü DEĞİL:
> bu ekran bir kumanda ve **yüzeyin büyüklüğü kataloğun büyüklüğüne göre
> değişmemeli** — 40 kalemli salonda da 400 kalemli salonda da aynı ekran.
> Doğruluk burada kritik, çünkü **formülün malzeme yarısı bu listeden türüyor**
> ve formül altı ay sonra okunuyor: yanlış boya kodu aynı gün fark edilmez,
> altı ay sonra saçın yanlış çıkması olarak ortaya çıkar — üstelik kodlar
> birbirine çok benziyor (`7.3` · `7.31` · `8.3`). Ayrıca eklenen kalem bugün
> silinemiyor, miktarı değişmiyor. Sunucu tarafı engel değil; eksik olan
> yalnız arayüz. Ekran müşterinin gözü önünde kullanılıyor, personelin elleri
> boyalı, ve **yanlış satırı silmek yanlış satırı eklemekten kötü.** Hızlı,
> sade ve güzel olmalı — üçünden biri feda edilirse tur başarısız.

**Effort: High.**

---

## 11 · Doğrulama

Bu bir **tasarım** turu; kod doğrulaması yok. Tasarım döndüğünde ölçeceklerim:

- **Yüzeyin katalog büyüdükçe büyümediği** — 40 kalemde de 400'de de aynı ekran
- Her kontrolün **gerçekten bir şey yaptığı**
- Benzer adların ayırt edilmesinin **çizilmiş** olduğu
- Kalem eklemenin dokunuş sayısının **artmadığı**
- Adisyon şerit bölgesinde §4.7'nin istediği **boşluğun bırakıldığı**
- Dokunma hedeflerinin 44 pt'nin altına inmediği
- Önerilen her hareketin sözleşme içinde olduğu
- Turuncunun yalnız zaman ve eylemde kullanıldığı
- Kilitli adisyonda hiçbir düzenleme kontrolünün çizilmediği
- Sıfır kalemin kendi cümlesinin olduğu
- Onüç karenin onüçünün de çizilmiş olduğu
