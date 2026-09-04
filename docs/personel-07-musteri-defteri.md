# Personel 07 · Müşteri defteri

Claude Design brief'i. **Effort: High.**

---

## Bu turun omurgası

Kuaförün bir müşteriyle ilgili tek gerçek sorusu var ve altı ay sonra sorulur:

> **"Geçen sefer bu saça ne yapmıştım?"**

Bugün bunun cevabı hiçbir yerde yok. Sektör hâlâ **basılı formül defteri**
kullanıyor — yazılımlar bu soruyu çözmediği için. Bu tur o defteri kuruyor.

Defterin **iki yüzü** var ve ikisi bu turda birlikte tasarlanacak:

1. **Yazma** — işlem biterken, kumandanın içinde. Eller boyalı, müşteri hâlâ
   koltukta.
2. **Okuma** — Müşteriler sekmesinde, bir sonraki randevudan önce.

Ayrı turlarda tasarlanırsa yazma tarafı okuma tarafının istemediği bir biçim
üretir ve ikisini uydurmak için üçüncü bir tur gerekir.

---

## 1 · Kullanıcı ve fiziksel kısıtlar

Bunlar tasarımın girdisi, arka plan bilgisi değil:

**Eller dolu.** Islak, boyalı, eldivenli. Yazma tarafı bir **form olamaz**:
altı alanı klavyeyle doldurmak bu kullanıcı için düşmanca. Dokunma hedefi
44 pt taban — tavan değil.

**Ekran müşterinin gözü önünde.** Telefon koltuğun yanında. Müşterinin
geçmişi, notu ve risk işareti **açıkça okunamaz** olmalı; bu, kartın
içeriğini doğrudan belirliyor.

**Telefon cebe girip çıkıyor.** Yazma anı 10 saniyeden uzun sürerse
yapılmaz. Bu turun başarı ölçüsü budur.

**Bodrum kat, kötü sinyal.** Yazma isteği kuyruğa düşebilir; kuyruk zaten
yazılı (`src/api/staff.ts`).

---

## 2 · Verilen kararlar — bunları tartışma

Bunlar işletmenin ve ürün sahibinin kararı. Gerekçelerini sorgulama,
üstüne tasarla.

1. **Personel salonun TÜM müşterilerini görür.** Takvimde de tüm salonu
   görüyor; ürün bu konuda tutarlı. Meslektaşın müşterisini aramak devir
   teslimde gerekiyor.
2. **Formül iki kaynaktan doluyor.** Adisyondaki malzeme kalemleri alanları
   *kendiliğinden* dolduruyor (`Boya · 7.3 kumral`, `Oksidan %6` zaten
   kayıtlı); personel yalnız **oran, süre ve sonuç** ekliyor. En az yazma,
   en çok veri.
3. **Formül hem alanlı hem serbest.** Alanlar makine okunabilir olsun diye,
   serbest not kuaförün kendi diliyle yazabilmesi için. İkisi bir arada.
4. **Para yok.** Bakiye, borç, tahsilat, geçmiş fiyat — hiçbiri bu ekranlara
   girmez. Sunucu zaten döndürmüyor: *"kumandanın işi hizmet, finans değil."*

---

## 3 · Kapalı veri listesi

**Aşağıda olmayan hiçbir alanı icat etme.** Önceki turlarda uydurulmuş ve
geri alınmış alanlar var; liste bu yüzden kapalı.

### Müşteri kartı — `staff-api → customer` bugün şunları dönüyor

| Alan | İçerik |
|---|---|
| `customer` | `id`, `name`, `phone`, `notes`, `custom_fields` |
| `history` | son 10 randevu: `id`, `date`, `service`, `status` |
| `packages` | `name`, `total_sessions`, `used_sessions` |
| `riskRules` | işletmenin kural listesi; eşlemeyi istemci yapıyor |

### Bu tur için YAZILACAK iki uç

Tasarım bunları varsayabilir; kapsamları burada sabit:

- **`customers`** — liste ve arama. Dönecek alanlar: `id`, `name`,
  `lastVisitDate`, `lastService`, `hasFormula`, `mine`.
  Telefon listede **dönmez** — kartta döner.
- **`visit.formula`** — formül yazma. Alanları aşağıdaki §4.1'de.

### Adisyon kalemi (formülün kendiliğinden dolan yarısı)

`{ name, kind: 'product' | 'material' | 'extra', price?, qty }`

Yalnız `kind: 'material'` olanlar formüle girer.

---

## 4 · Tasarlanacaklar

### 4.1 · Yazma yüzü — kumandanın içinde

