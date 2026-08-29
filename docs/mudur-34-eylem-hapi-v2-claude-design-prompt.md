# Müdür 34 · Eylem hapı v2 — ağırlık, hareket, simge

Mevcut dosya: `Luera Mobil - Mudur 33 Eylem Hapi.html`
**Sıfırdan çizme — bu hapı geliştir.** Kartlar, eylemler ve yerleşim doğru;
değişecek olan hapın kendi **varlığı**: durduğu hâl, açılışı, basılı tutması,
seçim anı.

**Effort: High.**

---

## 0 · Uygulandı ve ölçüldü — bunlar KORUNACAK

Müdür 33 kodda çalışıyor. Aşağıdakiler doğrulandı, hiçbirine dokunma:

| | Durum |
|---|---|
| Ok ucu tetikleyiciye değiyor | boşluk **0**, yatay sapma **0,06 pt** |
| Okun yeri | sabit değil — `tetikleyici / 2 − 7`'den türüyor |
| Göz | **60 × 56**, dokunma hedefi 44'ün üstünde |
| Hap | 4 göz **240**, 3 göz **180**, 2 göz **120** |
| Kart | 118 · 96 · 94 — kayıt satırı gelince bile oynamıyor |
| Yön | varsayılan yukarı, yer yoksa aşağı, açılışta bir kez seçilir |
| Köşe | ilk ve son göz kendi kırpıyor; hapa `overflow` YOK (ok ucu kırpılır) |

**Eylemler ve sırası da sabit:** `Ara` · `WhatsApp'tan yaz` · `Gelmedi` ·
`Personele bilgi ver`. Göz sayısı veriden geliyor (numara yoksa iki kanal
çizilmiyor), 2 ve 3 gözlü hâller de var.

---

## 1 · Sorun: hapın ağırlığı yok

Bugünkü hâl: krem bir kutu, içinde dört gri kontur simge, aralarında ince
çizgiler. Basınca göz turuncuyla doluyor, 500 ms sonra iş oluyor.

Eksik olan şey **varlık**. Bu alet müdürün en pahalı anında açılıyor — müşteri
gecikti, on dakika sonra kaybedilecek. Açıldığında "bir şey oldu" demeli.
Bugün "bir kutu belirdi" diyor.

Üç yerde eksik:

- **Dururken** — dört eşit gri simge. Hiçbiri kendini tanıtmıyor, hiçbiri
  ötekinden ayrılmıyor, hepsi aynı ağırlıkta.
- **Açılırken** — hap tek parça olarak beliriyor. İçindekiler hazır geliyor,
  kurulmuyor.
- **Basarken** — dolgu yükseliyor, o kadar. Parmağın altındaki şey büyümüyor,
  öne çıkmıyor, canlı hissettirmiyor.

---

## 2 · Araştırma — bu iş kimde çözülmüş

Bu bileşenin dünyadaki en iyi örneği **mesajlaşma uygulamalarının tepki
şeridi** (Messenger, Instagram, iMessage). Neden orası: aynı problem —
basılı tutunca açılan, yatay, simge tabanlı, tek elle kullanılan bir seçim
aleti. Orada çözülmüş dört şey — üçünü alıyoruz:

1. **Kademeli giriş.** Öğeler aynı anda değil, birbiri ardına ~30-40 ms arayla
   geliyor. Kutu belirmiyor, alet **kuruluyor**. Ağırlık hissinin yarısı bu.
2. **Aşım (overshoot).** Her öğe 0 → 1,08 → 1,00 ölçekleniyor. Yaylı bitiş
   "premium hareket" denen şeyin fiziksel karşılığı; doğrusal bitiş ucuz durur.
3. **Parmak takibi.** Parmak kaldırılmadan şeridin üstünde geziyor ve
   **altındaki öğe büyüyüp yükseliyor**, komşuları hafifçe küçülüyor. Alet
   parmağa cevap veriyor.
4. ~~Tek jest — basıp aç, kaydır, bırak.~~ **REDDEDİLDİ, tekrar önerme.**
   Jest bugünkü hâlinde kalıyor: `Yönet`e bas, kaldır, göze bas, tut. Sebep
   risk: kaydırarak seçme kas hafızası kuruyor ama erişilebilirlik yolunu ve
   iki jestin bir arada yaşamasını da beraberinde getiriyor. Bu tur **hareketi**
   zenginleştiriyor, **jesti** değil.

