# Personel 12 · Ziyaretin formülü

**Effort: High.**

---

## 0 · Göndermeden önce verilecek TEK karar

Bu tur **hareket sözleşmesinin içinde mi, dışında mı?**

`react-native-reanimated` 5 Eylül'de projeye girdi (Personel 11 için) ama
**yazılı ekranlar taşınmadı** — formül yüzeyleri de yazılı ekran. Brief şu an
**sözleşmenin İÇİNDE** yazıldı: yalnız `opacity · translateX/Y · scale`.

Serbest bırakmak isterseniz §6'daki kutuyu silip yerine "Personel 11 gibi
serbest" yazın. **Önerim: içinde kalsın.** Bu turun sorunu hareket değil,
YERLEŞİM ve DİL — reanimated'i açmak, çözülmesi gereken soruyu süslü bir
geçişle örtme riski taşıyor.

---

## 1 · Bu ekran neyin yerine geçiyor

Kuaförün altı ay sonra soracağı tek soru var: **"geçen sefer bu saça ne
yapmıştım?"** Sektör bunu hâlâ **basılı formül defteriyle** çözüyor. Kâğıt
defterin kazandığı iki şey var ve ikisi de tasarımın girdisi:

- **Bir bakışta karşılaştırma.** Defter açılınca aynı müşterinin önceki
  formülü hemen üstte duruyor. Kuaför "geçen sefer açık kaldı, bu sefer
  bekletmeyi uzatayım" diye düşünüyor. Karar **geçmişe bakarak** veriliyor.
- **On saniyede yazılıyor.** Uzun süren kayıt tutulmaz.

Bugünkü ekran ikincisini çözmüş, **birincisini hiç çözmemiş.** Turun asıl işi
bu.

---

## 2 · Turun asıl çıktısı: KARŞILAŞTIRMA yok

Bugün formül yazarken personel **geçmişi görmüyor.** Ekranda yalnız bu
ziyaret var: malzeme, üç oran kutusu, üç bekleme kutusu, üç sonuç kelimesi.

Oysa:

- Veri **hazır**. `090_visit_formula.sql` müşterinin formül geçmişi için özel
  bir indeks açıyor:
  `(organization_id, customer_id, date DESC) WHERE formula IS NOT NULL`.
  Yani "bu müşterinin önceki formülleri" sorgusu tasarlanmış ve ucuz.
- Müşteri kartı (Personel 07/08) **son formülü zaten gösteriyor** —
  ama orada, yazarken burada.
- `RESULTS` üç kelime seçilirken gerekçe şuydu: *"üç kelime bir sonraki
  formülün ne yönde değişeceğini doğrudan söylüyor."* **Bir sonraki formül
  yazılırken o kelime ekranda yok.** Kararın kendi amacı boşa çıkıyor.

> **Bu turun birinci sorusu:** geçmiş formül bu yüzeyde nerede yaşıyor?
> Üstte sabit bir satır mı, alanların yanında sönük bir "geçen sefer" değeri
> mi, kaydırılabilir bir geçmiş şeridi mi, yoksa hiç mi? Ve **fark** nasıl
> okunur — "geçen sefer 35 dk" mı, "+5 dk" mı?
>
> Reddetmek de bir cevap: karşılaştırma ekranı ağırlaştırıyorsa gerekçesiyle
> reddet ve on saniyelik kaydı koru. Ama gerekçesini yaz.

**Kısıt:** ilk ziyarette geçmiş **yok**. Sıfır bir ölçümdür, boş bir gaptir —
"geçmiş yok" ile "geçmişte formül yazılmamış" aynı şey değil ve ikisi de
boş bir alan olamaz.

---

## 3 · İkinci sorun: TEK formül, İKİ yüzey

Aynı formül bugün **iki ayrı ekranda** çiziliyor ve **altı yerde ayrışmışlar.**

