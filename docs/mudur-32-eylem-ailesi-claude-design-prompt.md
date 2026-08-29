# Müdür 32 · Durum kartlarının eylem ailesi — Claude Design promptu

> **İkinci tur.** Birinci turun çıktısı bir yerde reddedildi; §2 tamamen
> yeniden yazıldı. Müdür 31'in yerine geçer (31'deki "Bekleyene sor"
> varsayımı da yanlıştı, §4C'de düzeltildi).

**Ekler:**
- İki akış ekranı görüntüsü — **ölçüler bunlar, ideal kabul edildi**
- `docs/design-reference/Luera Mobil - Mudur 17 Siradaki Randevu.html`
- `docs/design-reference/Luera Mobil - Mudur 20 Bekleme Kartlari.html`
- `docs/design-reference/Luera Mobil - Mudur 21 Tahsilat ve Gelmedi Kartlari.html`
- `docs/design-reference/Luera Mobil - Mudur Modu.html`

**Effort: High.**

---

## 0 · Bir cümlede iş

Luera TimeFlow'un müdür akış ekranında dokuz olay türü var. **Kartların ölçüsü
ve dili doğru ve değişmeyecek.** Eksik olan ölçü değil: **kartların yarısı bir
durumu bildiriyor ama o durumda yapılacak şeyi sunmuyor.** Senden istediğim,
her duruma **doğru eylemi**, doğru ağırlıkta, **kart büyümeden** yerleştirmen —
ve o eylemlerin akışını, geçişlerini, hareketini tasarlaman.

Bu, görünüm tazeleme işi değil. **Eylem ailesi** tasarımı.

---

## 1 · Envanter — ne var, ne yok

Ölçülmüş bugünkü hâl. Kalın satırlar eksik olanlar.

| # | Durum | Bugünkü eylemler | Durum |
|---|---|---|---|
| 1 | `next` · zamanında | Geldi · Gelmedi | tam |
| 2 | **`next` · gecikmiş** | Geldi · Gelmedi | **müşteriye ulaşma yolu yok** |
| 3 | `arrived` · bekliyor | Personele söyle · Beklemeye al · Karşılamayı aç · Geri al | tam |
| 4 | `started` · sürüyor | yok | süre aşımı görünmüyor |
| 5 | `finished` · bitti | yok | (bilinçli ertelendi, §5) |
| 6 | `due` · adisyon bekliyor | Tahsil et | tam |
| 7 | `paid` · tahsil edildi | yok | tam (karar yok) |
| 8 | **`booked` · yeni online randevu** | yok | **onay bekleyen randevu görünmüyor** |
| 9 | **`cancelled` · iptal** | yok | **boşalan saat kimseye sorulmuyor** |
| 10 | **`noshow` · gelmedi** | Geri al · Geç geldi · Yeniden randevu | **üçü de kaydı düzeltir, hiçbiri müşteriye dokunmaz** |

**Neden bu dört eksik pahalı:** salonun tek gerçek kaybı **boş koltuk**. Dördü
de tam olarak o kaybın oluştuğu anlar.

---

## 2 · Kartın kapasitesi — ölçülmüş, ve bir yol REDDEDİLDİ

### 2.1 Reddedilen çözüm — kartın altına şerit

Birinci turda **kartın altına** ayrı bir eylem şeridi koymuştuk (tolerans
rozeti + `Ara`/`Yaz`). **Reddedildi.** Sebep ölçü değil, okuma: kart bitiyor,
altında ayrı bir şerit başlıyor ve ikisi tek bir şey gibi okunmuyor. Eylem
kartın **içinde** olacak.

**Kartın altına hiçbir şey koyma.**

### 2.2 Kartın gerçek kapasitesi

A1 panelinin yüksekliğini **sağ sütun** belirliyor:

```
sol sütun:  etiket 14 + 1 + rakam 40 + 1 + alt satır 14      =  70 pt
sağ sütun:  Geldi 44 + gap 2 + Gelmedi 44                    =  90 pt
kart:       14 (pad) + max(70, 90) + 14 (pad)                = 118 pt
```