**Nerede:** işlem bitirildikten sonra, adisyon kasaya gönderilmeden önce.
Yani C evresinde. Bu evrenin bugünkü hâli **korunacak** (bkz. §5).

**Formülün alanları** — malzeme kalemlerinden gelenler *dolu* gelir:

| Alan | Kaynak |
|---|---|
| Kullanılan malzemeler | **adisyondan otomatik** |
| Oran | personel |
| Bekleme süresi | **sayaçtan otomatik** (bekleme kurulduysa) |
| Sonuç | personel |
| Serbest not | personel |

**Turun en zor sorusu:** eldiven boyalıyken "oran" ve "sonuç" nasıl
giriliyor? Klavye cevap değil. Hazır seçenekler mi, kaydırmalı bir ölçek mi,
sesli not mu, yoksa bambaşka bir şey mi? **Kararı sen ver ve gerekçelendir.**

**İkinci soru:** formül yazmak **zorunlu mu?** Zorunlu olursa personel
uydurmaya başlar — uydurulmuş formül, formülsüzlükten kötüdür. Atlanabilir
olursa hiç yazılmaz. Bu ikisinin arasını nasıl kurarsın?

**Üçüncü soru:** boya yapılmayan bir işte (kesim, fön) formül alanı ne
oluyor? Görünmüyor mu, boş mu duruyor?

### 4.2 · Okuma yüzü — Müşteriler sekmesi

**Liste.** Her satırda **en az**: ad · son geliş · son hizmet. Formül kaydı
olan müşteri ayrışmalı.

Sorular:
- Salonun tamamı görünürken **kendi müşterileri nasıl öne çıkar?** İki ayrı
  bölüm mü, tek liste içinde bir işaret mi?
- Sıralama neye göre? Son geliş mi, alfabe mi, yakınlık mı?
- 200 müşteride liste ne oluyor? Arama nerede yaşıyor?
- **Boş hâller:** hiç müşteri yok · arama sonuç vermedi · henüz kimseye
  bakılmadı. Üçü ayrı cümle.

**Müşteri kartı.** Dokununca açılan yer. İçinde:
geçmiş işlemler · formüller · not · paket durumu · risk işareti · ara/yaz.

Sorular:
- **Formül geçmişi nasıl gösterilir?** Üç ay önceki formülle bugünkü
  arasındaki farkı görmek kuaförün asıl istediği şey. Liste mi, karşılaştırma
  mı?
- **Ekran müşterinin gözü önünde.** Risk işareti ve not "var" diyecek ama
  içeriğini okutmayacak. Bu nasıl olur?
- Karta **hangi yollardan** giriliyor? (Müşteriler sekmesi · kumandadaki
  "Müşteri kartı" düğmesi · takvimdeki blok.) Aynı kart mı açılıyor?

### 4.3 · İki yüzün bağı

Formül yazıldıktan sonra kartta **ne zaman** görünüyor? Adisyon kasaya
gidince mi, hemen mi? Kuyruğa düşmüşse ne yazıyor?

---

## 5 · Dokunulmazlar

Bunlar çizilmiş, onaylanmış ve **yeniden tasarlanmayacak**. Yeni ekranlar
bunların içine oturacak.

1. **Kumandanın üç evresi** (Personel 05/06) — kadran, halka, plaka,
   jestler, adisyon şeridi, para maskesi, palet. Formül yazma bu ekranın
   *içine* girecek; ekranı yeniden çizmeyecek.
2. **Sekme çubuğu** — beş sekme, etiketli, `NativeTabs`. Yeni sekme yok.
3. **Palet.** Turuncu `#FF5A1F` **yalnız zaman ve eylem** — durum rengi
   değil. Risk `#E07272`/`#C94040`, amber `#D9A43B`/`#B87A00`,
   yeşil `#5FBF64`/`#2D8F32`.
4. **Alt sayfa gövdesi** — 30 pt üst köşe, tutamaç, `%76` tavan yükseklik.
5. **İkon seti** — mevcut `<defs>`; yeni ikon gerekiyorsa aynı çizgi
   kalınlığıyla ve gerekçesiyle.

---

## 6 · YASAK — daha önce uydurulmuş ve geri alınmış olanlar

Bunlar isim isim yasak, çünkü önceki turlarda üretildiler:

- **`!2` rozeti** ya da benzeri sayılı uyarı işaretleri
- **"İlk ziyaret"** etiketi — uyarı değil, iyi haber; ayrı ağırlıkta durmalı
- **Mavi hizmet şeridi** — palet dışı
- **Bakiye, borç, tahsilat, geçmiş fiyat** — sunucu döndürmüyor
- **Öncesi/sonrası fotoğrafı** — değerli ama **KVKK çözülmeden çizilmeyecek**;
  açık rıza ve saklama süresi tanımlı değil