**Bizim için kazanç 1, 2 ve 3.** Üçü de bu projede yazılabilir — yaylı hareket
`Animated.spring` ile zaten kullanılıyor (`VisitSheets`), kademe
`Animated.stagger` ile geliyor. Yeni bağımlılık gerekmiyor: **A sınıfı.**

---

## 3 · Tasarlanacaklar

### 3.1 · Dururken — turuncu halka

Her simge **turuncu bir halka** içinde duracak.

**Halka İNCE olacak, dolu değil — karar verildi.** Turuncu bu üründe *zaman ve
eylem* rengi; dört gözü birden turuncuya boyamak, hangisinin acil olduğunu
söyleyen rengi anlamsızlaştırır ve kartın "tek dolu turuncu" kuralını çökertir.
İnce halka bir **çerçeve**, dolu turuncu bir **eylem** — fark korunacak.
Personel şeridindeki halkalarla aynı dili konuşması da ayrı bir kazanç.

Geri kalanını sen çöz:
- Halkanın kalınlığı, çapı, simgeyle arasındaki nefes.
- Halka **her zaman** mı duruyor, yoksa yalnız parmak değince mi koyulaşıyor?
- Halkalar arasındaki ayraç çizgisi kalıyor mu, yoksa halkalar zaten ayırıyor mu?
- 60 pt'lik göz halkayı taşıyor mu, yoksa göz büyümeli mi? (Hapın toplam
  genişliği büyüyebilir; **kartın yüksekliği büyüyemez.**)

### 3.2 · Simgeler — en zor kısım

Dört simge, dört farklı zorlukta:

| Eylem | Bugün | Sorun |
|---|---|---|
| `Ara` | telefon ahizesi | tanıdık, sorun yok |
| `WhatsApp'tan yaz` | konuşma balonu | jenerik — "mesaj" diyor, "WhatsApp" demiyor |
| `Gelmedi` | kişi + çarpı | anlaşılır ama sert |
| `Personele bilgi ver` | çan | **zayıf** — çan "bildirim" der, "personele" demez |

Çan özellikle zayıf: müdürün kafasındaki şey "Selin'e haber ver", çan ise
"bir bildirim". Personeli anlatan bir simge (kişi + konuşma? önlük? makas?)
daha doğru olabilir — ama sektör bağımsız kalmalı, bu uygulama kuaförden
diş kliniğine kadar yedi sektörde çalışıyor.

**Dört simge tek elden, tek kalınlıkta, tek dilde çizilecek.** Bugün karışık
kaynaklardan toplanmış gibi duruyor.

### 3.3 · Açılış — alet kurulur, kutu belirmez

- Hap tetikleyicinin kenarından büyüyor (`transformOrigin` = okun olduğu nokta,
  bu **korunacak**).
- Gözler **kademeli** giriyor: her biri ~30–40 ms arayla, `scale` + `opacity`.
- **Aşım var**: 0,86 → 1,04 → 1,00 gibi. Süreleri ve eğriyi sen ver.
- Kart kıpırdamaz, perde yalnız `opacity`.

Kademe **hangi yönde**? Tetikleyiciden uzağa mı (sağdan sola), yoksa soldan
sağa mı? Ok tetikleyicinin üstünde, yani hareket ondan doğmalı — cevabını yaz.

### 3.4 · Basılı tutma — jest aynı, hareket zengin

**Jest DEĞİŞMİYOR:** `Yönet`e bas → kaldır → hap açılır → göze bas → 500 ms tut
→ olur. Kaydırarak seçme değerlendirildi ve **elendi** (§2, madde 4).

Değişecek olan, o 500 milisaniyenin **ne hissettirdiği**. Bugün yalnız bir dolgu
yükseliyor; parmağın altındaki şey hiç cevap vermiyor.

Tasarlanacaklar:

- **Basılan göz cevap versin.** Parmak değdiği an göz büyüyor mu, öne mi
  çıkıyor, halkası mı kalınlaşıyor? (`scale` yasal; halka kalınlığı
  animasyonlanamaz — iki halka çapraz sönebilir.)
- **Komşular çekilsin.** Bugün yalnız soluyorlar (%32). Hafifçe küçülmeleri
  odağı toplar ve aleti canlandırır.
