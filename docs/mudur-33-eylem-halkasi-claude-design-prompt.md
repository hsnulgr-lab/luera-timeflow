# Müdür 33 · Eylem hapı + `Yaz`ın sunucuya bağlanması — Claude Design promptu

Mevcut dosya: `Luera Mobil - Mudur 32 Eylem Ailesi v2.html`
**Sıfırdan çizme — bu dosyayı geliştir.**

Bu belge Müdür 32 düzeltme turunun **§4'ünü (balon satırları) ve §5'ini
(`Yaz`ın kanalı) birlikte** değiştiriyor. İkisi de aynı bileşene dokunuyor;
ayrı turlarda yapılırsa ikincisi birincinin işini bozar.

**Ekler:** güncel `v2.html` · referans görsel (ilham, birebir kopyalanmayacak)

**Effort: High.**

---

## 0 · Ölçülüp doğrulanan hâl — bunlar KORUNACAK

Son turun çıktısını ölçtüm; beş maddenin beşi de düzelmiş. Bunlara dokunma:

| | Ölçüm |
|---|---|
| Ok ucu ↔ tetikleyicinin kenarı | **0** — 15 balonun hepsinde |
| Ok merkezi ↔ tetikleyici merkezi | **0,14 pt** |
| Kahraman rakamın y'si | **29** — 37 karenin hepsinde, kayıt satırı gelse de gitse de |
| Sağ sütundaki iki hap | eşit genişlik, sol kenarlar çakışık |
| `.pnl` | `overflow:hidden` · çizgi yarıçapsız, köşeden taşmıyor |
| Kart yükseklikleri | 118 · 96 · 94 — sapma yok |

Çapa hesabı (`tetikleyici ÷ 2 − 7`), yön kuralı (varsayılan yukarı, yer yoksa
aşağı, yön açılışta bir kez seçilir) ve kenar sınırı da **aynen kalıyor.**

---

## 1 · Balon bir menü değil, bir EYLEM HALKASI olacak

Bugün balon iki metin satırı taşıyor. **İşlevi az ve kaba duruyor.**

Yeni hâl: **tek bir hap içinde, ince ayraçlarla bölünmüş dört göz.** Her gözde
tek bir simge — kelime yok.

```
        ┌───────┬───────┬───────┬───────┐
        │   ☎   │   ✉   │   👤✕  │   🔔  │
        └───────┴───────┴──▽────┴───────┘
                      ( tetikleyici ˄ )
```

**Neden dört ayrı yuvarlak değil:** dört ayrı halka **dört ayrı nesne** olarak
okunur ve dağınık durur. Ayraçlarla bölünmüş tek hap **tek bir alet** olarak
okunur — parmağın altında bir şey var hissi verir. Premium algısı buradan
geliyor.

**Sakin hâlde turuncu YOK.** Simgeler sade mürekkep. Turuncu bu üründe *eylem
ve zaman* rengidir; dört göz birden turuncu olsaydı hangisinin acil olduğunu
söyleyen renk anlamını kaybederdi. **Turuncu yalnız basılı tutarken girer**
(aşağıda).

Ekteki referans görselin **mantığı doğru** — ama aynısını istemiyorum, daha
iyisini bekliyorum. Oradan alınacaklar: tek hap, ayraçlar, sade simgeler,
tetikleyicideki yön oku (balon yukarıdayken `˄`, aşağıdayken `˅`).

Dört eylem:

| Simge | Eylem | Ne yapar |
|---|---|---|
| telefon | **Ara** | Telefon uygulamasını açar |
| konuşma balonu | **WhatsApp'tan yaz** | Salonun numarasından mesaj gönderir (§3) |
| kişi-çarpı | **Gelmedi** | Randevuyu düşürür — geri alınabilir |
| çan | **Personele bilgi ver** | Personele "müşterin gecikti" der (§4) |

Bu dört simge referanstan geliyor ve **iyi seçilmişler** — kişi-çarpı ve çan,
iki soyut eylemi anlaşılır kılıyor. Daha iyisini bulursan değiştir, ama
gerekçelendir.

**Dokunma hedefi 44 pt'nin altına inmeyecek** — göz genişliği bunu belirler.
Hapın toplam ölçüsünü sen ver.

### Basılı tutma — 3 saniye

Dört düğme de **3 saniye basılı tutunca** çalışır. Tek dokunuş hiçbir şey
yapmaz.

