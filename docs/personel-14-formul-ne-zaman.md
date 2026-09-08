# Personel 14 · Formül ne zaman yazılıyor

**Effort: High.**

> **Bu tur Personel 13'ten SONRA çalışıyor.** 13, adisyon şeridini ve kalem
> satırlarını yeniden çiziyor; bu turun aradığı kapı da orada duracak. 13'ün
> çıktısı bu turun ekidir ve yerleşimi o belirler.
>
> Bu tur formülün **gövdesini** yeniden çizmiyor. Dört alan, sabit sıra,
> karşılaştırma satırı, `± 0,5` adımı, borç sayacı ve kaydet kuralı Personel
> 12'de kararlaştırıldı ve **uygulandı**. Buradaki konu tek şey: formül
> **ne zaman** ve **kaç oturumda** yazılıyor.

---

## 1 · Formülün üç anı

Bir renk işi tek bir olay değil. Formülün dört alanı **üç ayrı anda** biliniyor:

| An | Ne oluyor | Hangi alan biliniyor |
|---|---|---|
| **1 · Karıştırma** | boya ve oksidan karıştırılıyor, saça sürülüyor | **malzeme** · **oran** |
| **2 · Bekleme** | sayaç koşuyor, 25–45 dk | **bekleme** (ölçülüyor) |
| **3 · Yıkama sonrası** | renk ortaya çıkıyor | **sonuç** |

Karıştırma işlemin **ilk beş dakikası.** Sonuç ise fönden hemen önce. Aralarında
bir buçuk saat var.

**Ve asıl karar 1. anda veriliyor.** Kolorist geçen seferin kaydına bakıp
"açık kalmıştı, bu sefer oranı artırayım" diyor. Personel 12'nin bütün
karşılaştırma fikri o an için tasarlandı.

---

## 2 · Bugün ne oluyor

**Formülün kapısı yalnız işlem BİTTİKTEN sonra açılıyor.**

Kapı, adisyondaki malzeme grubunun başlığı; o grup yalnız `closing` ve
`closed` evrelerinde çiziliyor. İşlem sürerken (`running`) ekranda kalem
eklenebiliyor ama **formül açılamıyor.**

Sonuçları:

- **Bilgi en taze anda yazılamıyor.** Oran ilk beş dakikada belli; Bitir'e
  basıldığında personel hatırlamaya çalışıyor.
- **Beklemenin ölçümü sürerken yapılıyor**, yazımı sonra. "Bekleme kur"
  düğmesi `running` içinde çalışıyor ve `waitMinutes` o sayaçtan geliyor —
  yani formülün bir yarısı işlem sırasında ölçülüyor, öteki yarısı o sırada
  yazılamıyor.
- **Karşılaştırma karardan SONRA geliyor.** Ekrana düştüğünde boya çoktan
  sürülmüş; artık hiçbir şeyi değiştiremiyor. Personel 12 değerini teslim
  edemiyor.

> Alt sayfanın kendisi çalışıyor — eksik olan yalnız **kapı.** Yani sorun
> teknik değil, akışın kendisi hiç tasarlanmamış.

---

## 3 · Turun asıl çıktısı: iki oturumun dili

Kapı açılınca ortaya bugün var olmayan bir şey çıkıyor: formül **iki kez**
kaydediliyor.

```
1. oturum · karıştırırken   → malzeme + oran (+ belki bekleme)
2. oturum · yıkadıktan sonra → sonuç
```

Ve mevcut dil bunu **yanlış anlatıyor.**

Personel 12'nin kaydet kuralı üç etiket taşıyor ve eksik hâlde şunu diyor:

```
Eksik hâliyle kaydet
Kasaya gitmeden düzeltilebilir; sonrası okunur.
```

Bu cümle **bilerek eksik bırakılan** bir kayıt için doğru — kuaför o ziyarette
formül yazmamaya karar vermiş. Ama karıştırma anında **hiçbir şey eksik
değil**: sonuç henüz *olmamış*. Renk daha ortaya çıkmadı.

"Eksik hâliyle kaydet" demek, personele yapmadığı bir hatayı üstlenmesini
söylemek.

> **Turun birinci sorusu:** bu üçüncü hâlin dili ne? Ne "eksik", ne "şimdilik"
> — ikincisi Personel 12'de tam da tutulamayan bir söz olduğu için
> yasaklandı. Ama burada gelecek gerçek ve yakın: aynı ziyaret, bir buçuk
> saat sonra.
>
> Aynı soru borç sayacı için de geçerli. `üç alan kaldı` → `bir alan kaldı`
> sayımı doğru, ama karıştırma anında "bir alan kaldı" bir **borç** değil,
> bir **bekleyiş**. Sayaç bu ayrımı taşımalı mı?

