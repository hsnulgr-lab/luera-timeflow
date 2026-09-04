# Personel 09 · Müşteriler

**Serbest tur.** Bu ekran mevcut tasarım dilinden bağımsız kurulabilir —
tek şart palet. Ölçü, ritim, yerleşim, tipografi sana ait.

**Effort: High.**

---

## 0 · Bu tur 07'nin liste ekranını DEĞİŞTİRİYOR

Personel 07'de bir müşteri listesi çizilmişti (iki etiketli koşu, 72 pt
satır). **O ekran iptal.** Yerine bu tur geçiyor.

07'nin **kart içeriği** duruyor: risk ve notun maskeli olması, formüller,
paket, geçmiş, para maskesinin 6 saniyesi ve fitili. Değişen, bu bilginin
**nasıl düzenlendiği ve nasıl açıldığı**.

---

## 1 · Ekranın işi

Kuaför bu ekrana **bir kişiyi bulmak için** gelir. Bulduğu anda tek bir şey
sorar:

> **"Bu müşteride ne yapmıştım?"**

Geliş anları üç tane, üçü de kısa:
- Müşteri kapıdan girerken, adını hatırlıyor ama işini hatırlamıyor
- Akşam ertesi güne bakarken
- Meslektaşı izinliyken onun müşterisi geldiğinde

Üçünde de **saniyeler** var, dakikalar değil.

---

## 2 · Kullanıcının verdiği iki karar

1. **Dokununca sayfa açılıyor.** Satır yerinde genişlemiyor; tam müşteri
   sayfasına gidiliyor.
2. **Kafa karıştırmayacak.** "Hafif detaylı" — bilgi var ama **ayrışmış**.
   Her şeyin aynı anda bağırdığı bir ekran istenmiyor.

---

## 3 · Tipografi çıpası

Kullanıcı bir referans paylaştı; **isim muamelesi** oradan alınacak:

    Elif Demir                    ← ince ad + kalın soyad, ~34 pt
    CUMA 28 AĞUSTOS   BUGÜN       ← 12 pt, harf aralığı geniş, "BUGÜN" turuncu
    10:30 – 11:15 · 45 dk         ← saat kalın, bitiş sönük
    [Keratin bakımı] [SD Selin Demir]   ← haplar, biri avatarlı

Alınacak olan **bu dört katmanın ritmi**: büyük ad, sönük büyük harfli meta
satırı, sayısal satır, altında haplar. Birebir kopya değil — **ağırlık
dağılımı** ve **ad tipografisi**.

> Bu referans bir *randevu* başlığı. Müşteri sayfasında karşılığı ne olur,
> kararı sana ait.

---

## 4 · Kapalı veri listesi

**Bu listede olmayan hiçbir alanı icat etme.**

### Liste satırı — `customers` ucu (yazılacak)

`id` · `name` · `lastVisitDate` · `lastService` · `hasFormula` · `mine`

**Telefon listede DÖNMÜYOR.** Ekran müşterinin gözü önünde; başkasının
numarası orada durmaz.

### Müşteri sayfası — `customer` ucu (var) + formüller (eklenecek)

| Alan | İçerik |
|---|---|
| `customer` | `name`, `phone`, `notes`, `custom_fields` |
| `history` | son 10 randevu: `date`, `service`, `status` |
| `packages` | `name`, `total_sessions`, `used_sessions` |
| `riskRules` | işletmenin kural listesi |
| `formulas` | ziyaret başına: malzeme · oran · bekleme · sonuç · not · **yazan kişi** |

**Para yok.** Bakiye, borç, tahsilat, geçmiş fiyat — sunucu döndürmüyor ve
döndürmeyecek. Bu bir **hizmet defteri**, muhasebe değil.

### Kapsam

Personel **salonun tüm müşterilerini** görüyor. Kendi baktıkları
ayrışabilmeli ama bu bir filtre ya da sekme olmamalı.