- **Dolgunun kendisi.** Bugün alttan yükselen düz bir turuncu. Halkanın
  içinden merkezden büyüyen bir disk mi daha iyi? İkisini de düşün — halka
  artık orada ve dolgu onunla ilişki kurmalı.
- **Kelime bloğu** nasıl geliyor: kayarak mı, ölçeklenerek mi, ne kadar sürede?
- **500 ms'nin kendisi kısa.** Bütün bu hareketler o pencereye sığmalı; hiçbiri
  gecikmeli başlayamaz, yoksa parmak kalktığında daha yeni başlamış olur.

### 3.5 · Seçim anı — ödül

Bugün: onay işareti, 220 ms bekleme, kapanış. Yeterince güçlü değil.

Seçilen göz bırakıldığında ne oluyor? Halka doluyor mu, göz öne fırlıyor mu,
hap ondan başlayarak mı kapanıyor? **Bu anın tasarımını istiyorum** — 830 ms'lik
bütün etkileşimin karşılığı burada ödeniyor.

---

## 4 · Değişmeyecek kısıtlar

- **Hareket sözleşmesi:** yalnız `opacity`, `translateX/Y`, `scale`, hepsi
  native sürücüde. **Yükseklik, genişlik, renk, yarıçap, gölge
  animasyonlanamaz.** Renk değişimi = üst üste iki katmanın çapraz sönmesi.
- `LayoutAnimation` yasak. **`reanimated` ve `gesture-handler` kurulu değil ve
  kurulmayacak** — RN'in kendi `Animated`'i, `Animated.spring`, `Animated.stagger`
  ve `PanResponder` var, üçü de bu projede kullanılıyor.
- **Dokunma hedefi 44 pt'nin altına inmez.** Hedef kitle 40–55 yaş, ayakta, tek
  elle.
- **Kartın yüksekliği değişmez** (118 · 96 · 94). Hap büyüyebilir, kart büyüyemez.
- **`reduceMotion` açıkken hareket durur, bilgi durmaz.** Kademe ve aşım düşer;
  ama **dolgu düşmez** — müdüre daha ne kadar tutması gerektiğini söyleyen tek
  şey o. Bugün kademeli ilerliyor (altı basamak).
- **Ölü kontrol yok:** numara yoksa iki kanal çizilmez; 2 ve 3 gözlü hâller de
  tasarlanacak.
- Sonrasında bu hap **iki kartta** kullanılıyor (geciken randevu, gelmedi) ve
  muhtemelen üçüncüde (dünden kalan adisyon) — **tek bir parça** olarak çiz.

---

## 5 · Cevaplamanı istediğim sorular

1. Halka **her zaman mı** duruyor, yoksa yalnız parmak değince mi koyulaşıyor?
2. Dört simge — özellikle **"personele bilgi ver"** — nasıl çizilecek, ve
   sektör bağımsız kalıyor mu?
3. Basılan göz nasıl **cevap veriyor**, komşular ne yapıyor?
4. Kademeli giriş **hangi yönde** akıyor ve neden?
5. Dolgu halkayla nasıl ilişki kuruyor — alttan mı yükseliyor, merkezden mi?
6. Seçim anının ödülü ne?
7. Bütün bunlar **500 ms'ye sığıyor mu**? Sığmıyorsa ne kesilir?

## 6 · Çıktı

Eylem hapı v2 — **koyu ve açık temada**, her ölçü ve süre yazılı:

- Dururken (4 · 3 · 2 gözlü)
- Açılış kademeleri (en az üç kare: %0, %50, %100)
- Parmak bir gözün üstündeyken (büyüyen göz + küçülen komşular + kelime)
- Dolgunun ortası ve sonu
- Seçim anı ve kapanış
- `reduceMotion` hâli
- Dört simgenin tek tek çizimi, ızgarasıyla

Her karar için **bir cümlelik gerekçe**. Sözleşme dışına çıkan hareket
önerirsen bedelini etiketle: **A** bugün yazılabilir · **B** kütüphane ister ·
**C** mümkün değil.

---

## Ekler (kullanıcı Claude Design'a verecek)

1. `docs/design-reference/Luera Mobil - Mudur 33 Eylem Hapi.html` — geliştirilecek dosya
2. Cihazdan alınmış üç ekran görüntüsü (hap kapalı · hap açık · yakın plan)
3. `docs/design-reference/Luera Mobil - Mudur Modu.html` — ailenin dili

---