---

## 4 · İkinci soru: kapı nerede duruyor

İşlem sürerken ekran zaten dolu: plaka, büyük kadran, geçen süre, bekleme
kartı, adisyon şeridi. **İkinci bir kapı kalabalık demek** ve kumandanın tek
kuralı az düğme.

Adaylar ve bedelleri:

- **Adisyon şeridinin kendisi** — malzeme zaten orada; ama şerit 13'te
  yeniden çiziliyor ve yükü artıyor
- **Bekleme kartı** — sayaç formülün bir alanını zaten ölçüyor; ama bekleme
  kurulmadıysa kart yok
- **Kadranın altı** — en görünür yer; ama orası sürerken boş durmanın kendisi
  bir karar
- **Kapı yok, formül kendisi çağırıyor** — malzeme eklendiği an

Son madde ayrıca ele alınmalı, çünkü **veri zaten sinyali veriyor:**
adisyona `kind: 'material'` bir kalem eklenmesi, karıştırma anının kendisidir.
Uydurulacak bir eşik yok.

> **Ama dikkat:** ekran müşterinin gözü önünde ve bu ürün dırdır etmiyor.
> Kendiliğinden açılan bir sayfa, müşteriye "bir şey ters gitti" der ve
> personelin elini böler. Sinyal gerçek — ondan ne yapılacağı ayrı bir karar.

---

## 5 · Verilen kararlar — bunları tartışma

1. **Formülün gövdesi değişmiyor.** Dört alan, sabit sıra, karşılaştırma
   satırı, `± 0,5`, ton kelimeleri, borç sayacı — Personel 12'de karara
   bağlandı ve kodda.
2. **Alt sayfa, tam sayfa değil.** Sürerken de kilitli evrede de arkadaki
   plaka ve süre görünmeye devam ediyor.
3. **Kilit VERİDEN geliyor.** Adisyon kasaya gidince formül okunur olur.
4. **Engelleme yok.** Formül yazmamak bazı ziyaretlerde meşru; hiçbir akış
   formül yüzünden durmuyor.
5. **Dırdır yok.** Tekrar eden hatırlatma, kırmızı rozet, sayaç azarlaması —
   yok. Ekran müşterinin gözü önünde.
6. **Dokunma hedefi 44 pt taban; ızgara kutuları 68 pt.**

---

## 6 · Tasarlanacaklar

### A · Üçüncü hâlin dili  ← turun asıl çıktısı

§3. Karıştırma anında kaydedilen formülün düğme etiketi ve alt satırı ne
diyor? Borç sayacı bu evrede ne söylüyor?

Ve kapanış tarafı: yıkandıktan sonra formül **ikinci kez** açıldığında ekran
neyi hatırlatıyor — "sonuç kaldı" mı, hiçbir şey mi?

### B · Kapının yeri

§4. Sürerken formüle nereden giriliyor? Kalabalıklaşmadan nasıl duruyor?
Malzeme eklendiği anın sinyali kullanılıyor mu — kullanılıyorsa dırdır
etmeden nasıl?

**Kısıt:** yerleşimi Personel 13'ün çıktısı belirliyor. Şeridi ve satır
bölgesini onun çizdiği gibi al.

### C · Beklemenin kendiliğinden dolması

Karıştırma anında formül kaydedildiğinde bekleme **henüz ölçülmemiş** olabilir
(sayaç ya kurulmadı ya koşuyor). Sonra sayaç 35 dakikayı ölçüyor.

Kayıt kendiliğinden güncellenmeli mi? Güncellenirse personel bunu **nereden**
öğreniyor — bir kaydın kendi kendine değişmesi, söylenmezse güven kırar.

Güncellenmezse formül `bekleme: —` ile kalıyor ve ölçüm boşa gidiyor.

> Bugün sayaç **cihazda yaşıyor**, sunucuya yazılmıyor. Yani "kendiliğinden
> dolma" bir arayüz kararı; veri tarafında engel yok.

### D · Gönderme uyarısının cümlesi

Personel 12 gönderme güvertesine amber bir satır koydu:

```
Formül eksik. Oran ve sonuç yazılmadı; kasaya gidince bu boşluk kalıcı olur.
```

İki oturum gelince bu cümle **yanlış olabiliyor**: oran karıştırırken yazıldıysa
eksik olan yalnız sonuç, ama cümle ikisini birden sayıyor.

Cümle hangi alanların eksik olduğunu **söylemeli mi**, yoksa tek bir cümle mi
kalmalı? (Metin `idle` ve `window`da aynı olmak zorunda — fitil koşarken
kelimeleri değiştirmek okumayı bozar.)