---

## 5 · Tasarlanacaklar

### 5.1 · Liste

- Satırda **en az**: ad · son geliş · son hizmet
- **Arama** — 200 müşteride liste tek başına yetmiyor. Ad ve telefonun son
  dört hanesi. Nerede yaşıyor, kaydırınca ne oluyor?
- **Sıralama** — kararı sen ver ve gerekçelendir. Kullanıcının çalıştıracağı
  bir sıralama kontrolü **olmamalı**.
- **Kendi müşterilerim** nasıl ayrışıyor? Bölüm mü, işaret mi, sıra mı?
- **Formül kaydı olan müşteri** ayrışmalı — veri yalnız `hasFormula`
  (evet/hayır), içerik değil.
- **Boş hâller:** hiç müşteri yok · arama sonuç vermedi · henüz kimseye
  bakılmadı. Üçü ayrı cümle.

### 5.2 · Müşteri sayfası

Taşıdığı bilgi: **risk · not · formüller · paket · geçmiş · ara/yaz**.

Turun asıl sorusu burada: **bu altı şey nasıl ayrışır?**

Hepsi aynı anda görünürse ekran gürültü olur. Hiçbiri görünmezse sayfa boş
durur. "Hafif detaylı" tam olarak bu ikisinin arası ve tarifi sana ait.

Kısıtlar:

- **Ekran müşterinin gözü önünde.** Risk ve notun *içeriği* açıkça
  yazılamaz — 07'de bunun çözümü para maskesinin uzatılmasıydı (etiket ve
  sayı okunur, içerik üç nokta, dokununca 6 saniye, fitil). **Bu mekanizma
  korunuyor.** Yerleşimi serbest.
- **Alerji istisna:** türü maskesiz görünür (`RİSK · ALERJİ`), detayı
  maskeli. Müşteri kendi alerjisini zaten biliyor.
- **Formül kartında yazan kişinin adı** durur — kart tüm salona açık.
- **"İlk kez geliyor" bir uyarı değil, iyi haber.** Uyarı ağırlığında
  durmaz.

### 5.3 · Hareket

Liste → sayfa geçişi, aramanın açılması, maskenin açılıp kapanması,
`reduceMotion` hâli.

---

## 6 · Serbest olan / olmayan

**Serbest:** yerleşim, ölçü, ritim, tipografi, satır anatomisi, sayfanın
bölümlenmesi, geçiş biçimi, arama yeri, boşluk kullanımı.

**Serbest değil:**

1. **Palet.** Turuncu `#FF5A1F` **yalnız zaman ve eylem** — durum rengi
   değil. Risk `#E07272`/`#C94040`, amber `#D9A43B`/`#B87A00`,
   yeşil `#5FBF64`/`#2D8F32`. Koyu zemin `#120E08`, açık `#F3ECE0`.
2. **Sekme çubuğu.** Beş sekme, etiketli, sistemin kendi çubuğu. Ekran onun
   üstünde yaşıyor; yeni sekme yok.
3. **Kapalı veri listesi** (§4).
4. **Maske mekanizması** — yeni bir gizleme dili icat edilmeyecek.

---

## 7 · Teknik kısıtlar

**React Native.** `reanimated` ve `gesture-handler` **kurulu değil ve
kurulmayacak.**

- Hareket yalnız **`opacity`, `translateX/Y`, `scale`** — native sürücüde.
- **Yükseklik, genişlik, renk, yarıçap ve gölge animasyonlanamaz.** Renk
  değişimi = iki katmanın çapraz sönmesi. Bir şeyin "yerinde açılması"
  yükseklik animasyonu **değildir**; başka bir yolla çözülmeli.
- **`LayoutAnimation` yasak.**
- **Dokunma hedefi 44 pt taban** — eller ıslak ve eldivenli.
- **`reduceMotion` açıkken hareket durur, BİLGİ DURMAZ.**
- **Kaydırma tek yol olamaz** — her jestin dokunmalı karşılığı olmalı.
- Kurallar **veriden türer**, moddan değil. Tek meşru kırılma **sıfır**.
- **Ölü kontrol yok, sahte onay yok.**