Yani **sol sütunda 20 pt kullanılmayan yer var.** Kart bir satır daha
taşıyabilir ve **büyümez.**

Ayrıca satırın solunda her zaman bir **saat sütunu** duruyor (11:30). Bu
yüzden alt satırdaki "11:30'da bekleniyordu" cümlesi **gereksiz** — saat zaten
iki yerde yazılı. O satır boşa çıkıyor ve tolerans geri sayımı ("12 dk sonra
düşer") oraya girebiliyor. Böylece kartın altındaki rozet de ortadan kalkıyor.

### 2.3 Kabul edilen çözüm — sağ sütun hep İKİ yuva, ikincisi balon açar

Sağ sütun **hiçbir zaman ikiden fazla yuva taşımaz.** İkinci yuva, üçten fazla
ikincil eylem olan kartlarda bir **balon** (popover) açar.

```
┌────────────────────────────────────┐
│ ● GECİKTİ                          │  14
│ 8 dk                     [ Geldi ] │  40   ← tek dolu turuncu
│ 12 dk sonra düşer                  │  14
│ Arandı · 2 dk            (  Ulaş ) │  14   ← boştaki 20 pt'ye giriyor
└────────────────────────────────────┘
   sol 85 ≤ sağ 90   →   kart 118 pt, DEĞİŞMEDİ
```

`Ulaş`a basılınca küçük bir balon açılıyor:

```
              ┌──────────────────────┐
              │  Ara                 │
              │  WhatsApp'tan yaz    │
              └──────────▽───────────┘
                       ( Ulaş )
```

**Neden balon, neden sıralı tek eylem değil:** "önce Ara, cevap yoksa Yaz"
diye sıraya koymak denendi ve elendi — **doğru kanalı uygulama seçemez.** Bazı
müşteri telefonu hiç açmaz, WhatsApp'a bakar; bazısı tersi. Müdür bunu biliyor,
uygulama bilmiyor. Karar bilen kişide kalıyor.

**Balonun kuralları:**

- **Tetikleyici hedefi söyler, aracı değil.** `•••` ya da `Diğer` hiçbir şey
  öğretmez. Kelime `Ulaş` — kanal ileride büyüse de kelime sabit kalır.
- **Yalnız üç ya da daha fazla ikincil eylemi olan kartlarda.** Dokuz kartın
  **ikisi**: geciken randevu (A) ve gelmedi (B). Kalan yedisinde tek ya da iki
  eylem var; oralarda **düz düğme**, balon değil.
- **Balonda uydurma seçenek yok.** Her satır §3'teki gerçek bir araca
  dayanacak. Örneğin "Personele haber ver" **konmayacak**: o eylem `arrived`
  kartında, müşteri **içerideyken** var; geciken müşteride personele söylenecek
  şeyin ("boş kaldın, walk-in al") akışı **yok**.
- **Balon yeni bir bileşen** — bu uygulamada hiç yok. Konumlanma, dışarı
  dokununca kapanma, ok ucu, ekran kenarına yakınken davranış: hepsini sen
  tanımla. Bir kez tasarlanıp iki kartta kullanılacak; **tek bir parça** olarak
  çiz.
- Balon açılırken hareket yalnız `opacity` + `scale` (yükseklik/renk değil).

### 2.4 `Gelmedi` gecikince neden çizilmiyor

Sağ sütunun ikinci yuvası gecikince `Gelmedi`den `Ulaş`a **takas ediliyor** —
eklenmiyor. Gerekçe: 8. dakikada `Gelmedi`ye basmak, henüz gelebilecek bir
müşteriyi atmak demek; ve **30. dakikada randevu zaten kendiliğinden düşüyor.**
Yani gecikme penceresinde `Gelmedi`, otomatik olanın kısayolundan ibaret.
Müdür hiçbir şey kaybetmiyor. Bu, ürünün kendi kuralıyla da aynı: bekleme
kartında "her seviyede TEK eylem".

**Bu düzeni çiz, ölçülendir ve sına.** Daha iyisini bulursan gerekçesiyle öner
— ama **118 pt, 44 pt dokunma tabanı ve "kartın altına hiçbir şey" sabittir.**

---

## 3 · Elimizde gerçekten olan araçlar

Sahte eylem üretilmesin diye; hepsi bugün çalışıyor.

- **`tel:` ve `wa.me` derin bağlantısı** — `Linking.openURL`. Müdürün kendi
  telefonu/WhatsApp'ı, hazır metinle. Masaüstü tam bu durumda bunu kullanıyor.
- **Randevu oluşturma ön dolgusu** — `date` · `start` · `staff` · `customerId`
  parametreleriyle randevu sekmesi ön dolu açılıyor. Sunucu işi sıfır.
- **Online randevu onayı** — otomatik onay kapalıysa randevu `pending` doğuyor
  ve **müdürün onayını bekliyor**.
- **Bekleme listesi** — iptal olduğunda eşleşen bekleyenlere **otomatik**
  WhatsApp gidiyor.
- Personel push'u · yeniden randevu · hatırlatma onayı.

**Olmayan:** ödeme bağlantısı, otomatik arama, SMS, "bu işlemin açık adisyonu
var mı" bilgisi, "personele boş kaldın haberi". Bunlara dayanan eylem önerme.

---

## 4 · Tasarlanacak kartlar

Hepsi **mevcut iskeletle**: krem panel, sol kahraman rakam, sağ eylem.
Kartın altına hiçbir şey konmaz.

### A · `next` · geciken müşteri — birincil iş

`Gelmedi`, müşteriyi **kaybettikten sonra** basılan düğmedir. Kaybetmeden önce
basılacak düğme yok. Müdürün elindeki tek araç telefonu.

Düzen §2.3'te. Çizilecek hâller:

1. **Gecikti, henüz bir şey yapılmadı** — `Geldi` + `Ulaş`, sol sütun üç satır.
2. **Balon açık** — iki seçenek, ok ucu `Ulaş`a bakıyor.
3. **Arandı** — sol sütunda dördüncü satır: `Arandı · 2 dk`. `Ulaş` yerinde
   duruyor (ikinci kanal hâlâ mümkün).
4. **Kayıt bayatladı** — "Arandı · 2 dk" ne kadar sonra düşer? Damga bu üründe
   **bayatlıyor**; tazeliğini yitirince satır kayboluyor.

Cevapla:
- Kayıt satırı **kaçıncı dakikada** düşüyor?
- Balon kapanırken hareket ne? Seçilen satır ile kartın kaydı arasında görsel
  bir bağ var mı?

### B · `noshow` · gelmemiş müşteri

Bugünkü üç eylem de **kaydı düzeltiyor**; hiçbiri müşteriye dokunmuyor.
Balonun ikinci kullanıcısı bu kart.

Öneri: **sıra 30. dakikada değişsin.** 30 dk dolmadan müşteri hâlâ girebilir →
birincil `Geç geldi`. Dolduktan sonra randevu düştü, kurtarılacak tek şey
**ilişki** → birincil `Yaz`, ikinciler balonda (`Yeniden randevu`, `Ara`,
`Geri al`).

Cevapla: bu iki hâlli sıra doğru mu, yoksa birincil baştan `Yaz` mı olmalı?
İkisi farklı iş — biri takvimi, öteki ilişkiyi kurtarır.

### C · `cancelled` · boşalan saat — ⚠ Müdür 31 burada yanlıştı

31'de "`Bekleyene sor` düğmesi koyalım" yazmıştım. **Yanlış:** iptal zaten
bekleyenlere **otomatik** mesaj gönderiyor. Düğme koymak ikinci kez mesaj
atardı.

Doğrusu iki parça:
- **Rapor satırı** — "3 bekleyene soruldu" / "Bekleyen yok". Eylem değil,
  müdürün bilmesi gereken şey.
- **Tek eylem: `Saati doldur`** — randevu sekmesini o gün/saat/personelle ön
  dolu açar. Sıfır sunucu işi. **Tek eylem olduğu için balon yok, düz düğme.**

Cevapla: rapor satırı kartın neresinde? Bekleyen yoksa satır hiç çizilmiyor mu,
yoksa "Bekleyen yok" demek bilgi mi?

### D · `booked` · yeni online randevu

Otomatik onay **kapalıysa** randevu `pending` doğuyor ve müdürün onayını
bekliyor — mobilde bunu görecek/onaylayacak yer **yok**. Otomatik onay açıksa
karar zaten verilmiş → **düğme hiç çizilmez**.

Öneri: `Onayla` (dolu) · `Reddet` (hayalet), **yalnız `pending` iken**. İki
eylem → balon yok.

Cevapla: `Reddet` onay diyaloğu ister mi? (Müşteriye mesaj gidiyor, geri
alınamaz.)

### E · `started` · süre aşımı

İşlem 45 dakikalıktı, 70 dakika oldu.

**Benim görüşüm: eylem yok.** Müdür süren bir işlemi kısaltamaz; aşımın tek
gerçek sonucu **sıradaki müşteride** ve o müşterinin kendi kartı zaten
`GECİKTİ` diyor — eylem de orada (A). Buraya düğme koymak tiyatro olur.

Ama aşım **görünmeli mi**? Görünecekse nasıl — alt satırda kelime mi, rakamın
rengi mi (renk tek başına anlam taşımaz), yoksa hiç mi? **Eylem gerekmediğine
katılıyorsan onu da gerekçelendir.**

---

## 5 · Bilinçli olarak kapsam dışı

- **`finished` → adisyon açılmadıysa** gerçek bir para kaçağı. Ama "bu işlemin
  açık adisyonu var mı" bilgisi bugün istemcide **yok**; uydurulamaz. Ertelendi.
- **`due` · `paid` · `arrived`** — bu üç kart **tam**. Dokunma.

---

## 6 · Aileyi tutan kurallar

- **Dolu turuncu hap = birincil eylem, kartta en fazla bir tane.**
  Bugün: `Geldi`, `Tahsil et`, `Personele söyle`.
- **Kenarlıklı hap = ikincil. Hayalet metin = üçüncül.**
- **Sağ sütun en fazla iki yuva.** Üçüncü eylem varsa ikinci yuva balon açar.
- **Kartın altına hiçbir şey konmaz.**
- **Damga = tüketilmiş düğmenin yerinde duran, basılamayan kayıt.** Kart
  yüksekliği değişmez. Damga **bayatlar** — tazeliğini yitirince düşer.
- **Renk envanteri:** turuncu `#FF5A1F` yalnız **ZAMAN ve EYLEM** — asla durum.
  Kırmızı `#E07272`/`#C94040` risk. Amber `#D9A43B`/`#B87A00` uyarı. Yeşil
  `#5FBF64`/`#2D8F32` olumlu. **Renk tek başına anlam taşımaz; kelime her zaman
  yazılı.**
- **Kahraman rakam solda, eylem sağda.** Rakam "ne olduğu" değil **"ne kadar
  olduğu"**.
- **Krem panel sayfanın ters düzlemidir** — koyu temada krem, aydınlık temada
  koyu.
- **Ölü kontrol yok.** Gidilecek yer, veri ya da numara yoksa **düğme hiç
  çizilmez** — pasif gri bırakılmaz. Numarası olmayan müşteride `Ulaş` yok.
- **Sahte onay yok.** Derin bağlantıda uygulama dışarı çıkar; gönderildiğini
  göremeyiz. En fazla **müdürün ne yaptığı** yazılabilir ("Arandı · 2 dk"),
  teslimat değil.
- **Dokunma hedefi 44 pt'nin altına inmez.** Görünen daha küçük olabilir;
  aradaki fark `hitSlop` ile kapanır (mevcut deyim: 22 → 44).
- **Sıfır bir ölçümdür, bilinmeyen bir boşluktur.** İkisi aynı görünmez.

---

## 7 · Hareket

Hareket **bu ürünün zayıf tarafı** ve burada güçlenmesini istiyorum — ama
sözleşme dar:

- Yalnız `opacity`, `translateX/Y`, `scale`; hepsi native sürücüde.
- **Yükseklik, genişlik, renk, yarıçap, gölge animasyonlanamaz.** Renk değişimi
  = üst üste iki yüzeyin çapraz sönmesi.
- `LayoutAnimation` yasak. `reanimated` ve `gesture-handler` **kurulu değil ve
  kurulmayacak** — RN'in kendi `Animated`'i ve `PanResponder` var.
- `reduceMotion` açıkken hareket durur, **bilgi durmaz.**

Sözleşmenin dışına çıkan bir hareket öneriyorsan **çık** — ama bedelini
etiketle: **A** bugün yazılabilir · **B** kütüphane ister · **C** mümkün değil.

Özellikle şunları tasarla: **balonun açılışı ve kapanışı** · seçim sonrası
kartta kaydın belirişi · `Gelmedi` → `Ulaş` takası · `noshow`'un 30. dakikada
sıra değiştirmesi · `pending` randevunun onaylanması. Hepsi kart yüksekliği
**sabitken** olacak.

### 7.1 · Balonun hareketi — özellikle dikkat

Bir balonu ucuz gösteren şey ölçüsü değil, **nereden büyüdüğü**. Bunları
tanımla:

- **Büyüme noktası tetikleyicidir.** Balon kendi merkezinden değil, `Ulaş`
  düğmesinin bulunduğu köşeden büyür (`transformOrigin`; RN 0.81'de var).
  Merkezden büyüyen balon havada belirmiş gibi durur, düğmeden çıkmış gibi
  değil.
- **Kart kıpırdamaz.** Balon açılırken arkasındaki kart yerinden oynamaz,
  itilmez, sönmez. Perde (scrim) kullanacaksan yalnız `opacity`, ve kartı
  okunmaz hâle getirmeyecek kadar hafif — müdür balonu açtığında hâlâ kimin
  kartında olduğunu görüyor olmalı.
- **İki satır için kademeli giriş yok.** Stagger iki satırda gecikme gibi
  hissettirir; ikisi birlikte gelir.
- **Kapanış açılıştan hızlı.** Ailenin deyimi bu: `pressMotion` 90 ms giriş /
  120 ms çıkış, `cardSwap.press` 160 çıkış / 220 giriş. Balon da bu ailede
  durmalı — süreleri sen ver, ama bu ölçekte.
- **Seçim ile kartın kaydı arasında bağ.** `Ara`ya basıldığında balon kapanıyor
  ve kartta `Arandı · 2 dk` beliriyor. Bu iki hareket **birbirini takip eder,
  çakışmaz**: seçilen satırın kaybolmasıyla kaydın belirmesi tek bir hareket
  gibi okunmalı.
- **Dokunsal geri bildirim** kurulu ve ailede kullanılıyor: balonu açmak
  `selection`, bir seçeneği seçmek `medium`. Başka bir şey ekleme.
- **`reduceMotion` açıkken** balon anında belirir ve anında kapanır — ölçek
  yok, süre yok. **Kapanma yolu ve dokunsal geri bildirim aynen kalır.**

Balon dışına dokunma, geri hareketi (Android) ve ekran kenarına yakınken
konumlanma da hareketin parçası; üçünü de yaz.

---

## 8 · Cevaplamanı istediğim sorular

1. Balonun **anatomisi**: genişlik, satır yüksekliği, ok ucu, ekran kenarına
   yakınken ne oluyor, dışarı dokununca nasıl kapanıyor?
2. Balon tetikleyicisinin kelimesi **`Ulaş`** doğru mu — daha iyisi var mı?
3. `noshow`'da birincil **`Geç geldi` → `Yaz`** dönüşümü doğru mu?
4. Derin bağlantıdan dönüşte kart **ne diyor**, kayıt satırı **kaçıncı
   dakikada bayatlıyor**?
5. İptal kartında **rapor satırı** nerede duruyor, bekleyen yoksa ne oluyor?
6. Süre aşımı **eylem mi, bilgi mi, hiç mi**?

## 9 · Çıktı

Beş kart (A–E) + **balon bileşeni**, **koyu ve açık temada**, mevcut ölçülerle
ve her ölçü yazılı. Eylem **sonrası** hâlleri de çiz. Her karar için **bir
cümlelik gerekçe**. Her eylemin hangi araca dayandığını yaz — **sahte eylem
istemiyorum.**