### E · Karşılaştırma artık doğru anda — bir şey değişiyor mu?

Geçmiş satırı ve etiketlerdeki fark, Personel 12'de tasarlandı ama işlem
bittikten sonra görünüyordu. Artık karıştırma anında görünecek.

Doğru anda geldiğinde bir şeyin değişmesi gerekiyor mu — mesela geçen seferin
**sonucu** (`açık kaldı`) karıştırma anında daha mı öne çıkmalı? O tek kelime,
bu turda verilecek kararın gerekçesi.

**Uyarı:** gövdeyi yeniden tasarlamak bu turun işi değil. Değişiklik
öneriyorsan tek satırla ve gerekçesiyle.

### F · Sürerken açılmış formülün hâlleri

Sonuç alanı bu evrede ne gösteriyor? Kilitli değil (yazılabilir), ama henüz
yazılamaz (renk ortada yok). Üçüncü bir hâl mi, yoksa boş bir ızgara mı?

**Dikkat:** kısık bir ızgara ölü kontroldür. Ama sonucu karıştırma anında
seçilebilir bırakmak da yanlış cevabı davet eder.

### G · İşlem bitmeden gönderilirse

Personel işlemi bitirip adisyonu hemen gönderirse, sonuç hiç yazılmamış olur
ve formül kalıcı olarak eksik kalır. Bugünkü uyarı bunu söylüyor. İki oturumlu
akışta bu uyarı ne zaman ve nasıl görünüyor?

### H · Boş ve olmayan hâller

Boya işi yoksa (kesim) formül alanı hiç yok — bu kural duruyor. Peki malzeme
işlemin **ortasında** ekleniyorsa? Kesim olarak başlayan iş boyaya dönüyorsa
kapı o an mı beliriyor?

### I · Hareket

Kapının belirmesi, formülün iki oturum arasında hâl değiştirmesi, beklemenin
kendiliğinden dolması. **Yükseklik animasyonlanmıyor.**

---

## 7 · Kapalı veri listesi

```
formula = {
  materials  : [{ id, name, qty }]     ← adisyondan, okunur
  ratio      : metin                    ← karıştırırken
  waitMinutes: sayı                     ← sayaçtan ya da elle
  waitSource : 'timer' | 'manual'
  result     : metin                    ← yıkandıktan sonra
  tags       : [metin]                  ← isteğe bağlı ikinci eksen
  note       : metin
  staffId · writtenAt
}
```

Ziyaretten gelenler: `arrived_at` (işlem başlangıcı) · `service_ended_at` ·
`adisyon_items` · `is_paid` / `status` (kilit).

Sayaç: cihazda yaşıyor, `endsAt` ve `total` taşıyor, sunucuya yazılmıyor.

**Olmayan:** `writtenAt` dışında bir "ilk yazım" damgası, oturum sayısı,
fotoğraf, renk paleti. Bir alana ihtiyaç duyarsan **söyle ve etiketle** —
`formula` bir jsonb olduğu için eklemek ucuz, ama sessizce varsayma.

---

## 8 · Değişmeyecek kısıtlar

- **Yalnız `opacity` · `translateX/Y` · `scale`.** Yükseklik, genişlik, renk,
  yarıçap, gölge animasyonlanmıyor. *(`reanimated` kurulu ama yazılmış
  ekranlar taşınmıyor; kumanda yazılmış bir ekran.)*
- **`react-native-gesture-handler` YOK.** Jestler `PanResponder` ile.
  `LayoutAnimation` yasak.
- **Dokunma hedefi 44 pt'nin altına inmez**; ızgara kutuları 68 pt.
- **Turuncu `#FF5A1F` yalnız ZAMAN ve EYLEM.** Durum rengi değil.
  Risk `#E07272`/`#C94040` · amber `#D9A43B`/`#B87A00` ·
  yeşil `#5FBF64`/`#2D8F32`.
- **Para maskeli.**
- **`reduceMotion` açıkken hareket durur, BİLGİ DURMAZ.**
- **Kurallar VERİDEN türer, moddan değil.** Tek meşru kırılma **sıfır**.
- **Ölü kontrol yok, sahte onay yok.**
- **On saniyelik kayıt hedefi duruyor.** İki oturum, toplam dokunuşu
  artırmamalı — bugünkü zorunlu sayı **dört**.

Sözleşme dışına çıkan bir hareket önerirsen bedelini etiketle:
**A** bugün yazılabilir · **B** kütüphane ister · **C** mümkün değil.

---

## 9 · Cevaplamanı istediğim sorular