**Dolan geri bildirim, sözleşmeye uygun olacak.** Dolan bir yay/çizgi
animasyonu bu üründe **yasak** (yalnız `opacity`, `translateX/Y`, `scale`
animasyonlanır; `reanimated` ve `gesture-handler` kurulu değil).

Mekanizma şu olacak: **gözün kendisi turuncuyla dolar.** Göz kırpılmış bir
kutudur; içinde turuncu bir katman `scale` ile 0'dan 1'e büyür. Yalnız `scale`
+ `opacity`, native sürücüde, 3 saniye. Simge dolgu üstünden geçtikçe **kreme
döner** (üst üste iki simge, çapraz sönme — renk animasyonu değil). Parmak
kalkarsa dolgu hızla geri çekilir (giriş 3000 ms, geri dönüş ~200 ms).

Bu, dolan bir halkadan hem daha net okunur hem de tek hap düzenine daha uygun:
dolan göz, aletin hangi bölmesinin çalıştığını doğrudan gösterir.

Yay çizme, konik gradyan kullanma, `stroke-dashoffset` önerme — hiçbiri bu
projede yazılamaz.

### Simge yalnız kalmayacak: basarken kelime belirsin

Yalnız simge iki şeyi birden gizliyor: düğmenin **ne yaptığını** ve **basılı
tutmak gerektiğini**. Estetiği bozmadan çözülür:

- Sakin hâlde: yalnız simgeler.
- **Parmak değdiği anda** hapın altında kelime belirir — "Ara",
  "WhatsApp'tan yaz", "Gelmedi", "Personele bilgi ver". Disk dolarken orada
  durur.
- Bu satır için balon **büyüyebilir**; bu bir kart değil, yüzen bir katman.

Kelimenin nerede durduğunu, balonun bu yüzden ne kadar büyüdüğünü ve boş hâlde
o yerin ayrılıp ayrılmadığını sen çöz.

### Tetikleyicinin adı değişecek

`Ulaş` artık yetmiyor: içinde "Gelmedi" ve "Personele bilgi ver" varken
tetikleyici "ulaş" diyemez. Yeni bir kelime öner — ya da tetikleyicinin kendisi
kelimesiz bir düğmeye dönsün. Kararı gerekçesiyle ver.

**Not:** `Gelmedi` karttan çıkıp balona girdiği için, sağ sütunun ikinci
yuvasında artık **yalnız tetikleyici** var. Kart hâlâ 118 pt mi? Ölç ve yaz.

### Kaç göz çizilecek — ölü kontrol yok

Göz sayısı **veriden** gelir, sabit değil:

- Numara yoksa → `Ara` ve `WhatsApp` **hiç çizilmez**.
- Salonun WhatsApp'ı bağlı değilse → §3'e bak.
- Müşteri mesaj istemiyorsa (opt-out) → `WhatsApp` çizilmez.

**2, 3 ve 4 gözlü hâlleri de çiz.** Hap daralıyor mu, gözler mi genişliyor? Ok
ucu hangi göze bakıyor?

---

## 2 · Dört eylem dört ayrı cinsten — bunu gizleme

| Eylem | Uygulamadan çıkar mı | Sonucu bilinir mi | Geri alınır mı |
|---|---|---|---|
| Ara | **Evet** — telefon açılır | Hayır | — |
| WhatsApp | Hayır | **Evet** (sunucu döner) | Hayır (5 sn pencere) |
| Gelmedi | Hayır | Evet | **Evet** (Geri al) |
| Personele bilgi ver | Hayır | Bugün hayır (§4) | Hayır |

Dördü aynı görünüp farklı davranırsa müdür yanılır. Ayrımı simgede mi,
basıldıktan sonraki kelimede mi, kartın kaydında mı yapacağını sen seç — ama
**yap**.

---

## 3 · `Yaz` artık otomasyon — müdür yazmıyor

Mesaj **salonun numarasından**, sunucudaki tek gönderim kapısından, **hazır
metinle** gidiyor. Müdür hiçbir şey yazmıyor, uygulamadan çıkmıyor.

**Bunun sonucu: kart artık "gönderildi" DİYEBİLİR.** Önceki brief'te "uygulama
dışarı çıkıyor, teslimatı göremeyiz" yazıyordu — o gerekçe düştü. Sunucu gerçek
sonuç döndürüyor.

Sunucunun **gerçekten** döndürdüğü sonuçlar (uydurma değil, `sendWA`'nın
tanımlı çıktıları):