Sözleşme dışına çıkan öneriyi etiketle: **A** bugün yazılabilir ·
**B** kütüphane ister · **C** mümkün değil.

---

## 8 · YASAK — daha önce uydurulmuş olanlar

- Sayılı uyarı rozeti (`!2` gibi)
- "İlk ziyaret" uyarı etiketi
- Bakiye, borç, geçmiş fiyat
- Öncesi/sonrası fotoğrafı — **KVKK açık rızası tanımlı değil**
- Yıldız, puan, memnuniyet — böyle bir veri yok
- Filtre satırı, segment kontrol, sıralama menüsü, araç çubuğu
- Kahraman kart
- "Müşteri ekle" düğmesi — böyle bir uç yok, kayıt randevudan doğuyor

---

## 9 · Cevaplamanı istediğim sorular

1. Satırda **ne kadar bilgi** var? Ad ve son hizmet yetiyor mu, yoksa
   listenin kendisi soruyu cevaplamalı mı?
2. Salonun tamamı görünürken **kendi müşterilerim** nasıl ayrışır — ve bu
   ayrım aramada da yaşar mı?
3. Müşteri sayfasındaki **altı bilgi nasıl ayrışır**? Sıra neye göre?
4. **Sıralama** neye göre ve neden kontrolsüz?
5. Geçmiş **son 10 randevu**la sınırlı. Kullanıcı daha fazlasını isterse ne
   oluyor — yoksa istemiyor mu?
6. Bütün bunlar **375 × 667**'de ne oluyor?

---

## 10 · Çıktı

**Koyu ve açık temada**, her ölçü yazılı:

1. Liste — dolu hâl
2. Liste — arama açık, sonuçlar
3. Liste — üç boş hâl
4. Müşteri sayfası — geçmişi olan müşteri
5. Müşteri sayfası — maske açılmış hâl (risk ve not)
6. Müşteri sayfası — ilk kez gelen müşteri
7. Müşteri sayfası — formülü olmayan müşteri
8. Liste → sayfa geçişinin anahtar kareleri
9. `reduceMotion` hâli
10. 375 × 667 sıkışması

Her karar için **bir cümlelik gerekçe.**

---

## 11 · Kutuya yazılacak cümle

> Personel modunun müşteri listesi ve müşteri sayfası. **Serbest tur:**
> mevcut tasarım dilinden bağımsız kurulabilir, tek şart palet — turuncu
> yalnız zaman ve eylem. İsim tipografisi için bir referans ekli; alınacak
> olan büyük ad, sönük büyük harfli meta satırı, sayısal satır ve haplardan
> oluşan **ağırlık dağılımı**. Kuaför bu ekrana bir kişiyi bulmak için gelir
> ve bulduğu anda tek şey sorar: "bu müşteride ne yapmıştım?" Dokununca
> **sayfa açılıyor** — satır yerinde genişlemiyor. Sayfanın taşıdığı altı
> bilgi (risk · not · formüller · paket · geçmiş · ara) **ayrışmış** olmalı:
> hepsi aynı anda bağırırsa gürültü, hiçbiri görünmezse boş. Ekran
> müşterinin gözü önünde kullanılıyor; risk ve notun içeriği maskeli, ama
> alerji **türünü** maskesiz söyler. Para hiçbir yerde yok: bu bir hizmet
> defteri.

**Effort: High.**

---

## 12 · Ekler

1. Kullanıcının paylaştığı **tipografi referansı** (isim + meta + haplar)
2. `Luera Mobil - Personel 07 Musteri Defteri.html` — kart içeriği ve maske
3. `Luera Mobil - Personel 06 Islem Kumandasi.html` — palet ve maske kaynağı