1. **Karıştırma anında kaydedilen formülün dili ne?** "Eksik" değil,
   "şimdilik" değil — ne?
2. Sürerken formülün kapısı **nerede** duruyor ve ekranı kalabalıklaştırmıyor?
3. Malzeme eklendiği anın sinyali kullanılıyor mu — dırdır etmeden nasıl?
4. Bekleme kendiliğinden dolmalı mı, dolarsa personel bunu nereden öğreniyor?
5. Gönderme uyarısı hangi alanların eksik olduğunu söylemeli mi?
6. Sürerken sonuç alanı ne gösteriyor — kısık değil, boş değil, ne?
7. Karşılaştırma doğru ana geldiğinde gövdede bir şey değişmeli mi?
8. **Toplam dokunuş sayısı artıyor mu?** Bugün dört.
9. Bütün bunlar **375 × 667**'de ne oluyor?

---

## 10 · Çıktı

**Koyu ve açık temada**, her ölçü ve süre yazılı:

1. **Ana kare** — işlem sürüyor, kadran ve sayaç yerinde, formülün kapısı
   görünür
2. Karıştırma anı — formül alt sayfası açık, oran seçiliyor, sonuç henüz yok
3. Aynı an, **kaydet düğmesi ve alt satırı** (üçüncü hâlin dili)
4. Borç sayacının bu evredeki hâli
5. Bekleme **kendiliğinden dolduğu** an
6. Yıkandıktan sonra formülün **ikinci kez** açılışı — ne hatırlatılıyor
7. Sonuç yazılıp formül tamamlandığında
8. Gönderme güvertesi — **yalnız sonuç eksikken** uyarı cümlesi
9. Kesim işine sonradan malzeme eklendiğinde kapının belirmesi
10. `reduceMotion`
11. **375 × 667** sıkışması

Her karar için **bir cümlelik gerekçe**.

---

## 11 · Ekler ve kutuya yazılacaklar

**Ekler:**
1. **Personel 13'ün çıktısı** — şeridin ve satırların son hâli, yerleşimin
   temeli
2. `Luera Mobil - Personel 12 Ziyaretin Formulu.html` — gövde, kaydet kuralı,
   borç sayacı, karşılaştırma
3. `Luera Mobil - Personel 06 Islem Kumandasi.html` — sürerken ekranın kendisi
4. `Luera Mobil - Personel 11 Kasaya Gonderme.html` — gönderme güvertesi
5. `docs/design-reference/Luera Mobil - Hareket Sözleşmesi.html`
6. `docs/design-reference/Luera Mobil - Durumlar.html`

**Kutuya yazılacak cümle:**

> Formülün **ne zaman** yazıldığını ele alıyoruz. Bugün kapı yalnız işlem
> bittikten sonra açılıyor; oysa oran ve malzeme boyanın karıştırıldığı ilk
> beş dakikada belli oluyor ve "geçen sefer açık kaldı, bu sefer oranı
> artırayım" kararı tam o anda veriliyor — yani Personel 12'nin karşılaştırma
> fikri bugün karardan sonra ekrana düşüyor ve hiçbir şeyi değiştiremiyor.
> Kapı açılınca formül doğal olarak **iki oturumda** yazılıyor: başta malzeme
> ve oran, yıkandıktan sonra sonuç. Mevcut dil bunu yanlış anlatıyor —
> "Eksik hâliyle kaydet" demek, karıştırma anında personele yapmadığı bir
> hatayı üstletmek; orada eksik bir şey yok, sonuç henüz **olmamış**. Turun
> asıl çıktısı bu üçüncü hâlin dili ve kapının yeri. Ekran müşterinin gözü
> önünde, personelin elleri boyalı ve bu ürün dırdır etmiyor: hiçbir akış
> formül yüzünden durmuyor.

**Effort: High.**

---

## 12 · Doğrulama

Bu bir **tasarım** turu; kod doğrulaması yok. Tasarım döndüğünde ölçeceklerim:

- Karıştırma anındaki kaydın dilinin ne "eksik" ne "şimdilik" olduğu
- Kapının Personel 13'ün çizdiği yerleşime **oturduğu**
- Hiçbir yerde dırdır, kırmızı rozet ya da engelleme olmadığı
- Sürerken sonuç alanının **kısık bir ızgara olmadığı**
- Zorunlu dokunuş sayısının **dörtte kaldığı**
- Önerilen her hareketin sözleşme içinde olduğu
- Turuncunun yalnız zaman ve eylemde kullanıldığı
- `reduceMotion` hâlinde bilginin durmadığı
- Onbir karenin onbirinin de çizilmiş olduğu