| Sonuç | Ne demek | Müdür ne yapabilir |
|---|---|---|
| `ok` | Gitti | — |
| `not_connected` | Salonun WhatsApp'ı bağlı değil | Ayarlar → WhatsApp |
| `opt_out` | Müşteri mesaj istemiyor | Hiçbir şey — `Ara` kalır |
| `invalid_phone` | Numara yazılabilir değil | Müşteri kartından düzeltir |
| `failed` / kuyruk | Bağlantı sorunlu, kuyruğa alındı | Bekler |

Kota bu eylem için **işlemiyor** (müdürün elle tetiklediği mesajlar kota dışı),
o hâli çizme.

Cevapla:

- **WhatsApp bağlı değilken göz çiziliyor mu?** "Ölü kontrol yok" kuralı
  silmeyi söyler; ama gidilecek gerçek bir yer var (Ayarlar → WhatsApp) ve
  müdürün **sebebi bilmesi** gerekiyor. Silmek mi, kalıp açıklamak mı?
- **Başarısız gönderim kartta nasıl görünüyor?** Damga "gönderildi" diyemez.
  Ne der, tekrar denenebilir mi?
- **5 saniyelik geri alma penceresi** `Yaz` için de geçerli olacak — D·3'te
  ("mesaj 5 sn sonra gidecek") zaten çizdiğin kalıp. 3 saniye basılı tutma
  **artı** 5 saniye geri alma birlikte fazla mı? Karar senin, gerekçesiyle.

Metin **şablondur**: kısa, tek cümle, salon adı ve saat. Metni de öner.

---

## 4 · "Personele bilgi ver" — uydurma değil, ama yarım

Bu eylem üründe **zaten var**: `arrived` kartında "Personele söyle" olarak.
Ama bugün **yalnız yerel** — bir damga bırakıyor, sunucuya gitmiyor. Push
kanalı (`send-push`, `push_subscriptions`) mevcut ama bu eyleme bağlı değil.

Geciken kartta anlamı farklı: `arrived`'da "müşterin içeride, bekliyor";
burada **"müşterin gecikti, boştasın"**. Personelin bunu bilmesi işine yarar —
o aralıkta başka iş alabilir.

**Kart teslimat iddia etmeyecek.** "Personele iletildi" yazamaz; en fazla
müdürün ne yaptığını söyler ("Personele söylendi · 2 dk"), ve bu damga
**bayatlar** — tazeliğini yitirince düşer.

---

## 5 · Hareket — bu turun ikinci ağırlık merkezi

Hareket bu ürünün zayıf tarafı ve burada güçlenmesini istiyorum. Sözleşme dar
ama içi geniş: yalnız `opacity`, `translateX/Y`, `scale`, hepsi native
sürücüde. **Yükseklik, genişlik, renk, yarıçap, gölge animasyonlanamaz.**
Renk değişimi = üst üste iki katmanın çapraz sönmesi. `LayoutAnimation` yasak.
`reanimated` ve `gesture-handler` **kurulu değil ve kurulmayacak** — RN'in
kendi `Animated`'i ve `PanResponder` var.

Ailenin bugünkü ölçeği referans: basış 90 ms giriş / 120 ms çıkış · kart takası
160 çıkış / 220 giriş / 60 gecikme. Süreleri sen ver, bu ölçekte kal.

Şu yedi anı tek tek tasarla:

**1 · Açılış.** Hap tetikleyicinin köşesinden büyür — `transformOrigin` ok
ucunun olduğu nokta. Merkezinden büyüyen bir hap havada belirmiş gibi durur,
düğmeden çıkmış gibi değil. Kart **kıpırdamaz**, itilmez. Perde varsa yalnız
`opacity` ve müdür hâlâ kimin kartında olduğunu görecek kadar hafif.

**2 · Parmak indi.** Anında iki şey: gözün altında **kelime belirir** ve
**dolgu başlar**. Gecikme yok — bu bir geri bildirim, animasyon değil.
Dokunsal: `selection`. Diğer üç göz sönüyor mu? (`opacity`, yasal — odağı
toplar ama kararı sen ver.)

**3 · Dolarken.** Gözün içindeki turuncu katman 3000 ms'de `scale` 0 → 1.
Doğrusal mı, hafif hızlanan mı? Simge dolgu üstünden geçtikçe kreme döner —
**iki simge üst üste, çapraz sönme**, renk animasyonu değil.

**4 · Parmak erken kalktı.** Dolgu geri çekilir, ~200 ms. Girişten çok daha
hızlı: geri alma cezalandırılmaz. Kelime de söner.

