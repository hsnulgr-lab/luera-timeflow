# Personel 08 · Müşteri defteri — rötuş

**Personel 07 onaylandı.** Bu tur yeniden tasarım değil: **beş düzeltme.**
Geri kalan her şey olduğu gibi kalıyor.

**Effort: High.**

---

## 0 · Dokunulmayacaklar

07'nin şu kararları **doğru** ve tartışılmayacak. Yeniden çizme, yeniden
gerekçelendirme:

- Formülün **dört alanı ve sabit sırası**: malzeme · oran · bekleme · sonuç
- **Dört dokunuş**: iki alan dolu gelir, oran ızgarası (82 × 68), sonuç üç
  kelime (112 × 68), klavye yalnız isteğe bağlı notta
- **Zorunlu değil**, engelleme yok; eksiklik kartta `formül yazılmadı`
- **Kural veriden**: `kind:'material'` kalem yoksa formül **yok**
- **Liste**: iki etiketli koşu, kalıcı arama, son gelişe göre azalan sıra
- **Üç boş hâl**, **fark ekranı** (tek sütun, `eski → yeni`), **açık tema**,
  **375 × 667**, **reduceMotion**
- **Para maskesinin nota uzaması** — 6 sn, fitil, kendi kapanması
- Sesli notun, kaydırmalı ölçeğin, fotoğrafın, rozetlerin reddi

---

## 1 · Formül şeridi yer değiştiriyor

**Bugünkü hâli:** 353 × 64 pt kart, kalem listesinin altında, gönder
düğmesinin üstünde.

**Sorun:** C evresinde ekranda zaten bir tutar, bir liste ve turuncu bir
gönder düğmesi var. İkinci bir amber kart gönder düğmesiyle yarışıyor ve
dikkati bölüyor.

**Yeni yeri: kalem listesinin içinde, malzeme grubunun BAŞLIĞI.**

Formül ayrı bir şey değil — listede zaten duran iki satırın tarifi. Oran,
bekleme ve sonuç üçü de tam olarak o kalemler hakkında. Girişi de onların
üstünde olsun:

    Kaş alma                     180
    Saç bakım yağı               640

    MALZEME · FORMÜL BEKLİYOR      →      ← amber
    Boya · 7.3 kumral      STOKTAN DÜŞER
    Oksidan %6             STOKTAN DÜŞER

Yazıldıktan sonra aynı satır sonucun kendisini söylüyor:

    MALZEME · 1:1,5 · 35 dk · tuttu   ✓   ← yeşil

**Kazanılan:** yeni bölge açılmıyor · ilişki kendini anlatıyor · malzeme
grubu yoksa başlık da yok, tek bir koşul yazılmıyor.

**Kaybedilen ve çözülmesi gereken:** liste **kaydırılıyor**. Altı kalemlik
bir adisyonda malzeme grubu ekranın altında kalabilir ve personel amber
satırı hiç görmez. Eski yerin tek üstünlüğü buydu.

> **Sana sorum:** bu başlık listeye **yapışsın mı** (kaydırınca üstte
> kalsın), yoksa görünürlüğü başka türlü mü çözersin? Yapışkan başlık
> kalem listesinin okunmasını bozuyorsa gerekçesiyle reddet ve kendi
> çözümünü öner.

---

## 2 · Alerji plakaya çıkıyor

**Bugünkü hâli:** risk yalnız müşteri kartında, maskeli:
`RİSK · 1 kural` → dokun → 6 sn.

**İki sorun var.**

**Birincisi zamanlama.** Kart, personelin bakmayı seçtiği yer. Alerji ise
**bakılmasa da görünmesi gereken** şey. Boyayı sürdükten sonra öğrenilen
alerji, öğrenilmemiş sayılır.

**İkincisi maskenin mantığı.** Maske, müşteri okumasın diye var. Ama
**müşteri kendi alerjisini zaten biliyor.** Gizlenmesi gereken şey salonun
müşteri hakkındaki notu; alerjisi değil.

**Yeni yeri: kimlik plakası, adın yanında.** Plaka üç evrede de aynı
bileşen, yani işaret **A, B ve C'de** görünüyor.

    ● SÜRÜYOR                    [☎] [✎] [👤]
    Ayşe Yılmaz  ⚠
    Saç boyama + fön
    10:00 başlangıç · 120 dk plan

**Düğme değil, işaret.** Düğme sırası (`ara · not · müşteri kartı`) eylem
sırası; alerji bir eylem değil, bir durum.

**Maskenin kapsamı da değişiyor — kartta da:**

| | Bugün | Yeni |
|---|---|---|
| Risk etiketi | `RİSK · 1 kural` | `RİSK · ALERJİ` — **tür maskesiz** |
| Risk içeriği | maskeli | maskeli (değişmedi) |
| Not | maskeli | maskeli (değişmedi) |

Tehlikenin **türü** 80 cm'den okunuyor, **detayı** kasıtlı bir dokunuşla.

> **Sana sorum:** plakadaki işaret ne kadar yüksek sesle konuşmalı? Alerji
> dışında risk türleri de var (kurallar işletmeden geliyor). İşaret türü
> gösteriyorsa **birden fazla risk** varsa ne oluyor?

---

## 3 · Formülü kim yazdı

Kart artık **salonun tamamına** açık. `fcard` yalnız tarih ve hizmet
gösteriyor; **yazan kişi yok.**

Selin izinliyken müşterisi geliyor, Merve karta bakıyor: *"bu rengi kim
yapmış?"* Devir teslimin ilk sorusu bu ve cevabı ekranda yok.