| | `formul.tsx` — tam sayfa | `FormulaSheet` — alt sayfa |
|---|---|---|
| Nereden açılıyor | Müşteri kartı → geçmiş satırı | Kumanda → malzeme grubu başlığı |
| Başlık | Tarih · hizmet · süre · **imza** | "Formül" + tek not |
| Mod | **4 mod**, parametreden | `locked` + `written`, veriden |
| Malzeme | sabit demo dizisi | adisyondan gerçek |
| Kaydet etiketi | **3 farklı** | 2 farklı |
| Kilit satırı | `LockLine` **var** | yok |

İki yüzey iki farklı söz veriyor: aynı formül, müşteri kartından açılınca
imzalı ve tarihli bir **kayıt**; kumandadan açılınca isimsiz bir **form**.

> **İkinci soru:** bu iki yüzey **tek** mi olmalı? Tek yüzey iki bağlamda
> (sayfa ve alt sayfa) aynı gövdeyi mi kullanmalı, yoksa "yazma" ile "okuma"
> gerçekten iki ayrı ekran mı?
>
> Not: kumandada alt sayfa olmasının bir sebebi var — personel işlemin
> ortasında, arkasındaki sayaç ve adisyon **görünmeye devam etmeli.** Tam
> sayfa o bağlamı örter. Bu bir kısıt, bir tercih değil.

---

## 4 · Üçüncü sorun: "Şimdilik böyle kaydet" tutulamayan bir söz

Ekranın alt düğmesi iki etiket taşıyor:

```
oran + sonuç doluysa   →  "Formülü kaydet"
eksikse                →  "Şimdilik böyle kaydet"
```

**"Şimdilik" bir gelecek vaat ediyor.** Ama adisyon kasaya gönderildiği an
formül **kilitleniyor** (`is_paid` ya da `status='completed'`) ve o boşluk
**kalıcı** oluyor — kayıtta `formül yazılmadı` diye duruyor, bir daha
açılmıyor.

Ekran bunu **hiçbir yerde söylemiyor.** Personel "şimdilik" diyip kaydediyor,
beş dakika sonra adisyonu gönderiyor ve kapının kapandığını ancak sonradan
öğreniyor.

> **Üçüncü soru:** eksik formülü kaydetmenin dili ne olmalı? Uyarı mı, farklı
> bir etiket mi, gönderme anında bir hatırlatma mı? Dikkat: **korkutmak
> çözüm değil** — bazı ziyaretlerde formül gerçekten yazılmaz ve boşluk
> meşrudur. Aranan şey, kapının kapanacağını **zamanında** söylemek.
>
> İlgili: kilitli-boş hâlin cümlesi bugün iki dosyada birbirinden **hafifçe
> farklı** yazılmış. Tek bir cümle kararlaştır.

---

## 5 · Verilen kararlar — bunları tartışma

Bunlar önceki turlarda verildi, kodda uygulandı ve testleri var.

1. **Dört alan, SABİT SIRA: malzeme · oran · bekleme · sonuç.** Sıra her
   yerde aynı — yazarken, kartta, geçmişte. Sabit hiza karşılaştırmayı
   mümkün kılan şey.
2. **Malzeme personelin girdiği bir alan DEĞİL**, adisyondan türüyor
   (`kind === 'material'`). Tek kaynak; istemcinin ayrı bir listesi olsaydı
   adisyonla formül ayrışırdı.
3. **Sonuç bir ÖLÇEK değil, kelime.** "%62 tuttu" diye bir ölçüm yok;
   kaydırmalı ölçek sahte hassasiyet üretirdi.
4. **Kilit VERİDEN geliyor**, saklanan bir bayraktan değil.
5. **Kilitliyken kısık düğme yok, hiç düğme yok.** Yapılamayan görünmüyor,
   sebebi görünüyor.
6. **Klavye yalnız serbest notta açılıyor.** Eller boyalı ve eldivenli;
   klavye bu kullanıcı için düşmanca.