**5 · Üç saniye doldu.** **Bir "oldu" anı olmalı.** Dolgu tamamlanır tamamlanmaz
hap kaybolursa müdür bastığının işe yarayıp yaramadığını göremez. Kısa bir beat
(tahsilat kartındaki 1,6 saniyelik onay anının küçük kardeşi), sonra hap
kapanır. Dokunsal: `medium`. Bu beat'i sen tasarla — ne kadar, ne gösteriyor?

**6 · Kapanış.** Açılıştan hızlı. Hap tetikleyiciye geri emilir mi, yerinde mi
söner? Ok ucu ne yapıyor? Tetikleyicideki yön oku `˄` → `˅` dönüyor mu, dönüyorsa
nasıl (döndürme `transform` ile yasal).

**7 · Kartta kaydın belirişi.** Hap kapanırken kartta "Arandı · 2 dk" satırı
belirir. **İkisi birbirini takip eder, çakışmaz** — tek bir hareket gibi
okunmalı: hapın kapanışı kaydın doğuşuna bağlanır. Kart yüksekliği bu sırada
**değişmez** (sol sütunda yer zaten ayrılmış).

`Gelmedi` seçilirse kart `noshow`'a dönüşür — bu ailenin mevcut kart takası,
yeni bir hareket icat etme.

### `reduceMotion` — dikkat, burada ince bir ayrım var

Kural: hareket durur, **bilgi durmaz**. Ve **dolgu bir bilgidir** — müdüre ne
kadar tutması gerektiğini söyleyen tek şey o. Yani:

- Hapın açılış/kapanış ölçeklenmesi **düşer** (anında belirir, anında kapanır).
- **Dolgu düşmez** — süslemek için değil, süreyi ölçmek için orada. Ölçekli
  büyümesi sorun olursa kademeli bir gösterim öner, ama **müdür ne kadar
  kaldığını görmeye devam etmeli.**
- Dokunsal geri bildirim aynen kalır.

Sözleşmenin dışına çıkan bir hareket öneriyorsan **çık** — ama bedelini
etiketle: **A** bugün yazılabilir · **B** kütüphane ister · **C** mümkün değil.
B ve C'leri görmek istiyorum; kurup kurmayacağıma ben karar veririm.

---

## 6 · Değiştirilmeyecekler

- §0'daki bütün ölçümler ve kurallar.
- Kart yükseklikleri, renk envanteri, kahraman rakam solda / eylem sağda.
- Turuncu `#FF5A1F` yalnız **ZAMAN ve EYLEM** — asla durum. Bu yüzden sakin
  hâlde göz turuncu değil; turuncu ancak eylem BAŞLAYINCA girer.
- Kartta **en fazla bir dolu turuncu hap** (`Geldi`). Balondaki gözler kartın
  içinde değil, yüzen katmanda — bu kuralı bozmuyorlar.
- Ölü kontrol yok · sahte onay yok · dokunma hedefi 44 pt.
- Hareket: yalnız `opacity`, `translateX/Y`, `scale`, native sürücüde.
  `reduceMotion` açıkken hareket durur, **bilgi durmaz** — basılı tutma o zaman
  ne oluyor, bunu da çöz.

---

## 7 · Cevaplamanı istediğim sorular

1. Hapın **anatomisi**: yükseklik, yarıçap, göz genişliği, ayraç kalınlığı,
   simge boyu, dolgunun son hâli.
2. **Gelmedi** ve **Personele bilgi ver** simgeyle nasıl anlatılıyor? İkisi de
   soyut — en zor kısım bu.
3. Basarken beliren kelime **nerede** duruyor, balon ne kadar büyüyor?
4. Tetikleyicinin **yeni adı** ne?
5. `Gelmedi` karttan çıkınca sağ sütun ve kart yüksekliği ne oluyor?
6. 2 ve 3 gözlü hâller neye benziyor?
7. 3 sn basılı tutma **artı** 5 sn geri alma fazla mı?
8. "Oldu" anı ne kadar sürüyor ve **ne gösteriyor**?
9. `reduceMotion` açıkken dolgu nasıl görünüyor?

## 8 · Çıktı

Eylem hapı bileşeni (sakin · basılı · dolarken · erken bırakılmış · tamamlanmış
· 2/3/4 göz), **yedi hareket anının her biri için ölçü ve süre**,
`Yaz`ın beş sonucu, güncellenmiş A ve B kartları — **koyu ve açık temada**,
her ölçü yazılı, her karar için bir cümlelik gerekçe.