**Formül kartına yazan personelin adı eklenecek.** Fark ekranında da: iki
formülü farklı kişiler yazmış olabilir ve bu, farkın okunmasını değiştirir.

> **Sana sorum:** ad nereye ve hangi ağırlıkta? Tarihin yanına mı, alt
> satıra mı? Kendi yazdığın formülle meslektaşınınki ayrışmalı mı?

---

## 4 · Formül düzeltilebilir olacak

Bugün formül **dört dokunuşta, aceleyle** yazılıyor ve sonra hiçbir yerde
düzeltme yolu yok. Yanlış sonuca basıldıysa altı ay sonra okunacak kayıt
yanlış.

Tasarımın kendi sınırı hazır: **adisyon kasaya gidene kadar** formül de
düzeltilebilsin.

**Giriş noktası: müşteri kartının GEÇMİŞ satırı.** O ziyaretin formül
sayfasını açıyor. Aynı yol iki işi birden görüyor:

- C evresinde yanlış yazıldıysa → **düzeltme**
- C evresinde hiç yazılmadıysa → **sonradan yazma**

İkincisi 1. maddedeki kaydırma riskini de karşılıyor: amber satır
kaçırılırsa dünyanın sonu değil, kayıt yolu kartta açık kalıyor.

> **Sana sorum:** kasaya gitmiş bir formül kartta nasıl görünüyor —
> düzeltilemez olduğu biçimden anlaşılıyor mu, yoksa bir cümle mi gerekiyor?

---

## 5 · Bekleme alanı boş kalabilir

Bekleme sayacı **isteğe bağlı** — kuaför kurmadan da boya yapabiliyor.
Kurulmadıysa:

- alt sayfa "2 alan dolu geldi" diyemez, **1 alan** dolu gelir
- dört alanlı ızgarada bir **delik** kalır
- fark ekranındaki `bekleme 30 dk → 35 dk` satırının karşılığı yok

> **Sana sorum:** bekleme kurulmamışsa o alan ne oluyor — elle girilebilir
> mi, boş mu duruyor, yoksa hiç çizilmiyor mu? Fark ekranında iki
> formülden birinde bekleme varsa ne görünüyor?

---

## 6 · Değişmeyen kısıtlar

- **React Native.** `reanimated` ve `gesture-handler` kurulu değil.
- Hareket yalnız `opacity`, `translateX/Y`, `scale` — native sürücüde.
  Renk değişimi iki katmanın çapraz sönmesi. `LayoutAnimation` yasak.
- **Dokunma hedefi 44 pt taban.** Oran ve sonuç ızgaraları küçülmez.
- **Turuncu `#FF5A1F` yalnız zaman ve eylem.** Risk `#E07272`/`#C94040`,
  amber `#D9A43B`/`#B87A00`, yeşil `#5FBF64`/`#2D8F32`.
- **`reduceMotion` açıkken hareket durur, BİLGİ DURMAZ.**
- **Kaydırma tek yol olamaz.**
- Ölü kontrol yok, sahte onay yok.

Sözleşme dışına çıkan öneriyi etiketle: **A** bugün yazılabilir ·
**B** kütüphane ister · **C** mümkün değil.

---

## 7 · Çıktı

Yalnız **değişenler**. 07'nin doğru kalan ekranlarını yeniden çizme.

1. C evresi — malzeme grubu başlığı **bekliyor** hâli
2. C evresi — başlık **yazıldı** hâli
3. C evresi — **uzun liste**, başlık görünürlüğü çözümü
4. C evresi — malzeme yok (kesim): grup da başlık da yok
5. Plaka — alerji işareti, **üç evrede** (A · B · C)
6. Plaka — işaret açılmış hâli
7. Plaka — **birden fazla risk**
8. Kart — risk satırı `RİSK · ALERJİ` yeni hâliyle
9. Formül kartı — **yazan kişi** eklenmiş
10. Kart geçmiş satırı — formül **düzeltme** yolu
11. Formül sayfası — **kasaya gitmiş**, düzeltilemez hâl
12. Formül sayfası — **bekleme boş** hâl
13. Fark ekranı — bir formülde bekleme yok
14. Açık tema: 1, 5, 8
15. 375 × 667: 3 ve 5

Her karar için **bir cümlelik gerekçe.**

---

## 8 · Kutuya yazılacak cümle

> Personel 07 onaylandı; bu tur beş düzeltme. **Formül şeridi** gönder
> düğmesinin üstünden kalkıp kalem listesinin içine, **malzeme grubunun
> başlığına** iniyor — formül o kalemlerin tarifi, ayrı bir şey değil;
> çözülecek tek şey kaydırınca görünürlüğü. **Alerji** karttan çıkıp
> **kimlik plakasına** taşınıyor ve türü maskesiz söylüyor: müşteri kendi
> alerjisini zaten biliyor, gizlenmesi gereken salonun notu. **Formülü kimin
> yazdığı** görünecek — kart artık tüm salona açık. **Formül kasaya gidene
> kadar düzeltilebilecek**, girişi kartın geçmiş satırından. Bir de
> **bekleme sayacı isteğe bağlı**: kurulmadığında dört alanlı ızgarada ne
> oluyor. Geri kalan her şey dokunulmaz.

**Effort: High.**

---

## 9 · Ekler

1. `Luera Mobil - Personel 07 Musteri Defteri.html` — düzeltilen tur
2. `Luera Mobil - Personel 06 Islem Kumandasi.html` — dokunulmaz kumanda

Cihaz görüntüsü **eklenmiyor**: telefondaki Expo Go SDK 57'ye güncellendi,
proje SDK 54 — cihazda çalıştırılamıyor. C evresinin karşılığı zaten 07'nin
kendi çizimlerinde var.