7. **Adisyonda malzeme yoksa formül alanı hiç çizilmiyor** (`none`).
   Kesimde formül alanı görmek personele "bir şey eksik bıraktım" dedirtir.
8. **`missed` ≠ `pending`.** Amber "hâlâ yapılabilir" der; kilit düştüyse o
   kapı kapandı ve başlık bunu bir davet değil, bir OLGU olarak söyler.

---

## 6 · Değişmeyecek kısıtlar

**Uygulama React Native ile yazılıyor, SwiftUI ile değil.** Hedef iOS 26'nın
yerli hissi ama çizim katmanı RN.

- **Yalnız `opacity`, `translateX/Y`, `scale`.** Yükseklik, genişlik, renk,
  yarıçap ve gölge animasyonlanamaz. Renk değişimi = iki katmanın çapraz
  sönmesi. *(Bkz. §0 — bu kutu kaldırılabilir.)*
- **`LayoutAnimation` yasak.**
- **`react-native-gesture-handler` kurulu DEĞİL ve kurulmayacak.**
  `PanResponder` var — alt sayfanın çekme jesti onunla yazılı.
- **Dokunma hedefi 44 pt'nin altına inmez.** Formül kutuları bugün **68 pt**
  (44'ün 1,5 katı) ve bu **eldiven payı** — küçültülmüyor.
- **Turuncu `#FF5A1F` yalnız ZAMAN ve EYLEM.** Durum rengi değil.
  Risk `#E07272`/`#C94040` · amber `#D9A43B`/`#B87A00` ·
  yeşil `#5FBF64`/`#2D8F32`.
- **`reduceMotion` açıkken hareket durur, BİLGİ DURMAZ.**
- **Kurallar VERİDEN türer, moddan değil.** Tek meşru kırılma **sıfır**.
- **Ölü kontrol yok, sahte onay yok.** Sıfır bir ölçümdür, boş bir gaptir.

---

## 7 · Tasarlanacaklar

### A · Geçmiş formülün yeri
§2. Yazarken önceki formül nerede? Fark nasıl okunur? İlk ziyaret ne diyor?

### B · İki yüzeyin ilişkisi
§3. Tek gövde iki bağlam mı, iki ayrı ekran mı? Alt sayfanın arkası
görünür kalmalı.

### C · Eksik kaydetmenin dili
§4. Kapı kapanmadan önce ne söyleniyor, nerede söyleniyor?

### D · Oran ve bekleme: üç değer yetiyor mu?

Bugün `RATIOS = 1:1 · 1:1,5 · 1:2` ve `WAITS = 25 · 30 · 35`.
Dördüncü kutu bir `± adım` düğmesiydi, **hiçbir şey yapmıyordu ve
kaldırıldı** — yalnız titriyordu, dokunan personel değeri girdiğini
sanıyordu.

Bugün liste dışı bir değer (`1:2,5`, `40 dk`) **serbest nota** yazılıyor.
**Veri tarafı engel değil:** `formula.ratio` jsonb içinde serbest metin.
Kısıt yalnız arayüzde.

> **Soru:** liste dışı değer nasıl girilir — klavyesiz, eldivenli elle?
> Adım düğmesi mi, uzun basış mı, ikinci bir sıra mı, yoksa üç değer
> gerçekten yeterli mi? Yeterli diyorsan **serbest notun bu yükü taşıdığını
> ekranın söylemesi** gerekir.

### E · Beklemenin üç hâli

`sayaçtan ölçüldü` · `elle girildi` · `sayaç kurulmadı` — ve kayıt hangisi
olduğunu saklıyor (`waitSource: 'timer' | 'manual'`).

Sayaçtan geldiğinde alan **salt okunur** oluyor. Ama boya son 10 dakikada
erken yıkanmış olabilir — bugün düzeltilemiyor.

> **Soru:** ölçülen değer düzeltilebilmeli mi? Düzeltilirse kayıt hâlâ
> "ölçüldü" mü der, yoksa "ölçüldü, düzeltildi" mi?

### F · Sonucun kelimeleri
`Tuttu · Açık kaldı · Koyu çıktı`. Üç kelime yetiyor mu — "turuncumsu",
"eşit çıkmadı" gibi sık durumlar var. Ölçek yasak; genişletmenin başka bir
yolu var mı, yoksa üç doğru mu?

### G · Malzeme okunur, ama yanlışsa?

Malzeme adisyondan geliyor. Personel adisyona eklemeyi unuttuğu bir ürünü
kullandıysa formül eksik doğuyor ve **bu ekrandan düzeltilemiyor.**
Bugün alan yalnız "adisyondan" diyor.

> **Soru:** eksikliğin nerede düzeltileceğini ekran söylemeli mi? Söylerse
> bu bir bağlantı mı, yoksa bir cümle mi? (Kumandada adisyon iki parmak
> yukarıda; müşteri kartından açılınca adisyon **kilitli.**)

### H · Sayaç satırı ne sayıyor?

Başlıkta bugün `2 alan dolu geldi` yazıyor — **sabit yazılmış**, gerçek
duruma bakmıyor. Ekran görüntüsünde bekleme "sayaç kurulmadı" olduğu hâlde
yine "2 alan" diyor.

> **Soru:** bu satır ne söylemeli? Kaç alan dolu, kaç dokunuş kaldı, yoksa
> hiçbir şey mi? (Sayaç doğru olacaksa gerçekten sayılmalı.)

### I · Klavye ve alt sayfa — teknik, ama tasarım sorunu

Alt sayfada **klavye kaçınması yok.** Serbest not en altta, kaydet düğmesi
onun da altında: 375 × 667'lik telefonda klavye açılınca ikisi de klavyenin
**altında kalıyor.**

> **Soru:** klavye açılınca yerleşim ne yapar? Alt sayfa yükselir mi, not
> alanı yukarı mı taşınır, yoksa serbest not ayrı bir adıma mı çıkar?

### J · Boş ve kilitli hâller

`new` (formül yok, adisyon açık) · `edit` (var, açık) · `locked` (kasada,
yazılmış) · `lockedEmpty` (kasada, yazılmamış) · geçmiş yok · malzeme yok.

Altısı ayrı cümle; hiçbiri boş bir ekran ve hiçbiri dört tane `—` değil.

---

## 8 · Kapalı veri listesi

Tasarımın kullanabileceği alanların **tamamı** bu. Fazlası yok.

```
formula = {
  materials : [{ id, name, qty }]      ← adisyondan, okunur
  ratio     : metin | null             ← serbest metin (UI kısıtlı)
  waitMinutes: sayı | null
  waitSource: 'timer' | 'manual'
  result    : metin | null
  note      : metin | null             ← serbest not
  staffId   : kim yazdı
  writtenAt : ne zaman yazıldı
}
```

Ziyaretten gelenler: `date · service · minutes · customer_name` ·
`is_paid` / `status` (kilit buradan) · `adisyon_items`.

Geçmişten gelebilecek: aynı müşterinin önceki `formula` kayıtları,
tarihe göre azalan. **İndeksi var.**

**Olmayan:** fotoğraf, renk paleti, ürün stok seviyesi, fiyat. Bunlara
dayanan bir öneri yapma.

---

## 9 · Cevaplamanı istediğim sorular

1. **Geçmiş formül yazarken nerede yaşıyor** — ve fark nasıl okunuyor?
2. İki yüzey **tek** mi olmalı? Alt sayfanın arkası görünür kalmalı.
3. Eksik kaydetmenin dili ne? Kapı kapanmadan **ne zaman** söyleniyor?
4. Liste dışı oran/bekleme **klavyesiz** nasıl girilir — yoksa girilmemeli mi?
5. Ölçülen bekleme düzeltilebilmeli mi, kayıt bunu nasıl söyler?
6. `2 alan dolu geldi` satırı ne söylemeli?
7. Klavye açılınca alt sayfa ne yapar?
8. Bütün bunlar **375 × 667**'de ne oluyor? Dört alan + geçmiş + düğme sığıyor mu?
9. On saniyelik kayıt hedefi korunuyor mu — eklediğin her şey kaç dokunuş?

Sözleşme dışına çıkan bir hareket önerirsen bedelini etiketle:
**A** bugün yazılabilir · **B** kütüphane ister · **C** mümkün değil.

---

## 10 · Çıktı

**Koyu ve açık temada**, her ölçü ve süre yazılı:

1. **Ana kare** — kumandada alt sayfa, adisyon açık, formül yazılıyor,
   geçmiş görünür
2. Aynı an, **ilk ziyaret** (geçmiş yok)
3. **Tam sayfa** hâli — müşteri kartından açılmış, imzalı
4. `locked` — kasada, formül yazılmış, okunur
5. `lockedEmpty` — kasada, yazılmamış; boşluğun cümlesi
6. **Eksik kaydetme anı** — kapının kapanacağı nasıl söyleniyor
7. Beklemenin üç hâli tek tek
8. Liste dışı değer girme çözümün (varsa)
9. **Klavye açık** hâli
10. `reduceMotion` hâli
11. **375 × 667** sıkışması

Her karar için **bir cümlelik gerekçe**.

---

## 11 · Ekler ve kutuya yazılacaklar

**Ekler:**
1. `Luera Mobil - Personel 08 Musteri Defteri.html` — **değiştirilen tasarım**
   (formül yüzeyi buradan çıktı)
2. `Luera Mobil - Personel 07 Musteri Defteri.html` — müşteri kartı, son
   formül kartı orada
3. `Luera Mobil - Personel 06 Islem Kumandasi.html` — alt sayfanın bağlamı
4. `docs/design-reference/Luera Mobil - Hareket Sözleşmesi.html`
5. `docs/design-reference/Luera Mobil - Durumlar.html`
6. `docs/personel-08-defter-rotusu.md` — formül alanının gerekçeleri
7. Cihazdan alınmış bugünkü alt sayfa görüntüsü *(elinizde var)*

**Kutuya yazılacak cümle:**

> Ziyaretin formül ekranını değiştiriyoruz (Personel 08'in formül yüzeyi).
> Dört alan ve sabit sıra kalıyor; değişen üç şey var. **Bir:** kuaför
> formülü yazarken geçmişi göremiyor — oysa kararın tamamı "geçen sefer ne
> olmuştu"ya dayanıyor ve verisi hazır. **İki:** aynı formül iki ayrı
> yüzeyde çiziliyor ve altı yerde ayrışmışlar. **Üç:** "Şimdilik böyle
> kaydet" düğmesi bir gelecek vaat ediyor, ama adisyon kasaya gidince o
> boşluk kalıcı oluyor ve ekran bunu söylemiyor. Ekran müşterinin gözü
> önünde kullanılıyor, personelin elleri boyalı ve kayıt on saniyeyi
> geçmemeli — üçü de tasarımın girdisi.

**Effort: High.**

---

## Doğrulama

Bu bir **tasarım** turu; kod doğrulaması yok. Tasarım döndüğünde ölçeceklerim:

- Dört alanın sırasının hiçbir karede bozulmadığı
- Dokunma hedeflerinin **68 pt**'den küçülmediği
- Turuncunun yalnız zaman ve eylemde kullanıldığı
- Kilitli hâlde **hiçbir** dokunulur şeyin çizilmediği
- Önerilen her hareketin sözleşme içinde olduğu (§0'da aksi kararlaştırılmadıysa)
- `reduceMotion` hâlinde bilginin durmadığı
- Kayıt süresinin hâlâ on saniyenin altında olduğu — eklenen her şeyin
  dokunuş bedeli yazılı
- Onbir karenin onbirinin de çizilmiş olduğu