- **Yıldız / puan / memnuniyet** — böyle bir veri yok
- **Kahraman kart** — liste tek tip
- **Krom:** araç çubuğu, filtre satırı, sekme grubu, segment kontrol
- **Ölü kontrol, sahte onay.** Bir düğme varsa çalışıyordur. Sıfır bir
  ölçümdür, boş bir gapdir; ikisi aynı şey değildir.

---

## 7 · Değişmeyecek teknik kısıtlar

**React Native ile yazılıyor, SwiftUI ile değil.** Hedef iOS 26'nın yerli
hissi; çizim katmanı RN.

- **`react-native-reanimated` ve `react-native-gesture-handler` kurulu değil
  ve kurulmayacak.** RN'in kendi `Animated`'i, `Animated.spring`,
  `Animated.stagger` ve `PanResponder` var.
- Hareket **yalnız `opacity`, `translateX/Y`, `scale`** — hepsi native
  sürücüde. Yükseklik, genişlik, renk ve gölge animasyonlanamaz; renk
  değişimi iki katmanın çapraz sönmesidir.
- **`LayoutAnimation` yasak.**
- **`reduceMotion` açıkken hareket durur, BİLGİ DURMAZ.**
- **Kaydırma tek yol olamaz** — her jestin dokunmalı karşılığı olmalı.
- Kurallar **veriden türer, moddan değil.** Tek meşru kırılma **sıfır**.

Sözleşme dışına çıkan bir öneri yaparsan bedelini etiketle:
**A** bugün yazılabilir · **B** kütüphane ister · **C** mümkün değil.

---

## 8 · Cevaplamanı istediğim sorular

1. Eldiven boyalıyken **oran ve sonuç** nasıl giriliyor? Klavye değilse ne?
2. Formül yazmak zorunlu mu, atlanabilir mi — ve arası nasıl kurulur?
3. Salonun tamamı görünürken **kendi müşterilerim** nasıl ayrışır?
4. Formül **geçmişi** nasıl okunur; iki formül arasındaki fark nasıl görünür?
5. Not ve risk işareti müşterinin gözü önünde **nasıl "var" der ama
   okunmaz**?
6. Aynı müşteri kartına üç ayrı yerden giriliyor — hepsi aynı kart mı?
7. Boya olmayan işte formül alanı ne oluyor?
8. Bütün bunlar **375 × 667**'lik küçük telefonda ne oluyor?

---

## 9 · Çıktı

**Koyu ve açık temada**, her ölçü ve süre yazılı:

1. **Yazma:** işlem bitti, formül alanı — malzemeler dolu, oran boş
2. **Yazma:** formül dolduruldu, gönderilmeye hazır
3. **Yazma:** boya olmayan iş (kesim) — formül alanı ne oluyor
4. **Liste:** dolu hâl — kendi müşterileri ve salonun geri kalanı
5. **Liste:** arama açık, üç sonuç
6. **Liste:** üç boş hâl
7. **Kart:** geçmişi olan müşteri — formüller, not, paket, risk
8. **Kart:** ilk kez gelen müşteri
9. **Kart:** not ve risk işaretinin **açılmış** hâli
10. **Formül geçmişi:** iki formülün karşılaştırması
11. `reduceMotion` hâli
12. **375 × 667** sıkışması

Her karar için **bir cümlelik gerekçe.**

---

## 10 · Kutuya yazılacak cümle

> Personelin müşteri defteri — iki yüz, tek tur. Kuaförün altı ay sonra
> soracağı tek soru var: "geçen sefer bu saça ne yapmıştım?" Sektör bunu
> hâlâ basılı formül defteriyle çözüyor. Formülün **kumandada nasıl
> yazıldığı** ve **Müşteriler sekmesinde nasıl okunduğu** birlikte
> tasarlanacak; ikisi aynı verinin iki yüzü. Eller boyalı ve eldivenli —
> yazma tarafı bir form olamaz. Ekran müşterinin gözü önünde — okuma tarafı
> her şeyi açıkça yazamaz. Kumandanın üç evresi dokunulmaz; yeni ekranlar
> onun içine oturur.

**Effort: High.**

---

## 11 · Ekler

1. `Luera Mobil - Personel 06 Islem Kumandasi.html` — dokunulmaz kumanda
2. `Luera Mobil - Personel 02/03` — kart dili ve hâl hareketi
3. `Luera Mobil - Durumlar.html`
4. Cihazdan alınmış kumanda ekranı görüntüleri (üç evre)
5. Bugünkü boş `Müşteriler` sekmesinin ekran görüntüsü
